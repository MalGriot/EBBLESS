#!/usr/bin/env node
// Pre-commit security guard (see docs/SECURITY-REVIEW.md).
// Greps shipped code for patterns that are almost always a mistake.
// Known, reviewed hits live in scripts/check-security.baseline.json as
// "rule:file:trimmed-line" so only NEW hits fail. Never add to it to get a
// commit through; fix the code or justify it in docs/SECURITY-REVIEW.md.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const files = ["index.html", "sw.js", "privacy.html", "terms.html"];
const workerDir = path.join(root, "worker", "src");
for (const f of fs.readdirSync(workerDir)) if (f.endsWith(".js")) files.push(path.join("worker", "src", f));

const rules = [
  ["secret", /(sk_live_[0-9A-Za-z]{10,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|xox[bp]-[0-9A-Za-z-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)/, "hard-coded secret; use a Worker secret (wrangler secret put)"],
  ["eval", /(^|[^\w.])eval\s*\(|document\.write\s*\(/, "eval/document.write; avoid dynamic code execution"],
  ["blank", /target=["']_blank["'](?![^>]*noopener)/, "target=_blank without rel=noopener"],
  ["http", /["'`]http:\/\/(?!localhost|127\.0\.0\.1|\[::1\]|www\.w3\.org)/, "plain http:// URL; use https"],
];

const bp = path.join(__dirname, "check-security.baseline.json");
const baseline = fs.existsSync(bp) ? JSON.parse(fs.readFileSync(bp, "utf8")) : [];
const found = new Set();
const errors = [];
for (const rel of files) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  fs.readFileSync(fp, "utf8").split("\n").forEach((line, i) => {
    for (const [id, re, msg] of rules) {
      if (!re.test(line)) continue;
      const key = `${id}:${rel}:${line.trim().slice(0, 160)}`;
      found.add(key);
      if (!baseline.includes(key) && !process.argv.includes("--write-baseline")) errors.push(`${rel}:${i + 1}: ${msg}`);
    }
  });
}
if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(bp, JSON.stringify([...found].sort(), null, 2) + "\n");
  console.log(`baseline written: ${found.size} hit(s)`);
  process.exit(0);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`security grep ok: ${files.length} files, ${found.size} grandfathered hit(s)`);
