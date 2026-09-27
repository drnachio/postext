// ═══ Postext Cookbook · Nº 060 · Early reader with syllable chips ════════════════
// https://postext.dev/en/cookbook/reading-primer-syllables
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Andika, DynaPuff, Playpen Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage, setCellImage,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'reading-primer-syllables';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#242832', paper: '#ffffff', muted: '#5f6470', // text; instructions
  cream: '#f6f0e3', rule: '#d3c9b6', sun: '#f2bd24', // the band and tiles; guides; drawings
  // The vowel code: a syllable takes its vowel's colour. White on these fills measures
  // 3.2–4.9:1, above WCAG's 3:1 for large text: the vowel chips are bold, 20 pt or more.
  a: '#d9482b', e: '#dd740c', i: '#1f9a8f', o: '#3f6fd8', u: '#9152cf' };
// Design elements read the hex and ignore the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults are linked to 'main-color': point it at the ink.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ink })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Andika', 'DynaPuff', 'Playpen Sans']; // Andika: one-storey a
const [TOP, SIDE, GRID] = [18, 20, 15]; // mm, mm, pt: every activity starts on the 15 pt grid

// #region answer: one chip style per vowel, and {ma·má} in the text written out as chips
// A word's syllables are chips with nothing between them, so their boxes touch and the white
// border draws the seam. Across a word space a chip keeps at least `gap`: 0.5 em sets the
// words of a 24 pt row 4.2 mm apart, where the space alone leaves 2.3 mm. Inside a sentence
// the '-frase' twins keep no gap, so the word space alone parts a chip from the word before.
// A 24 pt chip, padding and border included, is 10.4 mm tall (gotcha: chip-overlap).
const syllable = { fontFamily: TEXT, bold: true, borderWidth: pt(1), borderColor: col('paper'),
  paddingX: em(0.26), paddingY: em(0.05), gap: em(0.5) };
const chipStyles = [
  ...'aeiou'.split('').flatMap((v) => [ // one pair per vowel
    { ...syllable, id: v, background: col(v), color: col('paper') }, // a syllable with m
    { ...syllable, id: `${v}-borde`, background: col('paper'), color: col(v), borderColor: col(v) },
  ]).flatMap((style) => [style, { ...style, id: `${style.id}-frase`, gap: em(0) }]),
  { ...syllable, id: 'pinta', bold: false, background: col('paper'), color: col('ink'),
    borderColor: col('ink'), borderWidth: pt(0.8) }, // an outline for the child to colour in
];
const vowel = (s) => s.normalize('NFD').toLowerCase().match(/[aeiou]/)[0]; // 'mú' → 'u'
const chipOf = (s, end) => `:chip[${s}]{style="${vowel(s)}${/m/i.test(s) ? '' : '-borde'}${end}"}`;
// {mi·mo·sa} → :chip[mi]{style="i"}:chip[mo]{style="o"}:chip[sa]{style="a-borde"}, and a word
// written after another word, as in 'me {mi·ma}.', takes the '-frase' twins.
const syllables = (text) => text.replace(/(\p{L} )?\{([\p{L}·]+)\}/gu, (_, before = '', word) =>
  before + word.split('·').map((s) => chipOf(s, before ? '-frase' : '')).join(''));
// #endregion

const at = (x, y, size, edge = 'top-left') => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const words = (id, content, family, size, weight, color, placement, extra) => ({ kind: 'text',
  id, content, fontFamily: family, fontSize: pt(size), fontWeight: weight, color: col(color),
  align: 'left', overflow: 'wrap', placement, ...extra });
const picture = (id, resourceId, placement) => ({ kind: 'image', id, resourceId, placement });
const tag = { textTransform: 'uppercase', letterSpacing: pt(1.5) };

