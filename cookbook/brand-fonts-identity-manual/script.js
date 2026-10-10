// ═══ Postext Cookbook · Nº 040 · Brand fonts in layout, PDF and bundle ════════════
// https://postext.dev/en/cookbook/brand-fonts-identity-manual
// Code: MIT · Text and drawings: original (CC BY 4.0) · Metro de Alba is a fictional network
// Fonts: Public Sans, Big Shoulders Display, Spline Sans Mono (OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, registerResourceImage, defaultResourceTypes, setCellBackground,
  createBundle,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'brand-fonts-identity-manual';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: the brand's font files, fetched once for the layout, the PDF and the bundle
// Your licensed files, one per face in FONTS. Fontsource's copies stand in for them here:
// point FONT_URL at your own server (same origin, or one that lets this page in by CORS).
const slug = (family) => family.toLowerCase().replaceAll(' ', '-');
const FONT_URL = ({ family, weight, style }) => `https://cdn.jsdelivr.net/npm/@fontsource/`
  + `${slug(family)}@5/files/${slug(family)}-latin-${weight}-${style}.woff2`;
const brandFaces = () => Object.entries(FONTS).flatMap(([family, specs]) => specs.map((spec) => {
  const weight = parseInt(spec, 10), style = spec.endsWith('i') ? 'italic' : 'normal';
  return { family, weight, style, fileId: `${slug(family)}-${weight}-${style}.woff2` };
}));
const fontFiles = new Map(); // fileId → the WOFF2 bytes, fetched once

// 1 · Layout measures with document.fonts: register every face before the first build.
async function loadBrandFonts() {
  await Promise.all(brandFaces().map(async ({ family, weight, style, fileId }) => {
    const res = await fetch(FONT_URL({ family, weight, style }));
    if (!res.ok) throw new Error(`No file for ${family} ${weight} ${style}`);
    fontFiles.set(fileId, new Uint8Array(await res.arrayBuffer()));
    const face = new FontFace(family, fontFiles.get(fileId), { weight: `${weight}`, style });
    document.fonts.add(await face.load());
  }));
}

// 2 · The PDF embeds the same bytes as TrueType. It also asks for faces no text uses (the
// display face's italic, the monospace's SemiBold): answer with the family's closest file.
// 1.4.1 writes an unused copy of that file for each of them (gotcha: pdf-font-copies).
async function brandFontProvider(family, weight, style) {
  const cost = (f) => (f.style === style ? 0 : 1000) + Math.abs(f.weight - weight);
  const own = brandFaces().filter((f) => f.family === family);
  if (!own.length) throw new Error(`${family} is not one of the brand's fonts`);
  return decompressWoff2(fontFiles.get(own.reduce((a, b) => (cost(b) < cost(a) ? b : a)).fileId));
}

// 3 · The bundle: customFonts names each face's file by its fileId; createBundle packs the bytes
// of every family it may hand on. Layout never reads it (gotcha: custom-fonts-declarative).
const customFonts = () => Object.keys(FONTS).map((name) => ({
  name, redistributable: name !== DISPLAY, // the display face reaches suppliers another way
  variants: brandFaces().filter((f) => f.family === name)
    .map(({ weight, style, fileId }) => ({ weight, style, fileId, format: 'woff2' })),
}));
// #endregion

const TEXT = 'Public Sans', DISPLAY = 'Big Shoulders Display', MONO = 'Spline Sans Mono';

// #region colours: the colour system, from which the palette and Table 1.1 are both built
const COLOURS = [ // id, name, screen, print (coated stock)
  ['line-1', 'Line 1 · Tile red', '#e4572e', '0 75 85 0'],
  ['line-2', 'Line 2 · Harbour teal', '#17bebb', '75 0 32 0'],
  ['line-3', 'Line 3 · Broom yellow', '#ffc914', '0 22 95 0'],
  ['line-4', 'Line 4 · Heather', '#6c4f9e', '65 75 0 0'],
  ['line-5', 'Line 5 · Pine', '#3f9b4a', '76 12 90 2'],
  ['signal-red', 'Signal red', '#c0391b', '10 88 100 2'],
  ['signal-green', 'Signal green', '#2b7d3c', '84 25 95 10'],
  ['ink', 'Ink', '#1f2124', '72 62 55 78'],
  ['rule', 'Rule grey', '#d9d9d4', '14 10 14 0'],
];
const palette = { ...Object.fromEntries(COLOURS.map(([id, , hex]) => [id, hex])),
  paper: '#ffffff', section: '#e4572e' }; // section: the line colour of the current section
