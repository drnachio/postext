// ═══ Postext Cookbook · Nº 006 · Front matter: roman folios, then page 1 ═══════════
// https://postext.dev/en/cookbook/front-matter-roman-to-arabic
// Code: MIT · Text: M. & P. B. Shelley, 1818 (PD) · Drawings: generated in code (CC BY 4.0)
// Fonts: Fanwood Text, Playfair Display SC, Cinzel (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'front-matter-roman-to-arabic';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these
  ink: '#1c1d21', // text: a cold near-black
  accent: '#3d5a70', // steel blue, the one accent on paper: contents folios, the rule, the marks
  muted: '#6a665f', // running heads, sources, the second lines of the contents
  paper: '#fbf8f2', // the page
  night: '#131a24', ice: '#a9c6d6', bone: '#efe9dc', // the drawings' inks, and the type on them
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const TRIM_W = 129, TRIM_H = 198; // mm: a pocket classic
const TOP = 21, BOTTOM = 23, INNER = 17, OUTER = 15; // margins, mm; heads align to OUTER
const MEASURE = TRIM_W - INNER - OUTER; // 97 mm: the text block, and the frontispiece's width
const LEAD = 14; // body leading in pt: 31 lines fill the text block
const PREFACE = { size: 9.8, lead: 13.3 }; // pt: the preface, a size under the novel's 10.5/14

// Design-slot shorthands. at(): a placement from an anchor's edge; edge 'top' centres it.
const wide = (width) => (width === 'fill' ? 'fill' : mm(width));
const at = (edge, x, y, { width, to = 'container' } = {}) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(width !== undefined && { size: { width: wide(width) } }) });
const onPage = (y) => at('top', 0, y, { to: 'page' }); // centred on the page, y mm from the trim
const on = (id) => ({ color: col(id) }); // a design text's ink
// overflow 'wrap', or a text too wide ends in '…' (gotcha: overflow-ellipsis-default). A number
// lineHeight multiplies the size; never pt() (gotcha: design-lineheight-multiple).
const text = (id, content, font, size, placement, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: font, fontSize: pt(size), color: col('ink'), align: 'center', overflow: 'wrap',
  placement, ...extra });
const label = (id, content, size, placement, ink, tracking) => text(id, content, 'Cinzel', size,
  placement, { fontWeight: 600, letterSpacing: pt(tracking), textTransform: 'uppercase',
    ...on(ink) }); // the label voice: Cinzel capitals, tracked
const image = (id, placement) => ({ kind: 'image', id, resourceId: id, placement });
// A heading's design. minHeight (mm) where the text must start lower than the elements reach.
const design = (elements, minHeight) => ({ enabled: true, slot: { elements },
  ...(minHeight !== undefined && { minHeight: mm(minHeight) }) });
// The prelims' openers: a centred title in small capitals on white space, and the preface's
// text a size smaller than the novel's, on its own leading.
const FRONT_DROP = 46; // mm from the text block's top to the first line of text
const frontLook = {
  advancedDesign: design([text('title', '{titleText}', 'Playfair Display SC', 19,
    at('top', 0, 14), { letterSpacing: pt(1.6) })], FRONT_DROP),
  bodyStyle: { fontSize: pt(PREFACE.size), lineHeight: pt(PREFACE.lead) },
};

// #region answer: roman folios for the front matter and arabic from Letter I, in one design
// The page counter starts in lower-case roman: the cover is page i. After the Preface, two
// directives in the Markdown count again from 1 on the next recto:
//   :::pagebreak{parity="odd"}
//   :::numbering{format="decimal" startAt=1}
// :::numbering takes effect on the next page that starts (gotcha: numbering-next-page). Level 1
// breaks to 'odd', so here the pagebreak changes nothing; it finds the recto when a level breaks
// with parity 'any' or not at all. Never with 'always-odd': the blank pages would stack up.
const pageNumbering = { format: 'lower-roman', startAt: 1 }; // startAt spelled out: cover = i
// One folio design, centred under the text block. {pageNumber} prints the page's own label,
// so the same design sets "x" in the front matter and "1" on the first page of the novel.
const folio = (pages) => text(`folio-${pages}`, '{pageNumber}', 'Playfair Display SC', 8.5,
  at('top', 0, 9), { letterSpacing: pt(0.8), pages }); // lower case sets as small capitals
