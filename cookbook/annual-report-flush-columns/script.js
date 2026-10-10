// ═══ Postext Cookbook · Nº 037 · Annual report with flush columns ═══════════════════════
// https://postext.dev/en/cookbook/annual-report-flush-columns
// Code: MIT · Text: original (CC BY 4.0) · Art: drawn in code · Typefaces: SIL OFL 1.1
// Fonts: Brygada 1918, Epilogue, Spline Sans Mono, Mrs Saint Delafield · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage, mergeCells,
  inlineSvgFonts,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'annual-report-flush-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: 'band' is the first section's colour; each later :::part brings its own
const palette = {
  ink: '#14202b', // text: a blue-black
  band: '#0b5d7a', // sea, overridden by palette="band=#…" on the :::part fences
  wind: '#3aa6a0', sun: '#f2b134', coral: '#e2674b', // the data colours of the charts
  tint: '#eef3f5', // subtotal rows
  rule: '#c9d3d9', // hairlines
  muted: '#566370', // captions' notes and the running feet
  mist: '#9fb1bd', // small print on the ink cover
  paper: '#ffffff',
};
// Designs paint the hex (gotcha: palette-skips-designs); a :::part recolours by paletteId.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TRIM = { width: 210, height: 280 };
const LEAD = 13.4; // body leading in pt: one line of the baseline grid
const LINES = 50; // grid lines in a full column
const MARGIN = { top: 22, inner: 18, outer: 16 }; // mm, mirrored
MARGIN.bottom = TRIM.height - MARGIN.top - (LINES * LEAD * 25.4) / 72; // 21.6 mm: 50 lines exactly
const GUTTER = 7; // mm between the columns, and between the columns inside the boxes
const mono = { fontFamily: 'Spline Sans Mono', fontWeight: 500, textTransform: 'uppercase' };
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, placement,
  align: 'left', ...look });

// #region answer: flush columns: whole grid lines everywhere, and the balancing levers
// The text block is LINES lines of LEAD deep (MARGIN.bottom is derived from them) and every
// heading takes whole lines, so a column the break rules leave short is short by whole lines.
// Balancing (on by default) stretches it back to its foot with its levers, in this order: a
// box that closes the column moves down to it; lines above the headings; one line where a
// list ends; one line under a float at the column head; last, a paragraph set one line longer
// and looser, with up to maxTracking of tracking. A closing band whose columns differ by more
// than a line is cut level instead (trailing), and so is the band a page-wide box leaves when
// it has to move on to the next page (beforeSpan).
const balancing = { maxLinesPerHeading: 1 }; // one line per heading; the next lever takes more
const flowText = { // justification, hyphenation and Knuth–Plass stay at their defaults (on)
  fontFamily: 'Brygada 1918', fontSize: pt(9.4), lineHeight: pt(LEAD),
  firstLineIndent: mm(4), indentAfterHeading: false,
  minWordSpacing: 0.7, maxWordSpacing: 1.8, // word spaces 0.7–1.8 of normal (defaults 0.6–2)
};
const onGrid = { lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(0) }; // one line
// hook-up: headings: { balancing, levels: [..., { level: 2, ...onGrid }] }, bodyText: flowText
// #endregion

