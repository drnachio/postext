// ═══ Postext Cookbook · Nº 125 · A Japanese research paper cited to SIST 02 ═══════════
// https://postext.dev/en/cookbook/sist02-research-paper
// Code: MIT · Text: original (CC BY 4.0) · Pictures: drawn in code
// Fonts: Noto Serif JP, Noto Sans JP, Shippori Mincho B1 (SIL OFL 1.1) · Needs postext ≥ 1.16.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerCitationEngine,
  defaultResourceTypes, parseTSV, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the frame; the paper is Japanese in both
const RECIPE = 'sist02-research-paper';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black text, one deep green for the journal, its rules and its labels
const palette = {
  ink: '#1b1d1c', green: '#1f5a46', mist: '#cfe0d8', rule: '#a7b3ad', muted: '#5d6662',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.green })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [MINCHO, GOTHIC, TITLE] = ['Noto Serif JP', 'Noto Sans JP', 'Shippori Mincho B1'];
const [BODY, PITCH] = [9, 15.5]; // pt: 9 pt text on a 15.5 pt line
const [CHARS, LINES] = [25, 45]; // characters to a column's line, lines to a column
const PT = 25.4 / 72; // mm in a point
const AREA = (2 * CHARS + 2) * BODY * PT; // mm: two columns and a 2-em gutter, 165

// #region answer: SIST 02 in Japanese: numbered citations, the list under 参考文献
// Register the engine once, before the first build. SIST 02, the standard Japanese science
// and technology journals cite to, numbers works in the order they are first cited; the
// ja-JP locale writes the list's words and joins authors with と and ほか. The document's
// own locale 'ja' gives the notes their Japanese defaults: at the foot of the column,
// numbered per page, a superscript marker and a rule a third of the column.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'sist02',
  locale: 'ja-JP',
  bibliography: { fontSize: em(8 / BODY), lineHeight: pt(13), entrySpacing: pt(1),
    labelWidth: em(2.2) }, // turnovers under the text of the entry, past the (n)
};
const footnotes = { fontSize: pt(7.5), lineHeight: pt(11.5), color: col('ink'),
  separator: { color: col('rule') } }; // placement, numbering and marker: the 'ja' defaults
// #endregion

// #region masthead: the journal, the paper's kind, its title and English title on a band
const BAND = 78; // mm from the trim's top: the title sits on the journal's green
const at = (id, y) => ({ anchor: { to: `#${id}`, edge: 'below' }, offset: { y: mm(y) },
  size: { width: mm(AREA) } });
const line = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'center',
  overflow: 'wrap', placement, ...extra });
const top = (y) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(y) },
  size: { width: mm(AREA) } });
const masthead = { enabled: true, minHeight: pt(10 * PITCH), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('green') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: 'fill', height: mm(BAND) } } },
  line('journal', '活字と組版の研究', GOTHIC, 13, 'paper', top(-13), { fontWeight: 700,
    align: 'left', letterSpacing: pt(2) }),
  line('issue', '第12巻 第2号（2026）', GOTHIC, 8, 'mist', top(-12), { align: 'right' }),
  line('kind', '{attr.kind}', GOTHIC, 8, 'mist', top(2), { fontWeight: 700,
    letterSpacing: pt(2) }),
  line('title', '{titleText}', TITLE, 20, 'paper', at('kind', 3), { fontWeight: 700,
    lineHeight: 1.45 }),
  line('english', '{attr.english}', MINCHO, 8.5, 'mist', at('title', 3)),
  line('author', '{attr.authors}', MINCHO, 11, 'ink', top(BAND - 16)),
  line('affiliation', '{attr.affiliation}', MINCHO, 8, 'muted', at('author', 1.5)),
] } };
// #endregion

// #region abstract: across both columns, its labels in gothic the colour of the journal
const calloutStyles = [{ id: 'abstract', span: 'page', backgroundEnabled: false,
  stripe: { enabled: true, side: 'top', width: pt(1.5), color: col('green') },
  padding: { top: mm(2.5), bottom: mm(2.5), left: em(2), right: em(2) },
  marginTop: pt(0), marginBottom: pt(PITCH),
  body: { fontFamily: MINCHO, fontSize: pt(8.5), lineHeight: pt(14), firstLineIndent: pt(0),
    textAlign: 'justify' } }];
const chipStyles = [{ id: 'label', fontFamily: GOTHIC, bold: true, color: col('green'),
  backgroundEnabled: false, borderWidth: pt(0), paddingX: em(0), gap: em(1) }];
// #endregion

// Running heads on the body pages: the journal on the verso, the author on the recto.
const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: GOTHIC, fontSize: pt(7.5), color: col('muted'),
  align: edge.endsWith('left') ? 'left' : 'right', placement: { anchor: { to: 'container',
    edge }, offset: { x: mm(x), y: mm(14) } }, ...extra });