// The front matter is a heading style, unnumbered and left out of the contents (a heading
// can opt back in with {toc="true"}). It prints no running heads and puts a folio on every
// page of the section. Parity 'any', because the contents fall on a verso.
const front = {
  id: 'front', numbered: false, toc: false, breakBefore: { enabled: true, parity: 'any' },
  header: { elements: [] }, footer: { elements: [folio('all')] }, ...frontLook,
};
// The novel keeps the document's furniture: heads on its body pages, the folio on openers.
const footer = { elements: [folio('opener')] };
// Hook-up in config(): page: { pageNumbering }, headingStyles: [front] and footer at the top
// level. frontLook, set above, is the look of the prelims' openers.
// #endregion

// #region leaves: the cover and the preliminary leaves, headings that print a design only
// Each leaf is a heading, so it opens its page, gets a PDF bookmark and takes a design. The
// leaves are unnumbered, left out of the contents and print no heads or folio (blind folios).
// Parity 'any', or each would inherit level 1's odd break (gotcha: style-inherits-break).
const blind = { numbered: false, toc: false, breakBefore: { enabled: true, parity: 'any' },
  header: { elements: [] }, footer: { elements: [] } };
const PLATE_H = 126; // mm: the frontispiece, as wide as the text block; its caption hangs below
// mm from the trim: the imprint's eleven lines end on the text block's last baseline.
const IMPRINT_TOP = 116.5; // re-tune it whenever the imprint changes
const leaves = [
  // i: bled to the trim. Type below the text block's foot would drop the heading's reserve.
  { id: 'cover', ...blind, advancedDesign: design([
    image('cover', at('top-left', 0, 0, { width: 'fill', to: 'bleed' })),
    label('author', '{author}', 9, onPage(22), 'bone', 2.6),
    text('title', '{title}', 'Fanwood Text', 56, onPage(31), { color: col('bone'), lineHeight: 1 }),
    text('subtitle', '{subtitle}', 'Fanwood Text', 13, onPage(53), { ...on('ice'), italic: true }),
    label('series', '{attr.publisher}', 7, onPage(168), 'ice', 2),
  ]) },
  // iii: the half title waits for a recto, so the back of the cover, ii, is left blank.
  { id: 'half', ...blind, breakBefore: { enabled: true, parity: 'odd' }, advancedDesign: design([
    text('title', '{title}', 'Playfair Display SC', 17, at('top', 0, 34), { letterSpacing: pt(3) }),
    image('crystal', at('top', 0, 45, { width: 6 })),
  ]) },
  { id: 'plate', ...blind, advancedDesign: design([ // iv: faces the title page
    image('plate', at('top-left', 0, 0, { width: 'fill' })),
    text('caption', '{attr.caption}', 'Fanwood Text', 8.8,
      at('top', 0, PLATE_H + 5, { width: 80 }), { italic: true, lineHeight: 1.3 }),
    label('source', '{attr.source}', 7.5, at('top', 0, PLATE_H + 16), 'muted', 1.3),
  ]) },
  { id: 'title', ...blind, advancedDesign: design([ // v: four frontmatter fields, one attribute
    // {publishDate} prints because the year is quoted (gotcha: quote-frontmatter).
    label('edition', 'The text of {publishDate}', 7.5, at('top', 0, 22), 'accent', 1.8),
    text('title', '{title}', 'Playfair Display SC', 33, at('top', 0, 30),
      { fontWeight: 700, letterSpacing: pt(0.4), lineHeight: 1 }),
    text('subtitle', '{subtitle}', 'Fanwood Text', 14, at('top', 0, 44), { italic: true }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.8), color: col('accent'),
      placement: at('top', 0, 60, { width: 14 }) },
    label('author', '{author}', 10, at('top', 0, 66), 'ink', 2.4),
    image('mark', at('top', 0, 126, { width: 11 })),
    label('publisher', '{attr.publisher}', 7.5, at('top', 0, 140), 'muted', 1.5),
  ]) },
  // vi: the section's margins set the small print low, in a 70 mm measure against the outer
  // margin. With no element the design would print the title (gotcha: invisible-heading).
  { id: 'imprint', ...blind, margins: { top: mm(IMPRINT_TOP), left: mm(TRIM_W - OUTER - 70) },
    advancedDesign: design([{ kind: 'box', id: 'none', style: { backgroundColor: col('paper') },
      placement: { ...at('top-left', 0, 0), size: { width: pt(0.1), height: pt(0.1) } } }]) },
  // vii: dedication and epigraph, under a heading whose only element is an ornament, which
  // also keeps its title from printing (gotcha: invisible-heading).
  { id: 'quiet', ...blind,
    advancedDesign: design([image('crystal', at('top', 0, 24, { width: 6 }))], 34) },
];
// :::paragraphs blocks set the small print, the dedication, the epigraph and Walton's close;
// the dedication and the verse take one paragraph per line, so no line of them can reflow.
const VERSE_IN = 22; // mm: the indent that centres the verse as a block
const SOURCE_IN = 55; // mm: 'Paradise Lost' ends under the end of the longest line of verse
const prelimStyles = [
  // In ink, not muted: a paragraph style has no italic colour, so its italic title would take
  // bodyText.italicColor and print darker than its words (gotcha: style-italic-colour).
  { id: 'small-print', fontSize: pt(7.6), lineHeight: pt(10.4), textAlign: 'left',
    firstLineIndent: pt(0), spaceBetween: pt(5.2) },
  // Small capitals, with the italic lines of the 1818 page, leaded as one inscription.
  { id: 'dedication', fontFamily: 'Playfair Display SC', fontSize: pt(10), lineHeight: pt(15),
    textAlign: 'center', firstLineIndent: pt(0) },
  { id: 'verse', fontSize: pt(10), textAlign: 'left', firstLineIndent: mm(VERSE_IN),
    marginTop: pt(LEAD * 4) }, // on the body's 14 pt leading, which a style inherits
  { id: 'source', fontFamily: 'Cinzel', fontSize: pt(7.5), textAlign: 'left',
    firstLineIndent: mm(SOURCE_IN), marginTop: pt(4), color: col('muted') },
  { id: 'signature', textAlign: 'right', firstLineIndent: pt(0) }, // the letter's close
];
// #endregion

