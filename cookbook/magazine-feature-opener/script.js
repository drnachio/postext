// ═══ Postext Cookbook · Nº 004 · Magazine feature: photo opener to end mark ═══════
// https://postext.dev/en/cookbook/magazine-feature-opener
// Code: MIT · Text: original (CC BY 4.0) · Photos: Ales Krivec, Hannah Donze (CC0)
// Fonts: Literata, Instrument Serif, Instrument Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// A nature feature from a winter issue. The level-1 heading carries its kicker, standfirst,
// byline and photo credit as attributes, and one opener design lays them out under a bleed
// photograph; the story runs on with a pull quote, a fact box, a photo band, a numbers panel
// and an end mark, and the next item reuses the opener with a drawing in place of the photo.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'magazine-feature-opener';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Every colour below is linked to this palette by id.
const palette = {
  ink: '#15191c', // text: a blue-black
  lake: '#2d6a7d', // the accent: kickers, crossheads, the quote, the fact box's stripe
  ember: '#c8773d', // the panel's figures: 5.2:1 on ink (only 3.4:1 on paper)
  rust: '#9a5a2e', // the field guide's accent, swapped in for 'lake' by its heading style
  ice: '#dbe8ec', // the type on the dark panel and the drawing's sky
  rule: '#c7cdd1', // the drawing's far ridge and air bubbles
  muted: '#66707a', // running heads, credits, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'lake (defaults)', value: { hex: palette.lake, model: 'hex' } },
];
const TRIM = 225; // page width in mm, shared with the drawing
const INNER = 16; // inner margin in mm
const OUTER = 14; // outer margin in mm: folios and running heads align to it
const LEAD = 13.4; // body leading in pt: the baseline grid

// #region answer: a bleed photo, then the heading's kicker, headline, standfirst, byline and credit
const TOP = 22; // top margin in mm: an opener's container starts here
const sans = { fontFamily: 'Instrument Sans', fontWeight: 600, textTransform: 'uppercase' };
const HEAD = 118; // mm: the headline's measure; the standfirst takes the rest of the line
// Empty padding paints nothing but counts: the story starts on the first grid line at least
// 5 mm under the lower of the headline and the byline, however many lines each one runs to.
const air = { padding: { bottom: mm(5) } };
const at = (id, edge, x, y, width) => ({ anchor: { to: id, edge },
  offset: { x: mm(x), y: mm(y) }, ...(width && { size: { width: mm(width) } }) });
const opener = (resourceId, depth) => ({ // depth: how far down the page the picture bleeds
  enabled: true, // no minHeight: the story starts under the headline and byline (see air)
  slot: {
    elements: [ // the photo is an element, not a float: no float reaches the trim
      { kind: 'image', id: 'photo', resourceId, placement: { anchor: { to: 'bleed',
        edge: 'top-left' }, size: { width: 'fill', height: mm(depth) } } },
      // The photo hangs from the page's top edge, the words from the container, TOP mm lower:
      // depth − TOP is the photo's foot, so the credit sits 2 mm under it and the kicker 9 mm.
      { kind: 'text', id: 'credit', content: '{attr.credit}', ...sans, fontWeight: 500,
        fontSize: pt(6.5), letterSpacing: pt(0.6), color: col('muted'), align: 'right',
        placement: at('container', 'top-right', 0, depth - TOP + 2) },
      { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...sans, fontSize: pt(8.5),
        letterSpacing: pt(1.7), color: col('lake'), align: 'left',
        placement: at('container', 'top-left', 0, depth - TOP + 9) },
      { kind: 'text', id: 'headline', content: '{titleText}', fontFamily: 'Instrument Serif',
        fontSize: pt(58), color: col('ink'), align: 'left', overflow: 'wrap', box: air,
        lineHeight: 0.94, // a multiple of the size (gotcha: design-lineheight-multiple)
        placement: at('#kicker', 'below', 0, 2.5, HEAD) },
      { kind: 'text', id: 'standfirst', content: '{attr.standfirst}', italic: true,
        fontFamily: 'Instrument Serif', fontSize: pt(13.5), lineHeight: 1.22, // a multiple
        color: col('ink'), align: 'left',
        overflow: 'wrap', // gotcha: overflow-ellipsis-default
        placement: at('#headline', 'right-of', 7, 3.2) }, // wraps at the container's edge
      { kind: 'text', id: 'byline', content: '{attr.byline}', ...sans, fontSize: pt(7.5),
        letterSpacing: pt(1.3), color: col('ink'), align: 'left', box: air,
        placement: at('#standfirst', 'below', 0, 3.5) },
    ],
  },
}); // hook-up: headings.levels[0] = { level: 1, span: 'page', breakBefore, advancedDesign:
// opener('lake', 160) }. {titleText} prints the heading's text, {attr.<key>} its <key>="…":
// # The Lake That Keeps Time {kicker="…" standfirst="…" byline="…" credit="…"}
// #endregion

