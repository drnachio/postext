// ═══ Postext Cookbook · Nº 156 · A children's textbook unit in ten languages ═════
// https://postext.dev/en/cookbook/children-textbook-pages
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Nunito, Fredoka and three pairs for Arabic, Chinese, Japanese · Needs postext ≥ 1.65.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the unit (es en ca pt fr de it ar zh ja)
const RECIPE = 'children-textbook-pages';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// One ink and three families (accent, box tint, page ground); a topic swaps the `tema` entries.
const FAMILIES = {
  agua: { main: '#1b6aa0', tint: '#e1f0fa', ground: '#d3e8f6' },
  campo: { main: '#336f27', tint: '#e5f1dc', ground: '#d9ebcb' },
  sol: { main: '#9a5209', tint: '#fcefd2', ground: '#f8e6b8' },
};
const palette = { ink: '#1d2f3f', muted: '#4f6272', rule: '#7e98ab', paper: '#ffffff',
  agua: FAMILIES.agua.main, campo: FAMILIES.campo.main, // the blue of the folios and the contents
  tema: FAMILIES.agua.main, 'tema-tint': FAMILIES.agua.tint, 'tema-ground': FAMILIES.agua.ground };
const swap = (f) => `tema=${FAMILIES[f].main}, tema-tint=${FAMILIES[f].tint}, `
  + `tema-ground=${FAMILIES[f].ground}`;
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'water (defaults)', value: { hex: palette.agua, model: 'hex' } },
];

// #region editions: how each language runs and is bound, and the two faces of its script
// Arabic runs right to left, Chinese and Japanese down the page, all bound on the right. Frames
// stand in the flow (x along the lines, mirrored in Arabic, down the page when vertical).
const AR = LANG === 'ar', CJK = LANG === 'zh' || LANG === 'ja';
const RIGHT_BOUND = AR || CJK, LATIN = !RIGHT_BOUND; // italics, capitals, tracking, hyphens
const [TEXT, DISPLAY] = { ar: ['Noto Naskh Arabic', 'Baloo Bhaijaan 2'], ja: ['Klee One',
  'Zen Maru Gothic'], zh: ['Noto Serif SC', 'ZCOOL KuaiLe'] }[LANG] ?? ['Nunito', 'Fredoka'];
const START = RIGHT_BOUND ? 'right' : 'left'; // the side a page starts reading from
const corner = (v) => `${v}-${START}`, inward = (x) => (RIGHT_BOUND ? -x : x);
const [SLANT, CAPS] = LATIN ? ['italic', 'uppercase'] : ['normal', 'none'];
const LEAD = AR ? 20 : CJK ? 21 : 17.5, track = (v) => (LATIN ? v : 0); // Naskh, ruby need room
const fw = (w) => ({ 'ZCOOL KuaiLe': 400, 'Zen Maru Gothic': w > 550 ? 700 : 500 })[DISPLAY] ?? w;
const BOLD = TEXT === 'Klee One' ? 600 : 700; // and the weights the faces have
// #endregion

const PAGE = { w: 210, h: 280, top: 18, bottom: 18, inner: 14, outer: 12 }; // mm, mirrored
const HALF = PAGE.w - PAGE.inner - PAGE.outer, TALL = PAGE.h - PAGE.top - PAGE.bottom; // 184, 244
const MEASURE = CJK ? TALL : HALF; // a page's type area along the lines
const SHEET = 2 * HALF + 2 * PAGE.inner; // a spread's content area: 396 mm
const RIGHT = HALF + 2 * PAGE.inner; // where the second page's type area starts on the sheet
const LINE = 8, TAB = 22; // mm between answer lines; of the title before its words (the badge)
const NONE = { top: mm(0), right: mm(0), bottom: mm(0), left: mm(0) }; // no padding
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const onSecond = at('container', 'top-left', CJK ? 0 : RIGHT, CJK ? RIGHT : 0); // flow x or y
const DOWN = 156; // mm: a vertical field spread's map takes the head, its frames stand under it

