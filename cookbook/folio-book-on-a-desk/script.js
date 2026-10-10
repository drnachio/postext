// ═══ Postext Cookbook · Nº 100 · A laid-out book on the desk, in 3D ═══════════════════
// https://postext.dev/en/cookbook/folio-book-on-a-desk
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Literata, Fraunces, Work Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// A chapter of a short novel, laid out on a trade-book page and opened with postext-folio as a
// cloth-bound book lying on a walnut desk. Take the right-hand page by its edge and drag it
// over, click a page, or use the arrow keys. The flat pages follow under the book.
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'folio-book-on-a-desk';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, every one linked by id
const palette = {
  ink: '#211d1a', // text: a warm near-black
  accent: '#2f5d50', // bottle green: kicker, rule, folios, and the cloth of the case
  rule: '#c9bfae', // the colophon's hairline
  muted: '#6d655c', // running heads and the colophon
  cream: '#f7f0e1', // the book wove the pages are printed on (the 3D paper only)
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [129, 198, 20, 22, 17, 15]; // mm: B-format
const LEAD = 14; // pt: the body leading

// #region folio: what the book is made of and where it lies; layout never reads it
const folio = {
  tilt: 26, // degrees from straight above: enough to see the depth of the page block
  paper: { type: 'bookWove', grammage: 70, shade: col('cream') }, // a bulky cream novel paper
  binding: { type: 'hardcover', cover: 'case', coverMaterial: 'cloth',
    coverColor: col('accent') }, // the case wraps the pages; boards a little larger
  surface: { type: 'walnut' },
  lighting: { environment: 'studio', intensity: 1, shadows: true },
};
// #endregion

// #region opener: a sunk chapter opening, kicker, title and a short rule
const opener = { enabled: true, minHeight: mm(50), slot: { elements: [
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: 'Work Sans',
    fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.5), textTransform: 'uppercase',
    color: col('accent'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(10) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Fraunces', fontSize: pt(28),
    lineHeight: 1.05, fontWeight: 600, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(3) },
      size: { width: mm(90) } } },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.25), color: col('accent'),
    placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(4.5) },
      size: { width: mm(12) } } },
] } };
// #endregion

// #region running-heads: author on the verso, book title on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: 'Work Sans', fontSize: pt(7), fontWeight: 500,
  letterSpacing: pt(1.1), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(11) } }, ...extra });
const folioNumber = { fontWeight: 600, color: col('accent') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folioNumber),
  head('verso-author', '{author}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{title}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folioNumber),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folioNumber, pages: 'opener', placement: { anchor: { to: 'page', edge: 'bottom' },
    offset: { y: mm(-11) } } })] };
// #endregion

const config = () => ({
  locale: 'en-us',
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Literata', fontSize: pt(9.8), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'Fraunces', color: col('ink'), fontWeight: 600, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, fontSize: pt(28), breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: opener },
    { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), fontWeight: 400, italic: true,
      color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Work Sans', fontSize: pt(6.8),
    lineHeight: pt(9.5), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
    marginTop: pt(LEAD) }],
  header, footer,
  folio, // the 3D book's materials, carried in the document as doc.config.folio
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Literata: ['400', '400i', '700'],
  Fraunces: ['400i', '600'],
  'Work Sans': ['400', '500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: 'The Ferryman’s Ledger · in Folio' });

// #region answer: the document opened as a book; the container gives it its size
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = 'The book in 3D';
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, {
  // The paper, binding, desk and light come from doc.config.folio. Only the photographed
  // desk is the host's choice: without textureBaseUrl the walnut is drawn procedurally.
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' },
  onChange: ({ pages }) => kitStatus(`${doc.pages.length} pages · open at `
    + pages.map((i) => doc.pages[i].pageLabel || i + 1).join('–')),
});
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
