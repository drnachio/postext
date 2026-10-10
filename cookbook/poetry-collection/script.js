// ═══ Postext Cookbook · Nº 015 · Poems set line by line ═════════════════════════════
// https://postext.dev/en/cookbook/poetry-collection
// Code: MIT · Text: G. M. Hopkins, Poems, 1918 (PD) · Plate: diffusion models · Sprig: code
// Fonts: Sorts Mill Goudy, Italiana, Marcellus SC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'poetry-collection';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#26221f', // the text: a warm near-black
  sage: '#56673f', // the one accent: numerals, the subtitle, the ornament's leaves
  sepia: '#8c5f3a', // used for the rowan berries only
  muted: '#746a60', // dates, folios, leaders and the colophon
  paper: '#fbf8f2', // the page
};
// The hex travels with the id: designs do not read the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.sage, model: 'hex' } },
];
const TRIM_W = 140, TRIM_H = 216; // mm: a poetry trim, tall enough for a sonnet's turnovers
const LEAD = 15; // pt: the body's leading, the grid every line of verse sits on

// #region answer: verse: a :::verse block keeps each line, its indent, the stanza breaks
// A poem is one :::verse block written as it is printed: a line of verse a line, a blank line
// between stanzas (one line of the grid), and spaces before an indented line, two to an em:
//   :::verse{style="verse" align=start}
//   The world is charged with the grandeur of God.
//       It will flame out, like shining from shook foil;
//
//   And for all this, nature is never spent;
//   :::
// align=start sets the poem flush with the margin (the default centres it on its longest line).
const verse = {
  id: 'verse',
  hangingIndent: em(2), // a turnover hangs 2 em past its line's start: 4 em under a 2 em indent
  // Verse is never hyphenated; ragged text is not in 1.4.1 either (gotcha: ragged-no-hyphenation).
  hyphenation: false,
};
// Hook-up: paragraphStyles: [verse, …]; the Markdown goes to buildDocument as it is written.
// #endregion

// #region lines: the lines around a poem: a dedication above it, a place and a date below
const lineStyles = [
  { id: 'dedication', fontSize: pt(9.5), marginBottom: pt(LEAD) }, // under The Windhover
  { id: 'date', fontFamily: 'Marcellus SC', fontSize: pt(8), color: col('muted'),
    textAlign: 'right', marginTop: pt(LEAD) }, // a line of space above, flush right
];
// #endregion

// #region poem-head: every poem opens a page under its numeral and its title
// '{1:I}' numbers the poems I to IV and {number} prints it (gotcha: heading-number-placeholders).
// The head is HEAD_LINES grid lines (minHeight, no bottom margin), so each poem starts on the same
// line; numeral and title fill 4, or 5 if the title wraps (gotcha: overflow-ellipsis-default).
const HEAD_LINES = 6;
const poemHead = { enabled: true, minHeight: pt(LEAD * HEAD_LINES), slot: { elements: [
  { kind: 'text', id: 'numeral', content: '{number}', fontFamily: 'Italiana', fontSize: pt(22),
    color: col('sage'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Sorts Mill Goudy',
    italic: true, fontSize: pt(17), color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: '#numeral', edge: 'below' }, offset: { y: mm(2) },
      size: { width: 'fill' } } },
] } };
// Parity 'any': the next page, recto or verso (restated: gotcha headings-drop-h1-break).
const poems = { level: 1, numberingTemplate: '{1:I}', advancedDesign: poemHead,
  marginBottom: pt(0), breakBefore: { enabled: true, parity: 'any' } };
// #endregion

// #region front: the half-title, the frontispiece, the title page and the contents
// Headings too, each on a page of its own, with no number, contents entry or folio.
// A style restates the break, or inherits the poems' (gotcha: style-inherits-break).
const leaf = { numbered: false, toc: false, span: 'page', footer: { elements: [] },
  breakBefore: { enabled: true, parity: 'any' } };
const onPage = (y, width) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) },
  ...(width && { size: { width: mm(width) } }) }); // centred, y mm below the trim
const face = (id, content, font, size, y, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), color: col('ink'), align: 'center',
  placement: onPage(y), ...extra });
