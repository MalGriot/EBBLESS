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
import android.view.MotionEvent;
import android.view.ViewConfiguration;
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
 * the iPod mode is a big click-wheel iPod (IpodPlayer + ClickWheelView) with Now Playing, Queue, Library, Settings and games.
 *
 * The button right of next cycles: 1 song art scrolling top to bottom to top, 2 cymatics, 3 the iPod (the wheel scrolls, taps are select / menu / prev / next / play), then closes
 * (back to the standard player).
 *
 * GPU budget: only transform / alpha animators and one canvas view; everything is paused when the activity is paused or the screen is off.
 */
public class FullScreenPlayerActivity extends Activity implements PlaybackService.StateListener {
    static final String EXTRA_TOGGLE = "toggle";
    static final int NOTIF_ID = 3;
    static volatile FullScreenPlayerActivity live;

    private static final int BASE = 0xFF121212;
    private static final int MODE_SCROLL = 0, MODE_CYMATICS = 1, MODE_IPOD = 2;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private float dp;
    private int screenW, screenH;
    private IpodPlayer ipod;
    private int mode = MODE_SCROLL;
    private boolean resumed, screenOn = true, playing, liked, dragging;
    private long durMs;
    private String artUrl = "";
    private Bitmap artBmp;
    private int accent;
    private GradientDrawable playCircle;
    private ImageView btnClose, btnPrev, btnNext;

    private FrameLayout root, bg;
    private ImageView scrollArt, btnLike, btnPlay, btnMode;
    private View navFill, scrim, spacer;
    private CymaticsView cym;
    private LinearLayout content, panel;
    private TextView titleTv, artistTv, elapsedTv, durTv;
    private SeekBar seek;
    private ObjectAnimator scrollAnim;

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
        accent = PlaybackService.accent(this, clockColor());   // the page's accent (index.html --clock-accent), saved copy, else the app's own clock color
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
        if (ipod != null) ipod.destroy();
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

