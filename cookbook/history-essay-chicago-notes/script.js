// ═══ Postext Cookbook · Nº 089 · A history essay with Chicago notes ═══════════════
// https://postext.dev/en/cookbook/history-essay-chicago-notes
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Crimson Pro, IBM Plex Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'history-essay-chicago-notes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a railway green for the opener band, ink and warm paper for the rest
const palette = {
  ink: '#211d1a', green: '#24493d', tint: '#dfe8e2', rule: '#b7b0a4', muted: '#6a645b',
  paper: '#fbf9f4',
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.green })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Crimson Pro', LABEL = 'IBM Plex Sans Condensed';
const TRIM = { width: 156, height: 234 }; // a journal offprint, trimmed like a trade book
const MARGIN = { top: 22, bottom: 22, inner: 20, outer: 17 };
const LEAD = 14; // pt
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: Chicago notes and bibliography, one note per citation
// The text cites with [@howse1980, 87]; a note style turns every citation into a
// footnote. The first note for a work gives it in full, later ones in the short form
// (author, short title, page), and the bibliography lists the works by author.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'chicago-notes-bibliography', // CMOS 18th edition, notes and bibliography
  notes: 'footnote', // each citation in a note at the foot of the page
  link: true, // a note's citation jumps to its bibliography entry
  bibliography: { fontSize: em(0.92), lineHeight: pt(13), hangingIndent: em(1.8),
    entrySpacing: pt(3) },
};
// The citation notes share the numbering and the look of the author's own [^notes].
const footnotes = {
  placement: 'column', numbering: 'chapter',
  fontSize: pt(8.5), lineHeight: pt(10.75), spaceBetween: pt(2),
  textAlign: 'left', // ragged: the gap after a note's number stays the same in every note
  separator: { width: 0.3, lineWidth: pt(0.5), color: col('rule') },
};
// #endregion

// #region opener: the green band holds the kicker, the dates and the title
const BAND = 122; // mm from the trim's top
const opener = {
  enabled: true,
  minHeight: mm(BAND - MARGIN.top + 9), // the text starts 9 mm under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('green') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(7.5), letterSpacing: pt(1.4), textTransform: 'uppercase', color: col('tint'),
      align: 'left', placement: at('container', 'top-left', 0, 4) },
    { kind: 'text', id: 'years', content: '{attr.years}', fontFamily: TEXT, fontWeight: 300,
      fontSize: pt(54), lineHeight: 1, color: col('tint'), align: 'left',
      placement: at('container', 'top-left', -1, 16) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontWeight: 600,
      fontSize: pt(25), lineHeight: 1.08, color: col('paper'), align: 'left', overflow: 'wrap',
      placement: { ...at('container', 'top-left', 0, 47),
        size: { width: mm(112), height: 'auto' } } },
    { kind: 'text', id: 'byline', content: '{attr.byline}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(9), letterSpacing: pt(0.6), color: col('tint'), align: 'left',
      placement: at('container', 'top-left', 0, 92) },
  ] },
};
// #endregion

const head = (id, content, parity, edge, x, align) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontWeight: 600,
  fontSize: pt(7.5), letterSpacing: pt(1.1), textTransform: 'uppercase', color: col('muted'),
  align, placement: at('page', edge, x, 12),
});

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  citations,
  footnotes,
  page: {
    sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: TEXT, fontWeight: 600, color: col('ink'),
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(25), breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: opener },
      { level: 2, fontFamily: LABEL, fontWeight: 600, fontSize: pt(8.5), letterSpacing: pt(1.3),
        textTransform: 'uppercase', color: col('green'), lineHeight: pt(LEAD),
        marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    ],
  },
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.5),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, 'left'),
    head('verso-author', '{attr.byline}', 'even', 'top-left', MARGIN.outer + 8, 'left'),
    head('recto-title', '{title}', 'odd', 'top-right', -(MARGIN.outer + 8), 'right'),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, 'right'),
  ] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses.
const FONTS = {
  'Crimson Pro': ['300', '400', '400i', '600', '600i'],
  'IBM Plex Sans Condensed': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
const title = t({ en: 'A history essay with Chicago notes',
  es: 'Un ensayo de historia con notas de Chicago' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
