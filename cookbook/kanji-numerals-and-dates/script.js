// ═══ Postext Cookbook · Nº 129 · Kanji numerals, counters and dates in vertical text ═══
// https://postext.dev/en/cookbook/kanji-numerals-and-dates
// Code: MIT · Text: written for the recipe (CC BY 4.0)
// Fonts: Noto Serif JP, Noto Sans JP, Zen Maru Gothic (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A neighbourhood newsletter set vertically: every way Japanese writes a number.
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, loadVerticalAlternates, formatNumeral,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the newsletter is Japanese in both
const RECIPE = 'kanji-numerals-and-dates';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, the green of young leaves, its tint, a festival red and its blush
const palette = {
  ink: '#1f2420', // the text
  leaf: '#2f6b3f', // masthead band, section numbers (6.4:1 on the paper)
  tint: '#e4efdf', // the calendar's marked days, the receipt
  red: '#b4362b', // the receipt's amount
  blush: '#f4d4cc', // the festival days in the calendar
  muted: '#5f665f', // folios, the colophon
  paper: '#fdfdf9',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'leaf (defaults)', value: { hex: palette.leaf, model: 'hex' } },
];
// #endregion

const MINCHO = 'Noto Serif JP'; // the text
const GOTHIC = 'Noto Sans JP'; // section heads, labels, the calendar
const ROUND = 'Zen Maru Gothic'; // the masthead's title
const [BODY, LEAD] = [11, 20]; // pt: large print for every age on the street
const [CHARS, LINES] = [44, 20];
const PT = 25.4 / 72; // mm in a point
const TRIM = { w: 182, h: 257 }; // mm, B5
const LINE = CHARS * BODY * PT; // mm: 170.7, the length of a line
const HEAD = 30 + (TRIM.h - 30 - 24 - LINE) / 2; // mm: the head of the type area

// #region answer: one number, four spellings, chosen by where it stands
// formatNumeral is the counter the engine numbers pages, lists and headings with.
const ISSUE = 120;
const kan = (n) => formatNumeral(n, 'japanese-informal'); // 120 → 百二十: counted
const pos = (n) => formatNumeral(n, 'cjk-decimal'); // 2026 → 二〇二六: digit by digit
const daiji = (n) => formatNumeral(n, 'japanese-formal'); // 12000 → 壱萬弐阡: on money
// {{daiji:12000}} in the text: the amount of a receipt in the hard-to-alter daiji.
const withDaiji = (md) => md.replace(/\{\{daiji:(\d+)\}\}/g, (_, n) => daiji(Number(n)));
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  uprightDigits: 2, // 8月22日: one or two Arabic digits stand in one cell (the default)
};
// Sections 一、二、三、, items （一）（二）, then イ ロ ハ and あ い う beneath them.
const sectionLevel = { level: 2, numberingTemplate: '{2:一}、', numberSeparator: '',
  fontFamily: GOTHIC, fontWeight: 700, fontSize: pt(12), color: col('leaf'), lineSpan: 2 }; // 二行取り
const level = (n, numberFormat, prefix, separator) => ({ level: n, numberFormat, prefix,
  separator }); // each level starts where the text of the one above starts
const orderedLists = {
  fontFamily: GOTHIC, color: col('leaf'), fontWeight: 700, gap: em(0.5),
  marginTop: pt(0), marginBottom: pt(0), itemSpacing: pt(0),
  levels: [level(1, 'japanese-informal', '（', '）'), level(2, 'katakana-iroha', '', ''),
    level(3, 'hiragana', '', '、')],
};
// #endregion

// #region masthead: a green band down the right edge, the issue and the date in kanji
const BAND = 46; // mm from the right trim edge
const at = (x, y, extra = {}) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y) }, ...extra }); // x down the sheet, y leftward from its right
const onBand = { color: col('paper'), overflow: 'wrap', align: 'left' };
const masthead = {
  id: 'masthead', numbered: false, toc: false, runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: mm(BAND - 15), slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('leaf') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { height: mm(BAND) } } },
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: ROUND,
      fontWeight: 700, fontSize: pt(36), lineHeight: 1.1, letterSpacing: pt(3),
      placement: at(HEAD, 9) },
    { kind: 'text', id: 'issue', content: `第${kan(ISSUE)}号`, ...onBand, fontFamily: GOTHIC,
      fontWeight: 700, fontSize: pt(12), letterSpacing: pt(2), placement: at(HEAD, 26) },
    { kind: 'text', id: 'date', content: `${pos(2026)}年（令和${kan(8)}年）${kan(8)}月${kan(1)}日発行`,
      ...onBand, fontFamily: GOTHIC, fontSize: pt(10), align: 'right',
      placement: at(HEAD, 26, { size: { width: mm(LINE) } }) },
    { kind: 'text', id: 'publisher', content: '{author}', ...onBand, fontFamily: GOTHIC,
      fontSize: pt(10), align: 'right', placement: at(HEAD, 33, { size: { width: mm(LINE) } }) },
    { kind: 'text', id: 'latin', content: '{attr.latin}', ...onBand, fontFamily: GOTHIC,
      fontSize: pt(7.5), placement: at(HEAD, 40) },
  ] } },
};
// #endregion

