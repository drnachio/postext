// ═══ Postext Cookbook · Nº 029 · Anchoring cheat sheet: a poster built from chained elements ═══
// https://postext.dev/en/cookbook/anchoring-cheat-sheet
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Funnel Display, Funnel Sans, Martian Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// An A3 poster whose elements hang from the bleed, the page, their slot or one another, never
// from coordinates; the second sheet is the same poster with each element framed and tagged.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'anchoring-cheat-sheet';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#0b0b0c', // text, and the Moon
  sky: '#1b3bff', // the sky, the foot band and the dates
  sun: '#ffe53b', // the Sun and the kicker
  paper: '#ffffff', // type on the sky
  muted: '#5c5f66', // speakers and the colophon
  guide: '#ff2d9b', // frames and tags on the construction sheet
};
// col(id): a palette-linked colour that also carries its hex, because 1.4.1 paints design
// elements from the hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'sky (defaults)', value: { hex: palette.sky, model: 'hex' } },
];

const A3 = { width: 297, height: 420 }; // mm, the trim
const MARGIN = 18; // mm at the top and sides: the body's edges, and the header container's
const FOOT = 30; // mm, the bottom margin: the footer container and its band
const BLEED = 0; // mm; 3 for the printer, which switches on page.cutLines below
// at(): a placement. Offsets are distances from the anchor point, never page coordinates.
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const wide = (w) => ({ width: mm(w) }); // fixed, so a text is as wide as its column
const square = (d) => ({ width: mm(d), height: mm(d) });
// Design text is centred and cut with '…' by default (gotcha: overflow-ellipsis-default).
const text = (id, content, face, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'left', ...face, placement });
const face = (fontFamily, size, fontWeight, colour, more) => ({ fontFamily, fontSize: pt(size),
  fontWeight, color: col(colour), ...more });
const caps = (tracking) => ({ letterSpacing: pt(tracking), textTransform: 'uppercase' });
const FACE = { // lineHeight: a multiple, never pt() (gotcha: design-lineheight-multiple)
  kicker: face('Martian Mono', 12, 500, 'sun', caps(1.8)),
  title: face('Funnel Display', 120, 800, 'paper', { lineHeight: 0.86 }),
  deck: face('Funnel Sans', 22, 400, 'paper', { lineHeight: 1.22 }),
  day: face('Funnel Display', 84, 800, 'sky', { lineHeight: 0.9 }),
  talk: face('Funnel Sans', 19, 600, 'ink', { lineHeight: 1.14 }),
  who: face('Funnel Sans', 12.5, 400, 'muted', { lineHeight: 1.3, italic: true }),
  foot: face('Martian Mono', 9, 500, 'paper', caps(0.9)),
};

// #region answer: two elements pinned to frames of the sheet, every other one to an element
const SKY = 272; // mm from the trim's top edge to the horizon, the sky's lower edge
const INSET = BLEED + MARGIN; // from the bleed's edge to the text's edge
const AIR = 14; // mm between the standfirst and the horizon
const poster = () => ({ enabled: true, slot: { elements: [ // array order is paint order
  // 'bleed' and 'page' are frames of the sheet; 'container' would be this heading's own box.
  { kind: 'box', id: 'sky', style: { backgroundColor: col('sky') }, // no width: fills the bleed
    placement: at('bleed', 'top-left', 0, 0, { height: mm(BLEED + SKY) }) },
  ...eclipse(), // the Sun hangs from the trim's corner, the Moon and the corona from the Sun
  // The headline stands on the horizon and grows upwards: 'above' puts an element's
  // bottom-left corner on the top-left corner of its anchor, so a longer title lifts the kicker.
  text('deck', '{attr.deck}', FACE.deck, { ...at('#sky', 'align-bottom', INSET, -AIR),
    size: { maxWidth: mm(153) } }), // shrink-wraps its lines, but wraps at 153 mm
  text('title', '{titleText}', FACE.title, at('#deck', 'above', 0, -9)), // breaks at the \\
  text('kicker', '{attr.kicker}', FACE.kicker, at('#title', 'above', 0, -7)),
  ...programme(), // four columns chained off the horizon
] } }); // hook-up: headings.levels[0] = { span: 'page', breakBefore, advancedDesign: poster() }
// {titleText} is the heading's text; each {attr.*} is written on its line in content.md.
// #endregion

