// ═══ Postext Cookbook · Nº 105 · An Arabic novel set right to left, bound on the right ═══
// https://postext.dev/en/cookbook/arabic-novel-right-bound
// Code: MIT · Text: original Arabic prose (CC BY 4.0) · Pattern: drawn in code
// Fonts: Markazi Text, Reem Kufi, Noto Kufi Arabic (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the novel is Arabic in both editions
const RECIPE = 'arabic-novel-right-bound';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The blue of the press's door, the brass of its key, ink on a cream book paper.
// #region palette: the door's blue, the key's brass, every colour linked by id
const palette = {
  ink: '#1f1c19', // text: a warm near-black
  door: '#2b4766', // the accent: the part page's field, the openers' kickers
  brass: '#b08d4a', // the second accent: the medallion's line and the openers' star
  lattice: '#3d5d82', // the pattern's lines, a step lighter than the field
  rule: '#cbc3b5', // hairlines
  muted: '#6b645b', // running heads, folios, the colophon
  paper: '#fbf8f1', // a cream book paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.door })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Markazi Text', 'Reem Kufi', 'Noto Kufi Arabic'];
const [BODY, LEAD] = [13.5, 22]; // pt: Naskh sets small, so 13.5 pt on 1.63 × the size
const TRIM = { width: 140, height: 210 }; // mm: 14 × 21 cm, the Arab trade novel
const OUTER = 16; // mm: the outer margin, where the folios stand

// #region answer: the locale sets the direction, the binding and the digits
const page = {
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
  // left and right are the flow's sides: in a right-to-left book left is the spine side,
  // so these margins put 20 mm at the spine and 16 mm outside on both pages of a spread.
  margins: { top: mm(23), bottom: mm(22), left: mm(20), right: mm(OUTER), mirror: true },
  // binding: 'auto' (unset) is 'right' for a right-to-left locale: page 1 is a left page.
};
const bodyText = {
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  // justify ends every line on both sides; the engine lengthens joined letters (kashida,
  // on by default for Arabic) after it opens the spaces a quarter. Never hyphenated.
  textAlign: 'justify', optimalLineBreaking: true,
  firstLineIndent: em(1.5), indentAfterHeading: false, // the indent is on the right
  avoidWidows: true, avoidOrphans: true, avoidRunts: true,
};
// #endregion

// #region opener: the chapter number in words over the title, sunk under a brass star
const SINK = 58; // mm: where the text starts on an opener
const centred = (y, size) => ({ anchor: { to: 'container', edge: 'top' },
  offset: { y: mm(y) }, ...(size && { size }) });
const opener = {
  enabled: true, minHeight: mm(SINK),
  slot: { elements: [
    { kind: 'image', id: 'star', resourceId: 'star', placement: centred(8, { width: mm(9) }) },
    // {number} is the level's numbering template below: الفصل الأول, الفصل الثاني…
    { kind: 'text', id: 'kicker', content: '{number}', fontFamily: LABEL, fontSize: pt(10),
      fontWeight: 600, color: col('door'), align: 'center', placement: centred(22) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(30),
      fontWeight: 600, lineHeight: 1.3, color: col('ink'), align: 'center', overflow: 'wrap',
      placement: centred(29, { width: 'fill' }) },
  ] },
};
const chapter = {
  level: 1, fontFamily: DISPLAY, fontWeight: 600, marginTop: pt(0), marginBottom: pt(0),
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  breakBefore: { enabled: true, parity: 'any' },
  // A masculine ordinal in words: {1:ordinal-feminine} would give الأولى, الثانية…
  numberingTemplate: 'الفصل {1:ordinal}', advancedDesign: opener,
};
// #endregion

// #region heads: physical, so the right page carries the book and the left the chapter
// Running heads and folios keep their physical sides in a right-to-left book. The right page
// is an even page here and is read first: the book's title; the left page, the chapter's.
const label = { fontFamily: LABEL, fontSize: pt(8), color: col('muted'), pages: 'body' };
const at = (edge, x, y = 12) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } });
const folio = { ...label, fontWeight: 600, color: col('ink') };
const header = { elements: [
  { kind: 'text', id: 'r-folio', content: '{pageNumber}', parity: 'even', ...folio,
    align: 'right', placement: at('top-right', -OUTER) },
  { kind: 'text', id: 'r-title', content: '{title}', parity: 'even', ...label, align: 'right',
    placement: at('top-right', -(OUTER + 9)) },
  { kind: 'text', id: 'l-chapter', content: '{chapterTitle}', parity: 'odd', ...label,
    align: 'left', placement: at('top-left', OUTER + 9) },
  { kind: 'text', id: 'l-folio', content: '{pageNumber}', parity: 'odd', ...folio,
    align: 'left', placement: at('top-left', OUTER) },
] };
// The openers carry no head: their folio drops to the foot, centred.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}', ...folio,
  pages: 'opener', align: 'center', placement: at('bottom', 0, -11) }] };
