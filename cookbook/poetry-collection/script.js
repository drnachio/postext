// ═══ Postext Cookbook · Nº 015 · Poems set line by line ═════════════════════════════
// https://postext.dev/en/cookbook/poetry-collection
// Code: MIT · Text: G. M. Hopkins, Poems, 1918 (PD) · Plate and ornament: drawn in code
// Fonts: Sorts Mill Goudy, Italiana, Marcellus SC (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'poetry-collection';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#26221f', // the text: a warm near-black
  sage: '#56673f', // the one accent: numerals, the plate's ground, the ornament's leaves
  sepia: '#8c5f3a', // used for the rowan berries only
  muted: '#746a60', // dates, folios, leaders and the colophon
  paper: '#fbf8f2', // the page
};
// The hex travels with the id: designs do not read the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.sage, model: 'hex' } },
];
const TRIM_W = 140, TRIM_H = 216; // mm: a poetry trim, tall enough for a sonnet's turnovers
const LEAD = 15; // pt: the body's leading, the grid every line of verse sits on

// #region answer: verse: a paragraph per line, indents kept, turnovers that hang, stanza space
// A poem is one :::paragraphs{style="verse"} container with a paragraph per line, so no line
// runs on into the next. An indented line starts with spaces, two to an em, and a :::space
// line leaves one line of the grid between stanzas (blank lines only separate paragraphs):
//   :::paragraphs{style="verse"}
//   The world is charged with the grandeur of God.
//
//       It will flame out, like shining from shook foil;
//
//   :::space
//
//   And for all this, nature is never spent;
//   :::
const verse = {
  id: 'verse',
  textAlign: 'left', // ragged: a line that turns over is not stretched to the measure
  hangingIndent: em(4), // a turned line hangs past the 1 and 2 em indents
  // Verse is never hyphenated; ragged text is not in 1.4.1 either (gotcha: ragged-no-hyphenation).
  hyphenation: false,
};
// A paragraph loses its leading spaces, and hangingIndent overrides firstLineIndent, so in verse
// each pair of leading spaces becomes an em space behind a word joiner, where the trim stops.
const indentVerse = (md) => md.replace(/:::paragraphs\{style="verse"\}\n[\s\S]*?\n:::\n/g,
  (poem) => poem.replace(/^((?: {2})+)(?=\S)/gm, (s) => `\u2060${'\u2003'.repeat(s.length / 2)}`));
// Hook-up: paragraphStyles: [verse, …] and buildDocument({ markdown: indentVerse(markdown) }).
// #endregion

// #region lines: the lines around a poem: a dedication above it, a place and a date below
const lineStyles = [
  { id: 'dedication', fontSize: pt(9.5), marginBottom: pt(LEAD) }, // under The Windhover
  { id: 'date', fontFamily: 'Marcellus SC', fontSize: pt(8), color: col('muted'),
    textAlign: 'right', marginTop: pt(LEAD) }, // a line of space above, flush right
];
// #endregion

// #region poem-head: every poem opens a page under its numeral and its title
// '{1:I}' numbers the poems I to IV and {number} prints it (gotcha: heading-number-placeholders).
// The head is HEAD_LINES grid lines (minHeight, no bottom margin), so each poem starts on the same
// line; numeral and title fill 4, or 5 if the title wraps (gotcha: overflow-ellipsis-default).
const HEAD_LINES = 6;
const poemHead = { enabled: true, minHeight: pt(LEAD * HEAD_LINES), slot: { elements: [
  { kind: 'text', id: 'numeral', content: '{number}', fontFamily: 'Italiana', fontSize: pt(22),
    color: col('sage'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Sorts Mill Goudy',
    italic: true, fontSize: pt(17), color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#numeral', edge: 'below' }, offset: { y: mm(2) },
      size: { width: 'fill' } } },
] } };
// Parity 'any': the next page, recto or verso (restated: gotcha headings-drop-h1-break).
const poems = { level: 1, numberingTemplate: '{1:I}', advancedDesign: poemHead,
  marginBottom: pt(0), breakBefore: { enabled: true, parity: 'any' } };
