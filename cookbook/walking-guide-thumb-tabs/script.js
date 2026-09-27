// ═══ Postext Cookbook · Nº 047 · Walking guide with thumb tabs ═══════════════════
// https://postext.dev/en/cookbook/walking-guide-thumb-tabs
// Code: MIT · Text: original (CC BY 4.0) · Map and tiles: drawn in code (CC BY 4.0)
// Fonts: Albert Sans, DM Serif Display, Asap Condensed (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// A pocket guide to Lisbon. Each walk is a heading style that sets four colours, and the tab,
// the stop numbers, the box's tint and title and the blank page before the walk take them.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'walking-guide-thumb-tabs';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: 'band' and three partners are the entries a walk overrides
const palette = {
  ink: '#1b2430', // text: a blue-black
  paper: '#fffdf8', // the page
  band: '#1f4e9c', // the section colour: tile blue until a walk replaces it
  bandInk: '#1d4a94', // the section colour for type on paper
  onBand: '#ffffff', // type set on the band
  wash: '#e8eef8', // the section's box tint
  muted: '#5e6875', // running heads, notes, chip outlines
};
// Each walk's values for those four. Baixa yellow is too light for white type, so its
// onBand is the ink. The text is recoloured by value, so the four base values must differ.
const WALKS = {
  alfama: { band: '#b9533a', bandInk: '#a1432b', onBand: '#ffffff', wash: '#f7e7e0' },
  baixa: { band: '#e2b23d', bandInk: '#7d5a0f', onBand: '#1b2430', wash: '#fbf0d5' },
  belem: { band: '#2b7a78', bandInk: '#236866', onBand: '#ffffff', wash: '#e1eeed' },
};
const NAMES = { alfama: 'Alfama', baixa: 'Baixa', belem: 'Belém' };
// A walk's palette follows the paletteId; the hex is written out too, since the document
// palette never reaches design elements (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id] ?? WALKS[id].band, model: 'hex', paletteId: id });
const entry = (id, hex) => ({ id, name: id, value: { hex, model: 'hex' } });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => entry(id, hex)),
  ...Object.entries(WALKS).map(([id, w]) => entry(id, w.band)), // for :swatch{color="alfama"}
  entry('main-color', palette.ink), // the engine's defaults link here: nothing prints blue
];
// #endregion
const TRIM = { width: 120, height: 200 }; // a pocket guide
// Mirrored, and tighter than a book's at top and foot: a pocket guide keeps 164 mm of text.
const MARGIN = { top: 18, bottom: 18, inner: 14, outer: 16 };
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // 90 mm, about 55 characters
const LEAD = 13.2; // body leading in pt: the baseline grid
const BAND = 48; // mm: a walk opener's colour band, from the top edge
const HEAD = { y: 10, gap: 7 }; // running heads from the top edge; folio to title (mm)
const label = { fontFamily: 'Asap Condensed', fontWeight: 600, textTransform: 'uppercase' };
const display = { fontFamily: 'DM Serif Display', fontWeight: 400 };
const at = (to, edge, x, y) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const size = (width, height) => ({ size: { width, height } });
const text = (id, content, style, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'left', ...style, placement });
const box = (id, style, placement) => ({ kind: 'box', id, style, placement });
const tileImage = (id, resourceId, edge, width, height) => ({ kind: 'image', id, resourceId,
  placement: { ...at('bleed', edge, 0, 0), ...size(width, height) } });

