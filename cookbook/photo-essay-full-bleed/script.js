// ═══ Postext Cookbook · Nº 068 · Photo essay with full-bleed plates ═══════════════
// https://postext.dev/en/cookbook/photo-essay-full-bleed
// Code: MIT · Text: original (CC BY 4.0) · Plates: diffusion models
// Fonts: Andada Pro, Syne, Syne Mono (SIL OFL 1.1) · Needs postext ≥ 1.8.0
// Sierra, a landscape photobook: one day in a mountain range in six plates, each on a page of
// its own and one across the gutter of a spread, with three short texts between them.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'photo-essay-full-bleed';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the paper between the plates, the ink and one rust for the labels
const palette = {
  ink: '#1c1f27', // text: the blue-black of the night plate
  paper: '#f3f0ea', // every page's ground: a pale stone, seen only between the plates
  accent: '#94462e', // the times over each text: the dusk plate's rust, dark enough for 8 pt
  muted: '#5f646d', // the running foot and the caption of the small plate
  white: '#fbfaf7', // type set on the plates
};
// Design elements read the hex, not the palette, in 1.4.1 (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const PAGE = { width: 280, height: 210 }; // a landscape photobook, in mm
const MARGIN = { top: 28, bottom: 24, inner: 40, outer: 140 }; // text pages: a 100 mm measure
const LEAD = 15; // body leading in pt
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region answer: the plates' heading styles, generated from a list
// '{attr.art}' is filled in per heading, so a plain plate names its picture on its line:
// # Noon {style="lamina" art="mediodia" …}. Only the cover and the last plate draw extras.
const PLATES = [ // the style id, its picture, the ink of its caption, anything extra it draws
  { id: 'alba', art: 'alba', extra: (colour) => cover(colour) }, // an arrow: cover() is below
  { id: 'lamina', art: '{attr.art}' }, // any plate on a page of its own
  { id: 'pliego', art: '{attr.art}', half: 'verso' }, // one picture across a spread:
  { id: 'pliego-recto', art: '{attr.art}', half: 'recto' }, // the left half, then the right
  { id: 'nieve', art: 'nieve', ink: 'ink', extra: (colour) => colophon(colour) },
];
const plate = ({ id, art, half, ink = 'white', extra = () => [] }) => ({
  id, span: 'page', // an opener: a span heading always starts a page of its own
  // The left half opens on an even page, a verso, so the right half faces it across the
  // gutter (gotcha: parity-page1-recto).
  ...(half === 'verso' && { breakBefore: { enabled: true, parity: 'even' } }),
  // No margins: the plate's column is the page, and minHeight fills it, so what follows starts
  // on the next page. Images reserve no room (gotcha: opener-image-no-reserve), and a minHeight
  // taller than the column is dropped whole (gotcha: opener-taller-than-column).
  margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) },
  advancedDesign: { enabled: true, minHeight: mm(PAGE.height), slot: { elements: [
    { kind: 'image', id: 'picture', resourceId: art, // the recto half is the same picture,
      placement: at('page', 'top-left', half === 'recto' ? -PAGE.width : 0, 0, // moved left
        { width: mm(half ? 2 * PAGE.width : PAGE.width), height: mm(PAGE.height) }) },
    ...(half === 'recto' ? [] : caption(col(ink))), ...extra(col(ink)),
  ] } },
});
// #endregion

