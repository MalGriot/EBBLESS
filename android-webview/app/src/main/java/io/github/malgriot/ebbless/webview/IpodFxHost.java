package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import java.util.Random;

/**
 * The iPod's celebration engine: a haptic pattern, a short synthesized chime and an on-screen burst (pop-in banner plus particles) per
 * tier. Particles live in preallocated parallel arrays (a fixed pool); update() and draw() allocate nothing and the host only ticks
 * while alive() is true. Sounds are synthesized once per tier into a small static AudioTrack and replayed.
 */
final class IpodFxHost {
    private static final int CAP = 48;
    private static final int RATE = 22050;
    private static final long POP_MS = 150, SETTLE_MS = 110, HOLD_MS = 900, FADE_MS = 300, RING_MS = 600;
    private static final int[] PALETTE = {0xFFFFD54A, 0xFFFF7A59, 0xFF4FC3F7, 0xFF81C784, 0xFFF06292, 0xFFFFFFFF};

    private final Context ctx;
    private final float dp;
    private final Random rnd = new Random();
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF pill = new RectF();
    private final float[] px = new float[CAP], py = new float[CAP], vx = new float[CAP], vy = new float[CAP];
    private final float[] rot = new float[CAP], vrot = new float[CAP], size = new float[CAP], life = new float[CAP], maxLife = new float[CAP];
    private final int[] col = new int[CAP];
    private final boolean[] star = new boolean[CAP];
    private final AudioTrack[] tracks = new AudioTrack[4];
    private Vibrator vib;
    private String text = "";
    private int bannerColor;
    private long bannerT0 = -1, ringT0 = -1;

    IpodFxHost(Context c, float density) {
        ctx = c;
        dp = density;
        p.setTextAlign(Paint.Align.CENTER);
        p.setFakeBoldText(true);
    }

    /** soft = the "soft sounds and vibration" setting, audible = the media volume is above zero. */
    void trigger(int tier, String t, int hi, boolean soft, boolean audible, long now) {
        tier = Math.max(1, Math.min(3, tier));
        text = t == null ? "" : t;
        bannerColor = hi;
        bannerT0 = now;
        ringT0 = tier == 3 ? now : -1;
        int count = tier == 1 ? 8 : tier == 2 ? 18 : 36;
        for (int k = 0; k < count; k++) {
            int i = free();
            if (i < 0) break;
            boolean sp = tier == 1;
            float ang = rnd.nextFloat() * 6.2831853f;
            float spd = dp * (sp ? 90 + rnd.nextFloat() * 130 : 140 + rnd.nextFloat() * (tier == 3 ? 340 : 240));
            px[i] = 0; py[i] = 0;
            vx[i] = (float) Math.cos(ang) * spd;
            vy[i] = (float) Math.sin(ang) * spd - (sp ? 0 : dp * 120);
            rot[i] = rnd.nextFloat() * 360f;
            vrot[i] = (rnd.nextFloat() - 0.5f) * 720f;
            size[i] = dp * (sp ? 5 + rnd.nextFloat() * 4 : 3.5f + rnd.nextFloat() * 4);
            maxLife[i] = life[i] = sp ? 550 + rnd.nextFloat() * 300 : 900 + rnd.nextFloat() * 700;
            col[i] = sp ? (rnd.nextBoolean() ? hi : 0xFFFFFFFF) : (rnd.nextInt(7) == 0 ? hi : PALETTE[rnd.nextInt(PALETTE.length)]);
            star[i] = sp;
        }
        if (soft) { haptic(tier); if (audible) chime(tier); }
    }

    private int free() {
        for (int i = 0; i < CAP; i++) if (life[i] <= 0) return i;
        return -1;
    }

    boolean alive(long now) {
        if (bannerT0 >= 0 && now - bannerT0 < POP_MS + SETTLE_MS + HOLD_MS + FADE_MS) return true;
        for (int i = 0; i < CAP; i++) if (life[i] > 0) return true;
        return false;
    }

    void clear() {
        for (int i = 0; i < CAP; i++) life[i] = 0;
        bannerT0 = -1; ringT0 = -1;
    }

    void update(long dtMs) {
        float dt = dtMs / 1000f;
        for (int i = 0; i < CAP; i++) {
            if (life[i] <= 0) continue;
            life[i] -= dtMs;
            px[i] += vx[i] * dt;
            py[i] += vy[i] * dt;
            if (!star[i]) vy[i] += dp * 520 * dt;   // confetti falls
            vx[i] *= 1f - 0.9f * dt;
            rot[i] += vrot[i] * dt;
        }
    }

