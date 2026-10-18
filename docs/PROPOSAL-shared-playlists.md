# Proposal: Shared playlists several people build together (Geethub #534)

Design proposal only. No app code changed. Date: 2026-10-18.

## What the owner asked

"There should be shared playlists that multiple users can build together. It
should be simple and intuitive: drag a song in and everybody with the playlist
has it."

## What it would feel like in EBBLESS

1. On any of your playlists, tap **Share to build together**. EBBLESS copies a
   link. Send it however you like.
2. A friend opens the link. The playlist lands in their library straight away,
   marked with a small "together" mark. No paste field, no code, no extra
   "accept" screen.
3. Anyone with it drags a song in (or uses Add to playlist). Everyone else sees
   the song appear the next time they open the playlist, or within seconds if
   they have it open.
4. Each song shows a tiny name of who added it ("added by Mal").
5. The person who made it can remove songs, rename it, or stop sharing. Others
   can add, and remove only the songs they added.

Opening the link is the whole join step. That is the least-clicks version.

## Mission fit

Mixed, and worth being honest about.

- **Fits:** "we bring your music together" and "the freedom to wander". Building
  a playlist with friends is one of the warmest things a music app can do.
- **Tension:** the mission says "No sign-up". To know who added what across
  devices, and to stop strangers from wrecking a playlist, contributors need
  some kind of identity. EBBLESS already has Google sign-in (one tap) for
  profile sync, so this is not a new sign-up form, but it is still a sign-in.

Suggested balance: **listening to a shared playlist never needs sign-in.
Adding songs needs the existing one-tap Google sign-in**, and the prompt
appears only at the moment someone tries to add. That keeps the no-sign-up
promise for listening.

An alternative with zero sign-in (anyone holding the link can add) is simpler,
but a leaked link would let anyone vandalize the playlist, and there would be no
honest "added by" name. Not recommended as the default. It could be an option
for parties ("anyone with the link can add").

## Simplest version that could ship first (MVP)

- **Share to build together** on playlists you made. Creates a shared copy on
  the server and gives you a link.
- Opening the link adds the playlist to your library (listening needs nothing).
- Adding a song needs Google sign-in. Removing: the creator can remove any song,
  others only their own.
- Songs are stored as title, artist, cover and source id (YouTube or SoundCloud),
  the same way playlists already sync. Never a file.
- Updates arrive when the playlist is opened or the app regains focus. No live
  push yet.
- "Added by" shows the first name from Google, or a nickname the person sets
  once. Never the email.
- Creator can **Stop sharing**: the link stops working, and everyone keeps their
  own frozen copy.

## Full vision

- **Live updates**: songs appear for everyone within a second while the
  playlist is open.
- **Party mode**: one shared playlist plays on one device (a speaker or TV, see
  the casting work), and everyone in the room adds from their phones. Optional
  "anyone with the link can add" for this.
- **Little reactions**: a heart on a song a friend added.
- **Up next from the group**: Currents could mix in songs from your shared
  playlists, since a friend's taste is a great discovery source.
- **Activity line**: "Mal added 3 songs" on the library tile.

## What it needs technically

- **This is the first feature where EBBLESS stores data that belongs to
  several people at once.** Everything synced today is one person's own
  profile (`PROFILES` KV, keyed by their Google account).
- **Where to store a shared playlist:** a **Durable Object per shared playlist**
  is the right fit. The worker already uses Durable Objects with SQLite storage
  (`POD_CAPTIONER`, `POD_CAPTION_BUDGET`), so the setup and deploy path exist.
  One object per playlist means two friends adding at the same moment cannot
  overwrite each other. Plain KV would struggle here: its writes are not
  atomic (the taste pool code already notes this), and the free tier's daily
  write cap is shared across the whole account, so busy shared playlists could
  eat into what profile sync needs.
- **Worker routes:** create, fetch, add, remove, rename, stop sharing. Sign-in
  check reuses the existing Google ID token verification
  (`verifyGoogleIdToken`).
- **Profile:** the listener's profile stores only a pointer to the shared
  playlist (its id and the link secret), not the songs. Tiny next to the 20 MB
  cap.
- **index.html:** the share action next to the current share (`sharePlaylistItem`),
  link handling next to the existing `?import=` share links, the "together"
  mark, "added by" line, and a sign-in prompt at the moment of adding.
- **Live updates (full version):** Durable Objects support web sockets that
  sleep when quiet, so idle shared playlists cost nothing.
- **Cost:** within Cloudflare's free Durable Object allowance at beta scale. At
  thousands of active shared playlists it moves to the paid Workers plan
  (currently a small flat monthly fee plus usage). Worth checking current
  pricing before scaling.

## Legal and privacy

- **What is stored about people:** for each contributor, an internal account id
  and the display name they chose. Which songs they added and when. That is
  personal data under India's data protection law (DPDP Act 2023) and under
  GDPR for EU testers.
- **What to do about it:**
  - Show other members only the display name, never the email.
  - Let anyone leave a shared playlist, which removes their name from it (their
    songs can stay, shown as "added by a former member").
  - Deleting your account or profile also removes you from shared playlists.
  - Add a short paragraph to the privacy page before launch.
- **User text visible to others:** playlist names and nicknames can be
  offensive. The creator can rename. Keep a simple way for the owner of EBBLESS
  to delete a shared playlist from the admin page if one gets reported.
- **Copyright:** low risk, because only song references are shared, not files.
  If the upload feature (#621) ships, songs from files must be shared as
  title and artist only.
- **Platforms:** Android, Mac and PC. Google sign-in only, no Apple sign-in.

## Effort

- MVP: **5 to 7 days** (new server storage, sign-in rules, merge rules, the
  link flow, UI, and testing with two accounts on two devices).
- Live updates: **2 to 3 days** more.
- Party mode: **4 to 6 days** more, depends on the casting work.

## Risks and what could go wrong

- **Sync bugs that look like lost songs.** The worst outcome for a shared
  playlist is "my song disappeared". Removals need the same careful stamps the
  profile merge already uses for single-person sync.
- **Sign-in friction.** If the sign-in prompt shows up before people even hear
  the playlist, many will leave. It must only appear at the moment of adding.
- **Vandalism through a forwarded link.** Signed-in adding plus "remove only
  your own songs" limits the damage, and the creator can reset the link.
- **Few signed-in testers.** If most testers never sign in, there is no one to
  build with. Check how many testers are signed in before investing.
- **Scope creep.** Social features invite comments, follows, feeds. Those would
  pull EBBLESS toward an attention trap, against the mission. Keep it to songs.

## Recommendation

**Build the MVP, but after the music map and your-own-songs.** It is the most
social and possibly the most loved of the four, but it is also the biggest
build, the first shared server data, and it carries real privacy work. Check
first how many testers are signed in; if it is only a handful, park it until
that number grows.
