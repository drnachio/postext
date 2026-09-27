// ═══ Postext Cookbook · Nº 045 · Side heads, hanging numbers and run-in heads ═══════
// https://postext.dev/en/cookbook/side-heads-hanging-numbers
// Code: MIT · Text: original (CC BY 4.0) · Drawings: made in code (MIT)
// Fonts: Mona Sans, Noto Serif Display, DM Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'side-heads-hanging-numbers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // a Swiss municipal report: black, white and one signal red
  ink: '#17171a', // text and rules
  signal: '#d42a1f', // section numbers, run-in heads, the plot on the plans (5.1:1)
  tint: '#f9dcd7', // the plot's ground on the plans
  sea: '#d8e2e8', // water on the plans
  stone: '#cacad0', // built ground on the plans
  rule: '#c3c3ca', // hairlines under the running head and in tables
  muted: '#5e5e67', // running heads, legends, the colophon (6.4:1)
  paper: '#ffffff',
};
// The hex as well as the id: design slots read only the hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// Defaults this config does not restate link to 'main-color', so it points at the accent.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.signal })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Mona Sans', 'Noto Serif Display', 'DM Mono'];
const TRIM = { width: 210, height: 297 }; // mm: A4, like every document of the competition
const [TOP, LEFT, RIGHT] = [26, 16, 16]; // mm; not mirrored: the brief prints one-sided
const LEAD = 14; // pt: the body leading, the pitch of the baseline grid
const LINES = 50; // grid lines in the text block
const PT = 25.4 / 72; // mm in a point
const GRID = LEAD * PT; // mm: one line of the grid
const CONTENT = TRIM.width - LEFT - RIGHT; // 178 mm
const [SIDE, GUTTER] = [50, 7]; // mm: the margin channel on the left, and the gap after it
const MAIN = CONTENT - SIDE - GUTTER; // 121 mm: the text column
const HANG = SIDE + GUTTER; // mm from the channel's left edge to the text's left edge
const at = (to, edge, x = mm(0), y = mm(0)) => ({ anchor: { to, edge }, offset: { x, y } });
// Kickers, running heads and folios: tracked capitals in the mono.
const LABEL_PT = 7.5;
const label = { fontFamily: LABEL, fontWeight: 500, fontSize: pt(LABEL_PT), lineHeight: 1.35,
  letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'), align: 'left' };

// #region channel: one text column, and on its left a channel for boxes and figures only
const layout = {
  layoutType: 'oneAndHalf',
  sideColumnPercent: (SIDE / CONTENT) * 100, // 50 of the 178 mm between the margins
  sideColumnSide: 'left', // on every page: the brief is printed on one side of the sheet
  sideColumnRole: 'floats', // no text in the channel: what span: 'side' sends, side captions
  gutterWidth: mm(GUTTER),
};
// #endregion

// #region answer: side heads: the heading draws a number and a rule, a box prints the title
// The heading stays in the flow and keeps its number, but its design has no {titleText}:
// it prints the number in the channel and a rule from there to the column's right edge.
const [NUMBER, RULE] = [8.5, 0.75]; // pt: the DM Mono number, whose figures are 0.7 em tall
// Centre the rule on the figures: their baseline is 0.8 of the line down, less 0.35 em.
const RULE_Y = pt(NUMBER * (0.8 - 0.7 / 2) - RULE / 2);
const h2 = { level: 2, numberingTemplate: '{2}', lineHeight: pt(LEAD), // one grid line
  marginTop: pt(2 * LEAD), marginBottom: pt(0), advancedDesign: { enabled: true, slot: {
    elements: [
      { kind: 'text', id: 'number', content: '{number}', fontFamily: LABEL, fontWeight: 500,
        fontSize: pt(NUMBER), lineHeight: 1, color: col('signal'),
        placement: at('container', 'top-left', mm(-HANG)) },
      { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(RULE),
        color: col('ink'), placement: { ...at('#number', 'right-of', mm(2), RULE_Y),
          size: { width: 'fill' } } },
    ] } } };
// The title goes in a box fenced right after the heading: span="side" stands it in the
// channel on the grid line where the text resumes (gotcha: side-box-starts-at-fence).
// Attributes at the end of the line stay with the heading.
const sideHeads = (md) => md.replace(/^## (.+?)(\s*\{[^}]*\})?$/gm,
  (line, title) => `${line}\n\n:::callout{type="sidehead" span="side"}\n${title}\n:::`);
// The box has no background and no padding, and it takes the text's leading, so each
// line of the title sits on a baseline of the text beside it.
const sidehead = { id: 'sidehead', backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  body: { fontFamily: DISPLAY, fontSize: pt(13.5), lineHeight: pt(LEAD) } };
// #endregion

// #region lower: level 3 hangs its number in the gutter; level 4 runs into its paragraph
// The title keeps the text's left edge; the number, right-aligned in a 12 mm box, ends
// 2 mm short of it. The box needs that fixed width: an 'auto' width is clamped to the
// column and would shrink to nothing out here.
const H3 = { size: 10.5, number: 9 }; // pt; two boxes one grid line tall share a baseline
const h3 = { level: 3, numberingTemplate: '{2}.{3}', fontSize: pt(H3.size),
  lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(0),
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontWeight: 600,
      fontSize: pt(H3.size), lineHeight: LEAD / H3.size, color: col('ink'), align: 'left',
      overflow: 'wrap', placement: { ...at('container', 'top-left'), size: { width: 'fill' } } },
    { kind: 'text', id: 'number', content: '{number}', fontFamily: LABEL, fontWeight: 500,
      fontSize: pt(H3.number), lineHeight: LEAD / H3.number, color: col('signal'),
      align: 'right', placement: { ...at('#title', 'left-of', mm(-2)),
        size: { width: mm(12) } } },
  ] } } };
