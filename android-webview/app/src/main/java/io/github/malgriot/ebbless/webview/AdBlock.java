package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;

/**
 * Ad blocking for the YouTube embed. Two layers:
 * 1. request rules (isAd + empty): ad requests get an empty answer from shouldInterceptRequest;
 * 2. a script injected at document start into the youtube.com embed frame (see scriptSource): hides ad UI,
 *    clicks Skip, mutes and fast-forwards unskippable ads.
 * The rules and the script are NOT written in this file: they are adblock/rules.json and adblock/inject.js in the repo,
 * served by the site (https://malgriot.github.io/EBBLESS/adblock/). The app fetches them at launch and when the page
 * asks (Settings > Reload now), keeps the last good copy in filesDir, and falls back to the copy bundled in the APK
 * (Gradle copies ../adblock into the assets), so offline and failed fetches still block.
 * Before use a fetched pair must be: https, host malgriot.github.io, no redirects, <= 64 KB each, valid JSON of the
 * right shape, version not lower than the one running, script SHA-256 equal to rules.scriptSha256.
 * The fetched script runs inside YouTube frames: whoever can push to the repo's main branch can change it.
 * This goes against YouTube's embed terms (owner decision 2026-10-25, sideloaded app, no Play Store).
 * On = the user switch (default on) AND the remote flag (default on, kept on fetch failure).
 */
final class AdBlock {
    static final String FLAGS_URL = "https://spotify-youtube-search.malgriot.workers.dev/flags";
    static final String LIVE_BASE = "https://malgriot.github.io/EBBLESS/adblock/";
    static final String LIVE_HOST = "malgriot.github.io";
    static final int MAX_BYTES = 64 * 1024;
    /** Only frames from these origins get the script. */
    static final String[] ORIGINS = {"https://www.youtube.com", "https://www.youtube-nocookie.com"};
    private static final String PREFS = "ebb";
    private static final long REFETCH_MS = 60 * 60 * 1000;
    private static long lastFetch;

    /** One immutable, validated rules + script pair. Swapped atomically. */
    static final class Snap {
        int version; String sha; String source;
        String[] adHosts, adHostPrefixes, youtubeHosts, youtubeAdPaths, googleHostPrefixes, googleAdPaths, neverBlock;
        String cfgJson;   // {"v":..,"sel":{hide,skip}} for the script
        String script;
    }
    private static volatile Snap snap;
    /** "state|text" for the page: idle, running, done. */
    static volatile String status = "idle|";

    private AdBlock() {}

    // ---------- loading and validation ----------

    private static String[] list(JSONObject o, String k) throws Exception {
        JSONArray a = o.getJSONArray(k);
        if (a.length() > 500) throw new Exception("rules: list too long " + k);
        String[] r = new String[a.length()];
        for (int i = 0; i < r.length; i++) {
            String s = a.getString(i);
            if (s.isEmpty() || s.length() >= 200) throw new Exception("rules: bad entry in " + k);
            r[i] = s.toLowerCase(Locale.ROOT);
        }
        return r;
    }

    private static JSONArray selectors(JSONObject sel, String k) throws Exception {
        JSONArray a = sel.getJSONArray(k);
        if (a.length() == 0 || a.length() >= 200) throw new Exception("rules: bad selectors");
        for (int i = 0; i < a.length(); i++) {
            String s = a.getString(i);
            if (s.isEmpty() || s.length() >= 200 || s.matches(".*[{}<>].*")) throw new Exception("rules: bad selector");
        }
        return a;
    }

    private static String sha256(byte[] b) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (byte x : MessageDigest.getInstance("SHA-256").digest(b)) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    /** Throws unless the pair is valid and its version is at least minVersion. */
    static Snap parse(byte[] rulesBytes, byte[] scriptBytes, int minVersion, String source) throws Exception {
        if (rulesBytes.length == 0 || rulesBytes.length > MAX_BYTES) throw new Exception("rules: bad size");
        if (scriptBytes.length == 0 || scriptBytes.length > MAX_BYTES) throw new Exception("script: bad size");
        JSONObject o = new JSONObject(new String(rulesBytes, "UTF-8"));
        Snap s = new Snap();
        s.version = o.getInt("version");
        if (s.version < 1 || s.version < minVersion) throw new Exception("rules: version " + s.version + " too low");
        s.sha = o.getString("scriptSha256");
        if (!s.sha.matches("[0-9a-f]{64}") || !s.sha.equals(sha256(scriptBytes))) throw new Exception("script: hash mismatch");
        s.adHosts = list(o, "adHosts"); s.adHostPrefixes = list(o, "adHostPrefixes");
        s.youtubeHosts = list(o, "youtubeHosts"); s.youtubeAdPaths = list(o, "youtubeAdPaths");
        s.googleHostPrefixes = list(o, "googleHostPrefixes"); s.googleAdPaths = list(o, "googleAdPaths");
        s.neverBlock = list(o, "neverBlockHosts");
        JSONObject sel = o.getJSONObject("selectors");
        JSONObject cfg = new JSONObject();
        cfg.put("v", s.version);
        cfg.put("sel", new JSONObject().put("hide", selectors(sel, "hide")).put("skip", selectors(sel, "skip")));
        s.cfgJson = cfg.toString();
        s.script = new String(scriptBytes, "UTF-8");
        s.source = source;
        return s;
    }

