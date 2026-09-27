// ═══ Postext Cookbook · Nº 052 · Bistro menu: prices aligned without tab stops ═══════
// https://postext.dev/en/cookbook/bistro-menu
// Code: MIT · Text: original, in French (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Limelight, Noticia Text, Josefin Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// The autumn menu of an imaginary Paris bistro: two sides of one card, every price column a
// table with its rules switched off.
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  parseTSV, mergeCells } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'bistro-menu';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1f2a24', paper: '#f6efdf', // green-black text on cream card
  wine: '#6d1f2c', brass: '#a9823a', // the name, heads and labels; rules and the drawings' metal
  straw: '#e8d4a8', bottle: '#2f4235', sage: '#8a9a78', // awning stripes and labels; glass
  muted: '#6b6457' }; // the colophon
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color' (#295aa3, a blue); this palette makes it the wine red.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.wine })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Noticia Text', 'Limelight', 'Josefin Sans'];
const [BODY, LEAD] = [10.5, 14.5]; // pt: the text, and the leading every table row keeps

// #region answer: dish on the left, price flush right: a two-column table with no rules
// Postext has no tab stops, so each course is a table. The document's tableStyle turns off
// every rule and fill, so nothing on the page shows that a table is there. The wine list's head
// row and merged region rows are in #region wines.
const tableStyle = { rules: 'none', cellPadding: pt(LEAD / 4), // a dish: 2½ lines of LEAD
  bodyFontFamily: TEXT, bodyFontSize: pt(BODY), bodyColor: col('ink'),
  headerFontFamily: LABEL, headerFontSize: pt(8.5), headerColor: col('wine'),
  headerBackgroundEnabled: false }; // header cells: the wine list's labels
// The kitchen keeps the menu as TSV: course · dish · the dish in the reader's language · price.
function course(id, tsv) {
  const rows = parseTSV(tsv).rows.filter(([c]) => c.content === id)
    .map(([, dish, translation, price]) => [
      { content: `${dish.content}\n*${translation.content}*` }, // one cell, two lines
      // Both cells start at the top of the row, so the price shares the dish's first baseline.
      { content: `**${price.content}**`, align: 'right' },
    ]);
  // columnWidths are weights: the price column takes 1/7 of the 158 mm measure, 22.6 mm.
  return piece(id, 'table', { table: { model: { rows, columnWidths: [6, 1] } } });
}
// #endregion

// #region type: one resource type for the whole card: set where it stands, never numbered
// No caption prefix and no caption, so no 'Table 1' line prints under a course. Placement
// 'here' sets each piece at its ::resource line; such a table never splits, so a course that
// outgrows the page moves to the next one whole (gotcha: here-table-no-split).
const resourceTypes = [{ id: 'menu', name: 'Menu', shortLabel: 'Menu', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here' } }];
const piece = (id, kind, body) => ({ id, typeId: 'menu', kind, createdAt: 0, updatedAt: 0,
  ...body });
// #endregion

// #region wines: region rows merged across the three columns, prices under their labels
function wineList(tsv) {
  let m = { ...parseTSV(tsv), headerRowCount: 1, columnWidths: [5, 1, 1] };
  m.rows = m.rows.map((row, r) => row.map((cell, c) => (c === 0 ? cell : { align: 'right',
    content: r > 0 && cell.content ? `**${cell.content}**` : cell.content }))); // as the dishes'
  m.rows.forEach(([first, ...rest], r) => { // a line with one field names a region
    if (r === 0 || !first.content || rest.some((cell) => cell.content)) return;
    // One cell across the table, centred on the card like the course heads; a label centred
    // in the first column alone would sit 22.6 mm left of them. The label face is the header's.
    m.rows[r][0] = { ...first, isHeader: true, align: 'center' };
    // mergeCells marks the two cells it covers hiddenBy (gotcha: merged-cells-hiddenby).
    m = mergeCells(m, { start: { row: r, col: 0 }, end: { row: r, col: 2 } });
  });
  return piece('wines', 'table', { table: { model: m } });
}
// #endregion

// #region heads: a course head: its title centred, a brass rule anchored to each side of it
// The title has no width, so it shrink-wraps its text, and 'top' centres it on the column. Each
// rule hangs off one edge of the title ('left-of', 'right-of'), 4 mm away, and 'fill' runs it
// to the column's edge: 66.7 mm beside PLATS, 56.2 mm beside the longer LE COMPTOIR.
const rule = (edge, x) => ({ kind: 'rule', id: `rule-${edge}`, color: col('brass'),
  thickness: pt(0.75), // required in 1.4.1: a rule without it paints nothing
  placement: { anchor: { to: '#title', edge },
    size: { width: 'fill' }, // to the column's edge
    offset: { x: mm(x), y: pt(6) } } }); // 6 pt down: the middle of Limelight's capitals
const courseHead = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(15),
    lineHeight: 0.96, // a multiple (gotcha: design-lineheight-multiple): 14.4 pt, one line
    textTransform: 'uppercase', color: col('wine'),
    placement: { anchor: { to: 'container', edge: 'top' } } },
  rule('left-of', -4), rule('right-of', 4),
] } };
// #endregion

