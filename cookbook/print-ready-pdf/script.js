// ═══ Postext Cookbook · Nº 024 · Print-ready PDF: bleed, crop marks and CMYK ═══════════
// https://postext.dev/en/cookbook/print-ready-pdf
// Code: MIT · Text: original (CC BY 4.0) · Maps: generated in code (CC BY 4.0)
// Fonts: Karla, Space Grotesk, Space Mono (SIL OFL 1.1) · Needs postext ≥ 1.22.0
// An exhibition leaflet set up for the press: bleed and crop marks on every page, and a
// PDF/X-4 file separated for FOGRA51 that embeds its fonts and takes the maps and the floor
// plan from print masters, checked by the preflight before it is offered.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes, preflightDocument, loadOutputProfile, outputTransform,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document (this recipe is Spanish only)
const RECIPE = 'print-ready-pdf';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: screen colours, and for four of them the inks the press prints them in
const palette = {
  ink: '#161616', // text: a neutral grey prints on the black plate alone (K95 on FOGRA51)
  muted: '#666666', // the running heads, on black alone for the same reason (K66)
  forest: '#0b3d2e', // the sea, the kickers, the back band
  signal: '#ff6626', // route, waypoints, tab
  sage: '#9fb8a8', // high ground; small type on forest
  paper: '#f4f1ea', // type on forest: reversed out, it prints no ink at all
};
// The colours authored in CMYK (%), the same builds as the print masters (section 2), so the
// type, the tab and the drawings share their inks. Without them the profile would separate
// the forest as C90 M43 Y71 K62 and the orange as C0 M70 Y90 K0, a shade off the route.
const AUTHORED = { forest: [100, 45, 80, 55], signal: [0, 60, 85, 0], sage: [40, 20, 35, 0],
  paper: [0, 0, 0, 0] };
const cmyk = ([c, m, y, k]) => ({ c, m, y, k });
const value = (id) => (AUTHORED[id]
  ? { hex: palette[id], model: 'cmyk', cmyk: cmyk(AUTHORED[id]) }
  : { hex: palette[id], model: 'hex' });
// col(id): a palette-linked colour. It carries the hex too, because postext paints design
// elements from the hex (gotcha: palette-skips-designs).
const col = (id) => ({ ...value(id), paletteId: id });
const colorPalette = [
  ...Object.keys(palette).map((id) => ({ id, name: id, value: value(id) })),
  // The engine's defaults link to 'main-color': point it at the forest, so nothing prints blue.
  { id: 'main-color', name: 'forest (defaults)', value: { hex: palette.forest, model: 'hex' } },
];
// #endregion

// #region answer: bleed and crop marks on every page; a CMYK PDF that swaps in print masters
const BLEED = 3; // mm of artwork past the trim: the cover, the tab and the back band reach it
// Hook-up: config().page.cutLines. A mark starts markOffset outside the trim and runs 5 mm
// (markLength): an offset equal to the bleed keeps the marks off the artwork whatever BLEED
// is. Each page grows by doc.trimOffset a side, bleed + offset + mark: 11 mm here.
const cutLines = { enabled: true, bleed: mm(BLEED), markOffset: mm(BLEED) };

// Hook-up: config().print. PDF/X-4 for the press on FOGRA51 (PSO Coated v3, the leaflet's
// 150 g coated matte): every colour separated through the profile (the authored ones as
// written), 100 % K text overprinting, the output intent, TrimBox and BleedBox on each page.
// The 7.5 pt bold labels in forest hold in four inks on coated stock: the small-text check
// starts at 7 pt instead of 9.
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra51', preflight: { smallTextSize: pt(7) } };
// Where the profiles are fetched from: postext.dev serves postext's icc/ folder at /icc/ (any
// copy of it works, and so does the npm CDN's postext/icc/).
const PROFILES = 'https://postext.dev/icc/';

