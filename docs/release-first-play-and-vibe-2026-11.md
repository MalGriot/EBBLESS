# Combined release plan: first-play (T-0007) and "sexy time" vibe (T-0009)

Written 2026-11-18 on the T-0007 branch (`claude/vigorous-morse-0bbe88`). Doc only. Nothing here has been run: no merge, push,
worker deploy or Sheet change. The T-0009 branch (`claude/sexy-time-vibe-39ac24`, `7a0febb`) was read without touching it.
Details of each change: [first-play-build-2026-11.md](first-play-build-2026-11.md) and, on the T-0009 branch,
`docs/sexy-time-vibe-2026-11.md`.

## Why one plan

Both releases change what the worker bundles. T-0007 changes `worker/src/beta.js` (the three play counters). T-0009 changes
`house-vibes.json`, which the worker imports and bundles at deploy (`worker/src/house-vibes.js:8`) and which the app also
fetches. `wrangler deploy` replaces the whole worker, so two separate deploys from two different trees would let the second
silently remove the first. This plan makes **one worker deploy** that carries both.

## State when this was written (re-check before starting)

| Item | Value |
|---|---|
| `origin/main` | `b0017cc` ("Faster startup"). It took **release 576** (`sw.js` `ebbless-shell-v576`, `WHATS_NEW` 576) |
| T-0007 branch head | `5d18fc8`, merged with `main` at `c0a1779`, holds release 576 too, so **it conflicts with `origin/main` again** in `index.html` (`WHATS_NEW`) and `sw.js` |
| T-0009 branch | `7a0febb`, cut from `main` at `c0a1779`; data-only, **no `sw.js` bump, no `WHATS_NEW`, no `index.html` change**, so no release number to fight over |
| Running worker | version `a49e3cec-ba42-4e31-962c-bb7f0edcec9a`, deployed 2026-11-18T02:33:21Z, the `db414e3` tree (inferred from timestamps, see the build doc) |
| `git diff --stat db414e3 origin/main -- worker house-vibes.json` | empty: `origin/main` has no worker or vibe change beyond what is running |

If any of these differ when you start, stop and re-map before going on. In particular, if `wrangler deployments list` does not
show `a49e3cec` as the latest, do not deploy.

## Step 0: get both branches ready on `main` (local only, no push)

1. **T-0007 merges first.** It carries the release number, the Sheet change and the bigger app change; T-0009 is data only
   and can land on top without a release number.
   - On the T-0007 branch: `git fetch && git merge origin/main`. Resolve `index.html` and `sw.js` the same way as before:
     keep main's `WHATS_NEW` entries, put T-0007's entry on top as the next free number (**577** if `origin/main` is still `b0017cc`),
     set `sw.js` to the same number. This is a code and release-number change, so it is **not** part of this doc commit; the
     T-0007 session does it as one small merge commit. Then `scripts/check.sh`, `node scripts/test-first-play.js` and
     `cd worker && node --test test/*.test.mjs`.
   - Then merge the T-0007 branch into local `main` (no push).
2. **T-0009 merges second.** `git merge claude/sexy-time-vibe-39ac24` into local `main`. A trial merge shows exactly one conflict:
   `scripts/check.sh`, because both branches add a test line right after `node scripts/test-official-video.js >/dev/null`.
   **Keep both lines**, in this order:
   ```
   node scripts/test-first-play.js >/dev/null
   node scripts/test-house-vibes.js >/dev/null
   ```
   Who resolves it: whoever performs the second merge (the T-0009 side or HQ start; it is trivial). `index.html`, `sw.js` and the
   worker files do not conflict between the two branches.
3. **Check local `main`.** Run `scripts/check.sh`, `node scripts/test-first-play.js`, `node scripts/test-house-vibes.js` and
   `cd worker && node --test test/*.test.mjs` (268 pass on the combined worker tree). Then confirm what will ship:
   `git fetch && git log --oneline origin/main..main` must list only T-0007 commits (the 9 in the build doc, the doc tidy, the
   release-577 merge) plus T-0009's `7a0febb` and the merge commit(s). If anything else is there, stop.

Rollback for step 0: nothing is published. Reset local `main` to `origin/main` (`git reset --hard origin/main` on the integration
checkout only, never on a branch someone else uses).

## Step 1: the Sheet (T-0007)

Do this **before** the app is pushed, so the Sheet exists when the new counters start to arrive.

1. Open the beta Sheet, Extensions, Apps Script. Paste the whole `tools/beta-sheet.gs` from `main`.
2. Deploy, Manage deployments, edit the existing Web app deployment, Version: New version. Do not create a new deployment
   (`SHEET_URL` must not change).
3. In the Sheet: menu EBBLESS Beta, Set up / repair sheet. It adds `plays_tapped`, `plays_started`, `plays_failed` at the far right
   of Analytics, rebuilds the Dashboard with the new block, and reinstalls the two triggers.
4. Check: Dashboard rows 1 to 30 unchanged (39 / 36 / 28 funnel numbers); a new block "FIRST PLAY" starts at row 32 with
   "Testers who tapped play", "Testers whose play started", "Opened, tapped play, never started", "Opened since release, never
   tapped play", "Play timeouts or errors".

Testers see: nothing. The old app and the old worker never send the new fields; the three columns are blank.
Rollback: re-paste the previous `beta-sheet.gs`, deploy it as a new version of the same deployment, run Set up / repair sheet.
The extra Analytics columns may stay.

## Step 2: ONE worker deploy (counters and new vibe phrases together)

The worker must be built from the **running tree plus exactly the changes of both releases**, not from whatever `main` holds.

Files that differ from the running tree (`db414e3`) after both merges, from a trial build:

