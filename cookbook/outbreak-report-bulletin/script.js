// ═══ Postext Cookbook · Nº 143 · A weekly bulletin report: the first AIDS reports ═══
// https://postext.dev/en/cookbook/outbreak-report-bulletin
// Code: MIT · Text: CDC, MMWR 1981;30:250–252 and 305–308 (public domain) · Chart: original
// Fonts: IBM Plex Serif, Libre Franklin, Plex Sans Condensed (OFL) · Needs postext ≥ 1.18.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerCitationEngine,
  registerResourceImage, defaultResourceTypes, parseTSV, mergeCells,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'outbreak-report-bulletin';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a federal blue on office white, every colour linked by id
const palette = { ink: '#1c1f24', accent: '#1f3f74', tint: '#e6eaf1', rule: '#a7b1c2',
  muted: '#566070', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, DISPLAY, LABEL] = ['IBM Plex Serif', 'Libre Franklin', 'IBM Plex Sans Condensed'];
const [TRIM_W, TRIM_H, TOP, BOTTOM, SIDE, GUTTER] = [215.9, 279.4, 22, 20, 19, 6.35];
const MEASURE = TRIM_W - 2 * SIDE; // US Letter, two columns of 86 mm
const LEAD = 13; // pt: 9.5 pt Plex Serif, as a bulletin sets two columns of Letter

const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = (size, extra) => ({ fontFamily: LABEL, fontSize: pt(size), fontWeight: 600,
  letterSpacing: pt(size * 0.18), textTransform: 'uppercase', ...extra });
const rule = (id, y, thickness, width = MEASURE) => ({ kind: 'rule', id, color: col('accent'),
  thickness: pt(thickness), placement: at('container', 'top-left', 0, y, width) });

// #region masthead: the bulletin's band, issue strip and contents over the first report
// The report's kicker, title and dateline come from attributes of its H1 (`display` keeps
// the italic genus: {titleText} is plain text), so the second report reuses the same three
// elements, a column wide, under a double rule: it runs on in the column, as in the weekly.
const reportHead = (y, width, size) => [
  text('kicker', '{attr.kicker}', LABEL, 8.5, { ...caps(8.5), color: col('accent'),
    placement: at('container', 'top-left', 0, y, width) }),
  text('title', '{attr.display}', DISPLAY, size, { fontWeight: 800, lineHeight: 1.08,
    inlineMarks: true, placement: at('#kicker', 'below', 0, 2.2, width) }),
  text('dateline', '{attr.dateline}', LABEL, 9, { fontStyle: 'italic', color: col('muted'),
    placement: at('#title', 'below', 0, 2, width) }),
];
const COLUMN = (MEASURE - GUTTER) / 2;
const white = col('paper');
const masthead = { enabled: true, minHeight: mm(72), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(49) } } },
  text('series', 'A reprint series in public health history', LABEL, 8,
    { ...caps(8), color: white, placement: at('page', 'top-left', SIDE, 11, 120) }),
  text('number', 'Reprint No. 1', LABEL, 8, { ...caps(8), color: white, align: 'right',
    placement: at('page', 'top-right', -SIDE, 11, 50) }),
  text('wordmark', 'Surveillance Notes', DISPLAY, 50, { fontWeight: 800, color: white,
    letterSpacing: pt(-1), lineHeight: 1, placement: at('page', 'top-left', SIDE - 1, 18) }),
  text('issue', 'Two reports of June 5 and July 3, 1981: the first published accounts of '
    + 'what became known as AIDS, as the Centers for Disease Control printed them', TEXT, 9.5,
  { fontStyle: 'italic', lineHeight: 1.3, placement: at('container', 'top-left', 0, 29, 92) }),
  text('contents', '**1** *Pneumocystis* Pneumonia — Los Angeles\n**3** Kaposi\'s Sarcoma '
    + 'and *Pneumocystis* Pneumonia Among Homosexual Men — New York City and California\n'
    + '**6** Notifiable diseases, week ending June 27, 1981',
  LABEL, 8, { inlineMarks: true, lineHeight: 1.3, boldColor: col('accent'),
    placement: at('container', 'top-right', 0, 29, 76), align: 'left' }),
  rule('rule-a', 46.5, 2), rule('rule-b', 48, 0.5), ...reportHead(52, MEASURE, 23),
] } };
const opener = (width, size, minHeight) => ({ enabled: true, minHeight: mm(minHeight),
  slot: { elements: [rule('rule-a', 0, 2, width), rule('rule-b', 1.5, 0.5, width),
    ...reportHead(5, width, size)] } });
// #endregion

