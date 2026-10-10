// ═══ Postext Cookbook · Nº 035 · Garden almanac: calendar grid and landscape chart ═════
// https://postext.dev/en/cookbook/garden-almanac
// Code: MIT · Text: original, Italian (CC BY 4.0) · Field: diffusion models · Icons: CC BY 4.0
// Fonts: Piazzolla, Gilda Display, Commissioner (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage, parseTSV,
  mergeCells, setCellContent, setCellBackground, setCellImage, setAlignment,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'garden-almanac';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#262a22', paper: '#fbf8ef', // a green-black on unbleached paper
  red: '#a2372a', // Sundays and feasts, as almanacs print them; kickers and labels
  green: '#5b8a32', ochre: '#d39a2e', brown: '#7a5230', // sown outdoors, in a seedbed, planted
  leaf: '#bfdaa2', blush: '#f3cdbd', cream: '#e9ddc1', // good pairs, bad pairs, neutral pairs
  sky: '#cfe2e6', rule: '#cfc6b2', muted: '#6b6e63' }; // sky and work box; hairlines; notes
// 1.4.1 design slots read the hex, not the id: col() writes both (gotcha: palette-skips-designs)
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.red }) // the defaults' id
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Piazzolla', 'Gilda Display', 'Commissioner'];
const PAGE = { w: 210, h: 280, top: 22, bottom: 21, inner: 18, outer: 16 }; // mm, mirrored
const LEAD = 14; // pt: the body's leading and baseline grid
const at = (row, column) => ({ row, col: column });
const span = (r0, c0, r1, c1) => ({ start: at(r0, c0), end: at(r1, c1) });
const chip = (text, style) => `:chip[${text}]{style="${style}"}`;

// #region answer: a crops × fortnights chart, turned to landscape on pages of its own
// The chart's `placement` (#region resources): a quarter turn makes it a page-span float on
// pages of its own, flush to the spine; rows past the page's width go on under a repeated head.
const chartPlacement = { rotate: 'ccw' }; // a float: 'here' ignores the turn
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const SEASONS = [['INVERNO', 2], ['PRIMAVERA', 3], ['ESTATE', 3], ['AUTUNNO', 3], ['INVERNO', 1]];
const STATES = { S: 'ochre', C: 'green', T: 'brown' }; // seedbed, sown outdoors, planted out
const fortnight = (key) => MONTHS.indexOf(key.slice(0, 3)) * 2 + Number(key[3]); // 'mar2' → 6
function sowingChart(data) { // 'Pomodoro: S feb2–mar2, T apr2–mag2'; a bare line is a family
  const row = (first, isHeader = false) => [first, ...Array(24).fill('')]
    .map((content) => ({ content, isHeader }));
  let m = { headerRowCount: 2, columnWidths: [30, ...Array(24).fill(8.5)], // mm, as weights
    rows: [row('', true), row('', true)] };
  for (const line of data.trim().split('\n')) {
    const [name, plan] = line.split(': ');
    const r = m.rows.push(row(plan ? name : chip(name.toUpperCase(), 'famiglia'))) - 1;
    if (!plan) { m = mergeCells(m, span(r, 0, r, 24)); continue; } // a family heads its crops
    for (let f = 1; f <= 24; f++) { // every other month tinted, so a column reads down the page
      if ((f - 1) % 4 < 2) m = setCellBackground(m, at(r, f), col('cream'));
    }
    for (const step of plan.split(', ')) { // 'S feb2–mar2': one state over a run of fortnights
      const [state, range] = step.split(' ');
      const [from, to = from] = range.split('–').map(fortnight);
      for (let f = from; f <= to; f++) m = setCellBackground(m, at(r, f), col(STATES[state]));
    }
  }
  // Merged heads: 'Coltura' down both rows, each season over its months, each month over its
  // two fortnights. mergeCells marks the covered cells hiddenBy (gotcha: merged-cells-hiddenby).
  const merge = (r0, c0, r1, c1, content) => { // the head's text goes in its first cell
    m = mergeCells(setCellContent(m, at(r0, c0), content), span(r0, c0, r1, c1));
  };
  merge(0, 0, 1, 0, 'Coltura');
  let c = 1;
  for (const [name, n] of SEASONS) { merge(0, c, 0, c + 2 * n - 1, name); c += 2 * n; }
  MONTHS.forEach((month, i) => merge(1, 2 * i + 1, 1, 2 * i + 2, month.toUpperCase()));
  for (const r of [0, 1]) for (let f = 1; f <= 24; f++) m = setAlignment(m, at(r, f), 'center');
  return setCellBackground(m, at(1, fortnight('mar1')), col('red')); // this month's head
}
// #endregion

