// ═══ Postext Cookbook · Nº 112 · Night headings in Arabic ordinal words ═══════════
// https://postext.dev/en/cookbook/nights-ordinal-headings
// Code: MIT · Text: Alf layla wa-layla, Hindawi Foundation 2022 (CC BY 4.0) · Pictures: none
// Fonts: Amiri, Aref Ruqaa, Noto Kufi Arabic (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'nights-ordinal-headings';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black text, a deep green for the titles and a gold hairline, on a cream paper.
const palette = {
  ink: '#1c1a17', // text: a warm near-black
  accent: '#1f564c', // titles, night headings, folios
  gold: '#a8833a', // the rules under the nights and around the headpiece
  tint: '#ebe3cc', // the headpiece band
  muted: '#5e594f', // running heads, kickers, the note on the text
  paper: '#faf6ec', // a cream paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const NASKH = 'Amiri'; // the text and the sub-tale titles
const RUQAA = 'Aref Ruqaa'; // display: the book, the tale, the nights
const KUFI = 'Noto Kufi Arabic'; // labels: kickers, running heads, folios
const [SIZE, LEAD] = [13, 26]; // pt: 2 × the size: a ḍamma over a hamza clears the line above
const [OUTER, TOP] = [18, 22]; // mm: a 17 × 24 cm book
const top = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });

// #region answer: the night's number in feminine ordinal words, from a level template
// In the Markdown a night is a level-2 heading with no number: ## الليلة
// The level's template writes الليلة and the counter as a feminine ordinal, which agrees
// with the noun: الليلة الأولى، الليلة الثانية، الليلة الثالثة … الليلة الحادية بعد الألف.
// numberPosition 'replace' makes that number the whole title, so the heading, the PDF
// bookmarks and the alt text read الليلة الثانية. Hindawi's formula is a fixed design text.
const nights = {
  level: 2, numberingTemplate: 'الليلة {2:ordinal-feminine}', numberPosition: 'replace',
  marginTop: pt(LEAD), marginBottom: pt(LEAD / 2),
  advancedDesign: { enabled: true, minHeight: mm(18), slot: { elements: [
    { kind: 'text', id: 'formula', content: 'فلما كانت', fontFamily: KUFI, fontWeight: 500,
      fontSize: pt(8), align: 'center', color: col('muted'), placement: top(0) },
    { kind: 'text', id: 'night', content: '{titleText}', fontFamily: RUQAA, fontWeight: 700,
      fontSize: pt(21), lineHeight: 1.2, align: 'center', color: col('accent'),
      placement: top(4.5) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6), color: col('gold'),
      placement: { ...top(16), size: { width: mm(16) } } },
  ] } },
};
// A tale does not count: an unnumbered heading leaves the deeper counters alone, so the
// nights run on from one tale to the next instead of starting again at الأولى.
const tale = { numbered: false, runningChapter: true };
// #endregion

// #region opener: a headpiece band for each tale, in Ruqʿa over a gold-ruled tint
const rule = (id, y, thickness) => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(thickness), color: col('gold'),
  placement: { ...top(y), size: { width: 'fill' } } });
const opener = {
  enabled: true, minHeight: mm(50),
  slot: { elements: [
    { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint') },
      placement: { ...top(4), size: { width: 'fill', height: mm(30) } } },
    rule('band-top', 4, 1.2), rule('band-foot', 34, 0.5),
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: KUFI, fontWeight: 500,
      fontSize: pt(8.5), align: 'center', color: col('muted'), placement: top(7.5) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: RUQAA, fontWeight: 700,
      fontSize: pt(30), lineHeight: 1.15, align: 'center', color: col('accent'),
      placement: top(13) },
    { kind: 'text', id: 'latin', content: '{attr.latin}', fontFamily: NASKH, italic: true,
      fontSize: pt(9.5), align: 'center', color: col('muted'), placement: top(39) },
  ] },
};
// #endregion