// #region boxes: callout styles that extend each other
// Two steps of `extends`: the box (shape, type, tab), then the kind. The colours are `tema`
// entries, so one style serves the three topics; paddings, stripes and tabs are in the flow.
const tab = (f) => ({ position: 'top-left', background: col(f), color: col('paper'),
  fontFamily: DISPLAY, fontSize: pt(12), fontWeight: fw(600), height: mm(7), paddingX: mm(3.2),
  offset: mm(7), inset: mm(5), rule: { enabled: false, color: col(f) } });
const boxText = { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), boldFontWeight: BOLD, firstLineIndent: pt(0),
  textAlign: CJK ? 'justify' : 'left', paragraphSpacing: true };
const calloutStyles = [
  { id: 'caja', backgroundEnabled: true, background: col('paper'), borderRadius: mm(3),
    border: { enabled: false }, padding: { top: mm(3.4), right: mm(5), bottom: mm(4), left: mm(5) },
    body: boxText, lists: { color: col('ink'), gap: mm(2), itemSpacing: mm(1.6) } },
  { id: 'caja-tema', extends: 'caja', label: tab('tema'), lists: { color: col('tema') } },
  { id: 'dato', extends: 'caja-tema', background: col('tema-tint') },
  { id: 'palabras', extends: 'caja-tema', border: { enabled: true, color: col('tema'),
    width: pt(1.4) } }, { id: 'actividad', extends: 'caja-tema',
    stripe: { enabled: true, side: 'left', width: pt(4), color: col('tema') } },
  { id: 'titulo', extends: 'caja', backgroundEnabled: false,
    padding: { top: mm(2.6), right: mm(6), bottom: mm(3.2), left: mm(TAB) } },
  { id: 'titulo-plano', extends: 'titulo', padding: { left: mm(8) } },
  { id: 'portada', extends: 'caja', background: col('agua'), borderRadius: mm(4),
    padding: { top: mm(2.6), right: mm(8), bottom: mm(3.6), left: mm(8) } },
  { id: 'foto', extends: 'caja', borderRadius: mm(2),
    padding: { top: mm(1.8), right: mm(1.8), bottom: mm(2.2), left: mm(1.8) } },
  { id: 'respuesta', extends: 'caja', padding: NONE }, { id: 'colofon', extends: 'caja',
    backgroundEnabled: false, padding: NONE,
    body: { ...boxText, fontSize: pt(8), lineHeight: pt(AR ? 13 : 11), color: col('muted') } },
];
// #endregion

// #region answer: one base template and a family of topics that extend it
// Ground, tab and number are decoration anchored to the title frame; the number,
// `{headingNumber}`, stands over the padding before its words. A topic extends the base.
const ground = () => ({ kind: 'box', id: 'ground',
  placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } },
  style: { backgroundColor: col('tema-ground') } });
const titleTab = () => ({ kind: 'box', id: 'tab', placement: { ...at('#titulo',
  'top-left'), size: { width: { to: '#titulo', edge: 'right' }, height: { to: '#titulo',
    edge: 'bottom' } } }, style: { backgroundColor: col('tema'), borderRadius: mm(4) } });
const badge = () => ({ kind: 'text', id: 'number', content: '{headingNumber}',
  fontFamily: DISPLAY, fontSize: pt(22), fontWeight: fw(700), color: col('tema'), align: 'center',
  box: { backgroundColor: col('paper'), borderRadius: mm(6) }, placement: { ...at('#titulo',
    corner('top'), inward(CJK ? 2.6 : 5), CJK ? 5 : 2.4), size: { width: mm(12), height: mm(12) } },
});
const title = { name: 'titulo', takes: 'h1', style: 'titulo', width: mm(MEASURE),
  placement: at('container', 'top-left') };

