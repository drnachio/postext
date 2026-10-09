// ═══ Postext Cookbook · Nº 096 · A humanities essay with MLA works cited ══════════
// https://postext.dev/en/cookbook/mla-humanities-essay
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Spectral, Spectral SC (SIL OFL 1.1) · Needs postext ≥ 1.23.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'mla-humanities-essay';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the black glaze and the red clay of an Attic vase
const palette = {
  ink: '#1f1a17', glaze: '#231c19', clay: '#9a3d22', slip: '#e3a27e', rule: '#c9bdb0',
  muted: '#6b6159', paper: '#fffdf9',
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.clay })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Spectral', LABEL = 'Spectral SC';
const TRIM = { width: 150, height: 230 }; // a literary quarterly
const MARGIN = { top: 22, bottom: 22, inner: 19, outer: 21 };
const LEAD = 14.4; // pt
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: MLA 9 author-page citations and a Works Cited list
// The text cites with [@keats-letters, 48] → (Keats, Letters 48): MLA prints the author
// and the page, and adds a short title when two works share an author. [-@eliot1932, 230]
// drops the name the sentence already gives → (230). The list is alphabetical, and a
// second work by the same author opens with a dash (MLA's ---) instead of the name.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'modern-language-association', // MLA 9th edition, author-page
  link: true, // a citation jumps to its entry in Works Cited
  bibliography: {
    // MLA's half-inch hanging indent, scaled to a 108 mm measure.
    fontSize: em(0.94), lineHeight: pt(13.4), hangingIndent: em(2.2), entrySpacing: pt(3),
  },
};
// #endregion

// #region quotation: a block quotation, set in and upright
// More than four lines of prose go in a Markdown blockquote: in ink, indented, with no
// first-line indent. Its citation follows the final full stop, as MLA asks.
const blockquote = {
  color: col('ink'), italic: false, indent: em(2), firstLineIndent: em(0),
};
// #endregion

// #region opener: the title in a band of black glaze with a red clay foot
const BAND = 116; // mm from the trim's top
const opener = {
  enabled: true,
  minHeight: mm(BAND - MARGIN.top + 4), // the text starts a line under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('glaze') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'box', id: 'foot', style: { backgroundColor: col('clay') },
      placement: { ...at('page', 'top-left', 0, BAND - 3), size: { width: 'fill',
        height: mm(3) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(9), letterSpacing: pt(1.6), color: col('slip'), align: 'left',
      placement: at('container', 'top-left', 0, 6) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontWeight: 300,
      italic: true, fontSize: pt(56), lineHeight: 0.95, color: col('paper'), align: 'left',
      overflow: 'wrap', placement: { ...at('container', 'top-left', -1, 30),
        size: { width: mm(110), height: 'auto' } } },
    { kind: 'text', id: 'sub', content: '{attr.sub}', fontFamily: TEXT, fontWeight: 300,
      fontSize: pt(13), lineHeight: 1.25, color: col('paper'), align: 'left', overflow: 'wrap',
      placement: { ...at('container', 'top-left', 0, 66),
        size: { width: mm(96), height: 'auto' } } },
    { kind: 'text', id: 'byline', content: '{attr.byline}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(9.5), letterSpacing: pt(1.2), color: col('slip'), align: 'left',
      placement: at('container', 'top-left', 0, 82) },
  ] },
};
// #endregion

const head = (id, content, parity, edge, x, align) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontWeight: 500,
  fontSize: pt(8.5), letterSpacing: pt(1), color: col('muted'), align,
  placement: at('page', edge, x, 12),
});

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  citations,
  page: {
    sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(10.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true, blockquote,
  },
  headings: {
    fontFamily: LABEL, fontWeight: 600, color: col('clay'),
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontFamily: TEXT, fontSize: pt(56), marginBottom: pt(0),
        breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
      { level: 2, fontSize: pt(11.5), letterSpacing: pt(0.9), lineHeight: pt(LEAD),
        marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    ],
  },
  // #region works-cited: MLA starts the list on a page of its own
  headingStyles: [{ id: 'works-cited', breakBefore: { enabled: true, parity: 'any' } }],
  // #endregion
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD * 2) },
  ],
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, 'left'),
    head('verso-author', '{attr.byline}', 'even', 'top-left', MARGIN.outer + 8, 'left'),
    head('recto-title', '{title}', 'odd', 'top-right', -(MARGIN.outer + 8), 'right'),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, 'right'),
  ] },
  footer: { elements: [ // a drop folio where the running heads stand down
    { ...head('drop-folio', '{pageNumber}', 'all', 'top', 0, 'center'),
      pages: 'opener', placement: at('container', 'top', 0, 9) },
  ] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses (gotcha: fonts-first).
const FONTS = {
  Spectral: ['300', '300i', '400', '400i', '600', '600i'],
  'Spectral SC': ['400', '500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
const title = t({ en: 'A humanities essay with MLA works cited',
  es: 'Un ensayo de humanidades con obras citadas en MLA' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
