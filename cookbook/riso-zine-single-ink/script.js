// ═══ Postext Cookbook · Nº 051 · Two-ink riso zine: art in one spot colour ═════════
// https://postext.dev/en/cookbook/riso-zine-single-ink
// Code: MIT · Text: original (CC BY 4.0) · Pictures: drawn in code (CC BY 4.0)
// Fonts: Epilogue, Anton, Space Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A four-page zine for a risograph with a blue drum and a fluorescent pink one. The drawings
// are made in full colour and printed from the pink drum as tints of pink.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'riso-zine-single-ink';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region inks: two drums and the paper; every colour in the config links to one of them
// The two drums: the blue for the type and the furniture, the fluorescent pink for the art.
const DRUMS = { ink: '#1d4fb8', spot: '#f0509a' };
const PAPER = '#f3efe6'; // cream stock: where no ink falls
// A screen prints a share of an ink's dots and lets the paper show between them.
const screen = (hex, share) => `#${[1, 3, 5].map((i) => Math.round(share
  * parseInt(hex.slice(i, i + 2), 16) + (1 - share) * parseInt(PAPER.slice(i, i + 2), 16))
  .toString(16).padStart(2, '0')).join('')}`;
const palette = { ...DRUMS, 'spot-25': screen(DRUMS.spot, 0.25), paper: PAPER };
// Every colour is linked to its palette entry by id.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to main-color: aimed at the spot, none of them adds a third ink.
const colorPalette = [...Object.entries(palette), ['main-color', DRUMS.spot]]
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion

// #region answer: drawings in any colours, printed from the pink drum
// renderToPdf reads the ink from the config and recolours every SVG it is handed; the canvas
// does the same to a picture registered with singleInk: true. Both get the drawing as drawn.
const diagramStyle = { singleInk: true, inkColor: col('spot') };
const printFiles = new Map(); // fileId → the bytes renderToPdf embeds
async function registerArt(fileId, svg) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  registerResourceImage(fileId, img, { singleInk: true }); // the canvas tints it as it paints
  printFiles.set(fileId, new TextEncoder().encode(svg)); // the PDF recolours these bytes
}
const pdfOptions = { fontProvider: fontsourceProvider,
  resourceBytes: (id) => printFiles.get(id) }; // the drawings as drawn, the PNG as it is
// #endregion

const TRIM = { width: 120, height: 160 }; // mm: a 240 × 160 sheet folded once
const MARGIN = { top: 13, bottom: 16, inner: 12, outer: 10 }; // mm
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // 98 mm, about 65 characters
const LEAD = 13; // body leading in pt
const label = { fontFamily: 'Space Mono', fontWeight: 700, fontSize: pt(7.5),
  textTransform: 'uppercase', color: col('ink') };
const mono = { ...label, align: 'left', overflow: 'clip' }; // a label as a design element
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region cover: a pink moon behind blue wires, and the title printed twice off register
const OFF = { x: 0.8, y: -0.5 }; // mm: where the pink drum lands against the blue one
// Array order is paint order: the pink copy goes down first and the blue covers all but a
// sliver. Canvas and PDF paint opaque colour, so the overlap stays blue, not riso purple.
const twice = (id, { placement: { offset: { x, y }, ...rest }, ...element }) => [
  { ...element, id: `${id}-spot`, color: col('spot'),
    placement: { ...rest, offset: { x: mm(x.value + OFF.x), y: mm(y.value + OFF.y) } } },
  { ...element, id, color: col('ink'), placement: { ...rest, offset: { x, y } } }];
const rule = (id, direction, x, y, size) => ({ kind: 'rule', id, direction, color: col('ink'),
  thickness: pt(id === 'pole' ? 3 : 0.8), placement: at('page', 'top-left', x, y, size) });
