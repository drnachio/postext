// ═══ Postext Cookbook · Nº 066 · Storybook chapters with vignettes and summaries ═══
// https://postext.dev/en/cookbook/storybook-chapter-vignettes
// Code: MIT · Text: C. Collodi, 1883 (PD, Gutenberg #52484) · Drawings: generated in code
// Fonts: Averia Serif Libre, Fredericka the Great, Quicksand (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document (the sample is Italian in both)
const RECIPE = 'storybook-chapter-vignettes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config, and in the drawings, comes from here
  ink: '#2b2118', // text: a brown near-black
  paper: '#fffaf0', // a warm book paper
  bark: '#6b4224', // chapter lines, running heads, the title
  wood: '#9a5f30', // the folio discs and the puppet
  cherry: '#b8433a', // the puppet's suit, the little voice, the cherries
  leaf: '#5d8a3c', // hills, cypresses, stems
  sky: '#cfe4ec', // the title field and the vignettes' medallions
  polenta: '#e3b448', // Geppetto's yellow wig
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The defaults linked to main-color, bold among them, print in bark instead of blue.
  { id: 'main-color', name: 'bark (defaults)', value: { hex: palette.bark, model: 'hex' } },
];
// Text and summaries; the book's title and the chapter lines; running heads and folios.
const [TEXT, DISPLAY, LABEL] = ['Averia Serif Libre', 'Fredericka the Great', 'Quicksand'];
const TRIM = { width: 190, height: 240 }; // mm
const [TOP, INNER, OUTER] = [22, 22, 20]; // mm; mirrored, so the spine margin swaps sides
const MEASURE = TRIM.width - INNER - OUTER; // 148 mm
const [BODY, LEAD, LINES] = [13, 19, 29]; // pt, pt, and whole lines in the text block
const BOTTOM = TRIM.height - TOP - (LINES * LEAD * 25.4) / 72; // mm: 23.6
// Design-slot shorthands: a placement from an anchor's edge (mm), and a design text.
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'center',
  overflow: 'wrap', // wrap, never '…' (gotcha: overflow-ellipsis-default)
  placement, ...extra });
const caps = (tracking) => ({ textTransform: 'uppercase', letterSpacing: pt(tracking),
  color: col('bark') });
// Half a tracking (mm): 1.4.1 tracks after a centred line's last letter, shifting it left.
const trail = (tracking) => (tracking * 25.4) / 72 / 2;

// #region answer: a chapter opener: the vignette, the chapter line and Collodi's summary
// # Capitolo I {style="ceppo" summary="Come andò che Maestro Ciliegia…"}
// An image element draws a resource by a fixed id, so each vignette gets a heading style;
// every style is the same opener with its own picture.
const VIGNETTE = { width: 84, height: 56 }; // mm, centred at the head of the text block
const SUMMARY = 124; // mm: the summary's measure, narrower than the text's
const opener = (vignette) => ({ enabled: true,
  // A floor for the height the opener reserves, in whole lines, so the text under chapter I's
  // two-line summary starts on the same grid line as the text under chapter II's three lines.
  minHeight: pt(14 * LEAD),
  slot: { elements: [
    { kind: 'image', id: 'vignette', resourceId: vignette, placement: at('container', 'top',
      0, 0, { width: mm(VIGNETTE.width), height: mm(VIGNETTE.height) }) },
    // Placed from the container, not from #vignette: images do not count in the height an
    // opener reserves (gotcha: opener-image-no-reserve), the texts under them do.
    text('chapter', '{titleText}', DISPLAY, 24, at('container', 'top-left', trail(2.4),
      VIGNETTE.height + 6, { width: mm(MEASURE) }), { ...caps(2.4), lineHeight: 1 }),
    text('summary', '{attr.summary}', TEXT, 12.5, at('#chapter', 'below',
      (MEASURE - SUMMARY) / 2 - trail(2.4), 5, { width: mm(SUMMARY) }),
    { italic: true, lineHeight: 1.38 }), // a multiple (gotcha: design-lineheight-multiple)
  ] },
});
const VIGNETTES = ['ceppo', 'polenta']; // resource ids: the log, the wig and the polenta
const chapterStyles = VIGNETTES.map((id) => ({ id, advancedDesign: opener(id) }));
// #endregion

