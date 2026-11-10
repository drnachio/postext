// ═══ Postext Cookbook · Nº 185 · Logic signs from a symbol font ═════════════════════
// https://postext.dev/en/cookbook/symbol-font-for-logic
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Crimson Pro, Cormorant Garamond, IBM Plex, Noto Sans Math (OFL) · Needs postext ≥ 1.73.0
// A primer of logical notation set in faces that have no ∀, no ∈, no ℵ and no Greek:
// symbolFont names Noto Sans Math, which draws those characters on the canvas and in the PDF.
import {
  buildDocumentWithFonts, renderPageToCanvas, defaultResourceTypes, parseTSV, formatWarning,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'symbol-font-for-logic';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1f1c22', // text: a cool near-black
  accent: '#7b2a3b', // claret: the opener band, labels, the table heads
  tint: '#f4ece9', // the even rows of the truth table
  rule: '#c3b4b2', // hairlines
  muted: '#6a6064', // running heads, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const TEXT = 'Crimson Pro', DISPLAY = 'Cormorant Garamond', LABEL = 'IBM Plex Sans Condensed';
const TRIM = [155, 235], INNER = 20, OUTER = 21, TOP = 23; // mm: a trade-size primer
const LEAD = 15; // pt: the body leading

// #region answer: one symbol font behind every face, on the canvas and in the PDF
// None of the three faces has ∀, ∈, ℵ or Greek. config.symbolFont (below) lists Noto Sans
// Math after every family the document names: what a face lacks is drawn from it, at the
// face's size and colour, in the canvas, the PDF, the HTML and the EPUB.
const SYMBOLS = 'Noto Sans Math';
// Fontsource serves Noto Sans Math whole in its "latin" file, and the kit would declare
// that file for the Latin range only. The screen and the PDF take it here with no range,
// so every glyph in it can be used.
const symbolFile = async () =>
  `${await fontsourceAt('noto-sans-math')}files/noto-sans-math-latin-400-normal.woff2`;
const resolve = async (family, ...face) =>
  (family === SYMBOLS ? [{ source: await symbolFile() }] : fontsourceResolver(family, ...face));
const pdfFonts = async (family, ...face) => (family !== SYMBOLS
  ? fontsourceProvider(family, ...face)
  : decompressWoff2(new Uint8Array(await (await fetch(await symbolFile())).arrayBuffer())));
// #endregion

// #region opener: a claret band with the chapter's signs set large
const BAND = 78; // mm from the trim to the foot of the band
const onBand = { color: col('paper'), align: 'left' };
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' }, offset: { y: mm(y) },
  size: { width: mm(width) } });
const opener = { enabled: true, minHeight: mm(BAND - TOP + 2), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
    placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { height: mm(BAND) } } },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...onBand, fontFamily: LABEL,
    fontWeight: 600, fontSize: pt(8.5), letterSpacing: pt(1.8), textTransform: 'uppercase',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(2) } } },
  { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: DISPLAY,
    fontWeight: 600, fontSize: pt(38), lineHeight: 1.02, placement: below('kicker', 3, 110) },
  // The signs are text in Cormorant Garamond, which has none of them: Noto Sans Math draws
  // every one, at 30 pt, in the band's white.
  { kind: 'text', id: 'signs', content: '{attr.signs}', ...onBand, fontFamily: DISPLAY,
    fontSize: pt(30), lineHeight: 1, letterSpacing: pt(9), placement: below('title', 7, 114) },
] } };
// #endregion

// #region running-heads: the book on the verso, the section on the recto
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5),
  fontWeight: 500, letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra });
const folio = { fontWeight: 600, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  // A section title such as "Quantifiers: ∀ and ∃" takes its signs from the symbol font too.
  head('recto-title', '{firstMark.h2}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
  ...folio, pages: 'opener',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(9) } } })] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  symbolFont: SYMBOLS,
  resourceTypes: defaultResourceTypes(LANG),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM[0]), height: mm(TRIM[1]), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(22), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 600,
    levels: [
      { level: 1, fontSize: pt(38), breakBefore: { parity: 'odd' }, advancedDesign: opener,
        marginBottom: pt(0) },
      { level: 2, fontSize: pt(16), lineHeight: pt(LEAD * 1.2), color: col('accent'),
        marginTop: pt(LEAD), marginBottom: pt(LEAD * 0.3) },
    ] },
  paragraphStyles: [
    // Displayed formulas: centred, in the text face, a size up; the signs still come from
    // the symbol font, the italic variables from Crimson Pro.
    { id: 'formula', fontSize: pt(12), lineHeight: pt(LEAD * 1.2), textAlign: 'center',
      firstLineIndent: pt(0), hyphenation: { enabled: false } },
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerBold: true,
    headerFontFamily: LABEL, headerFontSize: pt(8.5), bodyFontFamily: TEXT,
    bodyFontSize: pt(10), bodyColor: col('ink'), cellPadding: mm(1.1) },
  captionStyle: { fontFamily: LABEL, fontSize: pt(8), color: col('ink'), labelBold: true,
    labelColor: col('accent'), note: { color: col('muted') } },
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const signs = /* @content:signs */ ''; // TSV: sign, read as, made current by

// #region tables: the truth table from the connectives themselves, the signs from TSV
const [T, F] = t({ en: ['T', 'F'], es: ['V', 'F'] });
const connectives = [['¬*p*', (p) => !p], ['*p* ∧ *q*', (p, q) => p && q],
  ['*p* ∨ *q*', (p, q) => p || q], ['*p* → *q*', (p, q) => !p || q],
  ['*p* ↔ *q*', (p, q) => p === q]];
const cell = (content, isHeader = false) => ({ content, align: 'center', isHeader });
const truth = [[true, true], [true, false], [false, true], [false, false]].map(([p, q]) =>
  [p, q, ...connectives.map(([, f]) => f(p, q))].map((v) => cell(v ? T : F)));
const table = (id, rows, columnWidths, caption, position) => ({ id, typeId: 'table',
  kind: 'table', caption, createdAt: 0, updatedAt: 0, placement: { position },
  table: { model: { headerRowCount: 1, columnWidths, rows } } });
const resources = [
  table('truth', [['*p*', '*q*', ...connectives.map(([s]) => s)].map((s) => cell(s, true)),
    ...truth],
    [1, 1, 1.3, 1.6, 1.6, 1.6, 1.6], t({ en: 'The five connectives, row by row.',
      es: 'Las cinco conectivas, fila a fila.' }), 'top'), // to the head of a page
  table('signs', parseTSV(signs.trim()).rows.map((row, r) => row.map(({ content }, c) => ({
    content, align: c === 0 ? 'center' : 'left', isHeader: r === 0 }))), [0.8, 2.1, 5.3],
  t({ en: 'Where the signs come from.', es: 'De dónde vienen los signos.' }), 'here'),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Crimson Pro': ['400', '400i', '600'],
  'Cormorant Garamond': ['400', '600'], // 400: the line of signs, all of it from the symbol font
  'IBM Plex Sans Condensed': ['400', '500', '600', '700', '700i'],
  'Noto Sans Math': ['400'], // the symbol font: one upright regular for every face
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region without: one build without the symbol font, to read what it reports
// Each paragraph that sets a character its face lacks is a glyphFallbackAt warning with its
// page; with no symbol font it names no family that draws them, and the PDF would print
// empty boxes. The pages shown are the second build's.
const fonts = { ...kitFonts(FONTS), resolve }; // the kit's resolver, with the symbol file
const bare = await buildDocumentWithFonts({ markdown, resources }, { ...config, symbolFont: '' },
  fonts);
console.info((bare.contentWarnings ?? []).filter((w) => w.kind === 'glyphFallbackAt')
  .map(formatWarning).join('\n'));
// #endregion
const doc = await buildDocumentWithFonts({ markdown, resources }, config, fonts);
showPages(doc, { title: t({ en: 'A pocket primer of logic', es: 'Cartilla de lógica' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: pdfFonts }), `${RECIPE}.pdf`);

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