// span: 'page' lets the design run past the text block's foot: kept in the column, the
// pole would be cut off there.
const cover = { id: 'cover', span: 'page', header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'moon', resourceId: 'moon',
      placement: at('page', 'top-left', 28, 14, { width: mm(92), height: mm(92) }) },
    rule('wire-1', 'horizontal', 0, 30, { width: mm(TRIM.width) }),
    rule('wire-2', 'horizontal', 0, 34.5, { width: mm(TRIM.width) }),
    rule('pole', 'vertical', 98, 62, { height: mm(TRIM.height - 62) }), // off the foot
    { kind: 'box', id: 'flag', style: { backgroundColor: col('ink'), borderRadius: mm(1) },
      placement: at('page', 'top-left', 89, 62, { width: mm(18), height: mm(21) }) },
    // One word a line: the box is narrower than two of them.
    { kind: 'text', id: 'stops', content: '{attr.stops}', ...mono, fontSize: pt(9),
      lineHeight: 1.25, align: 'center', color: col('paper'), overflow: 'wrap',
      placement: at('#flag', 'top-left', 3, 2.5, { width: mm(12) }) },
    { kind: 'text', id: 'issue', content: '{attr.issue}', ...mono,
      placement: at('page', 'top-left', MARGIN.inner, 8) },
    { kind: 'text', id: 'line', content: '{attr.line}', fontFamily: 'Epilogue', fontWeight: 700,
      fontSize: pt(9), color: col('ink'), align: 'left', overflow: 'wrap',
      placement: at('page', 'top-left', MARGIN.inner, 13, { width: mm(46) }) },
    ...twice('title', { kind: 'text', content: '{titleText}', fontFamily: 'Anton', fontSize: pt(86),
      lineHeight: 0.9,
      textTransform: 'uppercase', align: 'left',
      overflow: 'wrap', placement: at('page', 'top-left', MARGIN.inner, 94, { width: mm(76) }) }),
  ] } } };
// #endregion

// #region inside: the article opener, route chips, the caption bar and the quote's stripe
const opener = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...mono,
    placement: at('container', 'top-left', 0, 0.5) },
  ...twice('title', { kind: 'text', content: '{titleText}', fontFamily: 'Anton',
    fontSize: pt(34), lineHeight: 0.95, textTransform: 'uppercase', align: 'left',
    overflow: 'wrap', placement: at('#kicker', 'below', 0, 2.5, { width: mm(MEASURE) }) }),
] } };
const route = { id: 'route', background: col('spot-25'), borderColor: col('spot'),
  borderWidth: pt(0.75), borderRadius: pt(1.2), fontFamily: 'Space Mono', bold: true,
  fontSize: em(0.86), color: col('ink') };
const captionStyle = { fontFamily: 'Epilogue', fontSize: pt(8), color: col('ink'),
  backgroundEnabled: true, background: col('spot-25'), padding: mm(1.6) };
const quote = { id: 'quote', backgroundEnabled: false, marginTop: pt(LEAD), marginBottom: pt(4),
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('spot') },
  padding: { top: mm(2.6), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { ...label, gap: mm(1.2) }, // the speaker, above the words
  body: { fontFamily: 'Anton', fontSize: pt(14), lineHeight: pt(17), color: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0) } };
// #endregion

// #region drawn: the inset beside its note, as a heading design (the heading is its label)
// The inset keeps the map's own colours. Single ink touches SVG only, so the map goes in
// as a PNG snapshot, which neither the canvas nor the PDF recolours.
async function registerSnapshot(fileId, svg, width, height) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  registerResourceImage(fileId, await createImageBitmap(canvas));
  printFiles.set(fileId, new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer()));
}
const INSET = 30; // mm: the snapshot's width; its height follows the map's 100 × 69.5
const drawn = { id: 'drawn', marginTop: pt(LEAD), advancedDesign: { enabled: true,
    slot: { elements: [
      { kind: 'image', id: 'inset', resourceId: 'as-drawn',
        placement: at('container', 'top-left', 0, 0.5, { width: mm(INSET), height: 'auto' }) },
      { kind: 'text', id: 'label', content: '{titleText}', ...mono,
        placement: at('#inset', 'right-of', 5, 0) },
      { kind: 'text', id: 'note', content: '{attr.note}', fontFamily: 'Epilogue',
        fontSize: pt(8.5), lineHeight: 1.4, color: col('ink'), align: 'left', overflow: 'wrap',
        placement: at('#label', 'below', 0, 1.5, { width: mm(MEASURE - INSET - 5) }) },
    ] } } };
// #endregion

