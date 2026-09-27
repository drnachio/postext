// ═══ Postext Cookbook · Nº 042 · Community newsletter: lead story and briefs ═════
// https://postext.dev/en/cookbook/community-newsletter
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Work Sans, Titan One, Courier Prime (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'community-newsletter';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: garden colours, every one linked by id
// ink: text · leaf: nameplate and headlines · tomato, the accent: tags, tab, column heads ·
// straw: the band · marigold: second tag · tint: the box · rule: hairlines · muted: notes
const palette = { ink: '#1d211c', leaf: '#2f6b3a', tomato: '#c43f2a', straw: '#f2d492',
  marigold: '#e2b33c', tint: '#eef4e8', rule: '#cfd3c6', muted: '#5f6659', paper: '#fbfaf5' };
// The hex rides along: 1.4.1 designs read it, not the link (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // defaults link to 'main-color': point it at the leaf, never blue
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'leaf (defaults)', value: { hex: palette.leaf, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Work Sans', 'Titan One', 'Courier Prime'];
const SIDE = 16; // mm: the side margins of one A4 sheet, printed on both sides
const LEAD = 13.4; // body leading in pt: the baseline grid
const caps = (size, colour) => ({ fontFamily: LABEL, fontSize: pt(size), fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: pt(size * 0.12), color: col(colour) });
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: a wide column for the lead, a narrow one for the briefs, one flow
const layout = {
  layoutType: 'oneAndHalf', // the narrow column sits on the right and takes text (the
  // defaults of sideColumnSide and sideColumnRole; 'floats' would keep text out of it)
  sideColumnPercent: 32, // 57 mm of the 178 mm measure
  gutterWidth: mm(8), // the wide column keeps the other 113 mm
  columnRule: { enabled: true, color: col('rule') }, // a 0.5 pt hairline in the gutter
};
// The text runs down the wide column, then the narrow one, then the next page's wide
// column. A :::columnbreak sends the next block on to the following column, so the
// Markdown decides what each column holds:
//   ## Shared compost bays open by the top gate      ← the lead, in the wide column
//   … :chip[Continued on page 2]{style="jump"}
//   :::columnbreak                                    ← the briefs open the narrow column
//   ## In brief {style="rail"}
//   …
//   :::columnbreak                                    ← from the last column: next page
//   :chip[Continued from page 1]{style="jump"}        ← the lead goes on in the wide column
// Fit the copy so that each column ends on a whole paragraph: in 1.4.1 a paragraph that
// runs over into the other column keeps the measure it started with (gotcha:
// split-paragraph-measure).
// #endregion

// #region masthead: the H1 is the nameplate; the issue tab reads the frontmatter
const BEARING = 0.6; // mm: Titan One's left side bearing at 60 pt (T 0.42, G 0.63, L/H 0.85)
const DRILL = { id: 'drill', typeId: 'drawing', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'drill.svg', width: 2100, height: 80 } }; // drawn by the design, not the text
const masthead = { enabled: true,
  minHeight: pt(10 * LEAD), // ten grid lines: the text starts one line clear of the band
  slot: { elements: [
    // The band, 62 mm deep, covers the column rule, which 1.4.1 starts at the top of the text
    // area on this page, behind the masthead, however deep the masthead is.
    { kind: 'box', id: 'band', style: { backgroundColor: col('straw') },
      placement: { ...at('page', 'top-left'), size: { width: mm(210), height: mm(62) } } },
    { kind: 'image', id: 'drill', resourceId: 'drill', // seedlings along the band's foot
      placement: { ...at('page', 'top-left', 0, 54), size: { width: mm(210), height: mm(8) } } },
    { kind: 'text', id: 'society', content: '{subtitle}', ...caps(8, 'leaf'), align: 'left',
      placement: { ...at('page', 'top-left', SIDE, 12), size: { width: mm(150) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(60),
      lineHeight: 0.9, // a multiple of the size (gotcha: design-lineheight-multiple)
      color: col('leaf'), align: 'left', overflow: 'wrap', // two lines in 178 mm
      placement: { ...at('page', 'top-left', SIDE - BEARING, 17), size: { width: mm(178) } } },
    // {attr.issue} comes from the H1 line, {publishDate} from the quoted frontmatter
    // (gotcha: quote-frontmatter): an unquoted date prints nothing here.
    { kind: 'text', id: 'tab', content: '{attr.issue} · {publishDate}', ...caps(9, 'paper'),
      align: 'right', box: { backgroundColor: col('tomato'),
        padding: { top: mm(1.8), right: mm(3.2), bottom: mm(1.6), left: mm(3.2) } },
      placement: at('page', 'top-right', -SIDE, 44) },
  ] } };
// #endregion

// #region tags: four chip styles replace the built-in pale-blue chip
const chip = (id, look) => ({ id, fontFamily: LABEL, bold: true,
  fontSize: pt(7.7), // in points: em(0.82) is 7.7 pt in the text, 6.6 pt on the 8 pt jump lines
  borderWidth: pt(0), borderRadius: em(1), // a radius past half the height draws a pill
  paddingX: em(0.5), paddingY: em(0.14), ...look }); // em: of the chip's own size
const chipStyles = [
  chip('tag', { background: col('tomato'), color: col('paper') }), // the first is the default
  chip('free', { background: col('marigold'), color: col('ink') }),
  chip('when', { backgroundEnabled: false, borderWidth: pt(0.8), borderColor: col('leaf'),
    color: col('leaf') }),
  chip('jump', { background: col('straw'), color: col('ink') }),
];
// #endregion

// #region box: two columns inside a box set a paragraph beside its drawing
// Text never runs round a picture in a column (text wrap is a gap), but a :::columns group
// inside a box sets blocks side by side; breaks="2" opens column two at the second block:
//   :::callout{type="bed" title="Sixteen squares by the gate"}
//   :::columns{count=2 breaks="2"}
//   The demonstration bed by the gate is 1.2 metres square …   ← block 1
//   ::resource{id="bed"}                                        ← block 2
//   :::
//   :::                                   (gotcha: callout-columns)
const bedBox = { id: 'bed', background: col('tint'), // one device: a tint, no stripe
  padding: { top: mm(3.5), right: mm(4), bottom: mm(4), left: mm(4) }, columnGap: mm(5),
  titleStyle: { ...caps(8.5, 'leaf'), gap: mm(2.4) },
  body: { fontSize: pt(8.8), lineHeight: pt(12.4), paragraphSpacing: false } };
// #endregion

// #region band: a narrower figure still takes the whole band of its column
const drawing = (id, w, h, placement = {}) => ({ id, typeId: 'drawing', kind: 'svg',
  svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, // mm × 10: fitted to the column
  placement: { position: 'here', ...placement }, // drawn where ::resource{id} stands
  caption: CAPTIONS[id][0], note: CAPTIONS[id][1], altText: CAPTIONS[id][2],
  createdAt: 0, updatedAt: 0 });
// width is a fraction of the column and align where the figure sits in it: the text above
// and below never moves into the white either side.
const HEAT = { width: 0.62, align: 'center' };
const resources = () => [drawing('plan', 114, 56.5), drawing('heat', 68, 40, HEAT),
  drawing('bed', 50, 50), DRILL];
// Newsletter drawings carry no "Figure 1": an empty prefix prints no label.
const resourceTypes = [{ id: 'drawing', name: 'Drawing', shortLabel: 'Drawing',
  captionPrefix: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal' }];
// #endregion

const head = (id, content, edge, x, y, look) => ({ kind: 'text', id, content, pages: 'body',
  align: edge.slice(4), placement: at('page', edge, x, y), ...look });
const folio = { elements: [ // page 2's head: title and date over a hairline, the folio right
  head('name', '{title} · {publishDate}', 'top-left', SIDE, 11, caps(7.5, 'leaf')),
  head('folio', '{pageNumber}', 'top-right', -SIDE, 9.6,
    { fontFamily: DISPLAY, fontSize: pt(12), color: col('tomato') }),
  { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'), pages: 'body',
    placement: { ...at('page', 'top-left', SIDE, 15.5), size: { width: mm(210 - 2 * SIDE) } } },
] };

const label = (size, look = {}) => ({ fontFamily: LABEL, fontSize: pt(size), ...look });
const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, resourceTypes, chipStyles, layout, calloutStyles: [bedBox],
  page: { width: mm(210), height: mm(297), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(20), bottom: mm(18), left: mm(SIDE), right: mm(SIDE) } },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    referenceColor: col('leaf'), // for a :ref label: the palette reaches bold but not this
    // colour, which would stay the default blue (gotcha: palette-skips-designs)
    // Ragged: no hyphens, no runt check (gotchas: ragged-no-hyphenation, ragged-runts)
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('leaf'), levels: [
    // Restated (gotcha: headings-drop-h1-break); span: 'page' sets the masthead over both columns
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(24), lineHeight: pt(2 * LEAD), marginTop: pt(0),
      marginBottom: pt(LEAD / 2) },
    { level: 3, fontFamily: TEXT, fontWeight: 700, fontSize: pt(10.2), lineHeight: pt(LEAD),
      color: col('ink'), marginTop: pt(LEAD), marginBottom: pt(0) }, // a brief's name
    { level: 4, ...caps(8.5, 'tomato'), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) }, // a notice's name
  ] },
  headingStyles: [
    // marginBottom 0: the level's 0.5 em is added under minHeight and would drop the text a line
    { id: 'masthead', marginBottom: pt(0), advancedDesign: masthead },
    { id: 'rail', fontSize: pt(17), lineHeight: pt(2 * LEAD), color: col('tomato') },
    { id: 'jump', fontSize: pt(19), lineHeight: pt(1.5 * LEAD), marginTop: pt(LEAD / 2) },
  ],
  paragraphStyles: [
    { id: 'standfirst', fontSize: pt(12), lineHeight: pt(16) },
    { id: 'byline', ...label(8, { color: col('muted'), marginBottom: pt(LEAD / 2) }) },
    { id: 'jump', ...label(8, { textAlign: 'right' }) }, // 'Continued on page 2'
    { id: 'from', ...label(8) }, // 'Continued from page 1'
    { id: 'colophon', ...label(7, { lineHeight: pt(9.4), color: col('muted'),
      marginTop: pt(LEAD) }) },
  ],
  captionStyle: { fontFamily: TEXT, fontSize: pt(8), color: col('ink'), gap: mm(1.6),
    note: { fontFamily: LABEL, fontSize: pt(6.8), color: col('muted') } },
  header: folio,
  footer: { elements: [] }, // the folio is at the head of page 2; page 1 has the masthead
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the site plan, the heap's temperature and the square-metre bed
function mulberry32(seed) { // a seeded PRNG: the same plots on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k
const f = (v) => +v.toFixed(2);
const P = palette;
const SOIL = mix(P.tomato, P.ink, 0.62);
const EARTH = mix(SOIL, P.straw, 0.28);
const GRASS = mix(P.tint, P.leaf, 0.3);
const DEEP = mix(P.leaf, P.ink, 0.35);
const svgOf = (w, h, body, style = '') => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w * 10}" height="${h * 10}" viewBox="0 0 ${w} ${h}">${style}${body}</svg>`;
const dot = (x, y, r, fill) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" `
  + `height="${f(h)}" fill="${fill}"${extra}/>`;
const line = (x1, y1, x2, y2, stroke, width) => `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" `
  + `stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;

// One plot seen from above: rows of crops across it, sometimes a shed or a greenhouse.
function plot(x, y, w, h, rand, extra) {
  let out = rect(x, y, w, h, EARTH);
  const strips = 2 + Math.floor(rand() * 3);
  let top = y + 0.8;
  for (let s = 0; s < strips; s++) {
    const room = y + h - 0.8 - top;
    if (room < 2) break;
    let sh = s === strips - 1 ? room : Math.max(4, (h - 1.6) * (0.2 + rand() * 0.3));
    if (room - sh < 4) sh = room; // no strip thinner than 4 mm
    const kind = Math.floor(rand() * 6);
    const [x0, x1] = [x + 0.9, x + w - 0.9];
    if (kind === 0) { // rows of lettuce and onions
      for (let yy = top + 1; yy < top + sh - 0.6; yy += 1.7) {
        for (let xx = x0 + 0.6; xx < x1; xx += 1.5) out += dot(xx, yy, 0.55, P.leaf);
      }
    } else if (kind === 1) { // peas and beans up canes
      for (let yy = top + 1.2; yy < top + sh - 0.8; yy += 2.6) out += line(x0, yy, x1, yy, DEEP, 1);
    } else if (kind === 2) { // brassicas under netting
      out += rect(x0 - 0.3, top, x1 - x0 + 0.6, sh - 0.4, mix(P.tint, P.paper, 0.4));
      for (let yy = top + 1.6; yy < top + sh - 1.2; yy += 3) {
        for (let xx = x0 + 1.4; xx < x1 - 0.8; xx += 3) {
          out += dot(xx, yy, 1.1, mix(P.leaf, P.rule, 0.45));
        }
      }
    } else if (kind === 3) { // rhubarb and squashes
      for (let xx = x0 + 2; xx < x1 - 1; xx += 4 + rand() * 2) {
        const yy = top + sh / 2 + (rand() - 0.5) * (sh - 3);
        out += dot(xx, yy, 1.8, P.leaf) + dot(xx + 0.6, yy - 0.5, 0.45, P.marigold);
      }
    } else if (kind === 4) { // dug over and raked
      for (let yy = top + 0.7; yy < top + sh - 0.3; yy += 0.9) {
        out += line(x0, yy, x1, yy, SOIL, 0.25);
      }
    } else { // straw round the strawberries
      out += rect(x0 - 0.3, top, x1 - x0 + 0.6, sh - 0.4, P.straw);
      for (let xx = x0 + 1; xx < x1; xx += 2.2) {
        out += dot(xx, top + sh / 2 - 0.2, 0.8, P.leaf)
          + dot(xx + 0.4, top + sh / 2 + 0.3, 0.3, P.tomato);
      }
    }
    top += sh;
  }
  if (extra === 'shed') { // a shed with its felt roof in tomato, and a water butt
    const sx = rand() < 0.5 ? x + 0.6 : x + w - 5.1;
    out += rect(sx, y + 0.6, 4.5, 3.4, P.tomato) + line(sx, y + 2.3, sx + 4.5, y + 2.3, SOIL, 0.3)
      + dot(sx + (sx > x + 1 ? -1.3 : 5.8), y + 1.6, 0.9, P.ink);
  } else if (extra === 'glass') { // a greenhouse: glass over the whole end of the plot
    out += rect(x + 0.8, y + h - 7.2, w - 1.6, 6.4, mix(P.paper, P.tint, 0.6))
      + [0.25, 0.5, 0.75].map((k) => line(x + 0.8 + k * (w - 1.6), y + h - 7.2,
        x + 0.8 + k * (w - 1.6), y + h - 0.8, P.rule, 0.3)).join('');
  }
  return out;
}

function planSvg(face) { // 114 × 56.5 mm: the top of the Wren Lane site, north up
  const rand = mulberry32(1921); // the year the society took the lease
  const [W, H, PATH] = [114, 56.5, 26.5];
  const label = (lx, ly, s, fill, anchor = 'start') => `<text x="${lx}" y="${ly}" `
    + `font-size="2.3" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
  let out = rect(0, 0, W, H, GRASS) + rect(0, PATH, W, 4.5, P.straw); // the main path, gravel
  out += label(W - 2, PATH + 3, t({ en: 'MAIN PATH', es: 'CAMINO' }), SOIL, 'end');
  // The top gate at the end of the path, and the corner behind it.
  out += rect(0, PATH - 0.8, 1.2, 1.2, P.ink) + rect(0, PATH + 4.1, 1.2, 1.2, P.ink)
    + label(2.2, PATH + 3, t({ en: 'TOP GATE', es: 'PUERTA DE ARRIBA' }), SOIL);
  out += rect(2, 2.4, 11, 8, P.tomato) + rect(2, 6.4, 11, 4, mix(P.tomato, P.ink, 0.22)) // the hut
    + label(7.5, 7.2, t({ en: 'HUT', es: 'CASETA' }), P.paper, 'middle');
  out += rect(15.5, 3.2, 11.5, 3.6, mix(P.rule, P.ink, 0.3)) // the trough
    + rect(16.1, 3.8, 10.3, 2.4, mix(P.tint, P.rule, 0.4));
  for (let i = 0; i < 3; i++) { // the three bays in fresh boards: full, half full, empty
    const bx = 2 + i * 8.6;
    out += rect(bx, 13.5, 7.8, 7.8, P.marigold) + rect(bx + 0.8, 14.3, 6.2, 6.2, SOIL);
    for (let k = 0; k < 16 - i * 7; k++) {
      out += dot(bx + 1.5 + rand() * 4.8, 15 + rand() * 4.8, 0.5, i === 0 ? DEEP : EARTH);
    }
    out += label(bx + 3.9, 24.6, i + 1, P.ink, 'middle');
  }
  out += dot(25.5, 10.5, 3.6, DEEP); // the old pear
  // Plots: four above the path, five below; one split in halves, grass paths between.
  const row = (x0, x1, y, h, n, extras) => {
    const w = (x1 - x0 - (n - 1) * 1.4) / n;
    for (let i = 0; i < n; i++) {
      const px = x0 + i * (w + 1.4);
      if (extras[i] === 'halves') {
        const half = (h - 1.4) / 2;
        out += plot(px, y, w, half, rand) + plot(px, y + half + 1.4, w, half, rand, 'shed');
      } else out += plot(px, y, w, h, rand, extras[i]);
    }
  };
  row(31, W - 2, 2, PATH - 3.5, 4, ['shed', 'halves', '', 'shed']);
  row(2, W - 2, PATH + 6.5, H - PATH - 8.5, 5, ['', 'shed', 'glass', '', 'shed']);
  return svgOf(W, H, out, face);
}
// An SVG drawn as an image cannot see the page's web fonts (gotcha: svg-no-webfonts), so the
// chart carries its label face inline, as a data URL of the Fontsource file.
async function inlineFace(family, weight) {
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${weight}`
    + '-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `<style>@font-face{font-family:L;src:url(data:font/woff2;base64,${btoa(bin)}) `
    + `format('woff2')}text{font-family:L;font-weight:700}</style>`;
}
const HEAT_LOG = [12, 24, 38, 49, 57, 63, 64, 62, 59, 55, 51, 47, 56, 61, 62, 60, 57, 54, 51, 48,
  46, 44]; // °C at the heap's centre, 7 to 28 March; turned after the reading on the 18th
function heatSvg(face) { // 68 × 40 mm; the plot runs 7–28 March and 0–70 °C
  const [W, H, X0, X1, Y0, Y1] = [68, 40, 9, 66, 3, 33];
  const x = (day) => X0 + ((day - 7) / 21) * (X1 - X0);
  const y = (deg) => Y1 - (deg / 70) * (Y1 - Y0);
  const text = (tx, ty, s, fill, anchor = 'end', size = 2.5) => `<text x="${f(tx)}" y="${f(ty)}" `
    + `font-size="${size}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
  let out = rect(X0, y(65), X1 - X0, y(55) - y(65), P.straw); // where weed seeds die
  for (const deg of [20, 40, 60]) {
    out += line(X0, y(deg), X1, y(deg), P.rule, 0.2) + text(X0 - 1.2, y(deg) + 0.9, deg, P.muted);
  }
  out += text(X0 - 1.2, y(70) + 0.9, '°C', P.muted); // the unit, over the scale
  for (const day of [7, 14, 21, 28]) {
    out += line(x(day), Y1, x(day), Y1 + 1, P.ink, 0.25)
      + text(x(day), Y1 + 3.8, day === 28 ? t({ en: '28 March', es: '28 marzo' }) : day, P.muted,
        day === 28 ? 'end' : 'middle');
  }
  out += line(x(18.5), y(70), x(18.5), Y1, P.leaf, 0.35)
    + text(x(18.5) + 1, y(70) + 2.2, t({ en: 'turned', es: 'volteo' }), P.leaf, 'start');
  const pts = HEAT_LOG.map((deg, i) => [x(7 + i), y(deg)]);
  out += `<path d="M${pts.map(([px, py]) => `${f(px)} ${f(py)}`).join('L')}" fill="none" `
    + `stroke="${P.tomato}" stroke-width="0.55" stroke-linejoin="round"/>`;
  out += pts.map(([px, py]) => dot(px, py, 0.6, P.tomato)).join('');
  out += line(X0, Y1, X1, Y1, P.ink, 0.3);
  return svgOf(W, H, out, face);
}

