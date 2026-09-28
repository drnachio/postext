// ═══ Postext Cookbook · Nº 066 · Storybook chapters with vignettes and summaries ═══
// https://postext.dev/en/cookbook/storybook-chapter-vignettes
// Code: MIT · Text: C. Collodi, 1883 (PD, Gutenberg #52484) · Pictures: diffusion models
// Fonts: Averia Serif Libre, Fredericka the Great, Quicksand (SIL OFL 1.1) · Needs postext ≥ 1.8.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document (the sample is Italian in both)
const RECIPE = 'storybook-chapter-vignettes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // every colour in the config comes from here; the pictures were painted to it
  ink: '#2b2118', // text: a brown near-black
  paper: '#fffaf0', // a warm book paper, which the vignettes' margins were tinted to
  bark: '#6b4224', // chapter lines, running heads, the title
  wood: '#9a5f30', // the folio discs
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The defaults linked to main-color, bold among them, print in bark instead of blue.
  { id: 'main-color', name: 'bark (defaults)', value: { hex: palette.bark, model: 'hex' } },
];
// Text and summaries; the book's title and the chapter lines; running heads and folios.
const [TEXT, DISPLAY, LABEL] = ['Averia Serif Libre', 'Fredericka the Great', 'Quicksand'];
const TRIM = { width: 190, height: 240 }; // mm
const [TOP, INNER, OUTER] = [22, 22, 20]; // mm; mirrored, so the spine margin swaps sides
const MEASURE = TRIM.width - INNER - OUTER; // 148 mm
const [BODY, LEAD, LINES] = [13, 19, 29]; // pt, pt, and whole lines in the text block
const BOTTOM = TRIM.height - TOP - (LINES * LEAD * 25.4) / 72; // mm: 23.6
// Design-slot shorthands: a placement from an anchor's edge (mm), and a design text.
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'center',
  overflow: 'wrap', // wrap, never '…' (gotcha: overflow-ellipsis-default)
  placement, ...extra });
const caps = (tracking) => ({ textTransform: 'uppercase', letterSpacing: pt(tracking),
  color: col('bark') });
// Half a tracking (mm): 1.4.1 tracks after a centred line's last letter, shifting it left.
const trail = (tracking) => (tracking * 25.4) / 72 / 2;

// #region answer: one opener for every chapter: the vignette the heading names, then its summary
// # Capitolo I {style="capitolo" vignetta="ceppo" summary="Come andò che Maestro Ciliegia…"}
// resourceId takes placeholders like a design text: '{attr.vignetta}' draws the resource the
// heading names, so every chapter shares one style.
const VIGNETTE = { width: 84, height: 56 }; // mm, centred at the head of the text block
const SUMMARY = 124; // mm: the summary's measure, narrower than the text's
const opener = { enabled: true,
  // A floor for the height the opener reserves, in whole lines, so the text under chapter I's
  // two-line summary starts on the same grid line as the text under chapter II's three lines.
  minHeight: pt(14 * LEAD),
  slot: { elements: [
    { kind: 'image', id: 'vignette', resourceId: '{attr.vignetta}',
      placement: at('container', 'top', 0, 0,
        { width: mm(VIGNETTE.width), height: mm(VIGNETTE.height) }) },
    // Placed from the container, not from #vignette: images do not count in the height an
    // opener reserves (gotcha: opener-image-no-reserve), the texts under them do.
    text('chapter', '{titleText}', DISPLAY, 24, at('container', 'top-left', trail(2.4),
      VIGNETTE.height + 6, { width: mm(MEASURE) }), { ...caps(2.4), lineHeight: 1 }),
    text('summary', '{attr.summary}', TEXT, 12.5, at('#chapter', 'below',
      (MEASURE - SUMMARY) / 2 - trail(2.4), 5, { width: mm(SUMMARY) }),
    { italic: true, lineHeight: 1.38 }), // a multiple (gotcha: design-lineheight-multiple)
  ] },
};
const chapter = { id: 'capitolo', advancedDesign: opener };
// #endregion

// #region frontispiece: the title page as a heading style: a painted field, then the title
const SKY = 150; // mm from the top edge: the foot of the painted field
// # Pinocchio {style="frontespizio" kicker="Le avventure di"}; subtitle and author come from
// the frontmatter. Every element hangs from the page, so the field runs off three edges.
const frontispiece = {
  id: 'frontespizio',
  span: 'page', // or the field is cut at the top of the text block (gotcha: opener-clipped-at-top)
  footer: { elements: [] }, // no folio; the running heads already skip openers
  advancedDesign: { enabled: true, slot: { elements: [ // array order is paint order
    { kind: 'image', id: 'landscape', resourceId: 'frontespizio', // cut to the field's 190:150
      placement: at('page', 'top-left', 0, 0, { width: 'fill', height: mm(SKY) }) },
    text('kicker', '{attr.kicker}', LABEL, 11, at('page', 'top', trail(2.6), SKY + 11),
      { ...caps(2.6), fontWeight: 700 }),
    text('title', '{titleText}', DISPLAY, 70, at('page', 'top', 0, SKY + 17),
      { lineHeight: 1, color: col('bark') }),
    text('subtitle', '{subtitle}', TEXT, 15, at('page', 'top', 0, SKY + 44), { italic: true }),
    text('author', '{author}', LABEL, 9, at('page', 'top', trail(2), SKY + 58),
      { ...caps(2), fontWeight: 600 }),
  ] } },
};
// #endregion