// #region eclipse: the Sun pinned to the trim's corner, the Moon and the corona to the Sun
const SUN = 150; // mm across; the Moon is drawn the same size
const CORONA = 300; // mm, the square picture of the corona
const HALO = (CORONA - SUN) / 2; // how far the corona reaches past the Sun on every side
const BITE = { x: 2, y: 2.5 }; // mm the Moon sits off the Sun: a sliver is left at upper left
const disc = (id, colour, placement) => ({ kind: 'box', id, placement: { ...placement,
  size: square(SUN) }, style: { backgroundColor: col(colour), borderRadius: mm(SUN / 2) } });
const eclipse = () => [
  { kind: 'image', id: 'corona', resourceId: 'corona', // listed before the discs: painted behind
    placement: at('#sun', 'align-top', -HALO, -HALO, square(CORONA)) },
  disc('sun', 'sun', at('page', 'top-right', 30, 25)), // 30 mm of it past the right edge
  disc('moon', 'ink', at('#sun', 'align-top', BITE.x, BITE.y)),
];
// #endregion

// #region programme: four evenings in fixed-width columns, chained right-of and below
const GUT = 7; // mm between the evenings, and between the two columns of text under them
const COL = (A3.width - 2 * MARGIN - 3 * GUT) / 4; // four columns across the text width: 60 mm
const DROP = 12; // mm from the horizon to the dates
const programme = () => [1, 2, 3, 4].flatMap((n) => [
  text(`day${n}`, `{attr.d${n}}`, FACE.day, n === 1
    ? at('#sky', 'below', INSET, DROP, wide(COL)) // the first date hangs from the horizon
    : at(`#day${n - 1}`, 'right-of', GUT, 0, wide(COL))), // the others from the one before
  text(`talk${n}`, `{attr.t${n}}`, FACE.talk, at(`#day${n}`, 'below', 0, 3, wide(COL))),
  text(`who${n}`, `{attr.s${n}}`, FACE.who, at(`#talk${n}`, 'below', 0, 2.5, wide(COL))),
]);
// #endregion

// #region footer: a band and the club's mark in the footer slot, which prints on every page
const MARK = 10; // mm, the club's mark
const PAD = (FOOT - MARK) / 2; // centres the mark in the bottom margin
const markTall = { height: mm(MARK) }; // as tall as the mark: the line is centred on it
const footer = { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('sky') }, // the bottom margin, bled
    placement: at('bleed', 'bottom-left', 0, 0, { height: mm(BLEED + FOOT) }) },
  // The container runs from the text down to the trim: 'bottom-*' counts up, 'top-*' down.
  { kind: 'image', id: 'mark', resourceId: 'mark',
    placement: at('container', 'bottom-left', 0, -PAD, square(MARK)) },
  text('club', '{attr.club}', FACE.foot, at('#mark', 'right-of', 3, 0, markTall)),
  text('free', '{attr.free}', FACE.foot, at('container', 'top-right', 0, PAD, markTall)),
] };
// #endregion

// #region guides: the same slots, each element framed and tagged with its own placement
const GUIDE = { borderColor: col('guide'), borderWidth: pt(1) };
const signed = ({ value }) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`; // all offsets in mm
const describe = ({ id, placement: { anchor: { to, edge }, offset = {} } }) => [`#${id}`,
  `${edge} ${to}`, // the two words of anchor: { to, edge }
  ['x', 'y'].filter((k) => offset[k]?.value).map((k) => `${k} ${signed(offset[k])}`).join(' '),
].filter(Boolean).join(' · ');
// A border never changes an element's size (padding does), so each frame traces its box.
// An image or a rounded box gets a square frame of its size, hung from its top-left corner.
const frame = (el) => (el.kind === 'text' ? [{ ...el, box: { ...el.box, ...GUIDE } }]
  : el.kind === 'box' && !el.style.borderRadius ? [{ ...el, style: { ...el.style, ...GUIDE } }]
    : [el, { kind: 'box', id: `${el.id}-box`, style: GUIDE,
      placement: at(`#${el.id}`, 'align-top', 0, 0, el.placement.size) }]);