// #endregion

// #region front: the half-title, the frontispiece, the title page and the contents
// Headings too, each on a page of its own, with no number, contents entry or folio.
// A style restates the break, or inherits the poems' (gotcha: style-inherits-break).
const leaf = { numbered: false, toc: false, span: 'page', footer: { elements: [] },
  breakBefore: { enabled: true, parity: 'any' } };
const onPage = (y, width) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) },
  ...(width && { size: { width: mm(width) } }) }); // centred, y mm below the trim
const face = (id, content, font, size, y, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), color: col('ink'), align: 'center',
  placement: onPage(y), ...extra });
const image = (id, placement) => ({ kind: 'image', id, resourceId: id, placement });
const design = (...elements) => ({ enabled: true, slot: { elements } });
const front = [
  { id: 'half-title', ...leaf,
    advancedDesign: design(face('title', '{titleText}', 'Italiana', 20, 60)) },
  { id: 'plate', ...leaf, advancedDesign: design( // span 'page': a column clips its design
    image('plate', { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } }),
    face('caption', '{attr.caption}', 'Sorts Mill Goudy', 8.5, 203,
      { italic: true, color: col('muted') })) },
  { id: 'title-page', ...leaf, advancedDesign: design(
    face('author', '{author}', 'Marcellus SC', 10, 46, // {author}, {title}: the frontmatter
      { letterSpacing: pt(2.4), textTransform: 'uppercase' }),
    // A multiple of the size, never pt() (gotcha: design-lineheight-multiple).
    face('title', '{title}', 'Italiana', 54, 56, { lineHeight: 1 }),
    face('subtitle', '{subtitle}', 'Sorts Mill Goudy', 13, 80,
      { italic: true, color: col('sage') }),
    image('sprig', onPage(96, 30)),
    face('press', 'The Herbarium Press', 'Marcellus SC', 8.5, 182,
      { letterSpacing: pt(1.8), color: col('muted') })) },
  { id: 'contents', ...leaf, span: 'column', advancedDesign: { enabled: false },
    fontFamily: 'Italiana', fontSize: pt(24), lineHeight: pt(LEAD * 2), marginBottom: pt(LEAD) },
];
// #endregion

// #region contents: what :::toc prints for each poem: numeral, italic title, leader, page
// The toc centres each numeral on its line, not on the baseline (gotcha: toc-number-baseline);
// left at the titles' size, these Italiana numerals land on it, where 9 pt ones rode high.
const contents = {
  levels: [{ level: 1, italic: true, marginBottom: pt(LEAD), numberFontFamily: 'Italiana',
    numberFontWeight: 400, numberColor: col('sage'), numberWidth: mm(6), numberGap: mm(3) }],
  pageNumber: { fontFamily: 'Marcellus SC', fontSize: pt(9), color: col('muted'), width: mm(6) },
  leader: { char: '. ', gap: mm(2) }, // spaced dots, right-aligned so they line up
};
// #endregion

// #region ornament: a resource type for artwork that prints no caption and no label
// No caption prefix and no caption: the sprig prints bare, where ::resource{id="sprig"} puts
// it (double quotes: gotcha resource-double-quotes), a fifth of the measure wide, centred.
const ornament = { id: 'ornament', name: 'Ornament', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.2, align: 'center' } };
// #endregion

