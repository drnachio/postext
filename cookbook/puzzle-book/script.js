// ═══ Postext Cookbook · Nº 069 · Puzzle book: crossword, word search and maze ═══════
// https://postext.dev/en/cookbook/puzzle-book
// Code: MIT · Text and puzzles: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Lexend, Lilita One, Chivo Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  setCellBackground } from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'puzzle-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1f2a44', // text, grid rules and the black squares: a navy near-black
  paper: '#ffffff',
  band: '#2d9cdb', // a puzzle's colour field: sea blue until a puzzle's style replaces it
  sun: '#ffb627', coral: '#ff6f59', mint: '#5cc8a8', // the other fields; coral marks a find
  tint: '#fff1cc', // boxes and word-search tiles
  muted: '#5b6477', // running titles and the colophon
};
// Design slots read the hex in 1.4.1 and a puzzle's palette reads the id: col() writes both
// (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ink })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Lexend', 'Lilita One', 'Chivo Mono'];
const PAGE = 210, MARGIN = 16; // mm: a square booklet, the same margin on every side
const MEASURE = PAGE - 2 * MARGIN; // 178 mm
const BODY = 11.5, LEAD = 16; // pt: large, open text for young readers
const PT_PER_MM = 72 / 25.4;
const JOINER = '\u2060'; // a word joiner: a line with nothing on it that still counts

// #region answer: a named table style for each grid, picked by the table's styleId
// Every grid shares tableStyle; a named style sets its size, padding, rules and fills.
// A row is as tall as its lines plus the padding and a column is its share of the
// table's width, so the padding sets how deep a square is.
const CELL = (15 * LEAD) / 9; // pt: nine squares are fifteen lines of text, 9.4 mm each
const PAD = 1; // pt: a clue number sits this close to the corner, clear of the 1 pt rule
const CLUE_FACE = (CELL - 2 * PAD) / (2 * LEAD / BODY); // 8.9 pt: two lines fill a square
const LETTER = 15; // pt: the word search's capitals
const pad = (cell, face) => pt((cell - face * LEAD / BODY) / 2); // one line fills the cell
const KEY = 54; // mm: the three answers are this deep, so their captions share a line
const key = (count) => { // count squares in KEY mm, letters of 4/3 pt per mm of square
  const side = (KEY / count) * PT_PER_MM, face = (KEY / count) * 4 / 3;
  return { id: `solucion-${count}`, bodyFontSize: pt(face), cellPadding: pad(side, face),
    borderWidth: pt(0.5) };
};
// No grid has a head row; the grey head is off for the Cookbook's default-skin check.
const tableStyle = { headerBackgroundEnabled: false, bodyFontFamily: LABEL };
const tableStyles = [
  { id: 'crucigrama', bodyFontSize: pt(CLUE_FACE), cellPadding: pt(PAD), borderWidth: pt(1) },
  { id: 'sopa', bodyFontSize: pt(LETTER), cellPadding: pad(CELL, LETTER), // same squares
    bodyBackgroundEnabled: true, bodyBackground: col('tint'), // tiles with white joints
    borderColor: col('paper'), borderWidth: pt(2.4), borderRadius: mm(4) },
  key(9), key(12), // 6 mm squares with 8 pt letters, 4.5 mm squares with 6 pt letters
];
// A table resource names its style; a cell's own background covers the style's fill.
const here = (width) => ({ position: 'here', width, align: 'center' }); // of the column
const grid = (id, typeId, model, styleId, width, extra) => ({ id, typeId, kind: 'table',
  createdAt: 0, updatedAt: 0, table: { model, styleId }, placement: here(width), ...extra });
// #endregion

// #region crossword: nine lines of letters give the crossword, or with solved its answer
// Two lines of CLUE_FACE (a number, an empty line) and the padding make a square.
function crossword(source, solved = false) {
  const lines = source.trim().split('\n');
  const white = (r, c) => (lines[r]?.[c] ?? '#') !== '#';
  let clue = 0;
  const rows = lines.map((line, r) => [...line].map((letter, c) => {
    if (!white(r, c)) return { content: '', background: col('ink') }; // a black square
    if (solved) return { content: letter, align: 'center' };
    // A square is numbered when a word starts in it, across or down, in reading order.
    const starts = (!white(r, c - 1) && white(r, c + 1)) || (!white(r - 1, c) && white(r + 1, c));
    const number = starts ? `**^${++clue}^**` : JOINER; // a bold superscript, or nothing
    return { content: `${number}\n${JOINER}` }; // gotcha: cell-blank-line
  }));
  return { rows, columnWidths: rows[0].map(() => 1) };
}
// #endregion