// #region badges: dietary badges as chips, explained in small type under the desserts
// A chip is a box around inline text: the V disc is filled, the SG pill only outlined. A chip
// takes the weight of the text around it, so without bold the V is set in 400, a weight not loaded.
const badge = { fontFamily: LABEL, fontSize: pt(7.5), bold: true, // Josefin Sans 700
  borderRadius: pt(8), paddingY: em(0.1), gap: em(0.6) }; // radius clamped to a half-height
const chipStyles = [
  // V: paddingX makes the box as wide as it is tall, a disc. borderWidth 0 removes the default
  // outline, 0.5 pt of main-color, which would ring the green in wine red.
  { id: 'veg', name: 'Vegetarian', ...badge, paddingX: em(0.3), borderWidth: pt(0),
    background: col('bottle'), color: col('paper') },
  { id: 'gf', name: 'Gluten-free', ...badge, paddingX: em(0.45), backgroundEnabled: false,
    borderColor: col('bottle'), borderWidth: pt(0.6), color: col('bottle') },
];
// The notes under the desserts and the colophon on the back: smaller, on the card's axis.
// marginTop gives the line of air that a table set 'here' does not leave below itself.
const paragraphStyles = [
  { id: 'notes', name: 'Notes', fontSize: pt(9), marginTop: pt(LEAD) },
  { id: 'colophon', name: 'Colophon', fontSize: pt(7.5), color: col('muted'),
    marginTop: pt(LEAD) },
];
// #endregion

// #region centred: one axis for the card: the name, the course heads and the notes centred
// bodyText (in config) centres the lines under the name and the notes; only the tables keep a
// left edge. A centred line is never hyphenated (gotcha: ragged-no-hyphenation), so the config
// sets no locale: French patterns would change nothing on this card.
const headings = { fontFamily: DISPLAY, fontWeight: 400, color: col('wine'), textAlign: 'center',
  levels: [ // Limelight ships one weight, 400, and no italic
    // Any headings object drops the H1 break (gotcha: headings-drop-h1-break). Stated off, since
    // a break before an H1 would part the name from the awning and La Cave from its bottles.
    { level: 1, fontSize: pt(48), lineHeight: pt(3 * LEAD), breakBefore: { enabled: false },
      marginTop: pt(LEAD), marginBottom: pt(0) }, // three grid lines, one of air above
    { level: 2, lineHeight: pt(LEAD), advancedDesign: courseHead, // one line; #region heads
      marginTop: pt(LEAD), marginBottom: pt(0) }, // the table below adds a line of its own
  ] };
// #endregion

