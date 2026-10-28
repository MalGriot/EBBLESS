package io.github.malgriot.ebbless.webview;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * #688: the 4x2 home screen widget. Reads the same live state as the lock screen player (PlaybackService.snapshot) and sends its
 * buttons back through PlaybackService.control. RemoteViews cannot animate, so it is redrawn only when the track, play state,
 * like or cover changes, plus a slow progress refresh (every 30 s) while music is playing and the screen is on.
 * With nothing loaded it shows the last song (kept in SharedPreferences "ebb") and a Resume button.
 */
public class EbblessWidget extends AppWidgetProvider {
    static final String ACT_CONTROL = "io.github.malgriot.ebbless.WIDGET_CONTROL";
    private static final int FALLBACK_ACCENT = 0xFFAFA9EC;
    private static final long TICK_MS = 6_000;

    private static final Handler H = new Handler(Looper.getMainLooper());
    private static String lastSig = "";
    private static long lastAt;
    private static Bitmap accentSource;   // the cover the cached accent was computed from
    private static int accent = FALLBACK_ACCENT;

    private static final Runnable TICK = new Runnable() {
        @Override public void run() {
            Context c = appCtx;
            if (c == null) return;
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) return;   // screen off: stop ticking, the next state change or screen-on restarts it
            refresh(c, true);
        }
    };
    private static Context appCtx;
    private static final int[] SEEK_IDS = {R.id.w_seek_0, R.id.w_seek_1, R.id.w_seek_2, R.id.w_seek_3, R.id.w_seek_4, R.id.w_seek_5, R.id.w_seek_6,
            R.id.w_seek_7, R.id.w_seek_8, R.id.w_seek_9, R.id.w_seek_10, R.id.w_seek_11, R.id.w_seek_12, R.id.w_seek_13, R.id.w_seek_14,
            R.id.w_seek_15, R.id.w_seek_16, R.id.w_seek_17, R.id.w_seek_18, R.id.w_seek_19};
    private static Bitmap roundedFor, roundedOut;   // the rounded cover is rebuilt only when the cover changes (the line redraws every few seconds)

    /** Stop the progress redraws (screen off, pause, service gone). */
    static void stopTicks() { H.removeCallbacks(TICK); }

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { refresh(c, true); }

    @Override public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (i == null || !ACT_CONTROL.equals(i.getAction())) return;
        String a = i.getStringExtra("a");
        if (a == null) return;
        if (PlaybackService.sink == null) {
            // The widget was stale: the app is not running. Try to open it with the tapped action queued (Android 10+ usually refuses a
            // background start from a receiver, so that can fail), then redraw as idle so every element now opens the app on the next tap.
            try {
                c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("widgetAction", a));
            } catch (Throwable ignored) {}
            refresh(c, true);
            return;
        }
        PlaybackService.control(a);
    }

    private static boolean hasWidgets(Context c) {
        try {
            int[] ids = AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, EbblessWidget.class));
            return ids != null && ids.length > 0;
        } catch (Exception e) { return false; }
    }

    /** Redraw if something visible changed (or force). Cheap no-op when no widget is placed. Call on the main thread. */
    static void refresh(Context c, boolean force) {
        try {
            c = c.getApplicationContext();
            appCtx = c;
            if (!hasWidgets(c)) return;
            boolean appLive = PlaybackService.isLive() && PlaybackService.sink != null;   // no page to talk to = treat the widget as closed
            JSONObject j = appLive ? PlaybackService.snapshot() : null;
            String title = j == null ? "" : j.optString("t");
            boolean active = !title.isEmpty();
            SharedPreferences sp = c.getSharedPreferences("ebb", Context.MODE_PRIVATE);
            Bitmap art = active ? PlaybackService.currentArt() : null;
            if (art != null && art != accentSource) { accentSource = art; accent = accentOf(art); }
            else if (art == null && active && accentSource == null) accent = sp.getInt("widgetAccent", FALLBACK_ACCENT);
            else if (!active) accent = sp.getInt("widgetAccent", FALLBACK_ACCENT);

            boolean playing = active && j.optBoolean("pl");
            boolean liked = active && j.optBoolean("liked");
            String artist = active ? j.optString("a") : "";
            String sig = active ? title + "|" + artist + "|" + playing + "|" + liked + "|" + (art != null) + "|" + accent : "idle|" + sp.getString("widgetTitle", "") + "|" + accent;
            long now = SystemClock.elapsedRealtime();
            boolean sameLook = sig.equals(lastSig);
            if (!force && sameLook && !(playing && now - lastAt >= TICK_MS - 1000)) return;
            lastSig = sig; lastAt = now;

            if (active && (!title.equals(sp.getString("widgetTitle", "")) || accent != sp.getInt("widgetAccent", 0))) {
                sp.edit().putString("widgetTitle", title).putString("widgetArtist", artist).putInt("widgetAccent", accent).apply();
            }

            float d = c.getResources().getDisplayMetrics().density;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_player);
            v.setOnClickPendingIntent(R.id.w_root, openApp(c, false));
            if (active) {
                v.setViewVisibility(R.id.w_playing, android.view.View.VISIBLE);
                v.setViewVisibility(R.id.w_idle, android.view.View.GONE);
                v.setTextViewText(R.id.w_title, title);
                v.setTextViewText(R.id.w_artist, artist);
                if (art != null && art != roundedFor) { roundedFor = art; roundedOut = rounded(art, Math.round(84 * d), Math.round(12 * d)); }
                v.setImageViewBitmap(R.id.w_art, art != null ? roundedOut : mark(c, accent, Math.round(84 * d), Math.round(12 * d)));
                v.setImageViewResource(R.id.w_like_icon, liked ? R.drawable.ic_media_heart_filled : R.drawable.ic_media_heart);
                v.setInt(R.id.w_like_icon, "setColorFilter", liked ? accent : Color.WHITE);
                v.setImageViewResource(R.id.w_play_icon, playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play);
                v.setInt(R.id.w_play_icon, "setColorFilter", 0xFF1B1B1F);
                v.setInt(R.id.w_play_bg, "setColorFilter", accent);
                long dur = Math.max(0, j.optLong("dur"));
                long pos = Math.max(0, j.optLong("pos"));
                if (playing) pos += (long) ((SystemClock.elapsedRealtime() - PlaybackService.snapshotAt()) * j.optDouble("rate", 1.0));
                if (dur > 0) pos = Math.min(pos, dur);
                v.setImageViewBitmap(R.id.w_progress, progressBar(dur, pos));
                // the system ticks the elapsed time itself while it is started: base = now - position, so no wakeups from us
                v.setChronometer(R.id.w_elapsed, SystemClock.elapsedRealtime() - pos, null, playing);
                v.setTextViewText(R.id.w_dur, dur > 0 ? clock(dur) : "");
                v.setViewVisibility(R.id.w_seek_zones, dur > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
                if (dur > 0) {
                    for (int z = 0; z < SEEK_IDS.length; z++) {
                        double secs = dur * (z + 0.5) / SEEK_IDS.length / 1000.0;
                        v.setOnClickPendingIntent(SEEK_IDS[z], control(c, "seekto:" + secs, 10 + z));
                    }
                }
                v.setOnClickPendingIntent(R.id.w_like, control(c, "like", 1));
                v.setOnClickPendingIntent(R.id.w_prev, control(c, "prev", 2));
                v.setOnClickPendingIntent(R.id.w_play, control(c, playing ? "pause" : "play", 3));
                v.setOnClickPendingIntent(R.id.w_next, control(c, "next", 4));
            } else {
                String last = sp.getString("widgetTitle", "");
                v.setViewVisibility(R.id.w_playing, android.view.View.GONE);
                v.setViewVisibility(R.id.w_idle, android.view.View.VISIBLE);
                v.setTextViewText(R.id.w_idle_label, last.isEmpty() ? "Ready when you are" : "Last played");
                v.setTextViewText(R.id.w_idle_title, last.isEmpty() ? "EBBLESS" : last);
                v.setImageViewBitmap(R.id.w_idle_art, mark(c, accent, Math.round(84 * d), Math.round(12 * d)));
                v.setInt(R.id.w_resume_bg, "setColorFilter", accent);
                v.setOnClickPendingIntent(R.id.w_resume, openApp(c, true));
            }
            AppWidgetManager.getInstance(c).updateAppWidget(new ComponentName(c, EbblessWidget.class), v);

            H.removeCallbacks(TICK);
            if (playing) H.postDelayed(TICK, TICK_MS);   // only while playing; TICK itself stops when the screen is off
        } catch (Throwable ignored) {
            // a widget glitch must never take playback down
        }
    }

    private static PendingIntent control(Context c, String action, int code) {
        Intent i = new Intent(c, EbblessWidget.class).setAction(ACT_CONTROL).putExtra("a", action);
        return PendingIntent.getBroadcast(c, 100 + code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Opens the app. resume = also start the last song once the page is up (MainActivity "widgetResume" extra). */
    private static PendingIntent openApp(Context c, boolean resume) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (resume) i.putExtra("widgetResume", true);
        return PendingIntent.getActivity(c, resume ? 111 : 110, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Position line as a bitmap (RemoteViews cannot tint a ProgressBar safely on every version): grey track, accent fill. */
    private static String clock(long ms) {
        long s = ms / 1000, h = s / 3600, m = (s / 60) % 60, sec = s % 60;
        return h > 0 ? String.format(java.util.Locale.US, "%d:%02d:%02d", h, m, sec) : String.format(java.util.Locale.US, "%d:%02d", m, sec);
    }

    private static Bitmap progressBar(long dur, long pos) {
        float f = dur > 0 ? Math.max(0f, Math.min(1f, pos / (float) dur)) : 0f;
        int w = 400, h = 6;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0x33FFFFFF);
        cv.drawRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, p);
        if (f > 0) {
            p.setColor(accent);
            cv.drawRoundRect(new RectF(0, 0, Math.max(h, w * f), h), h / 2f, h / 2f, p);
        }
        return b;
    }

    /** The cover, center-cropped to a square with rounded corners. */
    private static Bitmap rounded(Bitmap src, int size, int radius) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        cv.drawRoundRect(new RectF(0, 0, size, size), radius, radius, p);
        p.setXfermode(new android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN));
        int s = Math.min(src.getWidth(), src.getHeight());
        android.graphics.Rect from = new android.graphics.Rect((src.getWidth() - s) / 2, (src.getHeight() - s) / 2, (src.getWidth() + s) / 2, (src.getHeight() + s) / 2);
        cv.drawBitmap(src, from, new RectF(0, 0, size, size), p);
        return out;
    }

    /** The EBBLESS E on a square of the accent color (idle state, or a song with no cover yet). */
    private static Bitmap mark(Context c, int color, int size, int radius) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        p.setColor(color);
        cv.drawRoundRect(new RectF(0, 0, size, size), radius, radius, p);
        Bitmap m = BitmapFactory.decodeResource(c.getResources(), R.drawable.mark_white);
        if (m != null) {
            float mw = size * 0.5f, mh = mw * m.getHeight() / m.getWidth();
            cv.drawBitmap(m, null, new RectF((size - mw) / 2f, (size - mh) / 2f, (size + mw) / 2f, (size + mh) / 2f), p);
        }
        return out;
    }

    /** A strong, readable accent from the cover: average of a 16x16 copy, weighted toward saturated pixels, then lifted to a bright value. */
    private static int accentOf(Bitmap art) {
        try {
            Bitmap s = Bitmap.createScaledBitmap(art, 16, 16, true);
            double r = 0, g = 0, b = 0, wsum = 0;
            for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
                int px = s.getPixel(x, y);
                float[] hsv = new float[3];
                Color.colorToHSV(px, hsv);
                double w = 0.05 + hsv[1] * hsv[2];
                r += Color.red(px) * w; g += Color.green(px) * w; b += Color.blue(px) * w; wsum += w;
            }
            if (wsum <= 0) return FALLBACK_ACCENT;
            float[] hsv = new float[3];
            Color.colorToHSV(Color.rgb((int) (r / wsum), (int) (g / wsum), (int) (b / wsum)), hsv);
            if (hsv[1] < 0.12f) return FALLBACK_ACCENT;   // grey cover: keep the brand purple
            hsv[1] = Math.min(1f, Math.max(hsv[1], 0.35f));
            hsv[2] = Math.max(hsv[2], 0.8f);
            return Color.HSVToColor(hsv);
        } catch (Exception e) {
            return FALLBACK_ACCENT;
        }
    }
}
