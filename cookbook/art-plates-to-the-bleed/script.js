// ═══ Postext Cookbook · Nº 183 · Art plates to the margins, the trim and the bleed ═════
// https://postext.dev/en/cookbook/art-plates-to-the-bleed
// Code: MIT · Text: original (CC BY 4.0) · Paintings: Rijksmuseum, The Met, NGA (CC0)
// Fonts: Spectral, Cormorant Garamond, Jost (SIL OFL 1.1) · Needs postext ≥ 1.73.0
// An exhibition essay on four interiors by Vermeer. Each painting is a full-page plate: two
// inside the margins, one to the trimmed edge, one out to the bleed. A detail prints 60 mm wide.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'art-plates-to-the-bleed';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a warm paper and ink, and the ultramarine of the Delft jackets
const palette = {
  ink: '#22201c', // text: a warm near-black
  accent: '#2c4a7c', // kicker, caption labels: the blue of the reading woman's jacket
  rule: '#c9bfae', // the opener's hairline
  muted: '#6b6359', // running heads, folios, credit lines
  paper: '#fbf9f4', // the page, and the band under a caption set over a plate
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': pointed at the accent, no default blue shows.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Spectral', 'Cormorant Garamond', 'Jost'];
const [PAGE_W, PAGE_H, TOP, BOTTOM, INNER, OUTER] = [160, 195, 20, 22, 18, 24]; // mm
const BLEED = 3; // mm of picture past the trim on the bleed plate, and the crop marks' offset
const LEAD = 13.5; // body leading in pt
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const caps = (size) => ({ fontWeight: 500, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.2) });

// #region answer: a plate type, and how far each picture reaches
// Every plate stands alone on the first whole page after its citation, as large as the area
// allows. true (or 'content') keeps it inside the margins with its running heads; 'trim'
// covers the page to the cut, 'bleed' to the bleed. Those two crop the picture about its
// centre, put the caption on a band of paper at the foot, and drop the heads and the folio.
const plateType = { id: 'plate', name: t({ en: 'Plate', es: 'Lámina' }),
  shortLabel: t({ en: 'plate', es: 'lámina' }), captionPrefix: t({ en: 'Plate', es: 'Lámina' }),
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { plate: true, captionMeasure: 'body' } }; // the caption as wide as it
const REACH = { milkmaid: 'content', pitcher: 'trim', letter: 'bleed', balance: 'content' };
// A width as a length is measured against the slot, not shared out of it: the detail prints
// 60 mm wide in any layout, 1.25 times the 48 mm of canvas it shows. Its caption stands
// beside it in what is left of the column.
const DETAIL = { width: { value: 60, unit: 'mm' }, captionSide: 'inside', align: 'left' };
// #endregion

// #region opener: kicker, title, deck and a short rule, sunk into the first page
const opener = { enabled: true, minHeight: mm(74), slot: { elements: [
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(7.8),
    color: col('accent'), align: 'left', placement: at('container', 'top-left', 0, 10),
    ...caps(7.8) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontWeight: 500,
    fontSize: pt(32), lineHeight: 1.02, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: at('#kicker', 'below', 0, 3.5, { width: 'fill', height: 'auto' }) },
  { kind: 'text', id: 'deck', content: '{attr.deck}', fontFamily: DISPLAY, italic: true,
    fontWeight: 500, fontSize: pt(13), lineHeight: 1.2, color: col('ink'), align: 'left',
    overflow: 'wrap', placement: at('#title', 'below', 0, 3, { width: mm(96), height: 'auto' }) },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    placement: at('#deck', 'below', 0, 6, { width: mm(22) }) },
] } };
// #endregion

// #region running-heads: the book on the verso, the essay on the recto, folios outside
// pages: 'body' keeps them off the opener; a plate set to the trim or the bleed takes the
// 'plate' role, which no element here names, so its page prints bare.
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5), color: col('muted'),
  placement: at('page', edge, x, 11), ...caps(7.5), ...extra });
const folio = { color: col('ink'), letterSpacing: pt(0.6) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0,
  { ...folio, pages: 'opener', placement: at('container', 'top', 0, 8) })] };
// #endregion

