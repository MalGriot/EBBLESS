package io.github.malgriot.ebbless.webview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Self-updater for the sideloaded app (there is no store to do it). On launch it reads the version off the
 * `android` release's title, and when that is newer it downloads ebbless.apk and hands it to PackageInstaller
 * asking for no confirmation screen. Android only honors that for an app that installed the package itself
 * (Android 12+), so the first update may still show the system's Install button; after that this app is the
 * installer and later updates go through quietly. When Android does want a tap, the confirm screen is shown
 * straight away if the app is on screen, else a notification carries it.
 */
final class Updater {
    static final String ACTION = "io.github.malgriot.ebbless.UPDATE_STATUS";
    private static final String RELEASE_API = "https://api.github.com/repos/MalGriot/EBBLESS/releases/tags/android";
    private static final String APK_URL = "https://github.com/MalGriot/EBBLESS/releases/download/android/ebbless.apk";
    private static final long CHECK_EVERY_MS = 60 * 60 * 1000;
    private static final String CHANNEL = "ebbless_update";
    static volatile boolean foreground;
    private static volatile boolean running;

    private Updater() {}

    /** Call once the app is up. Does its work on a background thread and never throws. */
    static void check(final Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (app.getPackageName().endsWith(".debug") || running) return;
        final SharedPreferences sp = app.getSharedPreferences("ebb", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - sp.getLong("updCheckAt", 0) < CHECK_EVERY_MS) return;
        sp.edit().putLong("updCheckAt", now).apply();
        running = true;
        new Thread(() -> {
            try {
                String latest = latestVersion();
                String mine = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
                if (latest != null && newer(latest, mine)) {
                    File apk = download(app);
                    toast(app, "Updating EBBLESS to " + latest);
                    install(app, apk);
                } else {
                    running = false;
                }
            } catch (Throwable t) {
                running = false;
            }
        }, "ebb-updater").start();
    }

    private static String latestVersion() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(RELEASE_API).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(10000);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        try {
            if (c.getResponseCode() != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
            }
            Matcher m = Pattern.compile("(\\d+(?:\\.\\d+)+)").matcher(new JSONObject(sb.toString()).optString("name"));
            return m.find() ? m.group(1) : null;
        } finally { c.disconnect(); }
    }

    static boolean newer(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? Integer.parseInt(x[i]) : 0, q = i < y.length ? Integer.parseInt(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static File download(Context app) throws Exception {
        File out = new File(app.getCacheDir(), "update.apk");
        HttpURLConnection c = (HttpURLConnection) new URL(APK_URL).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000);
        try {
            if (c.getResponseCode() != 200) throw new Exception("http " + c.getResponseCode());
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
        } finally { c.disconnect(); }
        return out;
    }

    private static void install(Context app, File apk) throws Exception {
        PackageInstaller pi = app.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        p.setAppPackageName(app.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (OutputStream os = s.openWrite("ebbless.apk", 0, apk.length()); InputStream in = new java.io.FileInputStream(apk)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                s.fsync(os);
            }
            Intent cb = new Intent(app, UpdateReceiver.class).setAction(ACTION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(app, id, cb, flags).getIntentSender());
        }
    }

    /** Android wants a tap (first update, or an install-from-this-app permission): show it now or leave a notification. */
    static void needsUser(Context app, Intent confirm) {
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (foreground) {
            try { app.startActivity(confirm); return; } catch (Throwable ignored) {}
        }
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent pi = PendingIntent.getActivity(app, 0, confirm, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(app, CHANNEL) : new Notification.Builder(app);
        nm.notify(7001, b.setSmallIcon(R.drawable.ic_stat_ebbless).setContentTitle("EBBLESS update ready")
            .setContentText("Tap to install").setContentIntent(pi).setAutoCancel(true).build());
    }

    static void done(Context app) {
        running = false;
        //noinspection ResultOfMethodCallIgnored
        new File(app.getCacheDir(), "update.apk").delete();
    }

    private static void toast(final Context app, final String msg) {
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(app, msg, Toast.LENGTH_LONG).show());
    }
}
