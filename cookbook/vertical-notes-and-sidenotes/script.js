// ═══ Postext Cookbook · Nº 121 · Notes beside a vertical Japanese text, across the spread ══
// https://postext.dev/en/cookbook/vertical-notes-and-sidenotes
// Code: MIT · Text: 樋口一葉『たけくらべ』, Aozora Bunko 389 (PD); notes CC BY 4.0 · Pictures: none
// Fonts: Shippori Mincho, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the story is Japanese in both
const RECIPE = 'vertical-notes-and-sidenotes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, a muted plum for the note numbers' rule, cream paper
const palette = {
  ink: '#211d1b', // the text and the notes
  plum: '#6b3a55', // 紫: the rule over the notes, the engine's defaults
  muted: '#6b645d', // the hashira and the folios
  paper: '#fbf7ef',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.plum, model: 'hex' } },
];
// #endregion
const [MINCHO, GOTHIC] = ['Shippori Mincho', 'Noto Sans JP'];
const [BODY, LEAD, CHARS, LINES] = [9.25, 16.25, 42, 17]; // pt, pt: 四六判 42字 × 17行
const lines = (n) => pt(n * LEAD);

// #region answer: 傍注, the notes of both pages of a spread at the fore-edge of the left one
// placement 'spread' gathers the notes cited on the two pages of a spread at the end of the
// left-hand page's text, the fore-edge in a book bound on the right, under a rule a third of
// the line long, and numbers them per spread. The marker （1） stands small at the right of
// the line, its digits upright, and the note opens with its number and a full note-em.
const footnotes = {
  placement: 'spread', // 傍注; 'chapterEnd' sets 後注 after the chapter instead
  numbering: 'spread',
  markerPosition: 'right', markerTemplate: '（{n}）', // written out: 'ja' sets them so
  numberGap: 'em', hangingIndent: em(2), // turnovers clear the number
  fontSize: em(0.8), lineHeight: em(1.5),
  separator: { width: 1 / 3, lineWidth: pt(0.5), color: col('plum') },
};
// Ichiyō's sesame marks (傍点) over ぎつちよんちよん: the mark Japan uses, right of the line.
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  emphasisMark: { style: 'sesame', position: 'over' },
};
// #endregion

// #region opener: a title page (扉) on its own, so the story opens on a spread
// Page-anchored design on a vertical page: x runs down the page from its top edge, y across
// it leftwards from its right edge. The title stands on the page's axis, the author lower.
const PT = 25.4 / 72; // mm in a point
const page = (down, across) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(down), y: mm(across) } });
const TITLE = 26; // pt
// parity 'any': the story opens on the next page, either side (the default waits for a recto).
const story = { level: 1, breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: lines(LINES), slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: MINCHO, fontWeight: 700,
      fontSize: pt(TITLE), lineHeight: 1, letterSpacing: pt(TITLE / 2), color: col('ink'),
      placement: page(42, 127 / 2 - (TITLE * PT) / 2) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6), color: col('plum'),
      placement: { ...page(42, 127 / 2 + (TITLE * PT) / 2 + 5), size: { width: mm(24) } } },
    { kind: 'text', id: 'author', content: '{author}', fontFamily: MINCHO, fontSize: pt(12),
      letterSpacing: pt(4), color: col('ink'),
      placement: page(118, 127 / 2 + (TITLE * PT) / 2 + 3) },
  ] } } };
const section = { level: 2, fontFamily: MINCHO, fontWeight: 700, fontSize: pt(11),
  lineSpan: 3, indent: em(7) }; // 3行取り, seven characters down, as the Aozora text marks it
// #endregion

// #region furniture: the hashira and kanji folios down the fore-edge
const foreEdge = (id, content, parity, edge, y, pages) => ({
  kind: 'text', id, content, parity, pages, writingMode: 'vertical-rl',
  fontFamily: GOTHIC, fontSize: pt(7), letterSpacing: pt(1), color: col('muted'),
  overflow: 'clip', placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
});
const header = { elements: [
  foreEdge('hashira', '{title}', 'odd', 'top', 2, 'body'),
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -2, 'body'),
] };
// The title page carries the colophon across the foot, in the edition's language.
const footer = { elements: [{ kind: 'text', id: 'colophon', content: '{attr.colophon}',
  pages: 'opener', fontFamily: GOTHIC, fontSize: pt(5.5), lineHeight: 1.45,
  color: col('muted'), overflow: 'wrap', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-6) },
    size: { width: mm(100) } } }] };
// #endregion

const config = () => ({
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(127), height: mm(188), dpi: 150, // 四六判
    backgroundColor: col('paper'),
    margins: { top: mm(27), bottom: mm(21), left: mm(13), right: mm(16), mirror: true },
    pageNumbering: { format: 'japanese-informal' },
  },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  cjk,
  footnotes,
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: { fontFamily: MINCHO, color: col('ink'), levels: [story, section] },
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Shippori Mincho': ['400', '700'], // the text and the notes; the title and 一
  'Noto Sans JP': ['400'], // the hashira, the folios and the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const title = markdown.match(/^title: "(.*)"$/m)[1];
const author = markdown.match(/^author: "(.*)"$/m)[1];
await loadFonts(FONTS, markdown); // the Latin files: the colophon
// The notes' （1） and their upright digits come from the text face too.
await loadCjkFonts({ [MINCHO]: ['400'] }, `${markdown}（）0123456789`, { vertical: true });
await loadCjkFonts({ [MINCHO]: ['700'] }, `${title}${author}一`);
await loadCjkFonts({ [GOTHIC]: ['400'] },
  `${title}${markdown.match(/colophon="([^"]*)"/)[1]}一二三四五六七八九十`, { vertical: true });
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Notes beside a vertical Japanese text, across the spread',
  es: 'Notas junto a un texto japonés vertical, en la doble página' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