const base = {
  id: 'tema', spread: true, gutter: mm(12),
  decoration: { elements: [ground(), titleTab(), badge()] },
  frames: [title, { name: 'texto', flow: true, columns: 2, columnGap: mm(CJK ? 16 : 7), // 段
    width: mm(MEASURE), fit: { minScale: 0.9 } }],
  groups: [{ name: 'izquierda', kind: 'stack', gap: mm(6), frames: ['titulo', 'texto'] }],
};
const topic = (id, f, more) => ({ id, extends: 'tema', palette: swap(f), ...more });
const box = (name, style, minHeight, more) => ({ name, style, width: mm(MEASURE),
  minHeight: mm(minHeight), ...more });
const answer = (name, lines) => ({ name, optional: true, style: 'respuesta', width: mm(MEASURE),
  height: mm(LINE * lines), minHeight: mm(LINE * lines),
  rules: { every: mm(LINE), color: col('rule'), width: pt(0.75) } });
const PIC = CJK ? 30 : 56; // a picture at the end of a box's first lines pushes the text aside
const withPic = (name, style, minHeight, more) => [box(name, style, minHeight,
  { padding: { right: mm(PIC + 8) }, ...more }), { name: `${name}-foto`, layer: 2, width: mm(PIC),
  exclude: 'push', placement: at(`#${name}`, 'top-right', -5, 8) }];
// #endregion

// #region repeats: a grid lays its set once per item (#foto[1], #foto[2]…); a module per use
const grid = (name, frames, columns, placement, more, width = MEASURE) => ({ name, kind: 'grid',
  columns, columnGap: mm(5), rowGap: mm(CJK ? 8 : 12), repeat: { frames },
  placement: { ...placement, size: { width: mm(width), height: 'fill' } }, ...more });
const question = { id: 'pregunta', role: 'module', // a question and the lines to answer it on
  frames: [box('caja', 'dato', CJK ? 22 : 14, { width: 'fill' }), { ...answer('lineas',
    CJK ? 2 : 3), width: 'fill', placement: at('#caja', 'below', 0, CJK ? 4 : 7) }] };
// #endregion
const under = ({ placement, ...frame }) => ({ ...frame, width: mm(TALL - DOWN) }); // the map's
const stack = (name, frames, more) => ({ name, kind: 'stack', frames, gap: mm(CJK ? 8 : 12),
  ...more });
