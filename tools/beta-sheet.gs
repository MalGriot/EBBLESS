// EBBLESS beta - Google Apps Script bound to the beta Google Sheet.
//
// The Sheet is the source of truth for the beta:
//   Applicants   everyone who filled out the signup form (one row each)
//   Testers      only people you accepted; references applicant_id
//   Feedback     what active testers said (references tester_id)
//   Bug Reports  problems active testers reported (references tester_id)
//   Dashboard    counts
//
// Day to day you never touch code: set an applicant's applicant_status to
// Accepted and this script creates their Tester row (next tester number,
// private token, access link) and emails the invite. Set a tester's
// tester_status to Inactive and their link stops working. The 50 cap counts
// Active testers only; tester numbers are never reused.
//
// The worker (worker/src/beta.js) calls this as a web app with a shared
// secret: signup, status, me (token check) and report. Columns are found by
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

const APPLICANTS = 'Applicants', TESTERS = 'Testers', FEEDBACK = 'Feedback', BUGS = 'Bug Reports', DASHBOARD = 'Dashboard';
const APPLICANT_STATUSES = ['Pending', 'Accepted', 'Waitlisted', 'Rejected'];
const TESTER_STATUSES = ['Active', 'Inactive'];
const HEADERS = {};
HEADERS[APPLICANTS] = ['applicant_id', 'name', 'email', 'Instagram', 'device', 'device_model', 'operating_system', 'browser',
  'technical_comfort', 'music_platform', 'music_preferences', 'Spotify_playlist', 'why_they_want_to_test',
  'what_they_want_EBBLESS_to_do', 'signup_timestamp', 'applicant_status', 'notes', 'ok_to_contact_later', 'user_agent'];
HEADERS[TESTERS] = ['tester_id', 'tester_number', 'applicant_id', 'name', 'email', 'accepted_timestamp',
  'access_token', 'access_link', 'tester_status', 'notes'];
HEADERS[FEEDBACK] = ['feedback_id', 'tester_id', 'tester_number', 'submitted_timestamp', 'source', 'category', 'feeling',
  'what_happened', 'what_they_expected', 'anything_else', 'keep_using', 'screenshot',
  'device', 'operating_system', 'browser', 'viewport', 'user_agent'];
HEADERS[BUGS] = ['bug_id', 'tester_id', 'tester_number', 'submitted_timestamp', 'area', 'what_went_wrong',
  'expected', 'actual', 'steps', 'screenshot', 'device', 'operating_system', 'browser', 'viewport', 'user_agent'];

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
function toast_(msg) { ss_().toast(msg, 'EBBLESS Beta', 10); }

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

function sendMail_(to, subject, text) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, name: SENDER_NAME });
    return '';
  } catch (err) { return String(err); }
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
  return { ok: true, tester: { id: t.tester_id, number: numFrom_(t.tester_number), label: String(t.tester_number), name: String(t.name).split(/\s+/)[0] } };
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

// ---------- accepting applicants ----------