// Folios at the foot, outside: a pink square on the baseline, then the folio and the zine's
// name on a verso, the article and the folio on a recto.
const FOLIO_Y = TRIM.height - 10; // mm from the top edge to the folio's box
const feet = [['even', 'left', 1, '{pageNumber} · {title} · {subtitle}'],
  ['odd', 'right', -1, '{chapterTitle} · {pageNumber}']].flatMap(([parity, edge, s, content]) => [
  { kind: 'box', id: `mark-${parity}`, parity, style: { backgroundColor: col('spot') },
    placement: at('page', `top-${edge}`, s * MARGIN.outer, FOLIO_Y + 0.7, { width: mm(1.85),
      height: mm(1.85) }) }, // the label's cap height, standing on its baseline
  { kind: 'text', id: `folio-${parity}`, parity, content, ...mono, align: edge,
    placement: at('page', `top-${edge}`, s * (MARGIN.outer + 3.5), FOLIO_Y) }]);

// The back cover: a destination blind across the top and the cover's moon going down.
const back = { id: 'back', span: 'page', // the setting moon runs past the text block
  breakBefore: { enabled: true, parity: 'even' },
  header: { elements: [] }, footer: { elements: [] },
  // The blind is MEASURE / 4 tall: the floor leaves 6 mm of air under it.
  advancedDesign: { enabled: true, minHeight: mm(MEASURE / 4 + 6), slot: { elements: [
    { kind: 'image', id: 'blind', resourceId: 'blind',
      placement: at('container', 'top-left', 0, 0, { width: mm(MEASURE), height: 'auto' }) },
    { kind: 'image', id: 'moonset', resourceId: 'moon', reserve: false, // the text runs above it
      placement: at('page', 'bottom-right', 30, 34, { width: mm(76), height: mm(76) }) },
  ] } } };

const config = () => ({
  colorPalette, diagramStyle, resourceTypes: [drawing],
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Epilogue', fontSize: pt(9), lineHeight: pt(LEAD), color: col('ink'),
    // Bold and italics default to main-color, the pink here: back to the blue drum. The
    // reference colour follows boldColor.
    boldColor: col('ink'), italicColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  // parity 'any': the article opens the next page, whichever side it falls on.
  headings: { fontFamily: 'Anton', fontWeight: 400, color: col('ink'), levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
    { level: 2, fontSize: pt(15), marginTop: pt(LEAD), marginBottom: pt(2) }] },
  headingStyles: [cover, drawn, back],
  chipStyles: [route], captionStyle, calloutStyles: [quote],
  unorderedLists: { color: col('spot'), marginTop: pt(2), marginBottom: pt(0) },
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Space Mono', fontSize: pt(7.5),
    lineHeight: pt(11), color: col('ink'), textAlign: 'left', marginTop: pt(LEAD) }],
  header: { elements: [] }, footer: { elements: feet },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// One unnumbered type for every picture: an empty prefix and template print no number.
const drawing = { id: 'drawing', name: 'Drawing', shortLabel: 'drawing', captionPrefix: '',
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal' };
const svgFile = (id, width, height, extra) => ({ id, typeId: 'drawing', kind: 'svg',
  svg: { fileId: `${id}.svg`, width, height }, createdAt: 0, updatedAt: 0, ...extra });
const resources = [
  // Cited on page 2, the map heads page 3: a top float waits for the next page's head
  // (gotcha: top-float-next-page).
  svgFile('network', 1000, 695, { placement: { position: 'top', width: 0.74, align: 'center' },
    caption: '**The network from the pink drum.** :chip[N50]{style="route"} loops round the '
      + 'rest. Terminals and changes only.',
    altText: 'Six night bus routes and a loop round the Corn Exchange, in tints of pink.' }),
  { id: 'as-drawn', typeId: 'drawing', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'as-drawn.png', format: 'png', width: 600, height: 417 },
    altText: 'The same map in its drawn colours: navy, red, teal, blue, orange, yellow.' },
  svgFile('moon', 960, 960,
    { altText: 'A full moon: a pale pink disc with its seas in a coarse dot screen.' }),
  svgFile('blind', 1040, 260, { altText: 'A destination blind lit up: NOT IN SERVICE.' }),
];

