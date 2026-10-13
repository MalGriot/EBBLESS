# Interactive sample ("try EBBLESS for 15 minutes"): audit and plan

Planning only. Nothing in the app, worker, routing or deployment was changed.
Written 2026-10-13 against `main` at `4bdc128`. Line numbers are for
`index.html` (1.49 MB, ~26,150 lines) unless a path says otherwise; they will
drift, so search the named symbol.

Related, already shipped: `welcome/` (README "Welcome page") is a *generated
imitation* of the player (`welcome/app-demo.html`, 4,655 lines, built from
`index.html` by `scripts/build-landing-demo.py`) with a one-song "Try it". The
sample described here replaces the need for that imitation. See Decisions.

## 1. Current architecture

**Hosting and routing.** Static GitHub Pages site for `MalGriot/EBBLESS`,
served under `/EBBLESS/`. No workflow file, no build step, `.nojekyll` present;
the repo root is the site. (The Pages source setting is not visible from the
repo, so confirm it is "deploy from branch".) Paths today:

| URL | File | Role |
|---|---|---|
| `/EBBLESS/` | `index.html` | The app. Beta lock is its first element. |
| `/EBBLESS/beta/` | `beta/index.html`, `beta/beta.js` | Signup. `#join` opens the form (`beta/index.html:321`). |
| `/EBBLESS/beta/tester.html?t=` | | Active tester page. |
| `/EBBLESS/welcome/` | `welcome/` | Marketing story + one-song test. CTAs go to `../beta/#join` and `../`. |
| `/EBBLESS/sw.js` | `sw.js` | Service worker (`CACHE_VERSION`, bump per deploy). Navigations network-first. |

There is no router. The app reads query params (`?intro`, `?mal`, `?t=`,
`?backend=`, `?wrapped=`) and strips some with `history.replaceState`.

**Backend.** One Cloudflare Worker (`worker/src/index.js`), CORS `*`. Playback
data routes (`/search`, `/playlist`, `/album`, `/ytplaylist`, `/soundcloud`,
`/similar`, `/tags`, `/lyrics`, `/artistinfo`, ...) are anonymous. Beta routes
live in `worker/src/beta.js` and the Sheet (Apps Script) is the source of truth.

**Beta access (do not change).**
- Lock script at the top of `<body>` (`#beta-lock`, ~line 2890 to 3103). Visible
  by default, hidden synchronously if `ebbless:betaToken` was verified within
  7 days (`ebbless:betaOk`, `FRESH_MS`), re-checked against `POST /beta/me` on
  every load. `404` clears the token and re-locks; offline with a prior
  verification stays open.
- Bypasses: `localhost`/`file:`, and `?mal` (sets `sessionStorage
  ebbless:gateSkip`, also bypasses the mobile install gate).
- Google sign-in claims a token (`/beta/claim`) under a 14-day lease
  (`BETA_LEASE_MS`, `worker/src/beta.js:337`).
- Two-week window: `BETA_WINDOW_MS` = 14 days from the feedback email
  (`worker/src/beta.js:188`); `windowEndsAt` is cached in `ebbless:betaMe`.
  After it passes, one full song plays and then "TESTER WEEK UP"
  (~line 13946) freezes the app. Rejoin goes through `/beta/rejoin`.
  (The README still says "7 days" in places; the code is 14.)
- The lock screen already has "JOIN THE BETA" (`href="beta/"`) and a
  "See what EBBLESS is" link to `welcome/`.
- It is client-side only. The worker's playback routes are already public, so
  a sample adds no new exposure, but it will bring far more anonymous traffic.

**Boot flow** (end of main script, ~line 26060 to 26105). Order: `?introBeat`
capture, `?intro` preview, **mobile install gate** (`mobileInstallGate &&
!isIPhone` shows `showInstallGate()`), then returning-user branches, then a
first visit with empty storage lands on `showSplashChoice()` (the
Tutorial/Enter splash: `#splashPlayTutorial`, `#splashSkipTutorial`).
`startApp()` is at ~24035.

**Tutorial.** `runIntro(preview)` (~24375). The top-bar `#helpBtn`
(`index.html:3193`, "Play tutorial") calls `replayTutorialBtn.click()` which
does `pausePlayback()` then `runIntro(true)` (~14295). `preview=true` never
writes `ebbless_onboarding_complete`; any start writes
`ebbless:tutorialWatched`. It has Skip, a chapter pager (`#onbPager`), its own
theme music (`#onbMusic`), a spotlight element (`#onbSpotlight`, `#onbBackdrop`)
and cancel support (`cancelPrevIntro`). Open idea **Geethub #461** ("if they've
never played the tutorial, the button should blink") is the same blink we need.

