package io.github.malgriot.ebbless.webview;

import android.animation.Animator;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;
import java.util.Random;

/**
 * #691: the full-screen player. It draws over the lock screen (showWhenLocked + turnScreenOn) and follows the same reports the
 * lock screen player gets (PlaybackService.snapshot), and sends every button press back through PlaybackService.control, the same
 * path as the notification buttons, so the music keeps playing in MainActivity's WebView.
 *
 * It is built from native views (not a second WebView) on purpose: a second page would boot a whole second copy of the app and
 * could not share the one player. The visuals are small ports of the app's own: the cymatics sand plate (index.html vizDraw),
 * the lava-lamp ambient (paintAmbient + ambient-drift) and the bouncing E logo (.art-dvd, #613/#647).
 *
 * The button right of next cycles: 1 song art scrolling top to bottom to top, 2 cymatics, 3 lava lamp + bouncing logo, then closes
 * (back to the standard player).
 *
 * GPU budget: only transform / alpha animators and one canvas view; everything is paused when the activity is paused or the screen is off.
 */
public class FullScreenPlayerActivity extends Activity implements PlaybackService.StateListener {
    static final String EXTRA_TOGGLE = "toggle";
    static final int NOTIF_ID = 3;
    static volatile FullScreenPlayerActivity live;

    private static final int BASE = 0xFF121212;
    private static final int MODE_SCROLL = 0, MODE_CYMATICS = 1, MODE_LAVA = 2;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private float dp;
    private int screenW, screenH, artSize;
    private int mode = MODE_SCROLL;
    private boolean resumed, screenOn = true, playing, liked, dragging;
    private long durMs;
    private String artUrl = "";
    private Bitmap artBmp;
    private int accent;

