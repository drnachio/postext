// ═══ Postext Cookbook · Nº 189 · A fifth ink for the corporate colour ═══════════════════
// https://postext.dev/en/cookbook/corporate-fifth-ink-report
// Code: MIT · Text: original (CC BY 4.0) · Photographs: diffusion models
// Fonts: Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// An annual report printed in four colours and one exact corporate blue. The palette, the
// chart and an older swatch call the blue by three names; the ink table gathers them on one
// plate named as the printer stocks the ink, PANTONE 286 C.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, parseTSV, setCellBackground,
  setAlignment, inlineSvgFonts,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'corporate-fifth-ink-report';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: one spot ink, three names: the ink table puts them on one plate
// The corporate blue as each source named it: the designer's swatch, an older palette that
// wrote it without the space, and the chart, drawn in Spanish, which says 'Azul Cauce'. The
// tints are the same ink at 40 % and 12 %: no process mix stands in for them.
const BLUE = { c: 100, m: 75, y: 0, k: 0 }; // what the ink looks like at 100 %, for a proof
const spot = (hex, name, tint) => ({ hex, model: 'spot', spot: { name, cmyk: BLUE, tint } });
const palette = {
  ink: { hex: '#1c2129', model: 'hex' }, // text, in process black
  muted: { hex: '#5d6573', model: 'hex' },
  blue: spot('#0033a0', 'Brand Blue'),
  blue40: spot('#99add9', 'Pantone 286C', 40),
  blue12: spot('#e0e6f3', 'Brand Blue', 12),
  ochre: { hex: '#c98a1b', model: 'hex' }, // the one process accent: the second data series
  paper: { hex: '#ffffff', model: 'hex' },
};
// The ink table: the plate's name is the printer's, and every other name prints on it.
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false,
  inks: [{ name: 'PANTONE 286 C', aliases: ['Brand Blue', 'Pantone 286C', 'Azul Cauce'],
    cmyk: BLUE }] };
// #endregion
const col = (id) => ({ ...palette[id], paletteId: id });
const colorPalette = [...Object.entries(palette).map(([id, value]) => ({ id, name: id, value })),
  { id: 'main-color', name: 'blue (defaults)', value: palette.blue }];

const [TRIM_W, TRIM_H] = [210, 297]; // A4
const MARGIN = { top: 24, bottom: 24, inner: 20, outer: 16 };
const LEAD = 13.2; // pt
const SANS = 'Source Sans 3';
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', placement, ...look });
const label = (size, color) => ({ fontFamily: SANS, fontWeight: 700, fontSize: pt(size),
  letterSpacing: pt(size * 0.14), textTransform: 'uppercase', color });

// #region cover: the river from the air over a band of the corporate blue
const BAND = 172; // mm from the top of the bleed to the top of the blue band
const cover = { id: 'cover', numbered: false, toc: false, span: 'page',
  header: { elements: [] }, footer: { elements: [] },
  margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) },
  advancedDesign: { enabled: true, minHeight: mm(TRIM_H), slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: 'meander', fit: 'cover',
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(BAND + 1) }) },
    { kind: 'box', id: 'band', style: { backgroundColor: col('blue') },
      placement: at('bleed', 'top-left', 0, BAND, { width: 'fill', height: mm(TRIM_H) }) },
    text('name', '{author}', label(10, col('paper')), at('page', 'top-left', 20, BAND + 14)),
    text('title', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(46),
      lineHeight: 1, color: col('paper') }, at('#name', 'below', 0, 6, { width: mm(170) })),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(3), color: col('blue40'),
      placement: at('#title', 'below', 0, 7, { width: mm(24) }) },
    text('strap', '{attr.strap}', { fontFamily: 'Source Serif 4', italic: true, fontSize: pt(15),
      lineHeight: 1.3, color: col('paper') }, at('#rule', 'below', 0, 6, { width: mm(120) })),
    text('credit', '{attr.credit}', { fontFamily: SANS, fontSize: pt(7), color: col('blue40') },
      at('page', 'bottom-left', 20, -14, { width: mm(170) })),
  ] } } };
// #endregion

// #region opener: a section opens under a blue bar that carries its kicker
const opener = { enabled: true, minHeight: mm(51), slot: { elements: [
  { kind: 'box', id: 'bar', style: { backgroundColor: col('blue') },
    placement: at('container', 'top-left', 0, 0, { width: 'fill', height: mm(9) }) },
  text('kicker', '{attr.kicker}', label(8, col('paper')), at('container', 'top-left', 4, 2.4)),
  text('title', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(30),
    lineHeight: 1.04, color: col('blue') }, at('#bar', 'below', 0, 9, { width: mm(150) })),
  text('lead', '{attr.lead}', { fontFamily: 'Source Serif 4', italic: true, fontSize: pt(12.5),
    lineHeight: 1.3, color: col('ink') }, at('#title', 'below', 0, 4, { width: mm(150) })),
] } };
// #endregion

