// ═══ Postext Cookbook · Nº 128 · A Meiji proclamation in kanji and katakana ═════════
// https://postext.dev/en/cookbook/katakana-majiri-proclamation
// Code: MIT · Text: Kanpō 1889, ja.wikisource (CC BY-SA 4.0); notes (CC BY 4.0)
// Fonts: Shippori Mincho B1, Noto Sans JP (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// The Meiji Constitution as the Official Gazette printed it: kanji and katakana, vertical.
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the text is Japanese in both editions
const RECIPE = 'katakana-majiri-proclamation';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: gazette black, one vermilion for the seal, toned paper
const palette = {
  ink: '#211d1a', // the text and the frame
  seal: '#a8321f', // 御名御璽 and the cover's date: the one accent (5.5:1 on the paper)
  muted: '#6b6259', // the editor's notes, the folio, the colophon
  paper: '#fbf8f0',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'seal (defaults)', value: { hex: palette.seal, model: 'hex' } },
];
// #endregion

const MINCHO = 'Shippori Mincho B1'; // 明朝 with Meiji type in its bones, old forms 國 條 權
const GOTHIC = 'Noto Sans JP'; // the editor's voice: notes, folios, colophon
const [BODY, LEAD] = [10, 18]; // pt: line pitch 1.8 em
const [CHARS, LINES] = [40, 15]; // the type area: 40 characters down, 15 lines across
const PT = 25.4 / 72; // mm in a point
const TRIM = { w: 148, h: 210 }; // mm, A5
const AREA = { down: CHARS * BODY * PT, across: LINES * LEAD * PT }; // 141.1 × 95.3 mm
const HEAD = 37; // mm from the top edge to the head of the type area: 天 deeper than 地
const SIDE = (TRIM.w - AREA.across) / 2; // the same margin on both sides of the frame

// #region answer: kanji with katakana, vertical, and articles numbered 第一條 in kanji
const layout = { layoutType: 'single', writingMode: 'vertical-rl' }; // bound on the right
const cjk = { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } };
// Each article is an item of an ordered list: the counter is japanese-informal (十八, not
// 一十八), the prefix 第 and the separator 條 wrap it, and the turnover lines go back to
// the head of the line, as in the Gazette. Chapter two starts its list at 18.
const orderedLists = {
  numberFormat: 'japanese-informal', prefix: '第', separator: '條', gap: em(1),
  indent: em(0), hangingIndent: false, fontFamily: MINCHO, fontWeight: 800,
  color: col('ink'), marginTop: pt(0), marginBottom: pt(0), itemSpacing: pt(0),
};
// The chapters: 第{2:一}章 counts them in the same style, two characters down (字下げ).
const chapter = { level: 2, numberingTemplate: '第{2:一}章', numberSeparator: '　',
  fontSize: pt(BODY), fontWeight: 800, indent: em(2), lineSpan: 2, // 二行取り
  breakBefore: { enabled: false } };
// #endregion

// #region frame: a thick and a thin rule round the type area, on every page
// Header elements are placed on the sheet, not in the flow, so the frame is drawn in
// plain page millimetres: GAP outside the type area, then 1.4 mm to the thin rule.
const GAP = 6;
const rule = (id, out, thickness) => ({ kind: 'box', id, pages: 'all',
  style: { borderColor: col('ink'), borderWidth: pt(thickness) },
  placement: { anchor: { to: 'page', edge: 'top-left' },
    offset: { x: mm(SIDE - out), y: mm(HEAD - out) },
    size: { width: mm(AREA.across + 2 * out), height: mm(AREA.down + 2 * out) } } });
const header = { elements: [
  rule('outer', GAP + 1.4, 1.2), rule('inner', GAP, 0.4),
  // The folio in kanji, under the frame, in the middle of the page.
  { kind: 'text', id: 'folio', content: '{pageNumber}', pages: 'body', fontFamily: GOTHIC,
    fontSize: pt(8), color: col('muted'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(0), y: mm(HEAD + AREA.down + GAP + 6) }, size: { width: mm(TRIM.w) } } },
] };
// #endregion

// #region cover: the title down the middle, the date and the source to its left
// In the flow frame of a vertical page x runs down the column, y leftward across it.
const at = (down, across) => ({ anchor: { to: 'container', edge: 'top-left' },
  offset: { x: mm(down), y: mm(across) } });
