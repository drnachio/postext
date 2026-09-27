// ═══ Postext Cookbook · Nº 030 · Anthology with bylines ═══════════════════════════════
// https://postext.dev/en/cookbook/anthology-with-bylines
// Code: MIT · Text: Hazlitt, Thoreau, Stevenson (public domain) · Cover: generated (CC BY 4.0)
// Fonts: Spectral, Gloock, Hanken Grotesk (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'anthology-with-bylines';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: heather for the credits, rust for the numbers, plum ink on warm paper
const palette = {
  ink: '#241f26', // text: a plum-tinted near-black
  paper: '#f7f2e8', // the page
  heather: '#6b4468', // the bylines and the authors in the contents
  rust: '#a4502a', // the essay numbers, and the cover's sun
  rule: '#d5cabd', // hairlines
  muted: '#6d6570', // running heads, datelines, page numbers in the contents
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the ink, so nothing prints blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 135, height: 180 }; // a pocket book, 3 : 4
const MARGIN = { top: 20, bottom: 22, inner: 19, outer: 15 }; // mirrored
const LEAD = 14; // body leading in pt: the baseline grid
const SINK = 12; // grid lines an essay opener reserves above its first line of text
const HEAD = { y: 11, gap: 7 }; // running heads: mm from the top edge, folio to words
const label = { fontFamily: 'Hanken Grotesk', fontWeight: 600, textTransform: 'uppercase',
  align: 'left' }; // design text is centred by default
// One weight, no italic; 'wrap' breaks a long title (gotcha: overflow-ellipsis-default).
const gloock = { fontFamily: 'Gloock', overflow: 'wrap', align: 'left' };
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const below = (id, y, size) => ({ ...at(`#${id}`, 'below', 0, y), ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, ...look, placement });

// #region answer: one set of heading attributes, read in three places
// Each essay's heading carries its credits, and every {attr.…} below reads them:
//   # Walking {author="Henry David Thoreau" year="1862" source="The Atlantic Monthly"}
// (a value cannot hold { or }, and one with " goes in single quotes; gotcha: attr-values)
// 1 · The opener: inside a heading's design, {attr.author} is that heading's attribute.
const byline = [
  text('byline', '{attr.author}', { ...label, fontSize: pt(8), letterSpacing: pt(1.6),
    color: col('heather') }, below('title', 5)),
  text('dateline', '{attr.source}, {attr.year}', { fontFamily: 'Spectral', italic: true,
    fontSize: pt(9.5), color: col('muted'), align: 'left' }, below('byline', 1.2)),
];
// 2 · The verso running head (head() is in the running-heads region): in the page header,
//     {attr.author} is the attribute of the essay the page belongs to.
const versoAuthor = head('verso-author', '{attr.author}', 'even',
  at('page', 'top-left', MARGIN.outer + HEAD.gap, HEAD.y));
// 3 · The contents: toc.subtitle prints the attribute it names as a line under each title.
//     'author' and italic are the defaults; attr is written out so it can become 'source'.
const authorLine = { enabled: true, attr: 'author', fontFamily: 'Spectral', fontSize: pt(10),
  color: col('heather') };
// Hooked up below: byline → the opener, versoAuthor → header, authorLine → toc.subtitle.
// A heading without author="…" gets an empty byline and running head and no line in the
// contents, and the build gives no warning: check every heading.
// #endregion

// #region opener: the essay's number and title, then the byline, over a sunk first line
const opener = { enabled: true,
  // The hairline ends 7 mm above the foot of this reserve, so the text starts on the same grid
  // line under every opener whose title fits on one line (SINK = 14 holds a two-line title).
  minHeight: pt(SINK * LEAD),
  slot: { elements: [
    // {number} prints numberingTemplate '{1:I}': I, II, III. {numberRoman} would print
    // nothing here: it is filled on part pages only (gotcha: heading-number-placeholders).
    text('number', '{number}', { ...gloock, fontSize: pt(34), lineHeight: 1, color: col('rust') },
      at('container', 'top-left', 0, 8)),
    text('title', '{titleText}', { ...gloock, fontSize: pt(26), lineHeight: 1.08,
      color: col('ink') }, below('number', 3, { width: 'fill' })),
    ...byline,
    { kind: 'rule', id: 'rule', thickness: pt(0.5), color: col('rule'),
      placement: below('dateline', 6) }, // a horizontal rule runs to the column's edge
  ] } };
