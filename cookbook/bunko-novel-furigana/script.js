// ═══ Postext Cookbook · Nº 117 · A bunko novel set vertically, with furigana ════════
// https://postext.dev/en/cookbook/bunko-novel-furigana
// Code: MIT · Text: 夏目漱石『夢十夜』, Aozora Bunko 799 (public domain) · Pictures: none
// Fonts: Shippori Mincho B1, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.16.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the novel is Japanese in both
const RECIPE = 'bunko-novel-furigana';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: sumi ink on a cream bunko stock, one vermilion
const palette = {
  ink: '#1f1b18', // the text: a warm sumi black
  vermilion: '#a8392b', // 朱: the frame of the title page
  muted: '#6b635b', // the hashira and the folios
  paper: '#fbf7ee', // bunko paper is cream, not white
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.vermilion, model: 'hex' } },
];
// #endregion
const [MINCHO, GOTHIC] = ['Shippori Mincho B1', 'Noto Sans JP'];
const [BODY, LEAD, CHARS, LINES] = [9, 15.75, 38, 15]; // pt, pt: 38字 × 15行 at 1.75 em
const lines = (n) => pt(n * LEAD); // n lines across the page
const PT = 25.4 / 72; // mm in a point

// #region answer: a bunko page, 38 characters down 15 lines, bound on the right
// 'vertical-rl' sets each line top to bottom and the lines from right to left; with the
// binding left to 'auto' the book opens from the right, so page 1 is a left-hand page and
// the spreads read [3 | 2]. locale 'ja' gives the cjk settings Japan's values: they are
// written out below so you can see them, and leaving them out sets the same page.
const page = {
  sizePreset: 'custom', width: mm(105), height: mm(148), dpi: 200, // 文庫判 A6
  backgroundColor: col('paper'),
  // 天 above 地; left is the spine side (the right edge of a left-hand page). The grid
  // grows the margins of each pair alike, so the head stays deeper than the foot.
  margins: { top: mm(15), bottom: mm(11), left: mm(9), right: mm(12), mirror: true },
  pageNumbering: { format: 'japanese-informal' }, // folios 一, 二 … 十, 十一
};
const layout = { layoutType: 'single', writingMode: 'vertical-rl' };
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  lineBreak: 'ja-very-strict', // 行頭禁則: no 、。」ー or small kana at the head of a line
  hangingPunctuation: 'allow', // ぶら下げ: a 、。 that would open a line hangs below the last
  paragraphStartBracket: 'half', // ③: a 「 that opens a paragraph fills the indent cell
  ruby: { align: 'jis', overhang: 'kana' }, // JIS 1:2:1, a reading may run onto kana only
};
// #endregion

// #region nights: each night's title takes three body lines (3行取り), five characters down
// lineSpan sets the heading in a band of three body lines, its characters centred in it, so
// the text after it stands on the grid's lines. Aozora marks the titles ５字下げ (中見出し);
// indent counts body characters, whatever the heading's own size.
const night = {
  level: 1, fontFamily: MINCHO, fontWeight: 600, fontSize: pt(12.5),
  lineSpan: 3, indent: em(5), // JLReq §4.1.3
  breakBefore: { enabled: false }, // the nights run on (gotcha: headings-drop-h1-break)
};
// #endregion

// #region hashira: the title down the fore-edge of left-hand pages, kanji folios below
// anchor 'outer' is the fore-edge: the left margin of an odd page, the right of an even one
// in a book bound on the right. The 柱 starts two characters below the head of the text.
const foreEdge = (id, content, parity, edge, y, pages) => ({
  kind: 'text', id, content, parity, pages, writingMode: 'vertical-rl',
  fontFamily: GOTHIC, fontSize: pt(7), letterSpacing: pt(1), color: col('muted'),
  overflow: 'clip', placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
});
const header = { elements: [
  foreEdge('hashira', '{title}', 'odd', 'top', 2, 'body'), // never on the opening page
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -2, 'all'),
] };
const none = { elements: [] };
// #endregion

// #region title-page: the 扉, a vermilion frame round the title and the author
// A design on a vertical page is laid out in the flow frame: x runs down the page and y
// across it, leftwards from the right edge. Anchored to the page (the trim), the frame and
// the title stand on the page's axis, 52.5 mm in, whichever side the spine is on.
const at = (down, across) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(down), y: mm(across) } });
const AXIS = 105 / 2; // mm
const TITLE = 28 * PT; // mm: 夢十夜 in 28 pt, three characters and two 8 pt gaps down
const frame = { kind: 'box', id: 'frame', placement: { ...at(30, AXIS - 23),
  size: { width: mm(88), height: mm(46) } }, // 88 mm down, 46 mm across
  style: { borderColor: col('vermilion'), borderWidth: pt(0.75) } };
const titlePage = {
  id: 'title', numbered: false, toc: false, span: 'page', header: none, footer: { elements: [
    // The colophon across the foot, in the edition's language: each \n in the attribute
    // starts a line; the box hangs from the foot of the page, centred.
    // Noto Sans JP: Shippori Mincho B1 has no ō or ū for the rōmaji.
    { kind: 'text', id: 'colophon', content: '{attr.colophon}', fontFamily: GOTHIC,
      fontSize: pt(5.25), lineHeight: 1.45, color: col('muted'), overflow: 'wrap',
      align: 'center', placement: { anchor: { to: 'page', edge: 'bottom' },
        offset: { y: mm(-4) }, size: { width: mm(84) } } }] },
  breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: lines(LINES), slot: { elements: [
    frame,
    { kind: 'text', id: 'book', content: '{titleText}', fontFamily: MINCHO, fontWeight: 800,
      fontSize: pt(28), lineHeight: 1, letterSpacing: pt(8), color: col('ink'),
      placement: at(44, AXIS - TITLE / 2) },
    { kind: 'text', id: 'author', content: '{author}', fontFamily: MINCHO, fontSize: pt(11),
      letterSpacing: pt(4), color: col('ink'), placement: at(92, AXIS + TITLE / 2 + 4) },
  ] } },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page,
  layout,
  cjk,
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true, // 一字下げ
  },
  headings: { fontFamily: MINCHO, color: col('ink'), levels: [night] },
  headingStyles: [titlePage],
  header,
  footer: none,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Shippori Mincho B1': ['400', '600', '800'], // the text and furigana; 一; the title
  'Noto Sans JP': ['400'], // the hashira, the folios and the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files that hold the characters it sets
// Fontsource cuts a Japanese face into about 120 files; loadCjkFonts fetches the ones the
// text touches (gotcha: cjk-fonts-slices). vertical: true loads the face's vertical forms
// for the canvas: 、。「」ー and small kana such as っ stand differently down a line.
const title = markdown.match(/^title: "(.*)"$/m)[1];
const author = markdown.match(/^author: "(.*)"$/m)[1];
const heads = markdown.match(/^# [^{\n]*/gm).join('');
await loadFonts(FONTS, markdown); // the Latin files: the colophon, with ō and ū
await loadCjkFonts({ [MINCHO]: ['400'] }, markdown, { vertical: true });
await loadCjkFonts({ [MINCHO]: ['600', '800'] }, `${heads}${title}${author}`);
await loadCjkFonts({ [GOTHIC]: ['400'] }, `${title}一二三四五六七八九十`, { vertical: true });
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'A bunko novel set vertically, with furigana',
  es: 'Una novela en formato bunko, en vertical y con furigana' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
