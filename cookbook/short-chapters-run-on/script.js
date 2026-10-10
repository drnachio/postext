// ═══ Postext Cookbook · Nº 065 · Pocket classic: short chapters that run on ═══════════
// https://postext.dev/en/cookbook/short-chapters-run-on
// Code: MIT · Text: Machado de Assis, Dom Casmurro, 1899 (PD, Gutenberg #55752) · Plate: painted
// Fonts: Tinos (Apache 2.0), Abril Fatface, League Spartan (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the viewer's title; the sample is Portuguese
const RECIPE = 'short-chapters-run-on';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#24202a', // the text: a violet near-black
  paper: '#f6f1e6', // the pocket book's paper
  plum: '#4f2a49', // the series colour: cover bands, the chapter numerals
  saffron: '#d9a03c', // the second ink: rules and drawings, never text on paper (2.1:1)
  muted: '#6b616e', // the running heads and the colophon (5.2:1 on paper)
};
// Each colour names its palette entry and carries its hex.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The default bold and italic colours link to main-color, set here to the ink, not blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Tinos', 'Abril Fatface', 'League Spartan'];
const TRIM = { width: 110, height: 178 }; // mm: a pocket book
const [TOP, INNER, OUTER] = [15, 14, 12]; // mm; mirrored, so the inner margin is at the spine
const [BODY, LEAD, LINES] = [9.5, 12.6, 33]; // pt, pt, and the lines of a full page
const PT = 25.4 / 72; // mm per point
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const caps = (size, track) => ({ fontFamily: LABEL, fontWeight: 600, fontSize: pt(size),
  letterSpacing: pt(track), textTransform: 'uppercase' });

// #region answer: chapters that run on, each under a centred head drawn in the column
// Machado's chapters run a page or two, so none opens a page. The level's break is off (the
// H1 default would open each chapter on a recto) and a chapter starts two lines under the last.
const [NUMERAL, TITLE, TRACK, GAP] = [14, 7.5, 1.3, 1.6]; // pt, pt, pt, mm
const RULE_Y = NUMERAL * PT + GAP + TITLE * 1.2 * PT + GAP; // mm: under the title's line
const chapterHead = { enabled: true, slot: { elements: [ // no span: the head stays in the text
  { kind: 'text', id: 'numeral', content: '{number}', fontFamily: DISPLAY, fontSize: pt(NUMERAL),
    lineHeight: 1, color: col('plum'), align: 'center',
    placement: { ...at('container', 'top'), size: { width: 'fill' } } },
  { kind: 'text', id: 'title', content: '{titleText}', ...caps(TITLE, TRACK), color: col('ink'),
    align: 'center', overflow: 'wrap', // a long title takes a second line
    placement: { anchor: { to: '#numeral', edge: 'below' }, offset: { y: mm(GAP) },
      size: { width: 'fill' } } },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('saffron'),
    placement: { ...at('container', 'top', 0, RULE_Y), size: { width: mm(8) } } },
] } }; // 11.7 mm deep: the head takes three lines, and the text under it stays on the grid
const chapters = { level: 1, numberingTemplate: '{1:I}', // {number} prints CXIX, CXX…
  fontSize: pt(TITLE), // the hidden heading line, measured in the headings' face
  breakBefore: { enabled: false }, marginTop: pt(2 * LEAD), advancedDesign: chapterHead };
// The keep rules are on by default. avoidWidows keeps widowMinLines (2) lines of a paragraph
// at the foot of a page, and headings.keepWithNext takes the head along when the paragraph
// moves on; avoidOrphans keeps two lines at the head of the next page; avoidRunts weighs a
// last line shorter than about 20 characters as a fault. Column balancing adds lines above
// a head so that the page ends on line 33.
// #endregion

// #region text: a pocket page of 33 lines, in Portuguese
const bodyText = { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD),
  color: col('ink'), referenceColor: col('ink'), // a :ref added later prints in ink
  firstLineIndent: mm(5) }; // every paragraph indented, the first after a head too
