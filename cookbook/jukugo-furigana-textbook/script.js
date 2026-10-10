// ═══ Postext Cookbook · Nº 124 · A school reader with furigana: per character, per word ═══
// https://postext.dev/en/cookbook/jukugo-furigana-textbook
// Code: MIT · Text: 新美南吉「ごん狐」(1932), Aozora Bunko 628 (PD); readings: CC BY 4.0
// Fonts: Klee One, Zen Maru Gothic (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the story is Japanese in both
const RECIPE = 'jukugo-furigana-textbook';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: an autumn reader: ink, the red of the higanbana, a pale straw ground
const palette = {
  ink: '#2a2420', // text: a warm near-black
  red: '#b2402c', // the one accent: the unit badge, the section numbers, the box title
  reading: '#5a4e45', // the furigana, a shade off the ink so the two layers part
  straw: '#f6ecd6', // the opener band and the box
  muted: '#7a6d62', // folios, the series line, the colophon
  paper: '#fffdf8',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.red })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, ROUND] = ['Klee One', 'Zen Maru Gothic']; // 教科書体-like text, rounded gothic
const [SIZE, PITCH] = [14, 28]; // pt: a fourth-year reader's size, on a line twice as tall
const [CHARS, LINES] = [28, 21]; // the type area in characters

// #region answer: readings over every kanji: by character, by word, jukugo, JIS 1:2:1
// In a document tagged 'ja' the compact {漢字|かん|じ} (one reading per character) is jukugo
// ruby: each reading stays over its own kanji when it fits, and when one is longer it may run
// onto the next kanji of the same word; a break may fall between the two. {百舌鳥|もず} (one
// reading for the word) is group ruby, spread over the word 1:2:1. :ruby[菜種]{rt="な たね"
// mode=jukugo} says the same as the compact form; mode=mono keeps each reading to its kanji.
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  ruby: {
    fontSize: em(0.5), // 7 pt: half the text, the size JLReq gives furigana
    color: col('reading'),
    align: 'jis', // a reading shorter than its base: ½ unit at each end, 1 between (1:2:1)
    overhang: 'kana', // a longer reading may run one ruby character onto a kana, never a kanji
    smallKana: 'keep', // ひょう with its small ょ, as today's books print it
  },
};
// The line gap (28 − 14 = 14 pt) holds a 7 pt reading with room to spare: no line moves for one.
const bodyText = {
  fontFamily: TEXT, fontSize: pt(SIZE), lineHeight: pt(PITCH), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  avoidRunts: true, // no paragraph ends on one character
};
// #endregion

// #region opener: a straw band with the unit badge, the title and the author's name in kana
// Design text sets no furigana (gotcha: ruby-not-in-designs): the author's reading is a
// line of its own.
const BAND = 92; // mm from the trim's top
const opener = { enabled: true, minHeight: pt(PITCH * 6), slot: { elements: [
  { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('straw') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND) } } },
  { kind: 'text', id: 'unit', content: '{attr.unit}', fontFamily: ROUND, fontSize: pt(16),
    fontWeight: 700, color: col('paper'), align: 'center', verticalAlign: 'middle',
    overflow: 'clip', box: { backgroundColor: col('red'), borderRadius: mm(6) },
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(-2) },
      size: { width: mm(12), height: mm(12) } } },
  { kind: 'text', id: 'series', content: '{title}', fontFamily: ROUND, fontSize: pt(9),
    fontWeight: 700, letterSpacing: pt(2), color: col('red'), align: 'left',
    verticalAlign: 'middle', placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(16), y: mm(-2) }, size: { width: mm(80), height: mm(12) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: ROUND, fontSize: pt(48),
    lineHeight: 1.1, fontWeight: 700, color: col('ink'), align: 'left',
    placement: { anchor: { to: '#unit', edge: 'below' }, offset: { y: mm(7) } } },
  { kind: 'text', id: 'kana', content: '{attr.kana}', fontFamily: ROUND, fontSize: pt(8),
    letterSpacing: pt(1), color: col('muted'), align: 'left',
    placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(5) } } },
  { kind: 'text', id: 'author', content: '{attr.author}　作', fontFamily: ROUND,
    fontSize: pt(13), fontWeight: 500, color: col('ink'), align: 'left',
    placement: { anchor: { to: '#kana', edge: 'below' }, offset: { y: mm(1) } } },
] } };
// #endregion

// Folios at the outer foot, the series beside them.
const foot = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  fontFamily: ROUND, fontSize: pt(9), color: col('muted'), align: edge.endsWith('left')
    ? 'left' : 'right', placement: { anchor: { to: 'container', edge }, offset: { x: mm(x),
    y: mm(-12) } }, ...extra });
const folio = { fontWeight: 700, color: col('red') };

const config = () => ({
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(182), height: mm(257), dpi: 150, // B5
    backgroundColor: col('paper'),
    // Minimums: the grid centres its 28 × 21 area (138 × 207 mm) in what they leave.
    margins: { top: mm(26), bottom: mm(22), left: mm(20), right: mm(20), mirror: true } },
  layout: { layoutType: 'single' },
  cjk,
  bodyText,
  headings: { fontFamily: ROUND, fontWeight: 700, color: col('red'),
    balancing: { enabled: false }, // nothing added above heads: the grid holds
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
      { level: 2, fontSize: pt(16), lineSpan: 2 }, // 一, 二…: two lines of the grid
    ] },
  calloutStyles: [{ id: 'words', background: col('straw'), borderRadius: mm(3),
    snapToGrid: false, marginTop: pt(PITCH), marginBottom: pt(0),
    padding: { top: mm(4), right: mm(6), bottom: mm(3), left: mm(6) },
    titleStyle: { fontFamily: ROUND, fontSize: pt(11), fontWeight: 700, color: col('red') },
    body: { fontFamily: TEXT, fontSize: pt(13), lineHeight: pt(28), color: col('ink'),
      firstLineIndent: pt(0), textAlign: 'left' } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: ROUND, fontSize: pt(6.5), lineHeight: pt(9),
    color: col('muted'), firstLineIndent: pt(0), textAlign: 'left', marginTop: mm(4) }],
  header: { elements: [] },
  footer: { elements: [
    foot('v-folio', '{pageNumber}', 'even', 'bottom-left', 0, folio),
    foot('v-series', '{title}', 'even', 'bottom-left', 9),
    foot('r-series', '{chapterTitle}', 'odd', 'bottom-right', -9),
    foot('r-folio', '{pageNumber}', 'odd', 'bottom-right', 0, folio),
  ] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese page in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Klee One': ['400'], // the text and its readings: the hand of a school textbook
  'Zen Maru Gothic': ['400', '500', '700'], // the title, heads, badge, box title, folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each face loads the files of what it sets (gotcha: cjk-fonts-slices).
const all = (re) => (markdown.match(re) ?? []).join('');
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [TEXT]: FONTS[TEXT] }, markdown);
await loadCjkFonts({ [ROUND]: FONTS[ROUND] },
  `${all(/^#.*$/gm)}${all(/title="[^"]*"/g)}${all(/colophon"\}\n[^\n]*/g)}よみもの四年作0123456789`);
// Page 1 is page 24 of the reader, a verso: the lesson opens on a spread.
const continuation = { pageIndexOffset: 23, pageNumbering: { startAt: 24 } };
const doc = await withLoadedFonts(() => buildDocument({ markdown, continuation }, config()),
  { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ en: 'A school reader with furigana',
  es: 'Un libro de lectura con furigana' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
