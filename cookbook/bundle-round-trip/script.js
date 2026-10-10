// ═══ Postext Cookbook · Nº 041 · .postext round trip in two languages ════════════
// https://postext.dev/en/cookbook/bundle-round-trip
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: DM Sans, DM Serif Display, Instrument Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { createBundle, openBundle, loadBundleFonts, registerBundleImages, buildBundle,
  bundleFontProvider, bundleResourceBytes, defaultResourceTypes, renderPageToCanvas }
  from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bundle-round-trip';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#172130', muted: '#56606c', // text; the colophon
  estuary: '#25476a', mud: '#8a6f4d', // the one accent; the wheel's wood in the drawings
  sand: '#e9dcc4', foam: '#eef2f3', rule: '#c4ced6', paper: '#ffffff' };
// The hex rides along: design elements read it, not the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the estuary blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.estuary })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['DM Sans', 'DM Serif Display', 'Instrument Sans'];
const PAGE = { w: 99, h: 210, top: 12, bottom: 13, side: 10 }; // mm: a DL leaflet, both sides
const [BODY, LEAD] = [9.4, 13.4]; // pt
const WATER = 98; // mm from the top of the cover: where the sand ends and the estuary begins

// #region cover: the front of the leaflet, a heading drawn over one picture
const at = (x, y, width, edge = 'top-left') => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) }, size: { width: mm(width) } });
const text = (id, content, family, size, placement, look) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('estuary'), overflow: 'wrap', // gotcha:
  placement, ...look }); // overflow-ellipsis-default
const caps = { fontFamily: LABEL, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: pt(1.15) };
const [MEASURE, EDGE] = [PAGE.w - 2 * PAGE.side, 17]; // mm; EDGE: trim to kicker and facts
const cover = { id: 'cover', advancedDesign: { enabled: true, slot: { elements: [
  { kind: 'image', id: 'art', resourceId: 'cover', placement: { anchor: { to: 'page',
    edge: 'top-left' }, size: { width: mm(PAGE.w), height: mm(PAGE.h) } } },
  text('kicker', '{attr.kicker}', LABEL, 7.5, at(PAGE.side, EDGE, MEASURE), caps),
  // The language tab: the edition's code on a blue flap hanging from the top edge.
  text('edition', '{attr.edition}', LABEL, 8, { anchor: { to: 'page', edge: 'top-right' },
    offset: { x: mm(-PAGE.side) } }, { ...caps, color: col('foam'), box: {
    backgroundColor: col('estuary'), padding: { top: mm(8), right: mm(2.4), bottom: mm(2.2),
      left: mm(2.4) } } }),
  text('title', '{titleText}', DISPLAY, 50, at(PAGE.side - 0.8, 25, MEASURE + 2),
    { italic: true, lineHeight: 0.96 }), // a multiple (gotcha: design-lineheight-multiple)
  text('lead', '{attr.lead}', TEXT, 11, at(PAGE.side + 2, WATER + 50, MEASURE - 4),
    { color: col('foam'), italic: true, lineHeight: 1.4 }),
  text('facts', '{attr.facts}', LABEL, 7.5, at(PAGE.side, -EDGE, MEASURE, 'bottom-left'),
    { ...caps, color: col('sand') }),
] } } };
// #endregion

