#!/usr/bin/env node
// Tiny local server for tools/improvements-form.html. Serves the form and,
// on submit, appends the queued entries straight into IMPROVEMENTS.md so
// the manager session can pick them up with no copy/paste step.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5820;
const ROOT = path.join(__dirname, '..');
const MD_PATH = path.join(ROOT, 'IMPROVEMENTS.md');
const FORM_PATH = path.join(__dirname, 'improvements-form.html');

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function entryToMarkdown(e) {
  const lines = [
    `### ${e.slug}: ${e.title}`,
    `- **Status:** ${e.status}`,
    `- **Priority:** ${e.priority}`,
    `- **Description:** ${e.description || '(none yet)'}`,
  ];
  if (e.touches) lines.push(`- **Touches:** ${e.touches}`);
  lines.push(`- **Branch:** (filled in by the manager once a lane is claimed)`);
  if (e.notes) lines.push(`- **Notes:** ${e.notes}`);
  return lines.join('\n');
}

function sanitizeEntry(e) {
  const clean = {
    title: String(e.title || '').trim(),
    slug: slugify(e.slug || e.title || ''),
    priority: ['high', 'medium', 'low'].includes(e.priority) ? e.priority : 'medium',
    status: ['ready', 'draft'].includes(e.status) ? e.status : 'ready',
    description: String(e.description || '').trim(),
    touches: String(e.touches || '').trim(),
    notes: String(e.notes || '').trim(),
  };
  return clean.title ? clean : null;
}

function appendEntries(entries) {
  let current = fs.readFileSync(MD_PATH, 'utf8');
  current = current.replace(/\n+$/, '\n');
  const blocks = entries.map(entryToMarkdown).join('\n\n');
  current += '\n' + blocks + '\n';
  fs.writeFileSync(MD_PATH, current);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(FORM_PATH, (err, data) => {
      if (err) { res.writeHead(500); res.end('failed to load form'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const entries = (Array.isArray(payload) ? payload : [payload])
          .map(sanitizeEntry)
          .filter(Boolean);

        if (!entries.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'No valid entries (title is required).' }));
          return;
        }

        appendEntries(entries);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, added: entries.length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Improvements intake form: http://localhost:${PORT}`);
});
