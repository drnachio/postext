// ═══ Postext Cookbook · Nº 174 · A puzzle page with the answers upside down ═══════
// https://postext.dev/en/cookbook/puzzle-page-upside-down-answers
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Baloo 2, Nunito, Fredoka (SIL OFL 1.1) · Needs postext ≥ 1.63.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'puzzle-page-upside-down-answers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: reef colours: deep blue ink, coral, sea green, a sandy paper
const palette = {
  ink: '#16324a', // text: a deep sea blue
  coral: '#e8573f', // the accent: puzzle numbers, the title kicker
  sea: '#0f8b8d', // the second: crossword and word-search rules, the riddle's rings
  sun: '#ffc93c', // the turtle card's badge
  card: '#fff4e0', // the puzzle cards
  muted: '#5d7180', // answers, colophon, folio
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.coral, model: 'hex' } },
];
// #endregion
const [DISPLAY, TEXT, LABEL] = ['Baloo 2', 'Nunito', 'Fredoka'];

// #region answer: every puzzle on a card, its answers turned upside down under it
// placement 'inverted' sets each puzzle's key after it in a box turned 180°, inside the
// puzzle's card, so a page break never parts a puzzle from its answers. The key is made
// from the puzzle: the crossword's words by number, the ringed option, the right order.
const puzzle = {
  id: 'puzzle',
  box: 'card', // the card each puzzle sits on (a calloutStyles id)
  number: { shape: 'disc', fontFamily: DISPLAY, background: col('coral') },
  instruction: { fontFamily: TEXT, bold: false },
  options: { marker: 'circle', labels: 'none' }, // a ring to colour in, no letters
  grid: { fontFamily: LABEL, rule: col('sea'), cell: em(1.45) },
  match: { color: col('sea') },
  area: { kind: 'lines', color: col('sea') },
  answers: { color: col('coral'), fontFamily: LABEL },
  solutions: { placement: 'inverted', box: 'turned' },
  marginTop: mm(0), marginBottom: mm(0),
};
const card = { id: 'card', title: '', background: col('card'), borderRadius: mm(4),
  padding: { top: mm(3.5), right: mm(4), bottom: mm(3), left: mm(4) },
  titleStyle: { fontFamily: DISPLAY, fontSize: pt(15), fontWeight: 700, color: col('ink') },
  body: { fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(15), color: col('ink'),
    firstLineIndent: pt(0) },
  marginTop: mm(0), marginBottom: mm(5), keepTogether: true };
const turned = { id: 'turned', title: '', backgroundEnabled: false, border: { enabled: false },
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  body: { fontFamily: LABEL, fontSize: pt(8.5), lineHeight: pt(11), color: col('muted'),
    firstLineIndent: pt(0) },
  marginTop: mm(2), marginBottom: mm(0) };
// #endregion

// #region opener: the reef to the bleed, the title over its open water
const BAND = 104; // mm from the top edge: the painting's height at the page's width
const opener = { enabled: true, minHeight: mm(BAND - 16 + 6), slot: { elements: [
  { kind: 'image', id: 'reef', resourceId: 'reef', decorative: true, reserve: false,
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: mm(210), height: mm(BAND) } } },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(11),
    fontWeight: 600, color: col('paper'), textTransform: 'uppercase', letterSpacing: pt(2),
    box: { backgroundColor: col('coral'), borderRadius: mm(2),
      padding: { top: mm(0.8), bottom: mm(0.8), left: mm(2.4), right: mm(2.2) } },
    placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(16), y: mm(14) } } },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY, fontSize: pt(56),
    fontWeight: 800, lineHeight: 1, color: col('paper'),
    placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(3) } } },
  { kind: 'text', id: 'sub', content: '{attr.sub}', fontFamily: TEXT, fontSize: pt(12),
    fontWeight: 700, color: col('paper'), overflow: 'wrap', align: 'left',
    box: { backgroundColor: col('ink'), borderRadius: mm(2),
      padding: { top: mm(1.5), bottom: mm(1.5), left: mm(3), right: mm(3) } },
    placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(2) },
      size: { width: mm(110) } } },
] } };
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 150,
    margins: { top: mm(16), bottom: mm(18), left: mm(14), right: mm(14), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) },
  bodyText: { fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(15), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: true } },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 800,
    balancing: { enabled: false },
    // The opener spans both columns; the puzzles start under the painting.
    levels: [{ level: 1, fontSize: pt(56), span: 'page', breakBefore: { parity: 'any' },
      marginBottom: pt(0), advancedDesign: opener }] },
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(7.5), lineHeight: pt(10),
    color: col('muted'), firstLineIndent: pt(0), marginTop: mm(2) }],
  resourceTypes: [{ id: 'picture', name: t({ en: 'Picture', es: 'Dibujo' }), shortLabel: '',
    captionPrefix: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
    defaultPlacement: { position: 'here' } }],
  calloutStyles: [card, turned],
  exerciseStyles: [puzzle],
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{title} · {pageNumber}',
    fontFamily: LABEL, fontSize: pt(8), color: col('muted'), parity: 'all', pages: 'all',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-9) } } }] },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Baloo 2': ['700', '800'], // the title, the puzzles' names and numbers
  Nunito: ['400', '400i', '700'], // instructions, clues, the riddle
  Fredoka: ['400', '600'], // grid letters, the kicker, the answers
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage('reef-1600x792.jpg', asset('reef-1600x792.jpg'));
await loadImage('hatchling-600.jpg', asset('hatchling-600.jpg'));
const resources = [
  { id: 'reef', typeId: 'picture', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'reef-1600x792.jpg', format: 'jpeg', width: 1600, height: 792 } },
  { id: 'hatchling', typeId: 'picture', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'hatchling-600.jpg', format: 'jpeg', width: 600, height: 600 },
    placement: { position: 'here', width: 0.42, align: 'center' },
    altText: t({ en: 'A baby sea turtle hatching from its egg.',
      es: 'Una cría de tortuga marina sale del huevo.' }) },
];
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Puzzle page, answers upside down',
  es: 'Pasatiempos con soluciones del revés' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images
