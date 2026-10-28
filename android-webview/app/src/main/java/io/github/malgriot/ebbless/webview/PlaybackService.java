package io.github.malgriot.ebbless.webview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Keeps the process (and the WebView's audio) alive with the screen off. A
 * foreground service of type mediaPlayback plus a partial wake lock so page
 * timers keep running. Started by MainActivity, stopped with the app.
 *
 * It also owns the lock screen / notification shade player. A WebView has no media notification of its own, so the page
 * (index.html, which already keeps navigator.mediaSession up to date) mirrors its title, artist, art, play state, position
 * and liked state into media(); this service shows them through a MediaSession with previous / play-pause / next / heart,
 * and sends button presses back to the page through sink.
 */
public class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private static final String ACT = "io.github.malgriot.ebbless.MEDIA_";   // + play / pause / prev / next / like

    /** Where lock screen and notification button presses go (the page). MainActivity sets it while it is alive. */
    interface Sink { void send(String action); }
    static volatile Sink sink;

    private static volatile PlaybackService live;
    private static volatile JSONObject latest;   // the page's last report: {t, a, al, art, pl, pos, dur, rate, liked}
    private static volatile long latestAt;       // SystemClock.elapsedRealtime() when latest arrived (the player extrapolates the position from it)

    /** The full-screen player (#691) listens here so it follows the same reports as the lock screen player. */
    interface StateListener { void onState(); }
    static volatile StateListener stateListener;

    static JSONObject snapshot() { return latest; }
    static long snapshotAt() { return latestAt; }
    /** Send a player button press (play / pause / prev / next / like / seekto:SECONDS) to the page, same path as the notification buttons. */
    static void control(String action) { Sink s = sink; if (s != null) s.send(action); }
    static boolean isLive() { return live != null; }
    /** The cover for the song now playing (null until fetched). */
    static Bitmap currentArt() { PlaybackService s = live; return s == null ? null : s.art; }
    /** The cover this service already fetched for url, or null. */
    static Bitmap artFor(String url) { PlaybackService s = live; return s != null && url.equals(s.artUrl) ? s.art : null; }

    /** Widget progress redraws only run while the screen is on: off cancels them, on re-anchors the line and restarts them. */
    private final android.content.BroadcastReceiver widgetScreen = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context c, Intent i) {
            if (i == null) return;
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) EbblessWidget.stopTicks();
            else EbblessWidget.refresh(PlaybackService.this, true);
        }
    };

    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaSession session;
    private String artUrl = "";
    private Bitmap art;

    /** Called from the page (a JS bridge thread) with the current player state as JSON. */
    static void media(String json) {
        try { latest = new JSONObject(json); latestAt = SystemClock.elapsedRealtime(); } catch (Exception e) { return; }
        StateListener l = stateListener;
        if (l != null) l.onState();
        final PlaybackService s = live;
        if (s != null) s.handler.post(s::render);
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW));
        }
        Notification n = plainNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1, n);
        }
        PowerManager pm = getSystemService(PowerManager.class);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ebbless:playback");
        wakeLock.acquire(8 * 60 * 60 * 1000L);

        try {
            session = new MediaSession(this, "EBBLESS");
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { dispatch("play"); }
                @Override public void onPause() { dispatch("pause"); }
                @Override public void onStop() { dispatch("pause"); }
                @Override public void onSkipToNext() { dispatch("next"); }
                @Override public void onSkipToPrevious() { dispatch("prev"); }
                @Override public void onSeekTo(long posMs) { dispatch("seekto:" + (posMs / 1000.0)); }
                @Override public void onCustomAction(String action, android.os.Bundle extras) { if ("like".equals(action)) dispatch("like"); else if ("visual".equals(action)) openVisualPlayer(); }
            }, handler);
        } catch (Throwable t) {
            session = null;   // never let the player widget stop the music
        }
        live = this;
        try {
            android.content.IntentFilter sf = new android.content.IntentFilter(Intent.ACTION_SCREEN_OFF);
            sf.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(widgetScreen, sf, android.content.Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(widgetScreen, sf);
        } catch (Throwable ignored) {}
        if (latest != null) handler.post(this::render);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // The system restarted this service after the process was killed (low memory). The page is gone, so nothing is playing.
            // If music was playing when it died, leave a notification that picks the queue back up; either way stop claiming to play.
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
            EbblessWidget.refresh(this, true);
            SharedPreferences prefs = getSharedPreferences("ebb", MODE_PRIVATE);
            if (prefs.getBoolean("playing", false)) {
                prefs.edit().putBoolean("playing", false).apply();
                postRecoveryNotice();
            }
            stopSelf();
            return START_NOT_STICKY;
        }
        String a = intent.getAction();
        if (a != null && a.startsWith(ACT)) dispatch(a.substring(ACT.length()));   // a notification button
        return START_STICKY;
    }

    private void dispatch(String action) {
        Sink s = sink;
        if (s != null) s.send(action);
    }

    /** The foreground notification when nothing is loaded in the player. */
    private Notification plainNotification() {
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_ebbless)
                .setContentTitle("EBBLESS")
                .setContentText("Playing in the background")
                .setContentIntent(openApp())
                .setOngoing(true);
        return b.build();
    }

    private PendingIntent openApp() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
    }

    private Intent visualIntent() {
        return new Intent(this, FullScreenPlayerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    /**
     * The "visual" session custom action (Android 13+ media controls, lock screen widget): open the full-screen player, or close it if it is
     * already up. Android 10+ blocks an app that is not on screen from starting an activity, and a MediaSession callback is not an exemption,
     * so besides a plain startActivity (works whenever the app is visible) this posts a high-priority notification with a full-screen intent,
     * which the system launches itself when the phone is locked or the screen is off, and shows as a tap-to-open heads-up otherwise.
     */
    private void openVisualPlayer() {
        FullScreenPlayerActivity open = FullScreenPlayerActivity.live;
        if (open != null) { open.finish(); return; }
        Intent i = visualIntent();
        PendingIntent pi = PendingIntent.getActivity(this, 21, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel("visual", "Visual player", NotificationManager.IMPORTANCE_HIGH);
                ch.setSound(null, null); ch.enableVibration(false); ch.setShowBadge(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            nm.notify(FullScreenPlayerActivity.NOTIF_ID, new Notification.Builder(this, "visual")
                    .setSmallIcon(R.drawable.ic_stat_ebbless)
                    .setContentTitle("EBBLESS visual player")
                    .setContentText("Tap to open")
                    .setContentIntent(pi)
                    .setFullScreenIntent(pi, true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(8000)
                    .build());
        } catch (Exception ignored) {}
        try { startActivity(i); } catch (Exception ignored) {}
    }

    /** The notification's own "visual" button: a direct activity PendingIntent (a user tap, so allowed from the background). On the lock screen it must not ask to unlock first. */
    private Notification.Action visualButton() {
        Intent i = visualIntent().putExtra(FullScreenPlayerActivity.EXTRA_TOGGLE, true);
        PendingIntent pi = PendingIntent.getActivity(this, 20, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Action.Builder ab = new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_media_visual), "Visual mode", pi);
        if (Build.VERSION.SDK_INT >= 31) ab.setAuthenticationRequired(false);
        return ab.build();
    }

    private Notification.Action button(int code, String name, int icon, String label) {
        Intent i = new Intent(this, PlaybackService.class).setAction(ACT + name);
        PendingIntent pi = PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build();
    }

    /** Push the page's latest state into the session (lock screen, headset buttons, Android 13+ media controls) and the notification. */
    private void render() {
        if (live != this) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        JSONObject j = latest;
        String title = j == null ? "" : j.optString("t");
        if (session == null || title.isEmpty()) {
            if (session != null) session.setActive(false);
            nm.notify(1, plainNotification());
            EbblessWidget.refresh(this, false);
            return;
        }
        boolean playing = j.optBoolean("pl");
        boolean liked = j.optBoolean("liked");
        long dur = Math.max(0, j.optLong("dur"));
        long pos = Math.max(0, j.optLong("pos"));
        float rate = (float) j.optDouble("rate", 1.0);
        String want = j.optString("art");
        if (!want.equals(artUrl)) { artUrl = want; art = null; loadArt(want); }

        MediaMetadata.Builder mb = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, j.optString("a"))
                .putString(MediaMetadata.METADATA_KEY_ALBUM, j.optString("al"));
        if (dur > 0) mb.putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        if (art != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(mb.build());

        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        if (dur > 0) actions |= PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .addCustomAction(new PlaybackState.CustomAction.Builder("like",
                        liked ? "Remove from Liked Songs" : "Add to Liked Songs",
                        liked ? R.drawable.ic_media_heart_filled : R.drawable.ic_media_heart).build())
                .addCustomAction(new PlaybackState.CustomAction.Builder("visual", "Visual mode", R.drawable.ic_media_visual).build())
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? rate : 0f, SystemClock.elapsedRealtime())
                .build());
        session.setActive(true);

        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_ebbless)
                .setContentTitle(title)
                .setContentText(j.optString("a"))
                .setContentIntent(openApp())
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .addAction(button(13, "like", liked ? R.drawable.ic_media_heart_filled : R.drawable.ic_media_heart, liked ? "Remove from Liked Songs" : "Add to Liked Songs"))
                .addAction(button(10, "prev", R.drawable.ic_media_prev, "Previous"))
                .addAction(playing ? button(11, "pause", R.drawable.ic_media_pause, "Pause") : button(11, "play", R.drawable.ic_media_play, "Play"))
                .addAction(button(12, "next", R.drawable.ic_media_next, "Next"))
                .addAction(visualButton())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(1, 2, 3));
        if (art != null) b.setLargeIcon(art);
        nm.notify(1, b.build());
        EbblessWidget.refresh(this, false);   // home screen widget (#688)
    }

    /** Fetch the cover for the notification and lock screen (scaled to about 300-600 px, so it stays around a megabyte). */
    private void loadArt(final String url) {
        if (!url.startsWith("https://")) return;
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
                        if (total > 3_000_000) return;
                        bo.write(buf, 0, n);
                    }
                    data = bo.toByteArray();
                } finally { c.disconnect(); }
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(data, 0, data.length, o);
                int s = 1;
                while (o.outWidth / (s * 2) >= 300 && o.outHeight / (s * 2) >= 300) s *= 2;
                BitmapFactory.Options d = new BitmapFactory.Options();
                d.inSampleSize = s;
                final Bitmap bm = BitmapFactory.decodeByteArray(data, 0, data.length, d);
                if (bm == null) return;
                handler.post(() -> {
                    if (url.equals(artUrl)) { art = bm; render(); }   // ignore a cover for a song that is already over
                });
            } catch (Exception ignored) {
            }
        }, "ebb-art").start();
    }

    private void postRecoveryNotice() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("recovery", "Playback interrupted", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(this, MainActivity.class).putExtra("recovered", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, "recovery")
                .setSmallIcon(R.drawable.ic_stat_ebbless)
                .setContentTitle("EBBLESS was stopped")
                .setContentText("Your phone needed the memory. Tap to pick up where you left off.")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(2, n);
    }

    @Override public void onDestroy() {
        live = null;
        try { unregisterReceiver(widgetScreen); } catch (Exception ignored) {}
        EbblessWidget.stopTicks();
        EbblessWidget.refresh(this, true);   // widget falls back to Last played + Resume
        if (session != null) { try { session.release(); } catch (Exception ignored) {} session = null; }
        art = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    /** The user swiped the app away: stop the music and every notification, then end the process so nothing keeps running. */
    @Override public void onTaskRemoved(Intent rootIntent) {
        getSharedPreferences("ebb", MODE_PRIVATE).edit().putBoolean("playing", false).apply();   // a quit is not a crash, no recovery notice
        stopService(new Intent(this, WatchdogService.class));
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        getSystemService(android.app.NotificationManager.class).cancelAll();
        stopSelf();
        handler.postDelayed(() -> android.os.Process.killProcess(android.os.Process.myPid()), 400);   // the WebView lives in this process
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
