// ═══ Postext Cookbook · Nº 038 · Trade paperback: sunk openers and recto chapters ═══
// https://postext.dev/en/cookbook/trade-paperback-novel
// Code: MIT · Text: The Awakening (Gutenberg #160), Quincas Borba (PD) · Cover: diffusion models
// Fonts: Crimson Pro, Cormorant Garamond, Cormorant SC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the sample's language: 'en' (Chopin) | 'pt' (Machado de Assis)
const RECIPE = 'trade-paperback-novel';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#231d18', // the text: a warm near-black
  rubric: '#8e3b22', // the one accent: the opener's hairline, the author, the tailpiece
  muted: '#6e655b', // running heads, folios on openers, the colophon
  paper: '#fbf7ef', // a cream book paper
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults (headings, lists, callouts, captions) link to 'main-color', the rubric.
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
const TEXT = 'Crimson Pro'; // the text face
const DISPLAY = 'Cormorant Garamond'; // italic numerals and the cover's title
const LABEL = 'Cormorant SC'; // small capitals: the lead, the author's name
const [BODY, LEAD] = [10.5, 14]; // pt: the body size and its leading, the grid's pitch
const line = (n) => pt(n * LEAD); // n grid lines

// #region page: a 140 × 216 mm trade page whose text block holds 35 whole lines
const TRIM = { width: 140, height: 216 }; // mm: 5½ × 8½ in
const [TOP, INNER, OUTER] = [22, 20, 15.5]; // mm; mirrored, so INNER is left on a recto
const LINES = 35; // every full page ends on the same line
const MEASURE = TRIM.width - INNER - OUTER; // 104.5 mm: about 69 characters of Crimson Pro
const MM_PER_PT = 25.4 / 72;
const page = {
  sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LEAD * MM_PER_PT),
    left: mm(INNER), right: mm(OUTER), mirror: true },
};
// #endregion

// #region answer: a sunk opener: the numeral, a hairline, and the first sentence in small caps
// # I {lead="A green and yellow parrot, … kept repeating over and over:"}
// The heading's text is the numeral, printed by {titleText}; the chapter's first sentence
// travels as the heading's lead attribute, printed by {attr.lead} in small capitals and
// centred, because design text is never justified (gotcha: design-text-ragged).
const [LEAD_AT, BODY_AT] = [9, 12]; // grid lines: the lead's top; where the text starts
const NUMERAL = 48; // pt
const RULE_Y = (LEAD_AT - 1.5) * LEAD * MM_PER_PT; // mm: a line and a half above the lead
const NUMERAL_Y = RULE_Y - NUMERAL * MM_PER_PT - 3; // mm: the numeral's box ends 3 mm above it
const centred = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y } });
const opener = {
  enabled: true,
  // The two-line lead ends on line LEAD_AT + 2; minHeight leaves a blank line under it and
  // starts the text on line BODY_AT (a one-line lead would leave two).
  minHeight: line(BODY_AT),
  slot: { elements: [
    { kind: 'text', id: 'numeral', content: '{titleText}', fontFamily: DISPLAY, italic: true,
      fontWeight: 500, fontSize: pt(NUMERAL), lineHeight: 1, color: col('ink'),
      align: 'center', placement: centred(mm(NUMERAL_Y)) },
    { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.6),
      color: col('rubric'), placement: { ...centred(mm(RULE_Y)), size: { width: mm(18) } } },
    { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(9.5), letterSpacing: pt(0.6), color: col('ink'), align: 'center',
      lineHeight: LEAD / 9.5, // a multiple, never pt() (gotcha: design-lineheight-multiple)
      overflow: 'wrap', // wrap, not '…' (gotcha: overflow-ellipsis-default)
      paragraphIndent: pt(0.01), // a \n in the lead breaks the line (gotcha: design-text-newline)
      placement: { ...centred(line(LEAD_AT)), size: { width: mm(MEASURE) } } },
  ] },
};
// Every chapter opens on a recto: 'odd' adds a blank verso only after a chapter that ends on
// a recto (restated: gotcha headings-drop-h1-break). marginBottom 0: the level's default
// 0.5 em would start the text a line lower.
const chapter = { level: 1, breakBefore: { enabled: true, parity: 'odd' },
  marginBottom: pt(0), italic: true, advancedDesign: opener };
// #endregion

