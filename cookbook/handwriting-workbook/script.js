// ═══ Postext Cookbook · Nº 161 · Handwriting workbook in ten scripts ═══════════════
// https://postext.dev/en/cookbook/handwriting-workbook
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Playwrite, Playpen Sans Arabic, Klee One and others (SIL OFL) · Needs postext ≥ 1.65.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the workbook (en es ca fr de it pt zh ja ar)
const RECIPE = 'handwriting-workbook';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a navy ink, one coral accent, the sun and the pale fields of the bands
const palette = {
  ink: '#22304a', accent: '#bf4630', // text and models; kickers, labels, folios
  sun: '#f4b73f', tint: '#fdf0da', // the boxes' stripe; opener bands, boxes
  rule: '#7f9ccc', dots: '#4d5b76', // the ruling; the dotted letters
  trace: LANG === 'ja' ? '#b4bccb' : '#e7a9a0', // traced over: 描红 in red, なぞり書き in grey
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion

// #region editions: each language its school's script, its ruling and its faces
// hand: the school model the children copy; ruling: the paper they copy it on; u: its
// x-height in mm (the height of an a), the unit every ruling is drawn in; rise: the room its
// capitals need above a title. The Chinese text is in Song: the Kai face, cut for Hong Kong
// and Taiwan, centres its commas, so it sets only the titles and the squares.
const EDITIONS = {
  en: { hand: 'Playwrite GB J', ruling: 'gb', u: 3.6 },
  es: { hand: 'Playwrite ES', ruling: 'pauta', u: 3.6 },
  ca: { hand: 'Playwrite ES', ruling: 'pauta', u: 3.6 },
  fr: { hand: 'Playwrite FR Trad', ruling: 'seyes', u: 3, rise: 5 },
  de: { hand: 'Playwrite DE VA', ruling: 'lineatur', u: 3.6 },
  it: { hand: 'Playwrite IT Trad', ruling: 'righe', u: 3.6 },
  pt: { hand: 'Playwrite BR', ruling: 'caligrafia', u: 3.2 },
  zh: { hand: 'LXGW WenKai TC', ruling: 'tian', text: 'Noto Serif SC',
    label: 'Noto Sans SC', pinyin: 'Andika', cell: 16 },
  ja: { hand: 'Klee One', ruling: 'masu', text: 'Klee One', label: 'Zen Maru Gothic', cell: 16 },
  ar: { hand: 'Playpen Sans Arabic', ruling: 'satr', u: 3.6,
    text: 'Noto Naskh Arabic', label: 'Baloo Bhaijaan 2' },
};
const ED = { text: 'Andika', label: 'Lexend', rise: 0, ...EDITIONS[LANG] };
const [HAND, TEXT, LABEL] = [ED.hand, ED.text, ED.label];
const CJK = ED.cell !== undefined; // a grid of squares, one character to each
const RTL = LANG === 'ar';
const LW = CJK ? 700 : 600; // the labels' weight: the CJK label faces ship no 600
// Labels in tracked capitals, where the script has capitals.
const caps = (n) => (!CJK && !RTL ? { textTransform: 'uppercase', letterSpacing: pt(n) } : {});
// #endregion

const W = 176; // mm: the type area's width, and every practice block's
// A design laid in the flow of a right-to-left page is mirrored by the engine, so 'left' is
// the start side in every edition: the Arabic book needs no coordinates of its own.
const box = (width, height) => ({ width: mm(width), height: mm(height) });
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'left', placement,
  ...extra });
const image = (id, resourceId, placement) => ({ kind: 'image', id, resourceId, placement,
  decorative: true });

// #region answer: a practice box: the model in the school face, then dots, then nothing
// :::callout{type="palabra" title="Repasa y escribe"} / niña / ::: draws four rows: the model
// and copies, a row of copies, the model and a copy, an empty row, all of them the box's word
// ({boxText}); a copy has `dotted`, `repeat` fills its row. A design text's baseline falls 0.8
// of its line below its top; a tall line keeps the descenders inside its clip.
const G = CJK ? null : geometry(ED.ruling, ED.u); // rows, baselines and the face's size
const [LABEL_H, GAP] = [7, 3 * ED.u]; // mm: the box's title above its ruling; between copies
const hand = (id, placement, extra) => text(id, '{boxText}', HAND, G.size / 0.3528, placement,
  { lineHeight: mm(G.line), overflow: 'clip', ...extra });
