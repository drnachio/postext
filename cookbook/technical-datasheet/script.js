// ═══ Postext Cookbook · Nº 010 · Datasheet: tables from data, merged headers ════════
// https://postext.dev/en/cookbook/technical-datasheet
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Fira Sans, Fira Sans Condensed, Fira Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// The datasheet of a fictional sensor. Postext reads no pipe tables, so the tables are data:
// TSV pasted from a spreadsheet, parsed into table models, then merged, aligned and filled.
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes, parseTSV, mergeCells, setAlignment, setCellBackground,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'technical-datasheet';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // eight named colours; every colour in the config links to one of them
  ink: '#16181d', brand: '#5a2a8a', // text; Pyxis violet: the band, table heads, numbers
  tint: '#eee6f5', zebra: '#f3f4f6', // violet wash for groups and pins; every other row
  hazard: '#f2b705', rule: '#c9ccd3', // maximum ratings and the badge; hairlines
  muted: '#5d636d', paper: '#ffffff', // running heads, notes and units; white
};
// 1.4.1 designs ignore paletteId and read the hex: col() sets both (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // the defaults link to 'main-color', so it is set to the brand violet
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'brand (defaults)', value: { hex: palette.brand, model: 'hex' } },
];

// #region answer: pasted TSV becomes a table: two header rows, merged cells, zebra fills
const at = (row, column) => ({ row, col: column });
const span = (r0, c0, r1, c1) => ({ start: at(r0, c0), end: at(r1, c1) });
const C = { group: 0, param: 1, symbol: 2, conditions: 3, min: 4, max: 6, unit: 7 }; // columns
function electricalTable(tsv) {
  // In 1.4.1 parseTSV makes plain cells and leaves headerRowCount unset: the head is two rows.
  let m = Object.assign(parseTSV(tsv), { headerRowCount: 2,
    columnWidths: [22, 44, 16, 38, 15, 15, 15, 15] }); // weights: mm of the 180 mm measure
  // 'Parameter' covers two columns and two rows; 'Value' spans Min, Typ and Max. mergeCells
  // marks the covered cells hiddenBy, so no column shifts (gotcha: merged-cells-hiddenby).
  for (const range of [span(0, C.group, 1, C.param), span(0, C.symbol, 1, C.symbol),
    span(0, C.conditions, 1, C.conditions), span(0, C.min, 0, C.max),
    span(0, C.unit, 1, C.unit)]) {
    m = mergeCells(m, range); // 'Value' is centred over its three columns, the rest set left
    m = setAlignment(m, range.start, range.start.col === C.min ? 'center' : 'left', 'middle');
  }
  // Min, Typ and Max go right, over their figures; setAlignment clears a vAlign it is not given.
  for (let c = C.min; c <= C.max; c++) m = setAlignment(m, at(1, c), 'right');
  let zebra = false;
  for (let r = m.headerRowCount; r < m.rows.length; r++) {
    const row = m.rows[r];
    if (row[C.param].content) zebra = !zebra; // a parameter keeps one fill over its conditions
    for (let c = 0; c < row.length; c++) {
      // An empty cell continues the one above: a group, or a parameter and its symbol.
      if (c <= C.symbol && row[c].content) {
        let end = r;
        while (m.rows[end + 1] && !m.rows[end + 1][c].content
          && (c === C.group || !m.rows[end + 1][C.param].content)) end++;
        m = mergeCells(m, span(r, c, end, c));
      }
      // Figures flush right, as datasheets set them (no decimal tab: gap tab-stops).
      m = setAlignment(m, at(r, c), c >= C.min && c <= C.max ? 'right' : 'left', 'middle');
      // A table style has no zebra rows, so they are filled cell by cell (gotcha: no-zebra). Each
      // helper returns a new model, cheap at 20 rows; for thousands, set the cell fields directly.
      if (c === C.group) m = setCellBackground(m, at(r, c), col('tint'));
      else if (zebra) m = setCellBackground(m, at(r, c), col('zebra'));
    }
  }
  return m;
}
// #endregion