// #region heads: magazine and issue on the verso, the story on the recto, a lake square
const FOLIO_PT = 8.5; // the folio's size in pt
const LABEL_PT = 7.5; // the label's size in pt
const SQUARE = 2.1; // mm: the lake square's side, the folio's cap height
const label = { ...sans, fontSize: pt(LABEL_PT), letterSpacing: pt(1.3), color: col('muted') };
const folio = { fontFamily: 'Instrument Sans', fontWeight: 700, fontSize: pt(FOLIO_PT),
  color: col('ink') };
// A design text's baseline sits 0.8 down its line box, 1.2 × its size (the default lineHeight).
const baseline = (size) => size * 1.2 * 0.8 * 25.4 / 72; // mm from its box's top, size in pt
const HEAD_Y = 12; // mm from the top edge to the folio's box, inside the 22 mm top margin
const LINE = HEAD_Y + baseline(FOLIO_PT); // the heads' one baseline, from the top edge
const pin = (edge, x, y = HEAD_Y) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) } }); // in the margin (gotcha: header-paints-over-text)
const sides = [['even', 'left', 1], ['odd', 'right', -1]]; // 1: the outer edge is on the left
const header = { elements: sides.flatMap(([parity, edge, s]) => [
  { kind: 'text', id: `folio-${parity}`, content: '{pageNumber}', ...folio,
    placement: pin(`top-${edge}`, s * OUTER) },
  { kind: 'box', id: `square-${parity}`, style: { backgroundColor: col('lake') },
    placement: { ...pin(`top-${edge}`, s * (OUTER + 7.5), LINE - SQUARE), // on the line
      size: { width: mm(SQUARE), height: mm(SQUARE) } } },
  // The smaller label's baseline sits higher in its box (0.34 mm at 7.5 and 8.5 pt), so its
  // box goes that much lower: folio, square and label share one baseline at any size.
  { kind: 'text', id: `head-${parity}`, ...label,
    content: s > 0 ? '{title} · {subtitle}' : '{chapterTitle}',
    placement: pin(`top-${edge}`, s * (OUTER + 11.5), LINE - baseline(LABEL_PT)) },
].map((element) => ({ ...element, parity, pages: 'body' }))) }; // no running heads on openers
const footer = { elements: sides.map(([parity, edge, s]) => ({ kind: 'text', parity,
  id: `drop-folio-${parity}`, ...folio, content: '{pageNumber}', pages: 'opener', align: edge,
  placement: pin(`bottom-${edge}`, s * OUTER, -11) })) }; // an opener's only folio, at the foot
// #endregion

// #region quote: a pull quote whose mark hangs in the margin, outside the text's edge
// The glyph is centred in an icon square that the box keeps as a column, size + gap wide,
// left of the text. A negative gap pulls the text back over the square's empty right side,
// and a left padding of −(size + gap) moves that column out into the margin, so the text
// starts on the column's edge and the mark hangs outside it. The frame stays on the column
// (a background would stop short of the mark). « sits lower and runs wider than “, so the
// Spanish mark is set smaller.
const MARK = t({ en: { glyph: '“', size: 50, column: 34 }, // pt; the column is 12 mm
  es: { glyph: '«', size: 28, column: 22.5 } });