// col() writes the hex too: 1.4.1 designs read it, not the link (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [...Object.entries(palette), ['main-color', palette.ink]]
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const swatchTable = () => COLOURS.reduce( // an empty first cell, filled with the colour itself
  (model, [id], i) => setCellBackground(model, { row: i + 1, col: 0 }, col(id)),
  { headerRowCount: 1, columnWidths: [22, 34, 14, 15, 15], rows: [
    ['COLOUR', 'NAME', 'HEX', 'RGB', 'CMYK'].map((content) => ({ content, isHeader: true })),
    ...COLOURS.map(([, name, hex, cmyk]) =>
      ['', name, hex.toUpperCase(), rgb(hex), cmyk].map((content) => ({ content }))),
  ] });
// #endregion

const PAGE = { width: 210, height: 280 }; // mm
const MARGIN = { top: 24, bottom: 22, inner: 18, outer: 18 };
const GUTTER = 8, COL = (PAGE.width - MARGIN.inner - MARGIN.outer - GUTTER) / 2; // 83 mm
const BAND = 13, LEAD = 14; // mm: the ink band at the head of each page; pt: the leading

// #region sections: a giant zero-padded number in the section's line colour
// Texts wrap (gotcha: overflow-ellipsis-default); lineHeight is a multiple (gotcha:
// design-lineheight-multiple). The body starts ten grid lines down, in both columns.
const opener = { enabled: true, minHeight: pt(10 * LEAD), slot: { elements: [
  { kind: 'text', id: 'number', content: '{number}', fontFamily: DISPLAY, fontWeight: 800,
    fontSize: pt(130), lineHeight: 1, color: col('section'), align: 'left', overflow: 'wrap',
    // Nudged by eye on the capture: the cap tops of number and title on one line.
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(-1.5), y: mm(1.3) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontWeight: 800,
    fontSize: pt(34), lineHeight: 1, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(COL + GUTTER), y: mm(1) }, size: { width: mm(COL) } } },
  { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: TEXT, fontSize: pt(12.5),
    lineHeight: 1.36, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(3) },
      size: { width: mm(COL) } } },
] } };
// Each section sets `section` to its line's colour; the number and the head square use it.
const section = (id) => ({ id, palette: { section: palette[id] } });
// #endregion

// Running heads: an ink band across the head of the page, as on the platform signs.
const PT = 25.4 / 72; // mm in a point
const HEAD = 7.5, SQUARE = 4.5, STEP = 8; // pt: head size; mm: the square, and the spacing
const label = (size, colour) => ({ fontFamily: TEXT, fontSize: pt(size), fontWeight: 600,
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase', color: col(colour) });
const inBand = (edge, x, height) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm((BAND - height) / 2) } }); // centred in the band
const head = (id, content, parity, edge, x) => ({ kind: 'text', id, content, parity,
  lineHeight: 1, ...label(HEAD, 'paper'), placement: inBand(edge, x, HEAD * PT) });
const square = (id, parity, edge, x) => ({ kind: 'box', id, parity,
  style: { backgroundColor: col('section') }, // the section's line, as on its signs
  placement: { ...inBand(edge, x, SQUARE), size: { width: mm(SQUARE), height: mm(SQUARE) } } });
const header = { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('ink') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND) } } },
  square('verso-line', 'even', 'top-left', MARGIN.outer),
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer + STEP),
  head('verso-title', '{title} · {subtitle}', 'even', 'top-left', MARGIN.outer + 2 * STEP),
  square('recto-line', 'odd', 'top-right', -MARGIN.outer),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -(MARGIN.outer + STEP)),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 2 * STEP)),
] };

// The cover: the network drawing fills the page; the heading and frontmatter give the texts.
const coverText = (id, content, placement, style) => ({ kind: 'text', id, content, placement,
  overflow: 'wrap', align: 'left', ...style });
const under = (id, gap) => ({ anchor: { to: `#${id}`, edge: 'below' }, offset: { y: mm(gap) },
  size: { width: mm(PAGE.width - 2 * MARGIN.outer) } });
const cover = { id: 'cover', numbered: false, span: 'page',
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'map', resourceId: 'network',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    coverText('kicker', '{attr.kicker}', { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(MARGIN.outer), y: mm(MARGIN.top - 2) } }, label(8, 'ink')),
    // At lineHeight 0.86 the capitals rise about 3 mm above the title's box: hence 6.5 mm.
    coverText('title', '{titleText}', under('kicker', 6.5), { fontFamily: DISPLAY,
      fontWeight: 800, fontSize: pt(88), lineHeight: 0.86, color: col('ink') }),
    coverText('subtitle', '{subtitle}', under('title', 3), { fontFamily: TEXT, fontWeight: 600,
      fontSize: pt(20), lineHeight: 1.2, color: col('ink') }),
    coverText('edition', '{attr.edition}', under('subtitle', 1.5), { fontFamily: MONO,
      fontSize: pt(9), lineHeight: 1.3, color: col('ink') }),
  ] } } };

