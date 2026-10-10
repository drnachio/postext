// ═══ Postext Cookbook · Nº 007 · One book from separate chapters ══════════════════════════
// https://postext.dev/en/cookbook/book-from-chapters
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Andada Pro, Rozha One, Figtree (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A handbook in four seasons written as five Markdown documents, laid out by buildBundle as
// one book: parity, folios, chapter and figure numbers and the contents run straight through.
import {
  buildBundle, prepareFonts, withLoadedFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'book-from-chapters';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config links to one of these, so the book can be retinted
  ink: '#2a2218', // text and display type
  honey: '#d99a1e', // the drawings only: the cover and the comb cells
  accent: '#7a4e12', // the text accent (7:1 on paper): numbers, labels, subheads; main-color too
  pollen: '#c4692b', comb: '#f7e7c4', rule: '#d8c8a8', // figures: pollen, wax, wood and walls
  muted: '#6e634f', paper: '#fffdf7', // running heads, colophon, contents sections; the page
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// The geometry, in mm. The drawings, the opener and the running heads are derived from it.
const TRIM = { width: 150, height: 200 }; // a small handbook
const MARGIN = { top: 22, bottom: 22, inner: 19, outer: 15 }; // mirrored
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // the text width: 116 mm
const SQRT3 = Math.sqrt(3); // comb cells of radius r sit √3·r apart, their rows 1.5·r apart
const CORNER = { width: 84, height: 70, r: 9.5 }; // the openers' comb, and its cell radius
const NUMBER_CELL = { x: 4 * SQRT3 * CORNER.r, y: 2 * 1.5 * CORNER.r }; // row 2, cell 4
// The chapter number's box: 20 mm wide, its top 8 mm above the cell's centre, which is where
// a 40 pt Rozha One figure sits optically centred in the cell.
const NUMBER = { box: 20, rise: 8 };
const FRAME = { width: MEASURE, height: 50 }; // the brood frame figures, at the text width
const HEAD = { y: 12, gap: 8 }; // running heads 12 mm from the top edge, 8 mm folio to text
const LEAD = 14.2; // body leading in pt: the baseline grid
// The look: a small handbook, mirrored, justified Andada Pro on the grid; Rozha One titles.
const page = { // mirror: left is the inner margin, right the outer
  sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
    left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true },
};
const bodyText = { // justified, hyphenated, optimal line breaks and widow control: by default
  fontFamily: 'Andada Pro', fontSize: pt(10.4), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  firstLineIndent: mm(4.5), indentAfterHeading: false,
  // Spaces stretch to 1.7× at most (the default is 2): the line breaker then takes the
  // hyphens it would otherwise avoid, and no line gapes.
  maxWordSpacing: 1.7,
};
const display = { fontFamily: 'Rozha One', fontWeight: 400, color: col('ink') }; // titles
// Subheads: the line box itself is a line and a half deep, so the gap to the text under it
// is the same everywhere. A margin above would not do it: it drops at the head of a page.
const subhead = { level: 2, fontFamily: 'Andada Pro', fontWeight: 700, fontSize: pt(12.5),
  lineHeight: pt(LEAD * 1.5), color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0) };
const captionStyle = { fontFamily: 'Figtree', fontSize: pt(7.6), gap: mm(2.5),
  labelColor: col('accent') };
// The colophon floats to the foot of the last page: a box with no background, placed
// 'bottom'. One statement per paragraph, because a no-break space would not keep
// "CC BY 4.0" on one line (gotcha: nbsp-breaks).
const calloutStyles = [{ id: 'colophon', placement: 'bottom', backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) }, marginBottom: pt(0),
  body: { fontFamily: 'Figtree', fontSize: pt(7), lineHeight: pt(10), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0) } }];

