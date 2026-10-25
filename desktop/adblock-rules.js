// #524 pure rule matcher + validators for the Mac adblock. No Electron here so
// it can be unit tested with plain node (desktop/adblock.test.js). The rules
// themselves live in adblock/rules.json (fetched live, see adblock-live.js).
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 64 * 1024;
const LIST_KEYS = ['adHosts', 'adHostPrefixes', 'youtubeHosts', 'youtubeAdPaths', 'googleHostPrefixes', 'googleAdPaths', 'neverBlockHosts'];

// Throws unless obj is a well-formed rules object. Returns it.
function validateRules(obj){
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('rules: not an object');
  if (!Number.isInteger(obj.version) || obj.version < 1) throw new Error('rules: bad version');
  for (const k of LIST_KEYS){
    const l = obj[k];
    if (!Array.isArray(l) || l.length > 500 || !l.every(s => typeof s === 'string' && s.length > 0 && s.length < 200)) throw new Error('rules: bad list ' + k);
  }
  const s = obj.selectors;
  if (!s || !['hide', 'skip'].every(k => Array.isArray(s[k]) && s[k].length > 0 && s[k].length < 200 && s[k].every(x => typeof x === 'string' && x.length > 0 && x.length < 200 && !/[{}<>]/.test(x)))) throw new Error('rules: bad selectors');
  if (typeof obj.scriptSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(obj.scriptSha256)) throw new Error('rules: bad scriptSha256');
  return obj;
}

// host is host or a subdomain of one of list
const underAny = (host, list) => list.some(h => host === h || host.endsWith('.' + h));
// host is <prefix><letters and dots> (adservice.google.co.uk, www.google.com)
const withPrefix = (host, prefixes) => prefixes.some(p => host.startsWith(p) && host.length > p.length && /^[a-z.]+$/.test(host.slice(p.length)));

function makeMatcher(rules){
  return function isAdUrl(url){
    let u;
    try { u = new URL(url); } catch(e){ return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'wss:' && u.protocol !== 'ws:') return false;
    const host = u.hostname.toLowerCase();
    if (rules.neverBlockHosts.includes(host)) return false;
    if (underAny(host, rules.adHosts) || withPrefix(host, rules.adHostPrefixes)) return true;
    const p = u.pathname.toLowerCase();
    if (underAny(host, rules.youtubeHosts)) return rules.youtubeAdPaths.some(x => p.includes(x));
    if (withPrefix(host, rules.googleHostPrefixes)) return rules.googleAdPaths.some(x => p.startsWith(x));
    return false;
  };
}

// The copy shipped with the app (dev: ../adblock; packaged: Resources/adblock).
function bundledDir(){
  let res = null;
  try { res = process.resourcesPath; } catch(e){}
  const packaged = res && fs.existsSync(path.join(res, 'adblock', 'rules.json'));
  return packaged ? path.join(res, 'adblock') : path.join(__dirname, '..', 'adblock');
}
const bundledRules = () => validateRules(JSON.parse(fs.readFileSync(path.join(bundledDir(), 'rules.json'), 'utf8')));

module.exports = { isAdUrl: makeMatcher(bundledRules()), makeMatcher, validateRules, bundledDir, MAX_BYTES };
