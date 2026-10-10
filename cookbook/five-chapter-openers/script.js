// ═══ Postext Cookbook · Nº 017 · Five chapter openers in one book ═════════════════
// https://postext.dev/en/cookbook/five-chapter-openers
// Code: MIT · Text: original (CC BY 4.0) · Ornament: generated in code (CC BY 4.0)
// Fonts: Lora, Fraunces, Geist, Geist Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A small book about openers, each chapter set in the one it describes. Every heading style
// brings its opener and palette; three move the margins, two bring their own type and folios.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'five-chapter-openers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: one opener per chapter: the level's own, then heading styles by name
// A heading line picks a style by id, and its attributes feed the opener's {attr.…} texts:
//   # The Frame {style="framed" kicker="Chapter the Second"}
// A style overrides the level fields it names (opener, drop cap) and, until the next level-1
// heading, the section fields it names; the rest comes from the level and the document.
const level1 = () => ({ level: 1,
  // span 'page' opens each chapter at the head of a new page and runs its opener across
  // every column (chapter four has two). Any headings object drops the default break to a
  // recto (gotcha: headings-drop-h1-break): restate the side, 'any' for short chapters.
  span: 'page',
  breakBefore: { enabled: true, parity: 'any' },
  marginBottom: pt(0), // each opener ends where its first paragraph starts
  advancedDesign: literary, // chapter one, unstyled: the book's own opener
  dropCap: { lines: 5, fontFamily: 'Fraunces', fontWeight: 400, color: col('accent'),
    gap: mm(2.5) } }); // a five-line drop in rubric red
const headingStyles = () => [ // factories, called by config() once every design exists
  // Each style brings its opener and swaps 'accent' for a colour of its own, on its pages.
  { id: 'framed', advancedDesign: framed, palette: { accent: palette.lapis },
    margins: { left: mm(EVEN), right: mm(EVEN) }, // a centred text block; 'accent' is blue:
    dropCap: { lines: 3, fontFamily: 'Fraunces', fontWeight: 600, color: col('accent'),
      gap: mm(2) } },
  { id: 'stacked', advancedDesign: stacked, palette: { accent: palette.magenta }, // white, on
    dropCap: { lines: BOXED, fontFamily: 'Geist Mono', fontWeight: 700, color: col('paper'),
      gap: mm(2.2) } }, // the square the opener draws for it
  { id: 'spec', advancedDesign: spec, palette: { accent: palette.signal }, dropCap: false,
    marginBottom: pt(0), // the hairline under the title is the separator
    margins: { left: mm(SPEC), right: mm(SPEC) }, // a 144 mm text block
    layout: { layoutType: 'double', gutterWidth: mm(7) },
    bodyStyle: { fontFamily: 'Geist', fontSize: pt(9.8), textAlign: 'left' }, // on the grid
    header: { elements: [...specHead('even'), ...specHead('odd')] },
    footer: { elements: [] } }, // no folio at the foot: the head gives the page
  { id: 'quiet', numbered: false, // a coda: it advances no chapter counter
    advancedDesign: quiet, palette: { accent: palette.graphite }, footer: tinyFolio,
    dropCap: { lines: 1, fontFamily: 'Fraunces', fontWeight: 300, fontSize: pt(46), // raised:
      color: col('accent'), gap: mm(1.2) }, // on the first baseline, rising into the white
    margins: { left: mm(QUIET.inner), right: mm(QUIET.outer) }, // a 106 mm measure
    bodyStyle: { fontSize: pt(QUIET.size), lineHeight: pt(QUIET.lead), textAlign: 'left' } },
]; // hook-up in config(): headings: { levels: [level1(), …] }, headingStyles()
// #endregion

const palette = { // every colour in the config links to one of these by id
  ink: '#16181c', // text: a cool near-black
  accent: '#8c1c13', // the one accent of a section; the book's own is a rubric red
  tint: '#f6f0e3', // the frame's cream
  muted: '#6b6760', // running heads and the colophon
  paper: '#ffffff', // type on colour
  lapis: '#24427a', magenta: '#a3155e', signal: '#ff5a1f', graphite: '#4a4f57',
};
// col(id): a palette-linked colour. It carries the hex too, because 1.4.1 paints design
// elements from the hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const TRIM = { w: 180, h: 240 }; // mm
const TOP = 22, INNER = 20, OUTER = 36; // margins, mm: a wide outer margin keeps 124 mm lines
const MEASURE = TRIM.w - INNER - OUTER; // mm
const EVEN = (TRIM.w - MEASURE) / 2; // mm: equal side margins, for the framed chapter
const LEAD = 14.5; // body leading, pt: the baseline grid
const LEADIN = { size: 12, lead: 17 }; // pt: a chapter's opening paragraph, a size larger
const QUIET = { size: 12.5, lead: 17.5, inner: 30, outer: 44 }; // the coda: pt, and mm margins

