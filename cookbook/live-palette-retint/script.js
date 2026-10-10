// ═══ Postext Cookbook · Nº 054 · Retint a whole document from one palette ═══════════
// https://postext.dev/en/cookbook/live-palette-retint
// Code: MIT · Text: original (CC BY 4.0) · Artwork: design boxes generated in code (CC BY 4.0)
// Fonts: Syne, Plus Jakarta Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, buildDocumentWithFonts, renderPageToCanvas, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'live-palette-retint';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: three neutrals every edition shares, four entries each colourway sets
const NEUTRALS = { ink: '#1d1d1f', muted: '#5f5f66', paper: '#ffffff' };
const COLOURWAYS = { // band: colour fields · onBand: type on them · deep: accent type on paper
  red: { band: '#d7263d', onBand: '#ffffff', deep: '#b3122a', tint: '#fcdfe3' },
  teal: { band: '#2a9d8f', onBand: '#1d1d1f', deep: '#17695f', tint: '#d8eeeb' },
  violet: { band: '#6a4c93', onBand: '#ffffff', deep: '#5b3f86', tint: '#e7dff0' },
  sand: { band: '#f4a261', onBand: '#1d1d1f', deep: '#a14a16', tint: '#fde4cf' },
}; // white on teal is 3.3:1 and on sand 2.1:1, so those two set their band type in ink
const HOUSE = { ...NEUTRALS, ...COLOURWAYS.red }; // the hex config() writes beside each id
const col = (id) => ({ hex: HOUSE[id], model: 'hex', paletteId: id });
const entries = (hexes) => Object.entries(hexes).map(([id, hex]) => ({ id, name: id,
  value: { hex, model: 'hex' } })); // the shape of config.colorPalette
// #endregion

// #region answer: a colourway is a palette; retint() builds a fresh config linked to it
function retint(way) {
  const palette = { ...NEUTRALS, ...COLOURWAYS[way] };
  // 1.4.1 applies colorPalette to text, lists, boxes, chips, captions and tables, and resolves
  // swatches and cell fills against it; design elements and referenceColor print the hex
  // written beside their id, so relink() rewrites that hex (gotcha: palette-skips-designs).
  const relink = (v) => (Array.isArray(v) ? v.map(relink) : !v || typeof v !== 'object' ? v
    : Object.hasOwn(palette, v.paletteId ?? '') ? { ...v, hex: palette[v.paletteId] }
      : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relink(x)])));
  return { // a new object on every call: resolved configs are cached per object
    ...relink(config()),
    colorPalette: entries({ ...palette, 'main-color': palette.band }), // the defaults take the band
  };
}
// #endregion

const [DISPLAY, SANS, BODY, LEAD] = ['Syne', 'Plus Jakarta Sans', 9.4, 13.4]; // pt: 33 lines
const [TRIM, TOP, BOTTOM, INNER, OUTER, GUTTER] = [200, 22, 22, 17, 15, 6]; // mm: square, mirrored
const BAND = 100; // mm, trim top to the colour field's foot ('bleed' is the trim: no cut lines)
const lines = (n) => pt(n * LEAD);
const caps = (size) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: 700,
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase' });

// #region opener: the colour field, a waveform of palette-linked boxes, the title on top
const text = (id, content, x, y, width, style) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', color: col('onBand'), placement: { anchor: { to: 'page', edge: 'top-left' },
    offset: { x: mm(x), y: mm(y) }, size: { width: mm(width) } }, ...style });
const opener = { enabled: true,
  minHeight: lines(18), // 85.1 mm: text 7 mm under the band (2.4 mm with the band box alone)
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('band') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    ...waveform(), // boxes filled with col('tint'), which relink() rewrites like the rest
    text('kicker', '{attr.kicker}', INNER, 14, 150, caps(8)),
    text('title', '{titleText}', INNER, 20, TRIM - INNER - OUTER, { fontFamily: DISPLAY,
      fontSize: pt(46), fontWeight: 800, lineHeight: 0.92 }), // a multiple
    text('standfirst', '{attr.standfirst}', INNER, 71, 92, { fontFamily: SANS, fontSize: pt(10),
      lineHeight: 1.36 }), // (gotcha: design-lineheight-multiple)
  ] },
};
// #endregion

// #region links: every colour the engine would print in its blue, linked to a palette id
const bodyText = { fontFamily: SANS, fontSize: pt(BODY), lineHeight: pt(LEAD),
  color: col('ink'), italicColor: col('ink'), // bold: the times, key terms, boxes (inherited)
  boldColor: col('deep'), referenceColor: col('deep'), textAlign: 'left', firstLineIndent: pt(0) };
