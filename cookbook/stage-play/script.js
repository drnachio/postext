// ═══ Postext Cookbook · Nº 070 · Play script: cast list, speakers and stage directions ═══
// https://postext.dev/en/cookbook/stage-play
// Code: MIT · Text: Oscar Wilde, 1895 (PD, Gutenberg #844), Spanish: the Cookbook · Art: in code
// Fonts: Libre Baskerville, Abril Fatface, Playfair Display SC (OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'stage-play';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#221b1f', // the dialogue: a near-black with a little plum in it
  plum: '#5b2349', // the one accent: speakers' names, act titles, the title page's ground
  gold: '#b48a45', // rules and ornaments
  gilt: '#c9aa77', // gold lightened for small type on the plum ground (5.3:1)
  muted: '#6c6168', // stage directions and running heads (5.5:1 on the paper)
  paper: '#fbf6ec', // a cream stock
};
// The hex travels with the id: designs do not read the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'plum (defaults)', value: { hex: palette.plum, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Libre Baskerville', 'Abril Fatface', 'Playfair Display SC'];
const [BODY, LEAD] = [9.4, 13.6]; // pt: the dialogue and its leading, the pitch of the grid
const TRIM = { width: 140, height: 216 }; // mm: 5½ × 8½ in, the acting-edition size
const [TOP, INNER, OUTER, LINES] = [20, 18, 15, 36]; // mm, and 36 lines to a full page

// #region answer: a speech is a paragraph: the name in bold, the directions in italic
// Speeches are plain paragraphs, the speaker's name in bold and each stage direction in
// italic; a direction between two speeches is a paragraph of its own, in a container:
//   **LANE.** Yes, sir. *[Hands them on a salver.]*
//   :::paragraphs{style="direction"}
//   *[Enter Lane.]*
//   :::
// The body's two emphasis colours then mark who speaks (plum) and what is done (grey).
const dialogue = {
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('plum'), // **ALGERNON.**
  italicColor: col('muted'), // *[Languidly.]*, in a speech or a paragraph of its own
  minWordSpacing: 0.65, maxWordSpacing: 1.8, // justified (the default); limits inside 0.6–2
  firstLineIndent: mm(5), hangingIndent: true, // the name at the margin, the turnovers hung
  maxRuntTracking: 0, // gotcha: runt-tracking-unpainted
};
// Directions: smaller and centred, on the same grid. A paragraph style has no italic switch
// or colour (gotcha: style-italic-colour): the text is written *…* and takes the grey.
const direction = { id: 'direction', fontSize: pt(8.6),
  textAlign: 'center', firstLineIndent: pt(0) };
// #endregion

// #region acts: an act title is a plain first-level heading, centred and set in capitals
// Any headings object drops the H1 break: restated (gotcha: headings-drop-h1-break).
const headings = {
  fontFamily: LABEL, fontWeight: 400, color: col('ink'),
  textAlign: 'center', // every level: the act, the cast list's heads, the scene
  lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(0), // whole lines of the grid
  levels: [
    { level: 1, fontFamily: DISPLAY, fontSize: pt(24), lineHeight: pt(3 * LEAD),
      color: col('plum'), textTransform: 'uppercase',
      breakBefore: { enabled: true, parity: 'odd' } }, // a recto, facing the cast list
    { level: 2, fontSize: pt(13), lineHeight: pt(2 * LEAD) },
    { level: 3, fontSize: pt(9.5), color: col('plum') },
  ],
};
// #endregion

// #region cast: the cast list: each person a paragraph, the actor after a dot leader
// A tab sends the actor to a stop at the end of the measure that ends the text there; the stop's
// leader fills the room before it with dots, from half an em after the person to half an em
// before the actor. The bill's head is a centred line in the face's own small capitals.
const person = { id: 'person', fontSize: pt(8.8), firstLineIndent: pt(0), textAlign: 'left',
  tabStops: [{ position: 'end', align: 'end', leader: '.' }],
  spaceBetween: pt(LEAD / 2) }; // a person every line and a half