| File | From | Bundled into the worker? | What it does |
|---|---|---|---|
| `worker/src/beta.js` | T-0007 | yes | `POST /beta/activity` accepts `playTapped`, `playStarted`, `playFailed` (whole numbers, 0 to 500) |
| `house-vibes.json` | T-0009 | yes (imported by `worker/src/house-vibes.js`) | version 5 to 6; the entry "getting laid tonight" gains the phrases `sexy time`, `sexy times`, `sexytime` |
| `worker/test/beta-activity.test.mjs` | T-0007 | no, test only | 7 tests for the route |
| `worker/test/vibe-intent.test.mjs` | T-0009 | no, test only | one test for the new phrases |

That is the complete list: `git diff --stat db414e3 main -- worker house-vibes.json` must show exactly these four files, and
nothing else. No other worker file changes, so `db414e3`'s profile-sync fix, `2f8edeb`, `3742a14` (paywall switch) and `a898e04`
stay exactly as they are running now.

Commands, from the repo root:

```bash
git fetch
cd worker && npx wrangler deployments list     # STOP unless the latest is still a49e3cec-ba42-4e31-962c-bb7f0edcec9a
cd ..
git worktree add --detach ../w-release db414e3 # base = the running tree
cd ../w-release
git checkout main -- worker/src/beta.js worker/test/beta-activity.test.mjs house-vibes.json worker/test/vibe-intent.test.mjs
git diff --cached --stat db414e3 | cat         # must list exactly those four files
cd worker && npm ci && npm test                # 268 pass
npx wrangler deploy --dry-run --outdir ../../dry   # optional, bundles locally, no upload
npx wrangler deploy
cd ../.. && git worktree remove --force w-release
```

A trial of this exact build (running tree plus those four files) bundled clean (380 KiB, 100 KiB gzip) and passed all 268
worker tests; the deploy itself was not run. After deploying:

- `curl -s -X POST <worker>/beta/activity -d '{}'` answers 403 `not a tester` (not an error page).
- `curl -sI <worker>/s` still answers 302 (the share route is untouched).
- `npx wrangler deployments list` shows a new latest version; write down its id for the rollback below.

Testers see: nothing yet from the counters (the app that sends them is not live); a typed "sexy time" starts going through the
house vibe worker-side, but the app still treats it as a song search until the app JSON is live (step 3), so the visible change
waits for step 3.
Rollback: `npx wrangler rollback a49e3cec-ba42-4e31-962c-bb7f0edcec9a` (one command undoes both the counters and the vibe,
because they are one version). The app keeps working either way: an old worker just ignores the three counter fields.

If `wrangler deployments list` shows anything newer than `a49e3cec`, someone deployed in between. Do not continue. Work out what
it contains, rebase the base commit above on it, and redo the file list.

## Step 3: push the app (`main`)

1. `git fetch && git log --oneline origin/main..main` once more: only the T-0007 and T-0009 commits.
2. `git push origin main` (GitHub Pages serves it). This ships, in one push: T-0007's `index.html`, `sw.js` (release 577),
   `tools/beta-sheet.gs`, `scripts/*`, docs and the evidence screenshots, T-0009's `house-vibes.json`, its tests and its doc.
3. Testers get the new app on their next load (the Android app refreshes its local copy in the background, so allow one
   launch). `house-vibes.json` is fetched with a plain request the service worker does not cache.

Testers see: the splash with **Play** (Enter hidden until they have really played), a song from one tap with no sign-in first,
Google sign-in only after the first song, and typing "sexy time" opens a vibe playlist (sensual slow jams) instead of a song
search. The Android app's native splash still shows Tutorial and Enter (known gap, in the build doc).
Rollback: revert the T-0007 merge and the T-0009 merge as two separate commits, `git push origin main`; testers get the revert
on their next load. T-0009 can be reverted alone (data only) without touching the Play change, and the other way round.
Reverting the app does not require rolling back the worker or the Sheet.

## Step 4: final checks (about 15 minutes)

1. **Phone check (the CEO's Android phone, Chrome).** In a Private tab (fresh storage) open the beta link. Wait for the splash
   (the buttons fade in about 4 seconds after load). Expect Play, Import your music and Tutorial, and **no Enter**. Tap Play
   once: a song starts within about 10 seconds with no Google sign-in. Close the tab and reopen the link: Enter is shown, Play
   is not. If Play does nothing or no song starts, roll back the app (step 3 rollback).
2. **Dashboard rows.** Wait up to 10 minutes (or close the tab to flush), then in the Sheet: that tester's Analytics row has
   `plays_tapped` 1 and `plays_started` 1; the Dashboard block "FIRST PLAY" shows "Testers who tapped play" at 1 or more and
   "Testers whose play started" at 1 or more; "Play timeouts or errors" stays 0; rows 1 to 30 still read as before. If counts
   stay blank, check step 1 (Sheet) and step 2 (worker) before touching the app.
3. **"sexy time" gives a vibe.** In the app, after a hard reload so it has the new `house-vibes.json`, type `sexy time` in
   Search and press Enter: it should open a vibe playlist led by Marvin Gaye or D'Angelo, not a song search. Also try
   `Sexy-Time` (case and punctuation) and check that `sexy` alone and `time` alone still do a normal song search.
4. Write down the new worker version id and the pushed `main` commit next to the rollback commands above.

## What is not verified

- Nothing in this plan has been run on live: no merge, push, deploy or Sheet step.
- The running worker commit (`db414e3`) is inferred from deployment timestamps; Cloudflare stores no commit.
- Real Android Chrome and the real Android app are untested for T-0007; the vibe playlist for T-0009 comes from the worker plus
  Apple Music lookups and was not exercised end to end.
- Release 577 is a prediction from `origin/main` today; take the next free number if `main` has moved.
