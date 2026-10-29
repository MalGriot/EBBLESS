package io.github.malgriot.ebbless.webview;

import android.graphics.Bitmap;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

/** Sprite helpers for the iPod games. Everything is rendered once, at a small fixed size. */
final class IpodGameArt {
    private IpodGameArt() {}

    /** Caches "prefix + value" so draw() never builds a new String while the value is unchanged. */
    static final class Label {
        private final String prefix;
        private int v = Integer.MIN_VALUE;
        private String s = "";
        Label(String prefix) { this.prefix = prefix; }
        String get(int value) {
            if (value != v) { v = value; s = prefix + value; }
            return s;
        }
    }

    /**
     * Floating "+N" score pops: a fixed set of slots, text kept in char buffers, so nothing is allocated while
     * playing. Position is in cell units of the board. Driven only by update(dtMs); drawn with canvas transforms.
     */
    static final class Pops {
        static final int MAX = 6;
        static final float DURATION_MS = 700f;
        private final float[] px = new float[MAX], py = new float[MAX], age = new float[MAX];
        private final int[] len = new int[MAX], color = new int[MAX];
        private final char[][] buf = new char[MAX][12];

        Pops() { clear(); }

        void clear() { for (int i = 0; i < MAX; i++) age[i] = -1f; }

        void add(float x, float y, int value, int col) {
            int slot = 0;
            float oldest = -2f;
            for (int i = 0; i < MAX; i++) {
                if (age[i] < 0f) { slot = i; break; }
                if (age[i] > oldest) { oldest = age[i]; slot = i; }
            }
            px[slot] = x; py[slot] = y; age[slot] = 0f; color[slot] = col;
            char[] b = buf[slot];
            int v = Math.max(0, value), n = 0;
            do { b[n++] = (char) ('0' + v % 10); v /= 10; } while (v > 0 && n < 10);
            b[n++] = '+';
            len[slot] = n;
            for (int i = 0, j = n - 1; i < j; i++, j--) { char t = b[i]; b[i] = b[j]; b[j] = t; }
        }

        void update(long dtMs) {
            for (int i = 0; i < MAX; i++) {
                if (age[i] < 0f) continue;
                age[i] += dtMs;
                if (age[i] >= DURATION_MS) age[i] = -1f;
            }
        }

        /** (ox, oy) is the board origin in canvas pixels, cell the cell size; pops rise by rise pixels. */
        void draw(Canvas c, Paint p, float textSize, float ox, float oy, float cell, float rise) {
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(textSize);
            for (int i = 0; i < MAX; i++) {
                if (age[i] < 0f) continue;
                float k = age[i] / DURATION_MS;
                float sc = k < 0.15f ? 0.6f + 0.6f * (k / 0.15f) : 1.2f - 0.2f * ((k - 0.15f) / 0.85f);
                int a = (int) (255 * (1f - k * k));
                p.setColor(color[i]);
                p.setAlpha(a);
                c.save();
                c.translate(ox + px[i] * cell, oy + py[i] * cell - rise * k);
                c.scale(sc, sc);
                c.drawText(buf[i], 0, len[i], 0f, 0f, p);
                c.restore();
            }
        }
    }

    private static Paint aa() {
        return new Paint(Paint.ANTI_ALIAS_FLAG);
    }

    /** Draws a bold E centred in the box, used wherever the real logo is missing. */
    static void drawGlyphE(Canvas c, float cx, float cy, float size, int color) {
        Paint p = aa();
        p.setColor(color);
        p.setTypeface(Typeface.DEFAULT_BOLD);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTextSize(size);
        c.drawText("E", cx, cy - (p.ascent() + p.descent()) / 2f, p);
    }

    static Bitmap lp(int s, int label) {
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = aa();
        float r = s / 2f;
        p.setColor(0xFF15151A);
        c.drawCircle(r, r, r - 0.5f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, s / 40f));
        p.setColor(0xFF30303A);
        for (float f = 0.45f; f < 0.95f; f += 0.1f) c.drawCircle(r, r, r * f, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(label);
        c.drawCircle(r, r, r * 0.30f, p);
        p.setColor(0xFF0A0A0A);
        c.drawCircle(r, r, r * 0.06f, p);
        return b;
    }

