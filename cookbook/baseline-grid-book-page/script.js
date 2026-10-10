// ═══ Postext Cookbook · Nº 013 · A book page on a baseline grid ═════════════════════
// https://postext.dev/en/cookbook/baseline-grid-book-page
// Code: MIT · Text: original (CC BY 4.0) · Pictures: drawn in code (CC BY 4.0)
// Fonts: Vollkorn, Playfair Display, Vollkorn SC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// An essay on the canon of page proportions, on a page that shows its geometry and grid.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es' | 'pt')
const RECIPE = 'baseline-grid-book-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// A scribe's colours: ink, one rubric red and the pale red of a ruled page.
const palette = {
  ink: '#211d1a', // text: a warm near-black
  rubric: '#b3261e', // the one accent: title, numbers, folios, the drawings' lines
  grid: '#efc6bd', // the baseline grid, as pale as a manuscript's ruling
  rule: '#d5cbbb', // the column rule and the drawings' hairlines
  muted: '#716860', // running heads, the workshop note, the colophon (5.1:1 on paper)
  tint: '#ede4d3', // the ground of the drawings
  paper: '#fbf8f1',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // Defaults this config does not restate link to main-color: point it at the rubric.
  { id: 'main-color', name: 'rubric (defaults)', value: { hex: palette.rubric, model: 'hex' } },
];

// #region answer: one grid for the whole spread: trim, mirrored margins, two columns, leading
const LEAD = 13.4; // pt: the body leading is the pitch of the baseline grid
const UNIT = 8; // mm: the margins step 2:3:4:6 in units of 8 mm, like the canon's
const LINES = 44; // lines per column: the text block is a whole number of leads tall
const TRIM = { width: 210, height: 280 }; // mm
const MM_PER_PT = 25.4 / 72;
const page = {
  sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
  backgroundColor: col('paper'),
  margins: { mirror: true, // left is the inner margin; mirror swaps it on every verso
    left: mm(2 * UNIT), top: mm(3 * UNIT), right: mm(4 * UNIT), // 16, 24 and 32 mm
    bottom: mm(TRIM.height - 3 * UNIT - LINES * LEAD * MM_PER_PT) }, // 48 mm: six units
  // The layout keeps to the grid whether or not the overlay draws it.
  baselineGrid: { enabled: true, color: col('grid') },
};
const GUTTER = 6; // mm: 162 mm of text block make two columns of 78 mm
const layout = { layoutType: 'double', gutterWidth: mm(GUTTER),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } };
const body = { fontFamily: 'Vollkorn', fontSize: pt(9.8), lineHeight: pt(LEAD) };
// Lists add no space of their own (any whole number of leads would do). The grid never
// absorbs a list's top margin: the default 1.5 em (14.7 pt here) would set the items
// 1.3 pt off the lines of the column beside them, until the list reaches a new column.
const onGrid = { marginTop: pt(0), marginBottom: pt(0) };
// #endregion

// #region heads: the book's title on versos, the essay's on rectos, folios from page 9
const OUTER = 4 * UNIT; // mm: the heads end where the text block does
const RISE = 1.5 * UNIT; // mm: heads 12 mm into the head margin; the drop folio 12 mm below
const TAB = 7; // mm from a folio to the title beside it
const onPage = (edge, x) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(RISE) } });
const head = (id, content, parity, placement, extra = {}) => ({
  kind: 'text', id, content, parity, placement, pages: 'body', // never on the opener
  fontFamily: 'Vollkorn SC', fontSize: pt(8.5), fontWeight: 600, letterSpacing: pt(0.8),
  color: col('muted'), ...extra,
});
const folio = { fontFamily: 'Vollkorn', fontWeight: 700, letterSpacing: pt(0),
  color: col('rubric') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', onPage('top-left', OUTER), folio),
  head('verso-title', '{title}', 'even', onPage('top-left', OUTER + TAB)),
  head('recto-title', '{chapterTitle}', 'odd', onPage('top-right', -(OUTER + TAB))),
  head('recto-folio', '{pageNumber}', 'odd', onPage('top-right', -OUTER), folio),
] };
// The opener drops its folio into the foot margin, centred under the text block.
const underBlock = { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(RISE) } };
const footer = { elements: [
  head('drop-folio', '{pageNumber}', 'all', underBlock, { ...folio, pages: 'opener' }),
] };
// startAt prints the folios from 9; pageIndexOffset counts the 8 pages before them, so
// mirroring, parity and breakBefore follow the book (7 would add a blank page).
const continuation = { pageIndexOffset: 8, pageNumbering: { startAt: 9 } };
// #endregion

