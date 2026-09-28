// ═══ Postext Cookbook · Nº 068 · Photo essay with full-bleed plates ═══════════════
// https://postext.dev/en/cookbook/photo-essay-full-bleed
// Code: MIT · Text: original (CC BY 4.0) · Plates: drawn in code (CC BY 4.0)
// Fonts: Andada Pro, Syne, Syne Mono (SIL OFL 1.1) · Needs postext ≥ 1.8.0
// Sierra, a landscape photobook: one day in a mountain range in six plates, each on a page of
// its own and one across the gutter of a spread, with three short texts between them.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'photo-essay-full-bleed';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the paper between the plates, the ink and one rust for the labels
const palette = {
  ink: '#1c1f27', // text: the blue-black of the night plate
  paper: '#f3f0ea', // every page's ground: a pale stone, seen only between the plates
  accent: '#94462e', // the times over each text: the dusk plate's rust, dark enough for 8 pt
  muted: '#5f646d', // the running foot and the caption of the small plate
  white: '#fbfaf7', // type set on the plates
};
// Design elements read the hex, not the palette, in 1.4.1 (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const PAGE = { width: 280, height: 210 }; // a landscape photobook, in mm
const MARGIN = { top: 28, bottom: 24, inner: 40, outer: 140 }; // text pages: a 100 mm measure
const LEAD = 15; // body leading in pt
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region answer: the plates' heading styles, generated from a list
// '{attr.art}' is filled in per heading, so a plain plate names its picture on its line:
// # Noon {style="lamina" art="mediodia" …}. Only the cover and the last plate draw extras.
const PLATES = [ // the style id, its picture, the ink of its caption, anything extra it draws
  { id: 'alba', art: 'alba', extra: (colour) => cover(colour) }, // an arrow: cover() is below
  { id: 'lamina', art: '{attr.art}' }, // any plate on a page of its own
  { id: 'pliego', art: '{attr.art}', half: 'verso' }, // one picture across a spread:
  { id: 'pliego-recto', art: '{attr.art}', half: 'recto' }, // the left half, then the right
  { id: 'nieve', art: 'nieve', ink: 'ink', extra: (colour) => colophon(colour) },
];
const plate = ({ id, art, half, ink = 'white', extra = () => [] }) => ({
  id, span: 'page', // an opener: a span heading always starts a page of its own
  // The left half opens on an even page, a verso, so the right half faces it across the
  // gutter (gotcha: parity-page1-recto).
  ...(half === 'verso' && { breakBefore: { enabled: true, parity: 'even' } }),
  // No margins: the plate's column is the page, and minHeight fills it, so what follows starts
  // on the next page. Images reserve no room (gotcha: opener-image-no-reserve), and a minHeight
  // taller than the column is dropped whole (gotcha: opener-taller-than-column).
  margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) },
  advancedDesign: { enabled: true, minHeight: mm(PAGE.height), slot: { elements: [
    { kind: 'image', id: 'picture', resourceId: art, // the recto half is the same picture,
      placement: at('page', 'top-left', half === 'recto' ? -PAGE.width : 0, 0, // moved left
        { width: mm(half ? 2 * PAGE.width : PAGE.width), height: mm(PAGE.height) }) },
    ...(half === 'recto' ? [] : caption(col(ink))), ...extra(col(ink)),
  ] } },
});
// #endregion

// #region caption: the plate's numeral and hour, lower left, from the heading's attributes
const NUMERAL = { x: 16, y: PAGE.height - 21, size: 13 }; // mm from the top left; size in pt
// A design text's baseline sits 0.8 of its line box below its top: set a smaller label beside
// a larger one this much lower and the two share a baseline.
const dropTo = (big, small, lineHeight = 1.2) => (0.8 * lineHeight * (big - small) * 25.4) / 72;
const caption = (colour) => [
  { kind: 'text', id: 'numeral', content: '{attr.n}', fontFamily: 'Syne', fontWeight: 700,
    fontSize: pt(NUMERAL.size), color: colour, align: 'left',
    placement: at('page', 'top-left', NUMERAL.x, NUMERAL.y) },
  { kind: 'text', id: 'hour', content: '· {attr.hora}', fontFamily: 'Syne Mono', fontSize: pt(8),
    letterSpacing: pt(0.8), color: colour, align: 'left', // the dot: a lone I reads as a bar
    placement: at('#numeral', 'right-of', 1.6, dropTo(NUMERAL.size, 8)) },
];
// #endregion