const proseStyles = [ // the note on the text and the colophon, under the contents
  { id: 'note', fontSize: pt(9.5), lineHeight: pt(13) },
  { id: 'colophon', fontSize: pt(8), lineHeight: pt(11), color: col('muted'), textAlign: 'left',
    firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
const folio = (pages) => ({ kind: 'text', id: `folio-${pages}`, content: '{pageNumber}', pages,
  fontFamily: 'Marcellus SC', fontSize: pt(9), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(10) } } });

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  // The list replaces Figure and Table; a book with figures spreads defaultResourceTypes() in.
  resourceTypes: [ornament],
  page: { // mirror: left is the inner margin; 150 dpi is for the screen
    sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(22), bottom: mm(24), left: mm(22), right: mm(18), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: { // the note's prose: justified, hyphenated (en-us), spaces 0.8–1.6 of normal
    fontFamily: 'Sorts Mill Goudy', fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4),
    indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.6,
  },
  headings: {
    fontFamily: 'Sorts Mill Goudy', fontWeight: 400, color: col('ink'),
    levels: [poems, { level: 2, fontFamily: 'Marcellus SC', fontSize: pt(9), lineHeight: pt(LEAD),
      color: col('sage'), marginTop: pt(0), marginBottom: pt(0) }],
  },
  headingStyles: front,
  toc: contents,
  paragraphStyles: [verse, ...lineStyles, ...proseStyles],
  header: { elements: [] }, // no running heads: each poem starts a page under its own title
  footer: { elements: [folio('opener'), folio('body')] }, // centred; never on a blank page
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a photogram of fern and rowan, and a rowan sprig for the ornament
let seed = 1877; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(palette[a].slice(i, i + 2),
  16) * (1 - k) + parseInt(palette[b].slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
  .join('')}`;
const f = (n) => n.toFixed(1);
const path = (d, fill, a = 1) => `<path d="${d}" fill="${fill}" fill-opacity="${a}"/>`;
const ring = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const disk = (x, y, r, fill, a = 1) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" `
  + `fill="${fill}" fill-opacity="${a}"/>`;
