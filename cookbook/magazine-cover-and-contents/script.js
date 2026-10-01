// ═══ Postext Cookbook · Nº 023 · Magazine cover and sectioned contents ═══════════════
// https://postext.dev/en/cookbook/magazine-cover-and-contents
// Code: MIT · Text: original (CC BY 4.0) · Photos: R. Heuvel, chuttersnap, m. tuna (CC0), diffusion
// Fonts: Spectral, Bodoni Moda, Jost (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'magazine-cover-and-contents';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one house colour, 'band', that every section overrides
const palette = {
  ink: '#1c1a16', // text: a warm near-black
  paper: '#fbf8f1', // the page, and type set on colour
  band: '#8b6a3e', // the house earth; each :::part fence brings its own 'band'
  muted: '#6b6358', // credits and the standfirsts in the contents
  olive: '#5d6a2b', terracotta: '#a3472a', wine: '#7a2c3a', // as in the :::part fences: edit both
};
// A part overrides by id; designs paint the hex in 1.4.1 (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the ink, so nothing prints blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 230, height: 300 }; // an independent-magazine trim, in mm
const MARGIN = { top: 22, bottom: 20, inner: 16, outer: 14 }; // mirrored
const LEAD = 13.5; // body leading in pt: the baseline grid
const caps = { fontFamily: 'Jost', fontWeight: 600, textTransform: 'uppercase' }; // the label face
const label = { ...caps, align: 'left' }; // design text is centred by default
const bodoni = { fontFamily: 'Bodoni Moda', overflow: 'wrap', align: 'left' };
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, placement, ...look });

// #region answer: the cover, one design slot whose words hang from each other
const MASTHEAD = TRIM.width - MARGIN.inner - MARGIN.outer; // the word spans the text block
const PANEL = 84; // mm: the cover lines' panel, a column of paper over the photograph
const SEAM = 0.3; // mm: each box overlaps the one above, so no hairline of photo shows
// A cover line: a kicker in its section's colour over a line in Bodoni, on paper boxes of one
// width. Chained with 'below' they read as one panel, and a longer line pushes the rest down.
const sheet = (top, bottom) => ({ backgroundColor: col('paper'),
  padding: { top: mm(top), right: mm(5), bottom: mm(bottom), left: mm(5) } });
const small = { ...label, fontSize: pt(8), letterSpacing: pt(1.6), color: col('ink') };
const coverLine = (n, colour, above = n === 1 ? '#masthead' : `#line${n - 1}`) => [
  text(`kicker${n}`, `{attr.kicker${n}}`, { ...small, color: col(colour),
    box: sheet(n === 1 ? 5 : 4, 1.5) },
  { ...at(above, 'below', 0, n === 1 ? 8 : -SEAM), size: { width: mm(PANEL) } }),
  text(`line${n}`, `{attr.line${n}}`, { ...bodoni, italic: true, fontSize: pt(15),
    lineHeight: 1.12, color: col('ink'), box: sheet(0, n === 3 ? 5 : 0) }, // line 3 ends the panel
  { ...at(`#kicker${n}`, 'below', 0, -SEAM), size: { width: mm(PANEL) } }),
];
const cover = { enabled: true, slot: { elements: [
  { kind: 'image', id: 'photo', resourceId: 'cover', // the JPEG is cropped to the trim, 23 : 30
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: 'fill' } } },
  text('strap', '{subtitle}', small, at('page', 'top-left', MARGIN.inner, 12)), // a recto
  text('issue', '{attr.issue}', { ...small, align: 'right' },
    at('page', 'top-right', -MARGIN.outer, 12)),
  text('masthead', '{titleText}', { ...bodoni, fontWeight: 900, fontSize: pt(118),
    lineHeight: 0.86, // a multiple of the size (gotcha: design-lineheight-multiple)
    letterSpacing: pt(1), textTransform: 'uppercase', align: 'center', color: col('ink') },
  { ...at('#strap', 'below', 0, 6), size: { width: mm(MASTHEAD) } }),
  ...coverLine(1, 'olive'), ...coverLine(2, 'terracotta'), ...coverLine(3, 'wine'),
  // The price and a made-up barcode sit in the corner, anchored to the page, not the words.
  text('price', '{attr.price}', { ...small, fontSize: pt(7), box: sheet(1, 1.5) },
    { ...at('page', 'bottom-right', -MARGIN.outer, -12), size: { width: mm(32) } }),
  { kind: 'image', id: 'barcode', resourceId: 'barcode',
    placement: { ...at('#price', 'above', 0, SEAM), size: { width: mm(32) } } },
] } };
// hook-up: headingStyles gets { id: 'cover', numbered: false, toc: false, advancedDesign: cover,
// footer: { elements: [] } }, with no folio; the Markdown's first line is
// # Fallow {style="cover" issue="…" price="…" kicker1="…" line1="…" … kicker3="…" line3="…"}
// #endregion

