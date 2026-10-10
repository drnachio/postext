// ═══ Postext Cookbook · Nº 030 · Anthology with bylines ═══════════════════════════════
// https://postext.dev/en/cookbook/anthology-with-bylines
// Code: MIT · Text: Hazlitt, Thoreau, Stevenson (public domain) · Cover: diffusion models
// Fonts: Spectral, Gloock, Hanken Grotesk (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'anthology-with-bylines';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: heather for the credits, rust for the numbers, plum ink on warm paper
const palette = {
  ink: '#241f26', // text: a plum-tinted near-black
  paper: '#f7f2e8', // the page
  heather: '#6b4468', // the bylines and the authors in the contents
  rust: '#a4502a', // the essay numbers
  rule: '#d5cabd', // hairlines
  muted: '#6d6570', // running heads, datelines, page numbers in the contents
};
// col() links a colour to its palette entry; the hex is the value the entry holds.
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
// One weight, no italic; 'wrap' breaks a long title onto a second line.
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
    // {number} prints the essay's number as numberingTemplate '{1:I}' writes it: I, II, III.
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
  // The cover and contents styles inherit this break (gotcha: style-inherits-break).
  breakBefore: { enabled: true, parity: 'any' } }; // 'any': each piece opens on the next page
// #endregion

// #region contents: the essays' numbers, titles, leaders and page labels, from the headings
const ENTRY = 15; // pt: the essay titles in the contents
const contents = { // passed to the config as `toc`
  // An entry's numeral takes the title's face and size and stands on its baseline.
  levels: [{ level: 1, fontFamily: 'Gloock', fontSize: pt(ENTRY), color: col('ink'),
    numberFontWeight: 400, // Gloock has one weight
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
// span: 'page' in a one-column book: a design kept in its column is cut at the column's foot,
// which would leave a band of paper under the dusk.
const coverStyle = { id: 'cover', ...bare, span: 'page', advancedDesign: cover };
const contentsOpener = { enabled: true, slot: { elements: [ // {title}, {subtitle}: frontmatter
  text('kicker', '{title} · {subtitle}', { ...label, fontSize: pt(8), letterSpacing: pt(1.6),
    color: col('heather') }, at('container', 'top-left', 0, 8)),
  text('title', '{titleText}', { ...gloock, fontSize: pt(26), color: col('ink') },
    below('kicker', 2.5)),
] } };
// #endregion

const config = () => ({
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Spectral', fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    minWordSpacing: 0.7, maxWordSpacing: 1.6 }, // tighter than the 0.6–2 defaults
  // The hidden heading line is still measured, in this face; otherwise the build needs Open Sans.
  headings: { fontFamily: 'Gloock', fontWeight: 400, levels: [essays] },
  headingStyles: [coverStyle, { id: 'contents', ...bare, advancedDesign: contentsOpener }],
  toc: contents,
  // Quoted verse is a :::verse block, a line of verse a line, 8 mm in; 'runon' resumes the
  // sentence after it.
  paragraphStyles: [{ id: 'verse', indent: mm(8) },
    { id: 'runon', firstLineIndent: pt(0) },
    // In the note, under a :::space of one line. It takes the note body's indent, 0.
    { id: 'colophon', fontSize: pt(7.5), lineHeight: pt(10.5), color: col('muted') }],
  calloutStyles: [{ id: 'note', placement: 'fixed', backgroundEnabled: false, // the page foot
    stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
    padding: { top: mm(3), right: pt(0), bottom: pt(0), left: pt(0) },
    titleStyle: { ...label, fontSize: pt(7.5), letterSpacing: pt(1.5), color: col('heather') },
    body: { fontSize: pt(9), lineHeight: pt(12.5), firstLineIndent: pt(0) } }],
  header, footer,
});

// #region art: the cover, a painting: a JPEG in assets/ cut to the trim's 3 : 4
// The design's image element names the resource by id; loadImage() below registers the file
// under its fileId. A bitmap is declared at its pixels.
const resources = [{ id: 'cover', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'cover-1200.jpg', format: 'jpeg', width: 1200, height: 1600 },
  altText: 'Heath and hills at dusk under a pale apricot sky, a low sun on the horizon, three '
    + 'trees on a ridge and a footpath winding up from the foot of the page through the '
    + 'heather.' }];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces
  Spectral: ['400', '400i'], Gloock: ['400'], 'Hanken Grotesk': ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage('cover-1200.jpg', asset('cover-1200.jpg'));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Anthology with bylines', es: 'Antología con firmas de autor' }) });

// @kit
