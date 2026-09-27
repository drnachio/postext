// ═══ Postext Cookbook · Nº 064 · Letters edition: datelines and signatures ════════════
// https://postext.dev/en/cookbook/letters-edition
// Code: MIT · Text: Frederick II and Voltaire, letters of 1740 and 1778 (PD) · Cover: drawn in code
// Fonts: Crimson Pro, IM Fell French Canon, IM Fell DW Pica SC (SIL OFL) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'letters-edition';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: iron-gall ink on cream paper, wax red, green morocco and gilt
const palette = {
  ink: '#2a2320', // the text: a warm near-black
  paper: '#f6efe2', // the page, and the lettering on the cover
  seal: '#9c2b24', // the letter numbers, and the wax on the cover
  leather: '#2a4536', // the cover: a green morocco binding
  gilt: '#d0b67c', // its tooled border and the names on it
  rule: '#c8b99f', // the folds drawn on the cover
  muted: '#75695d', // the running heads
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's default colours, the italic of the headnote among them, link to 'main-color';
  // here it is the ink, not the default blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 140, height: 210 }; // the French 14 × 21 format
const LEAD = 14.4; // pt: the body's leading, the grid every letter starts on
const LINES = 33; // lines of text on a full page
const TOP = 22; // mm: the top margin
const MARGIN = { top: TOP, inner: 17.5, outer: 14.5, // mm, mirrored
  bottom: TRIM.height - TOP - (LINES * LEAD * 25.4) / 72 }; // ends the page on line 33
const sc = { fontFamily: 'IM Fell DW Pica SC' }; // its lower case is cut as small capitals
const fell = { fontFamily: 'IM Fell French Canon', italic: true }; // the display italic
const crimson = { fontFamily: 'Crimson Pro' }; // the text face
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });

// #region answer: a letter head read from the heading, and styles for the letter's parts
// Each letter is a level-1 heading that carries its place and date as attributes:
//   # Frédéric à Voltaire {place="À Charlottembourg" date="6 juin 1740"}
// (a value holds no { or }, and one with " goes in single quotes: gotcha attr-values)
const letterHead = { enabled: true, slot: { elements: [
  // {number} prints numberingTemplate '{1:I}' (gotcha: heading-number-placeholders).
  { kind: 'text', id: 'number', content: 'Lettre {number}', ...sc, fontSize: pt(9),
    letterSpacing: pt(1.8), color: col('seal'), placement: at('container', 'top-left') },
  { kind: 'text', id: 'title', content: '{titleText}', ...fell, fontSize: pt(15),
    color: col('ink'),
    placement: at('#number', 'below', 0, 1) },
  // The dateline spans the measure under the title and sets its words flush right.
  { kind: 'text', id: 'dateline', content: '{attr.place}, le {attr.date}.', ...crimson,
    italic: true, fontSize: pt(10.4), color: col('ink'), align: 'right',
    placement: { ...at('#title', 'below', 0, 1.5), size: { width: 'fill' } } },
] } };
// The salutation, the signature and the postscript, each a :::paragraphs{style="…"} container:
//   :::paragraphs{style="signature"}
//   Fédéric.
//   :::
const letterParts = [
  { id: 'vedette', firstLineIndent: pt(0) }, // 'Sire,' on a line of its own, flush left
  { id: 'signature', ...sc, fontSize: pt(10.5), textAlign: 'right', marginTop: pt(LEAD / 2) },
  { id: 'postscript', fontSize: pt(9), lineHeight: pt(12.6), marginTop: pt(LEAD / 2) },
];
// Hooked up below: letterHead designs the level-1 heading, letterParts joins paragraphStyles.
// #endregion

// #region letters: numbered I, II, III and run on, two grid lines apart
const letters = { level: 1, numberingTemplate: '{1:I}', advancedDesign: letterHead,
  // Written out: 1.4.1 drops the H1 page break for any headings object (gotcha:
  // headings-drop-h1-break), and a fixed engine would put each letter on a recto.
  breakBefore: { enabled: false }, marginTop: pt(2 * LEAD),
  // The hidden heading line is measured in the heading face: italic keeps it the IM Fell cut
  // that FONTS loads (gotcha: fonts-first). Upright, it would need the roman, which FONTS
  // leaves out; the layout would change only for a title long enough to wrap.
  italic: true };
