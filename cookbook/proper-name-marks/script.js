// ═══ Postext Cookbook · Nº 077 · Proper-name and book-title marks, across and down ═════
// https://postext.dev/en/cookbook/proper-name-marks
// Code: MIT · Text: Sima Qian, Shiji 7 (PD) · Punctuation, headnote, conventions: CC BY 4.0
// Fonts: Noto Serif TC, Noto Sans TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
// Specimen pages for a classical reader: the opening of the Basic Annals of Xiang Yu with
// its proper-name lines and wavy title lines, set down the page and then across it.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the slug lines and the colophon ('en' | 'es')
const RECIPE = 'proper-name-marks';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the indigo of a thread-bound cover, vermilion for the marks
const palette = {
  ink: '#221e1b', // the text
  band: '#23394b', // the opener band and the small heads
  mark: '#b5412c', // the name, title and emphasis marks: the second ink
  tint: '#c7d2da', // kickers and bylines on the band
  muted: '#6f6a64', // folios, slug lines, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'band (defaults)', value: { hex: palette.band, model: 'hex' } },
];
// #endregion
// #region type: 五號 on 18 pt, 42 characters by 17 lines down the page
const [SONG, HEI, KAI] = ['Noto Serif TC', 'Noto Sans TC', 'LXGW WenKai TC']; // 宋, 黑, 楷
const PT = 25.4 / 72; // mm in a point
const [W, H] = [140, 203]; // mm: 大32開
const SIZE = 10.5; // pt: 五號
// A gap of 7.5 pt (0.71 em) between lines: a line of marks needs half an em of it, dots on
// one side and lines on the other five eighths. At 15 pt the build reports every marked
// paragraph (cjkMarksExceedLeading: gap 0.43 em).
const LEAD = 18; // pt
const [CHARS, LINES] = [42, 17]; // the vertical grid: characters down a line, lines across
const SIDE = (W - LINES * LEAD * PT) / 2; // mm: the side margins of a vertical page
// #endregion

// #region answer: marks by the markup, their side by the writing mode
// :name[項梁] draws the proper-name line, :book[史記] the book-title mark, :dots[…] dots.
const cjk = {
  bookTitleMark: 'wavy', // zh-Hant's default; mainland editions of the classics use it too
  annotationColor: col('mark'), // unset, the marks print in the colour of the text
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
};
// The book runs down the page, bound on the right: the lines stand left of the names.
const layout = { layoutType: 'single', writingMode: 'vertical-rl' };
// # 項羽本紀 {style="across"} sets the same Markdown across the page, 28 characters to
// the line: the lines run under the names. Its margins set its grid; the book's grid
// counts down the page.
const MEASURE = 28 * SIZE * PT; // mm
const across = {
  id: 'across',
  layout: { layoutType: 'single', writingMode: 'horizontal-tb' },
  margins: { top: mm(SIDE), bottom: mm(H - SIDE - 25 * LEAD * PT), // 25 lines
    left: mm((W - MEASURE) / 2), right: mm((W - MEASURE) / 2) },
};
// #endregion

// #region opener: one design both ways: a band over the text across, right of it down
// The grid centres the text between the minimum margins; the band stops at its foot.
const FOOT = 20 + (H - 24 - 20 - CHARS * SIZE * PT) / 2; // mm, with minimums of 24 and 20
const BAND = SIDE + 3.5 * LEAD * PT; // mm from the trim, which is the right edge down the page
const onBand = { align: 'left', overflow: 'wrap' }; // design text centres and cuts by default
const next = (id, y) => ({ anchor: { to: `#${id}`, edge: 'below' }, offset: { y: mm(y) } });
const opener = {
  enabled: true,
  minHeight: pt(4 * LEAD), // the text starts on the fifth line, half a line clear of the band
  slot: { elements: [
    // Across the page the band's length runs past the trim; down it, it ends at the text's
    // foot, clear of the folio.
    { kind: 'box', id: 'band', style: { backgroundColor: col('band') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: mm(H - FOOT), height: mm(BAND) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...onBand, fontFamily: HEI,
      fontWeight: 700, fontSize: pt(8), letterSpacing: pt(1.6), color: col('tint'),
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(6 - SIDE) } } },
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: SONG,
      fontWeight: 700, fontSize: pt(46), lineHeight: 1, letterSpacing: pt(3),
      color: col('paper'), placement: next('kicker', 2) },
    { kind: 'text', id: 'byline', content: '{attr.byline}', ...onBand, fontFamily: KAI,
      fontSize: pt(10), color: col('tint'), placement: next('title', 2) },
  ] },
};
// #endregion