        cym = new CymaticsView(this, accent);
        bg.addView(cym, new FrameLayout.LayoutParams(-1, -1));

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
        btnClose = close;
        close.setContentDescription("Close");
        close.setOnClickListener(v -> finish());
        top.addView(close, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.START | Gravity.TOP));
        content.addView(top, new LinearLayout.LayoutParams(-1, -2));
        top.setPadding(0, dp(8), 0, dp(8));

        // the iPod (fills everything under the clock)
        ipod = new IpodPlayer(this, new IpodPlayer.Host() {
            @Override public void openApp() { startActivity(new Intent(FullScreenPlayerActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)); }
            @Override public void cycleVisual() { cycleMode(); }
        }, accent, screenW, screenH);
        LinearLayout.LayoutParams ipl = new LinearLayout.LayoutParams(-1, 0, 1f);
        ipl.leftMargin = ipl.rightMargin = dp(8);
        ipl.bottomMargin = dp(8);
        content.addView(ipod.view(), ipl);

        spacer = new View(this);
        content.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1f));   // vertical weight that pushes the panel down in the scroll and cymatics modes

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(24), dp(16), dp(24), dp(16));
        panel.setGravity(Gravity.BOTTOM);
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setOrientation(GradientDrawable.Orientation.TOP_BOTTOM);
        panelBg.setColors(new int[]{0x00000000, 0xCC000000});
        panel.setBackground(panelBg);
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
        ImageView prev = btnPrev = icon(R.drawable.ic_media_prev, 48, 8);
        prev.setContentDescription("Previous");
        prev.setOnClickListener(v -> PlaybackService.control("prev"));
        btnPlay = icon(R.drawable.ic_media_play, 76, 20);
        btnPlay.setContentDescription("Play or pause");
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        playCircle = circle;
        btnPlay.setBackground(circle);
        btnPlay.setOnClickListener(v -> { playing = !playing; showPlaying(); PlaybackService.control(playing ? "play" : "pause"); });
        ImageView next = btnNext = icon(R.drawable.ic_media_next, 48, 8);
        next.setContentDescription("Next");
        next.setOnClickListener(v -> PlaybackService.control("next"));
        btnMode = icon(R.drawable.ic_media_visual, 48, 10);
        btnMode.setContentDescription("Change visual");
        btnMode.setOnClickListener(v -> cycleMode());
        // the play cell is a fixed width a little wider than the circle (so it can never be squeezed into an ellipse or clipped);
        // the four side cells share the rest equally, which keeps the play button centered
        row.setClipChildren(false); row.setClipToPadding(false);
        for (View v : new View[]{btnLike, prev, btnPlay, next, btnMode}) {
            FrameLayout cell = new FrameLayout(this);
            cell.setClipChildren(false); cell.setClipToPadding(false);
            ViewGroup.LayoutParams p = v.getLayoutParams();
            cell.addView(v, new FrameLayout.LayoutParams(p.width, p.height, Gravity.CENTER));
            row.addView(cell, v == btnPlay ? new LinearLayout.LayoutParams(dp(84), dp(88)) : new LinearLayout.LayoutParams(0, dp(88), 1f));
        }
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, -2);
        rlp.topMargin = dp(8);
        panel.addView(row, rlp);
        applyAccent();
    }

    /** Buttons wear the app's accent; the play circle is filled with it and its glyph uses the readable on-accent color (dark on light accents). */
    private void applyAccent() {
        for (ImageView v : new ImageView[]{btnLike, btnPrev, btnNext, btnMode, btnClose}) v.setColorFilter(accent, PorterDuff.Mode.SRC_IN);
        playCircle.setColor(accent);
        btnPlay.setColorFilter(onAccent(accent), PorterDuff.Mode.SRC_IN);
    }

    /** index.html onAccentFor: WCAG relative luminance picks dark or white, whichever reads better on the accent. */
    private static int onAccent(int c) {
        double[] l = new double[3];
        int[] ch = {Color.red(c), Color.green(c), Color.blue(c)};
        for (int i = 0; i < 3; i++) { double v = ch[i] / 255.0; l[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        double lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        return (lum + 0.05) * (lum + 0.05) > 0.0585 ? 0xFF151107 : Color.WHITE;
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
        if (mode >= MODE_IPOD) { finish(); return; }   // one more press: back to the standard system player
        mode++;
        applyMode();
        Toast.makeText(this, mode == MODE_CYMATICS ? "Cymatics" : "iPod", Toast.LENGTH_SHORT).show();
    }

    private void applyMode() {
        stopModeStuff();
        boolean ipodOn = mode == MODE_IPOD;
        scrollArt.setVisibility(mode == MODE_SCROLL ? View.VISIBLE : View.GONE);
        scrim.setVisibility(mode == MODE_SCROLL ? View.VISIBLE : View.GONE);
        cym.setVisibility(mode == MODE_CYMATICS ? View.VISIBLE : View.GONE);
        ipod.view().setVisibility(ipodOn ? View.VISIBLE : View.GONE);
        panel.setVisibility(ipodOn ? View.GONE : View.VISIBLE);
        spacer.setVisibility(ipodOn ? View.GONE : View.VISIBLE);   // the iPod fills the space itself
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
        }
    }

    private void stopModeStuff() {
        if (scrollAnim != null) { scrollAnim.cancel(); scrollAnim = null; }
        scrollArt.setTranslationY(0);
        cym.setRunning(false);
    }

    /** Run only while the activity is in front and the screen is on. */
    private void applyActive() {
        boolean on = resumed && screenOn;
        if (scrollAnim != null) pause(scrollAnim, !on);
        ipod.setActive(on && mode == MODE_IPOD);
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
        int na = PlaybackService.accent(this, accent);
        if (na != accent) { accent = na; applyAccent(); ipod.setAccent(accent); cym.setColor(accent); }
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
        ipod.onState(j);
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
        ipod.setArt(artBmp);
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
        private int color;
        private final float dens;

        CymaticsView(Context c, int accent) {
            super(c);
            dens = c.getResources().getDisplayMetrics().density;
            color = accent;
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

        // ---- touch, ported from index.html's interactive plate: one finger blows the sand, a tap sends a ripple, two fingers tune
        // (horizontal = frequency/zoom, vertical = twist). Zoom/twist are applied to the coordinates before field(), so every family responds.
        private static final float ZOOM_MIN = (float) Math.log(0.55), ZOOM_MAX = (float) Math.log(2.2);
        private final float slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
        private static final class Ripple { final float x, y; final long t0; Ripple(float x, float y, long t0) { this.x = x; this.y = y; this.t0 = t0; } }
        private final ArrayList<Ripple> ripples = new ArrayList<>();   // plate coords
        private float tuneZoomT, tuneTwistT, tuneZoom, tuneTwist;
        private int touches;
        private float lastCx, lastCy, fingerPx, fingerPy, tapX, tapY;
        private long tapT;
        private boolean tapValid;

        @Override public boolean onTouchEvent(MotionEvent e) {
            int act = e.getActionMasked();
            switch (act) {
                case MotionEvent.ACTION_DOWN:
                    tapX = e.getX(); tapY = e.getY(); tapT = SystemClock.uptimeMillis(); tapValid = true;
                    touches = 1; centroid(e, -1); fingerPx = lastCx; fingerPy = lastCy;
                    break;
                case MotionEvent.ACTION_POINTER_DOWN:
                    tapValid = false; touches = e.getPointerCount(); centroid(e, -1);
                    break;
                case MotionEvent.ACTION_MOVE: {
                    float ox = lastCx, oy = lastCy;
                    centroid(e, -1);
                    if (e.getPointerCount() >= 2) tune(lastCx - ox, lastCy - oy);
                    else { fingerPx = lastCx; fingerPy = lastCy; }
                    if (tapValid && Math.hypot(lastCx - tapX, lastCy - tapY) > slop) tapValid = false;
                    break;
                }
                case MotionEvent.ACTION_POINTER_UP:
                    tapValid = false; touches = e.getPointerCount() - 1; centroid(e, e.getActionIndex());
                    if (touches == 1) { fingerPx = lastCx; fingerPy = lastCy; }
                    break;
                case MotionEvent.ACTION_UP:
                    if (tapValid && SystemClock.uptimeMillis() - tapT < 320) addRipple(tapX, tapY);
                    touches = 0;
                    break;
                case MotionEvent.ACTION_CANCEL:
                    touches = 0; tapValid = false;
                    break;
                default: return super.onTouchEvent(e);
            }
            if (running) postInvalidateOnAnimation();   // a touch redraws at once even from the paused 10 fps rhythm
            return true;
        }

        /** Centroid of the pointers (optionally leaving one out, the one just lifted) into lastCx/lastCy. */
        private void centroid(MotionEvent e, int skip) {
            float x = 0, y = 0; int n = 0;
            for (int i = 0; i < e.getPointerCount(); i++) { if (i == skip) continue; x += e.getX(i); y += e.getY(i); n++; }
            if (n > 0) { lastCx = x / n; lastCy = y / n; }
        }

        private void tune(float dx, float dy) {
            float size = Math.max(200 * dens, Math.min(getWidth(), getHeight()));
            tuneZoomT = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, tuneZoomT + dx / size * 2.4f));
            tuneTwistT += dy / size * 3f;
        }

        private void addRipple(float vx, float vy) {
            float w = getWidth(), h = getHeight(), rad = (float) Math.hypot(w / 2, h / 2) / (float) Math.sqrt(2);
            ripples.add(new Ripple((vx - w / 2) / rad, (vy - h / 2) / rad, SystemClock.uptimeMillis()));
            if (ripples.size() > 6) ripples.remove(0);
        }

        void setColor(int c) {
            color = c;
            for (int b = 0; b < 4; b++) { paints[b].setColor(c); paints[b].setAlpha(Math.round(ALPHA[b] * 255)); }
        }

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
            // interactive: eased tuning folded into one scale/twist applied before field(); ripples in plate coords; one finger on the sand
            float ease = Math.min(1f, dt / 140f);
            tuneZoom += (tuneZoomT - tuneZoom) * ease;
            tuneTwist += (tuneTwistT - tuneTwist) * ease;
            float zoom = (float) Math.exp(tuneZoom);
            float tCa = (float) Math.cos(tuneTwist) * zoom, tSa = (float) Math.sin(tuneTwist) * zoom;
            for (int q = ripples.size() - 1; q >= 0; q--) if (now - ripples.get(q).t0 >= 2200) ripples.remove(q);
            int nr = ripples.size();
            boolean hasFinger = touches == 1;
            float fingerX = (fingerPx - cx) / radius, fingerY = (fingerPy - cy) / radius;
            float jitter = playing ? 0.020f : 0.004f, step = playing ? 0.016f : 0.006f;
            cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0;
            for (int i = 0; i < N; i++) {
                float x = gx[i], y = gy[i];
                float fx = x * tCa - y * tSa, fy = x * tSa + y * tCa;
                float f = field(fam, fx, fy, par);
                if (mix > 0) f = f * (1 - mix) + field(nextFam, fx, fy, nextPar) * mix;
                for (int q = 0; q < nr; q++) {
                    Ripple rp = ripples.get(q);
                    float age = (now - rp.t0) / 1000f;
                    float rd = (float) Math.hypot(x - rp.x, y - rp.y) - 0.9f * age;
                    f += 1.1f * (float) (Math.exp(-(rd * rd) / 0.012) * Math.cos(16 * rd) * Math.exp(-age));
                }
                float amp = Math.min(1f, Math.abs(f) * 1.9f);
                float pushX = 0, pushY = 0;
                if (hasFinger) {
                    float ddx = x - fingerX, ddy = y - fingerY, d2 = ddx * ddx + ddy * ddy, g = (float) Math.exp(-d2 / 0.034);
                    if (g > 0.01f) {
                        amp = Math.max(amp, Math.min(1f, g * 1.3f));
                        float d = (float) Math.sqrt(d2) + 1e-4f;
                        pushX = ddx / d * g * 0.018f; pushY = ddy / d * g * 0.018f;
                    }
                }
                x += (rnd.nextFloat() - .5f) * jitter * (0.04f + amp) + (rnd.nextFloat() - .5f) * step * amp * amp + pushX;
                y += (rnd.nextFloat() - .5f) * jitter * (0.04f + amp) + (rnd.nextFloat() - .5f) * step * amp * amp + pushY;
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
            if (running) postInvalidateDelayed(playing || touches > 0 || nr > 0 ? 33 : 100);   // touched or rippling keeps full rate even when paused
        }
    }
}
