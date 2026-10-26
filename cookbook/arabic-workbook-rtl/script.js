// ═══ Postext Cookbook · Nº 173 · An Arabic workbook, right to left ═══════════════
// https://postext.dev/en/cookbook/arabic-workbook-rtl
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Noto Naskh Arabic, Baloo Bhaijaan 2 (SIL OFL 1.1) · Needs postext ≥ 1.63.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'ar'; // @lang: the language of the frame; the workbook is Arabic in all
const RECIPE = 'arabic-workbook-rtl';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a garden workbook: ink, a terracotta accent, a leaf green, sand
const palette = {
  ink: '#22282e', // text
  accent: '#b9542a', // the one accent: exercise numbers, the unit tab, the word bank
  leaf: '#4f7d3a', // the second: rules and the word search's ruling
  sand: '#f8eedf', // the bank's ground, the answers box
  rule: '#c8b49b', // writing lines
  muted: '#6f655c', // folios, the name line, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
// Naskh for the text, a rounded Arabic for the labels a child reads first.
const [TEXT, LABEL] = ['Noto Naskh Arabic', 'Baloo Bhaijaan 2'];

// #region answer: one exercise style read right to left, in the edition's digits
// The locale sets the direction, the binding and the digits: 'ar' writes the exercise
// numbers, the items and the key in Arabic-Indic digits (١ ٢ ٣), 'ar-MA' in European ones.
// Options take the abjad letters (أ ب ج), true/false the words صح / خطأ, both from the
// language. Nothing below names a side: the engine sets every part from the right.
const tamrin = {
  id: 'tamrin',
  number: { shape: 'disc', fontFamily: LABEL, background: col('accent') },
  instruction: { fontFamily: LABEL, bold: false, color: col('ink') },
  options: { layout: 'row' }, // أ) ب) ج) side by side, three to a row (columns=3)
  blank: { look: 'dots', color: col('muted') }, // a dotted line, as Arab workbooks print it
  match: { color: col('accent') },
  bank: { box: 'sunduq', order: 'shuffle' },
  area: { kind: 'lines', color: col('rule') },
  grid: { fontFamily: TEXT, rule: col('leaf'), uppercase: false }, // Arabic has no capitals
  answers: { color: col('leaf'), fontFamily: TEXT },
  solutions: { box: 'hulul' },
  marginTop: em(1.1), marginBottom: em(0.5),
};
// The solutions where :::solutions stands: at the end of the unit.
const exercises = { solutions: { placement: 'directive' } };
// #endregion


// #region opener: the garden to the bleed, the unit's tab and its title under it
const BAND = 170 / 2.4; // mm: the painting's height at the page's width
const opener = { enabled: true, minHeight: mm(BAND - 20 + 21), slot: { elements: [
  { kind: 'image', id: 'picture', resourceId: '{attr.pic}', decorative: true, reserve: false,
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: mm(170), height: mm(BAND) } } },
  // In the flow of a right-to-left page 'left' is the start of the line: the right.
  { kind: 'text', id: 'unit', content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(11),
    fontWeight: 700, color: col('paper'), align: 'left',
    box: { backgroundColor: col('accent'), borderRadius: mm(1.5),
      padding: { top: mm(0.6), bottom: mm(0.4), left: mm(2.4), right: mm(2.4) } },
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(0), y: mm(BAND - 20 + 3) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: LABEL, fontSize: pt(30),
    fontWeight: 700, color: col('ink'), align: 'left',
    placement: { anchor: { to: '#unit', edge: 'right-of' }, offset: { x: mm(4), y: mm(-5) } } },
] } };
// #endregion

