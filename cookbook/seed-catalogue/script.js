// ═══ Postext Cookbook · Nº 036 · Mail-order catalogue with pictures in cells ═══════
// https://postext.dev/en/cookbook/seed-catalogue
// Code: MIT · Text: original (CC BY 4.0) · Pictures: diffusion models
// Fonts: Gelasio, Alfa Slab One, Cabin Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A fictional seed farm's spring list: a table read from TSV, a packet pictured in each row.
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage, parseTSV,
  mergeCells, setAlignment, setCellBackground, setCellContent, setCellImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'seed-catalogue';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // eight named colours; every colour in the config links to one of them
  ink: '#2d2620', paper: '#f0e2c4', // brown-black text on buff
  cream: '#fcf7ea', tomato: '#c23b22', // cells to write in; the accent: bands, titles, NEW
  basil: '#2f6b3b', sun: '#e8b53a', // rules, ORGANIC, the form's head; the cover's banner
  rule: '#c7ae86', muted: '#6d5f50', // hairlines; running heads and notes
};
// 1.4.1 designs read the hex, not paletteId: col() sets both (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));

const TRIM = { w: 190, h: 250 }; // mm: a stapled mail-order booklet
const MARGIN = { top: 22, bottom: 20, inner: 18, outer: 15 }; // mm, mirrored: 157 mm wide
const LEAD = 13; // pt: the body leading, the grid the headings keep to
const TEXT = 'Gelasio', DISPLAY = 'Alfa Slab One', LABEL = 'Cabin Condensed';
const PACKET = 0.55; // the packet picture's share of its cell's inner width
const caps = (size, fontWeight = 600) => ({ fontFamily: LABEL, fontSize: pt(size), fontWeight,
  letterSpacing: pt(size * 0.18), textTransform: 'uppercase' });
const on = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const text = (id, content, placement, style) => ({ kind: 'text', id, content, placement,
  overflow: 'wrap', ...style }); // not '…' (gotcha: overflow-ellipsis-default)
const chip = (id, size, ink, box) => ({ id, fontFamily: LABEL, bold: true, fontSize: em(size),
  color: col(ink), borderRadius: pt(1.2), ...box });
const rule = (id, below, gap, thickness) => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(thickness), color: col('basil'),
  placement: { ...on(`#${below}`, 'below', 0, gap), size: { width: 'fill' } } });

// #region answer: a price list from TSV: a packet in each variety's cell, kinds merged down
const at = (row, c) => ({ row, col: c });
const slug = (name) => name.toLowerCase().replace(/\W+/g, '-'); // 'Gold Medal' → 'gold-medal'
function priceList(tsv) { // Kind · Variety · Description · Packet · Ounce, under one head row
  let m = { ...parseTSV(tsv), headerRowCount: 1, columnWidths: [20, 40, 63, 17, 17] }; // mm
  for (const c of [0, 1]) m = setAlignment(m, at(0, c), 'center'); // each head over its column
  for (const c of [3, 4]) m = setAlignment(m, at(0, c), 'right');
  for (let r = 1; r < m.rows.length; r++) {
    // The picture is a resource of its own; the cell sets it at the top, centred, with the
    // variety's name under it, and the row grows to hold both.
    const variety = m.rows[r][1].content;
    m = setCellImage(m, at(r, 1), { resourceId: slug(variety), width: PACKET });
    m = setCellContent(m, at(r, 1), `**${variety}**`);
    m = setAlignment(m, at(r, 1), 'center');
    for (const c of [3, 4]) { // prices in the label face: lining figures, flush right, and a
      // bare $, since a cell prints the backslash of \$ (gotcha: cell-dollar-backslash)
      m = setCellContent(m, at(r, c), `:chip[$${m.rows[r][c].content}]{style="price"}`);
      m = setAlignment(m, at(r, c), 'right');
    }
    if (!m.rows[r][0].content) continue; // an empty Kind goes on with the one above
    let end = r;
    while (m.rows[end + 1] && !m.rows[end + 1][0].content) end++;
    // One cell down the rows of its kind; mergeCells leaves the covered cells in the grid,
    // marked hiddenBy (gotcha: merged-cells-hiddenby). A split never cuts through it.
    m = mergeCells(m, { start: at(r, 0), end: at(end, 0) });
    m = setAlignment(m, at(r, 0), 'center', 'middle');
    m = setCellBackground(m, at(r, 0), col('cream'));
  }
  return m;
}
// The letter on page 1 cites the list, so it floats to the first free slot after the
// letter, page 2, and is cut between rows where the page ends; span 'page' gives it the
// full 157 mm, not a 75 mm column.
const vegetableList = (tsv) => ({ id: 'vegetables', typeId: 'list', kind: 'table',
  caption: '**Vegetable Seeds**', placement: { span: 'page' },
  note: 'A packet holds about 30 tomato or pepper seeds, 40 beans or 12 squash seeds.',
  table: { model: priceList(tsv) }, createdAt: 0, updatedAt: 0 });
