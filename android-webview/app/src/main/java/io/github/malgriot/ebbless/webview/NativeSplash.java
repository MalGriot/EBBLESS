package io.github.malgriot.ebbless.webview;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.res.AssetFileDescriptor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.text.Spanned;
import android.text.SpannableString;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.InputStream;
import java.util.Calendar;

/**
 * The launch splash, drawn natively so it appears the moment the app opens and never waits on the page.
 * A greyscale H.264 loop is tinted on the GPU with the time-of-day accent (a colour matrix, no blend modes),
 * the wordmark and Tutorial / Enter fade in over it, and the web app boots invisibly underneath.
 * Enter plays the enter sound here, then asks the page to press its own Enter once it is ready.
 */
class NativeSplash extends FrameLayout {
    interface Listener {
        /** Visitor chose; the page should act (it is ready). */
        void onChoose(boolean tutorial);
        /** Video is on screen; heavy work (the web view) may start now. */
        void onRevealed();
        /** Splash is gone. */
        void onFinished();
    }

    private static final String[] LETTER_HEX = {"#e0b45c", "#d98aa3", "#a89aef", "#d68a63", "#9aa9bd", "#5fcabf", "#d17a72"};
    private static final int[] START_LETTER = {6, 2, 5, 1, 4, 0, 3};
    private static final float VIDEO_ASPECT = 540f / 1080f;
    private static final String LINE = "Turning the tides...";

    private final Activity act;
    private final Listener listener;
    private final float dp;
    private final TextureView tv;
    private final View black;
    private final ImageView logo;
    private final LinearLayout buttons;
    private final TextView loading;
    private final Button tutorialBtn;
    private final Paint tintPaint = new Paint();
    private final int[] accent;
    private final int[] finalTint;
    private MediaPlayer video, enterSound;
    private boolean revealed, pageReady, chosen, finished, chosenTutorial, soundReady;
    private int dots;

