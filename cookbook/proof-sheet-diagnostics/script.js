// ═══ Postext Cookbook · Nº 055 · A galley proof with every fault marked in red ══════
// https://postext.dev/en/cookbook/proof-sheet-diagnostics
// Code: MIT · Text: original (CC BY 4.0) · Map: code (CC BY 4.0) · Photo: diffusion models
// Fonts: Charis SIL, Chivo, Fragment Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  parseMarkdownWithIssues, KNOWN_DIRECTIVES, KNOWN_CONTAINERS,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'proof-sheet-diagnostics';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// col() links a colour to its palette entry; the hex is the value the entry holds.
const palette = { // proof: the one accent and the marks; rule: the map's banks; muted: furniture
  ink: '#1d1d1b', proof: '#d7263d', paper: '#f6f3ea', rule: '#bdb8aa', muted: '#76726a' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [...Object.entries(palette), ['main-color', palette.proof]] // every default
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })); // on main-color: red
const [TEXT, DISPLAY, MONO] = ['Charis SIL', 'Chivo', 'Fragment Mono'];
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [190, 253, 22, 20, 17, 14]; // mm, mirrored
const MEASURE = TRIM_W - INNER - OUTER; // mm: 159, the text block the opener spans
const [LEAD, ART_H, DPI] = [14, 50, 150]; // pt: leading; mm: the photograph; page px/inch
const NONE = { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) };
const caps = (size) => ({ fontFamily: MONO, fontSize: pt(size), letterSpacing: pt(size * 0.12),
  textTransform: 'uppercase', fontWeight: 400 });

const below = (id, gap, width = MEASURE) => ({ anchor: { to: id, edge: id === 'container'
  ? 'top-left' : 'below' }, offset: { x: mm(0), y: mm(gap) }, size: { width: mm(width) } });
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...extra });
const opener = { enabled: true, slot: { elements: [ // the drawing, then the words under it
  { kind: 'image', id: 'art', resourceId: 'crossing', placement: { ...below('container', 0),
    size: { width: mm(MEASURE), height: mm(ART_H) } } },
  // The words start 6 mm under the drawing, and the opener reserves down to the byline.
  text('kicker', '{attr.kicker}', MONO, 8, 'proof', below('container', ART_H + 6), caps(8)),
  text('title', '{titleText}', DISPLAY, 50, 'ink', below('#kicker', 1.4),
    { fontWeight: 900, lineHeight: 0.96 }), // a multiple of the size
  text('standfirst', '{attr.standfirst}', TEXT, 11.5, 'ink', below('#title', 4, 136),
    { italic: true, lineHeight: 1.3 }),
  text('byline', '{attr.byline}', MONO, 7.5, 'muted', below('#standfirst', 3), caps(7.5))] } };
const head = (id, content, parity, edge, x, y = 12) => text(id, content, MONO, 7.5, 'muted',
  { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } }, { ...caps(7.5), parity,
    pages: 'body', align: edge.split('-')[1] ?? 'center' }); // y: mm from the trim
const header = { elements: [
  head('verso', t({ en: '{pageNumber}   The Tideline · issue 41',
    es: '{pageNumber}   La Marea · número 41' }), 'even', 'top-left', OUTER),
  head('recto', t({ en: 'News · the night ferry   {pageNumber}',
    es: 'Noticias · la barcaza nocturna   {pageNumber}' }), 'odd', 'top-right', -OUTER)] };
const footer = { elements: [{ ...head('drop', '{pageNumber}', 'all', 'bottom', 0, -11),
  pages: 'opener' }] }; // the opener's folio drops to its foot

