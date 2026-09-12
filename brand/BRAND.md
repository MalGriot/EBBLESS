# EBBLESS — Brand Source of Truth

This file is the binding reference. If code, copy, or design disagrees with this
document, this document wins. Full rationale and visual specimens live in
[`brand-guidelines.html`](./brand-guidelines.html) — this file is the
condensed version for developers and agents who need the rules, not the tour.

## 1. What EBBLESS is

EBBLESS takes a Spotify playlist and plays it as continuous audio, matching
each track to YouTube and threading playback so the listening doesn't stop.

**Name:** EBBLESS = without ebb. An ebb is a decline, a retreat, an
interruption in the tide. EBBLESS is the music that doesn't do that.

**One sentence:** EBBLESS turns a playlist into one continuous listen.

**Mission:** Keep the listening going.

**Personality:** Quiet, confident, precise, a little dry, unbothered.
It explains itself once, plainly, and moves on.

**Emotional promise:** The music keeps going. You stop managing it.

**Functional promise:** Paste a playlist link. Get continuous playback,
matched and queued automatically.

**What EBBLESS is not:** an ad blocker, a piracy tool, a Spotify skin, a
"revolutionary" platform. It does not claim to block or detect ads — say so
explicitly wherever the mute/unmute behavior is described (see §9).

## 2. Naming

- **EBBLESS** (all caps) is the primary and default treatment — logotype,
  headings, app name, UI title.
- **Ebbless** (title case) is acceptable only in running body prose, mid
  sentence, where an all-caps word would read as shouting — e.g. a blog post
  or press mention. Never in the product UI, buttons, or headings.
- Never "ebbless" (all lowercase) as a standalone brand mention, except inside
  code identifiers (`ebbless.app`, `#ebbless`) where lowercase is conventional.
- Pronunciation: **EB-less** (rhymes with "pebbless," stress on first
  syllable). Not "ee-bless."
- One-line explanation to give a new user: *"EBBLESS plays your playlist
  straight through, without the gaps."*

## 3. Logo system

The wordmark **is** the logo. No separate pictorial symbol competes with it.

- **Primary mark:** `EBBLESS` set in uppercase, tight tracking (-1%), with a
  single unbroken hairline rule running beneath the full word. The rule is
  one continuous stroke — it does not break, lift, or dash under any letter,
  including the gap between the two Bs. That unbroken line under an
  unbroken word is the entire concept: nothing in the mark is allowed to
  visually "ebb."
- **Compact mark:** the rule alone — a single flowing horizontal stroke,
  gently eased (not straight, not a literal wave), used where the wordmark
  won't fit (favicon, app icon, loading state, tab bar). It must always read
  as one continuous, unbroken line.
- **Color:** the line and wordmark render in `--accent` (`#E0B26A`) on dark
  surfaces, or `#121212` on light surfaces. The line is never a gradient and
  never dashed.
- **Clear space:** minimum clear space on all sides equals the cap-height of
  the wordmark. Don't crowd it with UI chrome, edges, or other text.
- **Minimum size:** wordmark no smaller than 14px cap-height on screen.
  Below that, use the compact mark (the line alone).
- **Don't:**
  - don't add a music note, headphones, play triangle, or waveform as a
    lock-up symbol
  - don't break the underline into segments or dots
  - don't stretch, italicize, outline, or drop-shadow the wordmark
  - don't recolor the wordmark with a gradient
  - don't set it in lowercase

Assets: [`assets/wordmark.svg`](./assets/wordmark.svg),
[`assets/mark.svg`](./assets/mark.svg),
[`assets/favicon.svg`](./assets/favicon.svg).

## 4. Color

Preserved from the existing product — these already work.

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--bg` | `#121212` | 18,18,18 | app background |
| `--panel` | `#181818` | 24,24,24 | rows, cards, hover surface |
| `--panel-2` | `#202020` | 32,32,32 | inputs, elevated surface, active row |
| `--text` | `#F2F2F2` | 242,242,242 | primary text |
| `--faint` | `#9A9A9A` | 154,154,154 | secondary text, metadata, timestamps |
| `--accent` | `#E0B26A` | 224,178,106 | brand color — logo, active states, primary button, focus ring |
| `--good` | `#2FBF71` | 47,191,113 | success status only |
| `--bad` | `#E0645E` | 224,100,94 | error status only |
| `--border` | `rgba(255,255,255,.08)` | — | hairline dividers |

Rules:
- EBBLESS is a **dark-first, single-accent** brand. One warm accent color,
  never two competing accents on screen at once.