const config = () => ({
  // #region labels: the edition's language, written into the file with the rest of the config
  // Hyphenation patterns and the PDF's /Lang, by exact code (gotcha: hyphenation-locales).
  locale: t({ en: 'en-us', es: 'es' }),
  // Figura and Tabla travel inside the Spanish file. Left out, they follow whoever opens it:
  // the Sandbox at /en/sandbox prints Figure 1.1 (gotcha: bundle-labels-reader-locale).
  // '{n}' numbers them 1, 2, 3: a leaflet has no chapters to number its figures by.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}' })),
  // #endregion
  colorPalette, customFonts,
  page: { sizePreset: 'custom', width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150,
    margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.side),
      right: mm(PAGE.side) } }, // a flyer printed both sides: nothing to mirror
  layout: { layoutType: 'single', inlineResourceGap: 'above' }, // no line under the figures
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4),
    indentAfterHeading: false, minWordSpacing: 0.75, maxWordSpacing: 1.6 },
  headings: { fontFamily: DISPLAY, fontWeight: 400, levels: [ // in main-color: the estuary
    // The H1 break, restated (gotcha: headings-drop-h1-break). In the column, the cover design
    // is cut at the text block's top and bottom edges; span: 'page' paints it from the trim.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(15), lineHeight: pt(LEAD * 1.25), marginTop: pt(LEAD * 0.5),
      marginBottom: pt(LEAD * 0.25) },
  ] },
  headingStyles: [cover],
  captionStyle: { fontFamily: LABEL, fontSize: pt(7.8), labelColor: col('estuary'), gap: mm(1.8) },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('estuary'), headerColor: col('paper'), headerFontFamily: LABEL,
    headerFontSize: pt(7.6), bodyFontSize: pt(8.2), cellPadding: mm(1.3) },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(6.6), lineHeight: pt(8.8),
    color: col('muted'), textAlign: 'left', firstLineIndent: mm(0), marginTop: pt(LEAD) }],
  header: { elements: [] },
  // The back's foot: a strip of estuary with the publisher, the frontmatter's author.
  footer: { elements: [
    { kind: 'box', id: 'strip', pages: 'body', style: { backgroundColor: col('estuary') },
      placement: { anchor: { to: 'page', edge: 'bottom-left' },
        size: { width: 'fill', height: mm(7) } } },
    text('foot', '{author}', LABEL, 7.5, { anchor: { to: 'page', edge: 'bottom-left' },
      offset: { x: mm(PAGE.side), y: mm(-2.4) } }, { ...caps, color: col('foam'),
      pages: 'body', overflow: 'clip' }),
  ] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the cover's wheel in the estuary, and the mill in section
// No words in the drawings: an SVG drawn as an image cannot use web fonts (gotcha:
// svg-no-webfonts). Every length is in millimetres of the printed page.
const SECTION = { w: 79, h: 35 }; // the mill in section, as wide as the text
const n = (v) => +v.toFixed(2);
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d, color, width, extra = '') => path(d, 'none', ` stroke="${color}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}`);
const group = (x, y, turn, body) => `<g transform="translate(${n(x)} ${n(y)}) `
  + `rotate(${n(turn)})">${body}</g>`;