// #region frontispiece: the title page as a heading style: a sky field, the puppet, the title
const SKY = 150; // mm from the top edge: the foot of the sky field
// # Pinocchio {style="frontespizio" kicker="Le avventure di"}; subtitle and author come from
// the frontmatter. Every element hangs from the page, so the field runs off three edges.
const frontispiece = {
  id: 'frontespizio',
  span: 'page', // or the field is cut at the top of the text block (gotcha: opener-clipped-at-top)
  footer: { elements: [] }, // no folio; the running heads already skip openers
  advancedDesign: { enabled: true, slot: { elements: [ // array order is paint order
    { kind: 'box', id: 'sky', style: { backgroundColor: col('sky') },
      placement: at('page', 'top-left', 0, 0, { width: 'fill', height: mm(SKY) }) },
    { kind: 'image', id: 'puppet', resourceId: 'burattino',
      placement: at('page', 'top-left', 0, 0, { width: 'fill', height: mm(SKY) }) },
    text('kicker', '{attr.kicker}', LABEL, 11, at('page', 'top', trail(2.6), SKY + 11),
      { ...caps(2.6), fontWeight: 700 }),
    text('title', '{titleText}', DISPLAY, 70, at('page', 'top', 0, SKY + 17),
      { lineHeight: 1, color: col('bark') }),
    text('subtitle', '{subtitle}', TEXT, 15, at('page', 'top', 0, SKY + 44), { italic: true }),
    text('author', '{author}', LABEL, 9, at('page', 'top', trail(2), SKY + 58),
      { ...caps(2), fontWeight: 600 }),
  ] } },
};
// #endregion

// #region folios: running heads on body pages only, folios in wood-coloured discs
// The excerpt opens on book page 6, a verso, so the title page faces chapter I.
const continuation = { pageIndexOffset: 5, pageNumbering: { startAt: 6 } };
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre sits off the page's centre
const head = (id, content, parity, x) => text(id, content, LABEL, 8,
  at('page', 'top', x + trail(1.8), 12), { ...caps(1.8), fontWeight: 600, parity, pages: 'body' });
const DISC = 7.4; // mm: the folio's disc
// A fixed square with a radius of half its side is a circle; the figures sit in its middle.
// lineHeight 1.17: the baseline falls at 0.8 of the line, 0.94 em down, so Quicksand's
// figures (0.70 em tall) leave 0.23 em above and below them, and 'middle' centres that line.
const disc = (id, parity, pages, edge, x) => text(id, '{pageNumber}', LABEL, 8.5,
  at('page', edge, x, -(BOTTOM - DISC) / 2, { width: mm(DISC), height: mm(DISC) }),
  { fontWeight: 700, color: col('paper'), lineHeight: 1.17, verticalAlign: 'middle', parity,
    pages, box: { backgroundColor: col('wood'), borderRadius: mm(DISC / 2) } });
const header = { elements: [
  head('verso-title', '{title}', 'even', -SHIFT), // the book on the left-hand page
  head('recto-chapter', '{chapterTitle}', 'odd', SHIFT), // the chapter on the right
] };
const footer = { elements: [
  disc('verso-folio', 'even', 'body', 'bottom-left', OUTER),
  disc('recto-folio', 'odd', 'body', 'bottom-right', -OUTER),
  disc('opener-folio', 'all', 'opener', 'bottom', 0), // a chapter opens on either side
] };
// #endregion

