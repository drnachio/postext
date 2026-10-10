// ═══ Postext Cookbook · Nº 053 · Conference programme with a merged schedule grid ═══════
// https://postext.dev/en/cookbook/conference-programme
// Code: MIT · Text: original, in Catalan (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Schibsted Grotesk, Unbounded, Chivo Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes, mergeCells, setCellContent, setCellBackground, setAlignment,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'conference-programme';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1d1b24', paper: '#ffffff', // a violet near-black; type on the ink fills
  tipo: '#b09cf2', digital: '#4fc7bb', edicio: '#f4b43a', // the three tracks: fills and swatches
  pause: '#ecebf1', // registration, breaks and meals
  accent: '#6a3ed3', // kickers, caption labels, the parts of the day
  muted: '#67636f', // running heads and notes
};
// 1.4.1 paints design slots from the hex, not the id: col() writes both
// (gotcha: palette-skips-designs)
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent }) // defaults' id
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Schibsted Grotesk', 'Unbounded', 'Chivo Mono'];
const PAGE = { w: 170, h: 240, top: 22, bottom: 20, inner: 17, outer: 15 }; // mm, mirrored
const LEAD = 13; // pt: the body's leading and baseline grid
const PT = 25.4 / 72; // mm in a point
const chip = (text, style) => `:chip[${text}]{style="${style}"}`;

// #region answer: a day's schedule as a table with merged cells, track fills and a head row
const ROOMS = ['Sala Gran', 'Sala de les Premses', 'Aula Taller'];
const TRACKS = { T: 'tipo', D: 'digital', E: 'edicio', '*': 'ink' }; // '*': a plenary
const at = (row, c) => ({ row, col: c });
const span = (r0, c0, r1, c1) => ({ start: at(r0, c0), end: at(r1, c1) });
const lines = (code, text) => text.split(' / ').map((line, i) => { // title, then speaker
  const run = i === 0 ? `**${line}**` : line;
  return code === '*' ? chip(run, 'blanc') : run; // paper-white type on the ink fill
}).join('\n'); // a line break in a cell starts a new paragraph
function schedule(text) { // '11.15 | T Title / Speaker | ^' · a bare line: a part of the day
  let m = { headerRowCount: 1, columnWidths: [12, 42, 42, 42], // weights of the 138 mm measure
    rows: [['Hora', ...ROOMS].map((room) => ({ content: room.toUpperCase(), isHeader: true }))] };
  for (const line of text.trim().split('\n')) {
    const [time, ...slots] = line.split(' | ');
    const r = m.rows.push(['', ...ROOMS].map(() => ({ content: '' }))) - 1; // four empty cells
    if (!slots.length) { // one cell across the table; a split keeps it with the rows it heads
      m = setCellContent(m, at(r, 0), chip(time.toUpperCase(), 'franja'));
      m = mergeCells(m, span(r, 0, r, 3));
      continue;
    }
    m = setCellContent(m, at(r, 0), chip(time, 'hora'));
    slots.forEach((slot, i) => {
      if (slot === '^') { // the session above runs on: one cell down both rows, centred in them
        m = mergeCells(m, span(r - 1, i + 1, r, i + 1));
        m = setAlignment(m, at(r - 1, i + 1), 'left', 'middle');
        return;
      }
      const [, code = '', body = slot] = /^([TDE*]) (.+)$/.exec(slot) ?? [];
      m = setCellContent(m, at(r, i + 1), lines(code, body));
      m = setCellBackground(m, at(r, i + 1), col(TRACKS[code] ?? 'pause'));
    });
    if (slots.length === 1) m = mergeCells(m, span(r, 1, r, 3)); // the same for all three rooms
  }
  return m; // mergeCells marks the covered cells hiddenBy (gotcha: merged-cells-hiddenby)
}
// #endregion

