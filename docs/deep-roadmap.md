# EBBLESS DEEP: subscription planning

Living planning document for the proposed paid EBBLESS subscription. Update it
as decisions change. It is a reference, **not authorization to implement
anything**: no item here is built or committed until it is marked `Planned`
or later and MAL GRIOT has said to go.

Related docs: [AUDIO-LICENSES.md](AUDIO-LICENSES.md) (clearance rules for any
EBBLESS-owned sound), [../IMPROVEMENTS.md](../IMPROVEMENTS.md) (task intake),
[../README.md](../README.md) (architecture overview).

## Contents

1. [Status](#status)
2. [Principles and constraints](#principles-and-constraints)
3. [Tiers (proposed)](#tiers-proposed)
4. [Entitlement matrix](#entitlement-matrix)
5. [Backlog (future possibilities, not committed)](#backlog-future-possibilities-not-committed)
6. [Decisions made](#decisions-made)
   and [Open decisions](#open-decisions)
   (plus [Current baseline](#current-baseline-where-we-are-today))
7. [Dependencies and feasibility checks](#dependencies-and-feasibility-checks)
8. [Implementation notes](#implementation-notes)
9. [Acceptance criteria and testing](#acceptance-criteria-and-testing)
10. [Changelog](#changelog)

## Status

**Overall: Proposed. Nothing is implemented.** All entitlements below are
proposed, not confirmed capabilities. Prices and launch dates are
**unknown / undecided**. Decisions made so far are in
[Decisions made](#decisions-made).

### Feature status system

| Status | Meaning |
|---|---|
| Proposed | Idea written down. No investigation, no commitment. |
| Investigating | Feasibility being checked. Still no commitment. |
| Planned | Decided to build; scoped; acceptance criteria written. |
| In Progress | Being built (record the lane/branch). |
| Implemented | Shipped and verified against its acceptance criteria. |
| Deferred | Deliberately postponed or dropped. Keep the row and the reason. |

## Principles and constraints

- The core listening experience stays free.
- **Discovery stays named Discovery.** Do not rename it Flow. FLOW is only a
  proposed subscription tier name.
- DEEP = practical library upgrades plus premium personalization.
- FLOW = immersive visual and ambient experiences.
- HORIZON = advanced customization and experimental features.
- Do not paywall access to third-party music sources as the basis of the
  subscription.
- Any bundled ambient audio must be original, appropriately licensed, or
  otherwise authorized, and be logged in [AUDIO-LICENSES.md](AUDIO-LICENSES.md)
  before the file ships.
- Do not promise a technical capability before its feasibility is validated.
- Mission and least-clicks UX principles apply to every paid feature too.

## Tiers (proposed)

All entitlements in this section are **Proposed**.

### DEEP: Tier 1 - "More room for your music."

- More space for saved playlists (free limit: 10; high cap here, unlimited in HORIZON)
- Playlists longer than 100 songs (free limit: 100 songs per playlist)
- Custom artwork for more than 5 playlists (free limit: 5)
- Starter collection of premium mini-player skins
- Selection of additional visual environments

### FLOW: Tier 2 - "Shape the atmosphere around your music."

Everything in DEEP, plus:

- Full mini-player skin collection (LP, cassette, iPod, Game Boy, disco ball,
  rising/setting sun, and future additions)
- Expanded visual worlds and cymatics
- EBBLESS Echo ambient sound library
- Layered ambient audio with individual volume controls
- Custom themes and expanded appearance options
- Save favorite ambient mixes

### HORIZON: Tier 3 - "Explore the full potential of listening."

Everything in FLOW, plus:

- Save and switch between complete listening presets
- Advanced mini-player animations and interactions
- Full visual customization
- Advanced Echo mixing and crossfading
- Randomized ambient combinations
- Early access to experimental visual and listening modes
- Future premium skins, themes, and environment collections

### Per-feature tracker

| Feature | Tier | Status | Notes |
|---|---|---|---|
| Unlimited saved playlists | DEEP (more space) / HORIZON (unlimited) | Proposed | Free cap 10, added after launch. DEEP gets a high cap (TBD), HORIZON unlimited. |
| Playlists over 100 songs | DEEP | Proposed | Free cap 100/playlist. Current limit: unknown. |
| Custom artwork beyond 5 playlists | DEEP | Proposed | Free cap 5. Storage location: unknown. |
| Starter premium skins | DEEP | Proposed | Today's items stay free until launch (beta). Post-launch split undecided. |
| Additional visual environments (selection) | DEEP | Proposed | Today's items stay free until launch (beta). Post-launch split undecided. |
| Full skin collection | FLOW | Proposed | |
| Expanded visual worlds and cymatics | FLOW | Proposed | |
| EBBLESS Echo ambient library | FLOW | Proposed | Parked in the queue as `draft`; needs attention first. Needs cleared audio. |
| Layered ambient + per-layer volume | FLOW | Proposed | Feasibility unverified. |
| Custom themes / appearance options | FLOW | Proposed | |
| Save favorite ambient mixes | FLOW | Proposed | Depends on layering. |
| Listening presets (save/switch) | HORIZON | Proposed | |
| Advanced skin animations/interactions | HORIZON | Proposed | |
| Full visual customization | HORIZON | Proposed | Scope undefined. |
| Advanced Echo mixing + crossfading | HORIZON | Proposed | Feasibility unverified. |
| Randomized ambient combinations | HORIZON | Proposed | |
| Early access experimental modes | HORIZON | Proposed | |
| Future premium collections | HORIZON | Proposed | |

## Entitlement matrix

Proposed only. "-" = not included. Update when decisions change. Features developed later for Flow or Horizon get their tier when MAL GRIOT says so.

| Capability | Free | DEEP | FLOW | HORIZON |
|---|---|---|---|---|
| Core listening (all sources) | Yes | Yes | Yes | Yes |
| Saved playlists | 10 (after launch) | High cap (TBD) | High cap (TBD) | Unlimited |
| Songs per playlist | 100 (after launch) | High cap (TBD) | High cap (TBD) | Unlimited |
| Playlists with custom artwork | 5 (after launch) | High cap (TBD) | High cap (TBD) | Unlimited |
| Premium mini-player skins | Current set (see baseline) | Starter set (= current) | Full set | Full set + future |
| Visual environments | Current set (see baseline) | Selection | Expanded | Full + experimental |
| Cymatics | Existing free behavior (TBD) | TBD | Expanded | Expanded |
| EBBLESS Echo ambient library | - | - | Yes | Yes |
| Layered ambient + volumes | - | - | Yes | Yes |
| Saved ambient mixes | - | - | Yes | Yes |
| Custom themes / appearance | Existing (TBD) | TBD | Expanded | Full |
| Listening presets | - | - | - | Yes |
| Advanced skin animations | - | - | - | Yes |
| Advanced Echo mixing/crossfade | - | - | - | Yes |
| Randomized ambient combos | - | - | - | Yes |
| Early access experimental | - | - | - | Yes |

Per the decisions, DEEP and FLOW get a practical upper bound (numbers not
chosen, shown as "High cap (TBD)"). Only HORIZON is truly unlimited. What
"unlimited versions of things" means (e.g. mixes, presets, skin variants) is
undefined and listed as an open decision.

## Backlog (future possibilities, not committed)

Brainstorm only. Nothing here is committed to development and none of it is
assigned to a tier unless it also appears under [Tiers](#tiers-proposed).
Promote an item by giving it a status and a tier above.

- **Visual:** additional visual environments, visual algorithms, cymatics
  modes, album-art treatments
- **Mini-player:** additional skins, animations, interactions
- **EBBLESS Echo sounds:** rain, ocean, forest, night, city, fire, train, room
  tone, wind, monsoon, thunder (all subject to clearance, see Principles)
- **Ambient engine:** layering, individual volume controls, crossfading,
  randomized combinations, saved mixes
- **Appearance:** custom themes, wider visual customization
- **Presets:** bundles of skin + visual world + theme + Echo settings
- **Time and wellness:** timers, sleep-oriented experiences,
  wellness/inactivity modes
- **Content:** seasonal collections, user-created packs

## Decisions made

Recorded from MAL GRIOT, 2026-10-11.

| Topic | Decision |
|---|---|
| Tier names | **Deep**, **Flow**, **Horizon**. |
| Beta testers | Rewarded with **Deep, whatever Deep becomes** (including later additions to Deep). They also keep everything they had and did during testing, both features and content (e.g. playlists over future caps). Features in Flow or Horizon are paid, like everyone else. | Tester status is permanent. No new testers after testing ends.
| Downgrade / lapse | Anything past the limit is greyed out, based on the order it is in. Nothing is deleted. Greyed items can do nothing except show a toast inviting the user to upgrade their subscription. |
| Pricing and billing | Billing comes through Patreon. Tester status and Patreon status are managed manually. Prices to be discussed; the Patreon tier list is outdated. |
| Today's features | Stay free until launch (beta). After launch, Free keeps today's set minus anything MAL GRIOT later places behind a paywall. Nothing is moved unless he says so. |
| Tier focus | **Deep** adds more space. **Flow** adds more listening/visual features. **Horizon** adds all of that plus unlimited space and unlimited versions of things. |
| Caps | No caps today. Playlist/song/artwork caps are implemented after launch. |
| Data / accounts | New database to be created before launch, with beta testers integrated into it. Design left to Claude to propose; not started. Tester/Patreon flags are managed manually in a sheet. |
| Free vs paid for future features | Current features are the baseline. When MAL GRIOT develops features for the next tiers, he will say which tier they belong to. Until then, nothing new is assigned. |

## Current baseline (where we are today)

Snapshot from a quick look at `index.html` on 2026-10-11, not an exhaustive
audit. Everything listed here exists now and stays free until launch (beta). Re-verify before relying
on it.

| Area | What exists now |
|---|---|
| Visual modes (player tabs) | Art, Cymatics, Lyrics (seen in `applyVisualMode`; a Video tab label also appears) |
| Album art styles | Default, Spinning Record, Cassette |
| Playlist caps | None today. Caps arrive after launch. |
| Playlist custom artwork | Unknown, inspect |
| Themes / appearance | Unknown, inspect |
| Other skins named in the proposal (iPod, Game Boy, disco ball, sun) | Not confirmed present. Unknown. |

## Open decisions

| # | Question | Status |
|---|---|---|
| 1 | Tier names are decided (Deep, Flow, Horizon). Taglines still open. | Partly decided |
| 2 | Prices, billing interval, trial, currency handling. To be discussed. Billing runs through Patreon. The tier list on the [Patreon page](https://www.patreon.com/c/EBBLESS) is out of date and is not a source of truth. | Prices unknown |
| 3 | Decided: tester and Patreon status are managed manually in a sheet (no automatic Patreon sync at launch). Open: sheet layout, and how the app reads it (sheet vs the new database) | Partly decided |
| 4 | Account model: does EBBLESS have accounts today? How are entitlements tied to a user/device? | Unknown, inspect |
| 5 | Decided: testers keep all content; non-testers over the caps get items greyed out by order. Open: the grey-out UI details. | Decided |
| 6 | Decided: greyed items show a pop-up toast inviting an upgrade; nothing else. Open: exact wording and frequency | Decided |
| 7 | Decided: Free keeps today's set minus whatever is later placed behind a paywall. Open: which items, if any, move (decided case by case) | Decided |
| 8 | Source of Echo audio: original recordings, commissioned, or licensed? | Open |
| 9 | Decided: new database before launch with testers integrated; tester is permanent; no new testers after testing ends. Database design is left to Claude (propose it, then get approval). Open: schema, migration of existing tester records | Partly decided |
| 10 | Offline behavior of paid features | Open |
| 11 | Are paid assets bundled or fetched, and how are they protected? | Open |
| 12 | Launch date, rollout order, and whether tiers ship together | Unknown |
| 13 | What does HORIZON's "unlimited versions of things" cover? Horizon will be discussed in more detail later | Deferred to later discussion |

## Dependencies and feasibility checks

None of these have been run. Record the result and date when done.

| Check | Why | Result |
|---|---|---|
| Patreon membership to entitlement mapping that works in this app's hosting model (single-file web app + worker) | Needed before any gating | Not started |
| Greyed-out-by-order behavior for playlists, songs and artwork past a limit | Downgrade rule | Not started |
| Where playlists and artwork are stored; size limits | DEEP caps and unlimited artwork | Not started |
| Can multiple ambient audio streams play beside the main source on iOS/Android/desktop (autoplay, background, audio focus)? | FLOW layering | Not started |
| Interaction of Echo with embedded players (YouTube/SoundCloud/Spotify) and the ad filter | Ambient layer vs main playback | Not started |
| Crossfade feasibility with the audio setup | HORIZON advanced mixing | Not started |
| Performance budget for extra visual worlds on low-end phones and TV/cars | Visuals | Not started |
| Service worker caching and asset size for audio/skins | Offline, load time | Not started |
| Store/platform billing rules if wrapped for app stores | Distribution | Not started |
| Audio licensing for each Echo sound | Legal | Not started |

## Implementation notes

Fill this in only after the code has been inspected. Do not guess.

| Area | Files / modules | Notes |
|---|---|---|
| Playlist storage and limits | Unknown | |
| Playlist artwork | Unknown | |
| Mini-player skins | Unknown | |
| Visual environments / cymatics | Unknown | |
| Theme / appearance system | Unknown | |
| Audio engine (for Echo) | Unknown | |
| Settings UI / upsell surface | Unknown | |
| Backend / worker (entitlements, Patreon link) | Unknown | |

## Acceptance criteria and testing

Per-feature criteria are written when a feature moves to `Planned`. Every
feature must meet the common baseline, plus its own rows below.

**Common baseline:** free users lose nothing they have today; core listening
works unchanged; gating is clear and uses the fewest taps; works on
iPhone, Android, desktop (and TV/car where the app supports them);
no regression to playback; downgrade behavior matches decision #6; testing
follows the project's staging-first approach in the README.

| Feature | Acceptance criteria | Tests required |
|---|---|---|
| Playlist caps | TBD | TBD |
| Long playlists | TBD | TBD |
| Artwork limit | TBD | TBD |
| Premium skins | TBD | TBD |
| Visual environments / cymatics | TBD | TBD |
| Echo library | Every file logged in AUDIO-LICENSES.md; TBD | TBD |
| Layered ambient + volumes | TBD | TBD |
| Saved mixes | TBD | TBD |
| Themes | TBD | TBD |
| Presets | TBD | TBD |
| Advanced mixing / crossfade | TBD | TBD |
| Entitlement checks | TBD | TBD |

## Changelog

| Date | Change |
|---|---|
| 2026-10-11 | Manual flags live in a sheet; upgrade toast is a pop-up; database design left to Claude; queued as `deep-database-design`. |
| 2026-10-11 | Tester status permanent; tester and Patreon status managed manually; greyed items only show an upgrade toast; Patreon page tier list noted as outdated. |
| 2026-10-11 | New database before launch with testers integrated; non-testers over caps greyed out; Horizon details deferred to a later discussion. |
| 2026-10-11 | Testers rewarded Deep (whatever it becomes) and keep everything; Free keeps today's set minus later paywalled items. |
| 2026-10-11 | Updated: today's items free until launch; testers grandfathered, later features paid; caps arrive post-launch; tier focus (Deep = space, Flow = features, Horizon = all + unlimited). |
| 2026-10-11 | Recorded decisions: tier names, tester access, downgrade grey-out, Patreon billing, starter = current, capped "unlimited", Echo parked as `draft` in IMPROVEMENTS.md, current baseline noted. |
| 2026-10-11 | Document created. Tiers, backlog, principles, matrix, and open questions recorded as proposals. No code changed. |
