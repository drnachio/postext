// ═══ Postext Cookbook · Nº 033 · Recipe card: ingredients beside the method ═══════
// https://postext.dev/en/cookbook/recipe-card
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Young Serif, Figtree, Caveat (SIL OFL 1.1) · Needs postext ≥ 1.8.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'recipe-card';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#2b2118', muted: '#76634e', // text; folios and the colophon
  paper: '#f7eddb', card: '#fffdf8', // the cream page; the white recipe card on it
  tomato: '#bf3d29', olive: '#6b7a3a', tint: '#f6e3c1' }; // numbers and tab; dashes; tags
// The hex rides along: design elements read it, not the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the tomato, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.tomato })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, HAND] = ['Figtree', 'Young Serif', 'Caveat'];
const PAGE = { w: 190, h: 250, top: 22, inner: 18, outer: 16 }; // mm, mirrored margins
const [BODY, LEAD] = [9.4, 12.8]; // pt: the text of the cards and the notes under them

// #region answer: a white card with a servings tab, two columns inside it
// In the Markdown, :::callout{type="card" label="SERVES 4"} holds a :::columns{count=2} group
// of two nested boxes, :::callout{type="column" title="Ingredients"} and one for the method.
// The group levels its columns by cutting between blocks or lines, so loose lists would run
// the method on under the ingredients. A nested box is one block that never splits, so the
// only cut left is between the two (gotcha: callout-columns).
const TAB = 5.6; // mm: the tab's height, and how far it rises above the card
const card = { id: 'card', background: col('card'),
  padding: { top: mm(4.5), right: mm(6), bottom: mm(5), left: mm(6) },
  // No space of its own above: the tab starts on the first grid line under the opener.
  columnGap: mm(7), marginTop: mm(0),
  // label="…" on the fence prints here: a tab on the top-right corner, a cutlery pictogram
  // beside it and a rule from the far corner that makes the tab part of the card.
  label: { fontFamily: TEXT, fontSize: pt(8), color: col('card'), // bold by default
    background: col('tomato'), height: mm(TAB), offset: mm(TAB), paddingX: mm(2.6),
    icon: { resourceId: 'cutlery', width: mm(TAB * 6 / 8), gap: mm(1.6) }, // as tall as the tab
    rule: { enabled: true, color: col('tomato'), width: pt(1.2) } } };
// The two columns: frameless boxes whose only device is a tracked title.
const NONE = { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) };
const column = { id: 'column', backgroundEnabled: false, padding: NONE,
  lists: { gap: mm(2.2), itemSpacing: pt(3.5) }, // for the steps as well as the dashes
  titleStyle: { fontFamily: TEXT, fontSize: pt(8), color: col('tomato'), // bold by default
    textTransform: 'uppercase', letterSpacing: pt(1.5), gap: mm(2.4) } };
// config() plugs them in: calloutStyles: [card, column, prep].
// #endregion

// #region prep: a checklist under a header with a strip of three pictograms
// :::callout{type="prep" title="Before you start"}, closed at once, is a header: a box that
// holds only its title and icon. The icon is one picture of three drawings; a width KIT times
// its size makes its box a strip, and the picture is fitted into width × size, left of the
// title. Tasks set inside the box would start after that column, 21 mm in, so the '- [ ]'
// items follow the box, where they print the default task box, '☐'.
const [STRIP, KIT] = [5, 30 / 8]; // mm: the strip's height; the drawing's width over height
const prep = { id: 'prep', backgroundEnabled: false, padding: NONE,
  marginTop: pt(LEAD), marginBottom: column.titleStyle.gap, // the tasks follow at this gap
  icon: { kind: 'resource', resourceId: 'kit', size: mm(STRIP), width: mm(STRIP * KIT),
    align: 'center' }, // the title centred on the strip
  titleStyle: { ...column.titleStyle, color: col('olive') } };
// #endregion