// #region feet: the folio and the report on every page, a short blue rule over them
const foot = (id, content, parity, edge, x, look = {}) => text(id, content, { ...label(7,
  col('muted')), parity, align: edge.endsWith('left') ? 'left' : 'right', ...look },
at('page', edge, x, -12));
const footer = { elements: [
  { kind: 'rule', id: 'rule-v', parity: 'even', direction: 'horizontal', thickness: pt(2),
    color: col('blue'), placement: at('page', 'bottom-left', MARGIN.outer, -18,
      { width: mm(10) }) },
  { kind: 'rule', id: 'rule-r', parity: 'odd', direction: 'horizontal', thickness: pt(2),
    color: col('blue'), placement: at('page', 'bottom-right', -MARGIN.outer, -18,
      { width: mm(10) }) },
  foot('folio-v', '{pageNumber}', 'even', 'bottom-left', MARGIN.outer, { color: col('blue') }),
  foot('title-v', '{title}', 'even', 'bottom-left', MARGIN.outer + 9),
  foot('part-r', '{chapterTitle}', 'odd', 'bottom-right', -(MARGIN.outer + 9)),
  foot('folio-r', '{pageNumber}', 'odd', 'bottom-right', -MARGIN.outer, { color: col('blue') }),
] };
// #endregion

// A photograph across the head of the page, a volunteer's words on the blue's 12 % tint.
const PHOTO = 168; // mm of bleed the photograph takes
const plate = { id: 'plate', numbered: false, toc: false, span: 'page',
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, minHeight: mm(TRIM_H - 48), slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: 'volunteers', fit: 'cover',
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(PHOTO) }) },
    { kind: 'box', id: 'field', style: { backgroundColor: col('blue12') },
      placement: at('bleed', 'top-left', 0, PHOTO, { width: 'fill', height: mm(TRIM_H) }) },
    text('caption', '{attr.caption}', { fontFamily: SANS, fontSize: pt(8), color: col('muted') },
      at('page', 'top-left', 20, PHOTO + 2, { width: mm(170) })),
    text('quote', '“{attr.quote}”', { fontFamily: 'Source Serif 4', italic: true,
      fontSize: pt(20), lineHeight: 1.3, color: col('blue') },
    at('page', 'top-left', 20, PHOTO + 22, { width: mm(150) })),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(3), color: col('blue'),
      placement: at('#quote', 'below', 0, 8, { width: mm(24) }) },
    text('who', '{attr.who}', label(8, col('blue')), at('#rule', 'below', 0, 4)),
  ] } } };

