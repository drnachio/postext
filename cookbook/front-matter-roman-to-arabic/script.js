// ═══ Postext Cookbook · Nº 006 · Front matter: roman folios, then page 1 ═══════════
// https://postext.dev/en/cookbook/front-matter-roman-to-arabic
// Code: MIT · Text: M. & P. B. Shelley, 1818 (PD) · Pictures: diffusion models; marks drawn in code
// Fonts: Fanwood Text, Playfair Display SC, Cinzel (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
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
// overflow 'wrap' for the running heads too, where a text too wide would end in '…'.
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
const IMPRINT_TOP = 126.4; // re-tune it whenever the imprint changes
const leaves = [
  // i: bled to the trim. The painting is as tall as the page, so the cover takes it whole.
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
  // margin. hidden: the heading opens the page and names its bookmark, and prints nothing.
  { id: 'imprint', ...blind, hidden: true,
    margins: { top: mm(IMPRINT_TOP), left: mm(TRIM_W - OUTER - 70) } },
  // vii: dedication and epigraph, under a heading whose design is an ornament and no title.
  { id: 'quiet', ...blind,
    advancedDesign: design([image('crystal', at('top', 0, 24, { width: 6 }))], 34) },
];
// :::paragraphs blocks set the small print, the dedication, the epigraph and Walton's close;
// the dedication and the verse take one paragraph per line, so no line of them can reflow.
const VERSE_IN = 22; // mm: the indent that centres the verse as a block
const SOURCE_IN = 55; // mm: 'Paradise Lost' ends under the end of the longest line of verse
const prelimStyles = [
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
  // The drawing reserves down to its foot. minHeight, counted from the text block (TOP below
  // the trim), is a floor AIR mm lower, which sends the first line one grid line further down.
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

const config = () => ({
  locale: 'en-us', // the hyphenation patterns
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
    // 'odd': the novel opens on a recto. span 'page': a design kept in the column is cut at
    // the foot of the text block, and the cover's painting, a style of this level, runs on.
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

// #region art: the publisher's mark and an ice crystal, drawn in the palette
const f = (n) => n.toFixed(2);
const poly = (pts, fill, a = 1) => `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"`
  + ` fill="${fill}" fill-opacity="${a}"/>`;
const disk = (x, y, r, fill, a = 1) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" `
  + `fill="${fill}" fill-opacity="${a}"/>`;
const PX = 10; // each drawing is w × h mm in its viewBox and declares w·PX × h·PX pixels
const svgOf = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" `
  + `height="${h * PX}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
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
for (const [id, svg] of Object.entries({ mark: mark(), crystal: crystal() })) {
  await loadSvg(`${id}.svg`, svg);
}
// Each declares svgOf's pixel size.
const svgResource = (id, w, h, altText) => ({ id, typeId: 'figure', kind: 'svg', altText,
  createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`, width: w * PX, height: h * PX } });
const emblems = [
  svgResource('mark', EMBLEM, EMBLEM, 'Publisher’s mark: a polar star in a double ring.'),
  svgResource('crystal', EMBLEM, EMBLEM, 'Ornament: an ice crystal.'),
];
// #endregion

const painting = (id, w, h, altText) => ({ id, typeId: 'figure', kind: 'bitmap', altText,
  createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}-${w}.jpg`, format: 'jpeg', width: w, height: h } });
const paintings = [ // JPEGs in assets/; only the designs use them, nothing cites them
  painting('cover', 1000, 1535, 'Lightning strikes Mont Blanc over the lake of Geneva.'),
  painting('plate', 1000, 1299, 'A brig beset in pack ice, a sledge drawn by dogs far off.'),
  painting('band', 1400, 1129, 'Northern lights over the frozen Neva and St Petersburgh.'),
];
await Promise.all(paintings.map(({ bitmap: b }) => loadImage(b.fileId, asset(b.fileId))));
const resources = [...paintings, ...emblems];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages set, loaded before the first build.
const FONTS = { 'Fanwood Text': ['400', '400i'], Cinzel: ['400', '600'],
  'Playfair Display SC': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: lay out once (buildDocument settles the contents), show, offer a PDF
// :::toc lists each heading with the label of the page it lands on; buildDocument lays the
// document out again until those labels stop moving (ix for the Preface, 1 for Letter I).
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: 'Frankenstein · the opening leaves' });
// The PDF gets /PageLabels from the same labels: a viewer numbers its pages i–x, then 1, 2.
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
