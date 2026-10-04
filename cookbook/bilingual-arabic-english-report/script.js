// ═══ Postext Cookbook · Nº 106 · A bilingual Arabic–English report ═══════════════════
// https://postext.dev/en/cookbook/bilingual-arabic-english-report
// Code: MIT · Text: original Arabic, English and Spanish prose (CC BY 4.0) · Pictures: none
// Fonts: IBM Plex Sans Arabic, IBM Plex Sans (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the second language of the report: English, or Spanish in 'es'
const RECIPE = 'bilingual-arabic-english-report';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a deep teal for the Arabic, a slate for the second language
const palette = {
  ink: '#1b1f22', // the Arabic text
  teal: '#0e5a5c', // the accent: the cover band, headings, table heads
  slate: '#45535c', // the English (or Spanish) text: a voice of its own, a step lighter
  tint: '#e4eeec', // the second language's panels
  rule: '#b9c4c2', // hairlines
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.teal })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [ARABIC, LATIN] = ['IBM Plex Sans Arabic', 'IBM Plex Sans']; // one superfamily
const LEAD = 18; // pt: the Arabic leading
const SIDE = 20; // mm: the side margins

// #region answer: one Arabic document, its English blocks marked {dir=ltr}
// The document is Arabic (locale 'ar'): right to left, Arabic-Indic digits. A block in the
// other language says so in the Markdown, and its style gives it its own voice:
//   :::paragraphs{style="second" dir=ltr}      a paragraph or several, set left to right
//   ### Director's note {style="second-head" dir=ltr}
// Inside an Arabic sentence, a Latin name is an isolate, :ltr[Penguin Classics]{lang=en}, so
// the words around it keep their order. 'start' and 'end' follow each block's own direction.
const second = { id: 'second', fontFamily: LATIN, fontSize: pt(9.5), lineHeight: pt(14),
  color: col('slate'), textAlign: 'start', firstLineIndent: pt(0) };
const bodyText = { fontFamily: ARABIC, fontSize: pt(11), lineHeight: pt(LEAD),
  color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'start', // ragged: the right edge for Arabic, the left for an English block
  firstLineIndent: pt(0), paragraphSpacing: true,
  // The Arabic is never slanted; italics stay for the titles in the Latin blocks.
  emphasis: 'italic' };
// #endregion

// #region tables: the Arabic table runs with the page; the English one runs left to right
const cell = (content, extra = {}) => ({ content, ...extra });
const tableOf = (head, rows) => ({ headerRowCount: 1, columnWidths: [46, 18, 18, 18],
  rows: [head.map((h, i) => cell(h, { isHeader: true, align: i ? 'end' : 'start' })),
    ...rows.map((r) => r.map((c, i) => cell(c, { align: i ? 'end' : 'start' })))] });
const FIGURES = [ // programme, 2024, 2025, change: the Foundation's own counts
  ['كتب مترجمة إلى العربية', 'Books translated into Arabic', 28, 34],
  ['كتب مترجمة من العربية', 'Books translated from Arabic', 9, 14],
  ['منح للمترجمين', 'Translator grants', 41, 52],
  ['ورشات تدريب', 'Training workshops', 12, 18],
  ['مشاركون في الورشات', 'Workshop participants', 310, 466]];
const SPANISH = { 'Books translated into Arabic': 'Libros traducidos al árabe',
  'Books translated from Arabic': 'Libros traducidos del árabe',
  'Translator grants': 'Becas para traductores', 'Training workshops': 'Talleres de formación',
  'Workshop participants': 'Participantes en los talleres' };
const change = (a, b) => `${b > a ? '+' : ''}${Math.round((100 * (b - a)) / a)}%`;
const AR = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]); // the author's ٠–٩
const tableAr = tableOf(['البرنامج', '٢٠٢٤', '٢٠٢٥', 'التغيّر'], FIGURES.map(([ar, , a, b]) =>
  [ar, AR(a), AR(b), AR(change(a, b)).replace('%', '٪')]));
const tableEn = tableOf(t({ en: ['Programme', '2024', '2025', 'Change'],
  es: ['Programa', '2024', '2025', 'Cambio'] }), FIGURES.map(([, en, a, b]) =>
  [t({ en, es: SPANISH[en] }), String(a), String(b), change(a, b)]));