// #region openers: the cover and the section openers, fed by heading attributes
const cover = { enabled: true, slot: { elements: [
  { kind: 'box', id: 'field', style: { backgroundColor: col('ink') },
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } } },
  { kind: 'image', id: 'ribbons', resourceId: 'ribbons', // 210 × 128 mm, from DATA
    placement: { ...at('bleed', 'top-left', 0, 104), size: { width: 'fill' } } },
  text('name', '{titleText}', { fontFamily: 'Epilogue', fontWeight: 800, fontSize: pt(19),
    color: col('paper') }, at('page', 'top-left', MARGIN.inner, MARGIN.top)),
  text('year', '{attr.year}', { fontFamily: 'Epilogue', fontWeight: 800, fontSize: pt(150),
    lineHeight: 0.9, letterSpacing: pt(-2), color: col('paper') }, at('#name', 'below', -2, 4)),
  text('strap', '{attr.strap}', { fontFamily: 'Epilogue', fontSize: pt(19), color: col('sun') },
    at('#year', 'below', 2, 2)),
  text('period', '{attr.period}', { ...mono, fontSize: pt(7.5), letterSpacing: pt(1.3),
    color: col('paper') }, at('#strap', 'below', 0, 3)),
  text('note', '{attr.note}', { fontFamily: 'Epilogue', fontSize: pt(6.5), color: col('mist'),
    overflow: 'wrap' }, { ...at('page', 'bottom-left', MARGIN.inner, -14), // the text block's
    size: { width: mm(TRIM.width - MARGIN.inner - MARGIN.outer) } }), // width: 'fill' hits the trim
] } };
// A section opener: a strip in the part's colour, then title and standfirst. Design text's
// lineHeight is a multiple of its size (gotcha: design-lineheight-multiple).
const STRIP = 8; // mm
const onStrip = { ...mono, fontSize: pt(8), letterSpacing: pt(1.4), color: col('paper') };
const opener = { enabled: true, minHeight: mm(56), slot: { elements: [
  { kind: 'box', id: 'strip', style: { backgroundColor: col('band') },
    placement: { ...at('container', 'top-left'), size: { width: 'fill', height: mm(STRIP) } } },
  text('part', '{partNumber}   {partTitle}', onStrip, // a text given a height centres on it
    { ...at('container', 'top-left', 3), size: { height: mm(STRIP) } }),
  text('kicker', '{attr.kicker}', { ...onStrip, align: 'right' },
    { ...at('container', 'top-right', -3), size: { height: mm(STRIP) } }),
  text('title', '{titleText}', { fontFamily: 'Epilogue', fontWeight: 800, fontSize: pt(26),
    lineHeight: 1.04, color: col('ink'), overflow: 'wrap' }, // breaks at the title's \\
  { ...at('#strip', 'below', 0, 8), size: { width: 'fill' } }),
  text('standfirst', '{attr.standfirst}', { fontFamily: 'Brygada 1918', italic: true,
    fontSize: pt(11.5), lineHeight: 1.3, color: col('ink'), overflow: 'wrap' },
  { ...at('#title', 'below', 0, 3.5), size: { width: mm(150) } }),
] } };
// #endregion

const boxText = { textAlign: 'left', firstLineIndent: pt(0) };
const boxTitle = { ...mono, fontSize: pt(7.5), letterSpacing: pt(1.3), gap: mm(3) };
// #region figures: a page-wide box of three key figures, one to a column
// In the Markdown: :::callout{type="figures" span="page"} around :::columns{count=3 breaks="3,5"},
// each number a :::paragraphs{style="figure"} of **8.47 GWh**, then its line of text.
const figures = { id: 'figures', background: col('ink'), columnGap: mm(GUTTER),
  padding: { top: mm(5), right: mm(5), bottom: mm(5), left: mm(5) },
  marginTop: pt(LEAD), marginBottom: pt(LEAD), titleStyle: { ...boxTitle, color: col('sun') },
  body: { fontFamily: 'Epilogue', fontSize: pt(9), lineHeight: pt(12), color: col('paper'),
    ...boxText } };
const bigNumber = { id: 'figure', fontFamily: 'Epilogue', fontSize: pt(26), lineHeight: pt(31),
  color: col('paper'), boldColor: col('sun'), ...boxText };
// #endregion

// #region aside: a box that floats to the head of the next page while the text flows on
// In the Markdown: :::callout{type="aside" span="page" placement="top"}. It leaves the flow
// where it stands and takes the head of the next page the flow opens; the text goes on
// filling this one. It has a stripe in the section's colour and no fill. The padding under
// the text drops the floats below the box by a grid line, so they stand clear of it.
const aside = { id: 'aside', backgroundEnabled: false, columnGap: mm(GUTTER),
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('band') },
  padding: { top: mm(3.5), right: pt(0), bottom: mm(3.5), left: pt(0) },
  titleStyle: { ...boxTitle, color: col('band') },
  body: { fontFamily: 'Epilogue', fontSize: pt(8.6), lineHeight: pt(12.2), color: col('ink'),
    ...boxText } };
// #endregion

