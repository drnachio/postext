// ═══ Postext Cookbook · Nº 058 · Business letter to DIN 5008 ═════════════════════
// https://postext.dev/en/cookbook/din-business-letter
// Code: MIT · Text: original, in German (CC BY 4.0) · Logo, signature: drawn in code (CC BY 4.0)
// Fonts: Nunito Sans, Familjen Grotesk, Reddit Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A German quotation on A4 whose H1 design pins the letterhead and the address to DIN 5008.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'din-business-letter';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1f2429', brand: '#1b4a73', // text, a blue-grey near-black; Berlin blue, for the band
  sky: '#b4cbe0', paper: '#ffffff', // the trade and the crafts on the band; the logo and name
  muted: '#5b6670', pen: '#26408f', // labels, return line, company data; the signature's ink
  marks: '#98a3ad', rule: '#c9d1d8', // fold marks, window corners; the hairline in the footer
};
// col(id): a colour linked to its palette entry, with the entry's hex beside the id.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// main-color is the engine's default accent: the dashes of the list take it.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.brand })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));

// DIN 5008, form B: every position in mm from the sheet's top-left corner.
const DIN = {
  left: 25, right: 20, top: 27, bottom: 30, // the margins of the text
  field: { x: 20, y: 45, w: 85, h: 45 }, // the address field, behind the envelope window
  notes: 17.7, // the field's top zone, for the return line; the address zone takes the rest
  info: { x: 125, y: 50, w: 75 }, // the information block
  folds: [105, 210], punch: 148.5, // fold marks for a DL envelope, and the punch mark
};
const TEXT = 210 - DIN.left - DIN.right; // 165 mm of text width
const WINDOW = DIN.field.w - 2 * (DIN.left - DIN.field.x); // 75 mm: text inset 5 mm each side
const PT = 25.4 / 72; // mm per point
const [LEAD, ROW] = [15, 12]; // pt: the body's leading, a row of the information block

// Design text is centred by default, and a header or footer line ends in '…': left, wrapped.
const text = (id, content, face, placement, more) => ({ kind: 'text', id, content,
  align: 'left', overflow: 'wrap', ...face, placement, ...more }); // more: pages, align
const rule = (id, colour, placement, direction = 'horizontal') => ({ kind: 'rule', id,
  direction, thickness: pt(0.5), color: col(colour), placement });
const face = (fontFamily, size, fontWeight, colour, more) => ({ fontFamily, fontSize: pt(size),
  fontWeight, color: col(colour), ...more });
const FACE = { // lineHeight: a dimension is the line's depth, a number multiplies the size
  label: face('Reddit Mono', 7, 400, 'muted', { lineHeight: pt(ROW) }),
  value: face('Nunito Sans', 9, 400, 'ink', { lineHeight: pt(ROW) }),
  from: face('Reddit Mono', 6.5, 400, 'muted', { lineHeight: 1.2 }),
  address: face('Nunito Sans', 10, 400, 'ink', // six lines fill the address zone
    { lineHeight: mm((DIN.field.h - DIN.notes) / 6) }),
  subject: face('Familjen Grotesk', 11, 700, 'ink', { lineHeight: pt(LEAD) }),
  small: face('Reddit Mono', 7, 400, 'muted', { lineHeight: 1.45 }),
};
const FROM = 'Fensterwerkstatt Tessin · Rennbahnstr. 48 · 13086 Berlin'; // 72 mm: fits

