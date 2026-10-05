// EBBLESS beta - Google Apps Script bound to the beta Google Sheet.
//
// The Sheet is the source of truth for the beta:
//   Applicants   everyone who filled out the signup form (one row each)
//   Testers      only people you accepted; references applicant_id
//   Feedback     what active testers said (references tester_id)
//   Bug Reports  problems active testers reported (references tester_id)
//   Analytics    anonymous app usage, one row per tester (no names/emails,
//                no track or playlist names - counts and dates only)
//   Dashboard    counts, activity and 7-day return
//
// Day to day you never touch code: set an applicant's applicant_status to
// Accepted and this script creates their Tester row (next tester number,
// private token, access link) and emails the invite. Set a tester's
// tester_status to Inactive and their link stops working. 24 hours after
// acceptance, each Active tester is emailed the feedback form once
// (feedback_request_sent records when). The 50 cap counts
// Active testers only and closes public signups (they still land as Pending);
// you can accept past it by hand. Tester numbers are never reused.
//
// The worker (worker/src/beta.js) calls this as a web app with a shared
// secret: signup, status, me (token check), report and activity, plus
// admin_list / admin_update for the owner-only admin page (beta/admin.html,
// worker/src/admin.js). Columns are found by
// header name, so you can add your own columns or reorder them freely
// (re-run setup afterwards so the Dashboard formulas follow).
//
// Setup (one time, signed in as the Gmail account emails should come from):
//   1. Create a blank Google Sheet. Extensions > Apps Script, replace Code.gs
//      with this file, save.
//   2. Reload the Sheet. Menu "EBBLESS Beta" > "Set up / repair sheet".
//      Authorize when asked. It creates the tabs, dropdowns, Dashboard and
//      the edit trigger, and shows the shared secret.
//   3. In Apps Script: Deploy > New deployment > type: Web app.
//        Execute as: Me    Who has access: Anyone
//      Copy the Web app URL.
//   4. In worker/:  npx wrangler secret put SHEET_URL      (the Web app URL)
//                   npx wrangler secret put SHEET_SECRET   (the secret from step 2)
//
// After editing this script later: Deploy > Manage deployments > edit >
// Version: New version, so the web app picks up the change (same URL).

const CAP = 50;
const SITE_URL = 'https://malgriot.github.io/EBBLESS/beta/';
const SENDER_NAME = 'EBBLESS BETA';
const SHOTS_FOLDER = 'EBBLESS Beta Screenshots';

const APPLICANTS = 'Applicants', TESTERS = 'Testers', FEEDBACK = 'Feedback', BUGS = 'Bug Reports', DASHBOARD = 'Dashboard', ANALYTICS = 'Analytics';
const APPLICANT_STATUSES = ['Pending', 'Accepted', 'Waitlisted', 'Rejected'];
const TESTER_STATUSES = ['Active', 'Inactive'];
const HEADERS = {};
HEADERS[APPLICANTS] = ['applicant_id', 'name', 'email', 'Instagram', 'device', 'device_model', 'operating_system', 'browser',
  'technical_comfort', 'music_platform', 'music_preferences', 'Spotify_playlist', 'why_they_want_to_test',
  'what_they_want_EBBLESS_to_do', 'signup_timestamp', 'applicant_status', 'notes', 'ok_to_contact_later', 'user_agent'];
HEADERS[TESTERS] = ['tester_id', 'tester_number', 'applicant_id', 'name', 'email', 'accepted_timestamp',
  'access_token', 'access_link', 'tester_status', 'notes', 'feedback_request_sent', 'exclude_from_analytics'];
HEADERS[FEEDBACK] = ['feedback_id', 'tester_id', 'tester_number', 'submitted_timestamp', 'source', 'category', 'feeling',
  'what_happened', 'what_they_expected', 'anything_else', 'keep_using', 'screenshot',
  'device', 'operating_system', 'browser', 'viewport', 'user_agent',
  // feedback survey (beta/feedback.html); keep_using / feeling above are shared
  'first_impression', 'what_they_tried', 'enjoyed_most', 'could_be_better', 'favorite_visual_mode',
  'changes_music_experience', 'would_bring_them_back', 'bug_report', 'one_change',
  // owner-curated testimonials (admin page): only ticked rows with a quote go public
  'publish', 'public_quote'];
HEADERS[BUGS] = ['bug_id', 'tester_id', 'tester_number', 'submitted_timestamp', 'area', 'what_went_wrong',
  'expected', 'actual', 'steps', 'screenshot', 'device', 'operating_system', 'browser', 'viewport', 'user_agent'];
