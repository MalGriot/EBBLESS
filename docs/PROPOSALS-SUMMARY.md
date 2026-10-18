# Design proposals: summary and recommended order

Four ideas, one proposal each. Docs only, nothing built. Date: 2026-10-18.
The owner chooses what to build.

| Rank | Idea | Proposal | Value | MVP effort | Running cost | Risk | Recommendation |
|------|------|----------|-------|-----------|--------------|------|----------------|
| 1 | Music map (#597) | [PROPOSAL-music-map.md](PROPOSAL-music-map.md) | High | 2 to 3 days | None | Low | Build the MVP now |
| 2 | Your own songs from device / Google Drive (#621) | [PROPOSAL-upload-songs.md](PROPOSAL-upload-songs.md) | High | 3 to 4 days | None | Low (device only) | Build the MVP, device only; park Drive |
| 3 | Tell EBBLESS: grievances train your algorithm (#617) | [PROPOSAL-grievance-chat.md](PROPOSAL-grievance-chat.md) | Medium to high | 4 to 5 days | Small (AI, capped) | Medium (privacy) | Build the MVP |
| 4 | Shared playlists built together (#534) | [PROPOSAL-shared-playlists.md](PROPOSAL-shared-playlists.md) | High, if testers sign in | 5 to 7 days | Small (server storage) | Medium to high | Build the MVP later, or park until more testers sign in |

## Why this order

1. **Music map** gives the most for the least. It is pure discovery and
   wandering, which is the mission word for word. The data source (Last.fm
   similar artists) is already wired into the worker. No sign-in, no storage,
   no cost. One caution: do not scrape music-map.com itself; build our own map
   from our own sources.
2. **Your own songs** brings every listener's music together, including
   unreleased songs and demos. Keeping the files on the listener's device
   avoids the copyright and cost traps of hosting music. Google Drive needs a
   Google review and a privacy page, so it waits.
3. **Tell EBBLESS** puts listeners in charge of their algorithm in plain words,
   strongly on mission ("not something trying to own you"). It reuses the
   thumbs down, the taste history and the vibe search AI. Risk is mostly
   privacy, handled by never storing what people type.
4. **Shared playlists** may be the most loved of the four, but it is the
   biggest build, the first server data shared between people, and it needs
   sign-in to add songs. Its value depends on how many testers are signed in.
   Check that number before starting.

## Things that apply to all four

- Android, Mac and PC only. No iPhone work, no Apple sign-in.
- Any new full-screen view follows the GPU budget in CLAUDE.md (hidden means
  stopped, animate only transform and opacity).
- Always "songs" in the app's words.
- None of them change ad avoidance, but the own-songs player must skip the
  YouTube mute-on-load logic.

## Top recommendation

**Build the music map MVP first.** About three days, no new costs or legal
exposure, and it is the clearest expression of "the freedom to wander" on the
list. Start the own-songs MVP right after.
