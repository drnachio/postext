// ═══ Postext Cookbook · Nº 059 · Research poster on one big page ══════════════════
// https://postext.dev/en/cookbook/research-poster
// Code: MIT · Text and data: original, synthetic (CC BY 4.0) · Figures: generated in code
// Fonts: Rethink Sans, Bitter, Saira Condensed (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPage, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'research-poster';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: six colours for the poster, four for the heat map's key
const palette = {
  ink: '#102a2c', // text: a green-black
  paper: '#f7faf7', // the sheet, and type on the band
  canopy: '#2e7d4f', // the band, the stripes and titles of five panels, the tree crowns
  tint: '#e6f2ea', // the keyword strip, the park on the plan, lines of type on the band
  rule: '#bcd2c4', // buildings on the plan, the chart's grid
  muted: '#587068', // the notes under the figures, the axis titles inside them
  // The key of Figure 2, the air against the street mean at the same hour. The heat map's
  // cells and the :swatch runs of its key read the same four entries.
  cool: '#3b82c4', // −1.5 °C or less
  mist: '#a9c9e6', // −1.5 to 0 °C
  blush: '#f2b492', // 0 to +1.5 °C
  heat: '#d9572b', // +1.5 °C or more; also −4.2 °C, the Results panel, the loggers, the sun
};
// 1.4.1 designs paint the hex and ignore the paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // defaults link to 'main-color': point it at the canopy green
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'canopy (defaults)', value: { hex: palette.canopy, model: 'hex' } },
];
// #endregion

// #region sheet: one 600 × 800 mm page, laid out at 72 dpi
const SHEET = { width: 600, height: 800, margin: 25 }; // mm: a portrait board, 25 mm all round
const GAP = 12; // mm between the two body columns and between the three panel columns
// The summary's leading is the page's baseline grid: 56 lines fill the 750 mm between the
// margins, so a box floated to the foot of the page ends on the bottom margin.
const LEAD = (((SHEET.height - 2 * SHEET.margin) / 25.4) * 72) / 56; // 37.96 pt
const page = { width: mm(SHEET.width), height: mm(SHEET.height),
  // At 72 dpi a point is a pixel: the page is 1,701 × 2,268 px. The default 300 dpi would give
  // 7,087 × 9,449 px (268 MB of canvas) for the same line breaks.
  dpi: 72, backgroundColor: col('paper'),
  margins: { top: mm(SHEET.margin), bottom: mm(SHEET.margin), left: mm(SHEET.margin),
    right: mm(SHEET.margin) } }; // one sheet, nothing to mirror
// #endregion
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region band: the title band is the H1's design, filled from its attributes
const BAND = 158; // mm from the top edge to the foot of the green field
const type = (id, content, family, size, look, placement) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('paper'), align: 'left',
  overflow: 'wrap', // not an ellipsis (gotcha: overflow-ellipsis-default)
  lineHeight: 1.2, // a multiple of the size (gotcha: design-lineheight-multiple)
  ...look, placement });
const band = { enabled: true,
  // The field ends 133 mm under the top margin; eleven grid lines (147 mm) start the summary
  // 14 mm below it.
  minHeight: pt(11 * LEAD),
  slot: { elements: [
    { kind: 'box', id: 'field', style: { backgroundColor: col('canopy') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(BAND) } } },
    type('meeting', '{attr.meeting}', 'Saira Condensed', 22, { fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: pt(3.5), color: col('tint') },
    { ...at('page', 'top-left', SHEET.margin, 18), size: { width: mm(420) } }),
    type('title', '{titleText}', 'Bitter', 110, { fontWeight: 800, lineHeight: 1 },
      { ...at('#meeting', 'below', 0, 7), size: { width: mm(380) } }),
    type('authors', '{attr.authors}', 'Rethink Sans', 30, { fontWeight: 700 },
      { ...at('#title', 'below', 0, 7), size: { width: 'fill' } }),
    // Design text prints plain text, so the affiliation marks are the characters ¹ ² ³
    // (gotcha: design-text-no-inline-marks).
    type('affiliations', '{attr.affiliations}', 'Rethink Sans', 21, { color: col('tint') },
      { ...at('#authors', 'below', 0, 2), size: { width: 'fill' } }),
    type('number', '{attr.poster}', 'Saira Condensed', 30, { fontWeight: 700,
      color: col('canopy'), box: { backgroundColor: col('paper'),
        padding: { top: mm(1.5), right: mm(4), bottom: mm(1), left: mm(4) } } },
    at('page', 'top-right', -SHEET.margin, 15)),
    // The School of Geography's mark, drawn in code.
    { kind: 'image', id: 'mark', resourceId: 'mark',
      placement: { ...at('page', 'top-right', -SHEET.margin, 38), size: { width: mm(92) } } },
  ] } };
