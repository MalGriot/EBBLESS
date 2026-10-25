// Live ad-blocking rules for the Mac app. The rules (adblock/rules.json) and the
// in-frame script (adblock/inject.js) are served by the site, so a "Reload now"
// can update them without a new app build. Order of trust at launch: the newest
// valid of { last good cached copy in userData, copy bundled in the app }.
// Everything fetched is validated before use:
//   https only, host pinned to malgriot.github.io, no redirects, <= 64 KB each,
//   rules parse and have the right shape, version >= what we already run,
//   and the script's SHA-256 matches rules.scriptSha256.
// NOTE: the fetched script runs inside YouTube frames, so whoever can push to the
// repo's main branch (GitHub Pages) can change what runs there. Nothing here
// stops that; the checks above only guard against accidents and other hosts.
// No Electron in this file (fetch/dirs are injected) so it is unit tested.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateRules, MAX_BYTES } = require('./adblock-rules');

const LIVE_HOST = 'malgriot.github.io';
const DEFAULT_BASE = 'https://malgriot.github.io/EBBLESS/adblock/';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Throws unless url is https on the pinned host.
function checkUrl(url){
  let u;
  try { u = new URL(url); } catch(e){ throw new Error('bad url'); }
  if (u.protocol !== 'https:') throw new Error('not https');
  if (u.hostname !== LIVE_HOST || u.port || u.username || u.password) throw new Error('host not allowed');
  return u.href;
}

// Validate a rules.json + inject.js pair (Buffers or strings). minVersion: lowest version accepted.
function parsePair(rulesText, scriptBuf, minVersion){
  const rb = Buffer.isBuffer(rulesText) ? rulesText : Buffer.from(rulesText);
  const sb = Buffer.isBuffer(scriptBuf) ? scriptBuf : Buffer.from(scriptBuf);
  if (rb.length === 0 || rb.length > MAX_BYTES) throw new Error('rules: bad size');
  if (sb.length === 0 || sb.length > MAX_BYTES) throw new Error('script: bad size');
  const rules = validateRules(JSON.parse(rb.toString('utf8')));
  if (rules.version < (minVersion || 0)) throw new Error('rules: version ' + rules.version + ' is lower than ' + minVersion);
  if (sha256(sb) !== rules.scriptSha256) throw new Error('script: does not match rules.scriptSha256');
  return { rules, script: sb.toString('utf8'), rulesRaw: rb, scriptRaw: sb };
}

function readPair(dir, minVersion){
  return parsePair(fs.readFileSync(path.join(dir, 'rules.json')), fs.readFileSync(path.join(dir, 'inject.js')), minVersion);
}

function writeAtomic(file, buf){
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

// opts: { cacheDir, bundledDir, fetchBytes(url, maxBytes) -> Buffer, base, skipUrlCheck (tests only) }
function createLoader(opts){
  const base = opts.base || DEFAULT_BASE;
  let cur = null; // { rules, script, source: 'live'|'cached'|'bundled' }

  function load(){
    let best = null;
    for (const [dir, source] of [[opts.cacheDir, 'cached'], [opts.bundledDir, 'bundled']]){
      try {
        const p = readPair(dir, 0);
        if (!best || p.rules.version > best.rules.version) best = Object.assign(p, { source });
      } catch(e){ /* missing or invalid: try the next */ }
    }
    if (!best) throw new Error('no usable ad rules (bundled copy missing)');
    cur = best;
    return cur;
  }

  // Fetch, validate, cache, adopt. Resolves { ok, changed, error?, version, source }.
  async function refresh(){
    try {
      if (!cur) load();
      const check = opts.skipUrlCheck ? (x) => x : checkUrl;
      const rulesUrl = check(base + 'rules.json'), scriptUrl = check(base + 'inject.js');
      const rb = await opts.fetchBytes(rulesUrl, MAX_BYTES);
      const sb = await opts.fetchBytes(scriptUrl, MAX_BYTES);
      const p = parsePair(rb, sb, cur.rules.version);
      const changed = p.rules.version !== cur.rules.version || p.rules.scriptSha256 !== cur.rules.scriptSha256;
      fs.mkdirSync(opts.cacheDir, { recursive: true });
      writeAtomic(path.join(opts.cacheDir, 'inject.js'), p.scriptRaw);
      writeAtomic(path.join(opts.cacheDir, 'rules.json'), p.rulesRaw);
      cur = { rules: p.rules, script: p.script, source: 'live' };
      return { ok: true, changed, version: cur.rules.version, source: cur.source };
    } catch(e){
      return { ok: false, changed: false, error: String(e.message || e), version: cur ? cur.rules.version : 0, source: cur ? cur.source : 'none' };
    }
  }

  return { load, refresh, current: () => cur };
}

module.exports = { createLoader, checkUrl, parsePair, readPair, sha256, LIVE_HOST, DEFAULT_BASE };
