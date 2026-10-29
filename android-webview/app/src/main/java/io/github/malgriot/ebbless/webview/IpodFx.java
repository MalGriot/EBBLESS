package io.github.malgriot.ebbless.webview;

/**
 * Celebration hook the iPod player gives to games (and uses itself for app moments such as liking a song).
 * tier 1 = small (a combo, a line, a snack eaten), tier 2 = medium (level up, long chain, a new personal best),
 * tier 3 = big (a record, a huge cascade). The host answers with haptics, a soft sound and a short on-screen burst.
 * Implementations must be cheap and safe to call from update(), and ignore calls while the screen is off.
 */
interface IpodFx {
    void achievement(int tier, String text);
}