// #region folios: running heads on body pages only, folios in wood-coloured discs
// The excerpt opens on book page 6, a verso, so the title page faces chapter I.
const continuation = { pageIndexOffset: 5, pageNumbering: { startAt: 6 } };
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre sits off the page's centre
const head = (id, content, parity, x) => text(id, content, LABEL, 8,
  at('page', 'top', x + trail(1.8), 12), { ...caps(1.8), fontWeight: 600, parity, pages: 'body' });
const DISC = 7.4; // mm: the folio's disc
// A fixed square with a radius of half its side is a circle; the figures sit in its middle.
// lineHeight 1.17: the baseline falls at 0.8 of the line, 0.94 em down, so Quicksand's
// figures (0.70 em tall) leave 0.23 em above and below them, and 'middle' centres that line.
const disc = (id, parity, pages, edge, x) => text(id, '{pageNumber}', LABEL, 8.5,
  at('page', edge, x, -(BOTTOM - DISC) / 2, { width: mm(DISC), height: mm(DISC) }),
  { fontWeight: 700, color: col('paper'), lineHeight: 1.17, verticalAlign: 'middle', parity,
    pages, box: { backgroundColor: col('wood'), borderRadius: mm(DISC / 2) } });
const header = { elements: [
  head('verso-title', '{title}', 'even', -SHIFT), // the book on the left-hand page
  head('recto-chapter', '{chapterTitle}', 'odd', SHIFT), // the chapter on the right
] };
const footer = { elements: [
  disc('verso-folio', 'even', 'body', 'bottom-left', OUTER),
  disc('recto-folio', 'odd', 'body', 'bottom-right', -OUTER),
  disc('opener-folio', 'all', 'opener', 'bottom', 0), // a chapter opens on either side
] };
// #endregion

// #region tailpiece: an unnumbered resource type, set where ::resource stands
// No caption prefix and no caption, so the cherries that close chapter I print with no
// label or number. The pictures the design slots paint are of this type too.
const resourceTypes = [{ id: 'fregio', name: 'Fregio', namePlural: 'Fregi', shortLabel: 'Fregio',
  captionPrefix: '', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'here', width: 0.16, align: 'center' } }];
// #endregion

// #region pictures: four paintings, declared at their pixel size under the file ids they load as
const PICTURES = { // id: [file, width, height, alt text in the book's language]
  frontespizio: ['frontespizio-1400.jpg', 1400, 1105, 'Colline toscane con cipressi e un borgo; '
    + 'un contadino guida un asinello con un carretto di legna verso la bottega di un falegname.'],
  ceppo: ['ceppo-1200.jpg', 1200, 800, 'Maestro Ciliegia, con la scure alzata sopra un pezzo di '
    + 'legno sul banco, si guarda intorno spaventato.'],
  polenta: ['polenta-1200.jpg', 1200, 800, 'Geppetto, con la parrucca gialla, riceve il pezzo di '
    + 'legno da Maestro Ciliegia; accanto, un paiolo di polenta fumante.'],
  ciliegie: ['ciliegie-600.jpg', 600, 626, 'Due ciliegie rosse su un picciolo, con una foglia.'],
};
const resources = Object.entries(PICTURES).map(([id, [fileId, w, h, altText]]) => ({
  id, typeId: 'fregio', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText,
  bitmap: { fileId, format: 'jpeg', width: w, height: h } }));
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'it', // Italian hyphenation, by its exact code (gotcha: hyphenation-locales)
  resourceTypes, colorPalette, header, footer, layout: { layoutType: 'single' },
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    italicColor: col('ink'), // *ohi* in ink, not in the defaults' bark
    // The book cites nothing, but a :ref added later prints in ink: main-color does not reach
    // this colour, which stays #295AA3 (gotcha: palette-skips-designs).
    referenceColor: col('ink'),
    firstLineIndent: mm(5), indentAfterHeading: false,
    maxWordSpacing: 1.45, // the default 2 lets 14 lines stretch past 1.45×; 3 still do, to 1.58×
  },
  headings: {
    fontFamily: DISPLAY, fontWeight: 400, // the designs paint the titles: no Open Sans to load
    // Any headings object drops the H1 break (gotcha: headings-drop-h1-break): every
    // chapter on a new page, on either side, so chapter II opens on a verso.
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
  },
  headingStyles: [frontispiece, chapter],
  paragraphStyles: [{ id: 'colofon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(11),
    color: col('bark'), textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: Collodi's Italian in both editions


// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Averia Serif Libre': ['400', '400i'], 'Fredericka the Great': ['400'],
  Quicksand: ['400', '600', '700'] }; // every face, loaded before layout (gotcha: fonts-first)

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// A design slot or ::resource names a resource, the resource a file id: load each file.
await Promise.all(Object.values(PICTURES).map(([file]) => loadImage(file, asset(file))));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: 'Le avventure di Pinocchio' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
