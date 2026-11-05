package io.github.malgriot.ebbless.webview;

import android.app.Activity;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewTreeObserver;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Bring your music, Spotify: the person signs in on Spotify's own login page, shown in the normal phone
 * layout so it is easy to type in. Once Spotify lands on the web player the window switches to the desktop
 * layout behind a plain native screen, and the export script that the EBBLESS page handed over (so it can
 * change without a new APK) reads their library with the token the player already uses. The result goes back
 * to the page. Passwords are typed on Spotify's page only; EBBLESS never sees them.
 */
public class SpotifyImportActivity extends Activity {
    /** Set by MainActivity before this opens; results go back through it. */
    interface Sink { void result(String json); void failed(String message); }
    static Sink sink;

    private static final String MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    private static final String DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    private static final String LOGIN_URL = "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F";
    private static final long PLAYER_WAIT_MS = 25000;

    private WebView web;
    private TextView status, coverText, hint;
    private Button go;
    private View cover;
    private String script;
    private boolean finished, desktop, signedIn, retried;
    private final Handler handler = new Handler(Looper.getMainLooper());

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
        bar.setPadding(24, 4, 16, 4);
        status = new TextView(this);
        status.setTextColor(0xFFFFFFFF);
        status.setTextSize(14);
        status.setText("Sign in to Spotify.");
        bar.addView(status, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setOnClickListener(v -> finishWith(null, null));
        bar.addView(cancel, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        hint = new TextView(this);
        hint.setTextColor(0xFFAAAAAA);
        hint.setTextSize(12);
        hint.setPadding(24, 0, 24, 6);
        hint.setText("Signed up with Google or Facebook? Enter your email or phone number and choose the one-time code option. Same Spotify account.");
        root.addView(hint, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        FrameLayout stage = new FrameLayout(this);
        web = new WebView(this);
        if (Build.VERSION.SDK_INT >= 26) web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);   // password managers can fill the login
        stage.addView(web, new FrameLayout.LayoutParams(-1, -1));

        // Shown over the desktop-layout player: nothing there is for the person to read or tap.
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER);
        c.setBackgroundColor(0xFF000000);
        c.setPadding(48, 48, 48, 48);
        c.setClickable(true);
        c.setVisibility(View.GONE);
        coverText = new TextView(this);
        coverText.setTextColor(0xFFFFFFFF);
        coverText.setTextSize(18);
        coverText.setGravity(Gravity.CENTER);
        c.addView(coverText, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        // Shown once Spotify says who is signed in: nothing is read until the person taps it.
        go = new Button(this);
        go.setText("Bring my music");
        go.setVisibility(View.GONE);
        go.setOnClickListener(v -> { go.setVisibility(View.GONE); say("Reading your library"); if (web != null) web.evaluateJavascript("window.__ebbSpGo&&window.__ebbSpGo()", null); });
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        gp.topMargin = 32;
        c.addView(go, gp);
        stage.addView(c, new FrameLayout.LayoutParams(-1, -1));
        cover = c;

        root.addView(stage, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        // Keyboard up: give the form all the room (drop the hint and the status line).
        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override public void onGlobalLayout() {
                Rect r = new Rect();
                root.getWindowVisibleDisplayFrame(r);
                int screen = root.getRootView().getHeight();
                boolean keys = screen > 0 && (screen - r.bottom) > screen * 0.15f;
                hint.setVisibility(keys || desktop ? View.GONE : View.VISIBLE);
                status.setVisibility(keys && !desktop ? View.GONE : View.VISIBLE);
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(MOBILE_UA);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void progress(String m) { runOnUiThread(() -> { if (m != null) say(m); }); }
            @android.webkit.JavascriptInterface public void ready() { runOnUiThread(() -> { signedIn = true; say("You are signed in to Spotify."); if (go != null) go.setVisibility(View.VISIBLE); }); }
            @android.webkit.JavascriptInterface public void done(String json) { runOnUiThread(() -> finishWith(json, null)); }
            @android.webkit.JavascriptInterface public void fail(String m) { runOnUiThread(() -> finishWith(null, m == null ? "Spotify did not answer. Try again." : m)); }
        }, "EbbSpotify");

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String sc = r.getUrl().getScheme();
                String h = r.getUrl().getHost() == null ? "" : r.getUrl().getHost();
                if (!("https".equals(sc) || "http".equals(sc))) return true;   // keep sign-in inside this window; never launch the Spotify app
                if (h.equals("accounts.google.com")) {   // Google refuses sign-in inside app windows; say so instead of showing its error page
                    status.setText("Google does not allow sign-in inside apps. Use your email or phone number with the one-time code instead.");
                    status.setVisibility(View.VISIBLE);
                    return true;
                }
                if (h.equals("open.spotify.com") && !desktop) { toDesktop(r.getUrl().toString()); return true; }   // signed in: Spotify sent us to the player
                return false;
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap f) {
                if (!finished && !desktop && "open.spotify.com".equals(Uri.parse(url).getHost())) { v.stopLoading(); toDesktop(url); }
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (finished) return;
                if (desktop && "open.spotify.com".equals(Uri.parse(url).getHost())) v.evaluateJavascript("if(!window.__ebbSp){window.__ebbSp=1;" + script + "}", null);
            }
        });
        web.loadUrl(LOGIN_URL);
    }

    private void say(String m) {
        if (status != null) status.setText(m);
        if (coverText != null) coverText.setText(m);
    }

    /** Past sign-in: the web player only loads in the desktop layout, so switch and hide it behind the native screen. */
    private void toDesktop(String url) {
        if (finished || web == null) return;
        desktop = true;
        WebSettings s = web.getSettings();
        s.setUserAgentString(DESKTOP_UA);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        say("Signing in to Spotify");
        hint.setVisibility(View.GONE);
        status.setVisibility(View.VISIBLE);
        cover.setVisibility(View.VISIBLE);
        web.loadUrl(url);
        // The player never showed a signed-in person (not actually signed in): back to the login once, then give up.
        handler.postDelayed(() -> {
            if (finished || signedIn) return;
            if (!retried) {
                retried = true; desktop = false;
                WebSettings t = web.getSettings();
                t.setUserAgentString(MOBILE_UA);
                t.setUseWideViewPort(false);
                t.setLoadWithOverviewMode(false);
                cover.setVisibility(View.GONE);
                status.setText("Sign in to Spotify.");
                hint.setVisibility(View.VISIBLE);
                web.loadUrl(LOGIN_URL);
            } else finishWith(null, "Spotify did not load. Try again.");
        }, PLAYER_WAIT_MS);
    }

    private void finishWith(String json, String error) {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
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
        if (!desktop && web != null && web.canGoBack()) web.goBack(); else finishWith(null, null);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
