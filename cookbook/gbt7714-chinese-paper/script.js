// ═══ Postext Cookbook · Nº 090 · A Chinese paper cited to GB/T 7714 ═════════════════
// https://postext.dev/en/cookbook/gbt7714-chinese-paper
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Noto Serif SC, Noto Sans SC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the frame; the paper is Chinese in both editions
const RECIPE = 'gbt7714-chinese-paper';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black text, one indigo for the journal's name, its rules and its labels
const palette = {
  ink: '#1a1a1a', indigo: '#24427a', mist: '#b8c6e0', rule: '#9aa3b5', muted: '#5f6470',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.indigo })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SONG, HEI, KAI] = ['Noto Serif SC', 'Noto Sans SC', 'LXGW WenKai TC']; // 宋, 黑, 楷
const [BODY, LEAD] = [9, 15]; // pt: 小五 on a 15 pt line, the grid both columns share
const [CHARS, LINES] = [23, 40]; // characters to a column's line, lines to a column
const PT = 25.4 / 72; // mm in a point
const AREA = (2 * CHARS + 2) * BODY * PT; // mm: two columns and a 2-em gutter, 152.4

// #region answer: GB/T 7714 numbered: [1] in citation order, [2–4], 等 or et al. by language
// Register the engine once, before the first build. The GB/T 7714 numeric style writes
// superscript [n] in the order works are first cited, joins three or more in a row into a
// range and sets the list with its type codes: [M] book, [J] article, [D] thesis, [C]
// conference paper, [EB/OL] web page. Its CSL file holds a second layout for works whose
// language is English, with "et al." for 等, commented out: uncommented, a Western entry
// takes "et al." and a Chinese one keeps 等, each chosen by the entry's `language`.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const GBT = STYLES['china-national-standard-gb-t-7714-2015-numeric'];
const citations = {
  style: 'custom', // the bundled style with its English layout switched on
  customStyle: GBT.replace(/<!-- (<layout[^>]*locale="en">[\s\S]*?<\/layout>)\s*-->/, '$1'),
  locale: 'zh-CN', // 等, 卷, 版 and the other terms of the list
  bibliography: { fontSize: em(7.5 / BODY), lineHeight: pt(12), entrySpacing: pt(1.5),
    labelWidth: em(1.7) }, // turnovers under the text, not past it: [1] and a space
};
// #endregion

// #region masthead: the journal's name on an indigo band, then title, authors, affiliations
const BAND = 30; // mm from the trim's top
const at = (id, edge, y) => ({ anchor: { to: id ? `#${id}` : 'container', edge },
  offset: { y: mm(y) }, size: { width: mm(AREA) } });
const line = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'center',
  overflow: 'wrap', placement, ...extra });
const onBand = (x, y) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y) }, size: { width: mm(AREA) } });
const masthead = { enabled: true, minHeight: pt(9 * LEAD), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('indigo') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND) } } },
  line('journal', '示例出版研究', HEI, 15, 'paper', onBand(15.8, 13),
    { fontWeight: 700, align: 'left', letterSpacing: pt(3) }),
  line('issue', '第44卷　第3期　2026年9月', HEI, 8, 'mist', onBand(15.8, 16),
    { align: 'right' }),
  line('title', '{titleText}', HEI, 17, 'ink', at('', 'top-left', 14),
    { fontWeight: 700, lineHeight: 1.45 }),
  line('authors', '{attr.authors}', KAI, 12, 'ink', at('title', 'below', 4)),
  line('affiliations', '{attr.affiliations}', SONG, 7.5, 'muted', at('authors', 'below', 2)),
] } };
// #endregion

// #region abstract: across both columns, its labels in 黑 the colour of the journal
// In 宋, not 楷: the one Kai on Fontsource is a Taiwan face (gotcha: cjk-face-region).
const calloutStyles = [{ id: 'abstract', span: 'page', backgroundEnabled: false,
  padding: { top: pt(0), bottom: pt(0), left: em(2), right: em(2) },
  marginTop: pt(0), marginBottom: pt(LEAD),
  body: { fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), firstLineIndent: pt(0),
    textAlign: 'justify' } }];
