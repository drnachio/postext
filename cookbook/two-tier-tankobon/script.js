// ═══ Postext Cookbook · Nº 118 · A Japanese story in two tiers, its title across both ═══
// https://postext.dev/en/cookbook/two-tier-tankobon
// Code: MIT · Text: 芥川龍之介『蜘蛛の糸』『尾生の信』, Aozora Bunko 92, 24 (PD) · Pictures: none
// Fonts: Noto Serif JP, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the stories are Japanese in both
const RECIPE = 'two-tier-tankobon';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, one deep indigo, a warm book paper
const palette = {
  ink: '#1d1b19', // the text
  indigo: '#2f3d63', // 藍: the cloth of the case; the engine's defaults
  rule: '#8c857b', // the hairline between the two tiers
  muted: '#655e56', // the hashira and the folios
  paper: '#fcfaf4',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.indigo, model: 'hex' } },
];
// #endregion
const [MINCHO, GOTHIC] = ['Noto Serif JP', 'Noto Sans JP'];
const [BODY, LEAD, CHARS, LINES] = [9, 15.75, 25, 21]; // pt, pt: 2 段 × 25字 × 21行
const HEIGHT = 2 * CHARS * BODY + 2 * BODY; // pt: two tiers and a gutter of two characters
const lines = (n) => pt(n * LEAD); // n lines across the page

// #region answer: two tiers of 25 characters, the last page of a work left as it falls
// On a vertical page two columns are two tiers (段), filled from the upper right: the
// gutter is the gap between them and the column rule a hairline across the page. The grid
// counts characters down one tier, so each tier is exactly 25 em long and the gutter 2 em.
const layout = {
  layoutType: 'double', writingMode: 'vertical-rl', // binding 'auto' becomes 'right'
  gutterWidth: pt(2 * BODY),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) },
};
const cjk = { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } };
// 成り行き (nariyuki): the text fills the upper tier across the whole page before the
// lower one, and a work's last page is not levelled: its lower tier ends where the text
// does. trailing: false is that choice (vertical tiers are not balanced by default either).
const balancing = { trailing: false };
// Each work opens on an odd page, the left-hand one in a book bound on the right, with a
// blank page before it when the last work ended on an odd page.
const work = { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' } };
// 一 二 三 take three lines of their tier (3行取り), eight characters down.
const section = { level: 2, fontSize: pt(11), fontWeight: 600, lineSpan: 3, indent: em(8) };
// #endregion

// #region opener: the work's title down both tiers, seven lines across, the author below
// A page-span heading is laid out across the whole height of the page, both tiers and the
// gutter, in the flow frame: x runs down the page, y across it leftwards from the right
// edge of the type area. The design reserves seven lines (七行取り); the tiers start after it.
const at = (down, across) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: pt(down), y: pt(across) } });
const TITLE = 20; // pt
const opener = { enabled: true, minHeight: lines(7), slot: { elements: [
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: MINCHO, fontWeight: 600,
    fontSize: pt(TITLE), lineHeight: 1, letterSpacing: pt(TITLE / 2), color: col('ink'),
    placement: at(5 * BODY, 2.5 * LEAD - TITLE / 2) },
  { kind: 'text', id: 'author', content: '{author}', fontFamily: MINCHO, fontSize: pt(10.5),
    letterSpacing: pt(3), color: col('ink'),
    placement: at(HEIGHT - 5 * 10.5 - 4 * 3 - 3 * BODY, 4.5 * LEAD - 10.5 / 2) },
] } };
// #endregion

// #region furniture: the hashira and the folio down the fore-edge
// anchor 'outer' is the fore-edge: the left margin of an odd page and the right one of an
// even page in a book bound on the right. The volume's name on the right-hand page, the
// work on the left; the folios count on from the volume's page 211.
const foreEdge = (id, content, parity, edge, y, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', writingMode: 'vertical-rl',
  fontFamily: GOTHIC, fontSize: pt(7), letterSpacing: pt(1), color: col('muted'),
  overflow: 'clip', placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
  ...extra,
});
const header = { elements: [
  foreEdge('volume', '{title}', 'even', 'top', 2),
  foreEdge('work', '{chapterTitle}', 'odd', 'top', 2),
  // The folio in Arabic digits, set across the margin: down the fore-edge they would lie
  // on their side.
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -1, { pages: 'all', writingMode: undefined,
    letterSpacing: pt(0.5) }),
] };
const none = { elements: [] };
// The first work's opening page carries the colophon across the foot, in the edition's
// language (a style's footer serves every page of its section: gotcha style-header-whole-section).
const first = { id: 'first', footer: { elements: [{ kind: 'text', id: 'colophon', pages: 'opener',
  content: '{attr.colophon}', fontFamily: GOTHIC, fontSize: pt(5.5), lineHeight: 1.45,
  color: col('muted'), overflow: 'wrap', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-6) },
    size: { width: mm(118) } } }] } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5
    backgroundColor: col('paper'),
    margins: { top: mm(24), bottom: mm(18), left: mm(14), right: mm(16), mirror: true },
    pageNumbering: { startAt: 211 },
  },
  layout,
  cjk,
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: { fontFamily: MINCHO, fontWeight: 600, color: col('ink'), balancing,
    levels: [{ ...work, advancedDesign: opener }, section] }, // gotcha: headings-drop-h1-break
  headingStyles: [first],
  header,
  footer: none,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Serif JP': ['400', '600'], // the text; the titles and 一 二 三
  'Noto Sans JP': ['400'], // the hashira, the folios and the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files that hold the characters it sets
const title = markdown.match(/^title: "(.*)"$/m)[1];
const author = markdown.match(/^author: "(.*)"$/m)[1];
const heads = markdown.match(/^#+ [^{\n]*/gm).join('');
await loadFonts(FONTS, markdown); // the Latin files: the colophon, with ū
await loadCjkFonts({ [MINCHO]: ['400'] }, markdown, { vertical: true });
await loadCjkFonts({ [MINCHO]: ['600'] }, `${heads}`, { vertical: true });
const colophon = markdown.match(/colophon="([^"]*)"/)[1];
await loadCjkFonts({ [GOTHIC]: ['400'] }, `${title}${heads}${colophon}`, { vertical: true });
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'A Japanese story in two tiers, its title across both',
  es: 'Un cuento japonés en dos pisos, con el título sobre ambos' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
