// ═══ Postext Cookbook · Nº 075 · A vertical Chinese novel, bound on the right ════════
// https://postext.dev/en/cookbook/vertical-novel-right-bound
// Code: MIT · Text: 三國演義 ch. 1, zh.wikisource (CC BY-SA 4.0) · Plate: woodcut, 1592 (PD)
// Fonts: Noto Serif TC, LXGW WenKai TC, Noto Sans TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the novel is Chinese in both editions
const RECIPE = 'vertical-novel-right-bound';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black ink, one vermilion, the paper the plate was toned to
const palette = {
  ink: '#2a221d', // the text, and the woodcut's lines
  vermilion: '#a3301f', // 朱: the ruled columns of the opener, the title slip
  muted: '#6f655c', // fore-edge heads, folios, the imprint
  paper: '#fbf8f1', // the page; the plate's paper was toned to this value
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.vermilion, model: 'hex' } },
];
// #endregion
const [SONG, KAI, HEI] = ['Noto Serif TC', 'LXGW WenKai TC', 'Noto Sans TC']; // 宋, 楷, 黑
const [BODY, LEAD] = [10.5, 19]; // pt: 五號 text on a column pitch of 1.8 em
const cols = (n) => pt(n * LEAD); // n columns across the page

// #region answer: vertical text on a 25開 page, bound on the right, 40 characters × 16 columns
// 'vertical-rl' turns the flow a quarter turn: lines run down, columns from right to left,
// and page.binding 'auto' becomes 'right', so page 1 is a left-hand page and the spreads
// read [3 | 2]. The grid sets the type area in characters; the margins are minimums it
// grows. zh-Hant resolves to Taiwan's rules: every mark full width and centred in its cell.
const page = {
  sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150,
  backgroundColor: col('paper'),
  // 天頭 above 地腳; left is the spine side (the right edge of a left-hand page).
  margins: { top: mm(32), bottom: mm(26), left: mm(16), right: mm(22), mirror: true },
  pageNumbering: { format: 'trad-chinese-informal' }, // folios 一, 二 … 十一
};
const layout = { layoutType: 'single', writingMode: 'vertical-rl' };
const cjk = { grid: { enabled: true, charsPerLine: 40, linesPerPage: 16 } };
const chapter = {
  level: 1, numberingTemplate: '第{1:一}回', numberSeparator: '　', // 第一回　宴桃園…
  breakBefore: { enabled: true, parity: 'odd' }, // gotcha: headings-drop-h1-break
  marginBottom: pt(0),
};
// #endregion

// #region opener: 第一回 and the couplet in two ruled columns, a quotation of the woodblock
// In the flow frame x runs down the column and y across the page, right to left, so a
// 'horizontal' rule is a vertical line on the sheet: three of them rule the title columns.
const [TITLE, PITCH] = [13.5, 1.5 * LEAD]; // pt: the couplet's size and its column pitch
const rule = (n) => ({ kind: 'rule', id: `rule-${n}`, direction: 'horizontal',
  thickness: pt(0.5), color: col('vermilion'),
  placement: { anchor: { to: 'container', edge: 'top-left' },
    offset: { y: pt(LEAD + n * PITCH) }, size: { width: 'fill' } } });
const title = (id, content, x, family, weight) => ({ kind: 'text', id, content,
  fontFamily: family, fontWeight: weight, fontSize: pt(TITLE), lineHeight: PITCH / TITLE,
  color: col('ink'), align: 'left', // the head of the column
  placement: { anchor: { to: 'container', edge: 'top-left' },
    offset: { x: pt(x), y: pt(LEAD) } } });
const opener = {
  enabled: true,
  minHeight: cols(5), // a blank column, the two title columns, a blank one: 5 × 19 pt
  slot: { elements: [
    rule(0), rule(1), rule(2),
    title('number', '{number}', 2 * BODY, SONG, 700), // 第一回, two characters down
    // The couplet's two halves, broken by the \\ in the heading, start level with each other.
    title('couplet', '{titleText}', 2 * BODY + 4 * TITLE, KAI, 400),
  ] },
};
// #endregion

// #region fore-edge: the running head and the folio down the outer margin, in 黑
const foreEdge = (id, content, parity, edge, y, pages) => ({
  kind: 'text', id, content, parity, pages, writingMode: 'vertical-rl',
  fontFamily: HEI, fontSize: pt(8.5), color: col('muted'), overflow: 'clip',
  placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
});
const header = { elements: [
  foreEdge('book', '{title}', 'even', 'top', 4, 'body'), // 三國演義 on the right-hand page
  foreEdge('chapter', '{chapterNumber}　{chapterTitle}', 'odd', 'top', 4, 'body'),
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -5, 'all'), // on openers too
] };
// #endregion

