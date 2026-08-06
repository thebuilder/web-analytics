// Regenerates every brand raster from the single mark source (scripts/mark.mjs):
//
//   node scripts/generate-brand.mjs
//
//   apps/docs/favicon.png            transparent mark (browser tab)
//   apps/docs/public/logo.png        transparent mark (header + hero)
//   icon.png (repo root)             mark on a dark tile (NuGet / Marketplace)
//   apps/docs/public/opengraph-image.png   branded OG card (1200x630)
//
// The committed PNGs mean the docs build needs no rendering step or fonts on CI.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { MARK_RECTS, markSvg, markGroup } from "./mark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, "..");
const repoRoot = resolve(docsRoot, "../..");
const toPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// 1. Transparent mark -> favicon + header/hero logo.
const transparent = await toPng(markSvg(256));
await writeFile(resolve(docsRoot, "favicon.png"), transparent);
await writeFile(resolve(docsRoot, "public/logo.png"), transparent);

// 2. Mark on a dark rounded tile -> NuGet / Umbraco Marketplace package icon.
const TILE = 512;
const RADIUS = 114;
const G = 360; // mark size within the tile
const inset = Math.round((TILE - G) / 2);
const tileSvg = `<svg width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15152e"/><stop offset="1" stop-color="#08080f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.02" r="0.9">
      <stop offset="0" stop-color="#6d5ef7" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#3b82f6" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${TILE}" height="${TILE}" rx="${RADIUS}" fill="url(#bg)"/>
  <rect width="${TILE}" height="${TILE}" rx="${RADIUS}" fill="url(#glow)"/>
  ${markGroup(inset, inset, G / 100)}
</svg>`;
await writeFile(resolve(repoRoot, "icon.png"), await toPng(tileSvg));

// 3. Branded Open Graph card (1200x630).
const W = 1200;
const H = 630;
const font = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const title = "Web Analytics";
const tagline = [
  "Vercel Web Analytics and Plausible reports,",
  "right inside the Umbraco backoffice.",
];
const url = "umbraco-web-analytics.vercel.app";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const markPx = 150;
const ogSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C0C16"/><stop offset="1" stop-color="#060609"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.24" cy="-0.05" r="0.85">
      <stop offset="0" stop-color="#7C6BF7" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="#3B82F6" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#60A5FA"/><stop offset="0.5" stop-color="#A78BFA"/><stop offset="1" stop-color="#F472B6"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="url(#accent)"/>
  ${markGroup(80, 104, markPx / 100)}
  <text x="80" y="372" font-family="${font}" font-size="90" font-weight="800" fill="#FFFFFF">${esc(title)}</text>
  <text x="82" y="432" font-family="${font}" font-size="34" font-weight="400" fill="#A7ADC0">${esc(tagline[0])}</text>
  <text x="82" y="478" font-family="${font}" font-size="34" font-weight="400" fill="#A7ADC0">${esc(tagline[1])}</text>
  <text x="82" y="566" font-family="${font}" font-size="26" font-weight="500" fill="#6E7789">${esc(url)}</text>
</svg>`;
await sharp(Buffer.from(ogSvg)).png().toFile(resolve(docsRoot, "public/opengraph-image.png"));

console.log("regenerated favicon.png, public/logo.png, icon.png, public/opengraph-image.png from the mark");