// #region caption: the plate's numeral and hour, lower left, from the heading's attributes
const NUMERAL = { x: 16, y: PAGE.height - 21, size: 13 }; // mm from the top left; size in pt
// A design text's baseline sits 0.8 of its line box below its top: set a smaller label beside
// a larger one this much lower and the two share a baseline.
const dropTo = (big, small, lineHeight = 1.2) => (0.8 * lineHeight * (big - small) * 25.4) / 72;
const caption = (colour) => [
  { kind: 'text', id: 'numeral', content: '{attr.n}', fontFamily: 'Syne', fontWeight: 700,
    fontSize: pt(NUMERAL.size), color: colour, align: 'left',
    placement: at('page', 'top-left', NUMERAL.x, NUMERAL.y) },
  { kind: 'text', id: 'hour', content: '· {attr.hora}', fontFamily: 'Syne Mono', fontSize: pt(8),
    letterSpacing: pt(0.8), color: colour, align: 'left', // the dot: a lone I reads as a bar
    placement: at('#numeral', 'right-of', 1.6, dropTo(NUMERAL.size, 8)) },
];
// #endregion

// #region cover: the book's title reversed out of the dawn sky of the first plate
const cover = (colour) => [
  { kind: 'text', id: 'title', content: '{title}', fontFamily: 'Syne', fontWeight: 800,
    fontSize: pt(72), lineHeight: 1, letterSpacing: pt(6), textTransform: 'uppercase',
    color: colour, align: 'left', placement: at('page', 'top-left', 22, 26) },
  { kind: 'text', id: 'subtitle', content: '{subtitle}', fontFamily: 'Syne Mono',
    fontSize: pt(10), letterSpacing: pt(2), textTransform: 'uppercase', color: colour,
    align: 'left', placement: at('#title', 'below', 1.5, 3) },
];
// The colophon: one element per line, 10.5 pt apart, so the break falls after the licence, and
// the second line on the baseline of the plate's numeral.
const COLOPHON = { y: NUMERAL.y + dropTo(NUMERAL.size, 7.5), leading: (10.5 * 25.4) / 72 };
const colophon = (colour) => ['colofon', 'tipos'].map((key, line) => ({ kind: 'text', id: key,
  content: `{attr.${key}}`, fontFamily: 'Syne Mono', fontSize: pt(7.5), letterSpacing: pt(0.2),
  color: colour, align: 'right',
  placement: at('page', 'top-right', -16, COLOPHON.y - (1 - line) * COLOPHON.leading) }));
// #endregion

// #region texts: a text between plates opens on the next page with its hours above it
const textOpener = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'hours', content: '{attr.hora}', fontFamily: 'Syne Mono', fontSize: pt(8),
    letterSpacing: pt(0.8), color: col('accent'), align: 'left',
    placement: at('container', 'top-left', 0, 0) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Syne', fontWeight: 700,
    fontSize: pt(28), lineHeight: 1.05, // a multiple (gotcha: design-lineheight-multiple)
    color: col('ink'), align: 'left', overflow: 'wrap',
    placement: at('#hours', 'below', 0, 2.5, { width: 'fill' }) },
] } };
// The folio and the book's title under the text block, flush with its left edge, on the
// baseline of the plates' numerals. Not on the plates: a span heading opens their pages, so
// they are opener pages, and 'body' leaves them out.
const foot = (id, content, extra) => ({ kind: 'text', id, content, pages: 'body',
  fontFamily: 'Syne Mono', fontSize: pt(7.5), letterSpacing: pt(0.8), color: col('muted'),
  align: 'left', ...extra });