// #region boxes: the fact box splits where the page ends; the stamp is pinned to a corner
const boxes = [
  // keepTogether: false: cut between two blocks at the page foot; a line of white closes it.
  { id: 'facts', keepTogether: false, backgroundEnabled: false, marginBottom: pt(LEAD),
    stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('proof') },
    padding: { ...NONE, top: mm(2.6) }, titleStyle: { ...caps(8), color: col('proof') },
    body: { fontSize: pt(9), lineHeight: pt(LEAD), textAlign: 'left', firstLineIndent: pt(0) },
    lists: { bulletChar: '■', color: col('proof'), bulletFontSize: pt(5) } },
  // 'fixed': pinned to the page its fence falls on, out of the flow; 'auto': as wide as its title.
  { id: 'stamp', placement: 'fixed', width: 'auto', backgroundEnabled: false,
    title: t({ en: 'Proof · 2nd pass', es: 'Segundas pruebas' }),
    fixed: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(-OUTER), y: mm(8) } },
    border: { enabled: true, color: col('proof'), width: pt(1.2) }, borderRadius: mm(1),
    padding: { top: mm(1.4), right: mm(2.4), bottom: mm(1.2), left: mm(2.4) },
    titleStyle: { ...caps(9), color: col('proof'), gap: mm(0) } },
];
// #endregion
const side = (id, body, fontFamily = DISPLAY) => ({ id, span: 'side', backgroundEnabled: false,
  padding: NONE, titleStyle: { ...caps(7), color: col('proof'), gap: mm(2) }, // outer column
  body: { fontFamily, textAlign: 'left', firstLineIndent: pt(0), ...body } });
const calloutStyles = [...boxes, side('quote', { fontSize: pt(12.5), lineHeight: pt(15) }),
  side('dates', { fontSize: pt(9), lineHeight: pt(12), paragraphSpacing: true }),
  side('colophon', { fontSize: pt(6.5), lineHeight: pt(9.5), color: col('muted') }, MONO)];

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), colorPalette,
  resourceTypes: [{ id: 'figure', name: t({ en: 'Map', es: 'Mapa' }),
    captionPrefix: t({ en: 'Map', es: 'Mapa' }), shortLabel: t({ en: 'map', es: 'mapa' }),
    numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: DPI,
    backgroundColor: col('paper'), margins: { top: mm(TOP), bottom: mm(BOTTOM),
      left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: 27, sideColumnRole: 'floats',
    sideColumnSide: 'outer', gutterWidth: mm(6) },
  bodyText: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), // a :ref (map 1) takes boldColor
    firstLineIndent: mm(4), indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.6,
    maxRuntTracking: 0 }, // runts close by spaces alone: tracked, the first pass loses a fault
  headings: { fontFamily: DISPLAY, color: col('ink'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' }, // a recto
      advancedDesign: opener },
  ] },
  calloutStyles, header, footer,
  captionStyle: { fontFamily: DISPLAY, fontSize: pt(8), lineHeight: pt(11), color: col('ink'),
    labelBold: true, labelColor: col('proof') },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region first-pass: the galley as filed, the corrected text with its faults put back
const FIRST_PASS = [ // [corrected, faulty], replaced wherever it occurs
  [':::callout{type="stamp"}\n:::', t({ en: ':::stamp', es: ':::sello' })], // no such directive
  [':ref{id="route"}', ':ref{id="route-map"}'], // an id no resource has
  ['\\$', '$'], // bare dollars (gotcha: dollar-math)
  [' https://', ' '], // a web address without its scheme
  [':::\n:::\n', ''], // the fact box's two closing fences
  ['\u20601971.', '1971.'], // the word joiner before 1971 (gotcha: digit-period-list)
];
const firstPass = (md) => FIRST_PASS.reduce((out, [fix, fault]) => out.replaceAll(fix, fault), md);
// #endregion