const page = { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LEAD * PT), // 16.3 mm
    left: mm(INNER), right: mm(OUTER), mirror: true } };
const LOCALE = 'pt'; // the Portuguese hyphenation patterns
// #endregion

// #region heads: the book's title over the verso, the chapter over the recto, folios at the foot
const SHIFT = (INNER - OUTER) / 2; // mm: the text block sits off the page's centre
const [HEAD_Y, FOLIO_Y] = [8.5, 167]; // mm below the top edge
const head = (id, content, parity, x) => ({ kind: 'text', id, content, parity,
  pages: 'body', // never on the cover or the plate, which are opener pages
  ...caps(7.5, TRACK), color: col('muted'), align: 'center',
  placement: at('page', 'top', x, HEAD_Y) });
const folio = (id, parity, edge, x) => ({ kind: 'text', id, content: '{pageNumber}', parity,
  pages: 'body', ...caps(7.5, 0), color: col('ink'), placement: at('page', edge, x, FOLIO_Y) });
const header = { elements: [
  head('verso-title', '{title}', 'even', -SHIFT), // the title in the frontmatter
  head('recto-chapter', '{chapterTitle}', 'odd', SHIFT), // last chapter begun on or before it
] };
const footer = { elements: [folio('verso-folio', 'even', 'top-left', OUTER),
  { ...folio('recto-folio', 'odd', 'top-right', -OUTER), align: 'right' }] };
// #endregion

// #region cover: the cover and the plate, heading styles that fill a page each
// span: 'page', in one column too, makes each an opener page: its art runs past the foot of
// the text column, and no running head or folio prints on it. Each design reaches the foot of
// the page, so the heading reserves the whole page and the text starts on the next one.
const onPage = (y, size) => ({ ...at('page', 'top', 0, y), ...(size && { size }) });
const cover = { id: 'cover', numbered: false, span: 'page',
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'box', id: 'top-band', style: { backgroundColor: col('plum') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(62) } } },
    { kind: 'text', id: 'author', content: '{author}', ...caps(10, 2.4), color: col('paper'),
      align: 'center', placement: at('page', 'top', 0, 44) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(44),
      lineHeight: 1, color: col('plum'), align: 'center', overflow: 'wrap',
      placement: onPage(72, { width: 'fill' }) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5),
      color: col('saffron'), placement: onPage(111, { width: mm(12) }) },
    { kind: 'box', id: 'foot-band', style: { backgroundColor: col('plum') },
      placement: { ...at('page', 'top-left', 0, 124), size: { width: 'fill', height: mm(54) } } },
    { kind: 'image', id: 'roundel', resourceId: 'roundel',
      placement: onPage(133, { width: mm(20) }) },
    { kind: 'text', id: 'series', content: 'Coleção Casuarina', ...caps(7.5, 1.8),
      color: col('saffron'), align: 'center', placement: at('page', 'top', 0, 159) },
  ] } } };
// The plate faces the first page of text: the morning sea off Flamengo, captioned with the
// line of chapter CXXIII it illustrates, which the heading carries in its quote attribute.
const plate = { id: 'plate', numbered: false, span: 'page',
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'sea', resourceId: 'sea',
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: 'fill' } } },
    { kind: 'text', id: 'label', content: '{titleText}', ...caps(7.5, 1.6), color: col('saffron'),
      align: 'center', placement: at('page', 'top', 0, 146) },
    { kind: 'text', id: 'quote', content: '{attr.quote}', fontFamily: TEXT, italic: true,
      fontSize: pt(8.6), lineHeight: 1.35, color: col('paper'), align: 'center', overflow: 'wrap',
      placement: onPage(152, { width: mm(78) }) },
  ] } } };