// #endregion

// #region running-heads: the correspondents on the verso, the date of the letter on the recto
const HEAD_Y = 12; // mm from the top edge
const head = (id, content, parity, placement, look = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', ...sc, fontSize: pt(8.5), letterSpacing: pt(0.9), color: col('muted'),
  placement, ...look });
const folio = { ...crimson, fontSize: pt(9), letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('page', 'top-left', MARGIN.outer, HEAD_Y), folio),
  head('verso-names', '{author}', 'even', at('page', 'top-left', MARGIN.outer + 8, HEAD_Y)),
  // {attr.date} reads the last letter that starts on or before the page.
  head('recto-date', '{attr.date}', 'odd', at('page', 'top-right', -(MARGIN.outer + 8), HEAD_Y),
    { ...crimson, italic: true, fontSize: pt(9.5), letterSpacing: pt(0) }),
  head('recto-folio', '{pageNumber}', 'odd', at('page', 'top-right', -MARGIN.outer, HEAD_Y),
    folio),
] };
// #endregion

// #region cover: page 1 is a heading style with the drawing and the title; :::pagebreak ends it
// The Markdown: # Mon sort \\ est changé {style="cover"}, then :::pagebreak, or the headnote
// and the first letter start on the cover (gotcha: cover-pagebreak).
const onCover = (y) => at('page', 'top', 0, y); // centred, y mm below the top edge
// numbered: false keeps the cover out of the count, so the first letter is I.
const cover = { id: 'cover', numbered: false,
  // span: 'page' although the book has one column. Kept in the column, the design is clipped
  // to the column's top and bottom (paper above and below the leather, no names) and its title
  // loses the \\ break; page 1 would also count as a 'body' page and print the running heads.
  span: 'page', advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'cover',
      placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } } },
    { kind: 'text', id: 'names', content: '{author}', ...sc, fontSize: pt(9.5),
      letterSpacing: pt(2), color: col('gilt'), placement: onCover(18) },
    // \\ in the heading breaks the title here; lineHeight is a multiple (gotcha:
    // design-lineheight-multiple), and 'wrap' keeps the ellipsis off (overflow-ellipsis-default).
    { kind: 'text', id: 'title', content: '{titleText}', ...fell, fontSize: pt(50),
      lineHeight: 1, color: col('paper'), align: 'center', overflow: 'wrap',
      placement: onCover(24) },
    { kind: 'text', id: 'subtitle', content: '{subtitle}', ...crimson, italic: true,
      fontSize: pt(12), color: col('paper'), placement: onCover(62) },
  ] } } };
// #endregion

// #region text: Crimson Pro at 10/14.4 pt, set in French
// Justification, hyphenation, whole-paragraph line breaking and the widow, orphan and runt
// rules are defaults; locale 'fr' (in the config) picks the French patterns.
// The letters keep the transcription's unspaced ; : ? and !, because a narrow no-break
// space is a place to break the line in 1.4.1 (gotcha: nbsp-breaks).
const bodyText = { fontFamily: 'Crimson Pro', fontSize: pt(10), lineHeight: pt(LEAD),
  color: col('ink'), firstLineIndent: mm(5),
  // No :ref here, but 1.4.1 leaves this one blue whatever main-color says (gotcha:
  // palette-skips-designs), and the default-skin check reads it.
  referenceColor: col('ink'),
  // A word space never shrinks below 75 % of the font's. At the default 60 %, the tightest
  // line on page 5 sets its spaces at 0.70 (each VDT line carries its justifiedSpaceRatio).
  minWordSpacing: 0.75,
  // A runt fix may add tracking 1.4.1 measures but never paints (gotcha:
  // runt-tracking-unpainted); no paragraph here needs one, edited text might.
  maxRuntTracking: 0 };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'fr', // the exact code of the bundled patterns (gotcha: hyphenation-locales)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText,
  // A heading's own line is hidden under its design but still measured, in this face and weight.
  headings: { fontFamily: 'IM Fell French Canon', fontWeight: 400, levels: [letters] },
  headingStyles: [cover],
  paragraphStyles: [...letterParts,
    // Frederick's verses, one paragraph per line (a one-line paragraph is never stretched), with
    // a line of space above and below; the two closing alexandrines start 7 mm further left.
    { id: 'verse', firstLineIndent: mm(14), marginTop: pt(LEAD) },
    { id: 'verse-long', firstLineIndent: mm(7), marginBottom: pt(LEAD) },
    // The editor's headnote at 9.6 on 13 pt, italic through *…* in the Markdown, since a
    // paragraph style has no italic setting.
    { id: 'headnote', fontSize: pt(9.6), lineHeight: pt(13), firstLineIndent: pt(0) },
    { id: 'colophon', fontSize: pt(7.8), lineHeight: pt(10.8), textAlign: 'left',
      firstLineIndent: pt(0), marginTop: pt(3 * LEAD) }],
  header,
  footer: { elements: [] }, // the folios ride in the header
});