// #region answer: the checks: what the parser and the layout report, and what they leave to you
const MM = DPI / 25.4; // page px per mm
function proof(md, doc) {
  const faults = [];
  const add = (kind, from, to, detail, at) => faults.push({ kind, from, to, detail, at });
  const { blocks, issues } = parseMarkdownWithIssues(md); // a $, $$ or ::: left open
  for (const i of issues) add(i.kind, i.sourceStart, i.sourceEnd);
  for (const w of doc.warnings ?? []) { // calloutOverflow: a box no cut could split
    add(w.kind, w.sourceStart, w.sourceEnd, Math.round(w.overflowPx / MM), w);
  }
  if (!doc.converged) add('unsettled', 0, 1, doc.iterationCount); // the layout never settled
  // The pen's own readings of the source and the lines, in the same list and shape.
  const ids = new Set(resources.map((r) => r.id)); // an unknown id prints '?'
  for (const m of md.matchAll(/:ref\{id="([^"]*)"|^::resource\{id="([^"]*)"/gm)) {
    if (!ids.has(m[1] ?? m[2])) add('unknownResourceId', m.index, m.index + m[0].length);
  }
  for (const m of md.matchAll(/^:::?([a-z][\w-]*)/gim)) { // an unknown fence prints as text
    const known = KNOWN_CONTAINERS.has(m[1]) || KNOWN_DIRECTIVES.has(m[1]) || m[1] === 'resource';
    if (!known) add('unknownDirective', m.index, m.index + m[0].length);
  }
  for (const b of blocks) { // formulas count as faults only because this story has none
    if (b.startNumber > 999) add('yearList', b.sourceStart, b.sourceEnd); // 1971. opens a list
    for (const s of b.spans ?? []) if (s.math) add('formula', s.math.sourceStart, s.math.sourceEnd);
  }
  // The lines as set: spaces past maxWordSpacing, a line set ragged, a hyphen in an address.
  const max = doc.config.bodyText.maxWordSpacing;
  for (const l of doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks))
    .flatMap((b) => b.lines ?? [])) {
    const ratio = Math.round(l.justifiedSpaceRatio * 100) / 100; // as the report prints it
    if (ratio > max) add('looseLine', l.sourceStart, l.sourceEnd, ratio);
    if (l.ragged) add('raggedLine', l.sourceStart, l.sourceEnd); // past 3×: no ratio left
    if (l.hyphenated && /[./]\S+-$/.test(l.text)) add('addressHyphen', l.sourceStart, l.sourceEnd);
  }
  return faults.sort((a, b) => a.from - b.from);
}
// #endregion

// #region marks: each fault underlined in red where it was set, numbered in the nearest margin
const linesOf = (page) => [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]
  .flatMap((b) => (b.lines ?? []).map((l) => ({ ...l.bbox, from: l.sourceStart, to: l.sourceEnd,
    width: l.justifiedSpaceRatio // a bbox is the natural width; a justified line fills the block
      ? b.bbox.x + b.bbox.width - l.bbox.x : l.bbox.width })));
const REACH = 80; // characters after a fence where its first line may start
function spotOf(page, f) { // where a fault shows on this page: its first line, in page px
  if (f.at) { // a box that ran off its column: a bar under the column's foot
    const c = page.columns[f.at.columnIndex]?.bbox;
    return f.at.pageIndex === page.index ? { ...c, y: c.y + c.height, height: 1.6 * MM } : null;
  }
  const lines = linesOf(page); // a fence sets no line of its own: then the first line after it
  return lines.find((r) => r.from < f.to && r.to > f.from)
    ?? lines.find((r) => r.from >= f.from && r.from - f.to < REACH);
}
function paintMarks(canvas, page, faults, scale) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0); // page px from here on
  Object.assign(ctx, { font: `${3 * MM}px "${MONO}"`, textAlign: 'center' });
  const taken = []; // the numbers set so far: two on one line sit side by side
  faults.forEach((f, n) => {
    const r = spotOf(page, f);
    if (!r) return;
    const wash = f.kind === 'looseLine'; // a loose line is washed, any other fault underlined
    Object.assign(ctx, { fillStyle: palette.proof, globalAlpha: wash ? 0.2 : 1 });
    ctx.fillRect(r.x, wash ? r.y : r.y + r.height, r.width, wash ? r.height : 0.45 * MM);
    const [left, y] = [r.x + r.width / 2 < page.width / 2, r.y + r.height / 2]; // nearest margin
    const shift = taken.filter((ty) => Math.abs(ty - y) < 4.5 * MM).length * 5.2 * MM;
    const [x, edge] = [left ? 6.5 * MM + shift : page.width - 6.5 * MM - shift,
      left ? r.x : r.x + r.width]; // the number, and a leader from it to the text
    taken.push(y);
    ctx.globalAlpha = 1;
    ctx.fillRect(Math.min(x, edge), y - 0.12 * MM, Math.abs(x - edge), 0.24 * MM);
    ctx.beginPath();
    ctx.arc(x, y, 2.4 * MM, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = palette.paper;
    ctx.fillText(String(n + 1), x, y + 1.05 * MM);
  });
}
// #endregion