// A wave line across the page: cubic arcs of wavelength `len`, `amp` high.
const wave = (y, len, amp, phase, width) => {
  let d = `M${n(-phase)} ${n(y)}`;
  for (let x = -phase; x < width + len; x += len) {
    const [q, h] = [x + len / 4, x + 3 * len / 4];
    d += `C${n(q)} ${n(y - amp)} ${n(q)} ${n(y - amp)} ${n(x + len / 2)} ${n(y)}`
      + `C${n(h)} ${n(y + amp)} ${n(h)} ${n(y + amp)} ${n(x + len)} ${n(y)}`;
  }
  return d;
};
// The wheel: a hub and eighteen blades, each a spoon on a spoke, the spoon bent back against
// the turn; the square end of the shaft at the centre.
function wheel(cx, cy, r, color, extra = '') {
  const spoke = `M${n(r * 0.28)} ${n(-r * 0.018)}H${n(r * 0.54)}V${n(r * 0.018)}H${n(r * 0.28)}Z`;
  const spoon = `M0 0C${n(r * 0.1)} ${n(-r * 0.08)} ${n(r * 0.36)} ${n(-r * 0.12)} ${n(r * 0.46)} `
    + `${n(-r * 0.05)}C${n(r * 0.5)} ${n(-r * 0.01)} ${n(r * 0.44)} ${n(r * 0.06)} ${n(r * 0.3)} `
    + `${n(r * 0.06)}C${n(r * 0.18)} ${n(r * 0.06)} ${n(r * 0.06)} ${n(r * 0.03)} 0 0Z`;
  const blade = path(spoke, color) + group(r * 0.52, 0, -16, path(spoon, color));
  let out = '';
  for (let i = 0; i < 18; i++) out += group(cx, cy, i * 20, blade);
  const ring = ` stroke="${palette.sand}" stroke-width="${n(r * 0.03)}"`;
  return `<g${extra}>${out}${circle(cx, cy, r * 0.31, color)}`
    + `${circle(cx, cy, r * 0.22, 'none', ring)}`
    + `<rect x="${n(cx - r * 0.06)}" y="${n(cy - r * 0.06)}" width="${n(r * 0.12)}" `
    + `height="${n(r * 0.12)}" fill="${palette.sand}"/></g>`;
}
function coverArt() {
  const [cx, r] = [PAGE.w / 2, 37];
  let body = `<rect width="${PAGE.w}" height="${WATER}" fill="${palette.sand}"/>`;
  // The mud flat the ebb leaves: three bands above the waterline, darker towards the water.
  for (const [y, h, o] of [[WATER - 15, 3, 0.1], [WATER - 10, 4, 0.16], [WATER - 5, 5, 0.24]]) {
    body += `<rect y="${y}" width="${PAGE.w}" height="${h}" fill="${palette.mud}" `
      + `fill-opacity="${o}"/>`;
  }
  body += wheel(cx, WATER, r, palette.estuary);
  body += `<rect y="${WATER}" width="${PAGE.w}" height="${PAGE.h - WATER}" `
    + `fill="${palette.estuary}"/>`;
  // Under the water the wheel shows as a pale ghost: the same drawing, clipped to the water.
  body += `<clipPath id="under"><rect y="${WATER}" width="${PAGE.w}" height="${PAGE.h}"/>`
    + `</clipPath>${wheel(cx, WATER, r, palette.foam, ' clip-path="url(#under)" opacity=".2"')}`;
  for (const [dy, phase, o] of [[3, 0, 0.5], [10, 4, 0.3], [18, 8, 0.2], [28, 2, 0.12]]) {
    body += line(wave(WATER + dy, 11, 0.9, phase, PAGE.w), palette.foam, 0.7,
      ` stroke-opacity="${o}"`);
  }
  return svgDoc(PAGE.w, PAGE.h, body);
}
// A level mark: the surveyor's triangle standing on a water surface.
const level = (x, y, fill) => path(`M${n(x - 1.4)} ${n(y - 2.2)}H${n(x + 1.4)}L${n(x)} ${n(y)}Z`,
  fill, fill === 'none' ? ` stroke="${palette.estuary}" stroke-width=".3"` : '');
const arrow = (d, tip, turn, color) => line(d, color, 0.55)
  + group(...tip, turn, line('M-1.6-1L0 0-1.6 1', color, 0.55));