// #region art: the cover, drawn in code and seeded: two folded letters on green morocco
let seed = 1740; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k
const W = TRIM.width;
const H = TRIM.height;
const SHEET = mix(palette.paper, '#ffffff', 0.35);
const SHADE = mix(palette.paper, palette.rule, 0.55);

// A line of handwriting in the ink of the text: each word a looped trochoid, one loop per
// letter, about one loop in five twice as tall, slanted forward.
function scrawl(x0, y0, length, size) {
  let d = '';
  let x = x0;
  while (x < x0 + length - size) {
    const loops = 3 + Math.floor(rand() * 5);
    const heights = Array.from({ length: loops }, () => (rand() < 0.22 ? 1.8 : 0.9));
    const pts = [];
    for (let t = 0; t <= loops * Math.PI * 2; t += 0.3) {
      const h = heights[Math.min(loops - 1, Math.floor(t / (Math.PI * 2)))] * size * 0.5;
      const y = -h * (1 - Math.cos(t)); // up and back to the baseline once a letter
      pts.push(`${n(x + t * size * 0.07 - Math.sin(t) * size * 0.18 - y * 0.3)} ${n(y0 + y)}`);
    }
    d += `M${pts.join(' L')}`;
    x += loops * Math.PI * 2 * size * 0.07 + size * (0.8 + rand() * 0.5);
  }
  return `<path d="${d}" fill="none" stroke="${palette.ink}" stroke-width="${n(size * 0.08)}" `
    + 'stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>';
}

// A sheet folded into a packet, turned by `angle` about its centre, shadow first.
function sheet(cx, cy, w, h, angle, inner) {
  const turn = `translate(${cx} ${cy}) rotate(${angle})`;
  return `<g transform="${turn}"><rect x="${n(-w / 2 + 0.8)}" y="${n(-h / 2 + 1.3)}" width="${w}" `
    + `height="${h}" fill="${mix(palette.leather, '#000000', 0.5)}" opacity="0.5"/>`
    + `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${w}" height="${h}" fill="${SHEET}"/>`
    + `${inner(w, h)}</g>`;
}

// The front of the first packet: the address in three lines and a flourish.
const address = (w, h) => scrawl(-w * 0.2, -h * 0.14, w * 0.4, 3)
  + scrawl(-w * 0.34, h * 0.06, w * 0.68, 3) + scrawl(-w * 0.06, h * 0.26, w * 0.42, 3)
  + `<path d="M${n(-w * 0.1)} ${n(h * 0.34)} C${n(w * 0.05)} ${n(h * 0.4)} ${n(w * 0.2)} `
  + `${n(h * 0.28)} ${n(w * 0.33)} ${n(h * 0.33)}" fill="none" stroke="${palette.ink}" `
  + 'stroke-width="0.3" stroke-linecap="round" opacity="0.8"/>';

