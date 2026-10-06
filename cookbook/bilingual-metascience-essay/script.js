// ═══ Postext Cookbook · Nº 141 · A metascience essay in English and Spanish ═══════
// https://postext.dev/en/cookbook/bilingual-metascience-essay
// Code: MIT · Text: J. P. A. Ioannidis, PLoS Med 2005 (CC BY) · Figures: drawn in code (CC BY 4.0)
// Fonts: Gelasio, Sofia Sans Semi Condensed (SIL OFL 1.1) · Needs postext ≥ 1.19.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  registerCitationEngine, defaultResourceTypes, initMathEngine, parseTSV, mergeCells, setAlignment,
} from 'https://esm.sh/postext?bundle';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bilingual-metascience-essay';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a navy for the furniture, one vermilion accent, every colour linked
const palette = { ink: '#1c1d24', navy: '#22305a', accent: '#b8442a', tint: '#eceff5',
  rule: '#b4bccb', muted: '#5a6070', mist: '#c3cde6', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.navy })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS] = ['Gelasio', 'Sofia Sans Semi Condensed'];
// mm: the 210 × 280 trim, head, foot, inner and outer margins, and the gutter
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [210, 280, 22, 22, 19, 17, 6];
const MEASURE = TRIM_W - INNER - OUTER; // 174 mm across both columns
const [BODY, LEAD] = [9.4, 13]; // pt
const [FIG_W, FIG_H] = [MEASURE, 60]; // mm: Figures 1 and 2, across both columns

// #region answer: one script, two editions: LANG picks the text, the language and the numbers
// The Cookbook composes the pen once per edition: content.<LANG>.md and each named slot
// replace the @content markers. What else follows the language is set here.
const edition = {
  // Hyphenation patterns and the words the engine writes (Tabla, Continúa) follow the
  // locale, an exact code (gotcha: hyphenation-locales).
  locale: t({ en: 'en-us', es: 'es' }),
  // Table 1 / Tabla 1, Figure 1 / Figura 1, counted through the essay; tables caption above.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, shortLabel: type.name,
    numberingTemplate: '{n}', resetOn: 'never',
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  // Vancouver numbers in brackets, [2–4]; the CSL locale writes the list's words (2nd ed.,
  // 2.ª ed.). The titles of the works stay in English in both editions.
  citations: { style: 'elsevier-vancouver', locale: t({ en: 'en-US', es: 'es-ES' }),
    marker: 'brackets', collapseRanges: true,
    bibliography: { fontSize: em(0.78), lineHeight: pt(9.4), entrySpacing: pt(0.8),
      labelWidth: mm(6.4), doi: 'hide' } },
};
// The numbers the script writes (Table 4's PPV, the figure axes) take the edition's decimal
// sign, 0.85 or 0,85. Formulas keep their symbols; content.es.md writes 0{,}05 inside $…$
// so that TeX sets no space after the comma.
const number = (x, digits = 2) => x.toLocaleString(t({ en: 'en-US', es: 'es-ES' }),
  { minimumFractionDigits: digits, maximumFractionDigits: digits });
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
await initMathEngine(); // before the tables are built (gotcha: math-bundle)
// #endregion

// #region title: the essay's first page: a navy band with the title, author and source
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = (size, fontWeight = 700) => ({ fontWeight, letterSpacing: pt(size * 0.18),
  textTransform: 'uppercase' });
const BAND = 100; // mm from the top of the trim to the foot of the band
const titleBlock = { enabled: true, minHeight: mm(BAND + 12 - TOP), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('navy') },
    placement: { anchor: { to: 'bleed', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND + 3) } } }, // + the 3 mm bleed
  { kind: 'image', id: 'curves', resourceId: 'band-art', // Eq. (2), faint, for u = 0 to 0.9
    placement: at('page', 'top-left', 128, 46, 76) }, // under the title, clear of the text
  text('kicker', '{attr.kicker}', SANS, 8, 'mist', at('page', 'top-left', INNER, 20, 120),
    caps(8)),
  text('title', '{titleText}', SANS, 36, 'paper', at('#kicker', 'below', 0, 6, 150),
    { fontWeight: 800, lineHeight: 1.02 }),
  text('author', '{attr.author}', SERIF, 13, 'paper', at('#title', 'below', 0, 8, 150)),
  text('affiliation', '{attr.affiliation}', SANS, 8, 'mist', at('#author', 'below', 0, 1.6, 150),
    { lineHeight: 1.35 }),
  text('source', '{attr.source}', SANS, 7.4, 'muted', at('page', 'top-left', INNER, BAND + 4,
    MEASURE), { lineHeight: 1.35 }),
] } };
// #endregion

