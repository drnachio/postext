// ═══ Postext Cookbook · Nº 028 · Lab report: formulas, subscripts and a titration curve ═══
// https://postext.dev/en/cookbook/lab-report-formulas
// Code: MIT · Text: original (CC BY 4.0) · Figures: drawn in code (CC BY 4.0)
// Fonts: Inria Serif, Inria Sans, Sometype Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes, initMathEngine, renderMath, mergeCells,
} from 'https://esm.sh/postext?bundle';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'lab-report-formulas';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // white paper and phenolphthalein: pale at the end point, deep past it
  ink: '#1d2126', // text: a blue-black
  phenol: '#ad2c5f', // the accent: numbers, kickers, stripes, the flask's liquid (6.4:1)
  blush: '#f6d5e2', // the end-point pink: the head's band, the indicator's range on the curve
  slate: '#5b6b7a', // the burette's steel, the table head
  rule: '#cfd4da', // hairlines
  muted: '#626a73', // running heads, notes (5.5:1)
  paper: '#ffffff',
};
// The hex as well as the id: design slots read only the hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// 'main-color' as well: the engine's defaults are linked to it, so any left over turn pink.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.phenol })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [SERIF, SANS, MONO] = ['Inria Serif', 'Inria Sans', 'Sometype Mono'];
const [BODY, LEAD] = [10.5, 15]; // pt: text size and leading
// mm: A4, printed on one side, so not mirrored; the wide left margin holds the numbers
const [TRIM_W, TRIM_H, TOP, BOTTOM, LEFT, RIGHT] = [210, 297, 24, 22, 55, 31];
const MEASURE = TRIM_W - LEFT - RIGHT; // mm: 124, about 74 characters of Inria Serif
const GAP = 4; // mm between a hanging number and the text edge
const HANG = LEFT - GAP - 18; // mm: the number column, 18 mm clear of the trim
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: formulas and units in the text face; TeX for the reaction and equations
// In the Markdown, ~…~ lowers a run and ^…^ raises it, in the text's own face at 58 % of
// its size: CH~3~COOH, OH^−^ (the minus is U+2212), 25,0 cm^3^, 0,100 mol·dm^−3^, p*K*~a~.
// The marks also work where TeX cannot go (gap: math-in-captions): captions and the table
// cells this file writes, such as the column heads, each a quantity over its unit:
const units = { cm3: 'cm^3^', conc: 'mol·dm^−3^' }; // the dot keeps a unit one word
const heads = t({ es: ['Valoración', 'V~inicial~', 'V~final~', 'V~b~ gastado'],
  en: ['Titration', 'V~initial~', 'V~final~', 'V~b~ used'] })
  .map((head, i) => (i ? `${head} / ${units.cm3}` : head)); // 'V~b~ gastado / cm^3^'
// Between $$ and $$ is TeX, set by MathJax as vector paths: the reaction, with mhchem's
// \ce{…} (it lowers the 3 of CH3COOH by itself), and the equations. MathJax comes only with
// the ?bundle build, which every postext symbol here is imported from: the plain URL makes
// initMathEngine() throw, and a build that starts before it resolves prints grey boxes
// (gotcha: math-bundle).
await initMathEngine();
// No math.fontSizeScale: 1.4.1 draws formulas with an x-height of half the type size, and
// Inria Serif's is 0.495 em, so at the default scale their lowercase matches the text's.
// #endregion

// #region hanging: section numbers hung in the margin, titles on the text edge
const face = (size, extra) => ({ fontFamily: SANS, fontWeight: 700, fontSize: pt(size),
  lineHeight: 1.1, align: 'left', overflow: 'wrap', ...extra });
// The title starts on the text edge; the number hangs off its left side ('left-of') in a box
// of fixed width, set right. An auto width is clamped to the room the column leaves on that
// side, which is none: the box shrinks to 0 mm, the number wraps a character to a line and
// the heads grow by one to three lines (gotcha: negative-offsets).
const hang = (id, content, size, color, extra) => ({ kind: 'text', id, content,
  ...face(size, extra), color: col(color), align: 'right',
  placement: { ...at('#title', 'left-of', -GAP), size: { width: mm(HANG) } } });