// #region steps: big step numbers in the display face, an olive full stop after each
// Young Serif has old-style figures: 1 and 2 stand 0.56 em, a little above its 0.50 em
// x-height, so 5.1 mm at STEP. A list number is centred 0.3 em (of the text) above the item's
// first baseline, with the canvas 'middle' baseline, which Chrome puts 0.24 em above Young
// Serif's own (gotcha: list-number-centred). DROP centres the figures on the step's first two
// lines, from the cap height of the first to the baseline of the second.
const [STEP, FIGURE, MIDDLE, CAP] = [26, 0.56, 0.24, 0.7]; // pt; em of each face
const DROP = (LEAD - CAP * BODY) / 2 + 0.3 * BODY + (FIGURE / 2 - MIDDLE) * STEP; // pt
const orderedLists = { fontFamily: DISPLAY, fontWeight: 400, // Young Serif ships 400 only
  numberFontSize: pt(STEP), color: col('tomato'),
  separatorColor: col('olive'), separatorGap: pt(0.6), // the default '.' as its own run
  numberVerticalOffset: pt(DROP) };
// #endregion

// #region chips: tags for diet and occasion, as pills in the text
const chipStyles = [{ id: 'tag', fontSize: em(0.86), bold: true, background: col('tint'),
  borderWidth: pt(0), borderRadius: em(1), // no outline; a radius past half the height: a pill
  paddingX: em(0.7), paddingY: em(0.18), gap: em(0.3) }];
// #endregion

// #region opener: the drawing bled across the head, the title and pills set on it
const BAND = 104; // mm: the drawing's foot; the pills sit 13 mm above it, the lead 6 mm below
const NOTE = { x: 18, y: 24, w: 70 }; // mm on the page: the box ends 2 mm before the arrow
const at = (x, y, size) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y - PAGE.top) }, size }); // y in mm from the top of the page
const text = (id, content, family, size, placement, extra) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('ink'), align: 'left',
  overflow: 'wrap', placement, ...extra }); // gotcha: overflow-ellipsis-default
const tracked = { fontWeight: 700, textTransform: 'uppercase', letterSpacing: pt(1.6) };
// Pills are text boxes chained right-of each other; each prints one heading attribute.
const pill = (id, after) => text(id, `{attr.${id}}`, TEXT, 8.4, after ? { anchor:
  { to: `#${after}`, edge: 'right-of' }, offset: { x: mm(1.8) } } : at(0, BAND - 13), {
  fontWeight: 600, box: { backgroundColor: col('card'), borderRadius: mm(3),
    padding: { top: mm(1.1), right: mm(2.8), bottom: mm(1.1), left: mm(2.8) } } });
// One heading style for every recipe; each heading names its drawing: art="tortilla".
const opener = { id: 'receta', advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: '{attr.art}', // filled in per heading, like a text
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: mm(PAGE.w), height: mm(BAND) } } },
    text('note', '{attr.note}', HAND, 19, { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(NOTE.x), y: mm(NOTE.y) }, size: { width: mm(NOTE.w) } },
    { fontWeight: 600, align: 'right' }), // on the page, like the arrow drawn in the picture
    pill('time'), pill('level', 'time'), pill('season', 'level'),
    text('title', '{titleText}', DISPLAY, 42, { anchor: { to: '#time', edge: 'above' },
      offset: { y: mm(-3.2) }, size: { width: mm(96) } }, // two lines: the \\ in the heading
    { lineHeight: 1 }), // a multiple, never pt() (gotcha: design-lineheight-multiple)
    text('kicker', '{attr.kicker}', TEXT, 8.2, { anchor: { to: '#title', edge: 'above' },
      offset: { y: mm(-2.4) }, size: { width: mm(96) } }, tracked),
    // The drawing reserves no height (gotcha: opener-image-no-reserve); the lead under it does,
    // so the card starts below the lead without a minHeight.
    text('lead', '{attr.lead}', TEXT, 10.5, at(0, BAND + 6, { width: mm(122) }),
      { italic: true, lineHeight: 1.45 }),
  ] } } };
// #endregion

// Folios at the foot of the outer corner: the book on versos, the recipe on rectos.
const foot = (id, content, parity, edge, x, look) => text(id, content, TEXT, 7.6,
  { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-12) } },
  { color: col('muted'), parity, align: edge.endsWith('left') ? 'left' : 'right', ...look });
