// Generates the NuGet / Umbraco Marketplace package icon at the repo root
// (icon.png, 512x512) by compositing the transparent product mark onto a dark
// rounded tile. A filled tile keeps the icon legible on the light and dark
// listing surfaces NuGet and the Marketplace render it on, unlike a bare
// transparent mark. Run after changing the mark:
//
//   node scripts/generate-icon.mjs
//
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, "..");
const repoRoot = resolve(docsRoot, "../..");

const SIZE = 512;
const RADIUS = 114; // ~22% rounded square
const MARK = 424; // mark size within the tile
const inset = Math.round((SIZE - MARK) / 2);

const tileSvg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15152E"/>
      <stop offset="1" stop-color="#08080F"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.02" r="0.9">
      <stop offset="0" stop-color="#6D5EF7" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#3B82F6" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#glow)"/>
</svg>`;

const tile = await sharp(Buffer.from(tileSvg)).png().toBuffer();

const mark = await sharp(await readFile(resolve(docsRoot, "public/web-analytics.png")))
  .resize(MARK, MARK, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const out = await sharp(tile)
  .composite([{ input: mark, top: inset, left: inset }])
  .png()
  .toBuffer();

await writeFile(resolve(repoRoot, "icon.png"), out);
console.log(`wrote icon.png (${SIZE}x${SIZE})`);