// `masters` holds print-master bytes by fileId (section 2 writes them). The proof is an
// ordinary greyscale PDF: no PDF/X, which would force CMYK.
function pressPdf(doc, kind, { resources, masters }) {
  const press = kind === 'press';
  // A resource names its master in svg.pdfFileId, but outside bundles renderToPdf only asks
  // for svg.fileId: answer that id with the master (gotcha: pdf-master-resourcebytes).
  const masterOf = new Map(resources.filter((r) => r.svg?.pdfFileId)
    .map((r) => [r.svg.fileId, r.svg.pdfFileId]));
  return renderToPdf(doc, {
    // The kit's provider snaps weights and falls back to upright, since the PDF asks for every
    // style of every family (gotcha: pdf-provider-all-styles); TrueType faces are subset.
    fontProvider: fontsourceProvider,
    // The press file takes config().print, its profile fetched from PROFILES
    // (outputProfile: the .icc bytes, to hand it over yourself).
    profileBaseUrl: PROFILES,
    ...(press ? {} : { print: { standard: 'none' }, colorSpace: 'grayscale' }),
    // The proof keeps the SVGs, which its grey conversion can reach; masters stay in CMYK.
    resourceBytes: (fileId) => (press && masters.get(masterOf.get(fileId))) || imageBytes(fileId),
  }); // bookmarks (from the headings) and /PageLabels (from the folios) come by default
}
// #endregion

const TRIM = [170, 227]; // mm: the leaflet as it leaves the guillotine
const [TOP, FOOT, INNER, OUTER] = [20, 22, 18, 34]; // margins, mm, mirrored; the tab is outside
const LEAD = 13.6; // body leading, pt
const label = { fontFamily: 'Space Mono', fontWeight: 700, fontSize: pt(7.5),
  letterSpacing: pt(1.3), textTransform: 'uppercase', align: 'left' }; // default: centred

// #region tab: a thumb tab off the fore-edge that carries the folio, on body pages only
const TAB = { w: 10, h: 24 }; // the tab as it will be trimmed, mm; its foot is level with the text
const tab = (parity) => {
  const edge = parity === 'even' ? 'bottom-left' : 'bottom-right'; // the fore-edge
  const from = (to, y) => ({ anchor: { to, edge }, offset: { y: mm(y) } });
  return [
    // The box hangs from the bleed frame and BLEED of its width is trimmed off, so a cut that
    // lands a millimetre outside the trim still leaves orange at the edge.
    { kind: 'box', id: `tab-${parity}`, style: { backgroundColor: col('signal') },
      placement: { ...from('bleed', -(FOOT + BLEED)), size: { width: mm(TAB.w + BLEED),
        height: mm(TAB.h) } } },
    // The folio hangs from the trim frame ('page'), so it centres on the part left after the cut.
    { kind: 'text', id: `folio-${parity}`, content: '{pageNumber}', ...label, align: 'center',
      fontSize: pt(11), letterSpacing: pt(0), color: col('ink'),
      placement: { ...from('page', -FOOT), size: { width: mm(TAB.w), height: mm(TAB.h) } } },
  ].map((element) => ({ ...element, parity, pages: 'body' })); // never on the covers
};
const head = (parity, content) => ({ kind: 'text', id: `head-${parity}`, content, ...label,
  color: col('muted'), parity, pages: 'body',
  placement: { anchor: { to: 'container', edge: parity === 'even' ? 'top-left' : 'top-right' },
    offset: { y: mm(11) } } });
const header = { elements: [head('even', '{title}'), head('odd', '{subtitle}')] };
const footer = { elements: [...tab('even'), ...tab('odd')] };
// #endregion