const PX = 10; // a drawing w × h mm has a viewBox in tenths of a millimetre, w·PX × h·PX
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w * PX} ${h * PX}">${body}</svg>`;
// A cubic Bézier and its unit normal at t.
const bez = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  const coord = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i]
    + t * t * t * p3[i];
  const dt = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i])
    + 3 * t * t * (p3[i] - p2[i]);
  const [dx, dy] = [dt(0), dt(1)];
  const len = Math.hypot(dx, dy) || 1;
  return { x: coord(0), y: coord(1), a: Math.atan2(dy, dx), nx: -dy / len, ny: dx / len };
};
// A stalk: the curve drawn as a filled band tapering from w0 to w1.
const stalk = (curve, w0, w1) => {
  const left = [];
  const right = [];
  for (let i = 0; i <= 40; i++) {
    const p = bez(curve, i / 40);
    const w = (w0 + (w1 - w0) * (i / 40)) / 2;
    left.push([p.x + p.nx * w, p.y + p.ny * w]);
    right.unshift([p.x - p.nx * w, p.y - p.ny * w]);
  }
  return ring([...left, ...right]);
};
// A leaf blade from its base (x, y) along angle a: length l, half-width w, `teeth` serrations.
const blade = (x, y, a, l, w, teeth = 0) => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const side = (sign) => Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    let h = w * Math.sin(Math.PI * t ** 0.85) ** 0.9;
    if (teeth && t > 0.25) h *= 1 - 0.18 * ((t * teeth) % 1);
    return at(l * t, sign * h);
  });
  return ring([...side(1), ...side(-1).reverse()]);
};
// A fern frond: a curving rachis, alternate pinnae longest near the base, each a comb of lobes.
function fern(curve, reach, lobe) {
  const d = [stalk(curve, 20, 3)];
  const n = 30;
  for (let i = 3; i < n; i++) {
    const t = i / n;
    const p = bez(curve, t);
    const side = i % 2 ? 1 : -1;
    const len = reach * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.25) / 2) ** 1.2;
    const pa = p.a + side * (1.05 - 0.35 * t); // pinnae lean towards the tip
    const [cx, cy] = [Math.cos(pa), Math.sin(pa)];
    const sweep = side * 0.18; // each pinna arches a little towards the tip
    const axis = [[p.x, p.y], [p.x + cx * len / 3, p.y + cy * len / 3],
      [p.x + Math.cos(pa - sweep) * len * 0.68, p.y + Math.sin(pa - sweep) * len * 0.68],
      [p.x + Math.cos(pa - sweep * 2) * len, p.y + Math.sin(pa - sweep * 2) * len]];
    d.push(stalk(axis, 5, 1.2));
    const k = Math.max(2, Math.round(len / (lobe * 0.82)));
    for (let j = 0; j < k; j++) {
      const s = (j + 0.5) / (k + 0.3);
      const q = bez(axis, s);
      const size = lobe * (1.05 - s * 0.6) * (0.92 + rand() * 0.16);
      for (const sgn of [1, -1]) d.push(blade(q.x, q.y, q.a + sgn * 0.95, size * 1.6, size * 0.5));
    }
    const tip = bez(axis, 1);
    d.push(blade(tip.x, tip.y, tip.a, lobe * 1.2, lobe * 0.35));
  }
  return d.join('');
}
// Rowan: a woody stem, pinnate leaves of serrated leaflets and a dome of berries.
function rowan(curve, leaves, cluster, scale = 1) {
  const d = [stalk(curve, 22 * scale, 8 * scale)];
  const dots = [];
  for (const [t, side, len] of leaves) {
    const p = bez(curve, t);
    const a = p.a + side * 0.9;
    const l = len * scale;
    const rachis = [[p.x, p.y], [p.x + Math.cos(a) * l / 3, p.y + Math.sin(a) * l / 3],
      [p.x + Math.cos(a + side * 0.12) * l * 2 / 3, p.y + Math.sin(a + side * 0.12) * l * 2 / 3],
      [p.x + Math.cos(a + side * 0.25) * l, p.y + Math.sin(a + side * 0.25) * l]];
    d.push(stalk(rachis, 5 * scale, 2 * scale));
    for (let j = 0; j < 6; j++) {
      const q = bez(rachis, 0.18 + j * 0.15);
      const size = (130 - j * 6) * scale;
      for (const sgn of [1, -1]) d.push(blade(q.x, q.y, q.a + sgn * 1.25, size, size * 0.22, 7));
    }
    const tip = bez(rachis, 1);
    d.push(blade(tip.x, tip.y, tip.a, 125 * scale, 27 * scale, 7));
  }
  const [cx, cy, r] = cluster; // berries on short stalks, heaped into a dome
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI * (0.08 + rand() * 0.84);
    const dist = r * Math.sqrt(rand());
    const [bx, by] = [cx + Math.cos(a) * dist * 1.25, cy + Math.sin(a) * dist * 0.8];
    d.push(stalk([[cx, cy + r * 0.5], [cx, cy], [bx, by + 20 * scale], [bx, by]], 3 * scale,
      2 * scale));
    dots.push([bx, by, (17 + rand() * 5) * scale]);
  }
  return { d: d.join(''), dots };
}