// Running feet: the folio outside, the report on the verso, the section in its colour opposite.
const foot = (id, content, parity, x, look = {}) => text(id, content, { ...mono, fontSize: pt(7),
  letterSpacing: pt(1.1), color: col('muted'), parity, align: x < 0 ? 'right' : 'left', ...look },
at('page', x < 0 ? 'bottom-right' : 'bottom-left', x, -11));
const folio = { fontWeight: 700, color: col('ink') };
const footer = { elements: [
  foot('verso-folio', '{pageNumber}', 'even', MARGIN.outer, folio),
  foot('verso-title', '{title}  ·  {subtitle}', 'even', MARGIN.outer + 8),
  foot('recto-folio', '{pageNumber}', 'odd', -MARGIN.outer, folio),
  foot('recto-part', '{partTitle}', 'odd', -(MARGIN.outer + 8), { color: col('band') }),
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, resourceTypes,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { gutterWidth: mm(GUTTER), inlineResourceGap: 'above' }, // no air under the signature
  // Bold, italic and references default to the engine's blue, so all three are restated in ink.
  bodyText: { ...flowText, color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), referenceBold: false },
  headings: { fontFamily: 'Epilogue', color: col('band'), balancing, levels: [
    // Restated (gotcha: headings-drop-h1-break); 'any': a section opens on the next page.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener },
    { level: 2, fontSize: pt(11.5), fontWeight: 700, ...onGrid },
  ] },
  headingStyles: [{ id: 'cover', advancedDesign: cover, footer: { elements: [] } }], // no folio
  parts: { page: false }, // a :::part sets the section's title and colour, with no page
  unorderedLists: { bulletChar: '–', color: col('band'), marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [figures, aside],
  paragraphStyles: [bigNumber, { id: 'signoff', fontFamily: 'Epilogue', fontSize: pt(8.5),
    ...boxText }],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Spline Sans Mono',
    headerFontSize: pt(7.5), bodyFontFamily: 'Spline Sans Mono', bodyFontSize: pt(7.8),
    bodyColor: col('ink'), cellPadding: mm(1.3) },
  tableStyles: [{ id: 'statement', cellPadding: mm(0.9) }], // 17 rows, set closer
  captionStyle: { fontFamily: 'Epilogue', fontSize: pt(8), color: col('ink'), gap: mm(2.5),
    labelColor: col('band'), note: { fontSize: pt(7), color: col('muted') } },
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region data: one object for the cover, both charts and the income statement
const DATA = {
  // Output in MWh at the export meter, January to December 2025.
  wind: [560, 520, 450, 330, 270, 210, 190, 150, 300, 420, 480, 540], // Harrow Down
  sun: [90, 160, 300, 440, 560, 600, 580, 500, 380, 250, 120, 70], // the Saltings + 21 roofs
  // The turbines' year, % of the hours of both machines: [label, share, palette colour].
  hours: [['generating', 78.0, 'wind'], ['waiting for wind', 16.8, 'rule'], ['bearing repair', 2.6,
    'coral'], ['servicing and grid', 1.8, 'sun'], ['stopped for bats', 0.8, 'ink']],
  // Output by site in MWh: [site, source, capacity in MW, 2025, 2024].
  sites: [['Harrow Down', 'wind', 1.8, 4420, 4560], ['The Saltings', 'solar', 3.2, 3190, 2640],
    ['21 roofs', 'solar', 0.9, 860, 790]],
  // £ thousand, [label, 2025, 2024]; a label alone opens a group, '=' prints the running sum.
  accounts: [['Income'], ['Electricity sold under the power purchase agreement', 760, 722],
    ['Electricity sold to roof hosts', 92, 85], ['Feed-in tariff', 236, 229], ['=Total income'],
    ['Operating costs'], ['Operation and maintenance', -231, -198],
    ['Rent, rates and insurance', -158, -151], ['Staff and administration', -121, -112],
    ['Depreciation', -286, -286], ['=Operating surplus'],
    ['Interest on the Harrow Down loan', -54, -66], ['Interest on members’ shares at 3.5%', -113,
      -107], ['Grants to the Tidewell Fund', -84, -70], ['Corporation tax', -5, -7],
    ['=Surplus for the year']],
};
const fill = { background: col('tint') }; // totals sit on a tint between two hairlines
const right = (content, extra) => ({ content, align: 'right', ...extra });
const figure = (n, digits = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: digits });
const head = (c, i) => (i ? right(c, { isHeader: true }) : { content: c, isHeader: true });
const siteTable = (rows) => ({ headerRowCount: 1, columnWidths: [3, 1, 1.3, 1.3], rows: [
  ['Site', 'MW', '2025', '2024'].map(head),
  ...rows.map(([site, source, mw, ...n]) => [{ content: `${site} *(${source})*` },
    right(figure(mw, 1)), ...n.map((v) => right(figure(v)))]),
  [{ content: '**All sites**', ...fill }, ...[2, 3, 4].map((i, k) => right(`**${figure(rows
    .reduce((sum, row) => sum + row[i], 0), k ? 0 : 1)}**`, fill))]] }); // the totals, summed
