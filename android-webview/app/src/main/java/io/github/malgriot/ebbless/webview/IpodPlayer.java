package io.github.malgriot.ebbless.webview;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Outline;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.widget.LinearLayout;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The iPod mode of the full-screen player: a big iPod-classic style device (screen on top, click wheel below) that fills the screen.
 * Everything on the screen is drawn on one canvas view that redraws only on events (a wheel step, a report from the page, one tick a
 * second while the Now Playing bar moves). A game is the only thing that ticks faster (<= 30 fps) and only while it is on screen with
 * the activity resumed and the screen on.
 */
final class IpodPlayer {
    /** What the iPod needs from the activity that hosts it. */
    interface Host {
        void openApp();
        void cycleVisual();
        void close();
    }

    private static final int S_NOW = 0, S_MENU = 1, S_QUEUE = 2, S_LIB = 3, S_SET = 4, S_GAMES = 5, S_GAME = 6;
    private static final String[] MENU = {"Now Playing", "Library", "Queue", "Settings", "Games", "Exit iPod"};
    private static final String[] GAMES = {"Snake", "Tetris", "Match 3"};
    private static final String[] GAME_CLASSES = {"SnakeGame", "TetrisGame", "MatchGame"};
    private static final int TICK_MS = 33;   // ~30 fps while a game is on screen

    private final Activity act;
    private final Host host;
    private final float dp;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final LinearLayout root;
    private final ScreenView screen;
    private final ClickWheelView wheel;
    private final AudioManager audio;
    private final Bitmap logo;

    private int accent;
    private boolean active, playing, liked, destroyed;
    private long durMs;
    private String title = "", artist = "", album = "";
    private JSONObject snap;
    private Bitmap art;

    private int scr = S_NOW;
    private final int[] sel = new int[7];
    private final int[] top = new int[7];
    private boolean adjustVolume;   // Settings > Volume row: the wheel turns the volume until Menu
    private long volShownAt;
    private IpodGame game;
    private long lastTick;
    private final ArrayList<Bitmap> covers = new ArrayList<>();
    private final ArrayList<String> coversRequested = new ArrayList<>();

    IpodPlayer(Activity a, Host host, int accent, int screenW, int screenH) {
        this.act = a;
        this.host = host;
        this.accent = accent;
        dp = a.getResources().getDisplayMetrics().density;
        audio = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
        logo = BitmapFactory.decodeResource(a.getResources(), R.drawable.mark_white);

        root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable body = new GradientDrawable();
        body.setCornerRadius(dp(34));
        body.setColor(0xFF19191B);
        body.setStroke(dp(1), 0x26FFFFFF);
        root.setBackground(body);

        screen = new ScreenView(a);
        root.addView(screen, new LinearLayout.LayoutParams(-1, 0, 1f));

        int availW = screenW - dp(16) - dp(28);
        int wheelS = Math.min(availW, Math.round(screenH * 0.40f));
        wheel = new ClickWheelView(a, accent);
        wheel.setHaptics(a.getSharedPreferences("ebb", Context.MODE_PRIVATE).getBoolean("ipodSoft", true));
        LinearLayout.LayoutParams wl = new LinearLayout.LayoutParams(wheelS, wheelS);
        wl.gravity = Gravity.CENTER_HORIZONTAL;
        wl.topMargin = dp(14);
        root.addView(wheel, wl);
        wheel.setListener(new ClickWheelView.Listener() {
            @Override public void onStep(int dir) { step(dir); }
            @Override public void onCenter() { center(); }
            @Override public void onMenu() { menu(); }
            @Override public void onPrev() { PlaybackService.control("prev"); }
            @Override public void onNext() { PlaybackService.control("next"); }
            @Override public void onPlayPause() { togglePlay(); }
        });
    }

    View view() { return root; }

    private int dp(float v) { return Math.round(v * dp); }

    // ------------------------------------------------------------------ lifecycle / data from the activity

    /** Run only while the activity is in front, the screen is on and the iPod mode is showing. */
    void setActive(boolean on) {
        if (on == active) return;
        active = on;
        ui.removeCallbacks(progressTick);
        ui.removeCallbacks(gameTick);
        if (on) {
            screen.invalidate();
            scheduleProgress();
            if (game != null && scr == S_GAME) { lastTick = SystemClock.uptimeMillis(); ui.postDelayed(gameTick, TICK_MS); }
        }
    }

    void destroy() {
        destroyed = true;
        ui.removeCallbacksAndMessages(null);
        stopGame();
    }