// #region calendar: the month grid from real dates: weekdays, Easter, the moon's quarters
const [YEAR, MONTH, DAY] = [2027, 3, 24 * 60 * 60 * 1000]; // DAY in ms
const epochDay = (m, d) => Date.UTC(YEAR, m - 1, d) / DAY; // 1 January 1970 was a Thursday
const weekday = (d) => (epochDay(MONTH, d) + 3) % 7; // 0 is Monday: Italian weeks start there
function easter(y) { // the Gregorian computus (Meeus): [month, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4);
  const g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * (b % 4) + 2 * i - h - k) % 7;
  const n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}
// The moon's age: mean synodic months since the new moon of 6 January 2000 at 18.14 UT.
const [SYNODIC, NEW_MOON] = [29.530588853, Date.UTC(2000, 0, 6, 18, 14) / DAY];
const quarter = (day) => Math.floor((((day - NEW_MOON) % SYNODIC) / SYNODIC) * 4); // 0–3
const PHASES = ['luna-nuova', 'primo-quarto', 'luna-piena', 'ultimo-quarto'];
const JOINER = '\u2060'; // a word joiner: the second line of a day without a note
const DAYS = ['LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO', 'DOMENICA'];
function calendarTable() { // the grid, and the quarters it draws, listed for the caption
  const e = epochDay(...easter(YEAR)) - epochDay(MONTH, 0); // Easter as a day of MONTH: 28 in 2027
  const feasts = { [e - 7]: 'Le Palme', [e]: 'Pasqua', [e + 1]: 'Pasquetta' };
  const notes = { 19: 'S. Giuseppe', 20: 'Equinozio' }; // March 2027's, typed by hand
  const first = weekday(1), days = epochDay(MONTH + 1, 1) - epochDay(MONTH, 1), moons = [];
  const week = (names, isHeader) => names.flatMap((content) => [content, '']) // a day: moon, date
    .map((content) => ({ content, isHeader }));
  let m = { headerRowCount: 1, columnWidths: Array(7).fill([7, 18]).flat(), rows: [week(DAYS, true),
    ...Array.from({ length: Math.ceil((first + days) / 7) }, () => week(Array(7).fill('')))] };
  for (let d = 1; d <= days; d++) {
    const r = 1 + Math.floor((first + d - 1) / 7), c = 2 * weekday(d), sunday = c === 12;
    // Sundays and feasts print in red. Every day has a second line, so all weeks are as tall.
    const note = feasts[d] ? chip(feasts[d], 'festa') : notes[d] ? chip(notes[d], 'nota') : JOINER;
    m = setCellContent(m, at(r, c + 1), `${sunday || feasts[d] ? chip(d, 'rosso') : d}\n${note}`);
    const fill = d === e || d === e + 1 ? 'blush' : sunday ? 'cream' : null;
    if (fill) for (const k of [c, c + 1]) m = setCellBackground(m, at(r, k), col(fill));
    const midnight = epochDay(MONTH, d) - 1 / 24, q = quarter(midnight + 1); // 00.00 CET
    if (q === quarter(midnight)) continue;
    m = setCellImage(m, at(r, c), { resourceId: PHASES[q] }); // a quarter begins today
    moons.push(`${PHASES[q].replace('-', ' ')} ${[1, 8, 11].includes(d) ? 'l’' : 'il '}${d}`);
  }
  for (let i = 0; i < 7; i++) m = mergeCells(m, span(0, 2 * i, 0, 2 * i + 1)); // one head a day
  return { model: setCellBackground(m, at(0, 12), col('red')), moons: moons.join(', ') };
}
// #endregion