// #region answer: the subject line's design pins page 1 to the sheet at form B's positions
const at = (x, y, size) => ({ anchor: { to: 'page', edge: 'top-left' }, // mm from the corner
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const ZONE = DIN.field.y + DIN.notes; // 62.7 mm: where the six address lines start
const SUBJECT = DIN.field.y + DIN.field.h + 2 * LEAD * PT; // two blank lines under the field
const firstPage = () => ({ enabled: true, slot: { elements: [ // in paint order
  ...letterhead(), // band, logo and name, and the corners of the window
  text('from', FROM, FACE.from, at(DIN.left, ZONE - 3.6)), // the return line, underlined
  rule('from-rule', 'muted', { anchor: { to: '#from', edge: 'below' }, offset: { y: mm(0.6) },
    size: { width: mm(WINDOW) } }),
  // One attribute holds the whole address: each '\n' in it starts a new line.
  text('to', '{attr.to}', FACE.address, at(DIN.left, ZONE, { width: mm(WINDOW) })),
  ...infoBlock(), // labels, and values from {attr.*}
  text('subject', '{titleText}', FACE.subject, at(DIN.left, SUBJECT, { width: mm(TEXT) })),
] } });
// The H1 reserves the sheet down to its lowest element (gotcha: opener-reserves-anchored).
// fontFamily: the design paints the H1, but the build measures it (default: Open Sans).
const headings = () => ({ fontFamily: 'Familjen Grotesk', levels: [{ level: 1,
  breakBefore: { enabled: true, parity: 'any' }, // a letter starts on the next sheet
  marginBottom: pt(2 * LEAD), // two blank lines between the subject and the salutation
  advancedDesign: firstPage() }] });
// #endregion

// #region info: the information block, labels from the stationery, values from the letter
const INFO = [['Ihr Zeichen', 'ihr-zeichen'], ['Ihre Nachricht vom', 'ihre-nachricht'],
  ['Unser Zeichen', 'unser-zeichen'], ['Name', 'name'], ['Telefon', 'telefon'],
  ['E-Mail', 'email'], ['Datum', 'datum']]; // [label, heading attribute]
const VALUE = 29; // mm from the labels to the values
const infoBlock = () => INFO.flatMap(([label, key], i) => [
  text(`label-${i}`, label, FACE.label, i === 0 ? at(DIN.info.x, DIN.info.y) : {
    anchor: { to: `#label-${i - 1}`, edge: 'below' }, // each label under the last
    offset: { y: mm(key === 'datum' ? ROW * PT : 0) } }), // a blank row before the date
  text(`value-${i}`, `{attr.${key}}`, FACE.value, { // a 12 pt row as well, on the label's baseline
    anchor: { to: `#label-${i}`, edge: 'align-top' }, offset: { x: mm(VALUE) },
    size: { width: mm(DIN.info.w - VALUE) } }),
]);
// #endregion

// #region letterhead: a band of Berlin blue, the logo and the name, the window's corners
const [BAND, TICK] = [32, 3]; // mm: the band's depth, each arm of the window's corner angles
const LOGO = { y: 7, h: 18 }; // mm: the mark, centred in the band
const CRAFTS = 3 * 7.5 * 1.45 * PT; // mm: three 7.5 pt lines at 1.45
const letterhead = () => [
  { kind: 'box', id: 'band', style: { backgroundColor: col('brand') },
    placement: at(0, 0, { width: 'fill', height: mm(BAND) }) },
  { kind: 'image', id: 'logo', resourceId: 'logo',
    placement: at(DIN.left, LOGO.y, { height: mm(LOGO.h) }) },
  text('name', 'Tessin', face('Familjen Grotesk', 30, 700, 'paper', { lineHeight: 1 }),
    { anchor: { to: '#logo', edge: 'right-of' }, offset: { x: mm(5), y: mm(1.2) } }),
  text('trade', 'FENSTERWERKSTATT · BERLIN', face('Reddit Mono', 7.5, 500, 'sky',
    { letterSpacing: pt(1.2) }), { anchor: { to: '#name', edge: 'below' },
    offset: { x: mm(0.4), y: mm(1.5) } }),
  text('crafts', 'Kastenfenster\nHolzfenster\nDenkmalpflege', face('Reddit Mono', 7.5,
    400, 'sky', { lineHeight: 1.45, align: 'right' }),
    at(210 - DIN.right - 45, LOGO.y + (LOGO.h - CRAFTS) / 2, { width: mm(45) })),
  ...[[0, 0], [1, 0], [0, 1], [1, 1]].flatMap(([right, low], i) => { // turned inwards
    const [x, y] = [DIN.field.x + right * DIN.field.w, DIN.field.y + low * DIN.field.h];
    return [rule(`across-${i}`, 'marks', at(x - right * TICK, y, { width: mm(TICK) })),
      rule(`down-${i}`, 'marks', at(x, y - low * TICK, { height: mm(TICK) }), 'vertical')];
  }),
];
// #endregion

// #region furniture: marks on every sheet, 'Seite 2 von 2' on the next, the company data
const header = { elements: [
  // In the H1's design they would stretch its reserve (gotcha: opener-reserves-anchored).
  ...[[DIN.folds[0], 5], [DIN.punch, 8], [DIN.folds[1], 5]].map(([y, length], i) =>
    rule(`mark-${i}`, 'marks', at(0, y, { width: mm(length) }))), // fold, punch, fold
  // Page 1 opens with the H1, which makes it an 'opener'; later sheets are 'body' pages.
  { kind: 'box', id: 'strip', pages: 'body', style: { backgroundColor: col('brand') },
    placement: at(0, 0, { width: 'fill', height: mm(4) }) },
  text('ref', 'Fensterwerkstatt Tessin · Unser Zeichen {attr.unser-zeichen} · {attr.datum}',
    FACE.small, at(DIN.left, 13.2), { pages: 'body' }),
  text('page', 'Seite {pageNumber} von {totalPages}', FACE.small,
    at(210 - DIN.right - 40, 13.2, { width: mm(40) }), { pages: 'body', align: 'right' }),
] };
const FOOT = 297 - DIN.bottom + 5; // mm: the hairline over the company data
const COMPANY = [ // three columns, 57 mm apart, inside the bottom margin
  'Fensterwerkstatt Tessin GmbH\nRennbahnstraße 48\n13086 Berlin\nTelefon 030 23125-400',
  'Geschäftsführer Martin Tessin\nAmtsgericht Charlottenburg\nHRB 000000 B\nUSt-IdNr. DE000000000',
  'Musterbank Berlin\nIBAN DE00 0000 0000 0000 0000 00\nBIC MUSTDEBBXXX',
];
const footer = { elements: [
  rule('foot-rule', 'rule', at(DIN.left, FOOT, { width: mm(TEXT) })),
  ...COMPANY.map((lines, i) => text(`company-${i}`, lines, FACE.small,
    at(DIN.left + 57 * i, FOOT + 2.5, { width: mm(52) }))),
] };
// #endregion

// #region signature: a drawing set in the flow by ::resource, with no label or number
const resourceTypes = [{ id: 'drawing', name: 'Zeichnung', shortLabel: 'Zeichnung',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }];
const drawing = (id, width, height, altText, placement) => ({ id, typeId: 'drawing',
  kind: 'svg', svg: { fileId: `${id}.svg`, width, height }, altText, placement,
  createdAt: 0, updatedAt: 0 });
const resources = [ // an image element draws the logo; nothing cites it
  drawing('logo', 200, 280, 'Zeichen der Fensterwerkstatt Tessin, ein Kastenfenster'),
  drawing('signature', 760, 328, 'Unterschrift von Martin Tessin',
    { position: 'here', width: 0.297 }), // 49 × 21.1 mm: under 4 lines, no grid gap below
];
// #endregion

const config = () => ({
  locale: 'de', resourceTypes, colorPalette, // German hyphenation
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150, margins: {
    top: mm(DIN.top), bottom: mm(DIN.bottom), left: mm(DIN.left), right: mm(DIN.right) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Nunito Sans', fontSize: pt(10.5), lineHeight: pt(LEAD), // justified
    color: col('ink'), boldColor: col('ink'), firstLineIndent: pt(0), // and hyphenated by default
    paragraphSpacing: true }, // DIN 5008: a blank line between paragraphs, no indent
  headings: headings(), header, footer,
  unorderedLists: { bulletChar: '–' }, // in main-color
  paragraphStyles: [
    { id: 'stack', marginBottom: pt(LEAD) }, // name and role, the enclosures: no blank lines
    { id: 'colophon', fontFamily: 'Reddit Mono', fontSize: pt(6.5), lineHeight: pt(9),
      color: col('muted') }, // a blank line under the enclosures, from the stack's margin
  ],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the logo and the signature, drawn in code
function mulberry32(seed) { // a seeded generator: the same signature on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function logoSvg(stroke) { // a Berlin box window: a cross frame, six panes and the sill
  const line = (d, width) => `<path d="${d}" fill="none" stroke="${stroke}" `
    + `stroke-width="${width}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 40 56">'
    + line('M1.5 1.5H38.5V51.5H1.5ZM1.5 17H38.5M20 1.5V51.5', 3) + line('M1.5 34.5H38.5', 1.4)
    + line('M0 54.8H40', 2.2) + '</svg>';
}
function catmull(points) { // a smooth path through the points, as cubic Béziers
  const f = (v) => v.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1],
      points[i + 2] ?? points[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
function signatureSvg() { // 'M. Tessin' in a quick, forward-leaning hand
  const rand = mulberry32(5008);
  const SLANT = 0.32; // the lean: x moves right by a third of the height above the baseline
  const hand = (points) => points.map(([x, y]) => { // shake each point a little, then lean it
    const [jx, jy] = [x + (rand() - 0.5) * 1.4, y + (rand() - 0.5) * 1.4];
    return [jx + SLANT * (60 - jy), jy];
  });
  const strokes = [ // x, y on a 190 × 82 sheet, baseline at 60
    [[3, 63], [7, 44], [11, 18], [14, 9], [17, 22], [19, 44], [21, 60], [23, 44], [27, 22],
      [30, 17], [32, 30], [33, 48], [35, 61], [40, 63], [45, 57]], // M
    [[48.5, 61], [49.5, 60]], // the full stop
    [[50, 25], [55, 20], [78, 15], [102, 12], [128, 9]], // the bar of the T
    [[80, 13], [79, 30], [76, 48], [73, 61], [77, 66], [84, 61], [89, 52], [91, 46], [88, 43],
      [85, 48], [87, 57], [93, 62], [97, 56], [100, 47], [102, 44], [104, 51], [102, 58],
      [99, 61], [103, 62], [108, 58], [111, 48], [113, 44], [115, 51], [113, 58], [110, 61],
      [114, 62], [120, 58], [123, 52], [125, 46], [126, 58], [130, 63], [134, 57], [137, 47],
      [140, 48], [141, 62], [144, 52], [148, 46], [152, 48], [153, 61], [159, 64], [168, 57]],
    [[127, 37], [128.5, 36]], // the dot on the i
    [[168, 57], [174, 50], [172, 58], [156, 70], [120, 76], [80, 76], [50, 72], [36, 68]],
  ];
  const pen = `fill="none" stroke="${palette.pen}" stroke-width="1.9" stroke-linecap="round" `
    + 'stroke-linejoin="round"';
  // The viewBox starts 3 units above the sheet, which lowers the ink towards the typed name.
  return '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="328" viewBox="0 -3 190 82">'
    + strokes.map((points) => `<path d="${catmull(hand(points))}" ${pen}/>`).join('') + '</svg>';
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint, loaded before the first build.
const FONTS = { 'Nunito Sans': ['400', '700'], 'Familjen Grotesk': ['700'],
  'Reddit Mono': ['400', '500'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('logo.svg', logoSvg(palette.paper));
await loadSvg('signature.svg', signatureSvg());
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Business letter to DIN 5008', es: 'Carta comercial DIN 5008' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit
