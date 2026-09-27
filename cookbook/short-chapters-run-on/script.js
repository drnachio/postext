// ═══ Postext Cookbook · Nº 065 · Pocket classic: short chapters that run on ═══════════
// https://postext.dev/en/cookbook/short-chapters-run-on
// Code: MIT · Text: Machado de Assis, Dom Casmurro, 1899 (PD, Gutenberg #55752) · Art: in code
// Fonts: Tinos (Apache 2.0), Abril Fatface, League Spartan (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the viewer's title; the sample is Portuguese
const RECIPE = 'short-chapters-run-on';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#24202a', // the text: a violet near-black
  paper: '#f6f1e6', // the pocket book's paper
  plum: '#4f2a49', // the series colour: cover bands, the plate, the chapter numerals
  saffron: '#d9a03c', // the second ink: rules and drawings, never text on paper (2.1:1)
  muted: '#6b616e', // the running heads and the colophon (5.2:1 on paper)
};
// Design slots read the hex, not the id, in 1.4.1 (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The default bold and italic colours link to main-color, set here to the ink, not blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Tinos', 'Abril Fatface', 'League Spartan'];
const TRIM = { width: 110, height: 178 }; // mm: a pocket book
const [TOP, INNER, OUTER] = [15, 14, 12]; // mm; mirrored, so the inner margin is at the spine
const [BODY, LEAD, LINES] = [9.5, 12.6, 33]; // pt, pt, and the lines of a full page
const PT = 25.4 / 72; // mm per point
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const caps = (size, track) => ({ fontFamily: LABEL, fontWeight: 600, fontSize: pt(size),
  letterSpacing: pt(track), textTransform: 'uppercase' });

// #region answer: chapters that run on, each under a centred head drawn in the column
// Machado's chapters run a page or two, so none opens a page. The level's break is off
// (1.4.1 drops it anyway, gotcha: headings-drop-h1-break, but a release that keeps the H1
// default would open each chapter on a recto) and a chapter starts two lines under the last.
const [NUMERAL, TITLE, TRACK, GAP] = [14, 7.5, 1.3, 1.6]; // pt, pt, pt, mm
const RULE_Y = NUMERAL * PT + GAP + TITLE * 1.2 * PT + GAP; // mm: under the title's line
const chapterHead = { enabled: true, slot: { elements: [ // no span: the head stays in the text
  { kind: 'text', id: 'numeral', content: '{number}', fontFamily: DISPLAY, fontSize: pt(NUMERAL),
    lineHeight: 1, color: col('plum'), align: 'center',
    placement: { ...at('container', 'top'), size: { width: 'fill' } } },
  { kind: 'text', id: 'title', content: '{titleText}', ...caps(TITLE, TRACK), color: col('ink'),
    align: 'center', overflow: 'wrap', // a long title wraps instead of ending in '…'
    placement: { anchor: { to: '#numeral', edge: 'below' }, // centred tracked text sits
      offset: { x: pt(TRACK / 2), y: mm(GAP) }, size: { width: 'fill' } } }, // left by TRACK / 2
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('saffron'),
    placement: { ...at('container', 'top', 0, RULE_Y), size: { width: mm(8) } } },
] } }; // 11.7 mm deep: the head takes three lines, and the text under it stays on the grid
const chapters = { level: 1, numberingTemplate: '{1:I}', // {number} prints CXIX, CXX…
  fontSize: pt(TITLE), // the hidden heading line, measured in the headings' face
  breakBefore: { enabled: false }, marginTop: pt(2 * LEAD), advancedDesign: chapterHead };
// The keep rules are on by default. avoidWidows keeps widowMinLines (2) lines of a paragraph
// at the foot of a page, and headings.keepWithNext takes the head along when the paragraph
// moves on; avoidOrphans keeps two lines at the head of the next page; avoidRunts weighs a
// last line shorter than about 20 characters as a fault. Column balancing adds lines above
// a head so that the page ends on line 33.
// #endregion

// #region text: a pocket page of 33 lines, in Portuguese
const bodyText = { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD),
  color: col('ink'), referenceColor: col('ink'), // for a :ref added later: main-color does
  // not reach it in 1.4.1, and it would print blue
  firstLineIndent: mm(5), // every paragraph indented, the first after a head too
  maxRuntTracking: 0 }; // 1.4.1 measures a runt fix's tracking but never paints it
// (gotcha: runt-tracking-unpainted); the fix keeps its word spacing
const page = { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LEAD * PT), // 16.3 mm
    left: mm(INNER), right: mm(OUTER), mirror: true } };
const LOCALE = 'pt'; // the Portuguese patterns, by their exact code (gotcha: hyphenation-locales)
// #endregion

// #region heads: the book's title over the verso, the chapter over the recto, folios at the foot
const SHIFT = (INNER - OUTER) / 2; // mm: the text block sits off the page's centre
const [HEAD_Y, FOLIO_Y] = [8.5, 167]; // mm below the top edge
const head = (id, content, parity, x) => ({ kind: 'text', id, content, parity,
  pages: 'body', // never on the cover or the plate, which are opener pages
  ...caps(7.5, TRACK), color: col('muted'), align: 'center',
  placement: at('page', 'top', x + (TRACK / 2) * PT, HEAD_Y) }); // tracking, as in the answer
const folio = (id, parity, edge, x) => ({ kind: 'text', id, content: '{pageNumber}', parity,
  pages: 'body', ...caps(7.5, 0), color: col('ink'), placement: at('page', edge, x, FOLIO_Y) });
const header = { elements: [
  head('verso-title', '{title}', 'even', -SHIFT), // the title in the frontmatter
  head('recto-chapter', '{chapterTitle}', 'odd', SHIFT), // last chapter begun on or before it
] };
const footer = { elements: [folio('verso-folio', 'even', 'top-left', OUTER),
  { ...folio('recto-folio', 'odd', 'top-right', -OUTER), align: 'right' }] };
// #endregion

// #region cover: the cover and the plate, heading styles that fill a page each
// span: 'page', in one column too, paints their art whole and keeps the \\ in the title
// (gotcha: opener-clipped-at-top). A :::pagebreak follows each in the text (gotcha:
// cover-pagebreak): 1.4.1 drops the cover's reserved room, since its foot band runs past the
// column (gotcha: opener-taller-than-column), and the plate reserves room down to its caption
// only, since pictures do not count (gotcha: opener-image-no-reserve).
const onPage = (y, size) => ({ ...at('page', 'top', 0, y), ...(size && { size }) });
const cover = { id: 'cover', numbered: false, span: 'page',
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'box', id: 'top-band', style: { backgroundColor: col('plum') },
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: mm(62) } } },
    { kind: 'text', id: 'author', content: '{author}', ...caps(10, 2.4), color: col('paper'),
      align: 'center', placement: at('page', 'top', 1.2 * PT, 44) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(44),
      lineHeight: 1, color: col('plum'), align: 'center', overflow: 'wrap',
      placement: onPage(72, { width: 'fill' }) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5),
      color: col('saffron'), placement: onPage(111, { width: mm(12) }) },
    { kind: 'box', id: 'foot-band', style: { backgroundColor: col('plum') },
      placement: { ...at('page', 'top-left', 0, 124), size: { width: 'fill', height: mm(54) } } },
    { kind: 'image', id: 'roundel', resourceId: 'roundel',
      placement: onPage(133, { width: mm(20) }) },
    { kind: 'text', id: 'series', content: 'Coleção Casuarina', ...caps(7.5, 1.8),
      color: col('saffron'), align: 'center', placement: at('page', 'top', 0.9 * PT, 159) },
  ] } } };
// The plate faces the first page of text: the morning sea off Flamengo, captioned with the
// line of chapter CXXIII it illustrates, which the heading carries in its quote attribute.
const plate = { id: 'plate', numbered: false, span: 'page',
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'sea', resourceId: 'sea',
      placement: { ...at('page', 'top-left'), size: { width: 'fill', height: 'fill' } } },
    { kind: 'text', id: 'label', content: '{titleText}', ...caps(7.5, 1.6), color: col('saffron'),
      align: 'center', placement: at('page', 'top', 0.8 * PT, 146) },
    { kind: 'text', id: 'quote', content: '{attr.quote}', fontFamily: TEXT, italic: true,
      fontSize: pt(8.6), lineHeight: 1.35, color: col('paper'), align: 'center', overflow: 'wrap',
      placement: onPage(152, { width: mm(78) }) },
  ] } } };