// #region sections: parts with no divider page, and a heading style for each kind of page
const parts = { page: false }; // a :::part now only sets the section's title and palette
const story = (id, picture) => ({ id, numbered: false, advancedDesign: opener(picture) });
const headingStyles = () => [
  { id: 'cover', numbered: false, toc: false, advancedDesign: cover,
    footer: { elements: [] } }, // no folio on the cover (the header is empty everywhere)
  { id: 'contents', numbered: false, toc: false, advancedDesign: contentsOpener,
    footer: folioLine('{title}', '{publishDate}') }, // no section yet: the issue instead
  // One opener for every story; the style names its picture, the part its colour.
  story('grain', 'flasks'), story('rest', 'fields'), story('bread', 'harvest'),
];
// #endregion

// #region contents: generated from the headings, with a row in each section's colour
const mid = at('container', 'left', 0, -1); // the row's middle, 1 mm up: air above the title
const contents = { // passed to the config as `toc`
  levels: [{ level: 1, fontFamily: 'Bodoni Moda', fontSize: pt(17), fontWeight: 600,
    marginBottom: pt(2 * LEAD) }], // in ink, on the body's 13.5 pt leading
  pageNumber: { fontSize: pt(26), width: mm(14) }, // in the levels' Bodoni
  leader: { enabled: false }, subtitle: { enabled: true, attr: 'standfirst', // in italic
    fontFamily: 'Spectral', fontSize: pt(10), color: col('muted') },
  // A part row is a design as wide as the column; its 'band' takes the part's palette. No
  // {pageNumber}: a part with no divider page has no page (gotcha: toc-part-rows-no-label).
  parts: { height: pt(2 * LEAD), design: { elements: [ // two grid lines (1.4.1's default: 2 em)
    { kind: 'rule', id: 'line', thickness: pt(0.75), color: col('band'), // behind the tab
      placement: { ...mid, size: { width: 'fill' } } },
    text('tab', '{titleText}', { ...label, fontSize: pt(8), letterSpacing: pt(1.6),
      color: col('paper'), box: { backgroundColor: col('band'),
        padding: { top: mm(1.2), right: mm(2.4), bottom: mm(1.2), left: mm(2.4) } } },
    mid),
  ] } },
};
// The colophon closes the contents page; the Markdown calls it with :::paragraphs.
const colophon = { id: 'colophon', fontFamily: 'Jost', fontSize: pt(7), lineHeight: pt(10),
  color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) };
