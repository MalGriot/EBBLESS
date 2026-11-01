# Keeping EBBLESS maintainable

Adapted from Redwerk's vibe-code maintenance guide
(https://redwerk.com/blog/vibe-code-maintenance/). Most of this app is
AI-assisted, so these are the habits that keep it from rotting. Security
items live in `docs/SECURITY-REVIEW.md`.

## Automated

- `scripts/check.sh` (pre-commit): script parse, GPU keyframes, security grep,
  worker tests, WHATS_NEW per cache bump.
- Dependencies in `worker/` and `desktop/` must be pinned exact (no `^`/`~`).
  The security grep fails on a range. Bump deliberately, test, commit the
  lockfile.

## Rules for every change

- **Public routes are a contract.** Worker routes (`/podtext`, `/podaudio`,
  `/podepisode`, `/search`, `/beta/*`, `/admin/*`, ...) are called by shipped
  apps, including Android builds that update late. Never rename or change the
  response shape of an existing route; add a new one or add fields. A refactor
  that touches a route name is a breaking change.
- **One sentence per change.** The commit message says what changed and why.
  Keep it plain; the log is the changelog of record.
- **Deletion test.** If removing a function or file means opening several other
  places to know what breaks, it is coupled. Don't add new shared globals or
  cross-feature state to `index.html`; pass values in. Fix coupling in the lane
  that touches it (see "Cleanup rules" in CLAUDE.md).
- **Tests for what must not break.** Worker logic gets a test in
  `worker/test/`. For the app, the flows that must keep working: sign-in,
  playing a song end to end, import a playlist, and update/reload. Add a
  regression test or a check with every bug fix in those areas.
- **Webhook-style and retried calls are idempotent.** Anything that can be
  delivered twice (Sheet writes, profile deletes, quota counters) must be safe
  to repeat. Check this when touching `beta.js`, `profile-delete.js`,
  `voice-quota.js`.
- **Watch the free-tier ceilings.** Cloudflare requests/KV writes/Workers AI
  neurons and the Apps Script quota are the billing surprises here. See
  `docs/LOAD-THRESHOLDS.md`. A change that adds a per-request KV write, a
  subrequest, or a model call needs its cost noted in the commit.
- **Queries and loops.** No per-item network or storage call inside a loop
  over a playlist; batch it (the matcher's subrequest budget is the model).

## Renewals and expiry (put on a calendar)

Domain, TLS (managed by Cloudflare/GitHub Pages: confirm), Google OAuth
client and consent screen status, Apple/Spotify/Last.fm/YouTube API keys, the
Android signing key, and Worker secrets (`ADMIN_TOKEN`, Sheet secret).
Record owner, renewal date and where it is rotated in a private note, not in
this repo.

## Cleanup order (when things start breaking unrelated things)

1. Audit what is sound; list what isn't.
2. Security issues first (`docs/SECURITY-REVIEW.md`).
3. Refactor what blocks changes, small and per area, merged right away.
4. Add tests around the flows above.

Prefer targeted refactors over a rewrite. Warning signs: a fix breaks an
unrelated feature, performance drops under real use, sign-in or playback
errors recur, or shipping needs a long manual check.
