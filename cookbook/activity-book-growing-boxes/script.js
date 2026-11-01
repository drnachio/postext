// ═══ Postext Cookbook · Nº 159 · Activity book with boxes that grow ══════════════
// https://postext.dev/en/cookbook/activity-book-growing-boxes
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Andika, Baloo 2, Lexend (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es' | 'fr')
const RECIPE = 'activity-book-growing-boxes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one ink, the water blue, the sun, and the pale fields of the boxes
const palette = {
  ink: '#1f2d38', // text
  sea: '#1d659c', // titles, tabs, list numbers
  sky: '#e2f0f9', // activity boxes
  sun: '#f0a531', // the project's box
  sand: '#fcf0d8', // the materials box
  rule: '#93bcd8', // answer lines, blanks
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'sea (defaults)', value: { hex: palette.sea, model: 'hex' } },
];
// #endregion

const [TEXT, DISPLAY, LABEL] = ['Andika', 'Baloo 2', 'Lexend']; // Andika: for early readers
const W = 174; // mm: the width of the type area, and of every box
const LINE = 8; // mm between two answer lines: room for a child's handwriting
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// The head every sheet shares: the unit over the title band, the text with its drawing.
const kicker = { kind: 'text', id: 'tema', content: '{attr.tema}', fontFamily: LABEL,
  fontSize: pt(8.5), fontWeight: 600, color: col('sea'), textTransform: 'uppercase',
  letterSpacing: pt(1.4), placement: at('container', 'top-left') };
const opening = [
  { name: 'titulo', takes: 'h1', style: 'banda', width: mm(W),
    placement: at('container', 'top-left', 0, 6) },
  { name: 'texto', flow: true, width: mm(W - 52), minHeight: mm(36),
    placement: at('#titulo', 'below', 0, 4) },
  { name: 'dibujo', width: mm(44), placement: at('#titulo', 'below', W - 44, 4) },
];

// #region answer: boxes in a stack grow with their text; empty ruled frames hold the answers
// An empty frame is an answer space: the Markdown sends it nothing (optional: no slotEmpty).
// Its `rules` draw a line at the foot of every LINE mm of its height, so the lines are part
// of the frame and move with it when a box above grows. minHeight too: a box that runs out of
// room may not take the lines away from the child.
const answer = (name, lines) => ({ name, optional: true, width: mm(W), height: mm(LINE * lines),
  minHeight: mm(LINE * lines),
  rules: { every: mm(LINE), color: col('rule'), width: pt(0.75) } });
// A box is as tall as its text, never less than drawn: a longer text makes it taller and
// pushes everything after it in the group down the page.
const box = (name, style, minHeight) => ({ name, style, width: mm(W), minHeight: mm(minHeight) });
const sheet = {
  id: 'ficha',
  decoration: { elements: [kicker] },
  frames: [
    ...opening,
    // The group starts where its first box is placed: under the text, and runs down from there.
    { ...box('act-1', 'actividad', 22), placement: at('#texto', 'below', 0, 6) },
    answer('lineas-1', 3),
    box('act-2', 'actividad', 22),
    // The last box goes on overleaf, with the answer space after it, when its text outgrows
    // the page; the other two push it down instead.
    { ...box('act-3', 'actividad', 22), overflow: { continueIn: 'next-page' } },
    answer('lineas-3', 2),
  ],
  groups: [{ name: 'actividades', kind: 'stack', gap: mm(4.5),
    frames: ['act-1', 'lineas-1', 'act-2', 'act-3', 'lineas-3'] }],
};
// #endregion

// #region continue: the project's steps go on on a page of their own, after their mark
const project = {
  id: 'proyecto',
  overflowTemplate: 'proyecto-sigue',
  decoration: { elements: [kicker] },
  frames: [
    ...opening,
    { ...box('material', 'material', 20), placement: at('#texto', 'below', 0, 9) },
    // As tall as its text, never past the foot of the page, at full size: the rest ends
    // with the language's mark (Continúa, Continued, À suivre) and goes on on an added page.
    { name: 'pasos', style: 'proyecto', width: mm(W), overflow: { continueIn: 'next-page' } },
  ],
  groups: [{ name: 'trabajo', kind: 'stack', gap: mm(9), frames: ['material', 'pasos'] }],
};
// The added page: the rest of the steps at the head, then lines for the child's notes,
// under a heading the page fence names (notas="…").
const projectGoesOn = {
  id: 'proyecto-sigue',
  decoration: { elements: [kicker,
    { kind: 'text', id: 'notas-titulo', content: '{attr.notas}', fontFamily: DISPLAY,
      fontSize: pt(15), fontWeight: 700, color: col('sea'),
      placement: { ...at('#notas', 'top-left', 0, -3), size: { width: mm(W) } } }] },
  frames: [
    { name: 'pasos', style: 'proyecto', width: mm(W),
      placement: at('container', 'top-left', 0, 9) },
    answer('notas', 6),
  ],
  groups: [{ name: 'trabajo', kind: 'stack', gap: mm(16), frames: ['pasos', 'notas'] }],
};
// #endregion

