// ═══ Postext Cookbook · Nº 195 · A tunnel book twenty leaves deep ═══════════════════════
// https://postext.dev/en/cookbook/forest-tunnel-book
// Code: MIT · Text: original (CC BY 4.0) · Paintings: generated with diffusion models
// Fonts: Cormorant Garamond, Lora (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// Twenty board leaves, each printed with one plane of a wood and cut with a round window a
// little smaller than the one before. From the cover you look down the whole tunnel, past
// oaks, foxgloves, an owl and a fox, to a doe and her fawn at a pool in the clearing.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'forest-tunnel-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a deep forest green behind the words, cream type
const palette = {
  forest: '#1c2a1e', // the versos, and the plate under the cover title
  cream: '#f4ecd6', // all the type
  moss: '#a9b98a', // the subtitle and the colophon
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'moss (defaults)', value: { hex: palette.moss, model: 'hex' } },
];
// #endregion
const [TRIM, BLEED] = [150, 3]; // mm: a square board book, and its bleed
const [TOP, SIDE] = [128, 14]; // the words on each verso sit under its window
const [DISPLAY, TEXT] = ['Cormorant Garamond', 'Lora'];
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region answer: nineteen windows, each smaller than the last, all on one axis
// Leaf k (pages 2k − 1 and 2k) is cut with a circle of radius R1 · Q^(k − 1) round the
// same centre: 58 mm on the cover down to 12 mm on leaf 19. Leaf 20, the clearing, is
// whole, so from the cover the eye goes through nineteen windows to the far plane.
const [CX, CY, R1, Q] = [75, 66, 58, 0.9162];
const radius = (k) => R1 * Q ** (k - 1);
const leaves = Array.from({ length: 19 }, (_, i) => i + 1);
const dieCuts = {
  shapes: leaves.map((k) => ({ id: `w${k}`, name: `${t({ en: 'Window', es: 'Ventana' })} ${k}`,
    shape: 'circle', x: mm(CX - radius(k)), y: mm(CY - radius(k)),
    width: mm(2 * radius(k)), height: mm(2 * radius(k)) })),
  pages: leaves.map((k) => ({ pages: String(2 * k - 1), die: `w${k}` })), // recto of leaf k
  corners: { radius: mm(4), edges: 'fore' },
};
// #endregion

// #region planes: each recto a painted plane, the verso behind it a line of the walk
// The plane pictures were scaled so each painting's opening meets its window, centred on
// (CX, CY), over a softened copy of itself; the window's centre is flat, the die takes it.
const SHEET = { width: mm(TRIM + 2 * BLEED), height: mm(TRIM + 2 * BLEED) };
const painting = { kind: 'image', id: 'painting', resourceId: '{attr.picture}', fit: 'cover',
  placement: at('page', 'top-left', -BLEED, -BLEED, SHEET) };
const full = (elements) => ({ enabled: true, minHeight: mm(TRIM - TOP), slot: { elements } });
const plate = { kind: 'box', id: 'plate', placement: at('page', 'top-left', 25, 129,
  { width: mm(100), height: mm(17) }), style: { backgroundColor: col('forest') } };
const line = (id, content, y, size, color, extra) => ({ kind: 'text', id, content,
  fontFamily: DISPLAY, fontSize: pt(size), lineHeight: 1.1, color: col(color),
  align: 'center', placement: at('page', 'top-left', 25, y, { width: mm(100) }), ...extra });