const room = (kicker) => ({ enabled: true, slot: { elements: [ // a waypoint, kicker and title
  { kind: 'box', id: 'stop', style: { backgroundColor: col('paper'), borderColor: col('signal'),
    borderWidth: mm(0.9), borderRadius: mm(1.7) },
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(3.4),
    height: mm(3.4) } } },
  { kind: 'text', id: 'kicker', content: kicker, ...label, color: col('forest'),
    placement: { anchor: { to: '#stop', edge: 'right-of' }, offset: { x: mm(2.2) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Space Grotesk',
    fontWeight: 700, fontSize: pt(17), lineHeight: 1.08, color: col('ink'), align: 'left',
    overflow: 'wrap', // design text ends in '…' by default (gotcha: overflow-ellipsis-default)
    placement: { anchor: { to: '#stop', edge: 'below' }, offset: { y: mm(1.2) },
      size: { width: 'fill' } } },
] } });

// #region covers: the front art runs bleed to bleed; the back band bleeds on three sides
const BAND = 44; // mm from the trim foot to the top of the back band
const onForest = { color: col('paper'), align: 'left', overflow: 'wrap' };
const art = (resourceId, edge) => ({ kind: 'image', id: resourceId, resourceId,
  placement: { anchor: { to: 'bleed', edge }, size: { width: 'fill' } } }); // height: its ratio
// The map reserves no height (gotcha: opener-image-no-reserve), so the text puts a
// :::pagebreak right after the cover heading: without it the lead would start on the map.
// span: 'page' makes the cover an opener, so furniture set to pages: 'body' skips it.
const cover = { id: 'cover', numbered: false, span: 'page', advancedDesign: { enabled: true,
  slot: { elements: [ // paint order: the map first, the type on top
    art('cubierta', 'top-left'),
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, color: col('sage'),
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(6) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Space Grotesk',
      fontWeight: 700, fontSize: pt(50), lineHeight: 0.98, ...onForest,
      placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(4) },
        size: { width: mm(132) } } },
    { kind: 'text', id: 'subtitle', content: '{subtitle}', fontFamily: 'Karla', fontSize: pt(13),
      ...onForest, placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(5) } } },
  ] } },
  footer: { elements: [ // the cover's own foot: dates and place, over open sea
    { kind: 'text', id: 'dates', content: '{attr.fechas}', ...label, color: col('paper'),
      placement: { anchor: { to: 'container', edge: 'bottom-left' }, offset: { y: mm(-15) } } },
    { kind: 'text', id: 'place', content: '{attr.lugar}', ...label, color: col('sage'),
      placement: { anchor: { to: '#dates', edge: 'below' }, offset: { y: mm(1.6) } } },
  ] } };
const back = { id: 'back', numbered: false, breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: room('{attr.kicker}'),
  margins: { bottom: mm(BAND + 8) }, // the text stops 8 mm above the band
  footer: { elements: [
    art('banda', 'bottom-left'),
    { kind: 'text', id: 'venue', content: '{attr.lugar}', fontFamily: 'Space Grotesk',
      fontWeight: 700, fontSize: pt(20), ...onForest, // on the band, level with the text edge
      placement: { anchor: { to: '#banda', edge: 'align-top' }, offset: { x: mm(BLEED + OUTER),
        y: mm(6) } } },
    { kind: 'text', id: 'address', content: '{attr.direccion}', fontFamily: 'Karla',
      fontSize: pt(10), ...onForest,
      placement: { anchor: { to: '#venue', edge: 'below' }, offset: { y: mm(1.5) } } },
    { kind: 'text', id: 'when', content: '{attr.fechas}', ...label, color: col('sage'),
      placement: { anchor: { to: '#address', edge: 'below' }, offset: { y: mm(4) } } },
    { kind: 'text', id: 'colophon', content: '{attr.colofon}', ...label, fontWeight: 400,
      // 6.3 pt in sage would be three inks on a four-ink band: reversed to paper, it prints
      // no ink and no plate can shift it (the preflight's small-text check).
      fontSize: pt(6.3), letterSpacing: pt(0), textTransform: 'none', lineHeight: 1.4,
      color: col('paper'), overflow: 'wrap',
      placement: { anchor: { to: 'page', edge: 'bottom-left' }, offset: { x: mm(OUTER),
        y: mm(-6) }, size: { width: mm(78) } } }, // 57 monospaced characters a line
  ] } };
