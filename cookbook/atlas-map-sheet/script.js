// ═══ Postext Cookbook · Nº 067 · Atlas sheet: numbered maps and a rotated overview ═════
// https://postext.dev/en/cookbook/atlas-map-sheet
// Code: MIT · Text: original (CC BY 4.0) · Maps: generated in code from seed 1874 (CC BY 4.0)
// Fonts: Marcellus, Alegreya Sans, Alegreya Sans SC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
  setAlignment,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'atlas-map-sheet';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the page's colours and the maps' tints, one object for both
const palette = {
  ink: '#23282b', paper: '#fbfaf6', // a blue-black on a warm white
  band: '#1f4a5c', // the accent: opener band, caption bars, table head, references
  road: '#b2432f', // the second colour: roads, lights and the place numbers
  muted: '#626a6d', rule: '#c8c2b4', // running heads and notes; hairlines
  deep: '#8fb9c6', sea: '#cfe3e8', // the maps' water: over and under 20 m
  land: '#efe6cf', hill1: '#d9c9a3', hill2: '#bfa97a', forest: '#7f9b6a', // and their land
};
// col(id) links a colour to its palette entry; the drawings read the same hex from `palette`.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.band }) // the defaults' id
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Alegreya Sans', 'Marcellus', 'Alegreya Sans SC'];
const PAGE = { w: 230, h: 300, top: 22, bottom: 22, inner: 18, outer: 16 }; // mm, mirrored
const LEAD = 13.5; // pt: the body's leading and baseline grid
const PT = 25.4 / 72; // mm in a point

// #region answer: a Map type captioned on a bar above the drawing, and where each map goes
// Every caption stands above its drawing or table, in the label face. Maps count 1, 2, 3…
// through the atlas as a type of their own and set their caption on a bar in the band colour.
const captionStyle = { fontFamily: LABEL, fontSize: pt(9), labelColor: col('band'),
  position: 'above', gap: mm(1.6), note: { fontSize: pt(7.8), color: col('muted') } };
const MAP_WORD = t({ en: 'Map', es: 'Mapa' });
const mapType = { id: 'map', name: MAP_WORD, shortLabel: MAP_WORD, captionPrefix: MAP_WORD,
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  captionStyle: { backgroundEnabled: true, background: col('band'), color: col('paper'),
    labelColor: col('paper'), padding: mm(1.4) } }; // the bar only; the rest is captionStyle's
// Each map floats from its first :ref to the first slot its placement allows.
const PLACEMENT = {
  relief: { position: 'bottom', span: 'page' }, // the foot of the page that cites it
  north: { position: 'top' }, // the head of the next free column
  harbour: { position: 'top' },
  chart: { rotate: 'ccw' }, // turned a quarter, top to the left, on a page of its own
};
// Drawing sizes in mm. Turned, the chart is laid out along 247.6 mm, the text area's 53 grid
// lines less one for the float gap; the bar and the note leave 182.2 mm of the 196 mm measure.
const MAP = { relief: [196, 136], north: [95, 88], harbour: [95, 88], chart: [247.6, 182.2] };
// #endregion

// #region legend: the tints of the maps, and a key of swatches drawn from the same ids
// The bands the maps are filled with, lowest first. Art and key share each palette id, so one hex
// changes both; the unit is spelled out once, since the small caps print an m as an M.
const RELIEF = [
  { id: 'deep', en: 'sea over 20', es: 'mar de más de 20' },
  { id: 'sea', from: -20, en: 'sea under 20', es: 'de menos de 20' },
  { id: 'land', from: 0, en: 'land to 50', es: 'tierra hasta 50' },
  { id: 'hill1', from: 50, en: '50–120', es: '50–120' },
  { id: 'hill2', from: 120, en: 'over 120', es: 'más de 120' },
  { id: 'forest', en: 'woodland', es: 'bosque' },
];
const legend = t({ en: 'In metres: ', es: 'En metros: ' }) // a thin space more after each swatch
  + RELIEF.map((band) => `:swatch{color="${band.id}"} \u2009${t(band)}`).join(' · ');
// #endregion

// #region opener: the atlas's name on a band of deep sea, the sheet in its kicker
const BAND = 80; // mm from the trim to the foot of the band
const AIR = 7; // mm at least between the band and the first line of text
const ROSE = 50; // mm across the compass rose
const pin = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) }); // to: 'page', 'bleed' or '#id' of an element listed before
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...extra }); // a long running head wraps too, never '…'
const opener = { enabled: true,
  // The band reserves down to its foot; minHeight adds AIR, in whole grid lines.
  minHeight: pt(LEAD * Math.ceil((BAND + AIR - PAGE.top) / (LEAD * PT))),
  slot: { elements: [ // array order is paint order
    { kind: 'box', id: 'band', style: { backgroundColor: col('band') },
      placement: pin('bleed', 'top-left', 0, 0, { height: mm(BAND) }) }, // no width: edge to edge
    { kind: 'image', id: 'rose', resourceId: 'rose', // page 1 is a recto: the fore-edge is right
      placement: pin('page', 'top-right', -PAGE.outer, (BAND - ROSE) / 2, { width: mm(ROSE),
        height: mm(ROSE) }) },
    text('kicker', '{attr.sheet} · {titleText}', LABEL, 9.5, 'sea', pin('page', 'top-left',
      PAGE.inner, 23), { fontWeight: 500, letterSpacing: pt(1.4) }),
    text('title', '{title}', DISPLAY, 56, 'paper', pin('#kicker', 'below', -1, 2),
      { lineHeight: 1 }),
    text('lead', '{attr.lead}', TEXT, 10.5, 'sea', pin('#title', 'below', 1, 3,
      { width: mm(128) }), { italic: true, lineHeight: 1.35 }),
  ] } }; // hook-up: headings.levels[0] = { span: 'page', breakBefore, advancedDesign: opener }
// #endregion