// #region split: group rows, codes and lists in cells; a table taller than its slot splits
function groupedTable(tsv, columnWidths) {
  let m = Object.assign(parseTSV(tsv), { headerRowCount: 1, columnWidths });
  const codes = [0, 2]; // Pin and Type, Addr. and Reset: short codes, centred, in a bare chip
  // A TSV cell holds no line break: the data writes \n, and a line opening with • is a list.
  m.rows = m.rows.map((row, r) => row.map((cell, c) => ({ ...cell,
    content: r > 0 && row[1].content && codes.includes(c) ? `:chip[${cell.content}]{style="code"}`
      : cell.content.replaceAll('\\n', '\n') })));
  for (let r = 0; r < m.rows.length; r++) {
    const last = m.rows[r].length - 1;
    if (r >= m.headerRowCount && !m.rows[r][1].content) { // a lone first cell heads a group
      m = setCellBackground(mergeCells(m, span(r, 0, r, last)), at(r, 0), col('tint'));
    } else for (const c of codes) m = setAlignment(m, at(r, c), 'center');
  }
  return m; // no split code: the engine cuts it between rows and repeats the head
}
// #endregion

const TRIM = [216, 279]; // mm: US Letter
const MARGIN = { y: 20, x: 18 }; // mm: equal side margins, since a loose sheet has no spine
const LEAD = 13; // pt: the body leading, the baseline grid the headings and the opener keep to
const COND = 'Fira Sans Condensed', MONO = 'Fira Mono'; // the display and the label faces

// #region furniture: the opener band, a running head, and the logo in every footer
const place = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const inset = (edge, y, size) => // a page corner, moved in by the side margin
  place('page', edge, edge.endsWith('left') ? MARGIN.x : -MARGIN.x, y, size);
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement, ...extra });
const caps = (size, weight = 600) => ({ fontWeight: weight, letterSpacing: pt(size * 0.16),
  textTransform: 'uppercase' });
const badge = { ...caps(7.5, 700), box: { backgroundColor: col('hazard'),
  padding: { top: pt(1.6), bottom: pt(1.4), left: pt(4), right: pt(4) } } };
const mark = (size, edge, y) => ({ kind: 'image', id: 'mark', resourceId: 'logo', // by id
  placement: inset(edge, y, { width: mm(size) }) });
const maker = (size, color, y) => text('maker', 'Pyxis Microdevices', COND, size, color,
  place('#mark', 'right-of', size / 4, y), caps(size));
const keyFigure = (n, y) => [ // {attr.k1} over its label {attr.k1l}, flush right on the band
  text(`k${n}`, `{attr.k${n}}`, COND, 22, 'paper', inset('top-right', y), { fontWeight: 600 }),
  text(`k${n}l`, `{attr.k${n}l}`, COND, 7, 'tint', inset('top-right', y + 9), caps(7))];
const BAND = 84; // mm: the violet band across the head of page 1
// The band under the top margin and 9 mm or more of white, in whole grid lines (16 here).
const OPENER_LINES = Math.ceil((BAND - MARGIN.y + 9) / (LEAD * 25.4 / 72));
const opener = {
  enabled: true, minHeight: pt(OPENER_LINES * LEAD), // so the columns under it start on the grid
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('brand') }, placement: {
      anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(BAND) } } },
    mark(6, 'top-left', 12), maker(8.5, 'paper', 1.7),
    text('doc', 'Datasheet {subtitle} · {publishDate}', MONO, 7.5, 'tint',
      inset('top-right', 13.6)),
    text('kicker', '{attr.kicker}', COND, 9.5, 'tint', inset('top-left', 30), caps(9.5)),
    text('title', '{titleText}', COND, 64, 'paper', place('#kicker', 'below', 0, 0.5),
      { fontWeight: 700, lineHeight: 1 }),
    // A design text that overflows its width ends in '…' (gotcha: overflow-ellipsis-default).
    text('lead', '{attr.lead}', 'Fira Sans', 12, 'paper', place('#title', 'below', 0, 2.5,
      { width: mm(108) }), { lineHeight: 1.32, align: 'left', overflow: 'wrap' }),
    text('status', 'Preliminary', COND, 7.5, 'ink', place('#lead', 'below', 0, 4.5), badge),
    ...[1, 2, 3].flatMap((n) => keyFigure(n, 15 + 15 * n)),
  ] },
};
const header = { elements: [ // body pages only: the opener has its band
  text('running-title', '{chapterTitle}', COND, 9, 'brand', inset('top-left', 10.4),
    { fontWeight: 700, pages: 'body' }),
  text('flag', 'Preliminary', COND, 7.5, 'ink', inset('top-right', 10.2),
    { ...badge, pages: 'body' }),
  { kind: 'rule', id: 'hairline', pages: 'body', thickness: pt(0.5), color: col('rule'),
    placement: inset('top-left', 15.5, { width: mm(TRIM[0] - 2 * MARGIN.x) }) },
] };
const footer = { elements: [ // every page: an image element works in a running slot too
  mark(4.5, 'bottom-left', -9), maker(7, 'ink', 1.2),
  text('folio', '{pageNumber}/{totalPages}', COND, 8, 'brand', inset('bottom-right', -9.6),
    { fontWeight: 700 }),
  text('doc', '{subtitle} ·', MONO, 7, 'muted', place('#folio', 'left-of', -1.5, 0.4)),
] };
// #endregion