    private static byte[] readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) {
            if (o.size() + n > max) throw new Exception("too large");
            o.write(buf, 0, n);
        }
        return o.toByteArray();
    }

    private static Snap readPair(InputStream rules, InputStream script, String source) throws Exception {
        try (InputStream r = rules; InputStream s = script) { return parse(readAll(r, MAX_BYTES), readAll(s, MAX_BYTES), 0, source); }
    }

    /** Load the best of: last good cached copy, copy bundled in the APK. Cheap; call early (it reads two tiny files). */
    static synchronized Snap init(Context c) {
        if (snap != null) return snap;
        Snap best = null;
        try {
            File dir = new File(c.getFilesDir(), "adblock");
            best = readPair(new FileInputStream(new File(dir, "rules.json")), new FileInputStream(new File(dir, "inject.js")), "cached");
        } catch (Exception e) { /* none or invalid */ }
        try {
            Snap b = readPair(c.getAssets().open("adblock/rules.json"), c.getAssets().open("adblock/inject.js"), "bundled");
            if (best == null || b.version > best.version) best = b;
        } catch (Exception e) { /* keep what we have */ }
        snap = best;
        return snap;
    }

    static Snap current() { return snap; }

    /** The document-start script: kill-switch state, selector config, then the live inject.js. Null if no rules loaded. */
    static String scriptSource(Context c) {
        Snap s = init(c);
        return s == null ? null : "window.__ebblessAdblockOn=true;window.__ebblessAdblockCfg=" + s.cfgJson + ";" + s.script;
    }

    /** Changes when the registered script must be rebuilt. */
    static String scriptSig(Context c) {
        Snap s = init(c);
        return s == null ? "" : s.version + ":" + s.sha;
    }

    /** Fetch rules.json and inject.js, validate, cache, adopt. Returns true if the running copy changed. Throws on any problem (nothing is adopted then). */
    private static boolean fetchRules(Context c) throws Exception {
        Snap cur = init(c);
        int min = cur == null ? 0 : cur.version;
        byte[] rb = fetchLive(LIVE_BASE + "rules.json");
        byte[] sb = fetchLive(LIVE_BASE + "inject.js");
        Snap n = parse(rb, sb, min, "live");
        File dir = new File(c.getFilesDir(), "adblock");
        dir.mkdirs();
        writeAtomic(new File(dir, "inject.js"), sb);
        writeAtomic(new File(dir, "rules.json"), rb);
        boolean changed = cur == null || cur.version != n.version || !cur.sha.equals(n.sha);
        snap = n;
        return changed;
    }

    private static void writeAtomic(File f, byte[] data) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(data); }
        if (!tmp.renameTo(f)) throw new Exception("could not save " + f.getName());
    }

    /** https, pinned host, no redirects, capped size. */
    private static byte[] fetchLive(String url) throws Exception {
        URL u = new URL(url);
        if (!"https".equals(u.getProtocol()) || !LIVE_HOST.equals(u.getHost()) || u.getPort() != -1 || u.getUserInfo() != null) throw new Exception("host not allowed");
        HttpURLConnection h = (HttpURLConnection) u.openConnection();
        h.setInstanceFollowRedirects(false);
        h.setConnectTimeout(8000); h.setReadTimeout(8000);
        h.setUseCaches(false);
        h.setRequestProperty("Cache-Control", "no-cache");
        if (h.getResponseCode() != 200) throw new Exception("HTTP " + h.getResponseCode());
        try (InputStream in = h.getInputStream()) { return readAll(in, MAX_BYTES); }
    }

    // ---------- request rules ----------

    private static boolean underAny(String host, String[] l) {
        for (String h : l) if (host.equals(h) || host.endsWith("." + h)) return true;
        return false;
    }

    /** host is <prefix><letters and dots>, e.g. adservice.google.co.uk */
    private static boolean withPrefix(String host, String[] l) {
        for (String p : l) {
            if (host.length() > p.length() && host.startsWith(p) && host.substring(p.length()).matches("[a-z.]+")) return true;
        }
        return false;
    }

    private static boolean pathHas(String path, String[] l, boolean prefixOnly) {
        for (String p : l) if (prefixOnly ? path.startsWith(p) : path.contains(p)) return true;
        return false;
    }

    static boolean isAd(android.net.Uri u) {
        Snap s = snap;
        if (s == null || u == null) return false;
        String scheme = u.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https") || scheme.equals("ws") || scheme.equals("wss"))) return false;
        String host = u.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        for (String h : s.neverBlock) if (host.equals(h)) return false;
        if (underAny(host, s.adHosts) || withPrefix(host, s.adHostPrefixes)) return true;
        String path = u.getPath() == null ? "" : u.getPath().toLowerCase(Locale.ROOT);
        if (underAny(host, s.youtubeHosts)) return pathHas(path, s.youtubeAdPaths, false);
        if (withPrefix(host, s.googleHostPrefixes)) return pathHas(path, s.googleAdPaths, true);
        return false;
    }

    static WebResourceResponse empty() {
        HashMap<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "utf-8", 200, "OK", h, new ByteArrayInputStream(new byte[0]));
    }

    // ---------- switches ----------

    static boolean userOn(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("adblockUser", true); }
    static boolean remoteOn(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("adblockRemote", true); }
    static boolean enabled(Context c) { return userOn(c) && remoteOn(c); }
    static void setUser(Context c, boolean on) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("adblockUser", on).apply(); }

    /** Fetch the kill switch. Keeps the stored value on any failure. Returns true if the value changed. */
    private static boolean fetchFlag(Context c) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(FLAGS_URL).openConnection();
            h.setConnectTimeout(5000); h.setReadTimeout(5000);
            if (h.getResponseCode() != 200) return false;
            byte[] b;
            try (InputStream in = h.getInputStream()) { b = readAll(in, 8192); }
            JSONObject j = new JSONObject(new String(b, "UTF-8"));
            if (!j.has("adblock")) return false;
            boolean v = j.getBoolean("adblock");
            boolean old = remoteOn(c);
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("adblockRemote", v).apply();
            return v != old;
        } catch (Exception e) { return false; }   // keep the last value
    }

    /** Kill switch and rules in the background (at most hourly). onChange runs on the fetch thread if either changed. */
    static void refreshRemote(Context ctx, Runnable onChange) {
        final Context c = ctx.getApplicationContext();
        synchronized (AdBlock.class) {
            long now = System.currentTimeMillis();
            if (now - lastFetch < REFETCH_MS) return;
            lastFetch = now;
        }
        new Thread(() -> {
            boolean changed = fetchFlag(c);
            try { changed |= fetchRules(c); } catch (Exception e) { /* keep the running copy */ }
            if (changed && onChange != null) onChange.run();
        }, "adblock-refresh").start();
    }

    /**
     * Settings > Reload now: refetch the kill switch, rules and script now (no hourly gate). The page polls status.
     * onDone runs on the fetch thread once the new pair (if any) is in place, so the caller can rebuild the registered script.
     */
    static void reloadNow(Context ctx, Runnable onDone) {
        final Context c = ctx.getApplicationContext();
        synchronized (AdBlock.class) {
            if (status.startsWith("running")) return;
            status = "running|Updating ad blocking...";
            lastFetch = System.currentTimeMillis();
        }
        new Thread(() -> {
            String msg;
            try {
                fetchFlag(c);
                boolean changed = fetchRules(c);
                Snap s = snap;
                msg = changed ? "Ad blocking updated to rules v" + s.version : "Ad blocking is current (rules v" + s.version + ")";
            } catch (Exception e) {
                Snap s = init(c);
                msg = "Could not reach the rules server, using rules v" + (s == null ? 0 : s.version) + (s == null ? "" : " (" + s.source + ")");
            }
            try { if (onDone != null) onDone.run(); } catch (Exception ignored) {}
            status = "done|" + msg;
        }, "adblock-reload").start();
    }

    /** JSON for the Settings debug line. */
    static String info(Context c) {
        Snap s = init(c);
        try {
            return new JSONObject().put("version", s == null ? 0 : s.version).put("source", s == null ? "none" : s.source)
                    .put("blocking", enabled(c)).put("killSwitch", !remoteOn(c)).toString();
        } catch (Exception e) { return "{}"; }
    }
}