// #endregion

const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  locale: LANG, // hyphenation (for justified text only) and the PDF's /Lang
  // "Figura 1": Spanish names by hand (gotcha: resource-types-locale), one running count
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    resetOn: 'never' })),
  colorPalette,
  print: PRINT,
  headingStyles: [cover, back],
  page: { width: mm(TRIM[0]), height: mm(TRIM[1]), cutLines,
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Karla', fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('forest'),
    // Ragged, like the labels. Ragged text is never hyphenated (gotcha: ragged-no-hyphenation);
    // the 118 mm measure keeps the rag shallow.
    textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true },
  // #region levels: every room a numbered H1 with no page break, so each is a PDF bookmark
  headings: {
    // A designed heading keeps its own text, hidden, for the bookmarks and the tags. Set it in
    // a face the pages already load, or the PDF embeds Open Sans for that text alone.
    fontFamily: 'Space Grotesk',
    levels: [
      // Rooms follow on: any headings object drops the H1 break (gotcha: headings-drop-h1-break),
      // so it is stated off. The back cover breaks through its style, a :::pagebreak ends the
      // front one. The template numbers kicker and bookmark: "Sala 1 Una isla en ninguna parte".
      { level: 1, numberingTemplate: 'Sala {1}', breakBefore: { enabled: false },
        marginTop: pt(LEAD), advancedDesign: room('{number} · {attr.fecha}') },
    ],
  },
  // #endregion
  paragraphStyles: [
    // Only size and face change: styles inherit the rest. 'ficha' sets each room's object label.
    { id: 'lead', fontFamily: 'Space Grotesk', fontSize: pt(12), lineHeight: pt(16.5) },
    { id: 'ficha', fontFamily: 'Space Mono', fontSize: pt(7), lineHeight: pt(10.5) },
  ],
  // Captions in the label face, like the object labels; the label in forest (orange is 2.9:1).
  captionStyle: { fontFamily: 'Space Mono', fontSize: pt(7.5), labelColor: col('forest') },
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: an invented archipelago and a floor plan, drawn as paths
// Paths and flat fills only: no <marker>, filter or mask, so the PDF keeps every drawing
// vector (gotcha: svg-no-marker-filters).
const PX = 12; // declared pixels per mm. Only the ratio counts: SVG figures fill their frame
const rng = (seed) => () => { // Mulberry32: the same maps on every run
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => Math.round(v * 100) / 100;
const xy = ([x, y]) => `${n(x)} ${n(y)}`;
const spline = (pts, closed) => { // Catmull-Rom through the points, as cubic Béziers
  const last = pts.length - 1;
  const at = (i) => pts[closed ? (i + pts.length) % pts.length : Math.max(0, Math.min(last, i))];
  const segs = pts.slice(0, closed ? pts.length : -1).map((p, i) => {
    const [a, b, c, d] = [at(i - 1), p, at(i + 1), at(i + 2)];
    return `C${xy([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6])} `
      + `${xy([c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6])} ${xy(c)}`;
  });
  return `M${xy(pts[0])}${segs.join('')}${closed ? 'Z' : ''}`;
};
const disc = (x, y, r, k = 0.5523 * r) => `M${xy([x - r, y])}C${xy([x - r, y - k])} `
  + `${xy([x - k, y - r])} ${xy([x, y - r])}C${xy([x + k, y - r])} ${xy([x + r, y - k])} `
  + `${xy([x + r, y])}C${xy([x + r, y + k])} ${xy([x + k, y + r])} ${xy([x, y + r])}`
  + `C${xy([x - k, y + r])} ${xy([x - r, y + k])} ${xy([x - r, y])}Z`;
const poly = (...pts) => `M${pts.map(xy).join('L')}`;
const box = (x, y, w, h) => `${poly([x, y], [x + w, y], [x + w, y + h], [x, y + h])}Z`;
// The drawings' own colours: the plan's floor, the sea near a coast, the relief bands.
const ART = { tint: '#e3ebe4', shallows: '#0f4a37', coast: '#1f5c45', lowland: '#3f7d5f',
  upland: '#6f9a80', summit: '#dfe7dc' };
const hex = (id) => palette[id] ?? ART[id];
const toSvg = (w, h, shapes) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w} ${h}">${shapes.map(({ d, fill, stroke, width, dash }) =>
    `<path d="${d}" fill="${fill ? hex(fill) : 'none'}"${stroke ? ` stroke="${hex(stroke)}" `
    + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"` : ''}${dash
      ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`).join('')}</svg>`;

// Elevation: filled bands from the coast to the summit (thin contour lines alias in thumbnails).
const RELIEF = ['coast', 'lowland', 'upland', 'sage', 'summit'];
// An island is a few overlapping lobes. Each band is filled for every lobe, so shapes of one
// colour merge into a single coast with saddles and more than one summit.
function island(lobes, seed, aspect = 0.8) {
  const rand = rng(seed);
  return lobes.map(([cx, cy, r]) => {
    const waves = [2, 3, 4, 6].map((k) => [k, (rand() * 0.26) / Math.sqrt(k), rand() * 6.28]);
    const peak = [cx + (rand() - 0.5) * r * 0.6, cy + (rand() - 0.5) * r * 0.5];
    // The contour at s × r (plus `grow` mm); higher contours drift towards the summit.
    return (s, grow = 0, drift = 0) => Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      const bump = waves.reduce((sum, [k, amp, ph]) => sum + amp * Math.sin(k * a + ph + drift), 0);
      const [ox, oy] = [peak[0] + (cx - peak[0]) * s, peak[1] + (cy - peak[1]) * s];
      const rr = r * s * (1 + bump) + grow;
      return [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * aspect];
    });
  });
}
function terrain(w, h, isles, route = []) {
  const lobes = isles.flat();
  const fillAll = (fill, s, grow = 0, drift = 0) =>
    lobes.map((f) => ({ d: spline(f(s, grow, drift), true), fill }));
  const shapes = [{ d: box(0, 0, w, h), fill: 'forest' },
    ...fillAll(RELIEF[0], 1.55, 1, 0.3), ...fillAll('forest', 1.55, 0, 0.3), // a 1 mm sea contour
    ...fillAll('shallows', 1.28),
    ...RELIEF.flatMap((fill, i) => fillAll(fill, 1 - i * 0.19, 0, i * 0.22))]; // coast to summit
  if (route.length) {
    shapes.push({ d: spline(route, false), stroke: 'signal', width: 1.5, dash: [3.2, 2.4] });
    for (const [x, y] of route.slice(1, -1)) {
      shapes.push({ d: disc(x, y, 2.7), fill: 'signal' }, { d: disc(x, y, 1.1), fill: 'paper' });
    }
  }
  return shapes;
}
// The cover: the trim plus the bleed on every side, 176 × 233 mm. The route enters from the
// bleed and leaves through it, past four stops, one per room.
const COVER = TRIM.map((side) => side + 2 * BLEED);
const SCALE = [BLEED + TRIM[0] - OUTER - 20, BLEED + 209]; // the scale bar's corner
const coverShapes = [...terrain(...COVER, [
  island([[112, 152, 32], [140, 170, 24], [128, 128, 18]], 7),
  island([[36, 134, 14], [49, 145, 9]], 11),
  island([[151, 77, 10]], 3)],
[[-4, 202], [40, 137], [98, 160], [136, 150], [151, 78], [182, 36]]),
  // A scale bar ending on the recto's text edge, level with the dates (trim → bleed frame).
  ...[0, 2].map((i) => ({ d: box(SCALE[0] + i * 5, SCALE[1], 5, 1.4), fill: 'paper' })),
  { d: box(...SCALE, 20, 1.4), stroke: 'paper', width: 0.3 }];