const folio = { fontFamily: DISPLAY, fontSize: pt(10), color: col('tomato') };
const footer = { elements: [
  foot('verso-folio', '{pageNumber}', 'even', 'bottom-left', PAGE.outer, folio),
  foot('verso-book', '{title}', 'even', 'bottom-left', PAGE.outer + 9, tracked),
  foot('recto-dish', '{chapterTitle}', 'odd', 'bottom-right', -(PAGE.outer + 9), tracked),
  foot('recto-folio', '{pageNumber}', 'odd', 'bottom-right', -PAGE.outer, folio),
] };

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  colorPalette, chipStyles, orderedLists, footer, header: { elements: [] },
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(PAGE.top), bottom: mm(20), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } }, // left is the inner margin
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: mm(0) }, // ragged and flush: the notes under the cards
  // A designed heading's own text is hidden but still measured: in Young Serif 400, the only
  // weight it ships, not in the default Open Sans 700 that FONTS does not load.
  headings: { fontFamily: DISPLAY, fontWeight: 400, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    // 'any': each recipe opens the next page, whichever side it is on. span: 'page' paints the
    // opener outside the column's clip: kept in the column, the drawing is cut at the top margin.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } },
  ] },
  headingStyles: [opener],
  // Olive dashes for the whole document: an olive lists.color on the column style would turn
  // the step numbers olive too (gotcha: box-list-colour-numbers).
  unorderedLists: { bulletChar: '–', color: col('olive'),
    marginTop: mm(0), // under the checklist's header, the header's marginBottom alone
    marginBottom: pt(LEAD / 2) }, // half a line above the tags
  calloutStyles: [card, column, prep],
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.4), lineHeight: pt(10),
    color: col('muted'), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: two table-top drawings and the pictograms, in the palette's colours
// No words in them: an SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts);
// the handwritten note is a design element set in Caveat where the drawn arrow starts.
const TABLE = { saffron: '#e9a23b', sage: '#b9c08a', blue: '#2f5d8a', china: '#fffaf0',
  gold: '#e9b659', crust: '#d4923a', brown: '#b8702a', soup: '#d6552f', oil: '#e8c547' };
const n = (v) => +v.toFixed(2);
function mulberry32(seed) { // a seeded PRNG: the same drawing in every capture
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const blob = (x, y, rx, ry, turn, fill, opacity) => `<ellipse cx="${n(x)}" cy="${n(y)}" `
  + `rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(turn)} ${n(x)} ${n(y)})" fill="${fill}" `
  + `fill-opacity="${n(opacity)}"/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stroke = (d, color, width, extra = '') => path(d, 'none', ` stroke="${color}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}`);
const group = (x, y, turn, body) => `<g transform="translate(${n(x)} ${n(y)}) `
  + `rotate(${n(turn)})">${body}</g>`;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180),
  cy + r * Math.sin(deg * Math.PI / 180)];

