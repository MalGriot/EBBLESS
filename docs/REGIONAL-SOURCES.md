# Regional sources: keeping EBBLESS playable where YouTube isn't

Research for GitHub issue #226 (backlog `regional-source-alternatives`):
"youtube is restricted in russia. with that in mind, i want a list of regional
alternatives to ensure service is ebbless everywhere. think about translating
metadata also."

Written 2026-10-01 against `main` as of that date. Research only: nothing in
`index.html`, `sw.js` or the worker was changed. This is an engineering
reading of public reporting and platform docs, not legal advice. Censorship
status changes quickly; every "blocked" claim below carries the date of the
reporting it rests on and a confidence level.

Nothing here recommends getting around a block (VPNs, proxies, domain
fronting, mirrors). The goal is to play music from services that are
legitimately available where the listener is, and to fail clearly when
nothing is.

## TL;DR

- The problem in Russia is bigger than YouTube. As of 2026, **YouTube,
  SoundCloud and Spotify are all unavailable in Russia**, and Russian ISPs
  have **throttled Cloudflare since June 2025** - which is where EBBLESS's
  worker (`*.workers.dev`) lives. On mobile networks in much of central
  Russia a "whitelist" mode now lets through only state-approved, mostly
  Russian-hosted services, which would block the EBBLESS page itself
  (GitHub Pages) as well as the worker. A Russian playback source on its own
  does not fix any of this.
- The realistic in-region alternatives (Yandex Music, VK, Rutube, Zvuk in
  Russia; NetEase Cloud Music, QQ Music, Bilibili in China; Aparat in Iran)
  mostly have **no public playback/search API** and at best a share-iframe
  with no JS control. Only **Rutube** (postMessage API) and **Bilibili**
  (official external player) look technically close to EBBLESS's deck
  model, and both are user-upload video platforms with the same "is this
  the right upload" and licensing questions as YouTube.
- There is **no region-agnostic source that works in Russia, China and Iran
  at once.** SoundCloud and Bandcamp are blocked in China (and SoundCloud in
  Russia); the Internet Archive is blocked in China.
- Cheapest, most valuable first step: **detect failure honestly** (YouTube
  IFrame API timeout, embed errors, worker unreachable) and tell the listener
  instead of spinning forever - `loadIndex` currently retries every 300 ms
  with no limit while `YT.Player` is undefined.
- Metadata: the worker's YouTube match scoring drops every non-Latin
  character (`[^a-z0-9]`), so Cyrillic/CJK titles get **no title-relevance
  check at all**. Fixing that is a small, high-value change regardless of
  regional sources. ISRC helps cross-referencing (Deezer, MusicBrainz, Apple)
  but does not help find a YouTube/Rutube/Bilibili upload.

## 1. How EBBLESS plays audio today (what a regional fallback must fit into)

From `README.md`, `docs/PLATFORM-AUDIT.md`, `index.html` and
`worker/src/index.js`:

| Piece | What it does | Region-relevant detail |
|---|---|---|
| Hosting | Static `index.html` on GitHub Pages (`malgriot.github.io/EBBLESS`) | Foreign host; affected by Russia's mobile whitelist mode and patchy in China. |
| Worker | `spotify-youtube-search.malgriot.workers.dev` (Cloudflare) | Every import and every match goes through it. Throttled in Russia since 2025-06-09. |
| Spotify / Apple Music import | Worker scrapes the public embed / page JSON (`/playlist`, `/album`, `/track`, `/amlist`, `/amtrack`) for `{title, artist, durationMs}` | Metadata only, fetched server-side, so it works whether or not Spotify is available to the listener. Worker sends `Accept-Language: en-US`. |
| Matching | `/search` scrapes YouTube search results and scores candidates (`handleSearch`, `titleTokens`, `titleOverlapRatio`) | Always YouTube. Results cached 30 days. |
| Playback (default) | `YT.Player` IFrame API in two decks (`createDeckPlayer`, `loadIndex`) | `ensureYouTubeApi()` injects `youtube.com/iframe_api`; `loadIndex` polls `typeof YT` every 300 ms **with no timeout**. |
| Playback (native) | `sc:<id>` -> SoundCloud Widget adapter; `au:<url>` -> `<audio>` for podcasts (`isSoundCloudVideoId`, `isAudioVideoId`, `isNativeVideoId`) | This prefix-plus-adapter pattern is the natural hook for any new source. |
| Errors | YT `onError` only sets `deck.ytErrorFor` for the YouTube tab (`ytPanelBtnSync`) | No automatic fallback to another source on embed error (codes 100/101/150). |
| Manual relink | `openRefreshLinkPicker` merges `/sctracksearch` + `/search` candidates | Already a multi-source picker; a regional source could add a third list here. |
| Other client-side hosts | `img.youtube.com`/`i.ytimg.com` thumbnails, `accounts.google.com/gsi/client` (Google sign-in), `gstatic.com` (Cast) | All Google hosts - also unavailable where YouTube is blocked. |

