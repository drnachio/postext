// ═══ Postext Cookbook · Nº 113 · A critical edition (taḥqīq) with notes per page ═══════
// https://postext.dev/en/cookbook/tahqiq-critical-edition
// Code: MIT · Text: Ibn Khaldūn, al-Muqaddima, ar.wikisource (PD) · Pictures: none
// Fonts: Amiri, Aref Ruqaa (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'tahqiq-critical-edition';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// A modern Cairo taḥqīq: black Naskh on a cream paper, headings and rules in one dark red.
const palette = {
  ink: '#1e1a16', // text and notes: a warm near-black
  accent: '#8a2a1d', // headings, the title, the index letters
  rule: '#8c7a62', // hairlines: the rule under the running heads, the rule over the notes
  muted: '#5e564c', // running heads, the imprint
  paper: '#fbf8f0', // a cream paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const NASKH = 'Amiri'; // text, notes, headings in bold, running heads, index
const RUQAA = 'Aref Ruqaa'; // display: the title on the title page
const [W, H] = [170, 240]; // mm: 17 × 24 cm, the size of most Cairo and Beirut editions
const [TOP, INNER, OUTER] = [22, 20, 16]; // mm; `left` is the inner margin on both pages
const MEASURE = W - INNER - OUTER; // 134 mm
const [SIZE, LEAD] = [13, 22.5]; // pt: 1.73 ×, so the few vowels marked clear the line above

// #region answer: abjad folios for the front matter, Arabic-Indic from the text, notes (١)
// The page counter starts in abjad letters: the title page is أ, its back ب, the editor's
// introduction ج and د. Before the text, two directives in the Markdown count again from 1,
// in the document's digits (١ ٢ ٣ in an `ar` document), on the next odd page:
//   :::pagebreak{parity="odd"}
//   :::numbering{format="arabic-indic" startAt=1}
// {pageNumber} prints each page's own label, so one footer and one header serve both runs.
const pageNumbering = { format: 'abjad', startAt: 1 }; // أ ب ج د هـ و ز ح…
// The editor's notes: numbered again on every page, written «(١)», raised after the word in
// the text and on the line at the head of the note. The rule over the notes and each note's
// number stand on the start side, the right, because the page runs right to left.
const footnotes = {
  numbering: 'page', markerTemplate: '({n})', noteNumberPosition: 'inline',
  fontSize: pt(10.5), lineHeight: pt(18.5), color: col('ink'), textAlign: 'justify',
  spaceAbove: pt(14), spaceBelowRule: pt(6),
  separator: { width: 0.28, lineWidth: pt(0.6), color: col('rule') },
};
// #endregion

// #region index: فهرس الأعلام, sorted as if the article ال were not there
// Marks in the text, `:index[المسعودي]`, `:index[الطّبريّ]{term="الطبري"}`. With
// ignoreArticle, المسعودي files under م and الطبري under ط; ابن الكلبي stays under ا.
// It is the default when the index sorts in Arabic: written out here to say so.
const index = { ignoreArticle: true, fontFamily: NASKH, fontSize: pt(11), lineHeight: pt(17),
  color: col('ink'), groups: { fontFamily: NASKH, fontWeight: 700, fontSize: pt(13),
    color: col('accent'), marginTop: pt(8) } };
const indexStyle = { id: 'index', numbered: false, toc: false, span: 'page',
  breakBefore: { enabled: true, parity: 'any' },
  layout: { layoutType: 'double', gutterWidth: mm(10) } }; // two columns under the title
// #endregion

// #region opener: a bold Naskh title and the section's long heading under a short rule
const at = (edge, x, y, to = 'container') => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) } });
const text = (id, content, font, size, placement, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), color: col('ink'), align: 'center', overflow: 'wrap',
  lineHeight: 1.5, placement, ...extra });
const rule = (id, y, width, edge = 'top', to = 'container', x = 0) => ({ kind: 'rule', id,
  direction: 'horizontal', thickness: pt(0.6), color: col('rule'),
  placement: { ...at(edge, x, y, to), size: { width: width === 'fill' ? 'fill' : mm(width) } } });
const design = (elements, minHeight) => ({ enabled: true, minHeight: mm(minHeight),
  slot: { elements } });
const opener = design([
  text('title', '{titleText}', NASKH, 24, at('top', 0, 6),
    { fontWeight: 700, color: col('accent') }),
  rule('rule', 22, 30),
  text('sub', '{attr.sub}', NASKH, 15, { ...at('top', 0, 26), size: { width: mm(110) } },
    { fontWeight: 700 }),
], 44);
// The index and the introduction take the title alone.
const titleOnly = (minHeight) => design([text('title', '{titleText}', NASKH, 20,
  at('top', 0, 4), { fontWeight: 700, color: col('accent') }), rule('rule', 17, 22)],
minHeight);
// #endregion