const essays = { level: 1, numberingTemplate: '{1:I}', advancedDesign: opener,
  marginBottom: pt(0), // the heading's default margin would add to minHeight
  // Restated (gotcha: headings-drop-h1-break); the cover and contents styles inherit it too.
  breakBefore: { enabled: true, parity: 'any' } }; // 'any': each piece opens on the next page
// #endregion

// #region contents: the essays' numbers, titles, leaders and page labels, from the headings
const ENTRY = 15; // pt: the essay titles in the contents
const MIDDLE = 0.3125; // em: how far Chrome's textBaseline 'middle' sits above Gloock's baseline
const contents = { // passed to the config as `toc`
  // 1.4.1 centres an entry's number 0.3 × the entry size above its baseline (gotcha:
  // toc-number-baseline): at 0.3 × 15 ÷ 0.3125 = 14.4 pt a Gloock numeral stands on it.
  levels: [{ level: 1, fontFamily: 'Gloock', fontSize: pt(ENTRY), color: col('ink'),
    numberFontSize: pt((0.3 * ENTRY) / MIDDLE), numberFontWeight: 400, // Gloock has one weight
    numberColor: col('rust'), numberWidth: mm(8), numberGap: mm(3), marginBottom: pt(LEAD) }],
  pageNumber: { fontFamily: 'Hanken Grotesk', fontSize: pt(8.5), fontWeight: 600,
    color: col('muted'), width: mm(6) }, // the leader dots take this face and colour too
  leader: { char: '. ', gap: mm(2) }, // spaced dots, right-aligned so they line up
  subtitle: authorLine,
};
// #endregion

// #region running-heads: author on the verso, essay title on the recto, folios outside
// Each head: the label face, the pages of its parity, never an opener (pages: 'body'), where
// the byline names the author. A function declaration, so the answer above can call it.
function head(id, content, parity, placement, look = {}) {
  return { ...text(id, content, { ...label, fontSize: pt(7.5), letterSpacing: pt(1.3),
    color: col('muted'), ...look }, placement), parity, pages: 'body' };
}
const folio = { color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('page', 'top-left', MARGIN.outer, HEAD.y), folio),
  versoAuthor,
  head('recto-title', '{chapterTitle}', 'odd',
    at('page', 'top-right', -(MARGIN.outer + HEAD.gap), HEAD.y), { align: 'right' }),
  head('recto-folio', '{pageNumber}', 'odd', at('page', 'top-right', -MARGIN.outer, HEAD.y),
    { ...folio, align: 'right' }),
] };
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', // an opener's folio
  at('container', 'top', 0, 9), { ...folio, align: 'center' }), pages: 'opener' }] };
// #endregion