// #region search: a word search that finds its words in the grid and fills their squares
const STEPS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
function locate(letters, word) { // the squares of a word, in any of eight directions
  const hits = [];
  letters.forEach((line, r) => [...line].forEach((_, c) => STEPS.forEach(([dr, dc]) => {
    const cells = [...word].map((_, i) => ({ row: r + i * dr, col: c + i * dc }));
    if (cells.every(({ row, col: k }, i) => letters[row]?.[k] === word[i])) hits.push(cells);
  })));
  if (hits.length !== 1) throw new Error(`${word} is in the grid ${hits.length} times`);
  return hits[0];
}
function wordSearch(source, fills) { // fills: [word, palette id] pairs
  const letters = source.trim().split('\n').slice(-12);
  let model = { rows: letters.map((line) => [...line].map((content) => ({ content,
    align: 'center' }))) };
  for (const [word, fill] of fills) {
    for (const at of locate(letters, word)) model = setCellBackground(model, at, col(fill));
  }
  return model;
}
// #endregion

// #region openers: one opener for every puzzle; each puzzle's style gives it its colour
const BAND = 40; // mm: the colour field, from the top edge
const pin = (to, edge, x, y, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, family, size, placement, extra) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', placement,
  align: placement.anchor.edge.endsWith('right') ? 'right' : 'left', ...extra });
const CAPS = { fontWeight: 700, textTransform: 'uppercase', letterSpacing: em(1 / 6) };
// The field's box sets the opener's depth: the text starts on the next grid line below.
const opener = { enabled: true, slot: { elements: [
  { kind: 'box', id: 'field', style: { backgroundColor: col('band') },
    placement: pin('page', 'top-left', 0, 0, { width: 'fill', height: mm(BAND) }) },
  { kind: 'image', id: 'surf', resourceId: 'olas', // the field's foot, cut in waves
    placement: pin('page', 'top-left', 0, BAND - 3, { width: mm(PAGE), height: mm(3.2) }) },
  text('kicker', '{attr.kicker}', LABEL, 8.5, pin('page', 'top-left', MARGIN, 11), CAPS),
  text('title', '{titleText}', DISPLAY, 46, pin('#kicker', 'below', -0.6, 0.5),
    { lineHeight: 1 }), // a multiple, never pt() (gotcha: design-lineheight-multiple)
  text('theme', '{attr.theme}', TEXT, 10, pin('page', 'top-right', -MARGIN, 23.5), {
    fontWeight: 700, box: { backgroundColor: col('paper'), borderRadius: mm(3.5),
      padding: { top: mm(1.6), right: mm(3.2), bottom: mm(1.6), left: mm(3.2) } } }),
] } };
// The H1 break is restated (gotcha: headings-drop-h1-break), parity 'any'. span 'page' even
// in one column, or the field is cut at the top margin (gotcha: opener-clipped-at-top).
const puzzleLevel = { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: opener };
// '# Sopa de letras {style="sopa"}': the style's palette turns 'band' mint on that page,
// in the field, the folio disc and anything else linked to it.
const BANDS = { crucigrama: 'band', sopa: 'mint', laberinto: 'coral', soluciones: 'sun' };
const puzzleStyles = Object.entries(BANDS)
  .map(([id, band]) => ({ id, palette: { band: palette[band] } }));
// #endregion

// The folio in a disc of the puzzle's colour; the book's title or the puzzle's beside it.
const disc = (parity, edge, x) => text(`folio-${parity}`, '{pageNumber}', DISPLAY, 12,
  pin('page', edge, x, PAGE - 14, { width: mm(8), height: mm(8) }), { parity, lineHeight: 1,
    align: 'center', verticalAlign: 'middle',
    box: { backgroundColor: col('band'), borderRadius: mm(4) } });