// #region opener: the letter's page: a cream band, a giant Mm and two things that start with m
const BAND = 104; // mm: the depth of the band's drawing; its wave dips to 101.9 mm
// Images reserve no height in an opener (gotcha: opener-image-no-reserve): by itself the
// opener ends at the foot of the word manzana, 88.7 mm down, and the first title starts on
// the wave's edge. 16 grid lines of minHeight start it on the grid, 11.4 mm below the wave.
const opener = { enabled: true, minHeight: pt(16 * GRID),
  slot: { elements: [
    picture('band', 'banda', at(0, 0, { width: mm(210), height: mm(BAND) })),
    words('unit', '{attr.unit}', LABEL, 9, 700, 'paper', at(SIDE, 12.5), { ...tag,
      box: { backgroundColor: col('ink'), borderRadius: mm(3),
        padding: { top: mm(1.2), right: mm(2.8), bottom: mm(1.2), left: mm(2.8) } } }),
    words('kicker', '{attr.kicker}', LABEL, 8.5, 600, 'muted', // level with the pill's text
      { anchor: { to: '#unit', edge: 'right-of' }, offset: { x: mm(4), y: mm(1.4) } }, tag),
    words('letter', '{titleText}', DISPLAY, 190, 700, 'ink', at(SIDE - 3, 19), { lineHeight: 1 }),
    words('name', '{attr.name}', LABEL, 20, 600, 'ink', at(SIDE + 1, 76)),
    picture('butterfly', 'mariposa', at(146, 12, { width: mm(40) })),
    picture('apple', 'manzana', at(151, 53, { width: mm(30) })),
    ...[['mariposa', 45.5], ['manzana', 84.5]].map(([name, y]) => words(name, name, LABEL, 10,
      600, 'muted', at(146, y, { width: mm(40) }), { align: 'center' })), // under each picture
  ] } };
// #endregion

// #region activities: each activity heading draws its icon beside the title
const ICON = 9; // mm
const H2 = { level: 2, marginBottom: pt(0), // two grid lines per title, and two above it
  lineHeight: pt(2 * GRID), marginTop: pt(2 * GRID) };
const activity = (id, icon) => ({ id, advancedDesign: { enabled: true, slot: { elements: [
  picture('icon', icon, { anchor: { to: 'container', edge: 'top-left' },
    size: { width: mm(ICON), height: mm(ICON) } }),
  words('title', '{titleText}', LABEL, 15, 700, 'ink', { anchor: { to: '#icon',
    edge: 'right-of' }, offset: { x: mm(3) }, size: { width: mm(140), height: mm(ICON) } },
  { verticalAlign: 'middle' }), // centred on the icon
] } } });
// #endregion

// #region pictures: six picture words in a rounded grid, each drawing inside its cell
const PICTURE_WORDS = ['ma·no', 'ma·pa', 'me·sa', 'mi·mo·sa', 'mo·no', 'mu·ñe·ca'];
const tableStyles = [{ id: 'dibujos', borderRadius: mm(5), // the frame and its fills, rounded
  headerBackgroundEnabled: false, // a header row added later would print grey (#f0f0f0)
  bodyBackgroundEnabled: true, bodyBackground: col('cream'), // cream tiles…
  rules: 'grid', borderColor: col('paper'), borderWidth: pt(4), // …parted by white rules
  bodyFontSize: pt(20), cellPadding: mm(3) }]; // the words' chips are 20 pt
const cells = (row) => PICTURE_WORDS.slice(row * 3, row * 3 + 3)
  .map((word) => ({ content: syllables(`{${word}}`), align: 'center' }));
let grid = { columnWidths: [1, 1, 1], rows: [cells(0), cells(1)] };
PICTURE_WORDS.forEach((word, k) => { // the drawing above the word, 0.72 of the cell's width
  const resourceId = word.replaceAll('·', '').replace('ñ', 'n');
  grid = setCellImage(grid, { row: Math.floor(k / 3), col: k % 3 }, { resourceId, width: 0.72 });
});
// #endregion