const headings = { fontFamily: DISPLAY, color: col('deep'), levels: [
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
    marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
  { level: 2, fontSize: pt(12.5), lineHeight: lines(1), marginTop: lines(1), marginBottom: pt(0) },
] };
const unorderedLists = { color: col('band'), indent: mm(3.6), gap: mm(1.4),
  marginTop: pt(0), marginBottom: pt(0) };
const chip = { fontSize: pt(7.5), bold: true, borderWidth: pt(0), borderRadius: mm(1.6),
  paddingX: mm(1.3), paddingY: pt(0.9), gap: mm(1) };
const chipStyles = [ // band = a ticket, tint = free: the same code as the grid overleaf
  { id: 'ticket', background: col('band'), color: col('onBand'), ...chip },
  { id: 'free', background: col('tint'), color: col('deep'), ...chip,
    borderWidth: pt(0.6), borderColor: col('band') }, // the outline keeps it off the white
];
const corner = (edge, y) => ({ anchor: { to: 'page', edge }, offset: { x: mm(OUTER), y: mm(y) } });
const furniture = (id, content, edge, y, style) => ({ elements: [{ kind: 'text', id, content,
  parity: 'even', pages: 'body', overflow: 'wrap', placement: corner(edge, y), ...style }] });
const header = furniture('head', '{title} · {subtitle}', 'top-left', 12, // page 2's head
  { ...caps(7.5), color: col('deep') });
const footer = furniture('folio', '{pageNumber}', 'bottom-left', -12, { fontFamily: SANS,
  fontSize: pt(8), fontWeight: 700, color: col('onBand'), box: { backgroundColor: col('band'),
    borderRadius: mm(2.4), padding: { top: mm(0.9), right: mm(2.4), bottom: mm(0.9),
      left: mm(2.4) } } });
// #endregion

