// ═══ Postext Cookbook · Nº 073 · An index of names and an index of subjects ═══════
// https://postext.dev/en/cookbook/names-and-subjects-indexes
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Crimson Pro, Bodoni Moda, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'names-and-subjects-indexes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a warm black, one brick red for kickers, letter heads and folios
const palette = {
  ink: '#211d19', // text: a warm near-black
  brick: '#8e3b24', // the one accent
  muted: '#6d645a', // running heads, colophon
  rule: '#c8bba9', // hairlines
  paper: '#fcfaf5',
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, never the default blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.brick, model: 'hex' } },
];
// #endregion
const TRIM = { width: 155, height: 235 }; // a scholarly monograph
const MARGIN = { top: 22, bottom: 24, inner: 19, outer: 22 }; // mirrored: 114 mm measure
const LEAD = 13.6; // body leading in pt
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const label = { fontFamily: 'Libre Franklin', fontWeight: 600, textTransform: 'uppercase' };

// #region answer: two indexes from one text, each under a two-column heading style
// Marks in the Markdown. A person goes to the names index, inverted:
//   :index[Aldus Manutius]{term="Manutius, Aldus" index="names" main}
// A subject goes to the main index, with levels split by "!" and a sort key when the
// printed form would file in the wrong place:
//   :index[textura]{term="Blackletter!textura" main}
//   :index{term="42-line Bible" sort="Forty-two-line Bible"}
//   :index{term="Cursive" see="Italic"}
// Printed at the end, each under its own heading:
//   # Index of Names {style="index"}    then    :::index{index="names"}
//   # Index of Subjects {style="index"} then    :::index
const indexHeading = {
  id: 'index',
  numbered: false, // no chapter number, and the next chapter is still chapter 5
  breakBefore: { enabled: true, parity: 'any' },
  layout: { layoutType: 'double', gutterWidth: mm(7) }, // the section after the heading
};
const index = {
  fontSize: pt(8.6), lineHeight: pt(11.2), // one leading for entries and letter heads
  indent: em(1), turnoverIndent: em(2),
  rangeFormat: 'chicago', // 212–14, as a monograph prints it
  main: { bold: true }, // the page of the principal discussion
  groups: { fontFamily: 'Bodoni Moda', fontSize: pt(11), fontWeight: 600, color: col('brick') },
};
// #endregion

// #region opener: kicker, a Bodoni italic title and a short rule, sunk to the same line
const opener = (sink, size) => ({
  enabled: true,
  minHeight: pt(LEAD * sink), // the text starts on the same grid line in every chapter
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, fontSize: pt(7.8),
      letterSpacing: pt(1.6), color: col('brick'), align: 'left',
      placement: at('container', 'top-left', 0, 10) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Bodoni Moda', italic: true,
      fontSize: pt(size), lineHeight: 1.08, color: col('ink'), align: 'left',
      overflow: 'wrap', // design text ends in an ellipsis by default
      placement: { ...at('#kicker', 'below', 0, 3), size: { width: 'fill', height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75), color: col('brick'),
      placement: { ...at('#title', 'below', 0, 4.5), size: { width: mm(16) } } },
  ] },
});
// #endregion

// #region running-heads: book title on the verso, chapter or index on the recto
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers
  ...label, fontSize: pt(7.2), letterSpacing: pt(1.3), color: col('muted'),
  placement: at('page', edge, x, 12.5), ...extra,
});
const folio = { color: col('brick'), fontWeight: 700 };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer,
    { ...folio, align: 'left' }),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 8, { align: 'left' }),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 8),
    { align: 'right' }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer,
    { ...folio, align: 'right' }),
] };
// Openers carry a drop folio instead, centred under the text block.
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, align: 'center', placement: at('page', 'bottom', 0, -12) }), pages: 'opener' }] };
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Crimson Pro', fontSize: pt(10.6), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'Bodoni Moda', fontWeight: 400, color: col('ink'), levels: [
    // Restated on purpose: any headings object drops the H1 break
    // (gotcha: headings-drop-h1-break).
    { level: 1, advancedDesign: opener(9, 26), marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'odd' } },
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), italic: true, fontWeight: 400,
      color: col('brick'), marginTop: pt(LEAD), marginBottom: pt(LEAD * 0.5) },
  ] },
  // The index heading: a shallower opener over the two columns of entries.
  headingStyles: [{ ...indexHeading, span: 'page', advancedDesign: opener(6, 20),
    marginBottom: pt(0) }],
  index,
  paragraphStyles: [
    { id: 'colophon', ...label, textTransform: 'none', fontWeight: 400, fontSize: pt(7),
      lineHeight: pt(10), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
      marginTop: pt(LEAD * 2) },
  ],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses.
const FONTS = {
  'Crimson Pro': ['400', '400i', '600', '700'],
  'Bodoni Moda': ['400', '400i', '600'],
  'Libre Franklin': ['400', '400i', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: one buildDocument, laid out again until the index's page numbers settle
// A pass finds the page of every mark and prints both indexes with those numbers. When the
// printed index moves a mark (an index set before the text would), the layout runs again,
// until no page number changes (in a buildBundle book, the chapter with :::index gets them all).
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
// #endregion
showPages(doc, { title: t({ en: 'Two indexes', es: 'Dos índices' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
