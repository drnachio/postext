// ═══ Postext Cookbook · Nº 011 · One source, print and screen editions ═══════════
// https://postext.dev/en/cookbook/print-and-screen-editions
// Code: MIT · Text: original (CC BY 4.0) · Drawings: code (CC BY 4.0) · Photo: diffusion models
// Fonts: Newsreader, Gloock, Reddit Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, renderToHtml, applyHtmlViewerOverrides,
  clearMeasurementCache, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'print-and-screen-editions';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one set of colour ids, two sets of values: day for paper, night for screens
const day = { ink: '#1b222b', rain: '#3d6f9e', slate: '#2d3a4a', fog: '#e9edf1',
  rule: '#c8d0d8', muted: '#5f6a76', paper: '#ffffff' };
const night = { ink: '#e6e8eb', rain: '#9cc3e6', slate: '#56657a', fog: '#1b2129',
  rule: '#2e3742', muted: '#98a2ae', paper: '#111418' };
const paletteOf = (values) => // main-color: the engine's defaults follow the rain blue
  Object.entries({ ...values, 'main-color': values.rain })
    .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const col = (id) => ({ hex: day[id], model: 'hex', paletteId: id }); // the hex: a day fallback
// Workaround (gotcha: palette-skips-designs): 1.4.1 re-reads the palette into the text,
// table and box styles and the page background, but not into design-slot elements or
// bodyText.referenceColor, so rewrite every linked colour from the palette the config carries.
function relink(config) {
  const hex = Object.fromEntries(config.colorPalette.map(({ id, value }) => [id, value.hex]));
  const walk = (v) => (Array.isArray(v) ? v.map(walk) : !v || typeof v !== 'object' ? v
    : Object.hasOwn(hex, v.paletteId) ? { ...v, hex: hex[v.paletteId] }
      : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])));
  return walk(config);
}
// #endregion
const px = (value) => ({ value, unit: 'px' }); // screen sizes, written as CSS pixels
const [TOP, BAND, AIR] = [22, 86, 9]; // mm: top margin, the fog band's depth, air under it

// #region opener: print opens each note under a fog band; the screen keeps the words only
const text = (id, content, fontFamily, style) => ({ kind: 'text', id, content, fontFamily,
  color: col('ink'), align: 'left', ...style,
  overflow: 'wrap' }); // titles break onto more lines (gotcha: overflow-ellipsis-default)
const kicker = text('kicker', '{partTitle} · {attr.kicker}', 'Reddit Sans',
  { fontWeight: 600, textTransform: 'uppercase', color: col('rain') });
const title = text('title', '{titleText}', 'Gloock');
const lead = text('lead', '{attr.lead}', 'Newsreader', { italic: true, hyphenate: true });
const at = (to, edge, y, x = px(0)) => ({ anchor: { to, edge }, offset: { x, y } });
const under = (id, y, width) => ({ ...at(`#${id}`, 'below', y), size: { width } });
const band = (y, height) => ({ ...at('bleed', 'top-left', y), size: { width: 'fill', height } });
const fromTop = (y, x) => at('container', 'top-left', y, x);
// minHeight sets the reservation: the band's foot below the top margin, plus AIR. The band hangs
// from the bleed and counts too, but ends higher (gotcha: opener-reserves-anchored).
const printOpener = { enabled: true, minHeight: mm(BAND - TOP + AIR), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('fog') },
    placement: band(mm(0), mm(BAND)) },
  { kind: 'rule', id: 'horizon', direction: 'horizontal', thickness: pt(2), color: col('rain'),
    placement: band(mm(BAND - 0.7), pt(2)) }, // 2 pt is 0.7 mm: the rule ends at the band's foot
  { ...kicker, fontSize: pt(8), letterSpacing: pt(1.8), placement: fromTop(mm(12)) },
  { ...title, fontSize: pt(54), lineHeight: 1.04, placement: under('kicker', mm(2.5), mm(150)) },
  { ...lead, fontSize: pt(11.5), lineHeight: 1.36, placement: under('title', mm(4), mm(118)) },
] } };
const screenOpener = [
  { ...kicker, fontSize: px(12), letterSpacing: px(2.6), placement: fromTop(px(4)) },
  { ...title, fontSize: px(48), lineHeight: 1.05, placement: under('kicker', px(6), 'fill') },
  { ...lead, fontSize: px(18), lineHeight: 1.45, color: col('muted'),
    placement: under('title', px(10), 'fill') },
];
// #endregion