// #region tailpiece: an unnumbered resource type, set where ::resource stands
// No caption prefix and no caption, so the cherries that close chapter I print with no
// label or number. The drawings the design slots paint are of this type too.
const resourceTypes = [{ id: 'fregio', name: 'Fregio', namePlural: 'Fregi', shortLabel: 'Fregio',
  captionPrefix: '', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.25, align: 'center' } }];
const svgResource = (id, width, height, altText) => ({ id, typeId: 'fregio', kind: 'svg',
  svg: { fileId: `${id}.svg`, width, height }, altText, createdAt: 0, updatedAt: 0 });
const resources = [ // alt text in the book's language
  svgResource('ciliegie', 120, 80, 'Due ciliegie rosse su un picciolo, con una foglia.'),
  svgResource('ceppo', 240, 160, 'Un pezzo di legno sul banco del falegname, tra i trucioli.'),
  svgResource('polenta', 240, 160, 'La parrucca gialla di Geppetto e un paiolo di polenta.'),
  svgResource('burattino', 190, 150, 'Un burattino di legno snodato balla su una collina.'),
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'it', // Italian hyphenation, by its exact code (gotcha: hyphenation-locales)
  resourceTypes, colorPalette, header, footer, layout: { layoutType: 'single' },
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    italicColor: col('ink'), // *ohi* in ink, not in the defaults' bark
    // The book cites nothing, but a :ref added later prints in ink: main-color does not reach
    // this colour, which stays #295AA3 (gotcha: palette-skips-designs).
    referenceColor: col('ink'),
    firstLineIndent: mm(5), indentAfterHeading: false,
    maxWordSpacing: 1.45, // the default 2 lets 14 lines stretch past 1.45×; 3 still do, to 1.58×
  },
  headings: {
    fontFamily: DISPLAY, fontWeight: 400, // the designs paint the titles: no Open Sans to load
    // Any headings object drops the H1 break (gotcha: headings-drop-h1-break): every
    // chapter on a new page, on either side, so chapter II opens on a verso.
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
  },
  headingStyles: [frontispiece, ...chapterStyles],
  paragraphStyles: [{ id: 'colofon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(11),
    color: col('bark'), textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: Collodi's Italian in both editions

// #region art: the puppet, two vignettes and a tailpiece, drawn in the palette
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
const P = palette;
const n1 = (v) => +v.toFixed(1);
const ink = (w) => `stroke="${P.ink}" stroke-width="${w}" stroke-linejoin="round" `
  + 'stroke-linecap="round"';
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 4}" `
  + `height="${h * 4}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" `
  + `fill="${fill}" ${extra}/>`;
const shape = (d, fill, w = 1, extra = '') => `<path d="${d}" fill="${fill}" ${ink(w)} ${extra}/>`;
// A stroke outlined in ink: a wide ink line under a narrower one in the fill colour.
const cord = (d, w, fill, edge = 1) => `<path d="${d}" fill="none" ${ink(w + edge)}/>`
  + `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" `
  + 'stroke-linejoin="round"/>';
const bar = (x1, y1, x2, y2, w, fill) => cord(`M${x1} ${y1}L${x2} ${y2}`, w, fill, 1.1);
const cloud = (x, y, s) => [[0, 0, 7], [8, -3, 9], [17, 0, 7], [25, 2, 5], [-7, 2, 5]]
  .map(([dx, dy, r]) => dot(x + dx * s, y + dy * s, r * s, P.paper)).join('');
// A shaving: a ribbon of wood rolled into loops (a prolate cycloid), turned by `angle`.
function shaving(x, y, s, angle, loops = 2) {
  const pts = [];
  for (let t = 0; t <= loops * 2 * Math.PI + 1.2; t += 0.25) {
    pts.push([0.95 * t - 1.9 * Math.sin(t), -1.9 * Math.cos(t)].map((v) => v * s));
  }
  const a = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${n1(x + px * cos - py * sin)} `
    + `${n1(y + px * sin + py * cos)}`).join('');
  return cord(d, 1.5 * s, mix(P.wood, P.paper, 0.5), 0.8 * s);
}
// A medallion: the sky oval, a floor cut by its rim, the scene, then the rim on top.
const FLOOR = (y) => { const half = n1(116 * Math.sqrt(1 - ((y - 80) / 76) ** 2));
  return `M${n1(120 - half)} ${y}H${n1(120 + half)}A116 76 0 0 1 ${n1(120 - half)} ${y}Z`; };
const medallion = (body) => svg(240, 160, `<ellipse cx="120" cy="80" rx="116" ry="76" `
  + `fill="${P.sky}"/><path d="${FLOOR(128)}" fill="${mix(P.wood, P.paper, 0.62)}"/>${body}`
  + `<ellipse cx="120" cy="80" rx="116" ry="76" fill="none" stroke="${P.wood}" `
  + 'stroke-width="1.8"/>');

function puppet() { // the frontispiece: 190 × 150 mm, the size of the sky field
  const rand = mulberry32(1883);
  const light = mix(P.wood, P.paper, 0.45), crumb = mix(P.paper, P.wood, 0.14);
  const cypress = (x, base, h) => `<path d="M${x} ${base}C${x - h / 5} ${base - h / 3} `
    + `${x - h / 9} ${base - h} ${x} ${base - h}C${x + h / 9} ${base - h} ${x + h / 5} `
    + `${base - h / 3} ${x} ${base}Z" fill="${mix(P.leaf, P.ink, 0.35)}"/>`;
  const house = `<path d="M146 104h13v-7h-13z" fill="${mix(P.polenta, P.paper, 0.45)}"/>`
    + `<path d="M144.5 97.5L152.5 92.5L160.5 97.5z" fill="${mix(P.cherry, P.wood, 0.3)}"/>`;
  const flowers = Array.from({ length: 30 }, () => dot(8 + rand() * 174, 131 + rand() * 17,
    0.7, rand() < 0.5 ? P.paper : P.polenta)).join('');
  const blooms = Array.from({ length: 12 }, (_, i) => { // the paper suit's printed flowers
    const [x, y] = [89 + (i % 3) * 6 + rand() * 1.6, 66.5 + Math.floor(i / 3) * 6.4 + rand() * 1.4];
    return [0, 1, 2, 3].map((k) => dot(x + 1.1 * Math.cos(k * 1.571), y + 1.1 * Math.sin(k * 1.571),
      0.62, P.paper)).join('') + dot(x, y, 0.5, P.polenta);
  }).join('');
  return svg(190, 150, cloud(22, 30, 1) + cloud(150, 20, 0.8) + cloud(132, 64, 0.5)
    + shape('M0 104C40 92 80 98 110 101S160 93 190 98V150H0Z', mix(P.leaf, P.sky, 0.66), 0)
    + shape('M0 114C30 104 58 108 84 111S140 101 190 107V150H0Z', mix(P.leaf, P.sky, 0.42), 0)
    + house + cypress(28, 110, 17) + cypress(34, 109.5, 12) + cypress(139, 106, 13)
    + cypress(165, 103.5, 16) + cypress(171, 103.5, 11)
    + `<path d="M0 132C40 118 70 121 95 121S150 118 190 128V150H0Z" fill="${P.leaf}"/>`
    + flowers
    // legs: the left straight, the right lifted in a dance step; shoes of bark
    + bar(91, 92, 90, 106, 4.6, P.wood) + bar(90, 106, 89, 119, 4.2, P.wood)
    + shape('M85.8 121.4C85.8 118.4 97.6 118.6 97.4 121.6C97.2 123.4 86 123.6 85.8 121.4Z',
      P.bark, 0.9)
    + bar(99, 92, 107, 103, 4.6, P.wood) + bar(107, 103, 104, 115, 4.2, P.wood)
    + shape('M100.8 118.8C99.8 115.6 110.4 112.4 111.2 115.2C111.8 117.2 101.6 120.6 100.8 118.8Z',
      P.bark, 0.9)
    // arms: the left waving, the right swinging; round joints at shoulder, elbow and hip
    + bar(86, 66, 77.5, 56, 4.2, P.wood) + bar(77.5, 56, 74, 45.5, 3.8, P.wood)
    + bar(104, 66, 111, 76.5, 4.2, P.wood) + bar(111, 76.5, 114.5, 86.5, 3.8, P.wood)
    // the suit of flowered paper
    + `<rect x="85" y="62" width="20" height="31" rx="5" fill="${P.cherry}" ${ink(1.1)}/>`
    + blooms
    + [[86, 66], [77.5, 56], [104, 66], [111, 76.5], [91, 92], [99, 92], [90, 106], [107, 103]]
      .map(([x, y]) => dot(x, y, 2.3, P.bark, ink(0.7))).join('')
    + dot(73.5, 43.5, 2.9, light, ink(0.9)) + dot(115.5, 89, 2.9, light, ink(0.9))
    // neck, a paper collar, head, nose, face, and the cap of bread crumb
    + `<rect x="92.5" y="56" width="5" height="7" fill="${light}" ${ink(0.9)}/>`
    + [88.6, 92.2, 95.8, 99.4].map((x) => dot(x + 0.8, 62.6, 2.1, P.paper, ink(0.7))).join('')
    + dot(95, 50, 8.5, light, ink(1.1))
    + shape('M102.6 47.8L117 46.2L102.8 51.6Z', light, 0.9)
    + dot(97.5, 47.5, 1.05, P.ink) + dot(92.5, 53.5, 1.9, P.cherry, 'opacity="0.55"')
    + `<path d="M95 54.8Q98.2 56.8 101 54.6" fill="none" ${ink(0.8)}/>`
    + shape('M86.6 46.5C86 36 92 26.5 104 21.5C99.5 29 101 38 103.6 45.2Z', crumb, 1.1)
    + dot(104.3, 21.2, 2.2, crumb, ink(0.9)));
}

function log() { // chapter I: the firewood on the carpenter's bench, a plane, the little voice
  const rand = mulberry32(1);
  const light = mix(P.wood, P.paper, 0.5), steel = mix(P.ink, P.sky, 0.5);
  const barkLines = [66, 72, 79, 86, 91].map((y) => `<path d="M${n1(80 + rand() * 8)} ${y}`
    + `C${n1(100 + rand() * 10)} ${n1(y - 1 + rand() * 2)} ${n1(120 + rand() * 10)} `
    + `${n1(y - 1 + rand() * 2)} ${n1(138 + rand() * 12)} ${y}" fill="none" ${ink(0.7)} `
    + 'opacity="0.55"/>').join('');
  const rings = [13, 9, 5].map((r) => `<ellipse cx="66" cy="78" rx="${n1(r * 0.56)}" ry="${r}" `
    + `fill="none" stroke="${P.wood}" stroke-width="0.9"/>`).join('');
  const voice = [[50, 70, 8], [43, 70, 13], [36, 70, 18]].map(([x, y, h]) => `<path d="M${x} `
    + `${y - h}Q${x - h * 0.55} ${y} ${x} ${y + h}" fill="none" stroke="${P.cherry}" `
    + 'stroke-width="2" stroke-linecap="round"/>').join('');
  return medallion(
    shape('M44 96H196V104H44Z', P.wood, 1.1) + shape('M50 104H190V111H50Z', P.bark, 1)
    + shape('M56 111H64V128H56Z', P.bark, 1) + shape('M176 111H184V128H176Z', P.bark, 1)
    + shape('M66 60H148Q160 78 148 96H66Z', P.bark, 1.1) + barkLines
    + `<ellipse cx="118" cy="76" rx="3.4" ry="2.2" fill="${P.ink}" opacity="0.45"/>`
    + `<ellipse cx="66" cy="78" rx="10" ry="18" fill="${light}" ${ink(1.1)}/>` + rings
    + dot(66, 78, 1.2, P.wood) + voice
    // the plane on the bench, a shaving curling up out of its mouth
    + shape('M162 96L165 86H195L198 96Z', light, 1)
    + shape('M186 86C186 77 189 73 195 73C198 73 199 75 198 77L194 86Z', P.bark, 0.9)
    + dot(170, 83.5, 3, P.bark, ink(0.9))
    + shape('M176 87L182 77L185 78L180 87Z', steel, 0.8)
    + cord('M180 86C179 76 187 70 192 74C196 78 191 83 187 80C184 77 188 74 190 76', 2.4, light)
    // on the floor: the axe put down, and the shavings of the first strokes
    + cord('M96 137L146 133', 3.4, P.wood) + shape('M84 128L97 131L97 142L84 146Q80 137 84 128Z',
      steel, 1) + `<path d="M84.6 130Q81.6 137 84.6 144" fill="none" stroke="${P.sky}" `
    + 'stroke-width="1.2"/>'
    + shaving(64, 140, 2, 8) + shaving(146, 142, 1.8, -6) + shaving(168, 134, 1.5, 10)
    // a saw on its nail on the workshop wall
    + '<g transform="translate(-26 8)">' + shape('M150 30L194 22L196 38L152 44Z', steel, 0.9)
    + `<path d="M152 44${Array.from({ length: 11 }, (_, i) => `L${n1(155.5 + i * 4)} ${n1(45.8
      - i * 0.55)}L${n1(157.5 + i * 4)} ${n1(43.6 - i * 0.55)}`).join('')}" fill="${steel}" `
    + `${ink(0.6)}/>` + shape('M194 22C204 18 212 24 210 32C208 40 200 40 196 38Z', P.wood, 1)
    + dot(201, 30, 2.6, P.sky, ink(0.8)) + dot(160, 32, 1.4, P.ink) + '</g>');
}

function wig(x, y) { // Geppetto's periwig in profile: curls, two rolls, a queue with a bow
  // The crown: bumps along the top of an oval, so its outline reads as curled hair.
  const pts = Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (1.08 + i * 0.093);
    return [n1(20 * Math.cos(a)), n1(6 + 22 * Math.sin(a))]; });
  const crown = `M${pts[0].join(' ')}${pts.slice(1).map(([px, py]) => `A3.6 3.6 0 0 1 ${px} ${py}`)
    .join('')}C14 4 2 3 -6 9C-11 12 -17 12 -${-pts[0][0]} ${pts[0][1]}Z`;
  const strands = ['M14 -2C10 -11 -3 -14 -14 -5', 'M9 -12C2 -16 -8 -14 -13 -9']
    .map((d) => `<path d="${d}" fill="none" ${ink(0.7)} opacity="0.5"/>`).join('');
  // Two side rolls over the ear, below the eye line, each ending in a spiral curl.
  const curl = (cx, cy, r) => `<path d="M${Array.from({ length: 12 }, (_, i) => {
    const [a, k] = [i * 0.55, r * (1 - i / 14)];
    return `${n1(cx + k * Math.cos(a))} ${n1(cy - k * Math.sin(a))}`; }).join('L')}" `
    + `fill="none" ${ink(0.8)}/>`;
  const roll = (cy) => `<ellipse cx="-4.5" cy="${cy}" rx="8.5" ry="3.4" fill="${P.polenta}" `
    + `${ink(0.9)}/>${curl(1.2, cy, 2.6)}`;
  return `<g transform="translate(${x} ${y}) rotate(-4) scale(1.4)">`
    + cord('M-17 10C-23 16 -25 26 -21 34', 3.8, P.polenta) + shape(crown, P.polenta, 1)
    + strands + roll(14) + roll(20.5)
    + shape('M-18 9L-24 5L-23.5 13ZM-18 9L-12.5 4.5L-12 13Z', P.cherry, 0.8) + '</g>';
}

