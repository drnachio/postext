// ═══ Postext Cookbook · Nº 175 · A museum walk whose links print as QR notes ═════
// https://postext.dev/en/cookbook/museum-guide-qr-link-notes
// Code: MIT · Text: original (CC BY 4.0) · Paintings: The Metropolitan Museum of Art (CC0)
// Fonts: Newsreader, Instrument Serif, Archivo (SIL OFL 1.1) · Needs postext ≥ 1.65.0
// A pocket gallery guide: five paintings, one to a page. The Markdown writes the museum's
// catalogue pages as ordinary links; the print edition turns each one into a numbered note at
// the foot of the page, with the short address and a code a phone can scan.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'museum-guide-qr-link-notes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: Delft blue on warm paper, every colour linked by id
const palette = {
  ink: '#1f1d1a', // text: a warm near-black
  delft: '#2b4a7a', // the one accent: kickers, stop numbers, rules (8.6:1 on paper)
  rule: '#c6c9cf', // hairlines
  muted: '#5f6168', // running heads, notes, credits (6.1:1 on paper)
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'delft (defaults)', value: { hex: palette.delft, model: 'hex' } },
];
// #endregion
const TRIM = { w: 160, h: 240 }; // a large pocket guide, in mm
const TOP = 22; // top margin in mm: the cover's container starts here
const OUTER = 22; // outer margin in mm: folios and running heads align to it
const LEAD = 14; // body leading in pt: the baseline grid
const [TEXT, DISPLAY, LABEL] = ['Newsreader', 'Instrument Serif', 'Archivo']; // three voices

// #region answer: every web link of the guide prints as a numbered note with a code to scan
const links = {
  print: 'notes', // a note marker after the link text, the address in a note at the foot
  show: 'both', // the short address for reading, the code for the phone
  urlDisplay: 'short', // metmuseum.org/art/collection/search/436616: no https://, no www.
  repeat: 'first', // an address noted once is cited again by its number, never noted twice
  qr: { size: mm(16), side: 'start', gap: em(1.2), color: col('ink') },
};
// Link notes are footnotes: they take the note style and the numbering below. 'document'
// numbers them through the walk, so the five stops print notes 3 to 7, not five notes 1.
const footnotes = { placement: 'column', numbering: 'document', fontSize: pt(8),
  lineHeight: pt(10.5), color: col('muted'), spaceAbove: pt(LEAD), spaceBetween: pt(5),
  separator: { enabled: true, width: 0.18, lineWidth: pt(0.5), color: col('rule') } };
// #endregion

// #region cover: a bleed painting over the guide's kicker, title and standfirst
const DEPTH = 120; // mm from the trim's top edge to the painting's foot
const caps = (size, weight = 700) => ({ fontFamily: LABEL, fontWeight: weight,
  fontSize: pt(size), letterSpacing: em(0.18), textTransform: 'uppercase' });
const at = (to, edge, x, y) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const cover = { enabled: true, slot: { elements: [
    { kind: 'image', id: 'painting', resourceId: 'vermeer-cover',
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: 'fill', height: mm(DEPTH) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...caps(7.5), color: col('delft'),
      align: 'left', placement: at('container', 'top-left', 0, DEPTH - TOP + 8) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(44),
      lineHeight: 1, color: col('ink'), align: 'left', placement: at('#kicker', 'below', 0, 2) },
    // Empty padding paints nothing but counts: the text starts a line under the standfirst.
    { kind: 'text', id: 'standfirst', content: '{attr.standfirst}', fontFamily: TEXT,
      italic: true, fontSize: pt(11.5), lineHeight: 1.3, color: col('ink'), align: 'left',
      box: { padding: { bottom: mm(4) } }, placement: at('#title', 'below', 0, 2.5) },
  ] } };
// #endregion

// #region stops: each stop opens a page under its number, title and painter
const stop = { enabled: true, minHeight: pt(4 * LEAD), slot: { elements: [
    { kind: 'text', id: 'stop', content: '{attr.stop}', ...caps(7.5), color: col('delft'),
      align: 'left', placement: at('container', 'top-left', 0, 0) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(22),
      lineHeight: 1.05, color: col('ink'), align: 'left', placement: at('#stop', 'below', 0, 1.6) },
    { kind: 'text', id: 'artist', content: '{attr.artist}', fontFamily: TEXT, italic: true,
      fontSize: pt(10.5), color: col('muted'), align: 'left',
      placement: at('#title', 'below', 0, 0.8) },
  ] } };
// #endregion

