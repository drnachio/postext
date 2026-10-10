// ═══ Postext Cookbook · Nº 021 · Boxes that split, float and pin ══════════════════
// https://postext.dev/en/cookbook/boxes-split-float-pin
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Host Grotesk, Commit Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// Four pages of a school lab workbook in Spanish, and five ways a box can sit on them.
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document (this recipe is Spanish only)
const RECIPE = 'boxes-split-float-pin';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one yellow for fields, paler ones for two boxes, near-blacks for type and bars
const palette = {
  ink: '#1b2430', // text
  charcoal: '#2b2d42', // the safety bar, the summary's rule, the table head, the badge, titles
  sun: '#f2b705', // the opener band and the materials panel: fields, never type
  light: '#fad65a', // the procedure
  tint: '#fff6d6', // the data sheet
  rule: '#d7dde3', // hairlines
  muted: '#5d6b78', // running heads, notes
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at charcoal, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.charcoal })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Host Grotesk'; // text and display
const LABEL = 'Commit Mono'; // labels: kickers, box titles, step numbers, heads, the table
const LEAD = 13.6; // pt: the body leading, the pitch of the baseline grid
const LINES = 44; // grid lines in a full column
const [TRIM_W, TRIM_H, TOP, INNER, OUTER, GUTTER] = [195, 255, 22, 18, 14, 7]; // mm
const PT = 25.4 / 72; // mm in a point

// #region look: the base of every box (a mono title, smaller type), then one device each
const TITLE = { fontFamily: LABEL, fontSize: pt(8), color: col('charcoal'),
  textTransform: 'uppercase', letterSpacing: pt(1.2) }; // bold by default
const BOX_TYPE = { fontSize: pt(8.8), lineHeight: pt(12.4) }; // colours inherit bodyText
const box = (id, device) => ({ id, // margins: the defaults, snapped to whole grid lines
  padding: { top: mm(3), right: mm(3.6), bottom: mm(3.4), left: mm(3.6) },
  titleStyle: { ...TITLE, gap: mm(2) }, body: BOX_TYPE,
  lists: { gap: mm(2), itemSpacing: pt(3) }, ...device });
const icon = (id, size, extra) => ({ kind: 'resource', resourceId: id, size: mm(size),
  ...extra });
// A side bar with its icon centred on it, 1.4 mm narrower than the bar.
const bar = (hue, id, width = 5.6) => ({ backgroundEnabled: false,
  stripe: { enabled: true, side: 'left', width: mm(width), color: col(hue) },
  icon: icon(id, width - 1.4) });
// #endregion

// #region answer: one style per behaviour: kept whole, split, floated, pinned, page-wide
const HAND = 6, GAP = 2, RULE = 0.75 * PT; // mm: the badge's hand, its gap, the hand's rule
const calloutStyles = [
  // Kept whole: keepTogether defaults to true, so a box that does not fit the rest of a
  // column moves on in one piece; only a box taller than a whole column splits anyway.
  box('seguridad', bar('charcoal', 'aviso')),
  // Split: the procedure fits a column, so it takes keepTogether: false to break where it
  // falls instead of moving on whole: between steps, or inside one (splitMinLines, default
  // 2, counts the box's lines on each side of the cut, not the step's: see Pitfalls). The
  // rest goes on in the next column or page without the title or the icon; a corner icon
  // takes no room from the text, so both parts keep one measure.
  box('pasos', { keepTogether: false, background: col('light'),
    icon: icon('compas', 7, { position: 'corner', cornerSide: 'outer' }) }),
  // Floated: its fence adds placement="top", so the box leaves the flow where the fence
  // stands and heads the next page, while the text after it fills this one.
  box('datos', { span: 'page', background: col('tint') }),
  // Pinned: 'fixed' sets the box on the page where its fence falls, at the bottom-left corner
  // of the text block unless fixed.anchor says otherwise, and the column text keeps out of it.
  // width: 'auto' shrink-wraps the title, so an empty fence prints a badge.
  box('autoevaluacion', { placement: 'fixed', width: 'auto',
    // Hang the hand and its rule in the margin (the outer one on this verso), so the badge
    // itself lines up with the text: [hand][rule][GAP][badge].
    fixed: { offset: { x: mm(-(HAND + RULE + GAP)) } },
    marker: { ...icon('mano', HAND), gap: mm(GAP),
      rule: { enabled: true, color: col('charcoal'), width: mm(RULE) } },
    background: col('charcoal'), borderRadius: mm(3.2),
    padding: { top: mm(1.6), right: mm(3.4), bottom: mm(1.6), left: mm(3.4) },
    titleStyle: { ...TITLE, color: col('paper') } }),
  // Across the page, in the flow: the text above it is cut level and resumes under it.
  box('resumen', { span: 'page', backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('charcoal') } }),
];
// #endregion