const head = (id, content, parity, edge, x, extra) => text(id, content, LABEL, 8, {
  parity, pages: 'body', fontWeight: 500, letterSpacing: pt(0.3), color: col('muted'),
  overflow: 'clip', placement: at('page', edge, x, 12, 150), ...extra });
const folio = { fontWeight: 700, color: col('accent') };
const right = { align: 'right' };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', SIDE, folio),
  head('v-title', 'Surveillance Notes · Reprint No. 1', 'even', 'top-left', SIDE + 8),
  head('r-title', '{chapterTitleAtTop}', 'odd', 'top-right', -SIDE - 8, right),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -SIDE, { ...folio, ...right }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, align: 'center', pages: 'opener', placement: at('page', 'bottom', 0, -11, 20) })] };

// #region answer: case histories, "Reported by" and the Editorial Note as paragraph styles
// :::paragraphs{style="…"} wraps the blocks of each voice; **Patient 1:** is a run-in label.
const voice = (id, family, size, lead, extra) => ({ id, fontFamily: family, fontSize: pt(size),
  lineHeight: pt(lead), color: col('ink'), boldColor: col('ink'), ...extra });
const paragraphStyles = [
  // The case histories: the body voice with each label in the accent.
  voice('case', TEXT, 9.5, LEAD, { boldColor: col('accent'), boldFontWeight: 600 }),
  // "Reported by …": the authors' line, italic small type in the condensed sans, off the grid.
  voice('reported', LABEL, 7.8, 10.2, { italic: true, color: col('muted'), textAlign: 'left',
    firstLineIndent: pt(0), hyphenation: false, marginTop: pt(4), marginBottom: pt(6),
    snapToGrid: false }),
  // The Editorial Note: the body texture, opened by its bold label in the accent.
  voice('editorial', TEXT, 9.5, LEAD, { boldColor: col('accent'), boldFontWeight: 600 }),
  // A line the reprint adds, in the label face and the accent: never taken for 1981 text.
  voice('editor', LABEL, 8, 10.6, { italic: true, color: col('accent'), firstLineIndent: pt(0),
    textAlign: 'left', marginTop: pt(3), marginBottom: pt(5), snapToGrid: false }),
  voice('colophon', LABEL, 7.4, 9.6, { color: col('muted'), textAlign: 'left',
    firstLineIndent: pt(0), marginTop: pt(LEAD), snapToGrid: false }),
];
// MMWR cited by number in parentheses, (1), and listed the works in citation order, "1.".
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = { style: 'american-medical-association', marker: 'parentheses',
  bibliography: { scope: 'chapter', // a list under each report: its own H1 is its chapter
    fontSize: em(0.86), lineHeight: pt(10.6), entrySpacing: pt(1.5),
    labelAlign: 'right' } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'en-us',
  // Each report numbers its own tables from 1, as the weekly did: the counter restarts at
  // every H1, and :ref prints the full word, "Table 1".
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, shortLabel: type.name,
    resetOn: 'h1', numberingTemplate: '{n}',
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  colorPalette, citations, paragraphStyles, header, footer,
  headingStyles: [
    { id: 'lead', span: 'page', advancedDesign: masthead },
    { id: 'report', advancedDesign: opener(COLUMN, 16, 44) }, // runs on in the column
    // The back page: a page of its own, in one column, for the wide weekly table.
    { id: 'back', span: 'page', breakBefore: { enabled: true, parity: 'any' },
      layout: { layoutType: 'single' }, advancedDesign: opener(MEASURE, 20, 26) },
  ],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(SIDE), right: mm(SIDE),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    maxJustifyTracking: 10, // up to 1 % tracking for a line spaces alone would leave loose
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: LABEL, color: col('accent'), fontWeight: 600, levels: [
    // gotcha: headings-drop-h1-break. The reports run on, as in the weekly: no page break.
    { level: 1, breakBefore: { enabled: false } },
    { level: 3, ...caps(8), lineHeight: pt(LEAD), marginTop: pt(LEAD / 2),
      marginBottom: pt(0) },
  ] },
  footnotes: { fontSize: pt(7.6), lineHeight: pt(10), color: col('muted') },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerBold: true,
    headerFontFamily: LABEL, headerFontSize: pt(7.8), bodyFontFamily: LABEL,
    bodyFontSize: pt(7.8), bodyColor: col('ink'), cellPadding: mm(1.3) },
  // The weekly tables were set solid: a tighter style for the 29-row summary.
  tableStyles: [{ id: 'weekly', bodyFontSize: pt(7.4), headerFontSize: pt(7.2),
    cellPadding: mm(0.75) }],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8.2), color: col('ink'), labelBold: true,
    labelColor: col('accent'), gap: mm(2), note: { fontSize: pt(7), color: col('muted') } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const june = /* @content */ ''; // MMWR 1981;30(21):250–252