// Running heads 13 mm from the trim; the first page has its folio at the foot instead.
const head = (id, content, parity, edge, x, extra) => text(id, content, SANS, 7.5, 'muted',
  at('page', `top-${edge}`, x, 13), { overflow: 'clip', ...caps(7.5, 600), align: edge,
    parity, pages: 'body', ...extra });
const folio = { fontWeight: 800, color: col('accent'), letterSpacing: pt(0.4) };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'left', OUTER, folio),
  head('v-title', 'Ioannidis · PLoS Medicine 2005', 'even', 'left', OUTER + 9),
  head('r-title', t({ en: 'Why most published research findings are false',
    es: 'Por qué la mayoría de los resultados publicados son falsos' }), 'odd', 'right',
  -(OUTER + 9)),
  head('r-folio', '{pageNumber}', 'odd', 'right', -OUTER, folio),
] };
const footer = { elements: [text('drop-folio', '{pageNumber}', SANS, 7.5, 'accent',
  at('page', 'bottom-right', -OUTER, -12), { ...folio, align: 'right', pages: 'opener',
    overflow: 'clip' })] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  ...edition, colorPalette, header, footer,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  math: { marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2), keepWithLeadIn: true },
  headings: { fontFamily: SANS, color: col('navy'), fontWeight: 700, levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // gotcha: headings-drop-h1-break
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(LEAD / 2) },
  ] },
  headingStyles: [
    { id: 'essay', numbered: false, span: 'page', advancedDesign: titleBlock },
    { id: 'back', fontSize: pt(8), ...caps(8), color: col('accent'), marginBottom: pt(4) },
  ],
  calloutStyles, chipStyles, paragraphStyles, tableStyle, captionStyle,
});

// #region boxes: the summary across the page, Box 1 under a stripe, run-in corollary labels
const calloutStyles = [
  { id: 'summary', span: 'page', background: col('tint'), marginTop: pt(0),
    marginBottom: pt(LEAD), padding: { top: mm(4), right: mm(6), bottom: mm(4), left: mm(6) },
    titleStyle: { fontFamily: SANS, fontSize: pt(8), ...caps(8), color: col('accent'),
      gap: mm(1.5) },
    body: { fontSize: pt(9.4), lineHeight: pt(13), firstLineIndent: pt(0) } },
  { id: 'box', span: 'page', placement: 'bottom', columnGap: mm(GUTTER),
    backgroundEnabled: false, border: { enabled: false },
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('navy') },
    padding: { top: mm(2.5), right: mm(0), bottom: mm(1), left: mm(0) },
    marginTop: pt(LEAD), marginBottom: pt(LEAD),
    titleStyle: { fontFamily: SANS, fontSize: pt(9), fontWeight: 700, color: col('navy'),
      gap: mm(1.2) },
    body: { fontFamily: SANS, fontSize: pt(8.4), lineHeight: pt(11.2), firstLineIndent: mm(3) } },
];
// :chip[Corollary 1]{style="corollary"}: a label in the sans and the accent, no frame.
const chipStyles = [{ id: 'corollary', fontFamily: SANS, fontSize: em(0.86), bold: true,
  color: col('accent'), backgroundEnabled: false, borderWidth: pt(0), paddingX: em(0),
  gap: em(0.35) }];
const paragraphStyles = [{ id: 'colophon', fontFamily: SANS, fontSize: pt(7.6),
  lineHeight: pt(10.4), color: col('muted'), boldColor: col('ink'), textAlign: 'left',
  firstLineIndent: pt(0), spaceBetween: pt(3) }];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = [
  /* @content */ '', // title, summary, the model, bias, several teams
  /* @content:corollaries */ '', // Box 1 and the six corollaries
  /* @content:close */ '', // the last three sections and the back matter
  /* @content:refs */ '', // the references as BibTeX, shared by both editions
].join('\n\n');
// Captions, notes and the tables as tab-separated text with TeX in the cells, one block each.
const blocks = /* @content:resources */ '';