const BANDART = [COVER[0], BAND + BLEED]; // the back band, from the bleed's foot
const bandShapes = terrain(...BANDART, [ // the back band: the same sea, another coast
  island([[160, 46, 24], [140, 56, 12], [176, 30, 14]], 5, 0.62),
  island([[4, 26, 13]], 9, 0.7)]); // an islet cut by the trim: its bleed is on the sheet

// The floor plan, 118 × 54 mm: walls with doorways, cases, and the route with numbered stops.
// Stroked numerals in a 0.6 × 1 box: SVG text gets none of the web fonts (gotcha: svg-no-webfonts).
const DIGITS = {
  1: 'M0.14 0.22L0.36 0L0.36 1',
  2: 'M0.04 0.24C0.08 -0.06 0.58 -0.06 0.56 0.28C0.54 0.52 0.04 0.7 0.04 1L0.58 1',
  3: 'M0.06 0L0.56 0L0.28 0.38C0.64 0.36 0.66 1 0.28 1C0.16 1 0.06 0.96 0.02 0.88',
  4: 'M0.44 1L0.44 0L0.02 0.66L0.6 0.66',
};
const glyph = (k, x, y, size) => DIGITS[k].replace(/(-?[\d.]+) (-?[\d.]+)/g,
  (_, a, b) => xy([x + (a - 0.3) * size, y + (b - 0.5) * size]));