// #region answer: one tab and one blank-page field, coloured by the walk they belong to
// '# Alfama {style="alfama"}' opens a section that runs to the next level-1 heading. Its
// palette gives band, bandInk, onBand and wash the walk's values on the section's pages,
// in the page furniture and in the text alike.
const walkStyles = Object.keys(WALKS).map((id) => ({ id, palette: WALKS[id] }));
// The tab has one size and one place on every page, hanging from the foot of the opener
// band; only its colour and its number change from walk to walk.
const TAB = { y: BAND, width: 7, height: 24 }; // mm
const tab = (parity, edge) => text(`tab-${parity}`, '{chapterNumber}', {
  ...label, fontSize: pt(11), fontWeight: 700, color: col('onBand'), align: 'center',
  verticalAlign: 'middle', overflow: 'clip', box: { backgroundColor: col('band') },
  parity, pages: 'all', // the walk's first page is an 'opener' page: the tab goes there too
}, { ...at('bleed', edge, 0, TAB.y), ...size(mm(TAB.width), mm(TAB.height)) });
const tabs = [tab('odd', 'top-right'), tab('even', 'top-left')]; // on the fore-edge
// The blank verso that pushes a walk onto a recto belongs to that walk (gotcha:
// section-last-wins), so the field takes the next walk's colour and its numeral the number.
const blankPage = [
  box('field', { backgroundColor: col('band') },
    { ...at('bleed', 'top-left', 0, 0), ...size('fill', 'fill') }),
  tileImage('field-tiles', 'tiles-page', 'top-left', 'fill', 'auto'),
  text('field-number', '{chapterNumber}', { ...display, fontSize: pt(220), lineHeight: 1,
    color: col('onBand'), overflow: 'clip' }, at('page', 'bottom-left', MARGIN.outer, -24)),
].map((el) => ({ ...el, pages: 'blank' }));
// #endregion

// #region running-heads: book title on the verso, walk on the recto, folios outside
const head = (id, content, parity, placement, style = {}) => ({ ...text(id, content, {
  ...label, fontSize: pt(7.8), letterSpacing: pt(1.3), color: col('muted'), overflow: 'clip',
  ...style }, placement), parity, pages: 'body' }); // never on openers or blank pages
const folio = { fontSize: pt(8.5), fontWeight: 700, color: col('ink') };
// Anchored to the page: from its top-right corner a negative x runs inwards
// (gotcha: negative-offsets).
const heads = [
  head('verso-folio', '{pageNumber}', 'even', at('page', 'top-left', MARGIN.outer, HEAD.y), folio),
  head('verso-title', '{title}', 'even', at('page', 'top-left', MARGIN.outer + HEAD.gap, HEAD.y)),
  head('recto-title', `${t({ en: 'Walk', es: 'Paseo' })} {chapterNumber} · {chapterTitle}`, 'odd',
    at('page', 'top-right', -(MARGIN.outer + HEAD.gap), HEAD.y), { color: col('bandInk') }),
  head('recto-folio', '{pageNumber}', 'odd', at('page', 'top-right', -MARGIN.outer, HEAD.y), folio),
];
// Array order is paint order: the blank page's field comes last and covers the tab there.
const header = { elements: [...heads, ...tabs, ...blankPage] };
// A walk's first page has no running head: its folio drops to the foot.
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all',
  at('container', 'top', 0, 7), folio), pages: 'opener', align: 'center' }] };
// Page 2 comes before Walk 1, where {chapterNumber} is empty, so its header has no tabs. With the
// level's break off (gotcha: style-inherits-break) and in the column, it is a 'body' page.
const introStyle = { id: 'intro', numbered: false, header: { elements: heads },
  span: 'column', breakBefore: { enabled: false }, advancedDesign: { enabled: false },
  fontSize: pt(24), lineHeight: pt(2 * LEAD), marginBottom: pt(LEAD / 2) };
// #endregion

// #region levels: a walk opens under a band in its colour; its stops are numbered circles
const walkLevel = { level: 1, breakBefore: { enabled: true, parity: 'odd' }, // a recto
  span: 'page', // kept in the column, the band would be cut at the top margin, 18 mm down
  // The band ends 30 mm into the text area; a floor of 8 grid lines, with nothing added
  // under it, starts the text 7.3 mm below the band.
  marginBottom: pt(0), advancedDesign: { enabled: true, minHeight: pt(8 * LEAD), slot: {
    elements: [
      box('band', { backgroundColor: col('band') },
        { ...at('bleed', 'top-left', 0, 0), ...size('fill', mm(BAND)) }),
      tileImage('tiles', 'tiles-band', 'top-right', 'auto', mm(BAND)),
      text('kicker', `${t({ en: 'Walk', es: 'Paseo' })} {chapterNumber}`, { ...label,
        fontSize: pt(9), letterSpacing: pt(2), color: col('onBand') },
      at('page', 'top-left', MARGIN.inner, 17)), // walks open on rectos: inner is left
      text('title', '{titleText}', { ...display, fontSize: pt(34), lineHeight: 1,
        color: col('onBand') }, { ...at('#kicker', 'below', 0, 1), ...size(mm(70), 'auto') }),
      text('route', '{attr.route}', { fontFamily: 'Albert Sans', italic: true, fontSize: pt(10),
        color: col('onBand') }, { ...at('#title', 'below', 0, 1.5), ...size(mm(70), 'auto') }),
    ] } } };
