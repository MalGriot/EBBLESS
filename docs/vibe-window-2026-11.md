# Vibe result window redesign (HQ T-0012, release 579)

App only. No worker deploy, no Sheet step, no `house-vibes.json` change. Nothing is pushed until the CEO says yes.
Vibe behavior (interpretation, worker calls, playlist building, every button's action) is unchanged; this is layout,
hierarchy and styling in `stageVibeResults` and its CSS block in `index.html`.

## The problem (release 578, phone, "sexy time")
A framed panel inside the page, so the song list sat in a short inner scroller (max 340 px) between two buttons and
two outline buttons. Tags were five outlined pills that competed with the action. Everything was centered, and
both actions looked alike.

## What it is now
One page, like Library and the region page. The overlay loses its 32 px padding and the stage loses its frame, so
the stage (max 640 px, centered on desktop) is the one scroller and the whole list scrolls with the page.

Order, top to bottom:
1. Vibe name, 28 px / 800 (the region page's title size), with share and close at 44 px on the right.
2. One short line: what the person typed in quotes (or "Looks like: ..." for a picture vibe).
3. The tags as one small quiet line under it, in `--faint` (6.66:1 on the page), dot separated, no pills. The line wraps between tags: chips are joined with a space and each tag stays whole (`nowrap`). The dot belongs to the tag before it, so at a wrap it ends the line and no line ever starts with a dot.
4. **Save & play**: full width, accent fill, 52 px, 16 px / 700. It was already the filled action, and it keeps the
   playlist the person just got. Under it **Just play 25 songs**: the app's outline pill, 44 px.
5. The songs, as flat rows with hairlines (same `.search-pick` row as Search, no box each).
6. At the end of the list, two quiet text links: Browse playlists for this vibe instead, Cancel (the X is also
   at the top).

A new vibe always opens at the top (the stage's scroll is reset). The wait screen ("Interpreting your vibe")
loses its panel frame too, so there is no frame appearing and vanishing between the wait and the result.

## Reused from the app (nothing new in the look)
`.btn-ghost` and `.btn-ghost.is-active` (buttons), `.search-pick` / `searchPickRowHtml` (rows), `.pick-x` and
`.vibe-share` (icon buttons, now 44 px in the flow instead of floating), `.vibe-chips` / `.vibe-chip`,
`.vibe-heard`, `#import-overlay` / `#importStage`, tokens `--text --faint --faint-2 --border --panel-2 --accent
--on-accent --safe-b --r-md`, the region page's title size and focus outline (2 px accent).

## The header stays in view (CEO decision, round 2)
Name, Share and X live in one sticky row (`.vibe-bar`) that pins to the top of the stage while the 25 songs scroll
under it. It is **44 px tall at 390 px** (5% of an 844 px screen). It replaces the old title row, so at rest it costs
about nothing: the name now sits at 24 px on one line, with an ellipsis if it is long (full name in the tooltip), and
the typed words and tags sit right under it, scrolling away with the page. Share and X keep 44 px touch targets.
Save & play scrolls away with the list; the list scrolls normally.

How it is built: `position:sticky; top:0` inside the stage, which is the one scroller, so it needs no JS. The row
background is `var(--bg)`, solid, so list rows never show through; for it to match exactly the vibe page sets its
overlay background to plain `--bg` (the faint tint the overlay has on other pages is dropped here only, scoped with
`:has(.vibe-result)`). No blur, backdrop-filter, animation or will-change. It sits below the overlay's own top edge,
which is already below the app header and the phone's status bar (`--topbar-h` includes the safe area), so nothing
collides with the logo, help and dollar icons.

## GPU budget
No animation, filter, blur or backdrop-filter added. No `will-change`.

## Tests
`node scripts/test-vibe-window-chrome.js` runs the real stylesheet and markup in headless Chrome at 390x844 and scrolls the 25-song list top, middle, bottom: name, Share and X stay in view, are clickable (hit-tested) and 44 px, the first song is not under the sticky row, the tag line does not overflow, a long name ellipsizes. It skips if Chrome is not installed. `node scripts/test-vibe-window.js` (both in `scripts/check.sh`) runs the real `stageVibeResults` and checks the
order, one primary action, no inner scroller, and that Save & play, Just play, a song row, Browse playlists,
Cancel, Share and the Close X still do what they did, plus labels, escaping and the scroll reset.

## Screenshots (`docs/vibe-window-2026-11/`)
Before (578, 390 px): `before-sexy-time-390.jpg`, `before-just-chilling-390.jpg`.
After (579): `after-sexy-time-390.jpg` (25 songs), `after-sexy-time-390-middle-of-list.jpg` (scrolled halfway: the row stays), `after-sexy-time-390-bottom-of-list.jpg`,
`after-just-chilling-390.jpg`, `after-short-list-390.jpg` (3 songs), `after-slow-load-390.jpg`,
`after-sexy-time-desktop.jpg` (1280x800), `after-tags-worst-case-long-name-390.jpg` (long name ellipsized, all tags plus four long exclusions wrapped, nothing clipped), `after-sexy-time-desktop-scrolled.jpg`. "Just chilling" is shot with "no country, no metal" so the exclusion tags show. All retaken in round 2 on the final CSS, tag line measured in a real browser at 390 px (`scrollWidth == clientWidth`, no horizontal overflow). Real worker answers; different songs per run because recently played
songs are avoided.

## Release steps (app only)
1. QA reviews branch `claude/vibe-window-2a4457`; the CEO sees the before and after screenshots.
2. On the CEO's yes: merge to `main` and push (GitHub Pages deploys). No worker deploy. If another lane took 579,
   renumber `sw.js` and the top `WHATS_NEW` entry to the next free number. T-0011 edits Home in the same file; the
   two touch different areas but merge them one at a time.
3. Phone check: type "sexy time" in Search. The name leads, Save & play is the one bright button, the list fills
   the screen and scrolls with the page, Cancel is at the end. Try Save & play (a playlist appears in Library),
   then Just play, then a song row, Browse playlists, and the X.
4. Rollback: revert the commit and bump `sw.js` to the next number.

## Not verified
Real phone (the CEO's), real audio playback after the buttons (covered by the unchanged `playVibePlaylist`).
