// Builds every image the extension and its Chrome Web Store listing need:
//   extension/icons/icon{16,32,48,128}.png   toolbar + extension icons
//   store/store-icon-128.png                  store icon (96px artwork, 16px clear margin)
//   store/screenshot-{1,2,3}.png             1280×800, Swarmline drawing the demo page
//   store/promo-440x280.png                   small promo tile
//   store/marquee-1400x560.png                marquee promo tile
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

// The mark: a drafted page on blueprint paper, corner registration ticks, one amber dimension.
function iconSVG(size, { pad = 0 } = {}) {
  const s = 128;
  const detail = size >= 32;
  const grid = detail
    ? [...Array(7)].map((_, i) => `<path d="M${16 + i * 16} 0V128M0 ${16 + i * 16}H128" stroke="#5FD3FF" stroke-opacity=".10" stroke-width="1"/>`).join("")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${s + pad * 2} ${s + pad * 2}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12325C"/><stop offset="1" stop-color="#081830"/></linearGradient>
    <clipPath id="c"><rect width="128" height="128" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect width="128" height="128" fill="url(#bg)"/>
    ${grid}
  </g>
  <rect x="30" y="28" width="68" height="72" rx="7" fill="none" stroke="#5FD3FF" stroke-width="${detail ? 6 : 9}"/>
  ${detail ? `<path d="M30 46H98" stroke="#5FD3FF" stroke-width="5"/>
  <path d="M42 62H78M42 76H68" stroke="#DDF5FF" stroke-width="6" stroke-linecap="round"/>
  <path d="M22 108H106M22 102V114M106 102V114" stroke="#FFC46B" stroke-width="5" stroke-linecap="round"/>` : `<path d="M42 60H80" stroke="#DDF5FF" stroke-width="10" stroke-linecap="round"/>`}
  ${detail ? `<path d="M18 22H24M22 18V24M110 22H104M106 18V24" stroke="#5FD3FF" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>` : ""}
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

  // ---- screenshots: Swarmline drawing the (fictional) demo page
  const W = 1280;
  const H = 800;
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
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
    await page.evaluate(() => window.__swarmline && window.__swarmline.stop());
    await sleep(500);
  };
  await run(0, [[1900, "screenshot-1.png"]]);
  await run(1560, [[2700, "screenshot-2.png"]]);
  await run(2180, [[2300, "screenshot-3.png"]]);
  console.log("screenshots done");

  // ---- promo tiles
  const b64 = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");
  const icon = "data:image/svg+xml;base64," + Buffer.from(iconSVG(128)).toString("base64");
  const tile = (w, h, big) => `<html><head><style>
    *{box-sizing:border-box}
    body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,"Segoe UI",sans-serif;color:#fff;
      background:radial-gradient(120% 90% at 30% 20%,#173d6e 0%,#0B1D36 55%,#061223 100%)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(95,211,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(95,211,255,.07) 1px,transparent 1px),linear-gradient(rgba(95,211,255,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(95,211,255,.14) 1px,transparent 1px);background-size:10px 10px,10px 10px,50px 50px,50px 50px}
    .copy{position:absolute;left:${big ? 84 : 26}px;top:${big ? 150 : 36}px;width:${big ? 520 : 230}px}
    .brand{display:flex;align-items:center;gap:${big ? 16 : 10}px;font-weight:800;letter-spacing:-.02em;font-size:${big ? 46 : 26}px}
    .brand img{width:${big ? 64 : 38}px;height:${big ? 64 : 38}px}
    p{margin:${big ? 22 : 12}px 0 0;color:#BFE6FF;font-size:${big ? 24 : 14}px;line-height:1.35}
    .k{margin-top:${big ? 26 : 14}px;font:600 ${big ? 13 : 9}px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.18em;color:#5FD3FF;text-transform:uppercase}
    .shot{position:absolute;right:${big ? -40 : -70}px;top:${big ? 70 : 44}px;width:${big ? 760 : 300}px;border-radius:${big ? 14 : 8}px;border:1px solid rgba(95,211,255,.45);box-shadow:0 30px 70px rgba(0,0,0,.55);transform:perspective(1400px) rotateY(-12deg) rotateX(4deg)}
    .dim{position:absolute;right:${big ? 60 : 20}px;bottom:${big ? 40 : 18}px;font:600 ${big ? 13 : 9}px ui-monospace,Menlo,monospace;color:#FFC46B}
  </style></head><body><div class="grid"></div>
    <img class="shot" src="${b64(shots[0])}">
    <div class="copy"><div class="brand"><img src="${icon}">Swarmline</div>
      <p>A swarm draws any web page as a blueprint.</p>
      <div class="k">Outline · Measure · Reveal</div></div>
  </body></html>`;
  for (const [w, h, big, file] of [[440, 280, false, "promo-440x280.png"], [1400, 560, true, "marquee-1400x560.png"]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(tile(w, h, big), { waitUntil: "load" });
    await sleep(200);
    await page.screenshot({ path: path.join(root, "store", file) });
  }
  console.log("promo tiles done");
} finally {
  await browser.close();
}