const hung = (size, color) => ({ enabled: true, slot: { elements: [
  { kind: 'text', id: 'title', content: '{titleText}', ...face(size), color: col('ink'),
    placement: at('container', 'top-left') },
  hang('number', '{number}', size, color),
] } });
const levels = [ // a headings object drops the H1 break (gotcha: headings-drop-h1-break)
  { level: 1, breakBefore: { enabled: true, parity: 'any' } },
  // One grid line per head: the design sets the type, the level's size and leading the flow.
  { level: 2, numberingTemplate: '{2}', fontSize: pt(13), lineHeight: pt(LEAD),
    marginTop: pt(LEAD), marginBottom: pt(0), advancedDesign: hung(13, 'phenol') }, // 5
  { level: 3, numberingTemplate: '{2}.{3}', fontSize: pt(BODY), lineHeight: pt(LEAD),
    marginTop: pt(LEAD), marginBottom: pt(0), advancedDesign: hung(BODY, 'muted') }, // 5.1
];
// #endregion

// #region head: the report head: a pink band, the burette, the H1 and its attributes
const BAND = 104; // mm from the top of the page to the band's foot, where the flask stands
// The byline: values from the H1's attributes and the frontmatter, one per line, each
// with its label hung in the margin like a section number.
const byline = [['{attr.authors}', t({ es: 'Autores', en: 'Authors' })],
  ['{attr.group}', t({ es: 'Grupo', en: 'Class' })],
  ['{attr.teacher}', t({ es: 'Profesora', en: 'Teacher' })],
  ['{publishDate}', t({ es: 'Fecha', en: 'Date' })]].flatMap(([content, label], i) => [
  { kind: 'text', id: `value${i}`, content, fontFamily: SERIF, fontSize: pt(10), align: 'left',
    color: col('ink'), overflow: 'clip', placement: at('#title', 'below', 0, 7 + 4.6 * i) },
  { kind: 'text', id: `label${i}`, content: label, fontFamily: MONO, fontWeight: 500,
    fontSize: pt(7.5), letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('ink'),
    align: 'right', overflow: 'clip',
    placement: { ...at(`#value${i}`, 'left-of', -GAP, 0.7), size: { width: mm(HANG) } } },
]);
// span: 'page' changes nothing in this one-column layout but where the design is painted:
// a heading design kept in the column is clipped at the column's top edge, 24 mm down, so
// the top of the band and the burette would print white.
const report = { id: 'report', numbered: false, span: 'page', advancedDesign: { enabled: true,
  // The band is a box, and boxes count towards the height a head reserves, so the text
  // would start below its foot at 104 mm (where the burette ends too). minHeight sets a floor
  // 8 mm lower, which the H1's bottom margin and the 15 pt grid round up to 15 mm.
  minHeight: mm(BAND + 8 - TOP), slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('blush') },
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'image', id: 'burette', resourceId: 'burette', // its stand 12 mm into the margin
      placement: { ...at('page', 'top-right', 12 - RIGHT), size: { width: mm(34) } } },
    { kind: 'text', id: 'course', content: '{attr.course}', fontFamily: MONO, fontWeight: 600,
      fontSize: pt(7.5), letterSpacing: pt(1.2), textTransform: 'uppercase',
      color: col('phenol'), overflow: 'clip', placement: at('container', 'top-left', 0, 2) },
    { kind: 'text', id: 'title', content: '{titleText}', ...face(27, { lineHeight: 1.06 }),
      color: col('ink'), placement: { ...at('#course', 'below', 0, 5), size: { width: mm(96) } } },
    hang('practice', '{attr.practice}', 27, 'phenol', { lineHeight: 1.06 }), // as a section's
    ...byline,
  ] } } };
const back = { id: 'back', numbered: false, advancedDesign: hung(13, 'phenol') }; // no number
// #endregion

// Running heads on the body pages; the folio hangs in the number column, at the foot of p. 1.
const small = { fontFamily: MONO, fontWeight: 500, fontSize: pt(7.5), letterSpacing: pt(0.6),
  textTransform: 'uppercase', color: col('muted'), overflow: 'clip', pages: 'body' };
const folio = (edge, y, pages) => ({ kind: 'text', id: 'folio', ...small, pages, fontWeight: 700,
  content: '{pageNumber} / {totalPages}', color: col('phenol'), align: 'right',
  placement: { ...at('page', edge, LEFT - GAP - HANG, y), size: { width: mm(HANG) } } });