// Running heads: the atlas on the verso, the sheet on the recto, folios on the fore-edge.
const head = (id, content, parity, x, extra) => text(id, content, LABEL, 8.5, 'muted',
  pin('page', x > 0 ? 'top-left' : 'top-right', x, 12), { fontWeight: 500, letterSpacing: pt(1),
    align: x > 0 ? 'left' : 'right', parity, pages: 'body', ...extra });
const folio = { fontFamily: DISPLAY, fontSize: pt(11), fontWeight: 400, letterSpacing: pt(0),
  color: col('band') };
const header = { elements: [head('verso-folio', '{pageNumber}', 'even', PAGE.outer, folio),
  head('verso-title', '{title}', 'even', PAGE.outer + 9),
  head('recto-title', '{chapterTitle}', 'odd', -(PAGE.outer + 9)),
  head('recto-folio', '{pageNumber}', 'odd', -PAGE.outer, folio)] };
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', 0, folio),
  pages: 'opener', align: 'center', placement: { anchor: { to: 'container', edge: 'top' },
    offset: { x: mm(0), y: mm(9) } } }] }; // the opener's folio, under the text block
// A styled heading swaps its section's footer: About this sheet sets a hairline and the edition.
const imprint = { id: 'imprint', footer: { elements: [
  { kind: 'rule', id: 'rule', direction: 'horizontal', color: col('rule'), thickness: pt(0.5),
    placement: pin('container', 'top-left', 0, 5, { width: 'fill' }) },
  text('edition', t({ en: 'The Solan Isles, sheet 1 · first edition, 2024 · Kirkwick Harbour '
    + 'Trust', es: 'Las islas Solan, hoja 1 · primera edición, 2024 · Junta del Puerto de '
    + 'Kirkwick' }), LABEL, 8, 'muted', pin('#rule', 'below', 0, 2),
  { letterSpacing: pt(0.6) })] } };

// #region gazetteer: the places numbered north to south, in a table with zebra rows
const CHART = { y0: -5, square: 8 }; // Map 4's grid: 8 km squares from its top-left corner
const PLACES = [ // name, what it is (en, es), island, x and y in km on the sheet, map mark
  ['Skarra', ['lighthouse', 'faro'], 'Skarra', 34.4, 5.4, 'light'],
  ['Hool Stacks', ['sea stacks', 'farallones'], 'Brannay', 22.8, 9],
  ['Kellay', ['gannet colony', 'colonia de alcatraces'], 'Kellay', 5.4, 10.6],
  ['Ward of Brannay', ['summit, 234 m', 'cumbre, 234 m'], 'Brannay', 26.38, 12.04, 'summit'],
  ['Hesta Ness', ['headland', 'cabo'], 'Brannay', 30.1, 15.9],
  ['Tofts', ['hamlet', 'aldea'], 'Brannay', 22.7, 14.9, 'village'],
  ['Kirkwick', ['village and ferry pier', 'pueblo y muelle'], 'Brannay', 28.3, 15, 'village'],
  ['St Brendan’s', ['ruined chapel', 'capilla en ruinas'], 'Brannay', 23.8, 21.6, 'chapel'],
  ['Brannay Sound', ['strait', 'estrecho'], '—', 25.6, 22.7],
  ['Scarfa Ness', ['headland', 'cabo'], 'Orrin', 36.3, 22.3],
  ['Carrick', ['mainland port', 'puerto de tierra firme'], '—', 59.4, 21.2, 'village'],
  ['Orrinsetter', ['hamlet', 'aldea'], 'Orrin', 31.7, 24.8, 'village'],
  ['Housa Stone', ['standing stone', 'menhir'], 'Orrin', 29.4, 25.6, 'stone'],
  ['Leury Sands', ['beach', 'playa'], 'Brannay', 10.9, 25.6],
  ['Holm of Orrin', ['islet', 'islote'], 'Orrin', 37.74, 28.4],
  ['Pollwick', ['bay', 'bahía'], 'Orrin', 32.4, 28.3],
  ['Tang Skerry', ['rock and beacon', 'roca y baliza'], '—', 25.08, 28.88, 'light'],
].map(([name, [en, es], island, x, y, mark]) => ({ name, kind: t({ en, es }), island, x, y, mark }))
  .sort((a, b) => a.y - b.y).map((place, i) => ({ ...place, no: i + 1 }));
const square = ({ x, y }) => 'ABCDEFGH'[Math.floor(x / CHART.square)]
  + (Math.floor((y - CHART.y0) / CHART.square) + 1); // the square the place falls in
function gazetteer() {
  const heads = t({ en: ['No.', 'Place', 'What it is', 'Island', 'Square'],
    es: ['N.º', 'Lugar', 'Qué es', 'Isla', 'Cuadro'] });
  const cells = (row, isHeader = false) => row.map((content) => ({ content, isHeader }));
  let m = { headerRowCount: 1, columnWidths: [8, 34, 42, 18, 12], rows: [cells(heads, true),
    ...PLACES.map((p) => cells([`:chip[${p.no}]{style="no"}`, `**${p.name}**`, p.kind, p.island,
      square(p)]))] };
  for (let row = 0; row < m.rows.length; row++) {
    for (const c of [0, 4]) m = setAlignment(m, { row, col: c }, 'center');
  }
  return m; // the zebra rows are the table style's: tableStyle.bodyAlternateBackground
}
// #endregion

