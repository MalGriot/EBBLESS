# mp3juice-style sites: what they are, and what EBBLESS should learn

Covers Geethub #618. Research only, no app code changed. Date: 2026-10-18.

## Short answer

**Do not build this.** The thing that makes sites like this "have everything" is
turning YouTube and SoundCloud streams into downloadable audio files. That
breaks YouTube's terms of service and copies other people's music without a
licence. EBBLESS should not tap into it, copy it, or document how it works
technically. There are also real risks to listeners, covered below.

What the idea is really pointing at, an index that always finds the right
song, is something EBBLESS can improve legitimately. That part is covered in
the recommendations.

## What the site is

The address in the issue (service-et-reception.fr) is one of many copy-cat
sites that present themselves as "MP3Juice." Reading only its public page:

- A search box. You type a song, artist or album, or paste a video link, and
  get a list of results with a preview player.
- It says it is a "search aggregator" that does not host music files itself.
- It names YouTube and SoundCloud, "publicly accessible audio repositories"
  and user-supplied links as its sources.
- It offers audio (MP3) and video (MP4) files to save. No account.
- It links to Terms and a copyright/DMCA page, and admits it has drawn
  criticism from artists and industry groups, while calling its use fair use.

None of this was tested, downloaded or run. We did not look at the site's
network traffic or try to use it.

## Why it looks like "near-flawless matching"

At a high level, there is no secret music index. The sites sit on top of
catalogues that already exist and are already searchable: YouTube above all,
plus SoundCloud. Those platforms hold almost everything, and their own search
is very good at finding a song. The site's trick is repackaging that into a
simple search box and a save button.

EBBLESS is already built on the same idea in a legitimate form: it finds the
song on YouTube or SoundCloud and plays it **inside the platform's own
embedded player**, which is how those services allow it. That is why the
README can say the matching comes from YouTube search and SoundCloud's public
data. So the answer to "they play songs from a source we should tap into" is:
we already use that source, the permitted way. The part we should not copy is
the conversion into saved files.

## Why not to copy it

- **Terms of service.** YouTube's terms do not allow downloading or
  converting streams. SoundCloud's terms are similar. A product built on that
  can be blocked and can put EBBLESS's own use of those platforms (embeds,
  public data) at risk. EBBLESS depends on those platforms staying friendly.
- **Copyright.** Saving copies of songs without the owner's licence is the
  exact problem the DMCA notices on those sites are about. EBBLESS should not undercut artists.
- **Mission.** "No ads. No sign-up." Sites like this are known for heavy ads,
  popups and misleading download buttons. That is the opposite of the feeling
  EBBLESS is for.
- **Safety.** Copy-cat domains that share one name come and go and are a
  common place for scams and malware. Pointing listeners at them, or at
  anything similar, is a risk we can avoid.
- **Fragility.** These sites break and vanish often because the platforms
  keep closing the gap. A feature built on one would be unreliable.

## What EBBLESS can legitimately learn

The listeners' complaint behind #618 is "the match is not always the song I
meant." We can improve that with tools the app already has:

1. Prefer the official or "Topic" upload and the right length over covers,
   live takes and remixes (the common complaint about transfer apps, see
   [TRANSFER-APPS.md](TRANSFER-APPS.md)).
2. Use the duration and recording ID Spotify and Apple already give us as a
   check before accepting a match.
3. Let the listener swap a wrong match with one tap, and learn from the
   existing "report a bad match" reports.

## Recommendations, ranked

Effort: **small** under half a day, **medium** one to two days, **large**
several days.

1. **Close #618 as "not building the download-site idea."** Small (a comment).
   Say plainly it is a terms and copyright problem, and point to the next two
   items for the real goal.
2. **Tighten match scoring using song length and the official upload.**
   Medium. Compare the song's known length to the video's length and favour
   official/Topic channels. Cuts wrong remix and live matches. Already in the
   spirit of the match-quality lane; coordinate with it instead of starting
   parallel work.
3. **One-tap "pick a different version" on any track.** Medium. Shows two or
   three other candidates already returned by the search. Same item as in
   [TRANSFER-APPS.md](TRANSFER-APPS.md); build once.
4. **Learn from the reports, not from other sites.** Small to medium. Review
   what listeners flag as bad matches and turn repeat patterns into scoring
   rules.
