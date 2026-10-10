// ═══ Postext Cookbook · Nº 095 · A medical article in Vancouver style ══════════════
// https://postext.dev/en/cookbook/medical-article-vancouver
// Code: MIT · Text: original (CC BY 4.0) · Chart: generated in code (CC BY 4.0)
// Fonts: PT Serif, Fira Sans, Fira Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine, registerResourceImage,
  defaultResourceTypes, parseTSV, inlineSvgFonts,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'medical-article-vancouver';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black text, one clinical teal for the journal's own marks
const palette = { ink: '#1a1d21', accent: '#0d5c63', tint: '#e5eff0', rule: '#9fb4b6',
  muted: '#566065', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS, COND] = ['PT Serif', 'Fira Sans', 'Fira Sans Condensed'];
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [210, 297, 24, 22, 17, 17, 6];
const MEASURE = TRIM_W - INNER - OUTER;
const LEAD = 12.8; // pt: 9.3 pt type, as journals set two columns of A4

// #region answer: Vancouver numbers as superscripts, a "1." list and DOIs that are links
// [@key] prints a raised number in order of first citation. English journals set it after
// the full stop, "control.[@ncdrisc2021]"; Spanish ones before it, "controlada[@ncdrisc2021].".
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
// elsevier-vancouver is the bundled NLM/Vancouver style (citation-sequence). Two edits bring
// its list to the NLM sample references: "1." instead of "[1]", and the issue after the
// volume, 2015;373(22):2103-16.
const vancouver = STYLES['elsevier-vancouver']
  .replace('<text variable="citation-number" prefix="[" suffix="]"/>',
    '<text variable="citation-number" suffix="."/>')
  .replace('<text variable="volume"/>',
    '<group><text variable="volume"/><text variable="issue" prefix="(" suffix=")"/></group>');
const citations = {
  style: 'custom', customStyle: vancouver,
  marker: 'superscript', collapseRanges: true, // raised 1 and 6–8, not [1] and [6–8]
  link: true, // each number jumps to its reference, in the PDF and on screen
  bibliography: { fontSize: em(0.86), lineHeight: pt(10.4), entrySpacing: pt(1.6),
    labelWidth: mm(5.5), labelAlign: 'right', // a column for the numbers: 9. and 10. end
    // together, and every entry's text starts at one x, first line and turnovers alike
    doi: 'link' }, // https://doi.org/… printed whole and clickable
};
// #endregion

// #region title: the masthead band, article type, title, authors and affiliations
const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = { fontFamily: COND, fontWeight: 600, letterSpacing: pt(1.3),
  textTransform: 'uppercase' };
const titleBlock = { enabled: true,
  minHeight: mm(62), // the abstract and the text start under the note, on both columns
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: mm(15) } } },
    text('journal', t({ en: 'Almenara Medical Journal', es: 'Revista Médica de Almenara' }),
      COND, 9.5, { ...caps, color: col('paper'), placement: at('page', 'top-left', INNER, 6) }),
    text('issue', '2026 · 14(3) · 181–183', COND, 9.5, { ...caps, color: col('paper'),
      align: 'right', placement: at('page', 'top-right', -OUTER, 6, 60) }),
    text('kind', '{attr.kind}', COND, 9, { ...caps, color: col('accent'),
      placement: at('container', 'top-left', 0, 0, MEASURE) }),
    text('title', '{titleText}', SANS, 19.5, { fontWeight: 600, lineHeight: 1.16,
      placement: at('#kind', 'below', 0, 3, MEASURE - 20) }),
    text('authors', '{attr.authors}', SERIF, 10.5, { inlineMarks: true, // ^1^ → ¹
      placement: at('#title', 'below', 0, 4.5, MEASURE) }),
    text('affiliations', '{attr.affiliations}', SANS, 7.4, { inlineMarks: true,
      lineHeight: 1.35, color: col('muted'), placement: at('#authors', 'below', 0, 2, MEASURE) }),
    { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'),
      placement: at('#affiliations', 'below', 0, 3, MEASURE) },
    text('note', '{attr.note}', SANS, 7.4, { fontStyle: 'italic', color: col('muted'),
      placement: at('#rule', 'below', 0, 1.6, MEASURE) }),
  ] },
};
// #endregion

