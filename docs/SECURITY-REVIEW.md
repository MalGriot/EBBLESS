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
