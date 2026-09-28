// ═══ Postext Cookbook · Nº 072 · A textbook index that follows the text ═══════════════
// https://postext.dev/en/cookbook/back-of-book-index
// Code: MIT · Text: original (CC BY 4.0) · Drawing: generated in code (CC BY 4.0)
// Fonts: Literata, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.7.0
// Two chapters of a physiology textbook and the index that closes them, laid out by
// buildBundle as one book: the terms are marked where the text discusses them, and the
// index chapter prints them with the pages they land on.
import {
  buildBundle, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'back-of-book-index';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these ids
  ink: '#1f1a1c', // text: a warm near-black
  accent: '#9e1b32', // the one accent (7.4:1 on paper): bands, letter heads, numbers, labels
  tint: '#f7ebe9', // the loop in Figure 14.1
  rule: '#d9c6c3', // hairlines
  muted: '#6b5f61', // running heads, notes, the colophon
  paper: '#ffffff', // type on the bands
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// A textbook trim, mirrored, in mm. The body is a column and a half: text in the main column,
// figures' captions and clinical notes in the outer channel.
const TRIM = { width: 210, height: 277 };
const MARGIN = { top: 24, bottom: 22, inner: 20, outer: 14 };
const LEAD = 13.6; // body leading in pt: the baseline grid
const [SERIF, SANS] = ['Literata', 'Libre Franklin'];
const [BAND, INDEX_BAND] = [62, 46]; // mm from the trim to the foot of the opener bands
const HEAD_Y = 13; // mm from the top trim to the running heads
const at = (to, edge, x, y) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(1.3),
  textTransform: 'uppercase' };

// #region answer: marks in the chapters, and an index chapter set in two columns
// The chapters mark each term where the text discusses it:
//   the :index[stroke volume]{main}         prints the words, files them, bold page
//   mitral:index{term="heart!valves!mitral"} prints nothing, files the word before it
//   ## Venous return :index{term="venous return" range="start" main}  … range="end"
//   :index{term="inotropy" see="contractility"}      a cross-reference, no page
// The last chapter is `# Index {style="index"}` and `:::index`. buildBundle hands it every
// chapter's marks with the pages they landed on, and lays the book out again until those
// pages stop moving.
const indexStyle = {
  id: 'index', numbered: false, toc: false, // not counted: no chapter 16
  layout: { layoutType: 'double', gutterWidth: mm(6) }, // two columns in this section only
  advancedDesign: opener(INDEX_BAND), // the chapters' band, shallower and with no number
  header: runningHeads(t({ en: 'Index', es: 'Índice analítico' })),
};
const index = {
  fontFamily: SERIF, fontSize: pt(8.6), lineHeight: pt(11.4),
  indent: em(1), turnoverIndent: em(2), // sub-entries step in 1 em; wrapped lines hang 2 em
  // English: Chicago's short ranges (301–3; 298–300 keeps the digit that changes). Spanish
  // writes both numbers in full and joins them with a hyphen (301-303).
  rangeFormat: t({ en: 'chicago', es: 'full' }), rangeSeparator: t({ en: '–', es: '-' }),
  main: { bold: true }, // the defining page in bold
  see: { italic: true }, // See / See also, Véase / Véase también by the document's locale
  groups: { ...label, fontSize: pt(9.5), letterSpacing: pt(0), color: col('accent') },
};
// #endregion

// #region opener: a band across the top of the page: kicker, title and lead from the heading
function opener(band = BAND, kicker = '') {
  const onBand = { color: col('paper'), align: 'left', overflow: 'wrap' }; // wrap: never '…'
  const inBand = band - MARGIN.top - 8; // the title's box: it stands on a line 8 mm above the foot
  return { enabled: true, minHeight: mm(inBand + 8 + 31), slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
      placement: { ...at('bleed', 'top-left', 0, 0), size: { height: mm(band) } } },
    { kind: 'text', id: 'kicker', content: kicker, ...label, ...onBand, fontSize: pt(8.5),
      placement: at('container', 'top-left', 0, -6) },
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: SANS,
      fontWeight: 800, fontSize: pt(30), lineHeight: 1.05, // a multiple, never pt()
      verticalAlign: 'bottom', // one line or two, the title sits on the same line
      placement: { ...at('container', 'top-left', 0, 0),
        size: { width: mm(170), height: mm(inBand) } } },
    { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: SERIF, italic: true,
      fontSize: pt(10.5), lineHeight: 1.4, color: col('ink'), align: 'left', overflow: 'wrap',
      inlineMarks: true, // *See* in the index's lead
      placement: { ...at('container', 'top-left', 0, inBand + 15),
        size: { width: mm(118) } } },
  ] } };
}
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
function runningHeads(recto) {
  const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
    parity, pages: 'body', ...label, fontWeight: 600, color: col('muted'), // never on openers
    placement: at('page', edge, x, HEAD_Y), ...extra });
  const folio = { fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(0), color: col('accent') };
  const { outer } = MARGIN;
  return { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', outer, folio),
    head('verso-title', '{title}', 'even', 'top-left', outer + 10),
    head('recto-title', recto, 'odd', 'top-right', -(outer + 10)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -outer, folio),
  ] };
}
const header = runningHeads(t({ en: 'Chapter {chapterNumber} · {chapterTitle}',
  es: 'Capítulo {chapterNumber} · {chapterTitle}' }));