// #region answer: the screen edition lives in the same config, as overrides of the print one
// config() stores it as htmlViewer: { overrides: screenOverrides() }; canvas and PDF ignore it.
const screenOverrides = () => ({
  colorPalette: paletteOf(night), // arrays are replaced whole: the night values
  parts: { page: false }, // no divider page; the part still names the notes after it
  // 96 dpi: the mm and pt inherited from print render at their CSS size.
  page: { dpi: 96, margins: { top: px(40), bottom: px(40), mirror: false } },
  layout: { layoutType: 'single', // one column
    fitFiguresToPage: true }, // tall figures shrink to the pane; off by default, as in print
  bodyText: { fontSize: px(17), lineHeight: px(27), textAlign: 'left', // ragged for reading
    // A paragraph may start on the last line of a screen page. With the rule on, 1.4.1 can force
    // a paragraph taller than the pane whole into a one-line gap under a figure, and off the page.
    avoidWidows: false },
  // Heading levels merge on `level`: the print level keeps everything not restated here.
  headings: { levels: [{ level: 1, span: 'column', breakBefore: { enabled: false },
    marginTop: px(40), marginBottom: px(26),
    advancedDesign: { minHeight: px(0), slot: { elements: screenOpener } } }] }, // no band air
  footer: { elements: [] }, // a scrolling page runs no folios (print's header is empty already)
  captionStyle: { fontSize: px(13), gap: px(10) },
  paragraphStyles: [{ ...colophon, fontSize: px(13), lineHeight: px(20) }], // restated whole
});
// The host owns the page size: the pane's, in CSS pixels (gotcha: viewer-settings-sandbox-only).
// Wide panes get wider margins, so the measure stops at MEASURE.
const MEASURE = 470; // px: about 65 characters of Newsreader at 17 px
const MIN_SIDE = 34; // px: the side margins of a narrow pane
function screenConfig({ width, height }) {
  const merged = applyHtmlViewerOverrides(config()); // print + overrides, a fresh object
  const side = px(Math.max(MIN_SIDE, (width - MEASURE) / 2));
  return relink({ ...merged, page: { ...merged.page, width: px(width), height: px(height),
    margins: { ...merged.page.margins, left: side, right: side } } });
}
// #endregion

// #region part: the divider page, a rain field bled off every edge under the part's numeral
const onField = { color: col('paper'), lineHeight: 1 };
const parts = {
  margins: { top: mm(212), left: mm(24), right: mm(40) }, // the fence's list sits low
  bodyStyle: { fontSize: pt(13), lineHeight: pt(19), color: col('paper'),
    numberColor: col('paper') },
  design: { elements: [
    { kind: 'box', id: 'field', style: { backgroundColor: col('rain') },
      placement: band(mm(0), 'fill') },
    { kind: 'image', id: 'strokes', resourceId: 'rain', placement: band(mm(0), 'fill') },
    text('series', '{title}', 'Reddit Sans', { ...onField, fontWeight: 600, fontSize: pt(9),
      letterSpacing: pt(2.4), textTransform: 'uppercase', placement: fromTop(mm(30), mm(24)) }),
    text('numeral', '{number}', 'Gloock', { ...onField, fontSize: pt(190),
      placement: under('series', mm(10), mm(150)) }),
    text('name', '{titleText}', 'Gloock', { ...onField, fontSize: pt(60),
      placement: under('numeral', mm(-6), mm(150)) }),
  ] },
};
// #endregion

const foot = text('foot', '{pageNumber}   {title} · {partTitle}', 'Reddit Sans', {
  fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.5), textTransform: 'uppercase',
  color: col('muted'), align: 'center', placement: { ...at('container', 'top', mm(9)),
    size: { width: 'fill' } },
  pages: 'opener' }); // the notes, not the part page: each fits its opening page (a note that ran
// on would need a copy of this element with pages: 'body')
const colophon = { id: 'colophon', fontFamily: 'Reddit Sans', fontSize: pt(7.5),
  lineHeight: pt(11), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
  marginTop: pt(14) };