// #region cover: the book's title reversed out of the dawn sky of the first plate
const cover = (colour) => [
  { kind: 'text', id: 'title', content: '{title}', fontFamily: 'Syne', fontWeight: 800,
    fontSize: pt(72), lineHeight: 1, letterSpacing: pt(6), textTransform: 'uppercase',
    color: colour, align: 'left', placement: at('page', 'top-left', 22, 26) },
  { kind: 'text', id: 'subtitle', content: '{subtitle}', fontFamily: 'Syne Mono',
    fontSize: pt(10), letterSpacing: pt(2), textTransform: 'uppercase', color: colour,
    align: 'left', placement: at('#title', 'below', 1.5, 3) },
];
// The colophon: one element per line, 10.5 pt apart, so the break falls after the licence, and
// the second line on the baseline of the plate's numeral.
const COLOPHON = { y: NUMERAL.y + dropTo(NUMERAL.size, 7.5), leading: (10.5 * 25.4) / 72 };
const colophon = (colour) => ['colofon', 'tipos'].map((key, line) => ({ kind: 'text', id: key,
  content: `{attr.${key}}`, fontFamily: 'Syne Mono', fontSize: pt(7.5), letterSpacing: pt(0.2),
  color: colour, align: 'right',
  placement: at('page', 'top-right', -16, COLOPHON.y - (1 - line) * COLOPHON.leading) }));
// #endregion

// #region texts: a text between plates opens on the next page with its hours above it
const textOpener = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'hours', content: '{attr.hora}', fontFamily: 'Syne Mono', fontSize: pt(8),
    letterSpacing: pt(0.8), color: col('accent'), align: 'left',
    placement: at('container', 'top-left', 0, 0) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Syne', fontWeight: 700,
    fontSize: pt(28), lineHeight: 1.05, // a multiple (gotcha: design-lineheight-multiple)
    color: col('ink'), align: 'left', overflow: 'wrap',
    placement: at('#hours', 'below', 0, 2.5, { width: 'fill' }) },
] } };
// The folio and the book's title under the text block, flush with its left edge, on the
// baseline of the plates' numerals. Not on the plates: a span heading opens their pages, so
// they are opener pages, and 'body' leaves them out.
const foot = (id, content, extra) => ({ kind: 'text', id, content, pages: 'body',
  fontFamily: 'Syne Mono', fontSize: pt(7.5), letterSpacing: pt(0.8), color: col('muted'),
  align: 'left', ...extra });