// The type of every drawing and the table: its empty captionPrefix prints no caption line.
const sheet = { id: 'lamina', name: 'Lámina', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' };
const here = (id, rest) => ({ id, typeId: 'lamina', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' }, ...rest });

const FOLIO = 9; // mm: the folio's disc
const folio = (parity, edge, x, textEdge, textX) => [
  words(`n-${parity}`, '{pageNumber}', DISPLAY, 12, 700, 'paper',
    at(x, -10, { width: mm(FOLIO), height: mm(FOLIO) }, edge),
    { align: 'center', verticalAlign: 'middle', parity,
      box: { backgroundColor: col('ink'), borderRadius: mm(FOLIO / 2) } }),
  words(`s-${parity}`, '{title} · {attr.unit}: {attr.name}', LABEL, 8, 600, 'muted',
    at(textX, -10, { width: mm(100), height: mm(FOLIO) }, textEdge),
    { parity, verticalAlign: 'middle', align: textEdge.endsWith('left') ? 'left' : 'right' }),
];

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  colorPalette, chipStyles, tableStyles, resourceTypes: [sheet],
  page: { width: mm(210), height: mm(260), dpi: 150, margins: { top: mm(TOP), bottom: mm(20),
    left: mm(SIDE), right: mm(SIDE) } }, // equal sides: nothing to mirror
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(GRID), color: col('ink'),
    referenceColor: col('ink'), // the palette never reaches it (gotcha: palette-skips-designs)
    textAlign: 'left', firstLineIndent: pt(0) }, // ragged: 1.4.1 hyphenates no ragged text
  headings: { fontFamily: LABEL, // the titles print through designs, but are measured in it
    balancing: { enabled: false }, // or page 37's spare grid line goes above its first title
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      // A unit opens on a recto. span 'page' paints the band into the top margin, where a
      // design kept in the column is cut off at the column's top edge.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        advancedDesign: opener }, H2] },
  headingStyles: [activity('oye', 'oreja'), activity('lee', 'libro'), activity('mira', 'ojo'),
    activity('repasa', 'lapiz')],
  // #region reading: the child's lines on multiples of the 15 pt grid, the instructions at 10 pt
  // A 24 pt chip is 10.4 mm tall: at 30 pt (10.6 mm) leading the chips of two sentences would
  // stand 0.1 mm apart, so every line the child reads has 45 pt, and the syllables 60 pt.
  paragraphStyles: [
    { id: 'consigna', fontFamily: LABEL, fontSize: pt(10), lineHeight: pt(GRID),
      color: col('muted') }, // the instruction under each activity
    { id: 'fila', fontSize: pt(34), lineHeight: pt(4 * GRID), textAlign: 'center' },
    { id: 'palabras', fontSize: pt(24), lineHeight: pt(3 * GRID), textAlign: 'center' },
    { id: 'lectura', fontSize: pt(24), lineHeight: pt(3 * GRID) },
    { id: 'colofon', fontSize: pt(7.5), lineHeight: pt(10), // Andika: Playpen has no italic
      color: col('muted'), marginTop: pt(GRID) },
  ],
  // #endregion
  // #region boxes: an activity on cream, the note for the family under a rule
  calloutStyles: [
    { id: 'colorea', background: col('cream'), borderRadius: mm(4),
      marginTop: pt(0), // the :::space before the box is the whole gap above it
      padding: { top: mm(4), right: mm(5), bottom: mm(5), left: mm(5) },
      titleStyle: { fontFamily: LABEL, fontSize: pt(15), fontWeight: 700, color: col('ink') },
      body: { fontFamily: LABEL, fontSize: pt(10), lineHeight: pt(GRID), color: col('muted') } },
    { id: 'familia', backgroundEnabled: false,
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('rule') },
      padding: { top: mm(3), right: mm(0), bottom: mm(0), left: mm(0) },
      titleStyle: { fontFamily: LABEL, fontSize: pt(8.5), fontWeight: 700, color: col('ink'),
        ...tag },
      body: { fontSize: pt(10.5), lineHeight: pt(GRID) } },
  ],
  // #endregion
  header: { elements: [] },
  footer: { elements: [ // the folio on the outer edge, the series beside it
    ...folio('odd', 'bottom-right', -SIDE, 'bottom-right', -(SIDE + FOLIO + 3)),
    ...folio('even', 'bottom-left', SIDE, 'bottom-left', SIDE + FOLIO + 3)] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the drawings, in the palette's colours
// No words in them: an SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts),
// so the tracing letters are strokes and every label is set by the page.
const P = palette;
const n = (v) => +v.toFixed(2);
const mix = (a, b, t) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16)
  * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;
const [SKIN, BROWN, WOOD] = [mix(P.e, P.paper, 0.72), mix(P.e, P.ink, 0.5), mix(P.e, P.ink, 0.35)];
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const OUT = ` stroke="${P.ink}" stroke-width=".7" stroke-linejoin="round"`;
const shape = (d, fill, extra = OUT) => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" `
  + `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const box = (x, y, w, h, r, fill, extra = OUT) => `<rect x="${x}" y="${y}" width="${w}" `
  + `height="${h}" rx="${r}" fill="${fill}"${extra}/>`;
const mirror = (w, body) => `${body}<g transform="translate(${w} 0) scale(-1 1)">${body}</g>`;
const g = (transform, body) => `<g transform="${transform}">${body}</g>`;

const apple = () => shape('M20 11.5C15 7.5 4.5 8.5 4.5 20.5C4.5 30.5 11.5 37.5 16.5 37.5C18 37.5 '
  + '19 36.6 20 36.6C21 36.6 22 37.5 23.5 37.5C28.5 37.5 35.5 30.5 35.5 20.5C35.5 8.5 25 7.5 20 '
  + '11.5Z', P.a) + `<ellipse cx="11.5" cy="19" rx="2.4" ry="4.4" fill="${P.paper}" `
  + 'fill-opacity=".4" transform="rotate(18 11.5 19)"/>'
  + line('M20 12C19.6 8.6 20.6 5.6 22.6 3.4', BROWN, 1.6)
  + shape('M21.6 7.8C23.4 3.4 28.6 2 32.6 3.2C31 7.6 26.2 9.8 21.6 7.8Z', P.i)
  + line('M22.8 7.3C25.8 6 28.6 4.8 31.2 3.8', P.paper, 0.5, ' stroke-opacity=".6"');
const butterfly = () => mirror(44, shape('M21 16C14 4 3 2.5 3 11C3 18 10 21 21 19Z', P.u)
  + shape('M21 19C12 20 6 26 9 31C12 35 18 30 21.5 22Z', mix(P.u, P.paper, 0.35))
  + dot(9.5, 11, 2.6, P.sun, OUT) + dot(12.5, 27.5, 1.6, P.sun, OUT)
  + line('M21.3 10C19.5 6 17.5 4.4 15.5 3.8', P.ink, 0.7) + dot(15.3, 3.7, 0.9, P.ink))
  + `<ellipse cx="22" cy="20" rx="1.9" ry="9.2" fill="${P.ink}"/>` + dot(22, 10.4, 2.1, P.ink);
const [STEM, LEAF] = [mix(P.i, P.ink, 0.25), mix(mix(P.i, P.muted, 0.5), P.paper, 0.15)];
// A mimosa leaf: pairs of leaflets swept towards the tip, shorter as they near it.
const frond = ([x1, y1, x2, y2]) => {
  const [dx, dy, deg] = [x2 - x1, y2 - y1, Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI];
  let out = line(`M${x1} ${y1}L${x2} ${y2}`, LEAF, 0.4);
  for (let t = 0.1; t < 0.97; t += 0.08) {
    const k = 1.1 * (1 - t * 0.5); // half the leaflet's length
    for (const turn of [55, -55]) {
      const a = (deg + turn) * Math.PI / 180;
      const [cx, cy] = [n(x1 + dx * t + Math.cos(a) * k), n(y1 + dy * t + Math.sin(a) * k)];
      out += `<ellipse cx="${cx}" cy="${cy}" rx="${n(k)}" ry="${n(0.38 * (1 - t * 0.3))}" `
        + `fill="${LEAF}" transform="rotate(${n(deg + turn)} ${cx} ${cy})"/>`;
    }
  }
  return out;
};
const drawings = {
  banda: () => svgDoc(210, BAND, shape(`M0 0H210V${BAND - 6}C190 ${BAND - 1} 172 ${BAND - 9} 150 `
    + `${BAND - 6}S102 ${BAND + 1} 76 ${BAND - 5} 28 ${BAND - 12} 0 ${BAND - 6}Z`, P.cream, '')),
  manzana: () => svgDoc(40, 40, apple()),
  mariposa: () => svgDoc(44, 36, butterfly()),
  mano: () => svgDoc(40, 30, g('rotate(-38 8.2 19.5)', box(6, 14, 4.4, 11, 2.2, SKIN))
    + [[12.2, 5, 14], [16.6, 3.4, 15.6], [21, 4.6, 14.4], [25.4, 7.4, 11.6]].map(([x, y, h]) =>
      box(x, y, 4.2, h, 2.1, SKIN)).join('') + box(11.6, 13, 17.8, 13.4, 5, SKIN)
    + line('M15 21.4C17.4 22.6 21 22.8 24 21.8', mix(SKIN, P.ink, 0.35), 0.6)
    + box(12.6, 25.6, 15.8, 4, 1.2, P.o)),
  mapa: () => svgDoc(40, 30, shape('M5 6L15 4L15 26L5 28Z', P.paper)
    + shape('M15 4L25 6L25 28L15 26Z', P.cream) + shape('M25 6L35 4L35 26L25 28Z', P.paper)
    + shape('M8 12C11 8 17 9 20 12S28 10 31 14C33 18 29 22 24 21S14 24 10 21C7 19 6 15 8 12Z',
      mix(P.i, P.paper, 0.5), '') + line('M6 25C12 21 18 26 24 23S31 19 34.4 21', P.o, 1)
    + line('M10 14C14 18 19 12 23 16S27 19 29 15', P.a, 0.9, ' stroke-dasharray="1.3 1.2"')
    + line('M27.8 13.2L31 16.4M31 13.2L27.8 16.4', P.a, 1.2)),
  mesa: () => svgDoc(40, 30, box(7, 15.6, 3, 12.4, 0.6, WOOD) + box(30, 15.6, 3, 12.4, 0.6, WOOD)
    + box(4, 12, 32, 3.6, 1.2, WOOD) + g('translate(9 1.2) scale(.27)', apple())
    + shape('M22.4 6.4H29.4L28.4 12H23.4Z', P.i) + line('M29 7.8C31.4 7.8 31.4 10.8 28.6 10.6',
      P.ink, 0.7)),
  mimosa: () => svgDoc(40, 30, line('M6 28.5C12 22 19 14 33 4', STEM, 1.1)
    + [[11.5, 22.5, 21, 27.3], [18.5, 15.5, 29, 19.5], [25.5, 9.8, 35.5, 12.5]].map(frond).join('')
    + [[12.5, 22, 6, 16.5], [18, 16, 13, 9.5], [24, 10.8, 20.5, 4.5]].map(([x1, y1, x2, y2]) =>
      line(`M${x1} ${y1}L${x2} ${y2}`, STEM, 0.6)).join('')
    + [[5.5, 17], [8.5, 20.5], [12, 10.5], [15.5, 13], [19.5, 5], [23, 7.5], [32, 4.5], [28.5, 7]]
      .flatMap(([x, y]) => [[0, 0], [2.1, 0.7], [-1.3, 1.7], [0.8, -1.9], [-1.9, -0.6]]
        .map(([dx, dy]) => dot(x + dx, y + dy, 1.25, P.sun, ` stroke="${mix(P.sun, P.e, 0.6)}" `
          + 'stroke-width=".35"'))).join('')),
  mono: () => svgDoc(40, 30, g('translate(20 15) scale(1.15) translate(-20 -15)', [9, 31]
    .map((x) => dot(x, 15, 4.2, BROWN, OUT)
    + dot(x, 15, 2.2, SKIN)).join('') + dot(20, 15, 10.5, BROWN, OUT)
    + shape('M20 11C17 7 11 8.5 11.5 14C12 20 15.5 24.5 20 24.5C24.5 24.5 28 20 28.5 14C29 8.5 '
      + '23 7 20 11Z', SKIN) + [16.5, 23.5].map((x) => dot(x, 14, 1.3, P.ink)
      + dot(x + 0.4, 13.6, 0.4, P.paper)).join('') + dot(19, 18.2, 0.5, P.ink)
    + dot(21, 18.2, 0.5, P.ink) + line('M16.5 20.2Q20 23.4 23.5 20.2', P.ink, 0.8))),
  muneca: () => svgDoc(40, 30, g('translate(20 15.4) scale(1.15) translate(-20 -17.5)', [13, 27]
    .map((x) => dot(x, 9, 3, BROWN, OUT)).join('')
    + mirror(40, shape('M9.6 6.2L12 7.6L9.8 9.4Z', P.a)) + line('M17 18.5L13.4 22.6', SKIN, 1.8)
    + line('M23 18.5L26.6 22.6', SKIN, 1.8) + box(16.6, 26, 2.4, 3, 0.6, SKIN)
    + box(21, 26, 2.4, 3, 0.6, SKIN) + shape('M20 15.6L12 27.2H28Z', P.u)
    + shape('M17.6 16.4H22.4L20 18.8Z', P.paper) + dot(20, 10, 6, SKIN, OUT)
    + shape('M14 9.4C14 3.8 26 3.8 26 9.4C23.2 7.4 16.8 7.4 14 9.4Z', BROWN)
    + dot(17.8, 10.6, 0.7, P.ink) + dot(22.2, 10.6, 0.7, P.ink)
    + dot(16.4, 12.4, 1, mix(P.a, P.paper, 0.55)) + dot(23.6, 12.4, 1, mix(P.a, P.paper, 0.55))
    + line('M18.8 13.2Q20 14.2 21.2 13.2', P.ink, 0.5))),
};
// The activity icons: a white glyph on an ink disc.
const icon = (glyph) => svgDoc(20, 20, dot(10, 10, 10, P.ink) + glyph);
Object.assign(drawings, {
  oreja: () => icon(line('M7.5 8.5C7.5 5 10 3.5 12.5 3.5C15.5 3.5 16.5 6 16.5 8C16.5 11 13.5 '
    + '11.5 13 14C12.5 16.5 10 17 8.5 15.5M10 8.5C10 7 11 6 12.5 6C13.8 6 14.3 7.2 14 8.3',
  P.paper, 1.5)),
  ojo: () => icon(line('M3.5 10Q10 3.5 16.5 10Q10 16.5 3.5 10Z', P.paper, 1.5)
    + dot(10, 10, 2.4, P.paper)),
  libro: () => icon(line('M10 6.5C7.5 5 5.5 5 4 5.8V14.8C5.5 14 7.5 14 10 15.5C12.5 14 14.5 14 '
    + '16 14.8V5.8C14.5 5 12.5 5 10 6.5ZM10 6.5V15.5', P.paper, 1.3)),
  lapiz: () => icon(line('M5.5 14.5L6.5 11L13.5 4L16 6.5L9 13.5ZM12 5.5L14.5 8', P.paper, 1.3)),
});
// Tracing: rows on writing guides, a model letter in ink, then dashed ones to go over.
const TRACE = { w: 170, first: 26, pitch: 20.5 }; // mm
const guides = (b) => line(`M0 ${b - 16}H${TRACE.w}M0 ${b}H${TRACE.w}`, P.rule, 0.4)
  + line(`M0 ${b - 8}H${TRACE.w}`, P.rule, 0.35, ' stroke-dasharray="1 1"');
// Letters as strokes: x-height 8, capitals 16, from the baseline b; [path, width].
const glyphs = {
  m: (x, b) => [`M${x} ${b - 8}V${b}M${x} ${b - 5.4}C${x} ${b - 7.4} ${x + 1.4} ${b - 8} `
    + `${x + 2.7} ${b - 8}S${x + 5.3} ${b - 7.2} ${x + 5.3} ${b - 5.4}V${b}M${x + 5.3} ${b - 5.4}`
    + `C${x + 5.3} ${b - 7.4} ${x + 6.7} ${b - 8} ${x + 8} ${b - 8}S${x + 10.6} ${b - 7.2} `
    + `${x + 10.6} ${b - 5.4}V${b}`, 10.6],
  M: (x, b) => [`M${x} ${b}V${b - 16}L${x + 6} ${b - 6}L${x + 12} ${b - 16}V${b}`, 12],
  a: (x, b) => [`M${x + 6.4} ${b - 4}A3.2 4 0 0 0 ${x} ${b - 4}A3.2 4 0 0 0 ${x + 6.4} ${b - 4}`
    + `M${x + 6.4} ${b - 8}V${b}`, 6.4],
  e: (x, b) => [`M${x + 0.2} ${b - 4}H${x + 6.8}C${x + 6.8} ${b - 6.4} ${x + 5.2} ${b - 8} `
    + `${x + 3.5} ${b - 8}S${x + 0.2} ${b - 6.2} ${x + 0.2} ${b - 4}S${x + 1.8} ${b} ${x + 3.7} `
    + `${b}C${x + 5} ${b} ${x + 6} ${b - 0.5} ${x + 6.7} ${b - 1.3}`, 6.8],
  i: (x, b) => [`M${x + 0.6} ${b - 8}V${b}M${x + 0.6} ${b - 11.4}V${b - 11}`, 1.2],
  o: (x, b) => [`M${x + 6.8} ${b - 4}A3.4 4 0 0 0 ${x} ${b - 4}A3.4 4 0 0 0 ${x + 6.8} ${b - 4}`,
    6.8],
  u: (x, b) => [`M${x} ${b - 8}V${b - 2.8}C${x} ${b - 1} ${x + 1.3} ${b} ${x + 3} ${b}S${x + 6.2} `
    + `${b - 1} ${x + 6.2} ${b - 2.8}M${x + 6.2} ${b - 8}V${b}`, 6.2],
};
const KERN = 1.8; // mm between letters
const write = (word, x, b) => word.split('').reduce(([d, at], ch) => {
  const [path, w] = glyphs[ch](at, b);
  return [d + path, at + w + KERN];
}, ['', x]); // [path, x after the last letter + KERN]
const dashed = ([d]) => line(d, P.muted, 1, ' stroke-dasharray="1.1 1"');
// The model: ink strokes, a teal dot where the pencil starts and an arrow beside the stem
// pointing the way the first stroke goes (dir 1 down, −1 up).
const model = (letter, b, [x, y], dir) => line(write(letter, 4, b)[0], P.ink, 1.3)
  + dot(x, y, 1.2, P.i) + line(`M${x - 2.4} ${y + dir * 1.5}V${y + dir * 6}`, P.i, 0.6)
  + shape(`M${x - 3.5} ${y + dir * 5.2}H${x - 1.3}L${x - 2.4} ${y + dir * 7.2}Z`, P.i, '');
const repeat = (letter, b) => Array.from({ length: 7 }, (_, k) =>
  dashed(write(letter, TRACE.first + k * TRACE.pitch, b))).join('');
// The five syllables, each centred in a fifth of the row.
const syllableRow = (b) => ['ma', 'me', 'mi', 'mo', 'mu'].map((syll, k) => {
  const w = write(syll, 0, b)[1] - KERN;
  return dashed(write(syll, (k + 0.5) * (TRACE.w / 5) - w / 2, b));
}).join('');
drawings.trazos = () => svgDoc(TRACE.w, 67, guides(17) + model('m', 17, [4, 9], 1)
  + repeat('m', 17) + guides(41) + model('M', 41, [4, 41], -1) + repeat('M', 41)
  + guides(65) + syllableRow(65));
const ALT = { banda: 'Franja de color crema con el borde ondulado',
  manzana: 'Una manzana roja con una hoja', mariposa: 'Una mariposa morada con manchas amarillas',
  mano: 'Una mano abierta', mapa: 'Un mapa plegado con un río y un camino hasta una cruz',
  mesa: 'Una mesa con una manzana y una taza', mono: 'La cara de un mono',
  mimosa: 'Una rama de mimosa con flores amarillas y hojas plumosas',
  muneca: 'Una muñeca con coletas y vestido morado',
  oreja: 'Una oreja', ojo: 'Un ojo', libro: 'Un libro abierto', lapiz: 'Un lápiz',
  trazos: 'Tres pautas: la eme minúscula y la mayúscula, cada una con un modelo y siete de puntos '
    + 'para repasar, y las sílabas ma, me, mi, mo y mu de puntos' };
// Each drawing is a resource that the opener, a heading style, a table cell or the text names
// by id. Sizes in px, 10 to the millimetre (the viewBox's own).
const size = (svg) => svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
const artwork = Object.entries(drawings).map(([id, draw]) => {
  const [width, height] = size(draw());
  return { id, typeId: 'lamina', kind: 'svg', altText: ALT[id], createdAt: 0, updatedAt: 0,
    svg: { fileId: `${id}.svg`, width, height }, ...(id === 'trazos' && here(id)) };
});
// #endregion

const resources = [...artwork, here('dibujos', { kind: 'table',
  table: { styleId: 'dibujos', model: grid } })];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Andika: ['400', '700'], DynaPuff: ['700'], 'Playpen Sans': ['400', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const text = syllables(markdown);
await Promise.all([loadFonts(FONTS, text), // every face before the build (gotcha: fonts-first)
  ...Object.entries(drawings).map(([id, draw]) => loadSvg(`${id}.svg`, draw()))]);
// Page 1 is page 37 of the book: a recto, as a unit opener is.
const continuation = { pageIndexOffset: 36, pageNumbering: { startAt: 37 } };
const doc = await buildWithFonts(() => buildDocument({ markdown: text, resources, continuation },
  config()), text);
showPages(doc, { title: 'Letra a letra · La eme' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