// #region contents: what :::toc prints: titles, dotted leaders, the labels each page prints
// Entries take the body's face and ink, and start on the Preface's first baseline, facing it.
const contents = {
  levels: [{ level: 1, fontSize: pt(12), lineHeight: pt(PREFACE.lead) }],
  // The folio's face: "ix" in small capitals, then a plain 1. The leader takes it too.
  pageNumber: { fontFamily: 'Playfair Display SC', fontSize: pt(10), color: col('accent'),
    width: mm(8) },
  leader: { char: '. ', gap: mm(2.5) },
  // A second line from the heading's to="…" attribute: whom each letter is written to.
  subtitle: { enabled: true, attr: 'to', fontSize: pt(9.5), color: col('muted') },
};
// #endregion

// #region letter: the novel's opener: the northern lights, bled off the head of the recto
const BAND = 104; // mm from the trim to the foot of the drawing, which fades into the paper
// minHeight ends AIR mm below it and the first line takes the next grid line. to: 'bleed' is the
// trim until page.cutLines adds a bleed; 3 mm drop the foot 1.8 mm, still above that line.
const AIR = 2;
const opener = design([
  image('band', at('top-left', 0, 0, { width: 'fill', to: 'bleed' })),
  label('to', '{attr.to}', 7.5, onPage(19), 'ice', 2),
  text('title', '{titleText}', 'Playfair Display SC', 46, onPage(25),
    { color: col('bone'), lineHeight: 1 }),
  text('dateline', '{attr.dateline}', 'Fanwood Text', 10.5, onPage(44),
    { italic: true, color: col('bone') }),
  // minHeight counts from the text block, TOP below the trim. The texts reserve their height,
  // the drawing nothing (gotcha: opener-image-no-reserve), so minHeight sets the first line.
], BAND - TOP + AIR);
// Walton's letters come before Chapter I: they take the novel's opener but no number.
const letter = { id: 'letter', numbered: false };
// #endregion