// #region panel: a yellow panel across both columns with three columns of its own
const materials = box('material', { span: 'page', background: col('sun'),
  marginBottom: pt(LEAD), // one more grid line of air before the text resumes
  padding: { top: mm(3.6), right: mm(4.4), bottom: mm(3.8), left: mm(4.4) },
  columnGap: mm(GUTTER), // the page's gutter: the panel's columns sit as far apart as the text's
  body: { ...BOX_TYPE, paragraphSpacing: false },
  lists: { color: col('ink'), gap: mm(1.8), itemSpacing: pt(1) } });
// #endregion

// #region opener: a sun-yellow band, a shadow chart, texts from the heading line
const BAND = 100; // mm from the trim to the foot of the band
const ART_W = 80; // mm: the width of the band's drawing, at the fore-edge
const AIR = 8; // mm between the band and the first line of text
const [TITLE_W, LEAD_W] = [104, 88]; // mm: the title's and the lead's measure
// Wrapped, not cut with the default ellipsis (gotcha: overflow-ellipsis-default).
const onBand = { color: col('charcoal'), align: 'left', overflow: 'wrap' };
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { y: mm(y) }, size: { width: mm(width) } });
const opener = { enabled: true, minHeight: mm(BAND - TOP + AIR), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('sun') },
    placement: { anchor: { to: 'page', edge: 'top-left' }, size: { height: mm(BAND) } } },
  { kind: 'image', id: 'art', resourceId: 'sombras', placement: { anchor: { to: 'page',
    edge: 'top-right' }, size: { width: mm(ART_W), height: mm(BAND) } } },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...onBand, fontFamily: LABEL,
    fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(1.7), textTransform: 'uppercase',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(4) } } },
  { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: TEXT,
    fontSize: pt(44), fontWeight: 800, lineHeight: 0.98, placement: below('kicker', 3, TITLE_W) },
  { kind: 'text', id: 'lead', content: '{attr.lead}', ...onBand, fontFamily: TEXT,
    fontSize: pt(10.5), lineHeight: 1.4, placement: below('title', 5, LEAD_W) },
  { kind: 'text', id: 'meta', content: '{attr.meta}', ...onBand, fontFamily: LABEL,
    fontSize: pt(7.4), fontWeight: 700, letterSpacing: pt(1.1), textTransform: 'uppercase',
    placement: below('lead', 4, LEAD_W) },
] } };
// #endregion

// Running heads in the label face, the folio in bold on the outer edge.
const HEAD_Y = 13; // mm from the trim to the heads' baseline area
const RUN_X = OUTER + 9; // mm from the fore-edge to the running title, clear of the folio
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: LABEL, fontSize: pt(7.4), letterSpacing: pt(1.1),
  textTransform: 'uppercase', color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD_Y) } } });
const folio = { fontWeight: 700, fontSize: pt(8.5), color: col('ink'), letterSpacing: pt(0) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', RUN_X),
  head('recto-title', 'Práctica {chapterNumber} · {chapterTitle}', 'odd', 'top-right', -RUN_X),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [{ ...head('drop', '{pageNumber}', 'all', 'bottom', 0, folio),
  pages: 'opener', // the drop folio, 11 mm above the foot of the opener
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-11) } } }] };