    void setAccent(int a) {
        accent = a;
        wheel.setAccent(a);
        screen.invalidate();
    }

    void setArt(Bitmap b) { art = b; screen.invalidate(); }

    /** The page's latest report (title, artist, play state, liked, position, queue). */
    void onState(JSONObject j) {
        snap = j;
        title = j == null ? "" : j.optString("t");
        artist = j == null ? "" : j.optString("a");
        album = j == null ? "" : j.optString("al");
        playing = j != null && j.optBoolean("pl");
        liked = j != null && j.optBoolean("liked");
        durMs = j == null ? 0 : Math.max(0, j.optLong("dur"));
        wheel.setPlaying(playing);
        if (active) { screen.invalidate(); scheduleProgress(); }
    }

    // ------------------------------------------------------------------ wheel actions

    private void togglePlay() {
        playing = !playing;
        wheel.setPlaying(playing);
        PlaybackService.control(playing ? "play" : "pause");
        screen.invalidate();
        scheduleProgress();
    }

    private void step(int dir) {
        switch (scr) {
            case S_NOW: changeVolume(dir); break;
            case S_GAME: guard(() -> game.onRotate(dir)); break;
            case S_SET:
                if (adjustVolume) { changeVolume(dir); break; }
                moveSel(dir); break;
            default: moveSel(dir); break;
        }
    }

    private void moveSel(int dir) {
        int n = rowCount();
        if (n == 0) return;
        sel[scr] = Math.max(0, Math.min(n - 1, sel[scr] + dir));
        screen.invalidate();
    }

    private void center() {
        switch (scr) {
            case S_NOW: togglePlay(); break;
            case S_MENU:
                switch (sel[S_MENU]) {
                    case 0: go(S_NOW); break;
                    case 1: go(S_LIB); break;
                    case 2: go(S_QUEUE); break;
                    case 3: go(S_SET); break;
                    case 4: go(S_GAMES); break;
                    default: host.close(); break;
                }
                break;
            case S_QUEUE: {
                JSONArray q = snap == null ? null : snap.optJSONArray("q");
                if (q == null || q.length() == 0) break;
                int abs = (snap.optInt("qs", 0)) + sel[S_QUEUE];
                PlaybackService.control("playqueueindex:" + abs);
                go(S_NOW);
                break;
            }
            case S_LIB: {
                JSONArray lib = PlaybackService.library(act);
                if (lib.length() == 0) { host.openApp(); break; }
                JSONObject o = lib.optJSONObject(sel[S_LIB]);
                if (o == null) break;
                String id = o.optString("id");
                if (PlaybackService.pageReporting()) {
                    PlaybackService.control("playlist:" + id);
                } else {   // the page is not running: open the app, it runs the action once it has booted (same path as the widget's buttons)
                    Intent i = new Intent(act, MainActivity.class);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    i.putExtra("widgetAction", "playlist:" + id);
                    act.startActivity(i);
                }
                go(S_NOW);
                break;
            }
            case S_SET:
                switch (sel[S_SET]) {
                    case 0: toggleSoft(); break;
                    case 1: adjustVolume = !adjustVolume; screen.invalidate(); break;
                    case 2: host.cycleVisual(); break;
                    case 3: host.close(); break;
                    default: host.openApp(); break;
                }
                break;
            case S_GAMES: launchGame(sel[S_GAMES]); break;
            case S_GAME: guard(() -> game.onCenter()); break;
            default: break;
        }
    }

    private void menu() {
        switch (scr) {
            case S_NOW: go(S_MENU); break;
            case S_MENU: go(S_NOW); break;
            case S_GAME: {
                boolean[] consumed = {true};
                guard(() -> consumed[0] = game.onMenu());
                if (!consumed[0] || game == null) { stopGame(); go(S_GAMES); } else screen.invalidate();
                break;
            }
            case S_SET:
                if (adjustVolume) { adjustVolume = false; screen.invalidate(); } else go(S_MENU);
                break;
            default: go(S_MENU); break;
        }
    }

    private void go(int to) {
        scr = to;
        adjustVolume = false;
        if (to == S_QUEUE) {   // open on the song that is playing
            JSONObject s = snap;
            int rel = s == null ? 0 : s.optInt("qi", 0) - s.optInt("qs", 0);
            sel[S_QUEUE] = Math.max(0, rel);
        } else if (to == S_GAMES) {
            prefetchCovers();
        }
        screen.invalidate();
        scheduleProgress();
    }

