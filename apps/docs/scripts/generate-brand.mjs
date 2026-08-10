// Regenerates every brand raster from the single mark source (scripts/mark.mjs):
//
//   node scripts/generate-brand.mjs
//
//   apps/docs/favicon.png            transparent mark (browser tab)
//   apps/docs/public/logo.png        transparent mark (header + hero)
//   icon.png (repo root)             mark on a dark tile (NuGet / Marketplace)
//   apps/docs/public/opengraph-image.png   branded homepage OG card (1200x630)
//   apps/docs/public/social/*.png          branded page-specific OG cards (1200x630)
//
// The committed PNGs mean the docs build needs no rendering step or fonts on CI.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import matter from "gray-matter";
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
// Composite the tight-cropped mark dead-center so the bars fill the tile
// confidently (~62%) instead of floating small inside it.
const TILE = 512;
const RADIUS = 114;
const tileBg = `<svg width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}" xmlns="http://www.w3.org/2000/svg">
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
</svg>`;
const tileMark = await toPng(markSvg(352));
await writeFile(
  resolve(repoRoot, "icon.png"),
  await sharp(await toPng(tileBg))
    .composite([{ input: tileMark, gravity: "center" }])
    .png()
    .toBuffer(),
);

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

const findContentFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? findContentFiles(path)
        : entry.isFile() && /\.mdx?$/.test(entry.name)
          ? [path]
          : [];
    }),
  );
  return nested.flat();
};

const wrapText = (value, maxCharacters, maxLines) => {
  const words = value.trim().split(/\s+/);
  const lines = [];
  for (const word of words) {
    const line = lines.at(-1);
    if (!line || `${line} ${word}`.length > maxCharacters) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${line} ${word}`;
    }
  }
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
  return visible;
};

const socialRoot = resolve(docsRoot, "public/social");
const docsCards = [];
for (const source of await findContentFiles(resolve(docsRoot, "docs"))) {
  const { data } = matter(await readFile(source, "utf8"));
  const image = data.seo?.image;
  if (!image) continue;
  if (typeof data.title !== "string" || typeof data.description !== "string") {
    throw new Error(`${source} needs string title and description frontmatter`);
  }
  if (typeof image !== "string" || !image.startsWith("/social/") || !image.endsWith(".png")) {
    throw new Error(`${source} has unsupported seo.image: ${String(image)}`);
  }
  const output = resolve(docsRoot, "public", image.slice(1));
  if (!output.startsWith(`${socialRoot}/`)) {
    throw new Error(`${source} resolves outside public/social`);
  }
  docsCards.push({
    title: data.title,
    description: data.description,
    output,
  });
}
docsCards.sort((a, b) => a.output.localeCompare(b.output));

const docsCardSvg = ({ title, description }) => {
  const titleSize = title.length > 23 ? 72 : 82;
  const descriptionLines = wrapText(description, 58, 3);
  const titleY = 372 - (descriptionLines.length - 1) * 16;
  const descriptionY = titleY + 60;
  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<tspan x="82" y="${descriptionY + index * 40}">${esc(line)}</tspan>`,
    )
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
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
    <text x="80" y="${titleY}" font-family="${font}" font-size="${titleSize}" font-weight="800" fill="#FFFFFF">${esc(title)}</text>
    <text font-family="${font}" font-size="32" font-weight="400" fill="#A7ADC0">${descriptionSvg}</text>
    <text x="82" y="566" font-family="${font}" font-size="26" font-weight="500" fill="#6E7789">${esc(url)}</text>
  </svg>`;
};

for (const card of docsCards) {
  await mkdir(dirname(card.output), { recursive: true });
  await sharp(Buffer.from(docsCardSvg(card))).png().toFile(card.output);
}

console.log(`regenerated brand assets and ${docsCards.length} page-specific OG cards`);