// Feature names the app reports (worker/src/beta.js FEATURES). uses_<name>
// counts sessions in which the tester used it.
const FEATURES = ['lyrics', 'cymatics', 'lp', 'cassette', 'youtube_video', 'fullscreen', 'discover', 'podcast',
  'soundcloud', 'cast', 'vibe_search', 'share'];
HEADERS[ANALYTICS] = ['tester_number', 'tester_id', 'first_active', 'last_active', 'days_since_active', 'sessions',
  'listening_minutes', 'songs_played', 'playlists_played', 'playlists_added', 'days_active', 'returned_within_7d',
  'active_days'].concat(FEATURES.map(function (f) { return 'uses_' + f; }));

// ---------- sheet helpers ----------

function ss_() {
  return SpreadsheetApp.getActive() || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
}
function sheet_(name) { return ss_().getSheetByName(name); }
function cols_(sh) {
  const m = {};
  sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].forEach(function (h, i) { if (h) m[String(h).trim()] = i; });
  return m;
}
// Rows as objects keyed by header, each with its 1-based sheet row in _row.
function records_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  const c = cols_(sh);
  return sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues().map(function (row, i) {
    const o = { _row: i + 2 };
    Object.keys(c).forEach(function (k) { o[k] = row[c[k]]; });
    return o;
  });
}
// Leading = + - @ would make Sheets treat a tester's text as a formula.
function safe_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function append_(sh, obj) {
  const c = cols_(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  Object.keys(obj).forEach(function (k) { if (k in c) row[c[k]] = safe_(obj[k]); });
  sh.appendRow(row);
}
// Adds any of `headers` the tab is missing, after its last column.
function ensureHeaders_(sh, headers) {
  const have = cols_(sh);
  const missing = headers.filter(function (h) { return !(h in have); });
  if (missing.length) sh.getRange(1, Object.keys(have).length ? sh.getLastColumn() + 1 : 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
}
function setCell_(sh, rowNum, header, value) {
  const c = cols_(sh);
  if (header in c) sh.getRange(rowNum, c[header] + 1).setValue(value);
}
function numFrom_(v) { const m = /(\d+)\s*$/.exec(String(v || '')); return m ? parseInt(m[1], 10) : 0; }
function pad_(n, w) { return String(n).padStart(w, '0'); }
function testerLabel_(n) { return 'EBBLESS TESTER #' + pad_(n, 3); }
function nextId_(sh, header, prefix, width) {
  const max = records_(sh).reduce(function (m, r) { return Math.max(m, numFrom_(r[header])); }, 0);
  return prefix + pad_(max + 1, width);
}
function hex_(n) { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, n); }
function activeCount_() { return records_(sheet_(TESTERS)).filter(function (t) { return t.tester_status === 'Active'; }).length; }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
// No-op when there's no Sheet UI (web app calls from the admin page).
function toast_(msg) { try { ss_().toast(msg, 'EBBLESS Beta', 10); } catch (err) {} }

// ---------- email ----------

function accessLink_(token) { return SITE_URL + 'tester.html?t=' + encodeURIComponent(token); }

function inviteText_(t) {
  const tok = encodeURIComponent(t.access_token);
  return 'Peace. You\'re one of the 50 people testing EBBLESS. You\'re ' + t.tester_number + '.\n\n' +
    'Open it:\n' + SITE_URL + 'tester.html?t=' + tok + '\n\n' +
    'Throw one of your playlists into it (Spotify, YouTube, Apple Music, SoundCloud) and fuck around with it.\n' +
    'Try the different visual modes, lyrics, YouTube, etc.\n\n' +
    'The point of this beta isn\'t to be nice to me. If something is confusing, broken, slow, ugly, unnecessary, or just doesn\'t make sense, tell me.\n\n' +
    'Feedback:\n' + SITE_URL + 'feedback.html?t=' + tok + '\n\n' +
    'If something is seriously broken, use Report a Bug:\n' + SITE_URL + 'bug.html?t=' + tok + '\n\n' +
    'Have fun with it.';
}

function sendMail_(to, subject, text, html) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html || undefined, name: SENDER_NAME });
    return '';
  } catch (err) { return String(err); }
}

// ---------- feedback request (24h after access) ----------

const FEEDBACK_REQUEST_AFTER_MS = 24 * 3600 * 1000;