const folio = { fontWeight: 700, color: col('green') };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', 0, folio),
  head('v-head', '活字と組版の研究　第12巻 第2号', 'even', 'top-left', 9),
  head('r-head', '森川：号数活字の三つの系列', 'odd', 'top-right', -9),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', 0, folio),
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  resourceTypes: defaultResourceTypes('ja').map((type) => ({ ...type,
    numberingTemplate: '{n}' })), // 図1, 表1: a paper numbers through, not by chapter
  colorPalette,
  citations,
  footnotes,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150, // A4
    pageNumbering: { startAt: 23 },
    margins: { top: mm(24), bottom: mm(20), left: mm(18), right: mm(18), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: pt(2 * BODY) },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } },
  bodyText: { fontFamily: MINCHO, fontSize: pt(BODY), lineHeight: pt(PITCH), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: true },
  headings: { fontFamily: GOTHIC, fontWeight: 700, color: col('ink'),
    balancing: { enabled: false }, // heads stay on the grid
    levels: [
      { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // headings-drop-h1-break
      { level: 2, numberingTemplate: '{2}.', numberSeparator: '　', fontSize: pt(10),
        lineSpan: 2 }, // 2行取り: 1.　はじめに on two lines of the grid
    ] },
  headingStyles: [
    { id: 'article', numbered: false, span: 'page', advancedDesign: masthead },
    { id: 'references', numbered: false },
  ],
  calloutStyles,
  chipStyles,
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('green'), headerColor: col('paper'), headerFontFamily: GOTHIC,
    bodyFontFamily: MINCHO, bodyFontSize: pt(8), bodyColor: col('ink'), cellPadding: mm(1) },
  captionStyle: { fontFamily: GOTHIC, fontSize: pt(7.5), color: col('ink'), labelBold: true,
    labelColor: col('green') }, // 表1　…, the ja default
  paragraphStyles: [{ id: 'colophon', fontFamily: GOTHIC, fontSize: pt(6.5), lineHeight: pt(9),
    color: col('muted'), firstLineIndent: pt(0), textAlign: 'left', marginTop: pt(PITCH) }],
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Japanese paper in both

// #region resources: the table of sizes, and the three series drawn to scale
const SIZES = `号数\t旧号数（pt）\t新号数（pt）\t系列
初号\t42\t42\t初号系
一号\t27.5\t26.25\t一号系
二号\t21\t21\t初号系
三号\t16\t15.75\t三号系
四号\t13.75\t13.125\t一号系
五号\t10.5\t10.5\t初号系
六号\t8\t7.875\t三号系
七号\t5.25\t5.25\t初号系
八号\t4\t3.9375\t三号系`;
const SERIES = [[42, 21, 10.5, 5.25], [27.5, 13.75], [16, 8, 4]]; // old values, pt
const resources = [
  { id: 'tbl:sizes', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' },
    caption: '号数活字の大きさ。新号数はJIS Z 8305（1962）による',
    table: { model: { ...parseTSV(SIZES), headerRowCount: 1, columnWidths: [16, 28, 28, 28] } } },
  { id: 'fig:series', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' },
    caption: '号数活字の三つの系列。上から初号系、一号系、三号系。正方形は旧号数の大きさを実寸で示す',
    altText: 'Three rows of squares drawn to scale: 42, 21, 10.5 and 5.25 pt; 27.5 and 13.75 pt; '
      + '16, 8 and 4 pt. Each square is half the one before it.',
    svg: { fileId: 'series.svg', width: 790, height: 520 } },
];
// #endregion

// #region art: squares at their size in points, labelled in the gothic's latin file
async function labelFace() {
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5/files/'
    + 'noto-sans-jp-latin-400-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `@font-face{font-family:L;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`
    + `text{font-family:L;font-size:2.4px;text-anchor:middle;fill:${palette.muted}}`;
}
function seriesArt(style) {
  let out = '';
  SERIES.forEach((row, r) => {
    let x = 2;
    const base = [17, 33, 47][r]; // mm: the squares of a row stand on one line
    for (const size of row) {
      const s = size * PT; // a square as wide as the type body
      out += `<rect x="${x}" y="${base - s}" width="${s}" height="${s}" fill="${palette.mist}" `
        + `stroke="${palette.green}" stroke-width=".25"/><text x="${x + s / 2}" y="${base + 3}">`
        + `${size}</text>`;
      x += s + 4;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="790" height="520" viewBox="0 0 79 52">`
    + `<style>${style}</style>${out}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif JP': ['400'], // 明朝: text, abstract, notes, references, author
  'Noto Sans JP': ['400', '700'], // ゴシック: journal, heads, labels, captions, table head
  'Shippori Mincho B1': ['700'], // the title, a display mincho
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of what it sets (gotcha: cjk-fonts-slices); the text face also
// gets the words SIST 02 adds to the list.
const all = (re) => (markdown.match(re) ?? []).join('');
const gothic = `${all(/^#+ .*$/gm)}${all(/:chip\[[^\]]*\]/g)}${SIZES}`
  + `${resources.map((r) => r.caption).join('')}活字と組版の研究第巻号森川：三つの系列0123456789`;
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [MINCHO]: FONTS[MINCHO] }, `${markdown}${SIZES}ほかと編巻号頁`);
await loadCjkFonts({ [GOTHIC]: FONTS[GOTHIC] }, gothic);
await loadCjkFonts({ [TITLE]: FONTS[TITLE] }, all(/^# .*$/gm));
await loadSvg('series.svg', seriesArt(await labelFace()));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()),
  markdown);
showPages(doc, { title: t({ en: 'A Japanese paper cited to SIST 02',
  es: 'Un artículo japonés citado según SIST 02' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