const FOOT = NUMERAL.y + dropTo(NUMERAL.size, 7.5) - (PAGE.height - MARGIN.bottom); // from the foot
const footer = { elements: [
  foot('folio', '{pageNumber}', { color: col('ink'),
    placement: at('container', 'top-left', 0, FOOT) }),
  foot('book', '{title}', { textTransform: 'uppercase', placement: at('#folio', 'right-of', 5) }),
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  // The English sample is British English, set with the US patterns: 1.4.1 ships no en-gb.
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  resourceTypes: [lamina],
  page: { width: mm(PAGE.width), height: mm(PAGE.height), dpi: 150,
    backgroundColor: col('paper'), // the ground of every page; the plates cover it
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } }, // left is the inner margin
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Andada Pro', fontSize: pt(10.5), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), // both default to blue
    referenceColor: col('ink'), referenceBold: false, // 'lámina IV' reads as a word of the text
    firstLineIndent: mm(4), indentAfterHeading: false, // justified and hyphenated by default
    minWordSpacing: 0.7, maxWordSpacing: 1.6, // a narrower range than the defaults, 0.6 to 2
    maxRuntTracking: 0 }, // tracking 1.4.1 never paints (gotcha: runt-tracking-unpainted)
  // A heading's own line is measured even where its design paints the title: set it in a face
  // the page loads, or the kit fetches Open Sans for it.
  headings: { fontFamily: 'Syne', levels: [
    // A text follows its plate with no forced break (gotcha: headings-drop-h1-break): the
    // plate fills its page, so the text still starts a page, and that page stays a body page,
    // with its running foot.
    { level: 1, breakBefore: { enabled: false }, advancedDesign: textOpener },
  ] },
  headingStyles: PLATES.map(plate),
  captionStyle: { fontFamily: 'Syne Mono', fontSize: pt(7.5), color: col('muted') },
  header: { elements: [] },
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region plates: every picture is a resource; only plate IV is cited, so only it floats
// Plate IV is the one plate that floats, so a counter of its type would number it 1. The type
// prints no number (no caption prefix, an empty template) and the caption carries the numeral.
// The text names the plate with :ref's text, since a bare :ref prints 'lámina' and nothing else.
const lamina = { id: 'lamina', name: t({ en: 'Plate', es: 'Lámina' }),
  shortLabel: t({ en: 'plate', es: 'lámina' }), numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal' };
const PX = 10; // pixels per unit of a drawing; the page plates draw in mm
const picture =(id, [w, h], alt, extra = {}) => ({ id, typeId: 'lamina', kind: 'svg',
  createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX },
  altText: t(alt), ...extra });
const resources = [ // the five the heading styles draw, never cited, and plate IV
  picture('alba', [280, 210], { en: 'Eight ridges fading into a peach dawn haze.',
    es: 'Ocho crestas que se pierden en la bruma del alba.' }),
  picture('mediodia', [280, 210], { en: 'A granite cirque and its lake under a pale noon sky.',
    es: 'Un circo de granito y su laguna bajo el cielo pálido del mediodía.' }),
  picture('tormenta', [560, 210], { en: 'A storm over the range: rain on the left, lightning '
    + 'and a break of sun on the right.', es: 'Una tormenta sobre la sierra: lluvia a la '
    + 'izquierda; un rayo y un claro de sol a la derecha.' }),
  picture('noche', [280, 210], { en: 'Stars over dark ridges and two lit windows at a refuge.',
    es: 'Estrellas sobre crestas oscuras y dos ventanas encendidas en un refugio.' }),
  picture('nieve', [280, 210], { en: 'The cirque the morning after, white with new snow.',
    es: 'El circo a la mañana siguiente, blanco de nieve nueva.' }),
  // A 250 × 100 drawing: 2500 px, 423 mm at 150 dpi, that the float fits to the 100 mm measure.
  picture('atardecer', [250, 100], {
    en: 'A crest lit orange under strips of cloud in a violet sky.',
    es: 'Una cresta encendida de naranja bajo franjas de nube, en un cielo violeta.' },
  { caption: t({ en: 'IV · Dusk · 19:41', es: 'IV · Atardecer · 19:41' }) }),
];
// #endregion