const config = () => ({
  // Tables and figures count 1, 2, 3 through the document; table captions sit above.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  colorPalette, layout: { layoutType: 'double', gutterWidth: mm(6) },
  page: { width: mm(TRIM[0]), height: mm(TRIM[1]), dpi: 150, margins: { top: mm(MARGIN.y),
    bottom: mm(MARGIN.y), left: mm(MARGIN.x), right: mm(MARGIN.x) } },
  bodyText: { // ragged-right sans with space between paragraphs, as reports are set
    fontFamily: 'Fira Sans', fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    boldFontWeight: 600, boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left',
    referenceColor: col('brand'), firstLineIndent: pt(0), paragraphSpacing: true },
  headings: { fontFamily: COND, color: col('ink'),
    levels: [ // H1 restated: any headings object drops its break (gotcha: headings-drop-h1-break)
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: opener, marginBottom: pt(0) }, // the opener's minHeight sets the gap
      // Margin and line add up to whole grid lines (three, then two), so the grid adds no air.
      { level: 2, fontSize: pt(13), lineHeight: pt(2 * LEAD), color: col('brand'),
        numberingTemplate: '{2}', marginTop: pt(LEAD), marginBottom: pt(0) },
      { level: 3, fontSize: pt(10), lineHeight: pt(LEAD), fontWeight: 600,
        numberingTemplate: '{2}.{3}', marginTop: pt(LEAD), marginBottom: pt(0) },
    ] },
  headingStyles: [{ id: 'lead-in', marginTop: pt(0) }], // under the opener, level with column 2
  unorderedLists: { color: col('brand'), fontWeight: 400, gap: mm(2.4),
    marginTop: pt(0), marginBottom: pt(0), itemSpacing: pt(2) },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted') }],
  chipStyles: [ // the first style is the default: pin names in mono on the violet wash
    { id: 'pin', fontFamily: MONO, fontSize: em(0.88), color: col('brand'),
      background: col('tint'), borderWidth: pt(0), borderRadius: pt(1.2) },
    { id: 'code', fontFamily: MONO, fontSize: em(0.9), color: col('ink'), // bare: a face change
      backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0) },
    ...[['preview', 'hazard', 'ink'], ['planned', 'zebra', 'muted'], ['active', 'brand', 'paper']]
      .map(([id, fill, ink]) => ({ id, fontFamily: COND, bold: true, color: col(ink),
        background: col(fill), borderWidth: pt(0), borderRadius: pt(1.2) })),
  ],
  calloutStyles: [{ id: 'ratings', title: 'Absolute maximum ratings', backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('hazard') }, // no fill
    padding: { top: mm(2.2), right: mm(0), bottom: mm(0), left: mm(0) }, marginTop: pt(2),
    titleStyle: { fontSize: pt(9), ...caps(9, 700), color: col('ink') },
    body: { fontSize: pt(8.5), lineHeight: pt(12) },
    lists: { bulletChar: '–', color: col('muted') } }],
  // #region styles: a house table style, then one named variant per table, stating what differs
  tableStyle: { headerBackground: col('brand'), headerColor: col('paper'), headerFontFamily: COND,
    headerFontSize: pt(8.5), bodyFontSize: pt(8), rules: 'horizontal', borderColor: col('rule'),
    borderWidth: pt(0.5), cellPadding: mm(1.3) },
  tableStyles: [ // a resource picks one with table.styleId
    // White rules cut the fills apart and show where each merge and each group ends.
    { id: 'electrical', borderColor: col('paper'), borderWidth: pt(1.4), cellPadding: mm(1.1) },
    // Written out although it is the default: 'clip' and 'hide' cut a table taller than the page.
    { id: 'grouped', overflow: 'split', continuedSuffix: '(continued)',
      continuesMarker: 'Continued on the next page' },
    // A compact list in the condensed face, boxed by a rounded outer frame.
    { id: 'ordering', headerBackground: col('tint'), headerColor: col('brand'),
      rules: 'outer', borderRadius: mm(1.5), bodyFontFamily: COND },
  ],
  captionStyle: { fontFamily: COND, fontSize: pt(9.5), labelColor: col('brand'), gap: mm(2),
    note: { fontSize: pt(7.5), color: col('muted') } },
  // #endregion
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // reworded so no unit starts a line (gotcha: nbsp-breaks)
const electrical = /* @content:electrical */ ''; // the tables: TSV, pasted from a spreadsheet
const pins = /* @content:pins */ '';
const registers = /* @content:registers */ '';
const ordering = /* @content:ordering */ '';