const running = (parity, edge, x, content) => text(`title-${parity}`, content, LABEL, 7.5,
  pin('page', edge, x, PAGE - 11.7), { ...CAPS, parity, color: col('muted') });
const footer = { elements: [
  disc('even', 'top-left', MARGIN), running('even', 'top-left', MARGIN + 11, '{title}'),
  disc('odd', 'top-right', -MARGIN), running('odd', 'top-right', -MARGIN - 11, '{chapterTitle}'),
] };
// The answer page trades its running title for the colophon of '# Answers {colophon="…"}'.
const colophon = (parity, edge, x) => text(`colophon-${parity}`, '{attr.colophon}', LABEL, 7,
  pin('page', edge, x, PAGE - 11.5), { parity, color: col('muted') });
Object.assign(puzzleStyles.find(({ id }) => id === 'soluciones'), { footer: { elements: [
  ...footer.elements.filter(({ id }) => id.startsWith('folio')),
  colophon('even', 'top-right', -MARGIN), colophon('odd', 'top-left', MARGIN)] } });

// The cover: the drawing over the whole page, the title on its sky, a name line on the sea.
const cover = { id: 'portada', header: { elements: [] },
  footer: { elements: [] }, advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'portada',
      placement: pin('page', 'top-left', 0, 0, { width: mm(PAGE), height: mm(PAGE) }) },
    text('kicker', '{attr.kicker}', LABEL, 8.5, pin('page', 'top-left', MARGIN, 18), CAPS),
    text('title', '{titleText}', DISPLAY, 58, pin('#kicker', 'below', -0.8, 3,
      { width: mm(120) }), { lineHeight: 0.95 }),
    text('subtitle', '{attr.subtitle}', TEXT, 15, pin('#title', 'below', 0.8, 3),
      { fontWeight: 600 }),
    text('age', '{attr.age}', LABEL, 9.5, pin('#subtitle', 'below', 0, 5), { ...CAPS,
      box: { backgroundColor: col('coral'), borderRadius: mm(3.6),
        padding: { top: mm(1.8), right: mm(3.4), bottom: mm(1.8), left: mm(3.4) } } }),
    // The field fills the calm band between the wave stripes at 173 and 190 mm.
    { kind: 'box', id: 'name-field', style: { backgroundColor: col('paper'),
      borderRadius: mm(3) }, placement: pin('page', 'top-left', MARGIN, 176.9,
      { width: mm(104), height: mm(9) }) },
    text('name', '{attr.name}', LABEL, 8.5, pin('page', 'top-left', MARGIN + 5, 180.2), CAPS),
    { kind: 'rule', id: 'name-line', direction: 'horizontal', thickness: pt(0.75),
      color: col('muted'), placement: pin('page', 'top-left', MARGIN + 27, 183.2,
        { width: mm(72) }) },
  ] } } };

const chip = (id, fill) => ({ id, fontFamily: LABEL, fontSize: em(0.8), bold: true,
  background: col(fill), borderColor: col(fill === 'paper' ? 'ink' : fill),
  borderWidth: pt(0.75), borderRadius: em(1), paddingX: em(0.45) });