const STOP = 5.4; // mm: the diameter of a stop's circle
const stopLevel = { level: 3, numberingTemplate: '{3}', // restarts at every walk
  // A grid line above a stop and no margin under it, so the circle can sit 3.2 mm down its
  // two grid lines: about 8.3 mm of white above a stop and 2.1 under it, 6.4 between paragraphs.
  marginTop: pt(LEAD), marginBottom: pt(0), advancedDesign: { enabled: true, slot: { elements: [
    text('number', '{number}', { ...label, fontSize: pt(9), fontWeight: 700, align: 'center',
      verticalAlign: 'middle', color: col('onBand'), overflow: 'clip',
      box: { backgroundColor: col('band'), borderRadius: mm(STOP / 2) } },
    { ...at('container', 'top-left', 0, 3.2), ...size(mm(STOP), mm(STOP)) }),
    text('name', '{titleText}', { ...display, fontSize: pt(13.5), lineHeight: 1.1,
      color: col('ink') }, { ...at('#number', 'right-of', 2.4, 0.2), ...size('fill', 'auto') }),
  ] } } };
// #endregion

// The cover: a wall of tiles, the title on a plaque like a Lisbon street sign, the walks' keys.
const plaque = size(mm(94), 'auto'); // the width of the texts on the plaque
const rim = (id, x, y, w, h, style) => box(id, { borderColor: col('band'), ...style },
  { ...at('page', 'top-left', x, y), ...size(mm(w), mm(h)) });
const cover = { enabled: true, slot: { elements: [
  tileImage('wall', 'tiles-cover', 'top-left', 'fill', 'auto'),
  rim('plaque', 13, 88, 94, 62, { backgroundColor: col('paper'), borderWidth: pt(1.6) }),
  rim('frame', 15.2, 90.2, 89.6, 57.6, { borderWidth: pt(0.5) }), // the inner frame line
  text('kicker', t({ en: 'A pocket guide', es: 'Guía de bolsillo' }), { ...label, align: 'center',
    fontSize: pt(8.5), letterSpacing: pt(2), color: col('bandInk') }, // centred text sits left
  { ...at('page', 'top-left', 13 + 0.35, 96), ...plaque }), // by half its tracking: 1 pt, 0.35 mm
  text('title', '{titleText}', { ...display, fontSize: pt(46), lineHeight: 0.98, align: 'center',
    color: col('band') }, { ...at('#kicker', 'below', 0, 2), ...plaque }),
  text('subtitle', '{subtitle}', { fontFamily: 'Albert Sans', italic: true, fontSize: pt(10.5),
    color: col('ink'), align: 'center' }, { ...at('#title', 'below', 0, 3), ...plaque }),
  ...Object.keys(WALKS).flatMap((id, i) => [text(`key-${id}`, String(i + 1), { ...label,
    fontSize: pt(10), fontWeight: 700, align: 'center', verticalAlign: 'middle', overflow: 'clip',
    color: col(WALKS[id].onBand === palette.ink ? 'ink' : 'onBand'),
    box: { backgroundColor: col(id) } }, { ...at('page', 'top-left', 17 + i * 30, 166),
    ...size(mm(7), mm(7)) }),
  text(`name-${id}`, NAMES[id], { ...display, fontSize: pt(13), color: col('ink') },
    at(`#key-${id}`, 'right-of', 2.2, 0.4))]),
] } };

// #region box-and-chips: a tile on the box's outer corner; chips that stay in ink
const calloutStyles = [{ id: 'dontmiss', title: t({ en: 'Don’t miss', es: 'No te lo pierdas' }),
  background: col('wash'), // one device: the walk's tint
  // The tile hangs half off the box's outer side, flush with its top: the left side on a verso.
  // With 6.5 mm of padding on both sides the title stays in line with the box's text there too.
  // The tile's colours are drawn into the SVG, so it stays tile blue in every walk.
  padding: { top: mm(3.4), right: mm(6.5), bottom: mm(3.4), left: mm(6.5) },
  icon: { kind: 'resource', resourceId: 'tile', size: mm(10), position: 'corner',
    cornerSide: 'outer' },
  titleStyle: { ...label, fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(1.5),
    color: col('bandInk') },
  body: { fontSize: pt(9), lineHeight: pt(12.4), color: col('ink') } }];