const dots = (many) => ({ color: col('dots'), dotted: { spacing: mm(0.2 * ED.u),
  size: mm(0.11 * ED.u) }, ...(many && { repeat: { gap: mm(GAP) } }) });
const onRow = (n, size) => at('container', 'top-left', 0, G.base[n] - 0.8 * G.line, size);
const model = (n) => hand(`model-${n}`, onRow(n));
// Copies after the model of row n (as many as fit, or one), or from the row's start.
const after = (n, many) => hand(`after-${n}`, { anchor: { to: `#model-${n}`,
  edge: 'right-of' }, offset: { x: mm(GAP) } }, dots(many));
const copies = (n, many) => hand(`copies-${n}`, onRow(n, { width: 'fill' }), dots(many));
const ruled = (rows, picture, texts) => ({ setsContent: true, minHeight: mm(G.height(rows)),
  slot: { elements: [image('ruling', picture, at('container', 'top-left', 0, 0,
    box(W, G.height(rows)))), ...texts] } });
// Every practice box: no frame, its title in the label face LABEL_H above the drawing.
const practice = (id, design, gap = mm(4)) => ({ id, design, backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, titleStyle: {
    fontFamily: LABEL, fontSize: pt(9), fontWeight: LW, color: col('accent'), lineHeight: mm(5),
    gap: mm(LABEL_H - 5), ...caps(1.2) }, marginTop: gap, marginBottom: mm(5), snapToGrid: false });
// #endregion

// #region squares: the Chinese and Japanese boxes, a character to a square
// :::callout{type="caracteres" title="写一写"} with one character per list item: each in the
// first square of its row, three copies to trace in the pale red (描红) or grey (なぞり書き) of
// the next squares, then empty ones. A Han or kana character is one em wide, so tracking of
// (square − em) sets one per square.
const [CELL, EM] = [ED.cell ?? 16, (ED.cell ?? 16) * 0.72]; // mm: the square, its character
const SQUARES = Math.floor(W / CELL);
const row = (n, y, content, x, color) => text(`r${n}-${x}`, content, HAND, EM / 0.3528,
  at('container', 'top-left', x * CELL + (CELL - EM) / 2, y + (CELL - EM) / 2 + EM * 0.06,
    box(W - x * CELL, EM)),
  { lineHeight: mm(EM), letterSpacing: mm(CELL - EM), overflow: 'clip', color: col(color) });
// A sentence (type="frase") takes three rows: written out, traced, and a row to write it alone.
const squareBlock = (rows, sentence) => ({ setsContent: true, minHeight: mm(rows * CELL),
  slot: { elements: [image('grid', `squares-${rows}`,
    at('container', 'top-left', 0, 0, box(SQUARES * CELL, rows * CELL))),
  ...(sentence ? [row(0, 0, '{boxText}', 0, 'ink'), row(1, CELL, '{boxText}', 0, 'trace')]
    : Array.from({ length: rows }, (_, n) => [
      row(n, n * CELL, `{boxText.${n + 1}}`, 0, 'ink'),
      row(n, n * CELL, `{boxText.${n + 1}}`.repeat(3), 1, 'trace'),
    ]).flat()),
  ] } });
// Pinyin on four lines and three spaces (四线三格), :::callout{type="pinyin"} / bā / ::: —
// the syllable, copies to trace in the pale red, the syllable again and room after it.
const P = ED.pinyin ? geometry('sixian', 3.6) : null;
const pinyin = (id, n, x, content, color) => text(id, content, ED.pinyin, P.size / 0.3528,
  at('container', 'top-left', x, P.base[n] - 0.8 * P.line, { width: mm(W - x) }),
  { lineHeight: mm(P.line), overflow: 'clip', color: col(color) });