const billHead = { id: 'bill-head', fontFamily: LABEL, fontSize: pt(8.5), color: col('plum'),
  textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD / 2),
  marginBottom: pt(LEAD / 2) };
// The scenes: two stops, so `:tab Act I :tab Algernon’s flat` ends the act on the first
// (15 mm in) and starts the place on the second, 2 mm after it, as a two-column list would.
const scene = { id: 'scene', textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD / 2),
  tabStops: [{ position: mm(15), align: 'end' }, { position: mm(17) }] };
// #endregion

// #region ornament: a resource type for artwork with no number and no caption
// ::resource{id="fleuron"} sets it where it stands (gotcha: resource-double-quotes).
const unnumbered = (id, name, defaultPlacement) => ({ id, name, shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', defaultPlacement });
const resourceTypes = [
  unnumbered('ornament', 'Ornament', { position: 'here', width: 0.24, align: 'center' }),
];
// #endregion

// #region playbill: the title page, a heading style whose design fills the sheet
// # The Importance of Being Earnest {style="playbill" small="The" big="Importance" …}
// Each attribute is a playbill line in its own face and size, its lineHeight a multiple
// (gotcha: design-lineheight-multiple). The ground is an image and reserves no height
// (gotcha: opener-image-no-reserve): :::pagebreak keeps the title page alone if its foot
// lines move up.
const line = (id, content, font, size, y, color, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), lineHeight: 1, color: col(color), align: 'center',
  // Centred and tracked, a line sits half its tracking left of centre: x puts it back.
  placement: { anchor: { to: 'page', edge: 'top' },
    offset: { x: pt((extra.letterSpacing?.value ?? 0) / 2), y: mm(y) } }, ...extra });
const tracked = (track) => ({ textTransform: 'uppercase', letterSpacing: pt(track) });
const playbill = {
  id: 'playbill', span: 'page', // even in one column (gotcha: opener-clipped-at-top)
  header: { elements: [] }, footer: { elements: [] }, // no heads on p. 2, no folio on p. 1
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'ground', resourceId: 'playbill',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    line('kicker', '{subtitle}', LABEL, 8.5, 36, 'gilt', tracked(1.7)),
    line('small', '{attr.small}', TEXT, 17, 51, 'paper', { italic: true }),
    line('big', '{attr.big}', DISPLAY, 40, 60, 'paper', { textTransform: 'uppercase' }),
    line('link', '{attr.link}', TEXT, 17, 78, 'gilt', { italic: true }),
    line('name', '{attr.name}', DISPLAY, 60, 87, 'paper', { textTransform: 'uppercase' }),
    line('author', '{author}', LABEL, 13, 133, 'paper', tracked(3)),
    line('theatre', '{attr.theatre}', LABEL, 8, 170, 'gilt', tracked(1.6)),
    line('premiere', '{attr.premiere}', TEXT, 8.5, 176, 'paper', { italic: true }),
  ] } },
};
// #endregion

