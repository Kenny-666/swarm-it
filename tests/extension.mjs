// Extension test: load the real unpacked extension, trigger it the way a toolbar click
// does, and check that background.js reaches settle.js in the page's world.
//
//   node tests/extension.mjs https://cenovabuild.com/
//
// A toolbar click grants activeTab; automation can't click the toolbar, so the test loads
// a temporary copy of the extension that also has <all_urls> host access. The real
// manifest is not changed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "demo/index.html";
const url = /^https?:/.test(arg) ? arg : pathToFileURL(path.resolve(root, arg)).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swarmline-ext-"));
fs.cpSync(path.join(root, "extension"), tmp, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(tmp, "manifest.json"), "utf8"));
mf.host_permissions = ["<all_urls>"];
fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(mf, null, 2));

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  enableExtensions: true,
  pipe: true,
  defaultViewport: { width: 1440, height: 900 },
  args: ["--enable-unsafe-swiftshader", "--hide-scrollbars", "--allow-file-access-from-files"],
});
let ok;
try {
  const id = await browser.installExtension(tmp);
  console.log("extension", id, "version", mf.version);
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => /swarmline/.test(m.text()) && logs.push(m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  let lastNav = Date.now();
  page.on("framenavigated", (f) => f === page.mainFrame() && (lastNav = Date.now()));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  // some sites reload themselves once after the first load (cenovabuild.com does, ~3.5s in)
  while (Date.now() - lastNav < 4000) await sleep(250);
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => {});
  await sleep(1500);

  const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith(`chrome-extension://${id}/`), { timeout: 20000 });
  const sw = await swTarget.worker();
  // what a toolbar click does: background.js draft(tab) for the active tab
  const pageUrl = page.url();
  const fired = await sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === u) || tabs.find((t) => t.active);
    if (!tab) return { error: "no tab", urls: tabs.map((t) => t.url) };
    await chrome.tabs.update(tab.id, { active: true });
    await draft(tab); // eslint-disable-line no-undef
    const badge = await chrome.action.getBadgeText({ tabId: tab.id });
    return { tab: tab.url, badge };
  }, pageUrl);
  console.log("triggered", fired);

  // the swarm lives in the content script's isolated world: watch it through the DOM
  await page.waitForFunction(() => !!document.querySelector("swarmline-layer"), { timeout: 20000 });
  // settle.js runs in the page world and leaves its marker behind
  const settled = await page.waitForFunction(() => typeof window.__swarmSettle === "function", { timeout: 20000 }).then(() => true, () => false);
  await sleep(4000);
  const state = await page.evaluate(() => ({
    overlay: !!document.querySelector("swarmline-layer"),
    shadowHidden: document.querySelector("swarmline-layer").shadowRoot === null, // closed root
    markersLeft: document.querySelectorAll("[data-swarm-anim]").length, // cleaned up after capture
  }));
  console.log("settle.js reached the page world:", settled);
  console.log(state);
  console.log("logs", logs.slice(0, 8));
  ok = settled && state.overlay && state.shadowHidden && state.markersLeft === 0 && !logs.some((l) => /pageerror|failed/.test(l));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