function feedbackRequestText_(first, link) {
  return 'Peace and love, ' + first + '.\n\n' +
    'Just checking in now that you\u2019ve had a little time with EBBLESS. I\u2019m really curious what you\u2019ve made of it so far.\n\n' +
    'What did you love? What confused you? What broke? What would make you want to come back?\n\n' +
    'Take a few minutes and tell me here:\n\n' + link + '\n\n' +
    'The feedback window is open for 7 days from today. After that, I\u2019ll close this round of beta feedback and start going through everything everyone has sent in.\n\n' +
    'No rush. Take some time to actually play with it first. And please be honest. \u2764\uFE0F\n\n' +
    'Mal';
}
function feedbackRequestHtml_(first, link) {
  const esc = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const p = function (h) { return '<p style="margin:0 0 16px">' + h + '</p>'; };
  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:15px;line-height:1.5;color:#121212">' +
    p('Peace and love, ' + esc(first) + '.') +
    p('Just checking in now that you\u2019ve had a little time with EBBLESS. I\u2019m really curious what you\u2019ve made of it so far.') +
    p('What did you love? What confused you? What broke? What would make you want to come back?') +
    p('Take a few minutes and tell me here:') +
    p('<a href="' + esc(link) + '">' + esc(link) + '</a>') +
    p('<b>The feedback window is open for 7 days from today. After that, I\u2019ll close this round of beta feedback and start going through everything everyone has sent in.</b>') +
    p('No rush. Take some time to actually play with it first. And please be honest. \u2764\uFE0F') +
    p('Mal') + '</div>';
}

// Hourly time trigger (created by setup): emails each Active tester the
// feedback form once, 24h after accepted_timestamp, and stamps
// feedback_request_sent so it never goes out twice. A failed send leaves the
// cell blank (retried next hour) and notes why.
function sendFeedbackRequests() {
  const sh = sheet_(TESTERS);
  withLock_(function () {
    ensureHeaders_(sh, HEADERS[TESTERS]);
    const now = Date.now();
    records_(sh).forEach(function (t) {
      if (t.tester_status !== 'Active' || t.feedback_request_sent || !t.access_token || !t.email) return;
      const accepted = t.accepted_timestamp instanceof Date ? t.accepted_timestamp.getTime() : Date.parse(t.accepted_timestamp);
      if (!accepted || now - accepted < FEEDBACK_REQUEST_AFTER_MS) return;
      const first = String(t.name || '').split(/\s+/)[0] || 'friend';
      const link = SITE_URL + 'feedback.html?t=' + encodeURIComponent(t.access_token);
      const err = sendMail_(t.email, 'EBBLESS BETA: tell me what you think', feedbackRequestText_(first, link), feedbackRequestHtml_(first, link));
      if (err) {
        const note = 'Feedback request NOT emailed: ' + err;
        if (String(t.notes || '').indexOf(note) < 0) setCell_(sh, t._row, 'notes', (t.notes ? t.notes + '\n' : '') + note);
      }
      else setCell_(sh, t._row, 'feedback_request_sent', new Date());
    });
  });
}

