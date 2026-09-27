// ═══ Postext Cookbook · Nº 001 · Your recipe title ═══════════════════════════════
// https://postext.dev/en/cookbook/new-recipe
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.4.1
//
// The template for a new recipe (`pnpm cookbook new <slug>` copies it and fills in the
// slug and the Nº). It already runs, and it already clears the design bar: a trade-book
// page with mirrored margins, a three-voice palette, a quiet chapter opener and running
// heads. Keep what serves your recipe, replace the rest, and read cookbook/README.md.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'new-recipe';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Everything that makes these pages look the way they do. Start reading here.
// #region palette: semantic colours, every one linked by id
const palette = {
  ink: '#1e1c1a', // text: a warm near-black, never #000
  accent: '#9b3a26', // the one accent: kickers, rules, bullets
  tint: '#f3eee5', // box backgrounds
  rule: '#cdc4b6', // hairlines
  muted: '#6e675f', // running heads, notes, credits
  paper: '#ffffff',
};
// Every colour links to its palette entry, so a reader can retint the whole book.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, so any default
  // this config does not restate follows the design instead of printing blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const OUTER = 17; // outer margin in mm: the running heads and folios align to it
const LEAD = 14.5; // body leading in pt: the baseline grid

// #region answer: a quiet chapter opener: kicker, title and a short rule, sunk 52 mm
const opener = {
  enabled: true,
  minHeight: mm(52), // the sink: the body starts this far below the top margin
  slot: {
    elements: [
      { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: 'Source Sans 3',
        fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1.6), textTransform: 'uppercase',
        color: col('accent'), align: 'left',
        placement: { anchor: { to: 'container', edge: 'top-left' },
          offset: { x: mm(0), y: mm(12) } } },
      { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Source Serif 4',
        fontSize: pt(27), lineHeight: 1.08, fontWeight: 700, color: col('ink'), align: 'left',
        overflow: 'wrap', // design text ends in an ellipsis by default
        placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
          size: { width: mm(96), height: 'auto' } } },
      { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5), color: col('accent'),
        placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(5) },
          size: { width: mm(14) } } },
    ],
  },
};
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers or blank pages
  fontFamily: 'Source Sans 3', fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } },
  ...extra,
});
const folio = { fontWeight: 700, color: col('ink') };
const header = {
  elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
    head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 9)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ],
};
// Openers carry a drop folio instead, centred 9 mm under the text block.
const footer = {
  elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
    ...folio, pages: 'opener',
    placement: { anchor: { to: 'container', edge: 'top' }, offset: { x: mm(0), y: mm(9) } },
  })],
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  resourceTypes: defaultResourceTypes(LANG), // "Figura" in Spanish (gotcha: resource-types-locale)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(156), height: mm(234), dpi: 150,
    margins: { top: mm(22), bottom: mm(26), left: mm(20), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: 'Source Serif 4', fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: 'Source Serif 4', color: col('ink'), fontWeight: 700,
    levels: [
      // Restated on purpose: any headings object drops the H1 break
      // (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(27), breakBefore: { enabled: true, parity: 'odd' },
        advancedDesign: opener },
      { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), fontWeight: 400, italic: true,
        color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0) },
      { level: 3, fontFamily: 'Source Sans 3', fontSize: pt(8.5), lineHeight: pt(LEAD),
        textTransform: 'uppercase', marginTop: pt(LEAD), marginBottom: pt(0) },
    ],
  },
  // Lists sit on the grid with no extra space; numbers are 'arabic', never 'decimal'.
  unorderedLists: { bulletChar: '–', color: col('accent'), fontWeight: 400,
    marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { numberFormat: 'arabic', color: col('accent'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'colophon', fontFamily: 'Source Sans 3', fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  // Styles for boxes, tables and captions, so none of them ever falls back to the default skin.
  calloutStyles: [
    { id: 'note', title: t({ en: 'Note', es: 'Nota' }), background: col('tint'),
      stripe: { enabled: true, side: 'left', width: pt(2.5), color: col('accent') },
      padding: { top: mm(3), right: mm(4), bottom: mm(3), left: mm(4) },
      titleStyle: { fontFamily: 'Source Sans 3', fontSize: pt(7.5), fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: pt(1.2), color: col('accent') },
      body: { fontSize: pt(9.5), lineHeight: pt(13), color: col('ink'), firstLineIndent: pt(0),
        boldColor: col('ink'), italicColor: col('ink') } },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Source Sans 3',
    bodyFontFamily: 'Source Serif 4', bodyFontSize: pt(9), bodyColor: col('ink'),
    cellPadding: mm(1.4) },
  captionStyle: { fontFamily: 'Source Serif 4', fontSize: pt(8.5), color: col('ink'),
    labelBold: true, labelColor: col('accent'), descriptionItalic: true,
    note: { color: col('muted') } },
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses. Layout measures with the browser's fonts, so the
// kit loads them from Fontsource before the first build (gotcha: fonts-first).
const FONTS = {
  'Source Serif 4': ['400', '400i', '700', '700i'],
  'Source Sans 3': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showPages(doc, { title: t({ en: 'Your recipe title', es: 'El título de tu receta' }) });
// Pictures (README §5.3): add "images" to recipe.json kit and registerResourceImage to the
// import, then `await loadImage('photo.jpg', asset('photo-2400.jpg'))` before the build.
// A PDF: add "pdf" to outputs and kit, import renderToPdf and decompressWoff2 from postext-pdf,
// then `offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`)`.

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
