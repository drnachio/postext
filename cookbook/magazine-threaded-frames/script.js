// ═══ Postext Cookbook · Nº 160 · A magazine feature threaded through frames ═════
// https://postext.dev/en/cookbook/magazine-threaded-frames
// Code: MIT · Text: original (CC BY 4.0) · Pictures: Generated With Diffusion Models
// Fonts: Literata, Fraunces, Instrument Sans (SIL OFL 1.1) · Needs postext ≥ 1.65.0
//
// A six-page feature of an invented city magazine, set as one composed page: an opening
// spread whose frames are drawn in the config, and pages the text adds as it runs on.
// Every word, the photo's id and the section name are in content.<lang>.md.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
  traceResourceContour, withContourTrace,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en' | 'de')
const RECIPE = 'magazine-threaded-frames';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: honey on warm paper, every colour linked by id
const palette = {
  ink: '#211c18', // text
  honey: '#a65a12', // the accent: kickers, rules, the drop cap, the pull quote
  tint: '#f5ecdc', // the fact box
  rule: '#d8c6a6', // hairlines
  muted: '#6b6158', // running heads, credits
  paper: '#ffffff',
  shade: '#1a1612', // the plate under the headline on the photo
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'honey (defaults)', value: { hex: palette.honey, model: 'hex' } },
];
// #endregion

const SERIF = 'Literata';
const DISPLAY = 'Fraunces';
const SANS = 'Instrument Sans';
const W = 225; // trim width in mm; the spread's sheet is twice as wide
const IN = 16; // inner margin
const OUT = 18; // outer margin
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
// The spread's content area runs from the verso's outer margin to the recto's: a frame
// on the recto starts RECTO mm in from its left edge.
const RECTO = W - OUT + IN;
const COLUMN = 92; // the two columns of the recto
const GAP = 7;

// #region push: two frames that push the columns' lines aside, by box and by outline
const pushers = [
  // The pull quote straddles the gutter: each column loses the side it covers.
  { name: 'cita', style: 'cita', exclude: 'push', width: mm(62),
    placement: at('#entradilla', 'below', COLUMN - 27.5, 82) },
  // The skep's frame pushes with the shape of its picture, read from the PNG's alpha.
  { name: 'recorte', exclude: 'push', wrap: 'contour', layer: 2, width: mm(58),
    placement: at('container', 'bottom-right', 9, -8) },
];
// #endregion

// #region answer: the opening spread: a story in two chained columns that goes on
const opening = {
  id: 'apertura',
  spread: true,
  header: false,
  frames: [
    { name: 'titulo', takes: 'h1', layer: 2, width: mm(150),
      placement: at('container', 'bottom-left', 4, -14) },
    { name: 'datos', style: 'datos', layer: 2, width: mm(64),
      placement: at('container', 'top-left', 4, 6) },
    { name: 'entradilla', width: mm(2 * COLUMN + GAP),
      placement: at('container', 'top-left', RECTO) },
    // The story names no slot, so it goes to the flow frame, then on down the chain.
    { name: 'col-1', flow: true, next: 'col-2', width: mm(COLUMN), height: 'fill',
      placement: at('#entradilla', 'below', 0, 7) },
    // What the last column cannot hold goes on to a page added after the spread.
    { name: 'col-2', width: mm(COLUMN), height: 'fill',
      placement: at('#col-1', 'right-of', GAP),
      overflow: { continueIn: 'template:seguido' } },
    ...pushers,
  ],
  decoration: { elements: [
    { kind: 'image', id: 'foto', resourceId: '{attr.foto}',
      fit: 'cover',
      placement: { ...at('bleed', 'top-left'), size: { width: mm(W), height: 'fill' } } },
    { kind: 'text', id: 'seccion', content: '{attr.seccion}', fontFamily: SANS, fontSize: pt(9),
      fontWeight: 700, letterSpacing: pt(2), textTransform: 'uppercase', color: col('paper'),
      placement: at('#titulo', 'above', 0, -3) },
  ] },
};
// #endregion

// #region pages-after: the page the story adds, three chained columns, as often as needed
// The third column continues into this same template: the story goes on in the frame its
// chain starts in, so every added page fills all three columns.
const seguido = {
  id: 'seguido',
  frames: [
    { name: 'seguido-1', flow: true, next: 'seguido-2', height: 'fill', width: mm(60.3) },
    { name: 'seguido-2', next: 'seguido-3', height: 'fill', width: mm(60.3),
      placement: at('#seguido-1', 'right-of', 5) },
    { name: 'seguido-3', height: 'fill', width: mm(60.3),
      placement: at('#seguido-2', 'right-of', 5),
      overflow: { continueIn: 'template:seguido' } },
  ],
};
// #endregion

// #region running-heads: magazine name on the verso, section on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, fontFamily: SANS, fontSize: pt(7.5), fontWeight: 600,
  letterSpacing: pt(1.2), textTransform: 'uppercase', color: col('muted'),
  placement: at('page', edge, x, 11), ...extra,
});
const folio = { fontWeight: 700, color: col('honey') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUT, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUT + 9),
  head('recto-title', '{attr.seccion}', 'odd', 'top-right', -(OUT + 9)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUT, folio),
] };
// #endregion