const header = { elements: [folio('top-left', 13, 'body'),
  { kind: 'text', id: 'course', content: '{attr.course}', ...small,
    placement: at('page', 'top-left', LEFT, 13) },
  { kind: 'text', id: 'authors', content: '{attr.short}', ...small, align: 'right',
    placement: at('page', 'top-right', -RIGHT, 13) },
  { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'),
    pages: 'body', placement: { ...at('page', 'top-left', LEFT, 17),
      size: { width: mm(MEASURE) } } },
] };
const footer = { elements: [folio('bottom-left', -12, 'opener')] };

// #region labels: Tabla and Figura in the report's language, and how their captions look
// defaultResourceTypes(LANG) names them in Spanish (gotcha: resource-types-locale). Their
// '{h1}.{n}' prints a plain 1: the H1 is unnumbered, and an empty {h1} drops out with its dot.
const resourceTypes = defaultResourceTypes(LANG).map((type) => (type.id === 'table'
  ? { ...type, captionStyle: { position: 'above' } } : type)); // a table's caption goes on top
const tableStyle = { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
  headerBackground: col('slate'), headerColor: col('paper'), headerFontFamily: SANS,
  headerFontSize: pt(8.5), bodyFontFamily: MONO, bodyFontSize: pt(8.8), bodyColor: col('ink'),
  cellPadding: mm(1.5) }; // figures in a monospace face, so the decimal separators line up
const captionStyle = { fontFamily: SANS, fontSize: pt(8.8), color: col('ink'), gap: mm(2.5),
  labelColor: col('phenol'), note: { fontFamily: SANS, fontSize: pt(7.4), color: col('muted') } };
// #endregion

const boxTitle = { fontFamily: MONO, fontWeight: 600, fontSize: pt(7.5), letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('phenol'), gap: mm(1.2) };
const box = (id, title, extra) => ({ id, title, backgroundEnabled: false, titleStyle: boxTitle,
  body: { fontSize: pt(9.8), lineHeight: pt(14), firstLineIndent: pt(0) }, ...extra });
const calloutStyles = [ // one device each: a stripe for the abstract, a frame for safety
  box('abstract', t({ es: 'Resumen', en: 'Abstract' }), { marginTop: pt(0), marginBottom: pt(0),
    stripe: { enabled: true, width: pt(3), color: col('phenol') }, // on the left
    padding: { top: mm(0.5), right: mm(0), bottom: mm(0.5), left: mm(5) } }),
  box('safety', t({ es: 'Seguridad', en: 'Safety' }), {
    border: { enabled: true, color: col('phenol'), width: pt(0.75) },
    marginTop: mm(4.5), // air over the frame; the grid rounds the space under it to 8 mm
    padding: { top: mm(3), right: mm(4), bottom: mm(3), left: mm(4) } }),
];