const config = () => ({
  colorPalette, header, footer, captionStyle,
  // The maps' own type, then the built-in table type in the sheet's language, counting 1, 2…
  resourceTypes: [mapType, { ...defaultResourceTypes(LANG)[1], numberingTemplate: '{n}' }],
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('band'), // refs in blue
    textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true }, // ragged, a line apart
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('band'), levels: [
    // 'odd': the sheet opens on a recto, with no blank page forced before it.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: opener, marginBottom: pt(0) }, // else a grid line more under the band
    { level: 2, fontSize: pt(14), lineHeight: pt(LEAD * 1.5), marginTop: pt(LEAD / 2),
      marginBottom: pt(0) },
  ] },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('band'), headerColor: col('paper'), headerFontFamily: LABEL,
    headerFontSize: pt(8.5), bodyFontSize: pt(8.8), cellPadding: mm(1.2),
    bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: col('sea') }, // every 2nd row
  chipStyles: [{ id: 'no', background: col('road'), color: col('paper'), bold: true,
    borderWidth: pt(0), borderRadius: em(1), paddingX: em(0.45), fontSize: em(0.92) },
  { id: 'key', backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0) }],
  headingStyles: [imprint], // ## About this sheet {style="imprint"}
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.8), lineHeight: pt(10.5),
    color: col('muted') }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const SEED = 1874; // the survey's year, and the seed every coast and depth is drawn from

// #region art: one seeded height field, drawn as four maps and a compass rose
// Heights and depths come from a few hills and bays warped by value noise; marching squares
// turn each band of RELIEF into closed paths. Numbers and letters are strokes, drawn by
// label(), so the maps carry no font. No markers or filters.
function mulberry32(seed) { // a seeded PRNG: never Math.random() in a recipe
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const LATTICE = Array.from({ length: 64 * 64 }, () => rand() * 2 - 1);
const ease = (t) => t * t * (3 - 2 * t);
function noise(x, y) { // value noise in −1…1 on a 64 × 64 lattice that wraps
  const [i, j] = [Math.floor(x), Math.floor(y)], [u, v] = [ease(x - i), ease(y - j)];
  const at = (a, b) => LATTICE[((b & 63) << 6) | (a & 63)];
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
  const foot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
  return top + (foot - top) * v;
}
const fbm = (x, y) => [1, 2, 4, 8].reduce((s, f) => s + noise(f * x, f * y) / (2 * f), 0);
const FLOOR = -46; // m, the sea bed between the islands
const HILLS = [ // x, y, rx, ry (km), turn (°), summit (m); a negative summit carves a bay
  [20.5, 19, 10, 3.3, -38, 110], [26.3, 12.4, 3.8, 3.0, -25, 232], [14.6, 23.6, 3.6, 2.2, -8, 70],
  [11.8, 25.4, 2.4, 1.2, 35, 30], [29.6, 14.8, 1.8, 1.0, 50, 60], [23.5, 20.2, 3.2, 1.5, 60, 60],
  [31, 25.6, 4.6, 2.7, 12, 64], [35.5, 23.4, 2.0, 1.0, -35, 34], [28.2, 27.4, 1.6, 0.9, 25, 30],
  [8, 12, 2.9, 2.0, 12, 132], [6.4, 13.8, 1.3, 0.8, -40, 60], [34.2, 5.2, 1.1, 0.75, 20, 26],
  [23.62, 9.45, 0.2, 0.2, 0, 40], [23.98, 8.98, 0.18, 0.18, 0, 36], [23.4, 9.85, 0.16, 0.16, 0, 30],
  [38.4, 28.4, 0.8, 0.55, 30, 14], [25.1, 29.6, 0.3, 0.22, 0, 4], [74, 22, 16, 40, 8, 260],
  [28.4, 18.4, 1.5, 0.9, 20, -70], [32.6, 27.9, 1.3, 1.0, 0, -60], [17.2, 22.2, 1.0, 0.7, 10, -40],
  [56.6, 21.4, 2.6, 1.6, 10, -80], [55.2, 32.5, 3.2, 1.3, 25, 40],
];
function elevation(x, y) { // [land, sea] in metres at (x, y) km: x east, y south
  const wx = x + 2 * fbm(x / 7, y / 7) + 0.7 * fbm(x / 1.8 + 5, y / 1.8)
    + 0.2 * fbm(x / 0.5, y / 0.5);
  const wy = y + 2 * fbm(x / 7 + 17.3, y / 7 + 9.1) + 0.7 * fbm(x / 1.8, y / 1.8 + 5)
    + 0.2 * fbm(x / 0.5 + 9, y / 0.5);
  let [e, cut, shelf] = [FLOOR, 0, 0];
  for (const [cx, cy, rx, ry, turn, peak] of HILLS) {
    const [c, s, dx, dy] = [Math.cos(turn / 57.3), Math.sin(turn / 57.3), wx - cx, wy - cy];
    const [u, v] = [dx * c + dy * s, dy * c - dx * s];
    const d2 = (u / rx) ** 2 + (v / ry) ** 2;
    if (peak < 0) { cut = Math.max(cut, -peak * Math.exp(-d2)); continue; }
    const k = Math.log((peak - FLOOR) / -FLOOR); // so the coast falls on the ellipse
    e = Math.max(e, FLOOR + (peak - FLOOR) * Math.exp(-k * d2));
    shelf = Math.max(shelf, Math.exp(-((u / (rx + 2.4)) ** 2 + (v / (ry + 2.4)) ** 2)));
  }
  const land = e - cut + 14 * fbm(x / 1.3 + 40, y / 1.3) + 5 * fbm(x / 0.4, y / 0.4 + 60);
  const bed = -40 - 14 * fbm(x / 10 + 3, y / 10) + 38 * shelf + 1.2 * fbm(x / 1.6, y / 1.6 + 30);
  return [land, Math.max(bed, land * 0.6)];
}
const EDGES = { 1: ['B', 'L'], 2: ['R', 'B'], 3: ['R', 'L'], 4: ['T', 'R'], 6: ['T', 'B'],
  7: ['T', 'L'], 8: ['L', 'T'], 9: ['B', 'T'], 11: ['R', 'T'], 12: ['L', 'R'], 13: ['B', 'R'],
  14: ['L', 'B'], 5: ['T', 'L', 'B', 'R', 'T', 'R', 'B', 'L'], // saddles: joined, then apart
  10: ['R', 'T', 'L', 'B', 'L', 'T', 'R', 'B'] };
function contours(grid, nx, ny, level) { // marching squares: closed loops above `level`
  const v = (i, j) => (i && j && i < nx - 1 && j < ny - 1 ? grid[j * nx + i] : -1e9);
  const at = new Map(), next = new Map();
  const edge = (i, j, side) => { // T, B, L or R of cell (i, j), as a key shared by neighbours
    const [a, b, horizontal] = { T: [i, j, 1], B: [i, j + 1, 1], L: [i, j, 0],
      R: [i + 1, j, 0] }[side];
    const key = `${horizontal ? 'h' : 'v'}${a},${b}`;
    if (!at.has(key)) {
      const [p, q] = horizontal ? [v(a, b), v(a + 1, b)] : [v(a, b), v(a, b + 1)];
      const t = (level - p) / (q - p);
      at.set(key, horizontal ? [a + t, b] : [a, b + t]);
    }
    return key;
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const corners = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)];
      const index = corners.reduce((n, c) => n * 2 + (c > level), 0);
      let sides = EDGES[index];
      if (!sides) continue;
      const high = corners.reduce((a, b) => a + b) / 4 > level; // a saddle: which way it joins
      if (sides.length > 4) sides = high ? sides.slice(0, 4) : sides.slice(4);
      for (let k = 0; k < sides.length; k += 2) {
        next.set(edge(i, j, sides[k]), edge(i, j, sides[k + 1]));
      }
    }
  }
  const loops = [];
  for (const start of [...next.keys()]) {
    const loop = [];
    for (let k = start; next.has(k);) {
      loop.push(at.get(k));
      const n = next.get(k);
      next.delete(k);
      k = n;
    }
    if (loop.length > 5) loops.push(loop);
  }
  return loops;
}
const chaikin = (loop) => loop.flatMap((p, i) => {
  const q = loop[(i + 1) % loop.length];
  return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]],
    [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]];
});
const r1 = (n) => Math.round(n * 10) / 10;
function sheet(win, w, h, cell = 0.6) { // the window [x0, x1] × [y0, y1] km drawn w × h mm
  const [nx, ny] = [Math.ceil(w / cell) + 1, Math.ceil(h / cell) + 1];
  const [land, sea] = [new Float32Array(nx * ny), new Float32Array(nx * ny)];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      [land[j * nx + i], sea[j * nx + i]] = elevation(win.x0 + i * (win.x1 - win.x0) / (nx - 1),
        win.y0 + j * (win.y1 - win.y0) / (ny - 1));
    }
  }
  const k = w / (win.x1 - win.x0); // mm per km
  const X = (x) => r1((x - win.x0) * k), Y = (y) => r1((y - win.y0) * k);
  const loops = (level, field) => contours(field, nx, ny, level).map((loop) => {
    const p = chaikin(chaikin(loop));
    return `M${p.map(([i, j]) => `${r1(i * w / (nx - 1))} ${r1(j * h / (ny - 1))}`).join('L')}Z`;
  }).join('');
  return { X, Y, k, w, h, land: (level) => loops(level, land), sea: (level) => loops(level, sea) };
}
const fill = (d, id, more = '') => `<path d="${d}" fill="${palette[id]}" fill-rule="evenodd"`
  + `${more}/>`;