// #region heads: guide title on the verso, the stop on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', ...caps(7, 600), color: col('muted'),
  placement: at('page', edge, x, 13), ...extra,
});
const folio = { ...caps(8, 700), color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
  head('recto-stop', '{firstMark.h2}', 'odd', 'top-right', -(OUTER + 9)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
// #endregion

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }),
  resourceTypes: [paintingType],
  colorPalette,
  page: { width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(22), left: mm(20), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(10.2), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false },
  // Hyphenation, optimal line breaking and widow, orphan and runt control are on by default.
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('ink'), levels: [
    // The cover is the guide's one chapter: a page-span opener on page 1.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      marginBottom: pt(0), advancedDesign: cover },
    // Every stop opens a page of its own, either side.
    { level: 2, breakBefore: { enabled: true, parity: 'any' }, marginTop: pt(0),
      marginBottom: pt(0), advancedDesign: stop },
    { level: 3, ...caps(7.5), color: col('delft'), lineHeight: pt(LEAD),
      marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  links, footnotes,
  orderedLists: { numberFormat: 'decimal', fontFamily: LABEL, fontWeight: 700, color: col('delft'),
    marginTop: pt(LEAD / 2), marginBottom: pt(0) },
  captionStyle: { fontFamily: LABEL, fontSize: pt(7.8), lineHeight: pt(10.5), color: col('ink'),
    note: { fontSize: pt(6.8), color: col('muted'), gap: mm(1.5) } },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(6.6), lineHeight: pt(9.2),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header, footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region resources: five paintings, the caption beside each one like a wall label
// Paintings are not numbered: their own type, with no caption prefix and no number.
const paintingType = { id: 'painting', name: t({ en: 'Painting', es: 'Cuadro' }),
  shortLabel: t({ en: 'painting', es: 'cuadro' }), captionPrefix: '', numberingTemplate: '',
  resetOn: 'never', counterFormat: 'decimal' };
// Set where the ::resource line stands, under the stop's heading; caption and note beside it.
const HERE = { position: 'here', captionSide: 'inside' };
const cm = (n) => (LANG === 'es' ? String(n).replace('.', ',') : String(n)); // decimal comma
// The wall label: medium, size in cm (no-break spaces) and the museum's credit line.
const painting = (id, w, h, [cmH, cmW], credit, alt, width = 0.5) => ({
  id, typeId: 'painting', kind: 'bitmap', createdAt: 0, updatedAt: 0, placement: { ...HERE, width },
  bitmap: { fileId: `${id}-${Math.max(w, h)}.jpg`, format: 'jpeg', width: w, height: h },
  caption: `${OIL}, ${cm(cmH)}\u00a0×\u00a0${cm(cmW)}\u00a0cm. ${credit}`, altText: alt,
  note: 'The Metropolitan Museum of Art, Open Access (CC0)' });
const OIL = t({ en: 'Oil on canvas', es: 'Óleo sobre lienzo' });
const ALTMAN = t({ en: 'Bequest of Benjamin Altman, 1913', es: 'Legado de Benjamin Altman, 1913' });
const resources = [
  painting('hals', 908, 1200, [105.4, 79.4], `${ALTMAN} (14.40.602)`, t({
    en: 'A laughing young man raises a glass; a young woman leans on his shoulder.',
    es: 'Un joven ríe y alza una copa; una joven se apoya en su hombro.' }), 0.4), // portrait
  painting('steen', 1115, 1200, [141, 131.4], 'Fletcher Fund, 1958 (58.89)', t({
    en: 'A crowded party under a vine, with a lute player, a child and a dog.',
    es: 'Una fiesta concurrida bajo una parra, con un laudista, un niño y un perro.' })),
  painting('rembrandt', 1139, 1200, [143.5, 136.5], t({
    en: 'Purchase, special contributions and funds given or bequeathed by friends of the Museum',
    es: 'Compra con aportaciones y fondos donados o legados por amigos del Museo' })
    + ', 1961 (61.198)', t({ en: 'A bearded man in a black hat rests his hand on a marble bust.',
    es: 'Un hombre barbado con sombrero negro apoya la mano en un busto de mármol.' })),
  painting('vermeer', 1422, 1600, [45.7, 40.6], t({ en: 'Marquand Collection, gift of',
    es: 'Colección Marquand, donación de' }) + ' Henry G. Marquand, 1889 (89.15.21)', t({
    en: 'A young woman at an open window holds a gilt pitcher over a basin.',
    es: 'Una joven junto a una ventana abierta sujeta una jarra dorada sobre una jofaina.' })),
  painting('ruisdael', 1400, 1084, [100, 130.2], `${ALTMAN} (14.40.623)`, t({
    en: 'A sandy road between wheat fields under a tall bank of cloud.',
    es: 'Un camino de arena entre campos de trigo bajo un alto banco de nubes.' }), 0.6),
  // The cover: the Vermeer cut to the box's 4 : 3 (160 × 120 mm), since the opener fits a
  // picture inside its box. Drawn by the cover design, never cited.
  { ...painting('vermeer-cover', 1800, 1350, [], '', t({
    en: 'Detail of Vermeer’s young woman at the window, in blue and white.',
    es: 'Detalle de la joven de Vermeer junto a la ventana, en azul y blanco.' })),
  caption: '', note: '' },
];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Newsreader: ['400', '400i'], 'Instrument Serif': ['400'],
  Archivo: ['400', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const files = resources.map((r) => r.bitmap.fileId);
await Promise.all(files.map((file) => loadImage(file, asset(file))));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Pocket Walks · The Dutch Rooms',
  es: 'Paseos de bolsillo · Las salas holandesas' }) });
// In the PDF each code is drawn as vectors and is itself a link to the address.
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
