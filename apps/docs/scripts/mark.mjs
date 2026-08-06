// Single source of truth for the Web Analytics mark: three ascending bars in the
// brand blue / purple / pink, bottom-aligned in a 100x100 viewBox with even
// padding. Every brand asset (favicon, header + hero logo, NuGet/Marketplace
// tile, OG card) is generated from this by scripts/generate-brand.mjs.
export const MARK_RECTS =
  '<rect x="14" y="52" width="18" height="34" rx="5" fill="#60a5fa"/>' +
  '<rect x="41" y="16" width="18" height="70" rx="5" fill="#a78bfa"/>' +
  '<rect x="68" y="34" width="18" height="52" rx="5" fill="#f472b6"/>';

// Standalone square SVG of the mark on a transparent background, at `size` px.
// The viewBox is cropped tight to the bars (a small even pad around their
// bounding box) so the favicon and the header logo fill their box instead of
// floating small inside 30% padding. The tile and OG frame the mark themselves.
export const markSvg = (size) =>
  `<svg width="${size}" height="${size}" viewBox="10 11 80 80" xmlns="http://www.w3.org/2000/svg">${MARK_RECTS}</svg>`;

// The mark placed at a given offset/scale, for compositing into a larger SVG.
export const markGroup = (x, y, scale) =>
  `<g transform="translate(${x},${y}) scale(${scale})">${MARK_RECTS}</g>`;