// #region front: the cover and the contents page, two headings kept out of the count
// Unnumbered, so the first essay is I; unlisted; and with no running heads or folio. They
// inherit the level's page break, 'any' (gotcha: style-inherits-break).
const bare = { numbered: false, toc: false, header: { elements: [] }, footer: { elements: [] } };
const cover = { enabled: true, slot: { elements: [
  { kind: 'image', id: 'art', resourceId: 'cover',
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } } },
  text('title', '{titleText}', { ...gloock, fontSize: pt(80), lineHeight: 1, color: col('ink') },
    at('page', 'top-left', MARGIN.inner, 22)), // page 1 is a recto: the inner margin is left
  text('subtitle', '{subtitle}', { fontFamily: 'Spectral', italic: true, fontSize: pt(14),
    color: col('ink'), align: 'left' }, below('title', 1)),
  text('authors', '{attr.authors}', { ...label, fontSize: pt(8.5), letterSpacing: pt(2),
    color: col('heather') }, below('subtitle', 5)),
  text('imprint', '{attr.imprint}', { ...label, fontSize: pt(7.5), letterSpacing: pt(1.8),
    color: col('paper') }, at('page', 'bottom-left', MARGIN.inner, -12)),
] } };
// span: 'page' in a one-column book: a design kept in the column is clipped at the column's top
// and bottom edges, which would leave bands of paper above and below the dusk.
const coverStyle = { id: 'cover', ...bare, span: 'page', advancedDesign: cover };
const contentsOpener = { enabled: true, slot: { elements: [ // {title}, {subtitle}: frontmatter
  text('kicker', '{title} · {subtitle}', { ...label, fontSize: pt(8), letterSpacing: pt(1.6),
    color: col('heather') }, at('container', 'top-left', 0, 8)),
  text('title', '{titleText}', { ...gloock, fontSize: pt(26), color: col('ink') },
    below('kicker', 2.5)),
] } };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Spectral', fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    minWordSpacing: 0.7, maxWordSpacing: 1.6, // tighter than the 0.6–2 defaults
    maxRuntTracking: 0 }, // tracking 1.4.1 never paints (gotcha: runt-tracking-unpainted)
  // The hidden heading line is still measured, in this face; otherwise the build needs Open Sans.
  headings: { fontFamily: 'Gloock', fontWeight: 400, levels: [essays] },
  headingStyles: [coverStyle, { id: 'contents', ...bare, advancedDesign: contentsOpener }],
  toc: contents,
  // Quoted verse, one paragraph per line (a paragraph keeps no line breaks, and 1.4.1 prints a
  // Markdown blockquote in a fixed #666666 grey); 'runon' resumes the sentence after it.
  paragraphStyles: [{ id: 'verse', firstLineIndent: mm(8), textAlign: 'left' },
    { id: 'runon', firstLineIndent: pt(0) },
    // In the note, under a :::space: a style's margins do not count inside a box (gotcha:
    // box-paragraph-margins). It takes the note body's indent, 0.
    { id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10.5), color: col('muted') }],
  calloutStyles: [{ id: 'note', placement: 'fixed', backgroundEnabled: false, // the page foot
    stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
    padding: { top: mm(3), right: pt(0), bottom: pt(0), left: pt(0) },
    titleStyle: { ...label, fontSize: pt(7.5), letterSpacing: pt(1.5), color: col('heather') },
    body: { fontSize: pt(9), lineHeight: pt(12.5), firstLineIndent: pt(0) } }],
  header, footer,
});

// #region art: the cover, drawn in code and seeded: the same dusk on every run
let seed = 1822; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k
const SKY = '#f2d6ae'; // apricot dusk
const RISE = 10; // mm the whole landscape is lifted, so the card's crop takes in more of it
const W = TRIM.width;
const H = TRIM.height;

// A ridge line: a few slow waves with seeded phases, sampled every millimetre.
function ridge(base, waves) {
  const phases = waves.map(() => rand() * Math.PI * 2);
  return (x) => base - RISE
    + waves.reduce((y, [amp, len], i) => y + amp * Math.sin(x / len + phases[i]), 0);
}
const fillUnder = (f, colour) => {
  let d = `M-1 ${n(f(-1))}`;
  for (let x = 0; x <= W + 1; x += 1) d += ` L${x} ${n(f(x))}`;
  return `<path d="${d} L${W + 1} ${H + 1} L-1 ${H + 1} Z" fill="${colour}"/>`;
};

// The footpath: a ribbon from the foot of the page to a fold of the near hill, narrowing
// with distance. s runs from 0 at the far end to 1 at the foot of the page.
const [NEAR, FAR] = [[98, H + 2], [60, 128 - RISE]];
const pathAt = (s) => [ // x, y and width in mm: the bends and the width shrink with distance
  FAR[0] + (NEAR[0] - FAR[0]) * s + 13 * s * Math.sin(Math.PI * (1 - s) * 2.1),
  FAR[1] + (NEAR[1] - FAR[1]) * s ** 1.5, 0.5 + 15 * s ** 1.7];
function footpath(from = 0) { // the part nearer than `from`
  const left = [];
  const right = [];
  for (let i = 0; i <= 80; i++) {
    const s = from + (1 - from) * (i / 80);
    const [x, y, w] = pathAt(s);
    left.push(`${n(x - w / 2)} ${n(y)}`);
    right.unshift(`${n(x + w / 2)} ${n(y)}`);
  }
  const fill = mix(SKY, palette.paper, 0.35);
  return `<path d="M${left.join(' L')} L${right.join(' L')} Z" fill="${fill}"/>`;
}

