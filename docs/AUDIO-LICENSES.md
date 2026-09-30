# EBBLESS-owned audio: sources and licenses

Every sound EBBLESS itself ships (not the music it plays from YouTube or
SoundCloud) is listed here with where it came from and the license it is used
under. Add a row before adding a file. If a license can't be confirmed, write
`unknown` rather than guessing, and treat the file as not cleared for EBBLESS
deep or any paid use until it is.

Rules (from Geethub #221):

- Prefer sounds made by MAL GRIOT / EBBLESS. An original EBBLESS sound library
  is the goal, especially for EBBLESS deep ambient audio.
- A third-party sound needs a license that actually allows commercial use and
  whatever modification or redistribution EBBLESS does with it. "Royalty-free"
  is not a license: read the real terms and link them here.
- Never use Spotify or YouTube recordings as EBBLESS or EBBLESS deep audio.
- Keep the original download filename or page URL so the source can be
  re-checked later.

## Current files

| File | Used for | Source | Author | License | Status |
|------|----------|--------|--------|---------|--------|
| `sfx/cassette-rewind.mp3` | Cassette art style: rewind sound when restarting a song | Original | MAL GRIOT | EBBLESS-owned | Fine |
| `sfx/needle-drop.mp3` | Spinning Record art style: needle drop on play | Original | MAL GRIOT | EBBLESS-owned | Fine |
| `sfx/needle-lift.mp3` | Spinning Record art style: needle lift on pause | Original | MAL GRIOT | EBBLESS-owned | Fine |
| `brand/assets/intro-theme.mp3` | Onboarding intro music (`#onbMusic`) | Original | MAL GRIOT | EBBLESS-owned | Fine |
| `keepAliveAudio` (inline `data:audio/wav` in `index.html`) | Near-silent loop that keeps mobile browsers from suspending the tab | Generated for EBBLESS (dither noise, no recording) | EBBLESS | EBBLESS-owned | Fine |
| Synthesized needle fallback (`lpSynthNeedle` in `index.html`) | Played only if a needle file fails to load | Generated in code with Web Audio | EBBLESS | EBBLESS-owned | Fine |

Not audio, but also shipped and of unknown origin: `brand/assets/splash-cymatics.mp4`,
`brand/assets/library-bg.mp4` and `brand/assets/swell-thumb.mp4` (container
creation dates from 2017 and 2024 suggest stock footage). Worth recording
their sources here too.

## Adding a sound

1. Put the file in `sfx/` (or `brand/assets/` for brand audio) and add it to
   the `sw.js` precache list if it should work offline.
2. Add a row above: file, what it's for, source URL or "original", author,
   license name + link, and status.
3. For EBBLESS deep, only rows marked EBBLESS-owned or with a confirmed
   commercial license qualify.
