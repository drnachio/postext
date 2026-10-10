// ═══ Postext Cookbook · Nº 044 · Critical edition: line numbers and line-keyed notes ═══
// https://postext.dev/en/cookbook/critical-edition-line-numbers
// Code: MIT · Text: Milton, Poems (1645) (PD) · Notes: CC BY 4.0 · Laurel: diffusion models
// Fonts: Linden Hill, Imbue, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// Lycidas in the spelling of 1645, with a number beside every fifth line and two pages of
// notes keyed to those numbers, so the verse carries no note markers.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'critical-edition-line-numbers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black text on white, and one laurel green for the apparatus.
const palette = {
  ink: '#1b1b1b', // the text
  laurel: '#3c5a3e', // line numbers, note numbers, the kicker
  muted: '#6a706a', // running heads, the colophon
  paper: '#ffffff',
};
// col(id) carries the hex beside the id, because design slots paint the hex
// (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Linden Hill', 'Imbue', 'Libre Franklin'];
const LEAD = 14.5; // pt: the leading of the verse, and the grid every page keeps

// #region answer: count the lines, and set every fifth number in the margin
// The poem is one :::verse block, written as 1645 prints it: a line of verse a line, a blank
// line between verse paragraphs and two spaces before a short line. lineNumbers counts its
// lines of verse (a line that turned over would still count once) and prints the multiples
// of five beside their lines, on their baselines. position 'side' puts them in the side
// column of the one-and-a-half layout, flush with its edge next to the verse.
const lineNumbers = {
  enabled: true,
  count: 'verse', // the lines of :::verse poems; the notes are prose and not counted
  interval: 5,
  restart: 'document', // one count through the poem
  position: 'side',
  fontFamily: LABEL, fontSize: pt(7.5), color: col('laurel'),
};
// Hook-up: lineNumbers in the config; the Markdown goes to buildDocument as it is written.
// #endregion

// #region page: a poetry trim, and a channel for the numbers at the fore-edge
const PT = 25.4 / 72; // mm in a point
const [TRIM_W, TRIM_H] = [138, 216]; // mm
const [TOP, INNER] = [21, 20]; // mm
const LINES = 34; // lines of verse to a page
const BOTTOM = TRIM_H - TOP - LINES * LEAD * PT; // 21.08 mm
const [MEASURE, GUTTER, CHANNEL] = [80, 4, 6]; // mm: the longest line of Lycidas is 78.1 mm
const OUTER = TRIM_W - INNER - MEASURE - GUTTER - CHANNEL; // 28 mm beyond the numbers
const layout = {
  layoutType: 'oneAndHalf',
  sideColumnRole: 'floats', // the side column takes the numbers, never text
  sideColumnSide: 'outer', // right of the verse on a recto, left of it on a verso
  // 6 of 90 mm. The zero is Libre Franklin's widest figure, so '100' (4.9 mm) is the widest number.
  sideColumnPercent: (CHANNEL / (MEASURE + GUTTER + CHANNEL)) * 100,
  gutterWidth: mm(GUTTER),
};
const page = { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
  margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true } };
// #endregion

// #region verse: one poem, its verse paragraphs as stanzas, the short lines set in
// A blank line between verse paragraphs leaves one line of the grid (stanzaSpace, 1). Two
// leading spaces set a short line in 2 em (indentStep, 1 em a space here, against the default
// half em). The verse is ragged, like all the text here; a line too long for the measure would
// turn over and hang 2 em past its own start, but none does at 80 mm.
const verse = { indentStep: em(1) };
const verseStyles = [{ id: 'verse', hangingIndent: em(2) }];
// #endregion

// #region opener: the laurel, the title in tall capitals, and the headnote of 1645
const OPENER_LINES = 20; // of the page's 34: the first verse paragraph, 14 lines, takes the rest
const at = (id, edge, y) => ({ anchor: { to: id, edge }, offset: { x: mm(0), y: mm(y) } });
const title = (size, tracking, placement) => ({ kind: 'text', id: 'title', content: '{titleText}',
  // lineHeight is a multiple of the size (gotcha: design-lineheight-multiple).
  fontFamily: DISPLAY, fontWeight: 300, fontSize: pt(size), lineHeight: 1,
  letterSpacing: pt(tracking), textTransform: 'uppercase', color: col('ink'), placement });
const opener = { enabled: true, minHeight: pt(OPENER_LINES * LEAD), slot: { elements: [
  // An image element reserves no height (gotcha: opener-image-no-reserve): the kicker, title
  // and headnote under it reach down 20 lines. minHeight is a floor at the same depth, so a
  // shorter headnote leaves the verse on line 21.
  { kind: 'image', id: 'laurel', resourceId: 'laurel',
    placement: { anchor: { to: 'page', edge: 'top-right' }, size: { width: mm(104) } } },
  { kind: 'text', id: 'kicker', content: '{author}', fontFamily: LABEL, fontWeight: 500,
    fontSize: pt(8), letterSpacing: pt(1.6), textTransform: 'uppercase', color: col('laurel'),
    placement: at('container', 'top-left', 50) },
  title(66, 2, at('#kicker', 'below', 1)),
  // # Lycidas {headnote="In this Monody …"}. Design text wraps ragged and has no inline
  // italics (gotcha: design-text-no-inline-marks); at 64 mm no word stands alone.
  { kind: 'text', id: 'headnote', content: '{attr.headnote}', fontFamily: TEXT, italic: true,
    fontSize: pt(9.5), lineHeight: 13 / 9.5, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { ...at('#title', 'below', 3), size: { width: mm(64) } } },
] } };
// Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break). span
// 'page' paints the laurel above the text block, where a column clips its design. With the
// default marginBottom the verse would start on line 22 and send line 14 to page 2.
const poem = { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
  advancedDesign: opener, marginBottom: pt(0) };