function coverSvg() {
  const layers = [ // far to near: base line, [amplitude, wavelength] waves, colour
    [98, [[3, 14], [2, 6]], mix(palette.heather, SKY, 0.72)],
    [108, [[4, 18], [1.5, 7]], mix(palette.heather, SKY, 0.55)],
    [119, [[5, 22], [2, 9]], mix(palette.heather, SKY, 0.36)],
    [133, [[6, 26], [2, 11]], mix(palette.heather, palette.ink, 0.12)],
    [152, [[7, 30], [2.5, 12]], mix(palette.heather, palette.ink, 0.62)],
  ].map(([base, waves, colour]) => ({ f: ridge(base, waves), colour }));
  const sky = '<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">' // paler at the ridge
    + `<stop offset="0" stop-color="${mix(SKY, palette.rust, 0.1)}"/>`
    + `<stop offset="0.55" stop-color="${mix(SKY, palette.paper, 0.5)}"/></linearGradient>`
    + `<rect width="${W}" height="${H}" fill="url(#dusk)"/>`;
  const sun = `<circle cx="101" cy="${96 - RISE}" r="13" fill="${mix(palette.rust, SKY, 0.12)}"/>`;
  const birds = [[113, 66, 1.6], [119, 62, 1.2], [108, 71, 1]].map(([x, y, w]) => '<path '
    + `d="M${n(x - w)} ${n(y - 0.4)} Q${n(x - w / 2)} ${n(y - 1)} ${x} ${y} `
    + `Q${n(x + w / 2)} ${n(y - 1)} ${n(x + w)} ${n(y - 0.4)}" fill="none" `
    + `stroke="${palette.ink}" stroke-width="0.35" stroke-linecap="round"/>`).join('');
  const [far1, far2, mid, near, fore] = layers;
  // Three trees on the middle ridge, and hedgerows across the near hill as rows of shrubs.
  const dark = mix(palette.heather, palette.ink, 0.45);
  const copse = [[106, 2.4, 3.2], [111.5, 1.8, 2.6], [116, 2.9, 3.6]].map(([x, r, trunk]) => {
    const foot = mid.f(x) + 0.6;
    return `<path d="M${x} ${n(foot)} V${n(foot - trunk)}" stroke="${dark}" stroke-width="0.7"/>`
      + `<ellipse cx="${x}" cy="${n(foot - trunk - r * 0.8)}" rx="${n(r * 0.85)}" ry="${n(r)}" `
      + `fill="${dark}"/>`;
  }).join('');
  let hedges = '';
  for (const [dy, x0, x1, s] of [[5, -1, 52, 0.8], [11, 70, W + 1, 1], [17, -1, 40, 1.25]]) {
    for (let x = x0; x < x1; x += (2 + rand() * 0.8) * s) { // s: nearer rows, bigger shrubs
      if (rand() < 0.1) continue; // a gap in the hedge
      const y = near.f(x) + dy + Math.sin(x / 9) * 1.5 + rand() * 0.4 * s;
      hedges += `<circle cx="${n(x)}" cy="${n(y)}" r="${n((0.7 + rand() * 0.4) * s)}" `
        + `fill="${mix(palette.heather, palette.ink, 0.6)}"/>`;
    }
  }
  // The near stretch of the path starts just behind the crest it comes over.
  let crest = 0;
  while (crest < 1 && pathAt(crest)[1] < fore.f(pathAt(crest)[0]) - 1) crest += 0.005;
  const body = sky + sun + birds + fillUnder(far1.f, far1.colour) + fillUnder(far2.f, far2.colour)
    + fillUnder(mid.f, mid.colour) + copse + fillUnder(near.f, near.colour) + hedges + footpath()
    + fillUnder(fore.f, fore.colour) + footpath(crest);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}">${body}</svg>`;
}
// The cover's resource: the design's image element names it by id, and loadSvg() below
// registers the drawing under its fileId.
const resources = [{ id: 'cover', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'cover.svg', width: TRIM.width * 10, height: TRIM.height * 10 },
  altText: 'Hills at dusk in five layers, from dusty rose to deep heather, a low rust sun, '
    + 'three trees on a ridge, hedgerows across the near hill and a pale footpath winding up '
    + 'from the foot of the page.' }];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces (gotcha: fonts-first)
  Spectral: ['400', '400i'], Gloock: ['400'], 'Hanken Grotesk': ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('cover.svg', coverSvg());
await loadFonts(FONTS, markdown);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Anthology with bylines', es: 'Antología con firmas de autor' }) });

// @kit
