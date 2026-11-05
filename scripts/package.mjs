// Builds the Chrome Web Store upload: dist/swarmline-<version>.zip
// (manifest.json at the zip root; only the files the extension ships).
// Uses Node built-ins only.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));
const files = ["manifest.json", "background.js", "swarmline.js", "settle.js", ...["16", "32", "48", "128"].map((n) => `icons/icon${n}.png`)];
for (const f of files) if (!fs.existsSync(path.join(src, f))) throw new Error(`missing ${f} (run npm run assets for icons)`);

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const local = [];
const central = [];
let offset = 0;
const stamp = { time: 0, date: (2026 - 1980) << 9 | 1 << 5 | 1 }; // fixed date: reproducible zips
for (const name of files) {
  const data = fs.readFileSync(path.join(src, name));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBuf = Buffer.from(name);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0, 6);
  h.writeUInt16LE(8, 8);
  h.writeUInt16LE(stamp.time, 10);
  h.writeUInt16LE(stamp.date, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(deflated.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  h.writeUInt16LE(0, 28);
  local.push(h, nameBuf, deflated);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0, 8);
  c.writeUInt16LE(8, 10);
  c.writeUInt16LE(stamp.time, 12);
  c.writeUInt16LE(stamp.date, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(deflated.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(nameBuf.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += h.length + nameBuf.length + deflated.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", `swarmline-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...local, cd, end]));
console.log(`Built ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
for (const f of files) console.log("  " + f);
