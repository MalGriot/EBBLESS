// EBBLESS beta mailer - Google Apps Script web app.
//
// The worker (worker/src/beta.js) POSTs { secret, to, subject, text } here and
// this sends it from the Gmail account that deployed the script. Gmail's
// Apps Script quota for a regular account is 100 recipients a day.
//
// Setup (one time, signed in as the account emails should come from):
//   1. script.google.com > New project > replace Code.gs with this file.
//   2. Project Settings (gear) > Script properties > Add:
//        MAILER_SECRET = <long random string, e.g. from `openssl rand -hex 24`>
//   3. Deploy > New deployment > type: Web app
//        Execute as: Me    Who has access: Anyone
//      Authorize when asked, then copy the Web app URL.
//   4. In worker/:  npx wrangler secret put MAILER_URL      (the Web app URL)
//                   npx wrangler secret put MAILER_SECRET   (same string as step 2)
//
// To switch sending accounts later, repeat 1-4 from the other account.

const SENDER_NAME = 'EBBLESS BETA';

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  const secret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
  if (!secret || body.secret !== secret) return out({ ok: false, error: 'unauthorized' });
  const to = String(body.to || '');
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(to)) return out({ ok: false, error: 'bad recipient' });
  const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = String(body.text || '').slice(0, 10000);
  if (!subject || !text) return out({ ok: false, error: 'missing subject or text' });
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, name: SENDER_NAME });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
