// ═══ Postext Cookbook · Nº 084 · A vertical newspaper page in tiers ═══════════════
// https://postext.dev/en/cookbook/vertical-newspaper-tiers
// Code: MIT · Text: Shenbao, 1912 (PD); gazette, stele report: zh.wikisource (CC BY-SA 4.0)
// Fonts: Noto Serif TC, Noto Sans TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the news is Chinese in both editions
const RECIPE = 'vertical-newspaper-tiers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, ink and the vermilion of the masthead
const palette = {
  ink: '#1c1a17', // text, the rules between tiers
  accent: '#b0281c', // the one accent: the masthead block, the telegrams' flag
  rule: '#8f887c', // the hairline before each story
  muted: '#5e574e', // datelines, sources, the colophon
  paper: '#f7f2e6', // newsprint, and the masthead's type reversed out of the vermilion
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion

const [SONG, HEI, KAI] = ['Noto Serif TC', 'Noto Sans TC', 'LXGW WenKai TC']; // 宋, 黑, 楷
const BODY = 10.5; // pt: 五號, the body size of the papers of 1912
const LEAD = 15.75; // pt: the line pitch across the page, 1.5 em
const CHARS = 25; // characters down a tier: a newspaper column, 17 to 25
const HEIGHT = 2 * CHARS * BODY + 2 * BODY; // pt: two tiers and a gutter of two ems
const TRIM = { w: 184, h: 260 }; // mm, 16開
const MARGIN = { top: 30, bottom: 22, side: 11 }; // mm, minimums: the grid centres the tiers
// The grid grows the margins evenly, so the tiers start HEAD mm below the top edge.
const HEAD = MARGIN.top + (TRIM.h - MARGIN.top - MARGIN.bottom - (HEIGHT * 25.4) / 72) / 2;

// #region answer: two tiers down the page with a rule between them, three inside a box
// On a vertical page two columns are two tiers (欄), stacked and filled from the upper right:
// the gutter is the gap between them, the column rule a rule across the page.
const layout = {
  layoutType: 'double', writingMode: 'vertical-rl', // binding 'auto' becomes 'right'
  gutterWidth: pt(2 * BODY),
  columnRule: { enabled: true, color: col('ink'), lineWidth: pt(0.75) },
};
// The grid counts characters down a tier and lines across the page: 25 × 29.
const cjk = { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: 29 } };
// The body stays in two tiers. The telegrams take three inside a page-span box floated to
// the foot of the flow, the left of the sheet, with the fences
//   :::callout{type="wires" span="page" placement="bottom" title="電報"} and :::columns{count=3}
const wires = { id: 'wires', backgroundEnabled: false,
  stripe: { enabled: true, side: 'top', width: pt(1.5), color: col('ink') }, // on its right
  padding: { top: pt(6), right: pt(0), bottom: pt(0), left: pt(0) },
  columnGap: pt((HEIGHT - 3 * 18 * 9) / 2), // three tiers of 18 characters of 9 pt
  titleStyle: { fontFamily: HEI, fontSize: pt(12), fontWeight: 700, color: col('accent') },
  body: { fontFamily: SONG, fontSize: pt(9), lineHeight: pt(13.5), textAlign: 'justify',
    firstLineIndent: pt(0), boldFontWeight: 700 } };
// #endregion

// In the flow of a vertical page x runs down the sheet and y leftward from its right edge.
const at = (x, y, extra = {}) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: pt(x), y: pt(y) }, ...extra });
const text = (id, content, family, weight, size, colour, extra = {}) => ({ kind: 'text', id,
  content, fontFamily: family, fontWeight: weight, fontSize: pt(size), lineHeight: 1.2,
  color: col(colour), align: 'left', overflow: 'wrap', ...extra });
const below = (id, y, extra = {}) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { y: pt(y) }, ...extra }); // y more points across the page, leftward
const fill = { size: { width: 'fill' } };

// #region front: the masthead and the lead headline, one design down the right of page 1
// A page-span heading always opens a page (gotcha: page-span-heading-new-page), so the lead
// story's H1 carries the masthead in its own design, above its headline.
const MAST = 6.5 * LEAD; // the masthead's block, across the page
const block = (id, inset, style) => ({ kind: 'box', id, style,
  placement: at(inset, inset, { size: { width: pt(HEIGHT - 2 * inset),
    height: pt(MAST - 2 * inset) } }) });