// resourceTypes and ANSWER_GAP are declared with the answers below: config() runs later.
const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  colorPalette, resourceTypes, tableStyle, tableStyles, footer, header: { elements: [] },
  page: { width: mm(PAGE), height: mm(PAGE), dpi: 150, margins: { top: mm(MARGIN),
    bottom: mm(MARGIN), left: mm(MARGIN), right: mm(MARGIN) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), // in the boxes too: their bold ignores the palette in 1.4.1
    textAlign: 'left', firstLineIndent: mm(0), paragraphSpacing: true },
  // The H1 line under each design is still measured: in Lilita One, not in Open Sans 700.
  headings: { fontFamily: DISPLAY, fontWeight: 400, levels: [
    puzzleLevel,
    { level: 3, fontFamily: LABEL, fontWeight: 700, fontSize: pt(8.5), lineHeight: pt(13),
      textTransform: 'uppercase', marginBottom: pt(3) },
  ] },
  headingStyles: [cover, ...puzzleStyles],
  // The word bank: ink on paper and coral, colours no puzzle's palette changes
  // (gotcha: section-palette-skips-chips).
  chipStyles: [chip('palabra', 'paper'), chip('hallada', 'coral')],
  calloutStyles: [
    { id: 'pistas', background: col('tint'), borderRadius: mm(3), columnGap: mm(8),
      padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
      marginTop: pt(0), // the grid above already leaves a line
      body: { fontSize: pt(10), lineHeight: pt(13), paragraphSpacing: false } },
    { id: 'soluciones', backgroundEnabled: false, columnGap: mm(ANSWER_GAP), // columns only
      padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) } },
    { id: 'dato', background: col('tint'), borderRadius: mm(3), columnGap: mm(6),
      padding: { top: mm(4), right: mm(5), bottom: mm(4.5), left: mm(5) },
      titleStyle: { fontFamily: DISPLAY, fontSize: pt(15), fontWeight: 400 },
      body: { fontSize: pt(10), lineHeight: pt(14) } },
  ],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8), gap: mm(2) },
  paragraphStyles: [{ id: 'banco', textAlign: 'center' }], // the word bank's two rows
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the booklet's text, clues and word bank
const crosswordText = /* @content:crossword */ ''; // nine lines: letters, # for a black square
const searchText = /* @content:wordsearch */ ''; // the words to find, then twelve lines