**Playback.** Two-deck engine (`decks`, `createDeckPlayer`, `loadIntoDeck`):
YouTube IFrame players (matched via worker `/search`, muted-start plus a 5 s
ad-wait heuristic) or SoundCloud widgets. Spotify and Apple Music are metadata
only, matched to YouTube. Details and platform-terms exposure:
`docs/PLATFORM-AUDIT.md`, README "The ad filter", "SoundCloud native playback".
`pausePlayback()` at ~20423. Same-origin tabs coordinate through a
`BroadcastChannel('ebbless:playback')` (~20979): starting playback in one tab
pauses the others.

**Discover.** Queue "keep playing similar songs" flag per playlist
(`ebbless:discover:<id>`), plus Swell/Blend daily playlists (~14522 on). Uses
worker `/similar`, `/tags`, `/ytmix`. State is localStorage.

**Persistence.** Everything is `localStorage`: 74 direct references plus the
`lsGet/lsSet/lsDel` wrappers (~5215), ~100 distinct `ebbless:*` keys (library,
playlists, liked, pins, settings, play log, stats, caches). `sessionStorage` is
used in 9 places (skip flags). IndexedDB/Cache API only hold the optional
on-device caption model (`ebbless-captions`, transformers cache).

**Side effects that leave the device.**

| Path | Trigger | Needs |
|---|---|---|
| `/profile/sync`, `/auth/session` | Google One Tap (GSI script in `<head>`) | Google session |
| `/beta/activity` (stats) | `statsEnabled()` = real host and a beta token | token |
| `/nowplaying` POST | signed-in | Bearer |
| `/tester-report` | feedback modal, vibe check | token (banner) |
| `/pool/signal` (~15129) | taste pooling, anonymous | none |
| `/report` (~23826) | "report a bad match", writes KV | none |
| `/podcaption/collect` | podcast captions | none |

## 2. Feature audit

| Feature | Implementation | Sample verdict | Change needed | Limits |
|---|---|---|---|---|
| Desktop 3-pane UI, mobile UI | CSS media queries in `index.html` | Works unchanged | None | Mobile portrait only (`#rotate-lock`) |
| Load Spotify/YT/SC/Apple links | `parseImportLink` plus worker | Works unchanged | None | Spotify and Apple load as metadata then match to YouTube. Worker-dependent. YouTube playlist feed shows ~15 newest videos only. |
| Playback (YouTube) | IFrame decks | Works unchanged | Stop on expiry | Real pre-roll ads (muted by heuristic, not removed). Needs a user gesture to start. Background audio on iOS Safari tabs is unreliable. |
| Playback (SoundCloud) | SC Widget | Works unchanged | None | First track may need a tap (README, unresolved). Open bugs #458, #459. |
| Podcasts | `/podcast`, audio element | Works | Consider disabling captions download in sample | #333 podcasts muted (open). Caption model is a large on-device download. |
| Discover, Swell, Blend | localStorage + `/similar` | Works | None | Swell/Blend regenerate from local history, so a fresh sample starts cold. |
| Library, playlists, Liked | `lsSet` | Works, in isolated storage | Storage shim (section 5) | Lost at tab close (decision). #406: no cap on playlist size. |
| Player, LP, cassette, cymatics, lyrics, flow, ambient | In-page | Works unchanged | None | Heavy canvas/video on low-end phones. |
| Settings | In-page | Works | Hide/relabel: Account/Google sign-in, Feedback, install rows | See section 5. |
| Tutorial | `runIntro` | Works unchanged | Highlight and blink on first entry | Plays theme music, counts against the 15 min. |
| Google sign-in, profile sync | PROFILE SYNC (~5237) | **Not available** | Disable init in sample, show honest "Join the beta to sync" | Would write to a real account. Cannot be sandboxed. |
| Cast, PiP mini player, AirPlay | Browser APIs | Works | Stop/close on expiry | Cast SDK loads lazily; end session on expiry. |
| Install banner / PWA | `ebbless:install-available` | **Hide** | Suppress in sample | An installed copy would open the real app (`start_url`). |
| Beta feedback, vibe check, tester banner | token-gated | Hidden naturally (no token) | Verify | |
| Taste pool, report-a-match | `/pool/signal`, `/report` | **Disable** | Gate on `SAMPLE` | Anonymous KV writes; free-tier put cap (README). |
| Stats / play log recap | `statsEnabled()` | Off naturally | Verify no `/beta/activity` | |

