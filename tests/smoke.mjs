// Smoke test: open a page in Chrome, screenshot it live, run Swarmline on it with Tour
// on, measure how Tour scrolls, then screenshot the finished rebuild at the same spots.
//
//   node tests/smoke.mjs demo/index.html
//   node tests/smoke.mjs https://cenovabuild.com/
//
// swarmline.js and settle.js are injected into the page's own world (Chrome no longer lets
// branded builds load unpacked extensions from the command line), which exercises the
// same capture, settle and rebuild code; only the background.js bridge is skipped.
// Output goes to tests/out/<page>/ (screenshots + report.json).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "demo/index.html";
const url = /^https?:/.test(arg) ? arg : pathToFileURL(path.resolve(root, arg)).href;
const slug = url.replace(/^\w+:\/+/, "").replace(/[^\w.-]+/g, "_").replace(/_+$/, "").slice(0, 60);
const out = path.join(root, "tests", "out", slug);
fs.mkdirSync(out, { recursive: true });

const VW = 1440;
const VH = 900;
const TIMEOUT = Number(process.env.SWARM_TIMEOUT || 300) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// runs in the page: the element that scrolls (same rule as swarmline.js detectEnv)
const SCROLLER = `window.__testScroller = () => {
  const se = document.scrollingElement || document.documentElement;
  if (se.scrollHeight > innerHeight + 4) return se;
  let best = se, area = 0;
  for (const el of document.body.getElementsByTagName("*")) {
    if (el.scrollHeight <= el.clientHeight + 40 || el.clientHeight < innerHeight * 0.4) continue;
    if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > area && r.width > innerWidth * 0.35) { best = el; area = r.width * r.height; }
  }
  return best;
};`;
const scrollTo = (page, y) => page.evaluate((y) => window.__testScroller().scrollTo({ top: y, behavior: "instant" }), y);

const chromePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));
if (!chromePath) throw new Error("No Chrome found: set CHROME_PATH");

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: VW, height: VH },
  args: [`--window-size=${VW},${VH}`, "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
});
const report = { url, errors: [], logs: [] };
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => report.errors.push(String(e && e.message)));
  page.on("console", (m) => {
    const t = m.text();
    if (/swarmline/.test(t)) report.logs.push(`${m.type()}: ${t}`);
  });

  console.log("open", url);
  let lastNav = Date.now();
  page.on("framenavigated", (f) => f === page.mainFrame() && (lastNav = Date.now()));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  // some sites reload themselves once after the first load (cenovabuild.com does, ~3.5s in)
  while (Date.now() - lastNav < 4000) await sleep(250);
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => {});
  await sleep(3000);
  await page.evaluate(SCROLLER);

  // reference screenshots of the live page, letting its scroll animations play at each stop
  const H = await page.evaluate(() => window.__testScroller().scrollHeight);
  const stops = [...new Set([0, 1, 2, 3, 5, 8].map((k) => Math.min(Math.max(0, H - VH), k * VH)))];
  report.pageHeight = H;
  report.stops = stops;
  for (const [i, y] of stops.entries()) {
    await scrollTo(page, y);
    await sleep(2500);
    await page.screenshot({ path: path.join(out, `live-${i}.png`) });
  }
  await scrollTo(page, 0);
  await sleep(2000);

  await page.addScriptTag({ path: path.join(root, "extension", "settle.js") });
  await page.addScriptTag({ path: path.join(root, "extension", "swarmline.js") });
  await page.waitForFunction(() => window.__swarmline && window.__swarmline.app && window.__swarmline.app.model, { timeout: 60000 });
  report.capture = await page.evaluate(() => {
    const a = window.__swarmline.app;
    const m = a.model;
    const it = m.items;
    return {
      timing: a.timing,
      settled: a.settled,
      items: it.length,
      tasks: m.tasks.length,
      texts: it.filter((x) => x.kind === "text").length,
      oneCharTexts: it.filter((x) => x.kind === "text" && x.text.length === 1).length,
      loops: m.loops.length,
      loopItems: m.loops.reduce((n, l) => n + l.items.length, 0),
      riders: m.loops.reduce((n, l) => n + l.riders.length, 0),
      liveCanvases: it.filter((x) => x.liveSrc).length,
      groups: m.groups.length,
      guides: m.guides.length,
    };
  });
  console.log("capture", report.capture);
  await page.screenshot({ path: path.join(out, "build-start.png") });

  // 3x speed, Tour on
  await page.evaluate(() => {
    const r = window.__swarmline.app.view.root;
    r.querySelector('[data-a="speed"]').click();
    r.querySelector('[data-a="speed"]').click();
    if (r.querySelector('[data-a="tour"]').getAttribute("aria-pressed") !== "true") r.querySelector('[data-a="tour"]').click();
  });

  // follow the tour: scroll position, camera hold, frontier
  const samples = await page.evaluate(
    (TIMEOUT) =>
      new Promise((resolve) => {
        const a = window.__swarmline.app;
        const E = a.engine;
        const s = [];
        const t0 = performance.now();
        const tick = () => {
          const t = performance.now() - t0;
          s.push({ t: Math.round(t), y: Math.round(a.env.geom().sy), hold: E.hold, frontier: Math.round(E.frontier), backlog: E.backlog(), active: E.activeCount });
          if (a.complete || t > TIMEOUT || !window.__swarmline.app) resolve(s);
          else setTimeout(tick, 50);
        };
        tick();
      }),
    TIMEOUT,
  );

  // tour jumps: contiguous runs of hold=true
  const jumps = [];
  let cur = null;
  for (const p of samples) {
    if (p.hold && !cur) cur = { start: p, pts: [p] };
    else if (p.hold) cur.pts.push(p);
    else if (cur) {
      const pts = [...cur.pts, p];
      let peak = 0;
      for (let i = 1; i < pts.length; i++) peak = Math.max(peak, Math.abs(pts[i].y - pts[i - 1].y) / Math.max(1, pts[i].t - pts[i - 1].t) * 1000);
      jumps.push({
        at: cur.start.t,
        ms: p.t - cur.start.t,
        from: cur.start.y,
        to: p.y,
        peakPxPerS: Math.round(peak),
        frontierMovedDuringJump: cur.pts.some((q) => q.frontier !== cur.start.frontier),
      });
      cur = null;
    }
  }
  report.tour = {
    jumps: jumps.length,
    avgJumpMs: jumps.length ? Math.round(jumps.reduce((n, j) => n + j.ms, 0) / jumps.length) : 0,
    avgPeakPxPerS: jumps.length ? Math.round(jumps.reduce((n, j) => n + j.peakPxPerS, 0) / jumps.length) : 0,
    frontierMovedDuringAnyJump: jumps.some((j) => j.frontierMovedDuringJump),
    list: jumps,
  };

  const done = await page.evaluate(() => {
    const a = window.__swarmline.app;
    return {
      complete: a.complete,
      done: a.engine.doneCount,
      total: a.engine.tasks.length,
      secs: a.engine.endTime != null ? +(a.engine.endTime - a.engine.startTime).toFixed(1) : null,
      loopsStarted: a.view.loops.filter((l) => l.started).length,
      loopAnimsRunning: a.model.items.filter((it) => it.node && it.node._loop && it.node._loop.playState === "running").length,
      liveMirrors: a.view.liveCanvases.length,
    };
  });
  report.result = done;
  console.log("result", done);
  console.log("tour", { ...report.tour, list: undefined });

  // the finished rebuild at the same stops as the live screenshots
  for (const [i, y] of stops.entries()) {
    await scrollTo(page, y);
    await sleep(900);
    await page.screenshot({ path: path.join(out, `rebuilt-${i}.png`) });
  }
  // and prove looping animations are moving: two shots of the same spot, 700ms apart
  report.motion = await page.evaluate(() => {
    const a = window.__swarmline.app;
    const it = a.model.items.find((x) => x.node && x.node._loop && x.vis);
    if (!it) return null;
    const r1 = it.node.getBoundingClientRect();
    return new Promise((res) => setTimeout(() => {
      const r2 = it.node.getBoundingClientRect();
      res({ item: it.kind, moved: Math.round(Math.hypot(r2.left - r1.left, r2.top - r1.top)) });
    }, 700));
  });
  console.log("motion", report.motion);
} finally {
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log("errors", report.errors.length, report.errors.slice(0, 5));
  console.log("wrote", out);
  await browser.close();
}