const pageTemplates = [
  base,
  topic('tema-agua', 'agua', {
    frames: [
      { name: 'foto', style: 'foto' },
      box('probar', 'palabras', CJK ? 30 : 46, { placement: at('#foto[1]', 'below', 0, 10) }),
      ...[['sabias', 'dato', 40], ['palabras', 'palabras', CJK ? 50 : 62],
        ['actividades', 'actividad', CJK ? 46 : 58]].map((f) => box(...f, { placement: onSecond })),
    ],
    groups: [grid('fotos', ['foto'], 3, at('#texto', 'below', 0, 8), { rowAlign: 'start' }),
      stack('derecha', ['sabias', 'palabras', 'actividades'])],
  }),
  topic('tema-campo', 'campo', {
    frames: [
      { name: 'mapa', crossGutter: true, width: mm(CJK ? DOWN - 6 : SHEET),
        ...(CJK && { height: mm(SHEET), placement: at('container', 'top-left') }) },
      ...(CJK ? [{ ...under(title), placement: at('container', 'top-left', DOWN) },
        under({ name: 'texto', flow: true, columns: 1 }), under(box('actividad', 'actividad', 24))]
        : [box('actividad', 'actividad', 24)]),
      { name: 'curso', style: 'dato', minHeight: mm(46) },
    ],
    groups: [
      stack('izquierda', CJK ? ['titulo', 'texto', 'actividad'] : ['titulo', 'mapa', 'texto',
        'actividad'], { gap: mm(6), ...(CJK && { placement: at('container', 'top-left', DOWN) }) }),
      grid('cursos', ['curso'], CJK ? 1 : 3, CJK ? at('container', 'top-left', DOWN, RIGHT)
        : at('#mapa', 'below', RIGHT, 6), { columnGap: mm(6), rowGap: mm(6) },
        CJK ? TALL - DOWN : MEASURE),
    ],
  }),
  topic('tema-sol', 'sol', {
    frames: [
      ...withPic('cuidar', 'palabras', CJK ? 52 : 64), box('turno', 'actividad', CJK ? 30 : 40),
      ...withPic('uso', 'dato', CJK ? 52 : 66),
    ],
    groups: [stack('izquierda', ['titulo', 'texto', 'cuidar', 'turno']),
      grid('usos', ['uso', 'uso-foto'], 1, onSecond, { rowAlign: 'start' })],
  }),
  { id: 'saberes', header: false,
    decoration: { elements: [titleTab()] },
    frames: [{ ...title, style: 'titulo-plano' },
      { name: 'texto', flow: true, width: mm(MEASURE) }],
    groups: [stack('pagina', ['titulo', 'texto'], { gap: mm(CJK ? 4 : 7) }),
      { name: 'preguntas', modules: true, gap: mm(CJK ? 4 : 7), placement: { ...at('#texto',
        'below', 0, CJK ? 4 : 7), size: { width: mm(MEASURE), height: 'fill' } } }] },
  question,
  // The contents: a frame takes the :::toc and lays it by the contents' own rules.
  { id: 'indice',
    decoration: { elements: [ground(), titleTab()] },
    frames: [{ ...title, style: 'titulo-plano' },
      { name: 'lista', takes: 'toc', width: mm(MEASURE) },
      { name: 'mapa', style: 'foto', width: mm(CJK ? 44 : HALF), ...(CJK && { height: mm(76) }) }],
    groups: [{ name: 'pagina', kind: 'stack', gap: mm(7), frames: ['titulo', 'lista', 'mapa'] }] },
  // The opener: a painting to the bleed, the title over its foot (down its right when vertical).
  { id: 'unidad', header: false, footer: false,
    decoration: { elements: [
      { kind: 'image', id: 'portada', resourceId: 'portada', decorative: true,
        placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(157.5) } } },
      { kind: 'text', id: 'kicker', content: '{attr.unidad}', fontFamily: DISPLAY, fontSize: pt(11),
        fontWeight: fw(600), letterSpacing: pt(track(1)), textTransform: CAPS, color: col('agua'),
        align: START, box: { backgroundColor: col('paper'), borderRadius: mm(2), padding: {
          left: mm(2), right: mm(2) } }, placement: { ...at('#titulo', corner('top'), 0, -9),
          size: { height: mm(7), ...(CJK && { width: mm(60) }) } } }, // the room over capitals
    ] },
    frames: [
      { name: 'titulo', takes: 'h1', style: 'portada', width: mm(CJK ? TALL - 104 : 120),
        placement: CJK ? at('container', 'top-left', 104) : at('container', 'top-left', 0, 104) },
      { name: 'texto', flow: true, width: mm(CJK ? TALL - 142 : 160) },
      box('aprenderas', 'dato', 36, CJK ? { width: mm(TALL - 142) } : {}),
      { name: 'colofon', style: 'colofon', width: mm(CJK ? TALL - 142 : HALF),
        placement: at('container', CJK ? 'bottom-right' : 'bottom-left') },
    ],
    groups: [{ name: 'pagina', kind: 'stack', gap: mm(7), ...(CJK
      ? { frames: ['texto', 'aprenderas'], placement: at('container', 'top-left', 142, 26) }
      : { frames: ['titulo', 'texto', 'aprenderas'] }) }] },
];

// The running heads and the folios, on the outer side: an even page's left when left-bound.
const outside = (parity) => (parity === 'even') !== RIGHT_BOUND ? 'left' : 'right';
const outer = (parity, v, x, y) => at('page', `${v}-${outside(parity)}`,
  outside(parity) === 'left' ? x : -x, y);