// A walk's palette does not reach chips: one linked to 'band' would stay tile blue in every
// walk, so the facts are ink on paper (gotcha: section-palette-skips-chips).
const chipStyles = [{ id: 'fact', background: col('paper'), borderColor: col('muted'),
  borderWidth: pt(0.6), borderRadius: mm(0.8), paddingX: mm(1.4), paddingY: mm(0.5),
  fontFamily: 'Asap Condensed', fontSize: em(0.92), color: col('ink'), bold: true }];
// #endregion

const MAP_WORD = t({ en: 'Map', es: 'Plano' }); // the caption reads 'Map 1'
const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  // Ragged text for short lines of directions. It is never hyphenated (gotcha:
  // ragged-no-hyphenation) and never checked for runts (gotcha: ragged-runts).
  bodyText: { fontFamily: 'Albert Sans', fontSize: pt(9.4), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true },
  // No lines added above the stops to fill a page: a guide's pages may end short.
  headings: { ...display, color: col('ink'), balancing: { enabled: false },
    // Any headings object drops the level-1 break: it is stated in walkLevel
    // (gotcha: headings-drop-h1-break).
    levels: [walkLevel, stopLevel] },
  headingStyles: [
    { id: 'cover', numbered: false, advancedDesign: cover,
      header: { elements: [] }, footer: { elements: [] } },
    introStyle, ...walkStyles,
  ],
  resourceTypes: [{ id: 'map', name: MAP_WORD, shortLabel: MAP_WORD, captionPrefix: MAP_WORD,
    numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }],
  captionStyle: { fontFamily: 'Asap Condensed', fontSize: pt(8.6), color: col('ink'),
    labelColor: col('bandInk'), gap: mm(2),
    note: { fontSize: pt(8), color: col('muted') } },
  calloutStyles,
  chipStyles,
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Asap Condensed', fontSize: pt(7.8),
    lineHeight: pt(10.4), color: col('muted') }, // then the line that ends a walk, in its colour
  { id: 'onward', fontFamily: 'Asap Condensed', fontSize: pt(10), color: col('bandInk'),
    boldColor: col('bandInk'), marginTop: pt(2 * LEAD) }],
  header,
  footer,
});

// #region art: the tiles, the map and its pins, drawn in code and seeded: every run the same
let seed = 1755; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const sheet = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const fill = (c, o = 1) => `fill="${c}"${o < 1 ? ` fill-opacity="${n(o)}"` : ''}`;
const line = (c, w, o = 1) => `fill="none" stroke="${c}" stroke-width="${n(w)}" `
  + `stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` stroke-opacity="${n(o)}"` : ''}`;
const shape = (pts, paint) => `<path d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')} Z" `
  + `${paint}/>`;
const put = (x, y, turn, body) => `<g transform="translate(${n(x)} ${n(y)}) rotate(${turn})">`
  + `${body}</g>`;
// A petal pointing up from the origin: `len` long, `wid` at its widest.
const petal = (len, wid) => `M0 0C${n(wid)} ${n(-len * 0.3)} ${n(wid * 0.7)} ${n(-len * 0.8)} `
  + `0 ${n(-len)}C${n(-wid * 0.7)} ${n(-len * 0.8)} ${n(-wid)} ${n(-len * 0.3)} 0 0Z`;
const flower = (x, y, [axis, axisW, diag = 0, diagW = 0], paint) => [0, 45, 90, 135, 180, 225,
  270, 315].filter((turn) => diag || turn % 90 === 0).map((turn) => put(x, y, turn,
  `<path d="${turn % 90 ? petal(diag, diagW) : petal(axis, axisW)}" ${paint}/>`)).join('');