// #region front: a title page and the plate facing the opener, no heads or folios
const none = { elements: [] };
// A point of a page design in the flow frame: mm down the column, mm leftward across the
// page from the right edge of the type area.
const at = (down, across) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: mm(down), y: mm(across) } });
const titlePage = {
  id: 'title', numbered: false, toc: false, span: 'page', header: none,
  breakBefore: { enabled: true, parity: 'any' },
  footer: { elements: [{ kind: 'text', id: 'imprint', content: '{attr.colophon}',
    fontFamily: SONG, fontSize: pt(6.5), lineHeight: 1.4, color: col('muted'),
    overflow: 'wrap', align: 'left', // an imprint in the edition's language, set across
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(5) },
      size: { width: 'fill' } } }] },
  advancedDesign: { enabled: true, minHeight: cols(16), slot: { elements: [
    // The title slip (題簽): a heavy and a light vermilion rule.
    { kind: 'box', id: 'slip', placement: { ...at(10, 44), size: { width: mm(96),
      height: mm(22) } }, style: { borderColor: col('vermilion'), borderWidth: pt(1.4) } },
    { kind: 'box', id: 'slip-in', placement: { ...at(11.2, 45.2), size: { width: mm(93.6),
      height: mm(19.6) } }, style: { borderColor: col('vermilion'), borderWidth: pt(0.4) } },
    { kind: 'text', id: 'book', content: '{titleText}', fontFamily: SONG, fontWeight: 700,
      fontSize: pt(40), lineHeight: 1, letterSpacing: pt(10), color: col('ink'),
      placement: at(20, 48) },
    { kind: 'text', id: 'author', content: '{author}　著', fontFamily: KAI, fontSize: pt(12),
      color: col('ink'), placement: at(52, 72) },
    { kind: 'text', id: 'editor', content: '{attr.editor}', fontFamily: KAI, fontSize: pt(12),
      color: col('ink'), placement: at(52, 80) },
  ] } },
};
// The woodcut, 138 mm tall in a double frame (四周雙邊), hangs from the top right corner of
// the type area: on this right-hand page that is where the outer margin starts. The page's
// header draws it on the sheet (workaround: postext-pdf turns a picture drawn in the flow);
// the heading's design sets the caption down the column on its left.
const PLATE = { right: 8.3, top: 5.1, h: 138, w: (138 * 815) / 1433 }; // mm
const fromCorner = (inset) => ({ anchor: { to: 'outer', edge: 'top-left' },
  offset: { x: mm(-(PLATE.right + PLATE.w + inset)), y: mm(PLATE.top - inset) } });
const frame = (id, inset, thickness) => ({ kind: 'box', id,
  placement: { ...fromCorner(inset),
    size: { width: mm(PLATE.w + 2 * inset), height: mm(PLATE.h + 2 * inset) } },
  style: { borderColor: col('ink'), borderWidth: pt(thickness) } });
const plate = {
  id: 'plate', numbered: false, toc: false, span: 'page', footer: none,
  breakBefore: { enabled: true, parity: 'any' },
  header: { elements: [
    { kind: 'image', id: 'woodcut', resourceId: 'peach-garden',
      placement: { ...fromCorner(0), size: { width: mm(PLATE.w), height: 'auto' } } },
    frame('inner', 1.6, 0.4), frame('outer', 2.8, 1.4),
  ] },
  advancedDesign: { enabled: true, minHeight: cols(16), slot: { elements: [
    { kind: 'text', id: 'caption', content: '{titleText}', fontFamily: HEI, fontSize: pt(9),
      color: col('ink'), placement: at(PLATE.top - 2.8, PLATE.right + PLATE.w + 7) },
    { kind: 'text', id: 'note', content: '{attr.note}', fontFamily: KAI, fontSize: pt(8),
      color: col('muted'), placement: at(PLATE.top - 2.8, PLATE.right + PLATE.w + 12) },
  ] } },
};
const resources = [{
  id: 'peach-garden', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'peach-garden.jpg', format: 'jpeg', width: 815, height: 1433 },
  caption: '桃園結義',
  altText: '桃園結義圖：劉備、關羽、張飛立於祭桌前，桌上香爐燭臺與三杯酒，旁有烏牛白馬。',
}];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette,
  page,
  layout,
  cjk,
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true, // every paragraph
  },
  headings: { fontFamily: SONG, fontWeight: 700, color: col('ink'),
    levels: [{ ...chapter, advancedDesign: opener }] },
  headingStyles: [titlePage, plate],
  paragraphStyles: [
    // 詞 and 詩: one line to a column, four characters down, in 楷.
    { id: 'verse', fontFamily: KAI, textAlign: 'left', indent: em(4), firstLineIndent: em(0),
      marginTop: pt(0), marginBottom: pt(0) },
  ],
  header,
  footer: none,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Chinese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Serif TC': ['400', '700'], // 宋: the text; 700 for 第一回 and the title
  'LXGW WenKai TC': ['400'], // 楷: the couplet, the 詞 and the poems, the plate's note
  'Noto Sans TC': ['400'], // 黑: the fore-edge heads and folios, the plate's title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the slices of the characters it sets
// Fontsource cuts a Chinese face into about a hundred files; loadCjkFonts fetches those
// that hold the characters it is given (gotcha: cjk-fonts-slices). vertical: true loads the
// face again with its vertical punctuation forms, for the canvas.
const heads = markdown.match(/^# .*$/gm).join('').replace(/\{[^}]*\}/g, ''); // no attributes
const attr = (key) => markdown.match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? '';
const verse = markdown.match(/:::paragraphs\{style="verse"\}[\s\S]*?\n:::/g).join('');
await loadFonts(FONTS, markdown); // their Latin files: the imprint
await loadCjkFonts({ [SONG]: ['400'] }, markdown, { vertical: true });
await loadCjkFonts({ [SONG]: ['700'] }, '三國演義第一回'); // no punctuation: no vertical twin
await loadCjkFonts({ [KAI]: ['400'] }, `${heads}${verse}${attr('editor')}${attr('note')}羅貫中著`,
  { vertical: true });
await loadCjkFonts({ [HEI]: ['400'] }, `${heads}第回一二三四五六七八九十`, { vertical: true });
// #endregion
await loadImage('peach-garden.jpg', asset('peach-garden-oath-1592.jpg'));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources }, config()), markdown);
// workaround: a canvas takes its text direction from the page, and showBook sets
// dir="rtl" on each spread, which would reorder and shift the Latin imprint.
document.head.insertAdjacentHTML('beforeend', '<style>#pages canvas { direction: ltr }</style>');
showBook(doc, { title: t({ en: 'A vertical Chinese novel, bound on the right',
  es: 'Una novela china vertical, encuadernada por la derecha' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