// Level 4 is not a heading: '**Accesibilidad.** Todo el edificio…' opens its paragraph.
// No other paragraph has bold; table cells keep tableStyle's ink, so Total stays black.
const runIn = { boldColor: col('signal') }; // spread into bodyText
// #endregion

// #region opener: the brief's first page: kicker, title, lead and the site plan
const MAP = { y: 68.5, w: CONTENT, h: 52 }; // mm: from the top of the text block
const display = { fontFamily: DISPLAY, fontWeight: 300, color: col('ink'), align: 'left',
  overflow: 'wrap' };
const opener = { enabled: true,
  // The plan is an image element, which reserves no height (gotcha:
  // opener-image-no-reserve): minHeight carries the reserve down to its foot.
  minHeight: mm(GRID * Math.ceil((MAP.y + MAP.h) / GRID)), // on a grid line
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, color: col('signal'),
      placement: at('container', 'top-left', mm(HANG)) },
    { kind: 'text', id: 'series', content: '{subtitle}', ...label,
      placement: { ...at('container', 'top-left'), size: { width: mm(SIDE) } } },
    { kind: 'text', id: 'title', content: '{titleText}', ...display, fontSize: pt(58),
      lineHeight: 0.96, placement: { ...at('#kicker', 'below', mm(0), mm(4.5)),
        size: { width: mm(MAIN) } } },
    { kind: 'text', id: 'lead', content: '{attr.lead}', ...display, italic: true,
      fontSize: pt(14), lineHeight: 1.3, placement: { ...at('#title', 'below', mm(0), mm(5)),
        size: { width: mm(MAIN) } } },
    { kind: 'text', id: 'legend', content: '{attr.map}', fontFamily: TEXT, fontSize: pt(7.5),
      lineHeight: 1.4, color: col('muted'), align: 'left', overflow: 'wrap',
      placement: { ...at('#lead', 'align-top', mm(-HANG), pt(2)),
        size: { width: mm(SIDE - 6) } } },
    { kind: 'image', id: 'map', resourceId: 'situacion', // across the channel and the column
      placement: { ...at('container', 'top-left', mm(0), mm(MAP.y)),
        size: { width: mm(MAP.w) } } },
  ] } };
// #endregion