function sectionArt() {
  const { w, h } = SECTION;
  const [HIGH, LOW, FLOOR, WHEEL] = [10, 26.5, 15.5, 27]; // mm: levels, floor and wheel heights
  const P = palette;
  let b = '';
  // Water first: the pond held at high tide, the estuary fallen to low water.
  b += path(`M0 ${HIGH}H31V33H0Z`, P.estuary);
  b += path(`M52 ${LOW}H${w}V${h}H52Z`, P.estuary);
  b += line(`M52 ${HIGH}H${w - 1}`, P.estuary, 0.35, ' stroke-dasharray="1.4 1"');
  // The ground: the pond's bed and the estuary's mud bank.
  b += path(`M0 33L31 32V${h}H0Z`, P.mud);
  b += path(`M52 32.5L${w} 34V${h}H52Z`, P.mud);
  // The dam and the mill house on it, in sand with a mud outline; the roof in mud.
  const stroke = ` stroke="${P.mud}" stroke-width=".45"`;
  b += path(`M30 ${h}V5.6H54V${h}Z`, P.sand, stroke);
  b += path('M28.5 6L42 0.4L55.5 6Z', P.mud);
  // The wheel pit: a vaulted opening through the dam, with the ebb running out of it.
  b += path(`M33.5 ${h}V25A8 8 0 0 1 49.5 25V${h}Z`, P.paper, stroke);
  b += path('M33.5 30.5H55V33.5H33.5Z', P.estuary);
  // The chute from the pond onto the wheel, and the gate lifted above its mouth.
  b += path(`M30 22L36.4 ${WHEEL - 1.2}`, 'none', ` stroke="${P.estuary}" stroke-width="1.8"`);
  b += `<rect x="29.2" y="16.8" width="1.6" height="4" fill="${P.ink}"/>`;
  // The horizontal wheel, and its shaft up through the floor to the runner stone.
  b += line(`M41.5 ${FLOOR}V${WHEEL + 1}`, P.ink, 0.6);
  b += `<rect x="35.8" y="${WHEEL - 0.8}" width="11.4" height="1.6" rx=".5" fill="${P.mud}"/>`;
  for (let x = 36.6; x < 47; x += 1.6) {
    b += line(`M${n(x)} ${WHEEL - 1.4}V${WHEEL + 1.2}`, P.mud, 0.45); // the blades, edge-on
  }
  // The milling floor, the runner stone on the bed stone, and the hopper above them.
  b += line(`M31 ${FLOOR}H53`, P.mud, 0.45);
  const stone = (x, y, sw) => `<rect x="${x}" y="${n(y)}" width="${sw}" height="1.6" `
    + `fill="${P.rule}" stroke="${P.ink}" stroke-width=".3"/>`;
  b += stone(36.5, FLOOR - 3.2, 10) + stone(36, FLOOR - 1.6, 11);
  b += path(`M38.6 8H44.4L42.6 ${FLOOR - 4.2}H40.4Z`, P.mud);
  // Level marks, and the way the water goes.
  b += level(6, HIGH, P.estuary) + level(73, LOW, P.estuary) + level(73, HIGH, 'none');
  b += arrow('M9 27C16 26 22 24.4 27.4 23', [27.4, 23], -15, P.foam);
  b += arrow('M50.5 32H63', [63, 32], 0, P.foam);
  return svgDoc(w, h, b);
}
// fileId → markup: the files the resources below name.
const drawings = { 'cover.svg': coverArt(), 'mill.svg': sectionArt() };
// #endregion

// #region resources: the drawings name their files by fileId; the table carries its own data
const svg = (id, w, h, altText, extra) => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0,
  updatedAt: 0, altText, svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, ...extra });
