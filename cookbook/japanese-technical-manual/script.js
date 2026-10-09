// ═══ Postext Cookbook · Nº 123 · A Japanese technical manual: kana, kanji and Latin ═══
// https://postext.dev/en/cookbook/japanese-technical-manual
// Code: MIT · Text: original (CC BY 4.0) · Pictures: drawn in code
// Fonts: Noto Serif JP, Noto Sans JP, BIZ UDGothic (SIL OFL 1.1) · Needs postext ≥ 1.23.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes, parseTSV,
  registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the chapter is Japanese in both
const RECIPE = 'japanese-technical-manual';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, one deep teal for numbers, rules and labels, a pale tint for code
const palette = {
  ink: '#1d2327', // text: a cool near-black
  teal: '#0e5a6e', // the one accent: chapter number, heads' numbers, labels, the point box
  tint: '#e7f0f2', // the opener band, the listing's ground
  rule: '#b9c6cc', // hairlines: table rules, the note rule
  muted: '#5b666d', // running heads, folios, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.teal })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [MINCHO, GOTHIC, CODE] = ['Noto Serif JP', 'Noto Sans JP', 'BIZ UDGothic'];
const [BODY, PITCH] = [9, 16]; // pt: 9 pt text on a 16 pt line, 1.78 × the size
const [CHARS, LINES] = [36, 29]; // the type area in characters: 36 to a line, 29 lines
const MEASURE = CHARS * BODY * 25.4 / 72; // mm: 114.3

// #region answer: Japanese rules from the tag, written out; the quarter-em Latin space
// locale 'ja' turns on JLReq composition: kinsoku at its strictest, full-width marks squeezed
// where two meet (」、 takes one em, not two), a closing mark keeps its half em at a line
// end, 、。 may hang past it, and a paragraph opening with 「 sets the bracket in the indent.
// The values below are the ones 'auto' picks for 'ja'; they are spelled out to be seen.
const cjk = {
  lineBreak: 'ja-very-strict', // no line starts with ー, small kana, 々, 」、。？・ or ：
  punctuationWidth: 'fullwidth', // 、。「」 keep their em inside the line (JLReq §3.1.2)
  hangingPunctuation: 'allow', // 、。 hang only when the line would otherwise break before them
  paragraphStartBracket: 'half', // 「 at a paragraph start sits in the indent's second half
  latinSpacing: em(0.25), // 四分アキ between kana or kanji and Latin letters or digits
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES }, // whole ems, whole lines
};
// The Latin is the Japanese face's own proportional Latin, at the text's size: never
// full-width Ａ or a second face for the words in parentheses.
const bodyText = {
  fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(PITCH), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true, // 1 字下げ
  referenceBold: false, // 図3-1 and 表3-1 in the text weight: the face loads no bold
  hyphenation: { enabled: false }, avoidRunts: true, // no one-character last line
};
// #endregion

// #region listing: a fenced block is a code listing in a tinted box
// A ``` fence is set line by line as written, in codeStyle's face: the monospaced face,
// which has kana and kanji too, so a full-width character takes two half-width cells.
// The rest of the fence line (normalize.py) is the listing's title. Inline `code` is set
// in the same face, in the accent.
const codeStyle = {
  fontFamily: CODE, fontSize: pt(8), lineHeight: pt(12), color: col('ink'),
  background: col('tint'), snapToGrid: false, highlight: 'none', // one ink, as in print
  padding: { top: mm(2.5), right: mm(4), bottom: mm(3), left: mm(4) },
  marginTop: mm(2), marginBottom: mm(2),
  titleStyle: { fontFamily: CODE, fontSize: pt(7), fontWeight: 400, color: col('teal') },
  inline: { fontSize: pt(8.5), color: col('teal') },
};
// #endregion

// #region opener: a tinted band, the chapter number large in the accent, the title under it
const BAND = 74; // mm from the trim's top
const opener = { enabled: true, minHeight: pt(PITCH * 10), slot: { elements: [ // text: line 11
  { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND) } } },
  { kind: 'text', id: 'kicker', content: 'CHAPTER', fontFamily: GOTHIC, fontSize: pt(8),
    fontWeight: 700, letterSpacing: pt(1.6), color: col('teal'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(0) } } },
  { kind: 'text', id: 'number', content: '{numberDecimal}', fontFamily: GOTHIC, fontSize: pt(64),
    lineHeight: 1, fontWeight: 700, color: col('teal'), align: 'left',
    placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(1) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: GOTHIC,
    fontSize: pt(20), fontWeight: 700, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#number', edge: 'below' }, offset: { y: mm(5) },
      size: { width: mm(MEASURE) } } },
] } };
// #endregion

