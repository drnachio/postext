// ═══ Postext Cookbook · Nº 056 · Live editor with layout in a Web Worker ═══════════
// https://postext.dev/en/cookbook/web-worker-live-editor
// Code: MIT · Text: H. G. Wells, The Time Machine, 1895 (PD, Gutenberg #35) · Art: drawn in code
// Fonts: Baskervville, Baskervville SC, Cinzel (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, createMeasurementCache, renderPageToCanvas, clearMeasurementCache,
  registerResourceImage,
} from 'https://esm.sh/postext';
import { createLayoutWorker } from 'https://esm.sh/postext/worker';

const LANG = 'en'; // @lang: the language of the sample document (this recipe is English only)
const RECIPE = 'web-worker-live-editor';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#231f1a', // the text: a warm near-black
  oxblood: '#7a1f1f', // the accent: running heads, the numeral, the subtitle, the plate's cloth
  brass: '#a88a4a', // rules and the dial's bezel (never text: 2.7:1 on the paper)
  gilt: '#d8bd7c', // the plate's frame and rings, on the oxblood
  rule: '#c9bca0', // the dial's inner ring
  muted: '#6b5d4b', // the drop folio and the colophon (5.3:1 on the paper)
  paper: '#f2ead8', // a cream pocket-book paper
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color'. The editor takes any Markdown, and without this
  // entry a list typed into it gets the default blue markers.
  { id: 'main-color', name: 'oxblood (defaults)', value: { hex: palette.oxblood, model: 'hex' } },
];
const [TEXT, LABEL, DISPLAY] = ['Baskervville', 'Baskervville SC', 'Cinzel'];

// The page: 110 × 147 mm, a text block of 25 whole lines.
const TRIM = { width: 110, height: 147 }; // mm: a Victorian pocket size, close to A6
const [BODY, LEAD, LINES] = [9.5, 13, 25]; // pt, pt, lines: the text block is LINES leads deep
const [TOP, INNER, OUTER] = [15, 11, 9]; // mm; mirrored, so INNER is the spine side
const MM_PER_PT = 25.4 / 72;
const MEASURE = TRIM.width - INNER - OUTER; // 90 mm: about 60 characters of Baskervville
const line = (n) => pt(n * LEAD); // n grid lines
const page = {
  sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LEAD * MM_PER_PT),
    left: mm(INNER), right: mm(OUTER), mirror: true },
};

const onPage = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } }); // centred
const inColumn = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });
const text = (id, content, fontFamily, fontSize, style, placement) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(fontSize), color: col('ink'), align: 'center', ...style,
  placement: { ...placement, size: { width: mm(MEASURE) } } });
const brassRule = (id, y, width) => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(0.75), color: col('brass'), placement: { ...y, size: { width: mm(width) } } });

// #region title: page 1 is a heading style of its own: the plate, the title and no heads
// # The Time Machine {style="title"}: numbered false, so the Introduction is still chapter I.
const PLATE = TRIM.width * (840 / 1100); // mm: the plate's depth at full width (84 mm)
const titlePage = {
  id: 'title', numbered: false,
  span: 'page', // kept in the column, the design is clipped to it: the plate's top, the author
  header: { elements: [] }, footer: { elements: [] }, // no running head, no folio
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'plate', resourceId: 'plate',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    text('title', '{titleText}', DISPLAY, 28, { fontWeight: 700, lineHeight: 1.04,
      overflow: 'wrap' }, // two lines, not one and '…' (gotcha: overflow-ellipsis-default)
    onPage(PLATE + 11)),
    text('subtitle', '{subtitle}', TEXT, 12, { italic: true, color: col('oxblood') },
      onPage(PLATE + 34.5)),
    brassRule('rule', onPage(PLATE + 43), 12),
    text('author', '{author}', LABEL, 10, { fontWeight: 500, letterSpacing: pt(2) },
      onPage(PLATE + 46.5)),
  ] } },
};
// #endregion