// #region heads: the play on the verso, the act on the recto, folios outside
const head = (id, content, parity, edge, x, style) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers or blank pages
  fontFamily: LABEL, fontSize: pt(8.5), letterSpacing: pt(0.8), color: col('muted'),
  textTransform: 'uppercase', ...style,
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(11) } },
});
const folio = { fontFamily: TEXT, letterSpacing: pt(0), color: col('plum') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-act', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
// The act's first page carries a drop folio instead, centred under the text block.
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', 'top', 0, folio),
  pages: 'opener', align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(8) } } }] };
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation by exact code (gotcha: hyphenation-locales)
  colorPalette,
  resourceTypes,
  page: {
    sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height),
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - (LINES * LEAD * 25.4) / 72),
      left: mm(INNER), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: dialogue,
  headings,
  headingStyles: [playbill],
  paragraphStyles: [direction, person, billHead, scene, { id: 'colophon', fontSize: pt(7.5),
    color: col('muted'), textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the title page's ground and double frame, and the carnation fleuron, in mm
let seed = 1895; // Mulberry32, a seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const f = (n) => +n.toFixed(2);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(palette[a].slice(i, i + 2),
  16) * (1 - k) + parseInt(palette[b].slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
  .join('')}`;
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const pts = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
const poly = (list, fill) => `<path d="M${pts(list)}Z" fill="${fill}"/>`;
const stroke = (list, color, w) => `<path d="M${pts(list)}" fill="none" stroke="${color}" `
  + `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const quad = ([x0, y0], [cx, cy], [x1, y1], t) => [
  (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1,
  (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];

// A carnation `s` mm tall standing on (cx, cy), seen from the side: three fans of pinked
// petals spring from the rim of a calyx, notched apart in the ground colour behind them.
const DEG = Math.PI / 180;
function carnation(cx, cy, s, [back, mid, front], green, ground) {
  const out = [];
  const [rx, ry] = [cx, cy - s * 0.32]; // the rim of the calyx
  const fan = (from, to, r, lift, petals, fill) => { // a fan from `from`° to `to`°, r mm deep
    const at = (deg, k) => [rx + Math.cos(deg * DEG) * r * k,
      ry - lift + Math.sin(deg * DEG) * r * k * 0.92];
    const edge = [];
    for (let i = 0; i <= petals * 6; i++) { // six teeth to a petal, each petal a rounded lobe
      const lobe = 0.84 + 0.16 * Math.sin((Math.PI * (i % 6)) / 6);
      edge.push(at(from + ((to - from) * i) / (petals * 6),
        (i % 2 ? 0.9 : 1) * lobe * (0.98 + rand() * 0.04)));
    }
    out.push(poly([[rx, ry - lift], ...edge], fill));
    const notch = (to - from) / petals / 14; // half the angle of a notch at the edge
    for (let p = 1; p < petals; p++) { // a thin wedge between two petals
      const deg = from + ((to - from) * p) / petals;
      out.push(poly([at(deg, 0.66), at(deg - notch, 1.1), at(deg + notch, 1.1)], ground));
    }
  };
  fan(-162, -18, s * 0.74, 0, 7, back);
  fan(-146, -34, s * 0.56, s * 0.06, 5, mid);
  fan(-124, -56, s * 0.36, s * 0.1, 3, front);
  // The calyx narrows to the stem; three short sepals rise over the petals, and an outline in
  // the ground colour keeps it clear of them.
  const [a, b] = [s * 0.11, s * 0.045]; // half-widths at the rim and at the stem
  const cup = [[rx - a, ry + s * 0.03], [rx - a * 1.25, ry - s * 0.07],
    [rx - a * 0.45, ry - s * 0.01], [rx, ry - s * 0.1], [rx + a * 0.45, ry - s * 0.01],
    [rx + a * 1.25, ry - s * 0.07], [rx + a, ry + s * 0.03], [cx + b, cy], [cx - b, cy]];
  out.push(`<path d="M${pts(cup)}Z" fill="${green}" stroke="${ground}" `
    + `stroke-width="${f(s * 0.03)}" stroke-linejoin="round"/>`);
  return out.join('');
}
// A scroll: an arm out from the stem that ends in a spiral curl.
function scroll(x0, y0, dir, len, curl, color, w) {
  const list = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    list.push([x0 + dir * len * t, y0 + Math.sin(t * Math.PI) * curl * 0.3 - t * curl * 0.25]);
  }
  const [ex, ey] = list[list.length - 1];
  for (let i = 1; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 1.8;
    const r = curl * 0.5 * Math.exp(-0.38 * a);
    list.push([ex + dir * Math.sin(a) * r, ey - curl * 0.5 + Math.cos(a) * r]);
  }
  return stroke(list, color, w);
}
// A carnation leaf: a narrow blade along a curve from its base.
function blade(p0, c, p1, w, fill) {
  const [left, right] = [[], []];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const [x, y] = quad(p0, c, p1, t);
    const [x2, y2] = quad(p0, c, p1, Math.min(1, t + 0.01));
    const [dx, dy] = [x2 - x, y2 - y];
    const k = (w * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7) / 2
      / (Math.hypot(dx, dy) || 1);
    left.push([x - dy * k, y + dx * k]);
    right.unshift([x + dy * k, y - dx * k]);
  }
  return poly([...left, ...right], fill);
}
// The fleuron, w × h mm: the carnation between two leaves and two scrolls, on `ground`.
function fleuron(w, h, petals, green, ground) {
  const [cx, base] = [w / 2, h * 0.9];
  const parts = [-1, 1].map((d) => scroll(cx + d * 0.6, base, d, w * 0.38, h * 0.46, green,
    h * 0.035) + blade([cx + d * 0.8, base - 0.2], [cx + d * w * 0.12, base - h * 0.02],
    [cx + d * w * 0.24, base - h * 0.3], h * 0.07, green));
  return svgOf(w, h, parts.join('') + carnation(cx, base, h * 0.88, petals, green, ground));
}
// The title page: a plum sheet, a double gold frame whose rules cross at the corners
// (Oxford corners), and the carnation in gold between the title and the author.
const FLEURON_Y = 109; // mm: the top of the title page's carnation
function playbillArt(W, H) {
  const out = [`<rect width="${W}" height="${H}" fill="${palette.plum}"/>`];
  const frame = (inset, w, reach) => { // four rules `inset` mm in, running `reach` mm past
    const [a, bx, by] = [inset, W - inset, H - inset];
    for (const [p, q] of [[[a - reach, a], [bx + reach, a]], [[a - reach, by], [bx + reach, by]],
      [[a, a - reach], [a, by + reach]], [[bx, a - reach], [bx, by + reach]]]) {
      out.push(stroke([p, q], palette.gold, w));
    }
  };
  frame(9, 0.55, 3.2);
  frame(11, 0.22, -1.2);
  for (const [x, y] of [[9, 9], [W - 9, 9], [9, H - 9], [W - 9, H - 9]]) {
    out.push(`<circle cx="${x}" cy="${y}" r="0.9" fill="${palette.gold}"/>`);
  }
  const petals = [mix('gold', 'plum', 0.35), palette.gold, mix('paper', 'gold', 0.2)];
  const sprig = fleuron(46, 16, petals, palette.gold, palette.plum)
    .replace(/^<svg[^>]*>|<\/svg>$/g, '');
  out.push(`<g transform="translate(${(W - 46) / 2} ${FLEURON_Y})">${sprig}</g>`);
  return svgOf(W, H, out.join(''));
}
await loadSvg('playbill.svg', playbillArt(TRIM.width, TRIM.height));
await loadSvg('fleuron.svg', fleuron(30, 11, [mix('plum', 'ink', 0.4), mix('plum', 'paper', 0.12),
  mix('plum', 'paper', 0.45)], palette.gold, palette.paper));
const svg = (id, w, h, altText) => ({ id, typeId: 'ornament', kind: 'svg', altText,
  svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 }, createdAt: 0, updatedAt: 0 });
const art = [
  svg('playbill', TRIM.width, TRIM.height, 'A plum title page in a double gold frame whose '
    + 'rules cross at the corners, with a gold carnation between two scrolls.'),
  svg('fleuron', 30, 11, 'Ornament: a plum carnation between two gold scrolls.'),
];
// #endregion
const resources = art;

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Libre Baskerville': ['400', '400i', '700'], 'Abril Fatface': ['400'],
  'Playfair Display SC': ['400'] }; // all loaded before the first build

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: doc.metadata.title }); // the frontmatter's title

// @kit core fonts viewer images
