// ═══ Postext Cookbook · Nº 079 · An index of Chinese names, by pinyin and by strokes ═══
// https://postext.dev/en/cookbook/chinese-name-index
// Code: MIT · Text: 紅樓夢 (1792), zh.wikisource transcription (CC BY-SA 4.0) · Pictures: none
// Fonts: Noto Serif SC/TC, Noto Sans SC/TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-name-index';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink on a warm paper, one cinnabar for the heads and the index letters
const palette = {
  ink: '#1f1b18', // text
  cinnabar: '#a3301f', // the one accent: 回 numbers, index heads
  muted: '#6b635a', // running heads, folios, colophon
  rule: '#d6cdbf', // the short rule under each title
  paper: '#fbf8f1',
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, never the default blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.cinnabar, model: 'hex' } },
];
// #endregion

// #region editions: one book, two scripts; the locale decides the index order
// The mainland edition in Simplified characters and the Taiwan edition in Traditional ones.
// Each takes the Song (serif) and Hei (sans) faces cut for its script. The Kai face sets the
// titles only: its punctuation sits in the middle of the em, as Taiwan sets it.
const EDITIONS = {
  hans: { locale: 'zh-Hans', serif: 'Noto Serif SC', sans: 'Noto Sans SC' },
  hant: { locale: 'zh-Hant', serif: 'Noto Serif TC', sans: 'Noto Sans TC' },
};
const KAI = 'LXGW WenKai TC';
// #endregion
const LEAD = 18; // body leading in pt: 1.7 × the 10.5 pt text (五号)
const MEASURE = (26 * 10.5 * 25.4) / 72; // the grid's 26 characters of 10.5 pt, in mm
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: the same marks, grouped by pinyin in zh-Hans and by strokes in zh-Hant
// Marks in the Markdown, one per passage; main is the page where the character enters:
//   字:index[士隐]{term="甄士隐" main}      :index{term="贾化" see="贾雨村"}
// Printed at the end of each edition: # 人名索引 {style="index"}, then :::index
const index = (e) => ({
  // 'auto' reads the same from the locale: pinyin for zh-Hans, strokes for zh-Hant.
  groupBy: e.locale === 'zh-Hans' ? 'pinyin' : 'stroke', // A B C… or 三畫 四畫…
  fontFamily: e.serif, fontSize: pt(9), lineHeight: pt(14),
  separator: '\u3000', locatorSeparator: '，', // 贾宝玉　4，7: an ideographic space, then ，
  see: { italic: false }, // 见 / 見 upright: Chinese has no italic (gotcha: cjk-no-italic)
  groups: { fontFamily: e.sans, fontSize: pt(9.5), fontWeight: 700, color: col('cinnabar'),
    marginTop: pt(7) },
});
const indexHeading = { id: 'index', numbered: false, breakBefore: { enabled: true, parity: 'any' },
  layout: { layoutType: 'double', gutterWidth: pt(21) } }; // two columns, 2 characters apart
// #endregion

// #region opener: 第一回 in Hei over the couplet in Kai; the index adds its note
const opener = (e, sink, kicker, note = []) => ({
  enabled: true,
  minHeight: pt(LEAD * sink), // the text starts on the same line after every opener
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: kicker, fontFamily: e.sans, fontSize: pt(9),
      fontWeight: 700, letterSpacing: pt(2.7), color: col('cinnabar'), align: 'center',
      placement: { ...at('container', 'top', 0, 8), size: { width: 'fill', height: 'auto' } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: KAI, fontSize: pt(16),
      lineHeight: 1.45, color: col('ink'), align: 'center',
      overflow: 'wrap', // design text ends in an ellipsis by default
      placement: { ...at('#kicker', 'below', 0, 3), size: { width: 'fill', height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
      placement: { ...at('#title', 'below', (MEASURE - 12) / 2, 4), size: { width: mm(12) } } },
    ...note,
  ] },
});
// The index note comes from the heading (note="…"): above the two columns, set once across
// the measure, it is not a paragraph the columns could loosen to balance themselves.
const indexNote = (e) => [{ kind: 'text', id: 'note', content: '{attr.note}',
  fontFamily: e.serif, fontSize: pt(9), lineHeight: 1.6, color: col('muted'), align: 'center',
  overflow: 'wrap', placement: { ...at('#rule', 'below', -(MEASURE - 12) / 2, 4),
    size: { width: 'fill', height: 'auto' } } }];
// #endregion

// #region running-heads: book title on the verso, the chapter on the recto, folios outside
const head = (e, id, content, parity, edge, y, extra = {}) => ({
  kind: 'text', id, content, parity, fontFamily: e.sans, fontSize: pt(7.5), fontWeight: 700,
  letterSpacing: pt(0.8), color: col('muted'), align: edge.endsWith('left') ? 'left' : 'right',
  placement: at('container', edge, 0, y), ...extra,
});
const header = (e) => ({ elements: [
  head(e, 'verso-title', '{title}', 'even', 'top-left', 14, { pages: 'body' }),
  head(e, 'recto-title', '{chapterTitle}', 'odd', 'top-right', 14, { pages: 'body' }),
] });
const footer = (e) => ({ elements: [ // folios at the outer foot, openers included
  head(e, 'verso-folio', '{pageNumber}', 'even', 'bottom-left', -12),
  head(e, 'recto-folio', '{pageNumber}', 'odd', 'bottom-right', -12),
] });
// #endregion

