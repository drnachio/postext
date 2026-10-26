// ═══ Postext Cookbook · Nº 171 · A Chinese exercise book, pupil's and teacher's ═══
// https://postext.dev/en/cookbook/chinese-exercise-book
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Noto Serif SC, Noto Sans SC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.63.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'zh'; // @lang: the language of the frame; the exercise book is Chinese in all
const RECIPE = 'chinese-exercise-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a green exercise book, and the red of the teacher's pen
const palette = {
  ink: '#1f2523', // text: a green-tinted near-black
  green: '#2c7350', // the one accent: section numbers, the subject tab, the squares
  red: '#d0352c', // the teacher's answers
  tint: '#e6f2ea', // the subject tab's ground, the answers box
  rule: '#8fb9a2', // 田字格, the matching dots' lines
  muted: '#68736d', // folios, the series line
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.green, model: 'hex' } },
];
// #endregion
// 宋 for the text, 黑 for the instructions and labels, 楷 for what the teacher writes.
const [SONG, HEI, KAI] = ['Noto Serif SC', 'Noto Sans SC', 'LXGW WenKai TC'];
const CHARS = 40; // characters per line: 40 × 10.5 pt = 148 mm
const SIZE = 10.5; // pt: 五号, the size of a school book's text

// #region answer: sections 一、二、 that print the pupil's book or the teacher's
// The exercise style is the form; the Markdown holds every word, the points included. The
// same text builds both editions: `edition: 'teacher'` writes each answer into its blank,
// bracket and square in red Kai, rings the right options and draws the matching lines.
const lianxi = {
  id: 'lianxi',
  number: { format: 'simp-chinese-informal', suffix: '、', fontFamily: HEI, color: col('green') },
  instruction: { fontFamily: HEI, bold: false }, // 黑体, not bold: the points stay quiet
  // 选择题: A. B. C. D. in a row, a （　） after the stem for the letter.
  options: { labels: 'alpha-upper', suffix: '.', layout: 'row', bracket: true },
  trueFalse: { look: 'bracket' }, // 判断题: （　） at the end of the line, √ or ×
  blank: { look: 'line', color: col('ink') },
  area: { kind: 'tianzige', color: col('rule') }, // 写话 on 田字格
  match: { color: col('green') },
  grid: { fontFamily: SONG, rule: col('rule') },
  answers: { color: col('red'), fontFamily: KAI },
  solutions: { box: 'daan' },
  marginTop: em(1.2), marginBottom: em(0.6),
};
const exerciseStyles = [
  lianxi,
  // 看拼音写词语: a box under each syllable, as wide as its word.
  { id: 'pinyin', extends: 'lianxi', blank: { look: 'box', width: 'answer', color: col('rule') } },
  // 在（　）里填: the bracket is in the text, the blank inside it draws nothing.
  { id: 'kuohao', extends: 'lianxi', blank: { look: 'none', width: 'answer' } },
];
let edition = 'student'; // the second build below prints the teacher's book
// The pupil's book: 参考答案 where a :::solutions line stands, at the end of each unit.
// The teacher's book: every answer on the page, so no key at the end.
const exercises = () => ({ edition,
  solutions: { placement: edition === 'teacher' ? 'none' : 'directive' } });
// #endregion

// #region opener: the unit's painting to the bleed, the subject tab and the title
const BAND = 184 / 2.4; // mm: the painting's height at the page's width
const opener = { enabled: true, minHeight: mm(BAND - 22 + 23), slot: { elements: [
  { kind: 'image', id: 'picture', resourceId: '{attr.pic}', decorative: true, reserve: false,
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: mm(184), height: mm(BAND) } } },
  { kind: 'text', id: 'subject', content: '{attr.kicker}', fontFamily: HEI, fontSize: pt(11),
    fontWeight: 700, color: col('paper'), letterSpacing: pt(2), align: 'center',
    box: { backgroundColor: col('green'), borderRadius: mm(1.5),
      padding: { top: mm(0.8), bottom: mm(0.8), left: mm(2.4), right: mm(2) } },
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(0), y: mm(BAND - 22 + 6) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: HEI, fontSize: pt(24),
    fontWeight: 700, color: col('ink'), align: 'left',
    placement: { anchor: { to: '#subject', edge: 'right-of' },
      offset: { x: mm(4), y: mm(-2.6) } } },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.2), color: col('green'),
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(0), y: mm(BAND - 22 + 19) }, size: { width: 'fill' } } },
] } };
// #endregion