const BAND = 13 * LEAD; // the whole design: masthead, headline, deck
const front = { enabled: true, minHeight: pt(BAND), slot: { elements: [
    block('field', 0, { backgroundColor: col('accent') }), // the name reversed out of it
    block('frame', 3.5, { borderColor: col('paper'), borderWidth: pt(0.75) }),
    text('name', '{title}', KAI, 700, 64, 'paper', { lineHeight: 1, letterSpacing: pt(6),
      placement: at(22, 13) }),
    text('kicker', '{subtitle}', HEI, 700, 12, 'paper', { placement: at(24, 82) }),
    text('sources', '錄{author}', HEI, 400, 8.5, 'paper', { placement: at(150, 84) }),
    text('issue', '{attr.issue}', HEI, 700, 12, 'paper', { placement: at(330, 33) }), // the year
    text('edition', '{attr.edition}', HEI, 400, 8.5, 'paper', { placement: at(330, 84) }),
    text('sheet', '第{pageNumber}張', HEI, 700, 10, 'accent', { placement: at(HEIGHT - 58, 80),
      box: { backgroundColor: col('paper'), padding: { top: pt(3), right: pt(3),
        bottom: pt(3), left: pt(3) } } }),
    // The headline down both tiers, centred; the dateline heads the deck's line.
    text('head', '{titleText}', SONG, 900, 44, 'ink', { align: 'center', lineHeight: 1.1,
      placement: at(0, MAST + 12, fill) }),
    text('deck', '{attr.deck}', KAI, 400, 15, 'ink', { align: 'center',
      placement: below('head', 6, fill) }),
    text('dateline', '{attr.dateline}', HEI, 700, 9, 'muted', { placement: below('head', 10) }),
    { kind: 'rule', id: 'foot', direction: 'horizontal', thickness: pt(0.75),
      color: col('ink'), placement: at(0, BAND - 3, fill) },
] } };
// #endregion

// #region heads: each story opens with a hairline, the headline, a deck and a dateline
const storyHead = { enabled: true, minHeight: pt(4 * LEAD), slot: { elements: [ // 4 lines
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    placement: at(0, 0, fill) },
  text('head', '{titleText}', SONG, 900, 20, 'ink', { placement: at(0, 6) }),
  text('deck', '{attr.deck}', KAI, 400, 11, 'ink', { // two characters down the tier
    placement: below('head', 4, { offset: { x: pt(2 * BODY), y: pt(4) } }) }),
  text('dateline', '{attr.dateline}', HEI, 700, 9, 'muted', { placement: below('deck', 4) }),
] } };
// #endregion

// #region pagehead: the second sheet's head and the colophon, horizontal on the sheet
// The header's frame is the margin above the tiers; the footer's, the margin below them.
const above = (y, extra = {}) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: pt(0), y: mm(HEAD - y) }, ...extra });
const header = { elements: [
  text('title', '{title}', KAI, 700, 14, 'ink', { align: 'right', placement: above(13, fill) }),
  text('sheet', '第{pageNumber}張', HEI, 700, 9, 'ink', { placement: above(10.8) }),
  { kind: 'rule', id: 'rule', thickness: pt(1.5), color: col('ink'), placement: above(6, fill) },
].map((element) => ({ ...element, pages: 'body' })) }; // page 1 has the masthead instead
const footer = { elements: [text('colophon', '{attr.colophon}', HEI, 400, 7, 'muted', {
  pages: 'body', placement: at(0, 17, fill) })] }; // 6 mm under the tiers
// #endregion

const config = () => ({
  locale: 'zh-Hant', // Taiwan conventions: centred punctuation (gotcha: cjk-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.side),
      right: mm(MARGIN.side), mirror: true },
    pageNumbering: { format: 'trad-chinese-informal' }, // 第一張, 第二張
  },
  layout,
  cjk,
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
  },
  headings: {
    fontFamily: SONG, fontWeight: 900, color: col('ink'),
    levels: [
      // parity 'any': a level-1 heading opens the next page, whichever side it falls on.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginBottom: pt(0) },
      { level: 2, fontSize: pt(20), lineHeight: pt(2 * LEAD), marginTop: pt(LEAD / 2),
        marginBottom: pt(0), advancedDesign: storyHead },
    ],
  },
  headingStyles: [{ id: 'front', advancedDesign: front }],
  calloutStyles: [wires],
  paragraphStyles: [
    { id: 'source', fontFamily: HEI, fontSize: pt(8.5), color: col('muted'), textAlign: 'right',
      firstLineIndent: pt(0) }, // the telegrams' source, at the foot of its line
    { id: 'inscription', fontFamily: KAI, indent: em(2), firstLineIndent: em(2) }, // 低二格
  ],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Chinese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint; the Chinese ones by files (gotcha: cjk-fonts-slices).
const FONTS = { 'Noto Serif TC': ['400', '700', '900'], 'Noto Sans TC': ['400', '700'],
  'LXGW WenKai TC': ['400', '700'] };
// #region voices: each face loads the files of the text it sets
const pick = (pattern) => (markdown.match(pattern) ?? []).join('');
const attrs = (...keys) => pick(new RegExp(`[{ ](?:${keys.join('|')})="[^"]*"`, 'g'));
const voices = [ // family, weights, the text it sets, and whether it runs down a column
  [SONG, ['400'], markdown, true], // the text
  [SONG, ['700', '900'], pick(/^#+ [^{\n]*|\*\*[^*]+\*\*/gm), false], // heads, labels
  [HEI, ['400', '700'], pick(/^(?:subtitle|author): .*$|style="source"\}[^:]*/gm) // masthead,
    + attrs('dateline', 'issue', 'edition', 'title', 'colophon') + '錄第一二張', true], // datelines
  [KAI, ['400'], attrs('deck') + pick(/style="inscription"\}[^:]*/g), true], // decks, the stele
  [KAI, ['700'], pick(/^title: .*$/m), false], // the paper's name
];
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
for (const [family, weights, text, vertical] of voices) {
  await loadCjkFonts({ [family]: weights }, text, { vertical });
}
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A vertical newspaper page in tiers',
  es: 'Una página de periódico vertical, en pisos' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