const line = (d, id, width, more = '') => `<path d="${d}" fill="none" stroke="${palette[id]}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
const poly = (s, pts) => `M${pts.map(([x, y]) => `${s.X(x)} ${s.Y(y)}`).join('L')}`;
const nearLine = (x, y, pts, d) => pts.slice(1).some(([bx, by], i) => { // within d of the line
  const [ax, ay] = pts[i], [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(ax + t * dx - x, ay + t * dy - y) < d;
});

// A stroke font for numbers and grid letters, 4 × 6 units with the baseline at 6.
const GLYPHS = {
  0: 'M2 0C.6 0 0 1.4 0 3s.6 3 2 3 2-1.4 2-3-.6-3-2-3Z', 1: 'M.9 1.2 2.4 0v6',
  2: 'M.2 1.2C.6.4 1.3 0 2 0c1.2 0 2 .8 2 1.8C4 3.2 2.8 3.9 0 6h4.2',
  3: 'M.3.5C.8.2 1.4 0 2 0c1.2 0 1.9.7 1.9 1.6S3.1 3 2 3c1.3 0 2.1.7 2.1 1.6S3.3 6 2 6'
    + 'C1.3 6 .6 5.8.1 5.4',
  4: 'M3 6V0L0 4.2h4.2',
  5: 'M3.8 0h-3L.4 2.8c.5-.3 1-.4 1.6-.4 1.3 0 2.1.8 2.1 1.8C4.1 5.3 3.2 6 2 6 1.3 6 .6 5.8.1 5.4',
  6: 'M3.6.4C3.2.1 2.7 0 2.2 0 .9 0 .1 1.3.1 3.4.1 5.1.8 6 2.1 6c1.2 0 2-.8 2-1.9S3.3 2.3 2.2 2.3'
    + 'C1.1 2.3.3 3 .1 3.8',
  7: 'M0 0h4L1.6 6',
  8: 'M2 3C.9 3 .3 2.4.3 1.5S.9 0 2 0s1.7.6 1.7 1.5S3.1 3 2 3C.8 3 0 3.7 0 4.5S.8 6 2 6s2-.7 2-1.5'
    + 'S3.2 3 2 3Z',
  9: 'M.4 5.6c.4.3.9.4 1.4.4 1.3 0 2.1-1.3 2.1-3.4C3.9.9 3.2 0 1.9 0 .7 0-.1.8-.1 1.9'
    + 'S.7 3.7 1.8 3.7'
    + 'c1.1 0 1.9-.7 2.1-1.5',
  A: 'M0 6 2 0l2 6M.7 4h2.6',
  B: 'M0 3h2.2c1.1 0 1.8.7 1.8 1.5S3.3 6 2.2 6H0V0h2c1 0 1.6.6 1.6 1.5S3 3 2 3',
  C: 'M4 .9C3.5.3 2.8 0 2.1 0 .8 0 0 1.3 0 3s.8 3 2.1 3c.7 0 1.4-.3 1.9-.9',
  D: 'M0 0v6h1.8C3.2 6 4 4.8 4 3S3.2 0 1.8 0Z', E: 'M4 0H0v6h4M0 3h3', F: 'M4 0H0v6M0 3h3',
  G: 'M4 .9C3.5.3 2.8 0 2.1 0 .8 0 0 1.3 0 3s.8 3 2.1 3C3.2 6 4 5.4 4 4v-.7H2.4',
  H: 'M0 0v6m4-6v6M0 3h4',
  N: 'M0 6V0l4 6V0', k: 'M0 0v6m3.4-3.6L0 5m1.3-1 2.5 2',
  m: 'M0 6V2.4m0 .9c.3-.6.8-.9 1.3-.9s.9.4.9 1.1V6m0-2.5c0-.7.5-1.1 1.1-1.1s1.1.4 1.1 1.2V6',
};
const advance = (c) => (c === 'm' ? 5.6 : 5.2);
const labelWidth = (s, size) => ([...String(s)].reduce((a, c) => a + advance(c), 0) - 1.2)
  * size / 6;
function label(s, x, y, size, id, weight = 0.14) { // `s` in strokes, `size` mm tall, centred
  const k = size / 6;
  let pen = x - labelWidth(s, size) / 2;
  return [...String(s)].map((c) => {
    const at = `translate(${r1(pen)} ${r1(y - size / 2)}) scale(${k.toFixed(3)})`;
    pen += advance(c) * k;
    return `<path d="${GLYPHS[c]}" transform="${at}" fill="none" stroke="${palette[id]}" `
      + `stroke-width="${r1(6 * weight)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
}
function disc(n, x, y, size) { // a place number, white on a red pill, as in the gazetteer
  const w = labelWidth(String(n), size) + size * 0.9;
  return `<rect x="${r1(x - w / 2)}" y="${r1(y - size * 0.95)}" width="${r1(w)}" `
    + `height="${r1(size * 1.9)}" rx="${r1(size * 0.95)}" fill="${palette.road}" `
    + `stroke="${palette.paper}" stroke-width="0.3"/>`
    + label(n, x, y, size, 'paper', 0.16);
}
function scaleBar(s, x, y, km, step) { // ink and paper blocks, a figure every step
  const [unit, f] = km < 1 ? ['m', 1000] : ['km', 1];
  let out = '';
  for (let d = 0; d < km - 1e-9; d += step / 2) {
    out += `<rect x="${r1(x + d * s.k)}" y="${y}" width="${r1(step / 2 * s.k)}" height="1.2" `
      + `fill="${palette[Math.round(d / (step / 2)) % 2 ? 'paper' : 'ink']}" `
      + `stroke="${palette.ink}" stroke-width="0.2"/>`;
  }
  for (let d = 0; d <= km + 1e-9; d += step) {
    out += label(Math.round(d * f), x + d * s.k, y - 2.2, 2, 'ink');
  }
  return out + label(unit, x + km * s.k + 4 + (unit === 'km') * 1, y + 0.6, 2, 'ink');
}
const north = (x, y, size) => [1, -1].map((d) => `<path d="M${x} ${y}l${d * size * 0.35} ${size}`
  + `l${-d * size * 0.35} ${-size * 0.25}Z" fill="${palette[d > 0 ? 'ink' : 'paper']}" `
  + `stroke="${palette.ink}" stroke-width="${d > 0 ? 0 : 0.2}"/>`).join('')
  + label('N', x, y - 2.6, 2.4, 'ink'); // a north arrow, half ink and half paper