const config = {
  locale: t({ en: 'en-us', es: 'es' }), // the language the text is hyphenated in
  colorPalette,
  resourceTypes: [plateType, { ...plateType, id: 'detail', name: t({ en: 'Figure',
    es: 'Figura' }), shortLabel: t({ en: 'fig.', es: 'fig.' }), captionPrefix: t({ en: 'Fig.',
    es: 'Fig.' }), defaultPlacement: DETAIL }],
  page: { width: mm(PAGE_W), height: mm(PAGE_H), dpi: 150, backgroundColor: col('paper'),
    cutLines: { enabled: true, bleed: mm(BLEED) }, // without them 'bleed' stops at the trim
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single', gutterWidth: mm(5) }, // the gutter beside the detail
  bodyText: { fontFamily: TEXT, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    referenceBold: false, textAlign: 'justify', firstLineIndent: mm(4.5),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 500, levels: [
    { level: 1, fontSize: pt(32), breakBefore: { parity: 'odd' }, advancedDesign: opener },
    { level: 2, fontSize: pt(14), lineHeight: pt(LEAD), italic: true, marginTop: pt(LEAD),
      marginBottom: pt(LEAD / 3) },
  ] },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  captionStyle: { fontFamily: LABEL, fontSize: pt(7.8), color: col('ink'), gap: pt(7),
    labelBold: true, labelColor: col('accent'), align: 'left',
    note: { fontSize: pt(6.8), color: col('muted') } },
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region paintings: four plates and a detail, with their tombstones and credit lines
// JPEGs in assets/ at the pixels each needs for 300 ppi where it prints: 2,400 px high for
// the plates that cover the page (195 mm + 2 × 3 mm of bleed is 7.9 in), less for the rest.
const PAINTINGS = {
  milkmaid: [[1617, 1800], { en: 'Johannes Vermeer, *The Milkmaid*, c. 1660',
    es: 'Johannes Vermeer, *La lechera*, h. 1660' }, { en: 'Oil on canvas, 45.5 × 41 cm. '
    + 'Rijksmuseum, Amsterdam, SK-A-2344, purchased with the support of the Vereniging '
    + 'Rembrandt. Public domain.', es: 'Óleo sobre lienzo, 45,5 × 41 cm. Rijksmuseum, '
    + 'Ámsterdam, SK-A-2344, adquirido con el apoyo de la Vereniging Rembrandt. Dominio '
    + 'público.' }, { en: 'A kitchen maid in a yellow bodice and blue apron pours milk from '
    + 'a jug into a bowl beside a basket of bread, under a window on the left.', es: 'Una '
    + 'criada con corpiño amarillo y delantal azul vierte leche de una jarra en un cuenco, '
    + 'junto a un cesto de pan, bajo una ventana a la izquierda.' }],
  pitcher: [[2116, 2400], { en: 'Johannes Vermeer, *Young Woman with a Water Pitcher*, '
    + 'c. 1662', es: 'Johannes Vermeer, *Joven con una jarra de agua*, h. 1662' },
  { en: 'Oil on canvas, 45.7 × 40.6 cm. The Metropolitan Museum of Art, New York, 89.15.21, '
    + 'Marquand Collection, gift of Henry G. Marquand, 1889. Public domain.', es: 'Óleo sobre '
    + 'lienzo, 45,7 × 40,6 cm. The Metropolitan Museum of Art, Nueva York, 89.15.21, '
    + 'colección Marquand, donación de Henry G. Marquand, 1889. Dominio público.' },
  { en: 'A young woman in a white linen hood opens a window with one hand and holds a '
    + 'silver-gilt pitcher in a basin with the other; a map hangs behind her.', es: 'Una joven '
    + 'con toca de lino blanco abre una ventana con una mano y sujeta con la otra una jarra '
    + 'de plata dorada sobre una palangana; detrás cuelga un mapa.' }],
  letter: [[2039, 2400], { en: 'Johannes Vermeer, *Woman Reading a Letter*, c. 1663',
    es: 'Johannes Vermeer, *Mujer leyendo una carta*, h. 1663' }, { en: 'Oil on canvas, '
    + '46.5 × 39 cm. Rijksmuseum, Amsterdam, SK-C-251, on loan from the City of Amsterdam '
    + '(A. van der Hoop Bequest). Public domain.', es: 'Óleo sobre lienzo, 46,5 × 39 cm. '
    + 'Rijksmuseum, Ámsterdam, SK-C-251, en préstamo de la ciudad de Ámsterdam (legado '
    + 'A. van der Hoop). Dominio público.' }, { en: 'A woman in a blue jacket stands reading '
    + 'a letter in front of a map of Holland, between two chairs, lit from the left.',
  es: 'Una mujer con chaqueta azul lee una carta de pie ante un mapa de Holanda, entre dos '
    + 'sillas, con la luz a la izquierda.' }],
  balance: [[1502, 1700], { en: 'Johannes Vermeer, *Woman Holding a Balance*, c. 1664',
    es: 'Johannes Vermeer, *Mujer con una balanza*, h. 1664' }, { en: 'Oil on canvas, '
    + '39.7 × 35.5 cm. National Gallery of Art, Washington, 1942.9.97, Widener Collection. '
    + 'Public domain.', es: 'Óleo sobre lienzo, 39,7 × 35,5 cm. National Gallery of Art, '
    + 'Washington, 1942.9.97, colección Widener. Dominio público.' }, { en: 'A woman stands '
    + 'at a table spread with pearls and coins, holding up a small balance; a painting of the '
    + 'Last Judgment hangs behind her.', es: 'Una mujer, de pie ante una mesa con perlas y '
    + 'monedas, sostiene en alto una pequeña balanza; detrás cuelga un Juicio Final.' }],
  'balance-detail': [[800, 1051], { en: 'Detail of :ref{id="balance"}: the beam and its two '
    + 'empty pans. The 48 mm of canvas it shows print 60 mm wide, 1.25 times their size.',
  es: 'Detalle de la :ref{id="balance"}: el astil y sus dos platillos vacíos. Los 48 mm de '
    + 'lienzo que muestra se imprimen a 60 mm, 1,25 veces su tamaño.' }, { en: 'National '
    + 'Gallery of Art, Washington. Public domain.', es: 'National Gallery of Art, Washington. '
    + 'Dominio público.' }, { en: 'A hand holds a small balance by its loop between thumb '
    + 'and forefinger; both pans hang empty.', es: 'Una mano sostiene una pequeña balanza por '
    + 'el aro entre el pulgar y el índice; los dos platillos cuelgan vacíos.' }],
};
const resources = Object.entries(PAINTINGS).map(([id, [[w, h], caption, note, alt]]) => ({
  id, typeId: REACH[id] ? 'plate' : 'detail', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}-${h > w ? h : w}.jpg`, format: 'jpeg', width: w, height: h },
  caption: t(caption), note: t(note), altText: t(alt),
  ...(REACH[id] && { placement: { plate: REACH[id] } }) }));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  Spectral: ['400', '400i'], 'Cormorant Garamond': ['500', '500i'], Jost: ['400', '500', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(resources.map((r) => loadImage(r.bitmap.fileId, asset(r.bitmap.fileId))));
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Plates to the margins, the trim and the bleed',
  es: 'Láminas a los márgenes, al corte y a sangre' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // with crop marks, a TrimBox and a BleedBox

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