const syllables = Array(5).fill('{boxText}').join('\u00a0\u00a0\u00a0\u00a0');
const pinyinBlock = P && { setsContent: true, minHeight: mm(P.height(3)),
  slot: { elements: [
    image('lines', 'sixian', at('container', 'top-left', 0, 0, box(W, P.height(3)))),
    pinyin('p1', 0, 0, '{boxText}', 'ink'), pinyin('p1-copies', 0, 36, syllables, 'trace'),
    pinyin('p2', 1, 0, syllables, 'trace'), pinyin('p3', 2, 0, '{boxText}', 'ink'),
  ] } };
// #endregion

// #region opener: a tinted band with the lesson's letters in a disc and its picture
const BAND = 40; // mm
const opener = { enabled: true, minHeight: mm(BAND + 7), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('tint'),
    borderRadius: mm(5) }, placement: at('container', 'top-left', 0, 0, box(W, BAND)) },
  text('letters', '{attr.letras}', HAND, CJK ? 30 : 26, at('container', 'top-left', 5, 5,
    box(40, 30)),
  { align: 'center', verticalAlign: 'middle', color: col('accent'), overflow: 'clip',
    box: { backgroundColor: col('paper'), borderRadius: mm(15) } }),
  text('kicker', '{attr.kicker}', LABEL, 9, at('container', 'top-left', 52, 8),
    { fontWeight: LW, color: col('accent'), ...caps(1.2) }),
  text('title', '{titleText}', HAND, CJK ? 26 : 24, at('container', 'top-left', 52,
    15 + ED.rise, { width: mm(80) }), { lineHeight: 1.25 }),
  { kind: 'box', id: 'card', style: { backgroundColor: col('paper'),
    borderRadius: mm(4) }, placement: at('container', 'top-right', -4, 3, box(34, 34)) },
  image('picture', '{attr.pic}', at('container', 'top-right', -5, 4, box(32, 32))),
] } };
// #endregion

// #region pages: the cover, the certificate and the picture dictionary
// The cover: a painted scene to the bleed, the title in the school face, a line for a name.
const COVER = 178; // mm from the top edge: the foot of the painting
const cover = { id: 'portada', header: { elements: [] }, footer: { elements: [] },
  sectionEnd: 'heading', // the book's only h1: its blank running heads end at the first h2
  advancedDesign: { enabled: true, slot: { elements: [
    image('scene', 'cover', at('page', 'top-left', 0, 0, { width: 'fill', height: mm(COVER) })),
    text('kicker', '{attr.kicker}', LABEL, 11, at('page', 'top', 0, COVER + 10),
      { align: 'center', fontWeight: LW, color: col('accent'), ...caps(1.6) }),
    text('title', '{titleText}', HAND, CJK ? 48 : 46, at('page', 'top', 0, COVER + 18 + ED.rise),
      { align: 'center', lineHeight: 1.2 }),
    text('name', '{attr.nombre}', LABEL, 12, at('page', 'top', -W / 2 + 24, COVER + 58),
      { color: col('ink') }),
    { kind: 'rule', id: 'name-line', direction: 'horizontal', thickness: pt(1),
      color: col('rule'), placement: at('page', 'top', 14, COVER + 64, { width: mm(110) }) },
    text('colophon', '{attr.colofon}', LABEL, 7, at('page', 'top', 0, 262, { width: mm(W) }),
      { align: 'center', color: col('dots'), lineHeight: 1.4 }),
  ] } } };
// The last page: the same frame as a certificate, the child's name and the date to fill in.
const diploma = { id: 'diploma', header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, minHeight: mm(250), slot: { elements: [
    { kind: 'box', id: 'frame', style: { borderColor: col('sun'),
      borderWidth: pt(5), borderRadius: mm(8), backgroundColor: col('paper') },
    placement: at('container', 'top-left', 0, 4, box(W, 244)) },
    image('picture', 'medal', at('container', 'top', 0, 22, box(70, 70))),
    text('title', '{titleText}', HAND, CJK ? 40 : 38, at('container', 'top', 0, 104,
      { width: mm(W - 20) }), { align: 'center', color: col('accent'), lineHeight: 1.2 }),
    text('body', '{attr.texto}', TEXT, 15, at('container', 'top', 0, 136, { width: mm(130) }),
      { align: 'center', lineHeight: 1.45 }),
    ...[0, 1].map((n) => text(`field-${n}`, `{attr.${['nombre', 'fecha'][n]}}`, LABEL, 11,
      at('container', 'top-left', 28, 186 + n * 22), { color: col('dots') })),
    ...[0, 1].map((n) => ({ kind: 'rule', id: `line-${n}`, direction: 'horizontal',
      thickness: pt(1), color: col('rule'),
      placement: at('container', 'top-left', 28, 192 + n * 22, { width: mm(W - 56) }) })),
  ] } } };