// What sits on the land, in km on the same field; the places' marks come from PLACES.
const ROADS = [ // Kirkwick to Leury along the ridge, Kirkwick to Tofts, the chapel, Orrin
  [[28.3, 15], [28.1, 15.5], [27.6, 16.1], [26.6, 16.6], [25.4, 17.5], [24.4, 18.8], [23.2, 19.8],
    [22, 20.8], [20.6, 21.6], [19, 22.2], [17.4, 22.9], [15.6, 23.6], [13.8, 24.4], [12.2, 25],
    [11.2, 25.4]],
  [[28.3, 15], [28.1, 14.7], [27.4, 14.3], [26.4, 14.3], [25.2, 14.5], [24.2, 14.6], [23.3, 14.7],
    [22.7, 14.9]],
  [[24.4, 18.8], [24, 20.4], [23.8, 21.6]],
  [[30.2, 23.1], [30.8, 23.8], [31.4, 24.4], [31.7, 24.8], [31.9, 25.6], [32.1, 26.6]],
];
const PIER = [28.75, 15.15]; // the head of Kirkwick pier, where both ferries berth
const FERRIES = [[PIER, [29.1, 15.8], [29.6, 17.6], [30.1, 20.2], [30.2, 22.9]], // to Orrin
  [PIER, [29.1, 15.8], [29.8, 16.9], [34, 18.4], [44, 19.6], [52, 20.5], [58.6, 21.2]]]; // Carrick
