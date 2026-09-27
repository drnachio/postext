// ═══ Postext Cookbook · Nº 036 · Mail-order catalogue with pictures in cells ═══════
// https://postext.dev/en/cookbook/seed-catalogue
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Gelasio, Alfa Slab One, Cabin Condensed (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// A fictional seed farm's spring list: a table read from TSV, a packet drawn in each row.
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  parseTSV, mergeCells, setAlignment, setCellBackground, setCellContent, setCellImage,
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
const PACKET = 0.55; // the packet drawing's share of its cell's inner width
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
    // The drawing is a resource of its own; the cell sets it at the top, centred, with the
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
// full 157 mm, not a 75 mm column. Only a float splits (gotcha: here-table-no-split).
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

// #region cover: the frontmatter and the heading set the type; the drawing fills the middle
const ART = { w: 150, h: 104, y: 60 }; // mm: the cover drawing, and its top on the page
const FRAME = 8; // mm: the cover's frame, in from the trim
const AIR = 10; // mm: at least this much between the drawing and the letter
const SINK = Math.ceil((ART.y + ART.h + AIR - MARGIN.top) / (LEAD * 25.4 / 72)); // lines
const cover = { id: 'cover', span: 'page', footer: { elements: [] },
  // A style's header replaces the document's on every page of its section, so it carries
  // the running heads too. The frame is drawn there: in the design it would count as
  // reserved height down to the page's foot, more than the column holds, and 1.4.1 then
  // drops the reservation and sets the letter over the drawing (gotcha:
  // opener-reserves-anchored).
  header: { elements: [...header.elements, { kind: 'box', id: 'frame', pages: 'opener',
    style: { borderColor: col('basil'), borderWidth: pt(1.2) },
    placement: on('page', 'top-left', FRAME, FRAME,
      { width: mm(TRIM.w - 2 * FRAME), height: mm(TRIM.h - 2 * FRAME) }) }] },
  // The drawing is an image, and images do not count towards the height an opener
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

const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
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
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Gelasio: ['400', '400i', '700'], // text, captions, notes and the list
  'Alfa Slab One': ['400'], // display: the cover, section heads, the order sheet
  'Cabin Condensed': ['400', '600', '700'], // labels: heads, prices, chips, the forms
};

// #region art: packets and the cover in flat colour with an ink line, from a seeded PRNG
const SCALE = 10; // px per unit of the drawings' boxes: the engine keeps only the ratio
const PACK = [60, 80]; // a packet: 3 : 4
const f = (n) => +n.toFixed(2);
const INK = `stroke="${palette.ink}" stroke-linejoin="round"`;
const HUE = { leaf: '#5d8a2f', vein: '#3f6424', sky: '#dde6dc', soil: '#8e6c47',
  furrow: '#6f5234', purple: '#7a3845', gold: '#f0b43c', squash: '#d9a55a', dusk: '#e4d0a4',
  seed: '#4b2f18', zucchini: '#2e4a2a' };
function mulberry32(seed) { // the same speckles on every run: no Math.random()
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const svg = ([w, h], body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" `
  + `height="${h * SCALE}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const g = (x, y, deg, body) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(deg)})">`
  + `${body}</g>`;
const shape = (d, fill, width) => `<path d="${d}" fill="${fill}" ${INK} `
  + `stroke-width="${f(width)}"/>`;
const stroke = (d, color, width) => `<path d="${d}" fill="none" stroke="${color}" `
  + `stroke-width="${f(width)}" stroke-linecap="round"/>`;
function lobed(cx, cy, w, h, n, bulge) { // an ellipse whose edge swells between n points
  const at2 = (a, k = 1) => `${f(cx + Math.cos(a) * w * k)} ${f(cy + Math.sin(a) * h * k)}`;
  let d = `M${at2(-Math.PI / 2)}`;
  for (let i = 1; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    d += `Q${at2(a - Math.PI / n, bulge)} ${at2(a)}`;
  }
  return `${d}Z`;
}
function outline(len, half, bend = 0) { // a closed shape round an axis that bends by `bend`
  const top = [], bottom = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36, x = t * len, y = bend * t * t, h = half(t);
    top.push(`${f(x)} ${f(y - h)}`);
    bottom.unshift(`${f(x)} ${f(y + h)}`);
  }
  return `M${top.join('L')}L${bottom.join('L')}Z`;
}
function leaf(x, y, len, wid, deg, teeth = 0) { // from its stalk at (x, y); teeth serrate it
  const saw = (t) => (teeth ? 1 - 0.3 * ((t * teeth) % 1) : 1); // a serrated edge
  const half = (t) => wid * Math.sin(Math.PI * t) ** 0.8 * saw(t);
  return g(x, y, deg, shape(outline(len, half), HUE.leaf, wid * 0.1)
    + stroke(`M0 0H${f(len * 0.85)}`, HUE.vein, wid * 0.09));
}
function sprig(x, y, len, deg, teeth = 3) { // a tomato leaf: leaflets in pairs, one at the tip
  const pair = (t, k) => [-1, 1].map((side) => leaf(t * len, 0, len * 0.3 * k, len * 0.1 * k,
    side * 58, teeth)).join('');
  return g(x, y, deg, stroke(`M0 0H${f(len * 0.9)}`, HUE.vein, len * 0.03)
    + pair(0.28, 0.8) + pair(0.52, 0.95) + pair(0.74, 1) + leaf(len * 0.86, 0, len * 0.34,
      len * 0.12, 0, teeth));
}
function squashLeaf(x, y, r) { // five rounded lobes and their veins
  const veins = [0, 1, 2, 3, 4].map((i) => {
    const a = -Math.PI / 2 + (i / 5) * 2 * Math.PI;
    const end = `${f(x + Math.cos(a) * r * 0.8)} ${f(y + Math.sin(a) * r * 0.7)}`;
    return stroke(`M${f(x)} ${f(y)}L${end}`, HUE.vein, r * 0.06);
  }).join('');
  return shape(lobed(x, y, r, r * 0.86, 5, 1.32), HUE.leaf, r * 0.06) + veins;
}
function calyx(x, y, len) { // six sepals splayed over the shoulder, and the stalk
  const sepals = [168, 205, 250, 292, 335, 12].map((deg, i) => {
    const a = (deg * Math.PI) / 180, l = len * (i % 2 ? 0.8 : 1);
    const tx = x + Math.cos(a) * l, ty = y + Math.sin(a) * l * 0.55 + l * 0.12;
    const nx = -Math.sin(a) * l * 0.16, ny = Math.cos(a) * l * 0.16;
    const mx = (x + tx) / 2, my = (y + ty) / 2;
    return `M${f(x)} ${f(y)}Q${f(mx + nx)} ${f(my + ny)} ${f(tx)} ${f(ty)}`
      + `Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)}`;
  });
  return shape(sepals.join(''), HUE.vein, len * 0.05)
    + stroke(`M${f(x)} ${f(y)}q${f(len * 0.1)} ${f(-len * 0.4)} ${f(len * 0.35)} ${f(-len * 0.6)}`,
      HUE.vein, len * 0.22);
}
function tomato(cx, cy, r, { fill = palette.tomato, rib = '#9e2c17', form = 'round',
  shoulder, streak } = {}) {
  const w = r * (form === 'beef' ? 1.22 : 1);
  const h = r * (form === 'beef' ? 0.86 : form === 'heart' ? 1.14 : 0.94);
  const body = form === 'heart'
    ? `M${f(cx)} ${f(cy - h * 0.92)}C${f(cx + w * 1.35)} ${f(cy - h * 1.12)} ${f(cx + w * 0.9)} `
      + `${f(cy + h * 0.6)} ${f(cx)} ${f(cy + h)}C${f(cx - w * 0.9)} ${f(cy + h * 0.6)} `
      + `${f(cx - w * 1.35)} ${f(cy - h * 1.12)} ${f(cx)} ${f(cy - h * 0.92)}Z`
    : lobed(cx, cy, w, h, form === 'beef' ? 7 : 6, form === 'beef' ? 1.09 : 1.04);
  let out = shape(body, fill, r * 0.07);
  if (shoulder) {
    out += `<path d="M${f(cx - w * 0.72)} ${f(cy - h * 0.5)}Q${f(cx)} ${f(cy - h * 1.05)} `
      + `${f(cx + w * 0.72)} ${f(cy - h * 0.5)}Q${f(cx)} ${f(cy - h * 0.62)} ${f(cx - w * 0.72)} `
      + `${f(cy - h * 0.5)}Z" fill="${shoulder}" opacity="0.8"/>`;
  }
  if (streak) {
    out += [-0.45, -0.1, 0.3, 0.6].map((k) => stroke(`M${f(cx + w * k)} ${f(cy + h * 0.8)}`
      + `Q${f(cx + w * k * 1.35)} ${f(cy + h * 0.1)} ${f(cx + w * k * 0.9)} ${f(cy - h * 0.45)}`,
    streak, r * 0.12)).join('');
  }
  out += (form === 'beef' ? [-0.4, 0.4] : [-0.3, 0.3]).map((k) => stroke(`M${f(cx + w * k * 0.4)} `
    + `${f(cy - h * 0.78)}Q${f(cx + w * k * 1.5)} ${f(cy)} ${f(cx + w * k)} ${f(cy + h * 0.8)}`,
  rib, r * 0.05)).join('');
  out += `<ellipse cx="${f(cx - w * 0.45)}" cy="${f(cy - h * 0.25)}" rx="${f(w * 0.15)}" `
    + `ry="${f(h * 0.08)}" transform="rotate(-40 ${f(cx - w * 0.45)} ${f(cy - h * 0.25)})" `
    + 'fill="#ffffff" opacity="0.45"/>';
  return out + calyx(cx, cy - h * (form === 'heart' ? 0.88 : 0.84), r * 0.55);
}
function pod(x, y, len, wid, deg, fill, streak) { // a bean hanging from (x, y), seeds swelling
  const half = (t) => (wid / 2) * Math.sin(Math.PI * Math.min(1, t * 1.04)) ** 0.3
    * (1 + 0.1 * Math.cos(t * Math.PI * 10));
  let body = shape(outline(len, half, len * 0.14), fill, wid * 0.13);
  if (streak) { // violet flecks run along the pod
    body += [[0.12, -0.18], [0.42, 0.15], [0.66, -0.12]].map(([t, k]) => stroke(`M${f(t * len)} `
      + `${f(len * 0.14 * t * t + wid * k)}q${f(len * 0.1)} ${f(len * 0.03)} ${f(len * 0.2)} `
      + `${f(len * 0.06)}`, streak, wid * 0.16)).join('');
  }
  return g(x, y, deg, body + stroke(`M0 0h${f(-wid * 0.9)}`, HUE.vein, wid * 0.35));
}
function beans(fill, streak, flat) { // a trifoliate leaf over three pods hanging from the vine
  const wid = flat ? 4.2 : 3;
  return stroke('M10 35Q20 28 30 31T50 31', HUE.vein, 1.1)
    + leaf(30, 31, 12, 5.2, -150) + leaf(30, 31, 12, 5.2, -30) + leaf(30, 31, 11, 5.5, -90)
    + pod(25, 33, 25, wid, 98, fill, streak) + pod(30, 33, 27, wid, 88, fill, streak)
    + pod(35, 33, 24, wid, 76, fill, streak);
}
function zucchini() { // a fruit lying under two leaves, its flower still on the end
  const rand = mulberry32(401);
  const dots = Array.from({ length: 30 }, () => `<circle cx="${f(-16 + rand() * 32)}" `
    + `cy="${f(-3.5 + rand() * 7)}" r="0.45" fill="#6f8f4f"/>`).join('');
  return squashLeaf(19, 38, 10) + squashLeaf(41, 37, 9)
    + g(28, 50, -10, `<rect x="-19" y="-5.5" width="38" height="11" rx="5.5" `
      + `fill="${HUE.zucchini}" ${INK} stroke-width="0.6"/>${dots}`
      + stroke('M-14 -2.8H12', '#6d8a58', 1) + stroke('M-19 0h-3', HUE.vein, 2.4))
    + shape(lobed(46, 46, 3.6, 3.6, 5, 1.6), palette.sun, 0.5)
    + '<circle cx="46" cy="46" r="1.3" fill="#d9831e"/>';
}
function butternut() { // the bell of a winter squash, stem up
  const d = 'M26 24C26 35 20 37 20 47A10 9.5 0 0 0 40 47C40 37 34 35 34 24Q30 21 26 24Z';
  return squashLeaf(15, 40, 8) + shape(d, HUE.squash, 0.7)
    + stroke('M28 26Q27 38 24 54M32 26Q33 38 36 54', '#b98a45', 0.5)
    + stroke('M30 23.5V19.5', '#6d5a2e', 2.2) + '<ellipse cx="30" cy="53.5" rx="2" ry="1.2" '
    + 'fill="#b98a45"/>';
}
function horns() { // two long frying peppers, their green caps together
  const half = (t) => 2.7 * (1 - t) ** 0.7 + 0.25;
  const horn = (x, y, deg) => g(x, y, deg, shape(outline(33, half, 6), palette.tomato, 0.6)
    + stroke('M3 -1.5Q16 -1.9 29 2', '#e8735a', 0.8)
    + shape('M-1.5 -2.4Q2 -2.8 2.5 0Q2 2.8 -1.5 2.4Z', HUE.vein, 0.4)
    + stroke('M-1.5 0h-3', HUE.vein, 1.6));
  return leaf(29, 32, 12, 4.5, -60) + horn(18, 38, 8) + horn(22, 31, 26);
}
const TOMATO = { brandywine: { fill: '#d4574c', form: 'beef' }, // potato-leaved: smooth leaves
  'cherokee-purple': { fill: HUE.purple, rib: '#4f2029', shoulder: '#6a7a38' },
  'gold-medal': { fill: HUE.gold, rib: '#c98a1f', form: 'beef', streak: palette.tomato },
  'amish-paste': { form: 'heart' } };
const PACKETS = { // each variety's packet: its band colour and what the window shows
  ...Object.fromEntries(Object.entries(TOMATO).map(([id, look]) => [id, { band: palette.tomato,
    art: sprig(26, 30, 15, -150, id === 'brandywine' ? 0 : 3)
      + sprig(34, 30, 15, -30, id === 'brandywine' ? 0 : 3)
      + tomato(30, 44, look.form === 'beef' ? 16 : 15, look) }])),
  'jimmy-nardello': { band: palette.tomato, art: horns() },
  'kentucky-wonder': { band: palette.basil, art: beans('#6f9a36') },
  'dragon-tongue': { band: palette.basil, art: beans('#efd27a', HUE.purple, true) },
  'black-beauty': { band: palette.sun, art: zucchini() },
  'waltham-butternut': { band: palette.sun, art: butternut() },
};
// No lettering on the packet: an SVG drawn as an image cannot use the page's fonts (gotcha:
// svg-no-webfonts), so the variety's name is set in the cell under it.
function packet({ band, art }) { // cream paper, a coloured head and foot, a window on the crop
  return svg(PACK, `<rect x="1" y="1" width="58" height="78" rx="2" fill="${palette.cream}" `
    + `${INK} stroke-width="1"/><rect x="4" y="4" width="52" height="9" fill="${band}"/>`
    + `<path d="M4 15.6H56" stroke="${band}" stroke-width="0.8"/><path d="M7 66V41A23 23 0 0 1 `
    + `53 41V66Z" fill="${HUE.sky}" stroke="${band}" stroke-width="1.6"/><path d="M7.8 58Q30 `
    + `53.5 52.2 58V65.2H7.8Z" fill="${HUE.soil}"/>${art}<rect x="4" y="69" width="52" `
    + `height="7" fill="${band}"/>`);
}
function sunflower(cx, cy, r) { // two rings of petals round a disc of seeds in a spiral
  const rand = mulberry32(1931);
  const petals = (n, len, fill, turn) => Array.from({ length: n }, (_, i) => g(cx, cy,
    (360 * i) / n + turn, shape(`M${f(r * 0.5)} 0Q${f(r * 0.5 + len * 0.5)} ${f(-len * 0.22)} `
      + `${f(r * 0.5 + len)} 0Q${f(r * 0.5 + len * 0.5)} ${f(len * 0.22)} ${f(r * 0.5)} 0Z`,
    fill, 0.35))).join('');
  const seeds = Array.from({ length: 170 }, (_, i) => { // the golden angle, 137.5°
    const a = i * 2.39996, d = Math.sqrt(i) * r * 0.037 + rand() * 0.15;
    return `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r="0.42" `
      + `fill="${i % 3 ? HUE.seed : '#7a5230'}"/>`;
  }).join('');
  return petals(24, r * 0.72, '#d9982a', 7.5) + petals(24, r * 0.78, palette.sun, 0)
    + shape(lobed(cx, cy, r * 0.52, r * 0.52, 12, 1.01), HUE.seed, 0.5) + seeds;
}
function coverArt() { // a sunflower and a truss of tomatoes growing out of a ploughed field
  const [w, h] = [ART.w, ART.h];
  const furrows = [0, 1, 2].map((i) => stroke(`M${28 + i * 6} ${h - 5 + i * 2.2}Q75 `
    + `${h - 15 + i * 2.6} ${122 - i * 6} ${h - 5 + i * 2.2}`, HUE.furrow, 0.6)).join('');
  return svg([w, h], `<circle cx="75" cy="50" r="47" fill="${HUE.dusk}"/>`
    + shape(`M6 ${h}Q75 ${h - 26} 144 ${h}Z`, HUE.soil, 0.6) + furrows
    + stroke(`M50 ${h - 10}Q44 66 51 40`, HUE.vein, 3.2)
    + leaf(47, 74, 24, 9, 200, 6) + leaf(49, 60, 22, 8, -25, 6) + leaf(48, 86, 18, 7, -15, 6)
    + sunflower(51, 37, 26)
    + stroke(`M111 ${h - 10}Q104 76 110 56T107 20`, HUE.vein, 2.6)
    + sprig(110, 86, 22, 200) + sprig(110, 72, 24, -22) + sprig(108, 42, 22, 205)
    + sprig(107, 28, 20, -40) + sprig(107, 21, 12, -95)
    + stroke('M110 52Q124 45 137 49M120 48.5V58M110 75Q104 73 101.5 77', HUE.vein, 1.2)
    + tomato(135, 57, 8) + tomato(100, 83, 6, { fill: '#9dbb52', rib: '#6f8f3a' })
    + tomato(118, 70, 12, { form: 'beef', fill: '#d4574c' }));
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region pictures: every drawing is a resource of its own, registered under its fileId
// Nothing cites the drawings, so none is numbered or placed: the cover design and the cells
// draw them by id, and their typeId is never looked up.
const picture = (id, [w, h], altText) => ({ id, typeId: 'figure', kind: 'svg', altText,
  svg: { fileId: `${id}.svg`, width: w * SCALE, height: h * SCALE }, createdAt: 0, updatedAt: 0 });
const varieties = parseTSV(list).rows.slice(1).map((row) => row[1].content);
const resources = [vegetableList(list), shipTo, orderForm,
  picture('cover-art', [ART.w, ART.h], 'A sunflower and a truss of tomatoes in a ploughed field.'),
  ...varieties.map((name) => picture(slug(name), PACK, `Seed packet of ${name}.`))];
await loadFonts(FONTS, markdown + list);
await loadSvg('cover-art.svg', coverArt()); // the kit's loadSvg calls registerResourceImage
for (const name of varieties) await loadSvg(`${slug(name)}.svg`, packet(PACKETS[slug(name)]));
// #endregion
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()),
  markdown + list);
showPages(doc, { title: 'Brindlewood Seed Co. · Spring 2027' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