// #region do-dont: two figure types whose captions carry their own label colour
const example = (id, name, colour) => ({ id, name, shortLabel: name, captionPrefix: name,
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  captionStyle: { labelColor: col(colour) } });
const resourceTypes = [...defaultResourceTypes(LANG),
  example('do', 'Do', 'signal-green'), example('dont', 'Don’t', 'signal-red')];
const FOOT = { position: 'bottom' }; // cited in one paragraph: its page's foot, one per column
// #endregion

const config = () => ({
  colorPalette, resourceTypes, customFonts: customFonts(),
  page: { width: mm(PAGE.width), height: mm(PAGE.height), dpi: 150,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.8), lineHeight: pt(LEAD), color: col('ink'),
    referenceColor: col('ink'), // references skip the palette (gotcha: palette-skips-designs)
    boldFontWeight: 600, // the brand has no Bold: its SemiBold sets **emphasis**
    textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true },
  headings: { fontFamily: DISPLAY, fontWeight: 800, levels: [ // ink: main-color
    // span: 'page' breaks already; restated in case it goes (gotcha: headings-drop-h1-break)
    { level: 1, span: 'page', numberingTemplate: '{1:01}', marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
    { level: 2, fontSize: pt(17), lineHeight: pt(2 * LEAD), marginTop: pt(0), // two lines,
      marginBottom: pt(0) }, // so a column that opens with one starts on the same line
  ] },
  headingStyles: [cover, section('line-1'), section('line-4'), section('line-5')],
  paragraphStyles: [
    { id: 'specimen', fontSize: pt(15), lineHeight: pt(LEAD * 1.5), marginBottom: pt(LEAD) },
    { id: 'specimen-mono', fontFamily: MONO, fontSize: pt(11), lineHeight: pt(LEAD * 1.5),
      marginBottom: pt(LEAD) },
    { id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10.5) },
  ],
  calloutStyles: [
    { id: 'sign', span: 'page', placement: 'bottom', background: col('ink'),
      padding: { top: mm(6), right: mm(8), bottom: mm(6), left: mm(8) },
      titleStyle: { fontFamily: DISPLAY, fontWeight: 800, fontSize: pt(60), gap: mm(2),
        color: col('paper') }, body: { fontSize: pt(16), lineHeight: pt(LEAD * 1.5),
        color: col('paper'), boldColor: col('paper') } },
  ],
  tableStyles: [
    { id: 'swatches', rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
      headerBackground: col('ink'), headerColor: col('paper'), headerFontSize: pt(7.5),
      bodyFontFamily: MONO, bodyFontSize: pt(8.5), cellPadding: mm(2) },
  ],
  captionStyle: { fontSize: pt(8.3) }, // face and ink from bodyText; the label in SemiBold
  header, footer: { elements: [] }, // the folio sits in the band
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// Its frontmatter fills {title} · {subtitle} in the band and the PDF's title and author:
// every value is quoted (gotcha: quote-frontmatter).

const ART = {}; // fileId → SVG markup: registered for the pages, packed into the bundle
const drawing = (id, typeId, fileId, [w, h], caption, altText, placement) => ({ id, typeId,
  kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId, width: w * 10, height: h * 10 },
  caption, altText, placement });
const resources = [
  { id: 'colours', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { span: 'page' },
    caption: 'The colour system. Line colours are fills; only Ink and the two signals set text.',
    note: 'HEX and RGB for screens; CMYK recipes for coated stock.',
    table: { styleId: 'swatches', model: swatchTable() } },
  drawing('network', 'figure', 'network.svg', [PAGE.width, PAGE.height], '',
    'Five coloured metro lines share a track from the lower left, then fan out to the right.'),
  drawing('do-grid', 'do', 'do-grid.svg', [COL, 43.5],
    'Lines at 0°, 45° and 90°, bent together at an even spacing; one capsule for the interchange.',
    'Three parallel lines bend at 45 degrees together; white stations with ink rims.', FOOT),
  drawing('dont-grid', 'dont', 'dont-grid.svg', [COL, 43.5],
    'Free angles, mixed radii, uneven spacing and stations drawn in the line colour.',
    'The same three lines drawn at free angles with coloured station dots.', FOOT),
];