// #region heads: running heads on the novel's body pages; the book on versos, letter on rectos
const HEAD_Y = 12.5; // mm from the trim to the heads' line
const HEAD_GAP = 8; // mm from the outer margin, where the folio hangs, to the words beside it
const head = (id, content, parity, edge, x, extra = {}) => ({ ...label(id, content, 7.5,
  at(edge, x, HEAD_Y, { to: 'page' }), 'muted', 1.4), align: 'left', parity, pages: 'body',
  ...extra }); // pages: 'body' keeps them off the opener
const numeral = { fontFamily: 'Playfair Display SC', fontSize: pt(8.5), fontWeight: 400,
  letterSpacing: pt(0.6), color: col('ink') }; // folios in the folio face, as on the openers
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, numeral),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + HEAD_GAP),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + HEAD_GAP)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, numeral),
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'en-us', // hyphenation patterns, by exact code (gotcha: hyphenation-locales)
  colorPalette, layout: { layoutType: 'single' },
  page: { // mirror: left is the inner margin; 150 dpi is for the screen
    sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'), pageNumbering,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true },
  },
  bodyText: { // justified, hyphenated, optimal line breaking, widow control: the defaults
    fontFamily: 'Fanwood Text', fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    // An even grey: spaces 0.75–1.75 of their width; a last line under 36 spaces' width (about
    // 18 letters: a lone 'occurrence.') is a runt, and costs three times the default.
    minWordSpacing: 0.75, maxWordSpacing: 1.75, runtMinCharacters: 36, runtPenalty: 3000,
  },
  headings: {
    fontFamily: 'Playfair Display SC', fontWeight: 400, color: col('ink'),
    // Break restated (gotcha: headings-drop-h1-break). span 'page' paints the opener unclipped,
    // so the drawing reaches the trim; an in-column design is clipped to the text block.
    levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener }],
  },
  headingStyles: [...leaves, front, letter],
  toc: contents,
  paragraphStyles: prelimStyles,
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a storm over the Alps, the brig in the ice, an aurora, a mark and a crystal
let seed = 1818; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(palette[a].slice(i, i + 2),
  16) * (1 - k) + parseInt(palette[b].slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
  .join('')}`;
const f = (n) => n.toFixed(2);
const poly = (pts, fill, a = 1) => `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"`
  + ` fill="${fill}" fill-opacity="${a}"/>`;
const disk = (x, y, r, fill, a = 1) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" `
  + `fill="${fill}" fill-opacity="${a}"/>`;
const rect = (x, y, w, h, fill, a = 1) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  fill, a);
const floe = (cx, cy, rx, ry, fill) => poly(Array.from({ length: 9 }, (_, i) => { // broken ice
  const a = (i / 9) * Math.PI * 2 + rand() * 0.5;
  const r = 0.72 + rand() * 0.34;
  return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
}), fill);
const PX = 10; // each drawing is w × h mm in its viewBox and declares w·PX × h·PX pixels
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
// [cx, cy, rx, ry]: an ellipse in mm; `clear` keeps the stars out of it.
const inside = (e, x, y) => !!e && ((x - e[0]) / e[2]) ** 2 + ((y - e[1]) / e[3]) ** 2 < 1;

function sky(w, horizon, glow = 1) { // night at the top, a steel glow at the horizon
  const out = [];
  for (let i = 0; i < 96; i++) {
    const [y0, y1] = [horizon * i / 96, horizon * (i + 1) / 96 + 0.2];
    out.push(rect(0, y0, w, y1 - y0, mix('night', 'accent', glow * (i / 95) ** 2.4)));
  }
  return out;
}
function stars(out, w, depth, n, clear) { // thinning towards the glow, none behind the type
  for (let i = 0; i < n; i++) {
    const y = rand() ** 1.7 * depth;
    const [x, r, a] = [rand() * w, 0.12 + rand() ** 3 * 0.38, 0.3 + rand() * 0.6];
    if (!inside(clear, x, y)) out.push(disk(x, y, r, palette.bone, a));
  }
}
function fadeOut(out, w, h, depth) { // the foot of a drawing dissolves into the page
  for (let y = h - depth; y < h; y += 0.8) out.push(rect(0, y, w, h - y, palette.paper, 0.15));
}

