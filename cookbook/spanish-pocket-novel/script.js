// ═══ Postext Cookbook · Nº 016 · Justified Spanish in a pocket novel ═════════════════
// https://postext.dev/en/cookbook/spanish-pocket-novel
// Code: MIT · Text: B. Pérez Galdós, Marianela, 1878 (PD, Gutenberg #17340) · Map: drawn in code
// Fonts: Gentium Book Plus, Libre Bodoni, Marcellus SC (SIL OFL 1.1) · Needs postext ≥ 1.12.2
import { buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes,
  registerResourceImage } from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document (this recipe is Spanish only)
const RECIPE = 'spanish-pocket-novel';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1e1b18', // text: a warm near-black
  oxblood: '#8b2e2a', // the one accent: chapter label, rule, initial, asterisks, route
  muted: '#6d645a', // running heads, the map's paths, the caption's credit
  paper: '#f7f2e8', // an ivory book paper
  slag: '#c8553d', moss: '#6f7a4f', water: '#58707f', // the map: mined earth, woods, river
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'oxblood (defaults)', value: { hex: palette.oxblood, model: 'hex' } },
];
const TEXT = 'Gentium Book Plus'; // the text face
const DISPLAY = 'Libre Bodoni'; // the chapter's title and the initial
const LABEL = 'Marcellus SC'; // small capitals: chapter label, running heads, map names
const [BODY, LEAD] = [10, 13.8]; // pt: the body size, and its leading: the grid's pitch
const smallCaps = { fontFamily: LABEL, fontSize: pt(9), letterSpacing: pt(1.6), // 2 labels
  color: col('oxblood'), align: 'center' };

// #region page: a pocket paperback; the text block holds 30 whole lines
const TRIM = { width: 115, height: 180 }; // mm: 11.5 × 18 cm
const [TOP, INNER, OUTER] = [16, 15, 14]; // mm: a pocket page keeps its margins tight
const LINES = 30; // lines of LEAD per page, so every full page ends on the same line
const MEASURE = TRIM.width - INNER - OUTER; // 86 mm: about 57 characters of Gentium at 10 pt
const page = {
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - (LINES * LEAD * 25.4) / 72),
    left: mm(INNER), right: mm(OUTER), mirror: true }, // left is inner on a recto
};
// #endregion

// #region answer: Spanish syllables, word spaces under 1.7×, captions that say Figura
const LOCALE = 'es'; // config().locale; 'es-ES' gets US breaks (gotcha: hyphenation-locales)
const bodyText = { // config().bodyText
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  referenceBold: false, // '[fig. 1]' reads in roman, like the words around it
  firstLineIndent: mm(4), indentAfterHeading: false, // the lead's paragraph goes on flush
  // The defaults justify, hyphenate, break by Knuth–Plass and keep widows and orphans out.
  // Long Spanish words on an 86 mm measure need two more settings. Spaces under 1.7×: at
  // the default 2×, eight lines here open past 1.6×; at 1.7 it hyphenates hie-rro, ca-lles.
  // A last line under 26 space widths is a runt; at 20, 'siem- / pre adelante.' got through.
  maxWordSpacing: 1.7, runtMinCharacters: 26,
};
// config().resourceTypes, as the locale leaves captions in English (gotcha:
// resource-types-locale): 'Figura' and 'Fig.', numbered through the book, Figura 1.
const resourceTypes = defaultResourceTypes(LOCALE)
  .map((type) => ({ ...type, numberingTemplate: '{n}', resetOn: 'never' }));
// #endregion

