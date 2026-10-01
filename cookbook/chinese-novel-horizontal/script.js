// ═══ Postext Cookbook · Nº 074 · A Chinese novel page on a 28 × 28 grid ════════════
// https://postext.dev/en/cookbook/chinese-novel-horizontal
// Code: MIT · Text: Lu Xun, 故乡 (1921), public domain, zh.wikisource · Plate: diffusion models
// Fonts: Noto Serif SC, Noto Sans SC, Ma Shan Zheng (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-novel-horizontal';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The night of the story's memory, and ink on a cream paper.
const palette = {
  ink: '#1f1c19', // text: a warm near-black
  night: '#1d3150', // the accent: the deep blue of the plate's sky, the opener's rule
  rule: '#c9c1b2', // the hairline under the running heads
  muted: '#6a645b', // running heads, folios, the colophon
  paper: '#fbf8f1', // a cream book paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'night (defaults)', value: { hex: palette.night, model: 'hex' } },
];
const SONG = 'Noto Serif SC'; // 宋: the text, and the title in its black weight
const HEI = 'Noto Sans SC'; // 黑: running heads, folios, the author, the colophon
const KAI = 'Ma Shan Zheng'; // 楷: a brush regular script for the plate's quotation
const [BODY, LEAD] = [10.5, 16.5]; // pt: 五号 on a 6 pt line gap, the grid's pitch
const [CHARS, LINES] = [28, 28];
const TRIM = { width: 140, height: 203 }; // mm: 大32开
const MEASURE = (CHARS * BODY * 25.4) / 72; // 103.7 mm: 28 ems of 五号
const SIDE = (TRIM.width - MEASURE) / 2; // 18.1 mm: the grid centres the measure

// #region answer: 28 characters × 28 lines of 五号, mainland line breaks and Kaiming marks
const cjk = {
  // The type area in characters: 28 ems wide, 28 lines of LEAD tall. page.margins become
  // minimums, and the grid centres the type area in the room they leave.
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  // What 'zh-Hans' gives by itself, written out so a reader can compare regions and styles.
  region: 'mainland',
  lineBreak: 'gb', // no 。，、”》 opens a line, no “《（ ends one, and no / at either end
  punctuationWidth: 'kaiming', // ，、：； quotes, brackets ½ em; 。？！ one em, ½ at a line end
  compressAdjacent: true, // idle under Kaiming (no pair tops 1.5 em); 'fullwidth' needs it
  latinSpacing: em(0.25), // 1921年, 用Noto Serif SC五号: a quarter em, none of it typed
};
const bodyText = {
  fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', // spread between the characters, never between words
  firstLineIndent: em(2), indentAfterHeading: true, // two characters, every paragraph
};
// #endregion

// #region page: 大32开 with a head margin larger than the foot
const page = {
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
  // 22 + 18 mm leave 163 mm, exactly 28 lines of 16.5 pt; 18 mm a side leave the 103.7 mm
  // measure 0.3 mm to share. A grid that no longer fits is cut down (cjkGridClamped).
  margins: { top: mm(22), bottom: mm(18), left: mm(18), right: mm(18), mirror: true },
};
// #endregion

// #region opener: the title in the Song face's black weight, sunk 8 lines
const SINK = 8; // lines of LEAD: a whole number, so the text under it keeps to the grid
const centred = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });
const opener = {
  enabled: true,
  minHeight: pt(SINK * LEAD),
  slot: { elements: [
    // The spacing after the last character is advance, not ink: the title stays centred.
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SONG, fontWeight: 900,
      fontSize: pt(46), letterSpacing: pt(23), lineHeight: 1.1, color: col('ink'),
      align: 'center', placement: centred(6) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.2),
      color: col('night'), placement: { ...centred(30), size: { width: mm(8) } } },
    { kind: 'text', id: 'author', content: '{author}', fontFamily: HEI, fontSize: pt(10.5),
      letterSpacing: pt(5), color: col('ink'), align: 'center', placement: centred(34) },
  ] },
};
// Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
const chapter = { level: 1, breakBefore: { enabled: true, parity: 'any' },
  marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener };
// #endregion

// #region heads: the book on the verso, the story on the recto, a hairline under both
const HEAD_Y = 11; // mm from the top edge to the heads; the hairline 5 mm lower
const label = { fontFamily: HEI, fontSize: pt(8), color: col('muted'), pages: 'body' };
const at = (edge, x, y = HEAD_Y) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) } });
const header = { elements: [
  { kind: 'text', id: 'verso-folio', content: '{pageNumber}', parity: 'even', ...label,
    placement: at('top-left', SIDE) },
  { kind: 'text', id: 'verso-book', content: '{title}', parity: 'even', ...label,
    letterSpacing: pt(4), placement: at('top', 0) },
  { kind: 'text', id: 'recto-story', content: '{chapterTitle}', parity: 'odd', ...label,
    letterSpacing: pt(4), placement: at('top', 0) },
  { kind: 'text', id: 'recto-folio', content: '{pageNumber}', parity: 'odd', ...label,
    placement: at('top-right', -SIDE) },
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    pages: 'body', placement: { ...at('top-left', SIDE, HEAD_Y + 5), size: { width: mm(MEASURE) } },
  },
] };
// The opener has no head: its folio drops to the foot, centred under the text.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  ...label, pages: 'opener', align: 'center', placement: at('bottom', 0, -10) }] };
// #endregion