const head = (id, content, parity) => ({ kind: 'text', id, content, parity,
  fontFamily: LATIN ? TEXT : DISPLAY, fontSize: pt(8), fontWeight: LATIN ? 700 : fw(500),
  letterSpacing: pt(track(1)), color: col('muted'), textTransform: CAPS, align: outside(parity),
  placement: outer(parity, 'top', PAGE.outer, 9) });
const folio = (id, parity) => ({ kind: 'text', id, content: '{pageNumber}', parity,
  fontFamily: DISPLAY, fontSize: pt(11), fontWeight: fw(600), color: col('paper'), align: 'center',
  box: { backgroundColor: col('agua'), borderRadius: mm(4) },
  placement: { ...outer(parity, 'bottom', PAGE.outer, -8), size: { width: mm(8), height: mm(8) } },
});

// #region contents: the toc settings; a frame of the 'indice' template takes the :::toc
const partAt = (x) => (CJK ? at('container', 'left', x) : at('container', START, inward(x)));
const toc = {
  levels: [{ level: 1, fontFamily: DISPLAY, fontSize: pt(15), lineHeight: pt(22),
    fontWeight: fw(500), color: col('ink'), numberFontWeight: fw(600), numberColor: col('agua'),
    numberWidth: mm(9), marginTop: pt(4) }, { level: 2, fontFamily: TEXT, fontSize: pt(11.5),
    lineHeight: pt(18), indent: mm(9), color: col('ink') }],
  pageNumber: { fontFamily: DISPLAY, fontWeight: fw(500), width: mm(9), color: col('agua') },
  leader: { char: CJK ? '…' : '.', gap: mm(1.5) },
  parts: { height: pt(34), marginTop: pt(12), marginBottom: pt(4), design: { elements: [
    { kind: 'box', id: 'band',
      placement: { ...at('container', 'top-left'), size: { width: 'fill', height: 'fill' } },
      style: { backgroundColor: col('paper'), borderRadius: mm(3) } },
    { kind: 'text', id: 'letter', content: '{number}', fontFamily: DISPLAY, fontSize: pt(16),
      fontWeight: fw(700), color: col('paper'), align: 'center',
      box: { backgroundColor: col('agua'), borderRadius: mm(4) },
      placement: { ...partAt(2), size: { width: mm(8), height: mm(8) } } },
    { kind: 'text', id: 'name', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(13),
      fontWeight: fw(600), color: col('agua'), align: START, placement: partAt(14) },
  ] } },
};
// #endregion