// ---------- web app (called by the worker) ----------

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  const secret = PropertiesService.getScriptProperties().getProperty('SHEET_SECRET');
  if (!secret || b.secret !== secret) return out_({ ok: false, error: 'unauthorized' });
  try {
    if (b.action === 'status') return out_({ ok: true, active: activeCount_(), cap: CAP });
    if (b.action === 'signup') return out_(signup_(b.applicant || {}));
    if (b.action === 'me') return out_(me_(b.token));
    if (b.action === 'report') return out_(report_(b));
    if (b.action === 'activity') return out_(activity_(b));
    if (b.action === 'admin_list') return out_(adminList_());
    if (b.action === 'admin_update') return out_(adminUpdate_(b));
    if (b.action === 'testimonials') return out_(testimonials_());
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function signup_(a) {
  const email = String(a.email || '').toLowerCase();
  const res = withLock_(function () {
    const sh = sheet_(APPLICANTS);
    const existing = records_(sh).filter(function (r) { return String(r.email).toLowerCase() === email; })[0];
    if (existing) return { ok: true, already: true, status: existing.applicant_status === 'Rejected' ? 'Pending' : String(existing.applicant_status || 'Pending') };
    const rec = {};
    HEADERS[APPLICANTS].forEach(function (h) { if (h in a) rec[h] = a[h]; });
    rec.email = email;
    rec.applicant_id = nextId_(sh, 'applicant_id', 'APP-', 4);
    rec.signup_timestamp = new Date();
    rec.applicant_status = 'Pending';
    append_(sh, rec);
    return { ok: true, status: 'Pending' };
  });
  if (res.already) return res;
  res.full = activeCount_() >= CAP;
  const first = String(a.name || '').split(/\s+/)[0];
  if (res.full) {
    sendMail_(email, 'EBBLESS BETA: you\'re on the waitlist', 'Peace ' + first + ',\n\nThe 50 EBBLESS beta spots are filled right now, so you\'re on the waitlist. If a spot opens up, you\'ll hear from me here.\n\nMAL GRIOT');
  } else {
    sendMail_(email, 'EBBLESS BETA: you\'re on the list', 'Peace ' + first + ',\n\nGot your signup for the EBBLESS beta. I\'m going through everyone by hand, so give me a little time. If you\'re in, your tester link comes to this address.\n\nMAL GRIOT');
  }
  return res;
}

// Only Active rows in Testers have working access.
function activeTester_(token) {
  token = String(token || '');
  if (!token) return null;
  return records_(sheet_(TESTERS)).filter(function (t) {
    return t.tester_status === 'Active' && String(t.access_token) === token;
  })[0] || null;
}

function me_(token) {
  const t = activeTester_(token);
  if (!t) return { ok: true, tester: null };
  // feedback_request_sent (ms epoch, or null if not emailed yet): the worker
  // derives the tester's 7-day window end from it (the email says so).
  const sent = t.feedback_request_sent instanceof Date ? t.feedback_request_sent.getTime() : Date.parse(t.feedback_request_sent);
  return { ok: true, tester: { id: t.tester_id, number: numFrom_(t.tester_number), label: String(t.tester_number), name: String(t.name).split(/\s+/)[0], feedback_request_sent: sent || null } };
}

function saveShot_(dataUrl, name) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return '';
  const props = PropertiesService.getScriptProperties();
  let folder;
  try { folder = DriveApp.getFolderById(props.getProperty('SHOTS_FOLDER_ID')); } catch (err) { folder = null; }
  if (!folder) { folder = DriveApp.createFolder(SHOTS_FOLDER); props.setProperty('SHOTS_FOLDER_ID', folder.getId()); }
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  return folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.' + ext)).getUrl();
}

function report_(b) {
  const t = activeTester_(b.token);
  if (!t) return { ok: true, tester: null };
  const bug = b.kind === 'bug';
  const f = b.fields || {};
  const id = withLock_(function () {
    const sh = sheet_(bug ? BUGS : FEEDBACK);
    ensureHeaders_(sh, HEADERS[bug ? BUGS : FEEDBACK]);   // new columns land without re-running setup
    const id = bug ? nextId_(sh, 'bug_id', 'EBB-TEST-', 4) : nextId_(sh, 'feedback_id', 'EBB-FB-', 4);
    const rec = {};
    HEADERS[bug ? BUGS : FEEDBACK].forEach(function (h) { if (h in f) rec[h] = f[h]; });
    rec[bug ? 'bug_id' : 'feedback_id'] = id;
    rec.tester_id = t.tester_id;
    rec.tester_number = t.tester_number;
    rec.submitted_timestamp = new Date();
    append_(sh, rec);
    return id;
  });
  if (b.screenshot) {
    const url = saveShot_(b.screenshot, id);
    if (url) {
      const sh = sheet_(bug ? BUGS : FEEDBACK);
      const row = records_(sh).filter(function (r) { return r[bug ? 'bug_id' : 'feedback_id'] === id; })[0];
      if (row) setCell_(sh, row._row, 'screenshot', url);
    }
  }
  return { ok: true, id: id, tester: { id: t.tester_id, number: numFrom_(t.tester_number) } };
}

// ---------- admin page (worker/src/admin.js, behind ADMIN_TOKEN) ----------

// What the admin page may change, by tab. Everything else is read-only there.
// Keep in sync with ADMIN_EDITABLE in worker/src/admin.js.
const ADMIN_EDITABLE = {};
ADMIN_EDITABLE[TESTERS] = { key: 'tester_id', cols: {
  tester_status: { options: TESTER_STATUSES }, notes: { max: 5000 }, name: { max: 80 }, email: { email: true },
  exclude_from_analytics: { bool: true } } };
ADMIN_EDITABLE[APPLICANTS] = { key: 'applicant_id', cols: {
  applicant_status: { options: APPLICANT_STATUSES }, notes: { max: 5000 } } };
ADMIN_EDITABLE[FEEDBACK] = { key: 'feedback_id', cols: {
  publish: { bool: true }, public_quote: { max: 400 } } };
// Never sent to the admin page: tester link tokens (and the links that carry them).
const ADMIN_HIDDEN = { access_token: true, access_link: true };
const ADMIN_TABS = [TESTERS, APPLICANTS, ANALYTICS, FEEDBACK, BUGS];