// #endregion

// #region split: the list's style says what a continued part prints; the forms have their own
const tableStyle = { bodyFontSize: pt(9), headerFontFamily: LABEL, // body cells in Gelasio
  headerFontSize: pt(7.5), headerColor: col('paper'), headerBackground: col('ink'),
  rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5), cellPadding: mm(1.5),
  // 'split' is the default, written out as the key to change: 'clip' keeps the rows that fit
  // page 2 and drops the rest, 'hide' drops the whole list. Suffix and marker label the parts.
  overflow: 'split', continuedSuffix: '(continued)',
  continuesMarker: 'Continued on the facing page' };
const tableStyles = [{ id: 'form', rules: 'grid', borderRadius: mm(2.5), // a card to write on
  borderColor: col('muted'), borderWidth: pt(0.6), headerBackground: col('basil'),
  bodyFontFamily: LABEL, bodyFontSize: pt(8.5),
  bodyBackgroundEnabled: true, bodyBackground: col('cream'), cellPadding: mm(1.6) }];
// The caption sits above the table on a tomato band and is repeated on every part. Its note
// and the marker take the caption's face, so the caption keeps the body's Gelasio, which has
// the italic the suffix and the marker are set in; Cabin Condensed has none.
const captionStyle = { fontSize: pt(12), color: col('cream'),
  position: 'above', backgroundEnabled: true, background: col('tomato'), padding: mm(2),
  gap: mm(0), note: { fontSize: pt(7.8), color: col('muted') } };
// #endregion

const run = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', ...caps(7.5), color: col('muted'), placement: on('page', edge, x, 12.5),
  ...extra });