function polenta() { // chapter II: Geppetto's yellow wig on its stand, and the polenta
  const light = mix(P.wood, P.paper, 0.5), clay = mix(P.cherry, P.polenta, 0.3);
  const steam = [148, 160, 172].map((x, i) => `<path d="M${x} ${78 - i % 2 * 4}c-5 -7 5 -11 0 -18`
    + `s5 -11 0 -17" fill="none" stroke="${P.paper}" stroke-width="2.2" stroke-linecap="round"/>`)
    .join('');
  const kernels = Array.from({ length: 18 }, (_, i) => `<rect x="${n1(120 + (i % 6) * 5.4)}" `
    + `y="${n1(134 + Math.floor(i / 6) * 3.6)}" width="4.4" height="3" rx="1.4" `
    + `fill="${P.polenta}" ${ink(0.5)}/>`).join('');
  return medallion(
    // the stand: a turned post and a head of wood, the wig on top
    shape('M64 128L68 121H92L96 128Z', P.bark, 1) + shape('M77 121V98H83V121Z', P.wood, 1)
    + `<ellipse cx="82" cy="80" rx="15" ry="20" fill="${light}" ${ink(1.1)}/>`
    + wig(78, 62)
    // a red earthenware pot of polenta, a wooden spoon, and the steam
    + shape('M128 96H192C192 118 180 128 160 128C140 128 128 118 128 96Z', clay, 1.1)
    + `<ellipse cx="160" cy="96" rx="32" ry="6" fill="${P.polenta}" ${ink(1.1)}/>`
    + `<path d="M128 96C128 74 192 74 192 96" fill="none" ${ink(1.6)}/>`
    + cord('M168 94L184 62', 3, light) + `<ellipse cx="166" cy="97" rx="5" ry="2.4" `
    + `fill="${light}" ${ink(0.9)}/>` + steam
    // an ear of maize on the floor, its husks open
    + shape('M116 138C124 128 150 130 156 138C150 146 124 148 116 138Z', P.polenta, 1) + kernels
    + shape('M118 138C112 128 104 126 98 130C104 132 110 136 118 138Z', P.leaf, 0.9)
    + shape('M118 138C110 144 102 146 96 144C102 140 110 138 118 138Z', P.leaf, 0.9));
}