function plain_(v) { return v instanceof Date ? v.toISOString() : v; }
function adminRecord_(r) {
  const o = {};
  Object.keys(r).forEach(function (k) { if (k !== '_row' && !ADMIN_HIDDEN[k]) o[k] = plain_(r[k]); });
  return o;
}

// Every admin tab as { headers (sheet order), rows }.
function adminList_() {
  const tabs = {};
  ADMIN_TABS.forEach(function (name) {
    const sh = sheet_(name);
    if (!sh) { tabs[name] = { headers: [], rows: [] }; return; }
    const c = cols_(sh);
    const headers = Object.keys(c).filter(function (h) { return !ADMIN_HIDDEN[h]; }).sort(function (a, b) { return c[a] - c[b]; });
    tabs[name] = { headers: headers, rows: records_(sh).filter(function (r) { return r[headers[0]] !== ''; }).map(adminRecord_) };
  });
  return { ok: true, tabs: tabs, cap: CAP };
}

// One cell, found by the row's id (not row number, rows can move). `prev` is
// the value the admin page last saw; if the Sheet has changed since, nothing
// is written. Setting an applicant to Accepted or a tester back to Active runs
// the same flow as editing the Sheet by hand (script edits don't fire
// onBetaEdit).
function adminUpdate_(b) {
  const spec = ADMIN_EDITABLE[b.tab];
  const col = spec && spec.cols[b.column];
  if (!col) return { ok: true, updated: false, reason: 'not_editable' };
  let value = b.value;
  if (col.options && col.options.indexOf(value) < 0) return { ok: true, updated: false, reason: 'bad_value' };
  if (col.bool) { if (typeof value !== 'boolean') return { ok: true, updated: false, reason: 'bad_value' }; }
  else if (!col.options) {
    value = String(value == null ? '' : value).slice(0, col.max || 200);
    if (col.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return { ok: true, updated: false, reason: 'bad_value' };
  }
  const sh = sheet_(b.tab);
  const res = withLock_(function () {
    const r = records_(sh).filter(function (x) { return String(x[spec.key]) === String(b.id) && String(b.id) !== ''; })[0];
    if (!r) return { reason: 'not_found' };
    if ('prev' in b && String(plain_(r[b.column])) !== String(b.prev == null ? '' : b.prev)) return { reason: 'conflict', current: plain_(r[b.column]) };
    setCell_(sh, r._row, b.column, safe_(value));
    return { row: r._row, previous: String(r[b.column]) };
  });
  if (res.reason) return { ok: true, updated: false, reason: res.reason, current: res.current };
  let message = '';
  if (b.tab === APPLICANTS && b.column === 'applicant_status' && value === 'Accepted' && res.previous !== 'Accepted') message = acceptRow_(res.row, res.previous) || '';
  if (b.tab === TESTERS && b.column === 'tester_status' && value === 'Active' && res.previous !== 'Active') message = reactivateRow_(res.row, res.previous) || '';
  const rec = records_(sh).filter(function (x) { return x._row === res.row; })[0];
  return { ok: true, updated: true, record: rec ? adminRecord_(rec) : null, message: message };
}

// ---------- testimonials (public, GET /beta/testimonials) ----------

// Feedback the owner ticked `publish` on and wrote a `public_quote` for,
// newest first. Only the quote and the tester's number ever leave the Sheet.
function testimonials_() {
  const sh = sheet_(FEEDBACK);
  if (!sh) return { ok: true, items: [] };
  const time = function (v) { const t = v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(t) ? 0 : t; };
  const items = records_(sh)
    .filter(function (r) { return (r.publish === true || String(r.publish).toUpperCase() === 'TRUE') && String(r.public_quote || '').trim(); })
    .sort(function (a, b) { return time(b.submitted_timestamp) - time(a.submitted_timestamp); })
    .slice(0, 30)
    .map(function (r) { return { quote: String(r.public_quote).trim().slice(0, 400), number: numFrom_(r.tester_number) }; });
  return { ok: true, items: items };
}

// ---------- analytics ----------

function day_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function dayDiff_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

// One batched usage ping from the app (worker already validated and clamped
// it): adds the counts to the tester's Analytics row, creating it on first use.
function activity_(b) {
  const t = activeTester_(b.token);
  if (!t) return { ok: true, tester: null };
  // Ticked on the Testers tab (e.g. your own devices): accepted, not recorded.
  if (t.exclude_from_analytics === true) return { ok: true, tester: { id: t.tester_id } };
  const d = b.delta || {}, now = new Date(), today = day_(now);
  withLock_(function () {
    const ss = ss_();
    const sh = ss.getSheetByName(ANALYTICS) || ss.insertSheet(ANALYTICS);
    ensureHeaders_(sh, HEADERS[ANALYTICS]);
    const c = cols_(sh);
    let r = records_(sh).filter(function (x) { return x.tester_id === t.tester_id; })[0];
    if (!r) {
      append_(sh, { tester_number: t.tester_number, tester_id: t.tester_id, first_active: now });
      r = records_(sh).filter(function (x) { return x.tester_id === t.tester_id; })[0];
    }
    const add = function (h, v) { r[h] = (Number(r[h]) || 0) + (Number(v) || 0); };
    add('sessions', d.sessions);
    r.listening_minutes = Math.round(((Number(r.listening_minutes) || 0) + (Number(d.listenSec) || 0) / 60) * 10) / 10;
    add('songs_played', d.songs);
    add('playlists_played', d.playlists);
    add('playlists_added', d.imports);
    FEATURES.forEach(function (f) { if (d.features && d.features[f]) add('uses_' + f, d.features[f]); });
    const days = String(r.active_days || '').split(',').filter(Boolean);
    if (days.indexOf(today) < 0) days.push(today);
    const first = r.first_active instanceof Date ? day_(r.first_active) : days[0];
    r.active_days = "'" + days.slice(-120).join(',');   // ' keeps a lone date as text
    r.days_active = days.length;
    // Came back on a later day within a week of their first day.
    r.returned_within_7d = days.some(function (x) { const n = dayDiff_(first, x); return n >= 1 && n <= 7; }) ? 'Yes' : 'No';
    r.last_active = now;
    const row = sh.getRange(r._row, 1, 1, sh.getLastColumn()).getValues()[0];
    Object.keys(c).forEach(function (h) { if (h !== 'days_since_active' && h in r && h !== '_row') row[c[h]] = r[h]; });
    sh.getRange(r._row, 1, 1, row.length).setValues([row]);
    sh.getRange(r._row, c.days_since_active + 1).setFormulaR1C1('=IF(RC' + (c.last_active + 1) + '="","",ROUND(NOW()-RC' + (c.last_active + 1) + ',1))');
  });
  return { ok: true, tester: { id: t.tester_id } };
}

// ---------- accepting applicants ----------

// Applicant row -> Tester row. Called when applicant_status becomes Accepted.
// The cap only closes public signups; accepting by hand can go over it.
function acceptRow_(rowNum, previous) {
  const ash = sheet_(APPLICANTS), tsh = sheet_(TESTERS);
  const result = withLock_(function () {
    const a = records_(ash).filter(function (r) { return r._row === rowNum; })[0];
    if (!a || !a.applicant_id) return { msg: 'Row ' + rowNum + ' has no applicant_id, nothing done.' };
    const testers = records_(tsh);
    const existing = testers.filter(function (t) { return t.applicant_id === a.applicant_id; })[0];
    if (existing) return { msg: a.name + ' is already ' + existing.tester_number + ' (' + existing.tester_status + ').' };
    const active = testers.filter(function (t) { return t.tester_status === 'Active'; }).length;
    // Numbers are never reused: next after the highest ever handed out.
    const n = testers.reduce(function (m, t) { return Math.max(m, numFrom_(t.tester_number)); }, 0) + 1;
    const id = 't' + hex_(12);
    const t = {
      tester_id: id, tester_number: testerLabel_(n), applicant_id: a.applicant_id, name: a.name, email: a.email,
      accepted_timestamp: new Date(), access_token: id + '-' + hex_(32), tester_status: 'Active',
    };
    t.access_link = accessLink_(t.access_token);
    append_(tsh, t);
    return { tester: t, row: tsh.getLastRow(), over: active >= CAP ? active + 1 : 0 };
  });
  if (!result.tester) { toast_(result.msg); return result.msg; }
  const t = result.tester;
  const err = sendMail_(t.email, 'You\'re in: ' + t.tester_number, inviteText_(t));
  setCell_(tsh, result.row, 'notes', err ? 'Invite NOT emailed: ' + err : 'Invite emailed ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  const msg = t.name + ' is ' + t.tester_number + (err ? '. Invite email failed, see notes.' : '. Invite emailed.')
    + (result.over ? ' That makes ' + result.over + ' active, over the ' + CAP + ' cap.' : '');
  toast_(msg);
  return msg;
}

// Inactive -> Active again. Allowed over the cap (it only closes public
// signups); just say so.
function reactivateRow_(rowNum, previous) {
  const tsh = sheet_(TESTERS);
  return withLock_(function () {
    const testers = records_(tsh);
    const t = testers.filter(function (r) { return r._row === rowNum; })[0];
    if (!t || !t.tester_id) return '';
    const active = testers.filter(function (r) { return r.tester_status === 'Active'; }).length;
    if (active > CAP) {
      const msg = t.tester_number + ' is Active again. That makes ' + active + ' active, over the ' + CAP + ' cap.';
      toast_(msg);
      return msg;
    }
    return '';
  });
}

// Installable on-edit trigger (created by setup). Simple onEdit can't send
// mail, which is why this isn't named onEdit.
function onBetaEdit(e) {
  const sh = e.range.getSheet(), name = sh.getName();
  if (name !== APPLICANTS && name !== TESTERS) return;
  const c = cols_(sh);
  const col = name === APPLICANTS ? c.applicant_status : c.tester_status;
  if (col == null) return;
  const c0 = e.range.getColumn(), r0 = e.range.getRow(), nr = e.range.getNumRows();
  if (col + 1 < c0 || col + 1 > c0 + e.range.getNumColumns() - 1) return;
  const single = nr === 1 && e.range.getNumColumns() === 1;
  for (let r = Math.max(2, r0); r < r0 + nr; r++) {
    const val = String(sh.getRange(r, col + 1).getValue()).trim();
    if (name === APPLICANTS && val === 'Accepted') acceptRow_(r, single ? e.oldValue : '');
    if (name === TESTERS && val === 'Active') reactivateRow_(r, single ? e.oldValue : '');
  }
}

// ---------- menu ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('EBBLESS Beta')
    .addItem('Accept selected applicants', 'acceptSelected')
    .addItem('Resend invite to selected testers', 'resendSelected')
    .addSeparator()
    .addItem('Set up / repair sheet', 'setup')
    .addToUi();
}

function selectedRows_(name) {
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== name) { SpreadsheetApp.getUi().alert('Select rows on the ' + name + ' tab first.'); return []; }
  const rows = [];
  sh.getActiveRangeList().getRanges().forEach(function (rg) {
    for (let r = rg.getRow(); r < rg.getRow() + rg.getNumRows(); r++) if (r >= 2) rows.push(r);
  });
  return rows;
}