const WOODS = [[26.6, 15.4, 0.8, 0.4, -30], [30.6, 25.6, 0.7, 0.4, 10], [18.6, 21, 0.9, 0.35, -25]];
const smoothLine = (pts) => [pts[0], ...chaikin(pts).slice(1, -2), pts.at(-1)]; // an open line
function woods(s) { // a plantation outline wobbled by the noise
  return WOODS.map(([cx, cy, rx, ry, turn]) => {
    const [c, n] = [Math.cos(turn / 57.3), Math.sin(turn / 57.3)];
    const pts = Array.from({ length: 36 }, (_, i) => {
      const a = i / 36 * 2 * Math.PI;
      const f = 1 + 0.3 * noise(cx * 3 + Math.cos(a) * 2, cy * 3 + Math.sin(a) * 2);
      const [u, v] = [rx * f * Math.cos(a), ry * f * Math.sin(a)];
      return [cx + u * c - v * n, cy + u * n + v * c];
    });
    return fill(`${poly(s, pts)}Z`, 'forest', ' fill-opacity=".85"');
  }).join('');
}
const MARKS = { // what each kind of place looks like, centred on (x, y) mm
  village: (x, y) => `<circle cx="${x}" cy="${y}" r="0.9" fill="${palette.ink}"/>`,
  light: (x, y) => star(x, y, 1.5),
  summit: (x, y) => `<path d="M${x} ${r1(y - 1)}l1 1.7h-2Z" fill="${palette.ink}"/>`,
  chapel: (x, y) => line(`M${x} ${r1(y - 1.1)}v2.2M${r1(x - 0.7)} ${r1(y - 0.4)}h1.4`, 'ink', 0.4),
  stone: (x, y) => `<rect x="${r1(x - 0.35)}" y="${r1(y - 1)}" width="0.7" height="2" `
    + `fill="${palette.ink}"/>`,
};
function relief(s, { step = 50, roads = true } = {}) { // the layers every map shares
  let out = `<rect width="${s.w}" height="${s.h}" fill="${palette.deep}"/>`;
  const [under, ...above] = RELIEF.filter((band) => band.from !== undefined);
  out += fill(s.sea(under.from), under.id);
  for (const depth of [-16, -8, -3]) out += line(s.land(depth), 'deep', 0.16); // water-lines
  for (const band of above) out += fill(s.land(band.from), band.id);
  for (let m = step; m < 240; m += step) { // contour lines, except where a tint already changes
    if (!RELIEF.some((band) => band.from === m)) {
      out += line(s.land(m), 'muted', 0.12, ' opacity=".45"');
    }
  }
  out += woods(s) + line(s.land(0), 'band', 0.3);
  if (!roads) return out;
  for (const f of FERRIES) out += line(poly(s, f), 'band', 0.35, ' stroke-dasharray="1.6 1.2"');
  for (const r of ROADS.map(smoothLine)) {
    out += line(poly(s, r), 'paper', 1.1) + line(poly(s, r), 'road', 0.55); // a cased road
  }
  for (const p of PLACES) if (p.mark) out += MARKS[p.mark](s.X(p.x), s.Y(p.y));
  return out;
}
const star = (x, y, r) => `<path d="${Array.from({ length: 8 }, (_, i) => {
  const a = i * Math.PI / 4, q = i % 2 ? 0.45 : 1;
  return `${i ? 'L' : 'M'}${r1(x + Math.sin(a) * r * q)} ${r1(y - Math.cos(a) * r * q)}`;
}).join('')}Z" fill="${palette.road}" stroke="${palette.paper}" stroke-width="0.2"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`; // 10 px to the mm

// The four maps and the rose, at the sizes the resources declare (MAP, in mm).
const frame = (w, h) => `<rect x=".15" y=".15" width="${r1(w - 0.3)}" height="${r1(h - 0.3)}" `
  + `fill="none" stroke="${palette.ink}" stroke-width="0.3"/>`;
const discs = (s, list) => list.map((p) => disc(p.no, s.X(p.x) + (p.mark ? 3 : 0), // beside a mark
  s.Y(p.y) - (p.mark ? 2.4 : 0), 1.9)).join('');
