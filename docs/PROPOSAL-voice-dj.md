# PROPOSAL: Voice DJ, a natural-speech music assistant (Geethub #553)

Status: proposal only. No app code changed. Direction is owner-approved (see
section 0). Nothing here has been run on a device; section 14 lists exactly
what can and cannot be verified without hardware.

Background reading: `docs/PROPOSAL-depth-meter.md` (how Discover picks songs),
`docs/deep-roadmap.md` (tiers), `android-webview/README.md`.

## 0. Owner decisions this proposal follows

1. Support both plain voice commands ("play X", "next", "something calm") and
   mood/arc sets (ecstatic-dance style: you say how it starts, how it ends and
   the intention, and it curates one continuous set; also "I just had a fight,
   need to rage or chill", "I'm hosting a party").
2. Freemium. Paid tier works better (better model, arcs, multi-turn, higher
   caps). Free tier is basic: local commands plus a small capped number of
   simple LLM requests.
3. The mic already exists on the search bar. Add a mic to the Android lock
   screen player (`FullScreenPlayerActivity`) and to the home widget
   (`EbblessWidget`). Not to the main in-app player.
4. Both offline and LLM. Local keyword parsing works with no network. The LLM
   handles fuzzy, mood and arc requests.

Tone rules from the project: fewest taps, always "songs", no chatbot persona,
one-line feedback, no paste fields.

## 1. What exists today

### 1.1 The search-bar mic (`index.html`)

- Button `#micBtn` (class `mic-btn`), inside `.import-row`, markup near line
  4226, behavior in `setupVibeMic()` (~line 17838). It is `hidden` unless
  `window.SpeechRecognition || window.webkitSpeechRecognition` exists.
- Flow: tap, `new SR()`, `lang = navigator.language`, `interimResults = true`,
  `continuous = false`. Interim text is written into `#urlInput`. On `onend`,
  the final text (max 250 chars) is cleared from the field, saved via
  `rememberPasteRecent`, and passed straight to `beginConversationalVibe(said)`.
  A spoken line that looks like a URL is left in the box instead.
- Errors: `not-allowed` / `service-not-allowed` shows "Microphone access is
  blocked..."; anything but `no-speech`/`aborted` shows "Couldn't hear that".
- Limits today:
  - Everything spoken is treated as a vibe sentence. "Next", "pause", "louder"
    are interpreted as a mood query and would build a playlist. There is no
    command path.
  - Web Speech on Chrome/Edge sends audio to a cloud recognizer (Google),
    needs network, and is unavailable in Firefox. Safari/iOS is out of scope
    (owner decision 2026-10-16: Android, Mac, PC only).
  - Unknown whether `webkitSpeechRecognition` exists inside the Android
    WebView shell. In Android WebView it is generally not implemented, so the
    button is probably hidden in the native app today. Must be checked on the
    TECNO POP 9 (open question 1). If it is hidden, phase 1 on Android needs a
    native recognizer bridge (section 4.2), not just page code.
  - Electron (Mac app): Chromium's Web Speech needs a Google API key baked into
    the build and usually fails in Electron. Treat the Mac app as "no mic until
    proven" (open question 2).
  - No wake word, no hands-free loop, no spoken reply, no conversation memory.

### 1.2 Conversational vibe search (the LLM path that already exists)

- Page: `looksConversational` (5+ words, or 3-4 with talk words) routes to
  `beginConversationalVibe(text)` -> `fetchVibeInterpretation` ->
  worker `GET /vibe-interpret?q=` (20 s client timeout) -> `playVibePlaylist`.
- Worker `handleVibeInterpret` (`worker/src/index.js` ~4007-4340):
  Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`, 9 s timeout,
  free tier, shared 10,000 neurons/day budget with the podcast captioner),
  with a deterministic keyword fallback (`vibeHeuristic`). Output:
  `{source, title, tags[], keywords[], energy, bpm, seeds{suggested,verified}, tracks[]}`.
  Model seed songs are checked against iTunes search and dropped unless
  artist+title match; tags are expanded with Last.fm `tag.getTopTracks`.
  Cached at the edge 7 days (AI) or 1 hour (heuristic) by normalized text. No
  per-user limit and no auth today; the sentence is not logged.
- Client side: re-ranks by `/metrics` mood match (`fetchTrackMetrics`,
  `metricSimilarity`), pads thin lists with `/similar` (`fetchSimilar`), and
  resolves each song to a playable YouTube match with `searchYouTubeCached`.
  `playVibePlaylist` writes an unsaved `custom` playlist (`custom-vibe-session`)
  and starts the queue; saved when the listener keeps it.

This is already 70 percent of "mood sets". What it lacks: a plan with an order
(an arc), duration, control commands, tiers, and any cap.

### 1.3 Discover, search, queue APIs the plan would drive

- Discover: `fetchDiscoverCandidates`, `maybeExtendDiscoverQueue`,
  `extendQueueWithDiscover` (`discover-ext:` queue entries). Seeded by the
  last played track. Re-rank passes include `applyMetricPreference` (BPM/energy
  from worker `/metrics`) and `applyTastePreference`.
- Search/matching: `searchYouTubeCached(title, artist, durationMs, opts)`
  -> worker `/search`. This is "the matcher": it returns a real playable
  video or nothing.
- Metrics: worker `POST /metrics` (BPM, key, energy; Deezer-backed
  `deezerMetrics` plus fallbacks). Free, already used by vibe search.
- Queue: `buildQueueFrom(startIndex, plId)`, `playNext(auto)`, `toggleShuffle`,
  `toggleLikeTrack`, `persistPlaylistObj`, `playVibePlaylist`. These are the
  only functions the plan executor should call (no new playback paths).
- Native control path (Android): lock screen, notification and widget buttons
  go `PlaybackService.control(action)` -> `Sink.send` ->
  `MainActivity` `evaluateJavascript("window.__ebbMediaAction(action)")`.
  `__ebbMediaAction` (index.html ~135) understands `play`, `pause`, `next`,
  `prev`, `like`, `seekto:<s>` only. There is no volume, shuffle, repeat or
  "play this text" action. The widget falls back to launching `MainActivity`
  with a `widgetAction` extra when no page is live.

### 1.4 Paywall, tier, identity: what exists

Searched the repo (worker, `index.html`, README, android README, roadmap):

- **No paywall, premium flag, or entitlement check exists in code.** Every
  "premium/subscriber" hit in the worker is about Spotify/podcast content.
- `docs/deep-roadmap.md` proposes tiers DEEP / FLOW / HORIZON and states
  billing goes through Patreon, with tester and Patreon status "managed
  manually in a sheet" and "new database before launch, not started". All
  entitlements there are "Proposed". The core listening experience is meant
  to stay free.
- Identity that does exist: Google sign-in. `verifyGoogleIdToken` accepts
  either a Google ID token or a first-party session token (`ebs1.` prefix,
  `worker/src/session.js`, 90-day sliding, stored hashed in the `PROFILES` KV
  as `sess:<hash>` with `sub`, `email`). `/profile/sync`, `/profile/fetch`,
  `/beta/*`, `/nowplaying` already use it. Owner check: `OWNER_EMAIL` secret.
  Beta testers: `worker/src/beta.js` (tester record, `window_days`, tokens),
  plus a Google Sheet via `SHEET_URL`.
- Android shell: sideloaded, no Google Play, so no Play Billing. Any payment
  is external (Patreon), consistent with the roadmap.

Plainly: there is nothing to verify a paying user today. Section 6 proposes the
smallest gate.

## 2. Product shape

Two layers, one mic.

1. **Command layer (local, offline, instant).** A small grammar in the client.
   If the transcript matches, it runs immediately with no network call and no
   LLM. Target under 300 ms after the final transcript.
2. **Intent layer (LLM via the worker).** Anything the grammar does not claim
   goes to `POST /voice/plan`. The LLM returns a structured plan; the app
   validates it and resolves real songs.

Rule: the LLM never sees "next" or "pause". The LLM never outputs a playable
track; it outputs intent and seed names that the matcher must confirm.

### 2.1 Local command grammar (works offline)

| Say | Action | Notes |
|---|---|---|
| play, resume | `play` | |
| pause, stop | `pause` | |
| next, skip | `next` | |
| previous, back, go back | `prev` | |
| louder, quieter, volume up/down | volume +/- 10 | WebView page volume only; see 4.2 for system volume |
| like, love this | `toggleLikeTrack` | |
| shuffle (on/off) | `toggleShuffle` | |
| repeat | repeat toggle | check existing repeat control name before build |
| more like this | Discover from current track | uses current queue seed, no LLM; works if Discover endpoints reachable |
| play <text> | search then play | "play Radiohead Creep": needs network for the matcher, no LLM |
| "something calm/hype/sad..." | mood keyword table to tags | single known mood word maps to the existing `vibeHeuristic` lexicon on the client; no LLM needed for one word |

Matching: lowercase, strip punctuation, strip filler ("please", "can you",
"the"), exact or leading-phrase match against a table, with a handful of
synonyms per command. Anything with 4+ words that is not a clear `play <x>`
goes to the LLM. Language: English first; table is per-locale so other
languages can be added without code changes (open question).

Offline behavior: commands in the table run. "play <x>" needs the network for
the matcher; offline it says "Offline - can't search new songs." and does not
fall through to the LLM. Mood/arc requests offline: "Needs a connection for
moods." (optionally queue the request and retry on reconnect, phase 2+).

## 3. The plan: schema, validation, resolution

### 3.1 Request (client to worker)

`POST /voice/plan`, JSON, with auth header (section 6):

```json
{
  "text": "start slow and warm, build to a peak at about 40 minutes, land soft. 90 minutes, ecstatic dance",
  "ctx": {
    "now": {"title": "Song", "artist": "Artist"},
    "recent": [{"t": "...", "a": "..."}],
    "queueLen": 12,
    "tz": "Asia/Kolkata",
    "turn": 1,
    "prev": null
  },
  "tier": "free|paid"
}
```

Context sent is minimal: current song, last 5 played (title+artist), no
library, no account profile. `prev` is the previous plan (paid multi-turn only).

### 3.2 Response (worker to client)

```json
{
  "v": 1,
  "kind": "commands | set | mood | clarify",
  "say": "Building a 90 minute set.",
  "commands": [{"op": "next"}, {"op": "volume", "delta": -2}],
  "set": {
    "title": "Ecstatic dance, slow to peak",
    "durationMin": 90,
    "seeds": [{"title": "...", "artist": "..."}],
    "tags": ["afrobeat", "deep house"],
    "avoidTags": ["metal"],
    "moods": ["warm", "grounded"],
    "arc": [
      {"at": 0.00, "energy": 3, "bpm": [90, 105], "note": "open"},
      {"at": 0.45, "energy": 9, "bpm": [122, 128], "note": "peak"},
      {"at": 1.00, "energy": 2, "bpm": [80, 95],  "note": "land"}
    ],
    "continuous": true
  },
  "clarify": null
}
```

Field rules:

- `kind`: `commands` (control ops only), `mood` (one flat vibe, like today's
  vibe search plus an energy target), `set` (has `arc`), `clarify` (one short
  question, paid only).
- `commands[].op` is an enum: `play pause next prev like shuffle repeat volume
  more_like_this seek stop`. Anything else is dropped.
- `energy` 0-10 integer; `bpm` optional `[lo, hi]` within 50-200; `at` 0-1
  fractions of the set, strictly increasing, 2 to 8 steps (free tier: 1 to 3,
  mood only).
- `durationMin` 10-240. Default 45 if absent. `seeds` 0-8. `tags` 0-6.
- `say` is the toast text, max 60 chars, no first person chat ("Building a 90
  minute set." not "Sure! I'd be happy to...").

### 3.3 Worker validation (server side, before the client sees it)

1. Parse JSON strictly (no code fences, no prose). On failure: one retry with
   a repair instruction on the paid model; then degrade to `vibeHeuristic`
   (kind `mood`) so the feature never hard-breaks, same as today.
2. Enum-check every `op`, clamp numbers, cap array lengths, strip control
   characters and URLs from all strings, force `say` length.
3. Seeds: reuse the existing iTunes artist+title verification and Last.fm tag
   expansion (`vibeGroundTracks`). Unverified seeds are dropped; the response
   reports `seedsVerified/seedsSuggested` (diagnostic only).
4. The client re-validates the same schema (cheap) because the response could
   be cached or tampered with. The executor only runs known ops.

### 3.4 No hallucinated tracks

The LLM supplies names, tags and numbers. A song only reaches the queue if:
(a) it came back from Last.fm tag/similar data or a verified seed, and
(b) `searchYouTubeCached` found a playable match. Unmatched songs are skipped
silently. If a set ends up with fewer than ~60 percent of its target length
matched, the toast says "Short set: 14 of 22 songs matched." rather than
pretending.

## 4. Speech to text per platform

### 4.1 Web (Chrome, Edge) - search-bar mic

Keep `SpeechRecognition` as-is, add a command pre-pass in `onend`: run the
local grammar first; only call `beginConversationalVibe` / `/voice/plan` when
the grammar does not claim the text. Add `continuous=false` unchanged. Add
`onsoundstart` timing to measure latency. Privacy: Chrome sends audio to
Google's recognizer; EBBLESS never receives audio, only the transcript.

### 4.2 Android app (WebView shell)

Do not depend on the page's Web Speech. Add a native bridge:

- `EbbNative.listen(requestId)` and `EbbNative.voiceAvailable()` on
  `MainActivity`, backed by `android.speech.SpeechRecognizer` (on-device where
  `SpeechRecognizer.isOnDeviceRecognitionAvailable()` is true on Android 13+,
  otherwise the system recognizer). Result returns to the page via
  `evaluateJavascript("window.__ebbVoiceResult(id, text, final)")`, the same
  pattern as `__ebbMediaAction`.
- Permission: add `RECORD_AUDIO` to the manifest, request at runtime on first
  mic tap, with a one-line rationale. The sideloaded app is not on Play, so no
  Play data-safety review, but the in-app consent text (section 11) still
  applies.
- `SpeechRecognizer` must be created and used on the main thread, and it
  requires the app to be foreground or have a visible activity (it fails from a
  pure background service). That drives sections 8 and 9.
- Volume: page `volume` only affects the embed player. For "louder/quieter" on
  Android, adjust the stream via `AudioManager.adjustStreamVolume(STREAM_MUSIC)`
  from the native layer, or the YouTube player volume through the page. Pick
  one (open question 5); stream volume is what a user expects from a voice
  "louder".
- Recognition quality and language: use `EXTRA_LANGUAGE_MODEL = free_form`,
  `EXTRA_PARTIAL_RESULTS = true`, `EXTRA_PREFER_OFFLINE = true` for the command
  attempt (fast, private), accept network recognition otherwise.

### 4.3 Mac/PC

PC browsers: same as Web. Mac Electron app: see 1.1; either confirm Web Speech
works with the app's build, or the mic stays hidden there (it already hides
when the API is missing). A local Whisper-class model is out of scope for now.

### 4.4 Privacy note (technical)

- Audio never goes to EBBLESS servers. Only the text transcript is sent, and
  only for requests the local grammar did not handle.
- The platform recognizer (Google on Chrome and most Android devices) may
  process audio off-device; on-device recognition is preferred where offered.
- Worker does not log transcripts (same stance as `/vibe-interpret` today).
  Per-user usage counters store counts and dates, not text.

## 5. LLM via the existing worker (key server side only)

- New route `POST /voice/plan` in `worker/src/` (new file `voice.js`, wired in
  `index.js` next to `/vibe-interpret`). The Anthropic API key lives only as a
  Worker secret (`npx wrangler secret put ANTHROPIC_API_KEY`); it is never in
  `index.html`, the Android app, or the Electron app. If the secret is missing
  the route falls back to Workers AI + `vibeHeuristic` so free tier keeps
  working.
- Use structured output / a tool-call schema rather than free text, with a
  short fixed system prompt (the schema, the op enum, the energy scale, "no
  chat, JSON only"). Prompt caching on the static system prompt keeps the input
  cost low.
- Timeouts: 4 s for the fast model, 10 s for the paid model; client toast
  "Still thinking..." after 2 s. Never block the local command path.
- Edge cache by normalized text (same as vibe) for context-free requests
  (`ctx.turn == 1`, no `prev`). Requests with `now`/`recent` context are not
  cached, to avoid cross-user leakage.

## 6. Tier gating and identity

### 6.1 What gates, concretely

| | Free | Paid |
|---|---|---|
| Local commands (section 2.1) | unlimited, offline | unlimited, offline |
| LLM requests | 5 per day, kind `commands`/`mood` only, 1 energy step | 100 per day (soft) |
| Model | small, cheap | stronger |
| Arc sets (`set` with 2-8 steps, up to 240 min) | no (offer the upgrade line) | yes |
| Multi-turn ("make it faster", "less vocals") | no | yes, up to 6 turns per session |
| Max set length | 1 song list (about 25 songs, same as today's vibe) | 240 min |
| Lock screen / widget mic | local commands only, plus the same 5 LLM/day | full |

The existing keyword/lexicon mood path (no LLM) stays free and uncapped, so
"something calm" never hits a paywall.

### 6.2 How the worker knows who is paying

Nothing exists. Smallest gate that fits the repo's decisions (manual Patreon
status in a sheet, Google identity already in place):

1. **Identity:** require the existing Google ID token or `ebs1.` session token
   on `/voice/plan` (`verifyGoogleIdToken`). Unsigned-in users: local commands
   only, plus the heuristic mood path. This also gives a per-user key for caps.
2. **Entitlement:** a new KV record in `PROFILES`, key `ent:<sub>` ->
   `{tier: "paid", until: <ms>|null, source: "patreon|tester|owner"}`. Seed
   it by hand or from the sheet the owner already maintains
   (`SHEET_URL`/`SHEET_SECRET` plumbing exists), via the existing admin route
   pattern (`/admin/...`, `ADMIN_TOKEN`). `OWNER_EMAIL` is always paid.
   Beta testers get `source: "tester"` for the length of their `window_days`
   so they can test the paid path.
3. The worker computes `tier` itself from `ent:<sub>`. The `tier` field in the
   request body is ignored; the client never asserts its own tier.

This matches `docs/deep-roadmap.md` open question 3 (manual status, no Patreon
sync at launch) and reuses the roadmap's "database" as one KV key family
instead of a new database. It will need to be reconciled when the DEEP/FLOW/
HORIZON design lands: voice DJ paid features map to one entitlement flag
(`voice_pro`) so the tier names can change without touching the worker logic.
Which named tier owns Voice DJ is an owner decision (open question 3).

## 7. Model choice and cost

Prices below are placeholders to size the budget, not quotes. Verify current
pricing and the model ids before building (`claude-haiku-5-5` is the
owner-named small model; the stronger model for paid is to be chosen).

Assumed per-request shape: system prompt about 700 tokens (cached after the
first call), user text plus context about 150 tokens, output about 250 tokens
for a mood plan and about 500 for an arc plan.

Assumed placeholder rates for sizing: small model about $1 per million input,
$5 per million output; stronger model about $3 per million input, $15 per
million output; cached input about 10 percent of input rate.

| Request | Tokens in/out | Small model | Stronger model |
|---|---|---|---|
| Simple intent (`commands`/`mood`) | 850 in (700 cached) / 250 out | about $0.0015 | about $0.0045 |
| Arc set, single turn | 900 in / 500 out | about $0.0034 | about $0.0102 |
| Multi-turn follow-up (adds prev plan) | 1,400 in / 500 out | about $0.0039 | about $0.0116 |

Per-user daily budget (cost ceiling, worst case at the cap):

- Free: 5 requests/day on the small model = about $0.0075/day per user at most;
  most users will not hit it. 1,000 active free users hitting the cap daily is
  $7.50/day. Realistic usage is a fraction of that.
- Paid: 100 requests/day soft cap, mixed 80 percent small / 20 percent strong
  = about $0.40/day at the absolute cap; typical heavy use (10 to 20 requests)
  is about $0.03 to $0.08/day. A paid price that covers about $1 to $2/month of
  inference is comfortable. A safe design is a hard stop at 100/day and a
  global daily spend ceiling (6.3).

Fallback cost is zero: Workers AI + heuristic when the LLM path is capped,
over budget, or down.

Honest unknowns: arc quality on the small model (does it produce a believable
energy curve?). Section 13 tests this before deciding if free tier gets the
arc teaser at all.

## 8. Arc builder algorithm (realistic version)

Goal: given `arc` (energy 0-10 over time), `durationMin`, `tags`, `seeds`,
`moods`, produce an ordered list of matched songs whose energy follows the
curve, with no gaps ("continuous").

### 8.1 Free data we actually have

- BPM, key, energy per track from worker `/metrics` (`deezerMetrics` and
  fallbacks), used today by `fetchTrackMetrics` / `metricSimilarity`. Coverage
  is partial: well-known tracks get values, obscure ones do not. Treat energy
  as a coarse proxy (low / mid / high), not a precise 0-10.
- Last.fm tags (`tag.getTopTracks`, `track.getTopTags`) as a mood proxy:
  "chill", "ambient" vs "dance", "high energy" and genre tags.
- Last.fm/ListenBrainz similar tracks to walk from a seed.
- Duration of each matched video (from the matcher) to fit minutes.
- MusicBrainz: no BPM/energy; useful only for disambiguation. Not a source.

### 8.2 Steps

1. **Pool.** Build a candidate pool of ~3x the needed song count from seed
   similars plus tag top-tracks, via the existing `vibeGroundTracks` logic.
2. **Annotate.** Call `fetchTrackMetrics` for the pool (one batch POST).
   Tracks without metrics get a tag-derived estimate (tag table: "ambient" ~2,
   "house" ~7, ...) and are flagged `estimated`.
3. **Slot the curve.** Expected songs N = durationMin / avg song length (use
   matched durations as they come in; start with 3.5 min). For slot i, target
   energy = linear interpolation of the arc at `i/N`, and target BPM likewise
   if given.
4. **Greedy fill with smoothing.** For each slot pick the unused candidate
   minimizing `|energy - target| + w_bpm * |bpm - target_bpm| / 20 +
   w_jump * |bpm - prevBpm| / 10 + w_key * keyClash`. Limit adjacent BPM jump
   to about 8 percent (or a harmonic half/double) so it mixes like a set.
5. **Resolve and replace.** Match each pick with `searchYouTubeCached` in
   order; if a pick fails to match, take the next best candidate for that slot.
   Resolve the first 3 songs before starting playback so it starts fast; the
   rest resolve in the background (same as `playVibePlaylist` today).
6. **Extend.** If the set is short, call `fetchSimilar` from the nearest
   slot's song. After the set ends, Discover takes over (existing behavior),
   unless the arc said it should end with silence.

### 8.3 What is realistic

- Honest ceiling: energy follows the curve roughly (low, mid, high), not
  beat-matched DJ mixing. EBBLESS plays whole songs from YouTube embeds; there
  is no crossfade engine or beatmatching, so "continuous without breaks" means
  "no dead air from search failures, loading, or off-mood songs", not a
  seamless mix. A gapless crossfade is a separate (large) feature and is not
  promised here.
- Ecstatic-dance style (slow open, rise to peak, long plateau, soft landing)
  works well with BPM bands: about 90 to 105, 110 to 120, 122 to 130, down to
  80 to 95. Needs a genre-heavy pool (house, afro, world, downtempo); pool
  depth for niche genres is the main failure mode.
- Songs without metrics reduce curve accuracy. Expect a visible fraction of
  "estimated" slots; surface nothing to the user, but log it in the dev
  console (`[voice] 7/22 slots estimated`).
- Song duration drift: end time lands within about 10 percent of the request.
  State "about 90 minutes".

## 9. Lock screen and widget specifics (Android)

All of this needs a device to verify. Items marked (verify) are design
intentions based on documented Android behavior, not tested here.

### 9.1 Lock screen mic (`FullScreenPlayerActivity`)

- The activity already has `showWhenLocked` + `turnScreenOn` and is launched
  over the keyguard by a full-screen-intent notification (#691).
- Add a mic button to its layout. Tap -> `SpeechRecognizer` in this activity
  (it is a visible foreground activity, which is what the recognizer needs).
- RECORD_AUDIO runtime permission cannot be requested from the lock screen
  without the user unlocking (permission dialogs do not show reliably over
  the keyguard) (verify). Flow: if not granted, tap mic -> request unlock
  via `KeyguardManager.requestDismissKeyguard()` then show the permission
  dialog in `MainActivity`, then return. After first grant it works on the
  lock screen.
- Whether the system lets an app record from the microphone while the device
  is locked: apps with a visible `showWhenLocked` activity can use the mic on
  stock Android (verify on TECNO/HiOS and on at least one Pixel-like device;
  OEM skins and a "sensitive content on lock screen" setting vary).
- Privacy/safety: show mic indicator in the UI; the Android 12+ system mic
  indicator also appears. Do not run commands that reveal personal data on a
  locked device (the grammar has none). "Like" and queue changes are fine
  locked; opening an app screen is not.
- Android 14+: a foreground service that uses the microphone must declare
  `foregroundServiceType="microphone"` and `FOREGROUND_SERVICE_MICROPHONE`.
  Our design avoids needing this: recognition runs in the foreground activity,
  not a service, so `PlaybackService` stays `mediaPlayback` only. If we ever
  need always-listening or recognition from a service, that changes and Play-
  style "while-in-use" restrictions apply (a service started from the
  background cannot start mic capture on Android 12+). Not proposed.
- Audio focus: while listening, duck or pause playback (`AUDIOFOCUS_GAIN_
  TRANSIENT_MAY_DUCK` or pause) so the recognizer is not fed the music; resume
  after. Voice commands in a loud room (the use case: a party) are the weak
  point; see risks.

### 9.2 Widget mic (`EbblessWidget`)

- Widgets cannot record audio. A widget mic button fires a `PendingIntent.
  getActivity` to a new tiny, transparent, no-history activity (`VoiceActivity`,
  `Theme.Translucent.NoTitleBar`, `excludeFromRecents`, `exported=false`).
  Starting an activity from a widget tap is allowed (it is a user-initiated
  PendingIntent).
- `VoiceActivity` requests RECORD_AUDIO if needed, runs `SpeechRecognizer`,
  shows a one-line overlay ("Listening..."), runs the local grammar, then
  either sends the command (section 9.3) or calls the worker.
- It finishes itself right after, so the user returns to the home screen.
  The listening overlay is the only UI; no chatbot window.

### 9.3 How the result reaches the queue when the app process is dead

Three cases:

1. **App alive** (`PlaybackService.sink != null`): command goes through the
   existing `PlaybackService.control(action)` -> `__ebbMediaAction` path.
   Extend `__ebbMediaAction` with `voice:<json>` carrying a validated plan, or
   add `__ebbVoicePlan(json)` on the page. The page executes via the same
   functions as the mic on the search bar.
2. **Local command, app dead** (e.g. "play"): reuse the widget's existing
   fallback: start `MainActivity` with an extra (`widgetAction`). Android 10+
   restricts background activity starts, but here the start is triggered from
   a visible `VoiceActivity` the user just interacted with, so it is allowed
   (verify). `MainActivity` queues the action until the page is ready.
3. **LLM plan, app dead**: `VoiceActivity` gets the plan from the worker, stores
   it (`SharedPreferences`, one pending plan, expires in 2 minutes), starts
   `MainActivity` with `voicePlan=1`; the page reads the pending plan on load
   (through a new `EbbNative.takeVoicePlan()`), runs the resolver/arc builder,
   and starts playback. Cold-start latency is the cost: the page must boot
   (splash, WebView), so this path is slow (several seconds). Toast set by
   `VoiceActivity`: "Starting EBBLESS..." and the target is a clearly
   acknowledged wait, not a silent one.

Also: no foreground service is needed for any of this. The widget and lock
screen run the recognizer in a visible activity, so no new Android 14 FGS
types are required.

### 9.4 Other platforms

Widget and lock screen are Android-only and sideload-only. Mac/PC get the
search-bar mic only (and the Mac menu bar / media keys already work).

## 10. UI sketches

### 10.1 Search-bar mic (existing mic, new feedback)

```
[ (mic) Search songs, paste a link, or say how you feel...   ]
  tap
[ (mic *) Listening...                                       ]   pulsing ring (existing)
  said "next"                                                       (local, instant)
  toast:  Next song.
  said "something calm for working"
  toast:  Finding songs...   ->   Calm focus - 25 songs.   [Undo]
  said (paid) "90 minutes ecstatic dance, slow start, soft landing"
  toast:  Building a 90 minute set...  ->  Set ready: 31 songs, about 90 min.
```

### 10.2 Lock screen mic

```
+------------------------------+
|         12:41                |
|     [   album art   ]        |
|     Song Title               |
|     Artist                   |
|  |<    ||    >|     (heart)  |
|  ----o--------------------   |
|            (mic)             |   <- new, bottom center
+------------------------------+
tap (mic):   "Listening..."  (art dims, ring pulses)
heard "next": "Next song."   (1.5 s, then back)
no permission yet: "Unlock to allow the microphone."
```

### 10.3 Widget mic

```
+--------------------------------------+
| [art] Song Title            (heart)  |
|       Artist                         |
|  |<   ||   >|   (mic)               |   <- mic added to control row
+--------------------------------------+
tap (mic) -> transparent screen:
        Listening...
 -> toast: "Next song."   (returns to home screen)
```

### 10.4 One-line feedback rules

- One line, present tense, no emoji, no "I", no apology paragraphs. Examples:
  "Next song." / "Volume up." / "Queued 22 songs." / "Set ready: 31 songs."
- Show what was understood only when it is ambiguous: `Heard "play bread": Bread
  - Make It With You?` with one tap to confirm or "Search instead".
- Every set-building toast has Undo (restores previous queue via the existing
  `queueHistSnapshot`).

### 10.5 Error and offline states

| State | Message |
|---|---|
| Mic denied | "Microphone is off. Allow it in Settings." |
| Heard nothing | "Didn't hear that. Try again." (no retry loop) |
| Offline, local command | runs normally, no message |
| Offline, needs network | "Offline. Commands still work." |
| Free cap reached | "Daily voice limit reached. Commands still work." plus an upgrade link (paid) |
| Not signed in, LLM needed | "Sign in to use voice moods." |
| LLM slow | "Still thinking..." after 2 s, give up at 10 s: "Taking too long. Try a simpler request." |
| LLM down / over budget | falls back to the local heuristic mood path with no error shown |
| Plan resolved poorly | "Short set: 14 of 22 songs matched." |
| Arc requested on free | "Sets with a shape are in <tier>." with one tap to learn more (copy per owner) |

## 11. Privacy and consent text (draft)

First mic tap on each surface, shown once, one screen:

> **Voice**
> Your voice is turned into text on your device or by your phone's speech
> service (on most Android phones that is Google). EBBLESS never receives or
> stores your audio. When you ask for a mood or a set, the text of what you
> said, plus the song that is playing, is sent to EBBLESS to pick songs. It is
> not saved. You can turn voice off any time in Settings.
> [Allow]  [Not now]

Add a "Voice" toggle in Settings (default off until the first-run screen is
accepted). `privacy.html` and `docs/PRIVACY-AUDIT.md` need an update before
release: new data flow (transcript to worker, then to the LLM provider),
retention (none for transcripts; counters only), third parties (the LLM
provider and the platform speech service).

## 12. Abuse and cost controls

- Auth required for any LLM call; per-user (`sub`) counters in KV
  (`voice:<sub>:<yyyy-mm-dd>` with TTL 2 days). KV put limits are a concern
  (README: free-tier daily `put` cap account-wide). Prefer a Durable Object
  counter (the repo already uses one: `PodCaptionBudget`) for the daily
  count and global spend, which avoids burning KV writes.
- Per-IP burst limit via the Cache API pattern already used by
  `/tester-report`.
- Input caps: 300 chars (`VIBE_MAX_INPUT`), 12 s of speech.
- Output caps: max tokens per tier; schema clamps (section 3.3).
- Global daily spend ceiling (Durable Object): when hit, all tiers fall to the
  free heuristic path; owner is notified (reuse `nowplaying`/admin pattern).
- Prompt injection: transcripts are untrusted. The plan can only produce enum
  ops and tags; there is no tool that reads files, sends messages, or calls
  URLs. The model sees no secrets. Strings from the plan are never evaluated or
  inserted as HTML (use `textContent`).
- Cache poisoning: only context-free requests are cached, keyed by text.

## 13. Risks

- **Noisy places / parties.** Recognition degrades with loud music, and our own
  playback leaks into the mic. Mitigation: duck/pause during listening; tell
  the user plainly this is weakest at parties; keep lock screen/widget as
  taps-first buttons that also work. Cannot be fixed in code alone.
- **Matching quality.** Spoken artist names, non-English titles, homophones.
  Mitigation: use the recognizer's n-best list (`maxAlternatives` 3) and let
  the matcher pick the best; one-tap confirm when confidence is low.
- **Latency.** Target: local command under 300 ms; simple LLM intent under 3 s
  end to end (speech end to first sound). Budget: transcript 0.3 s, worker +
  small model about 1.2 s, matcher + first song load about 1.5 s. Paid model
  and arcs will be slower (4 to 8 s); that is acceptable with the "Building a
  set..." toast and starting playback after the first 3 songs resolve.
- **Arc quality on free data.** Energy/BPM coverage is partial and tags are
  noisy (see 8.3). The feature should be sold as "a set that rises and falls",
  not "a pro DJ mix".
- **Android variability.** OEM skins (TECNO HiOS) change lock screen, mic and
  background-start behavior. Only one test phone is available.
- **Recognizer availability.** WebView and Electron may have no Web Speech;
  native bridge needed on Android (4.2); Mac unknown.
- **Cost spikes.** Mitigated by caps and the spend ceiling. A bug that loops
  requests is the main risk; client rate limit of 1 request per 2 s.
- **Provider/model change.** Pin the model id in one constant; a bad deploy
  falls back to heuristic. Schema versioned (`v`).
- **Privacy perception.** A mic on a lock screen reads as invasive if the
  copy is vague. The consent text and visible indicator matter.

## 14. Test plan

### 14.1 Without devices (can be done on the Mac)

- Unit tests for the local grammar (table of phrases to ops, including noise
  words, near-misses and "play <x>" splits) in the same style as existing
  `*.test.mjs`.
- Worker tests for plan validation: valid JSON, fenced JSON, extra fields, bad
  enums, out-of-range energy/bpm, huge arrays, URLs in strings, empty plan,
  injection strings in the transcript; tier gating (`ent:<sub>` present,
  absent, expired; client-claimed tier ignored); cap counters.
- Fixture-driven arc builder tests: synthetic pool with metrics, check the
  energy curve error, BPM jump limits, and handling of unmatched songs.
- Fallback tests: no ANTHROPIC key, model timeout, malformed output, cap hit
  -> heuristic path with no error shown.
- Web (Chrome): the search-bar mic with the grammar pre-pass; latency
  measurement; GPU watchdog check (no new animations beyond the existing
  pulse; the listening ring reuses the existing `paste-guide-ring`, the same
  transform/opacity-only animation as today).

### 14.2 Needs a device (cannot be verified here)

- Whether `webkitSpeechRecognition` exists in the Android WebView shell.
- `SpeechRecognizer` from a `showWhenLocked` activity on the keyguard: does it
  capture, does it prompt for unlock, on TECNO POP 9 and on a second brand.
- RECORD_AUDIO prompt behavior from the lock screen, and
  `requestDismissKeyguard` flow.
- Widget -> transparent `VoiceActivity` start; background activity start
  rules when starting `MainActivity` after recognition; cold-start time for
  the dead-process path.
- Audio focus ducking vs recognizer quality with music playing.
- Real-room accuracy at party volume.
- Battery and memory impact of the extra activity (the long-soak failure on
  record shows memory pressure matters on this phone).
- Mac Electron speech availability.
- Real latency against the 3 s target on mobile networks.

### 14.3 Quality eval

A fixed set of about 50 spoken-style requests (commands, moods, arcs, odd
phrasings) scored by the owner: correct op, believable arc, matched fraction.
Run on both models before choosing the free/paid split.

## 15. Phased plan and effort

Estimates are focused-build days for one developer, excluding device waits.

**Phase 1: commands + simple intents on the search-bar mic (about 4 to 6 days)**
- Local grammar and tests; command executor calling existing queue functions;
  grammar pre-pass in `setupVibeMic`.
- `POST /voice/plan` for `commands`/`mood` kinds on the small model, auth,
  per-user daily cap (5/day free), fallback to heuristic, `ent:<sub>` lookup
  (owner/tester only to start).
- Consent screen and Settings toggle; one-line toasts; offline messages.
- Android: native `listen()` bridge + RECORD_AUDIO (needed if Web Speech is
  missing in the shell), about 2 more days.

**Phase 2: mood and arc sets (about 5 to 7 days)**
- `set` kind, schema validation, arc builder (section 8), duration/continuous
  handling, Undo, paid model routing and 100/day cap.
- Paid gate end to end (entitlement admin route, sheet seed).
- Quality eval (14.3).

**Phase 3: lock screen + widget mic (about 5 to 8 days, device-dependent)**
- Lock screen button + permission/unlock flow in `FullScreenPlayerActivity`.
- `VoiceActivity` + widget button; pending-plan handoff for dead process;
  `__ebbMediaAction` extension.
- Heavy device testing; expect iteration for OEM behavior.

**Phase 4: multi-turn conversation, paid (about 3 to 5 days)**
- `prev` plan context, refinements ("faster", "less vocals", "skip the sad
  ones"), 6-turn limit, `clarify` kind. Spoken replies (TTS) stay out of scope
  unless the owner asks.

Total about 17 to 26 days. Smallest shippable slice: phase 1 without the
Android native bridge (web + owner testing only), about 3 to 4 days.

## 16. Open questions for the owner

1. Is the search-bar mic currently visible in the Android app? (Decides if the
   native recognizer bridge is needed in phase 1.)
2. Should the Mac app get a mic at all, given Electron's speech limits?
3. Which named tier owns Voice DJ (DEEP / FLOW / HORIZON, or its own add-on)?
   This proposal uses one `voice_pro` entitlement so the answer is cheap to
   change.
4. Price and the free/paid cap numbers (5 free requests/day, 100 paid/day are
   proposals). What spend ceiling per day is acceptable?
5. "Louder/quieter": phone stream volume (what users expect) or the player
   volume inside the app?
6. Is it acceptable that arc sets are whole songs with no crossfade/beatmatch?
   (A real mix engine is a separate large project.)
7. Languages beyond English for the local command grammar and the consent text?
8. Is sending the current song and last 5 played (title+artist, no identity)
   to the LLM provider acceptable under the privacy stance? If not, the context
   can be dropped at some quality cost.
9. Do free users need to sign in for their 5 LLM requests/day (this proposal
   says yes, to cap them), or should an anonymous device cap be allowed?
10. Should the lock screen mic be allowed to build sets while locked, or only
    commands (safer, simpler)?
11. Hosting the LLM key: confirm an Anthropic API account and monthly budget,
    or keep Workers AI for free tier and use Anthropic only for paid.
