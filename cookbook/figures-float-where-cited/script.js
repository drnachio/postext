// ═══ Postext Cookbook · Nº 009 · Figures that float to where you cite them ═════════
// https://postext.dev/en/cookbook/figures-float-where-cited
// Code: MIT · Text: original (CC BY 4.0) · Figures: generated in code (CC BY 4.0)
// Fonts: Faustina, Montserrat, IBM Plex Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.4.1
//
// Chapter 2 of a geomorphology textbook. Six of its seven figures float, each to the first
// free slot its placement allows, counting from the paragraph that first cites it. Figure 2.6
// is set where ::resource embeds it. The figures are numbered in order of first mention.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes, parseMarkdown,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'figures-float-where-cited';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: eight named colours; the drawings mix their tints from the same ones
const palette = {
  ink: '#1b2227', // text: a cold near-black
  glacier: '#34729a', // the accent: kicker, ribbon, caption labels, references, folios, water
  ice: '#e3f1f8', // the opener slab
  rock: '#5b5a57', // bedrock in the drawings
  moss: '#7d8f4e', // valley floors and pines
  rule: '#c6d3db', // the hairline under the running heads
  muted: '#5d6a72', // running heads, credit notes, the colophon
  paper: '#ffffff',
};
// A linked colour carries its hex too: postext 1.4.1 design slots and referenceColor read
// the hex, not the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color' (#295aa3): pointing it at the accent keeps
  // that second blue off the page.
  { id: 'main-color', name: 'glacier (defaults)', value: { hex: palette.glacier, model: 'hex' } },
];
// #endregion
const TEXT = 'Faustina'; // one family each for text, display and labels
const DISPLAY = 'Montserrat';
const LABEL = 'IBM Plex Sans Condensed';
const LEAD = 13.4; // body leading in pt: the grid every float band snaps to
const [PAGE_W, PAGE_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [200, 250, 22, 20, 18, 14, 6]; // mm
const MEASURE = PAGE_W - INNER - OUTER; // 168 mm: the text block, and a page-wide figure
const COLUMN = (MEASURE - GUTTER) / 2; // 81 mm: a column, and a column figure

// #region captions: the type name in the document's language; bold label, italic description
const captions = () => ({
  // config.locale sets hyphenation, not captions (gotcha: resource-types-locale):
  // 'Figura 2.3' and 'Fig. 2.3' come from the localised types, numbered {h1}.{n} per chapter.
  resourceTypes: defaultResourceTypes(LANG),
  captionStyle: { // the text colour follows bodyText; the note is 0.85 × the caption size
    fontFamily: LABEL, fontSize: pt(8.3), gap: mm(2.2),
    labelColor: col('glacier'), descriptionItalic: true, // the label is bold by default
    note: { color: col('muted'), gap: mm(0.6) }, // the credit line
  },
});
// #endregion

// #region furniture: an ice slab off the fore-edge, a ribbon from the head, running heads
const at = (to, edge, x, y, width, height) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: height ? mm(height) : 'auto' } }) });
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  align: 'left', ...extra });
const caps = (size) => ({ fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.18) }); // capitals tracked 0.18 em
// Opener texts break onto more lines instead of ending in '…' (gotcha: overflow-ellipsis-default).
const wrap = { overflow: 'wrap' };
const [SLAB, RIBBON, RIBBON_END] = [64, 30, 70]; // mm: slab height; ribbon width and length
const [TEXT_X, KICKER_Y] = [RIBBON + 8, 10]; // mm: the opener texts start 8 mm right of the ribbon
const [TITLE_W, LEAD_W] = [118, 112]; // mm: the title's measure, and a shorter standfirst
const opener = {
  enabled: true,
  // At least 5 mm under the slab; the reserve then rounds up to whole 13.4 pt grid lines,
  // so here 69 mm becomes 15 lines (70.9 mm) and the text starts about 7 mm under the slab.
  minHeight: mm(SLAB + 5),
  slot: { elements: [
    { kind: 'box', id: 'slab', style: { backgroundColor: col('ice') }, // runs off the fore-edge
      placement: at('container', 'top-left', 0, 0, MEASURE + OUTER, SLAB) },
    { kind: 'box', id: 'ribbon', style: { backgroundColor: col('glacier') }, // hangs from the head
      placement: at('page', 'top-left', INNER, 0, RIBBON, RIBBON_END) },
    text('numeral', '{chapterNumber}', DISPLAY, 80, 'paper', // an 80 pt line box is 28 mm tall:
      at('page', 'top-left', INNER, RIBBON_END - 31, RIBBON), // it ends 3 mm above the foot
      { fontWeight: 800, lineHeight: 1, align: 'center' }),
    text('kicker', t({ en: 'Chapter {chapterNumber} · {attr.topic}',
      es: 'Capítulo {chapterNumber} · {attr.topic}' }), LABEL, 8.5, 'glacier',
    at('container', 'top-left', TEXT_X, KICKER_Y), { ...caps(8.5), ...wrap }),
    text('title', '{titleText}', DISPLAY, 27, 'ink', at('#kicker', 'below', 0, 2.6, TITLE_W),
      { fontWeight: 800, lineHeight: 1.06, ...wrap }),
    text('lead', '{attr.lead}', TEXT, 10.6, 'ink', at('#title', 'below', 0, 4.2, LEAD_W),
      { italic: true, lineHeight: 1.38, hyphenate: true, ...wrap }),
  ] },
};
const HAIRLINE = TOP - 5; // mm from the top edge: the rule under the running heads
const HEAD_Y = HAIRLINE - 4.4; // the running heads' line box, 4.4 mm above the hairline
const head = (id, content, parity, edge, x, extra) => text(id, content, LABEL, 7.6, 'muted',
  at('page', edge, x, HEAD_Y), { ...caps(7.6), parity, pages: 'body', ...extra });