- `--accent` on `#121212` background: contrast ratio ~8.9:1 (passes AA/AAA
  for text). `--accent` text on `--panel-2` (#202020): ~7.7:1. Both safe for
  body text, not just large text.
- `--good` / `--bad` are functional only — status text, never decorative.
- Light mode (marketing/press contexts only; the app itself stays dark):
  background `#F7F5F2` (warm off-white, not clinical `#FFFFFF`), text
  `#141414`, accent unchanged at `#E0B26A` but check contrast — on light
  backgrounds use the darker accent variant `#A66E2E` for text/icons, and
  reserve raw `#E0B26A` for fills/backgrounds/large marks only.
- Hover = shift to `--panel`/`--panel-2`. Active = `--accent`. Disabled =
  50% opacity. No new states without a reason.
- Do not introduce a second accent hue for "categories," badges, or
  gamification. If something needs a second color, it's probably not on
  brand.

## 5. Typography

Audit finding: the app already uses the system font stack
(`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) — fast,
native, no web-font weight to carry. Keep it for UI. This is not a
"typography-led" brand; restraint here is the point.

- **UI typeface:** system stack, unchanged.
- **Display/wordmark typeface:** the system stack's bold weight, uppercase,
  -1% tracking. No separate display font is introduced — a second typeface
  would be the kind of "tech startup" polish this brand avoids.
- **Numerals:** tabular, used for timestamps/durations/track counts so they
  don't jitter during playback.

| Role | Size | Weight | Tracking | Case |
|---|---|---|---|---|
| Wordmark / display | 28-44px | 700 | -1% | UPPERCASE |
| H1 (page/section) | 20px | 600 | 0 | Sentence case |
| H2 (playlist name) | 16px | 600 | 0 | Sentence case |
| Body / description | 13-14px | 400 | 0 | Sentence case |
| Track title | 14px | 500 | 0 | As given |
| Track artist / metadata | 12.5px | 400 | 0 | As given |
| Button label | 14px | 600 | 0 | Sentence case |
| Ghost button / small action | 12.5px | 500 | 0 | Sentence case |
| Caption / timestamp / status | 11-13px | 400 | 0.1px | Sentence case |

Line height: 1.4-1.5 for body/description text, 1.2 for single-line UI
labels. Never justify text. Never letter-space body copy.

## 6. Visual language

- **Continuity over imagery.** The brand's visual idea is a line that does
  not break — expressed through the wordmark rule, through progress/seek
  bars, through borders, not through literal wave graphics repeated
  everywhere.
- **Negative space is a feature.** Dark, quiet, uncluttered fields around
  small warm accents. Don't fill space to look "designed."
- One abstract motif is allowed: a single continuous horizontal stroke
  (straight, gently curved, or as a seek/progress indicator). It appears at
  most once per screen as a deliberate accent, not as a repeating pattern or
  wallpaper texture.
- **Album artwork is the hero.** When something is playing, the track's own
  artwork carries the visual interest. Brand chrome recedes.
- No gradients except the single approved accent-to-transparent fade used
  for edge masks (e.g. a scrolling track list's top/bottom fade). No noise
  textures, no glassmorphism beyond the existing `backdrop-filter: blur()`
  on the player bar.
- Corner radius: 6-8px throughout (matches existing `.track img`, buttons,
  inputs). Circular only for transport controls. Don't mix radius scales.

## 7. Motion

- **Philosophy:** motion should feel like the interface is already moving
  forward, not reacting to you. Nothing bounces, overshoots, or calls
  attention to itself.
- **Duration:** 150-250ms for UI transitions (hover, active state, panel
  open). 400-600ms for larger surface changes (track change, view swap).
- **Easing:** `ease-out` for things entering/appearing, `ease-in-out` for
  things that move in place (progress bars, crossfades). Never a bounce,
  elastic, or spring curve.
- **Track/playlist transitions:** crossfade, don't cut. Album art and title
  fade together as one unit, not staggered.
- **Loading states:** a single continuous thin line filling left-to-right
  (echoes the wordmark rule) rather than a spinner or skeleton shimmer grid.
- **Hover:** background shift only (`--panel` → `--panel-2`), no scale, no
  shadow pop.
- **Never:** particle effects, elastic/spring easing, staggered bounce-ins,
  animated gradients, waveform visualizers as chrome, confetti, "AI is
  thinking" pulsing dots.

## 8. Voice

Concise, calm, plain. The existing README copy — *"there's no way to detect
or skip an ad through this API, so this is a delay heuristic, not a
guarantee"* — is the reference tone: exact about limits, no spin.

**Do:** short declarative sentences. Say what happens, not what's
"revolutionary" about it. Admit limits plainly when they exist.

**Don't:** "seamless," "revolutionary," "next-generation," "ecosystem,"
"experience the future of," exclamation points, em dashes used for hype,
personifying the product ("EBBLESS loves music").

| Context | Good | Bad |
|---|---|---|
| Headline | Keep listening. | Experience the future of seamless music streaming! |
| Button | Load | Get Started Now |
| Loading | Matching track 4 of 12… | AI is finding your perfect match... |
| Error | That doesn't look like a Spotify playlist link. | Oops! Something went wrong 😅 |
| Empty state | No tracks found. | Looks like it's pretty empty in here! |
| Ad heuristic | Muted briefly in case of a pre-roll ad. | Ads blocked. |
| Onboarding | Paste a public Spotify playlist link. | Unlock unlimited seamless listening in 3 easy steps! |

## 9. Legal / product-language constraints (binding)

- Never say EBBLESS "blocks," "skips," or "detects" ads. It cannot; the
  YouTube IFrame API gives no such signal. Approved language: "muted
  briefly in case of a pre-roll ad," "a delay heuristic, not a guarantee."
- Never claim to be affiliated with, endorsed by, or a replacement for
  Spotify or YouTube. Don't imitate Spotify's green or YouTube's red as
  brand colors.
- Don't describe the product as an "ad blocker," "downloader," or
  "converter." It streams; it doesn't download or convert files.
- Frame the product around continuous listening, never around defeating,
  bypassing, or removing something from Spotify/YouTube.

## 10. Taglines

1. **Primary:** Music without the ebb.
2. **Secondary:** Keep listening.
3. **Product descriptor:** A continuous player for your playlists.
4. **Short app-store description (≤80 char):** Play any playlist straight
   through — no gaps, no managing.
5. **One-sentence explanation:** EBBLESS turns a Spotify playlist into one
   continuous listen, matched and queued automatically.
6. **One-paragraph explanation:** EBBLESS takes a public Spotify playlist,
   finds each track on YouTube, and plays it back as one continuous queue —
   no re-searching, no re-pasting links, no dead air between songs. It's
   built to keep the listening going, not to fight the platforms it draws
   from.

Don't rotate through all six casually — §1/§2 are the only ones used in
primary brand placements (app title area, splash, store listing headline).
The rest are situational (descriptor = subtitle copy, one-paragraph = about
page / press).

## 11. Product terminology

Keep standard interface terms. No renaming for its own sake.

- "Playlist," "track," "queue," "player" — keep as-is.
- The matching step (Spotify → YouTube) is described in UI/status copy as
  **"matching,"** not "resolving," "syncing," or "converting" (matches
  existing status text: *"Matching track 4 / 12 on YouTube"*).
- Re-fetching a playlist's matches is **"Re-resolve"** in UI (existing
  button), described in prose as **"re-matching."**
- Do not invent branded names for the queue, player, or settings.

## 12. Imagery

No stock photography of headphones, DJs, concerts, or people on phones.
If imagery is ever needed (press kit, social), direction is: night driving,
empty roads, tide/shoreline at long exposure (motion blur, not literal
postcard wave shots), single continuous light trails. Used sparingly, never
as UI background — album art stays the visual hero inside the product.

## 13. Iconography

- Stroke-based or solid-fill, matching the existing transport icons
  (`fill="currentColor"`, 24×24 viewBox).
  Currently the player uses solid-fill glyphs (play/pause/prev/next) — keep
  fills, not outlines, for transport controls; outline strokes at 1.5-2px
  weight are acceptable for secondary UI icons (settings, close, refresh)
  if any are added.
- Corners: rounded to match the 6-8px UI radius family; no sharp-cornered
  icons dropped into an otherwise rounded interface.
- Size: 16-18px inline, 24px for primary transport controls, on a consistent
  grid — don't mix icon sets or optical sizes on the same bar.
- Color: `--text` default, `--accent` only for the active/current state
  (matches `.track.is-active .play-ico`).

## 14. Do / Don't

**Do:** keep one continuous accent color, let silence and dark space do the
work, describe the mute/unmute heuristic honestly, keep the wordmark's
underline unbroken, crossfade between tracks.

**Don't:** call it an ad blocker, add a second accent color, add a mascot or
symbol "for branding's sake," animate with bounce/elastic easing, use
Spotify green or YouTube red, oversell what the product technically does.
