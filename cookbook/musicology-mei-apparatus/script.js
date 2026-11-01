// ═══ Postext Cookbook · Nº 165 · MEI music examples with a critical apparatus ═════
// https://postext.dev/en/cookbook/musicology-mei-apparatus
// Code: MIT · Text: original (CC BY 4.0) · Music: Sumer is icumen in, after Rockstro (PD)
// Fonts: Crimson Pro, Cormorant Garamond, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.66.0
import {
  buildDocumentWithFonts, renderPageToCanvas, initMusicEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'musicology-mei-apparatus';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a rubric red for kickers, labels and the notes' rule; ink on cream
const palette = {
  ink: '#211d1a', // text and notation: a warm near-black
  rubric: '#8c2f1f', // the one accent, the red of the manuscript's rubrics
  muted: '#6c645b', // running heads, colophon
  rule: '#cbbfae', // hairlines
  paper: '#fcfaf6',
};
// col(id): a colour linked to its palette entry, with the entry's hex beside the id.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, never the default blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
// #endregion
const MARGIN = { top: 22, bottom: 22, inner: 19, outer: 21 }; // 156 × 234 mm, mirrored
const LEAD = 14.5; // body leading in pt: the baseline grid
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const label = { fontFamily: 'Source Sans 3', fontWeight: 600, textTransform: 'uppercase' };

// #region answer: MEI examples engraved in the text, their apparatus in footnotes
// In the Markdown each example is a ```mei fence. A variant is encoded where it stands,
// <app><lem>…</lem><rdg source="#Hw #Bu">…</rdg></app>: the staff shows the lemma, and
// the file keeps the reading for anyone who opens the encoding. The apparatus entry is a
// footnote cited from the paragraph that discusses the bar: `[^b40]: **b. 40, n. 2** A ] G`.
const scoreStyle = {
  staffSize: mm(5), // running-text examples: 4.5–5.5 mm
  musicFont: 'Leipzig', // lighter than Bravura, close to a 19th-century plate
  textFont: 'Crimson Pro', // the underlay in the book's own face
  barNumbers: 'system', // the apparatus is keyed by bar: number every system
  spacing: 0.95,
  systemGap: mm(4),
  marginTop: pt(4),
  marginBottom: pt(LEAD / 2),
  color: col('ink'),
  minSystemsAtBreak: 2, // never leave one system of an example alone at a page foot
};
const footnotes = {
  placement: 'column', // the foot of the page in one column
  numbering: 'chapter',
  fontSize: pt(8.5),
  lineHeight: pt(10.75),
  hangingIndent: em(1.2), // turnover lines align past the number
  spaceBetween: pt(2),
  separator: { width: 0.2, lineWidth: pt(0.5), color: col('rubric') },
};
// #endregion

// #region opener: kicker, a Cormorant italic title and a short red rule, sunk 50 mm
const opener = {
  enabled: true,
  minHeight: mm(50), // every chapter's text starts on the same grid line
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, fontSize: pt(8.5),
      letterSpacing: pt(1.8), color: col('rubric'), align: 'left',
      placement: at('container', 'top-left', 0, 8) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Cormorant Garamond',
      italic: true, fontWeight: 500, fontSize: pt(29), lineHeight: 1.05, color: col('ink'),
      align: 'left', overflow: 'wrap', // design text ends in an ellipsis by default
      placement: { ...at('#kicker', 'below', 0, 3), size: { width: mm(100), height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('rubric'),
      placement: { ...at('#title', 'below', 0, 5), size: { width: mm(14) } } },
  ] },
};
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on the opener
  ...label, fontSize: pt(7.5), letterSpacing: pt(1.3), color: col('muted'),
  placement: at('page', edge, x, 13), ...extra,
});
const folio = { color: col('rubric'), fontWeight: 700 };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer,
    { ...folio, align: 'left' }),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 8, { align: 'left' }),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 8),
    { align: 'right', overflow: 'ellipsis' }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer,
    { ...folio, align: 'right' }),
] };
// The opener carries a drop folio instead, centred under the text block.
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, align: 'center', placement: at('page', 'bottom', 0, -11) }), pages: 'opener' }] };
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }), // the language of the hyphenation patterns
  colorPalette,
  page: { sizePreset: 'custom', width: mm(156), height: mm(234), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Crimson Pro', fontSize: pt(11), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'Crimson Pro', color: col('ink'),
    // A page whose next line cannot take its footnote ends short: at most one extra grid
    // line goes above a heading, the rest stays at the foot, as in a book with notes.
    balancing: { maxLinesPerHeading: 1 },
    levels: [
    { level: 1, advancedDesign: opener, marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'odd' } },
    { level: 2, fontFamily: 'Cormorant Garamond', fontSize: pt(14), lineHeight: pt(LEAD),
      fontWeight: 600, italic: true, color: col('ink'), marginTop: pt(LEAD), marginBottom: pt(3) },
    // The example labels: a heading keeps itself with the score under it.
    { level: 3, ...label, fontSize: pt(7.5), lineHeight: pt(LEAD), letterSpacing: pt(1.1),
      color: col('rubric'), marginTop: pt(LEAD / 2), marginBottom: pt(0) },
  ] },
  paragraphStyles: [
    { id: 'colophon', ...label, textTransform: 'none', fontWeight: 400, fontSize: pt(7.5),
      lineHeight: pt(10), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
      marginTop: pt(LEAD) },
  ],
  scoreStyle,
  footnotes,
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build with the ones the config names.
const FONTS = {
  'Crimson Pro': ['400', '400i', '600', '600i', '700'],
  'Cormorant Garamond': ['500i', '600i'],
  'Source Sans 3': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await initMusicEngine(); // Verovio, loaded only by books that hold a score
const doc = await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Music examples with a critical apparatus',
  es: 'Ejemplos musicales con aparato crítico' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