// #region opener: the chapter spelled out, its title, and the lead under a raised initial
const [LABEL_Y, RULE_Y, TITLE_Y] = [4, 10.5, 13.5]; // mm below the top of the text block
const SINK = 8; // lines of LEAD above the lead: the chapter drops a quarter of the page
const INITIAL = 3 * LEAD; // pt: the initial's size, three leads
// Design text is set ragged (gotcha: design-text-ragged): the lead is the one line beside
// the initial, fitted flush by the gap; the paragraph goes on in the Markdown.
const INITIAL_GAP = 0.55; // mm: the line ends 0.1 mm short of the measure
const centred = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });
const opener = {
  enabled: true,
  slot: { elements: [
    // Numbering templates print numerals only (1, 01, I, i, A, a); a number in words comes
    // from the heading's own attribute: # Perdido {ordinal="primero" lead="Se puso el sol. …"}
    { kind: 'text', id: 'chapter', content: 'capítulo {attr.ordinal}', ...smallCaps,
      placement: centred(LABEL_Y) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6),
      color: col('oxblood'), placement: { ...centred(RULE_Y), size: { width: mm(9) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, italic: true,
      fontSize: pt(26), lineHeight: 1.1, color: col('ink'), align: 'center',
      overflow: 'wrap', // longer titles wrap, not '…' (gotcha: overflow-ellipsis-default)
      placement: centred(TITLE_Y) },
    { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: TEXT, fontSize: pt(BODY),
      lineHeight: LEAD / BODY, // a multiple, never a pt (gotcha: design-lineheight-multiple)
      color: col('ink'), align: 'left', overflow: 'wrap', // a dropCap needs wrapping text
      dropCap: { lines: 1, fontFamily: DISPLAY, fontWeight: 700, fontSize: pt(INITIAL),
        color: col('oxblood'), gap: mm(INITIAL_GAP) }, // lines: 1, a raised initial
      placement: { anchor: { to: 'container', edge: 'top-left' },
        offset: { y: pt(SINK * LEAD) }, size: { width: mm(MEASURE) } } },
  ] },
};
// The break restated (gotcha: headings-drop-h1-break): the next page, as pocket books do.
// marginBottom replaces the level's default, a blank line of its own: the text goes on
// on the line under the lead.
const chapter = { level: 1, breakBefore: { enabled: true, parity: 'any' },
  marginBottom: pt(0), advancedDesign: opener };
// #endregion

// #region heads: the author on the verso, the title on the recto; a drop folio on the opener
const [HEAD_Y, DROP_Y] = [9, -10]; // mm: heads from the top edge, drop folio from the foot
const head = (id, content, parity, edge, x, y = HEAD_Y, pages = 'body') => ({
  kind: 'text', id, content, parity, pages, // running heads skip the openers
  fontFamily: LABEL, fontSize: pt(8), letterSpacing: pt(1.2), color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } },
});
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre is off the page's centre
// Folios in the text face (Marcellus SC's 1 and 0 read as I and O), on the heads' baseline.
const folio = { fontFamily: TEXT, letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  { ...head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER), ...folio },
  head('verso-author', '{author}', 'even', 'top', -SHIFT),
  head('recto-title', '{title}', 'odd', 'top', SHIFT),
  { ...head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER), ...folio },
] };
const drop = (parity, x) => ({ ...head(`drop-${parity}`, '{pageNumber}', parity, 'bottom', x,
  DROP_Y, 'opener'), ...folio }); // a chapter can open on either side of the spread
const footer = { elements: [drop('odd', SHIFT), drop('even', -SHIFT)] };
// #endregion

// #region figure: the map faces chapter I as Figura 1; the text cites it as [fig. 1]
const MAP_H = 112; // mm: a frontispiece map, the measure wide
const resources = [{
  id: 'plano', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'plano.svg', width: MEASURE, height: MAP_H }, // the ratio: set column-wide
  placement: { position: 'here' }, // where ::resource{id="plano"} stands, not a float
  caption: 'El camino de Golfín: de Villafangosa, por la pasadera y el cerro, al talud de '
    + 'las minas de Socartes.',
  note: 'Plano conjetural dibujado para esta edición a partir del capítulo primero.',
  altText: 'Plano: abajo, la villa, el río y la pasadera; en medio, un cerro arbolado; arriba, '
    + 'las minas en gradas. Un punteado lleva de la villa al talud de las minas.',
}];
// The plate's heading, # Las minas de Socartes {style="lamina"}, opens a page the heads skip.
const frontispiece = {
  id: 'lamina', // its own break, or it takes the chapter's (gotcha: style-inherits-break)
  breakBefore: { enabled: true, parity: 'any' }, marginBottom: pt(0),
  footer: { elements: [] }, // no drop folio
  advancedDesign: { enabled: true, slot: { elements: [{ kind: 'text', id: 'name',
    content: '{titleText}', ...smallCaps, // a line down: the plate centres on the page
    placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: pt(LEAD) } } }] } },
};
const captionStyle = { fontFamily: TEXT, fontSize: pt(8.3), gap: mm(2),
  labelColor: col('oxblood'), descriptionItalic: true, note: { color: col('muted') } };
// #endregion