const config = () => ({
  // The document's language; ragged text is never hyphenated (gotcha: ragged-no-hyphenation).
  locale: 'es',
  resourceTypes: defaultResourceTypes(LANG), // "Figura", "Tabla" (gotcha: resource-types-locale)
  colorPalette, header, footer,
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150, margins: { top: mm(TOP),
    bottom: mm(TRIM_H - TOP - LINES * LEAD * PT), left: mm(INNER), right: mm(OUTER),
    mirror: true } }, // a text block of LINES whole lines; left is the inner margin on a recto
  // A table set in a box sits right under the text above it, with no extra line of air.
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER), inlineResourceGapInBoxes: false },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), // references follow the bold colour
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  headings: { fontFamily: TEXT, fontWeight: 800, color: col('ink'),
    // No extra line under a top float: on the closing page it keeps the layout from settling
    // (gotcha: float-stretch-closing-page).
    balancing: { stretchAfterFloats: false }, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
      marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  unorderedLists: { color: col('charcoal'), marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { fontFamily: LABEL, fontWeight: 700, color: col('charcoal') }, // step numbers
  calloutStyles: [...calloutStyles, materials],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('charcoal'), headerColor: col('paper'), headerFontFamily: LABEL,
    headerFontSize: pt(7.4), bodyFontFamily: LABEL, bodyFontSize: pt(7.4),
    bodyColor: col('ink'), cellPadding: mm(1.1) },
  tableStyles: [{ id: 'registro', cellPadding: mm(2.2), bodyFontSize: pt(8.4) }],
  captionStyle: { fontSize: pt(8), color: col('ink'), labelColor: col('charcoal'), gap: mm(2) },
  paragraphStyles: [{ id: 'colofon', fontFamily: LABEL, fontSize: pt(6.6), lineHeight: pt(9.4),
    color: col('muted') }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// Madrid's solar noon on the 15th of each month of 2026 (NOAA's approximations; CET, and
// CEST from 29 March to 25 October), the Sun's height then and a 1 m stick's shadow.
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const NOON = ['13:23', '13:29', '13:24', '14:15', '14:11', '14:15', '14:21', '14:20', '14:10',
  '14:00', '13:00', '13:10'];
const HEIGHT = [28, 37, 47, 59, 68, 73, 71, 64, 53, 41, 31, 26]; // degrees
const SHADOW = ['1,86', '1,34', '0,93', '0,60', '0,40', '0,31', '0,34', '0,49', '0,76', '1,14',
  '1,65', '2,02']; // metres
const cell = (content, extra) => ({ content, align: 'center', ...extra });
const row = (label, values) => [cell(label, { align: 'left' }), ...values.map((v) => cell(v))];

// Each drawing's viewBox (in mm for the band's chart), rasterised at PX pixels a unit.
const ART = { sombras: [ART_W, BAND], reloj: [156, 36], aviso: [24, 24], compas: [24, 24],
  mano: [28, 24] };
const PX = 10;
const svgResource = (id, extra) => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0,
  updatedAt: 0, svg: { fileId: `${id}.svg`, width: ART[id][0] * PX, height: ART[id][1] * PX },
  ...extra });
const resources = [
  // Uncited, so never placed: the opener and the box styles use them by id.
  svgResource('sombras'), svgResource('aviso'), svgResource('compas'), svgResource('mano'),
  svgResource('reloj', { placement: { position: 'top', span: 'page' },
    caption: 'El reloj visto desde el este. A mediodía, el Sol ilumina la cara superior en verano '
      + '(izquierda) y la inferior en invierno.',
    altText: 'Perfil del reloj ecuatorial con los rayos del Sol de verano y de invierno' }),
  { id: 'mediodia', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' },
    caption: 'Mediodía solar en Madrid, día 15 de cada mes de 2026. De abril a octubre rige el '
      + 'horario de verano.',
    table: { model: { headerRowCount: 1, columnWidths: [2.9, ...MONTHS.map(() => 1)], rows: [
      [cell('', { isHeader: true }), ...MONTHS.map((m) => cell(m, { isHeader: true }))],
      row('Mediodía solar', NOON),
      row('Altura del Sol', HEIGHT.map((h) => `${h}°`)),
      row('Sombra de 1 m', SHADOW),
    ] } } },
  // The students' log: the worked example, then empty rows tall enough to write in.
  { id: 'lecturas', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'top' }, caption: 'Tus lecturas. La primera fila es la del ejemplo.',
    table: { styleId: 'registro', model: { headerRowCount: 1, columnWidths: [1, 1, 1], rows: [
      ['Hora oficial', 'Reloj de sol', 'Diferencia'].map((h) => cell(h, { isHeader: true })),
      ['13:00', '10:49', '2 h 11 min'].map((v) => cell(v)),
      ...Array.from({ length: 3 }, () => ['', '', ''].map((v) => cell(v))),
    ] } } },
];