// #region answer: five Markdown documents, one book: buildBundle and the rules they share
// buildBundle lays the documents out in order with one config and carries state from each to
// the next: the pages already set (so parity goes on), the folio, the chapter and figure counts.
const book = () => buildBundle({ chapters, config: config(), resources });
const config = () => ({
  headings: { ...display, levels: [
    // Every chapter opens on a recto: after a chapter that ends on one, the next document
    // starts with a blank verso of its own. Restated, because any headings object drops
    // the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, breakBefore: { enabled: true, parity: 'odd' },
      // '{1}' puts the number in the PDF bookmarks ('1 Autumn'); the contents and
      // {chapterNumber} count the chapters in order either way.
      numberingTemplate: '{1}', advancedDesign: opener,
      span: 'page' }, // a page-wide opener, painted unclipped: the comb reaches the top edge
    subhead,
  ] },
  // The cover and the contents are headings that take no number, no contents entry and no
  // running heads, so Autumn is still chapter 1. Both inherit span 'page', which starts
  // each on a page of its own, and parity 'odd', which the contents turn off: it would
  // leave page 2 blank (gotcha: style-inherits-break).
  headingStyles: [
    { id: 'cover', numbered: false, toc: false, advancedDesign: cover, ...bare },
    { id: 'contents', numbered: false, toc: false, breakBefore: { enabled: false },
      advancedDesign: contentsOpener, ...bare },
  ],
  // Figures number {h1}.{n} and the counters carry on (Winter's is 2.1). The types are passed
  // only because config.locale does not turn Figure into Figura (gotcha: resource-types-locale).
  resourceTypes: defaultResourceTypes(LANG),
  // :::toc in the first document lists the whole book with the folio each chapter lands on:
  // buildBundle lays the book out again (three passes at most) until those folios settle.
  toc: contents,
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation, by exact code (gotcha: hyphenation-locales)
  colorPalette, page, layout: { layoutType: 'single' }, bodyText, captionStyle, calloutStyles,
  header, footer, // the look: above, and in the regions below
});
// #endregion
const bare = { header: { elements: [] }, footer: { elements: [] } }; // no running heads

// #region art: honeycomb drawn in code, seeded so that every run draws the same cells
let seed = 2026; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const paint = (id, opacity = 1) => `fill="${palette[id]}" fill-opacity="${opacity}"`;
// A w × h mm sheet (10 px per mm) of hexagonal cells of radius r; cell(x, y) paints each one.
function comb(w, h, r, cell, under = '') {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" height="${h * 10}" `
    + `viewBox="0 0 ${w} ${h}">${under}`;
  for (let row = 0, y = 0; y < h + r; y = ++row * 1.5 * r) {
    for (let x = (row % 2) * SQRT3 / 2 * r; x < w + 2 * r; x += SQRT3 * r) {
      const corner = (a) => `${(x + 0.88 * r * Math.sin(a)).toFixed(2)} `
        + (y - 0.88 * r * Math.cos(a)).toFixed(2);
      const hexagon = [0, 1, 2, 3, 4, 5].map((i) => corner(i * Math.PI / 3)).join('L');
      const fill = cell(x, y);
      if (fill) svg += `<path d="M${hexagon}Z" ${fill}/>`;
    }
  }
  return `${svg}</svg>`;
}
// Comb that thins out with the distance d from a corner: solid cells with some open ones up to
// d = 0.78, faint open cells up to 1, nothing beyond.
const fade = (d, full, open, k = 1) => (d > 1 ? '' : d > 0.78 ? paint(open, 0.14 * k)
  : rand() < 0.3 ? paint(open, 0.28 * k) : paint(full, (d < 0.5 ? 0.95 : 0.6) * k));
const coverArt = () => comb(TRIM.width, TRIM.height, 7.5, (x, y) => fade(Math.hypot(
  (TRIM.width - x) / TRIM.width, y / (TRIM.height - 10)) + rand() * 0.22, 'comb', 'accent'),
`<rect width="${TRIM.width}" height="${TRIM.height}" ${paint('honey')}/>`);
// A paler cluster from the outer top corner; on a recto the cell under the number is solid.
const cornerArt = (recto) => comb(CORNER.width, CORNER.height, CORNER.r, (x, y) => (recto
  && Math.hypot(x - NUMBER_CELL.x, y - NUMBER_CELL.y) < 1 ? paint('honey')
  : fade(Math.hypot(((recto ? CORNER.width : 0) - x) / (CORNER.width - 4),
    y / (CORNER.height - 6)) + rand() * 0.25, 'honey', 'honey', 0.85)));
// One brood frame through the year. Per season: the brood nest (centre v, half-width,
// half-height, what fills it) and where the honey sits, on a frame that runs −1…1 each way.
const SEASONS = {
  autumn: [0.5, 0.3, 0.42, 'accent', () => true],
  winter: [0.4, 0.42, 0.62, 'ink', (u, v) => v < 0.25 - 0.4 * (1 - u * u)], // ink: the cluster
  spring: [0.2, 0.62, 0.8, 'accent', (u, v) => v < -0.3 && Math.abs(u) > 0.45],
  summer: [0.45, 0.5, 0.6, 'accent', (u, v) => v < 0.35 || Math.abs(u) > 0.7],
};
function frameArt([cv, ru, rv, nest, honey]) {
  const { width: w, height: h } = FRAME; // a top bar with 4 mm lugs, slim side bars
  const wood = `<path d="M0 0H${w}V4.5H${w - 4}V${h}H4V4.5H0Z" ${paint('rule')}/>`
    + `<rect x="6.5" y="4.5" width="${w - 13}" height="${h - 7}" ${paint('rule', 0.5)}/>`;
  return comb(w, h, 2.5, (x, y) => {
    const [u, v] = [(x - w / 2) / (w / 2 - 7.5), (y - h / 2 - 1) / (h / 2 - 4)];
    const d = Math.hypot(u / ru, (v - cv) / rv) + rand() * 0.12;
    if (x < 7 || x > w - 7 || y < 6 || y > h - 3.5) return '';
    return paint(d < 1 ? nest : d < 1.3 && nest === 'accent' ? 'pollen' : honey(u, v) ? 'honey'
      : 'comb', d < 1 && nest === 'ink' ? 0.8 : 1);
  }, wood);
}
// #endregion