// #region matrix: companion pairs pasted as TSV; each symbol becomes a palette fill
const FILLS = { '+': 'leaf', '−': 'blush', '': 'cream' }; // good, bad, no known effect
function companionTable(tsv) {
  let m = { ...parseTSV(tsv), headerRowCount: 1, columnWidths: [26, ...Array(10).fill(15)] };
  for (let r = 1; r < m.rows.length; r++) {
    m = setAlignment(m, at(r, 0), 'left', 'middle');
    for (let c = 1; c < m.rows[r].length; c++) {
      const symbol = m.rows[r][c].content; // + and − stay printed, for greyscale copies
      m = setCellContent(m, at(r, c), symbol && symbol !== '=' ? chip(symbol, 'segno') : '');
      m = symbol === '=' // the diagonal pairs a crop with itself: its picture instead
        ? setCellImage(m, at(r, c), { resourceId: `veg-${r}`, width: 0.62 })
        : setCellBackground(m, at(r, c), col(FILLS[symbol]));
      m = setAlignment(m, at(r, c), 'center', 'middle');
    }
  }
  for (let c = 1; c <= 10; c++) m = setAlignment(m, at(0, c), 'center');
  return m;
}
// #endregion

// #region styles: one house table style and a named variant for each of the three tables
const tableStyle = { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
  headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: LABEL,
  headerFontSize: pt(7), bodyFontSize: pt(8.5), cellPadding: mm(1.2),
  // 1.4.1 has continuation strings in English and Spanish only (gotcha: resource-types-locale).
  continuedSuffix: '(segue)', continuesMarker: 'Continua alla pagina seguente' };
const tableStyles = [
  { id: 'calendario', bodyFontFamily: DISPLAY, bodyFontSize: pt(15), cellPadding: mm(1.4) },
  { id: 'matrice', rules: 'grid', borderColor: col('paper'), borderWidth: pt(2), // tiles
    headerBackgroundEnabled: false, headerColor: col('ink'), headerFontSize: pt(6.8) },
  { id: 'semine', rules: 'grid', borderColor: col('paper'), borderWidth: pt(1),
    bodyFontSize: pt(7.8), headerFontSize: pt(6.6), cellPadding: mm(1.1) },
];
// #endregion

// #region opener: the month on a painting, with its proverb from the heading's attributes
const ART_H = 92, AIR = 5, BEARING = 1.5; // mm: painting, air under it, side bearing of the 84 pt M
const pin = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) }); // to: 'page', or '#id' of an element listed before
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  align: placement.anchor.edge.endsWith('right') ? 'right' : 'left',
  overflow: 'wrap', ...extra }); // not '…' at the edge (gotcha: overflow-ellipsis-default)
const caps = (s) => ({ fontWeight: 600, textTransform: 'uppercase', letterSpacing: pt(s / 5) });
// The painting reserves nothing (gotcha: opener-image-no-reserve), so the text starts on the
// first grid line at least AIR under it.
const OPENER_H = pt(LEAD * Math.ceil((ART_H + AIR - PAGE.top) / (LEAD * 25.4 / 72)));
const opener = { enabled: true, minHeight: OPENER_H, slot: { elements: [
  { kind: 'image', id: 'art', resourceId: 'campo',
    placement: pin('page', 'top-left', 0, 0, { width: mm(PAGE.w), height: mm(ART_H) }) },
  text('kicker', '{attr.kicker}', LABEL, 8.5, 'red', pin('page', 'top-left', PAGE.inner, 12),
    caps(8.5)), // page 1 is a recto: its inner margin is on the left
  text('title', '{titleText}', DISPLAY, 84, 'ink', pin('#kicker', 'below', -BEARING, 1),
    { lineHeight: 1 }), // a multiple, never pt() (gotcha: design-lineheight-multiple)
  text('proverb', '{attr.proverb}', TEXT, 12.5, 'ink',
    pin('#title', 'below', BEARING, 1, { width: mm(140) }), { italic: true, lineHeight: 1.3 }),
  text('source', '{attr.source}', LABEL, 7, 'ink', pin('#proverb', 'below', 0, 1.6), caps(7)),
] } };
// #endregion

const head = (id, content, parity, x, extra) => text(id, content, LABEL, 7.5, 'muted',
  pin('page', x > 0 ? 'top-left' : 'top-right', x, 12), { ...caps(7.5), parity, pages: 'body',
    ...extra }); // body pages only: the opener has its drawing, and a folio at the foot
const folio = { fontFamily: DISPLAY, fontSize: pt(11), fontWeight: 400, letterSpacing: pt(0),
  color: col('red') };
