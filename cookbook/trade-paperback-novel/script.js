// ═══ Postext Cookbook · Nº 038 · Trade paperback: sunk openers and recto chapters ═══
// https://postext.dev/en/cookbook/trade-paperback-novel
// Code: MIT · Text: Kate Chopin, The Awakening, 1899 (PD, Gutenberg #160) · Art: drawn in code
// Fonts: Crimson Pro, Cormorant Garamond, Cormorant SC (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document (this recipe is English only)
const RECIPE = 'trade-paperback-novel';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#231d18', // the text: a warm near-black
  rubric: '#8e3b22', // the one accent: the opener's hairline, the author, the tailpiece
  muted: '#6e655b', // running heads, folios on openers, the colophon
  paper: '#fbf7ef', // a cream book paper
  sea: '#2f5d6b', shallows: '#7fa6a3', sand: '#e8d9b8', camomile: '#d8b04a', // the cover
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults (headings, lists, callouts, captions) link to 'main-color', the rubric.
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];
const TEXT = 'Crimson Pro'; // the text face
const DISPLAY = 'Cormorant Garamond'; // italic numerals and the cover's title
const LABEL = 'Cormorant SC'; // small capitals: the lead, the author's name
const [BODY, LEAD] = [10.5, 14]; // pt: the body size and its leading, the grid's pitch
const line = (n) => pt(n * LEAD); // n grid lines

// #region page: a 140 × 216 mm trade page whose text block holds 35 whole lines
const TRIM = { width: 140, height: 216 }; // mm: 5½ × 8½ in
const [TOP, INNER, OUTER] = [22, 20, 15.5]; // mm; mirrored, so INNER is left on a recto
const LINES = 35; // every full page ends on the same line
const MEASURE = TRIM.width - INNER - OUTER; // 104.5 mm: about 69 characters of Crimson Pro
const MM_PER_PT = 25.4 / 72;
const page = {
  sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LEAD * MM_PER_PT),
    left: mm(INNER), right: mm(OUTER), mirror: true },
};
// #endregion

// #region answer: a sunk opener: the numeral, a hairline, and the first sentence in small caps
// # I {lead="A green and yellow parrot, … kept repeating over and over:"}
// The heading's text is the numeral, printed by {titleText}; the chapter's first sentence
// travels as the heading's lead attribute, printed by {attr.lead} in small capitals and
// centred, because design text is never justified (gotcha: design-text-ragged).
const [LEAD_AT, BODY_AT] = [9, 12]; // grid lines: the lead's top; where the text starts
const NUMERAL = 48; // pt
const RULE_Y = (LEAD_AT - 1.5) * LEAD * MM_PER_PT; // mm: a line and a half above the lead
const NUMERAL_Y = RULE_Y - NUMERAL * MM_PER_PT - 3; // mm: the numeral's box ends 3 mm above it
const centred = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y } });
const opener = {
  enabled: true,
  // The two-line lead ends on line LEAD_AT + 2; minHeight leaves a blank line under it and
  // starts the text on line BODY_AT (a one-line lead would leave two).
  minHeight: line(BODY_AT),
  slot: { elements: [
    { kind: 'text', id: 'numeral', content: '{titleText}', fontFamily: DISPLAY, italic: true,
      fontWeight: 500, fontSize: pt(NUMERAL), lineHeight: 1, color: col('ink'),
      align: 'center', placement: centred(mm(NUMERAL_Y)) },
    { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.6),
      color: col('rubric'), placement: { ...centred(mm(RULE_Y)), size: { width: mm(18) } } },
    { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: LABEL, fontWeight: 600,
      fontSize: pt(9.5), letterSpacing: pt(0.6), color: col('ink'), align: 'center',
      lineHeight: LEAD / 9.5, // a multiple, never pt() (gotcha: design-lineheight-multiple)
      overflow: 'wrap', // wrap, not '…' (gotcha: overflow-ellipsis-default)
      paragraphIndent: pt(0.01), // a \n in the lead breaks the line (gotcha: design-text-newline)
      placement: { ...centred(line(LEAD_AT)), size: { width: mm(MEASURE) } } },
  ] },
};
// Every chapter opens on a recto: 'odd' adds a blank verso only after a chapter that ends on
// a recto (restated: gotcha headings-drop-h1-break). marginBottom 0: the level's default
// 0.5 em would start the text a line lower.
const chapter = { level: 1, breakBefore: { enabled: true, parity: 'odd' },
  marginBottom: pt(0), italic: true, advancedDesign: opener };
