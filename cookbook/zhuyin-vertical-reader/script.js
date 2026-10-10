// ═══ Postext Cookbook · Nº 080 · A vertical reader with zhuyin to the right ═════════
// https://postext.dev/en/cookbook/zhuyin-vertical-reader
// Code: MIT · Text: Han Feizi, zh.wikisource (CC BY-SA 4.0) · Pictures: diffusion models
// Fonts: Iansui, LXGW WenKai TC, Noto Serif TC, Noto Sans TC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'zhuyin-vertical-reader';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, every one linked by id
const palette = {
  ink: '#2b2520', // text and zhuyin
  accent: '#b83f28', // lesson title, labels, the unit's tab (4.9:1 on the tint)
  tint: '#f7efdf', // the boxes of the upper tier
  muted: '#72675b', // lead, folios, colophon
  paper: '#ffffff', // the lettering on the tab
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const KAI = 'Iansui'; // 楷: the lesson, drawn to Taiwan's standard forms (為, not 爲)
const ZHUYIN = 'LXGW WenKai TC'; // the readings: a round dot for the neutral tone
const MING = 'Noto Serif TC'; // 明: notes and the author box
const HEI = 'Noto Sans TC'; // 黑: labels, folios, the tab
const SIZE = 16; // the text size (三號)

// #region answer: vertical text with a zhuyin column right of every character
const layout = {
  writingMode: 'vertical-rl', // lines run down the page, read from the right; bound on the right
  layoutType: 'oneAndHalf', // two tiers: the text below, pictures and notes above
  sideColumnRole: 'floats', sideColumnSide: 'left', // 'left' is the top tier in vertical text
  sideColumnPercent: 34,
  gutterWidth: pt(2 * SIZE),
};
const cjk = {
  // The lower tier: 23 characters down, 13 lines across the page.
  grid: { enabled: true, charsPerLine: 23, linesPerPage: 13 },
  // Readings at half the text size; zhuyin sets its symbols at 60 % of that, 0.3 em,
  // so three symbols fit beside one character, and beside each of two in a row.
  ruby: { fontFamily: ZHUYIN, fontSize: em(0.5) },
};
// The line pitch is twice the size: a gap of one em, which the zhuyin and its tone
// marks half fill. clreq asks for 1.5 em; one em keeps 13 lines of 23 on the page.
const LINE = 2 * SIZE;
const bodyText = {
  fontFamily: KAI, fontSize: pt(SIZE), lineHeight: pt(LINE), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
};
// #endregion

// #region upper-tier: pictures without a caption line, boxes of notes set down the tier
const resourceTypes = [{ id: 'plate', name: '插圖', shortLabel: '圖', numberingTemplate: '{n}',
  resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }]; // no prefix, no caption
const box = (id, title, body) => ({ id, title, background: col('tint'),
  padding: { top: mm(3), right: mm(3), bottom: mm(3), left: mm(3) },
  titleStyle: { fontFamily: HEI, fontSize: pt(11), fontWeight: 700, color: col('accent') },
  body: { color: col('ink'), firstLineIndent: pt(0), textAlign: 'left', boldColor: col('ink'),
    italicColor: col('ink'), ...body } });
// Zhuyin is 0.3 em of the text it reads: at 13 pt the notes' readings are 3.9 pt.
const calloutStyles = [ // fenced :::callout{type="notes" span="side"} in the text
  box('notes', '注釋', { fontFamily: MING, fontSize: pt(13), lineHeight: pt(24) }),
  box('author', '作者', { fontFamily: MING, fontSize: pt(13), lineHeight: pt(24),
    textAlign: 'justify', firstLineIndent: em(2) }),
  box('chars', '生字', { fontFamily: KAI, fontSize: pt(22), lineHeight: pt(40),
    textAlign: 'center' }),
];
// #endregion

// #region furniture: the unit's tab and the folios, on the outer edge of a right-bound book
// The verso lies on the right of the spread, so even pages carry both at the right edge.
const tab = (parity, edge) => [
  { kind: 'box', id: `tab-${parity}`, parity, pages: 'all',
    placement: { anchor: { to: 'page', edge }, offset: { y: mm(24) },
      size: { width: mm(9), height: mm(64) } }, style: { backgroundColor: col('accent') } },
  { kind: 'text', id: `unit-${parity}`, content: '第三單元　寓言故事', parity, pages: 'all',
    writingMode: 'vertical-rl', fontFamily: HEI, fontSize: pt(9), fontWeight: 700,
    color: col('paper'), align: 'center', verticalAlign: 'middle',
    placement: { anchor: { to: `#tab-${parity}`, edge: 'align-top' },
      size: { width: mm(9), height: mm(64) } } },
];
const foot = (id, parity, edge, x, content, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'all', fontFamily: HEI, fontSize: pt(8),
  color: col('muted'), placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-9) } },
  ...extra,
});
const folio = { fontSize: pt(9), fontWeight: 700 };
const header = { elements: [...tab('even', 'top-right'), ...tab('odd', 'top-left')] };
const footer = {
  elements: [
    foot('folio-even', 'even', 'bottom-right', -16, '{pageNumber}', folio),
    foot('book', 'even', 'bottom-right', -26, '國語　第九冊'),
    foot('folio-odd', 'odd', 'bottom-left', 16, '{pageNumber}', folio),
    foot('lesson', 'odd', 'bottom-left', 26, '{chapterNumber}　{chapterTitle}'),
  ],
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // Taiwan: full-width punctuation, centred in its cell (gotcha: cjk-locale-tag)
  colorPalette,
  resourceTypes,
  page: {
    sizePreset: 'custom', width: mm(184), height: mm(260), dpi: 150, // 16開
    margins: { top: mm(24), bottom: mm(18), left: mm(18), right: mm(16), mirror: true },
  },
  layout,
  cjk,
  bodyText,
  headings: {
    fontFamily: KAI, color: col('ink'), fontWeight: 400, // Iansui has one weight
    levels: [
      // 第十二課 and 一, 二: the number stays outside the title's first reading.
      { level: 1, fontSize: pt(30), lineHeight: pt(2 * LINE), color: col('accent'),
        numberingTemplate: '第{1:一}課', numberSeparator: '　',
        breakBefore: { enabled: true, parity: 'any' }, marginBottom: pt(0) },
      { level: 2, fontSize: pt(20), lineHeight: pt(2 * LINE), marginTop: pt(LINE),
        numberingTemplate: '{2:一}', numberSeparator: '　', marginBottom: pt(0) },
      { level: 3, fontFamily: HEI, fontWeight: 700, fontSize: pt(13), lineHeight: pt(LINE),
        color: col('accent'), marginTop: pt(LINE / 2), marginBottom: pt(0) },
    ],
  },
  // 想一想 and 語文天地: exercise heads in the label face, one line tall.
  headingStyles: [{ id: 'drill', numbered: false, fontFamily: HEI, fontWeight: 700,
    fontSize: pt(13), lineHeight: pt(LINE), color: col('accent'), marginTop: pt(LINE / 2),
    marginBottom: pt(0) }],
  orderedLists: { numberFormat: 'trad-chinese-informal', separator: '、', color: col('accent'),
    fontFamily: HEI, fontWeight: 700, marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'lead', fontFamily: KAI, fontSize: pt(14), lineHeight: pt(LINE), color: col('muted'),
      textAlign: 'justify', firstLineIndent: em(0) },
    { id: 'plain', fontFamily: KAI, fontSize: pt(14), lineHeight: pt(LINE), color: col('ink'),
      textAlign: 'justify', firstLineIndent: em(2) },
    { id: 'idiom', fontFamily: KAI, fontSize: pt(SIZE), lineHeight: pt(LINE), color: col('ink'),
      boldColor: col('accent'), boldFontWeight: 400, textAlign: 'justify', // bold in colour only
      firstLineIndent: em(0) },
    { id: 'colophon', fontFamily: HEI, fontSize: pt(7), lineHeight: pt(11), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LINE) },
  ],
  calloutStyles,
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Iansui: ['400'],
  'LXGW WenKai TC': ['400'],
  'Noto Serif TC': ['400'],
  'Noto Sans TC': ['400', '700'],
};
// What the label face sets: the tab, the foot of the page, box titles and exercise heads.
const LABELS = '第三單元寓言故事國語第九冊十二課兩則注釋作者生字語譯想一文天地、0123456789';