const MID = AREA.across / 2; // mm: the axis of the page, from the right of the type area
const cover = {
  id: 'cover', numbered: false, toc: false, span: 'page', runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: MINCHO, fontWeight: 800,
      fontSize: pt(34), lineHeight: 1, letterSpacing: pt(10), color: col('ink'),
      placement: at((AREA.down - (7 * 34 + 6 * 10) * PT) / 2, MID - 34 * PT / 2) }, // centred
    { kind: 'text', id: 'date', content: '{attr.date}', fontFamily: MINCHO, fontSize: pt(11),
      lineHeight: 1, letterSpacing: pt(2), color: col('seal'), placement: at(30, MID + 18) },
    { kind: 'text', id: 'source', content: '{attr.source}', fontFamily: MINCHO,
      fontSize: pt(11), lineHeight: 1, letterSpacing: pt(4), color: col('ink'),
      placement: at(30, MID - 18 - 11 * PT) },
    // The edition's language, turned with the line, at the foot of the type area.
    { kind: 'text', id: 'latin', content: '{attr.latin}', fontFamily: GOTHIC, fontSize: pt(7.5),
      lineHeight: 1.5, color: col('muted'), overflow: 'wrap', align: 'right',
      placement: { ...at(0, AREA.across - 9), size: { width: mm(AREA.down), height: mm(9) } } },
  ] } },
};
// #endregion

const config = () => ({
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(HEAD), bottom: mm(TRIM.h - HEAD - AREA.down), left: mm(SIDE),
      right: mm(SIDE), mirror: true },
    pageNumbering: { format: 'japanese-informal' }, // 一, 二, 三…
  },
  layout,
  cjk,
  bodyText: {
    fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    // A new clause of an article (項) starts one character down; the edict's paragraphs
    // start flush, as the Gazette sets them.
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true,
  },
  headings: {
    fontFamily: MINCHO, color: col('ink'), fontWeight: 800,
    levels: [
      { level: 1, breakBefore: { enabled: true, parity: 'any' } },
      chapter,
    ],
  },
  headingStyles: [
    cover,
    // 凡例 and 上諭: in the editor's gothic, one line, not counted as chapters.
    { id: 'notes', numbered: false, fontFamily: GOTHIC, fontWeight: 700, fontSize: pt(9),
      color: col('muted'), lineSpan: 1, indent: em(1) },
    { id: 'edict', numbered: false, fontFamily: GOTHIC, fontWeight: 700, fontSize: pt(9),
      color: col('muted'), lineSpan: 2, indent: em(1) },
    { id: 'law', numbered: false, indent: em(1), lineSpan: 2 },
  ],
  unorderedLists: { bulletChar: '一', gap: em(1), indent: em(1), fontFamily: GOTHIC,
    color: col('muted'), marginTop: pt(0), marginBottom: pt(0), itemSpacing: pt(0) },
  orderedLists,
  paragraphStyles: [
    { id: 'flush', firstLineIndent: em(0) },
    // 御名　御璽, larger, three characters down: where the Emperor signed and sealed.
    { id: 'seal', fontSize: pt(15), lineHeight: pt(2 * LEAD), color: col('seal'),
      indent: em(2), marginTop: pt(LEAD) },
    // The ministers' countersignatures end at the foot of the line (地付き).
    { id: 'countersign', textAlign: 'end', marginTop: pt(LEAD) },
    { id: 'colophon', fontFamily: GOTHIC, fontSize: pt(7), lineHeight: pt(LEAD),
      color: col('muted'), textAlign: 'left', marginTop: pt(2 * LEAD) },
  ],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Shippori Mincho B1': ['400', '800'], 'Noto Sans JP': ['400', '700'] };
// #region voices: each face loads the files of the characters it sets
const notes = (markdown.match(/^- .*$/gm) ?? []).join('');
const gothicText = `${notes}凡例上諭一二三四五六七八九十${markdown.match(/latin="([^"]*)"/)[1]}`;
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, markdown.replace(/^- .*$/gm, ''),
  { vertical: true });
await loadCjkFonts({ [GOTHIC]: FONTS[GOTHIC] }, gothicText, { vertical: true });
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'The Meiji Constitution, 1889',
  es: 'La Constitución Meiji, 1889' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