// The paddings are optical: once the next paragraph snaps to the grid, the quote has
// the same air above and below it, in both languages.
const quote = { id: 'pullquote', backgroundEnabled: false, marginTop: pt(LEAD),
  marginBottom: pt(0), padding: { top: pt(8), right: pt(0), bottom: pt(7),
    left: pt(-MARK.column) }, // negative: the icon column starts out in the margin
  icon: { kind: 'glyph', glyph: MARK.glyph, fontFamily: 'Instrument Serif',
    size: pt(MARK.size), color: col('lake') },
  titleStyle: { gap: pt(MARK.column - MARK.size) }, // negative too: size + gap = column
  body: { fontFamily: 'Instrument Serif', fontSize: pt(19), lineHeight: pt(1.5 * LEAD),
    textAlign: 'left', hyphenation: false, color: col('lake'), // display type: no hyphens
    italicColor: col('lake'), firstLineIndent: pt(0) } };
// #endregion

// #region boxes: a fact box at a column head, a dark panel at the page foot, the end mark
// Floated boxes keep one body line from the text, so they need no margins of their own.
const glance = { id: 'glance', placement: 'top', // floats to the next column head: no hole
  backgroundEnabled: false, // one device, the stripe; the text keeps the column's edges
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('lake') },
  padding: { top: mm(2.5), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { ...sans, fontWeight: 700, fontSize: pt(7.5), letterSpacing: pt(1.5),
    color: col('lake'), gap: mm(2) },
  body: { fontFamily: 'Instrument Sans', fontSize: pt(8.6), lineHeight: pt(12.2),
    textAlign: 'left', hyphenation: false, firstLineIndent: pt(0) } }; // ink from bodyText
const numbers = { id: 'numbers', span: 'page', placement: 'bottom', // floats to a page foot
  background: col('ink'), columnGap: mm(8),
  padding: { top: mm(5), right: mm(6), bottom: mm(5.5), left: mm(6) },
  titleStyle: { ...sans, fontWeight: 700, fontSize: pt(7.5), letterSpacing: pt(1.5),
    color: col('ice'), gap: mm(1) },
  body: { fontFamily: 'Instrument Sans', fontSize: pt(9), lineHeight: pt(12.5),
    textAlign: 'left', hyphenation: false, color: col('ice'), firstLineIndent: pt(0) } };
// The panel's figures are level-4 headings (#### 31), a level the story never uses.
const figures = { level: 4, fontSize: pt(40), lineHeight: pt(40), color: col('ember'),
  marginBottom: pt(4) };
// The end mark is a chip with no visible text: a U+2060 inside, because a chip of spaces
// prints its markup (gotcha: empty-chip). Its lengths are in its own ems: paddingX makes
// the width, and the height is its font size's band (0.8 ascent + 0.25 descent). It is ink,
// not lake: the guide's palette would leave a lake chip teal on its rust page.
const endMark = { id: 'end', background: col('ink'), borderWidth: pt(0), borderRadius: pt(0),
  fontSize: em(0.62), paddingX: em(0.525), paddingY: em(0), gap: em(0.8) }; // 1.05 em square
// #endregion