// #endregion

// #region heads: the author on the verso, the title on the recto, folios outside
// {author} and {title} come from the frontmatter, every value quoted (gotcha: quote-frontmatter).
const HEAD_Y = 12; // mm from the top edge to the top of the running heads
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre is off the page's centre
const head = (id, content, parity, edge, x, style) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers or blank pages
  fontSize: pt(9), color: col('muted'), ...style,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD_Y) } },
});
const smallCaps = { fontFamily: LABEL, fontWeight: 600, letterSpacing: pt(1.2) };
const italic = { fontFamily: DISPLAY, italic: true, fontWeight: 500, fontSize: pt(9.75) };
const folio = { fontFamily: TEXT, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-author', '{author}', 'even', 'top', -SHIFT, smallCaps),
  head('recto-title', '{title}', 'odd', 'top', SHIFT, italic),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
// Openers carry a drop folio instead, centred under the text block.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  pages: 'opener', fontFamily: TEXT, fontSize: pt(9), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(7) } } }] };
// #endregion

// #region cover: a section of its own: art, title, author, no heads, a colophon on its verso
// Page 1 is a recto (gotcha: parity-page1-recto): the cover, the colophon on its verso, and
// chapter I on page 3. # The Awakening {style="cover"} opens the section; chapter I closes it.
// The colophon: 2 + 2 + 1 lines of 11 pt and two gaps of 14.5 pt make 84 pt, six grid lines.
const COLOPHON_LINES = 6;
const COVER_ART = { w: TRIM.width, h: 134 }; // mm: the drawing fills the width, 134 mm deep
const COLOPHON_TOP = TOP + (LINES - COLOPHON_LINES) * LEAD * MM_PER_PT; // mm: the section's margin
const onPage = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } }); // y mm down
const cover = {
  id: 'cover',
  span: 'page', // kept in the column, the design is clipped at the column top, 165 mm down
  header: { elements: [] }, footer: { elements: [] }, // no running heads on p. 1 or p. 2
  margins: { top: mm(COLOPHON_TOP) },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'cover',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    { kind: 'text', id: 'title', content: '{title}', fontFamily: DISPLAY, italic: true,
      fontWeight: 500, fontSize: pt(50), lineHeight: 1, color: col('ink'), align: 'center',
      placement: onPage(155) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.6),
      color: col('rubric'), placement: { ...onPage(179), size: { width: mm(18) } } },
    { kind: 'text', id: 'author', content: '{author}', ...smallCaps, fontSize: pt(12),
      letterSpacing: pt(2.4), color: col('rubric'), align: 'center', placement: onPage(184) },
  ] } },
};
const colophon = { id: 'colophon', fontSize: pt(8), lineHeight: pt(11), color: col('muted'),
  textAlign: 'left', firstLineIndent: pt(0), spaceBetween: pt(14.5) };
// #endregion

// #region tailpiece: an ornament type that prints no caption, where ::resource stands
// At a chapter's end: :::space, then ::resource{id="tailpiece-1"} (double quotes: gotcha
// resource-double-quotes). The space adds a line to the gap the embed keeps above it.
const ornament = { id: 'ornament', name: 'Ornament', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.17, align: 'center' } };
const svg = (id, fileId, width, height, altText) => ({ id, typeId: 'ornament', kind: 'svg',
  svg: { fileId, width, height }, altText, createdAt: 0, updatedAt: 0 });
