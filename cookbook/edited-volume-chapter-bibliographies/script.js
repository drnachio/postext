// ═══ Postext Cookbook · Nº 098 · An edited volume with a bibliography per chapter ═════
// https://postext.dev/en/cookbook/edited-volume-chapter-bibliographies
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Libre Caslon Text & Display, IBM Plex Sans Condensed (OFL 1.1) · Needs postext ≥ 1.25.0
// Three essays by three contributors, each a Markdown document of its own with its own
// BibTeX block, laid out by buildBundle as one volume: every chapter closes on its own list.
import {
  buildBundle, prepareFonts, withLoadedFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'edited-volume-chapter-bibliographies';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: printer's red on a warm paper, the rest in ink
const palette = {
  ink: '#211c19', // text: a warm near-black
  accent: '#8e2b1f', // printer's red: the cover field, kickers, the references heading
  rule: '#cdbfb2', // hairlines
  muted: '#6b5f57', // running heads, the contents' contributors, the colophon
  paper: '#fcfaf6', // the page, and the type on the red field
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Libre Caslon Text', DISPLAY = 'Libre Caslon Display';
const LABEL = 'IBM Plex Sans Condensed';
const MARGIN = { top: 23, bottom: 22, inner: 20, outer: 18 }; // mm, mirrored
const LEAD = 13.8; // body leading in pt: the baseline grid
const label = { fontFamily: LABEL, fontWeight: 600, textTransform: 'uppercase', align: 'left' };
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const below = (id, y, size) => ({ ...at(`#${id}`, 'below', 0, y), ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, ...look, placement });

// #region answer: one list per chapter: scope 'chapter' over a book of separate documents
// Citations are [@key] in the text; each contributor's BibTeX goes in a :::references block
// in their own chapter. Register the engine once, before the first build.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'chicago-author-date', // the humanities' author-date: (Eisenstein 1979)
  bibliography: {
    // 'chapter': a :::bibliography lists the works its own document cites, so a work two
    // contributors cite appears in both lists. 'book' (the default) would print one list,
    // after the last chapter. The scope is per document, not per H1: each essay must be a
    // document of its own in buildBundle (see the chapters region).
    scope: 'chapter',
    title: '', // no bold title paragraph: each chapter has its own ## References heading
    fontSize: em(0.9), lineHeight: pt(12.4), hangingIndent: mm(5), entrySpacing: pt(2.6),
  },
};
// Numbering and disambiguation still see the whole book: two Smiths of 2001 in different
// chapters would print 2001a and 2001b, as one bibliography would.
// #endregion

// #region byline: the contributor, from the heading, in three places
// # The Compositor's Day {author="Margaret Lowe" short="The Compositor's Day"}
const byline = text('byline', '{attr.author}', { fontFamily: TEXT, italic: true,
  fontSize: pt(12), color: col('ink'), align: 'left' }, below('title', 4));
const versoAuthor = head('verso-author', '{attr.author}', 'even',
  at('page', 'top-left', MARGIN.outer + 8, 13)); // in the running head
const tocAuthor = { enabled: true, attr: 'author', fontFamily: TEXT, fontSize: pt(9.5),
  color: col('muted') }; // a line under each title in the contents (italic by default)
// #endregion

// #region opener: kicker, title and byline over a short red rule, sunk 48 mm
const opener = { enabled: true, minHeight: mm(48), slot: { elements: [
  text('kicker', t({ en: 'Chapter {number}', es: 'Capítulo {number}' }), { ...label,
    fontSize: pt(8.5), letterSpacing: pt(1.7), color: col('accent') },
  at('container', 'top-left', 0, 4)),
  text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(28), lineHeight: 1.08,
    color: col('ink'), align: 'left', overflow: 'wrap' }, below('kicker', 3, { width: 'fill' })),
  byline,
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.2), color: col('accent'),
    placement: { ...below('byline', 6), size: { width: mm(16) } } },
] } };
// #endregion

// #region running-heads: contributor on the verso, short title on the recto, folios outside
function head(id, content, parity, placement, look = {}) { // hoisted: the byline uses it
  return { ...text(id, content, { ...label, fontWeight: 500, fontSize: pt(7.5),
    letterSpacing: pt(1.1), color: col('muted'), ...look }, placement), parity, pages: 'body' };
}
const folio = { fontWeight: 600, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('page', 'top-left', MARGIN.outer, 13), folio),
  versoAuthor,
  head('recto-title', '{attr.short}', 'odd', at('page', 'top-right', -(MARGIN.outer + 8), 13),
    { align: 'right' }),
  head('recto-folio', '{pageNumber}', 'odd', at('page', 'top-right', -MARGIN.outer, 13),
    { ...folio, align: 'right' }),
] };
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all',
  at('container', 'top', 0, 9), { ...folio, align: 'center' }), pages: 'opener' }] };
// #endregion

