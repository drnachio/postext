// ═══ Postext Cookbook · Nº 182 · An amendment shown struck through and underlined ═════
// https://postext.dev/en/cookbook/amendment-redline
// Code: MIT · Text: Pub. L. 105-298 and 17 U.S.C. (US Gov., PD); Constitución Española (BOE)
// Fonts: Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.73.0
// A comparative print: the law as it stood, each deletion ~~struck through~~ and each
// insertion :underline[underlined], then the amended text in a box whose clauses hang.
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'amendment-redline';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a government-print navy, one red for rules and labels
const palette = {
  ink: '#1b1d22', // text: a cool near-black
  band: '#1f2b47', // the opener's band: navy
  accent: '#a1321f', // labels, stripes, the legend's rule
  tint: '#eef0f4', // the box of the amended text
  rule: '#c7ccd6', // hairlines
  muted: '#5d6370', // running heads, notes, colophon
  paper: '#ffffff',
  pale: '#c9d2e6', // the kicker and the standfirst on the band
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const SERIF = 'Source Serif 4', SANS = 'Source Sans 3';
const TRIM = [152, 229], INNER = 20, OUTER = 17; // mm: a 6 × 9 in committee print
const LEAD = 14; // pt: the body leading
const HANG = mm(7); // how far the clauses of a box hang: the width of "(a)" and a space

// #region answer: the marks live in the Markdown; the boxes hang their clauses
// In the text, ~~fifty~~ strikes a deleted word and :underline[70] underlines the new one.
// Both lines are painted from the face's own metrics and take no room, so the struck and
// the inserted words justify and hyphenate like any others. The amended text then sits in
// a box whose paragraphs hang: '(a)', a tab, and every turnover line under the text.
const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700, letterSpacing: pt(1.1),
  textTransform: 'uppercase', color: col('accent') };
const clauses = { fontFamily: SERIF, fontSize: pt(9.5), lineHeight: pt(13), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left', // a box's measure is short
  hangingIndent: HANG, // every line but the first starts 7 mm in (postext ≥ 1.71)
  tabStops: [{ position: HANG }] }; // and the tab after the marker takes the text there
const pad = (v, h) => ({ top: mm(v), right: mm(h), bottom: mm(v), left: mm(h) });
const calloutStyles = [
  // The coding legend: a red rule down its side, the label face.
  { id: 'legend', backgroundEnabled: false,
    stripe: { enabled: true, side: 'left', width: pt(2.5), color: col('accent') },
    padding: pad(1.5, 3.5), body: { fontFamily: SANS, fontSize: pt(9), lineHeight: pt(12.5),
      color: col('ink'), boldColor: col('accent'), firstLineIndent: pt(0), textAlign: 'left' } },
  // The bill's own words: a red rule on top, clauses hung, no tint.
  { id: 'bill', backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
    padding: pad(2.5, 0), body: clauses, keepTogether: false, // it may run on to the next page
    // its title keeps its case: "(b)" stays "(b)"
    titleStyle: { ...label, textTransform: 'none', letterSpacing: pt(0.2), fontSize: pt(8.5),
      color: col('ink') } },
  // The text as amended: a tint, the clauses hung the same way.
  { id: 'amended', background: col('tint'), padding: pad(3.5, 4.5), titleStyle: label,
    body: clauses },
];
// #endregion

// #region opener: a navy band off the top of the page, the kicker and title on it
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const BAND = 66; // mm from the trim top to the foot of the band
const opener = { enabled: true, minHeight: mm(BAND - 22 + 6), marginBottom: pt(0), slot: {
  elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('band') },
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(BAND + 3) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, color: col('pale'),
      placement: { ...at('container', 'top-left', 0, 6), size: { width: mm(112) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SERIF, fontWeight: 700,
      fontSize: pt(30), lineHeight: 1.05, color: col('paper'), align: 'left',
      placement: { ...at('#kicker', 'below', 0, 3), size: { width: mm(112), height: 'auto' } } },
    { kind: 'text', id: 'dek', content: '{attr.dek}', fontFamily: SERIF, italic: true,
      fontSize: pt(10.5), lineHeight: 1.3, color: col('pale'), align: 'left',
      placement: { ...at('#title', 'below', 0, 3.5), size: { width: mm(104), height: 'auto' } } },
  ] } };
// #endregion

// #region running-heads: the print's title on the verso, the part on the recto
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: SANS, fontSize: pt(7.5),
  fontWeight: 600, letterSpacing: pt(1.1), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra });
const folio = { fontWeight: 700, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{firstMark.h2}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0,
  { ...folio, pages: 'opener', placement: at('container', 'top', 0, 9) })] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM[0]), height: mm(TRIM[1]), dpi: 150,
    margins: { top: mm(22), bottom: mm(22), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: SERIF, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: SERIF, color: col('ink'), fontWeight: 700, levels: [
    { level: 1, fontSize: pt(30), breakBefore: { parity: 'odd' }, advancedDesign: opener,
      marginBottom: pt(0) },
    { level: 2, ...label, fontSize: pt(8.5), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(LEAD / 2) },
    // A section catchline of the Code: bold serif, its turnovers hung under the title.
    { level: 3, fontSize: pt(10), lineHeight: pt(13), marginTop: pt(LEAD / 2),
      marginBottom: pt(LEAD / 2) },
  ] },
  paragraphStyles: [
    // The asterisks of omitted matter, as a comparative print sets them.
    { id: 'elision', textAlign: 'center', firstLineIndent: pt(0), color: col('muted'),
      letterSpacing: em(0.6), marginTop: pt(3), marginBottom: pt(3) },
    { id: 'colophon', fontFamily: SANS, fontSize: pt(7.3), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  calloutStyles,
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Source Serif 4': ['400', '400i', '700'],
  'Source Sans 3': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Copyright term extension: changes in existing law',
  es: 'Las reformas de la Constitución: texto comparado' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
