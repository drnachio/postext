// ═══ Postext Cookbook · Nº 088 · A two-column conference paper in IEEE style ═══════
// https://postext.dev/en/cookbook/ieee-conference-paper
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: STIX Two Text, Schibsted Grotesk (SIL OFL 1.1) · Needs postext ≥ 1.12.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerCitationEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'ieee-conference-paper';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black type on white, with one blue for the workshop's own marks
const palette = {
  ink: '#16181d', accent: '#1d4a7a', tint: '#e9eef5', rule: '#aeb6c2', muted: '#5a606b',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS] = ['STIX Two Text', 'Schibsted Grotesk'];
// The IEEE conference template in mm: US letter, 0.75 in head, 1 in foot, 0.625 in sides,
// two columns of 3.5 in with 0.25 in between.
const [TRIM_W, TRIM_H, TOP, BOTTOM, SIDE, GUTTER] = [215.9, 279.4, 19, 25.4, 15.9, 6.35];
const MEASURE = TRIM_W - 2 * SIDE;
const LEAD = 12; // pt: 10 pt type on 12 pt, as the template sets it

// #region answer: IEEE numbers, collapsed ranges and a references list with a label column
// [@key] prints [1] in order of first citation, @key in the sentence "Knuth and Plass [1]".
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
// The bundled IEEE style lists [2], [3], [4]; the IEEE editorial guide writes [2]–[4].
// One attribute on the CSL <citation> element makes citeproc-js join the run.
const ieee = STYLES.ieee.replace('<citation>', '<citation collapse="citation-number">');
const citations = {
  style: 'custom', customStyle: ieee, // or style: 'ieee' for the file as it ships
  link: true,
  bibliography: {
    fontSize: em(0.8), lineHeight: pt(9.4), // 8 pt on 9.4 pt, two sizes under the text
    labelWidth: mm(6), // the [n] column: wide enough for [10], the turnovers align after it
    entrySpacing: pt(1.2),
    doi: 'text', // printed, not linked: the PDF stays black
  },
};
// #endregion

// #region title: the title block across both columns, three authors side by side
const text = (id, content, size, extra) => ({ kind: 'text', id, content, fontFamily: SERIF,
  fontSize: pt(size), color: col('ink'), align: 'center', overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const AUTHOR_W = MEASURE / 3;
const titleBlock = {
  enabled: true,
  minHeight: mm(64), // venue line, two lines of title and five of author block
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('tint') }, // from the trim's top
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: mm(TOP + 66) } } },
    text('venue', '{attr.venue}', 7.5, { fontFamily: SANS, fontWeight: 600, color: col('accent'),
      letterSpacing: pt(1.2), textTransform: 'uppercase',
      placement: at('container', 'top-left', 0, 0, MEASURE) }),
    { kind: 'rule', id: 'venue-rule', thickness: pt(0.5), color: col('rule'),
      placement: at('#venue', 'below', 0, 2, MEASURE) },
    text('title', '{titleText}', 23, { lineHeight: 1.1, placement: at('#venue', 'below', 0, 7,
      MEASURE) }),
    ...['a1', 'a2', 'a3'].map((id, i) => text(id, `{attr.${id}}`, 9.5, { lineHeight: 1.25,
      placement: at('#title', 'below', i * AUTHOR_W, 6, AUTHOR_W) })),
  ] },
};
// #endregion

// #region abstract: abstract and index terms in bold 9 pt, between two hairlines
const calloutStyles = [{ id: 'abstract', span: 'page', backgroundEnabled: false,
  border: { enabled: false }, stripe: { enabled: true, side: 'top', width: pt(0.5),
    color: col('rule') },
  padding: { top: mm(3), right: mm(14), bottom: mm(1), left: mm(14) },
  marginTop: pt(0), marginBottom: pt(LEAD),
  body: { fontSize: pt(9), lineHeight: pt(11), fontWeight: 700, firstLineIndent: pt(0),
    textAlign: 'justify', paragraphSpacing: true } }];
// #endregion

// #region sections: I. INTRODUCTION, centred capitals; references print "Section II"
const levels = [
  { level: 1, breakBefore: { enabled: true, parity: 'any' } }, // gotcha: headings-drop-h1-break
  { level: 2, numberingTemplate: '{2:I}.', numberSeparator: ' ', fontSize: pt(9),
    lineHeight: pt(LEAD), fontWeight: 400, letterSpacing: em(0.06), textTransform: 'uppercase',
    marginTop: pt(LEAD), marginBottom: pt(0) }, // a line above, none below: at a column's head
  // the margin above drops and the text still starts on the next grid line
];
const headingStyles = [
  { id: 'paper', numbered: false, span: 'page', advancedDesign: titleBlock },
  { id: 'back', numbered: false }, // Acknowledgment and References: no number
];
const crossRefs = { section: t({ en: 'Section {n}', es: 'sección {n}' }) };
// #endregion

const footer = { elements: [
  { kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: SANS, fontSize: pt(7.5),
    color: col('muted'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'bottom-left' }, offset: { x: mm(SIDE), y: mm(-13) },
      size: { width: mm(MEASURE) } } },
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette, citations, crossRefs, calloutStyles, headingStyles,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(SIDE), right: mm(SIDE) } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: {
    fontFamily: SERIF, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, // "Section II" sits in the text like the citations
    textAlign: 'justify', firstLineIndent: mm(3.5), indentAfterHeading: true,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: SERIF, color: col('ink'), textAlign: 'center', levels },
  header: { elements: [] },
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'STIX Two Text': ['400', '400i', '700', '700i'],
  'Schibsted Grotesk': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown }, config()), markdown);
const title = t({ en: 'An IEEE conference paper', es: 'Una ponencia en estilo IEEE' });
showPages(doc, { title });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf
