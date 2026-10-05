// ═══ Postext Cookbook · Nº 119 · Haiku and tanka set vertically ═══════════════════
// https://postext.dev/en/cookbook/haiku-and-tanka
// Code: MIT · Text: 芭蕉『おくのほそ道』, 啄木『一握の砂』, Aozora Bunko (PD) · Pictures: none
// Fonts: Shippori Mincho, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.16.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the poems are Japanese in both
const RECIPE = 'haiku-and-tanka';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, one persimmon, a soft poetry stock
const palette = {
  ink: '#22201d', // the poems
  persimmon: '#b5512c', // 柿: the part titles' rule and the ornaments
  muted: '#6a645c', // the hashira, the folios, the colophon
  paper: '#fbf8f1',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.persimmon, model: 'hex' } },
];
// #endregion
// Shippori Mincho: it has the 〻 of 日〻 and 人〻, which Zen Old Mincho lacks.
const [MINCHO, GOTHIC] = ['Shippori Mincho', 'Noto Sans JP'];
const [BODY, LEAD, CHARS, LINES] = [10, 19, 36, 14]; // pt, pt: 36字 × 14行, a 1.9 em pitch
const lines = (n) => pt(n * LEAD);

// #region answer: a haiku on one line three characters down, a tanka in three, 地付き names
// Each line of verse is a paragraph of its own, so a style sets where it starts. A haiku
// stands three characters down from the head of the line; Takuboku's tanka keep his three
// lines, two down; 曾良 signs his haiku raised five characters from the foot (地から五字上げ).
const paragraphStyles = [
  { id: 'haiku', indent: em(3), firstLineIndent: em(0), marginTop: pt(0), marginBottom: pt(0) },
  { id: 'tanka', indent: em(2), firstLineIndent: em(0), marginTop: pt(0), marginBottom: pt(0) },
  { id: 'by', textAlign: 'end', endIndent: em(5), firstLineIndent: em(0) },
  // The ornament between groups of poems, in the middle of its line.
  { id: 'ornament', textAlign: 'center', firstLineIndent: em(0), color: col('persimmon') },
];
//   :::paragraphs{style="haiku"}       :::paragraphs{style="by"}
//   夏草や兵どもが夢の跡                   曾良
//   :::                                :::
// #endregion

// #region tanka: a box with nothing drawn round it keeps each tanka on one page
// Postext has no hard line break and never keeps one paragraph with the next, so each tanka
// sits in a box with nothing drawn round it: a box moves on whole (keepTogether, its
// default), and a tanka is never cut at the foot of a page. One blank line follows each.
//   :::callout{type="tanka"}  :::paragraphs{style="tanka"} … three lines …  :::  :::
const calloutStyles = [{ id: 'tanka', backgroundEnabled: false, keepTogether: true,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  marginTop: pt(0), marginBottom: pt(LEAD),
  body: { fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    firstLineIndent: em(0) } }];
// #endregion

// #region places: the place names take two lines, spaced to three characters
// The place names over the prose take two lines (2行取り), four characters down, and a
// two-character name is spaced out to three (字取り: 平泉 → 平　泉), so they all end level.
const place = {
  level: 2, fontFamily: MINCHO, fontWeight: 700, fontSize: pt(11),
  lineSpan: 2, indent: em(4), jidori: 3,
};
// #endregion

// #region part: each part opens a page with its title, （抄） and the poet at the foot
// A design on a vertical page is laid out in the flow frame: x runs down the column from
// the head of the type area, y across the page leftwards from its right edge.
const at = (down, across) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: pt(down), y: pt(across) } });
const TITLE = 18; // pt
const part = {
  level: 1, breakBefore: { enabled: true, parity: 'any' }, // gotcha: headings-drop-h1-break
  advancedDesign: { enabled: true, minHeight: lines(5), slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: MINCHO, fontWeight: 700,
      fontSize: pt(TITLE), lineHeight: 1, letterSpacing: pt(4), color: col('ink'),
      placement: at(3 * BODY, 1.5 * LEAD - TITLE / 2) },
    { kind: 'text', id: 'abridged', content: '（抄）', fontFamily: MINCHO, fontSize: pt(9),
      color: col('ink'), placement: { anchor: { to: '#title', edge: 'right-of' },
        offset: { x: pt(6), y: pt((TITLE - 9) / 2) } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6),
      color: col('persimmon'), placement: { ...at(3 * BODY, 2.5 * LEAD),
        size: { width: pt(4 * TITLE) } } },
    { kind: 'text', id: 'poet', content: '{attr.author}', fontFamily: MINCHO, fontSize: pt(11),
      letterSpacing: pt(3), color: col('ink'),
      placement: at(CHARS * BODY - 4 * 11 - 3 * 3 - 2 * BODY, 3.5 * LEAD - 11 / 2) },
  ] } },
};
// #endregion

// #region furniture: the book's title down the fore-edge, the folio below it
const foreEdge = (id, content, parity, edge, y, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', writingMode: 'vertical-rl',
  fontFamily: GOTHIC, fontSize: pt(7), letterSpacing: pt(1), color: col('muted'),
  overflow: 'clip', placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
  ...extra,
});
const header = { elements: [
  foreEdge('book', '{title}', 'even', 'top', 3),
  foreEdge('part', '{chapterTitle}', 'odd', 'top', 3),
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -3, { pages: 'all' }),
] };
const none = { elements: [] };
// The first part's opening page carries the colophon across the foot.
const first = { id: 'first', footer: { elements: [{ kind: 'text', id: 'colophon',
  content: '{attr.colophon}', pages: 'opener', fontFamily: GOTHIC, fontSize: pt(5.5),
  lineHeight: 1.45, color: col('muted'), overflow: 'wrap', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-7) },
    size: { width: mm(100) } } }] } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(127), height: mm(188), dpi: 150, // 四六判
    backgroundColor: col('paper'),
    margins: { top: mm(32), bottom: mm(24), left: mm(15), right: mm(17), mirror: true },
    pageNumbering: { format: 'japanese-informal' },
  },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } },
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: { fontFamily: MINCHO, color: col('ink'), levels: [part, place] },
  headingStyles: [first],
  paragraphStyles,
  calloutStyles,
  header,
  footer: none,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Shippori Mincho': ['400', '700'], // the poems and the prose; the titles
  'Noto Sans JP': ['400'], // the hashira, the folios and the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files that hold the characters it sets
const title = markdown.match(/^title: "(.*)"$/m)[1];
const heads = markdown.match(/^#+ [^{\n]*/gm).join('');
await loadFonts(FONTS, markdown); // the Latin files: the colophon
await loadCjkFonts({ [MINCHO]: ['400'] }, markdown, { vertical: true });
await loadCjkFonts({ [MINCHO]: ['700'] }, heads);
await loadCjkFonts({ [GOTHIC]: ['400'] },
  `${title}${heads}${markdown.match(/colophon="([^"]*)"/)[1]}一二三四五六七八九十`, { vertical: true });
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'Haiku and tanka set vertically',
  es: 'Haikus y tankas compuestos en vertical' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
