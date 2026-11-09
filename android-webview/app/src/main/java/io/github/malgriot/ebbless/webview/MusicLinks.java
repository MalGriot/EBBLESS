package io.github.malgriot.ebbless.webview;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * #746: which music links the app hands to the page when one is opened with or shared to EBBLESS.
 * Plain Java (no Android types) so it can be checked off the phone. index.html's nativeLinkAllowed keeps the same list.
 */
final class MusicLinks {
    private MusicLinks() {}

    /** Hosts the page's paste box imports from (parseImportLink). spotify.link / on.soundcloud.com short links are not: they need a redirect resolved. */
    static final Set<String> HOSTS = new HashSet<>(Arrays.asList(
            "open.spotify.com", "music.apple.com", "music.youtube.com",
            "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
            "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"));

    private static final Pattern HTTPS_IN_TEXT = Pattern.compile("https://[\\x21-\\x7e]+", Pattern.CASE_INSENSITIVE);

    /** The first https link in shared text ("Listen to X on Spotify: https://..."), or null. */
    static String firstHttps(CharSequence text) {
        if (text == null) return null;
        Matcher m = HTTPS_IN_TEXT.matcher(text);
        return m.find() ? m.group() : null;
    }

    /** The link itself if it is a plain https link on an allowed host (no user info, no port, printable ASCII, 500 chars max), else null. */
    static String allowed(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > 500) return null;
        for (int k = 0; k < raw.length(); k++) {
            char c = raw.charAt(k);
            if (c < 0x21 || c > 0x7e) return null;
        }
        try {
            URI u = new URI(raw);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getRawUserInfo() != null || u.getPort() != -1) return null;
            String host = u.getHost();
            if (host == null || !HOSTS.contains(host.toLowerCase(Locale.ROOT))) return null;
            return raw;
        } catch (Exception e) {
            return null;
        }
    }
}
