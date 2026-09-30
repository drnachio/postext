// ═══ Postext Cookbook · Nº 082 · A Chinese official document to GB/T 9704 ═════════
// https://postext.dev/en/cookbook/chinese-official-document
// Code: MIT · Text: a fictitious notice written for the recipe (CC BY 4.0) · Pictures: none
// Fonts: Noto Serif SC, Noto Sans SC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, parseTSV, mergeCells,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-official-document';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// GB/T 9704 prints everything black but the letterhead: the issuer's name and a rule in red.
const palette = { ink: '#161616', red: '#d2161e', muted: '#8a8580', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.red })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const SONG = 'Noto Serif SC'; // 宋: the text (in place of 仿宋, see the write-up) and 小标宋
const HEI = 'Noto Sans SC'; // 黑: the 一、 heads, the annex label, the specimen stamp
const KAI = 'LXGW WenKai TC'; // 楷: the （一） heads
const MM = 25.4 / 72; // mm per pt
const [BODY, LEAD, CHARS, LINES] = [15.75, 29, 28, 22]; // 三号 on 29 pt lines, 28 × 22 of them
const AREA = { w: CHARS * BODY * MM, h: LINES * LEAD * MM }; // 155.6 × 225.1 mm: the 版心
const [TOP, INNER] = [37, 28]; // mm: 天头 and 订口, the head and binding margins

// #region answer: A4, 28 characters × 22 lines of 三号, full-width marks on the grid
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES }, // 28 ems × 22 lines
  // Every mark takes a whole cell, as on the standard's grid, and never gives any of it up.
  punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false,
  hangingPunctuation: 'allow', // a ， that may not open a line hangs past the 28th cell
  latinSpacing: em(0), // 〔2026〕7号 and 2026年9月28日 set solid, as the standard prints them
};
const page = {
  // 144 dpi is 2 px to the point: the 29 pt lines add up with no rounding (see Pitfalls).
  width: mm(210), height: mm(297), dpi: 144, backgroundColor: col('paper'),
  // With the grid on, margins are minimums. These leave 28 × 22 cells and 0.02 mm to share,
  // so the type area sits 37 mm under the head and 28 mm from the binding edge.
  margins: { top: mm(TOP), bottom: mm(297 - TOP - AREA.h - 0.02), left: mm(INNER),
    right: mm(210 - INNER - AREA.w - 0.02), mirror: true },
};
const bodyText = {
  fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', // a short line spreads between its characters, never between words
  firstLineIndent: em(2), indentAfterHeading: true, // 左空二字，回行顶格
};
// #endregion

// #region levels: 一、 in Hei, （一） in Kai, 1. and （1） in the text face, all 三号 on the grid
// One line each at the body size, nothing above or below: every head stays on the grid.
// Headings have no indent of their own, so two ideographic spaces open each template.
const level = (n, fontFamily, fontWeight, numberingTemplate) => ({ level: n, fontFamily,
  fontWeight, numberingTemplate, numberSeparator: '', fontSize: pt(BODY), lineHeight: pt(LEAD),
  marginTop: pt(0), marginBottom: pt(0) });
const levels = [
  level(2, HEI, 500, '　　{2:一}、'), // 一 is the informal numeral in the document's script
  level(3, KAI, 400, '　　（{3:一}）'),
  level(4, SONG, 400, '　　{4}.'),
  level(5, SONG, 400, '　　（{5}）'),
];
// #endregion

// #region letterhead: the 版头 of page 1, placed line by line on the grid
const LINE = LEAD * MM; // 10.23 mm
const lineTop = (n) => (n - 1) * LINE; // mm from the top of the type area to grid line n
const face = (fontFamily, size, fontWeight, colour, lineHeight = LEAD / size) => ({
  fontFamily, fontSize: pt(size), fontWeight, color: col(colour), lineHeight });
// A text y mm down the type area, x mm in from its edge, as wide as the type area.
const text = (id, content, look, y, { edge = 'top-left', x = 0, width = AREA.w, ...more } = {},
) => ({ kind: 'text', id, content, ...look, align: 'center', overflow: 'wrap', ...more,
  placement: { anchor: { to: 'container', edge }, offset: { x: mm(x), y: mm(y) },
    size: { width: width === 'auto' ? 'auto' : mm(width) } } }); // wrap, not '…'