// #region heads: the author on the verso, the title on the recto, folios outside
// {author} and {title} come from the frontmatter, every value quoted (gotcha: quote-frontmatter).
const HEAD_Y = 12; // mm from the top edge to the top of the running heads
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre is off the page's centre
const head = (id, content, parity, edge, x, style) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers or blank pages
  fontSize: pt(9), color: col('muted'), ...style,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD_Y) } },
});
const smallCaps = { fontFamily: LABEL, fontWeight: 600, letterSpacing: pt(1.2) };
const italic = { fontFamily: DISPLAY, italic: true, fontWeight: 500, fontSize: pt(9.75) };
const folio = { fontFamily: TEXT, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-author', '{author}', 'even', 'top', -SHIFT, smallCaps),
  head('recto-title', '{title}', 'odd', 'top', SHIFT, italic),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
// Openers carry a drop folio instead, centred under the text block.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  pages: 'opener', fontFamily: TEXT, fontSize: pt(9), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(7) } } }] };
// #endregion

// #region cover: a section of its own: art, title, author, no heads, a colophon on its verso
// Page 1 is a recto (gotcha: parity-page1-recto): the cover, the colophon on its verso, and
// chapter I on page 3. # The Awakening {style="cover"} opens the section; chapter I closes it.
// The colophon: 2 + 2 + 1 lines of 11 pt and two gaps of 14.5 pt make 84 pt, six grid lines.
const COLOPHON_LINES = 6;
const COLOPHON_TOP = TOP + (LINES - COLOPHON_LINES) * LEAD * MM_PER_PT; // mm: the section's margin
const onPage = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } }); // y mm down
const cover = {
  id: 'cover',
  span: 'page', // kept in the column, the design is clipped at the column top, 165 mm down
  header: { elements: [] }, footer: { elements: [] }, // no running heads on p. 1 or p. 2
  margins: { top: mm(COLOPHON_TOP) },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'cover',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    { kind: 'text', id: 'title', content: '{title}', fontFamily: DISPLAY, italic: true,
      fontWeight: 500, fontSize: pt(50), lineHeight: 1, color: col('ink'), align: 'center',
      placement: onPage(155) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6),
      color: col('rubric'), placement: { ...onPage(179), size: { width: mm(18) } } },
    { kind: 'text', id: 'author', content: '{author}', ...smallCaps, fontSize: pt(12),
      letterSpacing: pt(2.4), color: col('rubric'), align: 'center', placement: onPage(184) },
  ] } },
};
const colophon = { id: 'colophon', fontSize: pt(8), lineHeight: pt(11), color: col('muted'),
  textAlign: 'left', firstLineIndent: pt(0), spaceBetween: pt(14.5) };
// #endregion

// #region tailpiece: an ornament type that prints no caption, where ::resource stands
// At a chapter's end: :::space, then ::resource{id="tailpiece-1"} (double quotes: gotcha
// resource-double-quotes). The space adds a line to the gap the embed keeps above it.
const ornament = { id: 'ornament', name: 'Ornament', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.17, align: 'center' } };
const svg = (id, fileId, width, height, altText) => ({ id, typeId: 'ornament', kind: 'svg',
  svg: { fileId, width, height }, altText, createdAt: 0, updatedAt: 0 });
// The cover is a painting, a JPEG in assets/ cut to the art's 140 × 134 mm, declared at its pixels.
const painting = { id: 'cover', typeId: 'ornament', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'cover-1190.jpg', format: 'jpeg', width: 1190, height: 1139 },
  altText: t({ en: 'The gulf seen between the trunks of water-oaks, a lugger on the horizon; a '
    + 'white sunshade comes up from the beach through the camomile.',
  pt: 'O mar visto entre os troncos de duas árvores, um veleiro no horizonte; uma sombrinha '
    + 'branca sobe da praia por um caminho entre flores amarelas e brancas.' }) };
const resources = [
  painting,
  // ::resource places each ornament once, so each chapter end has its own id.
  ...t({ en: ['I', 'II'], pt: ['I', 'II', 'III'] }).map((n, i) => svg(`tailpiece-${i + 1}`,
    'fleuron.svg', 40, 12, t({ en: `A camomile flower between two sprigs closes chapter ${n}.`,
      pt: `Uma flor de camomila entre dois ramos fecha o capítulo ${n}.` }))),
];
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', pt: 'pt' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  resourceTypes: [ornament],
  page,
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    minWordSpacing: 0.7, maxWordSpacing: 1.9, // at the default 0.6 a line closes to 0.62
    maxRuntTracking: 0, // gotcha: runt-tracking-unpainted
  },
  // The designs paint every heading; the level's own face is the numeral's (500 italic), so the
  // kit has no unused face to load.
  headings: { fontFamily: DISPLAY, fontWeight: 500, levels: [chapter] },
  headingStyles: [cover],
  paragraphStyles: [colophon],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the fleuron, drawn in millimetres in the page's colour
function drawFleuron(color) { // a camomile head between two leafy sprigs
  const petals = Array.from({ length: 10 }, (_, i) => `<ellipse cx="22.1" cy="6" rx="1.55" `
    + `ry="0.62" transform="rotate(${i * 36} 20 6)" fill="${color}"/>`).join('');
  const sprig = `<path d="M17.2 6.3C14 7.4 10 7.2 6.4 5.6C5.2 5.1 4.2 5.2 3.4 5.9" fill="none" `
    + `stroke="${color}" stroke-width="0.55" stroke-linecap="round"/>`
    + `<path d="M13.4 6.9C12.6 4.9 10.8 4 9 4.2C10 5.6 11.4 6.6 13.4 6.9Z" fill="${color}"/>`
    + `<path d="M9.2 6.5C8.7 7.9 7.4 8.7 5.9 8.8C6.6 7.5 7.7 6.7 9.2 6.5Z" fill="${color}"/>`
    + `<circle cx="2.8" cy="6.3" r="0.7" fill="${color}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="12mm" '
    + `viewBox="0 0 40 12">${petals}<circle cx="20" cy="6" r="1.05" fill="${color}"/>${sprig}`
    + `<g transform="translate(40 0) scale(-1 1)">${sprig}</g></svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Crimson Pro': ['400', '400i'], // text, colophon, folios
  'Cormorant Garamond': ['500i'], // numerals, cover title, the recto's running head
  'Cormorant SC': ['600'], // the leads, the author on the cover and the verso
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage(painting.bitmap.fileId, asset(painting.bitmap.fileId));
await loadSvg('fleuron.svg', drawFleuron(palette.rubric));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Trade paperback: sunk openers and recto chapters',
  pt: 'Romance em brochura: aberturas rebaixadas em página ímpar' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