const resources = [
  { id: 'roundel', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'roundel.svg', width: 60, height: 60 },
    altText: 'The series mark: a casuarina tree in a ring.' },
  // The plate is a painting, a JPEG in assets/ cut to the trim, declared at its pixels.
  { id: 'sea', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'plate-1100.jpg', format: 'jpeg', width: 1100, height: 1780 },
    altText: 'A heavy morning sea under the Sugarloaf, a low sun, and a lone swimmer among '
      + 'the breakers.' },
];
// #endregion

// The colophon floats to the foot of the last page, beside the series roundel.
const colophon = { id: 'colophon', placement: 'bottom', backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, marginBottom: pt(0),
  icon: { kind: 'resource', resourceId: 'roundel', size: mm(10) }, titleStyle: { gap: mm(3) },
  body: { fontFamily: TEXT, fontSize: pt(7.6), lineHeight: pt(LEAD * 0.8), color: col('muted'),
    italicColor: col('muted'), textAlign: 'left', firstLineIndent: pt(0) } };

const config = () => ({
  locale: LOCALE,
  colorPalette,
  page,
  layout: { layoutType: 'single' },
  bodyText,
  // The heading's own line is hidden under its design but still measured, in this face.
  headings: { fontFamily: LABEL, fontWeight: 600, levels: [chapters] },
  headingStyles: [cover, plate],
  calloutStyles: [colophon],
  header,
  footer,
});

// #region art: the series roundel, drawn in code in the book's two inks
let seed = 1871; // Mulberry32, seeded: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" `
  + `height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const line = (d, stroke, width, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// The casuarina of Bento's garden (chapter II): a leaning trunk, and branches that arch out
// on alternate sides and let their needles hang.
function roundelSvg() {
  const { plum, saffron } = palette;
  const out = [`<circle cx="30" cy="30" r="29" fill="${saffron}"/>`,
    line('M30 30m-25.5 0a25.5 25.5 0 1 0 51 0a25.5 25.5 0 1 0 -51 0', plum, 0.9),
    line('M28.6 50Q30.6 33 30.2 10.5', plum, 1.6), line('M18.5 50.2H41.5', plum, 1.3)];
  for (let k = 0; k < 9; k++) {
    const side = k % 2 ? 1 : -1;
    const y0 = 12.5 + k * 3.7;
    const reach = (3 + k * 1.55) * (0.8 + rand() * 0.35);
    const x1 = 30.2 + side * reach;
    const y1 = y0 + 1.2 + rand() * 1.4;
    out.push(line(`M30.2 ${n(y0)}Q${n(30.2 + side * reach * 0.5)} ${n(y0 - 2.2)} ${n(x1)} ${n(y1)}`,
      plum, 0.95));
    const strands = 3 + Math.round(reach / 1.6);
    for (let j = 1; j <= strands; j++) { // needles hang from the arch
      const u = j / (strands + 0.5);
      const x = 30.2 + side * reach * u;
      const y = y0 + (y1 - y0) * u ** 2 - 2.2 * 2 * u * (1 - u) + 0.3;
      out.push(line(`M${n(x)} ${n(y)}q${n(side * 0.4)} ${n(2)} ${n(side * 0.1)} `
        + `${n(3 + rand() * 2.4)}`, plum, 0.7));
    }
  }
  return svg(60, 60, out.join(''));
}

// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
// Dom Casmurro in Portuguese, in the first edition's spelling: the cover, the plate, then
// pages 213 to 217 (:::numbering in the text), from the end of chapter CXVIII.
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  Tinos: ['400', '400i'], // text, colophon; italic: the plate's quote, the colophon's title
  'Abril Fatface': ['400'], // chapter numerals and the cover title
  'League Spartan': ['600'], // chapter titles, running heads, folios, the cover's capitals
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('roundel.svg', roundelSvg());
await loadImage('plate-1100.jpg', asset('plate-1100.jpg'));
// #region excerpt: these pages continue a book: chapter CXVIII is under way, the next is CXIX
const continuation = { headings: { h1: 118, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } };
// #endregion
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Dom Casmurro, a pocket edition',
  es: 'Dom Casmurro, edición de bolsillo' }) });

// @kit core fonts viewer images
