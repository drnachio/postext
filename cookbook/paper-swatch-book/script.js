// ═══ Postext Cookbook · Nº 101 · A swatch book, every leaf on its own paper ═══════════
// https://postext.dev/en/cookbook/paper-swatch-book
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Crimson Pro, Libre Caslon Display, IBM Plex Sans Cond. (OFL) · Needs postext ≥ 1.25.0
//
// A paper merchant's stock book: each leaf sits inside a :::paper fence that names its stock,
// and postext-folio draws that leaf with the stock's shade, surface, stiffness and opacity.
// Turn the leaves and compare: the gloss sheet turns flat and stiff, the bible paper falls
// over at once and shows its back through, the card covers turn as boards.
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'paper-swatch-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the house colours, and the four process inks the gloss page shows
const palette = {
  ink: '#22201d', // text
  oxblood: '#5e2128', // the covers' colour field, kickers and folios
  cream: '#f3ead6', // type on the covers
  rule: '#cbc2b3', // hairlines
  muted: '#6f675e', // labels, folios, the colophon
  cyan: '#00a0e0', magenta: '#e0007a', yellow: '#ffe100', key: '#1b1b1b', // process inks
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.oxblood, model: 'hex' } },
];
// #endregion
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [120, 176, 18, 20, 16, 14]; // mm
const LEAD = 13.4; // pt
const label = { fontFamily: 'IBM Plex Sans Condensed', fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', align: 'left' };
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  placement, ...look });

// #region folio: the book's own paper and binding; the leaves' papers come from the text
const folio = {
  tilt: 24,
  // The paper of any page outside a :::paper fence (there are none here). Each fence's
  // attributes override these field by field, and past them the stock's defaults apply.
  paper: { type: 'uncoated' },
  // 'pages': page 1 turns as the front board and page 12, a verso, as the back board, so no
  // case is drawn round the block (gotcha: folio-cover-pages-even).
  binding: { type: 'paperback', cover: 'pages', coverMaterial: 'paper' },
  surface: { type: 'linen' },
  lighting: { environment: 'daylight', intensity: 1 },
};
// #endregion

// #region covers: a colour field to the bleed, for the front and the back of the book
const field = { kind: 'box', id: 'field', style: { backgroundColor: col('oxblood') },
  placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(TRIM_H) } } };
const front = { enabled: true, minHeight: mm(TRIM_H), slot: { elements: [field,
  text('kicker', '{attr.kicker}', { ...label, fontSize: pt(7.5), color: col('cream') },
    at('page', 'top-left', INNER, 22)),
  text('title', '{titleText}', { fontFamily: 'Libre Caslon Display', fontSize: pt(52),
    lineHeight: 0.95, color: col('cream'), align: 'left' },
  { ...at('#kicker', 'below', 0, 30), size: { width: mm(TRIM_W - INNER - OUTER) } }),
  text('subtitle', '{subtitle}', { fontFamily: 'Crimson Pro', italic: true,
    fontSize: pt(12), lineHeight: 1.3, color: col('cream'), align: 'left' },
  { ...at('#title', 'below', 0, 6), size: { width: mm(80) } }),
  text('season', '{attr.season}', { ...label, fontSize: pt(7), color: col('cream') },
    at('page', 'bottom-left', INNER, -18)),
] } };
const back = { enabled: true, minHeight: mm(TRIM_H), slot: { elements: [field,
  text('name', '{titleText}', { fontFamily: 'Libre Caslon Display', fontSize: pt(20),
    lineHeight: 1, color: col('cream'), align: 'center' },
  { ...at('page', 'center', 0, -4), size: { width: mm(90) } }),
  text('address', '{attr.address}', { ...label, fontSize: pt(6.8), color: col('cream'),
    align: 'center' }, { ...at('#name', 'below', 0, 4), size: { width: mm(90) } }),
] } };
// The covers are the book's two openers; the folio skips them (pages: 'body', below).
// No margins: the design's column is the whole page, so the field reaches every edge, and the
// style's margins last only as long as its section, the cover page.
const flush = { span: 'page', margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) } };
const headingStyles = [
  { id: 'cover', numbered: false, toc: false, advancedDesign: front, ...flush },
  { id: 'back', numbered: false, toc: false, advancedDesign: back, ...flush,
    breakBefore: { enabled: true, parity: 'even' } }, // the last page, a verso
];
// #endregion