// #region art: the logo, pinout and circuit at column width, the outline at page width, in mm
const SCALE = 10; // px per mm of the drawings' intrinsic size: the engine keeps only the ratio
// The outline is 48.3 mm tall so that the text above it ends on a whole grid line: the
// closing-page lift (EF-94) then leaves it at the foot, level with the other pages.
const LOGO = [24, 24], PINOUT = [87, 47], CIRCUIT = [87, 56], OUTLINE = [180, 48.3]; // mm
// One size family, in mm at 1:1 (1 mm = 2.83 pt): names 7.4 pt, labels and dimensions 6.8 pt,
// notes 6.2 pt, pin numbers 6 pt; all under the 9.3 pt text and the 9.5 pt captions.
const TEXT = { name: 2.6, label: 2.4, note: 2.2, pin: 2.1 };
const svg = ([w, h], body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" `
  + `height="${h * SCALE}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const label = (x, y, s, { anchor = 'start', color = 'ink', size = TEXT.label } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="${MONO}" text-anchor="${anchor}" `
  + `fill="${palette[color]}">${s}</text>`; // Fira Mono 400, the label face
const logo = svg(LOGO, `<circle cx="12" cy="12" r="12" fill="${palette.brand}"/><path fill="`
  + `${palette.paper}" d="M12 3 14 10 21 12 14 14 12 21 10 14 3 12 10 10Z"/>`); // a compass star
function pinout() { // the DFN-8 from above: pins 1 to 4 down the left, 5 to 8 back up the right
  const [cx, cy] = [PINOUT[0] / 2, PINOUT[1] / 2];
  const [bw, bh, pitch] = [36, 46, 9.4]; // body and pin pitch: a diagram, not to scale
  const [left, right] = [cx - bw / 2, cx + bw / 2];
  const pins = ['SDA', 'SCL', 'ALERT', 'GND', 'A0', 'A1', 'A2', 'VDD'].map((name, i) => {
    const onLeft = i < 4;
    const y = cy + ((onLeft ? i : 7 - i) - 1.5) * pitch;
    return `<rect x="${(onLeft ? left : right) - 2.4}" y="${y - 1.5}" width="4.8" height="3" `
      + `rx="0.5" fill="${palette.brand}"/>${onLeft
        ? label(left - 4.2, y + 0.95, `${name} ${i + 1}`, { anchor: 'end', size: TEXT.name })
        : label(right + 4.2, y + 0.95, `${i + 1} ${name}`, { size: TEXT.name })}`;
  });
  // The exposed pad is under the package: from above, a hidden outline, dashed.
  return svg(PINOUT, `<rect x="${left}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="1.6" `
    + `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="0.45"/><rect x="${cx - 9}" `
    + `y="${cy - 12.5}" width="18" height="25" rx="0.6" fill="none" stroke="${palette.brand}" `
    + `stroke-width="0.35" stroke-dasharray="1.4 0.9"/><circle cx="${left + 4}" `
    + `cy="${cy - bh / 2 + 4}" r="1.3" fill="${palette.ink}"/>${pins.join('')}`
    + label(cx, cy + 0.95, 'EP', { anchor: 'middle', color: 'brand', size: TEXT.name }));
}
function circuit() { // the typical application: one capacitor, three pull-ups, address 48h
  const wire = (d, w = 0.3) => `<path d="${d}" fill="none" stroke="${palette.ink}" `
    + `stroke-width="${w}"/>`;
  const dots = (...xy) => xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.6" `
    + `fill="${palette.ink}"/>`).join('');
  const box = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.8" `
    + `fill="${palette[fill]}" stroke="${palette.ink}" stroke-width="0.35"/>`;
  const small = { size: TEXT.note }, pin = { size: TEXT.pin, color: 'muted', anchor: 'middle' };
  const pullUps = [[59, 23], [63, 28], [67, 33]].map(([x, y]) => wire(`M${x} 6V10M${x} 15.5V${y}`)
    + `<rect x="${x - 0.8}" y="10" width="1.6" height="5.5" fill="${palette.paper}" `
    + `stroke="${palette.ink}" stroke-width="0.3"/>${dots([x, 6], [x, y])}`);
  const lines = [['SDA', 'SDA', 23, 1], ['SCL', 'SCL', 28, 2], ['ALERT', 'INT', 33, 3]]
    .map(([from, to, y, n]) => wire(`M55 ${y}H71`) + label(53.6, y + 0.8, from,
      { ...small, anchor: 'end' }) + label(72.4, y + 0.8, to, small) + label(57, y - 0.7, n, pin));
  const address = ['A0', 'A1', 'A2'].map((name, i) => wire(`M29 ${24 + 5 * i}H25`)
    + label(30.4, 24.8 + 5 * i, name, small) + label(27, 23.3 + 5 * i, 5 + i, pin));
  const g = CIRCUIT[1] - 5; // the ground rail
  return svg(CIRCUIT, wire(`M6 6H78.5V17M6 ${g}H78.5V41M12 6V27.6M12 29.6V${g}M42 6V16M42 44V${g}`
    + `M25 24V${g}`) + wire('M9.4 27.6H14.6M9.4 29.6H14.6', 0.55)
    + dots([12, 6], [12, g], [42, 6], [42, g], [25, 29], [25, 34], [25, g])
    + box(29, 16, 26, 28, 'tint') + box(71, 17, 15, 24, 'paper') + pullUps.join('')
    + lines.join('') + address.join('')
    + label(6, 4.2, 'VDD, 1.6 V to 5.5 V') + label(6, g + 3.6, 'GND')
    + label(8.4, 29.4, '100 nF', { ...small, color: 'muted', anchor: 'end' }) // left of the cap
    + label(68.8, 13.6, '4.7k', { ...small, color: 'muted' })
    + label(29, 14.3, 'PX-7021', { size: TEXT.name, color: 'brand' })
    + label(42, 19.8, 'VDD', { ...small, anchor: 'middle' }) + label(43.2, 14.4, 8, pin)
    + label(42, 42.2, 'GND', { ...small, anchor: 'middle' }) + label(43.2, 48.4, 4, pin)
    + label(27, g - 2.6, 'address 48h', { size: TEXT.pin, color: 'muted' })
    + label(78.5, 38.6, 'MCU', { size: TEXT.name, color: 'brand', anchor: 'middle' }));
}
function outline() { // the DFN-8 at 15:1, four views in a row: top, bottom, side, land pattern
  const ink = (d, w = 0.15) => `<path d="${d}" fill="none" stroke="${palette.ink}" `
    + `stroke-width="${w}"/>`;
  const fill = (d, color) => `<path d="${d}" fill="${palette[color]}"/>`;
  const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" `
    + `height="${h}" fill="${palette[color]}"${extra}/>`;
  const body = (x, y, w, h) => rect(x, y, w, h, 'paper',
    ` rx="0.6" stroke="${palette.ink}" stroke-width="0.35"`);
  const dim = { anchor: 'middle' };
  const caption = { size: TEXT.note, color: 'muted', anchor: 'middle' };
  const hDim = (x1, x2, y, s) => ink(`M${x1} ${y}H${x2}`) + fill(`M${x1} ${y}l1.3 -0.45v0.9z`
    + `M${x2} ${y}l-1.3 -0.45v0.9z`, 'ink') + label((x1 + x2) / 2, y - 0.9, s, dim);
  const vDim = (x, y1, y2) => ink(`M${x} ${y1}V${y2}`) + fill(`M${x} ${y1}l-0.45 1.3h0.9z`
    + `M${x} ${y2}l-0.45 -1.3h0.9z`, 'ink');
  const cy = 23, rows = [-11.25, -3.75, 3.75, 11.25].map((d) => cy + d); // 0.5 mm pitch
  const pads = (xs, w) => rows.map((y) => xs.map((x) => rect(x, y - 1.875, w, 3.75, 'brand'))
    .join('')).join('');
  const [t, b, s, l] = [4, 50, 94, 140]; // the left edge of each view
  const top = body(t, 8, 30, 30) + `<circle cx="${t + 3.6}" cy="11.6" r="1" fill="${palette.ink}"/>`
    + label(t + 15, 24, '7021', { size: 3.2, anchor: 'middle' }) // the marking, not a label
    + label(t + 15, 29, 'YWWL', { ...caption, size: TEXT.label })
    + ink(`M${t} 7.2V3.2M${t + 30} 7.2V3.2`)
    + hDim(t, t + 30, 4, '2.00') + label(t + 15, 45, 'TOP · MARKING', caption);
  const bottom = body(b, 8, 30, 30) + pads([b, b + 25.5], 4.5) + rect(b + 9, 11.75, 12, 22.5,
    'tint', ` rx="0.4" stroke="${palette.brand}" stroke-width="0.3"`) + label(b + 15, 24, 'EP', dim)
    + ink(`M${b - 0.6} 11.75H${b - 3.7}M${b - 0.6} 19.25H${b - 3.7}`) + vDim(b - 2.8, 11.75, 19.25)
    + label(b - 4.2, 16.4, '0.50', { ...dim, anchor: 'end' }) + label(b + 31.6, 13, 1, caption)
    + label(b + 15, 45, 'BOTTOM · EP 0.80 × 1.50', caption);
  const side = body(s, cy - 4, 30, 8.25) + rect(s, cy + 3.7, 4.5, 0.55, 'brand')
    + rect(s + 25.5, cy + 3.7, 4.5, 0.55, 'brand')
    + ink(`M${s + 30.6} ${cy - 4}H${s + 34.3}M${s + 30.6} ${cy + 4.25}H${s + 34.3}`)
    + vDim(s + 33.5, cy - 4, cy + 4.25)
    + label(s + 35.2, cy + 1, '0.55', { ...dim, anchor: 'start' })
    + label(s + 15, 45, 'SIDE', caption);
  const land = rect(l + 4.5, 8, 30, 30, 'paper', ` fill-opacity="0" stroke="${palette.muted}" `
    + 'stroke-width="0.2" stroke-dasharray="1 0.8"') + pads([l, l + 28.5], 10.5)
    + rect(l + 13.5, cy - 11.25, 12, 22.5, 'brand') + [cy - 5.5, cy + 5.5].map((y) =>
      `<circle cx="${l + 19.5}" cy="${y}" r="2.25" fill="${palette.paper}"/>`).join('') // vias
    + ink(`M${l} 9.3V3.2M${l + 39} 9.3V3.2`) + hDim(l, l + 39, 4, '2.60')
    + label(l + 19.5, 45, 'LAND PATTERN · 0.25 × 0.70', caption);
  return svg(OUTLINE, top + bottom + side + land);
}
// #endregion