// The square-metre bed: sixteen squares of 30 cm, one to sixteen plants in each.
const CROPS = { // plants per square, size and colour of each plant seen from above
  cabbage: [1, 4.2, mix(P.leaf, P.rule, 0.35)], lettuce: [4, 2.1, mix(P.leaf, P.straw, 0.35)],
  chard: [4, 1.9, mix(P.leaf, P.tomato, 0.3)], marigold: [4, 1.5, P.marigold],
  beetroot: [9, 1.1, mix(P.tomato, P.ink, 0.35)], beans: [9, 1.2, P.leaf],
  onion: [9, 0.8, mix(P.straw, P.paper, 0.3)], radish: [16, 0.6, P.tomato],
  carrot: [16, 0.55, mix(P.marigold, P.tomato, 0.35)],
};
const BED = [['cabbage', 'lettuce', 'lettuce', 'marigold'],
  ['beetroot', 'radish', 'carrot', 'onion'], ['chard', 'beans', 'beetroot', 'radish'],
  ['marigold', 'onion', 'carrot', 'lettuce']];
function bedSvg() { // 50 × 50 mm: 1.2 m of bed inside its scaffold boards
  const [S, BOARD] = [50, 2.6];
  const cell = (S - 2 * BOARD) / 4;
  let out = rect(0, 0, S, S, P.marigold) + rect(BOARD, BOARD, S - 2 * BOARD, S - 2 * BOARD, SOIL);
  BED.forEach((cropRow, r) => cropRow.forEach((crop, c) => {
    const [n, size, fill] = CROPS[crop];
    const k = Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      const cx = BOARD + c * cell + ((i % k) + 0.5) * (cell / k);
      const cy = BOARD + r * cell + (Math.floor(i / k) + 0.5) * (cell / k);
      out += dot(cx, cy, size, fill);
      if (crop === 'marigold') out += dot(cx, cy, size * 0.4, P.tomato);
    }
  }));
  for (let i = 1; i < 4; i++) { // the strings
    const at = BOARD + i * cell;
    out += line(at, BOARD, at, S - BOARD, P.paper, 0.25)
      + line(BOARD, at, S - BOARD, at, P.paper, 0.25);
  }
  return svgOf(S, S, out);
}
// A drill of seedlings along the foot of the masthead band, 210 × 8 mm: some show only their
// seed leaves, the rest their first true leaves too.
function leaf(x, y, len, wid, deg, fill) { // a leaf from its stalk end, deg from the vertical
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.sin(a), -Math.cos(a)];
  const [mx, my, px, py] = [x + (dx * len) / 2, y + (dy * len) / 2, -dy * wid, dx * wid];
  return `<path d="M${f(x)} ${f(y)}Q${f(mx + px)} ${f(my + py)} ${f(x + dx * len)} `
    + `${f(y + dy * len)}Q${f(mx - px)} ${f(my - py)} ${f(x)} ${f(y)}Z" fill="${fill}"/>`;
}
function drillSvg() {
  const rand = mulberry32(47); // the issue number
  const [W, H, RIDGE] = [210, 8, 1.3];
  const SEED = mix(P.leaf, P.straw, 0.3);
  let out = rect(0, H - RIDGE, W, RIDGE, SOIL);
  for (let x = 2.6; x < W - 1; x += 4.6 + rand() * 1.2) {
    const ground = H - RIDGE;
    const grown = rand() < 0.62;
    const stem = grown ? 2.6 + rand() * 1.2 : 1.2 + rand() * 0.8;
    const lean = (rand() - 0.5) * 10;
    out += line(x, ground, x, ground - stem, P.leaf, 0.45);
    const top = ground - stem;
    if (grown) {
      out += leaf(x, ground - stem * 0.45, 1.6, 0.55, -68 + lean, SEED)
        + leaf(x, ground - stem * 0.45, 1.6, 0.55, 68 + lean, SEED)
        + leaf(x, top, 2.6 + rand() * 0.5, 1, -32 + lean, P.leaf)
        + leaf(x, top, 2.6 + rand() * 0.5, 1, 32 + lean, P.leaf);
    } else {
      out += leaf(x, top, 1.7, 0.6, -58 + lean, SEED) + leaf(x, top, 1.7, 0.6, 58 + lean, SEED);
    }
  }
  return svgOf(W, H, out);
}

