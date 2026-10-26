// ═══ Postext Cookbook · Nº 168 · Primary workbook unit of activities ═══════════
// https://postext.dev/en/cookbook/primary-workbook-activities
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Atkinson Hyperlegible Next, Grandstander (SIL OFL 1.1) · Needs postext ≥ 1.59.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'primary-workbook-activities';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one unit colour (green for this unit), a pale tint of it, a sun yellow
const palette = {
  ink: '#1f2b27', // text: a green-tinted near-black
  unit: '#2b7a3d', // the unit's colour: discs, band, folio, dots to join
  deep: '#1d5a2b', // the bank's words and the kicker on white
  tint: '#e6f2e2', // the reminder box, the bank
  sun: '#f2b330', // the reminder's stripe
  rule: '#9cc3a2', // writing lines, the squared paper
  muted: '#5c6b64', // running heads, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'unit (defaults)', value: { hex: palette.unit, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY] = ['Atkinson Hyperlegible Next', 'Grandstander'];

// #region answer: the workbook's activity style, one for every kind of exercise
// The Markdown says what each activity asks (:::exercise, [[answers]], - A -> B, - [x]);
// this style says how a Spanish workbook prints it: the number in a disc of the unit
// colour, the instruction in bold, blanks on a line, V/F boxes at the line's end, dots to
// join, the bank in a tinted box, squared paper for writing and the activity icons.
const icon = (id, alt) => ({ resourceId: `icon-${id}`, alt });
const actividad = {
  id: 'actividad',
  number: { shape: 'disc', background: col('unit'), color: col('paper'),
    fontFamily: DISPLAY, fontSize: em(1.05), fontWeight: 800 },
  instruction: { bold: true, color: col('ink') },
  options: { marker: 'circle' },
  blank: { look: 'line', color: col('ink'), weight: pt(0.75), extra: em(2) },
  trueFalse: { look: 'boxes' }, // V F in Spanish, T F in English: the language's own words
  match: { look: 'dots', gap: em(7), dotSize: em(0.42), color: col('unit') },
  bank: { box: 'banco', order: 'alpha', separator: ' ' },
  area: { kind: 'lines', spacing: mm(9), color: col('rule'), weight: pt(0.6) },
  grid: { cell: mm(9.5), fontFamily: DISPLAY, fontSize: pt(13), rule: col('rule'),
    color: col('ink') },
  icons: {
    escribe: icon('write', t({ es: 'Escribe', en: 'Write' })),
    oral: icon('oral', t({ es: 'Actividad oral', en: 'Speaking' })),
    pareja: icon('pair', t({ es: 'En pareja', en: 'In pairs' })),
  },
  marginTop: mm(7), marginBottom: mm(2), itemSpacing: em(0.8),
};
// The same activity written on squared paper (cuadrícula): `style="cuadricula"`.
const cuadricula = { id: 'cuadricula', extends: 'actividad',
  area: { kind: 'grid', spacing: mm(5), weight: pt(0.4) } };
// #endregion

// #region opener: the unit band in the unit colour, the painting under it
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const PIC = 75; // mm: the painting's height (it is 176 × 75 mm, 2.35:1)
const opener = { enabled: true, minHeight: mm(20 + PIC + 4), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('unit'), borderRadius: mm(4) },
    placement: at('container', 'top-left', 0, 0, { width: mm(176), height: mm(18) }) },
  { kind: 'text', id: 'unit', content: '{attr.unidad}', fontFamily: DISPLAY, fontSize: pt(11),
    fontWeight: 800, color: col('unit'), align: 'center', verticalAlign: 'middle',
    textTransform: 'uppercase', letterSpacing: pt(1.4), lineHeight: 1.1,
    box: { backgroundColor: col('paper'), borderRadius: mm(4) },
    placement: at('container', 'top-left', 4, 4, { width: mm(30), height: mm(10) }) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(27),
    fontWeight: 800, color: col('paper'), align: 'left', lineHeight: 1,
    placement: at('container', 'top-left', 40, 4.4, { width: mm(132) }) },
  { kind: 'image', id: 'picture', resourceId: '{attr.pic}', decorative: true,
    placement: at('container', 'top-left', 0, 22, { width: mm(176), height: mm(PIC) }) },
] } };
// #endregion

// Running heads outside: subject and unit at the head, a folio disc and the book at the foot.
const label = (id, content, parity, edge, x, y, extra = {}) => ({ kind: 'text', id, content,
  parity, fontFamily: TEXT, fontSize: pt(7.5), fontWeight: 700, color: col('muted'),
  textTransform: 'uppercase', letterSpacing: pt(1.2), placement: at('page', edge, x, y),
  ...extra });
const folio = (parity, edge, side) => label(`folio-${parity}`, '{pageNumber}', parity, edge,
  16 * side, -15, { fontFamily: DISPLAY, fontSize: pt(10), fontWeight: 800, letterSpacing: pt(0),
    textTransform: 'none', color: col('paper'), align: 'center', verticalAlign: 'middle',
    lineHeight: 1.2, box: { backgroundColor: col('unit'), borderRadius: mm(4) },
    placement: { ...at('page', edge, 16 * side, -15), size: { width: mm(8), height: mm(8) } } });