const image = (id, placement) => ({ kind: 'image', id, resourceId: id, placement });
const design = (...elements) => ({ enabled: true, slot: { elements } });
const front = [
  { id: 'half-title', ...leaf,
    advancedDesign: design(face('title', '{titleText}', 'Italiana', 20, 60)) },
  { id: 'plate', ...leaf, advancedDesign: design( // span 'page': a column clips its design
    image('plate', { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } }),
    face('caption', '{attr.caption}', 'Sorts Mill Goudy', 8.5, 203,
      { italic: true, color: col('muted') })) },
  { id: 'title-page', ...leaf, advancedDesign: design(
    face('author', '{author}', 'Marcellus SC', 10, 46, // {author}, {title}: the frontmatter
      { letterSpacing: pt(2.4), textTransform: 'uppercase' }),
    // A multiple of the size, never pt() (gotcha: design-lineheight-multiple).
    face('title', '{title}', 'Italiana', 54, 56, { lineHeight: 1 }),
    face('subtitle', '{subtitle}', 'Sorts Mill Goudy', 13, 80,
      { italic: true, color: col('sage') }),
    image('sprig', onPage(96, 30)),
    face('press', 'The Herbarium Press', 'Marcellus SC', 8.5, 182,
      { letterSpacing: pt(1.8), color: col('muted') })) },
  { id: 'contents', ...leaf, span: 'column', advancedDesign: { enabled: false },
    fontFamily: 'Italiana', fontSize: pt(24), lineHeight: pt(LEAD * 2), marginBottom: pt(LEAD) },
];
// #endregion

// #region contents: what :::toc prints for each poem: numeral, italic title, leader, page
// The toc centres each numeral on its line, not on the baseline (gotcha: toc-number-baseline);
// left at the titles' size, these Italiana numerals land on it, where 9 pt ones rode high.
const contents = {
  levels: [{ level: 1, italic: true, marginBottom: pt(LEAD), numberFontFamily: 'Italiana',
    numberFontWeight: 400, numberColor: col('sage'), numberWidth: mm(6), numberGap: mm(3) }],
  pageNumber: { fontFamily: 'Marcellus SC', fontSize: pt(9), color: col('muted'), width: mm(6) },
  leader: { char: '. ', gap: mm(2) }, // spaced dots, right-aligned so they line up
};
// #endregion

// #region ornament: a resource type for artwork that prints no caption and no label
// No caption prefix and no caption: the sprig prints bare, where ::resource{id="sprig"} puts
// it (double quotes: gotcha resource-double-quotes), a fifth of the measure wide, centred.
const ornament = { id: 'ornament', name: 'Ornament', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.2, align: 'center' } };
// #endregion

const proseStyles = [ // the note on the text and the colophon, under the contents
  { id: 'note', fontSize: pt(9.5), lineHeight: pt(13) },
  { id: 'colophon', fontSize: pt(8), lineHeight: pt(11), color: col('muted'), textAlign: 'left',
    firstLineIndent: pt(0), marginTop: pt(LEAD) },
];
const folio = (pages) => ({ kind: 'text', id: `folio-${pages}`, content: '{pageNumber}', pages,
  fontFamily: 'Marcellus SC', fontSize: pt(9), color: col('muted'), align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(10) } } });