// #region furniture: letterhead and folio, the same on every page of a one-sided brief
const [HEAD_Y, FOOT_Y] = [13, 11]; // mm from the top and from the foot of the sheet
const FILE_NO = 'BML-2026/04'; // the council's file number, also in the opener's kicker
const header = { elements: [
  // The council's name in two lines, the second on the running head's baseline.
  { kind: 'text', id: 'city', content: '{author}', ...label, color: col('ink'),
    overflow: 'wrap', placement: { ...at('page', 'top-left', mm(LEFT),
      mm(HEAD_Y - LABEL_PT * label.lineHeight * PT)), size: { width: mm(40) } } },
  { kind: 'text', id: 'book', content: '{title}', ...label,
    placement: at('page', 'top-left', mm(LEFT + HANG), mm(HEAD_Y)) },
  { kind: 'text', id: 'folio', content: t({ en: 'Page {pageNumber} of {totalPages}',
    es: 'Página {pageNumber} de {totalPages}' }), ...label,
  placement: at('page', 'top-right', mm(-RIGHT), mm(HEAD_Y)) },
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    placement: { ...at('page', 'top-left', mm(LEFT), mm(HEAD_Y + 5)),
      size: { width: mm(CONTENT) } } },
] };
const footer = { elements: [
  { kind: 'text', id: 'file', content: `{chapterTitle} · ${FILE_NO}`, ...label,
    placement: at('page', 'bottom-left', mm(LEFT + HANG), mm(-FOOT_Y)) },
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  // Figura / Tabla, counted through the whole brief: 1, 2… (gotcha: resource-types-locale)
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}' })),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * GRID), left: mm(LEFT),
      right: mm(RIGHT), mirror: false } },
  layout,
  bodyText: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    ...runIn, boldFontWeight: 600, referenceColor: col('ink'), referenceBold: false,
    italicColor: col('ink'), // an italic would otherwise take main-color, the red
    // Report texture: ragged right, no indent, a blank line between paragraphs.
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  // The hidden text of levels 2 and 3 asks for this weight, and 600 is loaded already.
  headings: { fontFamily: TEXT, fontWeight: 600,
    // Balancing would add lines above heads to fill short pages: three blank lines over
    // some side heads instead of two. Off, the white above every head is the same.
    balancing: { enabled: false }, levels: [
    // Any headings object drops the H1 page break: restated (gotcha: headings-drop-h1-break).
    // span: 'page' gives the opener the whole text block, channel included, as container.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener },
    h2, h3,
  ] },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10.5),
    color: col('muted') }],
  calloutStyles: [sidehead],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontSize: pt(8),
    bodyFontSize: pt(8.6), cellPadding: mm(1.4) },
  captionStyle: { fontSize: pt(8), labelColor: col('signal'), gap: mm(2) },
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// The two tables: every column after the first is right-aligned, its header too.
const row = (cells, header = false) => cells.map((content, i) => ({ content,
  isHeader: header, align: i > 0 ? 'right' : 'left' }));
const programme = { model: { headerRowCount: 1, columnWidths: [3, 1], rows: [
  row(['Zona', 'm²'], true), row(['Acogida y préstamo', '120']), row(['Sala general', '560']),
  row(['Sala infantil', '240']), row(['Espacio joven', '140']),
  row(['Hemeroteca y fondo local', '150']), row(['Sala polivalente', '160']),
  row(['Aulas de formación (2)', '100']), row(['Proceso técnico y dirección', '140']),
  row(['Depósito cerrado', '120']), row(['Aseos, almacenes e instalaciones', '270']),
  row(['**Total**', '**2.000**']),
] } };
const calendar = { model: { headerRowCount: 1, columnWidths: [3, 2], rows: [
  row(['Hito', 'Fecha'], true),
  row(['Publicación del anuncio', '15 de octubre de 2026']),
  row(['Fin del plazo de consultas', '13 de noviembre de 2026']),
  row(['Entrega de la primera fase', '11 de enero de 2027, 14.00 h']),
  row(['Selección de cinco equipos', '5 de febrero de 2027']),
  row(['Entrega de la segunda fase', '22 de abril de 2027, 14.00 h']),
  row(['Fallo del jurado', '20 de mayo de 2027']),
] } };

