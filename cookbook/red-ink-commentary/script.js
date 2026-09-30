// ═══ Postext Cookbook · Nº 078 · Red-ink commentary in the line and the head margin ═══
// https://postext.dev/en/cookbook/red-ink-commentary
// Code: MIT · Text: 脂硯齋重評石頭記, Jiaxu manuscript, Wikisource (CC BY-SA 4.0) · Pictures: none
// Fonts: Noto Serif TC, LXGW WenKai TC, Noto Sans TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
// The first chapter of the Stone as a commentary edition: the text set vertically, the
// comments the manuscript writes beside the columns folded into two small red rows inside
// the line, the head-margin comments in red Kai above the columns they gloss.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'red-ink-commentary';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black ink and vermilion on a warm paper
const palette = {
  ink: '#231d18', // the text: a warm black
  vermilion: '#b0362a', // 朱: every comment, the chapter's kicker; 5.5 : 1 on the paper
  rule: '#b9a78f', // the line under the head margin
  muted: '#6f6356', // folios, the colophon
  paper: '#f7f1e3',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: aimed at the vermilion, nothing prints blue.
  { id: 'main-color', name: 'vermilion (defaults)',
    value: { hex: palette.vermilion, model: 'hex' } },
];
// #endregion
const [SONG, KAI, HEI] = ['Noto Serif TC', 'LXGW WenKai TC', 'Noto Sans TC']; // 宋, 楷, 黑
const BODY = 12; // pt, 小四: the notes fold to two rows of 6 pt in the same em
const LEAD = 21; // pt between columns, 1.75 × the body

// #region answer: side comments inside the line, head-margin comments above it
const layout = {
  writingMode: 'vertical-rl', // columns down the page, read from the right; bound on the right
  layoutType: 'oneAndHalf', // a text tier and a narrow tier for the comments
  sideColumnRole: 'floats', // no text runs into it: only boxes fenced with span="side"
  sideColumnSide: 'left', // in vertical text 'left' is the top tier: the head margin (天頭)
  sideColumnPercent: 19, // the grid rounds it to 10 characters of the body, 42 mm
  gutterWidth: mm(8), // rounded to 2 characters
  columnRule: { enabled: true, lineWidth: pt(0.5), color: col('rule') },
};
const cjk = {
  grid: { enabled: true, charsPerLine: 36, linesPerPage: 18 }, // 版心: 36 字 × 18 行
  // :warichu[…] folds a side comment into two rows at half the body size, in red
  // and with no brackets, as the manuscripts write their 雙行夾批.
  warichu: { color: col('vermilion') },
};
// A 眉批 is :::callout{type="meipi" span="side"}: span="side" sends it to the head
// margin, level with the column the text has reached at its fence, so the fence goes
// just before the passage it discusses (gotcha: side-box-starts-at-fence).
const meipi = {
  id: 'meipi', backgroundEnabled: false,
  border: { enabled: false }, stripe: { enabled: false },
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  // 17 characters of 7 pt down the 120 pt tier, a column every 10 pt. The next comment
  // starts on a text column at least one body column (21 pt) further on, whatever the margin.
  snapToGrid: false, marginBottom: pt(0),
  body: { fontFamily: KAI, fontSize: pt(7), lineHeight: pt(10), color: col('vermilion'),
    textAlign: 'left', firstLineIndent: pt(0) },
};
// #endregion