// #region references: a reference list with hanging indents, and the colophon
const paragraphStyles = [
  { id: 'references', fontSize: pt(9), lineHeight: pt(12.5), textAlign: 'left',
    hangingIndent: mm(6), spaceBetween: pt(4) }, // ragged, so never hyphenated
  { id: 'colophon', fontFamily: SANS, fontSize: pt(7.4), lineHeight: pt(10), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ es: 'es', en: 'en-us' }), // exact codes (gotcha: hyphenation-locales)
  resourceTypes, colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(LEFT), right: mm(RIGHT) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, // 'la tabla 1' reads as part of the sentence
    firstLineIndent: mm(5), indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.5,
    maxRuntTracking: 0 }, // runt fixes tighten spaces only (gotcha: runt-tracking-unpainted)
  headings: { fontFamily: SANS, color: col('ink'), levels },
  // A display's marginBottom is a minimum that the 15 pt grid rounds up: at the default
  // 0.8 em a fraction got a line more air under it than over it.
  math: { marginBottom: em(0.3) },
  headingStyles: [report, back],
  unorderedLists: { bulletChar: '–', color: col('phenol'), marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { fontFamily: SANS, fontWeight: 700, color: col('phenol'), marginTop: pt(0),
    marginBottom: pt(0) },
  calloutStyles, paragraphStyles, tableStyle, captionStyle, header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region data: the burette readings, which Table 1 and the curve of Figure 1 are computed from
const READINGS = [[0.00, 21.30], [0.40, 21.25], [1.10, 22.00], [0.25, 21.10]]; // cm³: synthetic
const titres = READINGS.map(([from, to]) => to - from); // the first is the rough titration
const fair = titres.slice(1);
const mean = fair.reduce((a, b) => a + b) / fair.length; // 20.87 cm³
const sd = Math.sqrt(fair.reduce((s, v) => s + (v - mean) ** 2, 0) / (fair.length - 1)); // 0.03
const num = (x) => x.toFixed(2).replace('.', t({ es: ',', en: '.' })); // the decimal comma
const cell = (content, align = 'right') => ({ content, align }); // figures set right
const label = (es, en) => cell(t({ es, en }), 'left');
// A summary row: its label set right, against its value, and two cells for the merge to cover.
const total = (es, en, x) => [cell(t({ es, en })), cell(''), cell(''), cell(num(x))];
const rows = [heads.map((head, i) => ({ ...cell(head, i ? 'right' : 'left'), isHeader: true })),
  ...READINGS.map(([from, to], i) => [i ? cell(String(i), 'left') : label('Orientativa', 'Rough'),
    cell(num(from)), cell(num(to)), cell(num(titres[i]))]),
  total('Media de 1–3', 'Mean of 1–3', mean), total('Desviación típica', 'Standard deviation', sd)];
// The last two labels span the first three columns. The cells a merge covers stay in the
// row, marked hiddenBy, which mergeCells writes (gotcha: merged-cells-hiddenby).
const table = [rows.length - 2, rows.length - 1].reduce((model, row) => mergeCells(model,
  { start: { row, col: 0 }, end: { row, col: 2 } }), { headerRowCount: 1, rows,
  columnWidths: [1.8, 1, 1, 1.15] }); // relative: the first column holds the longest labels
// #endregion

// #region art: the burette, the pH model of the curve and its drawing, labels set by MathJax
// The curve's model: the charge balance of acetic acid and NaOH, solved for [H⁺] by bisection;
// its 'readings' are the model at each volume plus a seeded ±0.02 of noise.
function pH(v) {
  const [CB, VA, KA] = [0.100, 25.0, 1.75e-5]; // NaOH mol/dm³, the aliquot in cm³, acid's Ka
  const [a, b] = [(CB * mean) / (VA + v), (CB * v) / (VA + v)]; // acid and Na⁺, mol/dm³
  let [lo, hi] = [0, 14];
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const h = 10 ** -mid;
    if (h + b - 1e-14 / h - (a * KA) / (KA + h) > 0) lo = mid; else hi = mid; // + : too acid
  }
  return (lo + hi) / 2;
}
let seed = 28; // Mulberry32: the same noise on every run
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}
const VOLUMES = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 18.5, 19, 19.5, 20, 20.5, 21, 21.5, 22,
  22.5, 23, 23.5, 24, 26, 28, 30]; // cm³: every 2, and every 0.5 from 18 to 24
const measured = VOLUMES.map((v) => [v, Math.round((pH(v) + (rand() - 0.5) * 0.04) * 100) / 100]);
const R = (x) => Math.round(x * 100) / 100;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`; // in mm, 10 px to the mm
const line = (x1, y1, x2, y2, color, width, extra = '') => `<line x1="${R(x1)}" y1="${R(y1)}" `
  + `x2="${R(x2)}" y2="${R(y2)}" stroke="${palette[color]}" stroke-width="${width}" ${extra}/>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${R(x)}" cy="${R(y)}" r="${r}" `
  + `fill="${fill}" ${extra}/>`;
