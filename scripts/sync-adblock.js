#!/usr/bin/env node
// Keeps adblock/rules.json consistent with adblock/inject.js: writes the script's
// SHA-256 into rules.json (the apps refuse a script that does not match, so a
// half-published pair or a stale CDN copy is never used). Run it after editing
// either file:   node scripts/sync-adblock.js          (fix)
//                node scripts/sync-adblock.js --check  (exit 1 if out of sync)
// The bundled fallback copies inside the apps are not separate files: the Mac
// build ships ../adblock via extraResources and the Android Gradle build copies
// ../adblock into its assets, so the bundled copy is these same files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'adblock');
const rulesPath = path.join(dir, 'rules.json');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'inject.js'))).digest('hex');
const text = fs.readFileSync(rulesPath, 'utf8');
const rules = JSON.parse(text);
if (rules.scriptSha256 === sha) { console.log('adblock: in sync (rules v' + rules.version + ')'); process.exit(0); }
if (process.argv.includes('--check')) { console.error('adblock: rules.json scriptSha256 does not match inject.js (run node scripts/sync-adblock.js)'); process.exit(1); }
fs.writeFileSync(rulesPath, text.replace(/("scriptSha256"\s*:\s*")[0-9a-f]*(")/, '$1' + sha + '$2'));
console.log('adblock: scriptSha256 updated; bump "version" in adblock/rules.json if this is a new release');