const PLAN = [118, 54];
const STOPS = [[20, 37], [20, 13], [79, 13], [98, 37]]; // rooms 1 to 4, clockwise
const planShapes = [
  { d: box(1, 1, 116, 48), fill: 'tint' }, // the floor: four rooms round the vestibule
  ...[[6, 42, 14, 4], [23, 42, 12, 4], [5, 4, 4, 14], [50, 17, 22, 4], [86, 4, 24, 4],
    [110, 30, 4, 14], [84, 44, 22, 3]].map((r) => ({ d: box(...r), fill: 'sage' })), // cases
  ...[[[52, 49], [1, 49], [1, 1], [117, 1], [117, 49], [66, 49]], // walls; the gaps are doors
    [[1, 25], [15, 25]], [[25, 25], [40, 25]], [[40, 1], [40, 8]], [[40, 17], [40, 33]],
    [[40, 42], [40, 49]], [[40, 25], [93, 25]], [[103, 25], [117, 25]], [[78, 25], [78, 33]],
    [[78, 42], [78, 49]]].map((pts) => ({ d: poly(...pts), stroke: 'forest', width: 1.2 })),
  // The route starts and ends in the vestibule, just inside the door.
  { d: poly([56, 45], [56, 37], [20, 37], [20, 13], [98, 13], [98, 37], [62, 37], [62, 45]),
    stroke: 'signal', width: 0.9, dash: [2.2, 1.7] },
  { d: `${poly([53, 54], [56, 50.4], [59, 54])}Z`, fill: 'signal' }, // the way in
  ...STOPS.flatMap(([x, y], i) => [{ d: disc(x, y, 3.3), fill: 'signal' },
    { d: glyph(i + 1, x, y, 3.4), stroke: 'paper', width: 0.5 }]),
];
// Each drawing by resource id: its size in mm and its shapes.
const DRAWINGS = { cubierta: [COVER, coverShapes], banda: [BANDART, bandShapes],
  plano: [PLAN, planShapes] };
// #endregion

// #region master: print masters, one-page PDFs written in the inks the designer chose
// C, M, Y, K in %, one build per colour of the drawings, matched to the screen colours on a
// proof. The palette authors forest, signal, sage and paper with these same builds, so the
// route matches the tab and the kickers match the sea.
const INKS = { forest: [100, 45, 80, 55], shallows: [100, 50, 85, 40], coast: [90, 50, 85, 20],
  lowland: [80, 40, 75, 5], upland: [50, 15, 45, 20], sage: [40, 20, 35, 0],
  summit: [10, 5, 10, 0], tint: [5, 0, 5, 5], signal: [0, 60, 85, 0], paper: [0, 0, 0, 0] };