// #region art: six plates drawn in code: seeded ridges, flat fills and gradients
// No filters, masks or markers (gotcha: svg-no-marker-filters): the haze is ridge after ridge,
// each a shade darker than the one behind it, and the glows are radial gradients.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const n1 = (v) => Math.round(v * 10) / 10;
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join('');
const paint = (hex, a = 1) => `fill="${hex}"${a < 1 ? ` fill-opacity="${a}"` : ''}`;
// Midpoint displacement: n + 1 heights, each octave `decay` as rough as the one before.
function roughness(rand, n, amp, decay = 0.6) {
  const a = new Array(n + 1).fill(0);
  for (let step = n; step > 1; step /= 2, amp *= decay) {
    for (let i = 0; i < n; i += step) {
      a[i + step / 2] = (a[i] + a[i + step]) / 2 + (rand() - 0.5) * amp;
    }
  }
  return a;
}
// A ridge line: the highest of its peaks [x, height, half-width, curve] over a base, plus rock.
function ridge(rand, w, base, peaks, rough) {
  const n = 512;
  const nz = roughness(rand, n, rough);
  return nz.map((dy, i) => {
    const x = -12 + ((w + 24) * i) / n;
    const lift = Math.max(0, ...peaks.map(([cx, h, hw, p = 1.5]) =>
      (Math.abs(x - cx) < hw ? h * (1 - Math.abs(x - cx) / hw) ** p : 0)));
    return [x, base - lift + dy];
  });
}
// One range of mountains in `lit`. With `shade`, each named peak gets a facet turned from the
// light: from the summit along the crest to the saddle, then down to a foot under the saddle.
// Each peak brings two or three lesser summits of its own, so a crest is never a triangle.
function range(rand, { w, h, base, peaks, rough = 3, lit, shade, light = -1, streak }) {
  const all = peaks.flatMap(([cx, ph, hw, p]) => [[cx, ph, hw, p], ...Array.from(
    { length: 2 + Math.floor(rand() * 2) }, () => [cx + (rand() - 0.5) * hw * 1.2,
      ph * (0.55 + rand() * 0.3), hw * (0.25 + rand() * 0.25), 1.2])]);
  const line = ridge(rand, w, base, all, rough);
  const idx = (x) => Math.max(0, Math.min(512, Math.round(((x + 12) / (w + 24)) * 512)));
  let out = `<path d="${pathOf(line)}L${w + 12} ${h + 2}L-12 ${h + 2}Z" ${paint(lit)}/>`;
  if (!shade) return out;
  const side = -light; // the shaded face looks away from the light
  for (const [cx, ph] of peaks) {
    let i = idx(cx);
    while (i > 0 && i < 512 && line[i][1] > line[i + side][1]) i += side; // up to the summit
    const top = i;
    while (i + side >= 0 && i + side <= 512 && line[i + side][1] >= line[i][1] - 0.4) i += side;
    const face = side > 0 ? line.slice(top, i + 1) : line.slice(i, top + 1).reverse();
    const [tx, ty] = face[0];
    const [sx, sy] = face.at(-1);
    const foot = [tx + (sx - tx) * (0.3 + rand() * 0.2), sy + (sy - ty) * (0.6 + rand() * 0.5) + 6];
    const spur = [0.8, 0.6, 0.4, 0.2].map((t) => [tx + (foot[0] - tx) * t + (rand() - 0.5) * 1.4,
      ty + (foot[1] - ty) * t]);
    const gully = [0.25, 0.5, 0.75].map((t) => [sx + (foot[0] - sx) * t + (rand() - 0.5) * 1.2,
      sy + (foot[1] - sy) * t]);
    const under = ([x, y]) => [x, Math.max(y, line[idx(x)][1] + 0.2)]; // never above the crest
    out += `<path d="${pathOf([...face, ...[...gully, foot, ...spur].map(under)])}Z" `
      + `${paint(shade)}/>`;
    // Gullies on the shaded face, parallel to the arête. `false` paints none but draws the same
    // numbers, so plates II and VI keep one geometry.
    if (streak !== undefined) {
      const [fx, fy] = foot;
      for (let k = 0; k < 4; k++) {
        const along = 0.2 + rand() * 0.7; // where it leaves the crest, from summit to saddle
        const [cx0, cy0] = face[Math.floor(along * (face.length - 1))];
        // Parallel to the arête, a gully leaves the face 1 - along of the way to the foot.
        const room = 0.85 * (1 - along);
        const t0 = Math.min(0.12 + rand() * 0.3, room / 2); // where it starts below the crest
        const t1 = Math.min(t0 + 0.12 + rand() * 0.25, room); // and where it fades out
        const [x0, y0] = [cx0 + (fx - tx) * t0, cy0 + (fy - ty) * t0];
        const [x1, y1] = [cx0 + (fx - tx) * t1, cy0 + (fy - ty) * t1];
        const wd = 0.25 + rand() * 0.4;
        if (streak) {
          out += `<path d="M${n1(x0 - wd)} ${n1(y0)}L${n1(x0 + wd)} ${n1(y0)}`
            + `L${n1(x1)} ${n1(y1)}Z" ${paint(streak)}/>`;
        }
      }
    }
  }
  return out;
}
// A hazy sequence of `n` ranges, far to near, their colour stepping from `far` to `near`. With
// `warm` ({ id, hex, from }), each range turns towards `hex` east of `from` (a fraction of the
// width), less so the nearer it is: a low sun lighting the far ridges through a gap.
function hazy(rand, { w, h, n, top, bottom, far, near, rough = 5, height = 26, warm }) {
  const channel = (hex, k) => parseInt(hex.slice(k, k + 2), 16);
  const blend = (a, b, t) => `#${[1, 3, 5].map((k) => Math.round(channel(a, k) * (1 - t)
    + channel(b, k) * t).toString(16).padStart(2, '0')).join('')}`;
  let out = '';
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const peaks = Array.from({ length: 3 + Math.floor(rand() * 3) }, () =>
      [rand() * w, height * (0.4 + rand() * 0.8) * (1 + t * 0.6), 30 + rand() * 60, 1 + rand()]);
    let lit = blend(far, near, t ** 1.3);
    if (warm) {
      const id = `${warm.id}${k}`;
      out += `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" `
        + `x2="${w}" y2="0"><stop offset="${warm.from}" stop-color="${lit}"/><stop offset="0.94" `
        + `stop-color="${blend(lit, warm.hex, 0.75 * (1 - t) ** 1.5)}"/></linearGradient></defs>`;
      lit = `url(#${id})`;
    }
    out += range(rand, { w, h, base: top + (bottom - top) * t, peaks, rough: rough * (1 + t),
      lit });
  }
  return out;
}
const sky = (id, w, h, stops) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
  + stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')
  + `</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
// A bank of cloud hanging from the top edge: rounded lumps along a base that runs from y0 on
// the left to y1 on the right.
function ceiling(rand, w, y0, y1, hex, lump = 10) {
  const lumps = [];
  for (let x = -20; x < w + 20; x += 10 + rand() * 16) {
    const r = 11 + rand() * 14; // wide lumps: two narrow ones meet in a sharp cusp
    lumps.push([x, Math.min(r * 0.7, lump * (0.4 + rand() * 0.8)), r]);
  }
  const nz = roughness(rand, 256, 1.5);
  const edge = nz.map((dy, i) => {
    const x = -8 + ((w + 16) * i) / 256;
    const hang = Math.max(0, ...lumps.map(([cx, lh, r]) =>
      (Math.abs(x - cx) < r ? lh * Math.sqrt(1 - ((x - cx) / r) ** 2) : 0)));
    return [x, y0 + ((y1 - y0) * (x + 8)) / (w + 16) + hang + dy];
  });
  return `<path d="M-8 -8${pathOf(edge).replace('M', 'L')}L${w + 8} -8Z" ${paint(hex)}/>`;
}
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// Granite boulders: rounded blocks on a flat foot, their crowns lit, or deep in snow.
function boulders(rand, list, body, crown, depth) {
  return list.map(([x, y, r]) => {
    const pts = Array.from({ length: 11 }, (_, k) => {
      const a = Math.PI + (Math.PI * k) / 10; // the upper half, left to right
      const q = r * (0.85 + rand() * 0.3);
      return [x + Math.cos(a) * q * 1.5, y + Math.sin(a) * q];
    });
    const cap = pts.slice(1, 10).map(([px, py]) => [px, py - 0.4]);
    const low = cap.map(([px, py]) => [px, py + r * depth + rand() * r * 0.1]).reverse();
    return `<path d="${pathOf(pts)}Z" ${paint(body)}/>`
      + `<path d="${pathOf([...cap, ...low])}Z" ${paint(crown)}/>`;
  }).join('');
}
const stars = (rand, w, top, bottom, count, hex) => Array.from({ length: count }, () => {
  const x = rand() * w;
  const y = top + (rand() ** 1.6) * (bottom - top); // thinner towards the ridge
  return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(0.12 + rand() ** 3 * 0.55)}" `
    + `${paint(hex, 0.35 + rand() * 0.65)}/>`;
}).join('');
// Choughs: a gull-wing stroke each, drawn as a closed shape.
const birds = (list, hex) => list.map(([x, y, s]) => `<path d="M${x - s} ${y - s * 0.3}`
  + `Q${x - s * 0.4} ${y - s * 0.55} ${x} ${y}`
  + `Q${x + s * 0.4} ${y - s * 0.55} ${x + s} ${y - s * 0.3}`
  + `Q${x + s * 0.4} ${y - s * 0.3} ${x} ${y + s * 0.18}`
  + `Q${x - s * 0.4} ${y - s * 0.3} ${x - s} ${y - s * 0.3}Z" ${paint(hex)}/>`).join('');
