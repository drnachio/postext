// ═══ Postext Cookbook · Nº 126 · A Japanese index in gojūon order, read from its readings ═══
// https://postext.dev/en/cookbook/gojuon-index
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Noto Serif JP, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.16.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the chapter is Japanese in both
const RECIPE = 'gojuon-index';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, one vermilion for the row heads and the chapter label, pale rules
const palette = {
  ink: '#211e1c', // text: a warm near-black
  vermilion: '#b33a22', // the one accent: あ行 heads, the kicker, folios
  tint: '#f5ece6', // the index heading's band
  rule: '#d3c8c0', // the rule under each title
  muted: '#6c625b', // running heads, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.vermilion })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [MINCHO, GOTHIC] = ['Noto Serif JP', 'Noto Sans JP'];
const [BODY, PITCH] = [9, 16]; // pt: 9 pt text on a 16 pt line
const [CHARS, LINES] = [36, 28]; // the type area in characters

// #region answer: the index in gojūon order: by reading, under あ行 か行 さ行…
// Each mark gives the reading the entry sorts by. A term written with furigana gives it
// itself: :index[{版面|はん|めん}] files 版面 as はんめん. Any other term with a kanji says it
// with yomi: :index[明朝体]{yomi="みんちょうたい"}. Kana and Latin terms need nothing. The
// reading orders the entries in JIS X 4061 order (katakana as hiragana, small kana as large,
// voiced after plain, ー as the vowel before it); Latin terms come first, under A to Z.
const index = {
  groupBy: 'gojuon', // what 'auto' picks in a 'ja' document: heads あ行 か行 さ行 …
  fontFamily: MINCHO, fontSize: pt(8.5), lineHeight: pt(14),
  separator: '　', locatorSeparator: '、', // 版面　3、5: an ideographic space, then 、
  see: { italic: false }, // → ルビ, → 柱も見よ: upright, no italic in Japanese
  groups: { fontFamily: GOTHIC, fontSize: pt(9), fontWeight: 700, color: col('vermilion'),
    marginTop: pt(8) },
};
// #endregion

// #region opener: the chapter label, the title and a short rule; the index's on a band
const band = { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint') },
  placement: { anchor: { to: 'page', edge: 'top-left' },
    size: { width: 'fill', height: mm(56) } } };
const opener = (sink, ground = []) => ({ enabled: true, minHeight: pt(PITCH * sink),
  slot: { elements: [...ground,
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: GOTHIC, fontSize: pt(9),
    fontWeight: 700, letterSpacing: pt(2), color: col('vermilion'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(10) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: GOTHIC, fontSize: pt(22),
    fontWeight: 700, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(3) } } },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5),
    color: col('vermilion'), placement: { anchor: { to: '#title', edge: 'below' },
      offset: { y: mm(4) }, size: { width: mm(12) } } },
] } });
// #endregion

// Running heads: the book on the verso, the chapter on the recto, folios outside.
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: GOTHIC, fontSize: pt(7.5), color: col('muted'),
  align: edge.endsWith('left') ? 'left' : 'right', placement: { anchor: { to: 'container',
    edge }, offset: { x: mm(x), y: mm(12) } }, ...extra });
const folio = { fontWeight: 700, color: col('vermilion') };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  index,
  page: { sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5
    margins: { top: mm(23), bottom: mm(19), left: mm(18), right: mm(15), mirror: true } },
  layout: { layoutType: 'single' },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
    ruby: { fontSize: em(0.5) } }, // furigana on a term's first mention, in the 7 pt gap
  bodyText: { fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(PITCH), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true, avoidRunts: true },
  headings: { fontFamily: GOTHIC, fontWeight: 700, color: col('ink'),
    balancing: { enabled: false }, // heads stay on the grid
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, breakBefore: { enabled: true, parity: 'odd' }, advancedDesign: opener(6) },
      { level: 2, numberingTemplate: '{1}.{2}', numberSeparator: '　', fontSize: pt(10.5),
        lineSpan: 3 }, // 3行取り
    ] },
  headingStyles: [{ id: 'index', numbered: false, span: 'page', // the title over both columns
    breakBefore: { enabled: true, parity: 'any' },
    advancedDesign: opener(5, [band]), // two columns, two characters apart
    layout: { layoutType: 'double', gutterWidth: pt(2 * BODY) } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: GOTHIC, fontSize: pt(6.5), lineHeight: pt(9),
    color: col('muted'), firstLineIndent: pt(0), textAlign: 'left', marginTop: pt(PITCH) }],
  header: { elements: [
    head('v-folio', '{pageNumber}', 'even', 'top-left', 0, folio),
    head('v-title', '{title}', 'even', 'top-left', 8),
    head('r-title', '{chapterTitle}', 'odd', 'top-right', -8),
    head('r-folio', '{pageNumber}', 'odd', 'top-right', 0, folio),
  ] },
  footer: { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
    pages: 'opener', fontFamily: GOTHIC, fontSize: pt(7.5), fontWeight: 700,
    color: col('vermilion'), align: 'center', placement: { anchor: { to: 'container',
      edge: 'bottom' }, offset: { y: mm(-10) } } }] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese chapter in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif JP': ['400', '700'], // 明朝: the text and the index, its main pages bold
  'Noto Sans JP': ['400', '700'], // ゴシック: titles, heads, row heads, folios, colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each face loads the files of what it sets (gotcha: cjk-fonts-slices): the gothic the heads
// and the row heads the index prints, あ行 to わ行 and A to Z.
const all = (re) => (markdown.match(re) ?? []).join('');
const ROWS = 'あかさたなはまやらわ行ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, `${markdown}→も見よ、`);
await loadCjkFonts({ [GOTHIC]: FONTS[GOTHIC] },
  `${all(/^#+ .*$/gm)}${all(/colophon"\}\n[^\n]*/g)}組版の言葉${ROWS}`);
// Page 1 is page 9 of the book, a recto; the index follows the chapter.
const continuation = { pageIndexOffset: 8, pageNumbering: { startAt: 9 } };
const doc = await buildWithFonts(() => buildDocument({ markdown, continuation }, config()),
  markdown);
showPages(doc, { title: t({ en: 'A Japanese index in gojūon order',
  es: 'Un índice japonés en orden gojūon' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