// An SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts): the labels are
// MathJax paths, vector in the PDF like the formulas in the text. renderMath needs
// initMathEngine() resolved: called before, it returns no paths and the labels go missing.
function tex(markup, x, y, size, anchor = 0, color = 'muted') { // anchor 0 left, .5 mid, 1 right
  const r = renderMath(markup, false, 100); // paths in MathJax units, 1000 to the em
  const k = size / 1000;
  return `<g transform="translate(${R(x - anchor * r.viewBox.width * k)} ${R(y)}) scale(${k})" `
    + `fill="${palette[color]}">${r.paths.map((p) => `<path d="${p.d}"/>`).join('')}</g>`;
}
function burette() { // 34 mm × BAND: stand, clamp, burette, stopcock, a drop, the flask
  const [cx, rod, foot] = [14, 30, BAND - 3]; // tube axis, stand rod, top of the base plate
  const stroke = `stroke="${palette.slate}" stroke-width="0.45"`;
  let out = `<rect x="0" y="${foot}" width="34" height="3" fill="${palette.slate}"/>`
    + `<rect x="${rod - 0.6}" y="0" width="1.2" height="${foot}" fill="${palette.slate}"/>`
    + `<rect x="${cx + 3.4}" y="39.4" width="${rod - cx - 3.4}" height="1.2" `
    + `fill="${palette.slate}"/><rect x="${cx - 4.2}" y="37.5" width="8.4" height="5" rx="0.8" `
    + `fill="none" ${stroke}/>`
    + `<rect x="${cx - 3.2}" y="-1" width="6.4" height="65" fill="${palette.paper}" ${stroke}/>`
    + `<rect x="${cx - 2.75}" y="14" width="5.5" height="49.6" fill="${palette.rule}"/>`;
  for (let y = 4; y <= 62; y += 2) { // a tick every 2 mm, a long one every 10
    out += line(cx - 3.2, y, cx - (y % 10 ? 1.6 : 0.2), y, 'slate', 0.25);
  }
  out += `<path d="M${cx - 1.5} 64v4l1 8h1l1 -8v-4z" fill="${palette.slate}"/>`
    + `<rect x="${cx - 6}" y="65.3" width="12" height="2.4" rx="1.2" fill="${palette.slate}"/>`
    + `<path d="M${cx} 78q1.4 2.2 0 3.4q-1.4 -1.2 0 -3.4z" fill="${palette.slate}"/>`;
  // The flask: a neck, then a cone down to the plate, pale pink below the LEVEL line (the
  // end point), with the deep pink a drop makes where it lands, before swirling clears it.
  const [NECK, SHOULDER, LEVEL, R_NECK, R_BASE] = [84, 88.5, 92.5, 3.6, 13.2];
  const base = `L${cx - R_BASE} ${foot - 1.4}q-.7 1.4 .9 1.4h${2 * R_BASE - 1.8}q1.6 0 .9 -1.4`;
  const r = R_NECK + ((LEVEL - SHOULDER) / (foot - 1.4 - SHOULDER)) * (R_BASE - R_NECK);
  const glass = `M${cx - R_NECK} ${NECK}V${SHOULDER}${base}L${cx + R_NECK} ${SHOULDER}V${NECK}`;
  const pink = (d, alpha) => `<path d="${d}" fill="${palette.phenol}" fill-opacity="${alpha}"/>`;
  const bell = (w, h) => `M${cx - w / 2} ${LEVEL}h${w}q-.1 ${R(h * 0.8)} ${-w / 2} ${h}`
    + `q${0.1 - w / 2} ${R(-h * 0.2)} ${-w / 2} ${-h}z`; // a cloud hanging from the surface
  return svg(34, BAND, out + `<path d="${glass}z" fill="${palette.paper}"/>`
    + pink(`M${R(cx - r)} ${LEVEL}${base}L${R(cx + r)} ${LEVEL}z`, 0.35) // a shade over the band
    + pink(bell(10, 6), 0.5) + pink(bell(5, 4), 1) + `<path d="${glass}" fill="none" ${stroke}/>`);
}
const BURETTE = { id: 'burette', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'burette.svg', width: 34 * 10, height: BAND * 10 },
  altText: t({ es: 'Una bureta gotea sobre un erlenmeyer de líquido rosa pálido.',
    en: 'A burette drips into a conical flask of pale pink liquid.' }) };