// The cover: comb over a honey page, the title low on the inner side where the comb runs out.
const label = { fontFamily: 'Figtree', fontSize: pt(7.5), fontWeight: 600,
  letterSpacing: pt(1.4), textTransform: 'uppercase' };
const at = (edge, x, y, to = 'page') => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const below = (id, y, width) => ({ ...at('below', 0, y, `#${id}`),
  ...(width && { size: { width: mm(width) } }) });
// No minHeight: the contents heading, which inherits span 'page', starts the next page.
const cover = { enabled: true, slot: { elements: [
  { kind: 'image', id: 'art', resourceId: 'cover',
    placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
  { kind: 'text', id: 'kicker', content: '{subtitle}', ...label, fontSize: pt(8.5),
    color: col('ink'), placement: at('top-left', 17, 116) },
  // A design text's lineHeight is a multiple (gotcha: design-lineheight-multiple).
  { kind: 'text', id: 'title', content: '{titleText}', ...display, fontSize: pt(54),
    lineHeight: 0.98, align: 'left', overflow: 'wrap', placement: below('kicker', 4, 125) },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(2), color: col('ink'),
    placement: { ...below('title', 6), size: { width: mm(16) } } },
  { kind: 'text', id: 'author', content: '{author}', ...label, fontSize: pt(9), fontWeight: 700,
    color: col('ink'), placement: below('rule', 5) },
] } };

// #region opener: each chapter's opener: the number in a honey cell, months, title and lead
const corner = (id, edge) => ({ kind: 'image', id, resourceId: id,
  placement: { anchor: { to: 'bleed', edge }, size: { width: mm(CORNER.width) } } });
const months = { kind: 'text', id: 'months', content: '{attr.months}', ...label,
  color: col('accent'), placement: at('top-left', 0, 14, 'container') };
const title = { kind: 'text', id: 'title', content: '{titleText}', ...display, fontSize: pt(42),
  lineHeight: 1.05, align: 'left', overflow: 'wrap', placement: below('months', 1.5, 100) };
const opener = { enabled: true, minHeight: mm(52), slot: { elements: [
  corner('cells', 'top-right'),
  // The number's box is centred on its cell. Comb and number both hang from the bleed's top
  // right, so a bleed (page.cutLines) moves them together.
  { kind: 'text', id: 'number', content: '{chapterNumber}', ...display, fontSize: pt(40),
    lineHeight: 1, align: 'center', placement: { size: { width: mm(NUMBER.box) },
      ...at('top-right', NUMBER_CELL.x + NUMBER.box / 2 - CORNER.width,
        NUMBER_CELL.y - NUMBER.rise, 'bleed') } },
  months, title,
  { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: 'Andada Pro', italic: true,
    fontSize: pt(11.5), lineHeight: 1.35, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: below('title', 3, 88) },
] } };
// The contents mirror it on the verso: the comb in the outer corner, the book's subtitle and
// the title set flush right against the spine, on the same lines as Autumn's across the spread.
const flushRight = (element, placement) => ({ ...element, align: 'right',
  placement: { ...placement, size: { width: 'fill' } } });
const contentsOpener = { ...opener, minHeight: mm(40), slot: { elements: [
  corner('comb', 'top-left'),
  flushRight({ ...months, content: '{subtitle}' }, months.placement),
  flushRight(title, below('months', 1.5)),
] } };
// #endregion

// #region contents: what :::toc prints: numbers in the accent, dotted leaders, folios
const contents = {
  levels: [
    // The numbers sit ~0.7 mm high in Postext 1.4.1: they are centred on the line
    // (gotcha: toc-number-baseline).
    { level: 1, fontFamily: 'Rozha One', fontSize: pt(16), lineHeight: pt(18),
      numberFontFamily: 'Figtree', numberFontSize: pt(11), numberFontWeight: 700,
      numberColor: col('accent'), numberWidth: mm(7), numberGap: mm(4), marginTop: pt(8) },
    // Sections: 9.3 pt in the muted colour, indented 11 mm (number 7 + gap 4) to the titles.
    { level: 2, fontSize: pt(9.3), lineHeight: pt(13.5), indent: mm(11), color: col('muted') },
  ],
  pageNumber: { fontFamily: 'Figtree', fontSize: pt(8.5), fontWeight: 600, width: mm(7) },
  leader: { char: '. ', gap: mm(2) },
  // A second line under each chapter, from its {months="…"} heading attribute.
  subtitle: { enabled: true, attr: 'months', fontFamily: 'Andada Pro', fontSize: pt(9),
    color: col('muted') }, // italic by default
};
// #endregion