    void draw(Canvas c, float w, float h, long now) {
        float ox = w / 2f, oy = h * 0.4f;
        if (ringT0 >= 0) {
            long t = now - ringT0;
            if (t < RING_MS) {
                float f = t / (float) RING_MS;
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp * 4 * (1f - f) + 1);
                p.setColor((bannerColor & 0xFFFFFF) | ((int) (200 * (1f - f)) << 24));
                c.drawCircle(ox, oy, dp * 24 + f * dp * 150, p);
            } else ringT0 = -1;
        }
        p.setStyle(Paint.Style.FILL);
        for (int i = 0; i < CAP; i++) {
            if (life[i] <= 0) continue;
            float f = life[i] / maxLife[i];
            int a = (int) (255 * Math.min(1f, f * 3f));
            p.setColor((col[i] & 0xFFFFFF) | (a << 24));
            c.save();
            c.translate(ox + px[i], oy + py[i]);
            c.rotate(rot[i]);
            float s = size[i];
            if (star[i]) {
                s *= 0.4f + 0.6f * (float) Math.sin(Math.min(1f, (1f - f) * 1.6f) * 3.1416f);   // twinkles in and out
                p.setStrokeWidth(Math.max(1f, dp * 1.8f));
                c.drawLine(-s, 0, s, 0, p);
                c.drawLine(0, -s, 0, s, p);
            } else {
                c.drawRect(-s, -s * 0.55f, s, s * 0.55f, p);
            }
            c.restore();
        }
        if (bannerT0 >= 0) {
            long t = now - bannerT0;
            long total = POP_MS + SETTLE_MS + HOLD_MS + FADE_MS;
            if (t >= total) { bannerT0 = -1; return; }
            float sc = 1f;
            int alpha = 255;
            if (t < POP_MS) { float u = t / (float) POP_MS; u = 1f - (1f - u) * (1f - u); sc = 0.6f + 0.48f * u; }
            else if (t < POP_MS + SETTLE_MS) sc = 1.08f - 0.08f * ((t - POP_MS) / (float) SETTLE_MS);
            else if (t >= total - FADE_MS) alpha = (int) (255 * (total - t) / (float) FADE_MS);
            p.setTextSize(dp * 17);
            p.setStyle(Paint.Style.FILL);
            float tw = Math.min(w - dp * 40, p.measureText(text));
            float bw = tw + dp * 36, bh = dp * 40;
            pill.set(-bw / 2, -bh / 2, bw / 2, bh / 2);
            c.save();
            c.translate(ox, h * 0.2f);
            c.scale(sc, sc);
            p.setColor((bannerColor & 0xFFFFFF) | (alpha << 24));
            c.drawRoundRect(pill, bh / 2, bh / 2, p);
            p.setColor((IpodColor.onColor(bannerColor) & 0xFFFFFF) | (alpha << 24));
            c.drawText(text, 0, dp * 6, p);
            c.restore();
        }
    }

    // ------------------------------------------------------------------ haptics

    private void haptic(int tier) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            if (vib == null) vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vib == null || !vib.hasVibrator()) return;
            long[] pat = tier == 1 ? new long[]{0, 18} : tier == 2 ? new long[]{0, 20, 50, 28} : new long[]{0, 24, 40, 24, 40, 70};
            vib.vibrate(VibrationEffect.createWaveform(pat, -1));
        } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------ chime

    private void chime(int tier) {
        try {
            AudioTrack tr = tracks[tier];
            if (tr == null) tr = tracks[tier] = build(tier);
            if (tr == null) return;
            tr.stop();
            tr.reloadStaticData();
            tr.play();
        } catch (Throwable ignored) { }
    }

    /** A few sine partials with a quick decay: one note for tier 1, two for tier 2, a rising four-note arpeggio for tier 3. Quiet and short. */
    private AudioTrack build(int tier) {
        float[] f = tier == 1 ? new float[]{1318.5f} : tier == 2 ? new float[]{1046.5f, 1568f} : new float[]{1046.5f, 1318.5f, 1568f, 2093f};
        int noteMs = tier == 1 ? 130 : 150, gapMs = tier == 1 ? 0 : tier == 2 ? 90 : 75;
        int totalMs = Math.min(400, (f.length - 1) * gapMs + noteMs + 100);
        int n = RATE * totalMs / 1000;
        short[] pcm = new short[n];
        for (int k = 0; k < f.length; k++) {
            int s0 = RATE * k * gapMs / 1000;
            int len = Math.min(n - s0, RATE * (noteMs + 100) / 1000);
            for (int i = 0; i < len; i++) {
                float t = i / (float) RATE;
                float env = (float) Math.exp(-t * 14f) * Math.min(1f, t / 0.004f);
                double ph = 6.2831853 * f[k] * t;
                float v = (float) (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph)) * env * 0.38f;
                int idx = s0 + i;
                pcm[idx] = (short) Math.max(-32000, Math.min(32000, pcm[idx] + (int) (v * 32767f)));
            }
        }
        AudioTrack tr = new AudioTrack(
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
                new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
                n * 2, AudioTrack.MODE_STATIC, AudioManager.AUDIO_SESSION_ID_GENERATE);
        tr.write(pcm, 0, n);
        tr.setVolume(0.35f);
        return tr;
    }

    void release() {
        for (int i = 0; i < tracks.length; i++) {
            if (tracks[i] != null) { try { tracks[i].release(); } catch (Throwable ignored) { } tracks[i] = null; }
        }
    }
}
