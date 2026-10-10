// ═══ Postext Cookbook · Nº 122 · Kanbun with its reading marks, and the Japanese reading ═══
// https://postext.dev/en/cookbook/kanbun-kundoku
// Code: MIT · Text: 論語, 孟浩然「春暁」 (public domain); kunten and readings CC BY 4.0
// Fonts: Zen Old Mincho, Klee One, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the page is Japanese in both
const RECIPE = 'kanbun-kundoku';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, the vermilion of hand-written kunten, a school-book paper
const palette = {
  ink: '#1e1c1a', // the text
  vermilion: '#c0392b', // 朱: the reading marks, as a reader adds them by hand
  muted: '#6a635c', // the headings' labels, the folios
  paper: '#fcfbf7',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.vermilion, model: 'hex' } },
];
// #endregion
const [MINCHO, KYOKASHO, GOTHIC] = ['Zen Old Mincho', 'Klee One', 'Noto Sans JP'];
const [BODY, LEAD, CHARS, LINES] = [10.5, 21, 36, 16]; // pt, pt: 36字 × 16行, a 2 em pitch
const KANBUN = 15; // pt: the classical text, set larger on two lines of the grid

// #region answer: kanbun with 返り点 and 送り仮名, its yomikudashi beside it in furigana
// :kunten[習]{kaeri="レ" okuri="フ"} sets the return mark small at the character's lower
// left and the okurigana at its lower right, down the line; the text keeps its Chinese
// order, which the reader follows by the marks. cjk.kunten sizes and colours them: half
// the character, in vermilion. The Japanese reading under each passage is plain kana and
// kanji with furigana: {君子|くん|し} gives each character its reading (jukugo ruby).
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  kunten: { fontSize: em(0.5), color: col('vermilion'), placement: 'inline' },
};
const paragraphStyles = [
  // The text: 15 pt on a pitch of two grid lines, room for the okurigana beside it. A
  // quatrain takes two lines, a couplet to the line with a space between its verses.
  { id: 'kanbun', fontFamily: MINCHO, fontSize: pt(KANBUN), lineHeight: pt(2 * LEAD),
    firstLineIndent: em(0), textAlign: 'justify' },
  { id: 'shi', fontFamily: MINCHO, fontSize: pt(KANBUN), lineHeight: pt(2 * LEAD),
    indent: em(2), firstLineIndent: em(0), marginTop: pt(0), marginBottom: pt(0) },
  // The reading (書き下し文), two characters down in a school-book hand.
  { id: 'kudashi', indent: em(2), firstLineIndent: em(0), marginTop: pt(LEAD) },
  { id: 'kudashi-shi', indent: em(4), firstLineIndent: em(0), marginTop: pt(0),
    marginBottom: pt(0) },
];
// #endregion

// #region headings: each part opens a page; each passage under a two-line label
const at = (down, across) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: pt(down), y: pt(across) } });
const TITLE = 26; // pt
// gotcha: headings-drop-h1-break
const part = { level: 1, breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: pt(5 * LEAD), slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: MINCHO, fontWeight: 700,
      fontSize: pt(TITLE), lineHeight: 1, letterSpacing: pt(TITLE / 2), color: col('ink'),
      placement: at(2 * BODY, 2 * LEAD - TITLE / 2) },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: GOTHIC, fontSize: pt(8.5),
      letterSpacing: pt(2), color: col('vermilion'), placement: at(2 * BODY + 3 * TITLE + 18,
        2 * LEAD - 8.5 / 2) },
  ] } } };
// 2行取り, the passage's book and number in gothic, two characters down.
const passage = { level: 2, fontFamily: GOTHIC, fontWeight: 700, fontSize: pt(9.5),
  color: col('muted'), lineSpan: 2, indent: em(2) };
// #endregion

const foreEdge = (id, content, edge, y, pages) => ({ kind: 'text', id, content, pages,
  writingMode: 'vertical-rl', fontFamily: GOTHIC, fontSize: pt(7.5), letterSpacing: pt(1),
  color: col('muted'), placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } } });
const header = { elements: [
  foreEdge('hashira', '{title}　{chapterTitle}', 'top', 3, 'body'),
  foreEdge('folio', '{pageNumber}', 'bottom', -3, 'all'),
] };
// The first part's opening page carries the colophon across the foot.
const first = { id: 'first', footer: { elements: [{ kind: 'text', id: 'colophon',
  content: '{attr.colophon}', pages: 'opener', fontFamily: GOTHIC, fontSize: pt(5.5),
  lineHeight: 1.45, color: col('muted'), overflow: 'wrap', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-7) },
    size: { width: mm(118) } } }] } };

const config = () => ({
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5
    backgroundColor: col('paper'),
    margins: { top: mm(40), bottom: mm(32), left: mm(13), right: mm(16), mirror: true },
    pageNumbering: { format: 'japanese-informal' },
  },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  cjk,
  bodyText: {
    fontFamily: KYOKASHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: { fontFamily: MINCHO, color: col('ink'), levels: [part, passage] },
  headingStyles: [first],
  paragraphStyles,
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Zen Old Mincho': ['400', '700'], // the classical text and its marks; the part titles
  'Klee One': ['400'], // the reading, in a school-book hand
  'Noto Sans JP': ['400', '700'], // labels, the hashira and folios, the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files that hold the characters it sets
const FENCE = /:::paragraphs\{style="([\w-]+)"\}\n([\s\S]*?)\n:::/g;
const fence = (style) => [...markdown.matchAll(FENCE)].filter((m) => m[1] === style)
  .map((m) => m[2]).join('');
const kanbun = `${fence('kanbun')}${fence('shi')}`; // the text and its marks' kana
const reading = `${fence('kudashi')}${fence('kudashi-shi')}`;
const heads = markdown.match(/^#+ [^{\n]*/gm).join('');
const colophon = markdown.match(/colophon="([^"]*)"/)[1];
await loadFonts(FONTS, markdown); // the Latin files: the colophon
await loadCjkFonts({ [MINCHO]: ['400'] }, kanbun, { vertical: true });
await loadCjkFonts({ [MINCHO]: ['700'] }, heads);
await loadCjkFonts({ [KYOKASHO]: ['400'] }, reading, { vertical: true });
await loadCjkFonts({ [GOTHIC]: ['400', '700'] },
  `${heads}${colophon}${markdown.match(/kicker="([^"]*)"/)[1]}漢文訓読一二三四五六七八九十`,
  { vertical: true });
// #endregion
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Kanbun with its reading marks, and the Japanese reading',
  es: 'Kanbun con sus marcas de lectura y la lectura japonesa' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