// A factory: the engine caches resolved configs per object (gotcha: config-cache-identity).
const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  // The locale does not name the figures (gotcha: resource-types-locale): "Figura" in Spanish,
  // one count for the whole issue, and a lower-case "fig." in Spanish running text.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    resetOn: 'never', ...(type.id === 'figure' && { shortLabel: t({ en: 'Fig.', es: 'fig.' }) }),
  })),
  colorPalette: paletteOf(day),
  page: { width: mm(225), height: mm(297), dpi: 150, backgroundColor: col('paper'), // dark at night
    margins: { top: mm(TOP), bottom: mm(24), left: mm(20), right: mm(16), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: { fontFamily: 'Newsreader', fontSize: pt(10), lineHeight: pt(14), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('rain'),
    textAlign: 'justify', // the default, stated for contrast with the screen's ragged 'left'
    firstLineIndent: mm(4.5), indentAfterHeading: false }, // hyphenation, widows: on by default
  headings: { fontFamily: 'Gloock', fontWeight: 400, color: col('ink'),
    // Off: 1.4.1 drops the column under a closing page's column float a line (here English Rain
    // under the gauge, Spanish Wind under the rose; gotcha: float-stretch-closing-page).
    balancing: { stretchAfterFloats: false }, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: printOpener },
  ] },
  captionStyle: { fontFamily: 'Reddit Sans', fontSize: pt(8), color: col('muted'),
    labelColor: col('rain'), gap: mm(2.4) },
  parts, paragraphStyles: [colophon], header: { elements: [] }, footer: { elements: [foot] },
  htmlViewer: { overrides: screenOverrides() }, // canvas and PDF ignore it; an HTML host applies it
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region figures: the same resources for both editions, each pointing at its edition's drawing
// The valley is a photograph, one JPEG in assets/ that both editions share, at its pixels.
const photo = { kind: 'bitmap', svg: undefined,
  bitmap: { fileId: 'valley-1610.jpg', format: 'jpeg', width: 1610, height: 690 } };
const figure = (id, edition, [width, height], placement, caption, alt) => ({ id,
  typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, placement,
  svg: { fileId: `${id}-${edition}.svg`, width, height },
  caption: caption && t(caption), altText: alt && t(alt) }); // the HTML edition's <img alt>
const figures = (edition) => [
  figure('gauge', edition, [900, 1260], { position: 'auto', span: 'column' }, {
    en: 'The rain gauge in section: the funnel feeds a tube with a tenth of its area.',
    es: 'El pluviómetro en sección: el embudo vierte en un tubo con la décima parte de su área.',
  }, {
    en: 'Rain falls on a funnel set in a can sunk in the lawn; the funnel drains into a narrow '
      + 'tube, half full, beside a graduated measuring stick.',
    es: 'La lluvia cae en un embudo sobre un vaso hundido en el césped; el embudo vierte en un '
      + 'tubo estrecho, medio lleno, junto a una regla graduada.' }),
  { ...figure('valley', edition, [1610, 690], { position: 'bottom', span: 'page' }, {
    en: 'Radiation fog at dawn: cold air drains off the hills overnight and fills the valley.',
    es: 'Niebla de irradiación al amanecer: el aire frío baja de las lomas y llena el valle.',
  }, {
    en: 'A valley between wooded hills lies under layers of fog at sunrise, with a church '
      + 'tower, trees and a river showing through it, seen from a fenced bank.',
    es: 'Un valle entre lomas boscosas yace bajo la niebla al amanecer; asoman la torre de '
      + 'una iglesia, árboles y un río, vistos desde un ribazo con una cerca.' }), ...photo },
  figure('rose', edition, [900, 900], { position: 'top', span: 'column' }, {
    en: 'Where a year of morning winds came from at the garden station: west and south-west.',
    es: 'De dónde vino el viento de un año de mañanas en el jardín: del oeste y del suroeste.',
  }, {
    en: 'A wind rose of sixteen petals on three rings; the longest petals point west and '
      + 'south-west, the shortest east.',
    es: 'Una rosa de los vientos de dieciséis pétalos sobre tres anillos; los más largos '
      + 'apuntan al oeste y al suroeste, los más cortos al este.' }),
  figure('rain', 'field', [2250, 2970]), // drawn by the part design, never cited: unnumbered
];
// #endregion