// A napkin in checks: two sets of translucent stripes, darker where they cross.
function gingham(size, check, color, opacity) {
  let out = `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `
    + `fill="${TABLE.china}"/>`;
  for (let i = 0; i < size / check; i++) {
    const at = -size / 2 + i * check;
    out += `<rect x="${n(at)}" y="${-size / 2}" width="${check / 2}" height="${size}" `
      + `fill="${color}" fill-opacity="${opacity}"/>`
      + `<rect x="${-size / 2}" y="${n(at)}" width="${size}" height="${check / 2}" `
      + `fill="${color}" fill-opacity="${opacity}"/>`;
  }
  return out;
}
// A shadow, white china with a blue rim, a ring of cream dots and a fine inner line.
function plate(r, rim) {
  let out = circle(1.6, 2.4, r, palette.ink, ' fill-opacity=".16"')
    + circle(0, 0, r, TABLE.china)
    + circle(0, 0, r - rim / 2, 'none', ` stroke="${TABLE.blue}" stroke-width="${rim}"`);
  for (let a = 0; a < 360; a += 10) {
    out += circle(...polar(0, 0, r - rim / 2, a), 0.55, TABLE.china);
  }
  return out + circle(0, 0, r - rim - 1.4, 'none', ` stroke="${TABLE.blue}" stroke-width=".45"`);
}
// A sector path: the omelette with a slice taken out, or the slice itself.
const sector = (r, a0, a1) => {
  const [x0, y0] = polar(0, 0, r, a0);
  const [x1, y1] = polar(0, 0, r, a1);
  return `M0 0L${n(x0)} ${n(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}Z`;
};
function omelette(r, a0, a1, rand) { // a browned rim, a golden top mottled where it caught
  let out = path(sector(r, a0, a1), TABLE.crust) + path(sector(r - 1.8, a0, a1), TABLE.gold);
  // Spots in proportion to the sector, each kept clear of the rim and of both cut edges.
  const clear = (d, da) => da > 0 && d * Math.sin(Math.min(da, 90) * Math.PI / 180); // mm
  const inside = (d, a, rx) => d + rx < r - 2.4
    && [a - a0, a1 - a].every((da) => clear(d, da) > rx + 0.4);
  const spot = (count, size, fill, opacity) => {
    for (let i = 0; i < Math.ceil(count * (a1 - a0) / 360); i++) {
      const rx = size * (0.5 + rand());
      const [d, a] = [Math.sqrt(rand()) * r, a0 + rand() * (a1 - a0)];
      const [ry, turn, alpha] = [rx * (0.4 + rand() * 0.4), rand() * 180, 0.6 + rand() * 0.6];
      if (inside(d, a, rx)) out += blob(...polar(0, 0, d, a), rx, ry, turn, fill, opacity * alpha);
    }
  };
  spot(24, 3.4, TABLE.crust, 0.4); // browned patches
  spot(12, 2.4, '#f5d98a', 0.35); // pale patches
  spot(48, 0.45, TABLE.brown, 0.5); // specks
  for (const a of [a0, a1]) { // the cut edges catch the light: a pale line along each
    const [x, y] = polar(0, 0, r - 1, a);
    out += stroke(`M0 0L${n(x)} ${n(y)}`, '#f5dc93', 0.9);
  }
  return out;
}
function arrow(d, tip, turn) { // a hand-drawn line and its head, as paths, never a <marker>
  return stroke(d, palette.ink, 0.55) + group(...tip, turn,
    stroke('M-2.4-1.3L0 0-2.4 1.5', palette.ink, 0.55));
}
function sprig(x, y, turn, rand) { // an olive twig: paired grey-green leaves and two olives
  let out = stroke('M0 0C10-2 22-3 34-9', palette.olive, 0.7);
  for (let i = 0; i < 7; i++) {
    const t = 3 + i * 4.4;
    for (const side of [-1, 1]) {
      const leaf = 'M0 0C2-1.3 7-1.5 10 0C7 1.5 2 1.3 0 0Z';
      out += group(t, -t * 0.18, side * (32 + rand() * 12) - 8, path(leaf,
        side > 0 ? palette.olive : '#8d9a5c'));
    }
  }
  out += circle(12, 4.6, 2.3, '#4a3a38') + circle(20, 3.4, 2.1, '#7d8a3a')
    + circle(11.3, 3.8, 0.6, TABLE.china, ' fill-opacity=".5"');
  return group(x, y, turn, out);
}
const [PLATE_X, PLATE_Y] = [138, 45]; // mm: the plate or bowl, right of the title
function tortillaArt() {
  const rand = mulberry32(23);
  let body = `<rect width="${PAGE.w}" height="${BAND}" fill="${TABLE.saffron}"/>`;
  body += group(152, 32, -11, gingham(108, 11, palette.tomato, 0.2));
  const [CUT0, CUT1, PULL] = [-6, 30, 9]; // the slice in degrees; mm it is pulled out
  const shadow = (a0, a1) => group(0.9, 1.5, 0, path(sector(31, a0, a1), palette.ink,
    ' fill-opacity=".14"'));
  const slice = polar(0, 0, PULL, (CUT0 + CUT1) / 2);
  body += group(PLATE_X, PLATE_Y, 0, plate(43, 6.4) + shadow(CUT1, CUT0 + 360)
    + omelette(31, CUT1, CUT0 + 360, rand) + group(...slice, 0, shadow(CUT0, CUT1)
      + omelette(31, CUT0, CUT1, rand)));
  body += sprig(150, 95, -24, rand);
  body += arrow('M90 30C96 27 100 29 103 34', [103, 34], 62); // from the note towards the omelette
  return svgDoc(PAGE.w, BAND, body);
}
function tomato(x, y, r, turn) { // seen from above: a red disc, a green star, a highlight
  const star = [0, 72, 144, 216, 288].map((a) => group(0, 0, a,
    path('M0 0C1-1 3.2-1 4.2 0C3.2 1 1 1 0 0Z', palette.olive))).join('');
  return group(x, y, turn, circle(0, 0, r, palette.tomato) + circle(-r * 0.35, -r * 0.35,
    r * 0.3, TABLE.china, ' fill-opacity=".25"') + star + circle(0, 0, 0.9, '#4f5c27'));
}
function gazpachoArt() {
  const rand = mulberry32(7);
  let body = `<rect width="${PAGE.w}" height="${BAND}" fill="${TABLE.sage}"/>`;
  body += group(156, 32, 9, gingham(108, 11, TABLE.blue, 0.22));
  // A bowl from above: rim, pale inner wall, soup, drops of oil and a heap of diced vegetables.
  let bowl = plate(42, 5.8) + circle(0, 0, 32.5, '#efe5d2') + circle(0, 0, 29.5, TABLE.soup)
    + circle(0, 0, 29.5, 'none', ' stroke="#b8401f" stroke-width="1.2"')
    + path('M-24-12A26 26 0 0 1 4-26A28 28 0 0 0-24-12Z', '#e2703f'); // light on the surface
  for (const [x, y, rr] of [[-14, 4, 2.4], [-10, 12, 1.4], [-17, -6, 1.6], [-6, 17, 1.8],
    [-19, 3, 0.9], [2, 20, 1.1], [-12, -12, 1]]) {
    bowl += blob(x, y, rr, rr * 0.8, 20, TABLE.oil, 0.9);
  }
  const dice = ['#8fae4a', '#4f7a2a', '#f1d49a', '#b8321e', '#e3bf72'];
  for (let i = 0; i < 24; i++) {
    const [x, y] = polar(7, -5, Math.sqrt(rand()) * 11, rand() * 360);
    const size = 2 + rand() * 1.3;
    bowl += group(x, y, rand() * 90, `<rect x="${n(-size / 2)}" y="${n(-size / 2)}" `
      + `width="${n(size)}" height="${n(size)}" rx=".5" fill="${dice[i % 5]}"/>`);
  }
  // A spoon resting in the soup, its handle over the rim towards the napkin.
  bowl += group(14, -12, -38, stroke('M6 0L40 0', palette.ink, 3.2,
    ' stroke-opacity=".14" transform="translate(1 1.5)"') + stroke('M6 0L40 0', '#cfcabf', 3)
    + blob(0, 0, 7, 4.6, 0, '#dedad0', 1) + blob(-0.8, -0.8, 4.6, 2.6, 0, TABLE.china, 0.55));
  body += group(PLATE_X, PLATE_Y, 0, bowl);
  // Two tomatoes at the foot, shadows included, clear of the band's lower edge.
  const shade = (x, y, r) => circle(x + 1, y + 1.6, r, palette.ink, ' fill-opacity=".15"');
  body += shade(180, 91, 9) + tomato(180, 91, 9, 12)
    + shade(164, 95, 6.5) + tomato(164, 95, 6.5, -30);
  body += arrow('M90 30C96 27 100 29 104 33', [104, 33], 55); // from the note to the bowl
  return svgDoc(PAGE.w, BAND, body);
}
const cutlery = svgDoc(6, 8, stroke('M1.6 .6V7.4M.6 .6V2.6C.6 3.4 2.6 3.4 2.6 2.6V.6',
  palette.tomato, 0.55) + stroke('M4.6 7.4V.6C5.8 1.4 5.8 3.6 4.6 4.4', palette.tomato, 0.55));