// #region heads: running heads on body pages only, a drop folio on the opener
// pages: 'body' keeps the heads off the title page and the opener; parity puts the book's
// title on the verso and the chapter on the recto, folios on the outer edge.
const HEAD_Y = 8.2; // mm from the top edge to the top of the running heads
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre is off the page's centre
const head = (id, content, parity, edge, x, style) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontSize: pt(8), color: col('oxblood'), ...style,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD_Y) } } });
const smallCaps = { fontFamily: LABEL, fontWeight: 500, letterSpacing: pt(1.2) };
const folio = { fontFamily: TEXT, color: col('ink') }; // the heads' size: the same baseline
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top', -SHIFT, smallCaps),
  head('recto-chapter', '{chapterTitle}', 'odd', 'top', SHIFT, smallCaps),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [{ ...text('drop-folio', '{pageNumber}', TEXT, 8,
  { color: col('muted') }, inColumn(6.5)), pages: 'opener' }] };
// #endregion

// #region opener: the chapter sinks eight lines under its roman numeral and a brass rule
const chapter = { level: 1, numberingTemplate: '{1:I}', // {number} prints 'I'
  breakBefore: { enabled: true, parity: 'any' }, // restated (gotcha: headings-drop-h1-break)
  marginTop: pt(0), marginBottom: pt(0),
  advancedDesign: { enabled: true, minHeight: line(8), slot: { elements: [
    text('numeral', '{number}', DISPLAY, 24, { fontWeight: 700, color: col('oxblood') },
      inColumn(5)),
    brassRule('rule', inColumn(18.5), 10),
    text('chapter', '{titleText}', DISPLAY, 12, { fontWeight: 700, letterSpacing: pt(1.8),
      textTransform: 'uppercase', overflow: 'wrap' }, inColumn(22.5)), // a longer title wraps
  ] } } };
const colophon = { id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10.5), color: col('muted'),
  textAlign: 'center', firstLineIndent: pt(0) };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  page,
  layout: { layoutType: 'single' }, // one column: the default is two
  bodyText: {
    fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4),
    indentAfterHeading: false,
    // Copy-fitted: at these spacings chapter I sets 25 lines on every full page, with no
    // hyphen inside a hyphenated word ('af-/ter-dinner') on the pages the Cookbook shows.
    minWordSpacing: 0.66, maxWordSpacing: 1.9,
    maxRuntTracking: 0, // gotcha: runt-tracking-unpainted
  },
  headings: { fontFamily: DISPLAY, fontWeight: 700, color: col('ink'), levels: [chapter] },
  headingStyles: [titlePage],
  paragraphStyles: [colophon],
  header,
  footer,
});