// Design-slot shorthands. at(): a placement from an anchor's edge, x and y in mm.
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width !== undefined && { size: { width: width === 'fill' ? 'fill' : mm(width) } }) });
// Design text wraps; left alone it ends in '…' (gotcha: overflow-ellipsis-default). A number
// lineHeight multiplies the size, never pt() (gotcha: design-lineheight-multiple).
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'left', overflow: 'wrap',
  placement, ...extra });
const caps = (tracking, weight = 600) => ({ fontWeight: weight, letterSpacing: pt(tracking),
  textTransform: 'uppercase', color: col('accent') });
const centred = (y) => at('container', 'top', 0, y, 'fill'); // a full-width line, centred
// No minHeight: the text starts under the lowest element of each opener.
const design = (elements) => ({ enabled: true, slot: { elements } });
// An empty box reserves room: the text starts y mm under the element it hangs from.
const room = (anchor, y, edge = 'below') => ({ kind: 'box', id: 'room', style: {},
  placement: { ...at(anchor, edge, 0, 0, 'fill'), size: { width: 'fill', height: mm(y) } } });

// #region literary: chapter one, the level's own opener: a five-line drop in rubric red
// The first paragraph, in :::paragraphs{style="lead"}, starts 17 mm under the title.
const literary = design([
  text('kicker', '{attr.kicker}', 'Geist', 8, centred(22), { ...caps(1.7), align: 'center' }),
  text('title', '{titleText}', 'Fraunces', 32, at('#kicker', 'below', 0, 4, 'fill'),
    { fontWeight: 300, italic: true, lineHeight: 1.05, align: 'center' }),
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.8), color: col('accent'),
    placement: at('#title', 'below', (MEASURE - 18) / 2, 6, 18) }, // an 18 mm rule, centred
  room('#title', 17),
]);
// #endregion

// #region framed: a cartouche of two boxes around the title, an ornament, a three-line initial
const FRAME = 62; // mm: the outer box's height
const INSET = 3; // mm: the hairline box runs this far inside it
const FLEURON = 44; // mm: the ornament's width, centred under the title
const framed = design([ // array order is paint order: the boxes first, the type on top
  { kind: 'box', id: 'frame', placement: { ...at('container', 'top-left', 0, 0),
    size: { width: 'fill', height: mm(FRAME) } },
  style: { backgroundColor: col('tint'), borderColor: col('accent'), borderWidth: pt(1.6) } },
  { kind: 'box', id: 'hairline', placement: { ...at('#frame', 'align-top', INSET, INSET),
    size: { width: mm(MEASURE - 2 * INSET), height: mm(FRAME - 2 * INSET) } },
  style: { borderColor: col('accent'), borderWidth: pt(0.5) } },
  text('kicker', '{attr.kicker}', 'Geist', 7.5, centred(14), { ...caps(1.6), align: 'center' }),
  text('title', '{titleText}', 'Fraunces', 34, at('#kicker', 'below', 0, 3.5, 'fill'),
    { fontWeight: 600, lineHeight: 1.05, align: 'center' }),
  // An image element draws a registered resource, never numbered or captioned. Its resourceId
  // may be '{attr.photo}' (postext ≥ 1.8): then each heading names its own photo.
  { kind: 'image', id: 'fleuron', resourceId: 'fleuron',
    placement: at('#title', 'below', (MEASURE - FLEURON) / 2, 4.5, FLEURON) },
  room('#frame', 9), // the text starts 9 mm under the frame
]);
// #endregion

