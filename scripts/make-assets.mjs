// Builds every image the extension, its Chrome Web Store listing and its website need:
//   extension/icons/icon{16,32,48,128}.png   toolbar + extension icons
//   store/store-icon-128.png                  store icon (96px artwork, 16px clear margin)
//   store/icon.svg                            the mark, as vector
//   store/screenshot-{1,2,3,4}.png           1280×800, Swarmline building the demo page
//   store/promo-440x280.png                   small promo tile
//   store/marquee-1400x560.png                marquee promo tile
//   site/assets/*                              copies for the website
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

// The mark: a page being built, with two swarm comets sweeping around it.
function iconSVG(size, { pad = 0 } = {}) {
  const detail = size >= 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${128 + pad * 2} ${128 + pad * 2}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20222E"/><stop offset="1" stop-color="#0C0D13"/></linearGradient>
    <linearGradient id="t1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FF5A6E" stop-opacity="0"/><stop offset=".55" stop-color="#FF5A6E"/><stop offset="1" stop-color="#FFB020"/></linearGradient>
    <linearGradient id="t2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D9BFF" stop-opacity="0"/><stop offset=".6" stop-color="#A46BFF"/><stop offset="1" stop-color="#3D9BFF"/></linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="36" y="30" width="56" height="66" rx="9" fill="none" stroke="#F4F5F8" stroke-width="${detail ? 6 : 9}"/>
  ${detail ? `<path d="M47 52H81M47 65H73" stroke="#F4F5F8" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/>
  <path d="M47 78H61" stroke="#19D3A2" stroke-width="6" stroke-linecap="round"/>` : ""}
  <path d="M14 110C34 104 58 112 88 100C100 95 108 88 113 80" fill="none" stroke="url(#t1)" stroke-width="${detail ? 7 : 11}" stroke-linecap="round"/>
  <circle cx="113" cy="80" r="${detail ? 6 : 9}" fill="#FFB020"/>
  ${detail ? `<path d="M112 20C100 24 84 20 68 18C56 17 44 20 34 24" fill="none" stroke="url(#t2)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="33" cy="24.5" r="5" fill="#3D9BFF"/>` : ""}
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

  // ---- screenshots: Swarmline building the (fictional) demo page
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const demo = pathToFileURL(path.join(root, "demo", "index.html")).href;
  const shots = [];
  const run = async (scrollY, waits) => {
    await page.goto(demo, { waitUntil: "load" });
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await sleep(600);
    await page.addScriptTag({ path: path.join(root, "extension", "swarmline.js") });
    for (const [ms, file] of waits) {
      await sleep(ms);
      const p = path.join(root, "store", file);
      await page.screenshot({ path: p });
      shots.push(p);
    }
    await page.evaluate(() => window.__swarmline && window.__swarmline.stop(true));
    await sleep(400);
  };
  await run(0, [[1350, "screenshot-1.png"], [900, "screenshot-2.png"]]);
  await run(1560, [[2000, "screenshot-3.png"]]);
  await run(2180, [[1900, "screenshot-4.png"]]);
  console.log("screenshots done");

  // ---- promo tiles
  const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
  const icon = "data:image/svg+xml;base64," + Buffer.from(iconSVG(128)).toString("base64");
  const tile = (w, h, big) => `<html><head><style>
    *{box-sizing:border-box}
    body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,"Segoe UI",sans-serif;color:#fff;
      background:radial-gradient(90% 120% at 18% 30%,#2a1f45 0%,#14151c 55%,#0b0c11 100%)}
    .glow{position:absolute;width:${big ? 700 : 260}px;height:${big ? 700 : 260}px;border-radius:50%;filter:blur(${big ? 90 : 40}px);opacity:.35}
    .copy{position:absolute;left:${big ? 84 : 24}px;top:${big ? 158 : 40}px;width:${big ? 540 : 220}px}
    .brand{display:flex;align-items:center;gap:${big ? 16 : 10}px;font-weight:800;letter-spacing:-.02em;font-size:${big ? 50 : 27}px}
    .brand img{width:${big ? 66 : 38}px;height:${big ? 66 : 38}px}
    p{margin:${big ? 20 : 11}px 0 0;color:#D6D8E4;font-size:${big ? 25 : 14}px;line-height:1.35}
    .k{display:flex;gap:${big ? 10 : 6}px;margin-top:${big ? 24 : 13}px;flex-wrap:wrap}
    .k span{font:650 ${big ? 13 : 9}px Inter,system-ui,sans-serif;padding:${big ? "6px 10px" : "3px 6px"};border-radius:6px;color:#fff}
    .shot{position:absolute;right:${big ? -30 : -80}px;top:${big ? 64 : 46}px;width:${big ? 780 : 300}px;border-radius:${big ? 14 : 8}px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.12);transform:perspective(1400px) rotateY(-11deg) rotateX(3deg)}
  </style></head><body>
    <div class="glow" style="left:-120px;top:-160px;background:#FF5A6E"></div>
    <div class="glow" style="left:${big ? 380 : 140}px;top:${big ? 260 : 120}px;background:#3D9BFF"></div>
    <img class="shot" src="${b64(shots[1])}">
    <div class="copy"><div class="brand"><img src="${icon}">Swarmline</div>
      <p>Watch a swarm build any website, live in your browser.</p>
      <div class="k"><span style="background:#FF5A6E">Trace</span><span style="background:#A46BFF">Type</span><span style="background:#3D9BFF">Reveal</span></div></div>
  </body></html>`;
  for (const [w, h, big, file] of [[440, 280, false, "promo-440x280.png"], [1400, 560, true, "marquee-1400x560.png"]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(tile(w, h, big), { waitUntil: "load" });
    await sleep(200);
    await page.screenshot({ path: path.join(root, "store", file) });
  }
  console.log("promo tiles done");

  // ---- website copies
  const sa = path.join(root, "site", "assets");
  fs.mkdirSync(sa, { recursive: true });
  for (const f of ["icon.svg", "store-icon-128.png", "screenshot-1.png", "screenshot-2.png", "screenshot-3.png", "screenshot-4.png", "marquee-1400x560.png"]) fs.copyFileSync(path.join(root, "store", f), path.join(sa, f));
  await shootSVG(iconSVG(32), 32, path.join(sa, "favicon-32.png"));
  console.log("site assets done");
} finally {
  await browser.close();
}
