// ═══ Postext Cookbook · Nº 169 · One worksheet in ten school traditions ═════════
// https://postext.dev/en/cookbook/school-traditions-worksheet
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Nunito, Baloo 2, Klee One, Noto Naskh Arabic and others (SIL OFL) · Needs postext ≥ 1.63.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the worksheet (en es ca fr de it pt zh ja ar)
const RECIPE = 'school-traditions-worksheet';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a blue-black ink, one blue accent, a pale tint, grey rules
const palette = {
  ink: '#1d2633', accent: '#2a5d9f', tint: '#e8f0fa', rule: '#a9b6c6', muted: '#5d6878',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region faces: Latin editions share two faces; Chinese, Japanese and Arabic their own
const FACES = {
  zh: { text: 'Noto Serif SC', label: 'Noto Sans SC' },
  ja: { text: 'Klee One', label: 'Noto Sans JP' },
  ar: { text: 'Noto Naskh Arabic', label: 'Baloo Bhaijaan 2' },
}[LANG] ?? { text: 'Nunito', label: 'Baloo 2' };
const [TEXT, LABEL] = [FACES.text, FACES.label];
// #endregion

// #region answer: the form of the exercises, as each country's school books set them
// The Markdown of every edition has the same seven exercises. What changes is this table:
// how the number prints, how options are labelled and answered, how true/false reads, where
// a blank is written, the paper of the open answer and the layout of long division.
const disc = { shape: 'disc' };
const square = { shape: 'square' };
const bare = { shape: 'none', suffix: '.' };
const TRADITIONS = {
  es: { number: disc, options: { marker: 'none' }, trueFalse: { look: 'boxes' },
    blank: { look: 'line' }, area: { kind: 'lines' }, arithmetic: { division: 'potence' } },
  fr: { number: square, options: { marker: 'box' }, trueFalse: { look: 'boxes' },
    blank: { look: 'dots' }, area: { kind: 'seyes', spacing: mm(8) },
    arithmetic: { division: 'potence' } },
  de: { number: square, options: { marker: 'box' }, trueFalse: { look: 'boxes' },
    blank: { look: 'line' }, area: { kind: 'lines' }, arithmetic: { division: 'inline' } },
  it: { number: { shape: 'rounded' }, options: { marker: 'box' }, trueFalse: { look: 'boxes' },
    blank: { look: 'dots' }, area: { kind: 'lines' }, arithmetic: { division: 'potence' } },
  pt: { number: bare, options: { marker: 'none' }, trueFalse: { look: 'bracket', place: 'start' },
    blank: { look: 'line' }, area: { kind: 'lines' }, arithmetic: { division: 'potence' } },
  en: { number: bare, options: { marker: 'none' }, trueFalse: { look: 'boxes' },
    blank: { look: 'line' }, area: { kind: 'lines' }, arithmetic: { division: 'bracket' } },
  // 一、二、 sections; （　） after the stem and A. B. C. in a row; √ × in a bracket; 田字格.
  zh: { number: { shape: 'none', format: 'simp-chinese-informal', suffix: '、' },
    options: { labels: 'alpha-upper', suffix: '.', layout: 'row', bracket: true },
    trueFalse: { look: 'bracket' }, blank: { look: 'line' },
    // 15 mm squares: a word's two and the square after it span a quarter of the measure, so
    // the pinyin in four columns stands over its 田字格 (cells="2 2 2 2").
    area: { kind: 'tianzige', spacing: mm(15), lines: 1 }, arithmetic: { division: 'bracket' } },
  // ア イ ウ in a row with （　）, ○ × in a bracket, the number in a square.
  ja: { number: square, options: { labels: 'katakana', suffix: '', layout: 'row', bracket: true },
    trueFalse: { look: 'bracket' }, blank: { look: 'line' }, area: { kind: 'lines' },
    arithmetic: { division: 'bracket' } },
  ar: { number: disc, options: { marker: 'none', prefix: '(', suffix: ')' },
    trueFalse: { look: 'boxes' },
    blank: { look: 'dots' }, area: { kind: 'lines' }, arithmetic: { division: 'bracket' } },
};
TRADITIONS.ca = TRADITIONS.es; // Catalan schools set exercises as Spanish ones do
// #endregion

// #region style: the one exercise style, the edition's tradition over the house look
const T = TRADITIONS[LANG];
const ficha = {
  id: 'ficha', ...T,
  number: { background: col('accent'), color: T.number.shape === 'none' ? col('accent')
    : col('paper'), fontFamily: LABEL, fontWeight: 700, ...T.number },
  // Chinese and Japanese sheets set the instructions in the gothic (黑体, ゴシック).
  instruction: { bold: true, color: col('ink'), ...(LANG === 'zh' || LANG === 'ja'
    ? { fontFamily: LABEL } : {}) },
  blank: { color: col('ink'), weight: pt(0.7), ...T.blank },
  match: { look: 'dots', gap: em(5), color: col('accent') },
  bank: { order: 'alpha' },
  area: { color: col('rule'), spacing: mm(9), weight: pt(0.6), ...T.area },
  grid: { cell: mm(8.5), fontFamily: TEXT, rule: col('rule'), color: col('ink') },
  marginTop: mm(7), marginBottom: mm(1), itemSpacing: em(0.4),
};
// #endregion

// #region head: the worksheet's head, its title on a tinted band and the lines for a name
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const field = (id, attr, x, width) => [
  { kind: 'text', id, content: `{attr.${attr}}`, fontFamily: LABEL, fontSize: pt(10),
    fontWeight: 700, color: col('muted'), align: 'left', placement: at('container', 'top-left',
      x, 28) },
  { kind: 'rule', id: `${id}-line`, direction: 'horizontal', thickness: pt(0.75),
    color: col('rule'), placement: at('container', 'top-left', x + 16, 33, { width: mm(width) }) },
];
const head = { enabled: true, minHeight: mm(38), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('accent'), borderRadius: mm(3) },
    placement: at('container', 'top-left', 0, 0, { width: 'fill', height: mm(21) }) },
  { kind: 'text', id: 'kicker', content: '{title} · {subtitle}', fontFamily: LABEL,
    fontSize: pt(8.5), fontWeight: 700, color: col('tint'), align: 'left',
    placement: at('container', 'top-left', 6, 3.5) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: LABEL, fontSize: pt(22),
    fontWeight: 700, color: col('paper'), align: 'left', lineHeight: 1.1,
    placement: at('container', 'top-left', 6, 9.5) },
  ...field('name', 'nombre', 0, 96), ...field('date', 'fecha', 120, 40),
] } };
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', fr: 'fr', de: 'de', it: 'it', pt: 'pt-BR',
    zh: 'zh-Hans', ja: 'ja', ar: 'ar' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    margins: { top: mm(18), bottom: mm(20), left: mm(18), right: mm(18), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(LANG === 'ar' ? 13.5 : 12), lineHeight: pt(LANG === 'ar'
      ? 22 : 18), color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0),
    boldFontWeight: LANG === 'ja' ? 600 : 700, // Klee One's heaviest cut is 600
    paragraphSpacing: false, hyphenation: { enabled: false }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: LABEL, color: col('ink'), fontWeight: 700, levels: [
    { level: 1, fontSize: pt(20), breakBefore: { parity: 'any' }, marginTop: pt(0),
      marginBottom: mm(1), advancedDesign: head },
  ] },
  exerciseStyles: [ficha],
  orderedLists: { fontFamily: LABEL, color: col('accent'), fontWeight: 700, marginTop: pt(0),
    marginBottom: pt(0) },
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(7.5), lineHeight: pt(10),
    color: col('muted'), firstLineIndent: pt(0), marginTop: mm(6) }],
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: LABEL,
    fontSize: pt(9), fontWeight: 700, color: col('accent'), align: 'center',
    placement: at('page', 'bottom', 0, -11) }] },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Nunito: ['400', '700'], 'Baloo 2': ['700'], // the Latin editions
  'Noto Serif SC': ['400', '700'], 'Noto Sans SC': ['700'], // 宋 for the text, 黑 for heads
  'Klee One': ['400', '600'], 'Noto Sans JP': ['600', '700'], // 教科書体 and a gothic
  'Noto Naskh Arabic': ['400', '700'], 'Baloo Bhaijaan 2': ['700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// The edition loads its own faces only.
for (const family of Object.keys(FONTS)) if (![TEXT, LABEL].includes(family)) delete FONTS[family];
await loadFonts(FONTS, markdown);
await loadCjkFonts(FONTS, markdown);
await loadArabicFonts(FONTS, markdown);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Worksheet', es: 'Ficha', ca: 'Fitxa', fr: 'Fiche',
  de: 'Arbeitsblatt', it: 'Scheda', pt: 'Ficha', zh: '练习单', ja: 'プリント', ar: 'ورقة عمل' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: { zh: cjkPdfProvider, ja: cjkPdfProvider,
  ar: arabicPdfProvider }[LANG] ?? fontsourceProvider }), `${RECIPE}-${LANG}.pdf`);

// @kit core fonts viewer pdf cjk arabic
