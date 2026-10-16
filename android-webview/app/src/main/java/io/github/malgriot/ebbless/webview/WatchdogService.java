package io.github.malgriot.ebbless.webview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;

/**
 * A tiny service in its own process (":watchdog"). The main process (WebView, about 500 MB) is what the low-memory killer
 * takes; this one is a few MB and is a foreground service, so it outlives it. The main process tells it whether music is
 * playing and hands over a binder; when that binder dies (the main process was killed) and music was playing, this posts
 * "EBBLESS was stopped, tap to pick up where you left off" at once, instead of waiting for the system to restart anything.
 */
public class WatchdogService extends Service {
    static final int MSG_HELLO = 1;     // replyTo = a Messenger whose binder dies with the main process
    static final int MSG_PLAYING = 2;   // arg1 = 1 if music is playing
    private static final String QUIET_CHANNEL = "watchdog";
    private static final String RECOVERY_CHANNEL = "recovery";

    private volatile boolean playing;
    private IBinder watched;
    private final IBinder.DeathRecipient onMainDied = () -> {
        boolean was = playing;
        playing = false;
        watched = null;
        if (was) postRecoveryNotice();
    };

    private final Messenger messenger = new Messenger(new Handler(Looper.getMainLooper(), (Message m) -> {
        if (m.what == MSG_HELLO && m.replyTo != null) {
            if (watched != null) { try { watched.unlinkToDeath(onMainDied, 0); } catch (Exception ignored) {} }
            watched = m.replyTo.getBinder();
            try { watched.linkToDeath(onMainDied, 0); } catch (Exception e) { watched = null; }
            // a fresh main process: clear any notice left from the last kill
            getSystemService(NotificationManager.class).cancel(2);
        } else if (m.what == MSG_PLAYING) {
            playing = m.arg1 == 1;
        }
        return true;
    }));

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(QUIET_CHANNEL, "Background safety", NotificationManager.IMPORTANCE_MIN));
        }
        Notification n = new Notification.Builder(this, QUIET_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_ebbless)
                .setContentTitle("EBBLESS")
                .setContentText("Keeping an eye on playback")
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(3, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(3, n);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }

    @Override public IBinder onBind(Intent intent) { return messenger.getBinder(); }

    private void postRecoveryNotice() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(RECOVERY_CHANNEL, "Playback interrupted", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(this, MainActivity.class).putExtra("recovered", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, RECOVERY_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_ebbless)
                .setContentTitle("EBBLESS was stopped")
                .setContentText("Your phone needed the memory. Tap to pick up where you left off.")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(2, n);
    }
}
