// ═══ Postext Cookbook · Nº 176 · Old-style, lining and tabular figures ═══════════════
// https://postext.dev/en/cookbook/old-style-and-tabular-figures
// Code: MIT · Text: H. D. Thoreau, Walden (1854, public domain) · Vignette: 1854 title page (PD)
// Fonts: Alegreya, Alegreya SC, Alegreya Sans (SIL OFL 1.1) · Needs postext ≥ 1.65.0
// Thoreau's accounts from Walden. Each text style asks Alegreya for one kind of figures:
// old-style in the prose, lining in the small-capital headings, tabular in the accounts.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'old-style-and-tabular-figures';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#221e1a', // text: a warm near-black
  accent: '#7d3a1f', // walnut: headings, kicker, rules of the opener
  rule: '#8a7f73', // the light rules of the accounts
  muted: '#6b6158', // running heads, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const TEXT = 'Alegreya', CAPS = 'Alegreya SC', LABEL = 'Alegreya Sans';
const TRIM = [140, 216], INNER = 19, OUTER = 16; // mm: a trade paperback
const MEASURE = TRIM[0] - INNER - OUTER, VIGNETTE = 50; // mm
const LEAD = 14.5; // pt: the body leading, the grid the headings keep to

// #region answer: one figure style per text style
// Alegreya's own figures are old-style, so the prose asks for none: the cut Fontsource
// serves has no onum, and 'oldstyle' would change nothing (see the write-up).
const bodyText = {
  fontFamily: TEXT, fontSize: pt(10.8), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
  hyphenation: { enabled: true }, optimalLineBreaking: true,
  avoidWidows: true, avoidOrphans: true, avoidRunts: true,
};
// Small capitals take lining figures (lnum), at the height of the capitals around them.
const section = { level: 2, fontFamily: CAPS, fontSize: pt(12.5), lineHeight: pt(LEAD),
  fontWeight: 400, letterSpacing: pt(0.6), color: col('accent'), figureStyle: 'lining',
  marginTop: pt(LEAD), marginBottom: pt(0) };
// The accounts: every figure on one width (tnum), so the cents stand in columns.
// 'tabular' keeps the font's form, old-style; 'lining-tabular' would set them at cap height.
const tableStyle = {
  figureStyle: 'tabular', bodyFontFamily: TEXT, bodyFontSize: pt(9.8), bodyColor: col('ink'),
  rules: 'booktabs', groupRules: true, borderColor: col('rule'), lightRuleWidth: pt(0.4),
  heavyRuleWidth: pt(0.7), headerBackgroundEnabled: false, headerFontFamily: TEXT,
  headerFontSize: pt(9.8), headerColor: col('ink'), headerBold: false, headerItalic: false,
  cellPadding: mm(0.7),
};
// #endregion

// #region accounts: Thoreau's TSV columns: item, $, dollars.cents, fraction, remark
// A row starting '=' is a total (header cells: a light rule above it), '+' heads a group.
const C = (content, align = 'left', extra = {}) => ({ content, align, ...extra });
function account(tsv) {
  const rows = tsv.replace(/^\n+|\n+$/g, '').split('\n').map((line) => {
    const total = line.startsWith('='), group = line.startsWith('+');
    const [item, dollar, amount, fraction, remark] = line.replace(/^[=+]/, '').split('\t');
    if (group) return [C(item, 'left', { colSpan: 5, isHeader: true }),
      ...[1, 2, 3, 4].map(() => C('', 'left', { hiddenBy: { row: -1, col: 0 } }))];
    const h = { isHeader: total };
    return [C(item, 'left', h), C(dollar ? '\\$' : '', 'right', h), // `$` alone opens maths
      C(amount ?? '', 'right', h), C(fraction ?? '', 'left', h), C(remark ?? '', 'left', h)];
  });
  rows.forEach((row, r) => row.forEach((cell) => cell.hiddenBy && (cell.hiddenBy.row = r)));
  return { rows, headerRowCount: 0, columnWidths: [34, 2.4, 8, 3.6, 35] };
}
const accounts = /* @content:accounts */ ''; // content.accounts.<lang>.md: one block per table
const tables = Object.fromEntries(accounts.split(/^=== /m).filter(Boolean)
  .map((block) => [block.slice(0, block.indexOf('\n')).trim(), block.slice(block.indexOf('\n'))]));