const tag = (el, [edge, x = 0, y = 0, note]) => text(`${el.id}-tag`, note ?? describe(el),
  face('Martian Mono', 8.5, 500, 'ink', { box: { backgroundColor: col('guide'),
    padding: { top: pt(1.6), bottom: pt(1.2), left: pt(3), right: pt(3) } } }),
  at(`#${el.id}`, edge, x, y));
const guides = (elements, tags) => [...elements.flatMap(frame),
  ...elements.filter((el) => tags[el.id]).map((el) => tag(el, tags[el.id]))];
const container = (id) => ({ kind: 'box', id, style: GUIDE, // the slot's own box, drawn
  placement: at('container', 'top-left', 0, 0, { width: 'fill', height: 'fill' }) });
const TAGS = { // where each tag sits against its element: [edge, x, y, text]
  sky: ['align-bottom', INSET, -3], corona: ['align-bottom', 90, -2], sun: ['above'],
  moon: ['below', 20, 2], kicker: ['above'], title: ['above'], deck: ['above'],
  day1: ['above', 0, -6], day2: ['above'], who1: ['below'],
  mark: ['above', 0, -2], club: ['above', 69, -2], free: ['above', -30, -2],
  header: ['align-bottom', 0, -2, t({ en: 'header container', es: 'contenedor de la cabecera' })],
  footer: ['align-bottom', 0, -2, t({ en: 'footer container', es: 'contenedor del pie' })],
};
// #endregion