const header = { elements: [
  label('verso', '{title}', 'even', 'top-left', 18, 13, { pages: 'body' }),
  label('recto', '{chapterTitle}', 'odd', 'top-right', -16, 13,
    { pages: 'body', align: 'right', color: col('unit') }),
] };
const footer = { elements: [
  folio('even', 'bottom-left', 1), folio('odd', 'bottom-right', -1),
  label('book-even', '{subtitle}', 'even', 'bottom-left', 27, -13.4),
  label('book-odd', '{subtitle}', 'odd', 'bottom-right', -27, -13.4, { align: 'right' }),
] };

const config = {
  locale: t({ es: 'es', en: 'en-gb' }),
  // The pictures of a workbook carry no caption and no number.
  resourceTypes: [{ id: 'dibujo', name: t({ es: 'Dibujo', en: 'Picture' }), shortLabel: '',
    captionPrefix: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
    defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    margins: { top: mm(22), bottom: mm(24), left: mm(18), right: mm(16), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(17), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    hyphenation: { enabled: false }, // primary readers: whole words on every line
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 800, levels: [
    { level: 1, fontSize: pt(27), breakBefore: { parity: 'any' }, marginTop: pt(0),
      marginBottom: mm(2), advancedDesign: opener },
  ] },
  exerciseStyles: [actividad, cuadricula],
  orderedLists: { numberFormat: 'arabic', color: col('unit'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [
    { id: 'recuerda', background: col('tint'), borderRadius: mm(3),
      stripe: { enabled: true, side: 'left', width: pt(4), color: col('sun') },
      padding: { top: mm(3), right: mm(5), bottom: mm(3.5), left: mm(5) },
      titleStyle: { fontFamily: DISPLAY, fontSize: pt(12), fontWeight: 800, color: col('deep') },
      body: { fontFamily: TEXT, fontSize: pt(11.5), lineHeight: pt(16), color: col('ink'),
        boldColor: col('ink'), firstLineIndent: pt(0) }, marginTop: mm(4), marginBottom: mm(2) },
    { id: 'sabias', background: col('paper'), borderRadius: mm(3),
      border: { enabled: true, color: col('sun'), width: pt(1.5) },
      padding: { top: mm(3), right: mm(5), bottom: mm(3.5), left: mm(5) },
      titleStyle: { fontFamily: DISPLAY, fontSize: pt(12), fontWeight: 800, color: col('deep') },
      body: { fontFamily: TEXT, fontSize: pt(11.5), lineHeight: pt(16), color: col('ink'),
        firstLineIndent: pt(0) }, marginTop: mm(7), marginBottom: mm(2) },
    { id: 'banco', title: '', backgroundEnabled: true, background: col('tint'),
      border: { enabled: true, color: col('unit'), width: pt(1), style: 'dashed' },
      borderRadius: mm(3), padding: { top: mm(2), right: mm(4), bottom: mm(2), left: mm(4) },
      marginTop: mm(1), marginBottom: mm(2), keepTogether: true },
  ],
  paragraphStyles: [{ id: 'colofon', fontFamily: TEXT, fontSize: pt(7.5), lineHeight: pt(10),
    color: col('muted'), firstLineIndent: pt(0), marginTop: mm(5) }],
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region icons: the three activity icons, white pictograms on a disc of the unit colour
const disc = (body) => '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" '
  + `viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${palette.unit}"/>`
  + `<g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" `
  + `stroke-linejoin="round">${body}</g></svg>`;
const ICONS = {
  write: disc('<path d="M7 17l1-4 7.5-7.5 3 3L11 16l-4 1z"/><path d="M14 7l3 3"/>'),
  oral: disc('<path d="M6 7.5h12v7.5H11l-3.5 3v-3H6z"/><path d="M9.5 11.2h.01M12 11.2h.01M14.5'
    + ' 11.2h.01" stroke-width="2.2"/>'),
  pair: disc('<circle cx="9" cy="9" r="2.3"/><circle cx="15.3" cy="9.6" r="2"/>'
    + '<path d="M4.8 17.5c.4-2.8 2.1-4.3 4.2-4.3s3.8 1.5 4.2 4.3M13.6 13.9c.6-.3 1.1-.4 1.7-.4'
    + ' 1.9 0 3.3 1.3 3.7 3.8"/>'),
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Atkinson Hyperlegible Next': ['400', '700'], Grandstander: ['800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const resources = [];
const add = (id, fileId, kind, width, height, more, placement) => resources.push({ id, kind,
  typeId: 'dibujo', createdAt: 0, updatedAt: 0, ...(placement && { placement }),
  [kind]: { fileId, width, height, ...more } });
const picture = (id, file, w, h, width) => loadImage(file, asset(file)).then(() => add(id, file,
  'bitmap', w, h, { format: 'jpeg' }, width && { position: 'here', width, align: 'center' }));
await Promise.all([
  picture('charca', 'charca-1088.jpg', 1088, 463),
  picture('ciclo', 'ciclo-1088.jpg', 1088, 220, 0.9),
  picture('nina', 'nina-720.jpg', 720, 720, 0.3),
  ...Object.entries(ICONS).map(async ([id, svg]) => {
    await loadSvg(`icon-${id}.svg`, svg);
    add(`icon-${id}`, `icon-${id}.svg`, 'svg', 240, 240);
  }),
]);
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ es: 'Cuaderno de actividades', en: 'Activity book' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}-${LANG}.pdf`);

// @kit core fonts viewer pdf images