// #region resources: four placements: the channel, across the page, a column top, here
// The plot plan stands in the channel; the elevation crosses channel and column at the
// head of the next page; the programme floats to the head of the text column, with its
// caption beside it in the channel; the calendar sits where ::resource puts it. The
// programme floats instead of sitting 'here' because an inline table that opens a page
// keeps a pending top figure off that page (gotcha: inline-table-skips-top-float).
const PLAN_W = 44; // mm: the plot plan, 88 m wide at 1:2000
const resources = [
  { id: 'parcela', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'parcela.svg', width: PLAN_W * 10, height: 400 },
    placement: { span: 'side', width: PLAN_W / SIDE }, // 44 mm of the channel's 50
    caption: 'La parcela, 1:2000. Lonja y caseta de básculas, en gris; seis tamarindos en el '
      + 'borde norte. Flechas rojas: accesos posibles; flecha gris: servicio.',
    altText: 'Planta de la parcela con la lonja, la caseta, seis árboles y tres accesos.' },
  { id: 'fachada', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'fachada.svg', width: 1780, height: 300 },
    placement: { position: 'top', span: 'page' },
    caption: 'Fachada al muelle, 1:300. En rojo, los cuatro pórticos del extremo este, con '
      + 'las armaduras corroídas.',
    altText: 'Alzado de la lonja: trece bóvedas, once arcos y cuatro pórticos en rojo.' },
  { id: 'programa', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'top', captionSide: true },
    caption: 'Programa de superficies útiles por zonas.', table: programme },
  { id: 'calendario', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' }, caption: 'Calendario del concurso.', table: calendar },
  // No :ref cites the site plan: only the opener's image element draws it.
  { id: 'situacion', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'situacion.svg', width: MAP.w * 10, height: MAP.h * 10 },
    altText: 'Plano de situación del muelle de Poniente con la parcela de la lonja en rojo.' },
];
// #endregion

