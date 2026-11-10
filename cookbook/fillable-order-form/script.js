// ═══ Postext Cookbook · Nº 181 · A printed order form that is also a fillable PDF ════
// https://postext.dev/en/cookbook/fillable-order-form
// Code: MIT · Text: original (CC BY 4.0) · Picture: painting made for the recipe
// Fonts: Libre Caslon, Barlow Semi Condensed (SIL OFL 1.1) · Needs postext ≥ 1.73.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
  formatFieldNumber, formNumberStyle,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'fillable-order-form';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a seed-house green, a kraft tint for the computed amounts
const palette = {
  ink: '#22201c', paper: '#fffdf8', rule: '#cbc2ae', // warm near-black, cream, row hairlines
  accent: '#2f5a3c', // leaf green: table heads, kickers, the total
  tint: '#efe9da', // kraft paper: the boxes the form fills in by itself
  leaf: '#e1e9dc', // pale green: the rows that head each group of the list
  muted: '#6a6355', // running heads, colophon, the outlines of the boxes to fill
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [SERIF, DISPLAY] = ['Libre Caslon Text', 'Libre Caslon Display'];
const SANS = 'Barlow Semi Condensed';
const [OUTER, LEAD] = [18, 13.5]; // outer margin (mm; the running heads align to it), leading (pt)

// #region answer: field chips: the quantity, the line total it computes, the subtotal
// The currency and its side; the separators follow the document's language (1,234.50 in
// English, 1.234,50 in Spanish). The canvas and the PDF take the same object.
const FORMS = t({ en: { currency: '$' }, es: { currency: '€', currencyBefore: false } });
// A row of the list: a quantity the reader types, and a total the PDF reader computes as
// quantity × price. The price is a number in the calculation, so it needs no field.
const qty = (code) => `:chip[ ]{style="qty" field="${code}.qty" kind="number" format="integer"}`;
const lineTotal = (code, price) => `:chip[ ]{style="amount" field="${code}.total" `
  + `format="currency" calc="product(${code}.qty, ${price})"}`;
// A subtotal sums its group's line totals (AFSimple_Calculate); a computed field is read-only.
const subtotal = (group, codes) => `:chip[ ]{style="sum" field="sub.${group}" format="currency" `
  + `calc="sum(${codes.map((code) => `${code}.total`).join(', ')})"}`;
// #endregion

// #region chips: one chip style per kind of box: to fill, computed, to write on, to tick
const box = { fontFamily: SANS, fontSize: pt(9), color: col('ink'), borderRadius: pt(1.2),
  paddingX: mm(1.4), paddingTop: pt(1.4), paddingBottom: pt(0.6), gap: mm(1), minWidth: mm(16) };
const fill = { ...box, background: col('paper'), borderColor: col('muted'), borderWidth: pt(0.6) };
const computed = { ...box, background: col('tint'), borderWidth: pt(0) };
const line = (id, width) => ({ id, fontFamily: SANS, fontSize: pt(10), color: col('ink'),
  backgroundEnabled: false, underline: 'solid', borderColor: col('muted'), borderWidth: pt(0.5),
  paddingX: mm(0.6), minWidth: mm(width) });
const chipStyles = [
  { id: 'qty', ...fill, minWidth: mm(11) }, // a packet count
  { id: 'entry', ...fill }, // an amount the reader types
  { id: 'amount', ...computed }, // an amount the form computes
  { id: 'sum', ...computed, borderColor: col('accent'), borderWidth: pt(0.6), bold: true },
  { id: 'total', ...computed, background: col('accent'), color: col('paper'), bold: true },
  line('line', 145.5), line('mid', 64), line('short', 59.5), // name, address, town…
  { id: 'tick', ...fill, paddingX: pt(0), minWidth: mm(3.9) }, // a check box: a square
];
// #endregion

// #region tables: the whole list as one table from a spreadsheet's TSV, the boxes added
const style = formNumberStyle(FORMS, t({ en: 'en-us', es: 'es' })), right = { align: 'right' };
const money = (price) => formatFieldNumber(price, 'currency', style); // "$ 3.75", "3,40 €"
// A cell across `span` columns; the cells it covers stay in the grid, marked hiddenBy.
const across = (row, content, extra, span = 6) => [{ content, colSpan: span, ...extra },
  ...Array.from({ length: span - 1 }, () => ({ content: '', hiddenBy: { row, col: 0 } }))];
const table = (id, altText, model) => ({ id, typeId: 'list', kind: 'table', createdAt: 0,
  updatedAt: 0, placement: { position: 'here' }, altText, table: { model } });
// The sheet: a header row, then '= group<TAB>name<TAB>subtotal label' before each group's
// varieties (code, name, note, seeds in a packet, price). The pen adds the boxes.
function priceList(tsv) {
  const [head, ...lines] = tsv.trim().split('\n').map((l) => l.split('\t'));
  const rows = [head.map((content, c) => ({ content, isHeader: true, ...(c > 1 && right) }))];
  let group;
  lines.forEach((cells, i) => {
    if (cells[0].startsWith('=')) {
      // A row of one cell heads its group; a split never leaves it alone at a page foot.
      rows.push(across(rows.length, `**${cells[1]}**`, { background: col('leaf') }));
      group = { id: cells[0].slice(1).trim(), label: cells[2], codes: [] };
      return;
    }
    const [code, variety, note, packet, price] = cells;
    group.codes.push(code);
    rows.push([{ content: code }, { content: `**${variety}** ${note}` },
      { content: packet, ...right }, { content: money(price), ...right },
      { content: qty(code), align: 'center' }, { content: lineTotal(code, price), ...right }]);
    if (lines[i + 1]?.[0].startsWith('=') !== false) { // the group's last variety
      rows.push([...across(rows.length, group.label, right, 5),
        { content: subtotal(group.id, group.codes), ...right }]);
    }
  });
  return table('list', t({ en: 'Price list', es: 'Lista de precios' }),
    { headerRowCount: 1, columnWidths: [0.95, 7.65, 1.4, 1.2, 1.2, 1.6], rows });
}
const summaryTable = (tsv) => table('summary', t({ en: 'Order total', es: 'Total' }), {
  columnWidths: [8, 2], rows: tsv.trim().split('\n')
    .map((l) => l.split('\t').map((content, c) => ({ content, ...(c && right) }))) });
// #endregion

// #region cover: the painting across the head of page 1, the title under it
const at = (to, edge, x, y, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, size });
const cover = { id: 'cover', numbered: false, header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, minHeight: mm(164), slot: { elements: [
    { kind: 'image', id: 'painting', resourceId: 'seed-table', fit: 'cover',
      placement: at('page', 'top-left', 0, 0, { width: mm(210), height: mm(134) }) },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: SANS, fontWeight: 700,
      fontSize: pt(9), letterSpacing: pt(1.8), textTransform: 'uppercase', color: col('accent'),
      align: 'left', placement: at('container', 'top-left', 0, 120) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(48),
      lineHeight: 0.98, color: col('ink'), align: 'left',
      placement: at('#kicker', 'below', 0, 3, { width: mm(110), height: 'auto' }) },
    { kind: 'text', id: 'standfirst', content: '{attr.standfirst}', fontFamily: SERIF,
      italic: true, fontSize: pt(11), lineHeight: 15 / 11, color: col('ink'), align: 'left',
      placement: at('#title', 'align-top', 116, 2, { width: mm(54), height: 'auto' }) },
  ] } },
};
// #endregion