// #region source: a click on a proof page selects the Markdown that set the line
function selectSource(from, to) {
  const all = source.value; // measure the wrapped height of the text before the selection
  source.value = all.slice(0, from);
  const top = source.scrollHeight;
  source.value = all;
  source.focus({ preventScroll: true });
  source.setSelectionRange(from, to); // the offsets the parser and the layout give
  source.scrollTop = top > source.clientHeight ? top - source.clientHeight / 3 : 0;
}
function onPageClick(canvas, page) {
  canvas.onclick = ({ clientX, clientY }) => {
    const box = canvas.getBoundingClientRect(); // CSS px to page px
    const [x, y] = [(clientX - box.left) * (page.width / box.width),
      (clientY - box.top) * (page.height / box.height)];
    const hit = linesOf(page).find((r) => x >= r.x && x <= r.x + r.width && y >= r.y
      && y <= r.y + r.height);
    if (hit?.from !== undefined) selectSource(hit.from, hit.to);
  };
}
// #endregion

const DESK_W = 420; // CSS px: a page's width on the proof desk (style.css); words: index.html
const say = (key, value = '') => $('words').content.querySelector(`[data-key="${key}"]`)
  .dataset[LANG].replace('{}', value.toLocaleString(LANG));
const passOf = (md) => md === markdown ? 'second' : md === firstPass(markdown) ? 'first' : 'edited';
function proofDesk(md, draft) {
  const faults = proof(md, draft);
  $('galley').replaceChildren(...draft.pages.map((page) => {
    const canvas = Object.assign(document.createElement('canvas'), { role: 'img',
      ariaLabel: say('page', page.index + 1) });
    const scale = (Math.min(devicePixelRatio, 2) * DESK_W) / page.width;
    renderPageToCanvas(page, draft, canvas, { scale });
    paintMarks(canvas, page, faults, scale);
    onPageClick(canvas, page);
    return canvas;
  }));
  const [n, copy] = [faults.length, say(passOf(md))]; // copy: first pass, second pass, an edit
  $('verdict').textContent = `${say(n > 1 ? 'faults' : n ? 'fault' : 'clean', n)} ${copy}`;
  $('passes').textContent = `iterationCount ${draft.iterationCount} · converged ${draft.converged}`;
  $('report').replaceChildren(...faults.map((f, n) => {
    const li = document.createElement('li');
    li.innerHTML = '<button type="button"><b></b><span></span><code></code></button>';
    const [b, span, code] = li.firstChild.children;
    [b.textContent, span.textContent] = [n + 1, say(f.kind, f.detail)];
    code.textContent = `${f.kind} · ${md.slice(f.from, f.to).split('\n')[0]}`;
    li.firstChild.onclick = () => selectSource(f.from, f.to);
    return li;
  }));
  return faults;
}

// #region art: the route map, drawn in the page's palette; the crossing is a photograph
const R = (v) => Math.round(v * 100) / 100;
const rect = (x, y, w, h, fill, opacity = 1) => `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" `
  + `height="${R(h)}" fill="${fill}" opacity="${R(opacity)}"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `
  + `viewBox="0 0 ${w} ${h}">${body}</svg>`;
