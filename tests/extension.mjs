// Extension test: load the real unpacked extension, trigger it the way the toolbar
// button does, and check the keyboard shortcuts and the click-again toggle.
//
//   node tests/extension.mjs demo/index.html
//
// A toolbar click grants activeTab, which automation can't do, so this loads a temporary
// copy of the extension that also has <all_urls> host access. extension/ is not changed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "demo/index.html";
const url = /^https?:/.test(arg) ? arg : pathToFileURL(path.resolve(root, arg)).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swarmline-ext-"));
fs.cpSync(path.join(root, "extension"), tmp, { recursive: true });
const mf = JSON.parse(fs.readFileSync(path.join(tmp, "manifest.json"), "utf8"));
mf.host_permissions = ["<all_urls>"];
fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(mf, null, 2));

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  enableExtensions: true,
  pipe: true,
  defaultViewport: { width: 1280, height: 800 },
  args: ["--hide-scrollbars", "--allow-file-access-from-files"],
});
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail != null ? "  " + JSON.stringify(detail) : ""}`);
};
try {
  const id = await browser.installExtension(tmp);
  console.log("extension", id, mf.name, mf.version);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(800);
  const sw = await (await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().includes(id), { timeout: 20000 })).worker();
  const click = () =>
    sw.evaluate(async (u) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === u);
      await draft(tab); // eslint-disable-line no-undef
      return chrome.action.getBadgeText({ tabId: tab.id });
    }, page.url());
  const sheet = () => page.evaluate(() => !!document.querySelector("swarmline-sheet"));

  const badge = await click();
  await sleep(400);
  check("toolbar click draws the page", (await sheet()) && badge === "", { badge });
  check("overlay is closed to page scripts", await page.evaluate(() => document.querySelector("swarmline-sheet").shadowRoot === null));
  await sleep(2500);
  await page.keyboard.press("f");
  await sleep(1600);
  check("F lifts the blueprint and leaves the page usable", await page.evaluate(() => {
    const h = document.querySelector("swarmline-sheet");
    return !!h && document.elementFromPoint(640, 300) !== h;
  }));
  await page.keyboard.press("Escape");
  await sleep(600);
  check("Esc exits", !(await sheet()));
  await click();
  await sleep(600);
  await click();
  await sleep(700);
  check("clicking again toggles it off", !(await sheet()));
  check("no page errors", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
const ok = checks.length && checks.every((c) => c.ok);
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
