// ═══ Postext Cookbook · Nº 012 · From a Markdown string to a designed page ══════════
// https://postext.dev/en/cookbook/first-page-from-markdown
// Code: MIT · Text: original (CC BY 4.0) · Photo: diffusion models
// Fonts: Newsreader, Young Serif, Inter Tight (SIL OFL 1.1) · Needs postext ≥ 1.4.1
//
// This pen sets a Markdown string with a frontmatter block on two magazine pages and paints
// them on canvases. The whole design is in config(); swap config() for {} in the build
// below to see the engine's defaults.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'first-page-from-markdown';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Every setting that shapes the pages is in this part, from PAGE down to config().
const PAGE = { width: 180, height: 240 }; // mm: a 3:4 magazine page
const MARGIN = { top: 22, bottom: 22, inner: 20, outer: 14 }; // mm; inner is the spine side
const LEAD = 13.5; // pt: the body leading, the grid every vertical space steps on

// #region palette: six named colours; every colour in the config links to one of them
const palette = {
  ink: '#1b1e23', // text: a cool near-black, never #000
  band: '#2b3a67', // the one accent (an indigo): the folios, the subheads, the end mark
  sand: '#e9dcc0', // the kicker, the title and the byline
  salt: '#f7f4ee', // the standfirst
  rule: '#d6d3cc', // the hairline over the colophon
  muted: '#66686e', // running heads and the colophon
};
// Each colour carries its palette id and its hex: 1.4.1 paints the elements of headers,
// footers and openers from the hex (gotcha: palette-skips-designs). The design objects
// below are factories that config() calls, so col() copies the hex out of `palette` on
// every build, and a retint reaches the folios and the drop folio too.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = () => [
  ...Object.entries(palette)
    .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The defaults of the text styles (headings, bold, italic, bullets) link to 'main-color':
  // point it at the accent. Header, footer and opener defaults do not follow it, so they
  // are restated below.
  { id: 'main-color', name: 'defaults', value: { hex: palette.band, model: 'hex' } },
];
// #endregion

// #region art: a photograph of the salt pans and the dunes at Sorra, cut for a page × band frame
// A JPEG in assets/, cut to PAGE.width × BAND (180 × 140 mm) and declared at its pixels, so at
// full width it fills the band exactly. A deeper band needs a picture cut to the new frame.
const landscape = { id: 'landscape', typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, bitmap: { fileId: 'salt-road-1440.jpg', format: 'jpeg', width: 1440,
    height: 1120 },
  altText: 'Salt pans at dusk, a dune with a cairn of white stones on its crest, and a line of '
    + 'footprints crossing the pans towards it.' };
// #endregion

// #region opener: the H1 as a bleed band; kicker, title, standfirst and byline sit on it
const BAND = 140; // mm from the top edge: the band holds the top 58% of the page
const TITLE_W = 130; // mm: room for two lines of the title; a third would push the byline
// down onto the pale salt pans: keep titles short
const DECK_W = 104; // mm: the standfirst stops short of the dune and its cairn
const MAGAZINE = t({ en: 'Field notes', es: 'Cuaderno de campo' });
const label = { fontFamily: 'Inter Tight', fontSize: pt(7.5), fontWeight: 600,
  letterSpacing: pt(1.4), textTransform: 'uppercase' };
const below = (id, y, width) => ({ anchor: { to: `#${id}`, edge: 'below' },
  offset: { y: mm(y) }, ...(width && { size: { width: mm(width) } }) });