// #region stacked: a colour field, the title's words stacked, a boxed initial
const FIELD = 130; // mm from the trim: the foot of the colour field
const S_BEARING = 1.2; // mm: the white left of the title's S (0.0365 em at 94 pt)
// The boxed initial: the style's drop cap sets the white letter; the opener draws the square,
// fitted by hand in pt. The text starts on the grid line 8 mm under the field (from the trim).
const TEXT_TOP = Math.ceil(((FIELD - TOP + 8) * 72) / 25.4 / LEAD) * LEAD; // pt
const BASE = 0.8; // a line's baseline stands 0.8 down its line box
const CAPS = 0.7; // the height of a capital in Lora, em
// Geist Mono, em: cap height, the advance every capital shares, the white either side of an M
const MONO = { caps: 0.71, advance: 0.6, side: 0.044 };
const BOXED = 3; // lines the initial spans
const capsTop = TEXT_TOP + BASE * LEADIN.lead - CAPS * LEADIN.size; // the first line's capitals
const foot = TEXT_TOP + (BOXED - 1 + BASE) * LEADIN.lead; // the third baseline: the letter's foot
// The M runs from the first line's capitals to its foot; the square runs past both as far as
// the M's sides sit in, so the colour is as wide on all four sides.
const letter = (foot - capsTop) / MONO.caps, pad = MONO.side * letter;
const stacked = design([
  { kind: 'box', id: 'field', style: { backgroundColor: col('accent') },
    placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { height: mm(FIELD) } } },
  text('kicker', '{attr.kicker}', 'Geist', 8, at('container', 'top-left', 0, 4),
    { ...caps(1.8), color: col('paper') }),
  // {titleText} keeps the \\ breaks from the Markdown, so each line ends at the writer's \\.
  // Moved left by the S's side bearing, so its curve meets the text edge.
  text('title', '{titleText}', 'Fraunces', 94,
    at('container', 'top-left', -S_BEARING, 15, 'fill'),
    { fontWeight: 900, lineHeight: 0.84, color: col('paper') }),
  { kind: 'box', id: 'initial', style: { backgroundColor: col('accent') }, reserve: false,
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: pt(capsTop - pad) },
      size: { width: pt(MONO.advance * letter), height: pt(foot - capsTop + 2 * pad) } } },
  room('container', (TEXT_TOP * 25.4) / 72, 'top-left'), // the opener ends where the text starts
]);
// #endregion

// The book's running heads and folios, anchored to the text block, whatever its margins.
const HEAD_Y = 14; // mm from the trim to the running heads
const label = (id, content, parity, edge, x, extra = {}) => text(id, content, 'Geist', 7.5,
  at('container', edge, x, HEAD_Y), { ...caps(1.4, 500), color: col('muted'), parity,
    pages: 'body', ...extra });
const folio = { fontWeight: 700, color: col('ink'), letterSpacing: pt(0.4) };
// Title on the verso, chapter on the recto, folios at the outer corners.
const header = { elements: [
  label('verso-folio', '{pageNumber}', 'even', 'top-left', 0, folio),
  label('verso-title', '{title}', 'even', 'top-left', 9),
  label('recto-title', '{chapterTitle}', 'odd', 'top-right', -9),
  label('recto-folio', '{pageNumber}', 'odd', 'top-right', 0, folio),
] };
// Openers carry a drop folio instead, centred under the text block, in the section's accent.
const footer = { elements: [text('drop-folio', '{pageNumber}', 'Geist', 7.5,
  at('container', 'top', 0, 9), { ...folio, color: col('accent'), pages: 'opener' })] };

// #region spec: a ruled title, a number badge that widens with the number, two columns
const SPEC = 18; // mm: both side margins, for a 144 mm text block in two columns
const PAD = 1.6; // mm of colour over the badge's figures
const spec = design([
  { kind: 'rule', id: 'top-rule', direction: 'horizontal', thickness: pt(2.4), color: col('ink'),
    placement: at('container', 'top-left', 0, 0, 'fill') },
  text('kicker', '{attr.kicker}', 'Geist Mono', 7.5, at('container', 'top-left', 0, 3.2),
    { ...caps(1.2, 500), color: col('graphite') }),
  // The badge's width follows its text, with padding on both sides, so 9 → 10 widens it. Its
  // line box holds 1 mm more under the figures than over them, so the foot pads 1 mm less.
  text('badge', '{chapterNumber}', 'Geist Mono', 26, at('container', 'top-left', 0, 12),
    { fontWeight: 700, lineHeight: 1, box: { backgroundColor: col('accent'), padding: {
      top: mm(PAD), right: mm(2.4), bottom: mm(PAD - 1), left: mm(2.4) } } }),
  // Same size and line height as the badge, dropped by its top padding, so the baselines meet.
  text('title', '{titleText}', 'Geist', 26, at('#badge', 'right-of', 4, PAD),
    { fontWeight: 700, lineHeight: 1 }),
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.5), color: col('ink'),
    placement: at('container', 'top-left', 0, 31, 'fill') }, // room for a one-line title
]);
const specHead = (parity) => { // mono labels over the opener's rule, on every page of the section
  const [edge, s] = parity === 'even' ? ['top-left', 1] : ['top-right', -1];
  const mono = { ...caps(1.1, 500), color: col('graphite'), parity, pages: 'all' };
  return [
    text(`sp-page-${parity}`, '{pageNumber} / {totalPages}', 'Geist Mono', 7,
      at('container', edge, 0, HEAD_Y), mono),
    text(`sp-chap-${parity}`, '§ {chapterNumber} · {chapterTitle}', 'Geist Mono', 7,
      at('container', edge, s * 16, HEAD_Y), mono),
  ];
};
// #endregion