// The back of the second: two side folds, the top flap down to its tip, and the seal on it.
function sealed(w, h) {
  const tip = [0, h * 0.1];
  const folds = [[-w / 2, h / 2], [w / 2, h / 2]].map(([x, y]) =>
    `<path d="M${n(x)} ${n(y)} L${n(tip[0])} ${n(tip[1])}" stroke="${SHADE}" stroke-width="0.4"/>`);
  const flap = `<path d="M${n(-w / 2)} ${n(-h / 2)} L${n(w / 2)} ${n(-h / 2)} L${n(tip[0])} `
    + `${n(tip[1])} Z" fill="${mix(SHEET, palette.rule, 0.18)}" stroke="${SHADE}" `
    + 'stroke-width="0.35"/>';
  return folds.join('') + flap + seal(tip[0], tip[1] - 1, 8.5);
}

// Sealing wax: an uneven disc, a pressed ring, a six-petal stamp and a light edge.
function seal(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const rr = r * (0.9 + rand() * 0.16 + (i % 9 === 4 ? 0.14 : 0));
    pts.push(`${n(cx + Math.cos(a) * rr)} ${n(cy + Math.sin(a) * rr)}`);
  }
  const dark = mix(palette.seal, palette.ink, 0.35);
  const petals = [0, 60, 120, 180, 240, 300].map((deg) => `<ellipse cx="${n(cx)}" `
    + `cy="${n(cy - r * 0.28)}" rx="${n(r * 0.12)}" ry="${n(r * 0.26)}" fill="${dark}" `
    + `transform="rotate(${deg} ${n(cx)} ${n(cy)})"/>`).join('');
  return `<path d="M${pts.join(' L')} Z" fill="${palette.seal}"/>`
    + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.66)}" fill="none" stroke="${dark}" `
    + `stroke-width="${n(r * 0.07)}"/>${petals}<circle cx="${n(cx)}" cy="${n(cy)}" `
    + `r="${n(r * 0.1)}" fill="${dark}"/><path d="M${n(cx - r * 0.72)} ${n(cy - r * 0.3)} `
    + `A${n(r * 0.8)} ${n(r * 0.8)} 0 0 1 ${n(cx - r * 0.2)} ${n(cy - r * 0.78)}" fill="none" `
    + `stroke="${mix(palette.seal, '#ffffff', 0.35)}" stroke-width="${n(r * 0.07)}" `
    + 'stroke-linecap="round"/>';
}

function coverSvg() {
  // The binding: green leather to the edges, a gilt double fillet and a lozenge at each corner.
  const tooling = [6, 7.6].map((inset, i) => `<rect x="${inset}" y="${inset}" `
    + `width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${palette.gilt}" `
    + `stroke-width="${i ? 0.25 : 0.7}"/>`).join('') + [[6, 6], [W - 6, 6], [6, H - 6],
    [W - 6, H - 6]].map(([x, y]) => `<path d="M${x} ${y - 2.4} L${x + 2.4} ${y} L${x} ${y + 2.4} `
    + `L${x - 2.4} ${y} Z" fill="${palette.gilt}"/>`).join('');
  const body = `<rect width="${W}" height="${H}" fill="${palette.leather}"/>${tooling}`
    + sheet(W / 2 + 9, 152, 90, 58, 7, address) + sheet(W / 2 - 3, 102, 88, 55, -4, sealed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}">${body}</svg>`;
}
// The cover's resource: the design's image element names it by id, and loadSvg() below
// registers the drawing under its fileId.
const resources = [{ id: 'cover', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'cover.svg', width: W * 10, height: H * 10 },
  altText: 'A green leather cover with a gilt double fillet. Two folded letters lie on it: '
    + 'the lower one shows an address in brown-black handwriting, the upper one lies face down, '
    + 'its top flap closed by a red wax seal.' }];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces (gotcha: fonts-first)
  'Crimson Pro': ['400', '400i'], 'IM Fell French Canon': ['400i'], 'IM Fell DW Pica SC': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('cover.svg', coverSvg());
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Letters edition', es: 'Edición de cartas' }) });

// @kit
