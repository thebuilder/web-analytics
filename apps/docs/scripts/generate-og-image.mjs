import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";
import sharp from "sharp";

import { markGroup } from "./mark.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, "..");
const width = 1200;
const height = 630;
const font = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const url = "umbraco-web-analytics.vercel.app";
const markSize = 150;
const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

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
const cards = [
  {
    output: resolve(docsRoot, "public/opengraph-image.png"),
    title: "Web Analytics",
    descriptionLines: [
      "Vercel Web Analytics and Plausible reports,",
      "right inside the Umbraco backoffice.",
    ],
    titleSize: 90,
    titleY: 372,
  },
];

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
  cards.push({ title: data.title, description: data.description, output });
}
cards.sort((a, b) => a.output.localeCompare(b.output));

const cardSvg = ({
  title,
  description,
  descriptionLines: fixedDescriptionLines,
  titleSize: fixedTitleSize,
  titleY: fixedTitleY,
}) => {
  const titleSize = fixedTitleSize ?? (title.length > 23 ? 72 : 82);
  const descriptionLines = fixedDescriptionLines ?? wrapText(description, 58, 3);
  const titleY = fixedTitleY ?? 372 - (descriptionLines.length - 1) * 16;
  const descriptionY = titleY + 60;
  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<tspan x="82" y="${descriptionY + index * 40}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
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
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
    <rect width="${width}" height="6" fill="url(#accent)"/>
    ${markGroup(80, 104, markSize / 100)}
    <text x="80" y="${titleY}" font-family="${font}" font-size="${titleSize}" font-weight="800" fill="#FFFFFF">${escapeXml(title)}</text>
    <text font-family="${font}" font-size="32" font-weight="400" fill="#A7ADC0">${descriptionSvg}</text>
    <text x="82" y="566" font-family="${font}" font-size="26" font-weight="500" fill="#6E7789">${escapeXml(url)}</text>
  </svg>`;
};

for (const card of cards) {
  await mkdir(dirname(card.output), { recursive: true });
  await sharp(Buffer.from(cardSvg(card))).png().toFile(card.output);
}

console.log(`generated ${cards.length} Open Graph images`);