const july = /* @content:july */ ''; // MMWR 1981;30(25):305–308, and its notifiable diseases
const CASES = /* @content:cases */ ''; // TSV: the five case reports, compiled by the editors
const COMPLAINTS = /* @content:complaints */ ''; // TSV: Table 1 of the July 3 report
const NOTIFIABLE = /* @content:notifiable */ ''; // TSV: Table I of the July 3 issue
const markdown = `${june}\n\n${july}`; // one document: the July report runs on

// #region resources: three tables read from TSV, and the chart built from the case reports
// Each table is tab-separated text, as a spreadsheet exports it. A column of counts aligns
// right, its heading centred; a column of words stays ranged left.
const NUMBER = /^[\d,.()% –]*$/;
const table = (tsv, headerRows, columnWidths) => {
  const model = parseTSV(tsv, { headerRows });
  const body = model.rows.slice(headerRows);
  const numeric = model.rows[0].map((_, c) => body.every((row) => NUMBER.test(row[c].content)));
  const rows = model.rows.map((cells, r) => cells.map((cell, c) => (numeric[c]
    ? { ...cell, align: r < headerRows ? 'center' : 'right' } : cell)));
  return { ...model, rows, columnWidths };
};
// The notifiable-diseases summary has two header rows: "25th week ending" spans two columns,
// "Disease" and the medians span both rows, as the weekly printed them.
const span = (m, [r1, c1], [r2, c2]) => mergeCells(m, { start: { row: r1, col: c1 },
  end: { row: r2, col: c2 } });
const notifiable = [[[0, 0], [1, 0]], [[0, 1], [0, 2]], [[0, 3], [1, 3]], [[0, 4], [0, 6]]]
  .reduce((m, [a, b]) => span(m, a, b), table(NOTIFIABLE, 2, [3.6, 1, 1, 1, 1.1, 1.1, 1.1]));
const added = 'Compiled for this reprint from the case reports; not part of the 1981 report.';
const res = (id, typeId, kind, placement, more) => ({ id, typeId, kind, placement,
  createdAt: 0, updatedAt: 0, ...more });
const resources = [
  res('fig-timeline', 'figure', 'svg', { position: 'bottom', span: 'page' }, {
    svg: { fileId: 'timeline.svg', width: 1780, height: 490 },
    caption: 'The five patients, September 1980 to May 1981, by month. The illness before '
      + 'the pneumonia is counted back from the month of diagnosis, as each report gives it.',
    note: `Drawn by the editors. ${added}`,
    altText: 'A timeline of five rows, one per patient: Pneumocystis pneumonia diagnosed '
      + 'between February and April 1981, two deaths in March and May.' }),
  res('tbl-cases', 'table', 'table', { position: 'top', span: 'page' }, {
    caption: 'The five case reports at a glance.', note: added,
    table: { model: table(CASES, 1, [0.7, 0.45, 1, 2.2, 2.4, 1.5]) } }),
  res('tbl-complaints', 'table', 'table', { position: 'bottom' }, {
    caption: 'Presenting complaints in 20 patients with Kaposi’s sarcoma',
    table: { model: table(COMPLAINTS, 1, [2, 1.15]) } }),
  res('tbl-notifiable', 'table', 'table', { position: 'here' }, {
    caption: 'Summary — cases of specified notifiable diseases, United States',
    note: 'Cumulative totals include revised and delayed reports through previous weeks.',
    table: { model: notifiable, styleId: 'weekly' } }),
];
// #endregion