const body = { fontFamily: SERIF, fontSize: pt(9.8), lineHeight: pt(13.6), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(4) };
const config = {
  locale: t({ es: 'es', en: 'en-gb', de: 'de' }),
  // Pictures with no number and no caption label: a magazine credits them in the text.
  resourceTypes: [{ id: 'foto', name: t({ es: 'Foto', en: 'Photo', de: 'Foto' }), shortLabel: '',
    numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '',
    defaultPlacement: { position: 'here' } }],
  colorPalette,
  page: {
    sizePreset: 'custom', width: mm(W), height: mm(297), dpi: 150,
    margins: { top: mm(20), bottom: mm(22), left: mm(IN), right: mm(OUT), mirror: true },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    ...body, referenceColor: col('ink'), textAlign: 'justify', indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true, maxJustifyTracking: 12,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: DISPLAY, color: col('ink'), fontWeight: 600,
    levels: [
      { level: 1, fontSize: pt(58), lineHeight: pt(56), color: col('paper'), marginBottom: pt(0),
        breakBefore: { enabled: false } },
      { level: 2, fontFamily: SANS, fontSize: pt(8.5), lineHeight: pt(13.6), fontWeight: 700,
        letterSpacing: pt(1.4), textTransform: 'uppercase', color: col('honey'),
        marginTop: pt(13.6), marginBottom: pt(0) },
    ],
  },
  paragraphStyles: [
    { id: 'entradilla', fontFamily: DISPLAY, fontSize: pt(15), lineHeight: pt(20), italic: true,
      textAlign: 'left', firstLineIndent: pt(0), color: col('ink') },
    // The first paragraph of the story opens with an initial in a frame, as it would in the flow.
    { id: 'inicio', firstLineIndent: pt(0),
      dropCap: { lines: 3, fontFamily: DISPLAY, fontWeight: 600, color: col('honey'),
        leadIn: { words: 3 } } },
    { id: 'firma', fontFamily: SANS, fontSize: pt(8), lineHeight: pt(12), fontWeight: 600,
      textTransform: 'uppercase', textAlign: 'left',
      firstLineIndent: pt(0), color: col('honey'), marginTop: pt(6) },
    { id: 'colofon', fontFamily: SANS, fontSize: pt(6.8), lineHeight: pt(9.5), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(8) },
  ],
  calloutStyles: [
    { id: 'cita', backgroundEnabled: false, border: { enabled: false },
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('honey') },
      padding: { top: mm(3), right: mm(0), bottom: mm(3), left: mm(0) },
      body: { fontFamily: DISPLAY, fontSize: pt(15), lineHeight: pt(18.5), italic: true,
        color: col('honey'), textAlign: 'left', firstLineIndent: pt(0) } },
    { id: 'datos', backgroundEnabled: true, background: col('tint'), border: { enabled: false },
      padding: { top: mm(3.5), right: mm(4), bottom: mm(3.5), left: mm(4) },
      titleStyle: { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: pt(1.2), color: col('honey') },
      body: { fontFamily: SANS, fontSize: pt(8.4), lineHeight: pt(11.6), color: col('ink'),
        boldColor: col('honey'), firstLineIndent: pt(0), textAlign: 'left' } },
  ],
  captionStyle: { fontFamily: SANS, fontSize: pt(7.5), color: col('muted'), labelBold: true,
    labelColor: col('honey'), note: { color: col('muted') } },
  header,
  footer: { elements: [] },
  pageTemplates: [opening, seguido],
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region pictures: the photo, and a cut-out whose alpha channel is the wrap's outline
const photo = { id: 'azotea', typeId: 'foto', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  caption: '', altText: t({
    es: 'Seis colmenas de colores en la azotea de una fábrica, con la ciudad al amanecer',
    en: 'Six painted hives on a factory roof, with the city behind them at sunrise',
    de: 'Sechs bunte Bienenkästen auf einem Fabrikdach, dahinter die Stadt im Morgenlicht' }),
  bitmap: { fileId: 'rooftop-1400.jpg', format: 'jpeg', width: 1400, height: 1848 } };
let skep = { id: 'cesto', typeId: 'foto', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  caption: '', altText: t({ es: 'Un cesto de paja para abejas', en: 'A straw bee skep',
    de: 'Ein Bienenkorb aus Stroh' }),
  contour: { threshold: 0.5, margin: mm(2.5) },
  bitmap: { fileId: 'skep-720.png', format: 'png', width: 720, height: 828 } };
await loadImage('rooftop-1400.jpg', asset('rooftop-1400.jpg'));
await loadImage('skep-720.png', asset('skep-720.png'));
// The layout reads pictures by size, never by pixels: the outline travels as a trace.
const trace = await traceResourceContour(skep, imageBytes('skep-720.png'), 'image/png');
skep = withContourTrace(skep, trace);
const resources = [photo, skep];
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Literata: ['400', '400i', '700'],
  Fraunces: ['600', '600i'],
  'Instrument Sans': ['600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Page 1 is the verso numbered 46: the feature opens on a spread inside the issue.
const continuation = { pageIndexOffset: 45, pageNumbering: { startAt: 46 } };
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config,
  kitFonts(FONTS));
showPages(doc, { title: t({ es: 'Las abejas del tejado', en: 'The bees on the roof',
  de: 'Die Bienen auf dem Dach' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