// #region opener: the chapter's number and its couplet (回目), set down the first columns
const opener = { enabled: true, minHeight: mm(46), slot: { elements: [
  { kind: 'text', id: 'book', content: '{title}', fontFamily: HEI, fontWeight: 500,
    fontSize: pt(10), letterSpacing: pt(3), color: col('vermilion'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' } } },
  { kind: 'text', id: 'number', content: '{titleText}', fontFamily: SONG, fontWeight: 700,
    fontSize: pt(30), letterSpacing: pt(6), color: col('ink'), align: 'left',
    placement: { anchor: { to: '#book', edge: 'below' }, offset: { x: em(2), y: mm(4) } } },
  ...['a', 'b'].map((half, i) => ({ kind: 'text', id: `couplet-${half}`,
    content: `{attr.${half}}`, fontFamily: SONG, fontSize: pt(15), letterSpacing: pt(3),
    color: col('ink'), align: 'left',
    placement: { anchor: { to: i ? '#couplet-a' : '#number', edge: 'below' },
      offset: { x: i ? pt(0) : em(4), y: mm(i ? 1.5 : 4) } } })),
] } };
// #endregion

// #region fore-edge: the book's title and the folio down the outer margin
// 'outer' is the margin away from the spine: a recto's left, a verso's right.
const edge = (id, content, edgeOf, y, extra = {}) => ({ kind: 'text', id, content,
  writingMode: 'vertical-rl', fontFamily: HEI, fontWeight: 500, fontSize: pt(9.5),
  letterSpacing: pt(2), color: col('muted'), overflow: 'clip', align: 'left',
  placement: { anchor: { to: 'outer', edge: edgeOf }, offset: { y: em(y) } }, ...extra });
const header = { elements: [
  // Four characters below the head: the book on a verso, the chapter on a recto,
  // never on the opener.
  edge('head-verso', '{title}', 'top', 4, { pages: 'body', parity: 'even' }),
  edge('head-recto', '{chapterTitle}', 'top', 4, { pages: 'body', parity: 'odd' }),
  edge('folio', '{pageNumber}', 'bottom', -5), // 一, 二, 三…: page.pageNumbering below
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs by identity
  locale: 'zh-Hant', // Taiwan conventions: centred full-width marks (gotcha: cjk-locale-tag)
  colorPalette, layout, cjk, header,
  footer: { elements: [] },
  page: {
    sizePreset: 'custom', width: mm(184), height: mm(260), dpi: 150, // 16开
    backgroundColor: col('paper'),
    // Minimums: the grid centres its type area in what they leave. left is the inner
    // margin, which a right-bound recto has on its right.
    margins: { top: mm(16), bottom: mm(22), left: mm(20), right: mm(22), mirror: true },
    pageNumbering: { format: 'trad-chinese-informal' },
  },
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
    // A paragraph may open in a page's last column, so every page sets its 18. The
    // orphan rule stays on: a paragraph's last column never stands alone at the head of
    // a page (孤行不成頁).
    avoidWidows: false,
  },
  headings: {
    fontFamily: SONG, color: col('ink'),
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    levels: [{ level: 1, fontSize: pt(30), breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener }],
  },
  paragraphStyles: [
    // The two poems: each line a paragraph, four characters down, never spread.
    { id: 'verse', textAlign: 'left', firstLineIndent: em(4) },
    // The edition's note, two characters lower than the text (低二格), in Kai.
    { id: 'note', fontFamily: KAI, indent: em(2), firstLineIndent: pt(0),
      marginTop: pt(LEAD) },
    // The colophon, in the edition's language: Latin runs sideways down a vertical line.
    { id: 'colophon', fontFamily: HEI, fontWeight: 500, fontSize: pt(7.5),
      lineHeight: pt(LEAD), color: col('muted'), textAlign: 'left', indent: em(2),
      firstLineIndent: pt(0) },
  ],
  calloutStyles: [meipi],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Serif TC': ['400', '700'], // 宋: the text and the notes in the line; bold 第一回
  'LXGW WenKai TC': ['400'], // 楷: the head-margin comments, the edition's note
  'Noto Sans TC': ['500'], // 黑: the book's title, the folios, the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files of the characters it sets
// Song sets the whole sample and its bold only 第一回, Kai the head-margin comments and
// the edition's note, Hei the running heads, the folios and the colophon
// (gotcha: cjk-fonts-slices).
const blocks = (style) => [...markdown.matchAll(
  new RegExp(`:::(?:callout|paragraphs)\\{[^}]*"${style}"[^}]*\\}\\n([^]*?)\\n:::`, 'g'))]
  .map((m) => m[1]).join('');
const numerals = '一二三四五六七八九十';
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, markdown, { vertical: true });
await loadCjkFonts({ [SONG]: ['700'] }, '第一回'); // the bold weight sets three characters
await loadCjkFonts({ [KAI]: FONTS[KAI] }, blocks('meipi') + blocks('note'), { vertical: true });
await loadCjkFonts({ [HEI]: FONTS[HEI] }, `脂硯齋重評石頭記第一回${numerals}${blocks('colophon')}`,
  { vertical: true });
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'A red-ink commentary edition',
  es: 'Una edición comentada en rojo' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