function routeMap() { // 42 × 44 mm, 10 units a mm: south bank at the foot, the sea to the right
  const [W, H] = [420, 440];
  const { ink, paper, proof, rule } = palette;
  const line = (d, color, extra = '') =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="5" ${extra}/>`;
  return svg(W, H, rect(0, 0, W, H, paper)
    + `<path d="M0 0H${W}V58C340 76 250 50 170 68S60 56 0 80Z" fill="${rule}"/>` // the banks
    + `<path d="M0 ${H}H${W}V372C330 356 250 388 170 370S60 384 0 360Z" fill="${rule}"/>`
    + `<ellipse cx="262" cy="214" rx="58" ry="26" fill="none" stroke="${ink}" stroke-width="3"`
    + ' stroke-dasharray="6 7"/>' // the shoal
    + line('M164 370V70', ink) // the flood: straight across
    + line('M164 370C150 300 84 270 86 214S150 110 164 70', proof, 'stroke-dasharray="14 9"')
    + rect(150, 362, 28, 20, ink) + rect(150, 56, 28, 20, ink) // the two slips
    + line('M300 318h72', ink) + `<path d="M394 318l-26-11v22Z" fill="${ink}"/>` // the ebb
    + line('M380 150v48', ink) + `<path d="M380 128l-11 26h22Z" fill="${ink}"/>` // north,
    + line('M371 118V92L389 118V92', ink, 'stroke-linejoin="miter"')); // under its N
}
const resources = [{ id: 'route', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'route.svg', width: 420, height: 440 }, placement: { span: 'side' },
  caption: t({ en: 'Night route, north up. Solid: straight across on the flood, 12 minutes. '
    + 'Dashed red: on the ebb, when the current runs out to sea (arrow), bowed upstream of the '
    + 'Coffin Rock shoal (dotted), 15 minutes.',
  es: 'Ruta nocturna, norte arriba. Continua: en línea recta con la llenante, 12 minutos. '
    + 'Roja discontinua: con la vaciante (flecha), aguas arriba del bajo Piedra Negra '
    + '(punteado), 15 minutos.' }),
  altText: t({ en: 'A plan of the crossing: two banks, a dotted shoal, and between two slips a '
    + 'straight black track and a dashed red track bowed away from the shoal; an arrow marked N '
    + 'points north, another points out to sea.',
  es: 'Plano del cruce: dos orillas, un bajo punteado y, entre dos rampas, una ruta negra recta '
    + 'y una ruta roja discontinua que se abre lejos del bajo; una flecha con una N señala el '
    + 'norte y otra, el mar.' }) },
{ id: 'crossing', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, // 159 × 50 mm
  bitmap: { fileId: 'crossing-1590.jpg', format: 'jpeg', width: 1590, height: 500 },
  altText: t({ en: 'A ferry with lit windows and a red port light crossing a dark estuary under '
    + 'a full moon, a cannery and its stack on the far bank.',
  es: 'Una barcaza con las ventanas encendidas y la luz roja de babor cruza de noche un estuario '
    + 'bajo la luna llena, con una planta en la otra orilla.' }) }];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Charis SIL': ['400', '400i', '700', '700i'], Chivo: ['400', '700', '900'],
  'Fragment Mono': ['400'] }; // every face, loaded before the first build

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([prepareFonts(markdown, config(), kitFonts(FONTS)),
  loadSvg('route.svg', routeMap()), loadImage('crossing-1590.jpg', asset('crossing-1590.jpg'))]);
const $ = (id) => document.getElementById(id); // the proof desk of index.html
const source = $('source');
for (const el of document.querySelectorAll('#proof [data-en]')) el.textContent = el.dataset[LANG];
const build = (m) => buildDocumentWithFonts({ markdown: m, resources }, config(), kitFonts(FONTS));
const proofAgain = async (md) => proofDesk(source.value = md, await build(md));
const first = await proofAgain(firstPass(markdown)); // first: the galley as it came in
const doc = await build(markdown); // last: the corrected galley, the pages below
showPages(doc, { title: say('title') });
$('again').onclick = () => proofAgain(source.value);
$('fixed').onclick = () => proofAgain(markdown);
selectSource(first[0].from, first[0].to); // the first fault, selected in the Markdown

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