// #region balance: full columns end flush, and the last page ends level
// On by default: it fills a column a keep rule leaves short, and cuts the last page level.
const balancing = { enabled: true };
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es', pt: 'pt' }), // hyphenation, and Figure, Figura in captions
  colorPalette,
  page,
  layout,
  bodyText: { ...body, color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('rubric'), referenceBold: false,
    firstLineIndent: mm(4), indentAfterHeading: false }, // hyphenation and widow rules are on
  // #region flow: heads that leave the grid and come back to it; lists that never leave it
  headings: { fontFamily: 'Playfair Display', color: col('ink'), balancing,
    levels: [
      // parity 'odd': the essay opens on a recto.
      // Two lines of 46 pt, each four leads tall, then one lead: the text starts on line 10.
      { level: 1, breakBefore: { enabled: true, parity: 'odd' },
        fontSize: pt(46), lineHeight: pt(4 * LEAD), italic: true, color: col('rubric'),
        marginBottom: pt(LEAD) },
      // A lead and a half above puts the head between two grid lines. The margin below
      // needs no fitting: the engine snaps the text under a head to the next grid line.
      { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), marginTop: pt(1.5 * LEAD) },
    ] },
  // Lists add no space of their own (onGrid, in the short answer): items stay on the grid.
  unorderedLists: { ...onGrid, bulletChar: '–', color: col('rubric'), fontWeight: 400 },
  orderedLists: { ...onGrid, color: col('rubric') }, // numbers in the rubric, text in ink
  // #endregion
  // #region note: small type leaves the grid on purpose, and the flow snaps back after it
  paragraphStyles: [
    { id: 'note', fontSize: pt(7.8), lineHeight: pt(10), color: col('muted'),
      boldColor: col('rubric'), firstLineIndent: pt(0), marginTop: pt(LEAD / 2) },
    { id: 'colophon', fontFamily: 'Vollkorn SC', fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  // #endregion
  captionStyle: { fontSize: pt(8), labelColor: col('rubric'), descriptionItalic: true },
  header,
  footer,
});

// #region art: the two drawings, in the page's palette (lines only: no text, no filters)
const BLOCK_W = TRIM.width - 6 * UNIT; // mm: the text block, 162 mm
const COLUMN_W = (BLOCK_W - GUTTER) / 2; // mm: one column, 78 mm
const svgFile = (w, h, markup) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"`
  + ` width="${w * 10}" height="${h * 10}">`
  + `<rect width="${w}" height="${h}" fill="${palette.tint}"/>${markup}</svg>`;
const ln = (x1, y1, x2, y2, stroke, w = 0.4) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`
  + ` stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
const leaf = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"`
  + ` fill="${palette.paper}" stroke="${palette.rule}" stroke-width="0.3"/>`;