function curve() { // MEASURE × 92 mm: pH 2–13 against 0–30 cm³
  const [x0, y0, w, h] = [12, 4, MEASURE - 16, 74];
  const X = (v) => x0 + (v / 30) * w;
  const Y = (p) => y0 + h - ((p - 2) / 11) * h;
  const half = mean / 2;
  const [p10, p12] = [10, 12].map((v) => measured.find(([x]) => x === v)[1]);
  const pka = p10 + ((p12 - p10) * (half - 10)) / 2; // read at half the equivalence volume
  let out = `<rect x="${x0}" y="${R(Y(10))}" width="${w}" height="${R(Y(8.2) - Y(10))}" `
    + `fill="${palette.blush}"/>`;
  for (let p = 2; p <= 13; p += 1) {
    out += line(x0, Y(p), x0 + w, Y(p), 'rule', p % 2 ? 0.12 : 0.25);
    if (p % 2 === 0) out += tex(String(p), x0 - 2, Y(p) + 1.2, 3.4, 1);
  }
  for (let v = 0; v <= 30; v += 5) {
    out += line(X(v), y0 + h, X(v), y0 + h + 1.2, 'muted', 0.25)
      + tex(String(v), X(v), y0 + h + 5.2, 3.4, 0.5);
  }
  out += line(x0, y0 + h, x0 + w, y0 + h, 'muted', 0.35);
  const model = Array.from({ length: 301 }, (_, i) => [X(i / 10), Y(pH(i / 10))]);
  out += `<path d="${model.map(([x, y], i) => `${i ? 'L' : 'M'}${R(x)} ${R(y)}`).join('')}" `
    + `fill="none" stroke="${palette.ink}" stroke-width="0.45"/>`;
  out += line(X(half), Y(2), X(half), Y(pka), 'slate', 0.3, 'stroke-dasharray="1 0.8"')
    + line(x0, Y(pka), X(half), Y(pka), 'slate', 0.3, 'stroke-dasharray="1 0.8"')
    + tex('\\mathrm{p}K_\\mathrm{a}', x0 + 1.5, Y(pka) - 1.6, 3.6, 0, 'slate');
  out += measured.map(([v, p]) => dot(X(v), Y(p), 0.75, palette.phenol)).join('');
  out += dot(X(mean), Y(pH(mean)), 2.2, 'none', `stroke="${palette.phenol}" stroke-width="0.4"`)
    + tex(t({ es: '\\text{equivalencia}', en: '\\text{equivalence}' }), X(mean) + 3.2,
      Y(pH(mean)) + 1, 3.4, 0, 'phenol');
  return svg(MEASURE, 92, out + tex('\\mathrm{pH}', x0 - 2, y0 - 1, 3.8, 1, 'ink')
    + tex('V_\\mathrm{NaOH}\\,/\\,\\mathrm{cm^3}', x0 + w, y0 + h + 11, 3.8, 1, 'ink'));
}
// #endregion

const resources = [BURETTE, // the head's picture: uncited, so never placed in the text
  { id: 'lecturas', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: table },
    placement: { position: 'here' }, // set where ::resource{id="lecturas"} stands
    caption: t({ es: `Lecturas de la bureta: 25,0 ${units.cm3} de vinagre diluido frente a NaOH `
      + `0,100 ${units.conc}.`, en: `Burette readings, titrating 25.0 ${units.cm3} of diluted `
      + `vinegar with 0.100 ${units.conc} NaOH.` }), // one line: at two, the English one broke
    // between 'dm' and its '−3' (gotcha: ragged-run-punctuation)
    note: t({ es: `Lecturas sintéticas, con la apreciación de la bureta: 0,05 ${units.cm3}.`,
      en: `Synthetic readings, taken to the nearest 0.05 ${units.cm3}, as a burette is read.` }) },
  { id: 'curva', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'curve.svg', width: MEASURE * 10, height: 92 * 10 }, // 10 px to the mm
    caption: t({ es: `Curva de valoración de 25,0 ${units.cm3} de vinagre diluido con NaOH `
      + `0,100 ${units.conc}: lecturas del pH-metro (puntos) y el cálculo con *K*~a~ = `
      + `1,75 × 10^−5^ (línea). La banda rosa es el viraje de la fenolftaleína, de pH 8,2 a 10,0.`,
    en: `Titration curve of 25.0 ${units.cm3} of diluted vinegar with 0.100 ${units.conc} NaOH: `
      + `pH meter readings (dots) and the model with *K*~a~ = 1.75 × 10^−5^ (line). The pink band `
      + 'is the range over which phenolphthalein turns, pH 8.2 to 10.0.' }),
    note: t({ es: 'Lecturas sintéticas.', en: 'Synthetic readings.' }),
    altText: t({ es: 'El pH sube despacio hasta unos 18 cm³ y salta de 6 a 11 cerca de 21 cm³.',
      en: 'The pH rises slowly to about 18 cm³, then leaps from 6 to 11 near 21 cm³.' }) },
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages paint, loaded before the first build (gotcha: fonts-first)
  'Inria Serif': ['400', '400i', '700'],
  'Inria Sans': ['400', '400i', '700'], // 400i: the K of K~a~ in Figure 1's caption
  'Sometype Mono': ['400', '500', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('burette.svg', burette()); // for the canvas, and kept as bytes for the PDF
await loadSvg('curve.svg', curve());
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ es: 'Informe de laboratorio', en: 'Lab report' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // text in the Fontsource faces; formulas and figures as vector paths

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
