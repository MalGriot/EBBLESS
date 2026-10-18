# Proposal: Add your own songs from your device or Google Drive (Geethub #621)

Design proposal only. No app code changed. Date: 2026-10-18.

## What the owner asked

"You should be able to upload music from your local device or Google cloud to
your library." So: songs you already have as files (rips, purchases,
your own unreleased mixes, demos) should sit in the EBBLESS library and play
like everything else.

## What it would feel like in EBBLESS

1. In the library, tap **Add your songs**. Or just drag files or a folder onto
   the EBBLESS window (Mac and PC).
2. Pick songs. EBBLESS reads the title, artist and cover from the files, so
   nothing needs typing.
3. They appear right away in a **Your songs** tile in the library, playable,
   shuffle-able, addable to any playlist, with no ads and no matching step.
4. On another device signed in to the same account, a playlist that contains
   one of your songs still plays: EBBLESS finds the same song on YouTube or
   SoundCloud if it exists, and quietly skips it if not, with a small "on your
   other device" mark.

Two taps to add a whole folder. No forms.

## A key design choice: keep files on the device, do not upload them to us

The word in the issue is "upload", but the best version for EBBLESS is that
**the songs never leave the listener's device** (or their own Google Drive).
EBBLESS stores a copy in the browser's own storage on that device and plays it
from there.

Why this matters:

- **Copyright.** If EBBLESS's servers hold people's song files, EBBLESS becomes
  a music host. That brings takedown duties, a legal agent for copyright
  notices, a repeat-offender policy, and real liability if people share files
  through it. Keeping files on the device means EBBLESS is a player, like VLC,
  not a host.
- **Cost.** Storing and streaming song files for every listener costs money
  every month. On-device storage costs nothing.
- **Privacy.** Nobody's personal music collection sits on our servers.
- **Mission.** "We bring your music together" without asking anyone to sign up
  or trust us with their files.

The trade-off: a song added on the laptop is not playable as a file on the
phone. The cross-device fallback above (play the streaming match if there is
one) covers most of that. Google Drive covers the rest, for people who want
their files everywhere.

## Mission fit

Strong. "We bring your music together" is literally this. It also matters for
artists, including the owner: unreleased songs and demos can live in the same
library as everything else.

Watch: it must stay as simple as dragging files in. No "manage storage" screens
in the first version.

## Simplest version that could ship first (MVP)

Device only, no Google Drive yet:

- **Add your songs** button in the library, plus drag and drop onto the window.
  Accepts common audio files (MP3, M4A/AAC, WAV, FLAC where the browser can
  play it, OGG).
- Files are stored in the browser's on-device storage (IndexedDB, which the app
  already uses for captions). EBBLESS asks the browser to keep the storage
  ("persistent storage") so it is not cleared under space pressure.
- Title, artist, album and cover read from the file's tags. If there are no
  tags, the file name becomes the title.
- A **Your songs** system tile in the library. Songs can be added to playlists
  like any other.
- Playback through the existing on-device audio player the app already has for
  podcast episodes (`createAudioDeckPlayer`, the `au` deck in `index.html`). It
  already behaves like the YouTube and SoundCloud players, so the queue,
  crossfade, mini player and media keys should mostly just work.
- Remove a song from Your songs removes the stored file too.

## Full vision

- **Google Drive:** a **From Google Drive** button opens Google's own file
  picker. The listener picks songs or a folder. EBBLESS keeps only a pointer and
  streams the file from their Drive when played. Works on every signed-in
  device.
- **Cross-device fallback:** your songs in a synced playlist play their
  streaming match on devices that do not have the file (described above).
- **Watch a folder** on Mac and PC (desktop app): new files dropped into a
  chosen folder show up automatically.
- **Artist mode:** the owner and other artists can mark songs as their own and
  share a private listen link later. Separate proposal if wanted, because
  sharing files is where the copyright risk comes back.

## What it needs technically

- **index.html:**
  - A file picker and drop handler (drag and drop already exists for songs and
    playlists, so the drop zone logic has a starting point).
  - A small tag reader for song files (ID3 for MP3, the MP4 atoms for M4A). Either
    a small self-written reader or a small library loaded from an allowed CDN.
  - IndexedDB storage for the files plus a song list entry per file.
  - A new song source id (for example `local:<hash>`) so the rest of the app
    treats these like any other song.
  - Hook the `au` deck to play from the stored file.
  - Song stats, Currents and ON AIR: decide whether your own files count toward
    taste. Suggest yes for taste, but never send the file name or tags of an
    unmatched file to the shared taste pool.
- **Profile sync:** only the song's title, artist and id sync, never the file.
  That keeps it well under the 20 MB profile cap.
- **Worker:** nothing for the MVP. Drive needs nothing either, because the
  browser talks to Google directly.
- **Google Drive (full version):** the app's current Google sign-in only proves
  who you are. Drive needs a separate permission (the `drive.file` permission,
  which only covers files the listener picks, not their whole Drive). That
  means a Google consent screen once, and a Google brand review of the app
  before it can be used by anyone outside the test list. That review takes days
  to weeks. Also check that Google's picker works inside the Mac desktop app,
  since Google sign-in already needed special handling there
  (`desktop/main.js`).
- **Android native app:** the native app's web view has no file picker hooked
  up yet (no `onShowFileChooser` in `android-webview`). A small native change is
  needed or the Add button does nothing there. Android in Chrome works without
  it.
- **Cost:** none for the device version. Drive is free (it is the listener's
  own storage).

## Legal and privacy

- **Device only:** low risk. EBBLESS plays files the listener already has, on
  their own device. Nothing is copied to us, nothing is shared.
- **Google Drive:** low risk. Same as above, the files stay in the listener's
  own Drive. Google requires a privacy policy that explains what Drive access
  is used for. EBBLESS would need that page in place before the review.
- **Never add server-side uploads** without a separate decision. That is the
  step that turns EBBLESS into a host with copyright duties and storage bills.
- **Shared playlists (see #534):** a shared playlist must never carry the file
  itself, only the title and artist, so friends hear the streaming match.

## Effort

- MVP (device only, Mac, PC and Android in Chrome): **3 to 4 days**.
- Android native file picker: **half a day**.
- Cross-device streaming fallback: **1 to 2 days**.
- Google Drive: **3 to 5 days of work**, plus Google's review wait.

## Risks and what could go wrong

- **Storage cleared.** If the browser clears site data, the songs are gone from
  EBBLESS (the original files are still on the computer). Ask for persistent
  storage, and say plainly in the Your songs tile that songs live on this
  device.
- **Big libraries.** A few thousand songs is fine. Tens of thousands of files
  could fill the device. Show how much space is used once it gets large, not
  before.
- **Formats the browser cannot play** (some FLAC, ALAC, WMA). Show a short "this
  file type does not play here" and skip it.
- **Ad-avoidance code paths.** The mute-on-load logic built for YouTube must not
  mute local songs. The podcast path already avoids this, so reuse it.
- **Drive review delay** could stall the full version. That is why Drive is not
  in the MVP.

## Recommendation

**Build the MVP (device only).** High value, especially for an artist-led app,
no running cost and low legal risk. Add the cross-device fallback next. Park
Google Drive until testers actually ask for it, since it needs a Google review
and a privacy page.