const ruling = (x, y, w, h, n) => Array.from({ length: n }, (_, i) => // a ruled text block
  ln(x, y + (h * (i + 0.8)) / n, x + w, y + (h * (i + 0.8)) / n, palette.rule, 0.25)).join('');
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="0.8" fill="${palette.rubric}"/>`;

// Figure 1: the canon constructed on an open spread of 2:3 pages (sizes in mm).
function canonSvg(w, h) {
  const W = (w - 8) / 2, H = 1.5 * W, X = 4, Y = 3.5; // two 2:3 pages, the ninths under them
  const at = (fx, fy) => [X + fx * W, Y + fy * H]; // a point in page widths and heights
  const line = (a, b) => ln(...at(...a), ...at(...b), palette.rubric);
  let s = leaf(X, Y, W, H) + leaf(X + W, Y, W, H);
  s += ruling(...at(2 / 9, 1 / 9), (6 * W) / 9, (6 * H) / 9, 24); // verso text block
  s += ruling(...at(10 / 9, 1 / 9), (6 * W) / 9, (6 * H) / 9, 24); // recto text block
  s += `<circle cx="${X + W / 2}" cy="${Y + (4 * H) / 9}" r="${W / 2}" fill="none"`
    + ` stroke="${palette.muted}" stroke-width="0.35"/>`; // a page wide, a block tall
  s += ln(X + W, Y, X + W, Y + H, palette.muted, 0.5); // the spine
  s += line([0, 1], [2, 0]) + line([0, 0], [2, 1]); // 1 · the spread's diagonals
  s += line([1, 0], [0, 1]) + line([1, 0], [2, 1]); // 2 · each page's diagonal
  s += line([2 / 3, 1 / 3], [2 / 3, 0]) + line([4 / 3, 1 / 3], [4 / 3, 0]); // 3 · the verticals
  s += line([2 / 3, 0], [4 / 3, 1 / 3]) + line([4 / 3, 0], [2 / 3, 1 / 3]); // 4 · across the spine
  for (let i = 0; i <= 18; i++) { // the ninths, ticked under the spread
    const [x, y] = at(i / 9, 1);
    s += ln(x, y + 1.2, x, y + (i % 9 ? 2.8 : 4), palette.muted, 0.3);
  }
  for (const c of [[2 / 9, 1 / 9], [8 / 9, 1 / 9], [2 / 9, 7 / 9], [10 / 9, 1 / 9], [16 / 9, 1 / 9],
    [16 / 9, 7 / 9]]) s += dot(...at(...c)); // 5 · the corners the lines fix
  return svgFile(w, h, s);
}

// Figure 2: this book's page twice, at a quarter of its size.
function pagesSvg(w, h) {
  const k = (h - 8) / TRIM.height, W = TRIM.width * k, H = TRIM.height * k, Y = 4, GAP = 20;
  const X1 = (w - 2 * W - GAP) / 2, X2 = X1 + W + GAP;
  let s = leaf(X1, Y, W, H) + leaf(X2, Y, W, H);
  for (let i = 1; i < 9; i++) { // the canon's ninths
    s += ln(X1 + (i * W) / 9, Y, X1 + (i * W) / 9, Y + H, palette.grid, 0.3);
    s += ln(X1, Y + (i * H) / 9, X1 + W, Y + (i * H) / 9, palette.grid, 0.3);
  }
  s += ruling(X1 + W / 9, Y + H / 9, (6 * W) / 9, (6 * H) / 9, 32);
  s += `<rect x="${X1 + W / 9}" y="${Y + H / 9}" width="${(6 * W) / 9}" height="${(6 * H) / 9}"`
    + ` fill="none" stroke="${palette.rubric}" stroke-width="0.45"/>`;
  const colW = COLUMN_W * k, top = Y + 3 * UNIT * k, tall = LINES * LEAD * MM_PER_PT * k;
  const left = X2 + 2 * UNIT * k;
  for (const x of [left, left + colW + GUTTER * k]) s += ruling(x, top, colW, tall, LINES);
  s += `<rect x="${left}" y="${top}" width="${BLOCK_W * k}" height="${tall}"`
    + ` fill="none" stroke="${palette.rubric}" stroke-width="0.45"/>`;
  s += ln(X1, Y, X1, Y + H, palette.muted, 0.6) + ln(X2, Y, X2, Y + H, palette.muted, 0.6);
  return svgFile(w, h, s);
}
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// Captions and alt text in every sample language: [caption, altText].
const CAPTIONS = {
  canon: {
    en: ['The canon on an open spread of 2:3 pages. The diagonals fix the corners of both text '
      + 'blocks; the circle, as wide as a page, is exactly as tall as its block.',
    'Two facing pages crossed by red construction lines, a ruled text block where they cross '
      + 'on each page, and a circle as wide as the left page.'],
    es: ['El canon sobre un pliego abierto de páginas 2:3. Las diagonales fijan las esquinas de '
      + 'las dos cajas; el círculo, tan ancho como la página, es tan alto como su caja.',
    'Dos páginas enfrentadas cruzadas por líneas rojas de construcción, una caja pautada donde '
      + 'se cortan en cada página y un círculo tan ancho como la página izquierda.'],
    pt: ['O cânone sobre uma página dupla aberta de páginas 2:3. As diagonais fixam os cantos '
      + 'das duas manchas; o círculo, da largura da página, tem exatamente a altura da mancha.',
    'Duas páginas lado a lado cruzadas por linhas vermelhas de construção, uma mancha pautada '
      + 'onde elas se cruzam em cada página e um círculo da largura da página esquerda.'],
  },
  pages: {
    en: ['This book’s 210 × 280 mm page twice. Left, divided by the canon into ninths, with a '
      + 'text block of 140 × 187 mm. Right, as the book sets it: margins of 16, 24, 32 and 48 '
      + 'mm and two columns of 44 lines.',
    'Two identical pages: the left one divided into a nine-by-nine grid around its text block, '
      + 'the right one holding two ruled columns.'],
    es: ['La página de 210 × 280 mm de este libro, dos veces. A la izquierda, dividida en '
      + 'novenos por el canon, con una caja de 140 × 187 mm. A la derecha, tal como la compone '
      + 'el libro: márgenes de 16, 24, 32 y 48 mm y dos columnas de 44 líneas.',
    'Dos páginas iguales: la izquierda, dividida en una cuadrícula de nueve por nueve alrededor '
      + 'de su caja; la derecha, con dos columnas pautadas.'],
    pt: ['A página de 210 × 280 mm deste livro, duas vezes. À esquerda, dividida em nonos pelo '
      + 'cânone, com uma mancha de 140 × 187 mm. À direita, como o livro a compõe: margens de '
      + '16, 24, 32 e 48 mm e duas colunas de 44 linhas.',
    'Duas páginas iguais: a da esquerda dividida numa grade de nove por nove em volta da '
      + 'mancha, a da direita com duas colunas pautadas.'],
  },
};

// #region figures: one figure heads the next column, the other the next page
// mm: a column wide and just short enough for a 17-lead band with its caption; a block wide
const CANON = [COLUMN_W, 61.8], PAGES = [BLOCK_W, 64];
const figure = (id, [width, height], placement, [caption, altText]) => ({
  id, typeId: 'figure', kind: 'svg', svg: { fileId: `${id}.svg`, width, height },
  placement, caption, altText, createdAt: 0, updatedAt: 0,
});
const resources = [
  // A float never lands above the paragraph that cites it. A column 'top' float cited in
  // the first column can still take the head of the second, on the same page.
  figure('canon', CANON, { position: 'top' }, t(CAPTIONS.canon)),
  // A page-wide 'top' float cannot, so it waits for the next page (gotcha: top-float-next-page).
  // Each band is rounded up to whole leads, so the text under it stays on the grid.
  figure('pages', PAGES, { position: 'top', span: 'page' }, t(CAPTIONS.pages)),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the pages paint, loaded before the first build.
const FONTS = { // text, display and label faces (Vollkorn SC ships no italic)
  Vollkorn: ['400', '400i', '700'], 'Playfair Display': ['700', '700i'],
  'Vollkorn SC': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('canon.svg', canonSvg(...CANON));
await loadSvg('pages.svg', pagesSvg(...PAGES));
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'A book page on a baseline grid',
  es: 'Una página de libro sobre una rejilla base',
  pt: 'Uma página de livro sobre a grade de linhas de base' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
