// Builds the public website into dist/site from site/ and site.config.json:
//   {{SUPPORT_EMAIL}} -> supportEmail (required)
//   {{STORE_URL}}     -> storeUrl, or the GitHub repo until the store listing is live
// GitHub Pages runs this (see .github/workflows/pages.yml); run it locally to preview.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "site.config.json"), "utf8"));
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.supportEmail || "")) {
  console.error("site.config.json: set supportEmail first (npm run configure -- --email you@example.com)");
  process.exit(1);
}
const values = { SUPPORT_EMAIL: cfg.supportEmail, STORE_URL: cfg.storeUrl || cfg.repo };
const src = path.join(root, "site");
const out = path.join(root, "dist", "site");
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
for (const f of fs.readdirSync(out)) {
  if (!/\.(html|css)$/.test(f)) continue;
  const p = path.join(out, f);
  const s = fs.readFileSync(p, "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m));
  const left = s.match(/\{\{\w+\}\}/);
  if (left) throw new Error(`${f}: unknown placeholder ${left[0]}`);
  fs.writeFileSync(p, s);
}
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`Built ${path.relative(root, out)}  (support: ${values.SUPPORT_EMAIL}, store button: ${values.STORE_URL})`);