// #region art-labels: the map's label styles and anchors; the words are in the Markdown
// An anchor is a point of the painting (fractions of its width and height) and a label style;
// every language's ::label lines use the same anchors. A right-bound book shows the painting
// mirrored, the mountains on the right, so the river runs the way its pages are read: x comes
// from the other edge and a turn goes the other way. `start` is a label's own start, so the
// spring's label keeps it in Arabic and takes `end` in a label set left to right.
const halo = { color: col('paper'), width: pt(1.8) };
const labelStyles = [
  { id: 'sierra', fontFamily: DISPLAY, fontSize: pt(13), fontWeight: fw(600), color: col('ink'),
    textTransform: CAPS, letterSpacing: track(0.14), halo },
  { id: 'agua', fontFamily: TEXT, fontSize: pt(11), fontWeight: BOLD, fontStyle: SLANT,
    color: { hex: '#0b3a5c', model: 'hex' }, halo, // a name set away draws a leader to its point
    leader: { width: pt(1), endCap: 'dot', capSize: mm(1.6) } },
  { id: 'mar', fontFamily: TEXT, fontSize: pt(12), fontWeight: BOLD, fontStyle: SLANT,
    color: col('paper'), halo: { color: { hex: '#0b3a5c', model: 'hex' }, width: pt(1.8) } },
  { id: 'pueblo', fontFamily: DISPLAY, fontSize: pt(12), fontWeight: fw(600), color: col('ink'),
    halo },
  { id: 'curso', fontFamily: DISPLAY, fontSize: pt(10.5), fontWeight: fw(600), color: col('paper'),
    textTransform: CAPS, letterSpacing: track(0.08), background: col('campo'),
    padding: mm(1.6) },
];
const ANCHORS = [
  { id: 'sierra', x: 0.21, y: 0.055, style: 'sierra' },
  // The spring and the dam: the point is the place, `labelAt` where its name stands.
  { id: 'nacimiento', x: 0.049, y: 0.098, labelAt: { x: 0.075, y: 0.115 }, style: 'agua',
    align: 'start' },
  { id: 'fontalba', x: 0.135, y: 0.255, style: 'pueblo', verticalAlign: 'top' },
  { id: 'embalse', x: 0.293, y: 0.275, labelAt: { x: 0.31, y: 0.155 }, style: 'agua',
    width: 0.12 },
  { id: 'molinar', x: 0.505, y: 0.35, style: 'pueblo', verticalAlign: 'bottom' },
  { id: 'aldamar', x: 0.845, y: 0.505, style: 'pueblo', verticalAlign: 'bottom' },
  { id: 'mar', x: 0.965, y: 0.28, style: 'mar' },
  { id: 'rio', x: 0.61, y: 0.715, style: 'agua', rotate: -3 },
  { id: 'alto', x: 0.17, y: 0.45, style: 'curso' },
  { id: 'medio', x: 0.4, y: 0.77, style: 'curso' },
  { id: 'bajo', x: 0.74, y: 0.865, style: 'curso' },
];
const flip = (x) => Math.round((1 - x) * 1000) / 1000;
const flipped = (a) => ({ ...a, x: flip(a.x), ...(a.labelAt && { labelAt: { ...a.labelAt,
    x: flip(a.labelAt.x) } }),
  ...(a.rotate && { rotate: -a.rotate }), ...(a.align && !AR && { align: 'end' }) });
const anchors = RIGHT_BOUND ? ANCHORS.map(flipped) : ANCHORS;
// #endregion

