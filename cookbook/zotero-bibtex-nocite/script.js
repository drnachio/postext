// ═══ Postext Cookbook · Nº 097 · A reading list from a Zotero BibTeX export ═══════
// https://postext.dev/en/cookbook/zotero-bibtex-nocite
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Spectral, IBM Plex Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'zotero-bibtex-nocite';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a department green, one tint, everything else in ink
const palette = {
  ink: '#1c211f', accent: '#2d5b48', tint: '#dfe9e2', rule: '#c3cdc6', muted: '#5c6862',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, LABEL] = ['Spectral', 'IBM Plex Sans Condensed'];
const LEAD = 13.4; // pt
const [TOP, OUTER] = [24, 18]; // mm

// #region answer: Chicago author-date, and a list that holds more than the text cites
// The works come from a :::references{format=bibtex} block: the Zotero export pasted as it
// is. The text cites some of them; `nocite` in the front matter adds the rest by key, and
// `nocite: "@*"` would add the whole export. citeproc-js writes both in the style named.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'chicago-author-date', // '(Gieryn 1983)', 'Shapin and Schaffer (1985)'
  link: true, // a citation jumps to its entry
  bibliography: {
    // includeUncited: true is the same as nocite: "@*", set from the design side.
    fontSize: em(0.94), lineHeight: pt(12.4), hangingIndent: mm(5), entrySpacing: pt(3.5),
    doi: 'link', // Zotero's doi field prints as https://doi.org/…; its url field is dropped
  },
};
// #endregion

// #region opener: a green field over the top half, the course in white on it
const BAND = 132; // mm from the trim's top to the band's foot
const onBand = { color: col('paper'), align: 'left', overflow: 'wrap' };
const opener = {
  enabled: true,
  minHeight: mm(BAND - TOP + 9), // the columns start 9 mm under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('accent') },
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...onBand, fontFamily: LABEL,
      fontSize: pt(8.5), fontWeight: 600, letterSpacing: pt(1.7), textTransform: 'uppercase',
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(14) } } },
    { kind: 'text', id: 'title', content: '{titleText}', ...onBand, fontFamily: TEXT,
      fontSize: pt(50), fontWeight: 300, lineHeight: 1.02,
      placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { y: mm(7) },
        size: { width: mm(150), height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('tint'),
      placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(7) },
        size: { width: mm(18) } } },
    { kind: 'text', id: 'lead', content: '{attr.lead}', ...onBand, fontFamily: TEXT,
      italic: true, fontSize: pt(13), lineHeight: 1.3, color: col('tint'),
      placement: { anchor: { to: '#rule', edge: 'below' }, offset: { y: mm(6) },
        size: { width: mm(128), height: 'auto' } } },
  ] },
};
// #endregion

const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5),
  fontWeight: 600, letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra,
});
const folio = { color: col('accent') };
const listName = t({ en: 'HPS 214 · Reading list', es: 'HPS 214 · Lecturas' });

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  citations,
  page: {
    sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(22), left: mm(20), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('accent'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: TEXT, color: col('ink'), fontWeight: 600,
    levels: [
      // parity 'any': the H1 opens on the next page, either side (the default waits for a recto).
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontFamily: LABEL, fontSize: pt(10), lineHeight: pt(LEAD), fontWeight: 600,
        color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0),
      },
    ],
  },
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.5),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
    head('recto-title', listName, 'odd', 'top-right', -(OUTER + 8)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Spectral: ['300', '300i', '400', '400i', '600', '600i'],
  'IBM Plex Sans Condensed': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'A reading list from Zotero', es: 'Lecturas desde Zotero' }) });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