const headingStyles = [
  { id: 'cover', numbered: false, toc: false, advancedDesign: full([painting, plate,
    line('title', '{title}', 131, 21, 'cream', { fontWeight: 600 }),
    line('subtitle', '{subtitle}', 139.5, 10.5, 'moss', { italic: true })]) },
  { id: 'plane', numbered: false, breakBefore: { enabled: true, parity: 'odd' },
    advancedDesign: full([painting]) },
];
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM), height: mm(TRIM), dpi: 150,
    backgroundColor: col('forest'), cutLines: { enabled: false, bleed: mm(BLEED) },
    margins: { top: mm(TOP), bottom: mm(0), left: mm(SIDE), right: mm(SIDE) } },
  layout: { layoutType: 'single' },
  dieCuts,
  // #region die-line: nineteen circles on the Die plate, one per recto
  print: { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false,
    dieLine: { output: 'page', ink: 'Die', width: pt(0.5) } },
  // #endregion
  bodyText: { fontFamily: DISPLAY, fontSize: pt(14), lineHeight: pt(17), italic: true,
    color: col('cream'), italicColor: col('cream'), textAlign: 'center', firstLineIndent: pt(0),
    hyphenation: { enabled: false }, optimalLineBreaking: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('cream'), levels: [
    { level: 1, fontSize: pt(14), lineHeight: pt(17), marginTop: pt(0), marginBottom: pt(0) },
  ] },
  headingStyles,
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(9), lineHeight: pt(12.5),
    italic: false, color: col('moss'), textAlign: 'center', firstLineIndent: pt(0),
    marginBottom: pt(4) }],
  header: { elements: [] }, // a picture book carries no running heads
  footer: { elements: [] }, // and no folios
  // #region folio: twenty board leaves, seen low enough for the windows to show their walls
  folio: {
    tilt: 40, yaw: -30,
    paper: { type: 'board', shade: '#f4ecd6' },
    binding: { type: 'hardcover', cover: 'pages', coverMaterial: 'paper' },
    surface: { type: 'oak' },
    lighting: { environment: 'daylight', intensity: 1.1 },
  },
  // #endregion
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// Each plane is a heading with a picture; the line after it is printed on its verso.
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const PLANES = t({
  en: ['Two old oaks and ferns', 'Foxgloves', 'Red toadstools in the moss',
    'A robin on a bramble', 'Bluebells', 'A fox in autumn bracken', 'Holly with red berries',
    'Pale birches', 'A tawny owl on an oak branch', 'Wide ferns in the light',
    'Mossy stones', 'A red squirrel on a trunk', 'Two rabbits', 'Grey trunks in the mist',
    'The path through moss', 'Sunbeams through the leaves', 'Golden mist',
    'The last branches', 'Foxgloves in the sun', 'A doe and her fawn drinking at a pool'],
  es: ['Dos robles viejos y helechos', 'Dedaleras', 'Setas rojas en el musgo',
    'Un petirrojo en una zarza', 'Campanillas', 'Un zorro entre helechos de otoño',
    'Acebo con bayas rojas', 'Abedules pálidos', 'Un cárabo en una rama de roble',
    'Helechos a la luz', 'Piedras con musgo', 'Una ardilla roja en un tronco', 'Dos conejos',
    'Troncos grises en la niebla', 'El sendero entre el musgo', 'Rayos de sol entre las hojas',
    'Niebla dorada', 'Las últimas ramas', 'Dedaleras al sol',
    'Una cierva y su cervatillo bebiendo en una charca'],
});
const id = (k) => `plane${String(k).padStart(2, '0')}`;
const resources = PLANES.map((alt, i) => ({ id: id(i + 1), typeId: 'figure', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, altText: alt,
  bitmap: { fileId: `${id(i + 1)}.jpg`, format: 'jpeg', width: 760, height: 760 } }));
const FILES = { plane01: asset('plane01.jpg'), plane02: asset('plane02.jpg'),
  plane03: asset('plane03.jpg'), plane04: asset('plane04.jpg'), plane05: asset('plane05.jpg'),
  plane06: asset('plane06.jpg'), plane07: asset('plane07.jpg'), plane08: asset('plane08.jpg'),
  plane09: asset('plane09.jpg'), plane10: asset('plane10.jpg'), plane11: asset('plane11.jpg'),
  plane12: asset('plane12.jpg'), plane13: asset('plane13.jpg'), plane14: asset('plane14.jpg'),
  plane15: asset('plane15.jpg'), plane16: asset('plane16.jpg'), plane17: asset('plane17.jpg'),
  plane18: asset('plane18.jpg'), plane19: asset('plane19.jpg'), plane20: asset('plane20.jpg') };

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Cormorant Garamond': ['500i', '600'], Lora: ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(Object.entries(FILES).map(([key, url]) => loadImage(`${key}.jpg`, url)));
// The press file first, with bleed and marks; the screen's trimmed pages last.
const cut = { ...config.page.cutLines, enabled: true };
const pressConfig = { ...config, page: { ...config.page, cutLines: cut } };
const press = await buildDocumentWithFonts({ markdown, resources }, pressConfig, kitFonts(FONTS));
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));

// #region folio-stage: the book closed on the desk, the tunnel straight ahead
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The tunnel book in 3D', es: 'El libro túnel en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.body.append(stage);
createFolioFromDocument(stage, doc, { at: 0,
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });
// #endregion

// #region see-through: every recto looks down the rest of the tunnel
// `beneath` paints the page two on, which paints the page two on from it, and so on to
// the clearing: page 1 shows all twenty planes. Each canvas is painted once and reused.
const under = new Map();
const beneath = (i) => {
  if (!under.has(i) && doc.pages[i]) {
    const canvas = document.createElement('canvas');
    under.set(i, canvas);
    renderPageToCanvas(doc.pages[i], doc, canvas, { scale: 1, beneath });
  }
  return under.get(i);
};
// #endregion
showPages(doc, { title: t({ en: 'Into the Wood · a tunnel book',
  es: 'Al fondo del bosque · un libro túnel' }), beneath });
document.getElementById('pages').before(stage);
offerPdf(() => renderToPdf(press, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