// #region cover: a painted landscape to the bleed with the cycle's arrows over it, the title,
// and a line for the child's name
const cover = {
  id: 'portada', header: false, footer: false,
  decoration: { elements: [
    { kind: 'image', id: 'cielo', resourceId: 'portada', decorative: true,
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(178) } } },
    // The arrows are vector, over the painting: the same frame, so they stay on its features.
    { kind: 'image', id: 'ciclo', resourceId: 'ciclo', decorative: true,
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(178) } } },
    { kind: 'rule', id: 'nombre-linea', direction: 'horizontal', thickness: pt(1),
      color: col('sea'), placement: { ...at('#nombre', 'bottom-left', 0, 1),
        size: { width: mm(W) } } },
  ] },
  frames: [
    { name: 'titulo', takes: 'h1', width: mm(W), placement: at('container', 'top-left', 0, 162) },
    { name: 'subtitulo', flow: true, width: mm(W) },
    { name: 'nombre', style: 'campo', width: mm(W), minHeight: mm(12) },
    { name: 'colofon', style: 'colofon', width: mm(W), placement: at('container', 'bottom-left') },
  ],
  groups: [{ name: 'portada', kind: 'stack', gap: mm(4),
    frames: ['titulo', 'subtitulo', 'nombre'] }],
};
// #endregion

// A box with a tab: the tab's words come from the Markdown (label="…").
const tabbed = (id, fill, tab, tabInk, extra = {}) => ({
  id, backgroundEnabled: true, background: col(fill), borderRadius: mm(3),
  border: { enabled: false },
  padding: { top: mm(3), right: mm(5), bottom: mm(3.5), left: mm(5) },
  label: { position: 'top-left', background: col(tab), color: col(tabInk), fontFamily: LABEL,
    fontSize: pt(9), fontWeight: 600, height: mm(6), paddingX: mm(3), offset: mm(6),
    inset: mm(4), rule: { enabled: false, color: col(tab) } },
  body: { fontFamily: TEXT, fontSize: pt(11.5), lineHeight: pt(16), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: pt(0) },
  ...extra,
});
const plain = (id, size, lead, color, extra = {}) => ({ id, backgroundEnabled: false,
  border: { enabled: false }, padding: { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) },
  body: { fontFamily: LABEL, fontSize: pt(size), lineHeight: pt(lead), color: col(color),
    boldColor: col(color), italicColor: col(color), firstLineIndent: pt(0) }, ...extra });

const folio = (id, parity, edge, x) => ({ kind: 'text', id, content: '{pageNumber}', parity,
  fontFamily: DISPLAY, fontSize: pt(11), fontWeight: 800, color: col('paper'),
  align: 'center', box: { backgroundColor: col('sea'), borderRadius: mm(4) },
  placement: { ...at('page', edge, x, -9), size: { width: mm(8), height: mm(8) } } });
const bookTitle = (id, parity, edge, x) => ({ kind: 'text', id, content: '{title} · {subtitle}',
  parity, fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 500, color: col('sea'),
  textTransform: 'uppercase', letterSpacing: pt(1.1), placement: at('page', edge, x, -11) });