// "The sun is for ever visible; its broad disk just skirting the horizon" (Letter I).
function arctic(w, h, { horizon, sun }) {
  const out = sky(w, horizon);
  stars(out, w, horizon * 0.72, 110, null);
  const r = w * 0.14;
  out.push(disk(sun * w, horizon, r * 2.3, palette.bone, 0.05),
    disk(sun * w, horizon, r * 1.5, palette.bone, 0.08), disk(sun * w, horizon, r, palette.bone));
  const ridge = [[0, horizon + 0.4]]; // a far ridge of pressure ice along the horizon
  for (let x = 0; x <= w; x += 1 + rand() * 3) ridge.push([x, horizon - rand() ** 2 * 2.2]);
  out.push(poly([...ridge, [w, horizon + 0.4]], mix('accent', 'ice', 0.35)));
  out.push(rect(0, horizon, w, h - horizon, mix('night', 'accent', 0.55)));
  const rows = 22; // floes: slivers at the horizon, broad plates near the reader
  for (let k = 0; k < rows; k++) {
    const t = (k + 0.5) / rows;
    const y = horizon + 0.6 + (h - horizon) * t ** 1.9;
    const ry = (h - horizon) * 1.9 * t ** 0.9 / rows * (0.55 + rand() * 0.3);
    for (let x = -rand() * 8; x < w + 6;) {
      const rx = ry * (2.2 + rand() * 4.5);
      const glint = Math.max(0, 1 - Math.abs(x - sun * w) / (w * 0.2)) * 0.3;
      out.push(floe(x, y + (rand() - 0.5) * ry, rx, ry,
        mix('accent', 'paper', Math.min(1, 0.4 + t * 0.55 + glint + (rand() - 0.5) * 0.14))));
      x += rx * (1.6 + rand() * 0.9) + 0.3 + t * 1.6;
    }
  }
  const [sx, sy] = [w * 0.18, horizon + 1.2]; // half a mile off: dogs, the sledge, its driver
  for (let i = 0; i < 6; i++) out.push(disk(sx + i * 0.8, sy, 0.3, palette.night));
  out.push(poly([[sx - 2.6, sy - 0.3], [sx - 0.6, sy - 0.3], [sx - 0.5, sy + 0.4],
    [sx - 2.7, sy + 0.4]], palette.night), poly([[sx - 2.2, sy - 0.3], [sx - 2.05, sy - 2.1],
    [sx - 1.5, sy - 2.2], [sx - 1.35, sy - 0.3]], palette.night));
  out.push(brig(w * 0.5, h - 16, 0.95)); // beset in the ice, heeled over
  return svgOf(w, h, out.join(''));
}

function brig(x, y, s) { // a two-masted brig in silhouette, sails furled on the yards
  const ink = palette.night;
  const spar = (x1, y1, x2, y2, wd) => { // a straight spar or stay as a thin quadrilateral
    const [dx, dy] = [x2 - x1, y2 - y1];
    const [nx, ny] = [(-dy / Math.hypot(dx, dy)) * wd / 2, (dx / Math.hypot(dx, dy)) * wd / 2];
    return poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny]], ink);
  };
  const parts = [poly([[-1, -2.5], [3, -1.2], [41, -1.6], [44, -3.2], [39.5, 5], [5, 5.6]], ink),
    spar(41, -2, 55, -8.5, 0.7), spar(55, -8.5, 28.3, -44, 0.25), spar(0, -2, 13.4, -41, 0.25),
    spar(14.2, -30, 27.6, -34, 0.25)]; // hull, bowsprit and the stays
  for (const [mx, tall] of [[13.4, 41], [27.8, 44]]) {
    parts.push(spar(mx, 0, mx, -tall, 0.9), poly([[mx, -tall - 3.6], [mx + 4, -tall - 2.6],
      [mx, -tall - 1.6]], ink)); // mast and pennant
    [17, 14, 11, 7].forEach((yard, i) => parts.push(spar(mx - yard / 2, -9 - i * 8.6,
      mx + yard / 2, -9 - i * 8.6, 1.3 - i * 0.2)));
  }
  const floes = [[-8, 5], [2, 3.5], [16, 6.5], [29, 4], [42, 6.5]].map(([fx, fh]) =>
    poly([[fx, 6.5], [fx + 4, 6.5 - fh], [fx + 9, 5.5], [fx + 13, 7.5]], palette.paper));
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s}) rotate(-4)">${parts.join('')}`
    + `${floes.join('')}</g>`;
}