    private FrameLayout root, bg, artHolder, logoBox;
    private ImageView scrollArt, lavaLayer, artImg, btnLike, btnPlay, btnMode;
    private View navFill, scrim, lavaTint, lavaVignette, spacer;
    private CymaticsView cym;
    private LinearLayout content, panel;
    private TextView titleTv, artistTv, elapsedTv, durTv;
    private SeekBar seek;
    private ObjectAnimator scrollAnim;
    private final ArrayList<Animator> lavaAnims = new ArrayList<>();
    private final ArrayList<Animator> logoAnims = new ArrayList<>();

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            screenOn = !Intent.ACTION_SCREEN_OFF.equals(i.getAction());
            applyActive();
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        live = this;
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(BASE);   // solid player base in every mode; the system must not tint it (no light-bar flag, no contrast scrim)
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(BASE));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        dp = getResources().getDisplayMetrics().density;
        screenW = getResources().getDisplayMetrics().widthPixels;
        screenH = getResources().getDisplayMetrics().heightPixels;
        artSize = Math.max(dp(200), Math.min(screenW - dp(32), screenH - dp(440)));
        accent = clockColor();
        build();
        setContentView(root);
        cancelLaunchNotice();
        applyMode();
        refresh();
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        cancelLaunchNotice();
        if (i != null && i.getBooleanExtra(EXTRA_TOGGLE, false)) finish();   // the notification's visual button again closes it
    }

    private void cancelLaunchNotice() {
        try { getSystemService(NotificationManager.class).cancel(NOTIF_ID); } catch (Exception ignored) {}
    }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screenReceiver, f);
        PowerManager pm = getSystemService(PowerManager.class);
        screenOn = pm == null || pm.isInteractive();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        PlaybackService.stateListener = this;
        refresh();
        applyActive();
    }

    @Override protected void onPause() {
        resumed = false;
        if (PlaybackService.stateListener == this) PlaybackService.stateListener = null;
        applyActive();
        super.onPause();
    }

    @Override protected void onStop() {
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        super.onStop();
    }

    @Override protected void onDestroy() {
        if (live == this) live = null;
        ui.removeCallbacksAndMessages(null);
        stopModeStuff();
        super.onDestroy();
    }

    @Override public void onState() { ui.post(this::refresh); }   // called from the page's bridge thread

    private int dp(float v) { return Math.round(v * dp); }

    // ------------------------------------------------------------------ views

    private void build() {
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF121212);

        bg = new FrameLayout(this);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));

        scrollArt = new ImageView(this);
        scrollArt.setScaleType(ImageView.ScaleType.CENTER_CROP);
        bg.addView(scrollArt, new FrameLayout.LayoutParams(-1, (int) (screenH * 1.35f), Gravity.TOP));
        scrim = new View(this);
        scrim.setBackgroundColor(0x66000000);
        bg.addView(scrim, new FrameLayout.LayoutParams(-1, -1));

        cym = new CymaticsView(this);
        bg.addView(cym, new FrameLayout.LayoutParams(-1, -1));

        lavaLayer = new ImageView(this);
        lavaLayer.setScaleType(ImageView.ScaleType.FIT_XY);
        lavaLayer.setAlpha(0.9f);
        FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams((int) (screenW * 1.8f), (int) (screenH * 1.8f));
        ll.leftMargin = -(int) (screenW * 0.4f); ll.topMargin = -(int) (screenH * 0.4f);
        bg.addView(lavaLayer, ll);
        lavaTint = new View(this);
        lavaTint.setBackgroundColor((accent & 0x00FFFFFF) | 0x38000000);   // the clock-color wash, 22% like the app's ambient
        bg.addView(lavaTint, new FrameLayout.LayoutParams(-1, -1));
        lavaVignette = new View(this);
        GradientDrawable vg = new GradientDrawable();
        vg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        vg.setGradientCenter(0.5f, 0.3f);
        vg.setGradientRadius((float) Math.hypot(screenW, screenH) * 0.62f);
        vg.setColors(new int[]{0x00121212, 0xFF121212});
        lavaVignette.setBackground(vg);
        bg.addView(lavaVignette, new FrameLayout.LayoutParams(-1, -1));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        root.addView(content, new FrameLayout.LayoutParams(-1, -1));
        root.setOnApplyWindowInsetsListener((v, in) -> {
            content.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
            FrameLayout.LayoutParams np = (FrameLayout.LayoutParams) navFill.getLayoutParams();
            if (np.height != in.getSystemWindowInsetBottom()) { np.height = in.getSystemWindowInsetBottom(); navFill.setLayoutParams(np); }
            return in;
        });

        // solid strip behind the system navigation bar so it reads as one dark surface with the player in every mode
        navFill = new View(this);
        navFill.setBackgroundColor(BASE);
        root.addView(navFill, new FrameLayout.LayoutParams(-1, 0, Gravity.BOTTOM));

        // clock row
        FrameLayout top = new FrameLayout(this);
        LinearLayout clock = new LinearLayout(this);
        clock.setOrientation(LinearLayout.VERTICAL);
        clock.setGravity(Gravity.CENTER_HORIZONTAL);
        TextClock tc = new TextClock(this);
        tc.setFormat12Hour("h:mm"); tc.setFormat24Hour("H:mm");
        tc.setTextColor(Color.WHITE); tc.setTextSize(52); tc.setTypeface(android.graphics.Typeface.create("sans-serif-light", android.graphics.Typeface.NORMAL));
        tc.setIncludeFontPadding(false);
        TextClock dc = new TextClock(this);
        dc.setFormat12Hour("EEEE, MMM d"); dc.setFormat24Hour("EEEE, MMM d");
        dc.setTextColor(0xCCFFFFFF); dc.setTextSize(14);
        clock.addView(tc); clock.addView(dc);
        top.addView(clock, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL));
        ImageView close = icon(R.drawable.ic_close, 48, 12);
        close.setContentDescription("Close");
        close.setOnClickListener(v -> finish());
        top.addView(close, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.START | Gravity.TOP));
        content.addView(top, new LinearLayout.LayoutParams(-1, -2));
        top.setPadding(0, dp(8), 0, dp(8));

        // art square (lava mode)
        artHolder = new FrameLayout(this);
        artHolder.setBackgroundColor(0xFF202020);
        final float r = dp(28);
        artHolder.setOutlineProvider(new ViewOutlineProvider() {   // round only the top corners; the panel below carries the bottom ones
            @Override public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight() + (int) r, r); }
        });
        artHolder.setClipToOutline(true);
        artImg = new ImageView(this);
        artImg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artHolder.addView(artImg, new FrameLayout.LayoutParams(-1, -1));
        logoBox = new FrameLayout(this);
        artHolder.addView(logoBox, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(artSize, artSize);
        alp.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(artHolder, alp);

        spacer = new View(this);
        content.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1f));   // vertical weight that pushes the panel down in the scroll and cymatics modes

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(24), dp(16), dp(24), dp(16));
        content.addView(panel, new LinearLayout.LayoutParams(-1, -2));

        titleTv = new TextView(this);
        titleTv.setTextColor(Color.WHITE); titleTv.setTextSize(20); titleTv.setSingleLine(true);
        titleTv.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleTv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        panel.addView(titleTv, new LinearLayout.LayoutParams(-1, -2));
        artistTv = new TextView(this);
        artistTv.setTextColor(0xCCFFFFFF); artistTv.setTextSize(15); artistTv.setSingleLine(true);
        artistTv.setEllipsize(android.text.TextUtils.TruncateAt.END);
        panel.addView(artistTv, new LinearLayout.LayoutParams(-1, -2));

        seek = new SeekBar(this);
        seek.setMax(1000);
        seek.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));
        seek.setThumbTintList(android.content.res.ColorStateList.valueOf(Color.WHITE));
        seek.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0x55FFFFFF));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser && durMs > 0) elapsedTv.setText(fmt(durMs * p / 1000));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { dragging = true; }
            @Override public void onStopTrackingTouch(SeekBar s) {
                dragging = false;
                if (durMs > 0) PlaybackService.control("seekto:" + (durMs * s.getProgress() / 1000 / 1000.0));
            }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2);
        slp.topMargin = dp(12);
        panel.addView(seek, slp);
        seek.setPadding(dp(0), dp(6), dp(0), dp(6));

        LinearLayout times = new LinearLayout(this);
        times.setOrientation(LinearLayout.HORIZONTAL);
        elapsedTv = new TextView(this); durTv = new TextView(this);
        for (TextView t : new TextView[]{elapsedTv, durTv}) { t.setTextColor(0xCCFFFFFF); t.setTextSize(13); }
        durTv.setGravity(Gravity.END);
        times.addView(elapsedTv, new LinearLayout.LayoutParams(0, -2, 1f));
        times.addView(durTv, new LinearLayout.LayoutParams(0, -2, 1f));
        panel.addView(times, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        btnLike = icon(R.drawable.ic_media_heart, 48, 10);
        btnLike.setContentDescription("Like");
        btnLike.setOnClickListener(v -> { liked = !liked; btnLike.setImageResource(liked ? R.drawable.ic_media_heart_filled : R.drawable.ic_media_heart); PlaybackService.control("like"); });
        ImageView prev = icon(R.drawable.ic_media_prev, 64, 12);
        prev.setContentDescription("Previous");
        prev.setOnClickListener(v -> PlaybackService.control("prev"));
        btnPlay = icon(R.drawable.ic_media_play, 84, 22);
        btnPlay.setContentDescription("Play or pause");
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL); circle.setColor(Color.WHITE);
        btnPlay.setBackground(circle);
        btnPlay.setColorFilter(0xFF121212, PorterDuff.Mode.SRC_IN);
        btnPlay.setOnClickListener(v -> { playing = !playing; showPlaying(); PlaybackService.control(playing ? "play" : "pause"); });
        ImageView next = icon(R.drawable.ic_media_next, 64, 12);
        next.setContentDescription("Next");
        next.setOnClickListener(v -> PlaybackService.control("next"));
        btnMode = icon(R.drawable.ic_media_visual, 48, 10);
        btnMode.setContentDescription("Change visual");
        btnMode.setOnClickListener(v -> cycleMode());
        // five equal cells so the big play button sits exactly between big previous and next
        for (View v : new View[]{btnLike, prev, btnPlay, next, btnMode}) {
            FrameLayout cell = new FrameLayout(this);
            ViewGroup.LayoutParams p = v.getLayoutParams();
            cell.addView(v, new FrameLayout.LayoutParams(p.width, p.height, Gravity.CENTER));
            row.addView(cell, new LinearLayout.LayoutParams(0, dp(88), 1f));
        }
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, -2);
        rlp.topMargin = dp(8);
        panel.addView(row, rlp);
    }

    private ImageView icon(int res, int sizeDp, int padDp) {
        ImageView v = new ImageView(this);
        v.setImageResource(res);
        v.setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp));
        v.setScaleType(ImageView.ScaleType.FIT_CENTER);
        v.setLayoutParams(new ViewGroup.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return v;
    }

    // ------------------------------------------------------------------ modes

    private void cycleMode() {
        if (mode >= MODE_LAVA) { finish(); return; }   // one more press: back to the standard system player
        mode++;
        applyMode();
        Toast.makeText(this, mode == MODE_CYMATICS ? "Cymatics" : "Lava lamp", Toast.LENGTH_SHORT).show();
    }

    private void applyMode() {
        stopModeStuff();
        boolean lava = mode == MODE_LAVA;
        scrollArt.setVisibility(mode == MODE_SCROLL ? View.VISIBLE : View.GONE);
        scrim.setVisibility(mode == MODE_SCROLL ? View.VISIBLE : View.GONE);
        cym.setVisibility(mode == MODE_CYMATICS ? View.VISIBLE : View.GONE);
        lavaLayer.setVisibility(lava ? View.VISIBLE : View.GONE);
        lavaTint.setVisibility(lava ? View.VISIBLE : View.GONE);
        lavaVignette.setVisibility(lava ? View.VISIBLE : View.GONE);
        artHolder.setVisibility(lava ? View.VISIBLE : View.GONE);
        spacer.setVisibility(lava ? View.GONE : View.VISIBLE);

        LinearLayout.LayoutParams pl = (LinearLayout.LayoutParams) panel.getLayoutParams();
        GradientDrawable bgd = new GradientDrawable();
        if (lava) {   // attached to the bottom of the art square, same width, rounded bottom corners, stretching down
            pl.height = 0; pl.weight = 1f;
            pl.leftMargin = pl.rightMargin = (screenW - artSize) / 2;
            pl.bottomMargin = dp(20);
            float rr = dp(28);
            bgd.setCornerRadii(new float[]{0, 0, 0, 0, rr, rr, rr, rr});
            bgd.setColor(0xE6181818);   // solid-ish, no backdrop blur over the moving lava layer
            panel.setGravity(Gravity.CENTER_VERTICAL);
        } else {
            pl.height = ViewGroup.LayoutParams.WRAP_CONTENT; pl.weight = 0f;
            pl.leftMargin = pl.rightMargin = pl.bottomMargin = 0;
            bgd.setOrientation(GradientDrawable.Orientation.TOP_BOTTOM);
            bgd.setColors(new int[]{0x00000000, 0xCC000000});
            panel.setGravity(Gravity.BOTTOM);
        }
        panel.setBackground(bgd);
        panel.setLayoutParams(pl);
        applyArt();
        startModeStuff();
        applyActive();
    }

    private void startModeStuff() {
        if (mode == MODE_SCROLL) {
            scrollAnim = ObjectAnimator.ofFloat(scrollArt, "translationY", 0f, -screenH * 0.35f);
            scrollAnim.setDuration(45000);
            scrollAnim.setRepeatCount(ObjectAnimator.INFINITE);
            scrollAnim.setRepeatMode(ObjectAnimator.REVERSE);
            scrollAnim.setInterpolator(new AccelerateDecelerateInterpolator());
            scrollAnim.start();
        } else if (mode == MODE_LAVA) {
            // the app's ambient-drift keyframes (0, 20 ... 100 %), as translate (% of the layer) + scale, 16 s each way
            float w = screenW * 1.8f, h = screenH * 1.8f;
            lavaLayer.setPivotX(w / 2); lavaLayer.setPivotY(h / 2);
            PropertyValuesHolder tx = PropertyValuesHolder.ofFloat("translationX", 0, -0.09f * w, 0.08f * w, 0.10f * w, -0.07f * w, 0);
            PropertyValuesHolder ty = PropertyValuesHolder.ofFloat("translationY", 0, 0.07f * h, -0.09f * h, 0.09f * h, -0.06f * h, 0);
            PropertyValuesHolder sx = PropertyValuesHolder.ofFloat("scaleX", 1.2f, 1.42f, 1.5f, 1.28f, 1.46f, 1.2f);
            PropertyValuesHolder sy = PropertyValuesHolder.ofFloat("scaleY", 1.2f, 1.42f, 1.5f, 1.28f, 1.46f, 1.2f);
            ObjectAnimator a = ObjectAnimator.ofPropertyValuesHolder(lavaLayer, tx, ty, sx, sy);
            a.setDuration(16000);
            a.setInterpolator(new LinearInterpolator());
            a.setRepeatCount(ObjectAnimator.INFINITE);
            a.start();
            lavaAnims.add(a);
            buildLogo();
        }
    }

    private void stopModeStuff() {
        if (scrollAnim != null) { scrollAnim.cancel(); scrollAnim = null; }
        scrollArt.setTranslationY(0);
        for (Animator a : lavaAnims) a.cancel();
        lavaAnims.clear();
        for (Animator a : logoAnims) a.cancel();
        logoAnims.clear();
        logoBox.removeAllViews();
        cym.setRunning(false);
    }

    /** The EBBLESS E bouncing off the art square's walls with its six-color trail (index.html .art-dvd): x and y at steady, different speeds. */
    private void buildLogo() {
        logoBox.removeAllViews();
        final int bw = Math.round(artSize * 0.16f), bh = Math.round(bw * 188f / 207f);
        final int[] colors = {0, 0xFF5aa6f0, 0xFF7ee3ee, 0xFFb5ebc0, 0xFFf5c776, 0xFFe8986b, 0xFFba687b};
        final float[] alpha = {.85f, .85f, .75f, .65f, .55f, .45f, .35f};
        for (int i = 6; i >= 0; i--) {   // trail first (underneath), the white E last
            FrameLayout box = new FrameLayout(this);
            ImageView img = new ImageView(this);
            img.setImageResource(R.drawable.mark_white);
            img.setScaleType(ImageView.ScaleType.FIT_XY);
            img.setAlpha(alpha[i]);
            if (i > 0) img.setColorFilter(colors[i], PorterDuff.Mode.SRC_IN);
            FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(Math.round(bw * 1.0483f), Math.round(bw * 1.0483f * 199f / 217f));
            ip.leftMargin = Math.round(-0.029f * bw); ip.topMargin = Math.round(-0.0319f * bh);
            box.addView(img, ip);
            logoBox.addView(box, new FrameLayout.LayoutParams(bw, bh));
            ObjectAnimator ax = ObjectAnimator.ofFloat(box, "translationX", 0f, artSize - bw);
            ax.setDuration(9000);
            ObjectAnimator ay = ObjectAnimator.ofFloat(box, "translationY", 0f, artSize - bh);
            ay.setDuration(13800);
            for (ObjectAnimator a : new ObjectAnimator[]{ax, ay}) {
                a.setInterpolator(new LinearInterpolator());
                a.setRepeatCount(ObjectAnimator.INFINITE);
                a.setRepeatMode(ObjectAnimator.REVERSE);
                a.start();
                a.setCurrentPlayTime((6 - i) * 1000L);   // each ghost runs 1 s behind the one before it
                logoAnims.add(a);
            }
        }
    }

    /** Run only while the activity is in front and the screen is on. */
    private void applyActive() {
        boolean on = resumed && screenOn;
        if (scrollAnim != null) pause(scrollAnim, !on);
        for (Animator a : lavaAnims) pause(a, !on);
        for (Animator a : logoAnims) pause(a, !on);
        cym.setRunning(on && mode == MODE_CYMATICS);
        ui.removeCallbacks(tick);
        if (on) { updateProgress(); if (playing) ui.postDelayed(tick, 500); }
    }

    private static void pause(Animator a, boolean p) {
        if (p) a.pause(); else a.resume();
    }

    // ------------------------------------------------------------------ state

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            updateProgress();
            if (resumed && screenOn && playing) ui.postDelayed(this, 500);
        }
    };

    /** Pull the page's latest report (title, art, play state, liked, position). */
    private void refresh() {
        JSONObject j = PlaybackService.snapshot();
        String title = j == null ? "" : j.optString("t");
        titleTv.setText(title.isEmpty() ? "Nothing playing" : title);
        artistTv.setText(j == null ? "" : j.optString("a"));
        playing = j != null && j.optBoolean("pl");
        liked = j != null && j.optBoolean("liked");
        durMs = j == null ? 0 : Math.max(0, j.optLong("dur"));
        btnLike.setImageResource(liked ? R.drawable.ic_media_heart_filled : R.drawable.ic_media_heart);
        showPlaying();
        String url = j == null ? "" : j.optString("art");
        if (!url.equals(artUrl)) {
            artUrl = url;
            Bitmap quick = url.isEmpty() ? null : PlaybackService.artFor(url);
            setArt(quick);
            if (url.startsWith("https://")) loadArt(url);
        }
        updateProgress();
        if (resumed && screenOn) {
            cym.setPlaying(playing);
            ui.removeCallbacks(tick);
            if (playing) ui.postDelayed(tick, 500);
        }
    }

    private void showPlaying() {
        btnPlay.setImageResource(playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play);
        cym.setPlaying(playing);
    }

    private void updateProgress() {
        JSONObject j = PlaybackService.snapshot();
        if (j == null || dragging) return;
        long pos = Math.max(0, j.optLong("pos"));
        if (j.optBoolean("pl")) pos += (long) ((SystemClock.elapsedRealtime() - PlaybackService.snapshotAt()) * j.optDouble("rate", 1.0));
        if (durMs > 0) pos = Math.min(pos, durMs);
        seek.setEnabled(durMs > 0);
        seek.setProgress(durMs > 0 ? (int) (pos * 1000 / durMs) : 0);
        elapsedTv.setText(fmt(pos));
        durTv.setText(durMs > 0 ? fmt(durMs) : "");
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format(Locale.US, "%d:%02d", s / 60, s % 60);
    }

    // ------------------------------------------------------------------ art

    private void setArt(Bitmap b) {
        artBmp = b;
        applyArt();
    }

    private void applyArt() {
        scrollArt.setImageBitmap(artBmp);
        artImg.setImageBitmap(artBmp);
        if (mode == MODE_LAVA) {
            lavaLayer.setImageBitmap(artBmp == null ? null : blurred(artBmp));
            ColorMatrix cm = new ColorMatrix();
            cm.setSaturation(1.3f);
            ColorMatrix dim = new ColorMatrix(new float[]{.45f, 0, 0, 0, 0, 0, .45f, 0, 0, 0, 0, 0, .45f, 0, 0, 0, 0, 0, 1, 0});
            cm.postConcat(dim);
            lavaLayer.setColorFilter(new ColorMatrixColorFilter(cm));
        }
    }

    /** A tiny copy of the cover stretched over the layer is the blur (same trick as the app's paintAmbient: no filter, a small texture). */
    private Bitmap blurred(Bitmap src) {
        Bitmap cur = src;
        while (cur.getWidth() / 2 >= 48 && cur.getHeight() / 2 >= 48) cur = Bitmap.createScaledBitmap(cur, cur.getWidth() / 2, cur.getHeight() / 2, true);
        int w = 24, h = Math.max(1, Math.round(24f * screenH / screenW));
        return Bitmap.createScaledBitmap(cur, w, h, true);
    }

    /** Own, bigger copy of the cover (up to ~1080 px) for the full-screen views; the lock screen one is only 300-600 px. */
    private void loadArt(final String url) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(10000);
                byte[] data;
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[16384]; int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 6_000_000) return;
                        bo.write(buf, 0, n);
                    }
                    data = bo.toByteArray();
                } finally { c.disconnect(); }
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(data, 0, data.length, o);
                int s = 1;
                while (o.outWidth / (s * 2) >= 1080 && o.outHeight / (s * 2) >= 1080) s *= 2;
                BitmapFactory.Options d = new BitmapFactory.Options();
                d.inSampleSize = s;
                final Bitmap bm = BitmapFactory.decodeByteArray(data, 0, data.length, d);
                if (bm == null) return;
                ui.post(() -> { if (url.equals(artUrl) && !isDestroyed()) setArt(bm); });
            } catch (Exception ignored) {
            }
        }, "ebb-fsart").start();
    }

    // ------------------------------------------------------------------ color clock

    /** The app's time-of-day accent (index.html vizRosicrucianColor, without the 5 minute blends). */
    private static int clockColor() {
        int[] lc = {0xe0b45c, 0xd98aa3, 0xa89aef, 0xd68a63, 0x9aa9bd, 0x5fcabf, 0xd17a72};   // A..G
        int[] ls = {6, 2, 5, 1, 4, 0, 3};
        Calendar n = Calendar.getInstance();
        int wd = n.get(Calendar.DAY_OF_WEEK) - 1;
        double sc = n.get(Calendar.HOUR_OF_DAY) * 3600 + n.get(Calendar.MINUTE) * 60 + n.get(Calendar.SECOND);
        int pi = (int) Math.min(6, Math.max(0, Math.floor(sc / (86400.0 / 7))));
        return 0xFF000000 | lc[(ls[wd] + pi) % 7];
    }

    // ------------------------------------------------------------------ cymatics

    /**
     * Port of the app's sand-on-a-plate visualizer (index.html vizDraw): grains random-walk with a step proportional to |F(x,y)| and
     * settle on the nodal lines. Five of the app's pattern families, crossfaded on a timer. Draws only while running (screen on,
     * activity in front, this mode showing), ~30 fps when playing, ~10 fps when paused.
     */
    static class CymaticsView extends View {
        private static final int N = 2000;
        private static final float[][][] MODES = {
                {{3, 5}, {4, 6}, {2, 6}, {3, 8}, {5, 7}, {4, 9}},            // grid
                {{3}, {4}, {5}, {6}, {7}},                                    // hexagon
                {{5, 3}, {6, 4}, {7, 3}, {8, 4}, {9, 3}, {10, 4}},           // starburst
                {{3, 5, 1.5f}, {4, 6, 2}, {3, 7, 1}, {5, 5, 2.5f}, {4, 8, 1.5f}},   // ripple
                {{4, .5f}, {5, .4f}, {6, .6f}, {4, .3f}, {7, .5f}}          // interference
        };
        private static final float[] ALPHA = {.2f, .4f, .62f, .87f};
        private final float[] gx = new float[N], gy = new float[N];
        private final float[][] pts = new float[4][N * 2];
        private final int[] cnt = new int[4];
        private final Paint[] paints = new Paint[4];
        private final Random rnd = new Random();
        private boolean running, playing;
        private long last;
        private int fam, nextFam;
        private float[] par, nextPar;
        private float mix, holdMs;
        private final int color;
        private final float dens;

        CymaticsView(Context c) {
            super(c);
            dens = c.getResources().getDisplayMetrics().density;
            color = clockColor();
            for (int i = 0; i < N; i++) { gx[i] = rnd.nextFloat() * 2 - 1; gy[i] = rnd.nextFloat() * 2 - 1; }
            for (int b = 0; b < 4; b++) {
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setColor(color); p.setAlpha(Math.round(ALPHA[b] * 255));
                p.setStrokeCap(Paint.Cap.ROUND);
                p.setStrokeWidth(dens * (1.4f + 1.2f * b / 3f));
                paints[b] = p;
            }
            par = pick(fam);
            nextPar = par;
        }

        void setPlaying(boolean p) { playing = p; }

        void setRunning(boolean r) {
            if (r == running) return;
            running = r;
            if (r) { last = 0; postInvalidateOnAnimation(); }
        }

        private float[] pick(int f) { return MODES[f][rnd.nextInt(MODES[f].length)]; }

        private static float field(int f, float x, float y, float[] a) {
            switch (f) {
                case 0: return (float) ((Math.cos(a[0] * Math.PI * x) * Math.cos(a[1] * Math.PI * y) + Math.cos(a[1] * Math.PI * x) * Math.cos(a[0] * Math.PI * y)) / 2);
                case 1: {
                    double s = 0;
                    for (int i = 0; i < 3; i++) { double ang = i * Math.PI / 3; s += Math.cos(a[0] * Math.PI * (x * Math.cos(ang) + y * Math.sin(ang))); }
                    return (float) (s / 3);
                }
                case 2: { double r = Math.sqrt(x * x + y * y), th = Math.atan2(y, x); return (float) (Math.cos(a[0] * th) * Math.sin(a[1] * Math.PI * r)); }
                case 3: { double r = Math.sqrt(x * x + y * y), th = Math.atan2(y, x); return (float) Math.cos(a[0] * Math.PI * r + a[2] * Math.cos(a[1] * th)); }
                default: {
                    double d1 = Math.hypot(x - a[1], y), d2 = Math.hypot(x + a[1], y);
                    return (float) ((Math.cos(a[0] * Math.PI * d1) + Math.cos(a[0] * Math.PI * d2)) / 2);
                }
            }
        }

        @Override protected void onDraw(Canvas cv) {
            long now = SystemClock.uptimeMillis();
            float dt = last == 0 ? 33 : Math.min(100, now - last);
            last = now;
            // pattern timer: a new random family every ~9 s while playing (slower paused), 2.5 s crossfade
            holdMs += dt;
            if (mix == 0 && holdMs > (playing ? 9000 : 20000)) {
                nextFam = (fam + 1 + rnd.nextInt(MODES.length - 1)) % MODES.length;
                nextPar = pick(nextFam);
                mix = 0.0001f;
            }
            if (mix > 0) {
                mix += dt / 2500f;
                if (mix >= 1) { fam = nextFam; par = nextPar; mix = 0; holdMs = 0; }
            }
            float w = getWidth(), h = getHeight(), cx = w / 2, cy = h / 2;
            float radius = (float) Math.hypot(w / 2, h / 2) / (float) Math.sqrt(2);
            float jitter = playing ? 0.020f : 0.004f, step = playing ? 0.016f : 0.006f;
            cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0;
            for (int i = 0; i < N; i++) {
                float x = gx[i], y = gy[i];
                float f = field(fam, x, y, par);
                if (mix > 0) f = f * (1 - mix) + field(nextFam, x, y, nextPar) * mix;
                float amp = Math.min(1f, Math.abs(f) * 1.9f);
                x += (rnd.nextFloat() - .5f) * jitter * (0.04f + amp) + (rnd.nextFloat() - .5f) * step * amp * amp;
                y += (rnd.nextFloat() - .5f) * jitter * (0.04f + amp) + (rnd.nextFloat() - .5f) * step * amp * amp;
                if (x > 1) x = 1; else if (x < -1) x = -1;
                if (y > 1) y = 1; else if (y < -1) y = -1;
                gx[i] = x; gy[i] = y;
                float settle = 1 - amp;
                int b = Math.min(3, (int) (settle * settle * 4f));
                int k = cnt[b]++ * 2;
                pts[b][k] = cx + x * radius;
                pts[b][k + 1] = cy + y * radius;
            }
            for (int b = 0; b < 4; b++) if (cnt[b] > 0) cv.drawPoints(pts[b], 0, cnt[b] * 2, paints[b]);
            if (running) postInvalidateDelayed(playing ? 33 : 100);
        }
    }
}
