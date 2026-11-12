// ═══ Postext Cookbook · Nº 187 · Appendices in two columns ═══════════════════════════════
// https://postext.dev/en/cookbook/appendices-in-two-columns
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.79.0
// A growers' handbook in six Markdown documents: the chapters in one column, the appendices
// in two columns of smaller type, one appendix in three, and an afterword back in one.
import {
  buildBundle, prepareFonts, withLoadedFonts, renderPageToCanvas,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'appendices-in-two-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: russet for the accent, leaf green for the part pages
const palette = { ink: '#211f1b', accent: '#8e3b24', leaf: '#46603a', muted: '#6c665c',
  rule: '#cfc6b6', paper: '#fffdf8' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS] = ['Source Serif 4', 'Source Sans 3'];
const TRIM = { width: 150, height: 220 }; // mm, a handbook for the shed shelf
const MARGIN = { top: 22, bottom: 24, inner: 19, outer: 15 }; // mirrored
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // 116 mm
const LEAD = 14; // pt, the book's leading

// #region answer: two chapter styles; a part names one, a chapter names the other
const smallOpener = { minHeight: mm(24), slot: { elements: [{ id: 'title', fontSize: pt(16) }] } };
// In the Markdown:  :::part{number="II" title="Appendices" style="appendix"}  sets every
// chapter from there to the next part; a chapter's own  chapterStyle: reference  wins.
const chapterStyles = [
  { id: 'appendix', name: t({ en: 'Appendix', es: 'Apéndice' }), config: {
    layout: { layoutType: 'double', gutterWidth: mm(6) },
    bodyText: { fontSize: pt(8.8), lineHeight: pt(11.6), textAlign: 'left',
      firstLineIndent: pt(0), paragraphSpacing: pt(4) },
    // Lists merge entry by entry on their id or level: only what is named here changes.
    headings: { levels: [{ level: 1, advancedDesign: smallOpener }] },
  } },
  { id: 'reference', name: t({ en: 'Reference list', es: 'Lista de consulta' }), config: {
    layout: { layoutType: 'multiple', columnCount: 3, gutterWidth: mm(4.5) },
    bodyText: { fontFamily: SANS, fontSize: pt(7.8), lineHeight: pt(10.4), textAlign: 'left',
      firstLineIndent: pt(0), paragraphSpacing: pt(3.5), boldColor: col('accent') },
    headings: { levels: [{ level: 1, advancedDesign: smallOpener }] },
  } },
];
// The trim, the language and the fonts stay the book's: a style that sets page.width or
// locale is ignored there, with a chapterStyleBookSetting warning.
// #endregion

// #region parts: a divider page for each :::part, none where the fence says page=false
const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const parts = {
  breakBefore: { parity: 'any' }, // the book is short: a part opens on the next page
  design: { elements: [ // the container is the trim: the margins are measured from its edges
    { kind: 'box', id: 'band', style: { backgroundColor: col('leaf') },
      placement: { ...at('page', 'top-left', 0, 0), size: { width: 'fill', height: mm(96) } } },
    text('number', '{number}', SERIF, 40, { fontWeight: 600, color: col('paper'),
      placement: at('page', 'top-left', MARGIN.inner, 46, MEASURE) }),
    text('title', '{titleText}', SERIF, 24, { fontWeight: 600, color: col('paper'),
      placement: at('#number', 'below', 0, 2, MEASURE) }),
  ] },
};
// #endregion

// #region opener: the chapter title and a short rule, the text sunk under them
const opener = { enabled: true, minHeight: mm(40), slot: { elements: [
  text('title', '{titleText}', SERIF, 22, { fontWeight: 600, lineHeight: 1.12,
    placement: at('container', 'top-left', 0, 8, MEASURE - 10) }),
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5), color: col('accent'),
    placement: { ...at('#title', 'below', 0, 4), size: { width: mm(14) } } },
] } };
// #endregion

// #region running-heads: the book on the verso, the chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => text(id, content, SANS, 7.5, {
  parity, pages: 'body', fontWeight: 600, letterSpacing: pt(1.2), textTransform: 'uppercase',
  color: col('muted'), overflow: 'clip', placement: at('page', edge, x, 12, 90), ...extra });
const folio = { fontWeight: 700, color: col('ink') };
const right = { align: 'right' };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, folio),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 9), // the book's title
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 9), right),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, { ...folio, ...right }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0, {
  ...folio, align: 'center', pages: 'opener', placement: at('page', 'bottom', 0, -14, 20) })] };
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }), colorPalette, chapterStyles, parts, header, footer,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: SERIF, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('accent'), fontWeight: 600, levels: [
    // span 'page': in the appendices' columns the opener still runs across the page.
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, span: 'page',
      advancedDesign: opener },
    { level: 2, fontSize: pt(11), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) },
  ] },
  paragraphStyles: [{ id: 'colophon', fontFamily: SANS, fontSize: pt(7.5), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const front = /* @content */ ''; // the book's front matter, Part I and the first chapter
const rootstocks = /* @content:rootstocks */ '';
const appendices = /* @content:appendices */ ''; // opens Part II in the 'appendix' style
const calendar = /* @content:calendar */ '';
const varieties = /* @content:varieties */ ''; // chapterStyle: reference, in its front matter
const afterword = /* @content:afterword */ ''; // a part with page=false and no style
// #region chapters: six documents in reading order; each part's style runs to the next part
// Only the first document's front matter is the book's; a later one keeps its chapterStyle.
const chapters = [front, rootstocks, appendices, calendar, varieties, afterword]
  .map((markdown) => ({ markdown }));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Source Serif 4': ['400', '400i', '600'], 'Source Sans 3': ['300', '400', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const all = chapters.map((chapter) => chapter.markdown).join('\n');
await prepareFonts(all, config, kitFonts(FONTS));
const docs = await withLoadedFonts(() => buildBundle({ chapters, config }),
  { ...kitFonts(FONTS), text: all });
const TITLE = t({ en: 'Apples for a Cold Valley', es: 'Manzanos para un valle frío' });
showPages(docs, { title: TITLE });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