// What the drawings say under them, in the sample's language: caption, credit note, alt text.
const CAPTIONS = {
  plan: [t({
    en: '**The top of the Wren Lane site, from the air.** The three new bays stand between '
      + 'the hut and the top gate.',
    es: '**La parte alta del Soto, desde el aire.** Los tres cajones nuevos están entre la '
      + 'caseta y la puerta de arriba.' }),
  t({ en: 'Drawing: The Gazette, from the society’s site plan',
    es: 'Dibujo: La Gaceta, a partir del plano de la asociación' }),
  t({ en: 'Plan of allotment plots seen from above, with three compost bays by the gate.',
    es: 'Plano de parcelas de huerto vistas desde arriba, con tres cajones de compost junto a la '
      + 'puerta.' })],
  heat: [t({
    en: '**Bay one in March.** Temperature at the centre of the heap, read at nine each '
      + 'morning. In the shaded band, 55 to 65 °C, most weed seeds die.',
    es: '**El cajón uno en marzo.** Temperatura en el centro, a las nueve. En la franja, de '
      + '55 a 65 °C, mueren casi todas las semillas de malas hierbas.' }),
  t({ en: 'Readings: the compost rota', es: 'Lecturas: el turno del compost' }),
  t({ en: 'Line chart: the heap rises from 12 °C to 64 °C in six days, cools to 47 °C, and '
      + 'climbs back to 62 °C after it is turned on 18 March.',
    es: 'Gráfico de líneas: el montón sube de 12 °C a 64 °C en seis días, baja a 47 °C y vuelve '
      + 'a 62 °C después del volteo del 18 de marzo.' })],
  bed: [t({
    en: '**What goes where.** One cabbage to a square; four lettuces, chard or marigolds; '
      + 'nine beetroot, beans or onions; sixteen radishes or carrots.',
    es: '**Cómo se planta el bancal.** Una col por cuadro; cuatro lechugas, acelgas o '
      + 'caléndulas; nueve remolachas, judías o cebollas; dieciséis rábanos o zanahorias.' }),
  t({ en: 'Drawing: The Gazette', es: 'Dibujo: La Gaceta' }),
  t({ en: 'A square bed divided by strings into sixteen squares, each planted with one to '
      + 'sixteen plants.', es: 'Un bancal cuadrado dividido con cuerdas en dieciséis cuadros, '
      + 'cada uno con entre una y dieciséis plantas.' })],
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Text, display and label faces, loaded before the build (gotcha: fonts-first).
const FONTS = {
  'Work Sans': ['400', '700'], 'Titan One': ['400'], 'Courier Prime': ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const face = await inlineFace(LABEL, 700); // the label face, for the drawings' own lettering
await Promise.all([loadSvg('plan.svg', planSvg(face)), loadSvg('heat.svg', heatSvg(face)),
  loadSvg('bed.svg', bedSvg()), loadSvg('drill.svg', drillSvg())]);
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources: resources() }, config()), markdown);
showPages(doc, { title: t({ en: 'Community newsletter', es: 'Boletín vecinal' }) });

// @kit