// The picture dictionary, :::callout{type="diccionario" p1="cat" …} with the four words as a
// list: four pictures to a row, each word under its picture in the school face, and a line to
// copy it on.
const SLOT = W / 4;
const dictionary = { setsContent: true, minHeight: mm(58),
  slot: { elements: [0, 1, 2, 3].flatMap((n) => [
    image(`p${n}`, `{attr.p${n + 1}}`, at('container', 'top-left', n * SLOT + (SLOT - 34) / 2,
      0, box(34, 34))),
    text(`w${n}`, `{boxText.${n + 1}}`, HAND, CJK ? 20 : 17, at('container', 'top-left',
      n * SLOT, 36, box(SLOT, 10)), { align: 'center', overflow: 'clip' }),
    { kind: 'rule', id: `l${n}`, direction: 'horizontal', thickness: pt(0.75),
      color: col('rule'), placement: at('container', 'top-left', n * SLOT + 4, 54,
        { width: mm(SLOT - 8) }) },
  ]) } };
// #endregion

// The folio in an accent disc at the outer foot, the book's title beside it.
const foot = (parity, edge, side) => [
  text(`folio-${parity}`, '{pageNumber}', LABEL, 10, { anchor: { to: 'page', edge },
    offset: { x: mm(18 * side), y: mm(-9) }, size: box(8, 8) }, { parity, align: 'center',
    verticalAlign: 'middle', fontWeight: 700, color: col('paper'), lineHeight: 1.17,
    box: { backgroundColor: col('accent'), borderRadius: mm(4) } }),
  text(`title-${parity}`, '{title} · {subtitle}', LABEL, 7.5, { anchor: { to: 'page', edge },
    offset: { x: mm(29 * side), y: mm(-11) } },
  { parity, color: col('dots'), align: side > 0 ? 'left' : 'right', ...caps(1) }),
];