// Folios at the foot's outer corner: running heads stay physical, so each side is named.
const foot = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: LABEL, fontSize: pt(9), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-11) } }, ...extra });
const footer = { elements: [
  foot('folio-v', '{pageNumber}', 'even', 'bottom-left', 16,
    { fontWeight: 700, color: col('accent') }),
  foot('title-v', '{title}', 'even', 'bottom-left', 24),
  foot('folio-r', '{pageNumber}', 'odd', 'bottom-right', -16,
    { fontWeight: 700, color: col('accent'), align: 'right' }),
  foot('title-r', '{chapterTitle}', 'odd', 'bottom-right', -24, { align: 'right' }),
] };

let edition = {}; // what the second build below changes: the Maghreb edition's locale
const config = () => ({
  locale: 'ar', // the Mashriq edition: ١ ٢ ٣
  colorPalette,
  exerciseStyles: [tamrin],
  exercises,
  page: { sizePreset: 'custom', width: mm(170), height: mm(240), dpi: 150,
    margins: { top: mm(20), bottom: mm(20), left: mm(18), right: mm(16), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(13), lineHeight: pt(22), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false },
    avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: LABEL, color: col('ink'), fontWeight: 700,
    balancing: { enabled: false },
    levels: [{ level: 1, fontSize: pt(30), breakBefore: { parity: 'any' },
      advancedDesign: opener }] },
  orderedLists: { numberFormat: 'arabic', color: col('ink'), fontWeight: 700 },
  paragraphStyles: [
    { id: 'ism', fontFamily: LABEL, fontSize: pt(11), color: col('muted'), firstLineIndent: pt(0),
      textAlign: 'left', marginBottom: mm(3) },
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(8), lineHeight: pt(13), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: mm(6) },
  ],
  chipStyles: [{ id: 'khatt', backgroundEnabled: false, underline: 'dotted', borderWidth: pt(1),
    borderColor: col('muted'), minWidth: mm(26), paddingX: pt(0), paddingY: pt(0) }],
  calloutStyles: [
    { id: 'sunduq', background: col('sand'), border: { enabled: true, color: col('accent'),
      width: pt(1), style: 'dashed' }, borderRadius: mm(2.5),
    padding: { top: mm(2), right: mm(4), bottom: mm(2.5), left: mm(4) },
    body: { fontFamily: LABEL, fontSize: pt(12), textAlign: 'center' },
    marginTop: mm(1.5), marginBottom: mm(2.5) },
    { id: 'hulul', background: col('sand'), borderRadius: mm(2),
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('leaf') },
      padding: { top: mm(3), right: mm(4), bottom: mm(3.5), left: mm(4) },
      titleStyle: { fontFamily: LABEL, fontSize: pt(13), fontWeight: 700, color: col('leaf') },
      body: { fontSize: pt(11), lineHeight: pt(19), color: col('ink'), firstLineIndent: pt(0) },
      marginTop: mm(6), marginBottom: mm(2), keepTogether: false },
  ],
  header: { elements: [] },
  footer,
  ...edition,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.ar.md: one text for both editions

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Naskh Arabic': ['400', '700'], // the text, the word search's letters
  'Baloo Bhaijaan 2': ['400', '700'], // instructions, numbers, the title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
await loadImage('garden-1600.jpg', asset('garden-1600.jpg'));
const resources = [{ id: 'garden', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'garden-1600.jpg', format: 'jpeg', width: 1600, height: 667 } }];
// #region editions: one text, two editions: Mashriq digits, then Maghreb digits
// Both are bound on the right and read from the right; only the locale changes.
const build = () => withLoadedFonts(() => buildDocument({ markdown, resources }, config()),
  { ...kitFonts(FONTS), text: markdown });
const mashriq = await build();
edition = { locale: 'ar-MA' }; // the same book for Morocco: European digits, still right to left
const docs = [mashriq, await build()];
// #endregion
showBook(docs, { title: t({ ar: 'كراسة تمارين عربية', en: 'An Arabic workbook, right to left',
  es: 'Un cuaderno de ejercicios árabe, de derecha a izquierda' }) });
offerPdf(() => renderToPdf(docs, { fontProvider: arabicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images arabic book