const resources = [
  { id: 'roundel', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'roundel.svg', width: 60, height: 60 },
    altText: 'The series mark: a casuarina tree in a ring.' },
  { id: 'sea', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'sea.svg', width: TRIM.width, height: TRIM.height },
    altText: 'A heavy morning sea under the Sugarloaf, with two canoes rowing out.' },
];
// #endregion

// The colophon floats to the foot of the last page, beside the series roundel.
const colophon = { id: 'colophon', placement: 'bottom', backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, marginBottom: pt(0),
  icon: { kind: 'resource', resourceId: 'roundel', size: mm(10) }, titleStyle: { gap: mm(3) },
  body: { fontFamily: TEXT, fontSize: pt(7.6), lineHeight: pt(LEAD * 0.8), color: col('muted'),
    italicColor: col('muted'), textAlign: 'left', firstLineIndent: pt(0) } };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  colorPalette,
  page,
  layout: { layoutType: 'single' },
  bodyText,
  // The heading's own line is hidden under its design but still measured, in this face.
  headings: { fontFamily: LABEL, fontWeight: 600, levels: [chapters] },
  headingStyles: [cover, plate],
  calloutStyles: [colophon],
  header,
  footer,
});

// #region art: the series roundel and the plate, drawn in code in the book's two inks
let seed = 1871; // Mulberry32, seeded: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" `
  + `height="${h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const line = (d, stroke, width, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

// The casuarina of Bento's garden (chapter II): a leaning trunk, and branches that arch out
// on alternate sides and let their needles hang.
function roundelSvg() {
  const { plum, saffron } = palette;
  const out = [`<circle cx="30" cy="30" r="29" fill="${saffron}"/>`,
    line('M30 30m-25.5 0a25.5 25.5 0 1 0 51 0a25.5 25.5 0 1 0 -51 0', plum, 0.9),
    line('M28.6 50Q30.6 33 30.2 10.5', plum, 1.6), line('M18.5 50.2H41.5', plum, 1.3)];
  for (let k = 0; k < 9; k++) {
    const side = k % 2 ? 1 : -1;
    const y0 = 12.5 + k * 3.7;
    const reach = (3 + k * 1.55) * (0.8 + rand() * 0.35);
    const x1 = 30.2 + side * reach;
    const y1 = y0 + 1.2 + rand() * 1.4;
    out.push(line(`M30.2 ${n(y0)}Q${n(30.2 + side * reach * 0.5)} ${n(y0 - 2.2)} ${n(x1)} ${n(y1)}`,
      plum, 0.95));
    const strands = 3 + Math.round(reach / 1.6);
    for (let j = 1; j <= strands; j++) { // needles hang from the arch
      const u = j / (strands + 0.5);
      const x = 30.2 + side * reach * u;
      const y = y0 + (y1 - y0) * u ** 2 - 2.2 * 2 * u * (1 - u) + 0.3;
      out.push(line(`M${n(x)} ${n(y)}q${n(side * 0.4)} ${n(2)} ${n(side * 0.1)} `
        + `${n(3 + rand() * 2.4)}`, plum, 0.7));
    }
  }
  return svg(60, 60, out.join(''));
}

// The plate: the Sugarloaf and Urca in the haze, the sun low beside them, and the swell in
// rows that deepen towards the reader; the nearest one is dark enough to carry the caption.
function seaSvg() {
  const { plum, saffron, paper } = palette;
  const [W, H, SKY, FOOT] = [TRIM.width, TRIM.height, 76, 136]; // mm: horizon, nearest swell
  const out = [];
  for (let i = 0; i < 6; i++) { // the sky in flat bands, warmer towards the horizon
    out.push(`<rect y="${n(i * 13)}" width="${W}" height="${n(SKY - i * 13)}" `
      + `fill="${mix(paper, saffron, 0.12 + i * 0.1)}"/>`);
  }
  out.push(`<circle cx="36" cy="${SKY - 8}" r="10" fill="${saffron}"/>`); // behind the hills
  const hills = `M-2 ${SKY} L6 ${SKY - 4} Q13 ${SKY - 9} 21 ${SKY - 5} L28 ${SKY - 3} `
    + `Q40 ${SKY - 8} 50 ${SKY - 4} Q57 ${SKY - 15} 64 ${SKY - 12} Q68 ${SKY - 11} 70 ${SKY - 7} `
    + `L73 ${SKY - 9} Q76 ${SKY - 41} 84 ${SKY - 40} Q92 ${SKY - 37} 94 ${SKY - 8} `
    + `L104 ${SKY - 3} L112 ${SKY} Z`; // Urca, then the Sugarloaf
  out.push(`<path d="${hills}" fill="${mix(plum, saffron, 0.3)}"/>`);
  out.push(`<rect y="${SKY}" width="${W}" height="${H - SKY}" fill="${plum}"/>`);
  for (let k = 0; k < 5; k++) { // the sun on the water, in broken strokes
    const half = 7 - k * 1.2;
    out.push(line(`M${n(36 - half + rand() * 2)} ${n(SKY + 1 + k * 1.6)}h${n(half * 1.6)}`,
      saffron, 0.8 - k * 0.1));
  }
  // Swell: each row is a filled wave front; later rows overlap the earlier ones.
  const rows = 14;
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    const base = SKY + 3 + (FOOT - SKY - 3) * t ** 1.35;
    const amp = 0.4 + t * 3.2;
    const length = 9 + t * 34;
    const phase = rand() * length;
    const pts = [];
    for (let x = -4; x <= W + 4; x += 1.5) {
      const y = base - amp * Math.sin(((x + phase) / length) * Math.PI * 2)
        - amp * 0.35 * Math.sin(((x + phase) / (length * 0.47)) * Math.PI * 2);
      pts.push(`${n(x)} ${n(y)}`);
    }
    const last = row === rows - 1; // the nearest swell, dark enough to carry the caption
    const tone = last ? mix(plum, '#000000', 0.25)
      : mix(plum, row % 2 ? '#000000' : paper, row % 2 ? 0.04 + t * 0.12 : 0.1 - t * 0.07);
    out.push(`<path d="M${pts.join(' L')} L${W + 4} ${H} L-4 ${H} Z" fill="${tone}"/>`);
    if (row % 2 === 0) { // broken foam along every other crest
      out.push(line(`M${pts.join(' L')}`, mix(plum, paper, 0.45 - t * 0.15), 0.25 + t * 0.3,
        ` stroke-dasharray="${n(3 + t * 9)} ${n(5 + t * 12)}" opacity="0.8"`));
    }
  }
  for (const [x, y, s] of [[22, SKY + 11, 0.8], [61, SKY + 19, 1.15]]) { // the canoes
    const dark = mix(plum, '#000000', 0.55);
    out.push(`<path d="M${n(x)} ${n(y)}q${n(5 * s)} ${n(2.2 * s)} ${n(10 * s)} 0`
      + `q${n(-5 * s)} ${n(0.8 * s)} ${n(-10 * s)} 0Z" fill="${dark}"/>`,
    `<circle cx="${n(x + 4.2 * s)}" cy="${n(y - 2.3 * s)}" r="${n(0.75 * s)}" fill="${dark}"/>`,
    line(`M${n(x + 4.2 * s)} ${n(y - 1.6 * s)}l${n(0.5 * s)} ${n(1.7 * s)}`, dark, 0.9 * s),
    line(`M${n(x + 1.5 * s)} ${n(y - 1.2 * s)}l${n(5.5 * s)} ${n(3.4 * s)}`, dark, 0.35 * s));
  }
  return svg(W, H, out.join(''));
}
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
// Dom Casmurro in Portuguese, in the first edition's spelling: the cover, the plate, then
// pages 213 to 217 (:::numbering in the text), from the end of chapter CXVIII.
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  Tinos: ['400', '400i'], // text, colophon; italic: the plate's quote, the colophon's title
  'Abril Fatface': ['400'], // chapter numerals and the cover title
  'League Spartan': ['600'], // chapter titles, running heads, folios, the cover's capitals
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('roundel.svg', roundelSvg());
await loadSvg('sea.svg', seaSvg());
// #region excerpt: these pages continue a book: chapter CXVIII is under way, the next is CXIX
const continuation = { headings: { h1: 118, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } };
// #endregion
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'Dom Casmurro, a pocket edition',
  es: 'Dom Casmurro, edición de bolsillo' }) });

// @kit core fonts viewer images