const folio = { fontWeight: 700, color: col('ink') };
const header = { elements: [ // folios outside, the booklet's name on the verso, its issue opposite
  run('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, folio),
  run('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 6),
  run('recto-title', '{subtitle}', 'odd', 'top-right', -(MARGIN.outer + 6)),
  run('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer, folio),
] };
const footer = { elements: [{ ...run('drop-folio', '{pageNumber}', 'all', 'bottom', 0, folio),
  pages: 'opener', placement: on('page', 'bottom', 0, -11) }] };

// #region cover: the frontmatter and the heading set the type; the painting fills the middle
const ART = { w: 150, h: 104, y: 60 }; // mm: the cover painting, and its top on the page
const FRAME = 8; // mm: the cover's frame, in from the trim
const AIR = 10; // mm: at least this much between the painting and the letter
const SINK = Math.ceil((ART.y + ART.h + AIR - MARGIN.top) / (LEAD * 25.4 / 72)); // lines
const cover = { id: 'cover', span: 'page', footer: { elements: [] },
  // A style's header replaces the document's on every page of its section, so it carries
  // the running heads too. The frame is drawn there: in the design it would count as
  // reserved height down to the page's foot, more than the column holds, and 1.4.1 then
  // drops the reservation and sets the letter over the painting (gotcha:
  // opener-reserves-anchored).
  header: { elements: [...header.elements, { kind: 'box', id: 'frame', pages: 'opener',
    style: { borderColor: col('basil'), borderWidth: pt(1.2) },
    placement: on('page', 'top-left', FRAME, FRAME,
      { width: mm(TRIM.w - 2 * FRAME), height: mm(TRIM.h - 2 * FRAME) }) }] },
  // The painting is an image, and images do not count towards the height an opener
  // reserves (gotcha: opener-image-no-reserve): minHeight holds the letter under it.
  advancedDesign: { enabled: true, minHeight: pt(SINK * LEAD), slot: { elements: [
    text('publisher', '{title}', on('page', 'top', 0, 17), { ...caps(9.5), color: col('basil') }),
    text('title', '{titleText}', on('page', 'top', 0, 23), { fontFamily: DISPLAY,
      fontSize: pt(58), lineHeight: 1, color: col('tomato') }),
    text('issue', '{subtitle}', on('page', 'top', 0, 49), { ...caps(8.5, 700), color: col('ink'),
      box: { backgroundColor: col('sun'), padding: { top: mm(1.3), bottom: mm(1.1),
        left: mm(4), right: mm(4) } } }),
    { kind: 'image', id: 'art', resourceId: 'cover-art',
      placement: on('page', 'top', 0, ART.y, { width: mm(ART.w) }) },
  ] } },
};
// #endregion

// #region heads: slab-serif section heads over a basil double rule, and the order sheet
const h2 = { level: 2, marginTop: pt(0), marginBottom: pt(0), advancedDesign: { // both open a
  enabled: true, minHeight: pt(2 * LEAD), slot: { elements: [ // column: no space above
    text('title', '{titleText}', on('container', 'top-left', 0, 0), { fontFamily: DISPLAY,
      fontSize: pt(14), lineHeight: 1.1, color: col('tomato') }),
    rule('thick', 'title', 1.4, 1.2), rule('thin', 'thick', 0.7, 0.4),
  ] } } };
const order = { id: 'order', span: 'page', layout: { layoutType: 'single' }, // one wide column
  advancedDesign: { enabled: true, slot: { elements: [
    text('address', '{attr.address}', on('container', 'top-left', 0, 0),
      { ...caps(8), color: col('basil') }),
    text('title', '{titleText}', on('#address', 'below', 0, 1.5), { fontFamily: DISPLAY,
      fontSize: pt(34), lineHeight: 1, color: col('tomato') }),
    rule('thick', 'title', 2.2, 1.6), rule('thin', 'thick', 0.8, 0.5),
    text('how', '{attr.how}', { ...on('#thin', 'below', 0, 3), size: { width: mm(150) } },
      { fontFamily: TEXT, italic: true, fontSize: pt(10.5), lineHeight: 1.35, align: 'left',
        color: col('ink') }),
  ] } } };
// #endregion

const config = () => ({
  colorPalette,
  page: { width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) }, // two 75 mm columns of letter text
  bodyText: { fontFamily: TEXT, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceBold: false, referenceItalic: true,
    firstLineIndent: mm(4), indentAfterHeading: false, // ~48 characters to a 75 mm column, so
    maxWordSpacing: 1.6 }, // a cap under the default 2; Knuth–Plass can exceed it, so reword to fit
  headings: { fontFamily: DISPLAY, fontWeight: 400, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, marginBottom: pt(0) }, h2] },
  headingStyles: [cover, order],
  paragraphStyles: [
    { id: 'signature', textAlign: 'right', firstLineIndent: pt(0) },
    { id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
      textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  chipStyles: [ // a price is a bare chip: the label face, bold, a little larger than the text
    chip('price', 1.12, 'ink', { backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0) }),
    chip('new', 0.8, 'cream', { background: col('tomato'), borderWidth: pt(0) }),
    chip('organic', 0.8, 'basil', { backgroundEnabled: false, borderColor: col('basil'),
      borderWidth: pt(0.6) })],
  resourceTypes: [{ id: 'list', name: 'Price list', shortLabel: 'List', captionPrefix: '',
    numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }], // no prefix: the
  // caption is the list's name alone, with no "Table 1".
  tableStyle, tableStyles, captionStyle, header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the letter, the trial notes and the order sheet
const list = /* @content:list */ ''; // the price list: TSV, as a spreadsheet exports it

// #region forms: the order sheet: empty rows to write in, labels on buff, totals merged
function form(id, widths, rows, merges, note) { // an empty cell still takes a line's height
  let m = { headerRowCount: 1, columnWidths: widths, rows: rows.map((row, r) =>
    widths.map((_, c) => ({ content: row[c] ?? '', isHeader: r === 0 }))) };
  for (const [r, c0, c1] of merges) m = mergeCells(m, { start: at(r, c0), end: at(r, c1) });
  m.rows.forEach((row, r) => row.forEach((cell, c) => { // a label takes the paper's buff
    if (r === 0 || !cell.content || cell.hiddenBy) return;
    m = setCellBackground(m, at(r, c), col('paper'));
    if (cell.colSpan > 1) m = setAlignment(m, at(r, c), 'right'); // the totals' labels
  }));
  return { id, typeId: 'list', kind: 'table', note, placement: { position: 'here' },
    table: { model: m, styleId: 'form' }, createdAt: 0, updatedAt: 0 };
}
const shipTo = form('ship-to', [24, 60, 24, 49], [['Ship to'], ['Name'], ['Street or box'],
  ['Town', '', 'State and ZIP']], [[0, 0, 3], [1, 1, 3], [2, 1, 3]]);
const lines = Array.from({ length: 11 }, () => []); // eleven varieties to a sheet
const orderForm = form('order', [16, 73, 20, 20, 28], [['No.', 'Variety', 'Packets', 'Ounces',
  'Amount'], ...lines, ['Seeds total'], ['Postage: free on orders of $40 or more, otherwise $4.50'],
['**Total enclosed**']], [1, 2, 3].map((k) => [lines.length + k, 0, 3]),
'We guarantee every packet to grow. If a variety fails to come up in your garden, write to '
  + 'us before August 1 and we will send a new packet or refund what you paid for it.');
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  Gelasio: ['400', '400i', '700'], // text, captions, notes and the list
  'Alfa Slab One': ['400'], // display: the cover, section heads, the order sheet
  'Cabin Condensed': ['400', '600', '700'], // labels: heads, prices, chips, the forms
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region pictures: every picture is a resource of its own, a JPEG in assets/ at its pixels
// Nothing cites the pictures, so none is numbered or placed: the cover design and the cells
// draw them by id, and their typeId is never looked up.
const picture = (id, fileId, [w, h], altText) => ({ id, typeId: 'figure', kind: 'bitmap',
  altText, bitmap: { fileId, format: 'jpeg', width: w, height: h }, createdAt: 0, updatedAt: 0 });
const varieties = parseTSV(list).rows.slice(1).map((row) => row[1].content);
const resources = [vegetableList(list), shipTo, orderForm,
  picture('cover-art', 'cover-1500.jpg', [1500, 1040], // the cover's 150 × 104 mm
    'A sunflower and a staked tomato plant in a ploughed field.'),
  ...varieties.map((name) => picture(slug(name), `${slug(name)}-360.jpg`, [360, 480], // 3 : 4
    `Seed packet of ${name}.`))];
await prepareFonts(markdown + list, config(), kitFonts(FONTS));
await Promise.all(resources.flatMap(({ bitmap }) => bitmap
  ? [loadImage(bitmap.fileId, asset(bitmap.fileId))] : []));
// #endregion
const doc = await buildDocumentWithFonts({ markdown, resources }, config(),
  { ...kitFonts(FONTS), text: markdown + list });
showPages(doc, { title: 'Brindlewood Seed Co. · Spring 2027' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