// Openers carry a drop folio at the foot, on the outer edge.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  pages: 'opener', ...label, fontSize: pt(8.5), color: col('accent'), align: 'right',
  placement: { ...at('page', 'bottom-right', -MARGIN.outer, -12) } }] };
// #endregion

const note = { fontFamily: SANS, fontSize: pt(8), lineHeight: pt(11.3), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0) };
const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-gb', es: 'es' }), // hyphenation and the index's sort order
  // Figura and Tabla in Spanish (gotcha: resource-types-locale); captions stand in the channel.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type,
    defaultPlacement: { captionSide: true } })),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    pageNumbering: { startAt: 297 }, // this part of the book opens on page 297
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 28, sideColumnRole: 'floats',
    sideColumnSide: 'outer', gutterWidth: mm(7) }, // main column 119.7 mm, channel 49.3 mm
  bodyText: { fontFamily: SERIF, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 700, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' }, marginBottom: pt(0),
      numberingTemplate: '{1}', advancedDesign: opener(BAND,
        t({ en: 'Chapter {chapterNumber}', es: 'Capítulo {chapterNumber}' })) },
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD * 1.5), numberingTemplate: '{1}.{2}',
      color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  headingStyles: [indexStyle],
  index,
  paragraphStyles: [{ id: 'formula', textAlign: 'center', firstLineIndent: pt(0), italic: true,
    marginTop: pt(LEAD * 0.5), marginBottom: pt(LEAD * 0.5) }],
  calloutStyles: [
    { id: 'clinical', span: 'side', backgroundEnabled: false,
      padding: { top: mm(2.4), right: pt(0), bottom: pt(0), left: pt(0) },
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
      titleStyle: { ...label, color: col('accent'), gap: mm(1.6) }, body: note,
      marginTop: pt(0), marginBottom: pt(LEAD) },
    { id: 'colophon', span: 'page', placement: 'bottom', backgroundEnabled: false,
      padding: { top: mm(2), right: pt(0), bottom: pt(0), left: pt(0) },
      stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
      body: { ...note, fontSize: pt(7), lineHeight: pt(9.5), color: col('muted') } },
  ],
  captionStyle: { fontFamily: SANS, fontSize: pt(7.8), labelColor: col('accent'), gap: mm(2) },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: SANS,
    bodyFontFamily: SANS, bodyFontSize: pt(8.2), bodyColor: col('ink'), cellPadding: mm(1.4) },
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const heart = /* @content */ ''; // chapter 14, with the book's frontmatter (content.<lang>.md)
const vessels = /* @content:vessels */ ''; // chapter 15 (content.vessels.<lang>.md)
const indexChapter = /* @content:index */ ''; // # Index and :::index (content.index.<lang>.md)
const chapters = [heart, vessels, indexChapter].map((markdown) => ({ markdown }));

