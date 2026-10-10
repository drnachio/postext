// ═══ Postext Cookbook · Nº 120 · A story on genkō yōshi, one character to a square ═══
// https://postext.dev/en/cookbook/genko-yoshi-manuscript
// Code: MIT · Text: 夏目漱石『坊っちゃん』, Aozora Bunko 752 (public domain) · Pictures: none
// Fonts: Klee One, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the manuscript is Japanese in both
const RECIPE = 'genko-yoshi-manuscript';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: blue-black ink on a sheet ruled in red-brown
const palette = {
  ink: '#1f2a44', // the pen: a blue-black
  ruling: '#b0573f', // the sheet's printed frame, its label
  muted: '#7b6f66', // the sheet number
  paper: '#fdfaf3',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.ruling, model: 'hex' } },
];
// #endregion
const PEN = 'Klee One'; // a pen-written kaisho with Japanese forms
const [CELL, PITCH, N] = [20, 27, 20]; // pt: a 7 mm square, a 2.5 mm strip beside each line
const PT = 25.4 / 72; // mm in a point
const SHEET = { w: 230, h: 200 }; // mm
const GRID = { down: N * CELL * PT, across: N * PITCH * PT }; // 141.1 × 190.5 mm
const MARGIN = { top: 32, side: (SHEET.w - GRID.across) / 2 }; // mm
// The margins handed to the page are a hair smaller: the grid takes them as minimums and
// grows them back, where an exact fit could round to 19 lines.
const SLACK = 0.5; // mm

// #region answer: 20 squares down 20 lines, the squares drawn, every character in one
// The grid makes the type area 20 characters of 20 pt down and 20 lines of 27 pt across, and
// show draws its squares. The marks are set full width with nothing squeezed, so each
// character, mark or bracket fills its own square, as on manuscript paper (原稿用紙).
const cjk = {
  grid: { enabled: true, charsPerLine: N, linesPerPage: N, show: true },
  compressAdjacent: false, // 。」 take two squares, not one and a half
  trimLineStart: false, // a bracket at the head of a line keeps its square
  // The manuscript rule: a small kana or ー may head a line (each has its own square), but
  // never 、。 or a closing bracket: such a mark is written in the last square of the line
  // before, hanging below it here, and no line is squeezed to take it in.
  lineBreak: 'ja-loose',
  hangingPunctuation: 'force',
};
// #endregion

// #region heading: the title two squares down, the name a square above the foot
// The title on the first line, two squares down; the writer's name on the second, ending a
// square above the foot (地から一字上げ), a blank square between family and given names.
// lineSpan: 1 keeps the title on one line of the grid, in the text's own size and face.
const title = { level: 1, fontFamily: PEN, fontSize: pt(CELL), fontWeight: 400, lineSpan: 1,
  indent: em(2), breakBefore: { enabled: true, parity: 'any' } }; // gotcha: headings-drop-h1-break
const paragraphStyles = [
  { id: 'name', textAlign: 'end', endIndent: em(1), firstLineIndent: em(0) },
];
// #endregion

// #region sheet: the printed frame round the squares, the sheet number and the paper's label
// The header is drawn on the sheet itself, not in the turned frame of the text: x runs right
// from the left edge, y down from the top. The frame stands 1.5 mm off the squares and 8 mm
// below them, where a 、 or 。 that cannot head a line is written outside the last square.
const box = (id, inset, foot, thickness) => ({ kind: 'box', id, pages: 'all',
  placement: { anchor: { to: 'page', edge: 'top-left' },
    offset: { x: mm(MARGIN.side - inset), y: mm(MARGIN.top - inset) },
    size: { width: mm(GRID.across + 2 * inset), height: mm(GRID.down + inset + foot) } },
  style: { borderColor: col('ruling'), borderWidth: pt(thickness) } });
const FOOT = MARGIN.top + GRID.down + 8; // mm: the frame's foot
const below = (id, content, x, extra) => ({ kind: 'text', id, content, pages: 'all',
  placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(FOOT + 3) } },
  ...extra });
const header = { elements: [
  box('outer', 2.6, 9.1, 1.2), box('inner', 1.5, 8, 0.4),
  // The sheet number, as a writer numbers the sheets; the paper's printed label.
  below('sheet', '（{pageNumber}）', MARGIN.side, { fontFamily: PEN, fontSize: pt(9),
    color: col('muted') }),
  below('label', '20×20', MARGIN.side + GRID.across - 12, { fontFamily: 'Noto Sans JP',
    fontSize: pt(7), letterSpacing: pt(0.5), color: col('ruling') }),
] };
const footer = { elements: [{ kind: 'text', id: 'colophon', content: '{attr.colophon}',
  pages: 'opener', fontFamily: 'Noto Sans JP', fontSize: pt(6), lineHeight: 1.4,
  color: col('muted'), overflow: 'wrap', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-5) },
    size: { width: mm(120) } } }] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(SHEET.w), height: mm(SHEET.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top - SLACK), bottom: mm(SHEET.h - MARGIN.top - GRID.down - SLACK),
      left: mm(MARGIN.side - SLACK), right: mm(MARGIN.side - SLACK) },
  },
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  cjk,
  bodyText: {
    fontFamily: PEN, fontSize: pt(CELL), lineHeight: pt(PITCH), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: em(1), indentAfterHeading: true, // a blank square
  },
  headings: { fontFamily: PEN, color: col('ink'), levels: [title] },
  paragraphStyles,
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Klee One': ['400'], // the manuscript
  'Noto Sans JP': ['400'], // the sheet's printed label and the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region pen: a pen-written face, loaded with the characters the sheets set
// Klee One draws the strokes of a pen, with the Japanese forms of the kanji; its vertical
// forms put 、。 in the upper right of their square and turn ー and the brackets.
const colophon = markdown.match(/colophon="([^"]*)"/)[1];
await loadFonts(FONTS, markdown); // the Latin files: the colophon
await loadCjkFonts({ [PEN]: ['400'] }, `${markdown}（）一二三四五六七八九十`, { vertical: true });
await loadCjkFonts({ 'Noto Sans JP': ['400'] }, `20×20${colophon}`);
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'A story on genkō yōshi, one character to a square',
  es: 'Un relato en genkō yōshi, un carácter por casilla' }) });
// The PDF draws the squares only when asked: a grid is a screen aid in a book, the page here.
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, characterGrid: true }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