Nothing found that needs a new backend for v1. A server-side trial guard would
(section 4).

## 3. Recommended architecture

Smallest change that keeps one implementation: **a `SAMPLE` flag inside
`index.html`**, no copy of the UI.

1. **Entry.** `sample/index.html`, a ~40 line loader. It decides who is a beta
   user (below), then boots the real `index.html` with `SAMPLE = true`.
   Two ways to boot (Decision 1; spike both, an hour):
   - **A (preferred):** stub fetches `../index.html`, injects `<base href="../">`
     and a head script that sets `window.__EBB_SAMPLE = true` and installs the
     storage shim, then `document.write`s it. URL stays `/EBBLESS/sample/`.
     One source of truth, no build step. Caveats: ~6 `location.pathname` uses
     (share URL ~14309, `replaceState` ~3022/11912/11938, ~9919) must be
     sample-aware; `sw.js` registration and `manifest` resolve via `<base>`.
   - **B (fallback):** stub does `location.replace('../?sample=1')`. Trivial and
     robust, but the address bar shows the app URL.
   - Rejected: iframe the app (shared storage, autoplay/gesture and PiP
     problems, two scroll contexts), or a build step that copies `index.html`
     (re-creates the welcome-page drift problem).
2. **Early flag block** at the very top of `index.html` (before the beta lock):
   `const SAMPLE = !!window.__EBB_SAMPLE || /[?&]sample\b/.test(location.search)`.
   When true: skip the beta lock (like `gateSkip`), skip the mobile install
   gate, skip GSI/One Tap init, install the storage shim.
3. **Boot override.** In sample mode the boot chain goes straight to
   `discardIntroChrome(); startApp();` (not `showSplashChoice()`), so the real
   UI is visible immediately. Then the sample intro layer runs.
4. **Sample module** (one `/* SAMPLE MODE */` section, ~250 lines): trial clock,
   countdown pill, intro highlight, warning, expiry overlay, playback guards.
   All of it inert when `SAMPLE` is false, so the real app path is unchanged.
5. **Reuse, not rebuild:** `#helpBtn`/`runIntro`, `#onbBackdrop`/`#onbSpotlight`
   styling, the toast system, `#beta-lock` CSS tokens for the overlay look.
   Blink is a shared `.nav-btn.is-nudge` class, which also closes #461 for the
   real app (shown whenever `tutorialWatched` is false).

## 4. Trial lifecycle

**Entry.** Page loads, real UI renders. Everything outside `#helpBtn` is dimmed
by a click-catching layer; the button blinks; a bubble reads "You should start
here." Two controls: the button (starts the tutorial) and a small "Explore on
my own" (dismiss). Esc and a click on the dim layer also dismiss. Neither
starts the clock. The visitor can read, tour the tutorial, browse, import and
queue music for as long as they like; time is not spent until a track plays.

**Start (decided 2026-10-13): the first real track that plays.** The clock
starts the first time the active deck is actually playing a queue track in the
sample, not on any tutorial or dismiss action. Reuse the existing signal the
play log uses (`playLogTick`, ~13836): `artworkWrap.classList.contains
('is-playing')` while `body` is not `.onb-active` and the queue has a current
track. That excludes the tutorial's own theme music (`#onbMusic`, not a queue
track) and any play request that is still loading or sitting behind the
pre-roll mute (the app only sets `is-playing` once the deck reports PLAYING).
Hook it with a one-shot observer on that class (or a call from the same place
that sets it), so no player code is duplicated. On that moment write
`{ v: 1, id: <uuid>, start: Date.now() }` to key `ebbless:sampleTrial`. This is
the one key written to **real** `localStorage` (the shim lets this key through)
and it is mirrored to a first-party cookie (`ebbless_sample=<start>`, 30 days,
`SameSite=Lax`) so clearing one store alone does not reset it. Tutorial can be
reopened any time (`#helpBtn` is untouched). Before the start, the top-bar pill
shows "15:00 starts when you press play" so the rule is visible; no countdown
runs.