    static Bitmap cassette(int s, int color) {
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = aa();
        RectF body = new RectF(s * 0.04f, s * 0.20f, s * 0.96f, s * 0.80f);
        float rr = s * 0.08f;
        p.setColor(color);
        c.drawRoundRect(body, rr, rr, p);
        p.setColor(0xFFE9E4D4);
        c.drawRoundRect(new RectF(s * 0.12f, s * 0.26f, s * 0.88f, s * 0.54f), rr * 0.6f, rr * 0.6f, p);
        p.setColor(0xFF1A1A1F);
        c.drawRoundRect(new RectF(s * 0.26f, s * 0.31f, s * 0.74f, s * 0.49f), s * 0.09f, s * 0.09f, p);
        p.setColor(0xFFF2F2F2);
        c.drawCircle(s * 0.36f, s * 0.40f, s * 0.055f, p);
        c.drawCircle(s * 0.64f, s * 0.40f, s * 0.055f, p);
        p.setColor(0x66000000);
        c.drawRoundRect(new RectF(s * 0.28f, s * 0.62f, s * 0.72f, s * 0.80f), rr * 0.5f, rr * 0.5f, p);
        return b;
    }

    /** Rounded tile in a solid colour with the logo (or a glyph E) stamped in a darker tint. */
    static Bitmap logoTile(int s, Bitmap logo, int base) {
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = aa();
        float rr = s * 0.18f;
        p.setColor(base);
        c.drawRoundRect(new RectF(s * 0.03f, s * 0.03f, s * 0.97f, s * 0.97f), rr, rr, p);
        p.setColor(0x33FFFFFF);
        c.drawRoundRect(new RectF(s * 0.03f, s * 0.03f, s * 0.97f, s * 0.40f), rr, rr, p);
        int dark = Color.rgb((int) (Color.red(base) * 0.45f), (int) (Color.green(base) * 0.45f), (int) (Color.blue(base) * 0.45f));
        if (logo != null) {
            Paint lp = aa();
            lp.setFilterBitmap(true);
            lp.setColorFilter(new PorterDuffColorFilter(dark, PorterDuff.Mode.SRC_IN));
            c.drawBitmap(logo, new Rect(0, 0, logo.getWidth(), logo.getHeight()),
                    new RectF(s * 0.2f, s * 0.2f, s * 0.8f, s * 0.8f), lp);
        } else {
            drawGlyphE(c, s / 2f, s / 2f, s * 0.62f, dark);
        }
        return b;
    }

    /** The logo scaled to a square (head of the snake, match tile). Without a logo: E on an accent disc. */
    static Bitmap logoPlain(int s, Bitmap logo, int accent) {
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        if (logo != null) {
            Paint lp = aa();
            lp.setFilterBitmap(true);
            c.drawBitmap(logo, new Rect(0, 0, logo.getWidth(), logo.getHeight()), new RectF(0, 0, s, s), lp);
        } else {
            Paint p = aa();
            p.setColor(accent);
            c.drawCircle(s / 2f, s / 2f, s / 2f - 0.5f, p);
            drawGlyphE(c, s / 2f, s / 2f, s * 0.7f, 0xFF101015);
        }
        return b;
    }

    /** Album cover centre-cropped to a rounded square. */
    static Bitmap cover(int s, Bitmap src) {
        Bitmap sq = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(sq);
        int w = src.getWidth(), h = src.getHeight(), m = Math.min(w, h);
        Paint fp = aa();
        fp.setFilterBitmap(true);
        c.drawBitmap(src, new Rect((w - m) / 2, (h - m) / 2, (w + m) / 2, (h + m) / 2), new RectF(0, 0, s, s), fp);
        Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Paint p = aa();
        p.setShader(new BitmapShader(sq, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float rr = s * 0.18f;
        new Canvas(out).drawRoundRect(new RectF(s * 0.03f, s * 0.03f, s * 0.97f, s * 0.97f), rr, rr, p);
        return out;
    }

    /** Fallback "album cover": diagonal stripes in two colours. */
    static Bitmap stripes(int s, int c1, int c2) {
        Bitmap sq = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(sq);
        Paint p = aa();
        c.drawColor(c1);
        p.setColor(c2);
        p.setStrokeWidth(s / 6f);
        for (int i = -s; i < s * 2; i += s / 3) c.drawLine(i, s, i + s, 0, p);
        Bitmap out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Paint q = aa();
        q.setShader(new BitmapShader(sq, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        float rr = s * 0.18f;
        new Canvas(out).drawRoundRect(new RectF(s * 0.03f, s * 0.03f, s * 0.97f, s * 0.97f), rr, rr, q);
        return out;
    }

    /** Rotating highlight arc over an LP drawn into dst (no allocation). */
    static void drawLpGlint(Canvas c, RectF dst, RectF tmp, float angle, Paint p) {
        float inset = dst.width() * 0.12f;
        tmp.set(dst.left + inset, dst.top + inset, dst.right - inset, dst.bottom - inset);
        c.drawArc(tmp, angle, 50f, false, p);
        c.drawArc(tmp, angle + 180f, 50f, false, p);
    }
}