// #region tables: TSV in, a merged header, and the $…$ cells set as formulas by the engine
// A cell, a caption or a note sets $…$ as the text does (postext ≥ 1.19): MathJax paths at
// the cell's 8 pt, on the baseline of its line and aligned with the cell, vector in the PDF.
// The faces' latin files have no α or β (gotcha: latin-subset); the formulas need none.
const [CELL_PT, PAD] = [8, 1]; // cell type (pt), cell padding (mm)
function tableModel(tsv, widths, headerRows, merges = [], right = []) {
  let model = { ...parseTSV(tsv, { headerRows }), columnWidths: widths };
  model.rows.forEach((_, row) => right.forEach((c) => {
    model = setAlignment(model, { row, col: c }, 'right'); // the numbers, the PPV and their heads
  }));
  for (const range of merges) model = mergeCells(model, range); // gotcha: merged-cells-hiddenby
  return model;
}
// "Research finding" over both header rows, "True relationship" over Yes, No and Total.
const twoByTwo = (tsv) => tableModel(tsv, [1.1, 1.6, 1.6, 2.5], 2, [
  { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
  { start: { row: 0, col: 1 }, end: { row: 0, col: 3 } }]);
// Table 4's last column is computed from Eq. (2), α = 0.05: two significant figures, as in 2005.
const ppv = (power, R, u, alpha = 0.05) => (power * R + u * (1 - power) * R)
  / (R + alpha - (1 - power) * R + u - u * alpha + u * (1 - power) * R);
const read = (s) => Number(s.replace(',', '.'));
const odds = (s) => s.split(':').map((x) => Number(x.replace(/\D/g, ''))).reduce((a, b) => a / b);
const ppvRows = (tsv) => tsv.split('\n').map((line, r) => {
  const [power, R, u, example, head] = line.split('\t');
  const p = ppv(read(power), odds(R), read(u)); // 0.0010: as many decimals as 2 figures need
  return [power, R, u, example, r ? number(p, 1 - Math.floor(Math.log10(p))) : head].join('\t');
}).join('\n');
// #endregion

// #region resources: each block of the slot is a table or a figure, placed where it is cited
const parsed = blocks.trim().split(/\n\s*\n/).map((block) => {
  const fields = {};
  const tsv = block.split('\n').filter((line) => {
    const m = /^(id|caption|note|alt): (.*)$/.exec(line);
    if (m) fields[m[1]] = m[2];
    return !m;
  }).join('\n');
  return { ...fields, tsv };
});
const tables = parsed.filter((b) => b.tsv).map(({ id, caption, note, tsv }) => {
  const model = id === 'tbl-ppv'
    ? tableModel(ppvRows(tsv), [0.8, 0.95, 0.75, 3.8, 1.05], 1, [], [0, 1, 2, 4])
    : twoByTwo(tsv);
  return { id, typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, caption, note,
    table: { model }, placement: { position: 'auto', ...(id !== 'tbl-ppv' && { span: 'page' }) } };
});
const figures = parsed.filter((b) => !b.tsv).map(({ id, caption, note, alt }) => ({ id,
  typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, caption, note, altText: alt,
  placement: { position: 'auto', span: 'page' },
  svg: { fileId: `${id}.svg`, width: FIG_W * 10, height: FIG_H * 10 } }));
const resources = [...tables, ...figures,
  { id: 'band-art', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'band-art.svg', width: 1400, height: BAND * 10 } }];
const tableStyle = { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
  headerBackground: col('navy'), headerColor: col('paper'), headerBold: true,
  headerFontFamily: SANS, headerFontSize: pt(CELL_PT), bodyFontFamily: SANS,
  bodyFontSize: pt(CELL_PT), bodyColor: col('ink'), cellPadding: mm(PAD) };
const captionStyle = { fontFamily: SANS, fontSize: pt(8.2), color: col('ink'), labelBold: true,
  labelColor: col('accent'), gap: mm(2), note: { fontSize: pt(7), color: col('muted') } };
// #endregion

// #region art: Figures 1 and 2 drawn from Eqs. (2) and (3), the band's curves from Eq. (2)
const R2 = (x) => Math.round(x * 100) / 100;
// An SVG drawn as a picture cannot use the page's web fonts (gotcha: svg-no-webfonts): the
// figures carry the label face inline under its own name, which the PDF asks the provider for.
async function inlineFace(family, weight) {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}`
    + '-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `@font-face{font-family:'${family}';font-weight:${weight};`
    + `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
}
const mix = (f) => `#${[1, 3, 5].map((i) => Math.round(parseInt(palette.navy.slice(i, i + 2), 16)
  * (1 - f) + parseInt(palette.accent.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0'))
  .join('')}`; // navy for the first curve, vermilion for the last