// Accounting style: losses in brackets, and gains followed by a no-break space as wide as a
// bracket, so the digits line up. Cells are trimmed, so a word joiner (U+2060) keeps it.
const pad = '\u00a0\u2060';
const money = (n) => (n < 0 ? `(${figure(-n)})` : `${figure(n)}${pad}`);
function statement(rows) {
  const sum = [0, 0];
  const cells = [['£ thousand', `2025${pad}`, `2024${pad}`].map(head)];
  for (const [label, ...years] of rows) {
    years.forEach((n, i) => { sum[i] += n; });
    const sub = label.startsWith('='); // a subtotal: the running sum, in bold
    cells.push(sub ? [{ content: `**${label.slice(1)}**`, ...fill },
      ...sum.map((n) => right(`**${money(n)}**`, fill))]
      : [{ content: years.length ? label : `*${label}*` }, // a label alone heads a group
        ...[0, 1].map((i) => right(years.length ? money(years[i]) : ''))]);
  }
  // mergeCells writes the cells a spanning group head hides (gotcha: merged-cells-hiddenby)
  return cells.reduce((model, row, r) => (r && !row[1].content ? mergeCells(model,
    { start: { row: r, col: 0 }, end: { row: r, col: 2 } }) : model),
  { rows: cells, headerRowCount: 1, columnWidths: [5, 1, 1] });
}
// #endregion