// #region art: the cover, the waves, the nest and the maze, drawn in the page's colours
const n = (v) => +v.toFixed(2);
function mulberry32(seed) { // a seeded PRNG: the same maze in every capture
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
// No words in the drawings: an SVG drawn as an image cannot see the page's fonts
// (gotcha: svg-no-webfonts). Start and finish are pictures instead.
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const P = palette;
const wave = (y, amp, len, x0, x1) => { // a sine line from x0 to x1, one crest per len
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return d;
};
function turtle(x, y, s, turn = 0) { // a hatchling seen from above, s mm long, head up at 0°
  const line = `stroke="${P.ink}" stroke-width="0.45" stroke-linejoin="round"`;
  const skin = (d) => `<path d="${d}" fill="${P.paper}" ${line}/>`;
  return `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${n(s / 12)})">`
    + skin('M-2.4 -1.6Q-6.8 -4.4 -7 -0.4Q-4.4 -0.6 -2.6 0.6Z') // front flippers
    + skin('M2.4 -1.6Q6.8 -4.4 7 -0.4Q4.4 -0.6 2.6 0.6Z')
    + skin('M-1.8 3Q-4.2 4.4 -3.6 5.9Q-2 5.2 -1 4Z') + skin('M1.8 3Q4.2 4.4 3.6 5.9Q2 5.2 1 4Z')
    + `<ellipse cy="-5.3" rx="1.7" ry="2" fill="${P.paper}" ${line}/>`
    + `<ellipse cy="0.4" rx="3.5" ry="4.5" fill="${P.mint}" ${line}/>`
    + `<path d="M0 -2L1.4 -1V1.4L0 2.4L-1.4 1.4V-1ZM0 -2V-4.1M0 2.4V4.9M1.4 -1L3.1 -2.2`
    + `M-1.4 -1L-3.1 -2.2M1.4 1.4L3.2 2.6M-1.4 1.4L-3.2 2.6" fill="none" stroke="${P.ink}" `
    + 'stroke-width="0.35"/>'
    + `<circle cx="-0.7" cy="-5.9" r="0.32" fill="${P.ink}"/>`
    + `<circle cx="0.7" cy="-5.9" r="0.32" fill="${P.ink}"/></g>`;
}
function coverArt() { // sky, a low sun, a striped sea, a boat, two gulls and a turtle
  const H = PAGE, sea = 112;
  let g = `<rect width="${PAGE}" height="${H}" fill="${P.tint}"/>`
    + `<circle cx="152" cy="${sea - 8}" r="46" fill="${P.sun}"/>`
    + `<rect y="${sea}" width="${PAGE}" height="${H - sea}" fill="${P.band}"/>`;
  for (let i = 0, y = sea + 9; y < H; i++, y += 9 + i * 1.6) { // stripes widen towards us
    g += `<path d="${wave(y, 1.2 + i * 0.25, 18 + i * 3, -9, PAGE + 20)}" fill="none" `
      + `stroke="${P.paper}" stroke-width="${n(1.1 + i * 0.35)}" stroke-linecap="round"/>`;
  }
  [[6, 34], [12, 22], [19, 12]].forEach(([dy, w]) => { // the sun's path on the water
    g += `<rect x="${152 - w / 2}" y="${sea + dy - 1}" width="${w}" height="2.2" rx="1.1" `
      + `fill="${P.sun}"/>`;
  });
  g += `<path d="M26 ${sea - 0.4}h15l-2.4 3.6h-10.4z" fill="${P.ink}"/>` // a boat on the line
    + `<path d="M33.6 ${sea - 1.6}v-15l8 13.6z" fill="${P.coral}"/>`
    + `<path d="M32.6 ${sea - 1.6}v-11.6l-6 11.6z" fill="${P.paper}"/>`;
  [[118, 34, 5], [131, 27, 3.6]].forEach(([x, y, w]) => { // two gulls
    g += `<path d="M${x - w} ${y}q${w / 2} -${w / 2} ${w} 0q${w / 2} -${w / 2} ${w} 0" `
      + `fill="none" stroke="${P.ink}" stroke-width="0.8" stroke-linecap="round"/>`;
  });
  return svg(PAGE, H, g + turtle(160, 170, 22, -35));
}
const surf = () => svg(PAGE, 3.2, `<path d="${wave(3.2, 1.6, 12, 0, PAGE + 12)} V3.2 H0Z" `
  + `fill="${P.paper}"/>`);
function nestArt() { // a cutaway beach: the eggs under the sand, two hatchlings on their way
  const W = 80, H = 46, shore = [46, 15.5], deep = [W, 40]; // the sand slopes under the sea
  const slope = (y) => shore[0] + ((y - shore[1]) / (deep[1] - shore[1])) * (deep[0] - shore[0]);
  let g = `<rect width="${W}" height="${H}" fill="${P.tint}"/>` // the box's own tint as sky
    + `<path d="M0 13.6Q13 11.4 25 13.8T${shore[0]} ${shore[1]}L${deep[0]} ${deep[1]}V${H}H0Z" `
    + `fill="${P.sun}"/><path d="M${shore[0]} ${shore[1]}H${W}V${deep[1]}Z" fill="${P.band}"/>`;
  for (let y = shore[1] + 5; y < deep[1] - 2; y += 5) { // ripples, from the slope outwards
    g += `<path d="${wave(y, 0.5, 4, n(slope(y) + 2), W + 4)}" fill="none" `
      + `stroke="${P.paper}" stroke-width="0.55"/>`;
  }
  g += `<ellipse cx="22" cy="33" rx="12.5" ry="8" fill="${P.tint}"/>`; // the egg chamber
  [[36.9, 5], [33.1, 4], [29.3, 3]].forEach(([y, count]) => { // the clutch, row on row
    for (let i = 0; i < count; i++) {
      g += `<circle cx="${n(22 + (i - (count - 1) / 2) * 4.35)}" cy="${y}" r="2.05" `
        + `fill="${P.paper}" stroke="${P.ink}" stroke-width="0.35"/>`;
    }
  });
  return svg(W, H, g + turtle(33, 10.4, 7, 100) + turtle(44.5, 12.4, 7, 112));
}
function maze(cols, rows, seed) { // a recursive backtracker: one path between any two squares
  const rand = mulberry32(seed);
  const open = new Set(); // passages, as 'r,c>r,c'
  const seen = new Set(['0,0']);
  const stack = [[0, 0]];
  const around = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  while (stack.length) {
    const [r, c] = stack.at(-1);
    const next = around(r, c).filter(([y, x]) =>
      y >= 0 && y < rows && x >= 0 && x < cols && !seen.has(`${y},${x}`));
    if (!next.length) { stack.pop(); continue; }
    const [y, x] = next[Math.floor(rand() * next.length)];
    open.add(`${r},${c}>${y},${x}`).add(`${y},${x}>${r},${c}`);
    seen.add(`${y},${x}`);
    stack.push([y, x]);
  }
  const passes = (a, b) => open.has(`${a}>${b}`);
  const queue = [[0, 0]]; // the way out, by breadth-first search
  const from = new Map([['0,0', null]]);
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [y, x] of around(r, c)) {
      if (from.has(`${y},${x}`) || !passes(`${r},${c}`, `${y},${x}`)) continue;
      from.set(`${y},${x}`, `${r},${c}`);
      queue.push([y, x]);
    }
  }
  const route = [];
  for (let at = `${rows - 1},${cols - 1}`; at; at = from.get(at)) {
    route.unshift(at.split(',').map(Number));
  }
  return { cols, rows, passes, route };
}
function mazeArt(m, unit, { solved = false } = {}) {
  // Sand above the maze for the nest and sea below it. The answer is square, as deep as
  // the answer grids beside it, so the three captions share a line: the rest of the
  // square goes to the sea, where the hatchling swims, with waves drawn k times larger.
  const side = 1.5, W = m.cols * unit + 2 * side, top = (solved ? 2.4 : 1.6) * unit;
  const foot = solved ? W - m.rows * unit - top : 1.6 * unit, k = solved ? 2 : 1;
  const H = m.rows * unit + top + foot;
  const X = (c) => n(side + c * unit), Y = (r) => n(top + r * unit);
  let walls = `M${X(1)} ${Y(0)}H${X(m.cols)}V${Y(m.rows)}M${X(m.cols - 1)} ${Y(m.rows)}`
    + `H${X(0)}V${Y(0)}`; // the frame, open above the first square and below the last
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const [here, right, below] = [`${r},${c}`, `${r},${c + 1}`, `${r + 1},${c}`];
      if (c < m.cols - 1 && !m.passes(here, right)) walls += `M${X(c + 1)} ${Y(r)}V${Y(r + 1)}`;
      if (r < m.rows - 1 && !m.passes(here, below)) walls += `M${X(c)} ${Y(r + 1)}H${X(c + 1)}`;
    }
  }
  // The nest above the entrance, the sea below the exit.
  const shore = H - foot + 4;
  let g = `<rect width="${W}" height="${H}" fill="${P.tint}"/>`
    + `<path d="${wave(shore, 1.4 * k, 12 * k, 0, W + 12 * k)}V${H}H0Z" fill="${P.band}"/>`;
  for (let y = shore + 5 * k; y < H; y += 4.5 * k) {
    g += `<path d="${wave(y, 0.8 * k, 10 * k, 0, W + 10 * k)}" fill="none" `
      + `stroke="${P.paper}" stroke-width="${0.7 * k}"/>`;
  }
  const [nx, ny] = [X(0.5), top - 7.5]; // a hollow in the sand and two empty shells
  g += `<ellipse cx="${nx}" cy="${ny}" rx="${unit * 0.6}" ry="3.6" fill="${P.sun}"/>`
    + [[nx + unit * 0.95, ny - 1.2], [nx + unit * 1.35, ny + 1.4]].map(([ex, ey]) =>
      `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="1.5" ry="1.9" fill="${P.paper}" `
      + `stroke="${P.ink}" stroke-width="0.4"/>`).join('');
  if (solved) { // the way out in coral, from the nest into the water, and the hatchling
    const pts = m.route.map(([r, c]) => `${X(c + 0.5)} ${Y(r + 0.5)}`);
    g += `<path d="M${X(0.5)} ${Y(0) - side}L${pts.join('L')}`
      + `L${X(m.cols - 0.5)} ${shore + 3}" fill="none" stroke="${P.coral}" `
      + `stroke-width="${n(unit * 0.3)}" stroke-linecap="round" stroke-linejoin="round"/>`
      + turtle(X(m.cols - 2.5), n(shore + foot / 2), unit * 1.8, 165);
  } else g += turtle(nx, ny + 0.5, unit * 1.05, 180);
  g += `<path d="${walls}" fill="none" stroke="${P.ink}" stroke-width="${n(unit * 0.12)}" `
    + 'stroke-linecap="round"/>';
  return { markup: svg(n(W), n(H), g), width: W, height: H };
}
const theMaze = maze(17, 9, 2027);
const drawings = { portada: { markup: coverArt(), width: PAGE, height: PAGE },
  olas: { markup: surf(), width: PAGE, height: 3.2 },
  nido: { markup: nestArt(), width: 80, height: 46 },
  laberinto: mazeArt(theMaze, 10),
  'sol-laberinto': mazeArt(theMaze, 10, { solved: true }) };
