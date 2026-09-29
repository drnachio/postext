// ═══ Postext Cookbook · Nº 081 · Dates and acronyms upright in vertical text ═══════
// https://postext.dev/en/cookbook/chinese-dates-upright
// Code: MIT · Text: 1912 proclamations, zh.wikisource (CC BY-SA 4.0); notes (CC BY 4.0)
// Fonts: Noto Serif TC, Noto Sans TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
// Two founding texts of the Republic of China, 1912, set vertically as a documents reader.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-dates-upright';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, the vermilion of a seal, and the paper of a gazette
const palette = {
  ink: '#1e1a17', // text: a warm near-black
  seal: '#b1291f', // the one accent: the bands, the seal notes, the chapter heads
  tint: '#f6dccf', // the cover's double rule, a pale vermilion
  muted: '#6d645b', // fore-edge heads, the colophon
  paper: '#fffdf8',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'seal (defaults)', value: { hex: palette.seal, model: 'hex' } },
];
// #endregion

const SONG = 'Noto Serif TC'; // 宋/明: the documents
const HEI = 'Noto Sans TC'; // 黑: titles, heads, labels
const KAI = 'LXGW WenKai TC'; // 楷: the editor's headnotes and notes
const BODY = 12; // pt, 小四
const LEAD = 21; // pt: a line gap of 0.75 em
const CHARS = 44; // characters to a line
const LINE = (CHARS * BODY * 25.4) / 72; // mm: the length of a line, 186.3
const TRIM = { w: 184, h: 260 }; // mm, 16开
const MARGIN = { top: 30, bottom: 22, side: 20 }; // mm, minimums: 天头 deeper than 地脚

// #region answer: vertical text where numbers of one or two digits stand upright
const layout = { layoutType: 'single', writingMode: 'vertical-rl' }; // binding 'auto': right
const cjk = {
  // 10月10日: each number of up to two digits stands upright in one cell (tate-chu-yoko);
  // 1912 and Sun Yat-sen stay on their side, as clreq sets long numbers and Latin words.
  uprightDigits: 2,
  // The type area in characters: 44 down each line, 19 lines to the page.
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: 19 },
};
// By hand, in the Markdown: 民國:tcy[115]年 puts three digits in one cell, :upright[ROC]
// stands each letter of an acronym upright, :sideways[…] turns any run with the line.
// #endregion

// #region opener: a vermilion band down the right edge, where each document begins
// The margins are minimums: the grid centres the 44 characters (186.3 mm) between them,
// so the type area starts HEAD mm down the sheet. The band's title starts there too.
const HEAD = MARGIN.top + (TRIM.h - MARGIN.top - MARGIN.bottom - LINE) / 2;
const BAND = 42; // mm from the right trim edge: where a reader of vertical text starts
const onBand = { color: col('paper'), overflow: 'wrap', inlineMarks: true };
// In the flow of a vertical page x runs down the sheet and y leftward from its right edge.
const at = (x, y, extra = {}) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y) }, ...extra });
const opener = {
  enabled: true,
  minHeight: mm(BAND - 15), // past the side margin (21.6 mm), 6 mm of paper before the text
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('seal') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { height: mm(BAND) } } },
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: HEI,
      fontWeight: 700, fontSize: pt(34), lineHeight: 1.2, letterSpacing: pt(4), align: 'left',
      placement: at(HEAD, 8) },
    { kind: 'text', id: 'latin', content: '{attr.latin}', ...onBand, fontFamily: HEI,
      fontSize: pt(9), lineHeight: 1.6, align: 'left', placement: at(HEAD, 25) },
    // The date ends where the lines of text end: align 'right' is the foot of a vertical line.
    { kind: 'text', id: 'date', content: '{attr.date}', ...onBand, fontFamily: HEI,
      fontWeight: 500, fontSize: pt(13), lineHeight: 1.2, align: 'right',
      placement: at(HEAD, 24, { size: { width: mm(LINE) } }) },
  ] },
};
// #endregion

// #region heads: fore-edge heads, the folio in Chinese numerals
const foreEdge = (id, content, edge, y) => ({
  kind: 'text', id, content, writingMode: 'vertical-rl', pages: 'body', align: 'left',
  fontFamily: HEI, fontSize: pt(9.6), color: col('muted'), overflow: 'clip',
  placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
});
const header = { elements: [
  foreEdge('head', '{chapterTitle}', 'top', 4), // four characters below the type area
  foreEdge('folio', '{pageNumber}', 'bottom', -5), // ends five characters above its foot
] };
// #endregion

