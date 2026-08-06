// Generates the branded Open Graph card for the landing page at
// public/opengraph-image.png (1200x630). Run it whenever the brand mark or the
// copy below changes:
//
//   node scripts/generate-og.mjs
//
// The output PNG is committed, so the docs build needs no rendering step and no
// fonts installed on CI. blume serves it via `ogImage="/opengraph-image.png"`
// on the home page (pages/index.astro).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const WIDTH = 1200;
const HEIGHT = 630;

// Embed the product mark so the card is self-contained.
const mark = await readFile(resolve(root, "public/web-analytics.png"));
const markUri = `data:image/png;base64,${mark.toString("base64")}`;

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const eyebrow = "UMBRACO CMS PACKAGE";
const title = "Web Analytics";
const taglineLines = [
  "Vercel Web Analytics and Plausible reports,",
  "right inside the Umbraco backoffice.",
];
const providers = "Vercel  •  Plausible";
const url = "umbraco-web-analytics.vercel.app";
const font = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C0C16"/>
      <stop offset="1" stop-color="#060609"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.24" cy="-0.05" r="0.85">
      <stop offset="0" stop-color="#7C6BF7" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="#3B82F6" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#3B82F6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#60A5FA"/>
      <stop offset="0.5" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#F472B6"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="url(#accent)"/>

  <image href="${markUri}" x="80" y="86" width="140" height="140"/>

  <text x="82" y="312" font-family="${font}" font-size="26" font-weight="600" letter-spacing="4" fill="#8A93AA">${esc(eyebrow)}</text>
  <text x="80" y="392" font-family="${font}" font-size="90" font-weight="800" fill="#FFFFFF">${esc(title)}</text>
  <text x="82" y="452" font-family="${font}" font-size="34" font-weight="400" fill="#A7ADC0">${esc(taglineLines[0])}</text>
  <text x="82" y="498" font-family="${font}" font-size="34" font-weight="400" fill="#A7ADC0">${esc(taglineLines[1])}</text>

  <text x="82" y="566" font-family="${font}" font-size="26" font-weight="600" fill="#6E7789">${esc(providers)}</text>
  <text x="${WIDTH - 80}" y="566" text-anchor="end" font-family="${font}" font-size="24" font-weight="500" fill="#5B6274">${esc(url)}</text>
</svg>`;

await mkdir(resolve(root, "public"), { recursive: true });
await sharp(Buffer.from(svg))
  .png()
  .toFile(resolve(root, "public/opengraph-image.png"));

console.log("wrote public/opengraph-image.png (1200x630)");