// #region running-heads: the seed house on the verso, the section on the recto
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content, parity,
  fontFamily: SANS, fontSize: pt(8), fontWeight: 600, letterSpacing: pt(1.3),
  textTransform: 'uppercase', color: col('muted'), placement: at('page', edge, x, 12), ...extra });
const folio = { fontWeight: 700, color: col('accent') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [] };
// #endregion

const plain = { fontFamily: SANS, textAlign: 'left', firstLineIndent: pt(0) };
const config = {
  locale: t({ en: 'en-us', es: 'es' }), layout: { layoutType: 'single' },
  // The price lists are tables with no caption: a type with no prefix and no number prints none.
  resourceTypes: [...defaultResourceTypes(LANG), { id: 'list',
    name: t({ en: 'Price list', es: 'Lista de precios' }), shortLabel: '',
    numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }],
  colorPalette, chipStyles, headingStyles: [cover], header, footer,
  page: { sizePreset: 'custom', width: mm(210), height: mm(270), dpi: 150,
    margins: { top: mm(22), bottom: mm(20), left: mm(22), right: mm(OUTER), mirror: true } },
  bodyText: { fontFamily: SERIF, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 400, levels: [
    { level: 1, fontSize: pt(30), lineHeight: pt(32), breakBefore: { parity: 'any' }, // new page
      marginTop: pt(0), marginBottom: pt(LEAD / 2) },
    { level: 2, fontFamily: SANS, fontSize: pt(9.5), lineHeight: pt(LEAD), fontWeight: 700,
      letterSpacing: pt(1.6), textTransform: 'uppercase', color: col('accent'), marginTop: pt(LEAD),
      marginBottom: pt(3) }] },
  paragraphStyles: [
    // The lines of the form: a label, a tab, the box. A tall line leaves room to write by hand.
    { id: 'field', ...plain, fontSize: pt(10), lineHeight: pt(24),
      tabStops: [24, 92, 110].map((at) => ({ position: mm(at) })) },
    { id: 'colophon', ...plain, fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
      marginTop: pt(LEAD) },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('accent'), headerColor: col('paper'), headerFontFamily: SANS,
    headerFontSize: pt(8), headerBold: true, headerLetterSpacing: pt(1), headerTextTransform:
    'uppercase', bodyFontFamily: SERIF, bodyFontSize: pt(8.8), cellPadding: mm(0.95) },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the cover, the list, the order
const seeds = /* @content:seeds */ ''; // TSV: the price list, as a spreadsheet exports it
const summary = /* @content:summary */ ''; // TSV: the order summary, a field per row

const resources = [
  { id: 'seed-table', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'seed-table-1440.jpg', format: 'jpeg', width: 1440, height: 900 },
    altText: t({ en: 'A painted still life of heirloom tomatoes, squash, peppers and beans.',
      es: 'Un bodegón pintado de tomates, calabazas, pimientos y judías tradicionales.' }) },
  priceList(seeds), summaryTable(summary),
];
await loadImage('seed-table-1440.jpg', asset('seed-table-1440.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Libre Caslon Text': ['400', '400i', '700'], 'Libre Caslon Display': ['400'],
  'Barlow Semi Condensed': ['400', '400i', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
// The canvas paints a number field's value as the PDF shows it: hand it the same FORMS.
showPages(doc, { title: t({ en: 'A seed list you fill in and post, or fill in on screen',
  es: 'Una lista de semillas para rellenar a mano o en pantalla' }), forms: FORMS });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  forms: FORMS }), `${RECIPE}.pdf`); // a field's face is the chip's, embedded whole

// @kit