// #region furniture: running heads over a rule on the body pages, folios on the outer edge
// Running heads are physical. In a book bound on the right the verso (even) is the right
// page: its outer edge, the folio's, is the right one, and its text block starts INNER mm
// from the left edge; the recto (odd) mirrors it.
const HEAD_Y = 14; // mm from the trim
const blockX = (parity) => (parity === 'even' ? INNER : OUTER); // the text block's left edge
const heads = (parity, content) => [
  text(`${parity}-head`, content, NASKH, 10.5,
    { ...at('top-left', blockX(parity), HEAD_Y, 'page'), size: { width: mm(MEASURE) } },
    { color: col('muted'), parity, pages: 'body' }),
  text(`${parity}-folio`, '{pageNumber}', NASKH, 11.5, parity === 'even'
    ? at('top-right', -OUTER, HEAD_Y, 'page') : at('top-left', OUTER, HEAD_Y, 'page'),
  { parity, pages: 'body', align: parity === 'even' ? 'right' : 'left' }),
  { ...rule(`${parity}-rule`, HEAD_Y + 7, MEASURE, 'top-left', 'page', blockX(parity)),
    parity, pages: 'body' },
];
const header = { elements: [...heads('even', '{title}'), ...heads('odd', '{chapterTitle}')] };
const dropFolio = (pages) => text(`folio-${pages}`, '{pageNumber}', NASKH, 11.5,
  at('bottom', 0, -12, 'page'), { pages });
const footer = { elements: [dropFolio('opener')] }; // on the openers, under the text
// Front matter: no running heads, the abjad folio centred at the foot of every page.
const front = { id: 'front', numbered: false, toc: false,
  breakBefore: { enabled: true, parity: 'any' }, header: { elements: [] },
  footer: { elements: [dropFolio('all')] }, advancedDesign: titleOnly(22) };
// #endregion

// #region title: the title page and its back, with nothing in the flow
const onPage = (y) => at('top', 0, y, 'page');
const blind = { numbered: false, toc: false, span: 'page', runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' }, header: { elements: [] },
  footer: { elements: [] } }; // blind folios: أ and ب count, but do not print
const titlePage = { id: 'title', ...blind, advancedDesign: design([
  text('book', '{attr.book}', NASKH, 14, onPage(44), { color: col('muted') }),
  rule('rule-top', 58, 40, 'top', 'page'),
  text('title', '{titleText}', RUQAA, 44, onPage(64), { fontWeight: 700,
    color: col('accent'), lineHeight: 1.3 }),
  rule('rule-foot', 92, 40, 'top', 'page'),
  text('author', 'تأليف {author}', NASKH, 15, onPage(100), { fontWeight: 700 }),
  text('years', '{attr.years}', NASKH, 12, onPage(110)),
  text('part', '{attr.part}: {subtitle}', NASKH, 13, onPage(132)),
  text('editor', '{attr.editor}', NASKH, 12, onPage(178), { color: col('accent') }),
  text('latin', '{attr.latin}', NASKH, 9.5, { ...onPage(196), size: { width: mm(110) } },
    { color: col('muted'), direction: 'ltr' }), // a Latin line: its own direction
], 0) };
const imprintPage = { id: 'imprint', ...blind, advancedDesign: design([
  text('edition', '{attr.edition}', NASKH, 11, onPage(170)),
  text('imprint', '{attr.imprint}', NASKH, 9, { ...onPage(180), size: { width: mm(100) } },
    { color: col('muted'), lineHeight: 1.45, direction: 'ltr' }),
], 0) };
// #endregion

const config = () => ({
  locale: 'ar', // right to left, bound on the right, digits ٠–٩ (gotcha: arabic-locale-tag)
  colorPalette,
  page: { width: mm(W), height: mm(H), dpi: 150, backgroundColor: col('paper'), pageNumbering,
    margins: { top: mm(TOP), bottom: mm(20), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: NASKH, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.5), indentAfterHeading: false,
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true },
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  headings: { fontFamily: NASKH, fontWeight: 700, color: col('accent'),
    levels: [{ level: 1, fontSize: pt(24), breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener }] },
  headingStyles: [titlePage, imprintPage, front,
    { ...indexStyle, advancedDesign: titleOnly(26) }],
  paragraphStyles: [{ id: 'signature', textAlign: 'right', firstLineIndent: pt(0),
    fontWeight: 700, marginTop: pt(LEAD / 2) }], // 'right' is the end of an Arabic line
  unorderedLists: { bulletChar: '•', color: col('accent') }, // the bullets
  footnotes, index, header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  Amiri: ['400', '700'], // NASKH: text, notes, headings, heads, the Latin lines
  'Aref Ruqaa': ['700'], // RUQAA: the title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// The arabic file of each face, which loadFonts leaves out (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A critical edition with notes per page',
  es: 'Una edición crítica con notas por página' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