// #region plate: the moonlit melon field faces the opener, the quotation set in Kai
// The plate, a painting: a JPEG in assets/ cut to the 140 × 203 mm trim, declared at its pixels.
const resources = [{
  id: 'moon', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'plate-1120.jpg', format: 'jpeg', width: 1120, height: 1624 },
  altText: t({
    en: 'A golden full moon in a deep blue sky over a strip of sea. On the sand below, among '
      + 'rows of striped watermelons, a boy with a silver collar stabs a steel fork at the '
      + 'sand ahead of him, and the small animal he aimed at runs off between his legs.',
    es: 'Una luna llena dorada en un cielo azul oscuro sobre una franja de mar. En la arena, '
      + 'entre hileras de sandías rayadas, un muchacho con un aro de plata al cuello clava una '
      + 'horquilla de acero en la arena, delante de él, y el animalillo al que apuntaba huye '
      + 'entre sus piernas.',
  }),
}];
const quote = { fontFamily: KAI, fontSize: pt(14), lineHeight: 1.5, color: col('paper') };
// # 月下的瓜地 {style="plate" line1="…" line2="…" line3="…"}: a page with no head or folio.
// 'page' spans the design over the sheet: a heading's design in the column is cut at its foot.
const plate = {
  id: 'plate', span: 'page', runningChapter: false, toc: false, // out of the PDF outline
  breakBefore: { enabled: true, parity: 'any' }, // (gotcha: style-inherits-break)
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'picture', resourceId: 'moon', placement: { // the whole trim
      anchor: { to: 'bleed', edge: 'top-left' },
      size: { width: mm(TRIM.width), height: mm(TRIM.height) } } },
    { kind: 'text', id: 'line1', content: '{attr.line1}', ...quote, align: 'left',
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(2) } } },
    { kind: 'text', id: 'line2', content: '{attr.line2}', ...quote, align: 'left',
      placement: { anchor: { to: '#line1', edge: 'below' } } },
    { kind: 'text', id: 'line3', content: '{attr.line3}', ...quote, align: 'left',
      placement: { anchor: { to: '#line2', edge: 'below' } } },
  ] } },
};
// #endregion

// #region styles: the editor's note in 小五 Song, the colophon in Hei
const paragraphStyles = [
  // 小五 (9 pt) nudged to 9.1875 pt: 32 of its characters fill the 28-em measure exactly.
  { id: 'note', fontSize: pt((CHARS * BODY) / 32), lineHeight: pt(LEAD), color: col('ink'),
    firstLineIndent: em(2), marginTop: pt(LEAD) }, // on the grid, a line below the text
  { id: 'colophon', fontFamily: HEI, fontSize: pt(7), lineHeight: pt(11), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD / 2) },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hans', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette, page, layout: { layoutType: 'single' }, cjk, bodyText,
  // The designs paint the titles; weight 400 keeps the heading blocks in the loaded face.
  headings: { fontFamily: SONG, fontWeight: 400, levels: [chapter] },
  headingStyles: [plate], paragraphStyles, header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif SC': ['400', '900'], // SONG: the text; the title
  'Noto Sans SC': ['400'], // HEI: running heads, folios, the author, the colophon
  'Ma Shan Zheng': ['400'], // KAI: the plate's quotation
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of the characters it sets (gotcha: cjk-fonts-slices).
const part = (re) => markdown.match(re)?.[0] ?? '';
const colophon = part(/:::paragraphs\{style="colophon"\}[\s\S]*$/);
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, markdown);
await loadCjkFonts({ [SONG]: ['900'] }, '故乡');
await loadCjkFonts({ [HEI]: ['400'] }, `呐喊故乡鲁迅0123456789${colophon}`);
await loadCjkFonts({ [KAI]: ['400'] }, part(/^# .*style="plate".*$/m));
await loadImage(resources[0].bitmap.fileId, asset(resources[0].bitmap.fileId));
// The plate is page 70 of the book, a verso: folios and parity follow the book.
const continuation = { pageIndexOffset: 69, pageNumbering: { startAt: 70 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'A Chinese novel page on a 28 × 28 grid',
  es: 'Una página de novela china en una retícula de 28 × 28' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk · the Cookbook inlines cookbook/_kit/*.js here