const folio = (id, parity, edge, x, extra) => text(id, '{pageNumber}', DISPLAY, 8.5, 'glacier',
  at('page', edge, x, HEAD_Y), { fontWeight: 800, parity, pages: 'body', ...extra });
const header = { elements: [ // outer corners, over a hairline; never on the opener
  folio('verso-folio', 'even', 'top-left', OUTER),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8), { align: 'right' }),
  folio('recto-folio', 'odd', 'top-right', -OUTER, { align: 'right' }),
  { kind: 'rule', id: 'hairline', pages: 'body', direction: 'horizontal', color: col('rule'),
    thickness: pt(0.5), placement: { ...at('container', 'top-left', 0, HAIRLINE),
      size: { width: 'fill', height: 'auto' } } },
] };
const footer = { elements: [ // the drop folio: on the opener only, centred 9 mm under the text
  text('drop-folio', '{pageNumber}', DISPLAY, 8.5, 'glacier', at('container', 'top', 0, 9),
    { fontWeight: 800, align: 'center', pages: 'opener' })] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  ...captions(),
  colorPalette,
  page: { width: mm(PAGE_W), height: mm(PAGE_H), dpi: 150, // a compact textbook trim
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { // justified serif; first lines indented 4 mm, except after a heading
    fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('glacier'), // citations in the accent, like the caption labels they name
    firstLineIndent: mm(4), indentAfterHeading: false },
  headings: {
    fontFamily: DISPLAY, fontWeight: 800, color: col('ink'),
    // Columns end flush by adding grid lines above the H2s. Beside a float band a column can
    // come up several lines short; one line per heading (the default is 4) keeps a section
    // head from floating in a gap, and the balancer's other levers take what is left.
    balancing: { maxLinesPerHeading: 1 },
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, fontSize: pt(27), span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
        marginTop: pt(LEAD), marginBottom: pt(0) }, // one grid line above, none below
    ],
  },
  unorderedLists: { color: col('glacier'), marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// Caption, credit note ('-' for none) and alt text of each figure, one block per figure.
const figureTexts = /* @content:figures */ '';
const TEXTS = Object.fromEntries(figureTexts.trim().split(/\n\s*\n/)
  .map((block) => block.split('\n').map((line) => line.trim()))
  .map(([id, caption, note, alt]) => [id, [caption, note === '-' ? undefined : note, alt]]));

// #region answer: six figures float to the first slot their placement allows; one stays put
// In the Markdown, :ref{id="valleys" case="lower"} prints 'fig. 2.1' and places Figure 2.1.
// Captions, credits and alt texts come from content.figures.<lang>.md.
const figure = (id, height, placement) => {
  if (!TEXTS[id]) throw new Error(`content.figures has no caption block for "${id}"`);
  const [caption, note, altText] = TEXTS[id];
  // An SVG fills the width of its slot (a column or the text block, or a fraction of
  // either), so its width and height only give its shape.
  const width = (placement.span === 'page' ? MEASURE : COLUMN) * (placement.width ?? 1);
  return { id, typeId: 'figure', kind: 'svg', caption, note, altText,
    svg: { fileId: `${id}.svg`, width, height }, placement, createdAt: 0, updatedAt: 0 };
};
// In any order: the first mention of each one in the text, a :ref or a ::resource line,
// decides its number.
const resources = [
  // Cited on the opener page: 'auto' may take that page's foot band, where 'top'
  // could only open the next page (gotcha: top-float-next-page).
  figure('valleys', 56, { position: 'auto', span: 'page' }),
  // Across both columns, but only in a foot band: the page it is cited on, if both
  // columns still have room there, else the foot of the next page.
  figure('profile', 60, { position: 'bottom', span: 'page' }),
  // A column figure that takes only a column head: the next one still empty after its
  // citation, here the right column of the same page, above the text that follows it.
  figure('cirque', 48, { position: 'top' }),
  // Cited in the same sentence, the two take the next two column heads, side by side.
  figure('abrasion', 48, { position: 'top' }),
  figure('plucking', 48, { position: 'top' }),
  // No float: set exactly where ::resource{id="roche"} stands. In postext 1.4.1 an inline
  // figure gets a grid line above it but only the grid snap below, so the Markdown follows
  // it with :::space{lines=1} (gotcha: here-figure-no-space-after).
  figure('roche', 42, { position: 'here' }),
  // A band of its own, 60% of the text width and centred. It is cited on the chapter's last
  // page, where a 'top' float would wait for the next page; a float cannot leave its
  // chapter, so this one goes to the foot of the last page. A float is queued where its
  // citing paragraph starts, so that paragraph starts on the last page
  // (gotcha: float-queues-at-paragraph).
  figure('moraines', 60, { position: 'top', span: 'page', width: 0.6, align: 'center' }),
];
// #endregion

// #region check: every cited id exists and every figure gets placed, before the build
// An unknown :ref prints '?' and a figure nobody names is never placed, and postext 1.4.1
// warns about neither (gotcha: unknown-ref-silent). The engine's own parser lists the
// mentions exactly as numbering and placement read them; an embed needs double quotes
// (gotcha: resource-double-quotes).
function checkFigures() {
  const [named, embedded] = [[], new Set()];
  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'resourceBlock' && block.resourceId) {
      named.push(block.resourceId);
      embedded.add(block.resourceId);
    }
    for (const span of block.spans) if (span.ref?.resourceId) named.push(span.ref.resourceId);
  }
  const ids = resources.map((r) => r.id);
  const types = new Set(captions().resourceTypes.map((type) => type.id));
  const problems = [
    ...[...new Set(named)].filter((id) => !ids.includes(id)).map((id) => `unknown id "${id}"`),
    ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `"${id}" is defined twice`),
    ...ids.filter((id) => !named.includes(id)).map((id) => `"${id}" is never cited`),
    ...resources.filter((r) => r.placement.position === 'here' && !embedded.has(r.id))
      .map((r) => `"${r.id}" is placed 'here' but no ::resource line embeds it`),
    ...resources.filter((r) => !types.has(r.typeId)).map((r) => `"${r.id}": no type ${r.typeId}`),
  ];
  if (problems.length) throw new Error(`Figures: ${problems.join('; ')}`);
}
// #endregion