const air = { padding: { bottom: mm(9) } }; // empty padding counts: the columns start lower
const contentsOpener = { enabled: true, slot: { elements: [
  { kind: 'rule', id: 'rule', thickness: pt(1), color: col('ink'),
    placement: { ...at('container', 'top-left'), size: { width: 'fill' } } },
  text('kicker', '{titleText}', { ...label, fontSize: pt(9), letterSpacing: pt(1.8),
    color: col('band') }, at('#rule', 'below', 0, 5)),
  text('issue', '{attr.issue}', { ...bodoni, italic: true, fontSize: pt(44), lineHeight: 1.05,
    color: col('ink') }, at('#kicker', 'below', 0, 2)),
  text('strap', '{subtitle}', { fontFamily: 'Spectral', italic: true, fontSize: pt(11),
    color: col('muted'), align: 'left' }, at('#issue', 'below', 0, 1.5)),
  text('number', '{attr.number}', { ...bodoni, fontWeight: 900, fontSize: pt(160), lineHeight: 1,
    align: 'right', color: col('band'), box: air }, at('container', 'top-right', 0, 4)),
] } };
// #endregion

// #region opener: one story opener; its colour comes from the part, not from the design
const PHOTO = 150; // mm from the top edge to the foot of the picture
const FOOT = PHOTO - MARGIN.top; // the same foot from the container, which starts at the margin
const LIFT = 34; // mm: how far the panel rises into the picture
const WIDE = 136; // mm: the panel's width
const panel = (top, bottom) => ({ backgroundColor: col('band'),
  padding: { top: mm(top), right: mm(6), bottom: mm(bottom), left: mm(6) } });
const below = (id) => ({ ...at(`#${id}`, 'below', 0, -SEAM), size: { width: mm(WIDE) } });
const opener = (resourceId) => ({ enabled: true, slot: { elements: [
  { kind: 'image', id: 'picture', resourceId, // fitted, never cropped: each file is 230 : 150
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(PHOTO) } } },
  text('credit', '{attr.credit}', { ...small, fontSize: pt(6.5), color: col('muted'),
    letterSpacing: pt(0.6), align: 'right' }, at('container', 'top-right', 0, FOOT + 2)),
  text('section', '{partTitle}', { ...label, fontSize: pt(8.5), letterSpacing: pt(1.7),
    color: col('paper'), box: panel(6, 2) }, { ...at('container', 'top-left', 0, FOOT - LIFT),
    size: { width: mm(WIDE) } }),
  text('title', '{titleText}', { ...bodoni, fontWeight: 700, fontSize: pt(32), lineHeight: 1.02,
    color: col('paper'), box: panel(0, 3) }, below('section')),
  text('standfirst', '{attr.standfirst}', { fontFamily: 'Spectral', italic: true,
    fontSize: pt(11.5), lineHeight: 1.35, overflow: 'wrap', align: 'left',
    color: col('paper'), box: panel(0, 6) }, below('title')),
  // The picture reserves nothing (gotcha: opener-image-no-reserve); the panel and the byline
  // reach below it, and the byline's empty padding keeps the story 5 mm under it.
  text('byline', '{attr.byline}', { ...small, fontSize: pt(7.5), letterSpacing: pt(1.3),
    box: { padding: { top: mm(4), bottom: mm(5) } } }, at('#standfirst', 'below')),
] } });
// #endregion

// #region folios: a folio tab in the section's colour, then the section and the story
const TAB = 6.5; // mm: the tab's side; the words beside it take its height and centre on it
const folioLine = (first, second) => ({ elements: [['even', 'left', 1], ['odd', 'right', -1]]
  .flatMap(([parity, side, s]) => {
    const inward = s > 0 ? 'right-of' : 'left-of'; // from the outer edge towards the gutter
    const beside = (id, content, style, to, gap) => text(id, content, { ...style, align: side },
      { ...at(to, inward, s * gap), size: { height: mm(TAB) } }); // text centres vertically
    return [
      text(`tab-${parity}`, '{pageNumber}', { ...label, fontSize: pt(8), color: col('paper'),
        align: 'center', box: { backgroundColor: col('band') } },
      { ...at('page', `bottom-${side}`, s * MARGIN.outer, -11),
        size: { width: mm(TAB), height: mm(TAB) } }),
      beside(`first-${parity}`, first, { ...small, color: col('band') }, `#tab-${parity}`, 3),
      beside(`second-${parity}`, second, { fontFamily: 'Spectral', italic: true,
        fontSize: pt(8), color: col('muted') }, `#first-${parity}`, 2.5),
    ].map((element) => ({ ...element, parity })); // no pages filter: openers get folios too
  }) });