const LEAD = 16; // body leading in pt
const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  colorPalette,
  page: { width: mm(A3.width), height: mm(A3.height), dpi: 150, // 150 dpi is for the screen
    cutLines: { enabled: BLEED > 0, bleed: mm(BLEED) },
    margins: { top: mm(MARGIN), bottom: mm(FOOT), left: mm(MARGIN), right: mm(MARGIN) } },
  layout: { layoutType: 'double', gutterWidth: mm(GUT) }, // the text columns under the evenings
  bodyText: { fontFamily: 'Funnel Sans', fontSize: pt(12), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0),
    paragraphSpacing: true },
  // The hidden title is still measured, so it needs a face FONTS loads.
  headings: { fontFamily: 'Funnel Display', fontWeight: 800,
    levels: [{ level: 1, span: 'page', advancedDesign: poster(),
      breakBefore: { enabled: true, parity: 'any' } }] }, // gotcha: headings-drop-h1-break
  // {style="guides"}: the same design framed and tagged, and a header and footer of its own.
  headingStyles: [{ id: 'guides',
    advancedDesign: { enabled: true, slot: { elements: guides(poster().slot.elements, TAGS) } },
    header: { elements: guides([container('header')], TAGS) },
    footer: { elements: guides([...footer.elements, container('footer')], TAGS) } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Martian Mono', fontSize: pt(8),
    lineHeight: pt(LEAD * 0.75), color: col('muted') }],
  header: { elements: [] }, // the poster has none; the guides page draws the empty container
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the corona and the club's mark, drawn in code, and their resources
function mulberry32(seed) { // a seeded generator: the same corona on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function coronaSvg() { // a glow, then 14 streamers, 70 polar plumes and 160 fine rays
  const rand = mulberry32(20270802);
  const R = (500 * SUN) / CORONA; // the Sun's radius in the 1000-unit square
  const TILT = Math.PI / 4; // the Sun's equator: long streamers go up-left, clear of the kicker
  const TYPE = [2.2, 3.05]; // radians from the centre where the type is: rays there stop at 9 mm
  const p = (r, a) => `${(500 + r * Math.cos(a)).toFixed(1)} ${(500 + r * Math.sin(a)).toFixed(1)}`;
  const ray = (a, full, half, opacity) => { // a petal from the limb, tapered to a point
    const turn = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const length = turn > TYPE[0] && turn < TYPE[1] ? Math.min(full, R * 0.12) : full;
    const bend = (rand() - 0.5) * 0.06;
    return `<path d="M${p(R * 0.97, a - half)}C${p(R + length * 0.35, a - half * 1.1)} `
      + `${p(R + length * 0.7, a + bend - half * 0.25)} ${p(R + length, a + bend)}`
      + `C${p(R + length * 0.7, a + bend + half * 0.25)} ${p(R + length * 0.35, a + half * 1.1)} `
      + `${p(R * 0.97, a + half)}Z" fill="${palette.paper}" fill-opacity="${opacity.toFixed(3)}"/>`;
  };
  const glow = Array.from({ length: 28 }, (_, i) => `<circle cx="500" cy="500" `
    + `r="${(R * (1.01 + i * 0.022)).toFixed(1)}" fill="${palette.paper}" fill-opacity="0.022"/>`)
    .reverse().join('');
  const out = [];
  for (let i = 0; i < 14; i++) { // helmet streamers, two fans across the equator
    const a = TILT + (i % 2) * Math.PI + (rand() - 0.5) * 1.1;
    out.push(ray(a, R * (0.55 + 0.45 * rand()), 0.1 + 0.14 * rand(), 0.06 + 0.06 * rand()));
  }
  for (let i = 0; i < 70; i++) { // polar plumes, shorter and thinner than the streamers
    const a = TILT + Math.PI / 2 + (i % 2) * Math.PI + (rand() - 0.5) * 1.3;
    out.push(ray(a, R * (0.18 + 0.3 * rand()), 0.008 + 0.012 * rand(), 0.1 + 0.12 * rand()));
  }
  for (let i = 0; i < 160; i++) { // fine rays all round
    const a = (i / 160) * 2 * Math.PI + (rand() - 0.5) * 0.04;
    out.push(ray(a, R * (0.12 + 0.3 * rand()), 0.006 + 0.014 * rand(), 0.05 + 0.07 * rand()));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1500" `
    + `viewBox="0 0 1000 1000">${glow}${out.join('')}</svg>`;
}
function markSvg() { // the Umbra Circle's mark: a ring round an eclipsed Sun
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">`
    + `<circle cx="50" cy="50" r="45" fill="none" stroke="${palette.paper}" stroke-width="6"/>`
    + `<circle cx="50" cy="50" r="27" fill="${palette.sun}"/>`
    + `<circle cx="56" cy="45" r="27" fill="${palette.sky}"/></svg>`;
}
const svg = (id, size, altText) => ({ id, typeId: 'figure', kind: 'svg', altText,
  svg: { fileId: `${id}.svg`, width: size, height: size }, createdAt: 0, updatedAt: 0 });
// Image elements draw resources. Nothing cites them, so neither is placed or numbered as a figure.
const resources = [
  svg('corona', 1500, t({ en: 'The solar corona round the eclipsed Sun',
    es: 'La corona solar alrededor del Sol eclipsado' })),
  svg('mark', 200, t({ en: 'The Umbra Circle’s mark', es: 'El emblema del Círculo Umbra' })),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint, loaded before the first build (gotcha: fonts-first).
const FONTS = {
  'Funnel Display': ['800'],
  'Funnel Sans': ['400', '400i', '600', '700'],
  'Martian Mono': ['400', '500'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('corona.svg', coronaSvg());
await loadSvg('mark.svg', markSvg());
await loadFonts(FONTS, markdown);
// pageIndexOffset 1 makes the poster a verso, so the viewer sets the two sheets side by side.
const content = { markdown, resources, continuation: { pageIndexOffset: 1 } };
const doc = await buildWithFonts(() => buildDocument(content, config()), markdown);
showPages(doc, { title: t({ en: 'Anchoring cheat sheet', es: 'Chuleta de anclajes' }) });

// @kit