// #region folios: Chinese numerals at the outer foot, the slug line in the middle
const foot = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  fontFamily: HEI, fontSize: pt(7), color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-11) } } });
const folio = { fontFamily: SONG, fontSize: pt(9) };
// Bound on the right, a recto (odd) lies left of the spine: its outer edge is its left one.
const footer = { elements: [
  foot('folio-odd', '{pageNumber}', 'odd', 'bottom-left', SIDE, folio),
  foot('folio-even', '{pageNumber}', 'even', 'bottom-right', -SIDE, folio),
  foot('slug', '{attr.slug}', 'all', 'bottom', 0, { letterSpacing: pt(0.4) }),
] };
// #endregion

// The front page sets the headnote and the conventions in the Kai face. A section's
// bodyStyle sets its list numbers bold unless its orderedLists say otherwise.
const front = { id: 'front', bodyStyle: { fontFamily: KAI, orderedLists: { fontWeight: 400 } } };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // Taiwan: full-width centred punctuation (gotcha: cjk-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(W), height: mm(H), dpi: 150,
    // Minimums: the grid centres its 42 × 17 characters, 天頭 25.7 mm over 地腳 21.7 mm.
    margins: { top: mm(24), bottom: mm(20), left: mm(SIDE), right: mm(SIDE), mirror: true },
    pageNumbering: { format: 'trad-chinese-informal' }, // 一, 二, 三
  },
  layout,
  cjk,
  bodyText: {
    fontFamily: SONG, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
  },
  headings: {
    fontFamily: HEI, fontWeight: 700, color: col('band'),
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: opener, marginBottom: pt(0) },
      // No space above: 題解 sits on the fifth line, where the other pages' text starts;
      // a :::space line sets 凡例 apart from the headnote.
      { level: 2, fontSize: pt(SIZE), lineHeight: pt(LEAD), letterSpacing: pt(2),
        marginTop: pt(0), marginBottom: pt(0) },
    ],
  },
  headingStyles: [front, across],
  // No gap after 一、: the text starts two ems in, on the grid, like a paragraph's.
  orderedLists: { numberFormat: 'trad-chinese-informal', separator: '、', fontFamily: KAI,
    fontWeight: 400, color: col('ink'), gap: em(0), marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'colophon', fontFamily: HEI, fontSize: pt(7), lineHeight: pt(10), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header: { elements: [] }, // every page opens a section: the band is its head
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The Chinese is the same in both editions; the slug lines and the colophon change.
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// A Chinese face comes in slices: each voice loads the files of the text it sets
// (gotcha: cjk-fonts-slices). Kai sets the front page and the bylines, Hei the small heads.
const FONTS = {
  'Noto Serif TC': ['400', '700'],
  'Noto Sans TC': ['400', '700'],
  'LXGW WenKai TC': ['400'],
};
const heads = markdown.match(/^#.*$/gm).join('\n'); // titles, kickers, bylines, slug lines
const preface = markdown.slice(0, markdown.indexOf('\n# ', markdown.indexOf('# ') + 2));
const colophon = markdown.slice(markdown.lastIndexOf(':::paragraphs'));
const NUMERALS = '一二三四五六七八九十、'; // folios and list numbers, which the text may lack

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, markdown + NUMERALS, { vertical: true });
// The bold sets the two titles, which have no punctuation, so it loads no vertical forms.
// A browser that ignores the forms' feature settings would otherwise take a twin of the
// bold files for vertical forms and set the text's brackets upright in the regular.
await loadCjkFonts({ [SONG]: ['700'] }, heads);
await loadCjkFonts({ [HEI]: ['400', '700'] }, heads + colophon, { vertical: true });
await loadCjkFonts({ [KAI]: ['400'] }, preface + heads + NUMERALS, { vertical: true });
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'Name and title marks, down and across',
  es: 'Marcas de nombre y de título, en vertical y en horizontal' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk · the Cookbook inlines cookbook/_kit/*.js here