// Applicant row -> Tester row. Called when applicant_status becomes Accepted.
// previous: the status to put back if the beta is full.
function acceptRow_(rowNum, previous) {
  const ash = sheet_(APPLICANTS), tsh = sheet_(TESTERS);
  const result = withLock_(function () {
    const a = records_(ash).filter(function (r) { return r._row === rowNum; })[0];
    if (!a || !a.applicant_id) return { msg: 'Row ' + rowNum + ' has no applicant_id, nothing done.' };
    const testers = records_(tsh);
    const existing = testers.filter(function (t) { return t.applicant_id === a.applicant_id; })[0];
    if (existing) return { msg: a.name + ' is already ' + existing.tester_number + ' (' + existing.tester_status + ').' };
    const active = testers.filter(function (t) { return t.tester_status === 'Active'; }).length;
    if (active >= CAP) {
      setCell_(ash, rowNum, 'applicant_status', previous && previous !== 'Accepted' ? previous : 'Pending');
      return { msg: 'All ' + CAP + ' spots are taken. Set a tester to Inactive first. ' + a.name + ' was not accepted.' };
    }
    // Numbers are never reused: next after the highest ever handed out.
    const n = testers.reduce(function (m, t) { return Math.max(m, numFrom_(t.tester_number)); }, 0) + 1;
    const id = 't' + hex_(12);
    const t = {
      tester_id: id, tester_number: testerLabel_(n), applicant_id: a.applicant_id, name: a.name, email: a.email,
      accepted_timestamp: new Date(), access_token: id + '-' + hex_(32), tester_status: 'Active',
    };
    t.access_link = accessLink_(t.access_token);
    append_(tsh, t);
    return { tester: t, row: tsh.getLastRow() };
  });
  if (!result.tester) { toast_(result.msg); return; }
  const t = result.tester;
  const err = sendMail_(t.email, 'You\'re in: ' + t.tester_number, inviteText_(t));
  setCell_(tsh, result.row, 'notes', err ? 'Invite NOT emailed: ' + err : 'Invite emailed ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  toast_(t.name + ' is ' + t.tester_number + (err ? '. Invite email failed, see notes.' : '. Invite emailed.'));
}

// Inactive -> Active again: only if it fits under the cap.
function reactivateRow_(rowNum, previous) {
  const tsh = sheet_(TESTERS);
  withLock_(function () {
    const testers = records_(tsh);
    const t = testers.filter(function (r) { return r._row === rowNum; })[0];
    if (!t || !t.tester_id) return;
    const active = testers.filter(function (r) { return r.tester_status === 'Active'; }).length;
    if (active > CAP) {
      setCell_(tsh, rowNum, 'tester_status', previous && previous !== 'Active' ? previous : 'Inactive');
      toast_('All ' + CAP + ' spots are taken. ' + t.tester_number + ' stays Inactive.');
    }
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
  [APPLICANTS, TESTERS, FEEDBACK, BUGS].forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const have = cols_(sh);
    const missing = HEADERS[name].filter(function (h) { return !(h in have); });
    if (missing.length) sh.getRange(1, Object.keys(have).length ? sh.getLastColumn() + 1 : 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });
  const ash = ss.getSheetByName(APPLICANTS), tsh = ss.getSheetByName(TESTERS);
  const dv = function (list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  ash.getRange(2, cols_(ash).applicant_status + 1, ash.getMaxRows() - 1, 1).setDataValidation(dv(APPLICANT_STATUSES));
  tsh.getRange(2, cols_(tsh).tester_status + 1, tsh.getMaxRows() - 1, 1).setDataValidation(dv(TESTER_STATUSES));

  const dash = ss.getSheetByName(DASHBOARD) || ss.insertSheet(DASHBOARD);
  const aS = colLetter_(cols_(ash).applicant_status), tS = colLetter_(cols_(tsh).tester_status);
  const A = "'" + APPLICANTS + "'!", T = "'" + TESTERS + "'!";
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
  ];
  dash.clear();
  dash.getRange(1, 1, rows.length, 2).setValues(rows);
  [1, 8, 14, 17].forEach(function (r) { dash.getRange(r, 1).setFontWeight('bold'); });
  dash.setColumnWidth(1, 220);
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1);
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0) ss.deleteSheet(def);

  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'onBetaEdit') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('onBetaEdit').forSpreadsheet(ss).onEdit().create();

  let secret = props.getProperty('SHEET_SECRET');
  if (!secret) { secret = hex_(48); props.setProperty('SHEET_SECRET', secret); }
  SpreadsheetApp.getUi().alert('EBBLESS Beta is set up.\n\nShared secret for the worker (SHEET_SECRET):\n\n' + secret +
    '\n\nNext: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then set SHEET_URL and SHEET_SECRET on the worker.');
}
