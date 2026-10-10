// ═══ Postext Cookbook · Nº 092 · A manual whose references point to pages ══════════
// https://postext.dev/en/cookbook/manual-see-page-references
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Archivo, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'manual-see-page-references';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a navy cover band and one signal orange for numbers and references
const palette = {
  ink: '#1b1f24', navy: '#1d2c3c', orange: '#b8471b', tint: '#f7e7de', rule: '#d5cfc8',
  muted: '#5c636b', paper: '#ffffff',
};
// Each colour carries its hex and the palette entry it follows.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.orange })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Archivo', DISPLAY = 'Archivo Narrow';
const PAGE = { w: 148, h: 210, top: 20, bottom: 20, inner: 18, outer: 15 }; // mm: A5, mirrored
const LEAD = 13; // pt
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: the words a reference prints, and references that are links
// In the Markdown, `## Brakes {#sec-brakes}` names a heading, `:anchor{#warn-pressure}`
// a point in a paragraph and `[close the lever]{#step-close-lever}` a phrase in a step.
// `:ref{id="sec-pad-wear"}` prints "section 3.2", `style=page` "page 3", `style=title`
// the heading's words and `style=pageNumber` the bare 3. The page numbers come from the
// previous layout pass: the engine lays the manual out again until they hold.
const crossRefs = {
  section: t({ en: 'section {n}', es: 'apartado {n}' }), // H2 and H3: "section 3.2"
  page: t({ en: 'page {n}', es: 'página {n}' }), // spelt out: a manual is read by anyone
};
// Every reference is a link in the PDF and on screen; this makes it look like one.
const references = { referenceColor: col('orange'), referenceBold: true };
// #endregion

// #region numbers: sections 1–5 and 1.1, 1.2… under the one level-1 heading
const H2 = { level: 2, numberingTemplate: '{2}', numberSeparator: '   ', fontFamily: DISPLAY,
  fontWeight: 700, fontSize: pt(15), lineHeight: pt(LEAD * 1.5), color: col('navy'),
  marginTop: pt(LEAD), marginBottom: pt(LEAD / 3) };
const H3 = { level: 3, numberingTemplate: '{2}.{3}', numberSeparator: '  ', fontFamily: DISPLAY,
  fontWeight: 700, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
  marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 4) };
// #endregion

// #region cover: the model name large in a navy band over half the first page
const BAND = 104; // mm from the trim's top
const label = { fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: pt(1.6), align: 'left' };
const cover = {
  enabled: true,
  minHeight: mm(BAND - PAGE.top + 8), // the contents start 8 mm under the band
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('navy') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'box', id: 'stripe', style: { backgroundColor: col('orange') },
      placement: { ...at('page', 'top-left', 0, BAND), size: { width: 'fill', height: mm(2.5) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, fontSize: pt(9),
      color: col('tint'), placement: at('container', 'top-left', 0, 6) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontWeight: 700,
      fontSize: pt(58), lineHeight: 1, color: col('paper'), align: 'left',
      placement: at('container', 'top-left', -1, 30) },
    { kind: 'text', id: 'subtitle', content: '{attr.subtitle}', fontFamily: TEXT,
      fontSize: pt(11), color: col('paper'), align: 'left',
      placement: at('container', 'top-left', 0, 55) },
    { kind: 'text', id: 'edition', content: '{attr.edition}', ...label, fontSize: pt(7.5),
      color: col('tint'), placement: at('container', 'top-left', 0, 74) },
  ] },
};
// #endregion

const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', ...label, fontSize: pt(7.5),
  letterSpacing: pt(1.1), color: col('muted'), placement: at('page', edge, x, 10), ...extra,
});

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }), // picks the hyphenation patterns
  colorPalette,
  crossRefs,
  page: { sizePreset: 'custom', width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150,
    margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), ...references,
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 700, levels: [
    // A new page on either side: the default would wait for a recto.
    { level: 1, fontSize: pt(58), breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: cover },
    H2, H3,
  ] },
  orderedLists: { numberFormat: 'arabic', separator: '', fontFamily: DISPLAY, fontWeight: 700,
    color: col('orange'), gap: mm(2.5), itemSpacing: pt(2),
    marginTop: pt(LEAD / 3), marginBottom: pt(LEAD / 3) },
  unorderedLists: { color: col('orange'), gap: mm(2), marginTop: pt(LEAD / 3),
    marginBottom: pt(LEAD / 3) },
  calloutStyles: [
    { id: 'note', title: '', backgroundEnabled: true, background: col('tint'),
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('orange') },
      padding: { top: mm(2.5), right: mm(3), bottom: mm(2.5), left: mm(3.5) },
      titleStyle: { fontFamily: DISPLAY, fontWeight: 700, fontSize: pt(9), color: col('orange'),
        textTransform: 'uppercase', letterSpacing: pt(1.2) },
      marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
  ],
  paragraphStyles: [
    { id: 'colophon', fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
      marginTop: pt(LEAD / 2) },
  ],
  header: { elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', PAGE.outer, { color: col('orange') }),
    head('verso-title', '{title}', 'even', 'top-left', PAGE.outer + 8),
    head('recto-title', '{title}', 'odd', 'top-right', -(PAGE.outer + 8), { align: 'right' }),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -PAGE.outer,
      { align: 'right', color: col('orange') }),
  ] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses.
const FONTS = {
  Archivo: ['400', '400i', '700'],
  'Archivo Narrow': ['700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
const title = t({ en: 'A manual whose references point to pages',
  es: 'Un manual cuyas remisiones apuntan a páginas' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