// The kit in line drawings: a bowl with two eggs, the frying pan and the plate that turns the
// tortilla over, in a box KIT times as wide as it is tall.
const egg = (x, turn) => `<ellipse cx="${x}" cy="2.5" rx="1.05" ry="1.35" `
  + `transform="rotate(${turn} ${x} 2.5)" fill="none" stroke="${palette.olive}" `
  + 'stroke-width=".6"/>';
const kit = svgDoc(8 * KIT, 8, egg(3, -12) + egg(5, 14)
  + stroke('M.6 3.9H7.4M1 3.9C1 6.4 2.4 7.4 4 7.4S7 6.4 7 3.9', palette.olive, 0.7)
  + stroke('M9.8 4.4H16.8M10.2 4.4L10.8 6.7C10.9 7.1 11.2 7.3 11.6 7.3H15C15.4 7.3 15.7 7.1 '
    + '15.8 6.7L16.4 4.4', palette.olive, 0.7) + stroke('M16.8 5L20.2 4.1', palette.olive, 1.1)
  + circle(26.2, 4.2, 3.3, 'none', ` stroke="${palette.olive}" stroke-width=".7"`)
  + circle(26.2, 4.2, 2, 'none', ` stroke="${palette.olive}" stroke-width=".5"`));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses. Layout measures with the browser's fonts, so the