// #region furniture: folios at the foot, the series line on the verso, the unit on the recto
const foot = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, fontFamily: HEI, fontSize: pt(8), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-10) } }, ...extra });
const footer = { elements: [
  foot('folio-v', '{pageNumber}', 'even', 'bottom-left', 16,
    { fontWeight: 700, color: col('green') }),
  foot('series', '{title}', 'even', 'bottom-left', 24),
  foot('unit', '{chapterTitle}', 'odd', 'bottom-right', -24, { align: 'right' }),
  foot('folio-r', '{pageNumber}', 'odd', 'bottom-right', -16,
    { fontWeight: 700, color: col('green'), align: 'right' }),
] };
// #endregion

const config = () => ({
  locale: 'zh-Hans', // written out: Kaiming punctuation, no hyphenation
  colorPalette,
  page: { sizePreset: 'custom', width: mm(184), height: mm(260), dpi: 150, // 16开
    margins: { top: mm(22), bottom: mm(20), left: mm(18), right: mm(16), mirror: true } },
  layout: { layoutType: 'single' },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: 29 } },
  bodyText: { fontFamily: SONG, fontSize: pt(SIZE), lineHeight: pt(21), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: pt(0), avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: HEI, color: col('ink'), fontWeight: 700, balancing: { enabled: false },
    levels: [{ level: 1, fontSize: pt(24), breakBefore: { parity: 'any' },
      advancedDesign: opener }] },
  orderedLists: { numberFormat: 'arabic', color: col('ink'), fontWeight: 400 },
  paragraphStyles: [
    // 班级、姓名、得分 at the head of each unit
    { id: 'xinxi', fontFamily: HEI, fontSize: pt(9.5), textAlign: 'right', firstLineIndent: pt(0),
      color: col('muted'), marginBottom: mm(2) },
    { id: 'colophon', fontFamily: HEI, fontSize: pt(7.5), lineHeight: pt(11), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: mm(6) },
  ],
  chipStyles: [{ id: 'xian', backgroundEnabled: false, underline: 'solid', borderWidth: pt(0.6),
    borderColor: col('muted'), minWidth: mm(24), paddingX: pt(0), paddingY: pt(0) }],
  calloutStyles: [{ id: 'daan', background: col('tint'), borderRadius: mm(2),
    padding: { top: mm(3), right: mm(4), bottom: mm(3.5), left: mm(4) },
    titleStyle: { fontFamily: HEI, fontSize: pt(11), fontWeight: 700, color: col('green') },
    body: { fontSize: pt(9.5), lineHeight: pt(17), color: col('ink'), firstLineIndent: pt(0) },
    marginTop: mm(6), marginBottom: mm(2), keepTogether: false }],
  exerciseStyles,
  exercises: exercises(),
  header: { elements: [] },
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.zh.md: one text for both editions

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Serif SC': ['400', '700'], // 宋: the text, the pinyin
  'Noto Sans SC': ['400', '700'], // 黑: instructions, numbers, titles
  'LXGW WenKai TC': ['400'], // 楷: the teacher's answers
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each face loads the files of the characters it sets (gotcha: cjk-fonts-slices); the Kai
// sets the answers, so it loads them all.
const answers = [...markdown.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]).join('')
  + markdown.split(':::solution').slice(1).join('') + '√×ABCD0123456789';
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: FONTS[SONG], [HEI]: FONTS[HEI] }, markdown);
await loadCjkFonts({ [KAI]: FONTS[KAI] }, answers);
const resources = [];
for (const [id, file] of [['spring', 'spring-1600.jpg'], ['market', 'market-1600.jpg']]) {
  await loadImage(file, asset(file));
  resources.push({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: file, format: 'jpeg', width: 1600, height: 667 } });
}
// #region editions: one text, two books: the pupil's, then the teacher's
const build = () => withLoadedFonts(() => buildDocument({ markdown, resources }, config()),
  { ...kitFonts(FONTS), text: markdown });
const pupil = await build();
edition = 'teacher';
const docs = [pupil, await build()];
// #endregion
showPages(docs, { title: t({ zh: '练习册：学生用书与教师用书', en: 'A Chinese exercise book',
  es: 'Un cuaderno de ejercicios chino' }) });
offerPdf(() => renderToPdf(docs, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