// #endregion

// #region plate: the part page, the door's blue edge to edge under a lattice of stars
// # الدرب {style="plate" kicker="…" line="…"}: a heading that paints a whole page.
const onPage = (y) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) } });
const plate = {
  id: 'plate', span: 'page', numbered: false, runningChapter: false, toc: false,
  breakBefore: { enabled: true, parity: 'any' }, // (gotcha: style-inherits-break)
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'field', resourceId: 'lattice', placement: {
      anchor: { to: 'bleed', edge: 'top-left' },
      size: { width: mm(TRIM.width), height: mm(TRIM.height) } } },
    { kind: 'text', id: 'part', content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(11),
      fontWeight: 600, color: col('brass'), align: 'center', placement: onPage(76) },
    { kind: 'text', id: 'name', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(64),
      fontWeight: 600, lineHeight: 1.2, color: col('paper'), align: 'center',
      placement: onPage(86) },
    { kind: 'text', id: 'line', content: '{attr.line}', fontFamily: TEXT, fontSize: pt(13),
      color: col('paper'), align: 'center', placement: onPage(124) },
  ] } },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // written out, never LANG (gotcha: arabic-locale-tag)
  colorPalette, page, bodyText, layout: { layoutType: 'single' },
  headings: { fontFamily: DISPLAY, fontWeight: 600, color: col('ink'), levels: [chapter] },
  headingStyles: [plate],
  paragraphStyles: [
    // The colophon is in the reader's language, set left to right ({dir=ltr} on its block).
    { id: 'colophon', fontFamily: TEXT, fontSize: pt(8.5), lineHeight: pt(11),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Arabic text in both

// #region art: an eight-pointed star lattice and the brass star of the openers
// Two squares turned 45° make the eight-pointed star (khātam); stars on a square grid, with a
// small square between every four, make the lattice. Lines only: the PDF keeps them as paths.
const star = (cx, cy, r) => {
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const d = k % 2 ? r * 0.7654 : r; // 0.7654: where the two squares' sides cross
    pts.push(`${(cx + d * Math.sin(a)).toFixed(2)} ${(cy - d * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
};
function lattice() {
  const [W, H, S] = [TRIM.width + 6, TRIM.height + 6, 14]; // mm, 3 mm bleed a side
  let lines = '';
  for (let y = -S; y <= H + S; y += S) {
    for (let x = -S / 2; x <= W + S; x += S) {
      lines += star(x, y, S * 0.46);
      lines += `M${x + S / 2} ${y + S / 2 - 2.6}l2.6 2.6l-2.6 2.6l-2.6 -2.6Z`;
    }
  }
  const [cx, cy] = [W / 2, 104]; // the medallion, behind the part's name
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${palette.door}"/>`
    + `<path d="${lines}" fill="none" stroke="${palette.lattice}" stroke-width="0.4"/>`
    + `<path d="${star(cx, cy, 56)}" fill="${palette.door}" stroke="${palette.brass}" `
    + 'stroke-width="0.7"/>'
    + `<path d="${star(cx, cy, 52)}" fill="none" stroke="${palette.brass}" stroke-width="0.3"/>`
    + '</svg>';
}
const brassStar = () => '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" '
  + `viewBox="0 0 20 20"><path d="${star(10, 10, 9.5)}" fill="${palette.brass}"/>`
  + `<path d="${star(10, 10, 4)}" fill="${palette.paper}"/></svg>`;
// #endregion
const resources = [
  { id: 'lattice', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'lattice.svg', width: (TRIM.width + 6) * 10, height: (TRIM.height + 6) * 10 },
    altText: t({ en: 'A lattice of eight-pointed stars in blue lines on a deep blue field, '
      + 'with a large star outlined in brass at its centre.',
    es: 'Una celosía de estrellas de ocho puntas en líneas azules sobre un fondo azul oscuro, '
      + 'con una gran estrella perfilada en latón en el centro.' }) },
  { id: 'star', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'star.svg', width: 200, height: 200 },
    altText: t({ en: 'A small eight-pointed brass star.',
      es: 'Una pequeña estrella de latón de ocho puntas.' }) },
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Markazi Text': ['400'], // TEXT: the novel, the part page's line, the colophon
  'Reem Kufi': ['600'], // DISPLAY: the part's name, the chapter titles
  'Noto Kufi Arabic': ['400', '600'], // LABEL: running heads, folios, kickers
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown);
await loadSvg('lattice.svg', lattice());
await loadSvg('star.svg', brassStar());
// The excerpt opens on page 10 of the book, a right-hand page: folios and parity follow it.
const continuation = { pageIndexOffset: 9, pageNumbering: { startAt: 10 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showBook(doc, { title: t({ en: 'An Arabic novel, bound on the right',
  es: 'Una novela árabe encuadernada por la derecha' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images arabic book · the Cookbook inlines cookbook/_kit/*.js here