// #region art: the seven drawings, in millimetres at their printed size, in the palette
const mix = (hex, other, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16)
  * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
const mixWhite = (hex, k) => mix(hex, '#ffffff', k); // tints for the drawings
const mixInk = (hex, k) => mix(hex, palette.ink, k); // shades
// Labels are ink, 4.9:1 or more on sky, ice and stone; a few on the sky are in 'flow' (5.5:1)
// and 'lake' is white on the water (5.2:1).
const C = { sky: mixWhite(palette.glacier, 0.7), ice: mixWhite(palette.glacier, 0.24),
  snow: palette.paper, stone: mixWhite(palette.rock, 0.4), deep: mixWhite(palette.rock, 0.12),
  rock: palette.rock, floor: mixWhite(palette.moss, 0.55), moss: mixInk(palette.moss, 0.12),
  water: palette.glacier, flow: mixInk(palette.glacier, 0.4), ink: palette.ink };
function mulberry32(seed) { // a seeded PRNG: the same drawing on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const n2 = (v) => +v.toFixed(2);
const pts = (list) => list.map(([x, y]) => `${n2(x)} ${n2(y)}`).join(' L');
const poly = (list, fill, stroke = 'none', w = 0.25) => `<path d="M${pts(list)}Z" fill="${fill}" `
  + `stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`;
const line = (list, stroke, w = 0.25, extra = '') => `<path d="M${pts(list)}" fill="none" `
  + `stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`
  + `${extra}/>`;
// A smooth path through the points (Catmull-Rom as cubic Béziers), open or closed.
function smooth(list, close = false) {
  const p = close ? [list.at(-1), ...list, list[0], list[1]] : [list[0], ...list, list.at(-1)];
  let d = `M${n2(p[1][0])} ${n2(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    d += `C${n2(b[0] + (c[0] - a[0]) / 6)} ${n2(b[1] + (c[1] - a[1]) / 6)} `
      + `${n2(c[0] - (e[0] - b[0]) / 6)} ${n2(c[1] - (e[1] - b[1]) / 6)} ${n2(c[0])} ${n2(c[1])}`;
  }
  return close ? `${d}Z` : d;
}
const shape = (d, fill, stroke = 'none', w = 0.25, extra = '') => `<path d="${d}" fill="${fill}" `
  + `stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"${extra}/>`;
// Arrowheads are paths: a <marker> would make the PDF rasterise the drawing
// (gotcha: svg-no-marker-filters).
function arrowhead([x, y], angle, color = C.flow, [h, s] = [1.5, 0.65]) {
  const [bx, by] = [x - h * Math.cos(angle), y - h * Math.sin(angle)];
  const [px, py] = [-Math.sin(angle) * s, Math.cos(angle) * s];
  return poly([[x, y], [bx + px, by + py], [bx - px, by - py]], color);
}
function flow(list, color = C.flow, w = 0.38) { // a smooth arrow through the points
  const [[xa, ya], [xb, yb]] = list.slice(-2);
  const angle = Math.atan2(yb - ya, xb - xa);
  const end = [xb - 1.1 * Math.cos(angle), yb - 1.1 * Math.sin(angle)];
  return shape(smooth([...list.slice(0, -1), end]), 'none', color, w, ' stroke-linecap="round"')
    + arrowhead([xb, yb], angle, color);
}
// A label, with an optional hairline leader to the point it names.
function label(x, y, words, { anchor = 'start', to, bold = false, color = C.ink } = {}) {
  const leader = to ? line([[to[0], to[1]], [to[2] ?? x, to[3] ?? y - 0.9]], C.ink, 0.15) : '';
  return `${leader}<text x="${n2(x)}" y="${n2(y)}" text-anchor="${anchor}" fill="${color}"`
    + `${bold ? ' font-weight="600"' : ''}>${words}</text>`;
}
const L = (en, es) => t({ en, es });
// Seeded speckle: a rock texture inside a band of the drawing, skipping any spot keep() refuses.
function speckle(seed, x0, x1, top, bottom, count, color = C.rock, keep = () => true) {
  const rnd = mulberry32(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = top(x) + 1 + rnd() * Math.max(0, bottom - top(x) - 1.5);
    const r = 0.12 + rnd() * 0.22;
    if (!keep(x, y, r)) continue;
    out += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="${color}" fill-opacity="0.4"/>`;
  }
  return out;
}
const along = (list) => (x) => { // the y of a polyline at x
  for (let i = 1; i < list.length; i++) {
    const [[xa, ya], [xb, yb]] = [list[i - 1], list[i]];
    if (x <= xb) return ya + ((yb - ya) * (x - xa)) / Math.max(xb - xa, 1e-6);
  }
  return list.at(-1)[1];
};
// An SVG loaded as an <img> has no access to the page's web fonts (gotcha: svg-no-webfonts),
// so each drawing embeds the two weights its labels use. The latin subsets cover the English
// and Spanish labels.
const LABEL_MM = 2.45; // the label size in the drawings' millimetres: about 7 pt in print
async function labelFace() {
  const id = fontsourceId(LABEL);
  const faces = await Promise.all(['400', '600'].map(async (weight) => {
    const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}-`
      + 'normal.woff2';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Label face not found (${res.status}): ${url}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return `@font-face{font-family:L;font-weight:${weight};`
      + `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
  }));
  return `${faces.join('')}text{font-family:L;font-size:${LABEL_MM}px}`;
}
// The viewBox is the figure's printed size in mm; the SVG's own size is set in mm too.
const svg = (w, h, face, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}mm" `
  + `height="${n2(h)}mm" viewBox="0 0 ${n2(w)} ${n2(h)}"><style>${face}</style>${body}</svg>`;

function valleys(w, h) { // two 80 mm panels, one at each edge
  const panel = (x0, title, ground, extra) => `<g transform="translate(${n2(x0)} 0)">`
    + `<rect width="80" height="${h}" fill="${C.sky}"/>${extra[0]}`
    + shape(`${smooth(ground)}L80 ${h}L0 ${h}Z`, C.stone, C.rock, 0.3)
    + speckle(x0 + 3, 1, 79, along(ground), h, 70) + extra[1]
    + label(3, 5.5, title, { bold: true }) + '</g>';
  const vee = [[0, 10], [10, 15.5], [20, 24.5], [30, 36], [36.6, 45], [40, 47.4], [43.4, 45],
    [50, 36], [60, 24.5], [70, 15.5], [80, 11]];
  const rnd = mulberry32(11);
  let trees = '';
  for (let i = 0; i < 16; i++) { // pines on both slopes of the V
    const x = i < 8 ? 4 + rnd() * 26 : 50 + rnd() * 26;
    const y = along(vee)(x) + 0.5;
    trees += poly([[x - 0.9, y], [x, y - 3 - rnd()], [x + 0.9, y]], C.moss);
  }
  const river = poly([[38, 46.2], [42, 46.2], [41, 47.6], [39, 47.6]], C.water);
  const yu = [[0, 9], [6, 11], [10, 16], [12.5, 24], [14.2, 33], [17, 41], [22, 45.6], [31, 47.2],
    [49, 47.2], [58, 45.6], [63, 41], [65.8, 33], [67.5, 24], [70, 16], [74, 11], [80, 9.5]];
  const iceTop = 21; // the ice is drawn under the rock, which trims it to the valley
  const ice = `M4 ${iceTop + 0.8}Q40 ${iceTop - 3.6} 76 ${iceTop + 0.8}L76 52L4 52Z`;
  const ghost = line([[11.4, iceTop], [22, 30], [34, 41.5], [40, 45], [46, 41.5], [58, 30],
    [68.6, iceTop]], C.snow, 0.3, ' stroke-dasharray="1 0.8"');
  return panel(0, L('River valley', 'Valle fluvial'), vee, ['', trees + river
    + label(47, 52.4, L('river', 'río'), { to: [41, 47.6, 47.4, 50.6] })])
    + panel(w - 80, L('Glacial valley', 'Valle glaciar'), yu, [shape(ice, C.ice, C.flow, 0.3),
      ghost + label(40, 30, L('ice', 'hielo'), { anchor: 'middle', bold: true })
      + label(52.5, 52.4, L('earlier V-shaped valley', 'antiguo valle en V'), { anchor: 'middle',
        to: [46.5, 41.8, 50, 50.6] })]);
}

function profile(w, h) {
  const Y = (list) => list.map(([x, y]) => [x, y * 1.15]); // drawn 52 mm tall, set 60 mm tall
  const bed = Y([[0, 3], [3, 4.5], [6, 9], [9, 17], [12, 25], [16, 31], [22, 34], [28, 34.5],
    [33, 32.6], [37, 32.2], [44, 34], [60, 36.5], [80, 39], [100, 41.5], [120, 43.5],
    [138, 45.5], [152, 46.6], [168, 47.4]]);
  const surf = Y([[7.4, 12.5], [14, 16.6], [24, 20.2], [40, 23.8], [62, 27.8], [80, 31],
    [100, 35], [118, 39], [130, 42], [136.4, 44.6], [138, 45.5]]);
  const under = bed.filter(([x]) => x > 7.4 && x < 138).reverse();
  const top = along(surf);
  const snow = [...surf.filter(([x]) => x < 62), [62, top(62)]];
  const bracket = (x1, x2, words) => line([[x1, 9.2], [x1, 8], [x2, 8], [x2, 9.2]], C.flow, 0.3)
    + label((x1 + x2) / 2, 6.4, words, { anchor: 'middle', bold: true, color: C.flow });
  return `<rect width="${w}" height="${h}" fill="${C.sky}"/>`
    + shape(`${smooth(bed)}L${w} ${h}L0 ${h}Z`, C.stone, C.rock, 0.3)
    + speckle(7, 0, w, along(bed), h, 170)
    + shape(`${smooth(surf)}L${pts(under)}Z`, C.ice, C.flow, 0.3)
    + shape(`${smooth(snow)}L${pts(snow.map(([x, y]) => [x, y + 1.4]).reverse())}Z`, C.snow,
      C.flow, 0.2)
    + shape(smooth(Y([[136, 45.4], [139.5, 43.4], [143, 42.8], [147, 43.9], [151, 46.4]])),
      C.deep, C.rock, 0.3) // the terminal moraine
    + line(Y([[151, 46.9], [158, 46.9], [168, 47.7]]), C.water, 0.7)
    // Flow lines: snow buried near the head sinks deepest and surfaces nearest the snout.
    + flow(Y([[14, 17.4], [24, 26], [44, 31.3], [70, 35.6], [96, 39.2], [116, 41.2], [128, 42.2]]),
      C.snow)
    + flow(Y([[30, 21.8], [46, 27.6], [70, 32.2], [92, 35.4], [108, 37.4]]), C.snow)
    + flow(Y([[48, 25.6], [62, 28.9], [76, 31.4], [88, 33.2]]), C.snow)
    + line([[62, 9.4], [62, top(62) - 0.2]], C.ink, 0.3, ' stroke-dasharray="1 0.7"')
    + bracket(9, 60, L('accumulation zone', 'zona de acumulación'))
    + bracket(64, 137, L('ablation zone', 'zona de ablación'))
    + label(63.6, 21, L('equilibrium line', 'línea de equilibrio'))
    + label(111, 38.2, L('ice flow', 'flujo del hielo'), { color: C.flow, bold: true,
      to: [114, 46.6, 112.6, 39.2] })
    + label(149.4, 44.6, L('terminal moraine', 'morrena frontal'),
      { to: [145.6, 49.2, 148.8, 44] }) + label(4, 57.4, L('bedrock', 'lecho rocoso'));
}

function cirque(w, h) {
  const bed = [[0, 3], [4, 4], [8, 8.4], [11, 16], [14, 26], [18, 34], [24, 39], [32, 41],
    [40, 40.5], [47, 38], [52, 35], [56, 34.2], [60, 36], [68, 39], [81, 41.5]];
  const surf = [[11.7, 18.5], [20, 22.4], [32, 25.6], [46, 28], [60, 31], [72, 34], [81, 35.6]];
  const under = bed.filter(([x]) => x > 11.7).reverse();
  return `<rect width="${w}" height="${h}" fill="${C.sky}"/>`
    + shape(`${smooth(bed)}L${w} ${h}L0 ${h}Z`, C.stone, C.rock, 0.3)
    + speckle(3, 0, w, along(bed), h, 80)
    + shape(`${smooth(surf)}L${pts(under)}Z`, C.ice, C.flow, 0.3)
    + poly([[12.1, 18.6], [14.2, 25.4], [13.6, 18.9]], C.ink) // the bergschrund
    + flow([[18.5, 24.5], [26, 37], [40, 37.5], [52.5, 31.6]], C.snow)
    + label(1.6, 30, L('back wall', 'pared'))
    + label(22, 13.6, L('bergschrund', 'rimaya'), { to: [13.6, 20, 21, 12.7] })
    + label(31, 34.4, L('rotation', 'rotación'), { bold: true })
    + label(31, 45.6, L('basin', 'cubeta'))
    + label(64.5, 25, L('rock lip', 'umbral'), { anchor: 'middle', to: [56, 34, 62, 26] });
}

// Bubbles and faint layers tell the ice from the sky in a close-up.
function iceTexture(seed, w, bottom) {
  const rnd = mulberry32(seed);
  let out = '';
  for (let i = 0; i < 26; i++) {
    const [x, y] = [2 + rnd() * (w - 4), 12 + rnd() * (bottom - 16)];
    out += `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(0.3 + rnd() * 0.5)}" ry="0.25" `
      + `fill="${C.snow}" fill-opacity="0.7"/>`;
  }
  for (const y of [bottom - 9, bottom - 5.5]) {
    out += line([[0, y + 0.4], [w * 0.3, y - 0.3], [w * 0.7, y + 0.3], [w, y - 0.2]], C.snow,
      0.25, ' stroke-opacity="0.6"');
  }
  return out;
}

function abrasion(w, h) {
  const bed = [[0, 31], [20, 30.4], [40, 31.2], [60, 30.6], [81, 31.4]];
  const y = along(bed);
  const rnd = mulberry32(5);
  let clasts = '';
  let grooves = '';
  for (const [x, r] of [[9, 2.4], [27, 3.2], [46, 2], [63, 2.8], [75, 1.6]]) {
    const ring = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const k = r * (0.75 + rnd() * 0.4);
      return [x + Math.cos(a) * k * 1.3, y(x) - r + 0.35 + Math.sin(a) * k];
    });
    clasts += shape(smooth(ring, true), C.deep, C.rock, 0.25);
  }
  for (let x = 3; x < 80; x += 2.6 + rnd() * 2) { // striations cut into the bed
    grooves += poly([[x - 0.35, y(x)], [x, y(x) + 0.9], [x + 0.35, y(x)]], C.rock);
  }
  return `<rect width="${w}" height="${h}" fill="${C.ice}"/>${iceTexture(2, w, 30)}`
    + shape(`${smooth(bed)}L${w} ${h}L0 ${h}Z`, C.stone, C.rock, 0.3) + grooves
    + speckle(9, 0, w, y, h, 90) + clasts
    + speckle(4, 30, 44, (x) => y(x) - 1.6, y(33), 36, C.ink)
    + flow([[6, 7], [30, 7]], C.snow) + label(32, 7.8, L('ice moves', 'el hielo avanza'),
      { bold: true })
    + label(46, 17, L('stones in the ice', 'cantos presos en el hielo'),
      { to: [63, 26.6, 58, 17.8] })
    + label(22, 40, L('striations', 'estrías'), { anchor: 'end', to: [21.6, 31.2, 16, 38.4] })
    + label(40, 40, L('rock flour', 'harina de roca'), { to: [36, 29.8, 40, 38.4] });
}

function plucking(w, h) {
  const Y = (list) => list.map(([x, y]) => [x, y + 10]); // the section of 36 mm, 10 mm lower
  const bed = Y([[0, 25], [16, 24.2], [30, 21.2], [40, 18.6], [45.5, 18], [46, 21.4], [51, 21.8],
    [51.4, 26.6], [81, 27.4]]);
  const joints = [[46, 21.6, 46, 38], [51.2, 26.8, 51.2, 38], [58, 27, 58.6, 38],
    [38, 18.9, 37.5, 38], [66, 27.2, 66.4, 38]].map(([a, b, c, d]) => [a, b + 10, c, d + 10]);
  const block = Y([[52.6, 18.6], [58.4, 17.2], [60, 22.8], [54.2, 24]]); // lifted into the ice
  return `<rect width="${w}" height="${h}" fill="${C.ice}"/>${iceTexture(6, w, 28)}`
    + shape(`M${pts(bed)}L${w} ${h}L0 ${h}Z`, C.stone, C.rock, 0.3)
    + speckle(13, 0, w, along(bed), h, 90)
    + poly(Y([[51.4, 26.6], [51.4, 21.8], [56.8, 21.6], [58, 27]]), C.snow, C.rock, 0.2)
    + joints.map(([a, b, c, d]) => line([[a, b], [c, d]], C.rock, 0.3)
      + line([[a, b + 0.6], [a + (c - a) * 0.3, b + (d - b) * 0.3]], C.water, 0.55)).join('')
    + poly(block, C.deep, C.rock, 0.3) + flow([[6, 7], [30, 7]], C.snow)
    + label(32, 7.8, L('ice moves', 'el hielo avanza'), { bold: true })
    + label(62, 16.4, L('plucked block', 'bloque arrancado'), { to: [59.4, 27.4, 62.6, 17.2] })
    + label(4, 43, L('ice in the joints', 'hielo en las diaclasas'),
      { to: [37.8, 35, 27, 41.8] });
}

function roche(w, h) {
  const ground = [[0, 35], [8, 34.4], [18, 31], [30, 25.4], [40, 20.8], [47, 18.6],
    [50.5, 18.4], [52, 19.4], [52.6, 22.6], [55.4, 23.2], [56.2, 26.6], [59.2, 27.2], [60, 30.4],
    [63.4, 31], [64.2, 34], [70, 34.8], [81, 35]];
  const debris = [[65, 33.7, 1.4], [68.2, 34.1, 1], [70.8, 34.4, 0.8]].map(([x, yy, r]) =>
    `<circle cx="${x}" cy="${yy}" r="${r}" fill="${C.deep}" stroke="${C.rock}" `
    + 'stroke-width="0.2"/>');
  return `<rect width="${w}" height="${h}" fill="${C.sky}"/>`
    + shape(`M${pts(ground)}L${w} ${h}L0 ${h}Z`, C.stone, C.rock, 0.3)
    + speckle(21, 0, w, along(ground), h, 74)
    + line([[9, 33.6], [18.4, 30.2], [30, 24.7], [40, 20.1], [47, 17.9]], C.snow, 0.5)
    + line([[0, 14], [30, 11.6], [52, 10.6], [81, 11.4]], C.flow, 0.3,
      ' stroke-dasharray="1.2 0.9"') // the ice surface, long gone
    + debris.join('') + flow([[6, 6], [30, 6]])
    + label(32, 6.8, L('ice, long gone', 'el hielo, hoy fundido'), { color: C.flow, bold: true })
    + label(22, 25.2, L('abrasion: smooth', 'abrasión: pulida'), { anchor: 'end' })
    + label(60, 20.6, L('plucking: rough', 'arranque: rugosa'));
}

// Plan view, down-valley at the foot: the ice has retreated from the arc of its terminal
// moraine, and the lake between the two drains through a notch in the arc.
function moraines(w, h) {
  const cx = w / 2;
  const X = (list) => list.map(([dx, y]) => [cx + dx, y]); // drawn about the valley's axis
  const mirror = (list) => [...list, ...list.slice(0, -1).reverse().map(([dx, y]) => [-dx, y])];
  const ice = X([...mirror([[-44, 0], [-42.5, 8], [-39, 15], [-33.5, 21.5], [-26.5, 26.8],
    [-18, 30.6], [-9, 32.8], [0, 33.4]]), [10, 0], [9, 8], [4, 15], [0, 18], [-4, 15], [-9, 8],
    [-10, 0]]);
  const arc = X(mirror([[-43.8, -1], [-41.5, 10], [-37, 19], [-31, 27], [-26, 35], [-21, 42],
    [-14, 48], [-7, 51.2], [0, 52.2]]));
  const lake = X([[-17, 37.5], [-8, 35.6], [0, 35.4], [8, 35.6], [17, 37.5], [16, 42.5],
    [9, 46.8], [0, 48.3], [-9, 46.8], [-16, 42.5]]);
  const rnd = mulberry32(8);
  let marks = '';
  for (const [dx, y] of [[-35, 7], [-31, 12.4], [-27, 17.8], [35, 7], [31, 12.4], [27, 17.8]]) {
    const x = cx + dx; // crevasses
    marks += line([[x - 2, y + rnd() * 0.6], [x, y + 0.9], [x + 2, y + rnd() * 0.6]], C.flow, 0.25);
  }
  // Speckles and erratic boulders keep 2 mm clear of the stream and of every label box
  // (a label's width estimated at 1.05 mm a letter, its box 2.8 mm tall).
  const names = [L('lateral moraine', 'morrena lateral'), L('medial moraine', 'morrena central'),
    L('terminal moraine', 'morrena frontal')];
  const [lateral, medial, terminal] = names.map((words) => words.length * 1.05);
  const keepOut = [[cx - 1, 47, 2, h - 47], [8.5, 45.6, lateral, 2.8], [cx + 3, 24.8, medial, 2.8],
    [w - 3 - terminal, 55.6, terminal, 2.8]];
  const keep = (x, y, r) => !keepOut.some(([x0, y0, bw, bh]) => x > x0 - 2 - r
    && x < x0 + bw + 2 + r && y > y0 - 2 - r && y < y0 + bh + 2 + r);
  let boulders = '';
  for (let placed = 0, tries = 0; placed < 12 && tries < 200; tries++) {
    const [x, y, r] = [9 + rnd() * (w - 18), 55 + rnd() * 3.8, 0.35 + rnd() * 0.45];
    if (!keep(x, y, r)) continue;
    boulders += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="${C.deep}"/>`;
    placed++;
  }
  return `<rect width="${n2(w)}" height="${h}" fill="${C.floor}"/>`
    + poly([[0, 0], [7, 0], [8, 18], [4, 34], [6, h], [0, h]], C.stone) // the valley walls
    + poly([[w, 0], [w - 7, 0], [w - 8, 18], [w - 4, 36], [w - 6, h], [w, h]], C.stone)
    + speckle(17, 0, w, () => 0, h, 90, C.rock, keep) + boulders
    + shape(smooth(lake, true), C.water)
    + line(X([[0, 33.2], [0.3, 34.4], [0, 35.8]]), C.water, 0.5) // meltwater into the lake
    + shape(`M${pts(ice)}Z`, C.ice, C.flow, 0.3) + marks
    + shape(smooth(arc), 'none', C.deep, 2.4, ' stroke-linecap="round"')
    + line(X([[0, 47.6], [0.6, 50.4], [-0.4, 53], [1, 56], [0, h + 0.5]]), C.water, 0.7)
    + line(X([[-9, 8], [-4, 15], [0, 18.5], [0, 33]]), C.rock, 1.3) // the medial moraine
    + line(X([[9, 8], [4, 15], [0, 18.5]]), C.rock, 1.3)
    + flow(X([[-27, 2.5], [-22.5, 10.5]]), C.snow) + flow(X([[27, 2.5], [22.5, 10.5]]), C.snow)
    + label(8.5, 47.6, names[0], { to: [cx - 22.4, 41.6, 20, 45.4] })
    + label(cx + 3, 26.8, names[1], { to: [cx + 0.9, 26, cx + 2.6, 26] })
    + label(cx, 43, L('lake', 'lago'), { anchor: 'middle', bold: true, color: C.snow })
    + label(w - 3, 57.6, names[2], { anchor: 'end', to: [cx + 11, 50, w - 13, 55.4] });
}
const DRAWINGS = { valleys, profile, cirque, abrasion, plucking, roche, moraines };
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build (gotcha: fonts-first)
  Faustina: ['400', '400i', '700'], // text
  Montserrat: ['800'], // display: title, section heads, numeral, folios
  'IBM Plex Sans Condensed': ['400', '400i', '600', '700'], // labels: kicker, heads, captions
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const words = `${markdown}\n${figureTexts}`; // captions too: their letters decide the subsets
await loadFonts(FONTS, words);
checkFigures(); // a wrong id stops here, and the viewer's bar says why
// #region build: register the drawings, then set chapter 2 of a longer book
const face = await labelFace();
for (const { id, svg: { fileId, width, height } } of resources) { // each under its svg.fileId
  await loadSvg(fileId, svg(width, height, face, DRAWINGS[id](width, height)));
}
// One chapter came before: figures number 2.1, 2.2… and the folios start at 27.
const continuation = { pageNumbering: { startAt: 27 }, // odd, to match the recto of page 1
  headings: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 2
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), words);
showPages(doc, { title: t({ en: 'Figures that float to where you cite them',
  es: 'Figuras que flotan hasta donde las citas' }) });
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
