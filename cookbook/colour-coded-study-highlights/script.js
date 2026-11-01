// ═══ Postext Cookbook · Nº 180 · Colour-coded highlights in a study reader ════════
// https://postext.dev/en/cookbook/colour-coded-study-highlights
// Code: MIT · Text: original (CC BY 4.0) · Picture: painting made for the recipe
// Fonts: Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'colour-coded-study-highlights';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, three of them for the highlighter
const palette = {
  ink: '#1f1c19', // text: a warm near-black
  accent: '#8a3220', // kickers, rules, numbers: an iron-gall red
  tint: '#f5f0e7', // the key's background
  rule: '#d3cabc', // hairlines
  muted: '#6b645b', // running heads, colophon
  paper: '#ffffff',
  term: '#cce8c8', // key terms: a pale green
  date: '#fbe0a1', // dates: amber
  name: '#cfe0f4', // people and places: a pale blue
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const OUTER = 20; // outer margin in mm: the running heads align to it
const LEAD = 14.5; // body leading in pt
const SANS = 'Source Sans 3';
const SERIF = 'Source Serif 4';

// #region answer: three highlight styles, one per kind of word, linked to the palette
// :mark[Mainz]{style="name"} in the text picks a style by id. The band is painted under
// words that stay ordinary text, so the lines break, hyphenate and justify as if the
// mark were not there, and a mark that runs over a line end gets a band on each line.
const band = (id, name) => ({
  id, name,
  background: col(id), // pale enough for ink at full contrast on top
  color: col('ink'), // the words keep the colour of the text
  // borderRadius: 0 is the default (square ends, as a highlighter pen leaves them)
  paddingX: em(0.12), // the band reaches a little past the first and the last letter
  paddingTop: em(0.04), paddingBottom: em(0.1), // and down past the descenders
});
const markStyles = [
  band('term', t({ en: 'Key term', es: 'Término clave' })),
  band('date', t({ en: 'Date', es: 'Fecha' })),
  band('name', t({ en: 'Name', es: 'Nombre' })),
];
// #endregion

// #region opener: the painting bleeds off the top of the page, the title sits under it
const opener = {
  enabled: true,
  minHeight: mm(122), // the floor of the opener: the key starts on the same line
  marginBottom: pt(0),
  slot: {
    elements: [
      { kind: 'image', id: 'press', resourceId: 'press', fit: 'cover',
        placement: { anchor: { to: 'page', edge: 'top-left' },
          size: { width: mm(170), height: mm(96) } } },
      { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: SANS,
        fontSize: pt(8.5), fontWeight: 700, letterSpacing: pt(1.6),
        textTransform: 'uppercase', color: col('accent'), align: 'left',
        placement: { anchor: { to: 'container', edge: 'top-left' },
          offset: { x: mm(0), y: mm(82) } } },
      { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SERIF,
        fontSize: pt(26), lineHeight: 1.08, fontWeight: 700, color: col('ink'), align: 'left',
        placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(2) },
          size: { width: mm(126), height: 'auto' } } },
      { kind: 'text', id: 'standfirst', content: '{attr.standfirst}', fontFamily: SERIF,
        italic: true, fontSize: pt(10.5), lineHeight: LEAD / 10.5, color: col('ink'),
        align: 'left',
        placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
          size: { width: mm(118), height: 'auto' } } },
    ],
  },
};
// #endregion

// #region running-heads: series title on the verso, reading title on the recto
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body',
  fontFamily: SANS, fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(13) } },
  ...extra,
});
const folio = { fontWeight: 700, color: col('ink') };
const header = {
  elements: [
    head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
    head('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
    head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 9)),
    head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
  ],
};
const footer = {
  elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0, {
    ...folio, pages: 'opener',
    placement: { anchor: { to: 'container', edge: 'top' }, offset: { x: mm(0), y: mm(9) } },
  })],
};
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  resourceTypes: defaultResourceTypes(LANG),
  colorPalette,
  markStyles,
  page: {
    sizePreset: 'custom', width: mm(170), height: mm(240), dpi: 150,
    margins: { top: mm(22), bottom: mm(22), left: mm(22), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: SERIF, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: SERIF, color: col('ink'), fontWeight: 700,
    levels: [
      { level: 1, fontSize: pt(26), breakBefore: { parity: 'odd' }, advancedDesign: opener },
      { level: 2, fontFamily: SANS, fontSize: pt(12), lineHeight: pt(LEAD), fontWeight: 700,
        color: col('accent'), marginTop: pt(LEAD), marginBottom: pt(0) },
    ],
  },
  unorderedLists: { bulletChar: '–', color: col('accent'), fontWeight: 400,
    marginTop: pt(0), marginBottom: pt(0) },
  orderedLists: { numberFormat: 'arabic', color: col('accent'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    // The glossary: each green term opens its entry, the turnovers hang 1.5 em.
    { id: 'glossary', fontSize: pt(9.5), lineHeight: pt(13), textAlign: 'left',
      hangingIndent: em(1.5) },
    { id: 'colophon', fontFamily: SANS, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  // The key: a tint with a top stripe, its title in the label face.
  calloutStyles: [
    { id: 'key', title: t({ en: 'Key', es: 'Clave' }), background: col('tint'),
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
      padding: { top: mm(3), right: mm(4), bottom: mm(3), left: mm(4) },
      titleStyle: { fontFamily: SANS, fontSize: pt(8), fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: pt(1.2), color: col('accent') },
      body: { fontFamily: SANS, fontSize: pt(9.5), lineHeight: pt(13), color: col('ink'),
        firstLineIndent: pt(0), textAlign: 'left', boldColor: col('ink'),
        italicColor: col('ink') } },
  ],
  captionStyle: { fontFamily: SANS, fontSize: pt(8), color: col('ink'), labelBold: true,
    labelColor: col('accent'), note: { color: col('muted') } },
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the reading, its key and questions

// #region art: a printing workshop around 1460, a painting in assets/ (no lettering)
const resources = [{ id: 'press', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'press-1400.jpg', format: 'jpeg', width: 1400, height: 790 },
  altText: t({
    en: 'A printing workshop: a compositor picks type from a case by the window while a '
      + 'pressman pulls the bar of a wooden screw press; printed sheets hang drying overhead.',
    es: 'Un taller de imprenta: un cajista toma tipos de la caja junto a la ventana mientras '
      + 'un prensista tira de la barra de una prensa de husillo; arriba se secan los pliegos.',
  }) }];
await loadImage(resources[0].bitmap.fileId, asset(resources[0].bitmap.fileId));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Source Serif 4': ['400', '400i', '700'],
  'Source Sans 3': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'A study reader in three highlight colours',
  es: 'Un libro de lecturas resaltado en tres colores' }) });

// @kit core fonts viewer images