// A bolt: a jagged stroke with one fork, over a wider, fainter stroke.
function bolt(rand, x, y0, y1, hex) {
  const pts = [[x, y0]];
  for (let y = y0; y < y1;) {
    y += 3 + rand() * 5;
    pts.push([pts.at(-1)[0] + (rand() - 0.45) * 6, Math.min(y, y1)]);
  }
  const fork = [pts[4]];
  for (let k = 0; k < 5; k++) {
    fork.push([fork.at(-1)[0] + 2 + rand() * 3, fork.at(-1)[1] + 3 + rand() * 3]);
  }
  return [[6, 0.14], [2.8, 0.3], [1.1, 1]].map(([sw, a]) => [pts, fork].map((p) =>
    `<path d="${pathOf(p)}" fill="none" stroke="${hex}" stroke-opacity="${a}" `
    + `stroke-width="${sw * (p === fork ? 0.6 : 1)}" stroke-linejoin="round" `
    + 'stroke-linecap="round"/>').join('')).join('');
}
// Rain in `n` streaks, thinning out over its last `fade` mm to the east, where the shower ends.
const rain = (rand, n, x0, x1, y0, y1, hex, a, fade) => Array.from({ length: n }, () => {
  const x = x0 + rand() * (x1 - x0);
  const y = y0 + rand() * 10;
  const thin = Math.min(1, (x1 - x) / fade) ** 1.5;
  return `<path d="M${n1(x)} ${n1(y)}l${n1(-(y1 - y) * 0.18)} ${n1(y1 - y)}" stroke="${hex}" `
    + `stroke-opacity="${(a * thin * (0.4 + rand() * 0.6)).toFixed(2)}" stroke-width="0.25"/>`;
}).join('');
// A still lake: the water, a bright band under the far shore where the wall is mirrored,
// and a few streaks of wind on the surface.
function lake(rand, y, h, w, water, shine) {
  let out = `<rect x="-2" y="${y}" width="${w + 4}" height="${h}" ${paint(water)}/>`
    + `<rect x="-2" y="${y}" width="${w + 4}" height="${n1(h * 0.28)}" ${paint(shine, 0.55)}/>`;
  for (let k = 0; k < 7; k++) {
    const x = rand() * w;
    out += `<rect x="${n1(x)}" y="${n1(y + h * (0.35 + rand() * 0.55))}" `
      + `width="${n1(8 + rand() * 30)}" height="0.35" ${paint(shine, 0.7)}/>`;
  }
  return out;
}