// #region calendar: August 2026 as a table, the festival and the duties marked
const DAYS = { 2: '訓練', 9: '清掃', 13: 'お盆', 18: '練習会', 19: '練習会',
  22: '夏祭り', 23: '夏祭り', 30: '役員会' };
const day = (d) => (d ? { content: `**${d}**\n${DAYS[d] ?? '\u00a0'}`, align: 'center',
  ...(DAYS[d] ? { background: col(d === 22 || d === 23 ? 'blush' : 'tint') } : {}) }
  : { content: '' });
const weeks = []; // 1 August 2026 is a Saturday
for (let d = -5; d <= 31; d += 7) weeks.push([0, 1, 2, 3, 4, 5, 6].map((k) => day(d + k > 0
  && d + k <= 31 ? d + k : 0)));
const calendar = { id: 'calendar', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  // An upright table takes every line of the vertical page it stands on (gap:
  // vertical-tables): the calendar is the back page, cited at the end of the text.
  placement: { position: 'top', span: 'page' },
  caption: '八月の行事。13日から16日まではごみの収集がありません。',
  table: { model: { headerRowCount: 1, rows: [[...'日月火水木金土'].map((c) => ({ content: c,
    isHeader: true, align: 'center' })), ...weeks] } } };
const resourceTypes = [{ id: 'table', name: '表', shortLabel: '表', captionPrefix: '表',
  numberingTemplate: '{n}', counterFormat: '一', resetOn: 'never' }]; // 表一, 表二…
// #endregion

const config = () => ({
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  resourceTypes,
  page: {
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(30), bottom: mm(24), left: mm(16), right: mm(18), mirror: true },
    pageNumbering: { format: 'japanese-informal' },
  },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  cjk,
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: { fontFamily: GOTHIC, color: col('ink'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, sectionLevel] },
  headingStyles: [masthead],
  orderedLists,
  paragraphStyles: [
    { id: 'item', firstLineIndent: em(0), indent: em(1), hangingIndent: em(3) },
    { id: 'chronicle', firstLineIndent: em(0), hangingIndent: em(14) },
    { id: 'colophon', fontFamily: GOTHIC, fontSize: pt(7), color: col('muted'),
      textAlign: 'left', firstLineIndent: em(0), marginTop: pt(LEAD) },
  ],
  calloutStyles: [{ id: 'receipt', title: '領収証（記入例）', background: col('tint'),
    padding: { top: mm(4), right: mm(4), bottom: mm(4), left: mm(4) },
    marginTop: pt(LEAD / 2), marginBottom: pt(0), // the next heading's 行取り gives it room
    titleStyle: { fontFamily: GOTHIC, fontSize: pt(12), fontWeight: 700, color: col('leaf') },
    body: { fontFamily: MINCHO, color: col('ink'), boldColor: col('red'), textAlign: 'left',
      firstLineIndent: em(0) } }],
  tableStyle: { rules: 'horizontal', borderColor: col('leaf'), borderWidth: pt(0.5),
    headerBackground: col('leaf'), headerColor: col('paper'), headerFontFamily: GOTHIC,
    headerFontSize: pt(12), bodyFontFamily: GOTHIC, bodyFontSize: pt(11), bodyColor: col('ink'),
    cellPadding: mm(3.2) },
  // 表一　八月の行事: label and number solid, then U+3000 (the ja default)
  captionStyle: { fontFamily: GOTHIC, fontSize: pt(10), color: col('ink'),
    labelColor: col('leaf') },
  header: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', pages: 'body',
    fontFamily: GOTHIC, fontSize: pt(8), color: col('muted'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-12) } } }] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = withDaiji(/* @content */ ''); // content.<lang>.md, amounts filled in

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Noto Serif JP': ['400', '700'], 'Noto Sans JP': ['400', '700'],
  'Zen Maru Gothic': ['700'] };
// #region voices: each face loads the files of the characters it sets
const heads = (markdown.match(/^#+ .*$/gm) ?? []).join('');
const gothicText = `${heads}${markdown}第号年月日発行令和${kan(ISSUE)}${pos(2026)}${
  calendar.caption}日月火水木金土${Object.values(DAYS).join('')}領収証（記入例）表一`;
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, markdown, { vertical: true });
await loadCjkFonts({ [GOTHIC]: FONTS[GOTHIC] }, gothicText, { vertical: true });
await loadCjkFonts({ [ROUND]: FONTS[ROUND] }, heads, { vertical: true });
const doc = await withLoadedFonts(
  () => buildDocument({ markdown, resources: [calendar] }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A newsletter in kanji numerals',
  es: 'Un boletín con numerales kanji' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