// #region art: the band's shadow chart, the figure and three icons, in the palette (no words)
// An SVG drawn as an image cannot use the page's fonts (gotcha: svg-no-webfonts).
const n = (v) => +v.toFixed(2);
const svg = (id, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${ART[id][0] * PX}" `
  + `height="${ART[id][1] * PX}" viewBox="0 0 ${ART[id].join(' ')}">${body}</svg>`;
const path = (d, stroke, width, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const shape = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const dot = (x, y, r, fill) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"/>`;
const line = (pts) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}`;
const rad = (deg) => (deg * Math.PI) / 180;
const LAT = rad(40.4); // Madrid

// Where the tip of a vertical stick's shadow falls on flat ground (x east, y north, in stick
// heights), for the Sun at declination d and hour angle h; null when the Sun is too low.
function tip(d, h) {
  const up = Math.sin(LAT) * Math.sin(d) + Math.cos(LAT) * Math.cos(d) * Math.cos(h);
  if (up < Math.sin(rad(6))) return null;
  const north = Math.cos(LAT) * Math.sin(d) - Math.sin(LAT) * Math.cos(d) * Math.cos(h);
  return [(Math.cos(d) * Math.sin(h)) / up, -north / up];
}
function sombras() { // a stick's shadows from noon to 5 p.m. on flat ground, from above, north up
  const [g, x0, y0] = [36, 7, BAND - 11]; // the stick's height and its foot, mm
  const at = ([x, y]) => [x0 + x * g, y0 - y * g];
  const hours = [12, 13, 14, 15, 16, 17];
  let out = '';
  for (const hour of hours) { // hour lines: straight, from the summer to the winter solstice
    const pts = [-23.44, -11.5, 0, 11.5, 23.44].map((d) => tip(rad(d), rad(15 * (hour - 12))));
    out += path(line(pts.filter(Boolean).map(at)), palette.charcoal, 0.35);
  }
  for (const d of [-23.44, 0, 23.44]) { // date lines: the equinox is straight, the rest curve
    const pts = [];
    for (let m = 0; m <= 84; m += 2) { const p = tip(rad(d), rad(m)); if (p) pts.push(at(p)); }
    out += path(line(pts), palette.charcoal, d === 0 ? 0.5 : 0.35);
  }
  for (const hour of hours) { // the equinox shadows themselves, from the foot of the stick
    out += path(line([[x0, y0], at(tip(0, rad(15 * (hour - 12))))]), palette.charcoal, 1.1);
  }
  return svg('sombras', out + dot(x0, y0, 1.8, palette.charcoal));
}
function reloj() { // the dial in profile, seen from the east: south left, north right
  const panel = (ox, sunDeg, lit) => { // one noon: the Sun at sunDeg above the south horizon
    const [ground, u] = [33, 1.2]; // the ground line; drawing units per centimetre
    const foot = [ox + 42, ground]; // the triangle's north corner, at the hypotenuse's foot
    const up = [-Math.cos(rad(50)), -Math.sin(rad(50))]; // along the hypotenuse, 90° − 40°
    const along = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
    const hyp = 12 * u / Math.cos(rad(50)); // a 12 cm base: the hypotenuse's length
    const top = along(foot, up, hyp);
    const mid = along(foot, up, hyp / 2); // the dial's centre
    const g = [Math.cos(LAT), -Math.sin(LAT)]; // the gnomon, up to the north at the latitude
    const s = [-Math.cos(rad(sunDeg)), -Math.sin(rad(sunDeg))]; // towards the Sun
    const sun = along(mid, s, 19);
    const face = along([0, 0], [g[0], g[1]], lit === 'top' ? 0.9 : -0.9); // the lit side
    const board = `<rect x="${n(top[0] - 3 * u)}" y="${ground - 0.7}" `
      + `width="${n(foot[0] - top[0] + 6 * u)}" height="0.7" fill="${palette.charcoal}"/>`; // base
    let out = path(`M${ox} ${ground}H${ox + 74}`, palette.charcoal, 0.4) + board
      + shape(`${line([[foot[0], ground - 0.7], top, [top[0], ground - 0.7]])}Z`, palette.rule)
      + path(line([along(mid, g, -4 * u), along(mid, g, 10 * u)]), palette.charcoal, 0.9)
      + path(line([along(mid, up, -8 * u), along(mid, up, 8 * u)]), palette.charcoal, 1.6)
      + path(line([along(along(mid, up, -8 * u), face, 1), along(along(mid, up, 8 * u), face, 1)]),
        palette.sun, 0.9)
      + path(line([along(mid, g, 10.6 * u), along(mid, g, 17 * u)]), palette.charcoal, 0.35,
        ' stroke-dasharray="1 1.4"') // on to the Pole Star
      + star(...along(mid, g, 18.6 * u), 1.6);
    for (const k of [-1, 0, 1]) { // three rays, travelling from the Sun to the dial
      const start = along(along(sun, [s[1], -s[0]], k * 4), s, -3.6);
      out += path(line([start, along(start, s, -8)]), palette.sun, 0.8);
    }
    return out + dot(...sun, 2.6, palette.sun);
  };
  const star = (x, y, r) => shape(`M${n(x)} ${n(y - r)}L${n(x + r * 0.3)} ${n(y - r * 0.3)} `
    + `${n(x + r)} ${n(y)} ${n(x + r * 0.3)} ${n(y + r * 0.3)} ${n(x)} ${n(y + r)} `
    + `${n(x - r * 0.3)} ${n(y + r * 0.3)} ${n(x - r)} ${n(y)} ${n(x - r * 0.3)} `
    + `${n(y - r * 0.3)}Z`, palette.charcoal);
  return svg('reloj', panel(2, 73, 'top') + panel(82, 26, 'bottom'));
}
function aviso() { // a yellow warning triangle on the charcoal bar
  return svg('aviso', shape('M12 2.6 22.4 20.6H1.6Z', palette.sun, ' stroke-linejoin="round" '
    + `stroke="${palette.sun}" stroke-width="1.6"`)
    + shape('M10.9 8.4h2.2l-.4 6.6h-1.4Z', palette.charcoal)
    + dot(12, 17.4, 1.2, palette.charcoal));
}
function compas() { // the procedure's corner badge: a pair of compasses on a charcoal disc
  return svg('compas', dot(12, 12, 12, palette.charcoal) + dot(12, 6.2, 1.7, palette.light)
    + path('M12 7.4 7.6 18.6M12 7.4 16.4 18.6', palette.light, 1.5)
    + path('M9.2 14.6q2.8 1.5 5.6 0', palette.light, 1));
}
function mano() { // a hand that points right, at the badge
  return svg('mano', shape('M3 9.6h7.4l2.2-2.8a1.6 1.6 0 0 1 2.5 2l-.9 1.2H25a1.6 1.6 0 0 1 0 3.2'
    + 'H16.4v.2h1.2a1.5 1.5 0 0 1 0 3h-1.2a1.5 1.5 0 0 1 0 3h-1.4a1.4 1.4 0 0 1 0 2.8H9.6'
    + 'L3 21.2Z', palette.charcoal));
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses: layout measures with the browser's fonts.
const FONTS = { 'Host Grotesk': ['400', '700', '800'], 'Commit Mono': ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const drawings = { sombras, reloj, aviso, compas, mano };
await Promise.all([prepareFonts(markdown, config(), kitFonts(FONTS)),
  ...Object.entries(drawings).map(([id, draw]) => loadSvg(`${id}.svg`, draw()))]);
// Folio 41 is odd like page 1, a recto; the next # is Práctica 4, so the figure is 4.1.
const continuation = { pageNumbering: { startAt: 41 }, headings: { h1: 3 } };
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: 'Taller de ciencias · Práctica 4' });
// Layout warnings in the bar: a box that no cut could split overflows as calloutOverflow.
const warnings = (doc.warnings ?? []).map((w) => w.kind).join(', ') || 'none';
kitStatus(`${doc.pages.length} pages · layout warnings: ${warnings}`);

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
