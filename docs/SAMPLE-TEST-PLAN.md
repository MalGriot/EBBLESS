# Sample and tester-window: test from scratch before going live

Nothing here needs a deploy. Run it against the local server first, then on
your phone over Wi-Fi. Ticks go in your head or a copy of this file.

## 0. Set up a clean slate

- Local server (already configured as `ebbless` in `.claude/launch.json`):
  `python3 -m http.server 8934` from the repo root. It listens on every
  interface, so a phone on the same Wi-Fi can use `http://<your-mac-ip>:8934/`
  (this Mac was `192.168.1.101`; check with `ipconfig getifaddr en0`).
- Use a **private window** for every "new visitor" run, and close it between
  runs. That is the only reliable clean slate (it has no cookie, no site data).
- Localhost always skips the beta lock. The Wi-Fi address does not, so use it
  to see the real lock screen and the real "redirect beta users" behavior.
- Over plain `http://` on the LAN the service worker, Document PiP and some
  clipboard features are off (secure-context only). That is a test-setup
  limit, not an app bug. The final check on the live https URL covers it.

## 1. New visitor, desktop (Chrome, then Safari, then Firefox)

Open `/sample/` in a private window.

1. The real app shows at once (three panes). Everything is dimmed except the
   `?` button, which blinks, with "You should start here." No countdown is
   running (the pill reads `15:00`).
2. Wait 30 seconds. The pill still reads `15:00`.
3. Click **Start the tutorial**. The tutorial runs, its music plays, the pill
   still reads `15:00`. Finish or skip it.
4. Reopen the tutorial from `?`. Works.
5. Paste a Spotify playlist, a YouTube link and a SoundCloud link. Each
   loads. Nothing plays yet, pill still `15:00`.
6. Press play on a song. The pill starts counting within a second.
7. Pause, open Settings, open Library, open the queue. The pill keeps running.
8. Cassette, LP, visualizer, lyrics. In **Safari** check the cassette
   specifically (the `<base>` / `url(#id)` risk). Note if it looks blank.
9. Toggle Discover on a playlist and let it queue a few songs.
10. Settings: no Send feedback row, no Install row, Account says "Join the
    beta". No Google One Tap prompt anywhere.

If Safari fails step 8 or step 1 (blank page, no localStorage), tell me and I
switch `sample/index.html` to the redirect (`../?sample=1`).

## 2. Refresh and reopen

- Before pressing play: refresh. The intro is not shown again after you
  dismissed it; the pill is still `15:00`.
- After pressing play: refresh, close the tab, reopen `/sample/` in the
  **same** private window. Remaining time continues from where it was
  (not restarted). Your imported playlists are gone only if you closed the
  tab (expected, they are throwaway).
- Expire it (see section 4), then refresh and reopen. The "edge of the
  sample" screen appears again every time. The clock never restarts.

## 3. Phone (iPhone Safari, then Android Chrome)

Over `http://<mac-ip>:8934/sample/`.

1. The install gate does **not** appear (the sample skips it). The mobile UI
   shows with the blinking `?` and the bubble.
2. The pill sits at the top right and the search field is still usable.
3. Press play: does audio start without a second tap? (SoundCloud may need a
   tap, known.) Lock the screen: does audio continue or pause? Note which.
4. Open the link from inside Instagram or Messages (in-app browser): does it
   load and play? Note what breaks.
5. Rotate: portrait-only message still appears.

## 4. Expiry and warning

On the sample page, in the browser console:

```js
ebblessSample.skipTo(125000)   // 2:05 left
ebblessSample.expireNow()      // 0:00
ebblessSample.status()         // started / expired / remainingMs
ebblessSample.reset()          // wipe the trial and reload
```

- At about 2:00: toast "2 minutes left in the sample" and the pill turns gold.
- At 0:00: music stops within a second, the app behind is dimmed and not
  clickable, the screen reads "You've reached the edge of the sample."
- **Join the beta** goes to `/beta/#join` and opens the signup form.
  Do not submit it for real. To rehearse the form, add `?backend=staging`
  to the beta URL (the README documents this switch).
- "Already approved? Open EBBLESS" goes to the real app.
- Media keys and the lock-screen controls do not restart playback.

## 5. Real app and beta users are untouched

1. Open `/` (not `/sample/`) on the Wi-Fi address in a private window: you get
   the **lock screen** with "JOIN THE BETA", "See what EBBLESS is" and the new
   "Try it for 15 minutes".
2. Open a real tester invite link (`/?t=<token>`) in a normal window. The app
   unlocks as before.
3. Now open `/sample/` in that same window: you are sent to the real app,
   not the sample. `/sample/?sample=force` shows the sample anyway.
4. In that tester window, run the sample with `?sample=force`, add a playlist
   and like a song, then return to `/`. Your real library has none of it.
   (DevTools > Application > Local Storage should hold only
   `ebbless:sampleTrial` from the sample, and your own keys unchanged.)
5. DevTools > Network during a sample session: no requests to
   `/profile/`, `/auth/`, `/nowplaying`, `/tester-report`, `/pool/signal`,
   `/report`, `/beta/activity`, `/beta/me`.

## 6. Tester window: 7 days then 14

Offline (done, repeat any time): `cd worker && npm test` (105 pass, includes
the 7/14 cases).

Against the real Sheet, read-only:

1. Paste the current `tools/beta-sheet.gs` into Apps Script (this does not
   deploy anything by itself).
2. Run `previewWindows` from the editor and open View > Logs. Every tester
   accepted before 2026-10-14 should read **14 days**. After you accept the
   next new tester, they should read **7 days** and `round 1`.
3. Check one rejoined tester (round 2): 14 days.
4. Only then do "Manage deployments > New version", then
   `cd worker && npx wrangler deploy`. Deploy the Sheet first. The worker
   treats a missing value as 14, so the order is safe either way.
5. After deploy, a tester's own page should still show their end date and
   the end-of-window recap title should read "7 DAYS" or "2 WEEKS" to match
   (`?wrapped=preview` shows the recap now).

## 7. Go-live checklist

- [ ] Sections 1 to 5 pass in Chrome, Safari and one phone.
- [ ] `previewWindows` output looks right; Sheet deployed, then worker.
- [ ] `sw.js` `CACHE_VERSION` is `v179` or higher (any later change to
      `index.html` needs another bump).
- [ ] Decide the open items in `docs/SAMPLE-SPLASH-PLAN.md` (welcome page
      hand-off, beta-full behavior).
- [ ] Push to `main` (GitHub Pages deploys from the branch). Smoke-test
      `https://malgriot.github.io/EBBLESS/sample/` once in a private window.
