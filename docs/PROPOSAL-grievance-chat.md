# Proposal: A chat where listeners air grievances and train their own algorithm (Geethub #617)

Design proposal only. No app code changed. Date: 2026-10-18.

## What the owner asked

"A chatbot that users can air their grievances to and train their own
algorithm." No further detail in the issue. Reading it plainly: listeners
should be able to say, in their own words, what they are sick of, and EBBLESS
should actually change what it plays because of it.

## What it would feel like in EBBLESS

A small **Tell EBBLESS** box (a speech bubble icon near the thumbs down, and a
line in the Currents menu). You type the way you would text a friend:

- "Too many slow songs in the morning."
  > Got it. Fewer slow songs in Currents before noon. **Undo**
- "I'm so tired of that Drake song."
  > Got it. That song won't come up in Currents again. **Undo** · **All Drake instead?**
- "More stuff like the house songs from last night."
  > On it. Currents will lean toward house for the next few days. **Undo**
- "Why does it keep pausing?"
  > Sounds like a playback problem, not your taste. Send this to the EBBLESS team?
  > **Send** · **No thanks**

Every reply is one short line that says **exactly what changed**, with an Undo.
A **What you've told me** list shows every rule in plain words, each one
removable. That list is "your algorithm", visible and in your control.

No setup, no sliders, no account. Type, done.

## Mission fit

Strong in spirit. "Music should be something you flow through, not something
trying to own you." Most music apps hide their algorithm. Letting people talk to
it, see every rule, and undo any of them is the opposite of an app trying to own
you.

Two cautions from the mission:

- **"Simple but layered."** A chatbot can easily turn into a feature that wants
  conversation. It should feel like leaving a note, not starting a chat. One
  message in, one line back. No small talk, no personality act, no follow-up
  questions unless it truly cannot tell what you meant.
- **Least clicks.** The thumbs down already exists and is one tap. The box is
  for what one tap cannot say ("in the morning", "that artist, not that song",
  "more of this").

## How "training" works (no new algorithm needed)

EBBLESS already has the levers. They just are not reachable by words yet:

- **Thumbs down / less like this** (`declineCurrentsTrack`, the `ebbless:declined`
  store in `index.html`) already records songs, artists and tags to avoid.
- **Listening history and taste** (`ebbless:taste`, `recordListenSignal`)
  already weighs plays, finishes and early skips.
- **Vibe search** (`/vibe-interpret` in the worker) already turns free text like
  "rainy night, slow" into tags using a small AI model on Cloudflare.

So the chat does one job: turn a sentence into one or more of a **short, fixed
menu of actions** the app already understands, then apply them locally:

- avoid this song / this artist / this tag (optionally: only at certain times
  of day, or for a few days)
- lean toward this artist / tag (for a few days, or always)
- forget a past rule
- "this is a problem, not taste" (offer to send feedback)

The AI only picks from the menu. It never writes rules of its own and never
changes anything outside the listener's taste.

## Simplest version that could ship first (MVP)

- The **Tell EBBLESS** box, reachable from the thumbs down and the Currents
  menu.
- The actions: avoid song, avoid artist, avoid a sound (tag), lean toward artist
  or sound, all applied to **Currents**, which is where the algorithm lives
  today.
- Every action shows one plain line plus Undo.
- **What you've told me** list with remove buttons.
- Problems (pausing, wrong song, ads) get offered to the existing tester feedback
  path, with the listener's OK first.
- All rules stored **on the device** only.

## Full vision

- **Time and mood rules:** "nothing heavy after 10 pm", "upbeat on weekdays".
- **Rules follow you:** rules sync with the signed-in profile, so they apply on
  every device.
- **Beyond Currents:** rules also shape the music map suggestions, the
  "similar songs" lists and any future radio.
- **Voice:** hold to talk on Android. The owner is a voice actor; a spoken
  "skip this kind of thing" fits the brand. Later.