const resources = [
  svg('cover', 'cover.svg', COVER_ART.w, COVER_ART.h, 'The gulf seen between the trunks of '
    + 'water-oaks, a lugger on the horizon; a white sunshade comes up from the beach through '
    + 'the camomile.'),
  // ::resource places each ornament once, so each chapter end has its own id.
  ...['I', 'II'].map((n, i) => svg(`tailpiece-${i + 1}`, 'fleuron.svg', 40, 12,
    `A camomile flower between two sprigs closes chapter ${n}.`)),
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  resourceTypes: [ornament],
  page,
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    minWordSpacing: 0.7, maxWordSpacing: 1.9, // at the default 0.6 a line closes to 0.62
    maxRuntTracking: 0, // gotcha: runt-tracking-unpainted
  },
  // The designs paint every heading; the level's own face is the numeral's (500 italic), so the
  // kit has no unused face to load.
  headings: { fontFamily: DISPLAY, fontWeight: 500, levels: [chapter] },
  headingStyles: [cover],
  paragraphStyles: [colophon],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.en.md, inlined by the Cookbook

// #region art: the cover and the fleuron, drawn in millimetres in the page's palette
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
// A wavy band edge from x = 0 to W at height y, amplitude a: the top of a filled band.
function edge(rnd, W, y, a, steps = 14) {
  let d = `M0 ${n2(y)}`;
  for (let i = 1; i <= steps; i++) {
    const x = (W * i) / steps;
    d += `Q${n2(x - W / steps / 2)} ${n2(y + (rnd() - 0.5) * 2 * a)} `
      + `${n2(x)} ${n2(y + (rnd() - 0.5) * a)}`;
  }
  return d;
}
function drawCover(W, H) { // chapter I: the gulf, far and hazy, seen from the cottage porch
  const rnd = mulberry32(1899);
  const P = palette;
  const out = [];
  const shape = (d, color) => out.push(`<path d="${d}" fill="${color}"/>`);
  const band = (y, a, color) => shape(`${edge(rnd, W, y, a)}L${W} ${H}L0 ${H}Z`, color);
  const bez = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b
    + 3 * (1 - t) * t * t * c + t ** 3 * d;
  // The sky: pale blue overhead, warming into haze at the horizon; a white noon sun.
  const sky = mix(P.shallows, P.paper, 0.5);
  out.push(`<rect width="${W}" height="${H}" fill="${sky}"/>`);
  out.push(`<circle cx="47" cy="20" r="6" fill="${mix(P.sand, P.paper, 0.7)}"/>`);
  [[40, 0.7, 0.3], [52, 0.8, 0.55], [62, 0.6, 0.8]].forEach(([y, a, k]) =>
    band(y, a, mix(sky, mix(P.sand, P.paper, 0.45), k)));
  // The gulf: melting into the haze at the horizon, deep further out, green over the shallows.
  const HORIZON = 70;
  out.push(`<rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" `
    + `fill="${mix(P.shallows, P.paper, 0.35)}"/>`);
  band(HORIZON + 4, 0.2, mix(P.sea, P.shallows, 0.35));
  band(HORIZON + 11, 0.5, P.sea);
  band(HORIZON + 18, 0.8, mix(P.sea, P.shallows, 0.55));
  for (let i = 0; i < 70; i++) { // glints on the water, longer in the foreground
    const y = HORIZON + 5 + rnd() * 17;
    const [x, len] = [rnd() * W, 1 + ((y - HORIZON) / 20) * 5 * (0.5 + rnd())];
    out.push(`<path d="M${n2(x)} ${n2(y)}h${n2(len)}" stroke="${mix(P.shallows, P.paper, 0.5)}" `
      + `stroke-width="${n2(0.25 + (y - HORIZON) / 60)}" stroke-linecap="round"/>`);
  }
  // Beaudelet's lugger on the horizon, on its way to the Chênière.
  shape(`M84 ${HORIZON + 0.6}h6.5l-1 1.3h-4.6z`, P.ink);
  shape(`M86.2 ${HORIZON + 0.4}L86.8 ${HORIZON - 7.2}L89.9 ${HORIZON - 5.4}`
    + `L89.2 ${HORIZON + 0.4}Z`, mix(P.rubric, P.sand, 0.3));
  // The surf, the beach and the stretch of yellow camomile.
  band(HORIZON + 24, 0.7, P.paper);
  band(HORIZON + 25.3, 0.9, P.sand);
  band(HORIZON + 31, 1.2, mix(P.camomile, P.sand, 0.35));
  band(HORIZON + 38, 1.6, mix(P.camomile, P.shallows, 0.2));
  band(HORIZON + 50, 2, mix(P.camomile, P.sea, 0.25));
  // The path up from the beach, widening as it comes near.
  const PATH_TOP = HORIZON + 30;
  const [left, right] = [[66, 68, 76, 70], [69.6, 74, 88, 96]]; // its edges, top to bottom
  shape(`M${left[0]} ${PATH_TOP}C${left[1]} 112 ${left[2]} 124 ${left[3]} ${H}H${right[3]}`
    + `C${right[2]} 124 ${right[1]} 112 ${right[0]} ${PATH_TOP}Z`, mix(P.sand, P.camomile, 0.2));
  const onPath = (x, y) => { const t = (y - PATH_TOP) / (H - PATH_TOP); // the edges' y runs evenly
    return t >= 0 && x > bez(...left, t) - 1 && x < bez(...right, t) + 1; };
  for (let i = 0; i < 560; i++) { // camomile heads, bigger and sparser towards the viewer
    const y = HORIZON + 32 + rnd() ** 0.8 * (H - HORIZON - 32);
    const x = rnd() * W;
    const r = 0.25 + ((y - HORIZON - 32) / (H - HORIZON)) * 1.4;
    if (onPath(x, y)) continue;
    out.push(`<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="${P.paper}"/>`
      + `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r * 0.45)}" fill="${P.camomile}"/>`);
  }
  // Edna and Robert under the white, pink-lined sunshade.
  const [sx, sy] = [70.5, HORIZON + 33];
  shape(`M${sx - 1.3} ${sy}v4.2h1.1v-4.2z`, P.paper);
  shape(`M${sx + 0.4} ${sy}v4.2h1.1v-4.2z`, mix(P.ink, P.sea, 0.4));
  shape(`M${sx - 3.2} ${sy - 0.2}Q${sx} ${sy - 3.6} ${sx + 3.2} ${sy - 0.2}Z`, P.paper);
  shape(`M${sx - 3.2} ${sy - 0.2}Q${sx} ${sy + 0.6} ${sx + 3.2} ${sy - 0.2}Z`,
    mix(P.rubric, P.paper, 0.55));
  // The gaunt trunks of the water-oaks and their limbs: tapered curves, wide at the base.
  const bark = mix(P.ink, P.sea, 0.35);
  const bend = ([x0, y0], [cx, cy], [x1, y1], t) => [
    (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];
  const limb = (p0, c, p1, w0, w1) => {
    const [l, r] = [[], []]; // the limb's two outlines
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const [x, y] = bend(p0, c, p1, t);
      const [dx, dy] = [(1 - t) * (c[0] - p0[0]) + t * (p1[0] - c[0]),
        (1 - t) * (c[1] - p0[1]) + t * (p1[1] - c[1])];
      const k = (w0 + (w1 - w0) * t) / 2 / Math.hypot(dx, dy);
      l.push(`${n2(x - dy * k)} ${n2(y + dx * k)}`);
      r.unshift(`${n2(x + dy * k)} ${n2(y - dx * k)}`);
    }
    shape(`M${l.join('L')}L${r.join('L')}Z`, bark);
  };
  // Each oak: a trunk (foot, bend, top; widths) and limbs that leave it at t along its length.
  [[[108, H + 1], [106, 70], [110, -1], 1.8, 1, []], // a third oak, further back
    [[9, H + 1], [4, 70], [17, -1], 4.6, 2.2, [[0.63, [22, 30], [40, 9], 2.4, 0.7],
      [0.78, [5, 18], [-2, 12], 1.6, 0.6]]],
    [[125, H + 1], [131, 70], [117, -1], 4.2, 2, [[0.66, [110, 30], [97, 10], 2.2, 0.7]]],
  ].forEach(([foot, c, top, w0, w1, limbs]) => {
    limb(foot, c, top, w0, w1);
    limbs.forEach(([t, lc, tip, l0, l1]) => limb(bend(foot, c, top, t), lc, tip, l0, l1));
  });
  const crown = (cx, cy, rx, ry, n) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd());
      const [x, y] = [cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d];
      const shade = rnd() < 0.3 ? mix(P.sea, P.shallows, 0.4) : mix(P.sea, P.ink, 0.45);
      out.push(`<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(1.8 + rnd() * 2.4)}" `
        + `ry="${n2(1.2 + rnd() * 1.4)}" fill="${shade}"/>`);
    }
  };
  crown(12, 3, 36, 13, 170);
  crown(128, 4, 32, 14, 150);
  // Spanish moss, in clumps hanging from the limbs.
  [[24, 20], [31, 14], [36, 11], [4, 15], [104, 16], [110, 21], [99, 12], [14, 13], [126, 13]]
    .forEach(([x, y]) => {
      for (let j = 0; j < 6; j++) {
        const [dx, len] = [(rnd() - 0.5) * 3.2, 4 + rnd() * 9];
        out.push(`<path d="M${n2(x + dx)} ${n2(y)}c${n2(rnd() - 0.5)} ${n2(len / 3)} `
          + `${n2(rnd() - 0.5)} ${n2((2 * len) / 3)} ${n2((rnd() - 0.5) * 1.5)} ${n2(len)}" `
          + `stroke="${mix(P.shallows, P.sea, 0.2)}" stroke-width="0.5" fill="none" `
          + 'stroke-linecap="round"/>');
      }
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" `
    + `viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
}
function drawFleuron(color) { // a camomile head between two leafy sprigs
  const petals = Array.from({ length: 10 }, (_, i) => `<ellipse cx="22.1" cy="6" rx="1.55" `
    + `ry="0.62" transform="rotate(${i * 36} 20 6)" fill="${color}"/>`).join('');
  const sprig = `<path d="M17.2 6.3C14 7.4 10 7.2 6.4 5.6C5.2 5.1 4.2 5.2 3.4 5.9" fill="none" `
    + `stroke="${color}" stroke-width="0.55" stroke-linecap="round"/>`
    + `<path d="M13.4 6.9C12.6 4.9 10.8 4 9 4.2C10 5.6 11.4 6.6 13.4 6.9Z" fill="${color}"/>`
    + `<path d="M9.2 6.5C8.7 7.9 7.4 8.7 5.9 8.8C6.6 7.5 7.7 6.7 9.2 6.5Z" fill="${color}"/>`
    + `<circle cx="2.8" cy="6.3" r="0.7" fill="${color}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="12mm" '
    + `viewBox="0 0 40 12">${petals}<circle cx="20" cy="6" r="1.05" fill="${color}"/>${sprig}`
    + `<g transform="translate(40 0) scale(-1 1)">${sprig}</g></svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Crimson Pro': ['400', '400i'], // text, colophon, folios
  'Cormorant Garamond': ['500i'], // numerals, cover title, the recto's running head
  'Cormorant SC': ['600'], // the leads, the author on the cover and the verso
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('cover.svg', drawCover(COVER_ART.w, COVER_ART.h));
await loadSvg('fleuron.svg', drawFleuron(palette.rubric));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'Trade paperback: sunk openers and recto chapters' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
