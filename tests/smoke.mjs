// Smoke test: run Swarmline on a page in Chrome with Auto-tour on, record how it moves,
// take screenshots along the way, and check it lifts away to leave the live page.
//
//   node tests/smoke.mjs demo/index.html
//   node tests/smoke.mjs https://example.com/
//
// swarmline.js is injected straight into the page (branded Chrome won't load unpacked
// extensions from the command line); tests/extension.mjs covers the real extension.
// Output: tests/out/<page>/ (frames + report.json).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "demo/index.html";
const url = /^https?:/.test(arg) ? arg : pathToFileURL(path.resolve(root, arg)).href;
const slug = url.replace(/^\w+:\/+/, "").replace(/[^\w.-]+/g, "_").replace(/_+$/, "").slice(-60);
const out = path.join(root, "tests", "out", slug);
fs.mkdirSync(out, { recursive: true });
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 900);
const SPEED = Number(process.env.SPEED || 2);
const TIMEOUT = Number(process.env.TIMEOUT || 240) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chromePath =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
    fs.existsSync(p),
  );
if (!chromePath) throw new Error("No Chrome found: set CHROME_PATH");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: W, height: H },
  args: [`--window-size=${W},${H}`, "--hide-scrollbars", "--enable-unsafe-swiftshader"],
});
const report = { url, errors: [] };
let failed;
try {
  const page = await browser.newPage();
  // screenshots are a bonus: very heavy pages sometimes refuse a capture in headless Chrome
  const shoot = (name) => page.screenshot({ path: path.join(out, name) }).catch(() => {});
  await page.setBypassCSP(true); // strict sites block page-added scripts; the real extension injects past CSP anyway
  page.on("pageerror", (e) => report.errors.push("page: " + e.message));
  page.on("console", (m) => /swarmline/i.test(m.text()) && m.type() === "error" && report.errors.push(m.text()));
  let lastNav = Date.now();
  page.on("framenavigated", (f) => f === page.mainFrame() && (lastNav = Date.now()));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  while (Date.now() - lastNav < 6000) await sleep(250); // some sites reload themselves once
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
  await sleep(1500);
  await shoot("00-live.png");

  await page.addScriptTag({ path: path.join(root, "extension", "swarmline.js") });
  await page.waitForFunction(() => window.__swarmline && window.__swarmline.app, { timeout: 10000 });
  await page.evaluate((speed) => {
    const a = window.__swarmline.app;
    a.speed = speed;
    a.setTour(true);
  }, SPEED);

  // follow it: frames, motion and throughput
  const t0 = Date.now();
  let shot = 1;
  const shotsAt = (process.env.SHOTS || "700,1600,2600,4200,6500,9500").split(",").map(Number);
  const fps = [];
  const fpsDuring = [];
  const marks = [];
  for (;;) {
    const s = await page.evaluate(() => {
      const a = window.__swarmline.app;
      if (!a) return null;
      return { top: Math.round(a.env.top), units: a.units.length, done: a.done, active: a.active.length, jump: !!a.jump, sweep: !!a.sweep, outro: !!a.outro, off: !!(a.outro && a.outro.off) };
    });
    const t = Date.now() - t0;
    if (!s) break;
    marks.push({ t, ...s });
    if (shotsAt.length && t >= shotsAt[0]) {
      shotsAt.shift();
      await shoot(`${String(shot++).padStart(2, "0")}-drafting.png`);
    }
    if (fpsDuring.length < 3 && t > 2500 + fpsDuring.length * 4000 && !s.outro) fpsDuring.push(await page.evaluate(() =>
        new Promise((res) => {
          let n = 0;
          const s = performance.now();
          const f = () => (++n < 60 ? requestAnimationFrame(f) : res(Math.round((60 * 1000) / (performance.now() - s))));
          requestAnimationFrame(f);
        })));
    if (s.off || t > TIMEOUT) break;
    await sleep(120);
  }
  fps.push(
    await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const s = performance.now();
          const f = () => (++n < 60 ? requestAnimationFrame(f) : res(Math.round((60 * 1000) / (performance.now() - s))));
          requestAnimationFrame(f);
        }),
    ),
  );
  await sleep(600);
  await shoot("99-finished.png");
  const end = marks[marks.length - 1] || {};
  const jumps = [];
  for (let i = 1; i < marks.length; i++) if (marks[i].jump && !marks[i - 1].jump) jumps.push(marks[i].t);
  report.result = {
    finished: !!end.off,
    seconds: +((end.t || 0) / 1000).toFixed(1),
    elements: end.units,
    drawn: end.done,
    sheetsVisited: jumps.length + 1,
    fpsWhileDrafting: fpsDuring,
    fpsAfter: fps[0],
    overlayGone: await page.evaluate(() => {
      const h = document.querySelector("swarmline-layer");
      return !h || getComputedStyle(h).pointerEvents === "none";
    }),
  };
  console.log("result", report.result);
  failed = !report.result.finished || report.errors.length > 0;
} catch (e) {
  report.errors.push(String(e && e.stack));
  failed = true;
} finally {
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log("errors", report.errors.length, report.errors.slice(0, 5));
  console.log("wrote", out);
  await browser.close();
}
console.log(failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);