// #region art: the drawings, made by the rules of section 03
const f = (n) => +n.toFixed(2);
const P = ([x, y]) => `${f(x)} ${f(y)}`;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
const dotp = (a, b) => a[0] * b[0] + a[1] * b[1];
const left = ([x, y]) => [y, -x]; // the normal on the left of a direction (y runs down)
const HEADING = { E: [1, 0], NE: [1, -1], SE: [1, 1], S: [0, 1] };
/** From a point, a run of moves such as ['NE', 40]: 0°, 45° and 90° only. */
const walk = (from, moves) => moves.reduce((pts, [h, len]) =>
  [...pts, add(pts[pts.length - 1], unit(HEADING[h]), len)], [from]);
const dirs = (pts, i) => {
  const a = unit(sub(pts[i], pts[i - 1] ?? pts[i])), b = unit(sub(pts[i + 1] ?? pts[i], pts[i]));
  return [Number.isNaN(a[0]) ? b : a, Number.isNaN(b[0]) ? a : b];
};
/** A polyline moved d mm to its left, mitred at each bend, so parallel lines stay parallel. */
const shift = (pts, d) => pts.map((p, i) => {
  const [n1, n2] = dirs(pts, i).map(left);
  return add(p, add(n1, n2), d / (1 + dotp(n1, n2)));
});
/** A path through the points, each bend rounded: radius R, or R ± d for a line d mm off a
 *  shared centre line, so that the bends of parallel lines stay concentric. */
function track(pts, R, offsets = []) {
  let out = `M${P(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b] = dirs(pts, i);
    const turn = Math.acos(Math.max(-1, Math.min(1, dotp(a, b))));
    const r = R + (offsets[i] ?? 0) * Math.sign(a[0] * b[1] - a[1] * b[0]);
    const cut = r * Math.tan(turn / 2);
    out += ` L${P(add(pts[i], a, -cut))} Q${P(pts[i])} ${P(add(pts[i], b, cut))}`;
  }
  return `${out} L${P(pts[pts.length - 1])}`;
}
/** The point `dist` mm along a polyline. */
function along(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(...sub(pts[i], pts[i - 1]));
    if (dist <= len) return add(pts[i - 1], unit(sub(pts[i], pts[i - 1])), dist);
    dist -= len;
  }
  return pts[pts.length - 1];
}
const stroke = (d, colour, w, cap = 'butt') => `<path d="${d}" fill="none" stroke="${colour}" `
  + `stroke-width="${f(w)}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
/** A station: a white dot with an ink rim. An interchange: one capsule from a to b. */
const station = (p, w) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(0.7 * w)}" `
  + `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="${f(w / 4)}"/>`;
const capsule = (a, b, w) => stroke(`M${P(a)} L${P(b)}`, palette.ink, 1.65 * w, 'round')
  + stroke(`M${P(a)} L${P(b)}`, palette.paper, 1.15 * w, 'round'); // a dot's cross-section
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}"><clipPath id="frame"><rect width="${w}" `
  + `height="${h}"/></clipPath><g clip-path="url(#frame)">${body}</g></svg>`;
const LINES = ['line-1', 'line-2', 'line-3', 'line-4', 'line-5'];

function networkArt(W, H) {
  const w = 6.5, gap = 9.5, R = 3 * w; // line width, spacing and corner radius, in mm
  const trunk = walk([-20, 272], [['NE', 100], ['E', 72]]); // shared track from the lower left
  const offsets = LINES.map((_, i) => (2 - i) * gap); // line 1 on the left, line 5 on the right
  const branches = [[['E', 8], ['NE', 95], ['E', 60]], [['E', 34], ['NE', 38], ['E', 60]],
    [['E', 110]], [['E', 26], ['SE', 36], ['E', 60]], [['E', 4], ['SE', 44], ['S', 60]]];
  const river = walk([-10, 148], [['E', 40], ['SE', 52], ['S', 120]]);
  let out = `<rect width="${W}" height="${H}" fill="${palette.paper}"/>`
    + stroke(track(river, 28), palette.rule, 15);
  const lines = LINES.map((id, i) => {
    const own = shift(trunk, offsets[i]);
    const branch = walk(own[own.length - 1], branches[i]);
    const d = [...own.map(() => offsets[i]), ...branches[i].map(() => 0)];
    out += stroke(track([...own, ...branch.slice(1)], R, d), palette[id], w);
    return branch;
  });
  const across = (p, dir) => [add(p, left(dir), 2 * gap + 0.05 * w),
    add(p, left(dir), -2 * gap - 0.05 * w)];
  out += capsule(...across(along(trunk, 62), unit(HEADING.NE)), w)
    + capsule(...across(along(trunk, 158), HEADING.E), w);
  const stops = [[45, 80], [12, 90], [34, 68], [44, 82], [32, 88]]; // on straights only
  lines.forEach((branch, i) => { for (const s of stops[i]) out += station(along(branch, s), w); });
  return svg(W, H, out);
}

