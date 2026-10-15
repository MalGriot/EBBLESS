package io.github.malgriot.ebbless.webview;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private String pendingState;
    private long pendingAt;

    /** A WebView that never tells the page it was hidden, so audio and timers keep going. */
    private static class KeepAliveWebView extends WebView {
        KeepAliveWebView(Activity a) { super(a); }
        @Override protected void onWindowVisibilityChanged(int visibility) {
            if (visibility != View.GONE) super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new KeepAliveWebView(this);
        web.setBackgroundColor(0xFF121212);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF121212);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // Drop the "; wv" marker (some embeds treat WebViews as second-class) and say who we are.
        s.setUserAgentString(s.getUserAgentString().replace("; wv)", ")") + " EBBLESS-Android/0.1");
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (!r.isForMainFrame()) return false;
                return route(r.getUrl());
            }
        });
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

        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        startForegroundService(new Intent(this, PlaybackService.class));

        if (b != null) web.restoreState(b); else web.loadUrl(HOME);
        handleIntent(getIntent());
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
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(SIGNIN_URL + "?state=" + pendingState)));
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }

    private void handleIntent(Intent i) {
        Uri d = i == null ? null : i.getData();
        if (d == null || !"ebbless".equals(d.getScheme()) || !"signin".equals(d.getHost())) return;
        Uri q = Uri.parse("x://x?" + d.getFragment());
        boolean ok = pendingState != null && pendingState.equals(q.getQueryParameter("state"))
                && System.currentTimeMillis() - pendingAt < SIGNIN_TTL_MS;
        pendingState = null; // one use
        String cred = q.getQueryParameter("credential");
        if (!ok || cred == null || cred.split("\\.").length != 3) return;
        web.evaluateJavascript("window.ebblessOnSignin && window.ebblessOnSignin(" + JSONObject.quote(cred) + ")", null);
    }

    @Override public void onBackPressed() { moveTaskToBack(true); }

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
}