// #endregion

// #region opener: the 1854 vignette of the cabin, the title, the years in lining capitals
const at = (to, edge, y, x = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
// 'below' starts a text at the left edge of what it hangs from: the texts take the measure
// and start half the difference to the left of the vignette, so they centre on the page.
const centred = (to, y) => ({ ...at(to, 'below', y, (VIGNETTE - MEASURE) / 2),
  size: { width: mm(MEASURE) } });
const opener = { enabled: true, minHeight: pt(19 * LEAD), slot: { elements: [
  { kind: 'image', id: 'cabin', resourceId: 'cabin',
    placement: { ...at('container', 'top', 0), size: { width: mm(VIGNETTE) } } },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontWeight: 500,
    fontSize: pt(7.5), letterSpacing: pt(1.5), textTransform: 'uppercase', color: col('accent'),
    align: 'center', placement: centred('#cabin', 6) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: CAPS, fontSize: pt(30),
    letterSpacing: pt(1.2), lineHeight: 1, color: col('ink'), align: 'center',
    placement: { ...at('#kicker', 'below', 2.5), size: { width: mm(MEASURE) } } },
  // A design text names its own family, so it states its figures too.
  { kind: 'text', id: 'dates', content: '{attr.dates}', fontFamily: CAPS, fontSize: pt(11),
    letterSpacing: pt(0.8), color: col('accent'), align: 'center', figureStyle: 'lining',
    placement: { ...at('#title', 'below', 2.5), size: { width: mm(MEASURE) } } },
] } };
// #endregion

// #region running-heads: book title on the verso, section on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5),
  fontWeight: 500, letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } }, ...extra });
const folio = { fontFamily: TEXT, fontSize: pt(9.5), fontWeight: 400, letterSpacing: pt(0),
  color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{firstMark.h2}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
  ...folio, pages: 'opener', placement: at('container', 'top', 8) })] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  // The accounts are set where Thoreau prints them, unnumbered and without a caption.
  resourceTypes: [...defaultResourceTypes(LANG), { id: 'account', name: 'Account',
    captionPrefix: '', numberingTemplate: '', defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM[0]), height: mm(TRIM[1]), dpi: 150,
    margins: { top: mm(22), bottom: mm(21), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText,
  headings: { fontFamily: CAPS, color: col('ink'), fontWeight: 400,
    levels: [
      { level: 1, fontSize: pt(30), breakBefore: { parity: 'odd' }, advancedDesign: opener,
        marginBottom: pt(0) },
      section,
    ] },
  paragraphStyles: [
    { id: 'headnote', fontSize: pt(9.8), lineHeight: pt(LEAD), italic: true,
      firstLineIndent: pt(0) },
    // Thoreau's sentence goes on under an account: no indent.
    { id: 'runon', firstLineIndent: pt(0) },
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.3), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  tableStyle,
  captionStyle: { fontFamily: LABEL, fontSize: pt(8), color: col('ink'),
    labelColor: col('accent'), note: { color: col('muted') } },
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const resources = [
  { id: 'cabin', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'cabin-860.jpg', format: 'jpeg', width: 860, height: 975 },
    altText: t({ en: 'Thoreau’s cabin among pines, an engraving from the 1854 title page.',
      es: 'La cabaña de Thoreau entre pinos, grabado de la portada de 1854.' }) },
  ...Object.entries(tables).map(([id, tsv]) => ({ id, typeId: 'account', kind: 'table',
    createdAt: 0, updatedAt: 0, caption: '', table: { model: account(tsv) } })),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Alegreya: ['400', '400i'],
  'Alegreya SC': ['400'],
  'Alegreya Sans': ['400', '400i', '500'], // the italic: the book title in the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage('cabin-860.jpg', asset('cabin-860.jpg'));
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Walden: the accounts', es: 'Walden: las cuentas' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
