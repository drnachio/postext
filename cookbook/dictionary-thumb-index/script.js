// ═══ Postext Cookbook · Nº 046 · Dictionary with a moving thumb index ═══════════════
// https://postext.dev/en/cookbook/dictionary-thumb-index
// Code: MIT · Text: W. H. Smyth, 1867 (PD); Spanish translation CC BY 4.0 · Pictures: code
// Fonts: Alegreya, Alegreya SC, Alegreya Sans SC (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'dictionary-thumb-index';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink and navy on a warm paper, brass for the rules and the rope
const palette = {
  ink: '#1b1f24', // text
  navy: '#1f3a5f', // headwords, letters and tabs
  brass: '#a4834f', // hairlines and the rope of the vignette
  rule: '#cfccc3', // the column rule
  tint: '#e4e9f0', // the pale cells of the index
  slate: '#56657b', // their letters
  muted: '#62666b', // running heads
  paper: '#fbfaf6', // the page, and the letter reversed out of each tab
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Alegreya', DISPLAY = 'Alegreya SC', LABEL = 'Alegreya Sans SC';
const PT = 25.4 / 72; // mm in a point
const LEAD = 10.4; // pt: the body's leading, the grid every column is set on
const LINES = 44; // lines in a full column
const TOP = 18, INNER = 12, OUTER = 14; // mm; the foot margin makes the block whole lines
const BOTTOM = 200 - TOP - LINES * LEAD * PT;

// #region answer: one heading style per letter, each with its tab one step down the fore-edge
// 22 tabs share the 44 lines of the text block, two lines each; letters with few words
// share a tab, as in most thumb-indexed dictionaries.
const TABS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
  'QR', 'S', 'T', 'UV', 'W', 'XYZ'];
const STEP = 2 * LEAD * PT; // mm: 7.34
const EDGE = { odd: 'top-right', even: 'top-left' }; // the fore-edge: right on a recto
// A cell of the index, `width` mm inside the trim and 3 mm past it, so that only its
// inner corners show their rounding; its label is centred on the part inside the trim.
const cell = (id, label, i, parity, width, fill, ink, size) => {
  const y = mm(TOP + i * STEP + 0.3); // a 0.6 mm gap between neighbours
  const at = (x, w) => ({ anchor: { to: 'page', edge: EDGE[parity] }, offset: { x: mm(x), y },
    size: { width: mm(w), height: mm(STEP - 0.6) } });
  return [
    { kind: 'box', id, parity, style: { backgroundColor: col(fill), borderRadius: mm(1.2) },
      placement: at(parity === 'odd' ? 3 : -3, width + 3) },
    { kind: 'text', id: `${id}-label`, parity, content: label, fontFamily: LABEL, fontWeight: 700,
      fontSize: pt(size), lineHeight: 1, color: col(ink), align: 'center',
      verticalAlign: 'middle', placement: at(0, width) },
  ];
};
const sides = (make) => ['odd', 'even'].flatMap(make);
// Every page prints the whole index, pale; the section's own letter stands out of it.
const ladder = sides((p) => TABS.flatMap((label, i) =>
  cell(`index-${i}-${p}`, label, i, p, 5.8, 'tint', 'slate', 7.5)));
const letterStyles = () => TABS.flatMap((label, i) => [...label].map((letter) => ({
  id: letter,
  // '# B {style="B"}' opens the section of B: its pages take this header, and a page
  // where A ends and B begins takes B's (gotcha: section-last-wins).
  header: { elements: [...runningHeads, ...ladder,
    ...sides((p) => cell(`tab-${p}`, label, i, p, 9, 'navy', 'paper', 8.5))] },
})));
// #endregion

// #region running-heads: the book on the verso, the letter on the recto, folios outside
const HEAD = 11; // mm from the trim's top to the heads' top
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: LABEL, fontSize: pt(8), fontWeight: 500, letterSpacing: pt(1),
  color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD) } }, ...extra });
const folio = { fontWeight: 700, color: col('ink'), letterSpacing: pt(0) };
const runningHeads = [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-letter', t({ en: 'Letter {chapterTitle}', es: 'Letra {chapterTitle}' }), 'odd',
    'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
];
// The first page drops its folio to the foot, under the text block.
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
  ...folio, pages: 'opener',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(6) } } })] };
// #endregion

// #region entries: one paragraph per entry, the headword bold in navy, the turnovers hanging
// Bold and italic default to the engine's blue: the body sets them to ink, and only the
// entry style prints its bold, the headwords, in navy.
const BODY = 8; // pt: a reference size, about 50 characters to the 60 mm column
const bodyText = { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(0),
  minWordSpacing: 0.7, maxWordSpacing: 1.7,
  maxRuntTracking: 0 }; // gotcha: runt-tracking-unpainted
const paragraphStyles = [
  { id: 'entry', hangingIndent: em(1), boldColor: col('navy') }, // :::paragraphs{style="entry"}
  { id: 'colophon', fontSize: pt(7), color: col('muted'), textAlign: 'center',
    marginTop: pt(LEAD) },
];
// #endregion

// #region letter-heads: a four-line initial over a brass hairline, in the column, running on
// Its cap line meets the first body line's and it stands on the fourth baseline. Cap
// heights measured on the glyph H: 0.652 em in Alegreya SC 900, 0.646 em in Alegreya.
const DROP = 4; // body lines the letter spans
const LETTER = ((DROP - 1) * LEAD + 0.646 * BODY) / 0.652; // pt: 55.8
// A design line sets its baseline 0.8 of its height below its top; a body line does too.
const letterHead = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'letter', content: '{titleText}', fontFamily: DISPLAY, fontWeight: 900,
    fontSize: pt(LETTER), lineHeight: 1, color: col('navy'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { y: pt((DROP - 0.2) * LEAD - 0.8 * LETTER) } } },
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.6), color: col('brass'),
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { y: pt((DROP + 0.55) * LEAD) }, size: { width: 'fill' } } },
] } };
// #endregion