const inside = (s, p) => s.X(p.x) > 3 && s.X(p.x) < s.w - 3 && s.Y(p.y) > 3 && s.Y(p.y) < s.h - 3;
function reliefMap([w, h]) { // Map 1: the whole group, its bands of height and its roads
  const s = sheet({ x0: -1.5, x1: 44.5, y0: 0.5, y1: 0.5 + h * 46 / w }, w, h);
  return svg(w, h, relief(s) + scaleBar(s, 8, h - 6, 10, 5) + north(w - 9, 7, 7) + frame(w, h));
}
function northMap([w, h]) { // Map 2: the north end of Brannay, contours every 25 m, numbered
  const s = sheet({ x0: 20.4, x1: 31.8, y0: 7.4, y1: 7.4 + h * 11.4 / w }, w, h, 0.35);
  const top = PLACES.find((p) => p.mark === 'summit'); // its spot height, as the text gives it
  return svg(w, h, relief(s, { step: 25 }) + discs(s, PLACES.filter((p) => inside(s, p)))
    + label(Math.round(elevation(top.x, top.y)[0]), s.X(top.x), s.Y(top.y) + 2.6, 1.8, 'ink')
    + scaleBar(s, 6, h - 5, 2, 1) + north(w - 7, 6, 5.5) + frame(w, h));
}
function harbourMap([w, h]) { // Map 3: Kirkwick, its pier and the soundings of the voe
  const s = sheet({ x0: 27.62, x1: 30.42, y0: 13.95, y1: 13.95 + h * 2.8 / w }, w, h, 0.4);
  const rand = mulberry32(SEED + 3);
  let out = relief(s, { step: 25, roads: false });
  const key = [[28.64, 15.25], [28.74, 14.6], [28.28, 15.02], [28.16, 15.37], [28.24, 14.44]];
  const kirk = `<rect x="-1.4" y="-.8" width="2.8" height="1.6" fill="${palette.ink}"/>`
    + line('M1.4 0h1.6m-.8-.8v1.6', 'ink', 0.35); // nave and a cross at its east end
  out += `<g transform="translate(${s.X(28.34)} ${s.Y(14.52)}) rotate(-20)">${kirk}</g>`;
  const clear = (x, y) => key.every(([kx, ky]) => Math.hypot(s.X(kx) - x, s.Y(ky) - y) > 4)
    && !(x < 34 && y > h - 13) && !(x > w - 13 && y < 15); // off the key, scale and arrow
  for (let y = 14.08; y < 16.5; y += 0.2) { // soundings: metres below the lowest tide
    for (let x = 27.7 + (Math.round(y / 0.2) % 2) * 0.1; x < 30.4; x += 0.2) {
      const depth = -elevation(x, y)[1];
      if (depth > 1.5 && elevation(x, y)[0] < -1.5 && clear(s.X(x), s.Y(y))
        && !nearLine(x, y, FERRIES[1], 0.06)) {
        out += label(Math.round(depth), s.X(x), s.Y(y), 1.5, 'band', 0.11);
      }
    }
  }
  const street = [[28.62, 14.3], [28.55, 14.6], [28.47, 14.9], [28.4, 15.1], [28.2, 15.45],
    [27.95, 15.75], [27.62, 15.98]];
  const up = [[28.47, 14.9], [28.25, 14.75], [28.05, 14.55], [27.62, 14.35]];
  out += line(poly(s, street), 'paper', 1.6) + line(poly(s, up), 'paper', 1.6)
    + line(poly(s, street), 'road', 0.9) + line(poly(s, up), 'road', 0.9);
  for (const [a, b, side] of [[0, 3, 1], [3, 5, 1], [0, 3, -1]]) { // houses along the street
    for (let t = 0.04; t < 0.96; t += 0.08 + rand() * 0.05) {
      const [p, q] = [street[a], street[b]];
      const [x, y] = [s.X(p[0] + (q[0] - p[0]) * t), s.Y(p[1] + (q[1] - p[1]) * t)];
      const turn = Math.atan2(s.Y(q[1]) - s.Y(p[1]), s.X(q[0]) - s.X(p[0])) * 57.3;
      out += `<rect x="-.7" y="${side > 0 ? -2.7 : 1.2}" width="${r1(1.1 + rand() * 0.6)}" `
        + 'height="1.4" '
        + `transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(turn)})" fill="${palette.hill2}" `
        + `stroke="${palette.ink}" stroke-width="0.2"/>`;
    }
  }
  const pier = [[28.43, 15.07], PIER]; // 330 m of pier across the mouth of the voe
  out += line(poly(s, pier), 'ink', 2.2) + line(poly(s, pier), 'paper', 1.6)
    + line(poly(s, [[28.55, 14.66], [28.67, 14.71]]), 'ink', 1.2) // the lifeboat slipway
    + line(poly(s, [[28.55, 14.66], [28.67, 14.71]]), 'paper', 0.7)
    + line(poly(s, FERRIES[1].slice(0, 3)), 'band', 0.35, ' stroke-dasharray="1.6 1.2"')
    + star(s.X(PIER[0]), s.Y(PIER[1]), 1.3);
  out += key.map(([x, y], i) => `<circle cx="${s.X(x)}" cy="${s.Y(y)}" r="1.7" `
    + `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="0.25"/>`
    + label(i + 1, s.X(x), s.Y(y), 1.8, 'ink')).join('');
  return svg(w, h, out + scaleBar(s, 6, h - 5, 0.5, 0.25) + north(w - 7, 6, 5.5) + frame(w, h));
}

function chartMap([w, h], b = 5) { // Map 4: the whole sheet, the approaches and the grid
  const [iw, ih] = [w - 2 * b, h - 2 * b];
  const s = sheet({ x0: 0, x1: 64, y0: CHART.y0, y1: CHART.y0 + ih * 64 / iw }, iw, ih, 0.7);
  const q = CHART.square * s.k; // a square, in mm
  let grid = '', border = ''; // lines inside the frame; letters and figures in the margin round it
  for (let c = 0; c < 8; c++) {
    for (const y of [b / 2, h - b / 2]) {
      border += label('ABCDEFGH'[c], b + (c + 0.5) * q, y, 2.6, 'ink');
    }
    if (c) grid += line(`M${r1(c * q)} 0V${ih}`, 'band', 0.2, ' opacity=".55"');
  }
  for (let r = 0; r * q < ih; r++) { // the last row is cut by the frame
    const mid = b + (r * q + Math.min(ih, (r + 1) * q)) / 2;
    for (const x of [b / 2, w - b / 2]) border += label(r + 1, x, mid, 2.6, 'ink');
    if (r) grid += line(`M0 ${r1(r * q)}H${iw}`, 'band', 0.2, ' opacity=".55"');
  }
  let soundings = ''; // depths in the open sea, clear of the coast, the places and the ferries
  const near = (x, y, d) => PLACES.some((p) => Math.hypot(p.x - x, p.y - y) < d)
    || FERRIES.some((f) => nearLine(x, y, f, d / 2))
    || [0, 1, 2, 3, 4, 5, 6, 7].some((i) => elevation(x + Math.cos(i * Math.PI / 4), // or land
      y + Math.sin(i * Math.PI / 4))[0] > 0); // within 1 km, so no figure reaches the coast
  for (let y = CHART.y0 + 2; y < CHART.y0 + ih / s.k; y += 3.4) {
    for (let x = 2 + (Math.round(y / 3.4) % 2) * 1.7; x < 64; x += 3.4) {
      const [land, sea] = elevation(x, y);
      const [X, Y] = [s.X(x), s.Y(y)]; // inside the frame, off the scale bar and the arrow
      const clear = X > 3 && X < iw - 3 && Y > 3 && Y < ih - 3 && !(X < 60 && Y > ih - 30);
      if (land < -12 && clear && !near(x, y, 2.4)) {
        soundings += label(Math.round(-sea), X, Y, 1.7, 'band', 0.11);
      }
    }
  }
  const body = relief(s) + soundings + grid + discs(s, PLACES) + scaleBar(s, 8, ih - 6, 10, 5)
    + north(14, ih - 24, 7);
  return svg(w, h, `<rect width="${w}" height="${h}" fill="${palette.paper}"/>${border}`
    + `<g transform="translate(${b} ${b})">${body}${frame(iw, ih)}</g>`);
}
function rose(size) { // the compass rose on the opener's band, in the band's own blues
  const c = size / 2;
  const at = (a, r) => `${r1(c + Math.sin(a) * r)} ${r1(c - Math.cos(a) * r)}`; // polar, from c
  let out = [0.42, 0.37, 0.19].map((f, i) => `<circle cx="${c}" cy="${c}" r="${r1(size * f)}" `
    + `fill="none" stroke="${palette.deep}" stroke-width="${i ? 0.25 : 0.5}"/>`).join('');
  out += line(Array.from({ length: 64 }, (_, i) => { // ticks, longer every fourth
    const a = i * Math.PI / 32;
    return `M${at(a, size * 0.37)}L${at(a, size * (i % 4 ? 0.395 : 0.42))}`;
  }).join(''), 'deep', 0.2);
  for (const [n, long, w] of [[8, 0.32, 0.05], [4, 0.42, 0.07]]) { // half-winds, then N E S W
    for (let i = 0; i < n; i++) {
      const a = (i + (n === 8 ? 0.5 : 0)) * 2 * Math.PI / n;
      for (const d of [1, -1]) { // each point in two halves, one light and one dark
        out += `<path d="M${c} ${c}L${at(a + d * Math.PI / 2, size * w)}L${at(a, size * long)}Z" `
          + `fill="${palette[d > 0 ? 'sea' : 'deep']}"/>`;
      }
    }
  }
  return svg(size, size, out + label('N', c, 1.9, 3, 'sea', 0.12));
}
// #endregion