// #region styles: the asterisks that close the excerpt, the edition's note, the colophon
const paragraphStyles = [
  { id: 'asterismo', fontFamily: DISPLAY, fontSize: pt(11), color: col('oxblood'),
    textAlign: 'center' },
  // In ink, not muted: a style has no italic colour (gotcha: style-italic-colour).
  { id: 'nota', fontSize: pt(8.3), lineHeight: pt(LEAD * 0.8), firstLineIndent: pt(0),
    marginTop: pt(LEAD) },
  { id: 'colofon', fontSize: pt(7.5), color: col('muted'), textAlign: 'center',
    firstLineIndent: pt(0), marginTop: pt(LEAD / 2) },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  resourceTypes,
  colorPalette,
  page,
  layout: { layoutType: 'single' },
  bodyText,
  headings: {
    fontFamily: DISPLAY, // the designs paint the titles; this keeps Open Sans unloaded
    levels: [chapter],
  },
  headingStyles: [frontispiece],
  paragraphStyles,
  captionStyle,
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.es.md, inlined by the Cookbook

// #region art: the map of Socartes, in millimetres at its printed size, in the palette
function mulberry32(seed) { // a seeded PRNG: the same drawing on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (hex, other, k) => `#${[1, 3, 5].map((i) => Math.round(
  parseInt(hex.slice(i, i + 2), 16) * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k)
  .toString(16).padStart(2, '0')).join('')}`;
const n2 = (v) => +v.toFixed(2);
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
async function labelFace() { // Marcellus SC inside the SVG (gotcha: svg-no-webfonts)
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/marcellus-sc@5/files/'
    + 'marcellus-sc-latin-400-normal.woff2';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Label face not found (${res.status}): ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `@font-face{font-family:L;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
}
function drawMap(face, W, H) { // drawn for W 86 × H 112: the mines above, the town below
  const rnd = mulberry32(1878);
  const C = {
    ground: mix(palette.paper, palette.moss, 0.16), hill: mix(palette.moss, palette.paper, 0.45),
    wood: palette.moss, shade: mix(palette.moss, palette.ink, 0.35),
    earth: mix(palette.slag, palette.paper, 0.3), bench: palette.slag,
    deep: mix(palette.slag, palette.ink, 0.2), pit: mix(palette.slag, palette.ink, 0.45),
    edge: mix(palette.slag, palette.ink, 0.5),
    water: palette.water, ink: palette.ink, path: palette.muted, route: palette.oxblood,
    stream: mix(palette.water, palette.ink, 0.3), // the river's name: 5.7:1 on the ground
  };
  const out = [`<rect width="${W}" height="${H}" fill="${C.ground}"/>`];
  const fill = (d, color) => out.push(`<path d="${d}" fill="${color}"/>`);
  const stroke = (d, color, w, extra = '') => out.push(`<path d="${d}" fill="none" `
    + `stroke="${color}" stroke-width="${w}" stroke-linecap="round" `
    + `stroke-linejoin="round"${extra}/>`);
  // The names, set first so that no tree grows over them.
  const labels = [[33, 30.5, 'minas de', 'end'], [33, 34, 'Socartes', 'end'],
    [34.4, 19, 'talleres', 'end'],
    [43.6, 52.4, 'talud', 'end', C.route], [12, 70.5, 'cerro', 'middle'],
    [25.5, 96.4, 'pasadera'], [70, 94.5, 'río', 'middle', C.stream],
    [3, 109.6, 'Villafangosa'], [5, 11.4, 'N', 'middle']];
  const box = ([x, y, text, anchor = 'start']) => {
    const w = text.length * 1.45;
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return [left - 0.8, y - 2.6, left + w + 0.8, y + 0.8];
  };
  const clear = (x, y) => labels.map(box).every(([a, b, c, d]) => x < a || x > c || y < b || y > d);
  // The mines: iron-stained earth cut in benches down to the pit, the "extinct crater".
  const mine = [[40, 6], [58, 3], [76, 5], [84, 17], [83, 35], [74, 47], [58, 52], [45, 50],
    [36, 40], [35, 20]];
  [[1, C.earth], [0.76, C.bench], [0.52, C.deep], [0.28, C.pit]].forEach(([k, color], i) => {
    const [cx, cy] = [60 + i * 1.6, 27 - i * 1.4]; // each bench deeper, the pit off-centre
    const ring = mine.map(([x, y]) => [cx + (x - 60) * k + (rnd() - 0.5) * 2.4 * k,
      cy + (y - 27) * k + (rnd() - 0.5) * 2.4 * k]);
    out.push(`<path d="${smooth(ring, true)}" fill="${color}" stroke="${C.edge}" `
      + 'stroke-width="0.25"/>');
  });
  fill('M28.4 11.6h6.5v3.2h-6.5zM33 7h0.9v4.7h-0.9z', C.ink); // workshops, chimney, by the rim
  // The hill of cherry, beech and oak, and the paths that cross it at a thousand angles.
  out.push(`<path d="${smooth([[19, 73], [23, 61], [36, 56], [50, 59], [55, 72], [49, 85],
    [35, 90], [23, 84]], true)}" fill="${C.hill}" stroke="${C.shade}" stroke-width="0.25"/>`);
  for (let i = 0; i < 100; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 16;
    const [x, y] = [37 + Math.cos(a) * r, 73 + Math.sin(a) * r];
    const [size, shade] = [0.55 + rnd() * 0.55, rnd() < 0.3 ? C.shade : C.wood];
    if (clear(x, y)) {
      out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(size)}" fill="${shade}"/>`);
    }
  }
  [[[22, 80], [30, 74], [28, 64], [38, 58]], [[26, 62], [36, 70], [46, 64], [52, 70]],
    [[27, 87], [33, 79], [42, 82], [50, 76]], [[38, 57], [40, 67], [33, 76], [37, 89]]]
    .forEach((path) => stroke(smooth(path), C.path, 0.3, ' stroke-dasharray="1 0.8"'));
  // The river, the footbridge, and the town the traveller left behind.
  stroke(smooth([[0, 92], [12, 93], [22, 99], [34, 100], [50, 96], [66, 98], [W + 1, 102]]),
    C.water, 2.4);
  stroke('M20.4 95.2L18.6 101.2', C.ink, 0.7);
  for (let i = 0; i < 18; i++) {
    const [x, y] = [3 + (i % 6) * 2.2 + rnd() * 0.5, 98.6 + Math.floor(i / 6) * 2.3 + rnd() * 0.5];
    fill(`M${n2(x)} ${n2(y)}h1.5v1.2h-1.5z`, C.ink);
  }
  fill('M5.2 94.4h1v2.4h-1zM4 96.2h3.4v2h-3.4z', C.ink); // the church
  // Golfín's walk: over the footbridge, up the hill by its paths, down to the edge.
  stroke(smooth([[12, 101], [17, 99.4], [21, 94], [25, 88], [31, 84], [27, 78], [33, 72],
    [40, 75], [45, 68], [40, 62], [45.3, 53.6]]), C.route, 0.75,
  ' stroke-dasharray="0.05 1.3"');
  out.push(`<circle cx="46.4" cy="51.6" r="1.4" fill="none" stroke="${C.route}" `
    + 'stroke-width="0.6"/>');
  // North, up: a half-inked arrowhead over an N.
  fill('M5 3.2L6.6 8.2L5 7.2Z', C.ink);
  out.push(`<path d="M5 3.2L3.4 8.2L5 7.2Z" fill="none" stroke="${C.ink}" stroke-width="0.2"/>`);
  labels.forEach(([x, y, text, anchor = 'start', color = C.ink]) => out.push(`<text x="${x}" `
    + `y="${y}" text-anchor="${anchor}" fill="${color}">${text}</text>`));
  out.push(`<rect x="0.2" y="0.2" width="${W - 0.4}" height="${H - 0.4}" fill="none" `
    + `stroke="${C.ink}" stroke-width="0.4"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" `
    + `viewBox="0 0 ${W} ${H}"><style>${face}text{font-family:L;font-size:2.35px}</style>`
    + `${out.join('')}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Gentium Book Plus': ['400', '400i', '700'], // text, captions (700: 'Figura 1.'), the note
  'Libre Bodoni': ['400', '400i', '700'], // asterisks, the chapter's title, the initial
  'Marcellus SC': ['400'], // chapter label, plate name, running heads
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('plano.svg', drawMap(await labelFace(), MEASURE, MAP_H));
// The map is book page 8, a verso, facing chapter I: folios and parity follow the book.
const continuation = { pageIndexOffset: 7, pageNumbering: { startAt: 8 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: 'Español justificado en una novela de bolsillo' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