// #region answer: layout in a module worker started from a blob, with its own fonts
async function startLayoutWorker(faces) {
  // In 1.4.1, createLayoutWorker() on its own starts esm.sh's worker file, which the browser
  // refuses to run from another origin; a same-origin blob that imports it is allowed.
  // An import map does not reach the worker: if the page pins postext@x.y.z, pin this URL too.
  const entry = new Blob([`import 'https://esm.sh/postext/worker/entry';`],
    { type: 'text/javascript' });
  const layout = createLayoutWorker({
    worker: new Worker(URL.createObjectURL(entry), { type: 'module' }) });
  // The worker measures with its own FontFaceSet, not the page's. Without the bytes of every
  // face it measures in a fallback font, and 1.4.1 raises no error. Weights are strings.
  const payloads = await Promise.all(faces.map(async ({ family, weight, style, url }) => {
    // Check the status: a 404 page sent as a font only logs a warning inside the worker.
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${family} ${weight} ${style}: HTTP ${response.status}`);
    return { family, weight, style, buffer: await response.arrayBuffer() };
  }));
  await layout.registerFonts(payloads); // the buffers move to the worker, not copied
  let inFlight = null;
  return async function typeset(content) {
    inFlight?.abort(); // cancel the build that the previous keystroke asked for
    const build = (inFlight = new AbortController());
    try {
      return await layout.build(content, config(), { signal: build.signal });
    } catch (error) {
      if (error.name === 'AbortError') return null; // superseded: a newer build is on its way
      throw error;
    }
  };
}
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.en.md, inlined by the Cookbook
const resources = [{ id: 'plate', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'plate.svg', width: 1100, height: 840 }, // the size is all the worker needs
  altText: 'A brass dial with four small dials on its face, framed in gilt on oxblood cloth.' }];

// #region art: the title page's plate, a brass dial with four small dials on oxblood cloth
// "One dial records days, and another thousands of days, another millions of days, and another
// thousands of millions" (chapter IV). Drawn in tenths of a millimetre: 110 × 84 mm.
const n1 = (v) => +v.toFixed(1);
const at = (cx, cy, r, deg) => [n1(cx + r * Math.sin((deg * Math.PI) / 180)),
  n1(cy - r * Math.cos((deg * Math.PI) / 180))];
const mix = (hex, other, k) => `#${[1, 3, 5].map((i) => Math.round(
  parseInt(hex.slice(i, i + 2), 16) * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k)
  .toString(16).padStart(2, '0')).join('')}`;
const circle = (cx, cy, r, fill, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
function ticks(cx, cy, r, n, lengths, widths, color) { // n ticks inward from radius r
  return Array.from({ length: n }, (_, i) => {
    const k = lengths.findIndex((_, j) => i % [n / 10, n / 20, 1][j] === 0);
    const [a, b] = [at(cx, cy, r, (i * 360) / n), at(cx, cy, r - lengths[k], (i * 360) / n)];
    return `<path d="M${a}L${b}" stroke="${color}" stroke-width="${widths[k]}"/>`;
  }).join('');
}
function hand(cx, cy, length, deg, color) { // a tapered pointer with a short tail
  const [tip, left, tail, right] = [at(cx, cy, length, deg), at(cx, cy, 6, deg - 90),
    at(cx, cy, length * 0.28, deg + 180), at(cx, cy, 6, deg + 90)];
  return `<path d="M${tip}L${left}L${tail}L${right}Z" fill="${color}"/>`;
}
function subDial(cx, cy, deg) {
  const P = palette;
  return circle(cx, cy, 78, P.brass) + circle(cx, cy, 70, P.paper)
    + ticks(cx, cy, 64, 50, [13, 9, 5], [3.2, 1.6, 1.2], P.ink) + hand(cx, cy, 58, deg, P.oxblood)
    + circle(cx, cy, 9, P.brass) + circle(cx, cy, 3.5, P.ink);
}
function plate() {
  const P = palette;
  const [cx, cy, d] = [550, 420, 122]; // the dial's centre; the small dials sit d from it
  const corner = (x, y) => `<path d="M${x} ${y - 11}L${x + 11} ${y}L${x} ${y + 11}`
    + `L${x - 11} ${y}Z" fill="${P.gilt}"/>`;
  const frame = (inset, width) => `<rect x="${inset}" y="${inset}" width="${1100 - 2 * inset}" `
    + `height="${840 - 2 * inset}" fill="none" stroke="${P.gilt}" stroke-width="${width}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 840">'
    + `<rect width="1100" height="840" fill="${P.oxblood}"/>${frame(46, 5)}${frame(62, 2)}`
    + [[62, 62], [1038, 62], [62, 778], [1038, 778]].map(([x, y]) => corner(x, y)).join('')
    + circle(cx, cy, 300, mix(P.brass, P.ink, 0.35)) + circle(cx, cy, 292, P.brass)
    + ticks(cx, cy, 292, 180, [12, 12, 12], [4, 4, 4], mix(P.brass, P.ink, 0.35)) // knurling
    + circle(cx, cy, 276, P.gilt) + circle(cx, cy, 262, P.paper)
    + ticks(cx, cy, 254, 100, [26, 16, 10], [5, 3, 1.8], P.ink)
    + circle(cx, cy, 216, 'none', ` stroke="${P.rule}" stroke-width="2.5"`)
    + subDial(cx, cy - d, 216) + subDial(cx + d, cy, 72) // days, thousands of days
    + subDial(cx, cy + d, 324) + subDial(cx - d, cy, 144) // millions, thousands of millions
    + circle(cx, cy, 30, P.brass) + circle(cx, cy, 21, P.gilt) + circle(cx, cy, 8, P.ink)
    + '</svg>';
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// #region fonts: one list of faces for both threads: the page loads them, the worker gets bytes
const FONTS = { // every face the pages use: the page loads them, and so must the worker
  Baskervville: ['400', '400i'], // text, folios, subtitle, colophon
  'Baskervville SC': ['500'], // running heads, the author
  Cinzel: ['700'], // title, numeral, chapter title
};
// The worker gets the same Fontsource files the page loads: identical metrics on both threads.
const faces = Object.entries(FONTS).flatMap(([family, specs]) => specs.map((spec) => {
  const [id, weight, style] = [family.toLowerCase().replace(/ /g, '-'), parseInt(spec, 10),
    spec.endsWith('i') ? 'italic' : 'normal'];
  const file = `${id}@5/files/${id}-latin-${weight}-${style}.woff2`;
  return { family, weight: String(weight), style,
    url: `https://cdn.jsdelivr.net/npm/@fontsource/${file}` };
}));
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// The worker and the page each load the faces: the worker to measure, the page to paint.
const [typeset] = await Promise.all([startLayoutWorker(faces), loadFonts(FONTS, markdown)]);
await loadSvg('plate.svg', plate()); // images stay on the main thread: the worker never paints