// #region guide: the next item reuses the opener with its own picture, depth and accent
const ART = 126; // mm: the drawing bleeds less far down the page than the photograph
// On its pages, 'lake' turns rust in the opener, the headings and the boxes, but not in chips.
const guide = { id: 'guide', advancedDesign: opener('ice-art', ART),
  palette: { lake: palette.rust } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  resourceTypes: [photoType], // one unnumbered type for every picture (see the resources)
  colorPalette,
  page: { width: mm(TRIM), height: mm(297), margins: { top: mm(TOP), bottom: mm(20),
    left: mm(INNER), right: mm(OUTER), mirror: true }, // a magazine trim; left is the inner side
    dpi: 150 }, // the layout's pixels per inch, which bitmaps are measured in (see 'thaw')
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { fontFamily: 'Literata', fontSize: pt(9.6), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(3.5), indentAfterHeading: false,
    minWordSpacing: 0.65, // a space never shrinks below 65 % (the default allows 60 %)
    runtMinCharacters: 40 }, // 40 spaces' width, about 20 letters: no one-word last lines
  // Hyphenation, optimal line breaking and widow control are on by default.
  headings: {
    fontFamily: 'Instrument Serif', fontWeight: 400, color: col('ink'),
    // Under a top photo band on a closing page, this lever can drop the shorter column a line,
    // out of line with the other (gotcha: float-stretch-closing-page). The switch covers every
    // page, not only closing ones; the shipped copy does not trip it, edited copy might.
    balancing: { stretchAfterFloats: false },
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break);
      // 'any' lets the next item open on the following page, recto or verso.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginBottom: pt(0), advancedDesign: opener('lake', 160) },
      { level: 2, fontSize: pt(15), lineHeight: pt(LEAD), italic: true, color: col('lake'),
        marginTop: pt(LEAD), marginBottom: pt(0) }, // crossheads, one grid line above
      figures,
    ],
  },
  headingStyles: [guide],
  calloutStyles: [quote, glance, numbers],
  chipStyles: [endMark],
  captionStyle: { fontFamily: 'Instrument Sans', fontSize: pt(7.6), gap: mm(2), // ink: bodyText's
    note: { fontSize: pt(6.5), color: col('muted'), gap: mm(0.6) } },
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Instrument Sans', fontSize: pt(6.6),
    lineHeight: pt(9.4), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
    marginTop: pt(2 * LEAD) }],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region resources: two photographs and a drawing, declared once, by their real pixels