// #endregion

// #region notes: each note opens on its line number, a chip in the label face
const NOTE = 8.6; // pt: the notes, and the note on the text
const noteStyles = [
  { id: 'textnote', fontSize: pt(NOTE), lineHeight: pt(NOTE * 1.33) },
  // The note on the text ends on the grid, 2.4 mm below its last line; half a line more
  // leaves one blank line before the first note.
  { id: 'note', fontSize: pt(NOTE), lineHeight: pt(NOTE * 1.33), hangingIndent: em(1.6),
    marginTop: pt(LEAD / 2) },
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
    marginTop: pt(LEAD) },
];
// :chip[8]{style="line"}: Linden Hill has no bold, so the number changes face and colour.
// The chip has no fill, outline or side padding, so nothing is drawn around the number.
const chipStyles = [{ id: 'line', backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0),
  fontFamily: LABEL, fontSize: em(0.9), color: col('laurel') }];
// # Notes {style="notes"} opens the next page under the title's capitals, smaller. A heading
// style keeps the level's break unless it sets its own (gotcha: style-inherits-break). Its
// design stays in the column, so the title lines up with the notes on either page.
const notesHead = { id: 'notes', span: 'column', breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true,
    slot: { elements: [title(30, 1, at('container', 'top-left', 0))] } } };
// #endregion

// #region heads: the author on the verso, the section on the recto, folios at the fore-edge
const HEAD = 13; // mm from the trim to the running heads' baseline
// A design text's first baseline sits 0.8 of a line below the top of its box: 0.96 em at the
// default lineHeight of 1.2, which the running heads keep.
const BASE = 1.2 * 0.8;
const head = (id, parity, content, x, size = 7.5, extra = {}) => ({ kind: 'text', id, parity,
  content, pages: 'body', fontFamily: LABEL, fontWeight: 500, fontSize: pt(size),
  letterSpacing: pt(1.3), textTransform: 'uppercase', color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge: parity === 'even' ? 'top-left' : 'top-right' },
    offset: { x: mm(x), y: mm(HEAD - BASE * size * PT) } } });
const folio = { fontFamily: TEXT, fontWeight: 400, letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  head('verso-folio', 'even', '{pageNumber}', OUTER, 10, folio),
  head('verso-head', 'even', '{author}', OUTER + 9),
  head('recto-head', 'odd', '{chapterTitle}', -(OUTER + 9)), // LYCIDAS, then NOTES
  head('recto-folio', 'odd', '{pageNumber}', -OUTER, 10, folio),
] };
// The two openers carry their folio at the foot instead, at the outer edge of the text block.
const drop = (parity, edge, x) => ({ ...head(`drop-${parity}`, parity, '{pageNumber}', 0, 10,
  folio), pages: 'opener', placement: { anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(-12) } } });
const footer = { elements: [drop('odd', 'bottom-right', -OUTER),
  drop('even', 'bottom-left', OUTER)] };
// #endregion

const config = () => ({
  colorPalette, page, layout, header, footer,
  bodyText: { // every paragraph sits in a styled container and takes these as defaults
    fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    // Ragged throughout, verse and notes alike, so nothing is hyphenated
    // (gotcha: ragged-no-hyphenation).
    textAlign: 'left', firstLineIndent: pt(0), verse,
  },
  // The designs print the titles, but each heading's own text is still measured, in this face.
  // Left at the default, the page would fetch Open Sans 700 for text it never paints.
  headings: { fontFamily: DISPLAY, fontWeight: 300, levels: [poem] },
  headingStyles: [notesHead],
  paragraphStyles: [...verseStyles, ...noteStyles],
  lineNumbers,
  chipStyles,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook: the poem
const notes = /* @content:notes */ ''; // content.notes.<lang>.md: the notes

// #region art: a sprig of bay laurel with its unripe berries, a watercolour in assets/
// The JPEG is cut to the sprig's 104 × 74 mm frame on white paper and declared at its pixels.
const resources = [{ id: 'laurel', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'laurel-1040.jpg', format: 'jpeg', width: 1040, height: 740 },
  altText: 'A sprig of bay laurel with a cluster of unripe berries, entering from the corner.' }];
await loadImage(resources[0].bitmap.fileId, asset(resources[0].bitmap.fileId));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build. Linden Hill has no bold, Imbue no italic.
const FONTS = { 'Linden Hill': ['400', '400i'], Imbue: ['300'], 'Libre Franklin': ['400', '500'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const source = `${markdown}\n\n${notes}`;
const doc = await buildDocumentWithFonts({ markdown: source, resources }, config(),
  kitFonts(FONTS));
showPages(doc, { title: 'Lycidas · with line numbers and notes' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