const config = {
  // Hyphenation, punctuation, direction and binding follow the edition's language.
  locale: t({ en: 'en-gb', es: 'es', ca: 'ca', fr: 'fr', de: 'de', it: 'it', pt: 'pt-BR',
    zh: 'zh-Hans', ja: 'ja', ar: 'ar' }),
  resourceTypes: [{ id: 'dibujo', name: 'Dibujo', shortLabel: '', captionPrefix: '',
    numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
    defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    margins: { top: mm(16), bottom: mm(22), left: mm(18), right: mm(16), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(CJK ? 13.5 : 14), lineHeight: pt(RTL ? 25 : 20),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: RTL || CJK ? 'justify' : 'left',
    firstLineIndent: pt(0), paragraphSpacing: true, hyphenation: { enabled: !CJK && !RTL },
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: HAND, color: col('ink'), fontWeight: 400,
    levels: [ // h1 is the book (the cover style draws it), h2 each section; exercises are boxes
      { level: 1, breakBefore: { enabled: true, parity: 'any' }, marginTop: pt(0),
        marginBottom: mm(3) },
      { level: 2, breakBefore: { enabled: true, parity: 'any' }, marginTop: pt(0),
        marginBottom: mm(3), advancedDesign: opener },
    ],
  },
  headingStyles: [cover, diploma],
  chipStyles: [ // a blank to write a letter in, a letter tile, a word in dots to trace
    { id: 'hueco', fontFamily: LABEL, background: col('paper'), borderColor: col('rule'),
      borderWidth: pt(1), borderRadius: mm(1.2), paddingX: mm(4), paddingY: em(0.12) },
    { id: 'letra', fontFamily: HAND, background: col('tint'), borderColor: col('sun'),
      borderWidth: pt(1), borderRadius: mm(1.6), paddingX: mm(2), paddingY: em(0.08) },
    { id: 'puntos', fontFamily: HAND, fontSize: em(1.25), color: col('dots'), dotted: {},
      backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0), paddingY: pt(0) }],
  calloutStyles: [{ id: 'recuerda', background: col('tint'), borderRadius: mm(3),
    stripe: { enabled: true, side: 'left', width: pt(4), color: col('sun') },
    padding: { top: mm(3), right: mm(5), bottom: mm(3.5), left: mm(5) },
    titleStyle: { fontFamily: LABEL, fontSize: pt(9), fontWeight: LW, color: col('accent'),
      ...caps(1.2) },
    body: { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(RTL ? 21 : 17),
      color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
      firstLineIndent: pt(0) } },
    // One style per shape of exercise, whatever its words (the box's content).
    ...(CJK ? [practice('caracteres', squareBlock(4)), practice('frase', squareBlock(3, true))] : [
      practice('trazos', ruled(4, 'trazo-{attr.pattern}', [])),
      practice('palabra', ruled(4, 'ruling-4',
        [model(0), after(0, true), copies(1, true), model(2), after(2)])),
      practice('frase', ruled(3, 'ruling-3', [model(0), copies(1)]))]), // a sentence: once
    ...(P ? [practice('pinyin', pinyinBlock)] : []),
    { ...practice('diccionario', dictionary, mm(3)), marginBottom: mm(3) }],
  header: { elements: [] },
  footer: { elements: [...foot('even', 'bottom-left', 1), ...foot('odd', 'bottom-right', -1)] },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the edition's ruling and the warm-up strokes, drawn in code
// Each country's paper, in x-heights (u) above and below the baseline. lines: [height,
// weight] pairs; band: a filled band; seyes: the French grid of 1 u squares, a heavy line
// every 4 u, verticals every 4 u; Seyès and the Italian page rule a red margin where the
// writing starts.
function geometry(style, u) {
  const R = {
    pauta: { above: 2, below: 1, gap: 1, lines: [[-1, 0.4], [0, 0.9], [1, 0.9], [2, 0.4]] },
    gb: { above: 2, below: 1, gap: 0.8,
      lines: [[-0.8, 0.5], [0, 0.9], [1, 0.5, 'dash'], [1.8, 0.5]] },
    lineatur: { above: 2, below: 1, gap: 1, lines: [[-1, 0.6], [0, 0.6], [1, 0.6], [2, 0.6]],
      band: [0, 1, '#fdf3c7'] },
    righe: { above: 2, below: 1, gap: 1, lines: [[-1, 0.4], [0, 0.8], [1, 0.8], [2, 0.4]],
      margin: true },
    caligrafia: { above: 2.4, below: 1.4, gap: 0.8, lines: [[-1.3, 0.4], [0, 0.9], [1, 0.9],
      [2.3, 0.4]], band: [0, 1, '#e8f0fb'] },
    satr: { above: 2, below: 1, gap: 1, lines: [[-1, 0.4], [0, 0.9], [1, 0.5, 'dash'], [2, 0.4]] },
    seyes: { above: 4, below: 2, gap: -2, seyes: true }, // a row on every heavy line
    sixian: { above: 2, below: 1, gap: 1, lines: [[-1, 0.6], [0, 0.9], [1, 0.6], [2, 0.6]] },
  }[style];
  const pitch = (R.above + R.below + R.gap) * u;
  const base = [0, 1, 2, 3].map((n) => n * pitch + R.above * u);
  // The faces set their x-height at half the em, Playpen Sans Arabic its tooth at 0.4.
  const xh = { satr: 0.4, sixian: 0.508 }[style] ?? 0.5; // Andika's x-height for pinyin
  // line: a tall box for the models, whose clip falls 2 u under the baseline.
  return { ...R, u, pitch, base, size: u / xh, line: u * 10,
    height: (rows) => (rows - 1) * pitch + (R.above + R.below) * u };
}
const n2 = (v) => +v.toFixed(2);
function ruling(g, rows) {
  const out = [];
  const h = g.height(rows);
  const hline = (y, w, dash) => out.push(`<path d="M0 ${n2(y)}H${W}" stroke="${palette.rule}" `
    + `stroke-width="${n2(w * 0.3528)}" stroke-opacity="${w < 0.6 ? 0.55 : 1}"`
    + `${dash ? ' stroke-dasharray="1.2 1"' : ''}/>`);
  if (g.seyes) {
    for (let k = 0; k <= h / g.u + 1e-6; k++) hline(k * g.u, k % 4 === 0 ? 0.9 : 0.35);
    for (let x = 4 * g.u; x <= W; x += 4 * g.u) out.push(`<path d="M${n2(x)} 0V${n2(h)}" `
      + `stroke="${palette.rule}" stroke-width=".12"/>`);
    out.push(`<path d="M.2 0V${n2(h)}" stroke="#d9534f" stroke-width=".3"/>`);
    return out.join('');
  }
  for (const b of g.base.slice(0, rows)) {
    if (g.band) out.push(`<rect x="0" y="${n2(b - g.band[1] * g.u)}" width="${W}" `
      + `height="${n2((g.band[1] - g.band[0]) * g.u)}" fill="${g.band[2]}"/>`);
    for (const [k, w, dash] of g.lines) hline(b - k * g.u, w, dash);
  }
  if (g.margin) out.push(`<path d="M.2 0V${n2(h)}" stroke="#d9534f" stroke-width=".3"/>`);
  return out.join('');
}
// Warm-up strokes: curves drawn by code, in dots as far apart as the letters' copies.
const PATTERNS = { // s runs along the stroke; x and y in 2 u, from the baseline up
  lines: (s) => [Math.floor(s) * 0.5, s % 1], // sticks, each drawn from the foot up
  waves: (s) => [s * 0.5, (1 - Math.cos(s * Math.PI)) / 4], // waves in the x-height band
  loops: (s) => [s * 0.5 - 0.2 * Math.sin(2 * Math.PI * s), (1 - Math.cos(2 * Math.PI * s)) / 2],
};
function pattern(name, x0, x1, base, u) {
  const f = PATTERNS[name]; const pts = []; const pitch = 0.2 * u;
  let prev = null; let acc = 0;
  for (let s = 0; s < 400; s += 0.002) {
    const [px, py] = f(s); const p = [x0 + px * u * 2, base - py * u * 2];
    if (p[0] > x1) break;
    acc += prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) : pitch;
    prev = p;
    if (acc < pitch) continue;
    pts.push(`M${n2(RTL ? W - p[0] : p[0])} ${n2(p[1])}h.01`); acc = 0;
  }
  return `<path d="${pts.join('')}" stroke="${palette.dots}" stroke-width="${n2(0.11 * u)}" `
    + 'stroke-linecap="round" fill="none"/>';
}
// The pictures the practice boxes name: the ruling of a word (four rows) and of a sentence
// (three), a warm-up pattern on its ruling (two rows of it and the start of a third), or the
// edition's squares and its pinyin lines.
async function practicePictures(add) {
  const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" `
    + `height="${n2(h * 10)}" viewBox="0 0 ${w} ${n2(h)}">${body}</svg>`;
  const put = async (id, rows, body) => {
    await loadSvg(`${id}.svg`, svg(W, G.height(rows), body));
    add(id, `${id}.svg`, 'svg', W * 10, G.height(rows) * 10);
  };
  if (G) {
    for (const rows of [3, 4]) await put(`ruling-${rows}`, rows, ruling(G, rows));
    for (const name of Object.keys(PATTERNS)) await put(`trazo-${name}`, 4, ruling(G, 4)
      + [W, W, W * 0.4].map((end, row) => pattern(name, 2, end - 2, G.base[row], G.u)).join(''));
  }
  if (P) {
    await loadSvg('sixian.svg', svg(W, P.height(3), ruling(P, 3)));
    add('sixian', 'sixian.svg', 'svg', W * 10, P.height(3) * 10);
  }
  if (CJK) for (const rows of [3, 4]) {
    await loadSvg(`squares-${rows}.svg`, squaresSvg(rows));
    add(`squares-${rows}`, `squares-${rows}.svg`, 'svg', SQUARES * CELL * 10, rows * CELL * 10);
  }
}
// The squares: 田字格 in red with a dashed cross, or マス with a dotted cross in grey-blue.
function squaresSvg(rows) {
  const c = CELL; const n = SQUARES; const red = ED.ruling === 'tian';
  const ink = red ? '#d0574b' : palette.rule;
  const cross = Array.from({ length: rows }, (_, r) => Array.from({ length: n }, (_, k) =>
    `M${k * c + c / 2} ${r * c + 0.6}V${r * c + c - 0.6}M${k * c + 0.6} ${r * c + c / 2}`
    + `H${k * c + c - 0.6}`).join('')).join('');
  const grid = Array.from({ length: n + 1 }, (_, k) => `M${k * c} 0V${rows * c}`).join('')
    + Array.from({ length: rows + 1 }, (_, r) => `M0 ${r * c}H${n * c}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n * c * 10}" height="${rows * c * 10}" `
    + `viewBox="0 0 ${n * c} ${rows * c}"><path d="${cross}" fill="none" stroke="${ink}" `
    + `stroke-opacity=".55" stroke-width=".2" stroke-dasharray="${red ? '.9 .6' : '.25 .55'}"/>`
    + `<path d="${grid}" fill="none" stroke="${ink}" stroke-width=".35"/></svg>`;
}
// #endregion


// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Andika: ['400', '700'], // the text: drawn for children learning to read
  Lexend: ['400', '600', '700'], // labels, kickers, folios
  // The school models, one per country: Google's Playwrite families follow each one.
  'Playwrite GB J': ['400'], 'Playwrite ES': ['400'], 'Playwrite FR Trad': ['400'],
  'Playwrite DE VA': ['400'], 'Playwrite IT Trad': ['400'], 'Playwrite BR': ['400'],
  'LXGW WenKai TC': ['400'], // 楷: the Chinese titles and squares
  'Noto Serif SC': ['400', '700'], // 宋: the Chinese text
  'Noto Sans SC': ['400', '700'], // 黑: Chinese labels
  'Klee One': ['400'], // 教科書体: the Japanese text and its squares
  'Zen Maru Gothic': ['400', '700'], // Japanese labels
  'Playpen Sans Arabic': ['400'], // the Arabic model
  'Noto Naskh Arabic': ['400', '700'], // the Arabic text, vocalised
  'Baloo Bhaijaan 2': ['400', '600', '700'], // Arabic labels
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// The edition loads its own faces only: its school face, its text and its labels.
const used = [HAND, TEXT, LABEL, ED.pinyin];
for (const family of Object.keys(FONTS)) if (!used.includes(family)) delete FONTS[family];
await loadFonts(FONTS, markdown);
await loadCjkFonts(FONTS, markdown);
await loadArabicFonts(FONTS, markdown);
const resources = []; // every picture, painted or drawn
const add = (id, fileId, kind, width, height, more = {}) => resources.push({ id, kind,
  typeId: 'dibujo', createdAt: 0, updatedAt: 0, [kind]: { fileId, width, height, ...more } });
// The paintings the edition names (pic="…", p1="…"), from one shared set, at their pixels.
const named = new Set(['medal',
  ...[...markdown.matchAll(/\b(?:pic|p\d)="(\w+)"/g)].map((m) => m[1])]);
await Promise.all([['cover', 'cover-1600.jpg', 1600, 1356],
  ...[...named].map((id) => [id, `${id}-480.jpg`, 480, 480])].map(async ([id, file, w, h]) => {
  await loadImage(file, asset(file)); add(id, file, 'bitmap', w, h, { format: 'jpeg' });
}));
await practicePictures(add); // the rulings, the warm-up strokes and the squares (#region art)
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources }, config),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Handwriting workbook', es: 'Cuaderno de caligrafía',
  ca: 'Quadern de cal·ligrafia', fr: 'Cahier d’écriture', de: 'Schreibheft',
  it: 'Quaderno di scrittura', pt: 'Caderno de caligrafia', zh: '写字练习册',
  ja: 'かきかたれんしゅうちょう', ar: 'كراسة الخط' }) });
offerPdf(() => renderToPdf(doc, { resourceBytes: imageBytes,
  fontProvider: { zh: cjkPdfProvider, ja: cjkPdfProvider, ar: arabicPdfProvider }[LANG]
    ?? fontsourceProvider }), `${RECIPE}-${LANG}.pdf`);

// @kit core fonts viewer pdf images cjk arabic
