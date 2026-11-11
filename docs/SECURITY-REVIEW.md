# Security review checklist (EBBLESS)

Adapted from the Redwerk security code review checklist
(https://redwerk.com/blog/security-code-review-checklist/), cut down to what
applies to a single-file client app plus a Cloudflare Worker. Use it on any
change that touches the worker, auth/session, user data, or anything that
renders external text. `scripts/check-security.js` (run by `scripts/check.sh`)
automates the greppable parts.

## Automated (pre-commit)

- Hard-coded secrets (API keys, tokens, private keys) in `index.html`, `sw.js`,
  legal pages, `worker/src/*.js`.
- `eval(` / `document.write(`.
- `target="_blank"` without `rel="noopener"`.
- Plain `http://` URLs (except localhost).
- Grandfathered hits: `scripts/check-security.baseline.json`. Never add to it
  to get a commit through.

## Manual review (per change)

**Input validation**
- Every worker route validates its own input server-side: type, length,
  allowed values (allowlist first). Client checks are UX only.
- Data from third parties (YouTube/Spotify/SoundCloud/Apple responses, webhook
  bodies, scraped pages) is untrusted: validate shape before use.
- Text from outside (track titles, artist names, playlist names, pasted
  links) goes in with `textContent` or escaped. Any new `innerHTML` that
  includes such text must escape it. There are many existing `innerHTML`
  uses; check each one you touch.
- URLs the worker fetches on a user's behalf: allowlist hosts, block private
  and loopback ranges (SSRF), cap response size and time.
- Length limits on anything stored (KV/D1) or echoed back.

**Authentication and sessions**
- Admin and owner endpoints check the token on every request, server-side,
  with a constant-time compare. Missing/wrong token returns a generic error.
- Session and profile tokens: random from `crypto.getRandomValues`, never in
  URLs or logs, invalidated on delete/logout (see `profile-delete.js`).
- Rate-limit anything that costs money or quota (voice, captioner, search).
  See `voice-quota.js`.

**Authorization**
- A user can only read, change, or delete their own data. Check the ID comes
  from the verified session, not from the request body.
- New endpoints are deny-by-default; the CORS origin allowlist (`admin.js`)
  must not widen to `*` for anything that returns user data or accepts a
  token. `*` is fine only for public, read-only, non-user data.

**Data protection and privacy**
- Collect the minimum. Anything new that stores or sends personal data must
  match `privacy.html` and `docs/PRIVACY-AUDIT.md`; update both in the same
  commit.
- Never log tokens, keys, emails, or full user content. Mask before logging.
- Secrets live in Worker secrets / `wrangler secret put`, never in the repo,
  `wrangler.toml` vars, `index.html`, or the Android/desktop wrappers.
- Third-party services get only what they need, over HTTPS.

**Error handling and logging**
- Worker errors return a generic message and status; details go to logs only.
- Network/third-party failures have a fallback or a clear message; no
  unhandled promise rejections that blank the UI.
- Release resources on error paths (timers, audio nodes, workers, streams).

**Dependencies**
- New dependency needs a reason; prefer none. Pin versions; check the
  package's maintenance and license before adding.
- Run `cd worker && npm audit` before a worker deploy and when bumping
  `wrangler`.
- External scripts/styles/fonts in `index.html`: only from hosts already in
  use; no unpinned CDN URLs.

**Service worker and installs**
- `sw.js` caches only same-origin GETs it expects; never cache responses
  that carry tokens or user data.
- Update/self-update paths (Android updater, desktop) verify the source is
  our own origin over HTTPS before installing anything.

**Review hygiene**
- Security-relevant commits say so in the message.
- Skim `git log -p` for the touched area: has anyone loosened a check
  before?
- Findings go to GitHub issues with the `security` label; fix before ship
  when it is exploitable.

## Audit log

- 2026-11-02: first pass. Fixed: unescaped `innerHTML` spots; pod routes could
  fetch internal hosts (now `public-url.js`); catch-all 500 echoed error text;
  `sw.js` cached sign-in URLs with the tester token and error pages;
  `/report` and `/pool/signal` wrote to KV with no per-IP throttle.
  Checked and fine: profile routes derive the KV key from the verified Google
  `sub`; admin token check is constant-time and throttled; no secrets in logs;
  tokens are never read from query strings.
  Known and left: several routes return `e.message` from upstream fetch
  failures (`/search`, youtube search) and JWT verify errors; low risk.
- 2026-11-10: `POST /vibe-picture` (picture vibes, #744) reviewed. Anonymous route
  that spends Workers AI neurons and takes an upload: 1 MB cap enforced while
  streaming, content-type allowlist plus magic bytes, per-IP throttle (10/hour),
  own account-wide daily neuron ceiling that fails closed, picture never written
  to KV/R2/cache/logs, model output length-capped, stripped of control chars,
  markup and URLs, and escaped on display, generic error bodies, no URL fetch
  (SSRF n/a), no secrets. `privacy.html` section 5b and `PRIVACY-AUDIT.md` updated.
  Left: the per-IP throttle is the existing per-colo cache counter, so it is
  approximate; the daily ceiling is the hard guard.
- 2026-11-11: desktop yt-dlp self-update (`desktop/ytdlp-update.js`, `updater.js`,
  `wave.js`) tightened. Before: trusted the release's own unsigned checksum file and
  followed redirects to any host. Now: checksum file must be signed by yt-dlp's pinned
  release key, zip must match it and GitHub's asset digest, https and GitHub hosts only
  (redirects included), size caps while streaming, unpacked tree may not link outside its
  folder, yt-dlp runs with `--ignore-config --no-plugin-dirs`, no system copy in the
  packaged app. App self-update path unchanged. Left: yt-dlp's key is pinned, so a key
  rotation by yt-dlp stops updates until an app release.
- 2026-11-11: `POST /owner/tier` (owner plan tester) and the `owner`/`testing` fields on
  `POST /entitlement` reviewed. Owner = verified token whose verified email equals the
  `OWNER_EMAIL` secret (unset = nobody); identity and `sub` come from the token, never
  the body; tier is an allowlist; writes only the caller's own `ent:<sub>` with
  `src: 'owner'`, which a Patreon sync never overwrites; anyone else gets a generic 403
  and nothing is written; existing per-IP throttle on these routes. Cost: one KV write per
  switch. The Settings panel is hidden for everyone else; hiding it is UX only, the worker
  is the gate.