const FOOT = NUMERAL.y + dropTo(NUMERAL.size, 7.5) - (PAGE.height - MARGIN.bottom); // from the foot
const footer = { elements: [
  foot('folio', '{pageNumber}', { color: col('ink'),
    placement: at('container', 'top-left', 0, FOOT) }),
  foot('book', '{title}', { textTransform: 'uppercase', placement: at('#folio', 'right-of', 5) }),
] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  // The English sample is British English, set with the US patterns: 1.4.1 ships no en-gb.
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  resourceTypes: [lamina],
  page: { width: mm(PAGE.width), height: mm(PAGE.height), dpi: 150,
    backgroundColor: col('paper'), // the ground of every page; the plates cover it
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } }, // left is the inner margin
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Andada Pro', fontSize: pt(10.5), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), // both default to blue
    referenceColor: col('ink'), referenceBold: false, // 'lámina IV' reads as a word of the text
    firstLineIndent: mm(4), indentAfterHeading: false, // justified and hyphenated by default
    minWordSpacing: 0.7, maxWordSpacing: 1.6, // a narrower range than the defaults, 0.6 to 2
    maxRuntTracking: 0 }, // tracking 1.4.1 never paints (gotcha: runt-tracking-unpainted)
  // A heading's own line is measured even where its design paints the title: set it in a face
  // the page loads, or the kit fetches Open Sans for it.
  headings: { fontFamily: 'Syne', levels: [
    // A text follows its plate with no forced break (gotcha: headings-drop-h1-break): the
    // plate fills its page, so the text still starts a page, and that page stays a body page,
    // with its running foot.
    { level: 1, breakBefore: { enabled: false }, advancedDesign: textOpener },
  ] },
  headingStyles: PLATES.map(plate),
  captionStyle: { fontFamily: 'Syne Mono', fontSize: pt(7.5), color: col('muted') },
  header: { elements: [] },
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region plates: every picture is a resource; only plate IV is cited, so only it floats
// Plate IV is the one plate that floats, so a counter of its type would number it 1. The type
// prints no number (no caption prefix, an empty template) and the caption carries the numeral.
// The text names the plate with :ref's text, since a bare :ref prints 'lámina' and nothing else.
const lamina = { id: 'lamina', name: t({ en: 'Plate', es: 'Lámina' }),
  shortLabel: t({ en: 'plate', es: 'lámina' }), numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal' };
// JPEGs in assets/, cut to the page's shape: 1600 × 1200 px for 280 × 210 mm (145 dpi).
const picture = (id, [w, h], alt, extra = {}) => ({ id, typeId: 'lamina', kind: 'bitmap',
  bitmap: { fileId: `${id}-${w}.jpg`, format: 'jpeg', width: w, height: h },
  createdAt: 0, updatedAt: 0, altText: t(alt), ...extra });
const resources = [ // the five the heading styles draw, never cited, and plate IV
  picture('alba', [1600, 1200], { en: 'Eight ridges fading into a peach dawn haze.',
    es: 'Ocho crestas que se pierden en la bruma del alba.' }),
  picture('mediodia', [1600, 1200], { en: 'A granite cirque and its lake under a pale noon sky.',
    es: 'Un circo de granito y su laguna bajo el cielo pálido del mediodía.' }),
  picture('tormenta', [2400, 900], { en: 'A storm over the range: rain on the left, lightning '
    + 'and a break of sun on the right.', es: 'Una tormenta sobre la sierra: lluvia a la '
    + 'izquierda; un rayo y un claro de sol a la derecha.' }),
  picture('noche', [1600, 1200], { en: 'Stars over dark ridges and two lit windows at a refuge.',
    es: 'Estrellas sobre crestas oscuras y dos ventanas encendidas en un refugio.' }),
  picture('nieve', [1600, 1200], { en: 'The cirque the morning after, white with new snow.',
    es: 'El circo a la mañana siguiente, blanco de nieve nueva.' }),
  // 2000 px, 339 mm at the layout's 150 dpi, which the float fits to the 100 mm measure.
  picture('atardecer', [2000, 800], { en: 'A crest lit orange under strips of cloud, violet sky.',
    es: 'Una cresta encendida de naranja bajo franjas de nube, en un cielo violeta.' },
  { caption: t({ en: 'IV · Dusk · 19:41', es: 'IV · Atardecer · 19:41' }) }),
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  'Andada Pro': ['400'], Syne: ['700', '800'], 'Syne Mono': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const files = resources.map((r) => r.bitmap.fileId); // a resource names a file: load each
await Promise.all(files.map((f) => loadImage(f, asset(f))));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Sierra: a photo essay in landscape',
  es: 'Sierra: un ensayo fotográfico apaisado' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