// #region stock-card: the kicker over each stock's name, and the specification lines
const card = { enabled: true, minHeight: mm(25), slot: { elements: [
  text('kicker', '{attr.kicker}', { ...label, fontSize: pt(7), color: col('oxblood') },
    at('container', 'top-left', 0, 2)),
  text('name', '{titleText}', { fontFamily: 'Libre Caslon Display', fontSize: pt(24),
    lineHeight: 1.05, color: col('ink'), align: 'left' },
  { ...at('#kicker', 'below', 0, 2.5), size: { width: 'fill' } }),
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    placement: { ...at('#name', 'below', 0, 3.5), size: { width: 'fill' } } },
] } };
const spec = { id: 'spec', fontFamily: 'IBM Plex Sans Condensed', fontSize: pt(8),
  lineHeight: pt(LEAD * 0.85), textAlign: 'left', firstLineIndent: pt(0), color: col('ink'),
  boldColor: col('oxblood') };
// #endregion

const config = () => ({
  locale: 'en-us',
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Crimson Pro', fontSize: pt(10.2), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'Libre Caslon Display', color: col('ink'), fontWeight: 400, levels: [
    // A :::paper fence already starts a new page, so the stock name breaks to any side.
    { level: 1, fontSize: pt(24), breakBefore: { enabled: true, parity: 'any' },
      marginTop: pt(0), marginBottom: pt(LEAD / 2), advancedDesign: card },
    { level: 2, fontFamily: 'IBM Plex Sans Condensed', fontSize: pt(7.5), fontWeight: 600,
      letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
      lineHeight: pt(LEAD), marginTop: pt(0), marginBottom: pt(LEAD / 2) },
  ] },
  headingStyles,
  paragraphStyles: [spec,
    { id: 'entry', fontSize: pt(8.4), lineHeight: pt(11.5), textAlign: 'left',
      firstLineIndent: pt(0), hangingIndent: mm(4), marginTop: pt(3) },
    { id: 'colophon', fontFamily: 'IBM Plex Sans Condensed', fontSize: pt(6.8),
      lineHeight: pt(9.4), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
      marginTop: pt(2 * LEAD) }],
  header: { elements: [] },
  footer: { elements: [text('folio', '{pageNumber} · {title}', { ...label, fontSize: pt(6.5),
    color: col('muted'), align: 'center', pages: 'body' }, at('page', 'bottom', 0, -10))] },
  folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region paper-runs: each leaf's stock is a :::paper fence around its two pages
// :::paper{type=bookWove grammage=80}
// ## Book Wove, Natural {kicker="Stock 1 of 4"}
// … the stock card, a :::pagebreak, the specimen page …
// :::
// A fence starts and ends on a new page; each run here fills one leaf, recto and verso
// (gotcha: paper-run-whole-leaves). Canvas, HTML and PDF ignore the stock; Folio draws it.
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Crimson Pro': ['400', '400i', '700'],
  'Libre Caslon Display': ['400'],
  'IBM Plex Sans Condensed': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: 'The Stock Book · four papers in Folio' });

// #region answer: every page carries its stock; the viewer draws each leaf with it
const stocks = doc.pages.map((page) => page.paper?.type ?? 'the book’s paper');
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = 'The stock book in 3D';
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, {
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' },
  alt: (i) => `Page ${i + 1}, printed on ${stocks[i]}`,
  // page.paper is the fence's attributes as written: { type: 'bible', grammage: 40 }.
  onChange: ({ pages }) => kitStatus(pages.map((i) => `p. ${i + 1}: ${stocks[i]}`
    + (doc.pages[i].paper?.grammage ? ` ${doc.pages[i].paper.grammage} g/m²` : ''))
    .join(' · ')),
});
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