// Running heads: the book on the verso, the chapter on the recto, folios outside.
// Anchored to the header's container, which spans the measure, so they align with the text
// wherever the grid puts its margins.
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: GOTHIC, fontSize: pt(7.5), color: col('muted'),
  align: edge.endsWith('left') ? 'left' : 'right',
  placement: { anchor: { to: 'container', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra });
const folio = { fontWeight: 700, color: col('teal') };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', 0, folio),
  head('v-title', '{title}', 'even', 'top-left', 8),
  head('r-title', '{chapterNumber}　{chapterTitle}', 'odd', 'top-right', -8),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', 0, folio),
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  resourceTypes: defaultResourceTypes('ja'), // 図 and 表, numbered by chapter: 図3-1
  colorPalette,
  page: { sizePreset: 'custom', width: mm(148), height: mm(210), dpi: 150, // A5
    // Minimums: the grid grows them to centre its 36 × 29 area, the head deeper than the foot.
    margins: { top: mm(23), bottom: mm(19), left: mm(17), right: mm(14), mirror: true } },
  layout: { layoutType: 'single' },
  cjk,
  bodyText,
  headings: { fontFamily: GOTHIC, fontWeight: 700, color: col('ink'),
    balancing: { enabled: false }, // no lines added above heads: the grid holds
    levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, numberingTemplate: '第{1}章', breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: opener },
    // 3行取り: each section head takes three body lines, so the grid holds across it.
    { level: 2, numberingTemplate: '{1}.{2}', numberSeparator: '　', fontSize: pt(11),
      lineSpan: 3 },
  ] },
  // #region notes: only their size and colour; placement and numbering are the 'ja' defaults
  footnotes: { fontSize: pt(7.5), lineHeight: pt(12), color: col('ink'),
    separator: { color: col('rule') } }, // at the column foot, 1 on each page, superscript
  // #endregion
  unorderedLists: { bulletChar: '・', color: col('teal'), fontWeight: 400,
    marginTop: pt(0), marginBottom: pt(0) },
  codeStyle,
  calloutStyles: [
    { id: 'point', backgroundEnabled: false,
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('teal') },
      padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(5) },
      marginTop: pt(PITCH), marginBottom: pt(PITCH),
      titleStyle: { fontFamily: GOTHIC, fontSize: pt(8), fontWeight: 700, color: col('teal') },
      body: { fontFamily: GOTHIC, fontSize: pt(BODY), lineHeight: pt(PITCH), color: col('ink'),
        firstLineIndent: pt(0), textAlign: 'justify' } },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('teal'), headerColor: col('paper'), headerFontFamily: GOTHIC,
    bodyFontFamily: MINCHO, bodyFontSize: pt(8), bodyColor: col('ink'), cellPadding: mm(1.2) },
  captionStyle: { fontFamily: GOTHIC, fontSize: pt(8), color: col('ink'), labelBold: true,
    labelColor: col('teal') }, // 図3-1　…, the ja default
  paragraphStyles: [
    { id: 'lead', fontFamily: GOTHIC, fontSize: pt(BODY), lineHeight: pt(PITCH),
      color: col('ink'), firstLineIndent: pt(0), marginBottom: pt(PITCH) },
    { id: 'colophon', fontFamily: GOTHIC, fontSize: pt(6.5), lineHeight: pt(9),
      color: col('muted'), firstLineIndent: pt(0), textAlign: 'left', marginTop: pt(PITCH) },
  ],
  header,
  footer: { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
    pages: 'opener', fontFamily: GOTHIC, fontSize: pt(7.5), fontWeight: 700, color: col('teal'),
    align: 'center', placement: { anchor: { to: 'container', edge: 'bottom' },
      offset: { y: mm(-10) } } }] }, // a drop folio on the opener
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese chapter in both