// #region art: the pressure–volume loop of Figure 14.1, drawn in code
// No text in the drawing: an SVG image cannot use the page's web fonts (gotcha: svg-no-webfonts).
const PX = 10; // SVG pixels per unit
const [W, H] = [100, 52];
const vx = (volume) => 12 + volume * 0.56; // 0–150 mL across
const py = (pressure) => 47 - pressure * 0.3; // 0–140 mmHg up
const pv = (v, p) => `${vx(v).toFixed(1)} ${py(p).toFixed(1)}`;
function pvLoop() {
  const stroke = (id, w, extra = '') => `fill="none" stroke="${palette[id]}" stroke-width="${w}"
    ${extra}`;
  const loop = `M${pv(50, 6)}Q${pv(88, 2)} ${pv(120, 10)}L${pv(120, 80)}`
    + `C${pv(108, 128)} ${pv(70, 132)} ${pv(50, 100)}Z`;
  const arrow = (x, y, dx, dy) => `<path d="M${x} ${y}l${dx} ${dy}" ${stroke('ink', 0.5)}/>`
    + `<path d="M${x + dx} ${y + dy}${dx ? 'l-2.6 -1.2v2.4z' : 'l-1.2 2.6h2.4z'}"`
    + ` fill="${palette.ink}"/>`;
  const guide = (v, p) => `<path d="M${pv(v, p)}V${py(0)}" ${stroke('muted', 0.35,
    'stroke-dasharray="1.2 1"')}/>`;
  const dot = (v, p) => `<circle cx="${vx(v)}" cy="${py(p)}" r="1.5" fill="${palette.ink}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX}" height="${H * PX}" `
    + `viewBox="0 0 ${W} ${H}"><path d="${loop}" fill="${palette.tint}"/>`
    + `<path d="M${pv(10, 0)}L${pv(62, 130)}" `
    + `${stroke('muted', 0.45, 'stroke-dasharray="2 1.4"')}/>`
    + guide(50, 6) + guide(120, 10)
    + `<path d="${loop}" ${stroke('accent', 1.1, 'stroke-linejoin="round"')}/>`
    + [[50, 6], [120, 10], [120, 80], [50, 100]].map(([v, p]) => dot(v, p)).join('')
    + arrow(vx(0), py(0), W - 16, 0) + arrow(vx(0), py(0), 0, -(py(0) - 3)) + '</svg>';
}
// #endregion

const TABLE = t({
  en: [['Segment', 'Blood volume (%)', 'Mean pressure (mmHg)'],
    ['Arteries', '13', '100 to 85'], ['Arterioles', '7', '85 to 35'],
    ['Capillaries', '', '35 to 15'],
    ['Venules and veins', '64', '15 to 0'], ['Heart', '7', '–'],
    ['Pulmonary circulation', '9', '15 to 8']],
  es: [['Segmento', 'Volumen de sangre (%)', 'Presión media (mmHg)'],
    ['Arterias', '13', '100 a 85'], ['Arteriolas', '7', '85 a 35'], ['Capilares', '', '35 a 15'],
    ['Vénulas y venas', '64', '15 a 0'], ['Corazón', '7', '–'],
    ['Circulación pulmonar', '9', '15 a 8']],
});
// Arterioles and capillaries share one volume cell: the cell under a rowSpan stays in the row,
// marked hiddenBy (gotcha: merged-cells-hiddenby).
const rows = TABLE.map((row, r) => row.map((content, c) => ({ content,
  ...(r === 0 && { isHeader: true }), ...(r === 2 && c === 1 && { rowSpan: 2 }),
  ...(r === 3 && c === 1 && { hiddenBy: { row: 2, col: 1 } }) })));
const resources = [
  { id: 'pv-loop', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'pv-loop.svg', width: W * PX, height: H * PX },
    caption: t({
      en: 'Pressure–volume loop of the left ventricle at rest: volume from 0 to 150 mL across, '
        + 'pressure from 0 to 140 mmHg up. The dots, anticlockwise from bottom right: mitral '
        + 'valve closes (120 mL), aortic valve opens (80 mmHg), aortic valve closes, mitral '
        + 'valve opens (50 mL). Dashed: the end-systolic pressure–volume relation.',
      es: 'Bucle presión-volumen del ventrículo izquierdo en reposo: volumen de 0 a 150 mL en '
        + 'horizontal, presión de 0 a 140 mmHg en vertical. Los puntos, en sentido antihorario '
        + 'desde abajo a la derecha: cierre de la válvula mitral (120 mL), apertura de la aórtica '
        + '(80 mmHg), cierre de la aórtica y apertura de la mitral (50 mL). A trazos, la relación '
        + 'presión-volumen telesistólica.' }),
    altText: t({ en: 'A closed loop of ventricular pressure against volume.',
      es: 'Un bucle cerrado de presión ventricular frente a volumen.' }) },
  { id: 'pressures', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    caption: t({ en: 'Blood volume and mean pressure along the circulation of a resting adult.',
      es: 'Volumen de sangre y presión media a lo largo de la circulación de un adulto en '
        + 'reposo.' }),
    table: { model: { headerRowCount: 1, columnWidths: [2.2, 1.4, 1.6], rows } } },
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = {
  Literata: ['400', '400i', '700', '700i'],
  'Libre Franklin': ['400', '600', '700', '800'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: one book of three documents; one PDF whose index numbers are links
const text = chapters.map((chapter) => chapter.markdown).join('\n');
await loadFonts(FONTS, text);
await loadSvg('pv-loop.svg', pvLoop());
const docs = await buildWithFonts(() => buildBundle({ chapters, config: config(), resources }),
  text);
showPages(docs, { title: t({ en: 'Principles of Human Physiology',
  es: 'Principios de fisiología humana' }) });
offerPdf(() => renderToPdf(docs, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