// "I saw the lightnings playing on the summit of Mont Blânc in the most beautiful figures"
// (vol. I, chapter VI): the cover, a storm over the Alps and the lake of Geneva.
function storm(w, h) {
  const shore = 150; // mm: the lake's far shore
  const out = sky(w, shore, 0.75);
  stars(out, w, 58, 46, [w / 2, 38, 58, 28]);
  const [bx, peak] = [w * 0.57, 121]; // the bolt strikes the dome of Mont Blanc
  const glow = (x, y, r, a, n = 10) => { // a soft light: many faint discs, no gradient
    for (let i = 0; i < n; i++) out.push(disk(x, y, r * (1 - i / n), palette.bone, a));
  };
  const clouds = (top, depth, tone) => { // a bank with a scalloped crown and a ragged belly
    const edge = [];
    for (let x = -6; x < w + 6;) {
      const r = 3 + rand() * 6;
      for (let k = 0; k <= 6; k++) {
        const t = (k / 6) * Math.PI;
        edge.push([x + r * (1 - Math.cos(t)), top - r * 0.55 * Math.sin(t) + rand() * 0.4]);
      }
      x += 2 * r * (0.7 + rand() * 0.2);
    }
    const belly = [];
    for (let x = w + 6; x > -6; x -= 3 + rand() * 4) belly.push([x, top + depth + rand() * 3]);
    out.push(poly([...edge, ...belly], tone));
  };
  clouds(64, 12, mix('night', 'accent', 0.42));
  clouds(72, 12, mix('night', 'accent', 0.28));
  glow(bx + 2, 100, 46, 0.011, 24); // the flash, lighting the air and the clouds' bellies
  clouds(80, 13, mix('night', 'accent', 0.16));
  glow(bx + 4, 94, 18, 0.015, 16);
  const bolt = [[bx + 11, 88]]; // from the cloud's belly down to the summit, in zigzags
  for (let i = 1; i < 11; i++) {
    const t = i / 11;
    const kink = (i % 2 ? 1 : -1) * (1.5 + rand() * 2.5);
    bolt.push([bx + 11 * (1 - t) + kink, 88 + (peak - 88) * t]);
  }
  bolt.push([bx, peak]);
  const zig = (pts, wd, fill, a) => poly([...pts.map(([x, y], i) => [x - wd * (1 - i / pts.length),
    y]), ...pts.slice().reverse().map(([x, y], i) => [x + wd * (i / pts.length) + 0.05, y])],
  fill, a);
  const fork = [bolt[4], ...[1, 2, 3, 4, 5].map((k) => [bolt[4][0] - k * 2.6
    + (k % 2 ? 1 : -1) * rand() * 1.4, bolt[4][1] + k * 2.3])];
  out.push(zig(bolt, 2.6, palette.bone, 0.18), zig(fork, 1.2, palette.bone, 0.14),
    zig(bolt, 0.8, palette.bone, 1), zig(fork, 0.35, palette.bone, 0.9));
  const dome = (x) => peak + (Math.abs(x - bx) / (x < bx ? 30 : 24)) ** 1.6 * 17; // the summit
  const far = [];
  for (let x = -2; x <= w + 2; x += 1.5 + rand() * 2.5) { // needles on the shoulders
    far.push([x, Math.min(140 - rand() ** 1.5 * 9, dome(x) + rand() * 1.2)]);
  }
  out.push(poly([[-2, shore + 2], ...far, [w + 2, shore + 2]], mix('night', 'accent', 0.32)));
  const cap = far.filter(([x]) => Math.abs(x - bx) < 24); // the snowfield, tapering to nothing
  const foot = cap.slice().reverse().map(([x, y], i) => [x, y + 11 * (1 - ((x - bx) / 24) ** 2)
    * (i % 2 ? 1 : 0.7) + rand()]);
  const lit = [...cap.filter(([x]) => x <= bx), [bx + 3, peak + 9],
    ...foot.filter(([x]) => x < bx)];
  out.push(poly([...cap, ...foot], mix('accent', 'ice', 0.5)), // in shade, then the lit face
    poly(lit, mix('ice', 'bone', 0.45)));
  const near = [[-2, shore + 2]];
  for (let x = -2; x <= w + 2; x += 3 + rand() * 4) near.push([x, 146 - 2 * rand()]);
  out.push(poly([...near, [w + 2, shore + 2]], mix('night', 'accent', 0.16)));
  out.push(rect(0, shore, w, h - shore, mix('night', 'accent', 0.34))); // the lake
  for (let k = 0; k < 30; k++) { // the flash on the water, and the ripples
    const y = shore + 1 + (h - shore - 3) * (k / 30) ** 1.4;
    const spread = 2 + k * 0.9;
    const row = [rect(bx - spread / 2 + (rand() - 0.5) * 3, y, spread * (0.5 + rand() * 0.5), 0.35,
      palette.bone, 0.5 - k * 0.014)];
    for (let i = 0; i < 3; i++) {
      row.push(rect(rand() * w, y, 2 + rand() * 8, 0.25, palette.ice, 0.1));
    }
    // Calm water under the series line (168–171 mm): the row is drawn, and its random numbers
    // spent, everywhere else, so the other drawings keep their seeded shapes.
    if (y < 164 || y > 173) out.push(...row);
  }
  return svgOf(w, h, out.join(''));
}