const header = { elements: [head('verso-folio', '{pageNumber}', 'even', PAGE.outer, folio),
  head('verso-title', '{title}', 'even', PAGE.outer + 10),
  head('recto-title', '{chapterTitle}', 'odd', -(PAGE.outer + 10)),
  head('recto-folio', '{pageNumber}', 'odd', -PAGE.outer, folio)] };
const footer = { elements: [text('drop-folio', '{pageNumber}', DISPLAY, 11, 'red',
  pin('page', 'bottom', 0, -12), { pages: 'opener', align: 'center' })] }; // the opener's folio
const bare = (id, extra) => ({ id, backgroundEnabled: false, borderWidth: pt(0),
  paddingX: pt(0), ...extra }); // a chip that is only a change of face, size or colour
const note = (color) => ({ fontFamily: TEXT, fontSize: em(0.5), italic: true, color: col(color) });

const config = () => ({
  locale: 'it', resourceTypes, colorPalette, tableStyle, tableStyles, header, footer,
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, backgroundColor: col('paper'),
    pageNumbering: { startAt: 27 }, margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom),
      left: mm(PAGE.inner), right: mm(PAGE.outer), mirror: true } }, // March opens on p. 27
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.8), lineHeight: pt(LEAD), color: col('ink'),
    boldFontWeight: 600, boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), referenceBold: false, firstLineIndent: mm(4),
    indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.6 }, // from 0.6 and 2
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('ink'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: opener, marginBottom: pt(0) },
    { level: 2, fontSize: pt(17), lineHeight: pt(2 * LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) },
  ] },
  chipStyles: [bare('rosso', { color: col('red') }), bare('nota', note('muted')),
    bare('festa', note('red')), bare('segno', { fontFamily: LABEL, fontSize: em(1.4), bold: true }),
    bare('famiglia', { fontFamily: LABEL, fontSize: em(0.85), bold: true, color: col('red') })],
  calloutStyles: [
    { id: 'lavori', title: 'Lavori del mese', span: 'page', background: col('sky'),
      padding: { top: mm(3.5), right: mm(5), bottom: mm(4), left: mm(5) }, columnGap: mm(7),
      titleStyle: { fontFamily: LABEL, fontSize: pt(8), ...caps(8), color: col('red') },
      body: { fontSize: pt(9.2), lineHeight: pt(13) } },
    { id: 'colonna', backgroundEnabled: false, padding: { top: mm(0), right: mm(0), // no frame
      bottom: mm(0), left: mm(0) }, lists: { gap: mm(2.2), itemSpacing: pt(2) },
      titleStyle: { fontFamily: TEXT, fontSize: pt(9.2), italic: true, fontWeight: 400,
        color: col('ink') } },
  ],
  unorderedLists: { bulletChar: '–', color: col('red'), fontWeight: 400 },
  captionStyle: { fontSize: pt(8.5), labelColor: col('red'), gap: mm(2),
    note: { fontSize: pt(7.5), color: col('muted') } },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10), textAlign: 'left',
    color: col('muted'), firstLineIndent: pt(0), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the month's text, in Italian
const sowing = /* @content:semine */ ''; // one line per crop, grouped by family
const companions = /* @content:consociazioni */ ''; // TSV: + good, − bad, blank neutral

// #region art: four moon phases and ten crops, drawn in the page's colours
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const ART = { carrot: '#df7a2e', garlic: '#f4ecdc', cabbage: '#7fa38c', potato: '#c9a066',
  dark: '#3f6b22' };