// #region running-heads: the book on the verso, the chapter on the recto, folios outside
const head = (id, content, parity, placement, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers or blank pages
  ...label, color: col('muted'), placement, ...extra,
});
const folio = { fontSize: pt(8.5), fontWeight: 700, color: col('accent') };
// In Postext 1.4.1 {title} is blank from the second document on (Autumn included): only the
// first one has frontmatter (gotcha: bundle-metadata). So the verso writes the title out.
const BOOK_TITLE = t({ en: 'A Beekeeper’s Year', es: 'Un año de colmenar' });
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('top-left', MARGIN.outer, HEAD.y), folio),
  head('verso-title', BOOK_TITLE, 'even', at('top-left', MARGIN.outer + HEAD.gap, HEAD.y)),
  // {chapterTitle} and {pageNumber} are worked out page by page, in every document.
  head('recto-title', '{chapterTitle}', 'odd',
    at('top-right', -(MARGIN.outer + HEAD.gap), HEAD.y)),
  head('recto-folio', '{pageNumber}', 'odd', at('top-right', -MARGIN.outer, HEAD.y), folio),
] };
// Openers carry a drop folio instead, 8 mm under the text block.
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all',
  at('top', 0, 8, 'container'), { pages: 'opener', fontWeight: 700 })] };
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const front = /* @content */ ''; // frontmatter, cover and contents (content.<lang>.md)
const autumn = /* @content:autumn */ ''; // content.autumn.<lang>.md, and so on
const winter = /* @content:winter */ '';
const spring = /* @content:spring */ '';
const summer = /* @content:summer */ '';
// #region chapters: five Markdown documents in reading order: the front matter, then a year
// Nothing in a chapter says where it lands: buildBundle works that out from the order.
const chapters = [front, autumn, winter, spring, summer].map((markdown) => ({ markdown }));
// #endregion
const svg = (id, [width, height], caption) => ({ id, typeId: 'figure', kind: 'svg',
  createdAt: 0, updatedAt: 0, caption, altText: caption,
  svg: { fileId: `${id}.svg`, width: width * 10, height: height * 10 } }); // as comb() draws
const CAPTIONS = t({ en: {
  autumn: 'A frame in October: honey (gold) round the last brood (brown) and pollen (russet).',
  winter: 'The same frame in January: the cluster (dark) eats its way up from empty comb (pale).',
  spring: 'The same frame in late April: brood across the middle, the winter honey nearly gone.',
  summer: 'The same frame in July: an arch of new honey presses down on the brood.',
}, es: {
  autumn: 'Un cuadro en octubre: la miel (dorada) rodea la última cría (marrón) '
    + 'y el polen (rojizo).',
  winter: 'El mismo cuadro en enero: el racimo (oscuro) deja la cera vacía (clara) y sube.',
  spring: 'El mismo cuadro a finales de abril: cría en el centro; queda poca miel del invierno.',
  summer: 'El mismo cuadro en julio: un arco de miel nueva aprieta la cría hacia abajo.',
} });
const resources = [svg('cover', [TRIM.width, TRIM.height]),
  svg('cells', [CORNER.width, CORNER.height]), svg('comb', [CORNER.width, CORNER.height]),
  ...Object.keys(SEASONS).map((season) => svg(`${season}-frame`, [FRAME.width, FRAME.height],
    CAPTIONS[season]))];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build.
// Rozha One ships one face: renderToPdf still asks for its bold and italic, which the kit's
// provider snaps to that face (gotcha: pdf-provider-all-styles).
const FONTS = { // text, display and labels
  'Andada Pro': ['400', '400i', '700'], 'Rozha One': ['400'], Figtree: ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: draw, lay the book out, show it as spreads, offer one PDF of all chapters
const text = chapters.map((chapter) => chapter.markdown).join('\n');
await prepareFonts(text, config(), kitFonts(FONTS));
const art = { cover: coverArt(), cells: cornerArt(true), comb: cornerArt(false) };
for (const [season, plan] of Object.entries(SEASONS)) art[`${season}-frame`] = frameArt(plan);
for (const [id, markup] of Object.entries(art)) await loadSvg(`${id}.svg`, markup);
// One VDTDocument per Markdown document.
const docs = await withLoadedFonts(book, { ...kitFonts(FONTS), text });
showPages(docs, { title: BOOK_TITLE });
// renderToPdf takes the array: one file for the book, with a bookmark per chapter.
offerPdf(() => renderToPdf(docs, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