// #endregion

const flush = { marginTop: pt(0), marginBottom: pt(0) }; // lists sit on the grid
const marker = { fontFamily: 'Jost', fontWeight: 600, color: col('band'), ...flush }; // list marks
const boxText = { textAlign: 'left', hyphenation: false, firstLineIndent: pt(0) };
const boxStyle = { backgroundEnabled: false, ...flush, // one device: a stripe in 'band'
  stripe: { enabled: true, side: 'top', width: pt(2), color: col('band') },
  padding: { top: mm(3), right: pt(0), bottom: pt(0), left: pt(0) } };
const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette, resourceTypes: [photoType],
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: { gutterWidth: mm(6) }, // two columns, the default
  bodyText: { fontFamily: 'Spectral', fontSize: pt(9.5), lineHeight: pt(LEAD), // justified
    color: col('ink'), boldColor: col('band'), italicColor: col('ink'),
    referenceColor: col('ink'), firstLineIndent: mm(3.5), indentAfterHeading: false,
    minWordSpacing: 0.7, maxWordSpacing: 1.7, // tighter than the 0.6–2 defaults
    runtMinCharacters: 40, // counted in word spaces: last lines under about 20 letters cost
    maxRuntTracking: 0 }, // tracking 1.4.1 never paints (gotcha: runt-tracking-unpainted)
  headings: { fontFamily: 'Bodoni Moda', marginBottom: pt(0), levels: [
    // Restated (gotcha: headings-drop-h1-break); 'any': a story opens on the very next page.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(15), lineHeight: pt(LEAD), fontWeight: 400, italic: true,
      color: col('band'), marginTop: pt(LEAD) },
  ] },
  headingStyles: headingStyles(), parts, toc: contents,
  unorderedLists: { ...marker, bulletChar: '–' }, orderedLists: marker, // in the label face
  calloutStyles: [{ id: 'quote', ...boxStyle, marginTop: pt(LEAD), // the floated box has none
    body: { fontFamily: 'Bodoni Moda', fontSize: pt(16), lineHeight: pt(1.5 * LEAD),
      italicColor: col('band'), ...boxText } },
  { id: 'facts', ...boxStyle, placement: 'top', // floats to the next column head
    titleStyle: { ...caps, fontSize: pt(7.5), letterSpacing: pt(1.5), color: col('band') },
    body: { fontFamily: 'Jost', fontSize: pt(8.5), lineHeight: pt(12), ...boxText } }],
  captionStyle: { fontFamily: 'Jost', fontSize: pt(7.5), gap: mm(2),
    note: { fontSize: pt(6.5), color: col('muted') } },
  paragraphStyles: [{ id: 'bios', firstLineIndent: pt(0), spaceBetween: pt(LEAD / 2) }, colophon],
  header: { elements: [] }, footer: folioLine('{partTitle}', '{chapterTitle}'), // at the foot
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const photoType = { id: 'photo', // no figure number: an empty caption prefix and template
  name: t({ en: 'Photograph', es: 'Fotografía' }), shortLabel: t({ en: 'photo', es: 'foto' }),
  captionPrefix: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal' };
const picture = (id, fileId, [width, height], alt, extra = {}) => { // alt: { en, es }
  const kind = fileId.endsWith('.svg') ? 'svg' : 'bitmap';
  return { id, kind, typeId: 'photo', createdAt: 0, updatedAt: 0, altText: t(alt), ...extra,
    [kind]: { fileId, width, height, ...(kind === 'bitmap' && { format: 'jpeg' }) } };
};
const resources = [ // alt texts and captions in both languages; t() picks the edition's
  picture('cover', 'castellina-cover-1150.jpg', [1150, 1500], { en: 'Vines, cypresses and a '
    + 'farmhouse below hazy hills.', es: 'Viñas, cipreses y una casa bajo colinas brumosas.' }),
  picture('thumb', 'castellina-cover-1150.jpg', [1150, 1500], { en: 'The cover of this issue.',
    es: 'La portada de este número.' }, { placement: { position: 'here', width: 0.45 },
    caption: t({ en: 'On the cover: the hills below Castellina in Chianti, where our feature '
      + 'is set.', es: 'En la portada: las colinas de Castellina in Chianti, escenario del '
      + 'reportaje.' }),
    note: t({ en: 'Photograph: Rowan Heuvel, CC0', es: 'Fotografía: Rowan Heuvel, CC0' }) }),
  picture('flasks', 'flasks-1920.jpg', [1920, 1252], { en: 'Glass flasks holding green shoots '
    + 'on a shelf.', es: 'Matraces de vidrio con brotes verdes en una balda.' }),
  picture('fields', 'fields-1610.jpg', [1610, 1050], { en: 'Fields from above, one '
    + 'unsown, and a farmhouse.', es: 'Campos desde arriba, uno sin sembrar, y una casa.' }),
  picture('harvest', 'harvest-1840.jpg', [1840, 1200], { en: 'Ripe wheat, a combine harvester '
    + 'blurred behind it.', es: 'Trigo maduro y, desenfocada detrás, una cosechadora.' }),
  picture('barcode', 'barcode.svg', [320, 140], { en: 'A barcode.', es: 'Un código de barras.' }),
  // 1530 px at 150 dpi would print 259 mm: it shrinks to the measure (gotcha: bitmap-print-size).
  // A top float opens the page after its ::resource line (gotcha: top-float-next-page).
  picture('vines', 'castellina-farm-1530.jpg', [1530, 900], { en: 'Rows of vines, cypresses and '
    + 'a farmhouse on a Tuscan slope.', es: 'Hileras de viñas, cipreses y una casa de campo en '
    + 'una ladera toscana.' }, { placement: { position: 'top', span: 'page' },
    caption: t({ en: 'Vines and cypresses by a farmhouse near Castellina in Chianti, in summer.',
      es: 'Viñas y cipreses junto a una casa de campo de Castellina in Chianti, en verano.' }),
    note: t({ en: 'Photograph: Rowan Heuvel, CC0, via Wikimedia Commons',
      es: 'Fotografía: Rowan Heuvel, CC0, vía Wikimedia Commons' }) }),
];

const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: a made-up barcode, drawn in code with a seeded PRNG
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const n1 = (v) => v.toFixed(2);
function barcodeArt() { // 32 × 14 mm on paper: bars and no digits, so it reads as decoration
  const rand = mulberry32(14);
  let [x, bars] = [2, ''];
  while (x < 30) {
    const w = 0.25 + Math.floor(rand() * 3) * 0.25;
    if (rand() < 0.55) {
      bars += `<rect x="${n1(x)}" y="1.5" width="${w}" height="11" fill="${palette.ink}"/>`;
    }
    x += w + 0.25;
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="140" viewBox="0 0 32 14">'
    + `<rect width="32" height="14" fill="${palette.paper}"/>${bars}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  Spectral: ['400', '400i', '700'], 'Bodoni Moda': ['400', '400i', '600', '700', '900'],
  Jost: ['400', '600'] }; // Spectral 700: the contributors' names; Jost 400: the captions

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const photos = [...new Set(resources.flatMap((r) => r.bitmap?.fileId ?? []))]; // each JPEG once
await Promise.all([...photos.map((file) => loadImage(file, asset(file))),
  loadSvg('barcode.svg', barcodeArt())]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Magazine cover and sectioned contents',
  es: 'Portada de revista e índice por secciones' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