for (const [id, { markup }] of Object.entries(drawings)) await loadSvg(`${id}.svg`, markup);
const picture = (id, typeId, extra) => ({ id, typeId, kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: drawings[id].width * 10, height: drawings[id].height * 10 },
  ...extra });
// #endregion

const words = searchText.trim().split('\n')[0].split(' '); // the first one comes found
const share = (count, size) => (count * size) / MEASURE; // a grid's share of the measure
const puzzles = [
  grid('crucigrama', 'plain', crossword(crosswordText), 'crucigrama',
    share(9, CELL / PT_PER_MM), { altText: t({ en: 'An empty crossword, nine squares a side',
      es: 'Un crucigrama vacío de nueve por nueve' }) }),
  grid('sopa', 'plain', wordSearch(searchText, [[words[0], 'coral']]), 'sopa',
    share(12, CELL / PT_PER_MM), { altText: t({ en: 'A word search, twelve letters a side',
      es: 'Una sopa de letras de doce por doce' }) }),
  picture('laberinto', 'plain', { placement: here(1), altText: t({
    en: 'A maze from a turtle nest to the sea', es: 'Un laberinto desde un nido hasta el mar' }) }),
  picture('nido', 'plain', { placement: here(1), altText: t({
    en: 'Eggs under the sand, two hatchlings on their way to the sea',
    es: 'Huevos bajo la arena y dos crías camino del mar' }) }),
  picture('portada', 'plain', { altText: t({ en: 'A low sun, a sailing boat and a turtle at sea',
    es: 'Un sol bajo, un velero y una tortuga en el mar' }) }),
  picture('olas', 'plain', { altText: '' }), // the field's wavy foot: decoration
];

