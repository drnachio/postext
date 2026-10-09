// ═══ Postext Cookbook · Nº 032 · Annotated classic with margin glosses ════════════
// https://postext.dev/en/cookbook/annotated-classic-glosses
// Code: MIT · Text: Lewis Carroll (PD), glosses (CC BY 4.0) · Headpiece: diffusion models
// Fonts: Unna, Rozha One, Cormorant SC (SIL OFL 1.1) · Needs postext ≥ 1.24.0
// The mad tea-party as an annotated edition: the text keeps to one column, and its glosses stand
// in the outer margin beside the lines they explain, changing sides with the spread.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'annotated-classic-glosses';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a lawn green and a jam red on cream paper
const palette = {
  ink: '#1f1b1a', // text: a warm near-black
  lawn: '#1e6f6b', // glosses on words and jokes, the drop cap
  jam: '#b23a48', // glosses on history, the kicker
  muted: '#6e645b', // running heads, the note on this edition
  paper: '#f8f3e6', // the page, and the tablecloth
};
// col(id): a colour linked to its entry. It carries the hex too, because 1.4.1 paints
// design elements from the hex alone (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const entry = (id, hex, name = id) => ({ id, name, value: { hex, model: 'hex' } });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => entry(id, hex)),
  // The engine's defaults link to 'main-color': aimed at the green, nothing prints blue.
  entry('main-color', palette.lawn, 'lawn (defaults)'),
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Unna', 'Rozha One', 'Cormorant SC'];
const LEAD = 14; // body leading in pt: the grid of every page

// #region answer: a float-only channel at the fore-edge, and two gloss styles for it
const layout = {
  layoutType: 'oneAndHalf', // one text column and a narrower side column
  sideColumnPercent: 26, // of the 127 mm between the margins: a 33 mm channel
  sideColumnRole: 'floats', // no text runs in it: it holds side boxes and figures
  sideColumnSide: 'outer', // at the fore-edge, which mirrored margins move page by page
  gutterWidth: mm(4.5), // the text column keeps 127 − 33 − 4.5 = 89.5 mm
};
// A gloss is :::callout{type="note" span="side" title="a · …"} in the Markdown.
// span="side" moves it out of the flow into the channel, level with the block after
// the fence, so the fence goes just before the paragraph that carries its letter.
// Glosses never float. One that meets the gloss above stacks under it. One that would
// run past the column's foot slides up, as far as the gloss above allows, until its
// foot sits on the foot; if it still does not fit, it waits for the next page
// (gotcha: side-box-starts-at-fence).
const gloss = (id, hue) => ({ id,
  backgroundEnabled: false, // one device: a hairline over the gloss, in its colour
  stripe: { enabled: true, side: 'top', width: pt(0.5), color: col(hue) },
  padding: { top: mm(1.5), right: pt(0), bottom: pt(0), left: pt(0) },
  // Cormorant SC draws lower case as small capitals: the title needs no textTransform.
  titleStyle: { fontFamily: LABEL, fontWeight: 600, fontSize: pt(8.5),
    letterSpacing: pt(0.3), color: col(hue), gap: mm(0.8) },
  // Face and colours come from bodyText. A box body also inherits its 4 mm first-line
  // indent, which a gloss sets back to 0.
  body: { fontSize: pt(7.8), lineHeight: pt(10), textAlign: 'left',
    firstLineIndent: pt(0) } });
const calloutStyles = [gloss('note', 'lawn'), gloss('context', 'jam')]; // words, history
// #endregion

// #region letters: the letter that calls each gloss, in the gloss's colour
// A letter in the text is a chip named after its gloss's type, :chip[^a^]{style="note"}:
// the Markdown has no mark for coloured text, and a chip style sets a colour. With no
// fill, outline, padding or gap the chip adds no width, so the lines break as they would
// with a plain ^a^.
const letter = (id, hue) => ({ id, backgroundEnabled: false, borderWidth: pt(0),
  paddingX: pt(0), gap: pt(0), color: col(hue), bold: true });
const chipStyles = [letter('note', 'lawn'), letter('context', 'jam')];
// #endregion