// #region front: the title page on a red field, and the contents
const bare = { numbered: false, toc: false, header: { elements: [] }, footer: { elements: [] } };
const cover = { enabled: true, slot: { elements: [
  { kind: 'box', id: 'field', style: { backgroundColor: col('accent') },
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(150) } } },
  text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(58), lineHeight: 1,
    color: col('paper'), align: 'left', overflow: 'wrap' },
  { ...at('page', 'top-left', MARGIN.inner, 64), size: { width: mm(118) } }),
  text('subtitle', '{subtitle}', { fontFamily: TEXT, italic: true, fontSize: pt(15),
    color: col('paper'), align: 'left' }, below('title', 5)),
  text('editors', '{attr.editors}', { ...label, fontSize: pt(9), letterSpacing: pt(1.8),
    color: col('accent') }, at('page', 'top-left', MARGIN.inner, 162)),
  text('contributors', '{attr.contributors}', { fontFamily: TEXT, italic: true, fontSize: pt(12),
    color: col('ink'), align: 'left' }, below('editors', 3)),
  text('imprint', '{attr.imprint}', { ...label, fontWeight: 500, fontSize: pt(7.5),
    letterSpacing: pt(1.5), color: col('muted') }, at('page', 'bottom-left', MARGIN.inner, -16)),
] } };
const contentsOpener = { enabled: true, minHeight: mm(40), slot: { elements: [
  text('kicker', '{title}', { ...label, fontSize: pt(8.5), letterSpacing: pt(1.7),
    color: col('accent') }, at('container', 'top-left', 0, 4)),
  text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(28), color: col('ink'),
    align: 'left' }, below('kicker', 3)),
] } };
const contents = {
  levels: [{ level: 1, fontFamily: TEXT, fontSize: pt(12.5), lineHeight: pt(LEAD),
    numberFontFamily: LABEL, numberFontSize: pt(10), numberFontWeight: 600,
    numberColor: col('accent'), numberWidth: mm(6), numberGap: mm(3), marginBottom: pt(LEAD) }],
  pageNumber: { fontFamily: LABEL, fontSize: pt(9), fontWeight: 600, color: col('ink'),
    width: mm(7) },
  leader: { char: '. ', gap: mm(2) },
  subtitle: tocAuthor,
};
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  citations,
  page: { sizePreset: 'custom', width: mm(155), height: mm(235), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true, maxWordSpacing: 1.7,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('ink'),
    // A page that ends short may open at most one extra line above a subhead.
    balancing: { maxLinesPerHeading: 1 }, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    // 'any': an essay opens on the next page, recto or verso, as in most edited volumes.
    { level: 1, numberingTemplate: '{1}', marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
    { level: 2, fontFamily: TEXT, italic: true, fontSize: pt(11), lineHeight: pt(LEAD * 1.5),
      numberingTemplate: '', marginTop: pt(LEAD * 0.5), marginBottom: pt(0) },
  ] },
  headingStyles: [
    { id: 'cover', ...bare, span: 'page', advancedDesign: cover },
    { id: 'contents', ...bare, advancedDesign: contentsOpener },
    // The references heading: the label face in red, out of the contents.
    { id: 'references', toc: false, fontFamily: LABEL, fontWeight: 600, italic: false,
      fontSize: pt(8.5),
      letterSpacing: pt(1.7), textTransform: 'uppercase', color: col('accent'),
      lineHeight: pt(LEAD * 2), marginTop: pt(LEAD), marginBottom: pt(0) },
  ],
  toc: contents,
  calloutStyles: [{ id: 'colophon', placement: 'bottom', backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
    padding: { top: mm(2.5), right: pt(0), bottom: pt(0), left: pt(0) }, marginBottom: pt(0),
    body: { fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10.5), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0) } }],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const front = /* @content */ ''; // title page and contents (content.<lang>.md)
const lowe = /* @content:lowe */ ''; // content.lowe.<lang>.md: chapter 1, and so on
const okafor = /* @content:okafor */ '';
const ferrer = /* @content:ferrer */ '';
// #region chapters: one document per contributor, each with its own references
// A chapter's :::bibliography lists what that document cites; one Markdown file holding all
// three essays would make every list repeat the works of the chapters before it.
const chapters = [front, lowe, okafor, ferrer].map((markdown) => ({ markdown }));
const book = () => buildBundle({ chapters, config: config(), resources: [] });
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces
  'Libre Caslon Text': ['400', '400i', '700'],
  'Libre Caslon Display': ['400'],
  'IBM Plex Sans Condensed': ['400', '500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const all = chapters.map((chapter) => chapter.markdown).join('\n');
await prepareFonts(all, config(), kitFonts(FONTS));
const docs = await withLoadedFonts(book,
  { ...kitFonts(FONTS), text: all }); // one VDTDocument per Markdown document
showPages(docs, { title: t({ en: 'The Working Page', es: 'La página en obra' }) });
offerPdf(() => renderToPdf(docs, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
