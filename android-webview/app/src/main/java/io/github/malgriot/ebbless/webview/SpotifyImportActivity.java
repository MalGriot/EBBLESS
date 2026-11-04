package io.github.malgriot.ebbless.webview;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Bring your music, Spotify: the person signs in to Spotify's own page here (desktop layout, so the web
 * player loads), and the export script that the EBBLESS page handed over (so it can change without a new
 * APK) reads their library with the token the player already uses. The result goes back to the page.
 * Passwords are typed on Spotify's page only; EBBLESS never sees them.
 */
public class SpotifyImportActivity extends Activity {
    /** Set by MainActivity before this opens; results go back through it. */
    interface Sink { void result(String json); void failed(String message); }
    static Sink sink;

    private static final String DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    private WebView web;
    private TextView status;
    private String script;
    private boolean finished;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        script = getIntent().getStringExtra("script");
        if (script == null || script.length() < 50) { finish(); return; }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF000000);
        root.setFitsSystemWindows(true);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(24, 8, 16, 8);
        status = new TextView(this);
        status.setTextColor(0xFFFFFFFF);
        status.setTextSize(14);
        status.setText("Sign in to Spotify. Your music comes over right after.");
        bar.addView(status, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setOnClickListener(v -> finishWith(null, null));
        bar.addView(cancel, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(DESKTOP_UA);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void progress(String m) { runOnUiThread(() -> { if (status != null && m != null) status.setText(m); }); }
            @android.webkit.JavascriptInterface public void done(String json) { runOnUiThread(() -> finishWith(json, null)); }
            @android.webkit.JavascriptInterface public void fail(String m) { runOnUiThread(() -> finishWith(null, m == null ? "Spotify did not answer. Try again." : m)); }
        }, "EbbSpotify");

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String sc = r.getUrl().getScheme();
                return !("https".equals(sc) || "http".equals(sc));   // keep sign-in inside this window; never launch the Spotify app
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (finished) return;
                String host = Uri.parse(url).getHost();
                if ("open.spotify.com".equals(host)) v.evaluateJavascript("if(!window.__ebbSp){window.__ebbSp=1;" + script + "}", null);
            }
        });
        web.loadUrl("https://open.spotify.com/");
    }

    private void finishWith(String json, String error) {
        if (finished) return;
        finished = true;
        Sink k = sink;
        sink = null;
        forgetSpotify();
        if (k != null) { if (json != null) k.result(json); else if (error != null) k.failed(error); }
        finish();
    }

    /** Sign the person out of Spotify here (only Spotify's cookies; EBBLESS shares this cookie store). */
    private void forgetSpotify() {
        CookieManager cm = CookieManager.getInstance();
        for (String site : new String[]{"https://open.spotify.com", "https://accounts.spotify.com", "https://www.spotify.com"}) {
            String all = cm.getCookie(site);
            if (all == null) continue;
            for (String pair : all.split(";")) {
                int eq = pair.indexOf('=');
                String name = (eq < 0 ? pair : pair.substring(0, eq)).trim();
                if (name.isEmpty()) continue;
                cm.setCookie(site, name + "=; Max-Age=0; Path=/");
                cm.setCookie(site, name + "=; Max-Age=0; Path=/; Domain=.spotify.com");
            }
        }
        cm.flush();
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else finishWith(null, null);
    }

    @Override protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