// #region art: a rain gauge in section, a wind rose, the part page's rain
function mulberry(seed) { // a seeded PRNG: the same drawing on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const f1 = (n) => n.toFixed(1);
const between = (random, [a, b]) => a + random() * (b - a);
// Slanted rain strokes; `clear` lists boxes [x0, y0, x1, y1] the strokes stay out of.
const streaks = (random, n, { x, y, len, width, color, alpha, clear = [] }) =>
  Array.from({ length: n }, () => {
    const [x0, y0, l] = [between(random, x), between(random, y), between(random, len)];
    const [o, w] = [between(random, alpha).toFixed(2), between(random, width).toFixed(2)];
    const hits = clear.some(([a, b, c, d]) => x0 > a && x0 - 0.28 * l < c && y0 + l > b && y0 < d);
    return hits ? '' : `<path d="M${f1(x0)} ${f1(y0)}l${f1(-0.28 * l)} ${f1(l)}" stroke="${color}" `
      + `stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
  }).join('');
const shape = (tag, attrs) => `<${tag} ${Object.entries(attrs)
  .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"`).join(' ')}/>`;

function gauge(p) { // 300 × 420: rain, the funnel, the can sunk in the lawn, the tube, a stick
  const random = mulberry(7);
  const line = { stroke: p.ink, strokeWidth: 2 };
  const ticks = Array.from({ length: 23 }, (_, i) =>
    `M246 ${386 - i * 9}h${i % 5 === 0 ? 14 : 7}`).join('');
  const grass = Array.from({ length: 42 }, (_, i) => `M${f1(3 + i * 7.2 + random() * 4)} 356`
    + `l${f1((random() - 0.5) * 7)} -${f1(5 + random() * 9)}`).join('');
  return svg(300, 420, streaks(random, 44, { x: [40, 292], y: [0, 72], len: [12, 24],
    width: [1.6, 2.6], color: p.rain, alpha: [0.35, 0.95] })
    + shape('path', { d: 'M70 104H230', stroke: p.muted, strokeWidth: 1.4 })
    + shape('path', { d: 'M70 104l7 -4v8zM230 104l-7 -4v8z', fill: p.muted }) // arrowheads
    + shape('rect', { x: 0, y: 355, width: 300, height: 65, fill: p.rule, fillOpacity: 0.55 })
    + shape('path', { d: grass, stroke: p.slate, strokeWidth: 1.6, strokeLinecap: 'round' })
    + shape('rect', { x: 76, y: 128, width: 148, height: 268, rx: 5, fill: p.fog, ...line,
      strokeWidth: 2.5 })
    + shape('rect', { x: 124, y: 196, width: 52, height: 192, fill: p.paper, ...line })
    + shape('rect', { x: 126, y: 290, width: 48, height: 96, fill: p.rain, fillOpacity: 0.85 })
    + shape('path', { d: 'M70 118h160v10H70z', fill: p.slate })
    + shape('path', { d: 'M72 128h156l-72 60h-12z', fill: p.rule, ...line })
    + shape('rect', { x: 144, y: 184, width: 12, height: 16, fill: p.rule, ...line })
    + shape('rect', { x: 240, y: 176, width: 26, height: 214, fill: p.paper, ...line,
      strokeWidth: 1.6 })
    + shape('rect', { x: 241, y: 290, width: 24, height: 99, fill: p.rain, fillOpacity: 0.3 })
    + shape('path', { d: ticks, stroke: p.ink, strokeWidth: 1.2 }));
}

function rose(p) { // 300 × 300: where a year of morning winds came from, in sixteen petals
  const share = [6, 4, 3, 2, 2, 3, 4, 6, 9, 12, 19, 22, 24, 14, 9, 7]; // N first, clockwise
  const petal = (s, i) => {
    const [a, r] = [((i * 22.5 - 90) * Math.PI) / 180, s * 5.4]; // length ∝ share
    const end = (d) => `${f1(150 + r * Math.cos(a + d))} ${f1(150 + r * Math.sin(a + d))}`;
    return shape('path', { d: `M150 150L${end(-0.17)}A${f1(r)} ${f1(r)} 0 0 1 ${end(0.17)}Z`,
      fill: s > 12 ? p.rain : p.slate, fillOpacity: s > 12 ? 0.95 : 0.55 });
  };
  const rings = [40, 80, 120].map((r) =>
    shape('circle', { cx: 150, cy: 150, r, fill: 'none', stroke: p.rule, strokeWidth: 1.2 }));
  return svg(300, 300, rings.join('') + share.map(petal).join('')
    + shape('path', { d: 'M150 18V282M18 150H282', stroke: p.rule, strokeWidth: 1 })
    + shape('path', { d: 'M144 14V2L156 14V2', fill: 'none', stroke: p.ink, strokeWidth: 2 }) // N
    + shape('circle', { cx: 150, cy: 150, r: 5, fill: p.ink }));
}

async function drawFigures() { // the drawings in both palettes, the part page's rain, the photo
  const words = [[20, 26, 80, 36], [20, 100, 112, 128], [20, 206, 140, 238]]; // mm: the type
  await loadSvg('rain-field.svg', svg(225, 297, streaks(mulberry(19), 320, { x: [-10, 245],
    y: [-14, 292], len: [6, 18], width: [0.3, 0.8], color: day.paper, alpha: [0.12, 0.45],
    clear: words })));
  for (const [edition, p] of [['day', day], ['night', night]]) {
    await loadSvg(`gauge-${edition}.svg`, gauge(p));
    await loadSvg(`rose-${edition}.svg`, rose(p));
  }
  await loadImage('valley-1610.jpg', asset('valley-1610.jpg'));
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  Newsreader: ['400', '400i', '700'], Gloock: ['400'],
  'Reddit Sans': ['400', '400i', '600', '700'] }; // 400: captions and the colophon

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await drawFigures();
const doc = await buildWithFonts( // print: every page on the kit's desk, and one beside the screen
  () => buildDocument({ markdown, resources: figures('day') }, config()), markdown);
showPages(doc, { title: t({ en: 'One source, print and screen editions',
  es: 'Un solo original, ediciones impresa y de pantalla' }) });

// The two editions side by side, above the desk. index.html and style.css lay them out; pasted
// on its own, the script writes the same markup, and the screen region gives the pane a height.
if (!document.getElementById('editions')) {
  document.getElementById('pages').insertAdjacentHTML('beforebegin', `<section id="editions">
  <figure class="edition"><canvas id="proof" role="img" style="width:300px"></canvas>
  <figcaption></figcaption></figure><figure class="edition screen">
  <div id="screen" role="region" tabindex="0"></div><figcaption></figcaption></figure></section>`);
}
const [proof, pane] = [document.getElementById('proof'), document.getElementById('screen')];
const [proofLabel, screenLabel] = document.querySelectorAll('#editions figcaption');
const holds = (page, id) => [...(page.floats ?? []), ...page.columns.flatMap((c) => c.blocks)]
  .some((block) => block.resourceBlock?.resource.id === id);
const note = doc.pages.find((page) => holds(page, 'gauge')) ?? doc.pages[0]; // Figure 1's page
const density = Math.min(window.devicePixelRatio || 1, 2);
renderPageToCanvas(note, doc, proof, { scale: (density * proof.clientWidth) / note.width });
const { width: trimW, height: trimH } = config().page;
proofLabel.textContent = `${t({ en: 'Print', es: 'Impresa' })} · canvas · `
  + `${trimW.value} × ${trimH.value} mm`;
proof.setAttribute('aria-label',
  `${t({ en: 'Print edition, page', es: 'Edición impresa, página' })} ${note.index + 1}`);
pane.setAttribute('aria-label', t({ en: 'Screen edition', es: 'Edición de pantalla' }));

// #region screen: the HTML edition in a Shadow DOM, laid out again when its pane resizes
const FOLDED = 200; // px: a pane narrower or shorter than this is hidden or squeezed; skip it
if (!pane.clientHeight) { // no style.css: a height, and a corner to drag the pane smaller, but
  // not under 400 px, where 1.4.1 sets text over the opener (gotcha: opener-taller-than-column)
  pane.style.cssText = 'height:580px;min-height:400px;min-width:240px;overflow:auto;resize:both';
}
pane.style.background = night.paper; // the pane's own ground, beside the pages and the scrollbar
const shadow = pane.attachShadow({ mode: 'open' }); // the page's selectors cannot reach in, but
// inherited text properties (letter-spacing, text-transform…) can, and the lines were measured
// without them: `all: initial` on the wrapper stops them at the edition's edge.
const inShadow = `<style>:host>div{all:initial;display:block}`
  + `::selection{background:${night.rain}55}</style>`; // selected text takes the night blue
let size = '';
function showScreen() {
  const [width, height] = [pane.clientWidth, pane.clientHeight];
  if (`${width}×${height}` === size || width < FOLDED || height < FOLDED) return; // same, or folded
  const first = !size; // the first build opens on Figure 1's page, like the print proof
  size = `${width}×${height}`;
  const screenDoc = buildDocument({ markdown, resources: figures('night') },
    screenConfig({ width, height }));
  const place = pane.scrollTop / pane.scrollHeight; // the reader's place, kept across rebuilds
  shadow.innerHTML = `${inShadow}<div>${renderToHtml(screenDoc,
    { mode: 'single', padding: 0, resourceImageUrl: imageUrl })}</div>`;
  const fig = first && screenDoc.pages.find((page) => holds(page, 'gauge')); // 'single' mode
  pane.scrollTop = fig ? fig.index * height : place * pane.scrollHeight; // stacks pane-tall pages
  screenLabel.textContent =
    `${t({ en: 'Screen', es: 'Pantalla' })} · HTML · ${width} × ${height} px`;
}
showScreen();
let timer = 0; // debounced; its first call, on observe(), finds the size unchanged
new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(showScreen, 150); })
  .observe(pane);
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