// #region split: where each day's grid lands and how it continues, labelled in Catalan
const CATALAN = { // 1.4.1 names types in English and Spanish only (gotcha: resource-types-locale)
  figure: { name: 'Figura', namePlural: 'Figures', shortLabel: 'fig.', captionPrefix: 'Figura' },
  table: { name: 'Taula', namePlural: 'Taules', shortLabel: 'taula', captionPrefix: 'Taula',
    captionStyle: { position: 'above' } },
};
const resourceTypes = defaultResourceTypes('ca').map((type) => ({ ...type, ...CATALAN[type.id],
  numberingTemplate: '{n}', resetOn: 'never' })); // Taula 1, Taula 2: one count, not per day
const SPLIT = { overflow: 'split', // the default; the other values are 'clip' and 'hide'
  continuedSuffix: '(continuació)', // after the caption of every part but the first
  continuesMarker: 'Continua a la pàgina següent' }; // under every part but the last
// Thursday is cited on page 2 and placed at the top, so it opens page 3 (gotcha:
// top-float-next-page) and splits; Friday goes whole to the foot of the page that cites it.
const PLACE = { dijous: { position: 'top', span: 'page' },
  divendres: { position: 'bottom', span: 'page' } };
// #endregion

// #region tiles: paper-coloured rules cut the fills into tiles; chips set the times and heads
const tableStyle = { ...SPLIT, borderColor: col('paper'), borderWidth: pt(1.6), // grid rules
  headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: LABEL,
  headerFontSize: pt(7.5), bodyFontSize: pt(8.2),
  cellPadding: mm(1.5) };
const bare = (id, extra) => ({ id, backgroundEnabled: false, borderWidth: pt(0),
  paddingX: pt(0), ...extra }); // a chip that only changes the face, the size or the colour
const chipStyles = [bare('blanc', { color: col('paper') }), // the plenary's type, on ink
  bare('hora', { fontFamily: LABEL, fontSize: em(0.96), bold: true }),
  bare('franja', { fontFamily: LABEL, fontSize: em(0.92), bold: true, color: col('accent') }),
  bare('sala')]; // keeps each room of the plan's note on one line (gotcha: nbsp-breaks)
// #endregion

// #region opener: an ink band per day with the date, a 144 pt numeral and the day's name
const BAND = 76, STRIP = 8, AIR = 7; // mm: band from the trim, its strip of modules, air below
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement, align: 'left',
  overflow: 'wrap', ...extra }); // not '…' at the edge (gotcha: overflow-ellipsis-default)
const pin = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const caps = (size) => ({ fontWeight: 500, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.18) });
const NUMERAL = 144; // pt
// mm: Unbounded 800's 1 at 144 pt starts its ink 0.76 mm into its box, the date's first capital
// at 8 pt 0.1 to 0.2 mm into its own (P 0.19, S 0.09): 0.6 mm to the left lines up the two inks
const BEARING = 0.6;
const BASELINE = 0.8; // a design line's baseline sits 0.8 down its box (lineHeight 1)
const opener = { enabled: true, minHeight: mm(BAND - PAGE.top + AIR), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('ink') },
    placement: pin('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(BAND) }) },
  { kind: 'image', id: 'strip', resourceId: 'strip', placement: pin('page', 'top-left', 0,
    BAND - STRIP, { width: mm(PAGE.w), height: mm(STRIP) }) }, // on the band's foot
  text('date', '{attr.date}', LABEL, 8, 'edicio', pin('container', 'top-left', 0, 0), caps(8)),
  text('numeral', '{attr.day}', DISPLAY, NUMERAL, 'paper', pin('#date', 'below', -BEARING, 1),
    { fontWeight: 800, lineHeight: 1 }), // a multiple (gotcha: design-lineheight-multiple)
  text('title', '{titleText}', DISPLAY, 26, 'paper', // its baseline level with the numeral's
    pin('#numeral', 'right-of', 5, BASELINE * (NUMERAL - 26) * PT),
    { fontWeight: 700, lineHeight: 1 }),
] } };
// #endregion