// The English table has a heading of its own and no number: a generated number would print in
// the document's digits, ٢, inside the English block.
const resourceTypes = [...defaultResourceTypes('ar'), { id: 'data', name: 'Data',
  shortLabel: 'Data', captionPrefix: '', numberingTemplate: '', resetOn: 'never',
  counterFormat: 'decimal' }];
const resources = [
  { id: 'figures-ar', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: tableAr }, placement: { position: 'here' },
    caption: 'أرقام البرامج في عامي ٢٠٢٤ و٢٠٢٥' },
  { id: 'figures-en', typeId: 'data', kind: 'table', createdAt: 0, updatedAt: 0,
    table: { model: tableEn, direction: 'ltr', styleId: 'second' },
    placement: { position: 'here' } },
];
// #endregion

// #region cover: the report's two titles on a teal band, each in its own direction
const band = { enabled: true, minHeight: mm(70), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('teal') },
    placement: { anchor: { to: 'bleed', edge: 'top-left' },
      size: { width: mm(216), height: mm(86) } } },
  // Design text takes the document's direction; an English title says 'ltr' and aligns left.
  { kind: 'text', id: 'org', content: '{attr.org}', fontFamily: ARABIC, fontSize: pt(13),
    fontWeight: 600, color: col('tint'), align: 'right',
    placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(-SIDE), y: mm(18) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: ARABIC, fontSize: pt(50),
    fontWeight: 700, lineHeight: 1.15, color: col('paper'), align: 'right',
    placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(-SIDE), y: mm(30) } } },
  { kind: 'text', id: 'title-2', content: '{attr.second}', direction: 'ltr', fontFamily: LATIN,
    fontSize: pt(20), fontWeight: 300, color: col('tint'), align: 'left',
    placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(SIDE), y: mm(66) } } },
] } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // written out, never LANG (gotcha: arabic-locale-tag)
  colorPalette, bodyText, resourceTypes,
  page: { width: mm(210), height: mm(280), dpi: 150,
    margins: { top: mm(22), bottom: mm(22), left: mm(SIDE), right: mm(SIDE), mirror: true } },
  layout: { layoutType: 'single' },
  headings: { fontFamily: ARABIC, fontWeight: 700, color: col('teal'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, marginTop: pt(0),
      marginBottom: pt(0), advancedDesign: band },
    { level: 2, fontSize: pt(17), lineHeight: pt(26), marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  headingStyles: [{ id: 'second-head', fontFamily: LATIN, fontSize: pt(10), fontWeight: 600,
    lineHeight: pt(14), color: col('slate'), marginTop: pt(0), marginBottom: pt(4) }],
  paragraphStyles: [second,
    { id: 'colophon', fontFamily: LATIN, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('slate'), textAlign: 'start', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('teal'), headerColor: col('paper'), headerFontFamily: ARABIC,
    headerFontSize: pt(9.5), bodyFontFamily: ARABIC, bodyFontSize: pt(10), bodyColor: col('ink'),
    cellPadding: mm(1.6) },
  tableStyles: [{ id: 'second', headerBackground: col('slate'), headerFontFamily: LATIN,
    bodyFontFamily: LATIN, bodyFontSize: pt(9), bodyColor: col('slate') }],
  captionStyle: { fontFamily: ARABIC, fontSize: pt(9.5), color: col('ink'), position: 'above',
    labelBold: true, labelColor: col('teal'), labelSeparator: ': ' },
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', pages: 'body',
    fontFamily: ARABIC, fontSize: pt(9), fontWeight: 600, color: col('teal'), align: 'center',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-12) } } }] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the Arabic, with English or Spanish

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'IBM Plex Sans Arabic': ['400', '600', '700'], // ARABIC: text, headings, tables, folios
  'IBM Plex Sans': ['300', '400', '400i', '600'], // LATIN: the second language, its table
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown + JSON.stringify(resources));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A bilingual Arabic–English report',
  es: 'Un informe bilingüe árabe-español' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf arabic book · the Cookbook inlines cookbook/_kit/*.js here
