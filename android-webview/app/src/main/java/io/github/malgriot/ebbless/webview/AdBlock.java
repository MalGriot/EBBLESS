package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebResourceResponse;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Locale;

/**
 * Ad blocking for the YouTube embed. Two layers:
 * 1. request rules (isAd + empty): ad requests get an empty answer from shouldInterceptRequest;
 * 2. SCRIPT, injected at document start into the youtube.com embed frame: hides ad UI, clicks Skip,
 *    mutes and fast-forwards unskippable ads.
 * This goes against YouTube's embed terms (owner decision 2026-10-25, sideloaded app, no Play Store).
 * On = the user switch (default on) AND the remote flag (default on, kept on fetch failure).
 */
final class AdBlock {
    static final String FLAGS_URL = "https://spotify-youtube-search.malgriot.workers.dev/flags";
    /** Only frames from these origins get the script. */
    static final String[] ORIGINS = {"https://www.youtube.com", "https://www.youtube-nocookie.com"};
    private static final String PREFS = "ebb";
    private static final long REFETCH_MS = 60 * 60 * 1000;
    private static long lastFetch;

    // Same rules as the Mac app's adblock, copied (no shared package). Hosts match the host or any subdomain.
    private static final String[] AD_HOSTS = {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
        "googleads.g.doubleclick.net", "pagead2.googlesyndication.com", "ads.youtube.com", "static.doubleclick.net",
    };
    /** Path substrings, applied only on youtube.com and google hosts so the app's own requests are never touched. */
    private static final String[] AD_PATHS = {
        "/pagead/", "/api/stats/ads", "/ptracking", "/youtubei/v1/player/ad_break", "/get_midroll_",
        "ad_placement", "/ad_break",
    };

    static final String SCRIPT =
        "(function(){try{" +
        "if(window.__ebbAdblock)return;window.__ebbAdblock=1;" +
        "if(location.pathname.indexOf('/embed/')!==0)return;" +
        "var st=document.createElement('style');" +
        "st.textContent='.video-ads,.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-text-overlay," +
        ".ytp-paid-content-overlay,.ytp-ce-element,.ytp-suggested-action,.ytp-ad-player-overlay,.ytp-ad-skip-button-container," +
        ".ytp-ad-message-container{display:none!important}';" +
        "(document.head||document.documentElement).appendChild(st);" +
        "var weMuted=false,prevRate=1;" +
        "function tick(){try{" +
        "var p=document.getElementById('movie_player');var v=document.querySelector('video');if(!p||!v)return;" +
        "var ad=p.classList.contains('ad-showing')||p.classList.contains('ad-interrupting');" +
        "if(ad){" +
        "var b=document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-slot button');" +
        "if(b){b.click();}" +
        "if(!weMuted){weMuted=true;prevRate=1;v.muted=true;}" +
        "v.muted=true;if(v.playbackRate!==16)v.playbackRate=16;" +
        "if(isFinite(v.duration)&&v.duration>0&&v.currentTime<v.duration-0.1)v.currentTime=v.duration-0.05;" +
        "}else if(weMuted){weMuted=false;v.muted=false;v.playbackRate=prevRate;}" +
        "}catch(e){}}" +
        "setInterval(tick,250);" +
        "}catch(e){}})();";

    private AdBlock() {}

    static boolean isAd(android.net.Uri u) {
        if (u == null) return false;
        String host = u.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        for (String h : AD_HOSTS) if (host.equals(h) || host.endsWith("." + h)) return true;
        boolean yt = host.equals("youtube.com") || host.endsWith(".youtube.com")
                || host.equals("youtube-nocookie.com") || host.endsWith(".youtube-nocookie.com")
                || host.equals("google.com") || host.endsWith(".google.com");
        if (!yt) return false;
        String pq = (u.getEncodedPath() == null ? "" : u.getEncodedPath())
                + (u.getEncodedQuery() == null ? "" : "?" + u.getEncodedQuery());
        pq = pq.toLowerCase(Locale.ROOT);
        for (String p : AD_PATHS) if (pq.contains(p)) return true;
        return false;
    }

    static WebResourceResponse empty() {
        HashMap<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", 200, "OK", h, new ByteArrayInputStream(new byte[0]));
    }

    static boolean userOn(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("adblockUser", true); }
    static boolean remoteOn(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("adblockRemote", true); }
    static boolean enabled(Context c) { return userOn(c) && remoteOn(c); }
    static void setUser(Context c, boolean on) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("adblockUser", on).apply(); }

    /** Fetch the kill switch in the background (at most hourly). Keeps the stored value on any failure. onChange runs on the fetch thread if the value changed. */
    static void refreshRemote(Context ctx, Runnable onChange) {
        final Context c = ctx.getApplicationContext();
        synchronized (AdBlock.class) {
            long now = System.currentTimeMillis();
            if (now - lastFetch < REFETCH_MS) return;
            lastFetch = now;
        }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL(FLAGS_URL).openConnection();
                h.setConnectTimeout(5000); h.setReadTimeout(5000);
                if (h.getResponseCode() != 200) return;
                java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
                try (java.io.InputStream in = h.getInputStream()) {
                    byte[] buf = new byte[1024]; int n;
                    while ((n = in.read(buf)) > 0 && o.size() < 8192) o.write(buf, 0, n);
                }
                JSONObject j = new JSONObject(o.toString("UTF-8"));
                if (!j.has("adblock")) return;
                boolean v = j.getBoolean("adblock");
                boolean old = remoteOn(c);
                c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("adblockRemote", v).apply();
                if (v != old && onChange != null) onChange.run();
            } catch (Exception e) { /* keep the last value */ }
        }, "adblock-flag").start();
    }
}