// The back cover: all blue, the address and how the report was printed, in white.
const back = { id: 'back', numbered: false, toc: false, span: 'page',
  breakBefore: { enabled: true, parity: 'even' }, header: { elements: [] },
  footer: { elements: [] }, advancedDesign: { enabled: true, minHeight: mm(TRIM_H - 48),
    slot: { elements: [
      { kind: 'box', id: 'field', style: { backgroundColor: col('blue') },
        placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: 'fill' }) },
      text('name', '{titleText}', { fontFamily: SANS, fontWeight: 800, fontSize: pt(22),
        color: col('paper') }, at('page', 'top-left', 20, 210)),
      text('address', '{attr.address}', { fontFamily: SANS, fontSize: pt(9), lineHeight: 1.4,
        color: col('paper') }, at('#name', 'below', 0, 4, { width: mm(90) })),
      text('inks', '{attr.inks}', { fontFamily: SANS, fontSize: pt(7.5), lineHeight: 1.4,
        color: col('blue40') }, at('#address', 'below', 0, 8, { width: mm(110) })),
    ] } } };

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette, resourceTypes,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: { fontFamily: 'Source Serif 4', fontSize: pt(9.6), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('blue'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: SANS, fontWeight: 700, color: col('blue'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener },
    { level: 2, fontSize: pt(11), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) }] },
  headingStyles: [cover, plate, back],
  unorderedLists: { bulletChar: '•', color: col('blue'), marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [{ id: 'figures', background: col('blue12'), columnGap: mm(7),
    padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
    marginTop: pt(LEAD), marginBottom: pt(LEAD),
    titleStyle: { ...label(7.5, col('blue')), gap: mm(2.5) },
    body: { fontFamily: SANS, fontSize: pt(8.8), lineHeight: pt(12), color: col('ink'),
      textAlign: 'left', firstLineIndent: pt(0) } }],
  paragraphStyles: [
    { id: 'figure', fontFamily: SANS, fontWeight: 800, fontSize: pt(24), lineHeight: pt(28),
      color: col('blue'), boldColor: col('blue'), textAlign: 'left', firstLineIndent: pt(0) },
    { id: 'signoff', fontFamily: SANS, fontSize: pt(8.5), color: col('muted'), textAlign: 'left',
      firstLineIndent: pt(0) },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('blue40'), borderWidth: pt(0.5),
    headerBackground: col('blue'), headerColor: col('paper'), headerFontFamily: SANS,
    headerFontSize: pt(8), bodyFontFamily: SANS, bodyFontSize: pt(8.4), bodyColor: col('ink'),
    cellPadding: mm(1.3) },
  captionStyle: { fontFamily: SANS, fontSize: pt(8), color: col('ink'), gap: mm(2),
    labelBold: true, labelColor: col('blue'), note: { fontSize: pt(7), color: col('muted') } },
  print: PRINT,
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const projects = /* @content:projects */ ''; // the tables: TSV, pasted from a spreadsheet
const accounts = /* @content:accounts */ '';
const water = /* @content:water */ '';

// #region tables: the header in the blue, the totals on its 12 % tint
// A row whose first cell is bold is a total: it takes the tint. Figures align right.
function tsvTable(tsv, columnWidths) {
  let m = Object.assign(parseTSV(tsv, { headerRows: 1 }), { columnWidths });
  m.rows.forEach((row, r) => row.forEach((_, c) => {
    if (c > 0) m = setAlignment(m, { row: r, col: c }, 'right', 'middle');
    if (r && row[0].content.startsWith('**')) m = setCellBackground(m, { row: r, col: c },
      col('blue12'));
  }));
  return m;
}
// #endregion

// #region chart: the SVG names its ink in Spanish, and the ink table merges it
// Kilometres of bank restored each year: the bars in the blue (data-spot="Azul Cauce"), the
// plan in its 40 % tint, the labels in process black. An alias brings both onto the plate.
const YEARS = [[2021, 3.1, 4], [2022, 4.6, 5], [2023, 6.2, 6], [2024, 7.4, 8], [2025, 9.8, 9]];
function chartArt() {
  const [W, H, BASE, LEFT, MAX] = [84, 56, 46, 8, 12];
  const y = (v) => BASE - (v / MAX) * (BASE - 4);
  const lines = [0, 4, 8, 12].map((v) => `<path d="M${LEFT} ${y(v)}H${W}" stroke="#c4cad4" `
    + `stroke-width="0.2"/><text x="${LEFT - 1.5}" y="${y(v) + 1}" font-size="2.6" `
    + `text-anchor="end" fill="#5d6573">${v}</text>`).join('');
  const bars = YEARS.map(([year, done, plan], i) => {
    const x = LEFT + 3 + i * 15;
    return `<rect x="${x}" y="${y(plan)}" width="5" height="${BASE - y(plan)}" fill="#99add9" `
      + `data-spot="Azul Cauce" data-spot-tint="40"/><rect x="${x + 5.6}" y="${y(done)}" `
      + `width="5" height="${BASE - y(done)}" fill="#0033a0" data-spot="Azul Cauce"/>`
      + `<text x="${x + 5.3}" y="${BASE + 5}" font-size="2.8" text-anchor="middle" `
      + `fill="#1c2129">${year}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}" font-family="'Source Sans 3'">${lines}${bars}</svg>`;
}
// Where each euro went: one bar across the text block, the river in the full ink, schools in
// its 40 % tint, the running costs in process grey.
const SPENT = [[1520, '#0033a0', 100, t({ en: 'Work on the river', es: 'Obras en el río' })],
  [340, '#99add9', 40, t({ en: 'Schools', es: 'Escuelas' })],
  [180, '#9aa1ad', 0, t({ en: 'Running costs', es: 'Funcionamiento' })]];
function euroArt() {
  const [W, H] = [174, 22];
  const total = SPENT.reduce((sum, [v]) => sum + v, 0);
  let x = 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}" font-family="'Source Sans 3'">`
    + `${SPENT.map(([v, hex, tint, name], i) => {
      const w = (v / total) * W;
      const ink = tint ? ` data-spot="Azul Cauce" data-spot-tint="${tint}"` : '';
      const end = i === SPENT.length - 1; // the last label sets flush right, under its segment
      const tx = `x="${end ? W : x}" text-anchor="${end ? 'end' : 'start'}"`;
      const part = `<rect x="${x}" y="0" width="${w - 0.6}" height="10" fill="${hex}"${ink}/>`
        + `<text ${tx} y="15.5" font-size="3.2" font-weight="700" fill="#1c2129">`
        + `${Math.round((v / total) * 100)} %</text><text ${tx} y="20" font-size="2.8" `
        + `fill="#5d6573">${name}</text>`;
      x += w;
      return part;
    }).join('')}</svg>`;
}
// #endregion

const type = (id, name) => ({ id, name, captionPrefix: name, numberingTemplate: '{n}',
  resetOn: 'never', counterFormat: 'decimal' });
const resourceTypes = [type('figure', t({ en: 'Figure', es: 'Figura' })),
  type('table', t({ en: 'Table', es: 'Tabla' })),
  { ...type('photo', ''), captionPrefix: '', numberingTemplate: '' }];
const photo = (id, file, [w, h], extra) => ({ id, typeId: 'photo', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: file, format: 'jpeg', width: w, height: h },
  ...extra });
const resources = [
  photo('meander', 'meander.jpg', [1120, 853], { altText: t({
    en: 'The river from the air: a green meander between poplars, gravel bars and fields.',
    es: 'El río desde el aire: un meandro verde entre chopos, playas de grava y campos.' }) }),
  photo('director', 'director.jpg', [800, 1000], { placement: { position: 'top' },
    caption: t({ en: 'Inés Barrera, director', es: 'Inés Barrera, directora' }),
    altText: t({ en: 'A woman in a rain jacket on a river bank.',
      es: 'Una mujer con chubasquero en la orilla de un río.' }) }),
  photo('volunteers', 'volunteers.jpg', [1200, 800], { altText: t({
    en: 'People in boots planting stakes along a muddy bank.',
    es: 'Gente con botas plantando estacas en una orilla embarrada.' }) }),
  photo('sample', 'sample.jpg', [900, 900], { placement: { position: 'top', width: 0.62 },
    caption: t({ en: 'A monthly water sample at the Fuentelsaz gauge.',
      es: 'Una muestra mensual de agua en la estación de Fuentelsaz.' }),
    altText: t({ en: 'Hands holding a sample bottle over clear water.',
      es: 'Unas manos sostienen un frasco de muestra sobre agua clara.' }) }),
  photo('kingfisher', 'kingfisher.jpg', [1050, 700], { placement: { position: 'bottom',
    span: 'page' }, caption: t({ en: 'A kingfisher on a willow at Valtierra, one of those '
      + 'planted in 2019.', es: 'Un martín pescador en un sauce de Valtierra, de los plantados '
      + 'en 2019.' }), altText: t({ en: 'A kingfisher perched on a willow branch over a clear '
      + 'river.', es: 'Un martín pescador posado en una rama de sauce sobre un río claro.' }) }),
  { id: 'banks', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'banks.svg', width: 840, height: 560 }, placement: { position: 'top' },
    caption: t({ en: 'River bank restored each year, in kilometres: :swatch{color="blue"} done '
      + 'and :swatch{color="blue40"} planned.', es: 'Orilla restaurada cada año, en kilómetros: '
      + ':swatch{color="blue"} hecha y :swatch{color="blue40"} prevista.' }),
    altText: YEARS.map(([year, done]) => `${year}: ${done} km`).join(', ') },
  { id: 'projects', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: tsvTable(projects, [5, 1.4, 1.6, 1.6]) }, placement: { position: 'bottom',
      span: 'page' }, caption: t({ en: 'The year’s projects.', es: 'Los proyectos del año.' }) },
  { id: 'water', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: tsvTable(water, [3, 1.4, 1.4, 1.8]) }, placement: { position: 'bottom',
      span: 'page' }, caption: t({ en: 'Nitrate and dissolved oxygen at the nine stations, in '
      + 'milligrams a litre.', es: 'Nitrato y oxígeno disuelto en las nueve estaciones, en '
      + 'miligramos por litro.' }) },
  { id: 'euro', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'euro.svg', width: 1740, height: 220 }, placement: { position: 'bottom',
      span: 'page' }, caption: t({ en: 'Where each euro we spent went in 2025.',
      es: 'A qué fue cada euro que gastamos en 2025.' }),
    altText: SPENT.map(([v, , , name]) => `${name}: ${v}`).join(', ') },
  { id: 'accounts', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: tsvTable(accounts, [4, 1.3, 1.3]) }, placement: { position: 'top' },
    caption: t({ en: 'Income and spending, in thousands of euros.',
      es: 'Ingresos y gastos, en miles de euros.' }) },
];

await Promise.all([loadImage('meander.jpg', asset('meander-1120.jpg')),
  loadImage('director.jpg', asset('director-800.jpg')),
  loadImage('volunteers.jpg', asset('volunteers-1200.jpg')),
  loadImage('sample.jpg', asset('sample-900.jpg')),
  loadImage('kingfisher.jpg', asset('kingfisher-1050.jpg')), loadSvg('banks.svg', chartArt()),
  loadSvg('euro.svg', euroArt())]);

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Source Serif 4': ['400', '400i', '700'],
  'Source Sans 3': ['400', '700', '800'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Cauce Foundation · annual report in a fifth ink',
  es: 'Fundación Cauce · memoria anual con una quinta tinta' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