/** Three lines and their stops, drawn by the rules (good) or against every one of them. */
function gridArt(W, H, good) {
  const w = 3.6, gap = 5.4, R = 3 * w;
  const ids = ['line-1', 'line-4', 'line-5'];
  const dot = (p, id) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(0.75 * w)}" `
    + `fill="${palette[id]}"/>`;
  let out = `<rect width="${W}" height="${H}" fill="${palette.paper}"/>`;
  if (good) {
    const trunk = walk([-4, 11], [['E', 30], ['SE', 20]]);
    const lines = [['E', 70], ['E', 70], ['S', 40]].map((move, i) =>
      shift([...trunk, ...walk(trunk[2], [move]).slice(1)], (1 - i) * gap));
    lines.forEach((pts, i) => {
      const shared = (k) => k === 1 || (k === 2 && i < 2); // bends two or three lines share
      out += stroke(track(pts, R, pts.map((_, k) => (shared(k) ? (1 - i) * gap : 0))),
        palette[ids[i]], w);
    });
    const hub = along(trunk, 12); // the interchange, on the shared straight
    out += capsule(add(hub, [0, -gap - 0.05 * w]), add(hub, [0, gap + 0.05 * w]), w);
    for (const [i, s] of [[0, 72], [1, 84], [2, 52]]) out += station(along(lines[i], s), w);
  } else { // free angles, radii and spacing; stops as coloured dots, three dots for the hub
    const lines = [[[-4, 7], [22, 7], [44, 19], [90, 17]], [[-4, 15], [30, 14], [46, 31], [90, 31]],
      [[-4, 20], [24, 21], [40, 35], [45, 60]]];
    lines.forEach((pts, i) => { out += stroke(track(pts, [2, 15, 6][i]), palette[ids[i]], w); });
    lines.forEach((pts, i) => { out += dot(along(pts, 12), ids[i]); });
    for (const [i, s] of [[0, 72], [1, 84], [2, 58]]) out += dot(along(lines[i], s), ids[i]);
  }
  const frame = `<rect x="0.15" y="0.15" width="${W - 0.3}" height="${H - 0.3}" fill="none" `
    + `stroke="${palette.rule}" stroke-width="0.3"/>`; // a hairline in Rule grey
  return svg(W, H, out + frame);
}
ART['network.svg'] = networkArt(PAGE.width, PAGE.height);
ART['do-grid.svg'] = gridArt(COL, 43.5, true);
ART['dont-grid.svg'] = gridArt(COL, 43.5, false);
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// The brand's files and no others: no Bold (the SemiBold stands in), the display face in
// ExtraBold only. The PDF shows Fontsource's names ('PublicSansThin-SemiBold'); yours show theirs.
const FONTS = {
  'Public Sans': ['400', '400i', '600', '600i'],
  'Big Shoulders Display': ['800'],
  'Spline Sans Mono': ['400'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: the brand's faces first, then the pages, then a PDF from the same bytes
await loadBrandFonts(); // the answer, step 1
for (const [fileId, markup] of Object.entries(ART)) await loadSvg(fileId, markup);
const doc = buildDocument({ markdown, resources }, config());
showPages(doc, { title: 'Metro de Alba · Identity manual' });
offerPdf(() => renderToPdf(doc, { fontProvider: brandFontProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // step 2: the provider hands renderToPdf the same files
// #endregion

// #region bundle: one .postext file with the text, the design, the drawings and the fonts
const pack = Object.assign(document.createElement('button'), { type: 'button',
  textContent: 'Build the .postext' });
pack.addEventListener('click', async () => {
  const { bytes, manifest, warnings } = await createBundle({
    name: 'Metro de Alba identity manual', locale: LANG, markdown, config: config(), resources,
    files: new Map([...Object.entries(ART), ...fontFiles]), // fileId → SVG markup or font bytes
  });
  const size = `${Math.round(bytes.length / 1024)} KB`;
  const packed = `fonts inside: ${manifest.fonts.map((font) => font.name).join(', ')}`;
  kitStatus(['.postext', size, packed, ...warnings].join(' · ')); // warnings: what stayed out
  pack.replaceWith(Object.assign(document.createElement('a'), { download: `${RECIPE}.postext`,
    href: URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })),
    textContent: `Download ${RECIPE}.postext · ${size}` }));
});
document.getElementById('pt-actions').append(pack);
// #endregion

// @kit