function acceptSelected() {
  const sh = sheet_(APPLICANTS), c = cols_(sh);
  selectedRows_(APPLICANTS).forEach(function (r) {
    const prev = String(sh.getRange(r, c.applicant_status + 1).getValue());
    sh.getRange(r, c.applicant_status + 1).setValue('Accepted');
    acceptRow_(r, prev);
  });
}

function resendSelected() {
  const sh = sheet_(TESTERS);
  const recs = records_(sh);
  selectedRows_(TESTERS).forEach(function (r) {
    const t = recs.filter(function (x) { return x._row === r; })[0];
    if (!t || !t.access_token) return;
    if (t.tester_status !== 'Active') { toast_(t.tester_number + ' is Inactive, invite not sent.'); return; }
    const err = sendMail_(t.email, 'You\'re in: ' + t.tester_number, inviteText_(t));
    toast_(err ? 'Email to ' + t.name + ' failed: ' + err : 'Invite re-sent to ' + t.name + '.');
  });
}

// ---------- setup ----------

function colLetter_(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

function setup() {
  const ss = ss_(), props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  [APPLICANTS, TESTERS, FEEDBACK, BUGS, ANALYTICS].forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders_(sh, HEADERS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  const ash = ss.getSheetByName(APPLICANTS), tsh = ss.getSheetByName(TESTERS);
  const dv = function (list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  ash.getRange(2, cols_(ash).applicant_status + 1, ash.getMaxRows() - 1, 1).setDataValidation(dv(APPLICANT_STATUSES));
  tsh.getRange(2, cols_(tsh).tester_status + 1, tsh.getMaxRows() - 1, 1).setDataValidation(dv(TESTER_STATUSES));
  tsh.getRange(2, cols_(tsh).exclude_from_analytics + 1, tsh.getMaxRows() - 1, 1).insertCheckboxes();
  // Existing rows only: blank checkboxes count as content, and new feedback is appended after the last row.
  const fsh = ss.getSheetByName(FEEDBACK);
  if (fsh.getLastRow() > 1) fsh.getRange(2, cols_(fsh).publish + 1, fsh.getLastRow() - 1, 1).insertCheckboxes();

  const dash = ss.getSheetByName(DASHBOARD) || ss.insertSheet(DASHBOARD);
  const aS = colLetter_(cols_(ash).applicant_status), tS = colLetter_(cols_(tsh).tester_status);
  const A = "'" + APPLICANTS + "'!", T = "'" + TESTERS + "'!";
  const nsh = ss.getSheetByName(ANALYTICS), nc = cols_(nsh), N = "'" + ANALYTICS + "'!";
  const nCol = function (h) { const l = colLetter_(nc[h]); return N + l + '2:' + l; };
  const week = 'NOW()-7';
  const rows = [
    ['APPLICANTS', ''],
    ['Total applicants', '=COUNTA(' + A + 'A2:A)'],
    ['Pending', '=COUNTIF(' + A + aS + '2:' + aS + ',"Pending")'],
    ['Waitlisted', '=COUNTIF(' + A + aS + '2:' + aS + ',"Waitlisted")'],
    ['Accepted', '=COUNTIF(' + A + aS + '2:' + aS + ',"Accepted")'],
    ['Rejected', '=COUNTIF(' + A + aS + '2:' + aS + ',"Rejected")'],
    ['', ''],
    ['TESTERS', ''],
    ['Active testers', '=COUNTIF(' + T + tS + '2:' + tS + ',"Active")'],
    ['Inactive testers', '=COUNTIF(' + T + tS + '2:' + tS + ',"Inactive")'],
    ['Active tester capacity', '=B9&" / ' + CAP + '"'],
    ['Spots remaining', '=MAX(0,' + CAP + '-B9)'],
    ['', ''],
    ['FEEDBACK', ''],
    ['Total feedback submissions', "=COUNTA('" + FEEDBACK + "'!A2:A)"],
    ['', ''],
    ['BUGS', ''],
    ['Total bug reports', "=COUNTA('" + BUGS + "'!A2:A)"],
    ['', ''],
    ['ACTIVITY (Analytics tab, anonymous)', ''],
    ['Testers who opened the app', '=COUNTA(' + nCol('tester_id') + ')'],
    ['Active in the last 24 hours', '=COUNTIF(' + nCol('last_active') + ',">="&(NOW()-1))'],
    ['Active in the last 7 days', '=COUNTIF(' + nCol('last_active') + ',">="&(' + week + '))'],
    ['Total listening hours', '=ROUND(SUM(' + nCol('listening_minutes') + ')/60,1)'],
    ['Avg sessions per tester', '=IFERROR(ROUND(AVERAGE(' + nCol('sessions') + '),1),0)'],
    ['Songs played', '=SUM(' + nCol('songs_played') + ')'],
    ['Playlists played', '=SUM(' + nCol('playlists_played') + ')'],
    // Cohort: testers whose first day is at least 7 days back, so everyone
    // counted has had the full week to come back.
    ['7-day return (eligible testers)', '=COUNTIF(' + nCol('first_active') + ',"<="&(' + week + '))'],
    ['7-day return (came back)', '=COUNTIFS(' + nCol('first_active') + ',"<="&(' + week + '),' + nCol('returned_within_7d') + ',"Yes")'],
    ['7-day return rate', '=IFERROR(TEXT(B29/B28,"0%"),"-")'],
  ];
  dash.clear();
  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  [1, 8, 14, 17, 20].forEach(function (r) { dash.getRange(r, 1).setFontWeight('bold'); });
  // Feature usage: sessions using each feature, summed across testers.
  const fRows = [['FEATURE USAGE (sessions)', '']].concat(FEATURES.map(function (f) { return [f.replace(/_/g, ' '), '=SUM(' + nCol('uses_' + f) + ')']; }));
  dash.getRange(1, 4, fRows.length, 2).setValues(fRows);
  dash.getRange(1, 4).setFontWeight('bold');
  dash.setColumnWidth(4, 200);
  ss.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.HOUR);   // keeps NOW()-based counts fresh
  nsh.hideColumns(nc.active_days + 1);
  dash.setColumnWidth(1, 220);
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1);
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0) ss.deleteSheet(def);

  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'onBetaEdit' || tr.getHandlerFunction() === 'sendFeedbackRequests') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('onBetaEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('sendFeedbackRequests').timeBased().everyHours(1).create();

  let secret = props.getProperty('SHEET_SECRET');
  if (!secret) { secret = hex_(48); props.setProperty('SHEET_SECRET', secret); }
  SpreadsheetApp.getUi().alert('EBBLESS Beta is set up.\n\nShared secret for the worker (SHEET_SECRET):\n\n' + secret +
    '\n\nNext: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then set SHEET_URL and SHEET_SECRET on the worker.');
}