// A pattern of s-mm tiles, as on a Lisbon façade: a circle round every corner where four
// tiles meet, and a flower in the diamond each tile keeps between the circles. `glaze`
// paints the tiles; without it only the motif is drawn, to lay over a colour.
function tiles(w, h, s, ink, { glaze, tint, o = 1, x0 = 0, y0 = 0 } = {}) {
  const [cols, rows] = [Math.ceil((w - x0) / s), Math.ceil((h - y0) / s)];
  let [back, front] = [glaze ? `<rect width="${w}" height="${h}" ${fill(glaze)}/>` : '', ''];
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const [x, y] = [x0 + c * s, y0 + r * s];
      back += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.47)}" `
        + `${fill(tint ?? ink, glaze ? 1 : o * 0.35)}/>`;
      front += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s * 0.47)}" ${line(ink, s * 0.035, o)}/>`
        + (glaze ? flower(x, y, [s * 0.2, s * 0.06], fill(ink, o)) : '') // glazed tiles only
        + flower(x + s / 2, y + s / 2, [s * 0.36, s * 0.075, s * 0.17, s * 0.05], fill(ink, o))
        + `<circle cx="${n(x + s / 2)}" cy="${n(y + s / 2)}" r="${n(s * 0.06)}" `
        + `${fill(glaze ?? ink, o)}/>`;
    }
  }
  return back + front;
}
const TILE = 15; // mm: one tile on the cover and on the bands
const BLUE = { tint: '#dde6f3', glaze: '#f8f5ee' };
function coverTiles() {
  const [w, h] = [TRIM.width, 112];
  let g = tiles(w, h, TILE, palette.band, { ...BLUE, y0: -4 });
  // The joints, through the flowers where four tiles meet.
  for (let k = 1; k < 8; k++) {
    g += `<path d="M${k * TILE} 0V${h}M0 ${k * TILE - 4}H${w}" ${line('#a9a292', 0.2, 0.6)}/>`;
  }
  // At the fore-edge one tile is missing and the plaster shows, in the shadow of the tiles
  // round it; the tile beside it has lost a jagged strip along their joint.
  const [x, y] = [7 * TILE, TILE - 4];
  const edge = [[x, y], [x - 2.6, y + 1.8], [x - 1.4, y + 4.6], [x - 3.4, y + 7.4],
    [x - 1.8, y + 10.2], [x - 2.4, y + 12.6], [x, y + 13.4], [x, y + TILE]];
  const hole = (d) => [[x + TILE, y + d], ...edge.map(([a, b]) => [a + d, Math.max(b, y + d)]),
    [x + TILE, y + TILE]];
  g += shape(hole(0), fill('#a89c83')) + shape(hole(0.8), fill('#d6ccb8'));
  for (let i = 0; i < 16; i++) {
    g += `<circle cx="${n(x - 2 + rand() * (TILE + 2))}" cy="${n(y + rand() * TILE)}" `
      + `r="${n(0.12 + rand() * 0.3)}" ${fill('#b3a78f', 0.8)}/>`;
  }
  return sheet(w, h, g);
}
// The white motif laid over a walk's band, and over the page before a walk.
const bandTiles = () => sheet(3 * TILE, BAND,
  tiles(3 * TILE, BAND, TILE, '#ffffff', { o: 0.3, y0: BAND - 3 * TILE }));
const pageTiles = () => sheet(TRIM.width, TRIM.height,
  tiles(TRIM.width, TRIM.height, TILE, '#ffffff', { o: 0.2, y0: BAND - 3 * TILE }));
// The corner badge of the 'Don't miss' box: one tile, framed.
const tileIcon = () => sheet(TILE, TILE, tiles(TILE, TILE, TILE, palette.band, BLUE)
  + `<rect x="0.35" y="0.35" width="${TILE - 0.7}" height="${TILE - 0.7}" `
  + `${line(palette.band, 0.7)}/>`);