// #region abstract: the structured abstract in a teal tint, the key points under a teal stripe
const box = (id, bold, more) => ({ id, border: { enabled: false }, snapToGrid: false,
  marginTop: pt(LEAD), marginBottom: pt(LEAD),
  titleStyle: { ...caps, fontSize: pt(8.5), color: col('accent') }, // run-in labels in bold
  body: { fontFamily: SANS, fontSize: pt(8.3), lineHeight: pt(11.2), textAlign: 'left',
    firstLineIndent: pt(0), paragraphSpacing: true, boldColor: col(bold) }, ...more });
const calloutStyles = [
  box('abstract', 'accent', { background: col('tint'), padding: mm(3.5), marginTop: pt(0) }),
  box('keypoints', 'ink', { backgroundEnabled: false, padding: { top: mm(2.5), right: mm(0),
    bottom: mm(1), left: mm(0) }, stripe: { enabled: true, side: 'top', width: pt(2.5),
    color: col('accent') } }),
];
// #endregion

const head = (id, content, parity, edge, x, extra) => text(id, content, COND, 8, {
  parity, pages: 'body', fontWeight: 500, letterSpacing: pt(0.4), color: col('muted'),
  overflow: 'clip', placement: at('page', edge, x, 13, 100), ...extra });
const folio = { fontWeight: 600, color: col('accent') };
const right = { align: 'right' }; // anchored top-right, an element ends at its offset
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('v-title', t({ en: 'Almenara Med J 2026;14(3)', es: 'Rev Med Almenara 2026;14(3)' }),
    'even', 'top-left', OUTER + 9),
  head('r-title', t({ en: 'Ortega Ramos et al. · Telemonitoring after severe hypertension',
    es: 'Ortega Ramos et al. · Telemonitorización tras una crisis hipertensiva' }),
  'odd', 'top-right', -OUTER - 9, right),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, { ...folio, ...right }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom-right', -OUTER,
  { ...folio, ...right, pages: 'opener', placement: at('page', 'bottom-right', -OUTER, -13, 10) }),
] };

const sans = (size, weight) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: weight });
const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  // "(Table 1)" in the text, not "Tab. 1"; Table 1, not 1.1, as the title is numbered: false
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, shortLabel: type.name,
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  colorPalette, citations, calloutStyles, header, footer,
  headingStyles: [
    // No header: [] here, it would hold for the whole section; pages: 'body' spares page 1
    { id: 'article', numbered: false, span: 'page', advancedDesign: titleBlock },
    { id: 'back', numbered: false, fontSize: pt(9.5), color: col('ink') },
  ],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    pageNumbering: { startAt: 181 }, // the article opens on page 181 of the issue
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { fontFamily: SERIF, fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(4),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('accent'), fontWeight: 600, levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // the article opens a page
    { level: 2, ...sans(11.5, 600), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) }, // a line above, the text straight under it
    { level: 3, ...sans(9.3, 600), color: col('ink'), lineHeight: pt(LEAD),
      marginTop: pt(LEAD / 2), marginBottom: pt(0) },
  ] },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerBold: true,
    headerFontFamily: SANS, headerFontSize: pt(7.6), bodyFontFamily: SANS,
    bodyFontSize: pt(7.6), bodyColor: col('ink'), cellPadding: mm(1.2) },
  captionStyle: { fontFamily: SANS, fontSize: pt(7.8), color: col('ink'), labelBold: true,
    labelColor: col('accent'), gap: mm(2), note: { fontSize: pt(6.8), color: col('muted') } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';
const baseline = /* @content:baseline */ ''; // TSV: characteristic, telemonitoring, usual care

// #region resources: Table 1 from the TSV, Figure 1 drawn from the weekly means
const resources = () => [
  { id: 'tbl-baseline', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'top' },
    caption: t({ en: 'Characteristics of the patients at baseline.',
      es: 'Características de los pacientes al inicio.' }),
    note: t({ en: 'Values are mean (SD) or number (%). BP, blood pressure, in mm Hg.',
      es: 'Valores en media (DE) o número (%). PA, presión arterial, en mm Hg.' }),
    table: { model: { headerRowCount: 1, columnWidths: [2.2, 1.1, 1.1],
      rows: parseTSV(baseline).rows.map((row, r) => row.map(({ content }, c) => ({ content,
        ...(r === 0 && { isHeader: true }), ...(c > 0 && { align: 'center' }) }))) } } },
  { id: 'fig-home', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    placement: { position: 'top' }, svg: { fileId: 'home.svg', width: 850, height: 520 },
    caption: t({ en: 'Mean home systolic pressure by week in the telemonitoring group, with its '
      + '95% confidence interval. The dashed line is the home target of 135\u00a0mm\u00a0Hg.',
    es: 'Presión sistólica domiciliaria media por semana en el grupo de telemonitorización, con '
      + 'su intervalo de confianza del 95\u00a0%. La línea discontinua es el objetivo de '
      + '135\u00a0mm\u00a0Hg.' }),
    altText: t({ en: 'A line falling from 158 mm Hg in week 1 to 135 mm Hg in week 12.',
      es: 'Una línea que baja de 158 mm Hg en la semana 1 a 135 mm Hg en la semana 12.' }) },
];
// #endregion