// #region quiet: the coda: a title far down the page, a raised initial, a folio at the side
const quiet = design([ // the kicker is in the accent, which this style turns graphite
  text('kicker', '{attr.kicker}', 'Geist', 7.5, at('container', 'top-left', 0, 92),
    caps(1.6, 500)),
  text('title', '{titleText}', 'Fraunces', 26, at('#kicker', 'below', 0, 3),
    { fontWeight: 300, lineHeight: 1.1 }),
  room('#title', 3), // and the initial's rise, in whole lines: the text 16 mm under the title
]);
const tiny = (parity, edge) => text(`tiny-${parity}`, '{pageNumber}', 'Geist', 6.5,
  at('container', edge, 0, -12), { fontWeight: 500, color: col('muted'), parity });
const tinyFolio = { elements: [tiny('even', 'bottom-left'), tiny('odd', 'bottom-right')] };
// #endregion

const flush = { textAlign: 'left', firstLineIndent: pt(0) };
const config = () => ({
  colorPalette,
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation, by exact code (gotcha: hyphenation-locales)
  page: { width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150, // 150 dpi: a screen edition
    margins: { top: mm(TOP), bottom: mm(22), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    minWordSpacing: 0.8, maxWordSpacing: 1.6 }, // an even texture on 124 mm lines
  headings: { fontFamily: 'Geist', color: col('ink'), levels: [level1(),
    { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), fontWeight: 700, // the manual's
      numberingTemplate: '{1}.{2}', marginTop: pt(LEAD), marginBottom: pt(0) }] },
  headingStyles: headingStyles(),
  paragraphStyles: [
    // A chapter's opening paragraph, a size larger and ragged (the coda's in its own size);
    // a :::space under it in the Markdown leaves a line and starts the text flush.
    { id: 'lead', fontSize: pt(LEADIN.size), lineHeight: pt(LEADIN.lead), ...flush },
    { id: 'coda-lead', fontSize: pt(QUIET.size), lineHeight: pt(QUIET.lead), ...flush },
    { id: 'colophon', fontFamily: 'Geist', fontSize: pt(7), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(2 * LEAD) }],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the fleuron, a printer's flower drawn in paths in the frame's blue
function fleuron(ink) { // two scrolls with a leaf above and below, a rosette between them
  const scroll = 'M51 14.2C42 9.5 31 8.6 22 11.4C16 13.2 11.6 13 9.6 10.2C8.2 7.8 10.2 5.3 13 5.8'
    + 'C11 6.8 10.6 8.8 12 9.9C14.6 11.4 18 10.2 21.6 9.1C30.6 6.4 42 7.6 51 12.4Z'
    + 'M36 11.4C33.4 15.6 28.6 18.4 23.4 18.8C26.4 15 31 12.4 36 11.4Z' // the leaf below
    + 'M31 8.3C29.6 5.2 26.4 3.4 23 3.5C25.2 5.8 27.8 7.6 31 8.3Z'; // the leaf above
  const petal = 'M60 13.4C58.2 10.6 58.2 7.2 60 4.4C61.8 7.2 61.8 10.6 60 13.4Z';
  const turn = (a) => `transform="rotate(${a} 60 13.4)"`;
  const rosette = [0, 90, 180, 270].map((a) => `<path d="${petal}" ${turn(a)}/>`).join('')
    + [45, 135, 225, 315].map((a) => `<circle cx="60" cy="9.6" r="1.1" ${turn(a)}/>`).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="162" viewBox="0 0 120 27">'
    + `<g fill="${ink}"><path d="${scroll}"/>` // the right half is the left one mirrored
    + `<path d="${scroll}" transform="translate(120 0) scale(-1 1)"/>${rosette}`
    + '<circle cx="4.5" cy="10.5" r="1.5"/><circle cx="115.5" cy="10.5" r="1.5"/></g></svg>';
}
// #endregion
const resources = [{ id: 'fleuron', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'fleuron.svg', width: 720, height: 162 },
  altText: t({ en: 'A printer’s flower: a four-petalled rosette between two leafy scrolls.',
    es: 'Un florón de imprenta: una roseta de cuatro pétalos entre dos volutas con hojas.' }) }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display, label and figure faces
  Lora: ['400', '400i'], Fraunces: ['300', '300i', '400', '600', '900'],
  Geist: ['400', '400i', '500', '600', '700'], 'Geist Mono': ['500', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('fleuron.svg', fleuron(palette.lapis)); // a picture's colours are fixed when drawn
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Five chapter openers', es: 'Cinco aperturas de capítulo' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
