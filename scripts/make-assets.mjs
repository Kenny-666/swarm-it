// Builds every image the extension, its Chrome Web Store listing and its website need:
//   extension/icons/icon{16,32,48,128}.png   toolbar + extension icons
//   store/store-icon-128.png                  store icon (96px artwork, 16px clear margin)
//   store/icon.svg                            the mark, as vector
//   store/screenshot-{1..5}.png              1280×800, captioned moments of Swarmline building the demo page
//   store/promo-440x280.png                   small promo tile
//   store/marquee-1400x560.png                marquee promo tile
//   site/assets/{favicon-32,hero}.png          the website's own images
// Run: npm run assets   (needs Chrome; set CHROME_PATH if it isn't in a standard place)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromePath =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

// The mark: a browser window whose outline is still being drawn, with the pointer
// at the end of the line it is drawing, a typed headline and a caret. Simplified
// at 32px and 16px so it stays crisp in the toolbar.
function iconSVG(size, { pad = 0 } = {}) {
  const tiny = size <= 16;
  const small = size <= 32;
  // the pointer: classic arrow, tip at (0,0), pointing up-left
  const ptr = "M0 0 L0 30 L7.6 23.2 L12.6 34.4 L18.4 31.8 L13.4 20.8 L23.4 20.6 Z";
  // a window being drawn: the outline runs clockwise and stops where the pointer is
  const frame = tiny
    ? "M82 54 V42 a12 12 0 0 0 -12 -12 H32 a12 12 0 0 0 -12 12 V84 a12 12 0 0 0 12 12 H56"
    : "M86 56 V44 a12 12 0 0 0 -12 -12 H32 a12 12 0 0 0 -12 12 V84 a12 12 0 0 0 12 12 H62";
  const pt = tiny ? { x: 76, y: 58, s: 1.5, w: 4 } : small ? { x: 82, y: 60, s: 1.12, w: 3 } : { x: 83, y: 60, s: 1, w: 2.6 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${128 + pad * 2} ${128 + pad * 2}">
  <defs>
    <linearGradient id="sw-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF5470"/><stop offset=".52" stop-color="#9B4DFF"/><stop offset="1" stop-color="#2E6BFF"/>
    </linearGradient>
    <linearGradient id="sw-sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sw-sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${small ? 1.5 : 2.5}" stdDeviation="${small ? 1.4 : 2.6}" flood-color="#1A0B3D" flood-opacity=".4"/></filter>
  </defs>
  <rect width="128" height="128" rx="30" fill="url(#sw-bg)"/>
  <rect width="128" height="128" rx="30" fill="url(#sw-sheen)"/>
  <rect x="1" y="1" width="126" height="126" rx="29" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>
  <g filter="url(#sw-sh)">
    <path d="${frame}" fill="none" stroke="#fff" stroke-width="${tiny ? 14 : small ? 10.5 : 8.5}" stroke-linecap="round" stroke-linejoin="round"/>
    ${small ? "" : `<path d="M20 49 H86" stroke="#fff" stroke-opacity=".5" stroke-width="4.5"/>
    <circle cx="31" cy="40.5" r="2.6" fill="#fff"/><circle cx="39" cy="40.5" r="2.6" fill="#fff" fill-opacity=".7"/><circle cx="47" cy="40.5" r="2.6" fill="#fff" fill-opacity=".45"/>
    <path d="M33 65 H68" stroke="#fff" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M33 81 H51" stroke="#fff" stroke-opacity=".6" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M59 74 V88" stroke="#FFC94D" stroke-width="4" stroke-linecap="round"/>`}
    ${small && !tiny ? `<path d="M35 62 H64" stroke="#fff" stroke-width="9" stroke-linecap="round"/>` : ""}
    <g transform="translate(${pt.x} ${pt.y}) scale(${pt.s})">
      <path d="${ptr}" fill="#fff" stroke="#24104F" stroke-width="${pt.w}" stroke-linejoin="round"/>
    </g>
  </g>
</svg>`;
}

const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ["--hide-scrollbars", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();

  // ---- icons
  const shootSVG = async (svg, size, file) => {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  for (const n of [16, 32, 48, 128]) await shootSVG(iconSVG(n), n, path.join(root, "extension", "icons", `icon${n}.png`));
  await shootSVG(iconSVG(128, { pad: 21.4 }), 128, path.join(root, "store", "store-icon-128.png"));
  fs.writeFileSync(path.join(root, "store", "icon.svg"), iconSVG(128));
  console.log("icons done");

  // ---- screenshots: real moments of Swarmline building the (fictional) demo page,
  // captured the instant each one happens, then framed with a caption (1280×800); the
  // whole browser window fits, so the toolbar (Live agents) is in every shot
  const demo = pathToFileURL(path.join(root, "demo", "index.html")).href;
  const raw = path.join(root, "store", "raw");
  fs.mkdirSync(raw, { recursive: true });
  const capture = async (name, scrollSel, cond, after) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 }); // sharp once scaled into the frame
    await page.goto(demo, { waitUntil: "load" });
    await page.evaluate((sel) => {
      const el = sel && document.querySelector(sel);
      window.scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - 60 : 0);
    }, scrollSel);
    await sleep(600);
    await page.addScriptTag({ path: path.join(root, "extension", "swarmline.js") });
    await page.waitForFunction(() => window.__swarmline && window.__swarmline.app);
    await page.evaluate(() => {
      const a = window.__swarmline.app;
      a.setTour(false);
      if (a.sfx) a.sfx.setOn(false);
    });
    const t0 = Date.now();
    for (;;) {
      const hit = await page.evaluate(`(() => { const a = window.__swarmline.app; return !!a && (${cond})(a); })()`);
      if (hit || Date.now() - t0 > 20000) break;
      await sleep(15);
    }
    if (after) await after();
    const file = path.join(raw, name + ".png");
    await page.screenshot({ path: file });
    await page.evaluate(() => window.__swarmline && window.__swarmline.stop(true));
    await sleep(300);
    return file;
  };
  const draw = await capture("draw", null, "(a) => a.done >= 10 && a.active.filter((u) => u.step === 2 && (u.kind === 'box' || u.kind === 'media')).length >= 2");
  const dup = await capture("duplicate", ".grid3", "(a) => a.active.some((u) => u.kind === 'dup' && u.step === 3 && u.el.classList.contains('card') && u.lead && u.lead.mv && u.lead.mv.t > u.lead.mv.dur * 0.5)");
  const edit = await capture("edit", ".grid3", "(a) => a.active.some((u) => u.kind === 'text' && u.edit && u.step === 11 && u.inCopy && u.inCopy.el.classList.contains('card'))");
  const snap = await capture("snap", null, "(a) => a.active.some((u) => u.kind === 'text' && u.step === 21)");
  const live = await capture("live", null, "(a) => a.done > 30", async () => {
    await page.keyboard.press("f");
    await sleep(700);
    for (let t = 0; t <= 1; t += 0.05) {
      await page.mouse.move(980 + 120 * Math.cos(t * 4), 430 + 90 * Math.sin(t * 4));
      await sleep(30);
    }
    await sleep(900);
  });

  const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
  const icon = "data:image/svg+xml;base64," + Buffer.from(iconSVG(128)).toString("base64");
  const FONT = 'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
  const framed = (img, title, sub) => `<html><head><style>
    *{box-sizing:border-box}html,body{margin:0;overflow:hidden}
    body{width:1280px;height:800px;position:relative;font-family:${FONT};color:#fff;
      background:radial-gradient(70% 90% at 10% 0%,#2b1d48 0%,rgba(43,29,72,0) 60%),radial-gradient(60% 80% at 100% 10%,#14275a 0%,rgba(20,39,90,0) 60%),#0d0e15}
    .cap{position:absolute;left:155px;top:34px;right:155px;display:flex;align-items:flex-start;justify-content:space-between}
    h1{margin:0;font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
    p{margin:8px 0 0;font-size:17px;line-height:1.4;color:#C9CDDA;max-width:800px;white-space:nowrap}
    .brand{display:flex;align-items:center;gap:10px;font-weight:750;font-size:18px;color:#E9EBF2;margin-top:6px}
    .brand img{width:30px;height:30px}
    .win{position:absolute;left:155px;top:140px;width:970px;border-radius:14px;overflow:hidden;background:#fff;
      box-shadow:0 40px 90px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.1)}
    .bar{height:34px;background:#1c1e29;display:flex;align-items:center;gap:8px;padding:0 14px}
    .bar i{width:11px;height:11px;border-radius:50%;display:block}
    .url{margin-left:14px;height:22px;flex:0 0 360px;border-radius:7px;background:#2a2d3b;color:#9aa1b4;font-size:12px;display:flex;align-items:center;padding:0 10px}
    .win img{display:block;width:970px;height:606px}
  </style></head><body>
    <div class="cap"><div><h1>${title}</h1><p>${sub}</p></div><div class="brand"><img src="${icon}">Swarmline</div></div>
    <div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div class="url">fernbrook.studio</div></div><img src="${b64(img)}"></div>
  </body></html>`;
  const shots = [
    [draw, "Every box drawn by hand", "Live agents drag out each section with sizes, rulers and guides, then it fills in for real."],
    [dup, "Build one. Duplicate the rest.", "Cards, rows and links are Alt-dragged as copies with the spacing measured, like a designer would."],
    [edit, "Then change the details", "Each copy's words are selected and retyped, and a different image or colour is swapped in."],
    [snap, "Typed, then snapped into place", "Text is typed letter by letter and nudged onto an alignment guide until it snaps."],
    [live, "Live again in seconds", "The page is fully live again and the swarm follows your cursor. Press H to hide the controls."],
  ];
  for (const [i, [img, title, sub]] of shots.entries()) {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setContent(framed(img, title, sub), { waitUntil: "load" });
    await sleep(150);
    await page.screenshot({ path: path.join(root, "store", `screenshot-${i + 1}.png`), clip: { x: 0, y: 0, width: 1280, height: 800 }, captureBeyondViewport: false });
  }
  console.log("screenshots done");

  // ---- promo tiles
  const tile = (w, h, big) => `<html><head><style>
    *{box-sizing:border-box}
    html{overflow:hidden}
    body{position:relative;margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:${FONT};color:#fff;
      background:radial-gradient(90% 120% at 18% 30%,#2a1f45 0%,#14151c 55%,#0b0c11 100%)}
    .glow{position:absolute;width:${big ? 700 : 260}px;height:${big ? 700 : 260}px;border-radius:50%;filter:blur(${big ? 90 : 40}px);opacity:.35}
    .copy{position:absolute;left:${big ? 84 : 24}px;top:${big ? 150 : 40}px;width:${big ? 560 : 196}px;z-index:1}
    .brand{display:flex;align-items:center;gap:${big ? 16 : 10}px;font-weight:800;letter-spacing:-.02em;font-size:${big ? 50 : 27}px}
    .brand img{width:${big ? 66 : 38}px;height:${big ? 66 : 38}px}
    p{margin:${big ? 20 : 11}px 0 0;color:#D6D8E4;font-size:${big ? 25 : 14}px;line-height:1.35}
    .k{display:flex;gap:${big ? 10 : 6}px;margin-top:${big ? 24 : 13}px;flex-wrap:wrap}
    .k span{font:650 ${big ? 13 : 9}px ${FONT};padding:${big ? "6px 10px" : "3px 6px"};border-radius:6px;color:#fff}
    .shot{position:absolute;right:${big ? -30 : -80}px;top:${big ? 64 : 46}px;width:${big ? 780 : 300}px;border-radius:${big ? 14 : 8}px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.12);transform:perspective(1400px) rotateY(-11deg) rotateX(3deg)}
  </style></head><body>
    <div class="glow" style="left:-120px;top:-160px;background:#FF5A6E"></div>
    <div class="glow" style="left:${big ? 380 : 140}px;top:${big ? 260 : 120}px;background:#3D9BFF"></div>
    <img class="shot" src="${b64(big ? dup : draw)}">
    <div class="copy"><div class="brand"><img src="${icon}">Swarmline</div>
      <p>Watch a swarm of cursors build any website, live in your browser.</p>
      <div class="k"><span style="background:#FF5A6E">Draw</span><span style="background:#A46BFF">Type</span><span style="background:#3D9BFF">Duplicate</span></div></div>
  </body></html>`;
  for (const [w, h, big, file] of [[440, 280, false, "promo-440x280.png"], [1400, 560, true, "marquee-1400x560.png"]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(tile(w, h, big), { waitUntil: "load" });
    await sleep(200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, "store", file), clip: { x: 0, y: 0, width: w, height: h }, captureBeyondViewport: false });
  }
  console.log("promo tiles done");

  // ---- the website's own images (the store graphics are copied in by build-site.mjs)
  const sa = path.join(root, "site", "assets");
  fs.mkdirSync(sa, { recursive: true });
  await shootSVG(iconSVG(32), 32, path.join(sa, "favicon-32.png"));
  fs.copyFileSync(dup, path.join(sa, "hero.png")); // the website hero: a duplicate being dragged
  console.log("site assets done");
} finally {
  await browser.close();
}