// #region resources: each drawing and table is a resource; the floats go where they are cited
const svgResource = (id, caption, altText, [w, h], placement) => ({ id, typeId: 'figure',
  kind: 'svg', caption, altText, placement, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: w * SCALE, height: h * SCALE } }); // fitted to its slot
const table = (id, caption, model, { styleId, placement, note } = {}) => ({ id, typeId: 'table',
  kind: 'table', caption, note, placement, table: { model, styleId }, createdAt: 0, updatedAt: 0 });
// A float takes the first free slot after its first :ref; the logo is never cited, only drawn.
const resources = [
  svgResource('logo', '', 'Pyxis Microdevices', LOGO),
  svgResource('pinout', 'Pin configuration, 8-pin DFN, top view.', 'The package from above: '
    + 'pins 1 to 4 down the left side, 5 to 8 up the right.', PINOUT),
  svgResource('circuit', 'Typical application, bus address 48h.', 'The sensor with a 100 nF '
    + 'capacitor, address pins to ground, and SDA, SCL and ALERT pulled up to a host.', CIRCUIT),
  svgResource('outline', 'Package outline and land pattern, 8-pin DFN, in mm.', 'Top, bottom '
    + 'and side views of the 2 × 2 mm body, and the land pattern with its two vias.', OUTLINE,
  { position: 'bottom', span: 'page' }), // a strip across the foot of a page
  table('electrical', 'Electrical characteristics, *V*~DD~ = 1.6 V to 5.5 V and *T*~A~ = −40 °C '
    + 'to 125 °C unless noted', electricalTable(electrical), { styleId: 'electrical',
    placement: { position: 'top', span: 'page' }, note: 'Typical values at 3.3 V and 25 °C. '
      + '^1^ Tested at 25 °C and 50 °C, the rest by characterization. ^2^ Characterized, not '
      + 'tested in production. ^3^ One conversion a second, bus idle.' }),
  // No placement: these float to the first free slot after their reference and split there.
  table('pins', 'Pin functions', groupedTable(pins, [9, 16, 10, 52]), { styleId: 'grouped',
    note: 'Types: P power, G ground, I input, O open-drain output, I/O open-drain input and '
      + 'output.' }),
  table('registers', 'Register map', groupedTable(registers, [9, 17, 11, 50]), {
    styleId: 'grouped', note: 'Reset values apply at power-on and after a general-call reset.' }),
  table('ordering', 'Order codes', Object.assign(parseTSV(ordering), { headerRowCount: 1,
    columnWidths: [23, 29, 18, 17] }), { styleId: 'ordering',
    note: 'WLCSP-4: fixed address 48h, no ALERT output.' }),
];
// #endregion