// #region art: the weekly chart, its labels set in Fira Sans
const HOME = [158.4, 153.1, 149.6, 146.2, 143.8, 141.5, 139.9, 138.6, 137.4, 136.1, 135.3, 134.6];
const n2 = (v) => +v.toFixed(2);
// The labels' family, named on the root element: loadSvg embeds its face.
const LABELS = `font-family="${SANS}"`;
function homeChart(face) { // 85 × 52 mm: the width of a column
  const [W, H, L, R, T, B] = [85, 52, 11, 3, 4, 42];
  const x = (week) => L + ((week - 1) / 11) * (W - L - R);
  const y = (v) => B - ((v - 125) / 40) * (B - T); // 125 to 165 mm Hg
  const label = (tx, ty, s, anchor = 'middle') => `<text x="${n2(tx)}" y="${n2(ty)}" `
    + `font-size="2.7" text-anchor="${anchor}" fill="${palette.muted}">${s}</text>`;
  let grid = '';
  for (const v of [130, 140, 150, 160]) {
    grid += `<path d="M${L} ${n2(y(v))}H${W - R}" stroke="${palette.rule}" stroke-width="0.2"/>`
      + label(L - 1.6, y(v) + 0.9, v, 'end');
  }
  for (let w = 1; w <= 12; w++) grid += label(x(w), B + 4, w);
  const half = (i) => 4.6 - i * 0.18; // the interval narrows as readings accumulate
  const upper = HOME.map((v, i) => `${n2(x(i + 1))} ${n2(y(v + half(i)))}`);
  const lower = HOME.map((v, i) => `${n2(x(i + 1))} ${n2(y(v - half(i)))}`).reverse();
  const line = HOME.map((v, i) => `${n2(x(i + 1))} ${n2(y(v))}`).join('L');
  const dots = HOME.map((v, i) => `<circle cx="${n2(x(i + 1))}" cy="${n2(y(v))}" r="0.75" `
    + `fill="${palette.accent}"/>`).join('');
  const dash = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((k) => {
    const x0 = L + k * 4;
    return x0 + 2 > W - R ? '' : `M${x0} ${n2(y(135))}h2`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="520" `
    + `viewBox="0 0 ${W} ${H}" ${face}>${grid}`
    + `<path d="M${upper.join('L')}L${lower.join('L')}Z" fill="${palette.tint}"/>`
    + `<path d="${dash}" stroke="${palette.ink}" stroke-width="0.3"/>`
    + `<path d="M${L} ${B}H${W - R}" stroke="${palette.ink}" stroke-width="0.35"/>`
    + `<path d="M${line}" fill="none" stroke="${palette.accent}" stroke-width="0.6"/>${dots}`
    + label(L - 1.6, T - 1.2, 'mm Hg', 'end')
    + label((L + W - R) / 2, H - 0.8, t({ en: 'Week', es: 'Semana' })) + '</svg>';
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'PT Serif': ['400', '400i', '700', '700i'], 'Fira Sans': ['400', '400i', '600'],
  'Fira Sans Condensed': ['500', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('home.svg', homeChart(LABELS));
const content = { markdown, resources: resources() };
const doc = await buildDocumentWithFonts(content, config(), kitFonts(FONTS));
const title = t({ en: 'A medical article in Vancouver style',
  es: 'Un artículo médico en estilo Vancouver' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit
