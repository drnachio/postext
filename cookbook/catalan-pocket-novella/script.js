// ═══ Postext Cookbook · Nº 104 · A Catalan novella, hyphenated by the IEC rules ═══════
// https://postext.dev/en/cookbook/catalan-pocket-novella
// Code: MIT · Text: N. Oller, El transplantat, 1928 (PD, Viquitexts) · Pictures: diffusion models
// Fonts: Crimson Pro, Cormorant Garamond, Cormorant SC (SIL OFL 1.1) · Needs postext ≥ 1.14.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document (the sample is Catalan in both)
const RECIPE = 'catalan-pocket-novella';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#2a2320', // text: a warm near-black, the pictures' ink too
  vermell: '#953222', // the one accent: chapter numerals, rules, the title page's title
  muted: '#6e6359', // running heads, the edition's note, the colophon
  paper: '#f5efe1', // a cream book paper, the pictures' white
};
// Each colour names its palette entry and carries its hex (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'vermell (defaults)', value: { hex: palette.vermell, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Crimson Pro', 'Cormorant Garamond', 'Cormorant SC'];
const [BODY, LEAD] = [10.4, 14]; // pt: body and leading, the pitch of every vertical measure
const LINE = (LEAD * 25.4) / 72; // mm: one line, 4.94
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'center',
  overflow: 'wrap', placement, ...extra }); // wrap, never '…' (gotcha: overflow-ellipsis-default)
const caps = (size, tracking, color = 'vermell') => ({ fontFamily: LABEL, fontSize: pt(size),
  fontWeight: 600, letterSpacing: pt(tracking), color: col(color) });

// #region page: a 12 × 18.5 cm pocket book; the text block holds 29 whole lines
const TRIM = { width: 120, height: 185 }; // mm
const [TOP, INNER, OUTER, LINES] = [18, 16, 15, 29];
const MEASURE = TRIM.width - INNER - OUTER; // 89 mm: about 64 characters of Crimson Pro
const page = {
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
  margins: { top: mm(TOP), bottom: mm(TRIM.height - TOP - LINES * LINE),
    left: mm(INNER), right: mm(OUTER), mirror: true }, // left is the inner margin on a recto
};
// #endregion

// #region answer: Catalan by its own code: l·l breaks as il- | lusió, no word splits its hiatus
const LOCALE = 'ca'; // the exact bundled code: 'ca-ES' resolves to it too (postext ≥ 1.14)
const bodyText = { // config().bodyText
  fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  firstLineIndent: mm(4.5), indentAfterHeading: false,
  // The defaults justify, hyphenate in config().locale and break by Knuth–Plass. With 'ca'
  // the dictionary follows the IEC: two letters on each side (ter-ra, cai-xa), no split in
  // a hiatus (cièn-cia), none after an apostrophe (s’ha-via), and l·l breaks with the hyphen
  // in place of the dot. compounds: false keeps arrossegar-se whole but for its own hyphen,
  // the break the IEC prefers for a verb and its pronoun (Llibre d’estil, VI 2.5).
  hyphenation: { compounds: false },
  // Spaces past 1.6× take up to 10‰ of tracking instead; a last line under 22 characters is
  // a runt. A line that must keep d’inaugurar-se whole still opens to 1.94× on page 7.
  maxWordSpacing: 1.6, maxJustifyTracking: 10, runtMinCharacters: 22,
};
// #endregion

// #region opener: the chapter's engraving, then its numeral, in one style for all four
// # II {style="capitol" art="cap2"}: the art attribute names the picture's resource.
const PICTURE = { width: MEASURE, height: 12 * LINE }; // 89 × 59.3 mm: twelve lines, 3:2
const chapter = { id: 'capitol',
  breakBefore: { enabled: true, parity: 'any' }, // a chapter opens on the next page, either side
  marginBottom: pt(0), // the opener's own height already ends on a line
  advancedDesign: { enabled: true, minHeight: pt(16 * LEAD), slot: { elements: [
    { kind: 'image', id: 'art', resourceId: '{attr.art}',
      placement: at('container', 'top', 0, 0,
        { width: mm(PICTURE.width), height: mm(PICTURE.height) }) },
    // From the container, not the image: images reserve no height (opener-image-no-reserve).
    text('numeral', '{titleText}', DISPLAY, 21, at('container', 'top', 0, PICTURE.height + 4),
      { fontWeight: 600, color: col('vermell'), lineHeight: 1 }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('vermell'),
      placement: { ...at('container', 'top', 0, PICTURE.height + 13), size: { width: mm(8) } } },
  ] } },
};
// #endregion

// #region front: half-title, frontispiece, title page and the edition's note, one page each
const front = (id, elements, extra = {}) => ({ id, breakBefore: { enabled: true, parity: 'any' },
  marginBottom: pt(0), header: { elements: [] }, footer: { elements: [] }, ...extra,
  advancedDesign: { enabled: true, ...(extra.minHeight && { minHeight: extra.minHeight }),
    slot: { elements } } });
const FRONTIS = { width: MEASURE, height: MEASURE * 1.5 }; // mm: the engraving is 2:3
const headingStyles = [
  front('avantportada', [text('title', '{titleText}', DISPLAY, 19,
    at('container', 'top', 0, 9 * LINE), { italic: true, fontWeight: 500, lineHeight: 1 })]),
  front('frontis', [
    { kind: 'image', id: 'art', resourceId: '{attr.art}',
      placement: at('container', 'top', 0, 0,
        { width: mm(FRONTIS.width), height: mm(FRONTIS.height) }) },
    text('legend', '{titleText}', LABEL, 8.5, at('container', 'top', 0, FRONTIS.height + 5),
      { ...caps(8.5, 1.4, 'muted') }),
  ]),
  front('portada', [
    text('author', '{author}', LABEL, 10, at('container', 'top', 0, 5 * LINE),
      caps(10, 2.2, 'ink')),
    text('title', '{titleText}', DISPLAY, 34, at('container', 'top', 0, 8 * LINE),
      { italic: true, fontWeight: 500, color: col('vermell'), lineHeight: 1 }),
    text('subtitle', '{subtitle}', DISPLAY, 13, at('container', 'top', 0, 8 * LINE + 17),
      { italic: true, fontWeight: 500 }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('vermell'),
      placement: { ...at('container', 'top', 0, 8 * LINE + 29), size: { width: mm(14) } } },
  ]),
  // The note sits low on the verso behind the title, its label a line above it.
  front('nota', [text('label', '{titleText}', LABEL, 8.5, at('container', 'top', 0, 13 * LINE),
    caps(8.5, 1.4))], { minHeight: pt(15 * LEAD) }),
  chapter,
];
// #endregion

// #region heads: the author on the verso, the title on the recto; a drop folio on openers
const SHIFT = (INNER - OUTER) / 2; // mm: the text block's centre is off the page's centre
const head = (id, content, parity, edge, x, y = 10, pages = 'body') => ({
  kind: 'text', id, content, parity, pages, ...caps(8, 1.3, 'muted'),
  placement: at('page', edge, x, y),
});
const folio = { fontFamily: TEXT, fontWeight: 400, letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  { ...head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER), ...folio },
  head('verso-author', '{author}', 'even', 'top', -SHIFT),
  head('recto-title', '{title}', 'odd', 'top', SHIFT),
  { ...head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER), ...folio },
] };
const drop = (parity, x) => ({ ...head(`drop-${parity}`, '{pageNumber}', parity, 'bottom', x,
  -11, 'opener'), ...folio });
const footer = { elements: [drop('odd', SHIFT), drop('even', -SHIFT)] };
// #endregion

// #region pictures: five engravings, unnumbered and uncaptioned, at their pixel size
const resourceTypes = [{ id: 'gravat', name: 'Gravat', namePlural: 'Gravats', shortLabel: 'Gravat',
  captionPrefix: '', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }];
const PICTURES = { // id: [file, width, height, alt text in the book's language]
  frontis: ['frontis-1000.jpg', 1000, 1500, 'Un carrer de poble al capvespre. A la porta del forn, '
    + 'on cremen les flames, el forner, gras i somrient, amb davantal blanc i els braços creuats.'],
  cap1: ['cap1-1200.jpg', 1200, 800, 'De nit, el tren baixa cap a Barcelona: rengleres de fanals, '
    + 'la muntanya de Montjuïc i la lluna sobre el mar. Un pagès treu el cap per la finestreta.'],
  cap2: ['cap2-1200.jpg', 1200, 800, 'Un carrer de poble buit en una nit de tardor. Per la porta '
    + 'baixa de la ferreria, el manyà pica l’enclusa enmig d’una estrella d’espurnes.'],
  cap3: ['cap3-1200.jpg', 1200, 800, 'La Rambla a trenc d’alba des d’un balcó. Un fanaler apaga '
    + 'el gas amb la perxa; al fons, els pals dels vaixells del port.'],
  cap4: ['cap4-1200.jpg', 1200, 800, 'Capvespre als afores. Un vell de cabells blancs, assegut '
    + 'al caire del desmunt, mira la via del tren, que es perd recta fins a l’horitzó.'],
};
const resources = Object.entries(PICTURES).map(([id, [fileId, w, h, altText]]) => ({
  id, typeId: 'gravat', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText,
  bitmap: { fileId, format: 'jpeg', width: w, height: h } }));
// #endregion

const paragraphStyles = [
  { id: 'nota', fontSize: pt(9), lineHeight: pt(LEAD * 0.9), color: col('muted'),
    italicColor: col('muted'), firstLineIndent: mm(4.5) },
  { id: 'fi', fontFamily: LABEL, fontSize: pt(9), letterSpacing: pt(2), color: col('vermell'),
    textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  { id: 'colofo', fontSize: pt(7.5), lineHeight: pt(10), color: col('muted'),
    italicColor: col('muted'), textAlign: 'center', firstLineIndent: pt(0),
    marginTop: pt(2 * LEAD) },
];

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LOCALE,
  resourceTypes, colorPalette, page, bodyText, paragraphStyles, headingStyles, header, footer,
  layout: { layoutType: 'single' },
  headings: { // the designs paint every title; this keeps Open Sans unloaded
    fontFamily: DISPLAY, fontWeight: 600,
    // Any headings object drops the H1 break (gotcha: headings-drop-h1-break): restated.
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }],
  },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The front matter, then the four chapters; chapter I in two files (2,500 words each at most).
const markdown = [/* @content */ '', /* @content:c1a */ '', /* @content:c1b */ '',
  /* @content:c2 */ '', /* @content:c3 */ '', /* @content:c4 */ ''].join('\n\n');

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Crimson Pro': ['400', '400i'], // the text, the note, the colophon, the folios
  'Cormorant Garamond': ['500i', '600'], // half-title and title; the chapter numerals
  'Cormorant SC': ['400', '600'], // the closing Fi; author, labels, running heads
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all(Object.values(PICTURES).map(([file]) => loadImage(file, asset(file))));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'El transplantat' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