const config = {
  locale: t({ es: 'es', en: 'en-gb', fr: 'fr' }), // hyphenation and the continuation mark
  resourceTypes: [{ id: 'dibujo', name: t({ es: 'Dibujo', en: 'Drawing', fr: 'Dessin' }),
    shortLabel: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
    captionPrefix: '', defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 150,
    margins: { top: mm(20), bottom: mm(22), left: mm(20), right: mm(16), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(11.5), lineHeight: pt(16), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: DISPLAY, color: col('sea'), fontWeight: 700,
    balancing: { enabled: false },
    levels: [
      // Every sheet is a composed page, which starts a page of its own.
      { level: 1, fontSize: pt(25), lineHeight: pt(30), fontWeight: 800, color: col('paper'),
        breakBefore: { enabled: false }, marginTop: pt(0), marginBottom: pt(0) },
      { level: 3, fontSize: pt(13.5), lineHeight: pt(17), marginTop: pt(6), marginBottom: pt(2) },
    ],
  },
  headingStyles: [{ id: 'portada', fontSize: pt(54), lineHeight: pt(54), fontWeight: 800,
    color: col('sea'), marginTop: pt(0), marginBottom: pt(0) }],
  unorderedLists: { bulletChar: '•', color: col('sea'), fontWeight: 700, itemSpacing: pt(3) },
  orderedLists: { numberFormat: 'arabic', fontFamily: DISPLAY, fontWeight: 800, color: col('sea'),
    itemSpacing: pt(4) },
  chipStyles: [
    // An empty chip, :chip[ ]{style="hueco"}, is a blank to write in: padding and an outline.
    { id: 'hueco', fontFamily: LABEL, background: col('paper'), borderColor: col('rule'),
      borderWidth: pt(0.9), borderRadius: mm(1.4), paddingX: mm(13), paddingY: em(0.1) },
    { id: 'casilla', fontFamily: LABEL, background: col('paper'), borderColor: col('sea'),
      borderWidth: pt(0.9), borderRadius: mm(1), paddingX: em(0.55), paddingY: em(0.05),
      gap: em(0.5) },
  ],
  calloutStyles: [
    tabbed('actividad', 'sky', 'sea', 'paper'),
    tabbed('material', 'sand', 'sun', 'ink'),
    tabbed('proyecto', 'paper', 'sun', 'ink',
      { border: { enabled: true, color: col('sun'), width: pt(1.5) } }),
    { ...plain('banda', 25, 30, 'paper'), backgroundEnabled: true, background: col('sea'),
      borderRadius: mm(3), padding: { top: mm(2.5), right: mm(5), bottom: mm(3), left: mm(5) } },
    plain('campo', 10, 14, 'sea', { padding: { top: mm(5), right: mm(0), bottom: mm(0),
      left: mm(0) } }),
    plain('colofon', 7.5, 10, 'ink'),
  ],
  header: { elements: [] },
  footer: { elements: [
    folio('folio-par', 'even', 'bottom-left', 20),
    bookTitle('titulo-par', 'even', 'bottom-left', 32),
    folio('folio-impar', 'odd', 'bottom-right', -20),
    bookTitle('titulo-impar', 'odd', 'bottom-right', -32),
  ] },
  pageTemplates: [cover, sheet, project, projectGoesOn],
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a painted cover and three vignettes; only the cycle's arrows are vector
// The pictures were painted with a diffusion model on white (the cover on a white edge it fades
// into), cut to the frames' aspect and declared with their pixels. The cover's arrows are an
// SVG in the same frame as the painting, 210 × 178 mm, with their points read off the painting
// in percent of its width and height: the sea's mist, the clouds, the rain, the river.
const P = palette;
const ARROW_X = 2.1; // mm per percent of the cover's width
const ARROW_Y = 1.78; // mm per percent of its height
// A smooth stroke through the points, with the head turned to the last stretch.
const arrow = (...pts) => {
  const p = pts.map(([x, y]) => [x * ARROW_X, y * ARROW_Y]);
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b] = [p[Math.max(i - 1, 0)], p[i + 2] ?? p[i + 1]];
    const c1 = [p[i][0] + (p[i + 1][0] - a[0]) / 6, p[i][1] + (p[i + 1][1] - a[1]) / 6];
    const c2 = [p[i + 1][0] - (b[0] - p[i][0]) / 6, p[i + 1][1] - (b[1] - p[i][1]) / 6];
    d += ` C${c1.map((v) => v.toFixed(1)).join(' ')} ${c2.map((v) => v.toFixed(1)).join(' ')} `
      + `${p[i + 1][0].toFixed(1)} ${p[i + 1][1].toFixed(1)}`;
  }
  const [t, e] = [p[p.length - 2], p[p.length - 1]];
  const ang = Math.atan2(e[1] - t[1], e[0] - t[0]);
  const tip = (back, side) => `${(e[0] + back * Math.cos(ang) - side * Math.sin(ang)).toFixed(1)},`
    + `${(e[1] + back * Math.sin(ang) + side * Math.cos(ang)).toFixed(1)}`;
  const head = `${tip(3.4, 0)} ${tip(-1, 2.5)} ${tip(-1, -2.5)}`;
  return `<path d="${d}" fill="none" stroke="${P.sea}" stroke-width="2.2" stroke-linecap="round"/>`
    + `<polygon points="${head}" fill="${P.sea}" stroke="${P.sea}" stroke-width="1.4" `
    + 'stroke-linejoin="round"/>'
    + `<path d="${d}" fill="none" stroke="${P.paper}" stroke-width="1.1" stroke-linecap="round"/>`
    + `<polygon points="${head}" fill="${P.paper}"/>`;
};
const CYCLE = [
  [84, 54, 81, 42, 82, 30], // evaporation: the mist rises off the sea
  [93, 54, 95, 42, 92, 31],
  [64, 21, 54, 17, 45, 12], // the clouds drift inland to the mountains
  [29, 8, 28, 14, 27, 20], // precipitation: rain on the peaks
  [22, 43.6, 26, 45.3, 30, 47.8], // run-off: the river down from the waterfall
  [37, 57.5, 46, 59.3, 55, 60.8], // and out across the plain to the sea
];
const cycleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 178" width="2100" `
  + `height="1780">${CYCLE.map((a) => arrow(...Array.from({ length: a.length / 2 },
    (_, i) => [a[2 * i], a[2 * i + 1]]))).join('')}</svg>`;
await loadSvg('ciclo.svg', cycleSvg);

const ALT = {
  portada: t({
    es: 'El ciclo del agua en un paisaje: el sol calienta el mar, el vapor sube a las nubes, '
      + 'la lluvia cae sobre las montañas nevadas y el río baja de nuevo al mar',
    en: 'The water cycle in a landscape: the sun warms the sea, vapour rises to the clouds, '
      + 'rain falls on the snowy mountains and the river runs back down to the sea',
    fr: 'Le cycle de l’eau dans un paysage : le soleil chauffe la mer, la vapeur monte aux '
      + 'nuages, la pluie tombe sur les montagnes enneigées et la rivière redescend vers la mer' }),
  ciclo: t({ es: 'Flechas: el vapor sube del mar, las nubes van hacia la montaña, la lluvia cae '
      + 'y el río vuelve al mar',
    en: 'Arrows: vapour rises from the sea, the clouds drift to the mountains, rain falls and '
      + 'the river returns to the sea',
    fr: 'Flèches : la vapeur monte de la mer, les nuages vont vers la montagne, la pluie tombe '
      + 'et la rivière retourne à la mer' }),
  planeta: t({ es: 'La Tierra vista desde el espacio, casi toda azul, y una gota de agua',
    en: 'The Earth seen from space, mostly blue, and a drop of water',
    fr: 'La Terre vue de l’espace, presque toute bleue, et une goutte d’eau' }),
  estados: t({ es: 'Un cubito de hielo que se derrite, un vaso de agua y una taza que echa vapor',
    en: 'An ice cube melting, a glass of water and a steaming cup',
    fr: 'Un glaçon qui fond, un verre d’eau et une tasse qui fume' }),
  pluviometro: t({ es: 'Una botella cortada con una regla pegada, piedras y un embudo bajo '
      + 'la lluvia: el pluviómetro',
    en: 'A cut bottle with a ruler taped on, stones and a funnel in the rain: '
      + 'the rain gauge',
    fr: 'Une bouteille coupée avec une règle collée, des cailloux et un entonnoir sous la pluie : '
      + 'le pluviomètre' }),
};
// Bitmaps: file, pixels and ppi (the vignettes are 44 mm wide, the cover 210 mm).
const BITMAPS = {
  portada: ['portada-1440.jpg', 1440, 1221, 174],
  planeta: ['planeta-960.jpg', 960, 873, 554],
  estados: ['estados-960.jpg', 960, 873, 554],
  pluviometro: ['pluviometro-960.jpg', 960, 873, 554],
};
const resources = [
  ...(await Promise.all(Object.entries(BITMAPS).map(async ([id, [fileId, w, h, ppi]]) => {
    await loadImage(fileId, asset(fileId));
    return { id, typeId: 'dibujo', kind: 'bitmap', caption: '', altText: ALT[id], createdAt: 0,
      updatedAt: 0, bitmap: { fileId, format: 'jpeg', width: w, height: h, resolution: ppi } };
  }))),
  { id: 'ciclo', typeId: 'dibujo', kind: 'svg', caption: '', altText: ALT.ciclo, createdAt: 0,
    updatedAt: 0, svg: { fileId: 'ciclo.svg', width: 2100, height: 1780 } },
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  Andika: ['400', '400i', '700'], 'Baloo 2': ['700', '800'], Lexend: ['500', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ es: 'El agua, de viaje', en: 'Water on the move',
  fr: 'L’eau en voyage' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