// #region page: a trade page with mirrored margins, so the channel is always at the fore-edge
const PT = 25.4 / 72; // mm in a point
const [TRIM_W, TRIM_H] = [156, 234]; // mm
const [TOP, BOTTOM, INNER, OUTER] = [22, 22, 15, 14]; // mm: 38 lines of text
const page = { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
  backgroundColor: col('paper'),
  // left is a recto's inner margin; mirror swaps the sides on a verso, and 'outer' moves
  // the channel with them: right on a recto, left on a verso.
  margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
    mirror: true } };
const CONTENT_W = TRIM_W - INNER - OUTER; // 127 mm
const SIDE_W = CONTENT_W * layout.sideColumnPercent / 100; // 33 mm: the glosses' measure
const TEXT_W = CONTENT_W - SIDE_W - layout.gutterWidth.value;
// #endregion

// #region text: book texture and a flush opening paragraph
const bodyText = { // justified and hyphenated (en-us) by default
  // Copy-fitted to the 89.5 mm column: at 9.5 pt '“Have some wine,” the March Hare said in
  // an encouraging tone.' fits one line. At 10.4 pt every measure from 77 to 93 mm left
  // it a short last line: 'couraging tone.', 'aging tone.', 'ing tone.' or 'tone.'.
  fontFamily: TEXT, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4),
  // Unna's space is narrow, 0.22 em. At the default 0.6 the line breaker set 'Alice felt
  // dreadfully puzzled. The Hatter’s remark seemed to have' with its spaces at 0.69.
  minWordSpacing: 0.75 };
const paragraphStyles = [
  // The chapter's first paragraph, set flush. indentAfterHeading: false would do it
  // without glosses, but the gloss fences between the heading and this paragraph
  // count as the block after the heading, so the default stays and the paragraph takes
  // this style (gotcha: side-box-after-heading).
  { id: 'opening', firstLineIndent: pt(0) },
];
// #endregion

// #region opener: a headpiece, the chapter's numeral and title, a headnote with a drop cap
const HEADPIECE = 72; // mm: the depth of the painting at the head of the page
const HEADNOTE = { size: 9.8, lead: LEAD }; // pt: the headnote keeps the body's leading
const CAPS = { text: 0.597, initial: 0.56 }; // cap heights, em: Unna and Rozha One
// The initial's size: its capital runs from the first line's cap height down to the
// last baseline it spans. The default size is as tall as both line boxes, so its top
// rises above the first line's capitals.
const dropSize = (lines) => pt(((lines - 1) * HEADNOTE.lead + CAPS.text * HEADNOTE.size)
  / CAPS.initial);
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { y: mm(y) }, size: { width } });
// The opener reserves the height of its lowest text, rounded up to the grid, and the
// heading's default bottom margin adds one blank line: with a four-line headnote the
// text starts on line 23. The painting reserves nothing
// (gotcha: opener-image-no-reserve), so the kicker, the title and the headnote hang
// below it and carry the reserve past it.
const opener = { enabled: true, slot: { elements: [
  // An image element draws a resource without number or caption. It hangs from the
  // trim's corner over the margin, which 1.4.1 paints only when level 1 spans the page.
  { kind: 'image', id: 'headpiece', resourceId: 'tea-table',
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: mm(TRIM_W) } } },
  // The numeral comes from the heading line,
  // # A Mad Tea-Party {num="VII" headnote="…" …}: the excerpt stands alone, so
  // {chapterNumber} would print 1 (gotcha: heading-number-placeholders).
  { kind: 'text', id: 'kicker', content: 'Chapter {attr.num}', fontFamily: LABEL,
    fontWeight: 600, fontSize: pt(9), letterSpacing: pt(2), textTransform: 'uppercase',
    color: col('jam'), align: 'left',
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { y: mm(HEADPIECE - TOP + 8) } } }, // 8 mm under the painting's foot
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY,
    fontSize: pt(40), lineHeight: 1.05, color: col('ink'), align: 'left', // wraps when longer
    placement: below('kicker', 2, 'fill') },
  // Drop caps exist only in design text, which is set ragged
  // (gotcha: design-text-ragged): the headnote is the editor's voice, italic and ragged;
  // Carroll's text opens in the flow.
  { kind: 'text', id: 'headnote', content: '{attr.headnote}', fontFamily: TEXT,
    italic: true, fontSize: pt(HEADNOTE.size),
    // A design text's lineHeight multiplies its size
    // (gotcha: design-lineheight-multiple).
    lineHeight: HEADNOTE.lead / HEADNOTE.size, color: col('ink'),
    align: 'left',
    dropCap: { lines: 2, fontFamily: DISPLAY, fontSize: dropSize(2), color: col('lawn'),
      gap: mm(1.5) },
    placement: below('title', 5, mm(TEXT_W)) },
  // The note on this edition stands in the channel, level with the headnote's top.
  { kind: 'text', id: 'edition-label', content: 'This edition', fontFamily: LABEL,
    fontWeight: 600, fontSize: pt(8.5), letterSpacing: pt(0.3), color: col('muted'),
    align: 'left', placement: { anchor: { to: '#headnote', edge: 'right-of' },
      offset: { x: layout.gutterWidth }, size: { width: mm(SIDE_W) } } },
  { kind: 'text', id: 'edition', content: '{attr.source}', fontFamily: TEXT,
    fontSize: pt(7.5), lineHeight: 10 / 7.5, color: col('muted'), align: 'left',
    placement: { anchor: { to: '#edition-label', edge: 'below' }, offset: { y: mm(0.8) },
      size: { width: mm(SIDE_W) } } },
] } };
// #endregion