Compliance context already decided in `docs/PLATFORM-AUDIT.md`: the hidden
1x1 YouTube player and ad muting conflict with YouTube's developer policies,
and the owner accepted that risk for the beta (option D). Any new source
added should not repeat that pattern without the same conscious decision.

## 2. Where YouTube, SoundCloud and Spotify are blocked (as of 2026-10)

Confidence: **High** = multiple recent independent reports; **Medium** =
consistent but older or single-source; **Low** = unverified / anecdotal.

| Region | YouTube | SoundCloud | Spotify | Notes | Confidence |
|---|---|---|---|---|---|
| Russia | Blocked. Throttled from mid-2024, domains dropped from the national DNS and effectively fully blocked since 2026-02-12 | Blocked since 2022-10 (website; app reportedly kept working at the time) | Not offered since 2022-04-11 (Spotify left) | Cloudflare throttled to ~16 KB per asset since 2025-06-09 (also Hetzner, DigitalOcean). Mobile "whitelist" mode in many regions, effectively permanent in central Russia by 2026 | High |
| Mainland China | Blocked (since 2009) | Blocked (2013/2014) | Not offered | Bandcamp blocked 2021-02-16; Internet Archive blocked since 2012; Google services blocked. Hong Kong and Macau are not affected | High |
| Iran | Blocked (since 2009) | Not offered / restricted | Not offered (sanctions) | Near-total international internet blackout 2026-01-08 to 2026-05-26; partial restoration since, mobile still largely cut off | High |
| North Korea | Blocked (no public internet) | - | - | Ordinary users only have the domestic Kwangmyong intranet. Out of scope | High |
| Turkmenistan | Blocked | Likely blocked | Not offered | Very small, heavily filtered internet | Medium |
| Eritrea | Listed as blocking YouTube | - | Not offered | Tiny internet population | Low/Medium |
| Turkey, Pakistan, others | Not currently blocked | | | Have blocked YouTube temporarily during protests/elections in the past; temporary shutdowns are the common case elsewhere | Medium |