// kit loads them from Fontsource before the first build (gotcha: fonts-first).
const FONTS = { Figtree: ['400', '400i', '600', '700'], 'Young Serif': ['400'], Caveat: ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region pictures: the drawings and the pictograms are resources, cited by id, never by :ref
// The opener's image element and both icons name a resource id; the resource names the file
// the canvas paints (loadSvg registers it). No :ref cites them, so none is numbered.
const ART = { // markup, width and height in mm, and the alt text
  tortilla: [tortillaArt(), PAGE.w, BAND, t({ en: 'A potato omelette with a slice pulled out, '
    + 'on a blue-rimmed plate and a red-checked napkin', es: 'Una tortilla de patatas con una '
    + 'porción separada, en un plato de borde azul sobre una servilleta de cuadros rojos' })],
  gazpacho: [gazpachoArt(), PAGE.w, BAND, t({ en: 'A bowl of gazpacho with diced vegetables and '
    + 'a spoon, on a blue-checked napkin beside two tomatoes', es: 'Un cuenco de gazpacho con '
    + 'dados de verdura y una cuchara, sobre una servilleta de cuadros azules junto a dos '
    + 'tomates' })],
  cutlery: [cutlery, 6, 8, t({ en: 'Fork and knife', es: 'Tenedor y cuchillo' })],
  kit: [kit, 8 * KIT, 8, t({ en: 'A bowl with two eggs, a frying pan and a plate',
    es: 'Un bol con dos huevos, una sartén y un plato' })] };
const resources = Object.entries(ART).map(([id, [, w, h, altText]]) => ({ id, typeId: 'figure',
  kind: 'svg', createdAt: 0, updatedAt: 0, altText, svg: { fileId: `${id}.svg`, width: w * 10,
  height: h * 10 } })); // 10 px a millimetre: the sizes only set the aspect ratio here
await Promise.all(Object.entries(ART).map(([id, [svg]]) => loadSvg(`${id}.svg`, svg)));
// #endregion
await loadFonts(FONTS, markdown);
// The excerpt is pages 58 and 59 of the book: 57 pages come before it, so the tortilla opens
// on a verso and the two recipes face each other.
const doc = await buildWithFonts(() => buildDocument({ markdown, resources,
  continuation: { pageIndexOffset: 57, pageNumbering: { startAt: 58 } } }, config()), markdown);
showPages(doc, { title: t({ en: 'Recipe card', es: 'Tarjeta de receta' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