// #region resources: the four maps and the gazetteer, each cited in the text with :ref
// A plan's key: a bare chip keeps each number on the line of its name, and the dot after it.
const key = (names) => names.map((name, i) => `:chip[${i + 1} ${name}${names[i + 1] ? ' ·' : ''}]`
  + '{style="key"}').join(' ');
const TEXTS = t({ // caption, the key under the drawing, and the alt text of each map
  en: {
    relief: ['The islands: relief and roads', `${legend} · roads in red, ferries dashed`,
      'Relief map of Brannay, Orrin, Kellay and Skarra in sand and ochre on blue water, with '
      + 'red roads.'],
    north: ['The north end of Brannay', 'Contour interval 25 metres; heights in metres above the '
      + 'sea. The red discs number the places of the gazetteer.', 'The Ward of Brannay, 234 m, in '
      + 'contours, with the Hool Stacks off its north-west point and the road round it to Tofts.'],
    harbour: ['Kirkwick harbour', 'Soundings in metres at the lowest tide. '
      + key(['ferry pier and light', 'lifeboat station', 'harbour office', 'fish store', 'kirk']),
      'Plan of Kirkwick: one street of houses on a narrow inlet, a pier into its mouth, depths '
      + 'from 2 to 15 m.'],
    chart: ['The islands and their approaches, with the gazetteer’s grid', 'Squares of 8 '
      + 'kilometres, lettered west to east and numbered north to south.', 'Chart of the group '
      + 'and the mainland coast on a lettered grid, with the seventeen places in red discs.'],
    table: ['Gazetteer of the numbered places', 'Squares are those of :ref{id="chart"}.'],
  },
  es: {
    relief: ['Las islas: relieve y carreteras', `${legend} · carreteras en rojo, `
      + 'transbordadores a trazos', 'Relieve de Brannay, Orrin, Kellay y Skarra en tintas de '
      + 'arena y ocre sobre agua azul, con las carreteras en rojo.'],
    north: ['El extremo norte de Brannay', 'Equidistancia de las curvas: 25 metros; alturas en '
      + 'metros sobre el mar. Los discos rojos numeran los lugares del nomenclátor.', 'El Ward '
      + 'of Brannay, de 234 m, en curvas de nivel, con los Hool Stacks frente a su punta noroeste '
      + 'y la carretera de Tofts.'],
    harbour: ['El puerto de Kirkwick', 'Sondas en metros con la marea más baja. '
      + key(['muelle y luz', 'estación de salvamento', 'oficina del puerto', 'almacén de pescado',
        'iglesia']), 'Plano de Kirkwick: una calle de casas junto a una ensenada estrecha, un '
      + 'muelle en su boca y fondos de 2 a 15 m.'],
    chart: ['Las islas y sus accesos, con la cuadrícula del nomenclátor', 'Cuadros de 8 '
      + 'kilómetros, con letras de oeste a este y números de norte a sur.', 'Carta del grupo y de '
      + 'la costa de tierra firme en cuadros, con los diecisiete lugares en discos rojos.'],
    table: ['Nomenclátor de los lugares numerados',
      'Los cuadros son los del :ref{id="chart" case="lower"}.'],
  },
});
const svgResource = (id, [w, h], more) => ({ id, typeId: 'map', kind: 'svg', createdAt: 0,
  updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, ...more });
const resources = [
  ...Object.keys(MAP).map((id) => svgResource(id, MAP[id], { placement: PLACEMENT[id],
    caption: TEXTS[id][0], note: TEXTS[id][1], altText: TEXTS[id][2] })),
  svgResource('rose', [ROSE, ROSE], { altText: t({ en: 'Compass rose',
    es: 'Rosa de los vientos' }) }),
  { id: 'gazetteer', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
    caption: TEXTS.table[0], note: TEXTS.table[1], placement: { position: 'top', span: 'page' },
    table: { model: gazetteer() } },
];
const drawings = { relief: reliefMap, north: northMap, harbour: harbourMap, chart: chartMap };
for (const [id, draw] of Object.entries(drawings)) await loadSvg(`${id}.svg`, draw(MAP[id]));
await loadSvg('rose.svg', rose(ROSE)); // drawn by the opener, never cited, so never numbered
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build
  'Alegreya Sans': ['400', '400i', '700'], // text, lead, place names and chips
  'Alegreya Sans SC': ['400', '500', '700'], // captions, heads, kicker, table head, labels
  Marcellus: ['400'], // the atlas's name, section heads and folios: one weight, no italic
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'The Solan Isles · Sheet 1', es: 'Las islas Solan · Hoja 1' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