Sources: [Blocking of YouTube in Russia (Wikipedia)](https://en.wikipedia.org/wiki/Blocking_of_YouTube_in_Russia);
[Kursiv, 2026-02-12](https://kz.kursiv.media/en/2026-02-12/engk-tank-users-report-blocked-youtube-and-whatsapp-in-russia/amp/);
[TechRadar on DNS/DPI blocking](https://www.techradar.com/vpn/vpn-privacy-security/russia-is-using-dns-and-dpi-to-block-youtube-telegram-and-whatsapp-while-pushing-state-controlled-max-as-alternative);
[Cloudflare: Russian Internet users are unable to access the open Internet (2025-06-26)](https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/);
[Mediazona, the 16 KB curtain](https://en.zona.media/article/2025/06/19/cloudflare);
[bne IntelliNews: whitelist mode became permanent](https://www.intellinews.com/russia-s-mobile-internet-whitelist-mode-has-quietly-become-permanent-459197/);
[Mediazona: Russian internet censorship in 2026](https://en.zona.media/article/2026/04/07/russian_internet_censorship_2026);
[Interfax: SoundCloud blocked in Russia (2022)](https://interfax.com/newsroom/top-stories/83487/);
[Spotify stops streaming in Russia (2022)](https://www.business-humanrights.org/en/latest-news/spotify-stops-streaming-in-russia-over-safety-concerns-caused-by-new-law-on-media/);
[Censorship of YouTube (Wikipedia)](https://en.wikipedia.org/wiki/Censorship_of_YouTube);
[List of websites blocked in mainland China (Wikipedia)](https://en.wikipedia.org/wiki/List_of_websites_blocked_in_mainland_China);
[The Quietus: Bandcamp blocked in China](https://thequietus.com/news/bandcamp-blocked-in-china/);
[2026 Internet blackout in Iran (Wikipedia)](https://en.wikipedia.org/wiki/2026_Internet_blackout_in_Iran);
[Cloudflare Radar: Iran partially restored (2026-05)](https://blog.cloudflare.com/iran-internet-partially-restored-may-2026/);
[NPR, 2026-05-28](https://www.npr.org/2026/05/28/g-s1-124610/iranians-back-online).

What this means for EBBLESS specifically:

- **Russia:** a listener on home broadband may load the page (GitHub Pages
  has not been reported blocked) but the worker on Cloudflare is throttled.
  Small JSON responses under ~16 KB might get through; full playlist imports
  likely will not. YouTube playback fails. SoundCloud-native tracks fail
  too. On mobile under whitelist mode, probably nothing loads at all. Any
  serious Russian support would need the backend reachable from Russia,
  which in practice means Russian hosting - a business and legal decision,
  not an engineering tweak (see Open questions).
- **China:** the page itself (github.io) is unreliable, the worker
  (workers.dev) is commonly blocked or slow, Google sign-in and Cast load
  from Google hosts, and YouTube/SoundCloud are blocked.
- **Iran:** international connectivity itself is the constraint in 2026,
  plus US sanctions on dealing with Iranian companies (see 3.3).

## 3. Regional alternatives

Columns: **Embed** = official embeddable player usable in a third-party
page; **JS control** = can EBBLESS drive it (play/pause/seek/ended events,
volume) the way `createDeckPlayer` needs; **API** = public search/playback
API for third parties; **Outside region** = does it work for a listener
abroad.

### 3.1 Russia

| Service | Embed | JS control | API | Outside region | Catalog fit | Verdict |
|---|---|---|---|---|---|---|
| **Yandex Music** | Yes: share -> HTML code gives `music.yandex.ru/iframe/#track/<album>/<track>` (also album/playlist) | No documented API; plain iframe | No official public API. Python/JS libraries exist but are reverse-engineered and need a user OAuth token; using them is against Yandex's terms | Subscriptions only in Russia + ~11 CIS countries/Israel; catalog for foreign IPs is restricted | Best licensed catalog in Russia/CIS, major-label coverage | Only viable as a "Listen on Yandex Music" link-out or a visible embed card. Not a deck source. Whether the embed plays full tracks or previews for logged-out users is unverified |
| **VK Music** (VK / BOOM) | No general audio embed | No | Audio API closed to third parties since 2016; only usable with tokens from VK's own apps (ToS violation) | Mostly CIS | Huge, mixed licensed + user uploads | Avoid. No compliant integration path |
| **VK Video** | Yes: `vk.com/video_ext.php?oid=&id=&hash=` | Some: `vk.com/js/api/videoplayer.js` with `js_api=1` (community-documented) | Search would need scraping | Works abroad generally | User + label uploads, like YouTube | Technically possible, compliance unknown, `hash` param needed per video. Low priority |
| **Rutube** (Gazprom-Media) | Yes: `rutube.ru/play/embed/<id>` | Yes: postMessage API (`player:play`, `player:pause`, state events), officially published and since archived by Rutube on GitHub | No official public search API (search would mean scraping, same issue as YouTube today) | Works abroad; some content geo-restricted | Music catalog thin compared with YouTube; many uploads are re-posts | Closest technical fit to a YouTube deck adapter, but weak music catalog and unclear embed terms |
| **Zvuk** (Sber) | No public embed found | No | Unofficial `sberzvuk-api` with anonymous tokens | Russia-focused | Licensed catalog | Avoid: no sanctioned API, and Sberbank is on US/UK/EU sanctions lists, so an integration needs legal review first |

Sources: [Yandex Wiki iframe embed docs](https://yandex.ru/support/wiki/en/actions/iframe);
[Yandex Music (Wikipedia)](https://en.wikipedia.org/wiki/Yandex_Music);
[Yandex Music API (unofficial)](https://yandex-music.readthedocs.io/en/main/yandex_music.track.track.html);
[EasyVK on the closed VK audio API](https://ciricc.github.io/2.0.0/audioapi.html);
[vkpymusic](https://github.com/issamansur/vkpymusic);
[VK Video embed (Drupal module)](https://www.drupal.org/project/video_embed_vk);
[Rutube Player JS API (archived, official)](https://github.com/rutube/RutubePlayerJSAPI);
[Rutube Player API docs (community)](https://github.com/evikza/Rutube-Player-JS-API-Doc);
[sberzvuk-api](https://github.com/Aiving/sberzvuk-api).

Also note: Apple Music still operates in Russia, but Apple stopped new
purchases and subscription renewals there from 2026-04-01
([MacDailyNews](https://macdailynews.com/2026/04/02/apple-disables-payments-in-russia/)).

### 3.2 Mainland China

| Service | Embed | JS control | API | Outside region | Catalog fit | Verdict |
|---|---|---|---|---|---|---|
| **NetEase Cloud Music** | Yes: official "generate outchain player" (`music.163.com/outchain/player?...`) | No documented API | No official public API; popular community Node APIs are reverse-engineered | Many tracks are copyright-locked to mainland China | Strong for Chinese and indie, decent Western | Outchain player refuses paid/VIP tracks and many playlists. Good for a link-out, poor as a deck source |
| **QQ Music** (Tencent Music) | No public embed | No | Tencent's OpenAPI / QPlay is partner-only (hardware/business agreements) | Mostly mainland only | Largest licensed catalog in China | Only through a formal partnership |
| **Kugou / Kuwo** (Tencent Music) | No | No | Partner-only | Mainland only | Large | Same as QQ Music |
| **Bilibili** | Yes: official external player `player.bilibili.com/player.html?bvid=...` (autoplay/muted params) | Limited; no official JS control API | Search would need scraping or Bilibili's open platform (registration) | Login-required or copyright-locked videos don't play in the embed, and many are mainland-only | Lots of music uploads, covers, MVs; licensing is uneven | Most promising technical option in China, same caveats as YouTube (user uploads, match quality) |
| **Apple Music** | Apple's embed player + MusicKit JS | Yes (MusicKit JS) | Official Apple Music API (developer token) | Available in mainland China (feature-limited) and most countries | Global licensed catalog | The one licensed, documented option that also exists in China. Full tracks only for the listener's own Apple Music subscription; 30 s previews otherwise |

Sources: [NetEase outchain player notes (CSDN)](https://blog.csdn.net/weixin_39175602/article/details/78576378);
[Techzero: why some playlists can't generate outchain players](https://techzero.cn/netease-cloud-music-cannot-create-outchain-solution.html);
[NetEase Cloud Music (Wikipedia)](https://en.wikipedia.org/wiki/NetEase_Cloud_Music);
[Tencent Music QPlay OpenAPI demo](https://github.com/tencentmusic/QQMusic_Innovation_QPlay_OpenAPI_Demo);
[QQ Music (Wikipedia)](https://en.wikipedia.org/wiki/QQ_Music);
[Bilibili external player docs](https://player.bilibili.com/);
[discourse-bilibili-inline-player on login/region limits](https://github.com/ieduer/discourse-bilibili-inline-player);
[MBW: Apple Music and China Mobile](https://www.musicbusinessworldwide.com/apple-music-inks-major-deal-in-china-app-now-available-for-china/).

### 3.3 Iran

| Service | Embed | JS control | API | Notes | Verdict |
|---|---|---|---|---|---|
| **Aparat** (Saba Idea) | Yes, video embed iframe | Not documented | No public search API found | Iran's main video site; music uploads exist | Not recommended: US sanctions on Iranian companies make a commercial integration a legal question, and international connectivity is the bigger blocker |
| Domestic music apps (e.g. Melodify, Navaar) | None found | - | - | Low-confidence names; no public developer surface found | Out of reach |
| Radio Javan, Bia2 | Diaspora services | - | - | Themselves blocked inside Iran | Not an in-region option |

Sources: [Aparat (Wikipedia)](https://en.wikipedia.org/wiki/Aparat);
[Censorship in Iran (Wikipedia)](https://en.wikipedia.org/wiki/Censorship_in_Iran);
[ACLED: Has Iran really restored internet access?](https://acleddata.com/expert-comment/has-iran-really-restored-internet-access).

### 3.4 North Korea, Turkmenistan, Eritrea

No realistic option. Internet access is tiny and heavily filtered; any page
EBBLESS serves from foreign infrastructure is unlikely to load. Out of scope.

## 4. Region-agnostic fallbacks

| Source | Integration | Russia | China | Iran | Catalog fit |
|---|---|---|---|---|---|
| **SoundCloud** (already integrated: `sc:` decks, `/soundcloud`, `/sctracksearch`) | Widget API | Blocked (2022) | Blocked | Restricted | Strong for indie/electronic, weak for majors |
| **Audius** | Free open API (no key, no rate limit claimed), official embed, 320 kbps streams | No block reported; but nodes are run by third parties on cloud hosts Russia throttles - unverified | No block reported - unverified | Unknown | Small, mostly independent/electronic |
| **Bandcamp** | Embedded player iframe (no JS API), no public search API | Not reported blocked; payments to Russia cut | Blocked (2021) | Sanctions limit sales | Independent artists |
| **Internet Archive** (Live Music Archive, netlabels) | Direct audio files, public API; fits the existing `au:` audio deck | Blocked 2015-16, not currently reported | Blocked since 2012 | Unknown | Live recordings, public domain, netlabels; not commercial catalog |
| **Deezer** | Widget (30 s previews only for music), public metadata API (already used for ISRC/BPM) | Not offered | Not offered | Not offered | Metadata only for EBBLESS |
| **Apple Music** (MusicKit JS) | Official, licensed | Operates but no new subscriptions since 2026-04 | Available | Not offered | Global, needs listener's own subscription |

Sources: [Audius API overview](https://blog.audius.co/article/powering-decentralized-music-with-apis);
[Audius discovery nodes](https://docs.audius.org/learn/architecture/discovery-node/);
[Deezer widget announcement](https://newsroom-deezer.com/2021/04/deezers-new-embeddable-widget-player-adds-instant-audio-to-any-website/);
[Deezer country list](https://support.deezer.com/hc/en-gb/articles/115003749449-List-Of-Countries-Deezer-Is-Available-In);
[The Register: Russia blocks Archive.org (2015)](https://www.theregister.com/2015/09/01/russias_putin_blocks_archiveorg/).

Takeaway: none of these covers Russia + China + Iran. Audius is the only
one with no known blocks and a clean, free API that fits a deck adapter, but
its catalog would only rescue a minority of tracks (mostly independent and
electronic). It is worth having as a fallback for a match that YouTube
can't supply anywhere, not as a regional strategy.

## 5. Detecting the problem and falling back (design level)

### 5.1 Signals, in order of trustworthiness

1. **Did YouTube actually load?** `ensureYouTubeApi()` injects the
   `iframe_api` script with no `onerror` and no timeout, and `loadIndex` /
   `prewarmResumeDeck` re-poll `typeof YT` every 300 ms forever. Add a
   `script.onerror` plus a deadline (for example 8-10 s from first request)
   that sets a `ytUnavailable` flag. This is the only signal that reflects
   what the listener's network really does, and it has no false positives
   from VPN users or travellers.
2. **Did a specific embed fail?** `onError` in `createDeckPlayer` already
   receives YouTube's error code but only records `deck.ytErrorFor` for the
   YouTube tab. Codes 100/101/150 (removed, not embeddable, blocked by
   owner/region) could trigger "try the next candidate / another source"
   instead of leaving the deck silent.
3. **Is the worker reachable?** A short `fetch(BACKEND + '/ping')` (or the
   first real call) with a timeout. In Russia the Cloudflare throttle shows
   up as stalled responses beyond ~16 KB, so a large `/playlist` response may
   hang rather than fail; use `AbortController` timeouts on worker calls and
   say "the EBBLESS server isn't reachable from your network" rather than a
   generic error.
4. **Worker-side country.** Cloudflare Workers expose the request's country
   as `request.cf.country` (also the `CF-IPCountry` header). The worker
   could return it from a tiny `/geo` endpoint or attach it to existing
   responses. Useful for analytics and for ordering candidate sources, but
   it describes the IP, not the listener: VPN users and travellers will be
   wrong, and if the worker can't be reached from the region the signal never
   arrives. Treat as a hint.
5. **Client hints.** `Intl.DateTimeFormat().resolvedOptions().timeZone`
   (already read for the time-of-day feature) and `navigator.language`
   (already read for one record). `Europe/Moscow` or `Asia/Shanghai` plus a
   `ru`/`zh` locale is a strong hint, but many people abroad use those too.
   Use only to pre-order options or pre-select UI language, never to deny or
   switch playback on their own.

Rule of thumb: let **observed failure** (1-3) decide that a fallback is
needed; let **hints** (4-5) decide which fallback to offer first.

### 5.2 Fallback shape that fits the existing code

- **New source = new `videoId` prefix + deck adapter**, exactly like `sc:`
  and `au:`. For example `rt:<id>` (Rutube, postMessage) or `au:` reused for
  an Audius stream / Internet Archive file. `isNativeVideoId` then keeps
  thumbnails, loudness, lyrics and re-matching off those tracks, as it
  already does for SoundCloud and podcasts.
- **Matching:** a worker endpoint per source (pattern of `/sctracksearch`)
  returning candidates in the `/search` shape, so `openRefreshLinkPicker`
  can merge them, and an automatic resolve can try sources in a
  region-ordered list when YouTube is known to be unavailable.
- **Link-out for iframe-only services** (Yandex Music, NetEase outchain,
  Apple, Bandcamp): when no controllable source exists, show "Open in
  Yandex Music / NetEase" for the current track rather than embedding a
  player EBBLESS can't control. This keeps queue, crossfade and Media Session
  logic honest (an uncontrollable iframe can't report `ENDED`).
- **Clear empty state:** when no source works, say so per track ("Not
  available on your network") instead of a silent deck.
- **Backend reachability in Russia** is a separate problem that no client
  fallback solves. The only lawful fix is hosting an API endpoint somewhere
  reachable from Russia, which raises data-localisation (Federal Law 242-FZ)
  and sanctions questions. Flag for the owner, don't build speculatively.

## 6. Metadata across scripts and languages

### 6.1 A concrete bug in today's matcher

`titleTokensRaw` in `worker/src/index.js` does
`toLowerCase().replace(/[^a-z0-9\s]/g, ' ')`. For a Cyrillic, CJK, Arabic or
Persian title every character is stripped, so `titleTokens` returns `[]`
and `titleOverlapRatio` returns 1 ("nothing to compare, don't penalize").
The dominant title-relevance weight and the hard title filter therefore do
nothing for non-Latin titles, and the pick falls to channel and view-count
signals - the same failure mode the code comment describes for "i n i".
`albumNorm`, `normTitle` and `artNorm` have the same `[^a-z0-9]` pattern.
Some newer helpers already use `\p{L}\p{N}` with the `u` flag, which is the
fix: tokenise on Unicode letters/digits, and for CJK (no spaces) compare
character bigrams instead of words. Worth doing on its own, independent of
any regional source, because YouTube is where Russian, Chinese, Japanese and
Korean music is matched today for everyone else.

### 6.2 Matching across scripts

The same song shows up as "Кино - Группа крови", "Kino - Gruppa krovi" and
"Kino - Blood Type" depending on source and storefront. Options, cheapest
first:

1. **Search in the source's own script.** Query YouTube/Rutube/Bilibili with
   the original title; uploaders in the region use it. Already the default.
2. **Compare on a folded form.** Score both the original and a
   transliterated Latin skeleton (Cyrillic -> Latin with a fixed table;
   Chinese -> pinyin; Japanese kana -> romaji) so a Latin-script upload
   still earns title overlap. Small libraries exist (`cyrillic-to-translit-js`,
   `pinyin-pro`, `wanakana`); kanji readings are ambiguous and need a
   dictionary (`kuroshiro`), which is too heavy for the client and should live
   in the worker if at all.
3. **Use known aliases.** MusicBrainz stores artist aliases with a locale and
   a "primary for locale" flag, so "Кино" <-> "Kino" can be looked up rather
   than guessed. Apple Music storefront links (`/ru/`, `/cn/`, `/jp/`) also
   return localized names; the worker currently forces `Accept-Language:
   en-US`, which pushes everything toward English names - fine for YouTube
   matching, but a regional source search may want the native name.
4. **Don't machine-translate for matching.** "Blood Type" will not find a
   Rutube upload titled "Группа крови". Translation is a display feature,
   not a matching tool.

### 6.3 Does ISRC solve it?

Partly. An ISRC identifies a recording across licensed services regardless
of script. EBBLESS already gets ISRCs from Deezer (`deezerMetrics`) for BPM
lookups; MusicBrainz supports `/isrc/<code>` lookup; the Apple Music API and
Spotify Web API expose them. So ISRC is a good way to:

- confirm two metadata records are the same recording,
- fetch the canonical native-script and Latin titles/artists (MusicBrainz),
- pick art and duration reliably.

It does **not** find a playable source on YouTube, Rutube, Bilibili or
SoundCloud: none of them offers ISRC search to third parties, and user
uploads don't carry one. Yandex Music and NetEase have no public ISRC
lookup either. Use ISRC to improve the *query and the scoring*, not as a
replacement for search.

### 6.4 Translating or transliterating what's displayed

| Option | Cost | Quality | Recommendation |
|---|---|---|---|
| Show original metadata (today) | None | Exact | Keep as default |
| Optional Latin transliteration line under the title (setting or tooltip) | Small (rule tables, client-side for Cyrillic/kana/pinyin) | Good for Cyrillic/kana, OK for pinyin (no tones), weak for kanji | Good next step for non-native readers |
| Official localized names via MusicBrainz aliases | Worker call per artist, cacheable | Accurate where data exists, sparse for small artists | Nice for artist names |
| Machine translation of titles | API cost or an LLM call through the worker | Lossy, often wrong for song titles and names | Avoid by default; at most an opt-in "translate" tooltip, clearly labelled |
| Translate the EBBLESS UI itself (ru/zh/fa) | Medium: string extraction from one large `index.html`; RTL layout for Persian | n/a | Separate backlog item; worth it only if the backend is reachable from those regions |

Lyrics (`/lyrics`, LRCLIB) are a separate case: transliteration of
lyrics lines is useful to sing along, translation of lyrics has copyright
implications - leave alone.

## 7. Recommendation (prioritised)

1. **Fail clearly** (small, compliant, helps everywhere): YouTube IFrame API
   load timeout + `onerror`, act on embed error codes, timeouts on worker
   calls, and a plain "not available on your network" state. No new
   sources needed.
2. **Fix non-Latin matching** in the worker's tokenisers (`\p{L}\p{N}`,
   CJK bigrams, a transliterated second pass). Improves matches for
   Cyrillic/CJK music for every listener, including people outside the
   blocked regions.
3. **Add worker-side country + client hints** (`request.cf.country`,
   timezone, language) for diagnostics and to order fallbacks. Hints only.
4. **Link-outs before embeds** for licensed regional services: "Open in
   Yandex Music / NetEase Cloud Music / Apple Music" built from a search URL
   (no scraping, no unofficial APIs). Honest, low risk, keeps the listener's
   path to the music.
5. **One extra controllable source** if the owner wants more coverage:
   Audius (free API, open terms) first; Rutube or Bilibili only after
   reading their embed terms and accepting the same user-upload match risk
   as YouTube.
6. **Decide on Russia hosting separately** (see Open questions). Without a
   backend reachable from Russia, items 4-5 can't help Russian listeners on
   throttled or whitelisted networks.

Avoid:

- Reverse-engineered APIs (Yandex Music, VK audio, Zvuk, QQ Music, NetEase
  community APIs): ToS violations, need user tokens, break often.
- Anything that helps listeners evade a national block (VPN prompts,
  proxies, mirrors, domain fronting).
- Integrations with sanctioned entities (Sberbank/Zvuk; Iranian companies)
  without legal review.
- Hidden iframes for new sources: repeats the YouTube compliance issue
  already flagged in `docs/PLATFORM-AUDIT.md`.

## 8. Open questions for the owner

1. Is Russia a target market, or was the issue about travellers / a few
   testers? Serving Russia properly means a backend reachable from Russia
   (Russian or whitelisted hosting) with data-localisation and sanctions
   implications - is that acceptable at all?
2. Is "Open in <regional service>" (link-out) an acceptable experience, or
   must everything play inside EBBLESS?
3. Is a smaller independent catalog (Audius, Internet Archive) worth adding
   as a fallback even though it won't cover most mainstream tracks?
4. Should Rutube / Bilibili be treated like YouTube under the option-D risk
   acceptance, or held to stricter (visible player) rules from the start?
5. Is UI translation (Russian, Chinese, Persian) in scope, or only track
   metadata?
6. For display metadata, default to original script with optional
   transliteration (recommended), or prefer official English names where
   known?
7. Does the owner want region-based analytics (`cf.country`) on worker
   calls, given the privacy notice implications?