// #region title: the book's name across both columns, under a fouled anchor
const centred = (id, content, family, size, lineHeight, y, width, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), lineHeight, color: col('navy'), align: 'center',
  overflow: 'wrap', ...extra, placement: { anchor: { to: 'container', edge: 'top' },
    offset: { y: mm(y) }, size: { width: width ? mm(width) : 'fill' } } });
const rule = (id, y, thickness) => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(thickness), color: col('navy'), placement: { anchor: { to: 'container',
    edge: 'top-left' }, offset: { y: mm(y) }, size: { width: 'fill' } } });
const titleBand = { enabled: true, slot: { elements: [
  // The column rule starts at the top of the text block, under the band too: a field of
  // paper down to the thin rule covers it, so it hangs from the double rule.
  { kind: 'box', id: 'field', style: { backgroundColor: col('paper') }, placement: {
    anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: mm(45) } } },
  { kind: 'image', id: 'anchor', resourceId: 'anchor', placement: {
    anchor: { to: 'container', edge: 'top' }, size: { width: 'auto', height: mm(18) } } },
  centred('name', '{titleText}', DISPLAY, 22, 1.1, 20, 0, { fontWeight: 900 }),
  centred('subtitle', '{attr.subtitle}', TEXT, 9, 1.25, 29.5, 92, { italic: true,
    color: col('ink') }),
  centred('byline', '{attr.byline}', LABEL, 7, 1.2, 38.8, 0, { fontWeight: 500,
    letterSpacing: pt(1.2), color: col('muted') }),
  rule('thick', 43.6, 1.2),
  rule('thin', 45, 0.4),
] } };
// '# The Sailor’s Word-Book {style="title" subtitle="…" byline="…"}' opens page 1. The band's
// {titleText} joins the hidden heading's wrapped lines with a space, and a page-span heading
// wraps at the column width: at the default H1 size the band printed 'Word- Book'. At body
// size the hidden title fits one line of the 60 mm column.
const titleStyle = { id: 'title', span: 'page', advancedDesign: titleBand, fontSize: pt(BODY) };
// #endregion

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette, footer,
  header: { elements: [] }, // every page takes the header of its letter's style
  page: { sizePreset: 'custom', width: mm(150), height: mm(200), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { gutterWidth: mm(4), // two columns is the default layout
    columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } },
  bodyText, paragraphStyles,
  // The designs paint every heading; the hidden ones are still measured, and in the face
  // FONTS loads, or the kit would fetch Open Sans 700 for text nobody sees.
  headings: { fontFamily: DISPLAY, fontWeight: 900, levels: [
    // Letters run on in the column. Any headings object already drops the H1 break
    // (gotcha: headings-drop-h1-break); stating it keeps them running on if that default
    // returns, and the letter styles inherit it (gotcha: style-inherits-break).
    { level: 1, breakBefore: { enabled: false }, marginTop: pt(LEAD), marginBottom: pt(0),
      advancedDesign: letterHead },
  ] },
  headingStyles: [
    titleStyle,
    ...letterStyles(),
  ],
});

// #region art: a fouled anchor, the Admiralty's badge, for the title band
// Drawn in the page's navy and brass; the rope's lay is a dashed navy stroke over it.
const anchorSvg = () => {
  const { navy, brass } = palette;
  const rope = 'M66.5 19 C88 26 86 44 60 52 C34 60 32 76 60 82 C88 88 86 104 60 110 '
    + 'C44 114 38 122 42 136';
  const fluke = (s) => `<path transform="translate(60 0) scale(${s} 1)" fill="${navy}"
    d="M-44 92 L-50 78 L-36 70 L-34 88 Z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="120" height="150">
  <circle cx="60" cy="13" r="8.5" fill="none" stroke="${navy}" stroke-width="4"/>
  <path d="M56.5 21 L63.5 21 L64.5 124 L55.5 124 Z" fill="${navy}"/>
  <rect x="20" y="27" width="80" height="6.5" rx="3.2" fill="${navy}"/>
  <circle cx="19" cy="30.2" r="5" fill="${navy}"/>
  <circle cx="101" cy="30.2" r="5" fill="${navy}"/>
  <path d="M16 84 Q20 132 60 134 Q100 132 104 84" fill="none" stroke="${navy}"
    stroke-width="7" stroke-linecap="round"/>
  ${fluke(1)}${fluke(-1)}
  <path d="M60 126 L66 134 L60 142 L54 134 Z" fill="${navy}"/>
  <path d="${rope}" fill="none" stroke="${brass}" stroke-width="4.2" stroke-linecap="round"/>
  <path d="${rope}" fill="none" stroke="${navy}" stroke-opacity="0.5" stroke-width="4.2"
    stroke-dasharray="1 1.8"/>
</svg>`;
};
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// No paragraph cites the anchor, so it is never placed as a figure: only the title band's
// image element draws it.
const resources = [{ id: 'anchor', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  altText: t({ en: 'An anchor with a rope wound round its shank.',
    es: 'Un ancla con un cabo enrollado en la caña.' }),
  svg: { fileId: 'anchor.svg', width: 120, height: 150 } }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Alegreya: ['400', '400i', '700'],
  'Alegreya SC': ['900'],
  'Alegreya Sans SC': ['500', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('anchor.svg', anchorSvg());
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'The Sailor’s Word-Book', es: 'Vocabulario del marinero' }) });

// @kit