// #region heads: each tale brings its running heads, the book outside, the tale inside
// Running heads stay on the sheet's sides: in a book bound on the right the verso (even)
// is the right-hand page, so its outer edge, where the folio goes, is the right one.
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: KUFI, fontWeight: 500, fontSize: pt(8.5),
  color: col('muted'), placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } },
  ...extra });
const taleHeads = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-right', -OUTER, { color: col('accent') }),
  head('verso-book', '{title}', 'even', 'top-right', -(OUTER + 10)),
  head('recto-tale', '{chapterTitle}', 'odd', 'top-left', OUTER + 10),
  head('recto-folio', '{pageNumber}', 'odd', 'top-left', OUTER, { color: col('accent') }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0, {
  pages: 'opener', color: col('accent'),
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-12) } } })] };
// #endregion

// #region title: the half-title, centred on the page, with no running heads
const at = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } });
const line = (id, content, y, style) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', color: col('ink'), placement: at(y), ...style });
const titlePage = {
  id: 'title', span: 'page', numbered: false, runningChapter: false,
  breakBefore: { enabled: true, parity: 'any' }, header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'rule', id: 'over', direction: 'horizontal', thickness: pt(0.6), color: col('gold'),
      placement: { ...at(62), size: { width: mm(40) } } },
    line('book', '{titleText}', 70, { fontFamily: RUQAA, fontWeight: 700, fontSize: pt(54),
      lineHeight: 1.25, color: col('accent') }),
    { kind: 'rule', id: 'under', direction: 'horizontal', thickness: pt(0.6), color: col('gold'),
      placement: { ...at(100), size: { width: mm(40) } } },
    line('volume', '{attr.kicker}', 106, { fontFamily: KUFI, fontWeight: 500, fontSize: pt(11),
      color: col('accent') }),
    line('latin', '{attr.latin}', 150, { fontFamily: NASKH, fontSize: pt(9.5), italic: true,
      color: col('muted') }),
  ] } },
};
// #endregion

const config = () => ({
  locale: 'ar', // right to left, bound on the right, digits ٠–٩ (gotcha: arabic-locale-tag)
  colorPalette,
  page: { width: mm(170), height: mm(240), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(20), left: mm(21), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: NASKH, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1.5), indentAfterHeading: false,
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true },
  // parity 'any': a level-1 heading opens the next page, whichever side it falls on.
  headings: { fontFamily: NASKH, fontWeight: 700, color: col('accent'), textAlign: 'center',
    levels: [
      { level: 1, fontSize: pt(30), breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: opener },
      nights,
      // A sub-tale title takes one line of the grid and half a line above it, so it can
      // still close a page with the opening lines of its tale under it.
      { level: 3, fontSize: pt(14), lineHeight: pt(LEAD), marginTop: pt(LEAD / 2),
        marginBottom: pt(0) },
    ] },
  headingStyles: [titlePage, { id: 'tale', ...tale, header: taleHeads }],
  paragraphStyles: [
    { id: 'note', fontFamily: NASKH, fontSize: pt(9.5), lineHeight: pt(14), color: col('muted'),
      boldColor: col('ink'), italicColor: col('muted'), textAlign: 'justify',
      firstLineIndent: pt(0), marginTop: pt(LEAD), hyphenation: { enabled: true, locale: LANG } },
    { id: 'colophon', fontFamily: NASKH, fontSize: pt(8), lineHeight: pt(11),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(7) },
  ],
  header: { elements: [] }, // the tale style brings the running heads (see heads)
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  Amiri: ['400', '400i', '700'], // NASKH: the text, the sub-tale titles; the Latin lines
  'Aref Ruqaa': ['700'], // RUQAA: the book, the tale and the nights
  'Noto Kufi Arabic': ['500'], // KUFI: kickers, the formula, running heads and folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// The arabic file of each face, which loadFonts leaves out (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Night headings in Arabic ordinal words',
  es: 'Noches numeradas con ordinales árabes' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
