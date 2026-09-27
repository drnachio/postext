// ═══ Postext Cookbook · Nº 005 · Running heads by parity ═══════════════════════════════
// https://postext.dev/en/cookbook/running-heads-by-parity
// Code: MIT · Text: Montaigne, tr. Cotton (PD, Gutenberg #3600); es: new translation (MIT)
// Fonts: Baskervville, Libre Caslon Display, Alegreya SC (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// Pages 29 to 33 of a pocket Montaigne. Versos carry the book's title and rectos the essay's,
// the folios sit in tabs in the outer margin, and an opener prints only a folio at the foot.
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'running-heads-by-parity';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: four colours with semantic ids; main-color points at the sepia
const palette = {
  ink: '#1f1b16', // text: a warm near-black, never #000
  sepia: '#8a5a2b', // the one accent: folio tabs, dividers, opener plates (5.3:1 on paper)
  muted: '#6f6558', // running heads, verse glosses, the colophon (5.2:1 on paper)
  paper: '#f8f4ec', // a warm off-white page; also the type reversed out of the sepia
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // Text-style defaults (headings, bold, italic, lists, boxes) link to 'main-color'. The
  // built-in header and footer keep #295AA3, and design slots never read the palette
  // (gotcha: palette-skips-designs), so every element colour here carries its hex.
  { id: 'main-color', name: 'sepia (defaults)', value: { hex: palette.sepia, model: 'hex' } },
];
// #endregion
const LEAD = 14; // pt: the body leading, the pitch of the baseline grid

// #region tab: the folio tab and its divider, the two pieces every head is built from
const FOLIO_PT = 7.5; // pt: the folio, and the book's title in capitals beside it
const TITLE_PT = 8.8; // pt: the essay's title, whose italic lowercase reads small at 7.5
const LINE = FOLIO_PT * 1.2; // pt: the folio and both titles share this line box and baseline
const PAD = { top: 1, bottom: 1.4 }; // pt: 0.4 pt more below for the descending 3, 5, 7, 9
const TAB = 7.5; // mm: the tab's width
const TAB_H = LINE + PAD.top + PAD.bottom; // pt: the tab's height, which the divider matches
const folio = ({ id, parity, pages, anchor, x = 0, y }) => ({
  kind: 'text', id, content: '{pageNumber}', parity, pages, fontFamily: 'Alegreya SC',
  fontSize: pt(FOLIO_PT), fontWeight: 700, lineHeight: LINE / FOLIO_PT, color: col('paper'),
  box: { backgroundColor: col('sepia'), borderRadius: mm(2), // a pill; the number is centred
    padding: { top: pt(PAD.top), bottom: pt(PAD.bottom) } }, // by default in both directions
  placement: { anchor, offset: { x: mm(x), y: mm(y) }, size: { width: mm(TAB) } },
});
const divider = ({ id, parity, from, edge, x }) => ({
  kind: 'rule', id, parity, pages: 'body', direction: 'vertical', thickness: pt(0.5),
  color: col('sepia'), placement: { anchor: { to: `#${from}`, edge }, offset: { x: mm(x) },
    size: { height: pt(TAB_H) } },
});
// #endregion

// #region page: a pocket trim; the margins mirror, the text block holds 31 whole lines
const TRIM = { width: 132, height: 198 }; // mm
const TOP = 22; // mm: the top margin, which holds the heads (gotcha: header-paints-over-text)
const INNER = 15; // mm
const OUTER = 21; // mm: the outer margin, where the folio tabs hang
const LINES = 31; // whole lines of LEAD in the text block, so full pages end level
const MEASURE = TRIM.width - INNER - OUTER; // the text block's width: 96 mm
const geometry = { // left is the inner margin on a recto; mirror swaps it on the versos
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, // 150 dpi is for the screen
  backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - (LINES * LEAD * 25.4) / 72),
    left: mm(INNER), right: mm(OUTER), mirror: true },
};
// #endregion

// #region answer: running heads by parity: book on the verso, essay on the recto, folios outside
const GAP = 3; // mm from the tab to the divider, which lands on the text block's edge
const HEAD = 12; // mm from the top edge of the page to the top of the tab
const CAP = t({ en: 60.5, es: 66.8 }); // mm: fitted so essay IV's head ends on a word
// (gotcha: ellipsis-mid-word); a short running title (see Variations) suits any title
const page = (edge) => ({ to: 'page', edge }); // the trim box (gotcha: negative-offsets)
const header = { elements: [
  // Verso (even): tab | divider | THE BOOK'S TITLE from the frontmatter (gotcha: quote-frontmatter)
  folio({ id: 'folio-even', parity: 'even', pages: 'body', anchor: page('top-left'),
    x: OUTER - GAP - TAB, y: HEAD }),
  divider({ id: 'rule-even', parity: 'even', from: 'folio-even', edge: 'right-of', x: GAP }),
  { kind: 'text', id: 'book', content: '{title}', parity: 'even', pages: 'body',
    fontFamily: 'Alegreya SC', fontSize: pt(FOLIO_PT), lineHeight: LINE / FOLIO_PT,
    color: col('muted'), textTransform: 'uppercase', letterSpacing: pt(1.3),
    placement: { anchor: { to: '#rule-even', edge: 'right-of' }, // top: the tab's top
      offset: { x: mm(2.5), y: pt(PAD.top) } } }, // PAD.top down: on the folio's baseline
  // Recto (odd): the essay's title, cut short with an ellipsis | divider | tab.
  folio({ id: 'folio-odd', parity: 'odd', pages: 'body', anchor: page('top-right'),
    x: -(OUTER - GAP - TAB), y: HEAD }), // from the right edge, a negative x runs inwards
  divider({ id: 'rule-odd', parity: 'odd', from: 'folio-odd', edge: 'left-of', x: -GAP }),
  { kind: 'text', id: 'essay', content: '{chapterTitle}', parity: 'odd', pages: 'body',
    fontFamily: 'Baskervville', italic: true, fontSize: pt(TITLE_PT),
    lineHeight: LINE / TITLE_PT, color: col('muted'),
    overflow: 'ellipsis-end', // stated, though default (gotcha: overflow-ellipsis-default)
    placement: { anchor: { to: '#rule-odd', edge: 'left-of' },
      offset: { x: mm(-2.5), y: pt(PAD.top) }, size: { maxWidth: mm(CAP) } } },
] };
// Openers: no head, only a drop folio HEAD above the page's foot, centred under the text block.
const footer = { elements: [folio({ id: 'drop-folio', parity: 'all', pages: 'opener',
  anchor: { to: 'container', edge: 'bottom' }, y: -HEAD })] };
