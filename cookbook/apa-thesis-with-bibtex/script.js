// ═══ Postext Cookbook · Nº 087 · A thesis chapter cited in APA 7 ═══════════════════
// https://postext.dev/en/cookbook/apa-thesis-with-bibtex
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Literata, Public Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'apa-thesis-with-bibtex';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a thesis prints in black; the one colour is the university's
const palette = {
  ink: '#1b1b1f', accent: '#22406a', tint: '#e6ecf4', rule: '#b9bec8', muted: '#5d6370',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Literata', LABEL = 'Public Sans';
const LEAD = 16; // pt: double spacing is a typewriter habit; 1.45 reads as well and fits more

// #region answer: the citation engine, APA 7 and how its references look
// Citations are written [@key, p. 33] and formatted by citeproc-js in the chosen CSL
// style; the references come from the BibTeX block at the end of the chapter. Register
// the engine once, before the first build, then the style is one setting.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'apa', // 'chicago-author-date', 'ieee', 'vancouver'… change nothing else
  link: true, // each citation jumps to its entry in the PDF and on screen
  bibliography: {
    // APA asks for a half-inch hanging indent and keeps the list in the text size.
    fontSize: em(1), hangingIndent: mm(12.7), entrySpacing: pt(4),
    doi: 'link', // printed whole, as APA wants, and clickable
  },
};
// #endregion

// #region opener: a pale band at the head of the page, the number large and light in it
const BAND = 92; // mm from the trim's top
const opener = {
  enabled: true,
  minHeight: mm(BAND - 28 + 10), // the body starts 10 mm under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('tint') },
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'text', id: 'label', content: t({ en: 'Chapter', es: 'Capítulo' }),
      fontFamily: LABEL, fontSize: pt(9), fontWeight: 600, letterSpacing: pt(1.8),
      textTransform: 'uppercase',
      color: col('accent'), align: 'left',
      placement: { anchor: { to: 'container', edge: 'top-left' },
        offset: { x: mm(0), y: mm(2) } } },
    { kind: 'text', id: 'number', content: '{number}', fontFamily: TEXT, fontSize: pt(96),
      fontWeight: 300, lineHeight: 0.9, color: col('accent'), align: 'right',
      placement: { anchor: { to: 'container', edge: 'top-right' },
        offset: { x: mm(0), y: mm(-6) },
        size: { width: mm(40), height: 'auto' } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontSize: pt(24),
      lineHeight: 1.12, fontWeight: 600, color: col('ink'), align: 'left', overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-left' },
        offset: { x: mm(0), y: mm(14) },
        size: { width: mm(108), height: 'auto' } } },
  ] },
};
// #endregion

const head = (id, content, edge, x) => ({
  kind: 'text', id, content, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5),
  letterSpacing: pt(0.8), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(14) } },
});

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  citations,
  page: {
    sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    // one-sided, bound at the left
    margins: { top: mm(28), bottom: mm(28), left: mm(35), right: mm(25) },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('accent'),
    textAlign: 'justify', firstLineIndent: mm(6), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: TEXT, color: col('ink'), fontWeight: 600,
    levels: [
      // A chapter opens on the next page, recto or verso.
      { level: 1, numberingTemplate: '{1}', fontSize: pt(22),
        breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
      { level: 2, numberingTemplate: '{1}.{2}', numberSeparator: '  ', fontSize: pt(13),
        lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    ],
  },
  // #region refs: the references heading goes unnumbered; section references read in words
  headingStyles: [{ id: 'references', numbered: false }],
  crossRefs: { section: t({ en: 'Section {n}', es: 'Sección {n}' }) },
  // #endregion
  header: { elements: [
    head('title', '{title}', 'top-left', 35), head('folio', '{pageNumber}', 'top-right', -25),
  ] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Literata: ['300', '400', '400i', '600', '600i'],
  'Public Sans': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
const title = t({ en: 'A thesis chapter in APA 7', es: 'Un capítulo de tesis en APA 7' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