function pdfPage(w, h, shapes) { // w, h in mm; the content stream flips y to match the SVG
  const s = 72 / 25.4; // pt per mm
  const ink = (id, op) => `${INKS[id].map((v) => v / 100).join(' ')} ${op}`;
  const ops = (d) => d.replace(/([MLCZ])([^MLCZ]*)/g,
    (_, c, v) => `${v.trim()} ${{ M: 'm', L: 'l', C: 'c', Z: 'h' }[c]} `.trimStart());
  const body = shapes.map(({ d, fill, stroke, width, dash }) => [
    'q', fill && ink(fill, 'k'), stroke && ink(stroke, 'K'), stroke && `${width} w 1 J 1 j`,
    dash && `[${dash.join(' ')}] 0 d`, ops(d), fill ? 'f' : 'S', 'Q',
  ].filter(Boolean).join(' ')).join('\n');
  const stream = `${s} 0 0 ${-s} 0 ${h * s} cm\n${body}`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(w * s)} ${n(h * s)}] /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf); // ASCII only, so string length = byte length
}
const masters = new Map(Object.entries(DRAWINGS) // by fileId: cubierta.pdf, banda.pdf, plano.pdf
  .map(([id, [size, shapes]]) => [`${id}.pdf`, pdfPage(...size, shapes)]));
// #endregion

// Every drawing is an SVG for the screen and names its print master for the press.
const svgResource = (id, extra) => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0,
  updatedAt: 0, ...extra, svg: { fileId: `${id}.svg`, pdfFileId: `${id}.pdf`,
    width: DRAWINGS[id][0][0] * PX, height: DRAWINGS[id][0][1] * PX } });
const resources = [
  svgResource('cubierta', { altText: 'Islas inventadas en verdes escalonados sobre un mar '
    + 'verde oscuro, cruzadas por una ruta naranja con cuatro paradas.' }),
  svgResource('banda', { altText: 'La costa de una isla inventada.' }),
  svgResource('plano', { caption: 'Plano de la exposición, con el itinerario en naranja.',
    altText: 'Plano: cuatro salas alrededor del vestíbulo y un itinerario '
    + 'naranja que las recorre en el sentido de las agujas del reloj.' }),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages use. Layout measures with the browser's fonts, so the kit loads them
// from Fontsource before the first build (gotcha: fonts-first); the PDF embeds the same files,
// Fontsource's latin subsets, which cover Spanish (gotcha: latin-subset).
const FONTS = { Karla: ['400', '400i', '700'], 'Space Grotesk': ['400', '700'],
  'Space Mono': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all(Object.entries(DRAWINGS)
  .map(([id, [size, shapes]]) => loadSvg(`${id}.svg`, toSvg(...size, shapes))));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'Cartografías imaginarias · PDF listo para imprenta' });
const inputs = { resources, masters };
offerPdf(() => pressPdf(doc, 'press', inputs), `${RECIPE}.pdf`); // the file for the press
offerPdf(() => pressPdf(doc, 'proof', inputs), `${RECIPE}-proof.pdf`); // a proof to read
// The kit names both buttons alike; once built, each download link carries its file name.
const button = (file) => document.querySelector(`[data-postext-pdf="${file}"]`);
button(`${RECIPE}.pdf`).textContent = 'Press PDF (PDF/X-4)';
button(`${RECIPE}-proof.pdf`).textContent = 'Greyscale proof';

// The preflight: what a printer would reject, checked with the same profile.
const transform = outputTransform(await loadOutputProfile(PRINT.outputProfile, PROFILES));
const findings = preflightDocument(doc, { resources, transform });
const report = document.createElement('p');
report.textContent = findings.length === 0
  ? `Preflight (${PRINT.standard}, ${PRINT.outputProfile}): no findings`
  : `Preflight: ${findings.map((f) => `${f.kind} on page ${f.pageIndex + 1}`).join('; ')}`;
button(`${RECIPE}.pdf`).after(report);

// @kit