    NativeSplash(Activity a, Listener l, String accentOverride) {
        super(a);
        act = a;
        listener = l;
        dp = a.getResources().getDisplayMetrics().density;
        setBackgroundColor(Color.BLACK);
        setClickable(true);

        accent = accentOverride != null && !accentOverride.isEmpty() ? parseColor(accentOverride) : clockAccent();
        finalTint = new int[]{mix(accent[0]), mix(accent[1]), mix(accent[2])};

        tv = new TextureView(a);
        tv.setOpaque(true);
        addView(tv, new LayoutParams(-1, -1, Gravity.CENTER));
        applyTint(0f);
        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) { startVideo(new Surface(st)); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) {}
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture st) { return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture st) {}
        });

        LinearLayout col = new LinearLayout(a);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        addView(col, new LayoutParams(-1, -2, Gravity.CENTER));

        logo = new ImageView(a);
        logo.setAdjustViewBounds(true);
        try (InputStream in = a.getAssets().open("brand/assets/wordmark-white.png")) {
            Bitmap bm = BitmapFactory.decodeStream(in);
            logo.setImageBitmap(bm);
        } catch (Exception ignored) {}
        int sw = a.getResources().getDisplayMetrics().widthPixels;
        int lw = Math.min((int) (320 * dp), (int) (sw * 0.7f));
        col.addView(logo, new LinearLayout.LayoutParams(lw, -2));
        logo.setAlpha(0f);

        buttons = new LinearLayout(a);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-2, -2);
        bp.topMargin = (int) (44 * dp);
        col.addView(buttons, bp);

        tutorialBtn = pill("Tutorial", rgb(accent), 0xFF151107, 0);
        Button enterBtn = pill("Enter", 0xE61A1A1A, Color.WHITE, 0x55FFFFFF);
        LinearLayout.LayoutParams g = new LinearLayout.LayoutParams(-2, (int) (48 * dp));
        g.rightMargin = (int) (6 * dp);
        LinearLayout.LayoutParams g2 = new LinearLayout.LayoutParams(-2, (int) (48 * dp));
        g2.leftMargin = (int) (6 * dp);
        buttons.addView(tutorialBtn, g);
        buttons.addView(enterBtn, g2);
        buttons.setAlpha(0f);
        buttons.setEnabled(false);
        tutorialBtn.setOnClickListener(v -> choose(true));
        enterBtn.setOnClickListener(v -> choose(false));
        buttons.setVisibility(View.INVISIBLE);

        loading = new TextView(a);
        loading.setTextColor(0x99FFFFFF);
        loading.setTextSize(13);
        loading.setLetterSpacing(0.08f);
        loading.setGravity(Gravity.CENTER);
        loading.setText(LINE);
        loading.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.topMargin = (int) (-34 * dp);
        col.addView(loading, lp);

        black = new View(a);
        black.setBackgroundColor(Color.BLACK);
        addView(black, new LayoutParams(-1, -1));

        try {
            enterSound = new MediaPlayer();
            AssetFileDescriptor afd = a.getAssets().openFd("brand/assets/enter-sound.mp3");
            enterSound.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            enterSound.setOnPreparedListener(mp -> soundReady = true);
            enterSound.prepareAsync();
        } catch (Exception e) {
            enterSound = null;
        }
        postDelayed(this::reveal, 1500);   // never leave it black if the video is slow to start
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        if (w == 0 || h == 0) return;
        int tw, th;
        if ((float) w / h < VIDEO_ASPECT) { th = h; tw = Math.round(h * VIDEO_ASPECT); } else { tw = w; th = Math.round(w / VIDEO_ASPECT); }
        LayoutParams lp = new LayoutParams(tw, th, Gravity.CENTER);
        tv.setLayoutParams(lp);
    }

    private Button pill(String text, int bg, int fg, int stroke) {
        Button b = new Button(act);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTextColor(fg);
        b.setStateListAnimator(null);
        b.setElevation(0);
        GradientDrawable d = new GradientDrawable();
        d.setColor(bg);
        d.setCornerRadius(999 * dp);
        if (stroke != 0) d.setStroke((int) Math.max(1, dp), stroke);
        b.setBackground(d);
        b.setPadding((int) (28 * dp), 0, (int) (28 * dp), 0);
        return b;
    }

    private void startVideo(Surface surface) {
        try {
            video = new MediaPlayer();
            AssetFileDescriptor afd = act.getAssets().openFd("brand/assets/splash-cymatics-native.mp4");
            video.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            video.setSurface(surface);
            video.setLooping(true);
            video.setVolume(0f, 0f);
            video.setOnInfoListener((mp, what, extra) -> {
                if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) reveal();
                return false;
            });
            video.setOnPreparedListener(MediaPlayer::start);
            video.prepareAsync();
        } catch (Exception e) {
            reveal();
        }
    }

    /** Black fades off the video, then the wordmark, then the buttons. The tint eases from the plain accent to its final colour over 3s. */
    private void reveal() {
        if (revealed || finished) return;
        revealed = true;
        listener.onRevealed();
        black.animate().alpha(0f).setDuration(700).withEndAction(() -> black.setVisibility(View.GONE)).start();
        logo.animate().alpha(1f).setStartDelay(350).setDuration(700).start();
        buttons.setVisibility(View.VISIBLE);
        buttons.setTranslationY(10 * dp);
        buttons.animate().alpha(1f).translationY(0f).setStartDelay(1000).setDuration(500).start();
        ValueAnimator va = ValueAnimator.ofFloat(0f, 1f);
        va.setDuration(3000);
        va.setInterpolator(new AccelerateDecelerateInterpolator());
        va.addUpdateListener(a -> applyTint((float) a.getAnimatedValue()));
        va.start();
    }

    private void applyTint(float t) {
        float r = lerp(accent[0], finalTint[0], t) / 255f, g = lerp(accent[1], finalTint[1], t) / 255f, b = lerp(accent[2], finalTint[2], t) / 255f;
        tintPaint.setColorFilter(new ColorMatrixColorFilter(new ColorMatrix(new float[]{
                r, 0, 0, 0, 0,
                0, g, 0, 0, 0,
                0, 0, b, 0, 0,
                0, 0, 0, 1, 0})));
        tv.setLayerPaint(tintPaint);
    }

    private void choose(boolean tutorial) {
        if (chosen || finished) return;
        chosen = true;
        chosenTutorial = tutorial;
        if (!tutorial && enterSound != null && soundReady) enterSound.start();
        buttons.animate().cancel();
        buttons.animate().alpha(0f).setStartDelay(0).setDuration(200).withEndAction(() -> buttons.setVisibility(View.INVISIBLE)).start();
        if (pageReady) finish(false); else showLoading();
    }

    /** Page has its Enter/Tutorial wired up. */
    void pageReady() {
        pageReady = true;
        if (chosen) finish(false);
    }

    /** The page is showing something that must be seen now (the beta lock): get out of the way. */
    void dropForLock() { finish(true); }

    private void showLoading() {
        loading.setVisibility(View.VISIBLE);
        loading.setAlpha(0f);
        loading.animate().alpha(1f).setDuration(250).start();
        postDelayed(new Runnable() {
            @Override public void run() {
                if (finished) return;
                SpannableString sp = new SpannableString(LINE);
                sp.setSpan(new ForegroundColorSpan(0x00FFFFFF), LINE.length() - 3 + (dots++ % 4), LINE.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                loading.setText(sp);
                postDelayed(this, 500);
            }
        }, 500);
    }

    private void finish(boolean locked) {
        if (finished) return;
        finished = true;
        if (!locked) listener.onChoose(chosenTutorial);
        animate().alpha(0f).setStartDelay(locked ? 0 : 150).setDuration(locked ? 200 : 400).withEndAction(() -> {
            release();
            if (getParent() != null) ((android.view.ViewGroup) getParent()).removeView(this);
            listener.onFinished();
        }).start();
    }

    void release() {
        try { if (video != null) { video.release(); video = null; } } catch (Exception ignored) {}
        // let a playing enter sound ring out on its own
        final MediaPlayer es = enterSound;
        enterSound = null;
        if (es != null) {
            if (es.isPlaying()) es.setOnCompletionListener(MediaPlayer::release); else es.release();
        }
    }

    // ---- accent: the same time-of-day colour the page works out (Rosicrucian daily periods) ----

    private static int[] clockAccent() {
        Calendar c = Calendar.getInstance();
        int wd = c.get(Calendar.DAY_OF_WEEK) - 1;
        double s = c.get(Calendar.HOUR_OF_DAY) * 3600 + c.get(Calendar.MINUTE) * 60 + c.get(Calendar.SECOND) + c.get(Calendar.MILLISECOND) / 1000.0;
        double per = 86400.0 / 7;
        int pi = (int) Math.min(6, Math.max(0, Math.floor(s / per)));
        double ps = pi * per, pe = ps + per;
        if (pe - s <= 300) return lerpRgb(letter(wd, pi), pi == 6 ? letter((wd + 1) % 7, 0) : letter(wd, pi + 1), (300 - (pe - s)) / 600);
        if (s - ps <= 300) return lerpRgb(pi == 0 ? letter((wd + 6) % 7, 6) : letter(wd, pi - 1), letter(wd, pi), 0.5 + (s - ps) / 600);
        return rgbOf(letter(wd, pi));
    }

    private static String letter(int wd, int pi) { return LETTER_HEX[(START_LETTER[wd] + pi) % 7]; }

    private static int[] rgbOf(String hex) {
        int n = Integer.parseInt(hex.substring(1), 16);
        return new int[]{(n >> 16) & 255, (n >> 8) & 255, n & 255};
    }

    private static int[] lerpRgb(String a, String b, double t) {
        int[] x = rgbOf(a), y = rgbOf(b);
        return new int[]{(int) Math.round(x[0] + (y[0] - x[0]) * t), (int) Math.round(x[1] + (y[1] - x[1]) * t), (int) Math.round(x[2] + (y[2] - x[2]) * t)};
    }

    private static int[] parseColor(String css) {
        try {
            if (css.startsWith("#")) return rgbOf(css);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d+").matcher(css);
            int[] o = new int[3];
            for (int i = 0; i < 3 && m.find(); i++) o[i] = Integer.parseInt(m.group());
            return o;
        } catch (Exception e) {
            return clockAccent();
        }
    }

    /** 72% accent + 28% white, the splash's final colour. */
    private static int mix(int ch) { return Math.round(ch * 0.72f + 255 * 0.28f); }

    private static float lerp(int a, int b, float t) { return a + (b - a) * t; }

    private static int rgb(int[] c) { return Color.rgb(c[0], c[1], c[2]); }
}