// "I feel a cold northern breeze play upon my cheeks" (Letter I): the northern lights over the
// Neva, St Petersburgh's spire on the far shore, and no ice yet.
function aurora(w, h, { horizon, clear, fade }) {
  const out = sky(w, horizon, 0.8);
  stars(out, w, horizon * 0.8, 120, clear);
  const floor = (x) => (Math.abs(x - clear[0]) < clear[2] // the light stops under the type
    ? clear[1] + clear[3] * Math.sqrt(1 - ((x - clear[0]) / clear[2]) ** 2) : 0);
  [[60, 4, 19, 0.075], [68, 2.5, 12, 0.1]].forEach(([base, amp, len, a], c) => {
    const phase = 1 + c * 2.4;
    const hem = (x) => base + amp * Math.sin(x / w * 6 + phase) + 1.2 * Math.sin(x / w * 17 + c);
    const top = (x) => Math.max(hem(x) - len * (0.55 + 0.45 * Math.sin(x / w * 9 + phase * 2)),
      floor(x));
    const xs = Array.from({ length: 131 }, (_, i) => -1 + (w + 2) * i / 130);
    for (let s = 0; s < 12; s++) { // a curtain: twelve veils, fainter towards its top
      const at = (x, k) => hem(x) - (hem(x) - top(x)) * Math.min(1, k);
      out.push(poly([...xs.map((x) => [x, at(x, (s + 1) / 12)]),
        ...xs.slice().reverse().map((x) => [x, at(x, 0)])], palette.ice, a * (1 - s / 12)));
    }
    out.push(poly([...xs.map((x) => [x, hem(x) - 0.6]), ...xs.slice().reverse()
      .map((x) => [x, hem(x) + 0.3])], palette.bone, 0.2)); // the bright lower hem
    for (let x = rand() * 2; x < w; x += 0.6 + rand() * 2.2) { // fine rays
      const y1 = hem(x);
      const y0 = y1 - (y1 - top(x)) * (0.3 + rand() * 0.7);
      if (y0 < y1) out.push(rect(x, y0, 0.18, y1 - y0, palette.bone, 0.06 + rand() * 0.1));
    }
  });
  out.push(rect(0, horizon, w, h - horizon, mix('night', 'accent', 0.4))); // the Neva
  const city = [[0, horizon + 0.3]]; // the far shore, low, with a spire and two domes
  for (let x = 0; x < w * 0.42; x += 1 + rand() * 2.5) {
    const y = horizon - 0.6 - rand() * 1.8;
    city.push([x, y], [x + 1.2, y]);
  }
  city.push([w * 0.42 + 4, horizon + 0.3]);
  const spire = w * 0.23;
  const dome = (x, r) => rect(x - r, horizon - 3.4 - r, 2 * r, 3.4 + r, palette.night)
    + disk(x, horizon - 3.4 - r, r, palette.night)
    + rect(x - 0.1, horizon - 5.6 - 2 * r, 0.2, 2.4, palette.night);
  out.push(poly(city, palette.night), poly([[spire - 1, horizon - 2], [spire, horizon - 15],
    [spire + 1, horizon - 2]], palette.night), dome(w * 0.31, 1.5), dome(w * 0.12, 1.1));
  for (let i = 0; i < 14; i++) {
    out.push(disk(rand() * w * 0.4, horizon - 0.8 - rand(), 0.16, palette.bone, 0.8));
  }
  for (let k = 0; k < 22; k++) { // the lights' long reflections on the water
    const y = horizon + 1 + (h - horizon) * (k / 22) ** 1.4;
    for (let x = rand() * 6; x < w; x += 4 + rand() * 10) {
      out.push(rect(x, y, 1.5 + rand() * 6, 0.3, palette.ice, 0.08 + rand() * 0.16));
    }
  }
  fadeOut(out, w, h, fade);
  return svgOf(w, h, out.join(''));
}