// #region art: the timeline, drawn from the dates in the case reports
// Months counted from September 1980 (0) to May 1981 (8). `ill`: the months of illness
// before the pneumonia that the report gives; `pcp`: the month of diagnosis; `cmv`: a dated
// CMV finding; `died`: the month of death.
const PATIENTS = [
  { label: 'Patient 1 · 33', ill: [4, 6], pcp: 6, cmv: [1], died: 8 },
  { label: 'Patient 2 · 30', ill: [2, 7], pcp: 7, cmv: [] },
  { label: 'Patient 3 · 30', ill: [4, 5], pcp: 5, cmv: [6] },
  { label: 'Patient 4 · 29', pcp: 5, cmv: [], died: 6 },
  { label: 'Patient 5 · 36', ill: [3, 7], pcp: 7, cmv: [0] },
];
const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const r2 = (v) => +v.toFixed(2);
// An SVG drawn as an image cannot see the page's web fonts (gotcha: svg-no-webfonts), so the
// chart carries its faces inline, as data URLs of the Fontsource files.
async function inlineFace(family, weight) {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}`
    + '-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `<style>@font-face{font-family:F;font-weight:${weight};src:url(data:font/woff2;`
    + `base64,${btoa(bin)}) format('woff2')}text{font-family:F}</style>`;
}
function timeline(faces) { // 178 × 47 mm: the width of the page's two columns
  const [W, H, L, R, T, ROW] = [178, 49, 26, 2, 9.5, 6.2];
  const step = (W - L - R) / MONTHS.length;
  const x = (m) => L + m * step;
  const label = (tx, ty, s, size = 2.75, anchor = 'start', weight = 400, fill = palette.ink) =>
    `<text x="${r2(tx)}" y="${r2(ty)}" font-size="${size}" font-weight="${weight}" `
    + `text-anchor="${anchor}" fill="${fill}">${s}</text>`;
  const cross = (cx, cy) => `<path d="M${r2(cx - 1.3)} ${r2(cy - 1.3)}l2.6 2.6M${r2(cx + 1.3)} `
    + `${r2(cy - 1.3)}l-2.6 2.6" stroke="${palette.ink}" stroke-width="0.6"/>`;
  let out = '';
  MONTHS.forEach((m, i) => {
    if (i % 2 === 0) out += `<rect x="${r2(x(i))}" y="${T - 1}" width="${r2(step)}" `
      + `height="${PATIENTS.length * ROW + 1}" fill="${palette.tint}"/>`;
    out += label(x(i) + step / 2, T - 2.4, m, 2.6, 'middle', 600, palette.muted);
  });
  out += label(x(0), T - 5.6, '1980', 2.6, 'start', 600, palette.accent)
    + label(x(4), T - 5.6, '1981', 2.6, 'start', 600, palette.accent);
  PATIENTS.forEach((p, i) => {
    const cy = T + i * ROW + ROW / 2;
    out += label(0, cy + 1, p.label, 2.9, 'start', 600);
    if (p.ill) out += `<rect x="${r2(x(p.ill[0]) + 0.6)}" y="${r2(cy - 1.1)}" `
      + `width="${r2((p.ill[1] - p.ill[0]) * step - 1.2)}" height="2.2" rx="1.1" `
      + `fill="${palette.rule}"/>`;
    for (const c of p.cmv) {
      const cx = x(c) + step / 2;
      out += `<path d="M${r2(cx)} ${r2(cy - 1.5)}l1.5 1.5l-1.5 1.5l-1.5-1.5Z" fill="#fff" `
        + `stroke="${palette.ink}" stroke-width="0.35"/>`;
    }
    out += `<circle cx="${r2(x(p.pcp) + step / 2)}" cy="${r2(cy)}" r="1.7" `
      + `fill="${palette.accent}"/>`;
    if (p.died !== undefined) {
      const cx = x(p.died) + step / 2;
      out += cross(cx, cy);
    }
  });
  const ly = H - 2.2;
  out += `<rect x="${L}" y="${ly - 2}" width="8" height="2.2" rx="1.1" fill="${palette.rule}"/>`
    + label(L + 10, ly, 'illness before the pneumonia')
    + `<circle cx="${L + 52}" cy="${ly - 0.9}" r="1.7" fill="${palette.accent}"/>`
    + label(L + 55, ly, '<tspan font-style="italic">Pneumocystis</tspan> pneumonia diagnosed')
    + `<path d="M${L + 109} ${ly - 2.4}l1.5 1.5l-1.5 1.5l-1.5-1.5Z" fill="#fff" `
    + `stroke="${palette.ink}" stroke-width="0.35"/>` + label(L + 112, ly, 'dated CMV finding')
    + cross(L + 139, ly - 0.9) + label(L + 142, ly, 'died');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1780" height="490" `
    + `viewBox="0 0 ${W} ${H}">${faces}${out}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'IBM Plex Serif': ['400', '400i', '600', '600i'], 'Libre Franklin': ['800', '800i'],
  'IBM Plex Sans Condensed': ['400', '400i', '500', '600', '600i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const faces = await inlineFace(LABEL, 400) + await inlineFace(LABEL, 600);
await loadSvg('timeline.svg', timeline(faces));
const content = { markdown, resources };
const doc = await buildWithFonts(() => buildDocument(content, config()), markdown);
showPages(doc, { title: 'Surveillance Notes · Reprint No. 1' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes }), `${RECIPE}.pdf`);

// @kit