- **EBBLESS learns from everyone, anonymously:** if many people say "too slow"
  about the same mix, that is a useful signal for the shared taste pool. Only
  with counts, never the sentences.

## What it needs technically

- **Worker:** one new route, e.g. `/taste-chat`, using the same Cloudflare AI
  binding and model already used by `/vibe-interpret`
  (`@cf/meta/llama-3.1-8b-instruct-fast`). It receives one sentence plus the
  current song's title and artist, and returns a small list of actions from the
  fixed menu. Important difference from vibe search: **do not cache by the
  sentence**, because these sentences can be personal.
- **No new storage on the server.** Rules live on the device in the app's
  existing local storage, next to the declines.
- **index.html:** the box, the reply line with Undo, the rules list, and a small
  step in the Currents builder that reads the new rules (time windows and "for a
  few days" expiry are the only truly new logic).
- **Fallback without AI:** a simple word matcher for the common cases ("no more
  X", "less slow", "more house") so the box still works if the AI is slow or
  out of daily allowance. Vibe search already has this pattern
  (`vibeHeuristic`).
- **Cost:** the AI model is small and cheap. At beta scale it should sit within
  Cloudflare's free daily AI allowance, shared with vibe search. Add a daily
  budget cap like the podcast captions have (`POD_CAPTION_BUDGET`) so a burst
  cannot run up a bill.
- **Profile sync (full version):** rules are tiny, far under the 20 MB cap.

## Legal and privacy

This is the riskiest of the four for privacy, because people will type real
feelings into a box labeled for complaints.

- **Do not store the sentences.** The worker reads the sentence, returns
  actions, and forgets it. No logs of the text. The device keeps only the
  resulting rule in plain words ("fewer slow songs before noon"), not the
  original message.
- **Say so in the box:** a one-line note under it, "Only used to adjust your
  music. Not saved."
- **Feedback sends only with a yes.** If a message looks like a bug report, the
  app asks before sending, and shows what will be sent.
- **People will vent about more than music.** The bot should stay on music and
  never act like a therapist. If someone writes something that sounds like
  real distress, it should reply with one kind line and a link to a helpline
  (for India, Tele-MANAS; verify the current number before shipping) instead of
  a music action. This matters given the owner's wellness work; it also matters
  simply because it is the decent thing.
- **AI misuse:** people will try to make it say things. Because the model may
  only return actions from a fixed menu and the app shows only its own fixed
  reply lines, nothing the model writes is shown as free text. That removes
  most of the risk.
- **Data protection (India DPDP Act, GDPR):** with no sentences stored and rules
  on the device, there is very little personal data to manage.
- **Platforms:** Android, Mac, PC. No sign-in needed.

## Effort

- MVP: **4 to 5 days** (worker route, action menu, Currents rule hooks, rules
  list, fallback matcher, testing with lots of real phrasings).
- Time and mood rules plus sync: **3 to 4 days** more.
- Voice: **2 to 3 days** more on Android.

## Risks and what could go wrong

- **It misunderstands.** "I hate that I love this song" read as "avoid this
  song". The one-line reply plus Undo is the safety net. Every action must be
  visible and reversible.
- **Feels like talking to a wall.** If the rule changes nothing the listener can
  notice, trust drops fast. Rules should take effect on the very next song.
- **Becomes a chat app.** Resist adding personality, small talk or follow-up
  questions. One message, one line back.
- **Small model limits.** An 8B model is fast and cheap but can be clumsy. The
  fixed menu keeps its job narrow. Test with many phrasings, including Indian
  English and slang.
- **Overlap with the thumbs down.** Keep both. The thumbs down is the one-tap
  path; the box is for what a tap cannot say.

## Recommendation

**Build the MVP, third in line.** On mission and mostly built from parts that
already exist (declines, taste, vibe search AI). It needs care on privacy and
on keeping it small. Do it after the music map and your own songs, before or
alongside shared playlists depending on how many testers sign in.