const label = (x, y, s, size, extra = '', fill = palette.muted) => `<text x="${R2(x)}" `
  + `y="${R2(y)}" font-size="${size}" font-family="${SANS}" fill="${fill}" ${extra}>${s}</text>`;
const line = (points, stroke, width, extra = '') => `<path d="M${points.map(([x, y]) =>
  `${R2(x)} ${R2(y)}`).join('L')}" fill="none" stroke="${stroke}" stroke-width="${width}" `
  + `${extra}/>`;
// Three panels, power 0.80, 0.50 and 0.20; PPV in % against R from 0 to 1, one curve per value.
function panels(face, curve, values, name, digits, dashed) {
  const [pw, top, plotH, left] = [52, 12, 34, 8]; // panel width, plot top and height, y labels
  let out = `<style>${face}</style>`;
  [0.8, 0.5, 0.2].forEach((power, p) => {
    const x0 = p * (pw + (FIG_W - 3 * pw) / 2) + left;
    const X = (R) => x0 + R * (pw - left - 2);
    const Y = (v) => top + plotH * (1 - v);
    const trace = (f) => Array.from({ length: 101 }, (_, k) => [X(k / 100), Y(f(k / 100))]);
    out += label(x0 - left, 4, `${'ABC'[p]}  <tspan font-weight="400">${t({ en: 'Power',
      es: 'Potencia' })} ${number(power)}</tspan>`, 3.4, '', palette.navy);
    if (!p) out += label(x0 - left, top - 4, t({ en: 'PPV (%)', es: 'VPP (%)' }), 2.8);
    for (const v of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      out += line([[X(0), Y(v)], [X(1), Y(v)]], palette.rule, v ? 0.15 : 0.3)
        + label(X(0) - 1.4, Y(v) + 1, v * 100, 2.6, 'text-anchor="end"')
        + label(X(v), Y(0) + 3.6, number(v, v % 1 ? 1 : 0), 2.6, 'text-anchor="middle"');
    }
    if (dashed) out += line(trace((R) => dashed(power, R)), palette.muted, 0.35,
      'stroke-dasharray="1 0.8"');
    values.forEach((value, i) => {
      out += line(trace((R) => curve(power, R, value)), mix(i / (values.length - 1)), 0.6);
    });
    out += label(X(0.5), Y(0) + 8, `${t({ en: 'Pre-study odds', es: 'Razón previa' })}, `
      + '<tspan font-style="italic">R</tspan>', 2.9, 'text-anchor="middle"');
  });
  const key = values.map((value, i) => line([[48 + i * 24, 57.8], [54 + i * 24, 57.8]],
    mix(i / (values.length - 1)), 0.8) + label(56 + i * 24, 58.8, `<tspan font-style="italic">`
    + `${name}</tspan> = ${number(value, digits)}`, 2.9)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FIG_W * 10}" height="${FIG_H * 10}" `
    + `viewBox="0 0 ${FIG_W} ${FIG_H}">${out}${key}</svg>`;
}
// Eq. (3): n independent studies of equal power, no bias.
const teams = (power, R, n, alpha = 0.05) => (R * (1 - (1 - power) ** n))
  / (R + 1 - (1 - alpha) ** n - R * (1 - power) ** n);
const bandArt = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${BAND * 10}" `
  + `viewBox="0 0 140 ${BAND}">${Array.from({ length: 10 }, (_, i) => line(Array.from(
    { length: 81 },
    (_, k) => [10 + k * 1.6, 92 - 76 * ppv(0.8, k / 80, i / 10)]), palette.mist, 0.5,
  `stroke-opacity="${R2(0.5 - i * 0.04)}"`)).join('')}</svg>`;
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages paint, loaded before the first build (gotcha: fonts-first)
  Gelasio: ['400', '400i', '600', '700', '700i'],
  'Sofia Sans Semi Condensed': ['400', '400i', '600', '700', '700i', '800'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown + blocks);
const face = await inlineFace(SANS, 400); // one face: the figures set no bold
await loadSvg('fig-bias.svg', panels(face, ppv, [0.05, 0.2, 0.5, 0.8], 'u', 2,
  (power, R) => ppv(power, R, 0)));
await loadSvg('fig-teams.svg', panels(face, teams, [1, 5, 10, 50], 'n', 0));
await loadSvg('band-art.svg', bandArt());
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'A metascience essay in English and Spanish',
  es: 'Un ensayo de metaciencia en inglés y en español' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // text in the Fontsource faces; formulas and figures as vector paths

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