const config = () => ({
  colorPalette,
  // The list replaces Figure and Table; a book with figures spreads defaultResourceTypes() in.
  resourceTypes: [ornament],
  page: { // mirror: left is the inner margin; 150 dpi is for the screen
    sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(22), bottom: mm(24), left: mm(22), right: mm(18), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: { // the note's prose: justified, hyphenated (en-us), spaces 0.8–1.6 of normal
    fontFamily: 'Sorts Mill Goudy', fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4),
    indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.6,
  },
  headings: {
    fontFamily: 'Sorts Mill Goudy', fontWeight: 400, color: col('ink'),
    levels: [poems, { level: 2, fontFamily: 'Marcellus SC', fontSize: pt(9), lineHeight: pt(LEAD),
      color: col('sage'), marginTop: pt(0), marginBottom: pt(0) }],
  },
  headingStyles: front,
  toc: contents,
  paragraphStyles: [verse, ...lineStyles, ...proseStyles],
  header: { elements: [] }, // no running heads: each poem starts a page under its own title
  footer: { elements: [folio('opener'), folio('body')] }, // centred; never on a blank page
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a rowan sprig for the ornament, drawn in code; the plate is a JPEG in assets/
const f = (n) => n.toFixed(1);
const path = (d, fill, a = 1) => `<path d="${d}" fill="${fill}" fill-opacity="${a}"/>`;
const ring = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const disk = (x, y, r, fill, a = 1) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" `
  + `fill="${fill}" fill-opacity="${a}"/>`;
const PX = 10; // a drawing w × h mm has a viewBox in tenths of a millimetre, w·PX × h·PX
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w * PX} ${h * PX}">${body}</svg>`;
// A cubic Bézier and its unit normal at t.
const bez = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  const coord = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i]
    + t * t * t * p3[i];
  const dt = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i])
    + 3 * t * t * (p3[i] - p2[i]);
  const [dx, dy] = [dt(0), dt(1)];
  const len = Math.hypot(dx, dy) || 1;
  return { x: coord(0), y: coord(1), a: Math.atan2(dy, dx), nx: -dy / len, ny: dx / len };
};
// A stalk: the curve drawn as a filled band tapering from w0 to w1.
const stalk = (curve, w0, w1) => {
  const left = [];
  const right = [];
  for (let i = 0; i <= 40; i++) {
    const p = bez(curve, i / 40);
    const w = (w0 + (w1 - w0) * (i / 40)) / 2;
    left.push([p.x + p.nx * w, p.y + p.ny * w]);
    right.unshift([p.x - p.nx * w, p.y - p.ny * w]);
  }
  return ring([...left, ...right]);
};
// A leaf blade from its base (x, y) along angle a: length l, half-width w, `teeth` serrations.
const blade = (x, y, a, l, w, teeth = 0) => {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const side = (sign) => Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    let h = w * Math.sin(Math.PI * t ** 0.85) ** 0.9;
    if (teeth && t > 0.25) h *= 1 - 0.18 * ((t * teeth) % 1);
    return at(l * t, sign * h);
  });
  return ring([...side(1), ...side(-1).reverse()]);
};
// The ornament: a rowan leaf laid flat, with a bunch of berries at its tip.
function sprig() {
  const [w, h] = [36, 12];
  const rib = [[16, 66], [90, 56], [170, 56], [236, 60]];
  const d = [stalk(rib, 6, 3)];
  for (let j = 0; j < 5; j++) {
    const q = bez(rib, 0.12 + j * 0.19);
    const size = 50 - j * 3;
    for (const sgn of [1, -1]) d.push(blade(q.x, q.y, q.a + sgn * 1.1, size, size * 0.22, 8));
  }
  const tip = bez(rib, 1);
  d.push(blade(tip.x, tip.y, tip.a, 44, 10.5, 8));
  const out = [path(d.join(''), palette.sage)];
  for (const [dx, dy, r] of [[34, -16, 9], [44, 2, 10], [30, 14, 9], [52, -12, 8.5],
    [58, 10, 8], [22, -2, 8]]) {
    const [bx, by] = [262 + dx, 60 + dy];
    out.push(path(stalk([[240, 64], [252, 66], [bx - 10, by + 2], [bx, by]], 2.6, 1.8),
      palette.sage), disk(bx, by, r, palette.sepia));
  }
  return svgOf(w, h, out.join(''));
}

await loadSvg('sprig.svg', sprig());
// The frontispiece is a photogram: the whole 140 × 216 mm page, its torn coating and the paper
// under it in one JPEG, declared at its pixels.
await loadImage('plate-1120.jpg', asset('plate-1120.jpg'));

// Nothing cites them: designs show the plate and the sprig, ::resource sets the tailpiece.
const svgResource = (id, w, h, altText) => ({ id, typeId: 'ornament', kind: 'svg', altText,
  createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } });
const resources = [
  { id: 'plate', typeId: 'ornament', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'plate-1120.jpg', format: 'jpeg', width: 1120, height: 1728 },
    altText: 'A photogram of a fern frond and a sprig of rowan in berry, left white on a '
      + 'brushed sage ground.' },
  svgResource('sprig', 36, 12, 'Ornament: a rowan leaf with a bunch of berries.'),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build. None of the three ships a bold.
const FONTS = { 'Sorts Mill Goudy': ['400', '400i'], Italiana: ['400'], 'Marcellus SC': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// :::toc lists the page each poem lands on: the build lays out again until those settle.
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: 'Pied Beauty · four poems by Gerard Manley Hopkins' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