// #region art: the three drawings, made in code with a seeded PRNG
const rng = (seed) => () => { // Mulberry32: the same town on every run
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => (+v).toFixed(2);
const svg = (w, h, body, view = `0 0 ${w} ${h}`) => '<svg xmlns="http://www.w3.org/2000/svg" '
  + `width="${w * 10}" height="${h * 10}" viewBox="${view}">${body}</svg>`;
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;
const circle = (x, y, r, fill, extra = '') =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${fill}" ${extra}/>`;
const path = (d, extra) => `<path d="${d}" ${extra}/>`;
const stroke = (color, width) => `fill="none" stroke="${color}" stroke-width="${width}"`;
const through = (points) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}`;
const arrow = (x, y, angle, color) => path('M0 -4 L0 3 M-1.6 1.2 L0 3.6 L1.6 1.2 Z',
  `transform="translate(${x} ${y}) rotate(${angle}) scale(1.3)" fill="${color}" `
  + `stroke="${color}" stroke-width="0.7"`);
const north = (x, y, s) => path(`M${x} ${y} L${x + 0.3 * s} ${y + s} L${x} ${y + 0.8 * s} `
  + `L${x - 0.3 * s} ${y + s} Z`, `fill="${palette.ink}"`);

// Site plan, 1:3000 (1 mm = 3 m): the old quarter, the 1905 ensanche, the plaza, the plot.
function situacionSvg() {
  const { w, h } = MAP;
  const P = palette;
  const rand = rng(45);
  const m = (metres) => metres / 3; // mm on the plan
  const QUAY = h - 10; // the water's edge
  const PLOT = { x: 94, y: QUAY - m(18) - m(45), w: m(70), h: m(45) }; // behind the promenade
  const EAST = PLOT.x + PLOT.w; // the calle de la Aduana starts here
  // The sea: a beach on the west, then the quay of the old harbour and the fishing pier.
  let body = path(`M0 ${h - 5} C14 ${h - 5.5} 30 ${QUAY + 1} 42 ${QUAY} L${w} ${QUAY} V${h} H0 Z`,
    `fill="${P.sea}"`);
  body += rect(150, QUAY - 1, 7, h - QUAY + 1, P.stone);
  body += path(`M${w} ${h - 3.5} L161 ${h - 2.5}`, stroke(P.stone, 2.2));
  for (let i = 0; i < 7; i++) { // boats moored along the quay
    body += rect(90 + i * 8 + rand() * 3, QUAY + 1.2, 1.3, 3 + rand(), P.rule, 'rx="0.6"');
  }
  // The old quarter: one built mass cut by lanes that wander, and the old road to the port.
  const lane = (points, width) => path(through(points),
    `${stroke(P.paper, width)} stroke-linejoin="round" stroke-linecap="round"`);
  body += rect(-1, -1, EAST + 1, QUAY - m(18) + 1, P.stone);
  for (let x = 2; x < EAST; x += 7 + rand() * 5) { // lanes down to the sea
    const points = [];
    for (let y = -2; y <= QUAY - 5; y += 6) points.push([x + (rand() - 0.5) * 3.2, y]);
    body += lane(points, rand() < 0.25 ? 1.9 : 1);
  }
  for (let y = 4; y < QUAY - 10; y += 6 + rand() * 3.5) { // lanes along the coast
    const points = [];
    for (let x = -2; x <= EAST + 2; x += 8) points.push([x, y + (rand() - 0.5) * 2.4]);
    body += lane(points, rand() < 0.2 ? 1.7 : 0.9);
  }
  body += lane([[6, -2], [34, 12], [58, QUAY - 7]], 2.6);
  body += rect(PLOT.x - 4, 8, PLOT.w + 4, QUAY - m(18) - 8, P.paper); // the plaza de las Redes
  // The ensanche: chamfered blocks built round a courtyard.
  const [c, bw, bh] = [2, 13, 9];
  for (let x = EAST + 5; x < w; x += bw + 2.8) {
    for (let y = -4; y < QUAY - 16; y += bh + 2.6) {
      body += path(`${through([[x + c, y], [x + bw - c, y], [x + bw, y + c], [x + bw, y + bh - c],
        [x + bw - c, y + bh], [x + c, y + bh], [x, y + bh - c], [x, y + c]])} Z`,
      `fill="${P.stone}"`) + rect(x + 3.2, y + 3, bw - 6.4, bh - 6, P.paper, 'fill-opacity="0.55"');
    }
  }
  for (let x = 6; x < w - 4; x += 8.6) body += circle(x, QUAY - m(9), 0.9, P.rule); // promenade
  for (let i = 0; i < 10; i++) {
    body += circle(PLOT.x + (i % 5) * 5, 11 + Math.floor(i / 5) * 4.2, 0.9, P.rule);
  }
  // The plot, the lonja along its south edge and the weighbridge hut: as in figure 1.
  body += rect(PLOT.x, PLOT.y, PLOT.w, PLOT.h, P.tint, `stroke="${P.signal}" stroke-width="0.5"`);
  body += rect(PLOT.x + m(9), PLOT.y + m(21), m(52), m(24), P.signal)
    + rect(PLOT.x + m(1.5), PLOT.y + m(29), m(5.5), m(8), P.stone);
  body += north(86, h - 7, 5.5);
  body += rect(44, h - 3.4, m(100), 0.8, P.ink) + rect(44, h - 3.4, m(50), 0.8, P.paper,
    `stroke="${P.ink}" stroke-width="0.2"`); // 100 m
  return svg(w, h, body);
}

// The plot, 1:2000 (1 mm = 2 m), drawn in metres: 88 m across the figure's 44 mm.
function parcelaSvg() {
  const P = palette;
  let body = rect(-9, 63, 88, 3, P.sea); // the harbour, past the 18 m promenade
  body += rect(0, 0, 70, 45, P.tint, `stroke="${P.signal}" stroke-width="0.9"`);
  body += rect(9, 21, 52, 24, P.stone); // the lonja
  for (let x = 13; x < 61; x += 4) body += path(`M${x} 21 V45`, stroke(P.paper, 0.35));
  body += rect(1.5, 29, 5.5, 8, P.stone); // the weighbridge hut
  for (let i = 0; i < 6; i++) { // the six tamarinds
    body += circle(9 + i * 10.4, 6.5, 3.1, 'none', `stroke="${P.muted}" stroke-width="0.5"`)
      + circle(9 + i * 10.4, 6.5, 0.6, P.muted);
  }
  body += arrow(35, -7, 0, P.signal) + arrow(35, 52.5, 180, P.signal) // the entrances
    + arrow(75.5, 14, 90, P.muted); // service
  body += north(-6, -12, 6);
  return svg(PLAN_W, 40, body, '-9 -14 88 80');
}

// The quay front, 1:300 (1 m = 3.33 mm), drawn in metres: 13 vaults on 14 porticos.
function fachadaSvg() {
  const P = palette;
  const [VIEW_W, VIEW_H, SKY] = [CONTENT * 0.3, 9, 7.4]; // m; SKY: ground to the top edge
  const X = (x) => n(x + (VIEW_W - 52) / 2);
  const Y = (y) => n(SKY - y); // y up from the ground
  const CORNICE = 6.2;
  const R = (4 + 0.9 * 0.9) / (2 * 0.9); // radius of a 4 m vault that rises 0.9 m
  let roof = `M${X(0)} ${Y(0)} V${Y(CORNICE)}`;
  for (let i = 1; i <= 13; i++) roof += ` A${R} ${R} 0 0 1 ${X(4 * i)} ${Y(CORNICE)}`;
  let body = path(`${roof} V${Y(0)} Z`, `fill="${P.paper}" stroke="${P.ink}" stroke-width="0.08"`);
  body += path(`M${X(0)} ${Y(CORNICE - 0.35)} H${X(52)} M${X(0)} ${Y(0.5)} H${X(52)}`,
    stroke(P.ink, 0.04));
  for (let i = 0; i < 13; i++) { // eleven arches; a square door in each end bay
    const cx = 4 * i + 2;
    body += i === 0 || i === 12 ? rect(+X(cx - 1.1), +Y(3.6), 2.2, 3.6, P.stone)
      : path(`M${X(cx - 1.2)} ${Y(0.5)} V${Y(3.4)} A1.2 1.2 0 0 1 ${X(cx + 1.2)} ${Y(3.4)} `
        + `V${Y(0.5)} Z`, `fill="${P.stone}"`);
  }
  for (let i = 0; i <= 13; i++) { // the porticos' pilasters; the four eastern ones in red
    const x = Math.min(Math.max(4 * i - 0.25, 0), 51.5);
    body += rect(+X(x), +Y(CORNICE - 0.35), 0.5, CORNICE - 0.35, i >= 10 ? P.signal : P.paper,
      `stroke="${P.ink}" stroke-width="0.04"`);
  }
  body += path(`M0 ${Y(0)} H${VIEW_W}`, stroke(P.ink, 0.12)); // the quay
  body += rect(+X(0), +Y(-0.9), 5, 0.22, P.ink) // 10 m
    + rect(+X(5), +Y(-0.9), 5, 0.22, P.paper, `stroke="${P.ink}" stroke-width="0.04"`);
  return svg(CONTENT, VIEW_H / 0.3, body, `0 0 ${VIEW_W} ${VIEW_H}`);
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Mona Sans': ['400', '600'],
  'Noto Serif Display': ['300', '300i', '400'],
  'DM Mono': ['500'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const source = sideHeads(markdown);
await loadSvg('situacion.svg', situacionSvg());
await loadSvg('parcela.svg', parcelaSvg());
await loadSvg('fachada.svg', fachadaSvg());
await loadFonts(FONTS, source);
const doc = await buildWithFonts(() => buildDocument({ markdown: source, resources }, config()),
  source);
showPages(doc, { title: t({ en: 'Competition brief', es: 'Bases del concurso' }) });

// @kit