// #region bios: a hanging indent for the speakers' notes
const paragraphStyles = [
  { id: 'bio', hangingIndent: mm(4) }, // the name at the column edge, the lines under it 4 mm in
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(7.4), lineHeight: pt(LEAD * 0.75),
    textAlign: 'left', color: col('muted'), firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
// #endregion

const head = (id, content, parity, x, extra) => text(id, content, LABEL, 7.5, 'muted',
  pin('page', x > 0 ? 'top-left' : 'top-right', x, 11), { ...caps(7.5), parity, pages: 'body',
    ...extra }); // body pages only: the cover and the openers have none
const folio = { fontWeight: 700, color: col('ink'), letterSpacing: pt(0) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', PAGE.outer, folio),
  head('verso-title', '{title}', 'even', PAGE.outer + 8),
  head('recto-title', '{chapterTitle} {attr.day} de novembre', 'odd', -(PAGE.outer + 8)),
  head('recto-folio', '{pageNumber}', 'odd', -PAGE.outer, folio)] };
const footer = { elements: [text('drop-folio', '{pageNumber}', LABEL, 7.5, 'ink',
  pin('page', 'bottom', 0, -11), { ...folio, pages: 'opener', align: 'center' })] };

// The cover is a heading style: an ink page with the L·L of modules and the title. The next
// heading breaks the page, so the cover needs no :::pagebreak after it.
const coverStyle = { id: 'coberta', numbered: false,
  header: { elements: [] }, footer: { elements: [] }, // no running heads on the cover
  advancedDesign: { enabled: true, minHeight: mm(PAGE.h - PAGE.top - PAGE.bottom), slot: {
    elements: [
      { kind: 'box', id: 'field', style: { backgroundColor: col('ink') },
        placement: pin('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(PAGE.h) }) },
      { kind: 'image', id: 'modules', resourceId: 'modules',
        placement: pin('page', 'top-left', 0, 0, { width: mm(PAGE.w), height: mm(142) }) },
      text('kicker', '{attr.kicker}', LABEL, 8.5, 'edicio', pin('page', 'top-left', 17, 162),
        caps(8.5)),
      text('name', '{titleText}', DISPLAY, 31, 'paper', pin('#kicker', 'below', -0.8, 3,
        { width: mm(138) }), { fontWeight: 700, lineHeight: 1.08 }),
      text('dates', '{attr.dates}', DISPLAY, 17, 'tipo', pin('#name', 'below', 0, 6),
        { fontWeight: 700, lineHeight: 1 }),
      text('place', '{attr.place}', LABEL, 8.5, 'paper', pin('#dates', 'below', 0.8, 3),
        caps(8.5)),
    ] } } };

const config = () => ({

  resourceTypes, colorPalette, tableStyle, chipStyles, paragraphStyles,
  header, footer, headingStyles: [coverStyle],
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, // a 1,004 px canvas per page
    margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true }, // ragged, spaced
  headings: { fontFamily: DISPLAY, fontWeight: 600, color: col('ink'), levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener, marginBottom: pt(0) },
    { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(LEAD / 2) },
  ] },
  captionStyle: { fontFamily: LABEL, fontSize: pt(7.6), labelColor: col('accent'), gap: mm(2),
    note: { fontSize: pt(7.4), color: col('muted') } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // the programme's text, in Catalan
const dijous = /* @content:dijous */ ''; // Thursday's sessions, one line per time slot
const divendres = /* @content:divendres */ ''; // Friday's

// #region art: the cover's L·L in modules, the band's strip and the venue's floor plan
const n = (v) => +v.toFixed(2);
function mulberry32(seed) { // a seeded PRNG: the same modules in every capture
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const P = palette;
// One module in an s × s cell at (x, y), turned by quarter turns about the cell's centre:
// 0 a quarter disc, 1 a half disc, 2 a half-width bar, 3 a disc, 4 a square.
function module(kind, turn, x, y, s, fill) {
  const c = `transform="rotate(${turn * 90} ${n(x + s / 2)} ${n(y + s / 2)})" fill="${fill}"`;
  if (kind === 0) return `<path d="M${n(x)} ${n(y)}h${s}A${s} ${s} 0 0 1 ${n(x)} ${n(y + s)}Z" `
    + `${c}/>`;
  if (kind === 1) return `<path d="M${n(x)} ${n(y + s)}A${s / 2} ${s / 2} 0 0 1 ${n(x + s)} `
    + `${n(y + s)}Z" ${c}/>`;
  if (kind === 2) return `<rect x="${n(x)}" y="${n(y)}" width="${n(s / 2)}" height="${s}" ${c}/>`;
  if (kind === 3) return `<circle cx="${n(x + s / 2)}" cy="${n(y + s / 2)}" r="${n(s / 2)}" `
    + `${c}/>`;
  return `<rect x="${n(x)}" y="${n(y)}" width="${s}" height="${s}" ${c}/>`;
}
// The cover: L·L, the capital ela geminada, drawn with the modules on a 26 mm grid: each L is
// a stem five cells tall with a quarter-disc foot, the punt volat a disc at mid cap height.
function coverArt(w, h, s, x0, y0) {
  const ell = (c, id) => { const x = x0 + c * s; // one path: no seam between stem and foot
    return `<path d="M${x} ${y0}h${s}v${4 * s}a${s} ${s} 0 0 1 ${s} ${s}H${x}Z" `
      + `fill="${P[id]}"/>`; };
  const dot = `<circle cx="${x0 + 2.5 * s}" cy="${y0 + 2.5 * s}" r="${n(0.36 * s)}" `
    + `fill="${P.edicio}"/>`;
  return svg(w, h, ell(0, 'tipo') + dot + ell(3, 'digital'));
}
function strip(w, s) { // the band's foot: one row of modules in the three track colours
  const rand = mulberry32(12);
  let out = '';
  for (let x = 0; x < w; x += s) {
    out += module(Math.floor(rand() * 5), Math.floor(rand() * 4), x, 0, s,
      P[['tipo', 'digital', 'edicio'][Math.floor(rand() * 3)]]);
  }
  return svg(w, s, out);
}
// The floor plan: ink walls, a tinted courtyard and the rooms numbered in discs. The digits
// are strokes, because an SVG picture cannot use the page's web fonts (gotcha:
// svg-no-webfonts); the caption's note names the rooms.
const DIGITS = { 1: 'M1.8 2.6 3.6 1V9', 2: 'M1 3A2.5 2.5 0 1 1 5.2 4.8L1 9H5.4',
  3: 'M1.2 1H5L2.8 4.2A2.6 2.6 0 1 1 1 8.2', 4: 'M4.2 9V1L.8 6.6H5.6',
  5: 'M5.2 1H1.6L1.2 4.6A2.8 2.8 0 1 1 1.2 8.6',
  6: 'M4.6 1Q1 2.2.8 6.5A2.5 2.5 0 0 0 5.8 6.5 2.5 2.5 0 0 0 .8 6.5' };
const disc = (d, x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${P.ink}"/>`
  + `<path d="${DIGITS[d]}" transform="translate(${n(x - 1.05)} ${n(y - 1.65)}) scale(.33)" `
  + 'fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>';
const line = (d, w, color = P.ink) => `<path d="${d}" fill="none" stroke="${color}" `
  + `stroke-width="${w}" stroke-linecap="square"/>`;
function plan() { // ground floor, 138 × 66 mm: the street is at the foot, the courtyard east
  const treads = Array.from({ length: 6 }, (_, i) => `M${77 + i * 2.2} 41V55`).join('');
  return svg(138, 66, `<rect x="2" y="2" width="96" height="36" fill="${P.pause}"/>` // rooms 1–2
    + `<rect x="98" y="2" width="38" height="56" fill="${P.digital}" fill-opacity=".18"/>`
    + `<circle cx="126" cy="14" r="6" fill="${P.digital}"/>` // two trees in the courtyard
    + `<circle cx="108" cy="48" r="4.5" fill="${P.digital}"/>`
    + line(treads, 0.35, P.muted) // the stairs, and the lift beside them
    + line('M91 42h5v12h-5zM91 42l5 12M96 42l-5 12', 0.35, P.muted)
    + line('M44 58A6 6 0 0 1 50 52M56 58A6 6 0 0 0 50 52', 0.3, P.muted) // the street doors
    + line('M44 58H2V2H98V14M98 26V58H56', 1) // outer walls, with the doors left open
    + line('M52 2V38M2 38H34M44 38H60M70 38H98M26 38V43M26 53V58M74 38V43M74 53V58', 0.6)
    + line('M98 2H136V58H98', 0.6) // the courtyard
    + `<path d="M49.3 65.5V61.2H47L50 58.6l3 2.6h-2.3v4.3Z" fill="${P.accent}"/>` // way in
    + disc(1, 27, 20) + disc(2, 75, 20) + disc(3, 83.5, 48) + disc(4, 50, 47)
    + disc(5, 14, 48) + disc(6, 117, 30));
}
// #endregion

// #region resources: the two grids, keyed by swatches in their captions, and the plan
const KEY = ':swatch{color="tipo"} Tipografia · :swatch{color="digital"} Digital · '
  + ':swatch{color="edicio"} Edició';
const table = (id, caption, model, note) => ({ id, typeId: 'table', kind: 'table',
  caption: `${caption} ${KEY}`, note, table: { model }, placement: PLACE[id],
  createdAt: 0, updatedAt: 0 });
const picture = (id, markup, w, h, extra) => ({ id, typeId: 'figure', kind: 'svg', markup,
  svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, createdAt: 0, updatedAt: 0,
  ...extra });
const drawings = [ // the cover and the band draw the first two by id; the plan is cited
  picture('modules', coverArt(PAGE.w, 142, 26, 20, 12), PAGE.w, 142,
    { altText: 'L·L, la ela geminada majúscula, feta de mòduls violeta, turquesa i ambre' }),
  picture('strip', strip(PAGE.w, STRIP), PAGE.w, STRIP,
    { altText: 'Una filera de mòduls de lletra en els colors dels itineraris' }),
  // Cited on page 5, under the opener, so it heads page 6 (gotcha: top-float-next-page).
  picture('planol', plan(), 138, 66, { caption: 'La Impremta, planta baixa.',
    note: ['1 Sala Gran', '2 Sala de les Premses', '3 Aula Taller, al primer pis', '4 Vestíbul',
      '5 Guarda-roba', '6 Pati'].map((room) => chip(room, 'sala')).join(' · '),
    placement: { position: 'top', span: 'page' },
    altText: 'Planta de La Impremta amb les sales numerades de l’1 al 6' }),
];
const resources = [...drawings.map(({ markup, ...r }) => r),
  table('dijous', 'Dijous 12 de novembre.', schedule(dijous), 'Les ponències duren quaranta '
    + 'minuts, més cinc de preguntes; els tallers, noranta.'),
  table('divendres', 'Divendres 13 de novembre.', schedule(divendres)),
];
for (const { svg: { fileId }, markup } of drawings) await loadSvg(fileId, markup);
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build
  'Schibsted Grotesk': ['400', '400i', '700'], // text, bios and cells
  Unbounded: ['600', '700', '800'], // sections; titles; the day's numeral
  'Chivo Mono': ['400', '400i', '500', '700'] }; // labels, times, captions and the colophon

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = [markdown, dijous, divendres].join('\n');
await prepareFonts(allText, config(), kitFonts(FONTS));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(),
  { ...kitFonts(FONTS), text: allText });
showPages(doc, { title: 'Jornades de Tipografia i Edició Digital · Programa' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
