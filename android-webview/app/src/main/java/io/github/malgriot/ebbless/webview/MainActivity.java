package io.github.malgriot.ebbless.webview;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Message;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.security.SecureRandom;

/**
 * EBBLESS in its own window: a WebView on the site, so recents shows EBBLESS
 * and not the browser (the TWA could not do that). Google sign-in refuses to
 * run in a WebView, so it happens in the real browser (desktop/signin.html,
 * same page the Mac app uses) and comes back on an ebbless:// link carrying a
 * one-time state this activity handed out.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://malgriot.github.io/EBBLESS/index.html";
    private static final String SIGNIN_URL = "https://malgriot.github.io/EBBLESS/desktop/signin.html";
    private static final long SIGNIN_TTL_MS = 10 * 60 * 1000;

    private WebView web;
    /** Handle of the registered ad-skip document-start script, so a kill-switch flip can remove or re-add it. */
    private androidx.webkit.ScriptHandler adScript;
    /** version:hash of the rules the registered script was built from; a new live pair rebuilds the handler. */
    private String adScriptSig = "";
    /** True once the live page differs from the copy this launch is showing; the page asks (pageUpdated) and offers a Refresh. */
    private volatile boolean pageStale;
    private String pendingState;
    private long pendingAt;

    /** A WebView that never tells the page it was hidden, so audio and timers keep going. */
    private static class KeepAliveWebView extends WebView {
        KeepAliveWebView(Activity a) { super(a); }
        @Override protected void onWindowVisibilityChanged(int visibility) {
            if (visibility != View.GONE) super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    private FrameLayout root;
    private boolean recoveredLaunch;
    private NativeSplash splash;
    private volatile boolean splashHolding;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0 || adbOn());   // inspectable only while the phone's USB debugging is on
        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);
        setContentView(root);
        connectWatchdog();
        recoveredLaunch = getIntent() != null && getIntent().getBooleanExtra("recovered", false);
        registerScreenReceiver();
        if (b == null && !recoveredLaunch) {
            // Cold start: the splash is native, so it is on screen at once and the (slow) web view is built after the first frame.
            String override = getSharedPreferences("ebb", MODE_PRIVATE).getString("accentOverride", "");
            splash = new NativeSplash(this, new NativeSplash.Listener() {
                @Override public void onChoose(boolean tutorial) {
                    Updater.holdForEnter = false;
                    Updater.runPending(MainActivity.this);   // an update that needs a tap installs with this Enter press
                    if (web == null) return;
                    web.evaluateJavascript("window.__ebbNativeChose=true;(function(){var x=document.getElementById('" + (tutorial ? "splashPlayTutorial" : "splashSkipTutorial") + "');if(x)x.click();})()", null);
                }
                @Override public void onRevealed() { root.postDelayed(MainActivity.this::startWebOnce, 400); }
                @Override public void onFinished() { splashDone(); }
            }, override);
            splashHolding = true;
            Updater.holdForEnter = true;
            root.addView(splash, new FrameLayout.LayoutParams(-1, -1));
            root.postDelayed(() -> {   // never trap the user behind a splash whose page never came up (a ready page waits for the visitor as long as it takes)
                if (splash != null && splash.dropIfStuck() && web != null)
                    web.evaluateJavascript("(function(){var s=document.getElementById('splash');if(s)s.classList.add('is-hidden');})()", null);
            }, 25000);
            // building the WebView blocks this thread for a moment: wait until the splash video is up (or 2.5s) before starting it
            root.postDelayed(this::startWebOnce, 2500);
        } else {
            initWeb(b);
        }
    }

    private boolean webStarted;

    private void startWebOnce() {
        if (webStarted || isFinishing()) return;
        webStarted = true;
        initWeb(null);
    }

    /**
     * Screen off: the page hides everything visual so the browser can free its graphics memory (158 MB on a 2.8 GB phone,
     * which is what got the app killed in the long soak). The playback decks keep running. Screen on: everything comes back.
     */
    private final android.content.BroadcastReceiver screenReceiver = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context c, Intent i) {
            if (web == null || i == null) return;
            boolean on = Intent.ACTION_SCREEN_ON.equals(i.getAction());
            web.evaluateJavascript("window.__ebbScreen&&__ebbScreen(" + on + ")", null);
        }
    };

    private boolean adbOn() {
        try { return android.provider.Settings.Global.getInt(getContentResolver(), android.provider.Settings.Global.ADB_ENABLED, 0) == 1; }
        catch (Exception e) { return false; }
    }

    private android.os.Messenger watchdog;
    private boolean lastPlaying;
    private final android.os.Messenger selfMessenger = new android.os.Messenger(new android.os.Handler(android.os.Looper.getMainLooper()));
    private final android.content.ServiceConnection watchdogConn = new android.content.ServiceConnection() {
        @Override public void onServiceConnected(android.content.ComponentName n, IBinder b) {
            watchdog = new android.os.Messenger(b);
            try {
                android.os.Message hello = android.os.Message.obtain(null, WatchdogService.MSG_HELLO);
                hello.replyTo = selfMessenger;   // its binder dies with this process
                watchdog.send(hello);
                tellWatchdog(lastPlaying);
            } catch (Exception ignored) {}
        }
        @Override public void onServiceDisconnected(android.content.ComponentName n) { watchdog = null; }
    };

    /** Start the watchdog (its own process, foreground) and connect to it. */
    private void connectWatchdog() {
        try {
            Intent i = new Intent(this, WatchdogService.class);
            startForegroundService(i);
            bindService(i, watchdogConn, BIND_AUTO_CREATE);
        } catch (Exception ignored) {}
    }

    private void tellWatchdog(boolean playing) {
        lastPlaying = playing;
        if (watchdog == null) return;
        try { watchdog.send(android.os.Message.obtain(null, WatchdogService.MSG_PLAYING, playing ? 1 : 0, 0)); } catch (Exception ignored) {}
    }

    private void registerScreenReceiver() {
        android.content.IntentFilter f = new android.content.IntentFilter(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, f, android.content.Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenReceiver, f);
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) AdBlock.refreshRemote(this, () -> runOnUiThread(() -> syncAdScript())); // hourly at most
        root.postDelayed(() -> Updater.check(this), 15000);   // self-update: looks for a newer app at most once an hour, after the app has settled
        if (web != null) web.evaluateJavascript("window.__ebbScreen&&__ebbScreen(true)", null);   // never leave the page in lightweight mode while it is on screen
    }

    @Override protected void onDestroy() {
        PlaybackService.sink = null;
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    /**
     * OnePlus / OxygenOS (and most other Chinese-OEM Android builds) stop a backgrounded app's audio and kill it, notification and all,
     * unless it is exempt from battery optimization. Ask the first time music plays in a launch: the system's own "Allow EBBLESS to always
     * run in the background?" dialog, one tap. Up to 3 launches in total, so a tap that missed (or a Deny) gets a second chance but is not nagged.
     */
    private boolean batteryAskedThisRun;

    private void askBatteryExemption() {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences("ebb", MODE_PRIVATE);
            int asked = prefs.getInt("batteryAsks", 0);
            if (asked >= 3 || batteryAskedThisRun) return;
            if (getSystemService(android.os.PowerManager.class).isIgnoringBatteryOptimizations(getPackageName())) return;
            batteryAskedThisRun = true;
            prefs.edit().putInt("batteryAsks", asked + 1).apply();
            startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {}
    }

    private long lastReclaimAt;

    /**
     * The phone is short on memory (the low-memory killer took this app after 46 min of screen-off playback, #584): have the page
     * hand back whatever garbage it is holding now rather than on its 4-minute timer. At most once every 20 s.
     */
    @Override public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        long now = android.os.SystemClock.elapsedRealtime();
        if (web == null || level < TRIM_MEMORY_RUNNING_LOW || now - lastReclaimAt < 20000) return;
        lastReclaimAt = now;
        web.evaluateJavascript("window.__ebbReclaim&&__ebbReclaim()", null);
    }

    private void splashDone() {
        splash = null;
        splashHolding = false;
        Updater.holdForEnter = false;
        if (web == null) return;
        // the library's background video loads 6 s later, not now: this is the moment the first song's player starts, and decoding a video
        // on a budget phone at the same time is what made the first seconds of a song skip (#578). The web splash stays cloaked
        // (waking it here showed it fading out under a late-processed Enter); it wakes itself when the visitor returns to it.
        // Changing the user agent here would reload the page (it did, ~1s after every Enter), so the page remembers instead.
        web.evaluateJavascript("(function(){try{sessionStorage.setItem('ebbless:nsplashDone','1');}catch(e){}if(window.__ebbSplashDone)__ebbSplashDone();setTimeout(function(){var v=document.querySelector('video.lib-bg-video');if(v&&!v.getAttribute('src'))v.src=v.getAttribute('data-src').replace('.mp4','-alpha.webm');},6000);})()", null);
    }

    /** Register (or remove, or rebuild) the ad-skip script for the YouTube embed frames to match the on/off state and the current live rules. */
    private void syncAdScript() {
        if (web == null) return;
        try {
            boolean want = AdBlock.enabled(this);
            String sig = AdBlock.scriptSig(this);
            if (adScript != null && (!want || !sig.equals(adScriptSig))) { adScript.remove(); adScript = null; }
            String src = AdBlock.scriptSource(this);
            if (want && src != null && adScript == null
                    && androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) {
                adScript = androidx.webkit.WebViewCompat.addDocumentStartJavaScript(web, src,
                        new java.util.HashSet<>(java.util.Arrays.asList(AdBlock.ORIGINS)));
                adScriptSig = sig;
            }
        } catch (Throwable t) { /* never break playback over ad blocking */ }
    }

    private void initWeb(Bundle b) {
        AdBlock.init(this);   // request rules must be loaded before the first request
        web = new KeepAliveWebView(this);
        web.setBackgroundColor(0xFF000000);
        root.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void ready() {}
            /** The page has wired up its own Enter / Tutorial. */
            @android.webkit.JavascriptInterface public void choiceReady() { runOnUiThread(() -> { if (splash != null) splash.pageReady(); }); }
            /** The beta lock is showing: the splash must not cover it. */
            @android.webkit.JavascriptInterface public void lock() {
                runOnUiThread(() -> {
                    if (splash == null) return;
                    if (web != null) web.evaluateJavascript("(function(){var s=document.getElementById('splash');if(s)s.classList.add('is-hidden');})()", null);
                    splash.dropForLock();
                });
            }
            /** The page's play state, so a restarted service knows whether the music was playing when the process was killed. */
            @android.webkit.JavascriptInterface public void playing(boolean on) {
                getSharedPreferences("ebb", MODE_PRIVATE).edit().putBoolean("playing", on).apply();
                tellWatchdog(on);
                if (on) runOnUiThread(() -> askBatteryExemption());
            }
            /** The page's player state (title, artist, art, play state, position, liked) for the lock screen and notification player. */
            @android.webkit.JavascriptInterface public void media(String json) { PlaybackService.media(json); }
            /** Settings > Reload app: fetch the live page now (the saved copy is a launch behind), then load it. */
            @android.webkit.JavascriptInterface public boolean pageUpdated() { return pageStale; }
            @android.webkit.JavascriptInterface public void reloadFresh() {
                runOnUiThread(() -> refreshPageCopy(() -> { if (web != null) web.loadUrl(HOME, java.util.Collections.singletonMap("Cache-Control", "no-cache")); }));
            }
            /** Ad blocking user switch (default on). Applies to the next page load; the remote kill switch can still force it off. */
            @android.webkit.JavascriptInterface public boolean adblockOn() { return AdBlock.enabled(MainActivity.this); }
            @android.webkit.JavascriptInterface public void setAdblock(boolean on) { AdBlock.setUser(MainActivity.this, on); runOnUiThread(() -> syncAdScript()); }
            /** Settings > Reload now: refetch the live ad rules and script, rebuild the registered script. The page polls adblockStatus() ("state|text"), then reloads. */
            @android.webkit.JavascriptInterface public void adblockRefresh() { AdBlock.reloadNow(MainActivity.this, () -> runOnUiThread(() -> syncAdScript())); }
            @android.webkit.JavascriptInterface public String adblockStatus() { return AdBlock.status; }
            /** JSON {version, source, blocking, killSwitch} for the Settings debug line. */
            @android.webkit.JavascriptInterface public String adblockInfo() { return AdBlock.info(MainActivity.this); }
            /** Settings > Update app: check now, install if newer. The page polls updateStatus() ("state|text"). */
            @android.webkit.JavascriptInterface public void updateNow() { Updater.checkNow(MainActivity.this); }
            @android.webkit.JavascriptInterface public String updateStatus() { return Updater.status; }
            @android.webkit.JavascriptInterface public String appVersion() {
                try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Throwable t) { return ""; }
            }
            @android.webkit.JavascriptInterface public void accentOverride(String css) {
                getSharedPreferences("ebb", MODE_PRIVATE).edit().putString("accentOverride", css == null ? "" : css).apply();
            }
        }, "EbbNative");

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // Drop the "; wv" marker (some embeds treat WebViews as second-class) and say who we are.
        s.setUserAgentString(s.getUserAgentString().replace("; wv)", ")") + " EBBLESS-Android/0.1" + (splashHolding ? " NativeSplash" : "") + (recoveredLaunch ? " Recovered" : ""));
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (AdBlock.enabled(MainActivity.this) && AdBlock.isAd(r.getUrl())) return AdBlock.empty();
                android.webkit.WebResourceResponse bundled = bundledVideo(r);
                if (bundled == null) bundled = cachedPage(r);
                return bundled != null ? bundled : super.shouldInterceptRequest(v, r);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (!r.isForMainFrame()) return false;
                return route(r.getUrl());
            }
        });
        syncAdScript();
        AdBlock.refreshRemote(this, () -> runOnUiThread(() -> syncAdScript()));
        web.setWebChromeClient(new WebChromeClient() {
            // window.open (Google's sign-in popup, outbound links): catch the URL, never show a second window
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message msg) {
                WebView tmp = new WebView(MainActivity.this);
                tmp.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
                        route(r.getUrl()); w.destroy(); return true;
                    }
                    @Override public void onPageStarted(WebView w, String url, android.graphics.Bitmap f) {
                        route(Uri.parse(url)); w.stopLoading(); w.destroy();
                    }
                });
                ((WebView.WebViewTransport) msg.obj).setWebView(tmp);
                msg.sendToTarget();
                return true;
            }
        });

        PlaybackService.sink = action -> runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.__ebbMediaAction&&__ebbMediaAction(" + JSONObject.quote(action) + ")", null);
        });
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        startForegroundService(new Intent(this, PlaybackService.class));

        if (b != null) web.restoreState(b); else web.loadUrl(((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0 ? HOME + "?mal" : HOME), java.util.Collections.singletonMap("Cache-Control", "no-cache")); // Pages caches the page 10 min; always revalidate
        handleIntent(getIntent());
        refreshPageCopy();
    }

    /**
     * Cold start spent ~2s just waiting on the network for index.html. Serve the copy saved on the last launch
     * straight from disk and refresh it in the background, so a page update shows up one launch later.
     */
    private android.webkit.WebResourceResponse cachedPage(WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!r.isForMainFrame() || !"malgriot.github.io".equals(u.getHost()) || !"/EBBLESS/index.html".equals(u.getPath())) return null;
        java.io.File f = new java.io.File(getFilesDir(), "index.html");
        if (!f.isFile() || f.length() < 100000) return null;
        try {
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Cache-Control", "no-cache");
            return new android.webkit.WebResourceResponse("text/html", "UTF-8", 200, "OK", h, new java.io.FileInputStream(f));
        } catch (java.io.IOException e) {
            return null;
        }
    }

    /** Pull the live index.html into filesDir for the next launch (written atomically, only if it looks whole). */
    private void refreshPageCopy() { refreshPageCopy(null); }

    private static byte[] digest(java.io.File f) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        try (java.io.InputStream in = new java.io.FileInputStream(f)) {
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return md.digest();
    }

    private void refreshPageCopy(Runnable done) {
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(HOME).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(15000);
                c.setRequestProperty("Cache-Control", "no-cache");
                if (c.getResponseCode() != 200) return;
                java.io.File tmp = new java.io.File(getFilesDir(), "index.html.tmp");
                try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                java.io.File live = new java.io.File(getFilesDir(), "index.html");
                if (tmp.length() > 100000) {
                    // the copy this launch showed was the saved one; a different live page means an update the user hasn't seen yet
                    if (done == null && live.isFile() && !java.util.Arrays.equals(digest(live), digest(tmp))) pageStale = true;
                    if (done != null) pageStale = false;
                    tmp.renameTo(live);
                } else tmp.delete();
            } catch (Exception ignored) {
            } finally {
                if (done != null) runOnUiThread(done);
            }
        }, "ebb-page-refresh").start();
    }

    /** The splash/library background videos live in the APK so they play at once; serves them with HTTP range support. */
    private android.webkit.WebResourceResponse bundledVideo(WebResourceRequest r) {
        Uri u = r.getUrl();
        String path = u.getPath();
        if (!"malgriot.github.io".equals(u.getHost()) || path == null || !path.startsWith("/EBBLESS/brand/assets/") || !(path.endsWith("-alpha.webm") || path.endsWith("/enter-sound.mp3"))) return null;
        try {
            android.content.res.AssetFileDescriptor fd = getAssets().openFd(path.substring("/EBBLESS/".length()));
            long total = fd.getLength(), start = 0, end = total - 1;
            String range = r.getRequestHeaders().get("Range");
            boolean partial = false;
            if (range != null && range.startsWith("bytes=")) {
                String[] p = range.substring(6).split("-", 2);
                try {
                    if (!p[0].isEmpty()) start = Long.parseLong(p[0]);
                    if (p.length > 1 && !p[1].isEmpty()) end = Math.min(end, Long.parseLong(p[1]));
                    partial = start <= end;
                } catch (NumberFormatException ignored) {}
            }
            java.io.InputStream in = fd.createInputStream();
            long skipped = 0;
            while (skipped < start) { long n = in.skip(start - skipped); if (n <= 0) break; skipped += n; }
            final long len = end - start + 1;
            final java.io.InputStream src = in;
            java.io.InputStream limited = new java.io.InputStream() {
                long left = len;
                @Override public int read() throws java.io.IOException { if (left <= 0) return -1; int b = src.read(); if (b >= 0) left--; return b; }
                @Override public int read(byte[] b, int o, int l) throws java.io.IOException { if (left <= 0) return -1; int n = src.read(b, o, (int) Math.min(l, left)); if (n > 0) left -= n; return n; }
                @Override public void close() throws java.io.IOException { src.close(); }
            };
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Accept-Ranges", "bytes");
            h.put("Content-Length", String.valueOf(len));
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            if (partial) h.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            return new android.webkit.WebResourceResponse(path.endsWith(".mp3") ? "audio/mpeg" : "video/webm", null, partial ? 206 : 200, partial ? "Partial Content" : "OK", h, limited);
        } catch (java.io.IOException e) {
            return null;
        }
    }

    /** true = handled here (don't load it in the WebView). */
    private boolean route(Uri u) {
        String host = u.getHost() == null ? "" : u.getHost();
        if (host.equals("malgriot.github.io")) return false;
        if (host.equals("accounts.google.com")) { startSignin(); return true; }
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("http") || scheme.equals("https")) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
            return true;
        }
        return true;
    }

    private void startSignin() {
        byte[] r = new byte[16]; new SecureRandom().nextBytes(r);
        StringBuilder sb = new StringBuilder();
        for (byte x : r) sb.append(String.format("%02x", x));
        pendingState = sb.toString(); pendingAt = System.currentTimeMillis();
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(SIGNIN_URL + "?state=" + pendingState));
        // The EBBLESS TWA claims links on this host; aim at the default browser so it can't grab this one.
        android.content.pm.ResolveInfo rb = getPackageManager().resolveActivity(
                new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")), android.content.pm.PackageManager.MATCH_DEFAULT_ONLY);
        if (rb != null && rb.activityInfo != null && !"android".equals(rb.activityInfo.packageName)) i.setPackage(rb.activityInfo.packageName);
        startActivity(i);
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }

    private void handleIntent(Intent i) {
        Uri d = i == null ? null : i.getData();
        if (d == null || !"ebbless".equals(d.getScheme()) || !"signin".equals(d.getHost())) return;
        android.util.Log.d("EBB/signin", "link in, fragment len=" + (d.getFragment() == null ? -1 : d.getFragment().length()) + " pending=" + (pendingState != null));
        Uri q = Uri.parse("x://x?" + d.getFragment());
        boolean ok = pendingState != null && pendingState.equals(q.getQueryParameter("state"))
                && System.currentTimeMillis() - pendingAt < SIGNIN_TTL_MS;
        android.util.Log.d("EBB/signin", "state ok=" + ok);
        pendingState = null; // one use
        String cred = q.getQueryParameter("credential");
        if (!ok || cred == null || cred.split("\\.").length != 3) return;
        if (web == null) return;
        web.evaluateJavascript("window.ebblessOnSignin && window.ebblessOnSignin(" + JSONObject.quote(cred) + ")",
                r -> android.util.Log.d("EBB/signin", "page hook returned " + r));
    }

    @Override public void onBackPressed() { moveTaskToBack(true); }

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); if (web != null) web.saveState(b); }   // the WebView is built a moment after the splash is up
}