// #region resources: the table of forms, and the bytes of が drawn in code
const FORMS = `入力\tNFC\tNFD\tNFKC
が（U+304C）\tU+304C\tU+304B U+3099\tU+304C
ｶﾞ（U+FF76 U+FF9E）\tそのまま\tそのまま\tガ（U+30AC）
ＡＢＣ（全角）\tそのまま\tそのまま\tABC
①\tそのまま\tそのまま\t1
㍻\tそのまま\tそのまま\t平成`;
const resources = [
  { id: 'tbl:forms', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' }, // at its ::resource line, under the paragraph citing it
    caption: '日本語の文字と四つの正規化形式（NFKDは、NFKCで合成された文字を分解した形になる）',
    table: { model: { ...parseTSV(FORMS), headerRowCount: 1, columnWidths: [34, 18, 26, 22] } } },
  { id: 'fig:bytes', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    caption: '「が」の二つの表し方。上段が符号位置、下段がUTF-8のバイト列',
    altText: 'が as one code point U+304C, three UTF-8 bytes E3 81 8C; and as U+304B and the '
      + 'combining voiced mark U+3099, six bytes E3 81 8B E3 82 99.',
    svg: { fileId: 'bytes.svg', width: 1175, height: 400 } },
];
// #endregion

// #region art: the figure's labels in the code face, embedded (gotcha: svg-no-webfonts)
async function codeFace() {
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/biz-udgothic@5/files/'
    + 'biz-udgothic-latin-400-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `@font-face{font-family:C;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`
    + `text{font-family:C;font-size:3.2px;text-anchor:middle;fill:${palette.ink}}`;
}
function bytesArt(style) {
  const box = (x, y, w, h, fill, stroke, text) => `<rect x="${x}" y="${y}" width="${w}" `
    + `height="${h}" fill="${palette[fill]}" stroke="${palette[stroke]}" stroke-width=".3"/>`
    + `<text x="${x + w / 2}" y="${y + h / 2 + 1.1}">${text}</text>`;
  const side = (x, y, text, color) => `<text x="${x}" y="${y}" style="fill:${palette[color]};`
    + `font-size:3.6px">${text}</text>`;
  const row = (y, label, points, bytes) => side(14, y + 9, label, 'teal')
    + points.map((p, i) => box(26 + i * 31, y, 30, 7, 'tint', 'teal', p)).join('')
    + bytes.map((b, i) => box(26 + i * 10 + Math.floor(i / 3), y + 9, 9.5, 7, 'paper', 'rule', b))
      .join('') + side(103, y + 9, `${bytes.length} bytes`, 'muted');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1175" height="400" viewBox="0 0 117.5 40">`
    + `<style>${style}</style>${row(3, 'NFC', ['U+304C'], ['E3', '81', '8C'])}`
    + `${row(22, 'NFD', ['U+304B', 'U+3099'], ['E3', '81', '8B', 'E3', '82', '99'])}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif JP': ['400'], // 明朝: the text, the notes, the table
  'Noto Sans JP': ['400', '700'], // ゴシック: heads, the lead, labels, the point box, folios
  'BIZ UDGothic': ['400'], // the code: fixed pitch, half-width Latin, inline and in the listing
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each Japanese face loads the files of what it sets (gotcha: cjk-fonts-slices).
const all = (re) => (markdown.match(re) ?? []).join('');
const gothic = `${all(/^#+ .*$/gm)}${all(/:::paragraphs\{style="lead"\}\n[^\n]*/g)}`
  + `${all(/:::callout\{type="point"[\s\S]*?\n:::/g)}${resources.map((r) => r.caption).join('')}`
  + '入力NFCDK第章実践日本語テキスト処理CHAPTER0123456789';
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, `${markdown}${FORMS}`);
await loadCjkFonts({ [GOTHIC]: FONTS[GOTHIC] }, gothic);
const code = (markdown.match(/^```[\s\S]*?^```$|`[^`\n]+`/gm) ?? []).join('');
await loadCjkFonts({ [CODE]: FONTS[CODE] }, code);
await loadSvg('bytes.svg', bytesArt(await codeFace()));
const continuation = { pageIndexOffset: 40, pageNumbering: { startAt: 41 }, headings: { h1: 2 } };
const doc = await buildWithFonts(() => buildDocument({ markdown, resources, continuation },
  config()), markdown);
showPages(doc, { title: t({ en: 'A Japanese technical manual',
  es: 'Un manual técnico japonés' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
