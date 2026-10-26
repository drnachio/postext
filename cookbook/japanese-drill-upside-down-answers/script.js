// ═══ Postext Cookbook · Nº 172 · A Japanese drill with the answers upside down ═══
// https://postext.dev/en/cookbook/japanese-drill-upside-down-answers
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Klee One, Zen Maru Gothic (SIL OFL 1.1) · Needs postext ≥ 1.63.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'ja'; // @lang: the language of the frame; the drill is Japanese in all
const RECIPE = 'japanese-drill-upside-down-answers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a drill book's blue, a warm yellow and a pale sky for the band
const palette = {
  ink: '#23272c', // text
  blue: '#2a6cb0', // the accent: exercise numbers, the title band's rule, the score box
  sun: '#f2c14e', // the subject badge
  tint: '#eaf2fb', // the title band
  rule: '#a8bfd8', // writing lines and boxes
  muted: '#69717b', // folios, the name line, the upside-down answers
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.blue, model: 'hex' } },
];
// #endregion
// 教科書体 for the text a child copies from, a round gothic for the labels.
const [TEXT, ROUND] = ['Klee One', 'Zen Maru Gothic'];

// #region answer: the answers printed upside down under each exercise
// `placement: 'inverted'` sets each exercise's key right after it in a box turned 180°: the
// pupil sees where the answers are without reading them, and turns the book to check. The
// key's words come from the exercise (the options' katakana, ○ and ×, the operations), so
// the Markdown holds nothing twice.
const drill = {
  id: 'drill',
  number: { shape: 'square', fontFamily: TEXT, fontWeight: 600, background: col('blue') },
  instruction: { fontFamily: ROUND, bold: false },
  options: { layout: 'row' }, // ア イ ウ side by side (the default labels in Japanese)
  trueFalse: { look: 'bracket' }, // （　） for ○ or ×
  blank: { look: 'box', width: 'answer', color: col('rule') }, // □ to write in
  area: { kind: 'lines', color: col('rule') },
  grid: { rule: col('rule') },
  solutions: { placement: 'inverted', box: 'kotae' },
  marginTop: em(1.1), marginBottom: em(0.4),
};
// 漢字の書き取り: a square □ for one kanji, its reading printed beside it.
const kaki = { id: 'kaki', extends: 'drill', blank: { extra: em(0.6), minWidth: em(1.6) } };
const kotae = { id: 'kotae', title: '', backgroundEnabled: false, border: { enabled: false },
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  body: { fontFamily: ROUND, fontSize: pt(8), lineHeight: pt(12), color: col('muted'),
    firstLineIndent: pt(0) },
  marginTop: mm(1), marginBottom: mm(2), keepTogether: true };
// #endregion

// #region header: the drill's band: subject badge, title, the mascot at the far end
// A heading design on a vertical page is laid along its column: x runs down the page and y
// to the left, so the same band stands at the right edge, from head to foot.
const BAND = 30; // mm: the band's depth (its height across, its width down)
const header = { enabled: true, minHeight: mm(BAND + 3), slot: { elements: [
  { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint'),
    borderRadius: mm(4) }, placement: { anchor: { to: 'container', edge: 'top-left' },
    size: { width: 'fill', height: mm(BAND) } } },
  { kind: 'image', id: 'mascot', resourceId: '{attr.pic}', decorative: true, reserve: false,
    placement: { anchor: { to: 'container', edge: 'top-right' }, offset: { x: mm(-4), y: mm(1) },
      size: { width: mm(28), height: mm(28) } } },
  { kind: 'text', id: 'subject', content: '{attr.kicker}', fontFamily: ROUND, fontSize: pt(10),
    fontWeight: 700, color: col('ink'), box: { backgroundColor: col('sun'), borderRadius: mm(3),
      padding: { top: mm(0.6), bottom: mm(0.6), left: mm(2.4), right: mm(2.4) } },
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(5), y: mm(5) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: ROUND, fontSize: pt(20),
    fontWeight: 700, color: col('ink'),
    placement: { anchor: { to: '#subject', edge: 'below' }, offset: { x: mm(0), y: mm(2.5) } } },
] } };
// #endregion