// #endregion

// #region opener: the essay's numeral on a sepia plate; the title below it, set in full
const PLATE = 26; // mm: a square plate at the head of the text block
const opener = {
  enabled: true,
  minHeight: mm(58), // the text of every essay starts on the same line
  slot: { elements: [
    { kind: 'box', id: 'plate', style: { backgroundColor: col('sepia') },
      placement: { anchor: { to: 'container', edge: 'top-left' },
        size: { width: mm(PLATE), height: mm(PLATE) } } },
    { kind: 'text', id: 'numeral', content: '{attr.num}', fontFamily: 'Libre Caslon Display',
      fontSize: pt(48), lineHeight: 1, color: col('paper'),
      placement: { anchor: { to: '#plate', edge: 'align-top' }, // the plate's own box, where
        size: { width: mm(PLATE), height: mm(PLATE) } } }, // the text centres by default
    { kind: 'text', id: 'book', content: '{subtitle}', fontFamily: 'Alegreya SC',
      fontSize: pt(8.5), letterSpacing: pt(1.4), color: col('sepia'), align: 'left',
      placement: { anchor: { to: 'container', edge: 'top-left' },
        offset: { x: mm(PLATE + 4.5), y: mm(PLATE - 2.9) } } }, // its baseline on the plate's foot
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Libre Caslon Display',
      fontSize: pt(20), lineHeight: 1.12, color: col('ink'), align: 'left',
      overflow: 'wrap', // an opener shows the whole title; the running head cuts it
      placement: { anchor: { to: '#plate', edge: 'below' }, offset: { y: mm(6) },
        size: { width: mm(MEASURE) } } },
  ] },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation by exact code (gotcha: hyphenation-locales)
  colorPalette,
  page: geometry,
  layout: { layoutType: 'single' },
  bodyText: { // bold, italic and references default to main-color (the sepia): set to the ink
    fontFamily: 'Baskervville', fontSize: pt(10.2), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    // Hyphenation, optimal breaking and widow, orphan and runt control are on by default; a band
    // of 0.7–1.65 (default 0.6–2) evens the grey from line to line. At the default runt length,
    // 20 space widths, English essay IV ends on 'minds.' alone; at 16 it ends on 'our minds.'.
    minWordSpacing: 0.7, maxWordSpacing: 1.65, runtMinCharacters: 16,
  },
  // #region levels: every essay opens on a recto; the heading draws the opener
  headings: { // 400, the face's only weight: the default 700 would ask for one that is missing
    fontFamily: 'Libre Caslon Display', fontWeight: 400, color: col('ink'),
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      // 'odd' puts every opener on a recto, adding a blank verso when one is needed;
      // span: 'page' makes the design an opener, where a \\ in the title breaks the line.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
    ],
  },
  // #endregion
  // Montaigne's quotations: a box with no fill keeps verse and gloss together. Its two 10.5 pt
  // margins and a two-line gloss (2 × 10.5 pt) make three whole lines, so the grid adds no space.
  calloutStyles: [{ id: 'quote', backgroundEnabled: false,
    padding: { top: pt(0), right: mm(8), bottom: pt(0), left: mm(8) },
    marginTop: pt(LEAD * 0.75), marginBottom: pt(LEAD * 0.75) }],
  paragraphStyles: [
    { id: 'verse', fontSize: pt(9.6), textAlign: 'center', firstLineIndent: pt(0) },
    { id: 'gloss', fontSize: pt(7.6), lineHeight: pt(LEAD * 0.75), color: col('muted'),
      textAlign: 'center', firstLineIndent: pt(0) },
    // Markdown has no horizontal rule (--- prints as text; gap: markdown-extras), so the rule
    // over the colophon is eight em dashes of Alegreya SC that overlap into a 0.5 pt line.
    { id: 'end', fontFamily: 'Alegreya SC', fontSize: pt(8), color: col('sepia'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
    // No italics in the colophon: a style's italic runs take bodyText.italicColor, the ink,
    // and would print darker than the muted words around them (gotcha: style-italic-colour).
    { id: 'colophon', fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0) },
  ],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = { // text, display and label faces (Libre Caslon Display has no italic)
  Baskervville: ['400', '400i'], 'Libre Caslon Display': ['400'], 'Alegreya SC': ['400', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// #region build: pages 29 to 33 of the book
// 28 pages come before this one, so recto and verso, the mirrored margins and the odd/even
// heads follow the book page (gotcha: parity-page1-recto); the folios start at 29.
const continuation = { pageIndexOffset: 28, pageNumbering: { startAt: 29 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'Running heads by parity', es: 'Cabeceras según la paridad' }) });
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