// Charts and tables numbered through the report, tables captioned above; marks go unnumbered.
const type = (id, name, extra) => ({ id, name, captionPrefix: name,
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', ...extra });
const resourceTypes = [type('chart', 'Chart'), type('table', 'Table', { captionStyle:
  { position: 'above' } }), type('mark', 'Mark', { captionPrefix: '', numberingTemplate: '' })];
const svg = (id, typeId, fileId, [width, height], extra) => ({ id, typeId, kind: 'svg',
  createdAt: 0, updatedAt: 0, svg: { fileId, width, height }, ...extra });
const table = (id, model, { styleId, ...extra }) => ({ id, typeId: 'table', kind: 'table',
  createdAt: 0, updatedAt: 0, table: { model, styleId }, ...extra });
const resources = [
  svg('ribbons', 'mark', 'ribbons.svg', [2100, 1280], { altText: 'A teal and a yellow ribbon '
    + 'swell and cross from January to December with the wind and sun output.' }),
  svg('monthly', 'chart', 'monthly.svg', [1760, 560], { placement: { position: 'bottom',
    span: 'page' }, note: 'Measured at the export meters. Turbine 2 stood still 4–23 August.',
  caption: 'Output by month in 2025, in megawatt-hours: :swatch{color="wind"} wind at Harrow '
    + 'Down and :swatch{color="sun"} sun on the Saltings and the 21 roofs.',
  altText: 'Paired bars by month: wind falls from 560 MWh in January to 150 in August, sun peaks '
    + 'at 600 in June.' }),
  svg('hours', 'chart', 'hours.svg', [845, 470], { placement: { position: 'top' },
    caption: 'How the two turbines spent the 17,520 hours of their year.',
    altText: DATA.hours.map(([label, share]) => `${label} ${share.toFixed(1)}%`).join(', ') }),
  svg('signature', 'mark', 'signature.svg', [420, 150], { placement: { position: 'here',
    width: 0.42 }, altText: 'The chair’s signature.' }),
  table('sites', siteTable(DATA.sites), { placement: { position: 'top' }, // the house style
    caption: 'Output by site, in megawatt-hours.' }),
  table('accounts', statement(DATA.accounts), { placement: { position: 'bottom', span: 'page' },
    caption: 'Income statement for the year to 31 December.', styleId: 'statement',
    note: 'Audited. Figures in brackets are costs; the full accounts are available on request.' }),
];

const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the cover's ribbons and the charts, drawn from DATA with the page's palette
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const n2 = (v) => +v.toFixed(2);
// The faces of the drawings' labels, named on the root element: loadSvg embeds them.
const LABELS = 'font-family="Spline Sans Mono" font-weight="500"';
const HAND = 'font-family="Mrs Saint Delafield"';
// A smooth path through points (Catmull–Rom turned into cubic Béziers).
function smooth(pts) {
  let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n2(c1[0])} ${n2(c1[1])} ${n2(c2[0])} ${n2(c2[1])} ${n2(p2[0])} ${n2(p2[1])}`;
  }
  return d;
}
// The cover: each source is a ribbon as thick as its month's output; the stronger one rides
// higher, so they cross twice: in spring and in autumn. 210 × 128 mm, the months 17.5 mm apart.
function ribbonsArt(face) {
  const [W, H, MID, THICK, SPREAD] = [210, 128, 64, 0.065, 0.09]; // mm, mm per MWh
  const x = (i) => 8.75 + i * 17.5;
  const edge = (i) => [-8.75, ...DATA.wind.map((_, m) => x(m)), W + 8.75][i];
  const layer = (own, other, colour) => {
    const pts = [own[0], ...own, own[11]].map((v, i) => {
      const m = Math.min(11, Math.max(0, i - 1));
      return [edge(i), MID - (v - other[m]) * SPREAD, (v * THICK) / 2];
    });
    let strands = '';
    for (const k of [-0.66, -0.33, 0, 0.33, 0.66]) {
      strands += `<path d="${smooth(pts.map(([px, py, h]) => [px, py + k * h]))}" fill="none" `
        + `stroke="${palette.ink}" stroke-opacity="0.18" stroke-width="0.3"/>`;
    }
    const top = pts.map(([px, py, h]) => [px, py - h]);
    const bottom = pts.map(([px, py, h]) => [px, py + h]).reverse();
    return `<path d="${smooth(top)}L${smooth(bottom).slice(1)}Z" fill="${colour}" `
      + `fill-opacity="0.9"/>${strands}`;
  };
  const ticks = MONTHS.map((m, i) => `<circle cx="${x(i)}" cy="${H - 12}" r="0.7" `
    + `fill="${palette.mist}"/><text x="${x(i)}" y="${H - 5}" font-size="3" text-anchor="middle" `
    + `fill="${palette.mist}">${m}</text>`).join('');
  // Each ribbon is labelled inside the text block: the wind in February, the sun in June.
  const label = (name, m, own, other, ink) => `<text x="${x(m)}" y="${n2(MID - (own[m] - other[m])
    * SPREAD + 1.2)}" font-size="3.4" letter-spacing="0.6" text-anchor="middle" fill="${ink}">`
    + `${name}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}" ${face}>${layer(DATA.sun, DATA.wind, palette.sun)}`
    + `${layer(DATA.wind, DATA.sun, palette.wind)}${ticks}`
    + `${label('WIND', 1, DATA.wind, DATA.sun, palette.ink)}`
    + `${label('SUN', 5, DATA.sun, DATA.wind, palette.ink)}</svg>`;
}
// Chart 1: paired bars on a 200 MWh grid, 176 × 56 mm (the width of the text block).
function monthlyArt(face) {
  const [W, H, LEFT, BASE, TOPV] = [176, 56, 12, 48, 700];
  const y = (v) => BASE - (v / TOPV) * (BASE - 2);
  const step = (W - LEFT) / 12;
  let grid = '';
  for (const v of [0, 200, 400, 600]) {
    grid += `<path d="M${LEFT} ${n2(y(v))}H${W}" stroke="${v ? palette.rule : palette.ink}" `
      + `stroke-width="${v ? 0.2 : 0.35}"/><text x="${LEFT - 2}" y="${n2(y(v) + 1)}" `
      + `font-size="2.6" text-anchor="end" fill="${palette.muted}">${v}</text>`;
  }
  const bars = MONTHS.map((m, i) => {
    const cx = LEFT + step * (i + 0.5);
    const bar = (v, dx, fill) => `<rect x="${n2(cx + dx)}" y="${n2(y(v))}" width="4.4" `
      + `height="${n2(BASE - y(v))}" fill="${fill}"/>`;
    return bar(DATA.wind[i], -4.6, palette.wind) + bar(DATA.sun[i], 0.2, palette.sun)
      + `<text x="${n2(cx)}" y="${BASE + 5}" font-size="2.8" text-anchor="middle" `
      + `fill="${palette.ink}">${m}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}" ${face}>${grid}${bars}</svg>`;
}
// Chart 2: a ring of the turbines' hours with its key beside it, 84.5 × 47 mm (one column).
function hoursArt(face) {
  const [W, H, CX, CY, R, T] = [84.5, 47, 22, 23.5, 20, 7];
  let a0 = -Math.PI / 2;
  let ring = '';
  let key = '';
  DATA.hours.forEach(([label, share, colour], i) => {
    const a1 = a0 + (share / 100) * 2 * Math.PI;
    const p = (a, r) => `${n2(CX + r * Math.cos(a))} ${n2(CY + r * Math.sin(a))}`;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    ring += `<path d="M${p(a0, R)}A${R} ${R} 0 ${big} 1 ${p(a1, R)}L${p(a1, R - T)}`
      + `A${R - T} ${R - T} 0 ${big} 0 ${p(a0, R - T)}Z" fill="${palette[colour]}" `
      + `stroke="${palette.paper}" stroke-width="0.3"/>`;
    const ky = 8 + i * 7.5;
    key += `<rect x="50" y="${ky - 2.6}" width="3" height="3" fill="${palette[colour]}"/>`
      + `<text x="55" y="${ky}" font-size="2.9" fill="${palette.ink}">${share.toFixed(1)}%</text>`
      + `<text x="55" y="${ky + 3.4}" font-size="2.5" fill="${palette.muted}">${label}</text>`;
    a0 = a1;
  });
  const available = DATA.hours.slice(0, 2).reduce((sum, [, share]) => sum + share, 0); // 94.8
  const middle = `<text x="${CX}" y="${CY + 1.2}" font-size="4" text-anchor="middle" `
    + `fill="${palette.ink}">${available.toFixed(1)}%</text><text x="${CX}" y="${CY + 5}" `
    + `font-size="2.2" text-anchor="middle" fill="${palette.muted}">available</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}" ${face}>${ring}${middle}${key}</svg>`;
}
// The chair's signature: her name in a script face, and the stroke she draws under it.
function signatureArt(face) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="150" viewBox="0 0 42 15" ${face}>`
    + `<text x="1" y="10" font-size="10" fill="${palette.band}">Maren Coles</text>`
    + '<path d="M3 13.2C14 12.1 27 12.6 40 11.3" fill="none" '
    + `stroke="${palette.band}" stroke-width="0.35" stroke-linecap="round"/></svg>`;
}
async function drawArt() {
  await Promise.all([loadSvg('ribbons.svg', ribbonsArt(LABELS)), loadSvg('monthly.svg',
    monthlyArt(LABELS)), loadSvg('hours.svg', hoursArt(LABELS)), loadSvg('signature.svg',
    signatureArt(HAND))]);
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  'Brygada 1918': ['400', '400i', '700'], // 700: the list dashes
  Epilogue: ['400', '700', '800'], // 700: the crossheads; 800: the display
  'Spline Sans Mono': ['400', '400i', '500', '700'], 'Mrs Saint Delafield': ['400'] }; // signature

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await drawArt();
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Annual report with flush columns',
  es: 'Memoria anual con columnas a ras' }) });

// @kit core fonts viewer images