Consequences: a visitor who never plays gets no expiry (nothing useful is
lost, the product is the listening); loading a link that auto-plays, or the
Swell/Discover autoplay, starts it too, as it should. SoundCloud's first track
may sit paused until tapped (README); that tap is what starts the clock.

**Running.** Once started, a `1s` tick computes `remaining = 15min - (Date.now() - start)`.
It also recomputes on `visibilitychange` and `pageshow`, so a sleeping laptop
or background tab cannot hold time. Pausing music, menus, navigation never
touch it. Countdown is a small pill in the top bar (`m:ss`); phone layout needs
a placement that fits the right cluster (history, tutorial, feedback, #372).

**Refresh / reopen.** Boot reads `ebbless:sampleTrial` (or the cookie). If
`start` exists, resume the countdown and skip the intro layer. If expired,
open the overlay immediately and block playback. The library state is not part
of this record (section 5).

**Warning.** At `remaining <= 120s`, one toast ("2 minutes left in the sample")
and the pill turns accent-colored. Once only (flag in the trial record).

**Expiry.** At 0: set `expired: true` in the record, then
`pausePlayback()`, cancel any running tutorial (`cancelPrevIntro`), end cast
and close PiP, clear Media Session action handlers, make `#app` `inert`, and
add a guard at the top of `playIndex`/import/discover entry points as a
backstop. Show a modal over the still-visible UI (dim, not hidden). Copy:

> You've reached the edge of the sample.
> You've had a taste of EBBLESS. The full experience is waiting for you.
> Join the beta to keep listening, explore your music and make EBBLESS your own.
> **Join the beta**

CTA href: `../beta/#join` (verified: `beta/index.html:321` opens the form on
`#join`; the lock screen and welcome page use the same target). Secondary text
link: "Already approved? Open EBBLESS" to `../`. If `GET /beta/status` (as in
`welcome/welcome.js`) says the beta is full, the CTA label becomes "Join the
waitlist", same as the welcome page does today. The overlay has no dismiss.
The session is not erased and nothing redirects on its own.

**What storage can and cannot enforce.** The record lives in the visitor's
browser, so it holds against refresh, tab close, reopening, and a casual
"clear cookies". It does **not** hold against: private/incognito windows,
"clear all site data" (the cookie and the key are both site data), a different
browser, a different device, or an edited system clock (we trust
`Date.now()`). Safari's tracking prevention also expires script-written
storage after ~7 days without interaction, so a Safari visitor can get a
fresh trial after a week away. This is a **soft** limit, not one trial per
physical device. The only way to harden it is a server-side counter keyed by
IP (hash) in the worker, which brings privacy questions, shared-IP false
positives (offices, mobile carriers) and KV free-tier write limits. Not
recommended for v1; it would be a worker change plus a new route.

## 5. Data isolation

**Principle:** the sample runs the real app against a *different storage*, so
no feature needs per-call changes.

- **Storage shim.** The head script defines `window.localStorage` as a
  `Storage`-like object backed by `sessionStorage` under the prefix
  `ebbless-sample:`. All 74 direct uses and `lsGet/lsSet` then hit it with zero
  edits. It survives refresh in that tab (so a refresh does not wipe the
  visitor's playlists) and vanishes when the tab closes. Real `localStorage` is
  never read or written except `ebbless:sampleTrial` (and reading
  `ebbless:betaToken`/`betaOk` in the stub only). Decision 3: persist
  playlists across tab close or not.
- **Existing beta user's data is untouched** because the shim starts empty and
  never reads their real keys. Their `betaToken` is invisible to the app, so
  stats, feedback and profile sync cannot fire under their identity.
- **Network writes to gate** on `SAMPLE`: Google One Tap and `/auth/*`,
  `/profile/*`, `/nowplaying`, `/pool/signal`, `/report`, `/podcaption/collect`.
  Settings rows for sign-in, feedback and install are hidden or replaced by
  "Join the beta" (not left as dead controls).
- **Starter library** still seeds through the app's normal path (it is the
  fresh-install experience, and is real data).
- **Imports and temporary playlists** are ordinary shim writes: real
  functionality, discarded with the tab.
- **Auth.** None created. No sample token, no account. Sample users have no
  identity, so there is nothing to sync and nothing to attribute.
- **Not isolated:** worker-side caches (shared, harmless), the caption model
  in IndexedDB/Cache API (a download, not user data; consider leaving the
  podcast caption feature off in sample to avoid the large download), and the
  cross-tab `BroadcastChannel` (a sample tab and a real-app tab will pause
  each other; acceptable).

## 6. Routing plan

| Visitor | Goes to | Mechanism |
|---|---|---|
| Anyone, new | `/EBBLESS/sample/` | New. Linked from the lock screen ("Try it for 15 minutes") and `welcome/`. |
| Beta user (valid token) opening the sample | `/EBBLESS/` | Stub reads real `ebbless:betaToken` + `ebbless:betaOk` (fresh < 7 days, same test as the lock) or a live lease, then `location.replace('../')`. No new network check; the real app's lock re-verifies and handles revoked/expired/2-week states exactly as today. |
| Sample visitor, trial over or wants in | `/EBBLESS/beta/#join` | Overlay CTA. |
| Approved tester | `/EBBLESS/?t=<token>` | Unchanged invite link. |
| Existing app | `/EBBLESS/` | Unchanged. Lock, signup, approval, 2-week expiry, rejoin untouched. |

Limits of recognition: an iPhone home-screen app, a different browser or a
cleared browser has no token, so that tester sees the sample until they use
the invite link or Google sign-in on the real lock. The sample overlay's
"Already approved? Open EBBLESS" covers that. `sw.js` needs a `CACHE_VERSION`
bump on release; the sample page must not register an install prompt.

## 7. Mobile considerations

- Same app, same responsive layout, portrait only. The sample bypasses the
  **mobile install gate** (#262: phones in a browser tab otherwise get only an
  install screen), and must not offer install.
- iOS Safari: playback needs a tap; background/lock-screen audio from a
  normal tab is unreliable and may pause on screen lock, which also burns
  trial time. Say so honestly in the intro, not in marketing copy.
- In-app browsers (Instagram, TikTok): `installGateMode()` already detects
  them (`openout`). YouTube embeds and autoplay are flaky there. Show a small
  non-blocking "open in Safari/Chrome" hint when detected.
- First SoundCloud track may need a manual play tap (known, unresolved).
- Countdown pill and intro bubble must be checked at 320 to 430 px and with
  the on-screen keyboard open (paste bar).
- Battery/CPU: canvas visualizers plus two YouTube iframes. No extra players
  are introduced as long as the sample is a top-level page, never nested in
  `welcome/`.

## 8. Phased implementation

| # | Task | Depends on | Test / acceptance |
|---|---|---|---|
| 0 | Spike: loader A vs B on a Pages-like server. Confirm `<base>`, SW scope, `replaceState`, share URL. | none | Page boots from `/sample/` with no console errors, or B chosen. |
| 1 | `SAMPLE` flag, skip beta lock, skip install gate, skip GSI, boot to `startApp()`. | 0 | Fresh profile: real UI visible at once on desktop and 390 px. Normal URL byte-for-byte unchanged in behavior. |
| 2 | Storage shim plus gating of network writes. | 1 | After a session with imports, likes and settings: real `localStorage` has only `ebbless:sampleTrial`. DevTools network shows none of the section 1 write routes. A real beta user's keys unchanged. |
| 3 | Trial record, clock, pill, resume on refresh, cookie mirror. | 1 | Press play, refresh, close, reopen: same remaining time. Before any play, refresh leaves the sample unstarted. Pause/menus do not change it. Expired stays expired after refresh. Clearing only localStorage does not reset it. |
| 4 | Intro layer: dim, blinking `#helpBtn` (shared `is-nudge`, also fixes #461), "You should start here.", "Explore on my own". Start trigger is the first real track playing (section 4), not this layer. | 3 | No clock after dismissing, running the whole tutorial, importing or queueing. Clock starts within 1 s of the first queue track going `is-playing`, never from tutorial music. Tutorial starts and replays. Reduced-motion respected. |
| 5 | Warning at 2:00 and expiry overlay with playback guards. | 3 | Play a song, let it expire: audio stops within 1 s, controls inert, UI visible, CTA opens `beta/#join`. Cast/PiP/Media Session cleared. Tutorial mid-run is cancelled. |
| 6 | Beta recognition in stub. | 0 | Token holder lands on `/EBBLESS/`; no-token visitor stays. Revoked token falls to the real lock. |
| 7 | Entry links: lock screen and `welcome/` point to the sample; decide the fate of `welcome` "Try it". | 1 to 5 | Links resolve on production path. |
| 8 | Real-device pass: iPhone Safari, Android Chrome, desktop Chrome/Safari/Firefox, one in-app browser. YouTube, SoundCloud, Spotify import, Discover. | all | Checklist in the PR; known limits above confirmed, not hidden. |

Dev reset for testing: a console `ebblessSample.reset()` (same style as
`ebblessStats.off()`), or `localhost` only. Clearing site data resets a trial
anyway, so this opens nothing new.

## 9. Risks and open decisions

**Risks**
1. **Worker load and platform exposure.** The sample is a funnel to anonymous
   `/search` (YouTube scraping), `/similar`, SoundCloud and Spotify embed
   scraping. Each session can be hundreds of requests; Cloudflare free-tier
   request and KV limits, YouTube rate-limiting the worker IP, and the
   compliance points in `docs/PLATFORM-AUDIT.md` (muted autoplay, ad
   heuristic) all get more visible. Needs a number before launch: expected
   sessions per day.
2. **`document.write` loader (A)** is the least conventional piece; a Safari
   or CSP quirk could force B.
3. **Storage shim fidelity.** Any code that enumerates `localStorage` keys or
   uses the `storage` event needs a check. Large caches (`trackMatchCache`,
   `loudness`) count against `sessionStorage`'s ~5 MB.
4. **Soft enforcement** (section 4). Expect repeat trials.
5. **Mobile playback honesty:** iOS tab audio and in-app browsers will make
   some first impressions bad, and the clock keeps running.
6. **Open bugs that a stranger will hit:** #458 (SC via miniplayer), #459 (SC
   thumbs), #402 (load error), #333 (podcasts muted), #406 (no playlist cap).
7. **Two sources of truth if `welcome/` keeps its generated demo.**

**Decisions needed**
1. Loader: A (keeps `/sample/` in the URL, hackier) or B (redirect, robust)? I
   recommend A after the spike, B as the fallback.
2. Is a soft, browser-only trial acceptable, or do you want the worker-side
   IP counter in a later phase?
3. Should sample playlists survive closing the tab (namespaced real
   `localStorage`) or die with the tab (recommended)?
4. What happens to `welcome/`: keep the story but replace its one-song "Try it"
   with a link to the sample (recommended), or leave both?
5. Add "Try it for 15 minutes" to the beta lock screen next to "See what
   EBBLESS is"?
6. Disable podcast captions and report-a-match in the sample (recommended), or
   keep them?
7. Beta full (50/50): keep the sample open while the CTA reads "Join the
   waitlist"?

## 10. Spike result: loader A (2026-10-13)

`sample/index.html` (spike, not wired to anything) fetches `../index.html`,
injects `<base href="../">` and `window.__EBB_SAMPLE = true`, then
`document.write`s it. Tested on the local dev server in Chromium:

- Boots at `/sample/` with no console errors beyond the existing manifest
  warning. `document.baseURI` is the site root; images, manifest and
  `sw.js` registration (scope = site root) all resolve correctly.
- Refresh and direct load of `/sample/` work. The address bar stays `/sample/`.
- `location.origin + location.pathname` (share URL) returns `/sample/`, so
  the share/`replaceState` call sites need the sample-aware tweak in section 3.
- Not yet tested: **Safari/WebKit and Firefox.** The app uses `url(#id)`
  SVG paint references (the cassette mode: `.cs-shell`, `.cs-glass`, etc.,
  about 17 places). Under a `<base>` element, some WebKit versions resolve
  `url(#id)` against the base URL instead of the document, which would
  leave the cassette unpainted. Needs a real Safari check. If it fails,
  options are rewriting those references to absolute `url(/EBBLESS/sample/#id)`
  at load, or falling back to loader B (redirect), which has no such issue.

## 11. Status (2026-10-13)

Built and checked in Chromium (desktop 1440 and a 480 px phone layout):
loader, flag, storage shim, network backstop, intro (dim, blinking tutorial
button, "You should start here."), clock starting on the first real track,
refresh resume, 2:00 warning, expiry screen, expired-stays-expired on reload,
beta-token redirect and `?sample=force`, lock-screen link. Not done: Safari/
WebKit and Firefox pass (the `url(#id)` under `<base>` question, section 10,
and whether `window.localStorage` can be shadowed there), real iPhone and
in-app-browser checks, `welcome/` hand-off (decision 4), Discover/SoundCloud
walk-through under the shim.
