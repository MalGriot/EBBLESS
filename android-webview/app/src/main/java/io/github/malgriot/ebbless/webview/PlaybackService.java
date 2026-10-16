package io.github.malgriot.ebbless.webview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.content.SharedPreferences;

/**
 * Keeps the process (and the WebView's audio) alive with the screen off. A
 * foreground service of type mediaPlayback plus a partial wake lock so page
 * timers keep running. Started by MainActivity, stopped with the app.
 */
public class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("EBBLESS")
                .setContentText("Playing in the background")
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1, n);
        }
        PowerManager pm = getSystemService(PowerManager.class);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ebbless:playback");
        wakeLock.acquire(8 * 60 * 60 * 1000L);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // The system restarted this service after the process was killed (low memory). The page is gone, so nothing is playing.
            // If music was playing when it died, leave a notification that picks the queue back up; either way stop claiming to play.
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
            SharedPreferences prefs = getSharedPreferences("ebb", MODE_PRIVATE);
            if (prefs.getBoolean("playing", false)) {
                prefs.edit().putBoolean("playing", false).apply();
                postRecoveryNotice();
            }
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    private void postRecoveryNotice() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("recovery", "Playback interrupted", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(this, MainActivity.class).putExtra("recovered", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, "recovery")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("EBBLESS was stopped")
                .setContentText("Your phone needed the memory. Tap to pick up where you left off.")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(2, n);
    }

    @Override public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
