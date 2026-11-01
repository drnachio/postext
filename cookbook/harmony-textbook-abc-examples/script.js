// ═══ Postext Cookbook · Nº 163 · Harmony textbook with ABC examples ═════════════
// https://postext.dev/en/cookbook/harmony-textbook-abc-examples
// Code: MIT · Text: original (CC BY 4.0) · Music: Greensleeves (traditional, PD)
// Fonts: Libre Caslon Text & Display, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, initMusicEngine,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'harmony-textbook-abc-examples';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a conservatory green for the accents, warm ink for text and notes
const palette = {
  ink: '#1f1c19', // text and notation: a warm near-black
  accent: '#2f5d4f', // kickers, rules, Roman numerals in the table
  tint: '#edf2ef', // the box of key terms
  rule: '#c3cfc9', // hairlines
  muted: '#5c6863', // running heads, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, never the default blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const TRIM = { width: 180, height: 250 };
const MARGIN = { top: 22, bottom: 24, inner: 22, outer: 33 }; // a 125 mm measure
const LEAD = 14.5; // body leading in pt: the baseline grid
const LABEL = 'Libre Franklin';

// #region answer: one score style for every example in the text
// Each ```abc fence in the chapter is engraved at the width of the text column and cut
// into systems. The style is set once here; the Markdown only holds the notation.
const scoreStyle = {
  staffSize: mm(5.5), // a textbook's rastral: examples read at arm's length on a desk
  musicFont: 'Bravura', // the traditional engraved look, heavy enough beside Caslon
  textFont: 'Libre Caslon Text', // the Roman numerals of `w:` lines, in the text face
  spacing: 1.6, // air between the chords: an example reads as a progression, not a cluster
  barNumbers: 'system',
  systemGap: mm(4),
  marginTop: pt(LEAD / 2),
  marginBottom: pt(LEAD / 2),
  color: col('ink'),
  // A long example runs on into the next page between two systems, never leaving one
  // system alone at the foot of a page or at the head of the next.
  minSystemsAtBreak: 2,
};
// #endregion

// #region opener: kicker, Caslon Display title and a short green rule, sunk 48 mm
const opener = {
  enabled: true,
  minHeight: mm(48),
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(8.5),
      fontWeight: 700, letterSpacing: pt(1.7), textTransform: 'uppercase', color: col('accent'),
      align: 'left', placement: { anchor: { to: 'container', edge: 'top-left' },
        offset: { x: mm(0), y: mm(12) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Libre Caslon Display',
      fontSize: pt(34), lineHeight: 1.05, color: col('ink'), align: 'left', overflow: 'wrap',
      placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
        size: { width: mm(110), height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5),
      color: col('accent'),
      placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(5) },
        size: { width: mm(16) } } },
  ] },
};
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5),
  fontWeight: 600, letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra,
});
const folio = { fontWeight: 700, color: col('accent') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, folio),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 9),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 9)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0, {
  ...folio, pages: 'opener', align: 'center',
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-12) } },
})] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }), // the language the text is hyphenated in
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true }, // left = inner
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: 'Libre Caslon Text', fontSize: pt(10.5), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(4.5),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: 'Libre Caslon Text', color: col('ink'), fontWeight: 700,
    levels: [
      { level: 1, fontSize: pt(34), breakBefore: { parity: 'odd' }, advancedDesign: opener },
      { level: 2, fontFamily: LABEL, fontSize: pt(9), lineHeight: pt(LEAD), fontWeight: 700,
        letterSpacing: pt(1.4), textTransform: 'uppercase', color: col('accent'),
        marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) },
    ],
  },
  orderedLists: { numberFormat: 'arabic', color: col('accent'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  calloutStyles: [
    { id: 'terms', title: t({ en: 'Key terms', es: 'Términos clave' }), background: col('tint'),
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
      padding: { top: mm(3), right: mm(4), bottom: mm(3), left: mm(4) },
      titleStyle: { fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: pt(1.2), color: col('accent') },
      body: { fontSize: pt(9.5), lineHeight: pt(13), color: col('ink'), firstLineIndent: pt(0),
        boldColor: col('accent'), italicColor: col('ink'), textAlign: 'left' } },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerFontFamily: LABEL,
    headerFontSize: pt(7.5), bodyFontFamily: 'Libre Caslon Text', bodyFontSize: pt(9),
    bodyColor: col('ink'), cellPadding: mm(1.4) },
  scoreStyle,
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Libre Caslon Text': ['400', '400i', '700'],
  'Libre Caslon Display': ['400'],
  'Libre Franklin': ['600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region engine: start the engraver, build, and draw the scores into the PDF too
// The engraver (Verovio) loads only for books with music: start it before the build,
// or every score is laid out as a grey placeholder box.
await initMusicEngine();
const doc = await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Harmony textbook', es: 'Manual de armonía' }) });
// The PDF draws every system as vector paths, the numerals in the embedded text face.
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