// Digits drawn as strokes in a 6 × 10 box: an SVG drawn as an image cannot use the page's
// web fonts (gotcha: svg-no-webfonts).
const GLYPH = {
  0: 'M3 0C0.6 0 0 2.6 0 5S0.6 10 3 10 6 7.4 6 5 5.4 0 3 0Z',
  1: 'M1.2 2.2L3.6 0V10',
  2: 'M0.5 2.4C0.8 0.7 2 0 3.2 0C4.8 0 5.8 1.1 5.8 2.7C5.8 4.8 3.8 6 0.4 10H6',
  3: 'M0.5 1.3C1.2 0.4 2.2 0 3.2 0C4.8 0 5.8 1 5.8 2.5C5.8 4 4.5 4.8 2.6 4.8C4.6 4.8 6 5.8 6 7.4'
    + 'C6 9.1 4.8 10 3 10C1.9 10 0.9 9.6 0.2 8.6',
  4: 'M4.4 10V0L0 7H6.2',
  5: 'M5.6 0H1.2L0.7 4.6C1.4 4 2.3 3.8 3.1 3.8C4.9 3.8 6 5 6 6.9S4.8 10 3 10C1.9 10 0.9 9.6'
    + ' 0.3 8.8',
  N: 'M0 10V0L6 10V0',
  B: 'M0 10V0H3.4C4.9 0 5.6 1 5.6 2.4S4.9 4.8 3.4 4.8H0M3.4 4.8C5.1 4.8 6 5.8 6 7.4'
    + 'S5.1 10 3.4 10H0',
  E: 'M5.6 0H0V10H5.8M0 4.8H4.4',
  'É': 'M5.6 0H0V10H5.8M0 4.8H4.4M2.4 -1.6L3.8 -3.2',
  L: 'M0 0V10H5.6',
  M: 'M0 10V0L3 6.4L6 0V10',
  m: 'M0 10V4.6M0 5.6C0 4.6 0.8 4 1.6 4S3 4.6 3 5.6V10M3 5.6C3 4.6 3.7 4 4.5 4S6 4.6 6 5.6V10',
  ' ': '',
};
const glyphs = (str, x, y, h, c, w) => [...str].map((ch, i) => `<path transform="translate(`
  + `${n(x + i * h * 0.8)} ${n(y)}) scale(${n(h / 10)})" d="${GLYPH[ch]}" `
  + `${line(c, w / (h / 10))}/>`).join('');
// A pin: a disc in the walk's colour with its stop number, on a paper ring.
const pin = ([x, y], num, w) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.4" ${fill(palette.paper)}/>`
  + `<circle cx="${n(x)}" cy="${n(y)}" r="2" ${fill(w.band)}/>`
  + glyphs(String(num), x - 0.95, y - 1.3, 2.6, w.onBand, 0.42);
const route = (pts, w) => {
  const d = `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}`;
  return `<path d="${d}" ${line(palette.paper, 1.9)}/><path d="${d}" ${line(w.band, 1.05)}/>`;
};

// Central Lisbon, north up, at 1:20 000 (1 km = 50 mm): the Baixa's grid on the line of
// Rua Augusta, Alfama's lanes round the castle hill, the river. Drawn on a 60 mm sheet
// and cropped to 56 mm, 3 mm off the top. The routes measure 0.77 km and 1.38 km.
const MAP = { width: MEASURE, height: 56 };
const SHORE = [[0, 57], [12, 56.5], [22, 55], [32, 51.5], [44, 46.5], [54, 41.5], [64, 35.5],
  [74, 29], [84, 23], [MAP.width, 20]];