const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the map, the moon and the blind, drawn in full colour
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const f2 = (n) => +n.toFixed(2);
// A single-stroke capital alphabet on a 4 × 6 grid with 45° corners, like the map's lines.
// The labels are paths, stroked like the lines and recoloured with them.
const GLYPHS = {
  A: ['0 6 0 1 1 0 3 0 4 1 4 6', '0 3.5 4 3.5'], B: ['0 0 3 0 4 1 4 2 3 3 0 3',
    '3 3 4 4 4 5 3 6 0 6 0 0'], C: ['4 1 3 0 1 0 0 1 0 5 1 6 3 6 4 5'],
  D: ['0 0 3 0 4 1 4 5 3 6 0 6 0 0'], E: ['4 0 0 0 0 6 4 6', '0 3 3 3'],
  G: ['4 1 3 0 1 0 0 1 0 5 1 6 3 6 4 5 4 3.5 2.5 3.5'], H: ['0 0 0 6', '4 0 4 6', '0 3 4 3'],
  I: ['0 0 0 6'], K: ['0 0 0 6', '4 0 0 4', '1.5 2.5 4 6'], L: ['0 0 0 6 4 6'],
  N: ['0 6 0 0 4 6 4 0'], O: ['1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0'],
  P: ['0 6 0 0 3 0 4 1 4 2 3 3 0 3'], Q: ['1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0', '2.5 4.5 4 6'],
  R: ['0 6 0 0 3 0 4 1 4 2 3 3 0 3', '2 3 4 6'],
  S: ['4 1 3 0 1 0 0 1 0 2 1 3 3 3 4 4 4 5 3 6 1 6 0 5'], T: ['0 0 4 0', '2 0 2 6'],
  U: ['0 0 0 5 1 6 3 6 4 5 4 0'], V: ['0 0 2 6 4 0'], X: ['0 0 4 6', '4 0 0 6'],
  Y: ['0 0 2 3 4 0', '2 3 2 6'], F: ['4 0 0 0 0 6', '0 3 3 3'],
  0: ['1 0 3 0 4 1 4 5 3 6 1 6 0 5 0 1 1 0'], 1: ['0 1 1.5 0 1.5 6'],
  2: ['0 1 1 0 3 0 4 1 4 2 0 6 4 6'], 3: ['0 0 4 0 2 2.5 3 2.5 4 3.5 4 5 3 6 1 6 0 5'],
  4: ['3 6 3 0 0 4 4 4'], 5: ['4 0 0 0 0 2.5 3 2.5 4 3.5 4 5 3 6 0 6'],
  7: ['0 0 4 0 1.5 6'], 8: ['1 0 3 0 4 1 4 2 3 3 1 3 0 2 0 1 1 0',
    '1 3 3 3 4 4 4 5 3 6 1 6 0 5 0 4 1 3'], "'": ['0.5 0 0 1.5'],
};
const advance = (ch) => ({ ' ': 2.6, I: 1.6, 1: 3.2, "'": 1.6 })[ch] ?? 5.6;
function letter(text, x, y, size, colour, anchor = 'start', weight = 0.17) { // size: cap height
  const k = size / 6;
  const width = [...text].reduce((w, ch) => w + advance(ch), 0) - 1.6;
  let cx = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0) * k;
  let d = '';
  for (const ch of text) {
    for (const stroke of GLYPHS[ch] ?? []) {
      const n = stroke.split(' ').map(Number);
      for (let i = 0; i < n.length; i += 2) {
        d += `${i ? 'L' : 'M'}${f2(cx + n[i] * k)} ${f2(y - size + n[i + 1] * k)}`;
      }
    }
    cx += advance(ch) * k;
  }
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${f2(size * weight)}" `
    + 'stroke-linecap="round" stroke-linejoin="round"/>';
}

// The night network in mm, 100 × 69.5 (from y = 3), one colour per route as the designer drew it.
const DARK = '#23272e';
const LINES = { N12: '#16296b', N27: '#c62a1f', N41: '#0b7d74', N8: '#3b8fd4', N3: '#ef8b1f',
  N50: '#f3c51a' };