// A soft light: a radial gradient that fades to nothing, in place of a blur filter.
const glow = (id, cx, cy, rx, ry, hex, a) => `<defs><radialGradient id="${id}">`
  + `<stop offset="0" stop-color="${hex}" stop-opacity="${a}"/>`
  + `<stop offset="1" stop-color="${hex}" stop-opacity="0"/></radialGradient></defs>`
  + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`;

// The corners darkened a little, as a lens does.
const vignette = (id, w, h, a) => `<defs><radialGradient id="${id}" cx="0.5" cy="0.45" `
  + 'r="0.75"><stop offset="0.55" stop-color="#0b0d14" stop-opacity="0"/>'
  + `<stop offset="1" stop-color="#0b0d14" stop-opacity="${a}"/></radialGradient></defs>`
  + `<rect width="${w}" height="${h}" fill="url(#${id})"/>`;

// II and VI: one cirque seen from one boulder, at noon and the morning after the first snow.
// The same seed draws the same ridges; only the colours change.
function cirque(k, w = 280, h = 210) {
  const rand = mulberry32(13);
  const crest = [[34, 40, 50], [98, 58, 60], [150, 46, 40], [214, 62, 62], [262, 38, 40]];
  const [sky0, sky1, sky2] = k.sky;
  return svgDoc(w, h, sky('s', w, h, [[0, sky0], [0.45, sky1], [0.62, sky2]])
    + hazy(rand, { w, h, n: 2, top: 104, bottom: 112, far: k.far[0], near: k.far[1], height: 30 })
    + range(rand, { w, h, base: 122, rough: 6, light: -1, peaks: crest,
      lit: k.crest[0], shade: k.crest[1], streak: k.crest[2] })
    + range(rand, { w, h, base: 146, rough: 6, light: -1, peaks: [[20, 30, 60], [252, 34, 60]],
      lit: k.slope[0], shade: k.slope[1], streak: k.slope[2] })
    + lake(rand, 146, 28, w, k.lake[0], k.lake[1])
    + range(rand, { w, h, base: 180, rough: 6, light: -1, peaks: [[-10, 30, 90], [292, 44, 110]],
      lit: k.near[0], shade: k.near[1] })
    + range(rand, { w, h, base: 214, rough: 8, light: -1, peaks: [[70, 26, 110], [236, 30, 90]],
      lit: k.ground[0], shade: k.ground[1] })
    + boulders(rand, [[64, 204, 10], [120, 209, 5], [152, 205, 8], [182, 207, 5]], ...k.rock)
    + vignette('v', w, h, k.vignette));
}
const NOON = { sky: ['#8fabc6', '#cfdbe6', '#edf1f4'], far: ['#d3dce5', '#c2ccd6'],
  crest: ['#b3bdc8', '#8795a6', false], slope: ['#7f8fa0', '#66778b', false], // bare rock
  lake: ['#7f97ad', '#c3d1dd'], near: ['#56687b', '#46566a'], ground: ['#343f4d', '#2a333f'],
  rock: ['#6f6c69', '#bdb7ad', 0.28], vignette: 0.3 };
const SNOW = { sky: ['#aeb8c3', '#dce2e8', '#eef2f5'], far: ['#e3e8ed', '#d6dde4'],
  crest: ['#f8fafc', '#c3cdd8', '#6f7985'], slope: ['#e8edf2', '#b6c2cf', '#7d8692'],
  lake: ['#a3b2c0', '#e3e9ee'], near: ['#f1f4f7', '#ccd6e0'], ground: ['#f5f7f9', '#dfe5eb'],
  rock: ['#4b515a', '#f7f9fb', 0.62], vignette: 0.18 };

const ART = {
  alba(w = 280, h = 210) { // I: first light; eight ranges in the haze, the title in the sky
    const rand = mulberry32(3);
    return svgDoc(w, h, sky('s', w, h, [[0, '#1f2640'], [0.34, '#4e4f6e'], [0.56, '#a97f8a'],
      [0.7, '#e3a07f'], [0.8, '#f4cda4']])
      + glow('g', 206, 128, 70, 34, '#fbe0bb', 0.7)
      + birds([[64, 104, 1.5], [71, 99, 1.1], [77, 106, 1]], '#3b3550')
      + hazy(rand, { w, h, n: 8, top: 132, bottom: 212, far: '#dcae9f', near: '#262739',
        height: 22 })
      + vignette('v', w, h, 0.35));
  },
  mediodia: () => cirque(NOON), // II: flat light over the cirque and its lake
  tormenta(w = 560, h = 210) { // III: the storm over two pages; far right, the sun breaks through
    const rand = mulberry32(21);
    const clouds = ceiling(rand, w, 92, 56, '#6a6878', 8) // the far bank, lit from the gap
      + ceiling(rand, w, 80, 32, '#4a4c5d', 10)
      + ceiling(rand, w, 64, 6, '#33353f', 12)
      + ceiling(rand, w, 40, -30, '#20222b', 14); // the storm, overhead
    return svgDoc(w, h, sky('s', w, h, [[0, '#1f222c'], [0.45, '#474b5e'], [0.68, '#7a7486'],
      [0.8, '#a99a8c']])
      + glow('g', 520, 118, 120, 46, '#f3d6a4', 0.75)
      + clouds
      + rain(rand, 420, 0, 320, 88, 176, '#aeb6c6', 0.55, 120) // the last streaks cross the gutter
      + hazy(rand, { w, h, n: 4, top: 136, bottom: 160, far: '#8a8290', near: '#5b5d6e',
        height: 30, warm: { id: 'sun', hex: '#e8b98c', from: 0.6 } })
      + bolt(rand, 374, 84, 160, palette.white)
      + hazy(rand, { w, h, n: 3, top: 172, bottom: 214, far: '#3e4252', near: '#15171d',
        height: 26 })
      + vignette('v', w, h, 0.4));
  },
  atardecer(w = 250, h = 100) { // IV: the crest lit by the sun behind us, the east sky violet
    const rand = mulberry32(5);
    let strips = '';
    const bands = [[-10, 130, 20, 6], [70, 262, 32, 5], [-10, 96, 42, 4], [160, 252, 12, 3.4]];
    for (const [x0, x1, y, t] of bands) { // strips of cloud, lit from below
      const mid = (x0 + x1) / 2;
      const d = `M${x0} ${y}Q${mid} ${y - t} ${x1} ${y}Q${mid} ${y + t * 0.7} ${x0} ${y}Z`;
      strips += `<path d="${d}" ${paint('#f5b27a')}/><path d="${d}" transform="translate(0 -0.8)" `
        + `${paint('#54445f')}/>`;
    }
    return svgDoc(w, h, sky('s', w, h, [[0, '#262440'], [0.4, '#4b4367'], [0.66, '#8a6889'],
      [0.8, '#c08d99']])
      + strips
      + range(rand, { w, h, base: 72, rough: 5, lit: '#f29a62', shade: palette.accent, light: -1,
        peaks: [[70, 26, 40], [150, 36, 46], [215, 24, 36]] })
      + hazy(rand, { w, h, n: 3, top: 80, bottom: 102, far: '#6d4a64', near: '#1f1827',
        height: 12 })
      + vignette('v', w, h, 0.35));
  },
  noche(w = 280, h = 210) { // V: clear after the storm; two windows lit at the refuge
    const rand = mulberry32(12);
    const refuge = `<path d="M184 170h14v-6l-7-4.4l-7 4.4Z" ${paint('#0b0d15')}/>`
      + `<rect x="187.4" y="165.4" width="2.2" height="2" ${paint('#f2b45c')}/>`
      + `<rect x="192.2" y="165.4" width="2.2" height="2" ${paint('#f2b45c', 0.75)}/>`
      + glow('l', 190.6, 166.4, 9, 6, '#f2b45c', 0.35);
    return svgDoc(w, h, sky('s', w, h, [[0, '#070912'], [0.5, '#141a31'], [0.8, '#263050']])
      + glow('m', 150, 60, 170, 40, '#7d8bb8', 0.12)
      + stars(rand, w, 0, 150, 520, palette.white)
      + range(rand, { w, h, base: 142, rough: 6, lit: '#28304c', shade: '#1c2238', light: -1,
        peaks: [[60, 40, 60], [150, 56, 56], [236, 44, 60]] })
      + hazy(rand, { w, h, n: 2, top: 158, bottom: 168, far: '#20263b', near: palette.ink,
        height: 18 })
      + refuge
      + hazy(rand, { w, h, n: 2, top: 188, bottom: 214, far: '#0e111c', near: '#07080d',
        height: 18 })
      + vignette('v', w, h, 0.4));
  },
  nieve: () => cirque(SNOW), // VI: the same view the morning after; ink type goes on it
};
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  'Andada Pro': ['400'], Syne: ['700', '800'], 'Syne Mono': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all(Object.entries(ART).map(([id, draw]) => loadSvg(`${id}.svg`, draw())));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Sierra: a photo essay in landscape',
  es: 'Sierra: un ensayo fotográfico apaisado' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
