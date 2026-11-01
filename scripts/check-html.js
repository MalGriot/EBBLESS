#!/usr/bin/env node
// Pre-commit guard for index.html (see CLAUDE.md "GPU budget").
// 1. Every inline <script> must parse (a syntax error blanks the whole app).
// 2. @keyframes must only animate transform/opacity (no filter, blur,
//    backdrop-filter, box-shadow, size/position). Known offenders live in
//    scripts/check-html.baseline.json so only NEW violations fail.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const file = path.join(root, "index.html");
const html = fs.readFileSync(file, "utf8");
const errors = [];

const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m, n = 0;
while ((m = scriptRe.exec(html))) {
  const attrs = m[1] || "";
  if (/\bsrc=/.test(attrs) || /type=["'](?!module|text\/javascript)/.test(attrs)) continue;
  n++;
  const line = html.slice(0, m.index).split("\n").length;
  try { new Function(/type=["']module/.test(attrs) ? "" : m[2]); }
  catch (e) { if (!/import|export|await/.test(e.message)) errors.push(`inline <script> at line ${line}: ${e.message}`); }
}

const bad = /(^|[;{\s])(filter|backdrop-filter|box-shadow|width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*)\s*:/;
const kfRe = /@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g;
const found = new Set();
while ((m = kfRe.exec(html))) {
  const props = m[2].match(bad);
  if (props) found.add(`${m[1]}:${props[2]}`);
}
let baseline = [];
const bp = path.join(__dirname, "check-html.baseline.json");
if (fs.existsSync(bp)) baseline = JSON.parse(fs.readFileSync(bp, "utf8"));
if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(bp, JSON.stringify([...found].sort(), null, 2) + "\n");
  console.log(`baseline written: ${found.size} keyframe(s)`);
  process.exit(0);
}
for (const k of found) if (!baseline.includes(k)) errors.push(`@keyframes animates a non-compositor property (${k}); animate transform/opacity only`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`index.html ok: ${n} inline scripts parse, ${found.size} grandfathered keyframe(s)`);
