// ═══ Postext Cookbook · Nº 107 · An Arabic research article with notes, citations and an index ═══
// https://postext.dev/en/cookbook/arabic-research-article
// Code: MIT · Text: original Arabic prose (CC BY 4.0) · Pictures: none
// Fonts: Amiri, Noto Kufi Arabic (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the frame; the article is Arabic in both editions
const RECIPE = 'arabic-research-article';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a journal's dark red on a warm white
const palette = {
  ink: '#1d1a19', // text
  red: '#7d2028', // the accent: the journal's name, section numbers, the notes' rule
  rose: '#f1e4e1', // the abstract's ground
  rule: '#c8bcb5', // hairlines
  muted: '#655d58', // running heads, the colophon
  paper: '#fffdfa',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.red })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, LABEL] = ['Amiri', 'Noto Kufi Arabic'];
const [BODY, LEAD] = [12, 20]; // pt: Amiri, partly vocalised, at 1.67 × the size
const TRIM = { width: 170, height: 240 }; // mm: 17 × 24 cm, the Arab journal
const SIDE = { inner: 22, outer: 18 }; // mm
const JOURNAL = 'مجلة دراسات الكتاب والنشر';

// #region answer: notes «(١)» per page, the citations among them, an index without ال
// Citations are written [@ayalon2016, 45] in the text; a note style puts each one in a
// footnote, numbered with the author's own [^notes]. The CSL locale is Arabic: ص for a page.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'chicago-notes-bibliography', notes: 'footnote', locale: 'ar',
  bibliography: { fontSize: em(0.9), lineHeight: pt(17), hangingIndent: em(2),
    entrySpacing: pt(2) },
};
const footnotes = {
  markerTemplate: '({n})', // «(١)», in the document's digits
  numbering: 'page', // from (١) again on every page, as Arabic journals number them
  noteNumberPosition: 'inline', // the note opens with (١) on the line, not raised
  fontSize: pt(10), lineHeight: pt(15), spaceBetween: pt(2),
  textAlign: 'start', // ragged from the right: a Latin title would open wide gaps
  separator: { width: 0.3, lineWidth: pt(0.5), color: col('red') }, // on the start side
};
// The index sorts by the word after the article: الكشيدة files under ك, not under ا.
// ignoreArticle is already true for an Arabic index; it is written out to be seen.
const index = {
  ignoreArticle: true,
  fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(16), indent: em(1.2),
  main: { bold: true }, // the page that defines the term
  groups: { fontFamily: LABEL, fontSize: pt(10), fontWeight: 700, color: col('red') },
};
// #endregion

// #region masthead: the journal's name, the article's title and its author, centred
const centred = (y, extra = {}) => ({ anchor: { to: 'container', edge: 'top' },
  offset: { y: mm(y) }, size: { width: 'fill' }, ...extra });
const line = (id, content, family, size, colour, y, extra = {}) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(colour), align: 'center',
  overflow: 'wrap', placement: centred(y), ...extra });
const masthead = { enabled: true, minHeight: mm(70), slot: { elements: [
  line('journal', JOURNAL, LABEL, 9, 'red', 0, { fontWeight: 700 }),
  line('issue', '{attr.issue}', LABEL, 8, 'muted', 6),
  { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'),
    placement: centred(13) },
  line('title', '{titleText}', TEXT, 22, 'ink', 18, { fontWeight: 700, lineHeight: 1.45 }),
  line('author', '{attr.author}', TEXT, 13, 'ink', 45),
  line('affiliation', '{attr.affiliation}', TEXT, 10, 'muted', 52),
] } };
// #endregion

// #region heads: the journal on the right-hand page, the author and title on the left
const head = (id, content, parity, edge, x) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: LABEL, fontSize: pt(7.5), color: col('muted'), align: edge,
  placement: { anchor: { to: 'page', edge: `top-${edge}` }, offset: { x: mm(x), y: mm(13) } } });
const folio = (id, parity, edge, x) => ({ ...head(id, '{pageNumber}', parity, edge, x),
  fontWeight: 700, color: col('red') });
const header = { elements: [
  folio('r-folio', 'even', 'right', -SIDE.outer),
  head('r-head', JOURNAL, 'even', 'right', -(SIDE.outer + 9)),
  head('l-head', 'سلمى الخطيب: أثر الكشيدة في سرعة القراءة', 'odd', 'left', SIDE.outer + 9),
  folio('l-folio', 'odd', 'left', SIDE.outer),
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // written out, never LANG (gotcha: arabic-locale-tag)
  colorPalette, citations, footnotes, index,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), pageNumbering: { startAt: 87 },
    margins: { top: mm(24), bottom: mm(22), left: mm(SIDE.inner), right: mm(SIDE.outer),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.5), indentAfterHeading: false,
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: LABEL, fontWeight: 700, color: col('ink'),
    balancing: { enabled: false }, // no space added over the heads to fill a page
    levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, marginTop: pt(0),
      marginBottom: pt(0), advancedDesign: masthead },
    // ١- المقدمة: the section number in the document digits, a hyphen after it.
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), numberingTemplate: '{2}-',
      numberSeparator: ' ', color: col('red'), marginTop: pt(LEAD), marginBottom: pt(4) },
  ] },
  headingStyles: [
    { id: 'unnumbered', numbered: false }, // the abstract, the references, the index
    // The index: a title across the page and two columns, the first on the right.
    { id: 'index', numbered: false, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: { enabled: false }, fontSize: pt(18), lineHeight: pt(30),
      marginBottom: pt(LEAD),
      layout: { layoutType: 'double', gutterWidth: mm(8) } },
  ],
  calloutStyles: [{ id: 'abstract', background: col('rose'),
    padding: { top: mm(3.5), right: mm(5), bottom: mm(3.5), left: mm(5) },
    marginTop: pt(0), marginBottom: pt(0),
    titleStyle: { fontFamily: LABEL, fontSize: pt(9), fontWeight: 700, color: col('red') },
    body: { fontSize: pt(10.5), lineHeight: pt(17), firstLineIndent: pt(0) } }],
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(9), lineHeight: pt(13),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header, footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Arabic article in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Amiri: ['400', '700'], // TEXT: the article, notes, references, index; bold emphasis
  'Noto Kufi Arabic': ['400', '700'], // LABEL: masthead, section heads, running heads
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
showBook(doc, { title: t({ en: 'An Arabic research article',
  es: 'Un artículo académico árabe' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
