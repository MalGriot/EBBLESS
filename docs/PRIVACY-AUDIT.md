# Privacy audit (2026-10-18)

Basis for `privacy.html` and `terms.html`, the Personalized listening switch,
Reset listening profile and Delete cloud data. Every row below was read from
the code (`index.html`, `worker/src/*`). Keep this file and `privacy.html` in
step when a data practice changes.

## Data inventory

| Data | Where | Leaves the device? | Notes |
|---|---|---|---|
| Library, pins, playlists, Liked Songs, play counts | localStorage (`ebbless:library`, `ebbless:playlist:*`, ...) | Yes, if signed in with Google (KV `PROFILES`, `profile:<google sub>`, with email) | Removals kept as tombstones 180 days |
| Settings (`PROFILE_SETTING_KEYS`) incl. new `ebbless:personalize` | localStorage | Yes, if signed in | |
| Thumbs-downs `ebbless:declined` | localStorage | Yes, if signed in | Explicit feedback |
| Play log `ebbless:playLog` (per track/playlist/podcast/feature time, active days) | localStorage | Yes, if signed in (synced setting key) | Feeds the tester recap. Not gated by the switch. |
| Taste `ebbless:taste` (1,500 songs: days, finishes, skips) | localStorage | No | Gated by switch; erased by Reset |
| Genre-pair graph `ebbless:graph`, tag cache, discover-recent | localStorage | No | Same |
| Seed history `ebbless:playHistory` (400 plays) | localStorage | No | Same |
| Visible play history `ebbless:playhistory` (500 plays) | localStorage | No | User-facing list. Not gated, not reset. |
| Pool signal: up to 8 tags + weight | `POST /pool/signal` -> KV `TASTE_POOL` counters | Yes, unless switch off | No identifier sent or stored (IP is visible to Cloudflare) |
| Tag lookups: title + artist | `GET /tags` | Yes | Only when a play/like/skip needs tags |
| Beta usage counts (`ebbless:stats`) | `POST /beta/activity` -> Google Sheet | Yes, only with tester token, not localhost | Counts only. **No UI opt-out** (console `ebblessStats.off()` only). |
| Beta sign-up: name, email, answers, user agent | `/beta/signup` -> Google Sheet | Yes | Manual deletion only |
| Feedback / tester / wrong-song reports | `/report`, `/tester-report` -> KV `MATCH_REPORTS` / Sheet | Yes, when sent | Include device/OS/browser/viewport |
| Login session | KV `sess:<hash>`, 90-day TTL | Yes | Token hash only |
| Now-playing handoff (queue summary, position per device) | inside the cloud profile | Yes, if signed in | |
| Device ID `ebbless:deviceId` | localStorage | Inside handoff data only | |
| Spotify token / Last.fm username | localStorage | Sent to those services | |

Third parties: YouTube (embed + search), Google Sign-In, Spotify, Apple
iTunes, SoundCloud, Last.fm, MusicBrainz, ListenBrainz, Wikidata, Cover Art
Archive, Deezer, ReccoBeats, GetSongBPM, LRCLIB, SponsorBlock (4-char hash
prefix), Cloudflare (Worker, KV), GitHub Pages, jsDelivr. No ad or analytics
SDK was found (grep for gtag, Sentry, plausible, fbq: none).

## What changed in code

- `personalizeOn()` (`ebbless:personalize`, default on, profile-synced) gates:
  `recordListenSignal` (graph + pool), `noteTaste`, `recordLatestPlayed`
  (history write), and the reads `graphPairScore`, `graphConfidence`,
  `tasteProfile` (taste part), `listenSeedHistory`, `fetchPoolAffinity`.
  Off keeps stored data unused. Liked songs and thumbs-downs still apply (explicit).
- Reset listening profile clears graph, taste, declined, tag cache,
  discover-recent and seed history through `lsDel`, two taps, nothing else.
- `POST /profile/delete` (`worker/src/profile-delete.js`, tested in
  `worker/test/profile-delete.test.mjs`) + Account row "Delete cloud data".
  **The Worker must be deployed before the button works** (an old Worker
  returns 404 and the app shows an error toast and deletes nothing).
- Links: Settings > Privacy & data, beta lock screen, sign-in nudge card,
  beta sign-up form, welcome page.

## Not done, needs backend or the owner

1. Beta Sheet rows (sign-up, analytics, feedback) have no deletion path.
   Needs an owner process or a Sheet-side script.
2. Beta usage counts have no Settings switch. Adding one is small
   (`STATS_OFF_KEY`), but the task said not to touch analytics, so it is left.
3. The `betalink:<sub>` KV entry (Google account to tester token) is not removed
   by Delete cloud data, to avoid locking a tester out. Decide.
4. No data export. No retention job beyond 90-day sessions and 180-day tombstones.
5. Delete cloud data does not stop another signed-in device re-uploading.
6. Cloudflare/Worker log retention and the Sheet's access list are unverified.
7. Native Android wrapper (`android-webview/`) native permissions and any
   native-side storage were not audited here.
8. Operator legal name, contact email/postal address, governing law, minimum age.

## Compliance assessment (not legal advice; confirm with a lawyer)

- **Apple App Store** (out of scope per project decision, noted for completeness):
  requires a privacy policy URL, App Privacy labels, and in-app account deletion
  if accounts can be created in-app (Guideline 5.1.1(v)).
- **Google Play** (native Android is currently sideload only): Data safety form,
  privacy policy URL, and an in-app plus web account/data deletion path if the
  app has accounts. Likely disclosures: email, user IDs, app activity (play log,
  taste), user content (playlists), diagnostics/crash and feedback data.
  Account-creation = Google Sign-In, so the Delete cloud data path matters.
- **GDPR/UK GDPR** (beta users may be in the EU/UK): needs a lawful basis,
  controller identity and contact, transfers (Cloudflare, Google), access/export
  and erasure handling, and a decision on whether listening-based
  personalization is profiling needing consent. The toggle is default on.
- **CCPA/CPRA**: notice at collection and deletion/know requests. EBBLESS does
  not sell or share data for advertising as far as the code shows.
- **COPPA / age**: no age gate. Decide a minimum age.
- **Third-party terms**: YouTube API Services (privacy policy, link to Google's
  policy, user bound to YouTube ToS), Spotify developer policy (OAuth scopes,
  data use), Last.fm and others' API terms. Needs reading against actual use.
- **Consent**: no cookie banner exists. EBBLESS sets no cookies itself; YouTube
  embeds may. EU users may need a consent step before loading the YouTube player.