// The publisher's mark: a polar star in a double ring. The ornament: an ice crystal.
const EMBLEM = 40; // mm: both are drawn on a 40 × 40 viewBox
function mark() {
  const star = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const rr = i % 4 === 0 ? 13 : i % 2 === 0 ? 7 : 2.6;
    star.push([20 + rr * Math.sin(a), 20 - rr * Math.cos(a)]);
  }
  const rings = [[19, 'accent'], [18, 'paper'], [16.2, 'accent'], [15.6, 'paper']];
  return svgOf(EMBLEM, EMBLEM, rings.map(([rr, c]) => disk(20, 20, rr, palette[c])).join('')
    + poly(star, palette.ink));
}
function crystal() {
  const arm = poly([[19.5, 20], [19.5, 3], [20, 1.5], [20.5, 3], [20.5, 20]], palette.accent)
    + poly([[20, 9], [15, 5], [15.5, 4.4], [20, 7.8], [24.5, 4.4], [25, 5]], palette.accent);
  return svgOf(EMBLEM, EMBLEM, [0, 60, 120, 180, 240, 300].map((a) =>
    `<g transform="rotate(${a} 20 20)">${arm}</g>`).join('') + disk(20, 20, 2.4, palette.accent));
}

const art = {
  cover: storm(TRIM_W, TRIM_H),
  plate: arctic(MEASURE, PLATE_H, { horizon: 58, sun: 0.66 }),
  // No stars or rays behind the kicker, title and dateline (19–48 mm down): an ellipse.
  band: aurora(TRIM_W, BAND, { horizon: 76, clear: [TRIM_W / 2, 33, 50, 16], fade: 19 }),
  mark: mark(), crystal: crystal(),
};
for (const [id, svg] of Object.entries(art)) await loadSvg(`${id}.svg`, svg);
// #endregion

// Resources only the designs use, nothing cites them; each declares svgOf's pixel size.
const svgResource = (id, w, h, altText) => ({ id, typeId: 'figure', kind: 'svg', altText,
  createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } });
const resources = [
  svgResource('cover', TRIM_W, TRIM_H, 'Lightning strikes Mont Blanc over the lake of Geneva.'),
  svgResource('plate', MEASURE, PLATE_H, 'A brig beset in pack ice, a sledge far off.'),
  svgResource('band', TRIM_W, BAND, 'Northern lights over the Neva and St Petersburgh.'),
  svgResource('mark', EMBLEM, EMBLEM, 'Publisher’s mark: a polar star in a double ring.'),
  svgResource('crystal', EMBLEM, EMBLEM, 'Ornament: an ice crystal.'),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build (gotcha: fonts-first). The PDF asks for a bold Fanwood and an
// italic Cinzel too; the kit's provider snaps to shipped faces (gotcha: pdf-provider-all-styles).
const FONTS = { 'Fanwood Text': ['400', '400i'], Cinzel: ['400', '600'],
  'Playfair Display SC': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: lay out once (buildDocument settles the contents), show, offer a PDF
await loadFonts(FONTS, markdown);
// :::toc lists each heading with the label of the page it lands on; buildDocument lays the
// document out again until those labels stop moving (ix for the Preface, 1 for Letter I).
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'Frankenstein · the opening leaves' });
// The PDF gets /PageLabels from the same labels: a viewer numbers its pages i–x, then 1, 2.
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