// #endregion

// #region answer: three columns of panels inside one box across the page
// The body text runs in two columns. Three columns exist only inside a box: a :::columns
// group in a callout, and span="page" lays that callout across both body columns.
//   :::callout{type="grid" span="page"}       ← one frameless box across the page
//   :::columns{count=3 breaks="3,4"}          ← panel 3 opens column 2, panel 4 column 3
//   :::callout{type="panel" title="Introduction"}   ← each panel is a box nested in it
//   …
//   :::                                       ← closes the panel; then the other panels
//   :::                                       ← closes the columns group
//   :::                                       ← closes the grid (gotcha: callout-columns)
const grid = { id: 'grid', backgroundEnabled: false, // no fill or frame; each panel has a stripe
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  columnGap: mm(GAP) };
// A nested box takes the width of its column and ignores span and placement (gotcha:
// nested-callout-limits). Its one device is a 6 pt stripe along the top.
const panel = { id: 'panel', backgroundEnabled: false,
  stripe: { enabled: true, side: 'top', width: pt(6), color: col('canopy') },
  padding: { top: mm(5), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { fontFamily: 'Saira Condensed', fontSize: pt(40), fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: pt(4), color: col('canopy'), gap: mm(4) },
  body: { fontSize: pt(22), lineHeight: pt(30) }, // the rest follows bodyText
  marginTop: mm(18) };
const results = { ...panel, id: 'results', // the finding: the same panel, striped in heat
  stripe: { ...panel.stripe, color: col('heat') },
  titleStyle: { ...panel.titleStyle, color: col('heat') } };
// #endregion

// #region type: paragraph styles for the figure, the references and the key; the foot strip
const paragraphStyles = [
  // Paragraph styles apply inside boxes, nested ones included. They have no weight in
  // 1.4.1, so the figure is written **bold**: that sets it in Bitter 700 and in boldColor.
  { id: 'stat', fontFamily: 'Bitter', fontSize: pt(150), lineHeight: pt(130),
    boldColor: col('heat') },
  { id: 'refs', fontSize: pt(19), lineHeight: pt(26), hangingIndent: mm(9), spaceBetween: pt(8) },
  { id: 'key', fontSize: pt(19), lineHeight: pt(28) }, // the key of Figure 2
];
const chipStyles = [{ id: 'keyword', background: col('paper'), borderColor: col('canopy'),
  borderWidth: pt(1.5), borderRadius: em(1), paddingX: em(0.55), paddingY: em(0.14),
  color: col('canopy'), bold: true, gap: em(0.35) }];
const strip = { id: 'strip', background: col('tint'), // one device: a tint
  padding: { top: mm(4), right: mm(8), bottom: mm(4), left: mm(8) }, columnGap: mm(GAP),
  body: { fontSize: pt(18), lineHeight: pt(24) } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, page,
  layout: { layoutType: 'double', gutterWidth: mm(GAP) },
  // The summary's type; the boxes take the family, the rag and the paragraph spacing from it.
  bodyText: { fontFamily: 'Rethink Sans', fontSize: pt(28), lineHeight: pt(LEAD),
    color: col('ink'), textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true,
    // Bold in the boxes and the :ref labels copy boldColor, and the italics of the references'
    // paragraph style take italicColor (gotcha: style-italic-colour); both are green otherwise.
    boldColor: col('ink'), italicColor: col('ink') },
  // The band draws the title, but 1.4.1 still measures the H1's own text: in Bitter, a face
  // already loaded, instead of the default Open Sans 700.
  headings: { fontFamily: 'Bitter', levels: [
    // Restated (gotcha: headings-drop-h1-break): a second poster in the file starts a page.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      marginBottom: pt(0), advancedDesign: band }] },
  calloutStyles: [grid, panel, results, strip],
  paragraphStyles, chipStyles, resourceTypes,
  captionStyle: { fontSize: pt(19), labelColor: col('canopy'), gap: mm(3),
    note: { fontSize: pt(17), color: col('muted') } },
  header: { elements: [] }, footer: { elements: [] }, // a poster has no running heads
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region figures: three drawings set inside their panels, numbered 1, 2, 3
// "Figure 1", not "Figure 1.1": the poster has no chapters.
const figureType = { ...defaultResourceTypes(LANG)[0], numberingTemplate: '{n}' };
const resourceTypes = [figureType];
const figure = (id, [width, height], caption, altText) => ({ id, typeId: figureType.id,
  kind: 'svg', svg: { fileId: `${id}.svg`, width: width * 10, height: height * 10 },
  placement: { position: 'here' }, // stays in its panel, where ::resource puts it; else floats
  caption, altText, note: t({ en: 'Synthetic data, generated for this poster.',
    es: 'Datos sintéticos, generados para este póster.' }), createdAt: 0, updatedAt: 0 });
// #endregion
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the synthetic survey, the plan, the heat map, the bars and the mark
function mulberry32(seed) { // a seeded PRNG: the same survey on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
// Sixteen 50 m blocks, west to east: the park's planes, houses, the Parade, new planting,
// old limes and the bus station. Canopy is the share of sidewalk under crowns, in %.
const CANOPY = [84, 78, 72, 66, 45, 31, 4, 0, 6, 9, 18, 27, 58, 74, 71, 12];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
// How much of the shade shows in the air at each hour: most at 14:00–15:00, reversed by 20:00.
const SUN = [0.3, 0.4, 0.55, 0.7, 0.85, 0.95, 1, 1, 0.95, 0.8, 0.55, 0.25, -0.1];
const SURVEY = (() => { // air: °C against the street mean at the hour; surface: °C at 15:00
  const rand = mulberry32(25);
  // Six uniforms summed and scaled: close enough to a normal draw with a mean of 0 and an SD of 1.
  const noise = () => [...Array(6)].reduce((sum) => sum + rand(), -3) / Math.sqrt(0.5);
  const mean = CANOPY.reduce((a, b) => a + b) / CANOPY.length;
  return CANOPY.map((c) => ({ canopy: c,
    air: SUN.map((w) => (w * 6.2 * (mean - c)) / 100 + 0.22 * noise()),
    surface: 49.2 - 0.205 * c + 0.7 * noise() }));
})();
const CLASSES = [[0, 10], [10, 30], [30, 50], [50, 70], [70, 101]]; // canopy classes, %
const avg = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const surfaceOf = ([lo, hi]) => avg(SURVEY.filter((b) => b.canopy >= lo && b.canopy < hi)
  .map((b) => b.surface));
const classOf = (v) => (v <= -1.5 ? 'cool' : v < 0 ? 'mist' : v < 1.5 ? 'blush' : 'heat');
const f = (v) => +v.toFixed(2);
const X0 = 12; // mm: the left gutter of the plan and the heat map
const CELL = (175 - X0) / CANOPY.length; // mm per block: the plan and Figure 2 share columns
const cx = (i) => f(X0 + (i + 0.5) * CELL);
const label = (x, y, text, size, fill = palette.ink, anchor = 'middle', extra = '') =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="${anchor}" fill="${fill}"`
  + `${extra}>${text}</text>`;
const svg = (w, h, body, face) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${face}${body}</svg>`;
// An SVG drawn as an image cannot use the page's web fonts (gotcha: svg-no-webfonts), so
// each drawing carries its label face inline, as a data URL of the Fontsource file.
async function inlineFace(family, weight) {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}`
    + '-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `<style>@font-face{font-family:F;src:url(data:font/woff2;base64,${btoa(bin)}) `
    + `format('woff2')}text{font-family:F}</style>`;
}
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k

const FIG = { plan: [175, 62], heat: [175, 126], bars: [175, 83] }; // mm, at column width
const LABEL = 5.4; // mm: figure labels, about 15 pt

function planSvg(face) { // Figure 1: a schematic plan, west on the left
  const rand = mulberry32(1908); // seeded with the year the planes were planted
  const [W, H] = FIG.plan;
  const [NB, NS, ROAD, SS, SB] = [[11, 22], [22, 25], [25, 34], [34, 37], [37, 48]]; // y bands
  const SIDE = [4, 6, 10, 13]; // side streets east of these blocks (block index from 0)
  let out = `<rect x="${X0}" y="${ROAD[0]}" width="${W - X0}" height="${ROAD[1] - ROAD[0]}" `
    + `fill="${mix(palette.paper, palette.ink, 0.16)}"/>`;
  for (let x = X0 + 2; x < W - 2; x += 6) { // the centre line
    out += `<path d="M${f(x)} 29.5h3" stroke="${palette.paper}" stroke-width="0.4"/>`;
  }
  CANOPY.forEach((c, i) => { // the frontages: houses, the park, the shops
    const x = X0 + i * CELL;
    const w = SIDE.includes(i) ? CELL - 3.2 : CELL;
    if (i < 3) {
      out += `<rect x="${f(x)}" y="${NB[0] - 2}" width="${f(w)}" height="${NB[1] - NB[0] + 2}" `
        + `fill="${palette.tint}"/>`;
    } else {
      const fill = i >= 6 && i <= 9 ? mix(palette.rule, palette.ink, 0.3) : palette.rule;
      for (const [y0, y1] of [NB, SB]) {
        const cut = rand() * 0.3 + 0.35;
        out += `<rect x="${f(x + 0.4)}" y="${y0}" width="${f(w * cut - 0.8)}" height="${y1 - y0}"`
          + ` fill="${fill}"/><rect x="${f(x + w * cut + 0.4)}" y="${y0}" `
          + `width="${f(w * (1 - cut) - 0.8)}" height="${y1 - y0}" fill="${fill}"/>`;
      }
    }
  });
  out += `<rect x="${f(X0)}" y="${SB[0]}" width="${f(3 * CELL - 0.8)}" height="${SB[1] - SB[0]}" `
    + `fill="${palette.rule}"/>`; // houses face the park across the road
  CANOPY.forEach((c, i) => { // crowns along both sidewalks, as many as the canopy share
    const n = Math.round((c / 100) * 3.6);
    // Under 14 % the share rounds to no crown: such a block gets one tree on the south side.
    const rows = n > 0 ? [[NS, n], [SS, n]] : c > 0 ? [[SS, 1]] : [];
    for (const [[y0, y1], count] of rows) {
      for (let k = 0; k < count; k++) {
        const x = X0 + i * CELL + ((k + 0.5) / count) * CELL + (rand() - 0.5) * 1.2;
        const r = 2 + (c / 100) * 1.3 + rand() * 0.5; // the old planes have the widest crowns
        out += `<circle cx="${f(x)}" cy="${f((y0 + y1) / 2)}" r="${f(r)}" fill="${palette.canopy}"`
          + ` fill-opacity="0.85" stroke="${palette.paper}" stroke-width="0.3"/>`;
      }
    }
    if (i < 3) { // the park's own trees
      for (let k = 0; k < 4; k++) {
        out += `<circle cx="${f(X0 + i * CELL + 2 + rand() * (CELL - 4))}" `
          + `cy="${f(NB[0] + 1 + rand() * 7)}" r="${f(1.8 + rand())}" fill="${palette.canopy}" `
          + 'fill-opacity="0.55"/>';
      }
    }
  });
  CANOPY.forEach((c, i) => { // the loggers, on the north kerb, one per block
    out += `<circle cx="${cx(i)}" cy="${NS[1]}" r="1.4" fill="${palette.heat}" `
      + `stroke="${palette.ink}" stroke-width="0.35"/>` + label(cx(i), 55, i + 1, LABEL);
  });
  const names = t({ en: ['ASHBY PARK', 'THE PARADE', 'BUS STATION'],
    es: ['PARQUE DE LA ALAMEDA', 'TRAMO COMERCIAL', 'ESTACIÓN DE AUTOBUSES'] });
  const track = ' letter-spacing="0.4"';
  out += label(X0, 6.5, names[0], LABEL - 0.6, palette.canopy, 'start', track)
    + label(X0 + 8 * CELL, 6.5, names[1], LABEL - 0.6, palette.ink, 'middle', track)
    + label(W, 6.5, names[2], LABEL - 0.6, palette.ink, 'end', track);
  // The north arrow in the gutter: a line and a triangle.
  out += `<path d="M5 27V18" stroke="${palette.ink}" stroke-width="0.7"/>`
    + `<path d="M5 13l2.6 5.4h-5.2z" fill="${palette.ink}"/>` + label(5, 34, 'N', LABEL);
  const bar = 2 * CELL; // 100 m: two blocks
  out += `<path d="M${X0} 60.6h${f(bar)}" stroke="${palette.ink}" stroke-width="0.9"/>`
    + label(X0 + bar + 2, 61.8, '100 m', LABEL - 0.6, palette.ink, 'start');
  return svg(W, H, out, face);
}

function heatSvg(face) { // Figure 2: canopy bars over an hour × block heat map
  const [W, H] = FIG.heat;
  const [BASE, TOP, ROW] = [27, 30, 6.2]; // mm: foot of the bars, top of the grid, row height
  let out = '';
  SURVEY.forEach((b, i) => {
    const h = (b.canopy / 100) * 18;
    out += `<rect x="${f(X0 + i * CELL + 1.6)}" y="${f(BASE - h)}" width="${f(CELL - 3.2)}" `
      + `height="${f(h)}" fill="${palette.canopy}"/>`
      + label(cx(i), f(BASE - h - 1.6), b.canopy, LABEL - 0.8);
    b.air.forEach((v, r) => {
      out += `<rect x="${f(X0 + i * CELL + 0.3)}" y="${f(TOP + r * ROW + 0.3)}" `
        + `width="${f(CELL - 0.6)}" height="${f(ROW - 0.6)}" fill="${palette[classOf(v)]}"/>`;
    });
    out += label(cx(i), TOP + HOURS.length * ROW + 6.5, i + 1, LABEL);
  });
  out += `<path d="M${X0} ${BASE + 0.2}H${W}" stroke="${palette.ink}" stroke-width="0.4"/>`
    + label(X0 - 1.5, BASE - 7, '%', LABEL, palette.ink, 'end'); // level with the bars
  HOURS.forEach((hour, r) => {
    if (hour % 2 === 0) {
      out += label(X0 - 1.5, TOP + r * ROW + 5, String(hour).padStart(2, '0'), LABEL,
        palette.ink, 'end');
    }
  });
  const track = ' letter-spacing="0.4"';
  const [west, east, hour] = t({ en: ['WEST', 'EAST', 'HOUR'], es: ['OESTE', 'ESTE', 'HORA'] });
  const mid = f(TOP + (HOURS.length * ROW) / 2); // the hour axis's title runs up the gutter
  out += label(X0, H - 0.5, west, LABEL - 1, palette.muted, 'start', track)
    + label(W, H - 0.5, east, LABEL - 1, palette.muted, 'end', track)
    + label(0, 0, hour, LABEL - 1, palette.muted, 'middle',
      `${track} transform="translate(3.4 ${mid}) rotate(-90)"`);
  return svg(W, H, out, face);
}

function barsSvg(face) { // Figure 3: how much cooler the paving was, by canopy class
  const [W, H] = FIG.bars;
  const [LEFT, ROW, SCALE] = [40, 13, 7.6]; // SCALE: mm per °C
  const names = t({ en: ['under 10 %', '10–30 %', '30–50 %', '50–70 %', '70 % or more'],
    es: ['menos del 10 %', '10–30 %', '30–50 %', '50–70 %', '70 % o más'] });
  const base = surfaceOf(CLASSES[0]); // the paving under 10 % canopy: the zero of the scale
  const num = (v) => t({ en: v.toFixed(1), es: v.toFixed(1).replace('.', ',') });
  const foot = 5 * ROW + 2;
  let out = '';
  for (const step of [5, 10, 15]) {
    out += `<path d="M${LEFT + step * SCALE} 1V${foot}" stroke="${palette.rule}" `
      + 'stroke-width="0.35"/>' + label(LEFT + step * SCALE, foot + 6.5, step, LABEL);
  }
  CLASSES.forEach((cls, i) => {
    const cooler = base - surfaceOf(cls);
    const y = 1 + i * ROW;
    const fill = mix(palette.tint, palette.canopy, 0.3 + 0.7 * (i / 4));
    out += label(LEFT - 3, y + 8.3, names[i], LABEL, palette.ink, 'end');
    if (i === 0) out += label(LEFT + 2, y + 8.3, `${num(base)} °C`, LABEL, palette.muted, 'start');
    else {
      out += `<rect x="${LEFT}" y="${y + 1.2}" width="${f(cooler * SCALE)}" height="${ROW - 2.4}" `
        + `fill="${fill}"/>` + label(LEFT + cooler * SCALE + 2, y + 8.3, num(cooler), LABEL,
        palette.ink, 'start');
    }
  });
  const axis = t({ en: '°C cooler than the blocks under 10 %',
    es: '°C por debajo de las manzanas de menos del 10 %' });
  out += `<path d="M${LEFT} 0V${foot + 1}" stroke="${palette.ink}" stroke-width="0.6"/>`
    + label(LEFT, foot + 6.5, '0', LABEL)
    + label(LEFT + 7.5 * SCALE, foot + 14, axis, LABEL, palette.muted, 'middle');
  return svg(W, H, out, face);
}

function markSvg() { // the School of Geography's mark: a crown shading a street, in a ring
  const shade = mix(palette.canopy, palette.ink, 0.45);
  return svg(10, 10, '<g transform="scale(0.1)">'
    + `<circle cx="50" cy="50" r="46" fill="none" stroke="${palette.paper}" stroke-width="3.2"/>`
    + `<circle cx="70" cy="25" r="8" fill="${palette.heat}"/>` // the sun, behind the crown
    + `<ellipse cx="43" cy="71" rx="23" ry="4.5" fill="${shade}"/>` // its shade on the paving
    + `<rect x="47" y="48" width="6" height="23" fill="${palette.paper}"/>`
    + `<circle cx="50" cy="37" r="17" fill="${palette.paper}"/>`
    + `<circle cx="35" cy="46" r="11" fill="${palette.paper}"/>`
    + `<circle cx="65" cy="46" r="11" fill="${palette.paper}"/>`
    + `<path d="M17 71H83" stroke="${palette.paper}" stroke-width="3.2"/></g>`, '');
}
// #endregion

const resources = [
  figure('plan', FIG.plan, t({
    en: 'Ashby Road, schematic plan: crowns from the canopy survey and the 16 loggers '
      + '(orange). Widths across the street are not to scale.',
    es: 'La avenida en plano esquemático: las copas del inventario de arbolado y los 16 '
      + 'registradores (naranja). Los anchos transversales no están a escala.' }), t({
    en: 'Plan of a straight street in 16 numbered blocks, with a park at the west end, tree '
      + 'crowns along both sidewalks and one tree or none on each of blocks 7 to 10.',
    es: 'Plano de una calle recta en 16 manzanas numeradas, con un parque en el extremo oeste, '
      + 'copas en las dos aceras y un árbol o ninguno en cada una de las manzanas 7 a 10.' })),
  figure('heat', FIG.heat, t({
    en: 'Canopy cover per block (bars, %) and the air at head height against the street mean '
      + 'at the same hour, from 08:00 to 20:00; mean of 14 afternoons.',
    es: 'Copa por manzana (barras, %) y aire a la altura de la cabeza respecto a la media de '
      + 'la calle a esa hora, de 08:00 a 20:00; media de 14 tardes.' }), t({
    en: 'Bar chart of canopy cover for 16 blocks above a grid of coloured cells, hours down '
      + 'and blocks across: blue under the tree-lined blocks in the afternoon, orange along '
      + 'blocks 7 to 10.',
    es: 'Barras de cobertura de copa de 16 manzanas sobre una cuadrícula de celdas de color, '
      + 'horas hacia abajo y manzanas en horizontal: azul bajo las manzanas arboladas por la '
      + 'tarde, naranja en las manzanas 7 a 10.' })),
  figure('bars', FIG.bars, t({
    en: 'The paving at 15:00 by canopy class, as the difference from the blocks under 10 %.',
    es: 'El pavimento a las 15:00 por clase de copa, como diferencia con las manzanas de '
      + 'menos del 10 %.' }), t({
    en: 'Horizontal bars that grow with the canopy class, from 2.7 to 15.0 °C cooler.',
    es: 'Barras horizontales que crecen con la clase de copa, de 2,7 a 15,0 °C menos.' })),
  // Not cited in the text: only the band's design draws it.
  { id: 'mark', typeId: figureType.id, kind: 'svg', svg: { fileId: 'mark.svg', width: 100,
    height: 100 }, altText: t({ en: 'The mark of the School of Geography',
    es: 'La marca del Departamento de Geografía' }), createdAt: 0, updatedAt: 0 },
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  'Rethink Sans': ['400', '400i', '700'],
  Bitter: ['400', '700', '800'], // 400: the stat style's base face, which the build measures
  'Saira Condensed': ['600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const face = await inlineFace('Saira Condensed', 600);
await Promise.all([loadSvg('plan.svg', planSvg(face)), loadSvg('heat.svg', heatSvg(face)),
  loadSvg('bars.svg', barsSvg(face)), loadSvg('mark.svg', markSvg())]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Research poster', es: 'Póster científico' }) });
// The e-poster: renderPage paints the page at its own size, 1,701 × 2,268 px at 72 dpi.
const png = Object.assign(document.createElement('a'), { download: `${RECIPE}.png`,
  textContent: t({ en: 'E-poster PNG', es: 'PNG del póster digital' }) });
renderPage(doc.pages[0], doc).toBlob((blob) => { png.href = URL.createObjectURL(blob); });
document.getElementById('pt-actions').append(png);

// @kit