const shoreY = (x) => {
  const i = Math.max(1, SHORE.findIndex(([sx]) => sx >= x));
  const [[x0, y0], [x1, y1]] = [SHORE[i - 1], SHORE[i]];
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
};
// The Baixa frame: u runs up Rua Augusta from its arch, v runs east across it.
const ARCH = [21.7, 43.8];
const baixa = (u, v) => [ARCH[0] - 0.292 * u + 0.955 * v, ARCH[1] - 0.955 * u - 0.292 * v];
const inBaixa = ([x, y]) => {
  const [dx, dy] = [x - ARCH[0], y - ARCH[1]];
  const [u, v] = [-0.292 * dx - 0.955 * dy, 0.955 * dx - 0.292 * dy];
  return u > -10.5 && u < 44 && Math.abs(v) < 10.2;
};
const STOPS = {
  baixa: [baixa(-4.8, 0), baixa(0.9, 0), baixa(32.2, -2.75)],
  alfama: [[35.2, 36.6], [49.4, 27.8], [51.6, 23], [65.6, 6.4], [78.6, 11.8]],
  belem: [[76.5, 44.2], [78.6, 53], [59.8, 54.9]],
};
function mapArt() {
  const [w, h] = [MAP.width, 60];
  const [block, water, green] = ['#e5dccb', '#d4e1ee', '#d3dcc3'];
  const paint = fill(block);
  let g = `<rect width="${w}" height="${h}" ${fill(palette.paper)}/>`
    + shape([...SHORE, [w, h], [0, h]], fill(water));
  for (let i = 0; i < 44; i++) { // ripples on the river
    const x = rand() * w;
    const y = shoreY(x) + 1.6 + rand() * (h - shoreY(x));
    g += `<path d="M${n(x)} ${n(y)} q0.9 -0.45 1.8 0" ${line('#b3c7da', 0.22)}/>`;
  }
  // The Baixa: blocks between parallel streets, Rua Augusta (v = 0) up the middle.
  for (const v0 of [-9.15, -5.95, -2.75, 0.45, 3.65, 6.85]) {
    for (let u0 = 2.2; u0 < 44; u0 += 2.7) {
      if (u0 > 25.5 && u0 < 37.5 && v0 > -6 && v0 < 0) continue; // Rossio
      g += shape([baixa(u0, v0), baixa(u0, v0 + 2.3), baixa(u0 + 2, v0 + 2.3),
        baixa(u0 + 2, v0)], paint);
    }
  }
  // Praça do Comércio: arcades on three sides, the river on the fourth.
  for (const [u0, u1, v0, v1] of [[-8.8, 0.3, -8.4, -6.3], [-8.8, 0.3, 6.3, 8.4],
    [-0.4, 1.5, -8.4, -0.55], [-0.4, 1.5, 0.55, 8.4]]) {
    g += shape([baixa(u0, v0), baixa(u0, v1), baixa(u1, v1), baixa(u1, v0)], paint);
  }
  // Everywhere else, the older town: small, uneven blocks.
  const castle = [[30, 12], [34, 9.5], [40, 11], [41, 16], [36, 18.5], [30.5, 17]];
  for (let y = 1; y < h; y += 2.9) {
    for (let x = 0.5; x < w; x += 3) {
      const [bw, bh] = [1.3 + rand() * 1.3, 1.2 + rand() * 1.2];
      const [cx, cy] = [x + rand() * 0.6, y + rand() * 0.6];
      if (cy + bh + 0.8 > shoreY(cx + bw / 2) || inBaixa([cx + bw / 2, cy + bh / 2])) continue;
      if (Math.hypot(cx - 35.5, cy - 14) < 7) continue; // the castle's hill
      const j = () => (rand() - 0.5) * 0.5;
      g += shape([[cx + j(), cy + j()], [cx + bw + j(), cy + j()], [cx + bw + j(), cy + bh + j()],
        [cx + j(), cy + bh + j()]], paint);
    }
  }
  // São Jorge castle: its walls and towers among the pines.
  for (let i = 0; i < 26; i++) {
    const [a, d] = [rand() * Math.PI * 2, 5 + rand() * 1.8];
    g += `<circle cx="${n(35.5 + Math.cos(a) * d)}" cy="${n(14 + Math.sin(a) * d * 0.8)}" `
      + `r="${n(0.5 + rand() * 0.4)}" ${fill(green)}/>`;
  }
  g += shape(castle, `${fill('#ddd3bf')} stroke="#a89c83" stroke-width="0.35"`)
    + castle.map(([x, y]) => `<rect x="${n(x - 0.6)}" y="${n(y - 0.6)}" width="1.2" height="1.2" `
      + `${fill('#a89c83')}/>`).join('');
  // The two walks in town.
  const [a, b, c] = [WALKS.alfama, WALKS.baixa, WALKS.belem];
  const [se, luzia, sol, vicente, pantheon] = STOPS.alfama;
  g += route([STOPS.baixa[0], baixa(0, 0), baixa(27, 0), baixa(29, -2.75), STOPS.baixa[2]], b)
    + route([se, [38.4, 37.8], [41.4, 36.6], [42.4, 33.4], [45.2, 32.8], [46.6, 30.2],
      [48.8, 30.4], luzia, sol, [55.2, 21.8], [55.8, 18.4], [59.6, 17.4], [61.6, 15.4],
      [60.6, 12.6], [62.8, 11.6], [63.4, 8.6], vicente, [69.8, 4.8], [74.2, 5.4], [77.2, 7.4],
      [77.4, 9.2], pantheon], a)
    + STOPS.baixa.map((p, i) => pin(p, i + 1, b)).join('')
    + STOPS.alfama.map((p, i) => pin(p, i + 1, a)).join('');
  // Belém, 6 km west, in an inset on the river at 1:45 000: the monastery, its gardens, the
  // monument on the waterfront and the tower in the water.
  const inset = 'x="57" y="40.5" width="31" height="18"';
  g += `<rect ${inset} ${fill(palette.paper)}/>`
    + `<rect x="57" y="53.2" width="31" height="5.3" ${fill(water)}/>`
    + `<rect x="71.5" y="42.4" width="12.5" height="3.2" ${fill(block)}/>`
    + `<rect x="74" y="47" width="8.5" height="3.6" ${fill(green)}/>`
    + `<path d="M57 51.6 H88" fill="none" stroke="#ffffff" stroke-width="0.8"/>` // square ends
    + `<path d="M59 55.6 L59.8 53.2" ${line(block, 0.6)}/><rect x="58.3" y="55" width="1.6" `
    + `height="1.6" ${fill(block)}/>`
    + glyphs('BELÉM', 59, 42.9, 2.2, palette.ink, 0.3)
    + route([STOPS.belem[0], [77.6, 48.8], STOPS.belem[1], [70, 52.5], [63, 52.7],
      STOPS.belem[2]], c)
    + STOPS.belem.map((p, i) => pin(p, i + 1, c)).join('')
    // The frame goes on last, over the road and the river that run to its edges.
    + `<rect ${inset} fill="none" stroke="${palette.muted}" stroke-width="0.35"/>`;
  // North, and a scale bar of 200 m.
  g += `<path d="M5 4 L6.4 9 L5 8.2 L3.6 9 Z" ${fill(palette.ink)}/>`
    + glyphs('N', 3.95, 10.2, 2.2, palette.ink, 0.3)
    + `<path d="M3 56.8 V57.8 H13 V56.8" ${line(palette.ink, 0.3)}/>`
    + glyphs('200 m', 14.4, 56, 2, palette.ink, 0.28);
  return sheet(w, MAP.height, `<g transform="translate(0 -3)">${g}</g>`);
}
const drawings = () => ({
  'tiles-cover': coverTiles(), 'tiles-band': bandTiles(), 'tiles-page': pageTiles(),
  tile: tileIcon(), routes: mapArt(),
});
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// Every drawing is an SVG resource, sized in mm at 10 px per mm (as sheet() draws them).
const svg = (id, w, h, more) => ({ id, typeId: 'map', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, ...more });
// #region map: the map in the text, keyed by swatches of the walks' colours in its note
const map = svg('routes', MAP.width, MAP.height, { placement: { position: 'here' }, ...t({ en: {
  caption: 'The three walks. The numbered pins are the stops in the text.',
  note: ':swatch{color="alfama"} Walk 1, Alfama · :swatch{color="baixa"} Walk 2, Baixa · '
    + ':swatch{color="belem"} Walk 3, Belém, 6 km west (inset)',
  altText: 'Map of central Lisbon north of the river: the yellow route runs from the '
    + 'waterfront up the Baixa grid to Rossio; the terracotta route climbs east from the '
    + 'cathedral through Alfama. An inset shows the teal Belém route.',
}, es: {
  caption: 'Los tres paseos. Los pines numerados son las paradas del texto.',
  note: ':swatch{color="alfama"} Paseo 1, Alfama · :swatch{color="baixa"} Paseo 2, Baixa · '
    + ':swatch{color="belem"} Paseo 3, Belém, 6 km al oeste (en el detalle)',
  altText: 'Plano del centro de Lisboa al norte del río: la ruta amarilla sube desde el '
    + 'muelle por la cuadrícula de la Baixa hasta el Rossio; la terracota sube hacia el este '
    + 'desde la catedral por Alfama. En un detalle, la ruta verde azulada de Belém.',
} }) });
// #endregion
// The other drawings are used by the designs, never placed in the text.
const resources = [map, svg('tiles-cover', TRIM.width, 112), svg('tiles-band', 3 * TILE, BAND),
  svg('tiles-page', TRIM.width, TRIM.height), svg('tile', TILE, TILE)];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = {
  'Albert Sans': ['400', '400i'], // text, the route under a walk's name
  'DM Serif Display': ['400'], // walk names, stops, the cover
  'Asap Condensed': ['600', '700'], // labels, chips, tabs, folios, captions
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
for (const [id, art] of Object.entries(drawings())) await loadSvg(`${id}.svg`, art);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Lisbon on Foot', es: 'Lisboa a pie' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