const config = () => ({
  // "Tabla" in Spanish (gotcha: resource-types-locale); one table: "Table 1", not "1.1"
  resourceTypes: defaultResourceTypes(LANG).map((r) => ({ ...r, numberingTemplate: '{n}' })),
  colorPalette: entries(HOUSE), // the red edition; retint() replaces it
  page: { width: mm(TRIM), height: mm(TRIM), dpi: 150, margins: { top: mm(TOP),
    bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText, headings, unorderedLists, chipStyles,
  calloutStyles: [{ id: 'tickets', backgroundEnabled: false, // no fill, a stripe on top
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('band') },
    padding: { top: mm(2.6), right: pt(0), bottom: pt(0), left: pt(0) },
    titleStyle: { fontFamily: DISPLAY, fontSize: pt(11), color: col('deep'), gap: mm(1.2) } }],
  tableStyle: { borderColor: col('paper'), borderWidth: pt(1.6), // white rules cut the tiles
    headerBackground: col('ink'), headerColor: col('paper'), headerFontSize: pt(7.5),
    bodyFontSize: pt(8.2), bodyColor: col('ink'), cellPadding: mm(1) },
  captionStyle: { fontSize: pt(8), color: col('onBand'), labelColor: col('onBand'),
    position: 'above', backgroundEnabled: true, background: col('band'), padding: mm(1.2),
    gap: mm(1.2), note: { fontSize: pt(7.5), color: col('muted') } },
  paragraphStyles: [{ id: 'colophon', fontSize: pt(7), lineHeight: pt(9.6), color: col('muted') }],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region grid: the week at a glance, filled from palette ids the engine resolves itself
const DAYS = t({ en: ['Sat 12', 'Sun 13', 'Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18'],
  es: ['Sáb 12', 'Dom 13', 'Lun 14', 'Mar 15', 'Mié 16', 'Jue 17', 'Vie 18'] });
const WEEK = [ // t: a ticketed concert, f: a free event, one mark a day from Saturday
  [t({ en: 'Quay Stage', es: 'Escenario del Muelle' }), 't.f.fft'],
  [t({ en: 'Iron Bridge steps', es: 'Escalinata del Puente' }), 'f.....f'],
  [t({ en: 'Market Hall', es: 'Mercado de Abastos' }), '.f...f.'],
  [t({ en: 'St Clare’s Cloister', es: 'Claustro de Santa Clara' }), '.t.....'],
  [t({ en: 'Tannery Yard', es: 'Patio de la Curtiduría' }), '...t...'],
  [t({ en: 'Boathouse', es: 'Casa de las Barcas' }), '.ft..t.'],
];
const fill = { t: col('band'), f: col('tint') }; // resources are not in the config: no relink
const resources = [{ id: 'week', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  placement: { position: 'top', span: 'page' }, // cited on page 1, it heads page 2
  caption: t({ en: 'The week at a glance', es: 'La semana de un vistazo' }),
  note: t({ en: ':swatch{color="band"} ticketed concert   :swatch{color="tint"} free event',
    es: ':swatch{color="band"} concierto con entrada   :swatch{color="tint"} acto gratuito' }),
  altText: t({ en: 'A grid of six venues by seven days; filled squares mark the events.',
    es: 'Una cuadrícula de seis escenarios por siete días; los cuadros rellenos son los actos.' }),
  table: { model: { headerRowCount: 1, columnWidths: [2.6, 1, 1, 1, 1, 1, 1, 1], rows: [
    [{ content: '', isHeader: true, background: col('paper') }, ...DAYS.map((day) => ({
      content: day, isHeader: true, align: 'center' }))],
    ...WEEK.map(([venue, marks]) => [{ content: venue, align: 'right' }, ...[...marks].map((m) =>
      (m === '.' ? { content: '' } : { content: '', background: fill[m] }))]),
  ] } } }];
// #endregion

// #region art: a waveform over the river, 29 rounded bars from a seeded generator
function waveform() {
  let seed = 0x5eed; // Mulberry32: the same bars on every run
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const [x0, axis, n, width, gap] = [114, 84, 29, 2.1, 1.35]; // mm; axis: the waterline
  return Array.from({ length: n }, (_, i) => {
    const envelope = Math.sin(((i + 0.5) / n) * Math.PI) ** 0.8;
    const up = 3 + 26 * envelope * (0.35 + 0.65 * random()); // mm above the waterline
    const down = up * 0.42; // and its reflection below it
    return { kind: 'box', id: `bar-${i}`, style: { backgroundColor: col('tint'),
      borderRadius: mm(width / 2) }, placement: { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(x0 + i * (width + gap)), y: mm(axis - up) },
      size: { width: mm(width), height: mm(up + down) } } };
  });
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Plus Jakarta Sans': ['400', '400i', '700'], Syne: ['700', '800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const TITLE = t({ en: 'One programme, four palettes', es: 'Un programa, cuatro paletas' });
const build = (way) => buildDocumentWithFonts({ markdown, resources }, retint(way),
  kitFonts(FONTS));
const docs = {}; // red is built last: the capture shows the last build on its pages
for (const way of ['sand', 'violet', 'teal', 'red']) docs[way] = await build(way);

// #region live: four buttons, each a fresh build of the whole programme in one colourway
const NAMES = t({ en: { red: 'Red', teal: 'Teal', violet: 'Violet', sand: 'Sand' },
  es: { red: 'Rojo', teal: 'Verde azulado', violet: 'Violeta', sand: 'Arena' } });
document.getElementById('pages').insertAdjacentHTML('beforebegin', `<section id="editions">
  <div class="desk"><header><p class="kicker">${t({ en: 'Riverside Music Week · proofs',
    es: 'Música en la Ribera · pruebas' })}</p><h2>${TITLE}</h2></header><canvas id="live"
  role="img"></canvas><div class="buttons" role="group"></div></div></section>`);
const paint = (canvas, doc) => renderPageToCanvas(doc.pages[0], doc, canvas,
  { scale: (canvas.clientWidth * Math.min(devicePixelRatio, 2)) / doc.pages[0].width });
const buttons = Object.keys(COLOURWAYS).map((way) => {
  const button = document.querySelector('#editions .buttons')
    .appendChild(Object.assign(document.createElement('button'), { type: 'button' }));
  button.innerHTML = `<canvas></canvas><span>${NAMES[way]}<i>${['band', 'deep', 'tint']
    .map((id) => `<b style="background:${COLOURWAYS[way][id]}"></b>`).join('')}</i></span>`;
  paint(button.firstChild, docs[way]);
  // A fresh config on every click (retint() calls config()); the fonts are loaded by now.
  button.onclick = () => show(way, buildDocument({ markdown, resources }, retint(way)));
  return [way, button];
});
const live = document.getElementById('live');
let shown; // the document on the live page
function show(way, doc) {
  paint(live, (shown = doc));
  live.ariaLabel = `${NAMES[way]}, ${t({ en: 'page 1', es: 'página 1' })}`;
  for (const [id, button] of buttons) button.ariaPressed = String(id === way);
  showPages(doc, { title: `${TITLE} · ${NAMES[way]}` });
}
show('red', docs.red);
new ResizeObserver(() => { // canvases are bitmaps: repaint them at the desk's new size
  paint(live, shown); buttons.forEach(([way, button]) => paint(button.firstChild, docs[way]));
}).observe(live);
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