// #region answers: the answer page reuses the puzzles' data; a resource type numbers it
const resourceTypes = [ // a plain resource prints no caption; an answer is numbered
  { id: 'plain', name: 'Plain', shortLabel: '', captionPrefix: '' },
  { id: 'solucion', ...t({ en: { name: 'Solution', captionPrefix: 'Solution' },
    es: { name: 'Solución', captionPrefix: 'Solución' } }), shortLabel: 'Sol.' },
].map((type) => ({ numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  ...type }));
const ANSWER_GAP = 6; // mm between the three answers
const ANSWER_WIDTH = KEY / ((MEASURE - 2 * ANSWER_GAP) / 3); // 54 mm of a 55.3 mm column
const answers = [
  grid('sol-crucigrama', 'solucion', crossword(crosswordText, true), 'solucion-9', ANSWER_WIDTH,
    { caption: t({ en: 'Crossword', es: 'Crucigrama' }) }),
  grid('sol-sopa', 'solucion', wordSearch(searchText, words.map((w) => [w, 'mint'])),
    'solucion-12', ANSWER_WIDTH, { caption: t({ en: 'Word search', es: 'Sopa de letras' }) }),
  picture('sol-laberinto', 'solucion', { placement: here(ANSWER_WIDTH), caption: t({
    en: 'Maze', es: 'Laberinto' }), altText: t({ en: 'The maze and its way out to the sea',
    es: 'El laberinto y su salida al mar' }) }),
];
// #endregion
const resources = [...puzzles, ...answers];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Lexend: ['400', '600', '700'], 'Lilita One': ['400'], 'Chivo Mono': ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = [markdown, crosswordText, searchText].join('\n');
await loadFonts(FONTS, allText);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), allText);
showPages(doc, { title: t({ en: 'Summer Workbook · Puzzles from the sea',
  es: 'Cuaderno de verano · Pasatiempos del mar' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
