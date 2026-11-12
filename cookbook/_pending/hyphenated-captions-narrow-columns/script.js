// ═══ Postext Cookbook · Nº 188 · Hyphenated captions in narrow columns ═══════════════════
// https://postext.dev/en/cookbook/hyphenated-captions-narrow-columns
// Code: MIT · Text: original (CC BY 4.0) · Plates: diffusion models
// Fonts: Newsreader, Fraunces, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.81.0
//
// An observatory bulletin set twice in three columns of 60 mm: first with the captions, notes
// and table cells broken as before 1.81, then hyphenated and broken on the optimal breaker.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'hyphenated-captions-narrow-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: an estuary green for the one accent, the plates' cream for the paper
const palette = {
  ink: '#1f2421', // text: a green-black
  estuary: '#24504d', // the accent: the opener's band, caption labels, folios, crossheads
  rule: '#cdc6b4', // hairlines
  muted: '#5d6159', // running heads, notes, the colophon
  paper: '#f6f3ea', // the page: the cream the plates are painted on, so they have no edge
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': pointed at the accent, nothing prints blue.
  { id: 'main-color', name: 'estuary (defaults)', value: { hex: palette.estuary, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Newsreader', 'Fraunces', 'Libre Franklin'];
const TRIM = { width: 225, height: 297 }; // a magazine trim, in mm
const MARGIN = { top: 22, bottom: 20, inner: 18, outer: 16 }; // mirrored
const GUTTER = 5; // mm: three columns of 60.3 mm
const LEAD = 13.2; // body leading in pt
const BAND = 100; // mm: the opener's colour field, from the top edge
const STRIP = 66; // mm: the estuary strip under it, 225 mm wide at the file's 1536 × 451
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement, align: 'left',
  overflow: 'wrap', ...extra });
const caps = (size) => ({ fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.18) });

// #region answer: captions and notes justified and hyphenated, table cells hyphenated
const captionStyle = {
  fontFamily: LABEL, fontSize: pt(8.2), color: col('ink'), gap: mm(2),
  labelBold: true, labelColor: col('estuary'), // "Figure 3." is never divided
  align: 'justify',
  // Broken whole on the Knuth–Plass breaker, within the body's word spacing, its words
  // divided with the body's patterns. false (the default) breaks it line by line.
  hyphenation: true,
  lineHeight: pt(10.8), // the caption's own leading; unset, the body's in proportion
  note: { fontSize: pt(6.8), lineHeight: pt(8.8), color: col('muted'), gap: mm(0.8),
    align: 'justify', hyphenation: true }, // the line under the caption: Resource.note
};
// Cells are set ragged, so they divide words only when ragged text does (hyphenation.ragged).
const tableStyle = {
  rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.2),
  headerBackground: col('estuary'), headerColor: col('paper'), headerFontFamily: LABEL,
  headerFontSize: pt(7.4), headerBold: true, bodyFontFamily: LABEL, bodyFontSize: pt(7.4),
  bodyColor: col('ink'), hyphenation: true,
};
// bodyText.hyphenation: ragged text divides a word that would leave 1.5 em or more empty.
const hyphenation = { enabled: true, ragged: true, zone: em(1.5) };
// #endregion

// #region opener: a colour field with the masthead and title, the estuary strip under it
const opener = { enabled: true,
  minHeight: mm(BAND + STRIP + 6 - MARGIN.top), // the text starts 6 mm under the strip
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('estuary') },
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'image', id: 'strip', resourceId: 'strip', // bleeds off both sides
      placement: { ...at('page', 'top-left', 0, BAND), size: { width: mm(TRIM.width),
        height: mm(STRIP) } } },
    text('masthead', '{title} · {subtitle}', LABEL, 8.5, 'paper',
      at('container', 'top-left', 0, 12 - MARGIN.top), caps(8.5)),
    text('kicker', '{attr.kicker}', LABEL, 8.5, 'paper',
      at('container', 'top-left', 0, 30 - MARGIN.top), { ...caps(8.5), fontWeight: 400 }),
    text('title', '{titleText}', DISPLAY, 46, 'paper', at('#kicker', 'below', 0, 2.5, 185),
      { fontWeight: 600, lineHeight: 1 }),
    text('lead', '{attr.lead}', TEXT, 11.5, 'paper', at('#title', 'below', 0, 3.5, 172),
      { italic: true, lineHeight: 1.32 }),
  ] } };
// #endregion

// #region furniture: bulletin and issue on the verso, the article on the recto
const HEAD_Y = 12; // mm from the top edge
const head = (id, content, parity, edge, x, extra) => text(id, content, LABEL, 7.6, 'muted',
  at('page', edge, x, HEAD_Y), { ...caps(7.6), parity, pages: 'body', overflow: 'clip',
    ...extra });