document.getElementById('pages').insertAdjacentHTML('beforebegin', `<section id="editor">
  <header><span>time-machine.md · chapter I</span><label>Lay out in <select id="thread">
    <option value="worker">a Web Worker</option><option value="main">the main thread</option>
  </select></label></header>
  <textarea id="source" spellcheck="false" aria-label="Markdown source"></textarea>
  <figure><canvas id="proof" role="img"></canvas><figcaption><button id="prev"
    aria-label="Previous page">‹</button><output id="folio"></output><button id="next"
    aria-label="Next page">›</button></figcaption></figure>
  <footer><svg id="beat" viewBox="-12 -12 24 24" aria-hidden="true"><circle r="11"/>
    <path id="hand" d="M0 2V-9"/></svg><output id="clock"></output></footer></section>`);
const $ = (id) => document.getElementById(id);
$('source').value = markdown;

// #region editor: each keystroke sets the chapter again; the main thread only paints
let [doc, shown, builds, cancelled] = [null, 0, 0, 0];
// For the comparison, the main thread keeps a measurement cache as the worker does, so its
// pages match the worker's: in 1.4.1 a build with a cache can break lines differently.
const mainCache = createMeasurementCache();
function paint(n = shown) { // the canvas is sized to its box, in device pixels
  shown = Math.max(0, Math.min(doc.pages.length - 1, n));
  const vdtPage = doc.pages[shown]; // a laid-out page, not the page config above
  const height = ($('proof').clientHeight || 640) * Math.min(devicePixelRatio || 1, 2);
  renderPageToCanvas(vdtPage, doc, $('proof'), { scale: height / vdtPage.height });
  $('proof').setAttribute('aria-label', `Page ${vdtPage.pageLabel}`);
  $('folio').value = `${shown + 1} / ${doc.pages.length}`;
}
function follow() { // turn to the page that holds the caret: every block keeps its source offset
  const caret = $('source').selectionStart;
  paint(doc.pages.findLastIndex((vdtPage) => vdtPage.columns.some((column) =>
    column.blocks.some((block) => block.sourceStart <= caret))));
}
async function refresh() {
  const [ticket, onMain, started] = [++builds, $('thread').value === 'main', performance.now()];
  frames.worst = 0;
  const content = { markdown: $('source').value, resources };
  const next = onMain ? buildDocument(content, config(), mainCache) : await typeset(content);
  await new Promise(requestAnimationFrame); // the first frame after the build shows any stall
  if (!next || ticket !== builds) { cancelled++; return; } // a newer build has been asked for
  doc = next;
  if (document.activeElement === $('source')) follow(); else paint();
  showPages(doc, { title: 'The Time Machine · chapter I, set in a Web Worker' });
  $('clock').value = `${onMain ? 'Main thread' : 'Worker'} · ${doc.pages.length} pages in `
    + `${Math.round(performance.now() - started)} ms · longest frame ${Math.round(frames.worst)}`
    + ` ms · ${builds} ${builds === 1 ? 'build' : 'builds'}, ${cancelled} cancelled`;
}
$('source').addEventListener('input', refresh);
for (const type of ['click', 'keyup']) $('source').addEventListener(type, () => doc && follow());
$('thread').addEventListener('change', refresh);
$('prev').addEventListener('click', () => paint(shown - 1));
$('next').addEventListener('click', () => paint(shown + 1));
// A dial the main thread turns on every frame: it stops while that thread is busy.
const frames = { last: 0, worst: 0 };
requestAnimationFrame(function turn() { // the clock, not the frame's timestamp: a late frame
  const now = performance.now(); // keeps the time it was due, which hides the stall
  frames.worst = Math.max(frames.worst, now - (frames.last || now));
  frames.last = now;
  $('hand').setAttribute('transform', `rotate(${n1((now * 0.06) % 360)})`); // a turn in 6 s
  requestAnimationFrame(turn);
});
await refresh();
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