// The frontispiece: a photogram, the specimens left in paper white on a brushed field of
// sage, the way Anna Atkins printed her ferns in cyanotype.
function photogram(w, h) {
  const [W, H] = [w * PX, h * PX];
  const [x0, y0, x1, y1] = [70, 70, W - 70, H - 170]; // the brushed-on coating
  const phase = [rand(), rand(), rand()].map((r) => r * 6.3);
  const wob = (v, amp) => amp * (Math.sin(v / 37 + phase[0]) * 0.5 + Math.sin(v / 13 + phase[1])
    * 0.3 + Math.sin(v / 5.3 + phase[2]) * 0.2) + (rand() - 0.5) * amp * 0.4;
  const edge = [];
  for (let x = x0; x <= x1; x += 10) edge.push([x, y0 + wob(x, 7)]);
  for (let y = y0; y <= y1; y += 10) edge.push([x1 + wob(y, 16), y]);
  for (let x = x1; x >= x0; x -= 10) edge.push([x, y1 + wob(x + 99, 7)]);
  for (let y = y1; y >= y0; y -= 10) edge.push([x0 + wob(y + 55, 16), y]);
  const out = [`<defs><radialGradient id="g" cx="0.42" cy="0.38" r="0.85">`
    + `<stop offset="0" stop-color="${mix('sage', 'paper', 0.06)}"/>`
    + `<stop offset="1" stop-color="${mix('sage', 'ink', 0.4)}"/></radialGradient></defs>`,
  path(ring(edge), 'url(#g)')]; // a single path with a gradient fill; only its outline is ragged
  const frond = fern([[520, 1960], [380, 1350], [640, 700], [930, 190]], 400, 26);
  const tree = rowan([[1090, 1960], [1160, 1450], [960, 1060], [1000, 640]],
    [[0.2, -1, 300], [0.4, 1, 280], [0.58, -1, 290], [0.76, 1, 250]], [1000, 600, 150], 0.85);
  // Opaque, as a photogram is: where the two specimens overlap they print one white.
  out.push(path(frond, palette.paper), path(tree.d, palette.paper));
  for (const [x, y, r] of tree.dots) out.push(disk(x, y, r, palette.paper), disk(x, y - r * 0.2,
    r * 0.22, mix('sage', 'paper', 0.5)));
  return svgOf(w, h, out.join(''));
}

// The ornament: a rowan leaf laid flat, with a bunch of berries at its tip.
function sprig() {
  const [w, h] = [36, 12];
  const rib = [[16, 66], [90, 56], [170, 56], [236, 60]];
  const d = [stalk(rib, 6, 3)];
  for (let j = 0; j < 5; j++) {
    const q = bez(rib, 0.12 + j * 0.19);
    const size = 50 - j * 3;
    for (const sgn of [1, -1]) d.push(blade(q.x, q.y, q.a + sgn * 1.1, size, size * 0.22, 8));
  }
  const tip = bez(rib, 1);
  d.push(blade(tip.x, tip.y, tip.a, 44, 10.5, 8));
  const out = [path(d.join(''), palette.sage)];
  for (const [dx, dy, r] of [[34, -16, 9], [44, 2, 10], [30, 14, 9], [52, -12, 8.5],
    [58, 10, 8], [22, -2, 8]]) {
    const [bx, by] = [262 + dx, 60 + dy];
    out.push(path(stalk([[240, 64], [252, 66], [bx - 10, by + 2], [bx, by]], 2.6, 1.8),
      palette.sage), disk(bx, by, r, palette.sepia));
  }
  return svgOf(w, h, out.join(''));
}

const art = { plate: photogram(TRIM_W, TRIM_H), sprig: sprig() };
for (const [id, svg] of Object.entries(art)) await loadSvg(`${id}.svg`, svg);
// #endregion

// Nothing cites them: designs show the plate and the sprig, ::resource sets the tailpiece.
const svgResource = (id, w, h, altText) => ({ id, typeId: 'ornament', kind: 'svg', altText,
  createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } });
const resources = [
  svgResource('plate', TRIM_W, TRIM_H, 'A photogram of a fern frond and a sprig of rowan in '
    + 'berry, left white on a brushed sage ground.'),
  svgResource('sprig', 36, 12, 'Ornament: a rowan leaf with a bunch of berries.'),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build (gotcha: fonts-first). None of the three ships a bold.
const FONTS = { 'Sorts Mill Goudy': ['400', '400i'], Italiana: ['400'], 'Marcellus SC': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// :::toc lists the page each poem lands on: the build lays out again until those settle.
const verses = indentVerse(markdown); // the leading spaces of verse, as em spaces
const doc = await buildWithFonts(() => buildDocument({ markdown: verses, resources }, config()),
  markdown);
showPages(doc, { title: 'Pied Beauty · four poems by Gerard Manley Hopkins' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
