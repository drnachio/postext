// ─── Kit · images v2 ── recipes with pictures · postext.dev/cookbook
/** Registers a photo or PNG for the canvas and keeps its bytes for the PDF.
 *  fetch → ImageBitmap never taints the canvas (a plain cross-origin <img> would). */
async function loadImage(fileId, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image not found (${res.status}): ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  registerResourceImage(fileId, await createImageBitmap(new Blob([bytes])));
  (loadImage.bytes ??= new Map()).set(fileId, bytes);
}

/** Registers SVG markup as a vector image, its fonts inside (inlineSvgFonts, ≥ 1.25). */
async function loadSvg(fileId, svg) {
  if (typeof inlineSvgFonts === 'function') svg = await inlineSvgFonts(svg, svgFaces);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  registerResourceImage(fileId, img);
  (loadImage.bytes ??= new Map()).set(fileId, new TextEncoder().encode(svg));
}

/** A face's Fontsource files: nearest weight; latin + what the SVG sets. */
async function svgFaces(family, weight, style, { codePoints = [] } = {}) {
  const [id, m] = [fontsourceId(family), await fontsourceMeta(family)];
  const w = m?.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a)) ?? weight;
  const s = m?.styles.includes(style) === false ? 'normal' : style;
  return Promise.all(['latin', ...kitSubsetsFor(String.fromCodePoint(...codePoints), m)].map(async (x) => new Uint8Array(
    await (await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${x}-${w}-${s}.woff2`)).arrayBuffer())));
}

/** renderToPdf({ resourceBytes: imageBytes }) */
function imageBytes(fileId) { return loadImage.bytes?.get(fileId); }

/** renderToHtml({ resourceImageUrl: imageUrl }) */
function imageUrl(fileId) {
  const bytes = imageBytes(fileId);
  if (!bytes) return undefined;
  imageUrl.urls ??= new Map();
  if (!imageUrl.urls.has(fileId)) {
    const type = /\.svg$/i.test(fileId) ? 'image/svg+xml' : /\.png$/i.test(fileId) ? 'image/png' : 'image/jpeg';
    imageUrl.urls.set(fileId, URL.createObjectURL(new Blob([bytes], { type })));
  }
  return imageUrl.urls.get(fileId);
}