// The moon cell is 4.2 mm wide inside its padding, so a viewBox unit is 0.42 mm: the disc drops
// 5.2 units (2.2 mm) to sit level with the day's figures in the next cell.
const MOON_DROP = 5.2;
function moon(phase) { // lit side in paper, the rest in ink: the northern hemisphere's view
  const [y, top, foot] = [5, 0.8, 9.2].map((v) => v + MOON_DROP);
  const disc = (fill, extra = '') => `<circle cx="5" cy="${y}" r="4.2" fill="${fill}"${extra}/>`;
  const half = (sweep) => `<path d="M5 ${top}A4.2 4.2 0 0 ${sweep} 5 ${foot}Z" `
    + `fill="${palette.paper}"/>`;
  const lit = { 'luna-nuova': '', 'primo-quarto': half(1), 'luna-piena': disc(palette.paper),
    'ultimo-quarto': half(0) }[phase];
  return svg(10, 10 + MOON_DROP, disc(palette.ink) + lit
    + disc('none', ` stroke="${palette.ink}" stroke-width="0.6"`));
}
const P = palette;
const VEG = { // 20 × 20 drawings, in the order of the matrix's rows
  pomodoro: `<circle cx="10" cy="11.5" r="7" fill="${P.red}"/><path d="M10 4.4l1.2 2.4 `
    + '2.6-.8-1.6 2 2 1.6-2.6.2-.2 2.4-1.4-2-1.4 2-.2-2.4-2.6-.2 2-1.6-1.6-2 2.6.8Z" '
    + `fill="${P.green}"/>`,
  basilico: `<path d="M10 19V6" stroke="${P.green}" stroke-width="1"/><ellipse cx="6.5" cy="12" `
    + `rx="4.2" ry="2.4" transform="rotate(-30 6.5 12)" fill="${P.green}"/><ellipse cx="13.5" `
    + `cy="10" rx="4.2" ry="2.4" transform="rotate(30 13.5 10)" fill="${P.green}"/>`
    + `<ellipse cx="10" cy="4.5" rx="2" ry="3.4" fill="${ART.dark}"/>`,
  carota: `<path d="M6 6.5h8L10.6 19a.6.6 0 0 1-1.2 0Z" fill="${ART.carrot}"/><path d="M10 `
    + `6.5 7 1.5M10 6.5V1M10 6.5l3-5" stroke="${P.green}" stroke-width="1.1" `
    + 'stroke-linecap="round"/>',
  cipolla: '<path d="M10 3c1 3.5 6.5 5.5 6.5 10.2C16.5 17 13.4 18.6 10 18.6S3.5 17 3.5 13.2C3.5 '
    + `8.5 9 6.5 10 3Z" fill="${P.ochre}"/><path d="M10 5.5c-2 3-3 6-2.4 12.6M10 5.5c2 3 3 6 `
    + `2.4 12.6" fill="none" stroke="${P.brown}" stroke-width="0.5"/>`,
  aglio: '<path d="M10 3.5c.8 3 6.2 5 6.2 9.5 0 3.8-3 5.5-6.2 5.5S3.8 16.8 3.8 13c0-4.5 5.4-6.5 '
    + `6.2-9.5Z" fill="${ART.garlic}" stroke="${P.brown}" stroke-width="0.5"/><path d="M10 `
    + '7v11.4M7 9.4c-1 3-1 6 0 8.6M13 9.4c1 3 1 6 0 8.6" fill="none" '
    + `stroke="${P.rule}" stroke-width="0.5"/>`,
  lattuga: `<circle cx="10" cy="11" r="7.4" fill="${P.green}"/><circle cx="7.2" cy="9.5" `
    + `r="3.6" fill="${P.leaf}"/><circle cx="12.8" cy="9.5" r="3.6" fill="${P.leaf}"/>`
    + `<circle cx="10" cy="12.6" r="3.8" fill="${P.leaf}"/><circle cx="10" cy="11" r="1.6" `
    + `fill="${P.green}"/>`,
  fagiolo: '<path d="M3 5c4 1 6 4 8 8s4 5 6.5 5.5c-2 1.5-6 .8-8.8-2.6C6 12.8 4.4 9 3 5Z" '
    + `fill="${P.green}"/>` + [[7.4, 10], [10.4, 13.6], [13.6, 16.2]].map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="1.2" fill="${P.leaf}"/>`).join(''),
  zucchina: '<rect x="2" y="8" width="16.5" height="5.4" rx="2.7" transform="rotate(-28 10 10.7)" '
    + `fill="${ART.dark}"/><path d="M4.4 14.6 15.6 8.6" stroke="${P.leaf}" stroke-width="0.6"/>`
    + `<path d="M17.4 5.2l1.8-1.2" stroke="${P.brown}" stroke-width="1.4" stroke-linecap="round"/>`,
  cavolo: `<circle cx="10" cy="11" r="7.6" fill="${ART.cabbage}"/><path d="M10 18.4V5.2M10 9 `
    + '6 6.4M10 12 5 9.6M10 9l4-2.6M10 12l5-2.4M10 15l-4.4-2M10 15l4.4-2" fill="none" '
    + `stroke="${P.leaf}" stroke-width="0.7"/>`,
  patata: `<path d="M4 9c1-4 7-5 11-3s3.6 8.4-.4 10.6S2.8 14 4 9Z" fill="${ART.potato}"/>`
    + [[8, 9], [12.6, 11.4], [9.2, 14]].map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r=".6" fill="${P.brown}"/>`).join(''),
};
// Each drawing is an SVG resource, registered for the canvas under its fileId.
const drawings = [...PHASES.map((p) => [p, moon(p), [10, 10 + MOON_DROP], p.replace('-', ' ')]),
  ...Object.entries(VEG).map(([name, body], i) => [`veg-${i + 1}`, svg(20, 20, body), [20, 20],
    name])];
const pictures = drawings.map(([id, , [w, h], altText]) => ({ id, typeId: 'figure', kind: 'svg',
  altText, createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * 10,
    height: h * 10 } })); // the size sets the aspect ratio: the cell or the design sets the width
for (const [id, markup] of drawings) await loadSvg(`${id}.svg`, markup);
// The opener's field is a watercolour, a JPEG in assets/ cut to 210 × ART_H mm, at its pixels.
pictures.push({ id: 'campo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  altText: 'Piantine appena nate in file sulla terra', bitmap: { fileId: 'campo-1680.jpg',
    format: 'jpeg', width: 1680, height: 736 } });
await loadImage('campo-1680.jpg', asset('campo-1680.jpg'));
// #endregion

// #region resources: the three tables, keyed by colour swatches in captions and notes
const resourceTypes = [ // 1.4.1 has English and Spanish ones (gotcha: resource-types-locale)
  { id: 'table', name: 'Tabella', shortLabel: 'Tab.', captionPrefix: 'Tabella',
    captionStyle: { position: 'above' } },
  { id: 'calendar', name: 'Calendario', shortLabel: 'Cal.', captionPrefix: '' }, // no label
].map((t) => ({ numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', ...t }));
const table = (id, typeId, caption, model, styleId, extra) => ({ id, typeId, kind: 'table',
  caption, table: { model, styleId }, createdAt: 0, updatedAt: 0, ...extra });
const foot = { position: 'bottom', span: 'page' }; // across both columns, at the page's foot
const calendar = calendarTable(); // its key names the quarters the grid draws
const resources = [...pictures, // never cited: the opener and the cells draw them by id
  table('calendario', 'calendar', ':swatch{color="cream"} domeniche · :swatch{color="blush"} '
    + `Pasqua e Pasquetta · ${calendar.moons}, sul mese sinodico medio: un giorno prima o dopo `
    + 'è possibile. Per tradizione in crescente si semina ciò che fruttifica sopra terra, in '
    + 'calante le radici.', calendar.model, 'calendario', { placement: foot }),
  table('consociazioni', 'table', 'Consociazioni tra dieci ortaggi', companionTable(companions),
    'matrice', { placement: foot, note: ':swatch{color="leaf"} + favorevole · '
      + ':swatch{color="blush"} − da evitare · :swatch{color="cream"} nessun effetto noto. '
      + 'Indicazioni della tradizione orticola.' }),
  // Each part of a split table repeats its caption, so the key goes there; the note ends the last.
  table('semine', 'table', 'Semine al Nord e al Centro, in pianura e collina: '
    + ':swatch{color="ochre"} in semenzaio protetto · :swatch{color="green"} in piena terra · '
    + ':swatch{color="brown"} trapianto o messa a dimora', sowingChart(sowing), 'semine', {
    placement: chartPlacement, note: 'Al Sud e lungo le coste le date si anticipano di '
      + 'due-quattro settimane; in montagna si ritardano.' }),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build
  Piazzolla: ['400', '400i', '600'], // text, notes and proverb; 600 for caption labels
  'Gilda Display': ['400'], Commissioner: ['600'] }; // display and days; labels and table heads

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = [markdown, sowing, companions].join('\n');
await prepareFonts(allText, config(), kitFonts(FONTS));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(),
  { ...kitFonts(FONTS), text: allText });
showPages(doc, { title: 'Almanacco dell’orto 2027 · Marzo' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
