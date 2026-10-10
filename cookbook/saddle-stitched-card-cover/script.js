// ═══ Postext Cookbook · Nº 102 · A stapled zine with a card cover sheet ═══════════════
// https://postext.dev/en/cookbook/saddle-stitched-card-cover
// Code: MIT · Text: original (CC BY 4.0) · Pictures: drawn in code
// Fonts: Newsreader, Bricolage Grotesque (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// Eight pages, two sheets folded and stapled through the fold. The outer sheet (pages 1–2 and
// 7–8) is salmon card, the inner sheet newsprint: two :::paper fences put the card on the
// cover pages, and postext-folio draws the book saddle-stitched, closed until you turn the
// cover. The flat pages below print on white: only the 3D book knows about paper.
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'saddle-stitched-card-cover';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: two inks of a risograph, and the greys of the newsprint text
const palette = {
  ink: '#1f2124', // the text
  blue: '#0b6fb3', // the riso blue: titles, the tide lines, kickers
  muted: '#5d6066', // credits and folios
  rule: '#b9bcc0',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.blue, model: 'hex' } },
];
// #endregion
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [140, 200, 20, 22, 17, 15]; // mm
const LEAD = 13.6; // pt
const SANS = 'Bricolage Grotesque';
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'left', placement, ...look });
const caps = (size, color = col('blue')) => ({ fontFamily: SANS, fontSize: pt(size),
  fontWeight: 700, letterSpacing: pt(size * 0.18), textTransform: 'uppercase', color });

// #region folio: newsprint inside, stapled through the fold, covers taken from the pages
const folio = {
  tilt: 20,
  // The book's paper: every page outside a :::paper fence, the inner sheet here.
  paper: { type: 'newsprint', grammage: 52 },
  // cover: 'pages' turns page 1 as the front and page 8 (a verso) as the back; on a saddle
  // stitch the cover is a sheet like the others, only heavier (gotcha: folio-cover-pages-even).
  binding: { type: 'saddleStitch', cover: 'pages' },
  surface: { type: 'plain', color: col('ink') },
  lighting: { environment: 'overcast', intensity: 1.1 },
};
// #endregion

// #region covers: big type and tide lines on the page; the card colour comes from the paper
// Eleven tide lines of a seeded length: blue rules across the foot of the cover.
let seed = 0x71de; // Mulberry32: the same lines on every run
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const tideLines = Array.from({ length: 11 }, (_, i) => ({ kind: 'rule', id: `tide-${i}`,
  direction: 'horizontal', thickness: pt(2.2 + i * 0.5), color: col('blue'),
  placement: { ...at('page', 'top-left', 10 + random() * 40, 128 + i * 5.2),
    size: { width: mm(50 + random() * 70) } } }));
const flush = { span: 'page', margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) },
  footer: { elements: [] } }; // no folio on either cover (the style lasts one page)
const cover = { ...flush, id: 'cover', numbered: false, advancedDesign: { enabled: true,
  minHeight: mm(TRIM_H), slot: { elements: [
    text('issue', '{attr.issue}', caps(7.5), at('page', 'top-left', INNER, 16)),
    text('title', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(70),
      lineHeight: 0.86, letterSpacing: pt(-2), color: col('blue') },
    { ...at('#issue', 'below', -1, 8), size: { width: mm(TRIM_W - INNER - OUTER) } }),
    text('strap', '{attr.strap}', { fontFamily: 'Newsreader', italic: true, fontSize: pt(13),
      lineHeight: 1.25, color: col('ink') },
    { ...at('#title', 'below', 1, 6), size: { width: mm(100) } }),
    ...tideLines,
  ] } } };
const back = { ...flush, id: 'back', numbered: false,
  breakBefore: { enabled: true, parity: 'even' }, advancedDesign: { enabled: true,
    minHeight: mm(TRIM_H), slot: { elements: [
      text('title', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(26),
        letterSpacing: pt(-0.5), color: col('blue'), align: 'center' },
      { ...at('page', 'center', 0, -6), size: { width: mm(100) } }),
      text('strap', '{attr.strap}', { ...caps(7, col('ink')), align: 'center' },
        { ...at('#title', 'below', 0, 3), size: { width: mm(100) } }),
    ] } } };
// #endregion

// #region features: every piece opens a page with a kicker and a title in the riso blue
const feature = (id) => ({ id, numbered: false, breakBefore: { enabled: true, parity: 'any' },
  marginBottom: pt(LEAD), advancedDesign: { enabled: true, minHeight: mm(30), slot: {
    elements: [
      text('kicker', '{attr.kicker}', caps(7.5), at('container', 'top-left', 0, 1)),
      text('title', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(25),
        lineHeight: 0.98, letterSpacing: pt(-0.4), color: col('ink') },
      { ...at('#kicker', 'below', 0, 2.5), size: { width: 'fill' } }),
      { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(2.5), color: col('blue'),
        placement: { ...at('#title', 'below', 0, 4), size: { width: mm(14) } } },
    ] } } });
const headingStyles = [cover, back, feature('feature'), feature('back-matter')];
// #endregion

const config = () => ({
  locale: 'en-us',
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Newsreader', fontSize: pt(10), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 800, levels: [
    // parity 'any': a level-1 heading opens the next page, whichever side it falls on.
    { level: 1, fontSize: pt(25), breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(10), lineHeight: pt(LEAD), fontWeight: 700, color: col('blue'),
      marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  headingStyles,
  paragraphStyles: [
    { id: 'credits', fontFamily: SANS, fontSize: pt(7.4), lineHeight: pt(10.4),
      color: col('muted'), boldColor: col('blue'), textAlign: 'left', firstLineIndent: pt(0),
      marginTop: pt(LEAD) },
    { id: 'tides', fontFamily: SANS, fontSize: pt(8.6), lineHeight: pt(LEAD),
      boldColor: col('blue'), textAlign: 'left', firstLineIndent: pt(0) },
  ],
  header: { elements: [] },
  footer: { elements: [text('folio', '{pageNumber}   {title} · {publishDate}', { ...caps(6.5,
    col('muted')), align: 'center' }, at('page', 'bottom', 0, -11))] },
  folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region cover-sheet: the outer sheet's four pages in card, the inner sheet on newsprint
// :::paper{type=cardStock grammage=250 shade=#f2c9b4}   pages 1–2: the front of the sheet
// # Low Tide {style="cover" …}   # In this issue {…}
// :::
// # The dunlin come back …   pages 3–6, outside any fence: folio.paper, the newsprint
// :::paper{type=cardStock grammage=250 shade=#f2c9b4}   pages 7–8: the back of the sheet
// # Join us {…}   # Low Tide {style="back" …}
// :::
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Newsreader: ['400', '400i', '700'],
  'Bricolage Grotesque': ['400', '700', '800'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: 'Low Tide · a stapled zine in Folio' });

// #region answer: the zine as a stapled booklet, closed on the desk until the cover turns
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = 'The zine in 3D';
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
// Covers from the pages need an even count: page 8 must fall on a verso to be the back.
if (doc.pages.length % 2) console.warn(`${doc.pages.length} pages: the back cover is missing`);
createFolioFromDocument(stage, doc, {
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' },
  onChange: ({ pages }) => kitStatus(pages.map((i) => `p. ${i + 1} on `
    + (doc.pages[i].paper ? 'card' : 'newsprint')).join(' · ')),
});
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