let e = EDITIONS.hans; // the edition config() lays out: the build loop below sets it
const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: e.locale, // zh-Hans or zh-Hant, never LANG (gotcha: cjk-locale-tag)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(140), height: mm(203), dpi: 150, // 大32开
    backgroundColor: col('paper'),
    // Minimums: the character grid centres its type area in what they leave, 天头 over 地脚.
    margins: { top: mm(24), bottom: mm(20), left: mm(16), right: mm(20), mirror: true } },
  layout: { layoutType: 'single' },
  cjk: { grid: { enabled: true, charsPerLine: 26, linesPerPage: 24 } },
  bodyText: { fontFamily: e.serif, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true, // 2 characters
    avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: KAI, fontWeight: 400, color: col('ink'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, fontSize: pt(16), marginBottom: pt(0),
      advancedDesign: opener(e, 6, '第{numberHan}回'), // 第一回, 第二回… in the edition's script
      breakBefore: { enabled: true, parity: 'any' } }, // each 回 on a new page
  ] },
  headingStyles: [{ ...indexHeading, span: 'page', marginBottom: pt(0),
    advancedDesign: opener(e, 7, '{attr.kicker}', indexNote(e)) }],
  index: index(e),
  paragraphStyles: [{ id: 'colophon', fontFamily: e.serif, fontSize: pt(7), lineHeight: pt(10.5),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header: header(e),
  footer: footer(e),
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the Simplified edition, content.<lang>.md
const traditional = /* @content:hant */ ''; // the Traditional edition, content.hant.<lang>.md

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses (gotcha: fonts-first). The CJK families load by slices.
const FONTS = { 'Noto Serif SC': ['400', '700'], 'Noto Sans SC': ['700'],
  'Noto Serif TC': ['400', '700'], 'Noto Sans TC': ['700'], 'LXGW WenKai TC': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown + traditional);
// #region voices: each face loads the files of the characters it sets (gotcha: cjk-fonts-slices)
const DIGITS = '0123456789';
const HEADS = '第回一二三四五六七八九十画畫ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lines = (md, re) => (md.match(re) ?? []).join('\n');
for (const [key, md] of [['hans', markdown], ['hant', traditional]]) {
  e = EDITIONS[key];
  const headings = lines(md, /^(# |title: ).*$/gm); // the headings, their attributes, the title
  await loadCjkFonts({ [e.serif]: ['400'] }, md);
  await loadCjkFonts({ [e.serif]: ['700'] }, DIGITS); // the bold page numbers
  await loadCjkFonts({ [e.sans]: ['700'] }, headings + HEADS + DIGITS);
  await loadCjkFonts({ [KAI]: ['400'] }, lines(md, /^# [^{\n]*/gm)); // the titles alone
}
// #endregion
const docs = {};
for (const [key, md] of [['hans', markdown], ['hant', traditional]]) {
  e = EDITIONS[key];
  docs[key] = await buildWithFonts(() => buildDocument({ markdown: md }, config()), md);
}
const title = t({ en: 'A Chinese name index', es: 'Un índice de nombres chinos' });
showPages(docs.hans, { title });

// #region side-by-side: the first index page of each edition, above the desk
const indexPage = (doc) => doc.pages[doc.blocks.find((b) => b.headingStyleId === 'index')
  ?.pageIndex ?? doc.pages.length - 1];
const labels = { hans: t({ en: 'Simplified · by pinyin', es: 'Simplificado · por pinyin' }),
  hant: t({ en: 'Traditional · by strokes', es: 'Tradicional · por trazos' }) };
document.getElementById('pages').insertAdjacentHTML('beforebegin', `<section id="indexes" style="
  display:flex;flex-wrap:wrap;justify-content:center;gap:24px;padding:28px 16px;background:#e9e4da">
  ${Object.keys(docs).map((key) => `<figure style="margin:0;width:min(340px,44vw)">
  <canvas id="index-${key}" role="img" style="display:block;width:100%;background:#fff;
  box-shadow:0 18px 36px -18px rgb(0 0 0 / .45)"></canvas><figcaption style="margin-top:10px;
  font:600 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#5b534a">
  ${labels[key]}</figcaption></figure>`).join('')}</section>`);
for (const [key, doc] of Object.entries(docs)) {
  const canvas = document.getElementById(`index-${key}`);
  const page = indexPage(doc);
  canvas.setAttribute('aria-label', `${labels[key]}, ${page.pageLabel}`);
  renderPageToCanvas(page, doc, canvas, { scale: (2 * canvas.clientWidth) / page.width });
}
// #endregion
// The desk shows either edition; the PDF holds the one on the desk.
let shown = 'hans';
for (const key of ['hant', 'hans']) {
  const button = Object.assign(document.createElement('button'),
    { type: 'button', textContent: key === 'hans' ? '简体版' : '繁體版' });
  button.addEventListener('click', () => { shown = key; showPages(docs[key], { title }); });
  document.getElementById('pt-actions').prepend(button);
}
offerPdf(() => renderToPdf(docs[shown], { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