    private int rowCount() {
        switch (scr) {
            case S_MENU: return MENU.length;
            case S_QUEUE: { JSONArray q = snap == null ? null : snap.optJSONArray("q"); return q == null ? 0 : q.length(); }
            case S_LIB: return Math.max(1, PlaybackService.library(act).length());
            case S_SET: return 5;
            case S_GAMES: return GAMES.length;
            default: return 0;
        }
    }

    // ------------------------------------------------------------------ volume / settings

    private int vol() { try { return audio.getStreamVolume(AudioManager.STREAM_MUSIC); } catch (Throwable t) { return 0; } }
    private int volMax() { try { return Math.max(1, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)); } catch (Throwable t) { return 15; } }

    private void changeVolume(int dir) {
        try { audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir > 0 ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, 0); } catch (Throwable ignored) {}
        volShownAt = SystemClock.uptimeMillis();
        ui.removeCallbacks(hideVolume);
        ui.postDelayed(hideVolume, 1500);
        screen.invalidate();
    }

    private final Runnable hideVolume = new Runnable() { @Override public void run() { volShownAt = 0; screen.invalidate(); } };

    private boolean soft() { return act.getSharedPreferences("ebb", Context.MODE_PRIVATE).getBoolean("ipodSoft", true); }

    private void toggleSoft() {
        boolean on = !soft();
        act.getSharedPreferences("ebb", Context.MODE_PRIVATE).edit().putBoolean("ipodSoft", on).apply();
        wheel.setHaptics(on);
        PlaybackService.control("softtap:" + (on ? "1" : "0"));   // the page's own "Soft sounds and vibration" setting follows
        screen.invalidate();
    }

    // ------------------------------------------------------------------ progress ticker (1 per second, only on Now Playing while playing)

    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (!active || destroyed) return;
            screen.invalidate();
            if (scr == S_NOW && playing) ui.postDelayed(this, 1000);
        }
    };

    private void scheduleProgress() {
        ui.removeCallbacks(progressTick);
        if (active && scr == S_NOW && playing && !destroyed) ui.postDelayed(progressTick, 1000);
    }

    private long positionMs() {
        JSONObject j = snap;
        if (j == null) return 0;
        long pos = Math.max(0, j.optLong("pos"));
        if (j.optBoolean("pl")) pos += (long) ((SystemClock.elapsedRealtime() - PlaybackService.snapshotAt()) * j.optDouble("rate", 1.0));
        return durMs > 0 ? Math.min(pos, durMs) : pos;
    }

    // ------------------------------------------------------------------ games

    @FunctionalInterface private interface Call { void run() throws Throwable; }

    /** A game bug must never take the player down: drop the game, back to the list. */
    private void guard(Call c) {
        try { c.run(); screen.invalidate(); }
        catch (Throwable t) {
            Toast.makeText(act, "That game stopped unexpectedly", Toast.LENGTH_SHORT).show();
            stopGame();
            go(S_GAMES);
        }
    }

    private void launchGame(int idx) {
        IpodGame g;
        try {
            Class<?> k = Class.forName("io.github.malgriot.ebbless.webview." + GAME_CLASSES[idx]);   // reflective: this branch compiles with or without the game files
            Constructor<?> ctor;
            Object o;
            if (idx == 2) {
                ctor = k.getDeclaredConstructor(Context.class, int.class, Bitmap.class, List.class);
                ctor.setAccessible(true);
                o = ctor.newInstance(act, accent, logo, new ArrayList<Bitmap>(covers));
            } else {
                ctor = k.getDeclaredConstructor(Context.class, int.class, Bitmap.class);
                ctor.setAccessible(true);
                o = ctor.newInstance(act, accent, logo);
            }
            g = (IpodGame) o;
        } catch (Throwable t) {
            Toast.makeText(act, GAMES[idx] + " is not available yet", Toast.LENGTH_SHORT).show();
            return;
        }
        game = g;
        scr = S_GAME;
        try { g.start(); } catch (Throwable t) { stopGame(); go(S_GAMES); return; }
        lastTick = SystemClock.uptimeMillis();
        ui.removeCallbacks(gameTick);
        if (active) ui.postDelayed(gameTick, TICK_MS);
        screen.invalidate();
    }

    private void stopGame() {
        ui.removeCallbacks(gameTick);
        IpodGame g = game;
        game = null;
        if (g != null) { try { g.stop(); } catch (Throwable ignored) {} }
    }

    private final Runnable gameTick = new Runnable() {
        @Override public void run() {
            if (!active || destroyed || game == null || scr != S_GAME) return;
            long now = SystemClock.uptimeMillis();
            long dt = Math.min(100, Math.max(1, now - lastTick));
            lastTick = now;
            guard(() -> game.update(dt));
            if (game != null && scr == S_GAME) ui.postDelayed(this, TICK_MS);
        }
    };

    /** Match 3 tiles: the page pushes the cover URLs of the most listened albums; fetch them once, lazily, off the main thread. */
    private void prefetchCovers() {
        final JSONArray urls = PlaybackService.topCovers(act);
        for (int i = 0; i < urls.length() && i < 8; i++) {
            final String u = urls.optString(i);
            if (!u.startsWith("https://") || coversRequested.contains(u)) continue;
            coversRequested.add(u);
            new Thread(() -> {
                Bitmap b = download(u);
                if (b == null) return;
                ui.post(() -> { if (!destroyed) covers.add(b); });
            }, "ebb-ipodcover").start();
        }
    }

    private static Bitmap download(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000); c.setReadTimeout(10000);
            byte[] data;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n, total = 0;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > 4_000_000) return null;
                    bo.write(buf, 0, n);
                }
                data = bo.toByteArray();
            } finally { c.disconnect(); }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, o);
            int s = 1;
            while (o.outWidth / (s * 2) >= 256 && o.outHeight / (s * 2) >= 256) s *= 2;   // tiles are small
            BitmapFactory.Options d = new BitmapFactory.Options();
            d.inSampleSize = s;
            return BitmapFactory.decodeByteArray(data, 0, data.length, d);
        } catch (Exception e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ the screen

    private static int onAccent(int c) {
        double[] l = new double[3];
        int[] ch = {(c >> 16) & 255, (c >> 8) & 255, c & 255};
        for (int i = 0; i < 3; i++) { double v = ch[i] / 255.0; l[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
        double lum = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        return (lum + 0.05) * (lum + 0.05) > 0.0585 ? 0xFF151107 : 0xFFFFFFFF;
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format(Locale.US, "%d:%02d", s / 60, s % 60);
    }

    private final class ScreenView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF r = new RectF();
        private final RectF gameRect = new RectF();

        ScreenView(Context c) {
            super(c);
            setOutlineProvider(new ViewOutlineProvider() {
                @Override public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(16)); }
            });
            setClipToOutline(true);
            setContentDescription("iPod screen");
        }

        private void text(Canvas c, String s, float x, float y, float size, int color, boolean bold, Paint.Align al, float maxW) {
            tp.setTextSize(size);
            tp.setColor(color);
            tp.setFakeBoldText(bold);
            tp.setTextAlign(al);
            CharSequence t = maxW > 0 ? TextUtils.ellipsize(s, tp, maxW, TextUtils.TruncateAt.END) : s;
            c.drawText(t, 0, t.length(), x, y, tp);
        }

        private String header() {
            switch (scr) {
                case S_NOW: return "Now Playing";
                case S_MENU: return "iPod";
                case S_QUEUE: return "Queue";
                case S_LIB: return "Library";
                case S_SET: return "Settings";
                case S_GAMES: return "Games";
                default: return game == null ? "" : game.title();
            }
        }

        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight();
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFF0D0D0F);
            c.drawRect(0, 0, w, h, p);

            // title bar
            float bar = dp(30);
            p.setColor(0xFF1C1C20);
            c.drawRect(0, 0, w, bar, p);
            p.setColor(accent);
            c.drawRect(0, bar - dp(1.5f), w, bar, p);
            text(c, header(), w / 2, bar / 2 + dp(5), dp(15), 0xFFFFFFFF, true, Paint.Align.CENTER, w - dp(120));
            if (scr == S_GAME && game != null) {
                int sc = 0;
                try { sc = game.score(); } catch (Throwable ignored) {}
                text(c, String.valueOf(sc), w - dp(10), bar / 2 + dp(5), dp(14), accent, true, Paint.Align.RIGHT, dp(100));
            } else {
                text(c, playing ? "▶" : "❚❚", dp(12), bar / 2 + dp(5), dp(12), accent, false, Paint.Align.LEFT, 0);
            }

            switch (scr) {
                case S_NOW: drawNow(c, w, h, bar); break;
                case S_GAME:
                    if (game != null) {
                        gameRect.set(0, bar, w, h);
                        c.save();
                        c.clipRect(gameRect);
                        try { game.draw(c, gameRect); } catch (Throwable t) { c.restore(); post(() -> guard(() -> { throw t; })); return; }
                        c.restore();
                    }
                    break;
                default: drawList(c, w, h, bar); break;
            }

            // volume overlay (Now Playing, or Settings while adjusting)
            if (volShownAt != 0 || (scr == S_SET && adjustVolume)) drawVolume(c, w, h);

            // bezel
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(dp(2));
            p.setColor(0x40FFFFFF);
            r.set(1, 1, w - 1, h - 1);
            c.drawRoundRect(r, dp(16), dp(16), p);
            p.setStyle(Paint.Style.FILL);
        }

        private void drawList(Canvas c, float w, float h, float bar) {
            float rowH = dp(36);
            int vis = Math.max(1, (int) ((h - bar) / rowH));
            int n = rowCount();
            int s = sel[scr];
            int t = top[scr];
            if (s < t) t = s;
            if (s >= t + vis) t = s - vis + 1;
            t = Math.max(0, Math.min(t, Math.max(0, n - vis)));
            top[scr] = t;

            JSONArray q = scr == S_QUEUE && snap != null ? snap.optJSONArray("q") : null;
            JSONArray lib = scr == S_LIB ? PlaybackService.library(act) : null;
            int curRow = scr == S_QUEUE && snap != null ? snap.optInt("qi", -1) - snap.optInt("qs", 0) : -1;
            if (scr == S_QUEUE && (q == null || q.length() == 0)) { text(c, "Nothing in the queue", w / 2, bar + dp(60), dp(15), 0x99FFFFFF, false, Paint.Align.CENTER, w - dp(20)); return; }

            for (int i = 0; i < vis && t + i < n; i++) {
                int idx = t + i;
                float y0 = bar + i * rowH;
                boolean on = idx == s;
                if (on) { p.setColor(accent); c.drawRect(0, y0, w, y0 + rowH, p); }
                int fg = on ? onAccent(accent) : 0xFFFFFFFF;
                int dim = on ? onAccent(accent) : 0x99FFFFFF;
                String main = "", sub = "", val = "";
                boolean chevron = false;
                switch (scr) {
                    case S_MENU: main = MENU[idx]; chevron = idx != 5; break;
                    case S_QUEUE: {
                        JSONObject o = q.optJSONObject(idx);
                        main = o == null ? "" : o.optString("t");
                        sub = o == null ? "" : o.optString("a");
                        if (idx == curRow) val = "♪";
                        break;
                    }
                    case S_LIB:
                        if (lib.length() == 0) { main = "Open EBBLESS to load your library"; }
                        else { JSONObject o = lib.optJSONObject(idx); main = o == null ? "" : o.optString("name"); }
                        break;
                    case S_SET:
                        if (idx == 0) { main = "Soft sounds and vibration"; val = soft() ? "On" : "Off"; }
                        else if (idx == 1) { main = "Volume"; val = vol() + "/" + volMax(); }
                        else if (idx == 2) { main = "Visual mode"; val = "iPod"; }
                        else if (idx == 3) { main = "Exit iPod"; chevron = true; }
                        else { main = "Open EBBLESS"; chevron = true; }
                        break;
                    case S_GAMES: main = GAMES[idx]; chevron = true; break;
                    default: break;
                }
                float right = w - dp(12);
                if (chevron) { text(c, "›", right, y0 + rowH / 2 + dp(6), dp(20), dim, true, Paint.Align.RIGHT, 0); right -= dp(14); }
                if (!val.isEmpty()) { text(c, val, right, y0 + rowH / 2 + dp(5), dp(14), on ? fg : accent, true, Paint.Align.RIGHT, 0); right -= dp(10) + tp.measureText(val); }
                float maxW = right - dp(12);
                if (sub.isEmpty()) {
                    text(c, main, dp(12), y0 + rowH / 2 + dp(5.5f), dp(16), fg, false, Paint.Align.LEFT, maxW);
                } else {
                    text(c, main, dp(12), y0 + rowH / 2 - dp(2), dp(14.5f), fg, true, Paint.Align.LEFT, maxW);
                    text(c, sub, dp(12), y0 + rowH / 2 + dp(12), dp(12), dim, false, Paint.Align.LEFT, maxW);
                }
            }
            // scroll bar
            if (n > vis) {
                float th = Math.max(dp(18), (h - bar) * vis / n);
                float ty = bar + (h - bar - th) * (t / (float) (n - vis));
                p.setColor(0x55FFFFFF);
                r.set(w - dp(3), ty, w - dp(1), ty + th);
                c.drawRoundRect(r, dp(1), dp(1), p);
            }
        }

        private void drawNow(Canvas c, float w, float h, float bar) {
            float pad = dp(12);
            float top = bar + pad;
            float bottomArea = dp(44);   // progress bar + times
            float avail = h - top - bottomArea;
            float side = Math.max(dp(60), Math.min(avail, w * 0.46f));
            r.set(pad, top, pad + side, top + side);
            if (art != null) {
                c.save();
                android.graphics.Path clip = new android.graphics.Path();
                clip.addRoundRect(r, dp(8), dp(8), android.graphics.Path.Direction.CW);
                c.clipPath(clip);
                float bw = art.getWidth(), bh = art.getHeight(), sc = Math.max(side / bw, side / bh);
                float dw = bw * sc, dh = bh * sc;
                c.drawBitmap(art, null, new RectF(r.left + (side - dw) / 2, r.top + (side - dh) / 2, r.left + (side + dw) / 2, r.top + (side + dh) / 2), null);
                c.restore();
            } else {
                p.setColor(0xFF26262B);
                c.drawRoundRect(r, dp(8), dp(8), p);
                if (logo != null) {
                    float lw = side * 0.5f, lh = lw * logo.getHeight() / logo.getWidth();
                    c.drawBitmap(logo, null, new RectF(r.centerX() - lw / 2, r.centerY() - lh / 2, r.centerX() + lw / 2, r.centerY() + lh / 2), null);
                }
            }
            float tx = pad + side + dp(12), tw = w - tx - pad;
            if (tw > dp(40)) {
                text(c, title.isEmpty() ? "Nothing playing" : title, tx, top + dp(20), dp(17), 0xFFFFFFFF, true, Paint.Align.LEFT, tw);
                text(c, artist, tx, top + dp(42), dp(14), 0xCCFFFFFF, false, Paint.Align.LEFT, tw);
                text(c, album, tx, top + dp(62), dp(12.5f), 0x88FFFFFF, false, Paint.Align.LEFT, tw);
                text(c, liked ? "♥" : "♡", tx, top + dp(96), dp(24), liked ? accent : 0x88FFFFFF, false, Paint.Align.LEFT, 0);
            }
            // progress
            long pos = positionMs();
            float by = h - dp(26), bx0 = pad, bx1 = w - pad;
            p.setColor(0x33FFFFFF);
            r.set(bx0, by - dp(3), bx1, by + dp(3));
            c.drawRoundRect(r, dp(3), dp(3), p);
            if (durMs > 0) {
                p.setColor(accent);
                r.set(bx0, by - dp(3), bx0 + (bx1 - bx0) * Math.min(1f, pos / (float) durMs), by + dp(3));
                c.drawRoundRect(r, dp(3), dp(3), p);
            }
            text(c, fmt(pos), bx0, h - dp(7), dp(12), 0xCCFFFFFF, false, Paint.Align.LEFT, 0);
            text(c, durMs > 0 ? "-" + fmt(Math.max(0, durMs - pos)) : "", bx1, h - dp(7), dp(12), 0xCCFFFFFF, false, Paint.Align.RIGHT, 0);
        }

        private void drawVolume(Canvas c, float w, float h) {
            float bw = w * 0.72f, bh = dp(34), x0 = (w - bw) / 2, y0 = h - bh - dp(14);
            p.setColor(0xF0151517);
            r.set(x0, y0, x0 + bw, y0 + bh);
            c.drawRoundRect(r, dp(17), dp(17), p);
            int v = vol(), m = volMax();
            float tx0 = x0 + dp(40), tx1 = x0 + bw - dp(14), ty = y0 + bh / 2;
            p.setColor(0x33FFFFFF);
            r.set(tx0, ty - dp(3), tx1, ty + dp(3));
            c.drawRoundRect(r, dp(3), dp(3), p);
            p.setColor(accent);
            r.set(tx0, ty - dp(3), tx0 + (tx1 - tx0) * v / (float) m, ty + dp(3));
            c.drawRoundRect(r, dp(3), dp(3), p);
            text(c, "♫", x0 + dp(16), ty + dp(6), dp(18), accent, false, Paint.Align.CENTER, 0);
        }
    }
}
