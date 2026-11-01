#!/usr/bin/env node
// Builds visuals/milkdrop-tags.json, the mood tags behind the MilkDrop mood
// mix. Opens tools/milkdrop-tag.html in headless Chrome, which renders every
// preset against a generated beat and measures it; this script buckets the
// measurements into tags. Rerun after changing the pinned butterchurn or
// butterchurn-presets version (MILK_LIB in index.html).
//
//   node tools/milkdrop-tag.js
//   CHROME=/path/to/chrome node tools/milkdrop-tag.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'visuals', 'milkdrop-tags.json');
const PAGE = path.join(__dirname, 'milkdrop-tag.html');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PACKS = ['base', 'extra', 'extra2', 'md1'];

// Hue bins are 30 degrees wide, starting at red.
const FAMILIES = { warm: [11, 0, 1], green: [2, 3, 4, 5], cool: [6, 7, 8], violet: [9, 10] };

function tertiles(values){
  const s = values.slice().sort((a, b) => a - b);
  return [s[Math.floor(s.length / 3)], s[Math.floor(s.length * 2 / 3)]];
}
const bucket = (v, [a, b]) => v < a ? 0 : v < b ? 1 : 2;

function tag(rows){
  const good = rows.filter(r => r.ok && r.b >= 0.015);
  const eCut = tertiles(good.map(r => r.m)), bCut = tertiles(good.map(r => r.b));
  const presets = rows.map(r => {
    const o = { n: r.n, p: r.p };
    if (!r.ok || r.b < 0.015){ o.x = 1; return o; }  // failed to run or renders black: hidden
    const total = r.hue.reduce((a, v) => a + v, 0);
    const share = {};
    for (const [f, bins] of Object.entries(FAMILIES)) share[f] = total ? bins.reduce((a, i) => a + r.hue[i], 0) / total : 0;
    const ranked = Object.entries(share).sort((a, b) => b[1] - a[1]);
    const mono = r.s < 0.06 || total < 0.01;
    o.e = bucket(r.m, eCut);                    // energy: 0 calm, 1 steady, 2 wild
    o.b = bucket(r.b, bCut);                    // brightness: 0 dark, 1 dim, 2 bright
    o.c = mono ? 'mono' : ranked[0][0];         // colour: warm, green, cool, violet, mono
    o.k = mono ? 'mono' : ranked.filter(([, v]) => v >= 0.18).length >= 3 ? 'spectrum' : ranked[1][1] >= 0.18 ? 'duo' : 'solo'; // palette
    o.m = r.m; o.l = r.b;                       // raw motion and luma, for "match the song" ordering
    return o;
  });
  return { generated: new Date().toISOString().slice(0, 10), butterchurn: '2.6.7', presetsVersion: '2.4.7', packs: PACKS, presets };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')){
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(PAGE));
  }
  if (req.method === 'POST' && req.url === '/progress'){
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { res.end('ok'); console.log(body.slice(0, 10) + ' presets measured'); });
    return;
  }
  if (req.method === 'POST' && req.url === '/result'){
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.end('ok');
      const data = JSON.parse(body);
      if (data.error){ console.error(data.error); finish(1); return; }
      const out = tag(data);
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
      const hidden = out.presets.filter(p => p.x).length;
      console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.presets.length} presets, ${hidden} hidden`);
      finish(0);
    });
    return;
  }
  res.writeHead(404); res.end();
});

let chrome = null;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'milktag-'));
function finish(code){
  server.close();
  process.exitCode = code;
  const clean = () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e){} };
  if (chrome && chrome.exitCode === null){ chrome.once('exit', clean); chrome.kill(); }
  else clean();
}

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log('tagging presets via ' + url);
  // The real GPU is far faster than SwiftShader; MILKTAG_SWIFTSHADER=1 forces software GL.
  const gl = process.env.MILKTAG_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  chrome = spawn(CHROME, ['--headless=new', ...gl,
    '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + profile, '--no-first-run', url], { stdio: 'ignore' });
  chrome.on('exit', (c) => { if (server.listening){ console.error('chrome exited early (' + c + ')'); finish(1); } });
  setTimeout(() => { console.error('timed out'); finish(1); }, 15 * 60 * 1000).unref();
});
