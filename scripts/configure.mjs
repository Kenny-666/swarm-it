// npm run configure -- --email you@example.com [--store-url https://chromewebstore.google.com/detail/...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "site.config.json");
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--email") cfg.supportEmail = args[++i];
  else if (args[i] === "--store-url") cfg.storeUrl = args[++i];
}
if (cfg.supportEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.supportEmail)) throw new Error("That email doesn't look right: " + cfg.supportEmail);
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log("site.config.json:", cfg);