let writingMode = 'horizontal-tb'; // 算数 runs across the page
const config = () => ({
  locale: 'ja',
  colorPalette,
  page: { sizePreset: 'custom', width: mm(182), height: mm(257), dpi: 150, // B5
    margins: { top: mm(18), bottom: mm(16), left: mm(16), right: mm(16), mirror: true } },
  layout: { layoutType: 'single', writingMode },
  bodyText: { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(22), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    boldFontWeight: 600, // Klee One's heaviest cut
    textAlign: 'left', firstLineIndent: pt(0) },
  headings: { fontFamily: ROUND, color: col('ink'), fontWeight: 700, balancing: { enabled: false },
    levels: [{ level: 1, fontSize: pt(20), breakBefore: { parity: 'any' }, marginBottom: pt(0),
      advancedDesign: header }] },
  orderedLists: { numberFormat: 'arabic', color: col('ink'), fontWeight: 600 },
  paragraphStyles: [
    { id: 'namae', fontFamily: ROUND, fontSize: pt(10), color: col('muted'), textAlign: 'right',
      firstLineIndent: pt(0), marginTop: pt(0), marginBottom: mm(1) },
    { id: 'colophon', fontFamily: ROUND, fontSize: pt(7.5), lineHeight: pt(11), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: mm(5) },
  ],
  chipStyles: [{ id: 'sen', backgroundEnabled: false, underline: 'solid', borderWidth: pt(0.7),
    borderColor: col('muted'), minWidth: mm(40), paddingX: pt(0), paddingY: pt(0) },
  { id: 'waku', backgroundEnabled: false, borderWidth: pt(1), borderColor: col('blue'),
    borderRadius: mm(1.5), minWidth: mm(16), paddingY: em(0.2) }],
  calloutStyles: [kotae],
  exerciseStyles: [drill, kaki],
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: ROUND,
    fontSize: pt(9), fontWeight: 700, color: col('blue'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-9) } } }] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.ja.md: the さんすう page, then the こくご page

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Klee One': ['400', '600'], // 教科書体: the text and the numbers to copy
  'Zen Maru Gothic': ['400', '700'], // labels, instructions, titles, the answers
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each face loads the files of the characters it sets (gotcha: cjk-fonts-slices); the
// vertical page also needs each face's upright punctuation.
await loadFonts(FONTS, markdown);
await loadCjkFonts(FONTS, markdown, { vertical: true });
const resources = [];
for (const id of ['tanuki', 'kitsune']) {
  await loadImage(`${id}-600.jpg`, asset(id === 'tanuki' ? 'tanuki-600.jpg' : 'kitsune-600.jpg'));
  resources.push({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: `${id}-600.jpg`, format: 'jpeg', width: 600, height: 600 } });
}
// #region two-books: one drill across, one in columns, with the same styles
// Two drill books of one series: arithmetic across, bound on the left; kanji in columns,
// bound on the right (vertical text binds there by itself).
const [sansu, kokugo] = markdown.split(/(?=^# 春のことば)/m);
const build = (text) => withLoadedFonts(() => buildDocument({ markdown: text, resources },
  config()), { ...kitFonts(FONTS), text: markdown });
const across = await build(sansu);
// 国語 is set in columns, top to bottom, right to left: the same design, turned.
writingMode = 'vertical-rl';
const docs = [across, await build(kokugo)];
// #endregion
showBook(docs, { title: t({ ja: '答えがさかさまのドリル', en: 'A Japanese drill, answers upside down',
  es: 'Un cuaderno japonés con las soluciones del revés' }) });
offerPdf(() => renderToPdf(docs, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