// #region drawing: the drawings' labels stay text, in the document's own label face
// An SVG drawn as an image cannot use the page's fonts (gotcha: svg-no-webfonts): the PDF sets
// its labels as real text in the faces it embeds; the canvas copy embeds the face itself.
async function fontFace(family) { // the same TTF the PDF embeds, from the pdf kit block
  const ttf = await fontsourceProvider(family, 400, 'normal');
  const base64 = btoa(Array.from(ttf, (b) => String.fromCharCode(b)).join(''));
  return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${base64})}`;
}
async function loadDrawing(fileId, markup, face) {
  await loadSvg(fileId, markup); // registers the plain SVG and keeps its bytes for the PDF
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    markup.replace(/<svg[^>]*>/, (tag) => `${tag}<style>${face}</style>`))}`;
  await img.decode();
  registerResourceImage(fileId, img); // replaces the canvas copy only
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build
  'Fira Sans': ['400', '400i', '600', '600i'], // text; 600 is the bold
  'Fira Sans Condensed': ['400', '400i', '600', '700'], // display: title, heads, captions
  'Fira Mono': ['400'], // labels: pin names, codes, document number, the drawings' labels
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = [markdown, electrical, pins, registers, ordering].join('\n'); // all it prints
await prepareFonts(allText, config(), kitFonts(FONTS));
await loadSvg('logo.svg', logo);
const drawings = { pinout: pinout(), circuit: circuit(), outline: outline() }; // by resource id
const face = await fontFace(MONO); // fetched once for the three drawings
for (const [id, markup] of Object.entries(drawings)) await loadDrawing(`${id}.svg`, markup, face);
const doc = await buildDocumentWithFonts({ markdown, resources }, config(),
  { ...kitFonts(FONTS), text: allText });
showPages(doc, { title: 'PX-7021 datasheet' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // the same faces; the drawings stay vectors with real text

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