const chipStyles = [{ id: 'label', fontFamily: HEI, bold: true, color: col('indigo'),
  backgroundEnabled: false, borderWidth: pt(0), paddingX: em(0), gap: em(0.5) }];
// #endregion

// Running heads on the body pages, the folio at the outer corner, over a hairline.
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: HEI, fontSize: pt(7.5), color: col('muted'), overflow: 'clip',
  align: edge, placement: { anchor: { to: 'page', edge: `top-${edge}` },
    offset: { x: mm(x), y: mm(12) } }, ...extra });
const folio = { fontWeight: 700, color: col('indigo') };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'left', 15.8, folio),
  head('v-head', '示例出版研究　2026年第3期', 'even', 'left', 24),
  head('r-head', '赵一鸣，等：横排中文正文的行长与行距', 'odd', 'right', -24),
  head('r-folio', '{pageNumber}', 'odd', 'right', -15.8, folio),
  { kind: 'rule', id: 'head-rule', pages: 'body', thickness: pt(0.5), color: col('rule'),
    placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(15.8), y: mm(16.5) },
      size: { width: mm(AREA) } } },
] };

const config = () => ({
  locale: 'zh-Hans', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette,
  citations,
  page: { width: mm(184), height: mm(260), dpi: 150, pageNumbering: { startAt: 41 },
    // 16开; with the grid on the margins are minimums, grown to centre the 23 × 40 area
    margins: { top: mm(22), bottom: mm(20), left: mm(15), right: mm(15), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: pt(2 * BODY) },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } },
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
  },
  headings: { fontFamily: HEI, fontWeight: 700, color: col('ink'),
    levels: [
      { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // headings-drop-h1-break
      { level: 2, numberingTemplate: '{2}', numberSeparator: '　', fontSize: pt(10.5),
        lineHeight: pt(2 * LEAD), marginTop: pt(0), marginBottom: pt(0) }, // 1　实验方法
      { level: 3, numberingTemplate: '{2}.{3}', numberSeparator: '　', fontSize: pt(BODY),
        lineHeight: pt(LEAD), marginTop: pt(0), marginBottom: pt(0) }, // 1.1　被试
    ] },
  headingStyles: [
    { id: 'article', numbered: false, span: 'page', advancedDesign: masthead },
    { id: 'intro', numbered: false }, // 引言 goes before section 1, unnumbered
    { id: 'references', numbered: false },
  ],
  calloutStyles,
  chipStyles,
  paragraphStyles: [{ id: 'colophon', fontFamily: SONG, fontSize: pt(6.5), lineHeight: pt(9),
    color: col('muted'), firstLineIndent: pt(0), textAlign: 'left', marginTop: pt(LEAD) }],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Chinese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Noto Serif SC': ['400'], // SONG: the text, the references, the affiliations
  'Noto Sans SC': ['400', '700'], // HEI: running heads; the journal, title, heads, labels
  'LXGW WenKai TC': ['400'], // KAI: the authors' names
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of what it sets, and the Song the words the style adds.
const all = (re) => (markdown.match(re) ?? []).join('');
const labels = all(/:chip\[[^\]]*\]/g);
const heads = `${all(/^#+ .*$/gm)}示例出版研究第卷期年月赵一鸣等横排中文正文的行长与行距`;
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, `${markdown}等版卷期页`);
await loadCjkFonts({ [HEI]: ['400', '700'] }, `${heads}${labels}0123456789`);
await loadCjkFonts({ [KAI]: ['400'] }, all(/authors="[^"]*"/g));
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ en: 'A Chinese paper cited to GB/T 7714',
  es: 'Un artículo chino citado según la GB/T 7714' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk · the Cookbook inlines cookbook/_kit/*.js here