const opener = () => ({
  enabled: true,
  minHeight: mm(BAND - MARGIN.top + 5), // from the top margin to the band's foot, plus 5 mm
  slot: {
    elements: [
      // The photograph is PAGE.width × BAND (see art): at full width it fills the band.
      { kind: 'image', id: 'art', resourceId: 'landscape',
        placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
      { kind: 'text', id: 'kicker', content: MAGAZINE, ...label, color: col('sand'),
        placement: { anchor: { to: 'page', edge: 'top-left' }, // recto: inner on the left
          offset: { x: mm(MARGIN.inner), y: mm(20) } } },
      // {titleText} is the H1; {subtitle}, {author} and {publishDate} are frontmatter. A design
      // text's lineHeight multiplies its size, never pt() (gotcha: design-lineheight-multiple).
      { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Young Serif',
        fontSize: pt(54), lineHeight: 1, color: col('sand'), align: 'left',
        overflow: 'wrap', // not an ellipsis (gotcha: overflow-ellipsis-default)
        placement: below('kicker', 3, TITLE_W) },
      { kind: 'text', id: 'deck', content: '{subtitle}', fontFamily: 'Newsreader',
        fontSize: pt(12), lineHeight: 1.3, italic: true, color: col('salt'), align: 'left',
        overflow: 'wrap', placement: below('title', 5, DECK_W) },
      { kind: 'text', id: 'byline', ...label, color: col('sand'),
        content: t({ en: 'By {author} · {publishDate}',
          es: 'Por {author} · {publishDate}' }),
        placement: below('deck', 4.5) },
    ],
  },
});
// #endregion

// #region running-heads: folio and title on body pages, a drop folio under the opener
const HEAD = 12; // mm: the running heads from the top edge, the drop folio from the foot
const GAP = 3; // mm between a folio and its label, however many digits the folio has
const head = (id, content, parity, placement, color = col('muted')) => ({
  kind: 'text', id, content, parity, pages: 'body', ...label, color, placement,
});
const outer = (edge, x) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD) } });
const beside = (id, edge, x) => ({ anchor: { to: `#${id}`, edge }, offset: { x: mm(x) } });
const header = () => ({
  elements: [ // folios on the outer margin's edge; each label hangs off its folio
    head('verso-folio', '{pageNumber}', 'even', outer('top-left', MARGIN.outer), col('band')),
    head('verso-title', '{title}', 'even', beside('verso-folio', 'right-of', GAP)),
    head('recto-folio', '{pageNumber}', 'odd', outer('top-right', -MARGIN.outer), col('band')),
    head('recto-title', MAGAZINE, 'odd', beside('recto-folio', 'left-of', -GAP)),
  ],
});
const footer = () => ({
  elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}', pages: 'opener',
    ...label, color: col('band'),
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-HEAD) } } }],
});
// #endregion

// The colophon: small sans under a 0.5 pt hairline, with no box around it.
const colophon = () => ({ id: 'colophon', backgroundEnabled: false, marginTop: pt(LEAD),
  stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
  padding: { top: mm(1.6), right: pt(0), bottom: pt(0), left: pt(0) },
  body: { fontFamily: 'Inter Tight', fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
    textAlign: 'left', hyphenation: false, firstLineIndent: pt(0) } });

// #region answer: one config factory in place of the default skin: page, type, colour, slots
const config = () => ({ // a new object per build (gotcha: config-cache-identity)
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette: colorPalette(),
  page: { // mirror: left is the inner margin and right the outer one; versos swap them
    width: mm(PAGE.width), height: mm(PAGE.height),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true },
  },
  // 'double' is the default, stated so that the whole page setup reads in one place
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { // justified, hyphenated and broken by paragraph: all on by default
    fontFamily: 'Newsreader', // one family name (gotcha: font-family-one-name)
    fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    firstLineIndent: mm(4), indentAfterHeading: false,
    // Optional, for 70 mm columns: word spaces from 0.8 to 1.8 × the normal one, and runts
    // tightened by at most 4 thousandths of an em, so the grey of the text stays even.
    minWordSpacing: 0.8, maxWordSpacing: 1.8, maxRuntTracking: 4,
  },
  headings: {
    fontFamily: 'Young Serif', fontWeight: 400, color: col('band'), // it has one weight
    levels: [
      // span: 'page' opens the H1 on a new page, across both columns. The restated break
      // (gotcha: headings-drop-h1-break) puts the next article pasted in on a recto.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        advancedDesign: opener() },
      // A line of margin and a line and a half of head: 2.5 lines, which snapToGrid (on by
      // default) rounds up to 3, so the text below lands back on the grid.
      { level: 2, fontSize: pt(13), lineHeight: pt(1.5 * LEAD), marginTop: pt(LEAD),
        marginBottom: pt(0) },
    ],
  },
  unorderedLists: { color: col('ink'), fontWeight: 400, bulletChar: '–',
    marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [colophon()],
  header: header(),
  footer: footer(),
});
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
// content.<lang>.md, inlined by the Cookbook: every frontmatter value is quoted, since an ISO
// date or a number would print empty (gotcha: quote-frontmatter). The end mark is an inline
// swatch that names `band`, so it follows the palette too.
const markdown = /* @content */ '';
// The opener's image element points at the photograph by id.
const resources = [landscape];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// #region fonts: every face the design uses, loaded first (gotcha: fonts-first)
const FONTS = {
  Newsreader: ['400', '400i', '700'], // text
  'Young Serif': ['400'], // display: it ships one weight, so the headings ask for 400
  'Inter Tight': ['400', '600'], // labels: kicker, byline, running heads, colophon
};
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: fonts, the photograph, one buildDocument call with a fresh config, then paint
await loadFonts(FONTS, markdown);
await loadImage(landscape.bitmap.fileId, asset(landscape.bitmap.fileId));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources }, config()), markdown);
// showPages paints each page with renderPageToCanvas(page, doc, canvas, { scale }).
showPages(doc, {
  title: t({ en: 'From a Markdown string to a designed page',
    es: 'De una cadena Markdown a una página diseñada' }),
});
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