const row = (...cells) => cells.map((content) => ({ content }));
const head = (...cells) => cells.map((content) => ({ content, isHeader: true }));
const resources = [
  svg('cover', PAGE.w, PAGE.h, t({ en: 'A mill wheel on the waterline, its lower half pale '
    + 'under the estuary', es: 'Una rueda de molino en la línea del agua, con la mitad '
    + 'inferior pálida bajo la ría' })),
  svg('mill', SECTION.w, SECTION.h, t({
    en: 'The mill in section: the pond at high level on the left, the mill house on the dam '
      + 'with its millstones, the horizontal wheel in the vaulted pit, and the estuary on the '
      + 'right below a dashed high-water line',
    es: 'El molino en sección: el estanque a nivel alto a la izquierda, la casa del molino sobre '
      + 'la presa con sus muelas, el rodezno en el cárcavo abovedado y la ría a la derecha, bajo '
      + 'una línea discontinua de pleamar' }), {
    placement: { position: 'here' },
    caption: t({ en: 'Two hours after high water: the pond turns the wheel, and the estuary '
      + 'has fallen below the dashed line.',
    es: 'Dos horas tras la pleamar: el estanque mueve el rodezno y la ría ha quedado por debajo '
      + 'de la línea discontinua.' }) }),
  { id: 'hours', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' },
    caption: t({ en: 'Opening hours. Last entry 45 minutes before closing.',
      es: 'Horario. Última entrada 45 minutos antes del cierre.' }),
    table: { model: { headerRowCount: 1, columnWidths: [1.55, 0.9, 1.55], rows: t({
      en: [head('Season', 'Days', 'Hours'),
        row('April–June', 'Tue–Sun', '10:00–14:00, 16:00–19:00'),
        row('July–August', 'Mon–Sun', '10:00–20:00'),
        row('September–March', 'Fri–Sun', '10:30–14:30')],
      es: [head('Temporada', 'Días', 'Horario'),
        row('Abril–junio', 'Mar.–dom.', '10:00–14:00 y 16:00–19:00'),
        row('Julio–agosto', 'Lun.–dom.', '10:00–20:00'),
        row('Septiembre–marzo', 'Vie.–dom.', '10:30–14:30')] }) } } },
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages use. They travel inside the bundle, so the reader loads them from
// there, before the layout.
const FONTS = { 'DM Sans': ['400', '400i', '700'], 'DM Serif Display': ['400', '400i'],
  'Instrument Sans': ['400', '700'] };

// #region faces: FONTS as customFonts, each face a woff2 file named by its fileId
const customFonts = Object.entries(FONTS).map(([name, specs]) => ({ name,
  variants: specs.map((spec) => ({ weight: parseInt(spec, 10), format: 'woff2',
    style: spec.endsWith('i') ? 'italic' : 'normal', fileId: `${fontsourceId(name)}-${spec}` })),
}));
// The bytes: Fontsource's static woff2 files, latin subset, which covers the Spanish text too.
const faceFiles = Object.fromEntries(await Promise.all(customFonts.flatMap(({ name, variants }) =>
  variants.map(async ({ weight, style, fileId }) => {
    const id = fontsourceId(name);
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/`
      + `${id}-latin-${weight}-${style}.woff2`);
    if (!res.ok) throw new Error(`Fontsource has no ${name} ${weight} ${style}`);
    return [fileId, new Uint8Array(await res.arrayBuffer())];
  }))));
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region answer: write this edition to a .postext file, then lay it out from those bytes alone
// The writer: text, design, resources and every file they name, zipped. createBundle looks
// up each fileId (a drawing's svg.fileId, a face's variant fileId) in `files`.
const { bytes, warnings } = await createBundle({
  name: t({ en: 'The Tide Mill of Arenal', es: 'El molino de mareas de Arenal' }),
  locale: LANG, // one language per bundle: createBundle 1.4.1 writes no translations
  markdown, config: config(), resources,
  files: { ...drawings, ...faceFiles },
  thumbnail: { data: drawings['cover.svg'], mime: 'image/svg+xml' }, // the book's picture
});
if (warnings.length) console.warn(warnings); // what was left out, and why

// The reader has nothing but the bytes. Each fileId is now the file's path inside the zip:
// mill.svg is resources/mill.svg, and the faces sit under fonts/.
const bundle = await openBundle(bytes);
await loadBundleFonts(bundle); // one FontFace per face from the file, in place of loadFonts()
await registerBundleImages(bundle); // the drawings, for the canvas
const docs = buildBundle(bundle); // one VDTDocument per chapter: a leaflet has one
// #endregion
showPages(docs, { title: t({ en: 'The Tide Mill · English edition',
  es: 'El molino de mareas · edición en español' }) });

// #region handoff: the same bytes as a download for the Sandbox, and a PDF from the bundle
const file = `tide-mill-${LANG}.postext`;
document.getElementById('pt-actions').append(Object.assign(document.createElement('a'), {
  href: URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), download: file,
  textContent: `Download ${file} · ${Math.round(bytes.length / 1024)} KB` }));
// The PDF embeds the faces the bundle carries, and draws the figures from its files.
offerPdf(() => renderToPdf(docs, {
  fontProvider: bundleFontProvider(bundle, { decodeWoff2: decompressWoff2 }),
  resourceBytes: bundleResourceBytes(bundle),
}), `${RECIPE}-${LANG}.pdf`);
// #endregion

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