// The running heads: the book on the verso, the chapter on the recto, folios at the fore-edge.
const HEAD = 14; // mm from the top trim to the heads' baseline
const INSET = 8; // mm from the folio's outer edge to the running head's
const DROP = 13; // mm from the bottom trim up to the foot of the drop folio's box
// In 1.4.1 a design text's first baseline sits 0.96 em below the top of its box: the default
// lineHeight, 1.2, times 0.8, where the baseline falls in the line box.
const BASELINE = 1.2 * 0.8;
const baseline = (size) => mm(HEAD - BASELINE * size * PT);
const head = (id, parity, content, x, extra = {}) => ({ kind: 'text', id, parity, content,
  pages: 'body', fontFamily: LABEL, fontWeight: 600, fontSize: pt(8.5), letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge: parity === 'even' ? 'top-left' : 'top-right' },
    offset: { x: mm(x), y: baseline(extra.fontSize?.value ?? 8.5) } } });
const folio = { fontFamily: TEXT, fontWeight: 700, fontSize: pt(9), letterSpacing: pt(0),
  color: col('ink') };
const header = { elements: [
  head('verso-folio', 'even', '{pageNumber}', OUTER, folio),
  head('verso-title', 'even', '{title}', OUTER + INSET),
  head('recto-title', 'odd', '{chapterTitle}', -(OUTER + INSET)),
  head('recto-folio', 'odd', '{pageNumber}', -OUTER, folio),
] };
// The opener, a recto, carries a drop folio at the foot of its channel instead.
const footer = { elements: [{ ...head('drop-folio', 'odd', '{pageNumber}', -OUTER, folio),
  pages: 'opener', placement: { anchor: { to: 'page', edge: 'bottom-right' },
    offset: { x: mm(-OUTER), y: mm(-DROP) } } }] };

const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  colorPalette, page, layout, bodyText, paragraphStyles, calloutStyles, chipStyles, header,
  footer,
  headings: {
    fontFamily: DISPLAY, fontWeight: 400, color: col('ink'), // Rozha One has one weight
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      // 'odd' puts the opener on a recto; span 'page' lets its design cross the channel.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        advancedDesign: opener },
    ],
  },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook


// The headpiece is a resource that only the opener's design draws: never cited, never placed.
// It is a watercolour, a JPEG in assets/ cut to the trim's 156 × 72 mm, declared at its pixels.
const resources = [{ id: 'tea-table', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'tea-table-1560.jpg', format: 'jpeg', width: 1560, height: 720 },
  altText: 'The tea-table under a tree, seen from above: a long white cloth laid with cups, a red '
    + 'teapot, bread and butter and a watch on its chain; the Dormouse asleep in a teapot at one '
    + 'end and a red arm-chair at the other.' }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  Unna: ['400', '400i', '700'], // 700: the folios and the gloss letters
  'Rozha One': ['400'],
  'Cormorant SC': ['600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadImage('tea-table-1560.jpg', asset('tea-table-1560.jpg'));
const continuation = { pageNumbering: { startAt: 81 } }; // chapter VII of a book: an odd folio
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: 'Annotated classic with margin glosses' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