function network() {
  const path = (nodes, colour, width, close = false) => `<path d="${nodes.map(([x, y], i) =>
    `${i ? 'L' : 'M'}${x} ${y}`).join('')}${close ? 'Z' : ''}" fill="none" stroke="${colour}" `
    + `stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const river = path([[0, 48], [8, 48], [14, 54], [86, 54], [92, 48], [100, 48]], '#bfe0ee', 4.4);
  const loop = path([[32, 21], [68, 21], [74, 27], [74, 41], [68, 47], [32, 47], [26, 41],
    [26, 27]], LINES.N50, 1.8, true);
  const legs = [ // route, then its nodes from the hub outwards
    ['N12', [[50, 31], [50, 6]]], ['N12', [[60, 37], [85, 62], [86, 62]]],
    ['N27', [[40, 31], [21, 12], [14, 12]]], ['N27', [[64.5, 34], [86, 34]]],
    ['N3', [[35.5, 34], [14, 34]]], ['N3', [[50, 37], [50, 70]]],
    ['N41', [[60, 31], [79, 12], [86, 12]]], ['N8', [[40, 37], [15, 62], [14, 62]]],
  ].map(([id, nodes]) => path(nodes, LINES[id], 1.8)).join('');
  const stops = [[50, 6], [86, 62], [14, 12], [86, 34], [14, 34], [50, 70], [86, 12], [14, 62],
    [50, 21], [50, 47], [26, 34], [74, 34], [69, 22], [31, 22], [69, 46], [31, 46]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.95" fill="${DARK}"/>`).join('');
  const hub = `<rect x="35.5" y="31" width="29" height="6" rx="3" fill="${DARK}"/>`
    + letter('CORN EXCHANGE', 50, 35, 2, '#ffffff', 'middle', 0.19);
  const badge = (id, x, y, side) => { // y: the line's axis; side: which way from the stop
    const w = id.length * 1.76 + 1.2;
    const x0 = side === 'left' ? x - 1.6 - w : side === 'right' ? x + 1.6 : x - w / 2;
    return `<rect x="${f2(x0)}" y="${y - 2.1}" width="${f2(w)}" height="4.2" rx="0.8" `
      + `fill="${LINES[id]}"/>${letter(id, x0 + 0.62, y + 1.1, 2.2,
        id === 'N50' ? DARK : '#ffffff', 'start', 0.2)}`;
  };
  const name = (text, x, y, anchor) => letter(text, x, y, 1.9, DARK, anchor);
  const labels = [
    badge('N12', 50, 6, 'left'), name('ASHGROVE HOSPITAL', 53, 7),
    badge('N27', 14, 12, 'left'), name('NORTHFIELD DEPOT', 4.7, 8.2),
    badge('N41', 86, 12, 'right'), name('AIRPORT', 95.3, 8.2, 'end'),
    badge('N3', 14, 34, 'left'), name('CANAL BASIN', 4.7, 30.2),
    badge('N27', 86, 34, 'right'), name("ST BRIDE'S", 95.3, 30.2, 'end'),
    badge('N8', 14, 62, 'left'), name('UNIVERSITY', 4.7, 67.8),
    badge('N12', 86, 62, 'right'), name('HARBOUR GATE', 95.3, 67.8, 'end'),
    badge('N3', 50, 70, 'left'), name('STATION SQ', 53, 71), badge('N50', 40.7, 47, 'middle'),
    letter('RIVER BRACK', 32, 59.9, 1.7, '#1f5a85', 'middle', 0.19),
  ].join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="695" '
    + `viewBox="0 3 100 69.5">${river}${loop}${legs}${stops}${hub}${labels}</svg>`;
}