// #region art: two brush paintings for the upper tier, JPEGs in assets/ cut to 15 : 7
const plates = { 'plate-1': 'plate-1-1500.jpg', 'plate-2': 'plate-2-1500.jpg' };
// #endregion
const altText = {
  'plate-1': '守株待兔：農夫坐在樹樁旁，農具丟在田裡，一隻兔子跑遠了。',
  'plate-2': '鄭人買履：鄭國人從鞋攤走回家，量好的尺碼還放在家門口的凳子上。',
};
const resources = Object.entries(plates).map(([id, fileId]) => ({ id, typeId: 'plate',
  kind: 'bitmap', createdAt: 0, updatedAt: 0, altText: altText[id], placement: { span: 'side' },
  bitmap: { fileId, format: 'jpeg', width: 1500, height: 700 } })); // declared at their pixels

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: each voice loads with the text it sets; vertical forms for the canvas
// {株|ㄓㄨ}: the characters are the text, the readings go to the zhuyin face.
const BOXES = /^:::callout\{type="(?:notes|author)"[^}]*\}\n([\s\S]*?)^:::$/gm;
const bases = (md) => md.replace(/\{([^|{}]+)((?:\|[^|{}]+)+)\}/g, '$1');
const readings = [...markdown.matchAll(/\{[^|{}]+((?:\|[^|{}]+)+)\}/g)].map((m) => m[1]).join('');
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [KAI]: ['400'] }, bases(markdown.replace(BOXES, '')), { vertical: true });
const notesText = [...markdown.matchAll(BOXES)].map((m) => m[1]).join('\n');
await loadCjkFonts({ [MING]: ['400'] }, bases(notesText), { vertical: true });
await loadCjkFonts({ [ZHUYIN]: ['400'] }, readings.replaceAll('|', ''), { vertical: true });
await loadCjkFonts({ [HEI]: ['400', '700'] }, LABELS, { vertical: true });
await Promise.all(Object.values(plates).map((fileId) => loadImage(fileId, asset(fileId))));
// Lesson 12 of a reader: page 86 is a verso, so the lesson opens on a spread.
const continuation = { pageIndexOffset: 1, pageNumbering: { startAt: 86 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showBook(doc, { title: t({ en: 'A vertical reader with zhuyin',
  es: 'Un libro de lectura vertical con zhuyin' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images cjk
