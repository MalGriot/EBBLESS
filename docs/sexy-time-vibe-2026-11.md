# "sexy time" as a house vibe (T-0009), November 2026

Branch `claude/sexy-time-vibe-39ac24`, cut from `main` at c0a1779 (release 575). Nothing pushed, deployed, or written to the live Sheet or Cloudflare. Separate from T-0007 (`claude/vigorous-morse-0bbe88`), which this branch does not touch or merge.

## What changed

- `house-vibes.json`: entry "getting laid tonight" (tags rnb, slow jams, sensual, sexy; energy 0.35-0.65; Marvin Gaye, D'Angelo, Jodeci, Ginuwine seeds) gains the phrases `sexy time`, `sexy times`, `sexytime`. File `version` 5 to 6, so the worker's cached house answers refresh (cache key includes `h<version>`).
- No new vibe: an entry with the right tags and seeds already existed.
- Spacing and case variants need no extra phrases: both the app (`houseVibeNorm`) and the worker (`vibeKeyNorm`) lowercase, turn punctuation and hyphens into spaces and collapse runs of spaces. "Sexy Time", "sexy   time", "sexy-time" all hit. `sexytime` and `sexy times` are different words, so they are listed.
- Tests: `scripts/test-house-vibes.js` (new, wired into `scripts/check.sh`) runs the real loader and `looksConversational()` from `index.html` against the real JSON; one new test in `worker/test/vibe-intent.test.mjs`.

## Where the phrase matches

- App: `looksConversational()` (index.html ~23743) returns true for an exact house phrase, so Search runs the vibe path (`beginConversationalVibe`) instead of song search.
- Worker: `/vibe-interpret` uses `matchHouseVibe()` (longest whole-word phrase anywhere in the sentence), so "a sexy time playlist please" also gets the house seeds and tags. The worker builds from the same JSON (`worker/src/house-vibes.js`); no generated file to refresh.
- Unchanged: "sexy" alone and "time" alone (song search); "Sexy Time - Artist" (the dash rule keeps it a keyword search); "sexy time remix", "sexy time by someone" (three words, no talking words). The existing mood word "sexy" in the vibe boxes is unrelated.

## Home chip decision: not shown

Home chips show each entry's first phrase, and this entry leads with "getting laid tonight", which `HOUSE_VIBE_NO_SHOW` hides. I added "sexy time" at the end of the list and left `HOUSE_VIBE_NO_SHOW` alone, so no chip appears. Reason: the request was to make the typed phrase work for the newsletter line; putting an on-screen suggestion on the first Home screen for every tester is a separate product call. If the CEO wants it as a chip, make "sexy time" the entry's first phrase (one-line move, no code change); the test case "is not a Home chip" would then be flipped.

## Release steps (CEO decides; nothing here has run)

Typed vibe needs both sides live. Order matters little; until the worker deploys, the app opens the vibe path but the worker answers from the model without the house seeds.

**Release number.** This is a data-only change, like the earlier `house-vibes.json` edits (30e5424): no `sw.js` bump and no WHATS_NEW entry, which also keeps it clear of T-0007's release 576. The app reads the JSON with a plain fetch that the service worker does not cache, so testers get it on next load (GitHub Pages cache is short). If the CEO wants a visible release note, bump sw.js to the next free number and add a WHATS_NEW line in the same commit.

**What the app push ships.** Merge this branch to `main` (after T-0007 if that is the plan), then `git push origin main`. `main` and `origin/main` were level when checked (after `git fetch`), so the push ships only this commit: `house-vibes.json`, `scripts/test-house-vibes.js`, `scripts/check.sh`, `worker/test/vibe-intent.test.mjs`, this doc. No `index.html` or `sw.js` change. If T-0007 has merged first, the push also ships T-0007's commits; check `git log --oneline origin/main..main` right before pushing.

**What a worker deploy ships** (`cd worker && npx wrangler deploy`, from `main` after the merge).
- Checked read-only: `git log --oneline a898e04..main -- worker/ house-vibes.json` lists exactly one earlier commit, `db414e3` (profile-sync merge fix, `worker/src/index.js`, one line). `npx wrangler deployments list` shows the latest deployment at 2026-11-18T02:33:21Z; `db414e3` was committed 08:03 IST (02:33:00Z), 21 seconds earlier. So `db414e3` is very probably already live (a deployment stores no commit, so this is inference).
- Likely effect of a deploy now: only the house-vibes.json change (new phrases, version 6). If `db414e3` is not actually live, the deploy ships it too; if T-0007 has merged, add its `worker/src/beta.js` change (play counters). Re-run the two commands above right before deploying; the answer is the list they print.
- Before deploying: the repo README's Workers plan check, then `cd worker && npm test` (261 pass on this branch).
- After deploying: in the app type "sexy time" on a device that has the new JSON; it should open a vibe playlist led by Marvin Gaye / D'Angelo. Rollback: redeploy the previous version from the Cloudflare dashboard, or revert this commit and redeploy.

## Checks run

- `scripts/check.sh`: passes.
- `cd worker && npm test`: 261 pass, 0 fail.
- `node scripts/test-house-vibes.js`: 5 pass; confirmed it fails ("sexy time") against main's JSON.

## Not verified

- Not run in a browser or on a device, and the live worker was not called (no deploys, per the brief). The vibe playlist itself comes from the worker plus Apple Music lookups and is untested here.
- The running worker version is inferred from deployment times, not read from Cloudflare.
- The newsletter line is only true after both the app push and the worker deploy.