// #region art: a striped awning over the name, a shelf of bottles over the wine list
function awning() { // 158 × 20 mm; the canopy narrows 6 % toward the wall
  const [W, N, ROD, DROP, HEM, INSET] = [1660, 19, 12, 104, 46, 50];
  const s = W / N, top = (i) => INSET + i * (W - 2 * INSET) / N, bottom = (i) => i * s;
  const shade = { [palette.wine]: mix(palette.wine, palette.ink, 0.25), // the valance: each
    [palette.straw]: mix(palette.straw, palette.brass, 0.4) }; // stripe a shade darker
  let shapes = '';
  for (let i = 0; i < N; i++) {
    const fill = i % 2 ? palette.straw : palette.wine, y = ROD + DROP;
    shapes += `<path d="M${top(i)} ${ROD}H${top(i + 1)}L${bottom(i + 1)} ${y}H${bottom(i)}Z" `
      + `fill="${fill}"/><path d="M${bottom(i)} ${y}h${s}v${HEM}a${s / 2} ${s / 2} 0 0 1 `
      + `${-s} 0Z" fill="${shade[fill]}"/>`;
  }
  shapes += `<rect x="${INSET - 16}" y="0" width="${W - 2 * INSET + 32}" height="${ROD}" rx="6" `
    + `fill="${palette.brass}"/><rect x="0" y="${ROD + DROP - 3}" width="${W}" height="6" `
    + `fill="${palette.brass}"/>`; // the rod on the wall, a brass bead along the front edge
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 212" width="${W}" `
    + `height="212">${shapes}</svg>`;
}
function mix(a, b, t) { // a blend of two palette colours, t of the way from a to b
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}
function bottles() { // 158 × 29 mm: glasses, bottles and a carafe on a brass shelf
  const [W, H, BASE] = [1660, 300, 286];
  const glass = (x) => // a tulip glass, a third full
    `<path d="M${x - 34} ${BASE - 170}C${x - 36} ${BASE - 110} ${x - 20} ${BASE - 88} ${x} `
      + `${BASE - 86}C${x + 20} ${BASE - 88} ${x + 36} ${BASE - 110} ${x + 34} ${BASE - 170}Z" `
      + `fill="none" stroke="${palette.bottle}" stroke-width="4"/>`
      + `<path d="M${x - 33} ${BASE - 132}C${x - 30} ${BASE - 104} ${x - 16} ${BASE - 91} ${x} `
      + `${BASE - 90}C${x + 16} ${BASE - 91} ${x + 30} ${BASE - 104} ${x + 33} ${BASE - 132}Z" `
      + `fill="${palette.wine}"/>`
      + `<rect x="${x - 2.5}" y="${BASE - 88}" width="5" height="82" fill="${palette.bottle}"/>`
      + `<ellipse cx="${x}" cy="${BASE - 5}" rx="30" ry="5" fill="${palette.bottle}"/>`;
  const bottle = (x, h, w, shoulder, body, foil) => { // straight or sloping shoulders
    const neck = 13, top = BASE - h, sh = BASE - h * 0.62;
    return `<path d="M${x - w} ${BASE}V${sh}C${x - w} ${sh - shoulder} `
      + `${x - neck} ${sh - shoulder} ${x - neck} ${sh - shoulder * 1.6}`
      + `V${top + 6}Q${x - neck} ${top} ${x - neck + 6} ${top}`
      + `H${x + neck - 6}Q${x + neck} ${top} ${x + neck} ${top + 6}V${sh - shoulder * 1.6}`
      + `C${x + neck} ${sh - shoulder} ${x + w} ${sh - shoulder} ${x + w} ${sh}V${BASE}Z" `
      + `fill="${body}"/>`
      + `<rect x="${x - neck - 1}" y="${top}" width="${2 * neck + 2}" height="${h * 0.16}" `
      + `rx="4" fill="${foil}"/>`
      + `<rect x="${x - w + 8}" y="${BASE - h * 0.44}" width="${2 * w - 16}" height="${h * 0.26}" `
      + `fill="${palette.straw}"/>`
      + `<rect x="${x - w + 8}" y="${BASE - h * 0.3}" width="${2 * w - 16}" height="6" `
      + `fill="${foil}"/>`;
  };
  const carafe = (x) => `<path d="M${x - 16} ${BASE - 200}H${x + 16}V${BASE - 150}`
    + `C${x + 70} ${BASE - 120} ${x + 76} ${BASE - 20} ${x + 44} ${BASE}H${x - 44}`
    + `C${x - 76} ${BASE - 20} ${x - 70} ${BASE - 120} ${x - 16} ${BASE - 150}Z" fill="none" `
    + `stroke="${palette.bottle}" stroke-width="4"/>`
    + `<path d="M${x - 64} ${BASE - 74}C${x - 70} ${BASE - 30} ${x - 58} ${BASE - 8} ${x - 42} `
    + `${BASE - 4}H${x + 42}C${x + 58} ${BASE - 8} ${x + 70} ${BASE - 30} ${x + 64} ${BASE - 74}Z" `
    + `fill="${palette.wine}"/>`;
  const C = W / 2;
  const art = glass(C - 330) + bottle(C - 225, 250, 38, 12, palette.bottle, palette.wine)
    + bottle(C - 125, 262, 42, 34, palette.sage, palette.brass) + carafe(C)
    + bottle(C + 125, 256, 44, 36, palette.bottle, palette.brass)
    + bottle(C + 225, 250, 38, 12, palette.bottle, palette.wine) + glass(C + 330)
    + `<rect x="${C - 420}" y="${BASE}" width="840" height="6" fill="${palette.brass}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" `
    + `height="${H}">${art}</svg>`;
}
// #endregion

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  colorPalette, tableStyle, resourceTypes,
  page: { sizePreset: 'custom', width: mm(230), height: mm(310), dpi: 150,
    backgroundColor: col('paper'), // one card, printed both sides: margins are not mirrored
    margins: { top: mm(22), bottom: mm(20), left: mm(36), right: mm(36) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), // both default to main-color, the wine red
    textAlign: 'center', firstLineIndent: mm(0) }, // the lines under the name and the notes
  headings, // the card's axis (#region centred)
  chipStyles, paragraphStyles, // the badges and the small print (#region badges)
  header: { elements: [] }, footer: { elements: [] }, // a menu has no running heads or folios
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the two sides of the card, in French
const dishes = /* @content:carte */ ''; // TSV: course · dish · translation · price
const wines = /* @content:cave */ ''; // TSV: head row, regions, wines; one file for both editions
const resources = [
  piece('awning', 'svg', { svg: { fileId: 'awning.svg', width: 1660, height: 212 },
    altText: 'A striped wine-red and straw awning on a brass rod.' }),
  piece('bottles', 'svg', { svg: { fileId: 'bottles.svg', width: 1660, height: 300 },
    altText: 'Two glasses of red wine, four bottles and a carafe on a brass shelf.' }),
  course('entrees', dishes), course('plats', dishes), course('desserts', dishes),
  wineList(wines), course('counter', dishes),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint, loaded before the first build (gotcha: fonts-first).
const FONTS = { 'Noticia Text': ['400', '400i', '700'], Limelight: ['400'],
  'Josefin Sans': ['700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = markdown + dishes + wines;
await loadFonts(FONTS, allText);
await loadSvg('awning.svg', awning());
await loadSvg('bottles.svg', bottles());
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), allText);
showPages(doc, { title: t({ en: 'Les Tanneurs: autumn menu',
  es: 'Les Tanneurs: carta de otoño' }) });

// @kit