// The pictures are not numbered: their own type, with an empty caption prefix and template,
// keeps a figure number off the pine wood's caption.
const photoType = { id: 'photo', name: t({ en: 'Photograph', es: 'Fotografía' }),
  shortLabel: t({ en: 'photo', es: 'foto' }), captionPrefix: '', numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal' };
const PX = 10; // the drawing's pixels per mm
const resources = [
  { id: 'lake', typeId: 'photo', kind: 'bitmap', createdAt: 0, updatedAt: 0, // never cited:
    // the opener fits it inside its box, so the JPEG is cropped to the box, 225 × 160 mm
    bitmap: { fileId: 'lake-2000.jpg', format: 'jpeg', width: 2000, height: 1422 },
    altText: t({ en: 'A still mountain lake mirroring clouds between autumn slopes.',
      es: 'Un lago de montaña en calma que refleja las nubes entre laderas otoñales.' }) },
  { id: 'thaw', typeId: 'photo', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    // Pixels at the page's 150 dpi (gotcha: bitmap-print-size): 2000 px make 339 mm, so the
    // band shrinks to the 195 mm measure. At 300 dpi it would print 169 mm wide.
    bitmap: { fileId: 'thaw-2000.jpg', format: 'jpeg', width: 2000, height: 944 },
    // A top float opens the page after its ::resource line (gotcha: top-float-next-page):
    // the line sits on the verso, so the band heads the recto.
    placement: { position: 'top', span: 'page' },
    caption: t({ en: 'Early March in the pine wood above the shore: the snow goes first where '
      + 'the sun reaches the ground, weeks before the ice lets go of the lake.',
    es: 'Principios de marzo en el pinar sobre la orilla: la nieve se retira primero donde el '
      + 'sol llega al suelo, semanas antes de que el hielo suelte el lago.' }),
    note: t({ en: 'Photograph: Hannah Donze, CC0, via Wikimedia Commons',
      es: 'Fotografía: Hannah Donze, CC0, vía Wikimedia Commons' }),
    altText: t({ en: 'A walker on a snowy path between tall pines.',
      es: 'Un caminante en un sendero nevado entre pinos altos.' }) },
  { id: 'ice-art', typeId: 'photo', kind: 'svg', createdAt: 0, updatedAt: 0, // drawn below
    svg: { fileId: 'ice-art.svg', width: TRIM * PX, height: ART * PX },
    altText: t({ en: 'A lake in section: snow, white ice, black ice and water under a low sun.',
      es: 'Un lago en sección: nieve, hielo blanco, hielo negro y agua bajo un sol bajo.' }) },
];
// #endregion

const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the guide's picture, a lake in section, drawn in code with a seeded PRNG
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function iceArt() { // in mm, TRIM × ART: sky, shore, snow, white ice, black ice, water
  const rand = mulberry32(14);
  const f = (id, a = 1) => `fill="${palette[id]}"${a < 1 ? ` fill-opacity="${a}"` : ''}`;
  const rect = (x, y, w, h, paint) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${paint}/>`;
  const ridge = (base, amp, step, paint) => { // a mountain line, closed down to the shore
    let d = `M0 ${base}`;
    for (let x = 0; x <= TRIM; x += step) d += `L${x} ${(base - rand() * amp).toFixed(1)}`;
    return `<path d="${d}L${TRIM} 60L0 60Z" ${paint}/>`;
  };
  const pines = Array.from({ length: 46 }, (_, i) => { // the far shore, a row of spruces
    const x = i * 5 + rand() * 3;
    const h = 4 + rand() * 5;
    return `<path d="M${x.toFixed(1)} ${60 - h}l${h * 0.28} ${h}h${-h * 0.56}Z" `
      + `${f('ink', 0.85)}/>`;
  }).join('');
  const bubbles = Array.from({ length: 70 }, () => { // air trapped in the white ice
    const r = 0.25 + rand() * 0.6;
    const [cx, cy] = [(rand() * TRIM).toFixed(1), (72 + rand() * 6).toFixed(1)];
    return `<circle cx="${cx}" cy="${cy}" r="${r}" ${f('paper')} stroke="${palette.rule}" `
      + 'stroke-width="0.15"/>';
  }).join('');
  // Black ice: a solid sheet on the winter side (left) that rots into candles towards spring,
  // ten rods evenly spaced, each shorter and thinner than the last.
  const candles = Array.from({ length: 10 }, (_, i) => rect(150 + i * 7.5, 79,
    (2.6 - i * 0.1).toFixed(2), (12.5 - i * 0.55 - rand() * 1.5).toFixed(1), f('ink'))).join('');
  const clouds = [[18, 15, 52], [98, 8, 38], [146, 21, 30]].map(([x, y, w]) => [[x, y, w],
    [x + w * 0.22, y - 2.4, w * 0.42]].map(([cx, cy, cw]) => `<rect x="${cx}" y="${cy}" `
    + `width="${cw}" height="4.4" rx="2.2" ${f('paper', 0.7)}/>`).join('')).join('');
  const fish = (x, y, s) => `<path d="M${x} ${y}c${3 * s} ${-2 * s} ${7 * s} ${-2 * s} ${9 * s} 0`
    + `c${-2 * s} ${2 * s} ${-6 * s} ${2 * s} ${-9 * s} 0Z` // the body, then the tail
    + `m0 0l${-2.5 * s} ${-1.6 * s}v${3.2 * s}Z" ${f('ink', 0.55)}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TRIM * PX}" height="${ART * PX}" `
    + `viewBox="0 0 ${TRIM} ${ART}">` + rect(0, 0, TRIM, ART, f('ice')) + clouds // winter sky
    + `<g transform="translate(0 ${ART - 112})">` // the lake keeps to the foot of the picture
    + `<circle cx="188" cy="24" r="9" ${f('ember', 0.9)}/>` // a low March sun
    + ridge(38, 16, 9, f('rule')) + ridge(48, 12, 6, f('muted', 0.55)) + pines
    + rect(0, 60, TRIM, 11, f('paper')) + rect(0, 60, TRIM, 11, f('ice', 0.3)) // snow
    + rect(0, 71, TRIM, 8, f('ice', 0.75)) + bubbles // white ice, cloudy with air
    + rect(0, 79, TRIM, 33, f('lake')) // the water, 4 °C at the floor
    + rect(0, 79, 146, 13, f('ink')) + candles + fish(60, 101, 1) + fish(128, 106, 0.8)
    + '</g></svg>';
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  Literata: ['400', '400i', '700'], 'Instrument Serif': ['400', '400i'],
  'Instrument Sans': ['400', '500', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all([loadImage('lake-2000.jpg', asset('lake-2000.jpg')),
  loadImage('thaw-2000.jpg', asset('thaw-2000.jpg')), loadSvg('ice-art.svg', iceArt())]);
const continuation = { pageNumbering: { startAt: 57 } }; // pages 57–60 of the issue
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'Magazine feature: photo opener to end mark',
  es: 'Reportaje de revista: de la foto de apertura al signo final' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