// #region cover: the title page, a vermilion field inside a double rule
const frame = (id, inset, width) => ({ kind: 'box', id,
  style: { borderColor: col('tint'), borderWidth: pt(width) },
  placement: at(inset, inset, { size: { width: mm(TRIM.h - 2 * inset),
    height: mm(TRIM.w - 2 * inset) } }) });
const coverLine = (id, content, y, align) => ({ kind: 'text', id, content, ...onBand,
  fontFamily: HEI, fontWeight: 500, fontSize: pt(18), lineHeight: 1.2, align,
  placement: at(HEAD, y, { size: { width: mm(LINE) } }) });
const cover = {
  id: 'cover', numbered: false, toc: false, runningChapter: false,
  span: 'page', // a page-wide design is not cut at the foot of the column: the field bleeds
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'box', id: 'field', style: { backgroundColor: col('seal') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { height: mm(TRIM.w) } } },
    frame('rule-outer', 11, 1.6), frame('rule-inner', 13, 0.5), // 文武線: thick, then thin
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: HEI,
      fontWeight: 700, fontSize: pt(56), lineHeight: 1.1, letterSpacing: pt(5.6), align: 'left',
      placement: at(HEAD, 26) },
    { kind: 'text', id: 'latin', content: '{attr.latin}', ...onBand, fontFamily: HEI,
      fontSize: pt(11), lineHeight: 1.4, align: 'left', placement: at(HEAD, 51) },
    coverLine('first', '臨時大總統宣言書', 104, 'left'),
    coverLine('first-date', '1912年1月1日', 104, 'right'),
    coverLine('second', '中華民國臨時約法', 118, 'left'),
    coverLine('second-date', '1912年3月11日', 118, 'right'),
  ] } },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // Taiwan conventions: centred punctuation (gotcha: cjk-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.side),
      right: mm(MARGIN.side), mirror: true },
    pageNumbering: { format: 'trad-chinese-informal' }, // 一, 二, 三…
  },
  layout,
  cjk,
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
  },
  headings: {
    fontFamily: HEI, color: col('seal'), fontWeight: 700,
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
      { level: 2, fontSize: pt(BODY), lineHeight: pt(LEAD), marginTop: pt(LEAD),
        marginBottom: pt(0) },
    ],
  },
  headingStyles: [cover],
  paragraphStyles: [
    // 低二格: the editor's voice in Kai, two characters lower than the text.
    { id: 'headnote', fontFamily: KAI, fontSize: pt(10.5), lineHeight: pt(LEAD),
      color: col('ink'), indent: em(2), firstLineIndent: em(2), marginBottom: pt(LEAD) },
    { id: 'note', fontFamily: KAI, fontSize: pt(10.5), lineHeight: pt(LEAD),
      color: col('ink'), firstLineIndent: pt(0), hangingIndent: em(1) },
    { id: 'order', firstLineIndent: em(2), marginTop: pt(0) },
    { id: 'dateline', textAlign: 'left', indent: em(12), firstLineIndent: pt(0) },
    { id: 'seal', fontFamily: HEI, fontSize: pt(10.5), color: col('seal'), textAlign: 'left',
      indent: em(22), firstLineIndent: pt(0) },
    { id: 'article', firstLineIndent: pt(0), hangingIndent: em(2) },
    { id: 'item', indent: em(2), firstLineIndent: pt(0), hangingIndent: em(2) },
    { id: 'colophon', fontFamily: HEI, fontSize: pt(7.5), lineHeight: pt(LEAD),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint; the Chinese ones by files (gotcha: cjk-fonts-slices).
const FONTS = { 'Noto Serif TC': ['400'], 'Noto Sans TC': ['400', '500', '700'],
  'LXGW WenKai TC': ['400'] };
// #region voices: each Chinese face loads the files for the text it sets
const voice = (styles) => (markdown.match(
  new RegExp(`:::paragraphs\\{style="(?:${styles})"\\}[\\s\\S]*?:::`, 'g')) ?? []).join('');
const kaiText = voice('headnote|note');
// Hei: headings and their attributes, seals, colophon, the cover's lines, folios 一 to 十.
const heiText = (markdown.match(/^#.*$/gm) ?? []).join('') + voice('seal|colophon')
  + '臨時大總統宣言書1912年1月1日中華民國臨時約法1912年3月11日一二三四五六七八九十';
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: FONTS[SONG] }, markdown, { vertical: true });
await loadCjkFonts({ [HEI]: FONTS[HEI] }, heiText, { vertical: true });
await loadCjkFonts({ [KAI]: FONTS[KAI] }, kaiText, { vertical: true });
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'Two proclamations of 1912', es: 'Dos proclamas de 1912' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