const folio = { fontWeight: 700, color: col('estuary') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, folio),
  head('verso-title', '{title} · {subtitle}', 'even', 'top-left', MARGIN.outer + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 8),
    { align: 'right' }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer,
    { ...folio, align: 'right' }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom-right',
  -MARGIN.outer, { ...folio, align: 'right', pages: 'opener',
    placement: at('page', 'bottom-right', -MARGIN.outer, -12) })] }; // a drop folio
// #endregion

// "Figure 3", not "1.3", in a one-article issue; the table's caption stands above it.
const resourceTypes = defaultResourceTypes(LANG).map((type) => ({ ...type,
  numberingTemplate: '{n}', resetOn: 'never',
  ...(type.id === 'table' && { captionStyle: { position: 'above', align: 'left' } }) }));

const config = {
  locale: t({ en: 'en-gb', es: 'es' }), // the hyphenation patterns of each edition
  colorPalette, resourceTypes, captionStyle, tableStyle,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'multiple', columnCount: 3, gutterWidth: mm(GUTTER) },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(3.5), indentAfterHeading: false,
    hyphenation, optimalLineBreaking: true, minWordSpacing: 0.7, maxJustifyTracking: 15,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: DISPLAY, fontWeight: 600, color: col('estuary'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) }, // crossheads, one line above, none below
  ] },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.6),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header, footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region plates: each plate cropped to its bird, with a caption and a note
// Caption, note and alt text of each resource (the strip: its alt text alone), one block
// each: content.figures.<lang>.md.
const figureTexts = /* @content:figures */ '';
const TEXTS = Object.fromEntries(figureTexts.trim().split(/\n\s*\n/)
  .map((block) => block.split('\n').map((line) => line.trim()))
  .map(([id, ...l]) => [id, l[1] ? { caption: l[0], note: l[1], altText: l[2] }
    : { altText: l[0] }]));
const area = (x, y, width, height) => ({ x, y, width, height }); // fractions of the plate
const CROPS = { curlew: area(0.22, 0.1, 0.58, 0.8), redshank: area(0.27, 0.06, 0.52, 0.84),
  reedling: area(0.29, 0, 0.44, 1), warbler: area(0.24, 0, 0.54, 1) }; // each bird, cropped
const plate = (id, [w, h]) => ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, bitmap: { fileId: `${id}-${w}.jpg`, format: 'jpeg', width: w, height: h },
  ...(CROPS[id] && { crop: CROPS[id] }), ...TEXTS[id] });
// #endregion

// #region table: the peak counts, one column wide, set where the text names it
const COUNTS = /* @content:counts */ ''; // species | peak | date | where, one row a line
const rows = COUNTS.trim().split('\n').map((line) => line.split('|').map((s) => s.trim()));
const counts = { id: 'counts', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' }, ...TEXTS.counts,
  table: { model: { headerRowCount: 1, columnWidths: [1.15, 1, 0.85, 1.5],
    rows: rows.map((cells, r) => cells.map((content, c) => ({ content, isHeader: r === 0,
      ...(c > 0 && c < 3 && { align: 'right' }) }))) } } };
// #endregion
const resources = [plate('strip', [1536, 451]),
  ...Object.keys(CROPS).map((id) => plate(id, [1200, 600])), counts];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Newsreader: ['400', '400i'], Fraunces: ['600'], // text and display
  'Libre Franklin': ['400', '400i', '600', '700'] }; // labels, captions, the table

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(resources.filter((r) => r.bitmap)
  .map(({ bitmap: b }) => loadImage(b.fileId, asset(b.fileId))));
// #region builds: the same issue with the 1.81 settings off (the default) and on
const build = (on) => buildDocumentWithFonts({ markdown, resources }, { ...config,
  captionStyle: { ...captionStyle, hyphenation: on,
    note: { ...captionStyle.note, hyphenation: on } },
  tableStyle: { ...tableStyle, hyphenation: on } }, kitFonts(FONTS));
const docs = { before: await build(false), after: await build(true) };
// #endregion
const title = t({ en: 'Hyphenated captions in narrow columns',
  es: 'Pies con separación silábica en columnas estrechas' });
const LABELS = { before: t({ en: 'Line by line', es: 'Línea a línea' }),
  after: t({ en: 'Hyphenated', es: 'Con separación' }) };
const switches = Object.keys(docs).map((key) => Object.assign(document.createElement('button'),
  { type: 'button', value: key, textContent: LABELS[key] }));
const show = (key) => { showPages(docs[key], { title: `${title} · ${LABELS[key]}` });
  switches.forEach((b) => { b.ariaPressed = String(b.value === key); }); };
for (const b of switches) b.addEventListener('click', () => show(b.value));
show('after');
document.getElementById('pt-actions').prepend(...switches);

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