function cherries() { // the tailpiece: two cherries for Maestro Ciliegia
  const one = (x, y) => dot(x, y, 12, P.cherry, ink(1.1))
    + `<ellipse cx="${x - 4}" cy="${y - 4.5}" rx="3" ry="2" fill="${P.paper}" opacity="0.7" `
    + `transform="rotate(-30 ${x - 4} ${y - 4.5})"/>`;
  return svg(120, 80, `<path d="M61 12C54 24 46 36 44 50M61 12C66 26 74 38 78 52" fill="none" `
    + `stroke="${P.leaf}" stroke-width="2.2" stroke-linecap="round"/>`
    + shape('M61 12C70 2 88 2 98 9C86 16 72 17 61 12Z', P.leaf, 1)
    + `<path d="M63 11.5Q80 8 96 9" fill="none" stroke="${P.paper}" stroke-width="0.8" `
    + 'opacity="0.8"/>' + one(43, 58) + one(79, 60));
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Averia Serif Libre': ['400', '400i'], 'Fredericka the Great': ['400'],
  Quicksand: ['400', '600', '700'] }; // every face, loaded before layout (gotcha: fonts-first)

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// #region pictures: the drawings, registered under the file ids their resources name
// A design slot or ::resource names a resource, the resource a file id: register each file.
const drawings = { burattino: puppet(), ceppo: log(), polenta: polenta(), ciliegie: cherries() };
for (const [id, markup] of Object.entries(drawings)) await loadSvg(`${id}.svg`, markup);
// #endregion
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: 'Le avventure di Pinocchio' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