const config = {
  canvasViewer: { pageGap: 0 }, // the Canvas joins the two pages of a spread
  locale: t({ es: 'es', en: 'en-gb', ca: 'ca', pt: 'pt-BR', fr: 'fr', de: 'de', it: 'it',
    ar: 'ar', zh: 'zh-Hans', ja: 'ja' }), // written out: Arabic sets its pages right to left
  resourceTypes: [{ id: 'dibujo', name: t({ es: 'Dibujo', en: 'Picture', ca: 'Dibuix',
    pt: 'Desenho', fr: 'Dessin', de: 'Bild', it: 'Disegno', ar: 'رسم', zh: '图', ja: '絵' }),
  shortLabel: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
  captionPrefix: '', defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: { sizePreset: 'custom', width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, margins: {
    top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.inner), right: mm(PAGE.outer),
    mirror: true } },
  layout: { layoutType: 'single', ...(CJK && { writingMode: 'vertical-rl' }) }, // right-bound
  bodyText: { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    boldFontWeight: BOLD, textAlign: CJK ? 'justify' : 'left', firstLineIndent: CJK ? em(1) : pt(0),
    paragraphSpacing: !CJK, hyphenation: { enabled: LATIN }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, fontWeight: fw(600), color: col('ink'), levels: [{ level: 1,
    fontSize: pt(28), lineHeight: pt(AR ? 40 : 32), color: col('paper'), marginTop: pt(0),
    marginBottom: pt(0), breakBefore: { enabled: false } }, { level: 2, fontSize: pt(15),
    lineHeight: pt(AR ? 24 : 19), marginTop: pt(9), marginBottom: pt(3) }] },
  headingStyles: [{ id: 'portada', numbered: false, toc: false, fontSize: pt(46),
    lineHeight: pt(AR ? 64 : 48) }, { id: 'previo', numbered: false, toc: false }],
  toc,
  parts: { page: false }, // a part is a row of the contents, with no divider page
  unorderedLists: { bulletChar: '•', color: col('agua'), fontWeight: BOLD, itemSpacing: pt(3) },
  orderedLists: { numberFormat: { zh: 'simp-chinese-informal', ja: 'japanese-informal' }[LANG]
    ?? 'arabic', fontFamily: DISPLAY, fontWeight: fw(600), color: col('agua'), itemSpacing: pt(4) },
  labelStyles,
  captionStyle: { fontFamily: TEXT, fontSize: pt(9), color: col('ink'), descriptionItalic: LATIN,
    gap: pt(4) },
  calloutStyles,
  header: { elements: [head('materia', '{subtitle}', 'even'), head('unidad', '{title}', 'odd')] },
  footer: { elements: [folio('folio-par', 'even'), folio('folio-impar', 'odd')] },
  pageTemplates,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: nine paintings (JPEGs in assets/), the pictures of the unit
// Painted with a diffusion model in a coloured-pencil and watercolour manner, cut to the shape
// of the frames that show them and declared with their pixels. Nothing is written on them: the
// names on the map are ::label lines of the Markdown, standing at the anchors above. A
// right-bound book's map is the same painting mirrored.
const ART = { portada: ['portada-1400.jpg', 1400, 1021, 165],
  mapa: [RIGHT_BOUND ? 'mapa-1900-rtl.jpg' : 'mapa-1900.jpg', 1900, 730, 122],
  ...Object.fromEntries(['nacimiento', 'arroyo', 'cascada', 'riego', 'molino', 'piraguas',
    'limpieza'].map((id) => [id, [`${id}-720.jpg`, 720, 540, 330]])) };
const resources = await Promise.all(Object.entries(ART).map(async ([id, [fileId, w, h, ppi]]) => {
  await loadImage(fileId, asset(fileId));
  return { id, typeId: 'dibujo', kind: 'bitmap', caption: '', altText: '', createdAt: 0,
    updatedAt: 0, bitmap: { fileId, format: 'jpeg', width: w, height: h, resolution: ppi },
    ...(id === 'mapa' && { anchors }) };
}));
// The map again with no anchors, small, under the contents.
resources.push({ ...resources.find((r) => r.id === 'mapa'), id: 'rio', anchors: [] });
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face of the ten editions; each loads its own two, with the cjk and arabic blocks' files.
const FONTS = {
  Nunito: ['400', '400i', '700'], Fredoka: ['500', '600', '700'],
  'Noto Naskh Arabic': ['400', '700'], 'Baloo Bhaijaan 2': ['500', '600', '700'],
  'Klee One': ['400', '600'], 'Zen Maru Gothic': ['500', '700'], // a textbook hand, rounded heads
  'Noto Serif SC': ['400', '700'], 'ZCOOL KuaiLe': ['400'],
};
for (const face of Object.keys(FONTS)) if (![TEXT, DISPLAY].includes(face)) delete FONTS[face];
await loadFonts(FONTS, markdown);
await loadCjkFonts(FONTS, markdown, { vertical: CJK });
await loadArabicFonts(FONTS, markdown);

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources }, config),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ es: 'Nuestro río', en: 'Our river', ca: 'El nostre riu',
  pt: 'Nosso rio', fr: 'Notre fleuve', de: 'Unser Fluss', it: 'Il nostro fiume', ar: 'نهرنا',
  zh: '我们的河流', ja: 'わたしたちの川' }) });
offerPdf(() => renderToPdf(doc, { resourceBytes: imageBytes,
  fontProvider: { zh: cjkPdfProvider, ja: cjkPdfProvider, ar: arabicPdfProvider }[LANG]
    ?? fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk arabic · the Cookbook inlines cookbook/_kit/*.js here
