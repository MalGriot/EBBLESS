#!/usr/bin/env node
// Read-only queue list, no AI, no tokens. Pulls open GitHub issues (via the
// gh CLI) and the open entries in IMPROVEMENTS.md, then shows one list in the
// "start the queue" order: review > in-progress > ready > draft, bugs ahead of
// features within a tier, then priority. Open issues not yet in the file show
// up as "new" at the bottom of the draft tier.
//   node tools/queue-view.js   ->  http://localhost:5821
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 5821;
const MD_PATH = path.join(__dirname, '..', 'IMPROVEMENTS.md');
const TIERS = ['review', 'approved', 'in-progress', 'ready', 'draft'];
const PRIO = { high: 0, medium: 1, low: 2 };

function field(block, name) {
  const m = block.match(new RegExp('^- \\*\\*' + name + ':\\*\\*[ \\t]*(.*)$', 'm'));
  return m ? m[1].trim() : '';
}

function plain(desc, title) {
  let s = desc.replace(/^(Idea|Bug),?\s*Geethub (issue )?#\d+\.?\s*/i, '').replace(/`/g, '');
  const t = title.replace(/\s*\(Geethub #\d+\)$/, '').toLowerCase();
  if (/^(bug )?(part of )?#\d+\.?$/i.test(s) || s.toLowerCase().startsWith(t.slice(0, 25))) return '';
  const m = s.match(/^(.{20,200}?[.!?])(\s|$)/);
  s = m ? m[1] : s;
  return s.length > 200 ? s.slice(0, 197) + '...' : s;
}

function parseEntries() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const body = md.slice(md.indexOf('## Backlog'));
  const blocks = body.split(/^### /m).slice(1);
  const out = [];
  const seen = new Set();
  for (const b of blocks) {
    const head = b.split('\n')[0];
    const nums = (b.match(/#(\d+)/g) || []).map(n => Number(n.slice(1)));
    nums.forEach(n => seen.add(n));
    const status = field(b, 'Status').split(/\s/)[0];
    if (!TIERS.includes(status)) continue;
    const slug = head.split(':')[0].trim();
    if (slug.startsWith('<')) continue;
    const title = head.slice(slug.length + 1).trim();
    const prio = field(b, 'Priority').split(/\s/)[0];
    out.push({
      status, title, slug, prio,
      desc: plain(field(b, 'Description'), title),
      bug: /\b(bug|fix|broken|crash|freez|stale|not loading|missing)\b/i.test(slug + ' ' + title),
    });
  }
  return { out, seen };
}

function ghIssues() {
  return new Promise(resolve => {
    execFile('gh', ['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,labels'],
      { cwd: path.join(__dirname, '..'), maxBuffer: 20e6 }, (err, stdout) => {
        if (err) return resolve({ error: String(err.message).split('\n')[0], issues: [] });
        try { resolve({ issues: JSON.parse(stdout) }); } catch (e) { resolve({ error: 'bad gh output', issues: [] }); }
      });
  });
}

async function build() {
  const { out, seen } = parseEntries();
  const gh = await ghIssues();
  for (const i of gh.issues) {
    if (seen.has(i.number)) continue;
    const labels = i.labels.map(l => l.name);
    out.push({
      status: 'draft', isNew: true, num: i.number, slug: '',
      title: i.title.replace(/^\[idea\]\s*/i, ''), prio: 'medium', desc: '',
      bug: labels.includes('bug') || /\b(bug|fix|broken|crash)\b/i.test(i.title),
    });
  }
  out.sort((a, b) =>
    TIERS.indexOf(a.status) - TIERS.indexOf(b.status) ||
    (a.isNew ? 1 : 0) - (b.isNew ? 1 : 0) ||
    (b.bug ? 1 : 0) - (a.bug ? 1 : 0) ||
    (PRIO[a.prio] ?? 1) - (PRIO[b.prio] ?? 1));
  return { items: out, error: gh.error };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render({ items, error }) {
  let n = 0, tier = '';
  const rows = items.map(it => {
    const t = it.isNew ? 'new from GitHub' : it.status;
    const head = t !== tier ? `<h2>${esc(t)}</h2>` : '';
    tier = t;
    n++;
    const ref = it.isNew ? ` <a href="https://github.com/MalGriot/EBBLESS/issues/${it.num}">#${it.num}</a>` : '';
    return `${head}<li><b>${esc(it.title)}</b>${it.bug ? ' <i>bug</i>' : ''}${ref}${it.desc ? `<br><span>${esc(it.desc)}</span>` : ''}</li>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EBBLESS queue</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e5e5e5}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#999;--line:#2a2a2a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:28px 0 6px}
ol{list-style:none;margin:0;padding:0;counter-reset:q}
li{counter-increment:q;padding:9px 0 9px 34px;border-bottom:1px solid var(--line);position:relative}
li:before{content:counter(q);position:absolute;left:0;color:var(--mut);font-variant-numeric:tabular-nums}
span{color:var(--mut)}i{font-size:11px;color:#c0392b;font-style:normal;border:1px solid currentColor;border-radius:4px;padding:0 4px}
a{color:inherit}.err{color:#c0392b}p{color:var(--mut);margin:0}
</style><main><h1>EBBLESS queue</h1>
<p>${n} open. <a href="/">Refresh</a></p>${error ? `<p class="err">GitHub: ${esc(error)} (showing IMPROVEMENTS.md only)</p>` : ''}
<ol>${rows}</ol></main>`;
}

http.createServer(async (req, res) => {
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(render(await build()));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Queue: http://localhost:${PORT}`));
