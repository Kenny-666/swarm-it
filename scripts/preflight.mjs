// Pre-submission checks for the Chrome Web Store: npm run preflight
// Verifies the manifest, the upload zip, every store image, the listing copy, the website
// and the code (no remote code, no extra permissions). Exits non-zero if anything fails.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(root, ...p);
let fails = 0;
let warns = 0;
const ok = (m) => console.log("  ok    " + m);
const bad = (m) => {
  fails++;
  console.log("  FAIL  " + m);
};
const warn = (m) => {
  warns++;
  console.log("  warn  " + m);
};
const check = (cond, good, fail) => (cond ? ok(good) : bad(fail || good));

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

// ---- manifest
console.log("\nManifest");
const mf = JSON.parse(fs.readFileSync(rel("extension", "manifest.json"), "utf8"));
check(mf.manifest_version === 3, "Manifest V3");
check(mf.name && mf.name.length <= 75, `name: "${mf.name}" (${mf.name.length}/75)`);
check(mf.description && mf.description.length <= 132, `summary: ${mf.description.length}/132 characters`);
check(/^\d+(\.\d+){0,3}$/.test(mf.version), `version ${mf.version}`);
const perms = mf.permissions || [];
check(perms.every((p) => ["activeTab", "scripting", "storage"].includes(p)), `permissions: ${perms.join(", ")} (minimal)`, `unexpected permissions: ${perms.join(", ")}`);
check(!mf.host_permissions && !mf.content_scripts, "no host permissions or always-on content scripts");
check(!!mf.homepage_url, `homepage_url ${mf.homepage_url}`);
for (const n of ["16", "32", "48", "128"]) {
  const f = rel("extension", mf.icons[n]);
  const s = fs.existsSync(f) && pngSize(f);
  check(s && s[0] === +n && s[1] === +n, `icon ${n}×${n}`, `icon ${n}: missing or wrong size (${s})`);
}

// ---- code
console.log("\nCode");
for (const f of ["background.js", "swarmline.js"]) {
  try {
    execFileSync(process.execPath, ["--check", rel("extension", f)]);
    ok(`${f} parses`);
  } catch {
    bad(`${f}: syntax error`);
  }
  const src = fs.readFileSync(rel("extension", f), "utf8");
  const remote = /\beval\s*\(|new Function\s*\(|importScripts\s*\(|https?:\/\/[^"'\s]+\.js/.test(src);
  check(!remote, `${f}: no remote or evaluated code`, `${f}: contains eval / new Function / remote script URL`);
  check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src), `${f}: no network calls`, `${f}: makes network calls (update the privacy answers)`);
}

// ---- zip
console.log("\nUpload package");
const zip = rel("dist", `swarmline-${mf.version}.zip`);
if (!fs.existsSync(zip)) bad(`dist/swarmline-${mf.version}.zip missing: run npm run package`);
else {
  const b = fs.readFileSync(zip);
  const names = [];
  let ptr = b.length - 22;
  while (ptr > 0 && b.readUInt32LE(ptr) !== 0x06054b50) ptr--;
  let cd = b.readUInt32LE(ptr + 16);
  const n = b.readUInt16LE(ptr + 10);
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(cd + 28);
    const el = b.readUInt16LE(cd + 30);
    const cl = b.readUInt16LE(cd + 32);
    const off = b.readUInt32LE(cd + 42);
    const name = b.toString("utf8", cd + 46, cd + 46 + nl);
    names.push(name);
    // stale zip? compare each file with the source
    const lnl = b.readUInt16LE(off + 26);
    const lel = b.readUInt16LE(off + 28);
    const size = b.readUInt32LE(off + 18);
    const data = zlib.inflateRawSync(b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + size));
    const srcFile = rel("extension", name);
    if (!fs.existsSync(srcFile) || !fs.readFileSync(srcFile).equals(data)) bad(`zip is out of date (${name}): run npm run package`);
    cd += 46 + nl + el + cl;
  }
  check(names.includes("manifest.json"), "manifest.json at the zip root");
  check(names.every((x) => !/(^|\/)\.|node_modules|\.map$/.test(x)), `${names.length} files, nothing extra`);
  const kb = b.length / 1024;
  check(kb < 2048, `size ${kb.toFixed(1)} KB`);
}

// ---- store images
console.log("\nStore images");
const img = (f, w, h) => {
  const p = rel("store", f);
  const s = fs.existsSync(p) && pngSize(p);
  check(s && s[0] === w && s[1] === h, `${f} ${w}×${h}`, `${f}: missing or ${s ? s.join("×") : "not a PNG"} (needs ${w}×${h})`);
};
img("store-icon-128.png", 128, 128);
for (let i = 1; i <= 5; i++) img(`screenshot-${i}.png`, 1280, 800);
img("promo-440x280.png", 440, 280);
img("marquee-1400x560.png", 1400, 560);

// ---- listing copy
console.log("\nListing copy");
const listing = fs.readFileSync(rel("store", "LISTING.md"), "utf8");
check(listing.includes(mf.name), "LISTING.md title matches the manifest");
check(listing.includes(mf.description), "LISTING.md summary matches the manifest");
check(/Single purpose/i.test(listing) && /activeTab/.test(listing) && /scripting/.test(listing), "single purpose and permission justifications present");

// ---- website
console.log("\nWebsite");
const cfg = JSON.parse(fs.readFileSync(rel("site.config.json"), "utf8"));
const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.supportEmail || "");
check(emailOk, `support email: ${cfg.supportEmail}`, "support email not set: npm run configure -- --email you@example.com");
for (const f of ["index.html", "privacy.html", "support.html", "styles.css"]) check(fs.existsSync(rel("site", f)), `site/${f}`);
for (const a of ["favicon-32.png", "hero.png"]) check(fs.existsSync(rel("site", "assets", a)), `site/assets/${a}`);
check(fs.existsSync(rel("store", "icon.svg")), "store/icon.svg (the site logo)");
if (emailOk) {
  try {
    execFileSync(process.execPath, [rel("scripts", "build-site.mjs")], { stdio: "pipe" });
    const built = ["index.html", "privacy.html", "support.html"].map((f) => fs.readFileSync(rel("dist", "site", f), "utf8")).join("\n");
    check(!/\{\{\w+\}\}/.test(built), "site builds with no placeholders left");
  } catch (e) {
    bad("site build failed: " + String(e.stderr || e.message).trim());
  }
}
if (!cfg.storeUrl) warn("storeUrl not set yet: the site's “Add to Chrome” buttons point to GitHub until you add the store link after approval");
check(fs.existsSync(rel("LICENSE")), "LICENSE");
check(fs.existsSync(rel(".github", "workflows", "pages.yml")), "GitHub Pages workflow");

console.log(`\n${fails ? "NOT READY" : "READY"}: ${fails} failing, ${warns} warning${warns === 1 ? "" : "s"}\n`);
process.exit(fails ? 1 : 0);