const rule = (id, y, thickness, colour = 'ink', reserve = false) => ({ kind: 'rule', id, reserve,
  direction: 'horizontal', thickness, color: col(colour), placement: { anchor: { to: 'container',
    edge: 'top-left' }, offset: { y: mm(y) }, size: { width: mm(AREA.w) } } });
const PAD = { left: pt(5), right: pt(5) }; // the specimen stamp's: not a GB/T 9704 element
const letterhead = { enabled: true, minHeight: pt(13 * LEAD), slot: { elements: [
  text('copy', '{attr.copy}', face(SONG, BODY, 400, 'ink'), lineTop(1), { align: 'left' }),
  text('stamp', '样　张', face(HEI, BODY, 500, 'red', 1.3), lineTop(1) + 1.5, { edge: 'top-right',
    width: 'auto', box: { borderColor: col('red'), borderWidth: pt(1), padding: PAD } }),
  // The name's ink starts 35 mm down, 0.07 em over its box; at 46 pt it ends in line 5.
  text('issuer', '{attr.issuer}文件', face(SONG, 46, 900, 'red', 1), 35 + 0.07 * 46 * MM),
  // The number two blank lines under the name; the red rule 4 mm under its characters.
  text('number', '{attr.number}', face(SONG, BODY, 400, 'ink'), lineTop(8)),
  rule('red-rule', lineTop(8) + ((LEAD + BODY) / 2) * MM + 4, mm(0.5), 'red', true),
  text('title', '{titleText}', face(SONG, 22, 900, 'ink'), lineTop(12)), // 二号, 2 lines under
] } };
const notice = { level: 1, span: 'page', advancedDesign: letterhead,
  marginTop: pt(0), marginBottom: pt(LEAD), // 空一行: a blank line, then the addressee
  breakBefore: { enabled: true, parity: 'any' } }; // gotcha: headings-drop-h1-break
// #endregion

// #region folios: “— 1 —” in 四号, 7 mm under the type area, a cell in from the outer edge
const FOLIO = 14; // pt: 四号
const folio = (id, parity, edge, x) => ({ kind: 'text', id, parity, content: '— {pageNumber} —',
  ...face(SONG, FOLIO, 400, 'ink', 1), align: edge.endsWith('left') ? 'left' : 'right',
  overflow: 'clip', placement: { anchor: { to: 'container', edge }, // the type area's foot
    offset: { x: pt(x), y: mm(7 - (FOLIO / 2) * MM) } } }); // the dashes 7 mm down
const footer = { elements: [folio('recto', 'odd', 'top-right', -FOLIO),
  folio('verso', 'even', 'top-left', FOLIO)] };
const header = { elements: [{ kind: 'text', id: 'specimen', content: '{subtitle}', // 样张 …
  ...face(HEI, 7.5, 400, 'muted', 1.2), align: 'center', overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(16) } } }] };
// #endregion

// #region annex: the annex on a page of its own, the 版记 at the foot of that last page
const IMPRINT = AREA.h - 2 * LINE; // mm: two rows of the grid, ending on the type area's foot
const small = face(SONG, FOLIO, 400, 'ink', LEAD / FOLIO); // 四号
const inset = { x: FOLIO * MM, width: AREA.w - 2 * FOLIO * MM, reserve: false }; // 左右各空一字
const annex = {
  id: 'annex', numbered: false, toc: false, breakBefore: { enabled: true, parity: 'any' },
  span: 'page', marginTop: pt(0), marginBottom: pt(0), // line 4 is the table's float gap
  advancedDesign: { enabled: true, minHeight: pt(3 * LEAD), slot: { elements: [
    text('label', '{attr.label}', face(HEI, BODY, 500, 'ink'), lineTop(1), { align: 'left' }),
    text('title', '{titleText}', face(SONG, 22, 900, 'ink'), lineTop(3)),
    // reserve: false keeps the 版记 out of the room the heading takes: the table goes on.
    rule('imprint-top', IMPRINT, mm(0.35)),
    text('cc', '抄送：{attr.cc}', small, IMPRINT, { ...inset, align: 'left' }),
    rule('imprint-mid', IMPRINT + LINE, mm(0.25)),
    text('office', '{attr.office}', small, IMPRINT + LINE, { ...inset, align: 'left' }),
    text('printed', '{attr.printed}', small, IMPRINT + LINE, { ...inset, align: 'right' }),
    rule('imprint-foot', AREA.h - 0.35 / 2, mm(0.35)),
    text('colophon', '{attr.colophon}', face(HEI, 7, 400, 'muted'), AREA.h + 16, inset),
  ] } },
};
// #endregion