// The cover's moon, 96 × 96 mm: a light grey disc, then a 45° dot screen whose dots grow and
// darken with the tone over the near side's larger seas.
function moon() {
  const rand = mulberry32(7);
  const cells = Array.from({ length: 9 * 9 }, rand); // value noise, 8 cells across
  const noise = (u, v) => {
    const [gx, gy] = [u * 8, v * 8];
    const [i, j] = [Math.floor(gx), Math.floor(gy)];
    const [s, t] = [gx - i, gy - j].map((a) => a * a * (3 - 2 * a));
    const g = (a, b) => cells[Math.min(8, b) * 9 + Math.min(8, a)];
    return (g(i, j) * (1 - s) + g(i + 1, j) * s) * (1 - t)
      + (g(i, j + 1) * (1 - s) + g(i + 1, j + 1) * s) * t;
  };
  const R = 46;
  const seas = [ // north up: centre, half-axes and tilt, in moon radii
    [-0.58, -0.02, 0.2, 0.42, 0.3], [-0.3, -0.42, 0.27, 0.22, 0], // Procellarum, Imbrium
    [0.16, -0.4, 0.15, 0.14, 0], [0.36, -0.08, 0.19, 0.15, 0.4], // Serenitatis, Tranquillitatis
    [0.72, -0.28, 0.09, 0.11, 0], [0.6, 0.14, 0.09, 0.14, -0.3], // Crisium, Fecunditatis
    [0.38, 0.28, 0.08, 0.08, 0], [-0.2, 0.34, 0.15, 0.12, 0], // Nectaris, Nubium
    [-0.52, 0.38, 0.08, 0.08, 0], [-0.05, -0.76, 0.36, 0.06, 0.1], // Humorum, Frigoris
    [-0.02, -0.16, 0.08, 0.07, 0]]; // Vaporum
  const P = 2; // screen pitch in mm
  let dots = '';
  for (let i = -34; i <= 34; i++) {
    for (let j = -34; j <= 34; j++) {
      const [x, y] = [(i - j) * P / Math.SQRT2, (i + j) * P / Math.SQRT2];
      if (Math.hypot(x, y) > R - 0.6) continue; // the disc's edge stays a clean circle
      const [u, v] = [x / R, y / R];
      let sea = 0;
      for (const [mx, my, rx, ry, a] of seas) {
        const [du, dv] = [u - mx, v - my];
        const [p, q] = [du * Math.cos(a) + dv * Math.sin(a), dv * Math.cos(a) - du * Math.sin(a)];
        sea = Math.max(sea, Math.exp(-(((p / rx) ** 2 + (q / ry) ** 2) ** 1.5)));
      }
      const m = Math.min(1, Math.max(0, (sea * (0.85 + 0.3 * noise((u + 1) / 2, (v + 1) / 2))
        - 0.3) / 0.35)); // 0 on the highlands, 1 inside a sea, with a ragged shore
      let tone = 0.2 + 0.08 * noise((v + 1) / 2, (u + 1) / 2) + 0.55 * m * m * (3 - 2 * m);
      for (const [cx, cy, cr] of [[-0.12, 0.72, 0.05], [-0.32, -0.15, 0.035]]) { // bright craters
        if (Math.hypot(u - cx, v - cy) < cr) tone = 0.1;
      }
      const grey = Math.round(210 - 190 * tone).toString(16).padStart(2, '0');
      dots += `<circle cx="${f2(x + 48)}" cy="${f2(y + 48)}" r="${f2(P * 0.6 * Math.sqrt(tone))}" `
        + `fill="#${grey}${grey}${grey}"/>`;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 96 96">'
    + `<circle cx="48" cy="48" r="${R}" fill="#c8c8c8"/>${dots}</svg>`;
}

// The back cover's destination blind, 104 × 26 mm: amber lights on black, 5 × 7 letters.
const LED = {
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};
function blind(text = 'NOT IN SERVICE') {
  const cols = [...text].flatMap((ch) => [...LED[ch][0]].map((_, c) =>
    LED[ch].map((row) => row[c] === '1')).concat([Array(7).fill(false)])).slice(0, -1);
  const [W, H, P, ROWS] = [104, 26, 1.25, 13]; // the matrix has 13 rows; letters on rows 3–9
  const n = Math.floor((W - 6) / P);
  const [x0, y0, first] = [(W - (n - 1) * P) / 2, (H - (ROWS - 1) * P) / 2,
    Math.floor((n - cols.length) / 2)];
  let dots = '';
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < ROWS; r++) {
      const on = cols[c - first]?.[r - 3] ?? false;
      dots += `<circle cx="${f2(x0 + c * P)}" cy="${f2(y0 + r * P)}" r="${on ? 0.55 : 0.36}" `
        + `fill="${on ? '#ffd35a' : '#3a3a3a'}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="260" viewBox="0 0 ${W} ${
    H}"><rect width="${W}" height="${H}" rx="2.5" fill="#161616"/>${dots}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Text, display and label faces, loaded before the build.
const FONTS = { Epilogue: ['400', '700'], Anton: ['400'], 'Space Mono': ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const map = network();
await Promise.all([registerArt('network.svg', map), registerArt('moon.svg', moon()),
  registerArt('blind.svg', blind()), registerSnapshot('as-drawn.png', map, 600, 417)]);
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: 'Night Buses: a two-ink riso zine' });
offerPdf(() => renderToPdf(doc, pdfOptions), `${RECIPE}.pdf`);
// A grey proof: the pages as a photocopier or a one-drum reprint would print them.
offerPdf(() => renderToPdf(doc, { ...pdfOptions, colorSpace: 'grayscale' }),
  `${RECIPE}-grey-proof.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