// #region styles: the addressee flush left, the name and the date to the right
const paragraphStyles = [
  { id: 'flush', firstLineIndent: pt(0) }, // 主送机关：居左顶格
  { id: 'annexes', marginTop: pt(LEAD) }, // 附件说明：正文下空一行，左空二字
  // The date, 6.9 ems, starts two cells right of the name and ends two short: 右空二字.
  { id: 'signature', indent: em(17), firstLineIndent: pt(0), marginTop: pt(LEAD) },
  { id: 'date', indent: em(19), firstLineIndent: pt(0) },
];
// #endregion

// The annex's table: the days, the sessions and who teaches them, every cell centred.
const SCHEDULE = [['日期', '时间', '内容', '主讲'],
  ['10月20日', '上午9:00—11:30', '公文格式国家标准解读', '林　岚'],
  ['', '下午14:00—16:30', '版心、字体字号与行距', '周明远'],
  ['10月21日', '上午9:00—11:30', '标题层次、序数与页码', '陈思齐'],
  ['', '下午14:00—16:30', '书刊横排与竖排样张', '林　岚'],
  ['10月22日', '上午9:00—11:30', '公文样张排版实操', '周明远'],
  ['', '下午14:00—16:30', '上机考核与讲评', '全体教员']];
const cells = parseTSV(SCHEDULE.map((row) => row.join('\t')).join('\n')).rows
  .map((row) => row.map((c) => ({ ...c, align: 'center', verticalAlign: 'middle' })));
// Each date spans its two rows (gotcha: merged-cells-hiddenby). Widths in 四号 ems, 31.5 in all.
const schedule = [1, 3, 5].reduce((model, row) => mergeCells(model, { start: { row, col: 0 },
  end: { row: row + 1, col: 0 } }), { rows: cells, headerRowCount: 1,
  columnWidths: [5.6, 9.6, 11.3, 5] });
const resources = [{ id: 'schedule', typeId: 'schedule', kind: 'table', createdAt: 0,
  updatedAt: 0, placement: { position: 'here' }, table: { model: schedule } }];
const resourceTypes = [{ id: 'schedule', name: '日程', shortLabel: '', numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }]; // no label, no number

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hans', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette, page, layout: { layoutType: 'single' }, cjk, bodyText, resourceTypes,
  headings: { fontFamily: SONG, fontWeight: 400, color: col('ink'), levels: [notice, ...levels],
    balancing: { enabled: false } }, // no lines added over heads, no paragraph set loose
  headingStyles: [annex], paragraphStyles, header, footer,
  tableStyle: { borderColor: col('ink'), borderWidth: pt(0.75), cellPadding: mm(2),
    headerBackgroundEnabled: false, headerBold: false, headerFontFamily: HEI, bodyFontFamily: SONG,
    headerFontSize: pt(FOLIO), bodyFontSize: pt(FOLIO), // 四号
    headerColor: col('ink'), bodyColor: col('ink') },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif SC': ['400', '900'], // SONG: the text, number, folios, 版记; the name, the titles
  'Noto Sans SC': ['400', '500'], // HEI: the head line, table heads; the 一、 heads, label, stamp
  'LXGW WenKai TC': ['400'], // KAI: the （一） heads
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of what it sets, template numerals too (gotcha: cjk-fonts-slices).
const lines = (re) => (markdown.match(re) ?? []).join('');
const [table, heads] = [SCHEDULE.flat().join(''), SCHEDULE[0].join('')];
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, `${markdown}${table}0123456789—.（）`);
await loadCjkFonts({ [SONG]: ['900'] }, `${lines(/^# .*$/gm)}文件`);
await loadCjkFonts({ [HEI]: ['400'] }, `${lines(/^subtitle: .*$|colophon="[^"]*"/gm)}${heads}`);
await loadCjkFonts({ [HEI]: ['500'] }, `${lines(/^## .*$/gm)}一二三四五六七八九十、附件样　张`);
await loadCjkFonts({ [KAI]: ['400'] }, `${lines(/^### .*$/gm)}一二三四五六七八九十（）`);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'A Chinese official document to GB/T 9704',
  es: 'Un documento oficial chino según la GB/T 9704' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk · the Cookbook inlines cookbook/_kit/*.js here
