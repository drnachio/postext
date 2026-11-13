// ═══ Postext Cookbook · Nº 194 · A window cover that frames the title page ═══════════════
// https://postext.dev/en/cookbook/die-cut-window-cover
// Code: MIT · Text: Poe (PD) · Translation: CC BY 4.0 · Paintings: diffusion models
// Fonts: EB Garamond, Cormorant Garamond (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// Poe's tale of a portrait in an oval frame, as a small hardback whose damask cover has an
// oval window cut through it. Closed, the book shows the face of the portrait on the title
// page through the window; the window's edge falls on the gilt of the painted frame.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'die-cut-window-cover';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink on cream inside; gold on a near-black for the cover and its plates
const palette = {
  ink: '#2b2320', // the text
  paper: '#f6efe2', // a cream book wove
  velvet: '#2a0d10', // the wall behind the portrait, and the endpapers
  plate: '#160c0b', // the cartouches on the damask
  gold: '#d9b36c', // the title type, the colour of the painted frame
  muted: '#6f6158', // the note on the text
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'gold (defaults)', value: { hex: palette.gold, model: 'hex' } },
];
// #endregion
const [WIDTH, HEIGHT, BLEED] = [130, 195, 3]; // mm: a small hardback, and its bleed
const [TOP, FOOT, INNER, OUTER] = [18, 24, 16, 19];
const [TEXT, DISPLAY] = ['EB Garamond', 'Cormorant Garamond'];
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region answer: one oval die through the cover, in register with the frame beneath
// The window is cut through the first leaf, so the closed book shows page 3 through it.
// Its size is measured on the title-page painting: a little wider than the frame's opening,
// so the cut edge falls on the gilt and the face sits in the middle of the hole.
const dieCuts = {
  shapes: [{ id: 'window', name: t({ en: 'Oval window', es: 'Ventana oval' }),
    shape: 'ellipse', x: mm(26), y: mm(15.7), width: mm(78), height: mm(102) }],
  pages: [{ pages: '1', die: 'window' }], // page 1, the front board
};
// #endregion

// #region plates: the paintings hung from the trim, and the type set on them
// Both paintings are placed in trim millimetres, the same frame the die is measured in. The
// portrait is set a little larger than the page so the frame is centred on it (and on the
// window); the cover type sits on a dark cartouche below the window.
const bleed = (x, y, width, height) => ({ kind: 'image', id: 'painting',
  resourceId: '{attr.picture}', fit: 'cover', placement: at('page', 'top-left', x, y,
    { width: mm(width), height: mm(height) }) });
const sheet = bleed(-BLEED, -BLEED, WIDTH + 2 * BLEED, HEIGHT + 2 * BLEED);
const portrait = bleed(-3.6, -BLEED, 140, 210); // its oval centred at x = WIDTH / 2
const box = (id, y, h) => ({ kind: 'box', id, placement: at('page', 'top-left', 17, y,
  { width: mm(WIDTH - 34), height: mm(h) }), style: { backgroundColor: col('plate'),
  borderColor: col('gold'), borderWidth: pt(0.75) } });
const type = (id, content, y, size, extra = {}) => ({ kind: 'text', id, content,
  fontFamily: DISPLAY, fontSize: pt(size), lineHeight: 1.1, color: col('gold'),
  align: 'center', placement: at('page', 'top-left', 17, y, { width: mm(WIDTH - 34) }),
  ...extra });
const caps = { fontWeight: 600, textTransform: 'uppercase', letterSpacing: pt(2.2) };
const full = (elements) => ({ enabled: true, minHeight: mm(HEIGHT - TOP),
  slot: { elements } });
const bare = { numbered: false, toc: false, header: { elements: [] },
  footer: { elements: [] } };
// A plate's section drops the foot margin, so its design reaches the foot of the page.
const flush = (top = TOP, side = 0) => ({ margins: { top: mm(top), bottom: mm(0),
  left: mm(INNER + side), right: mm(OUTER + side) } });
const dark = { palette: { paper: palette.velvet }, marginTop: pt(0), marginBottom: pt(0) };
const behind = (el) => ({ ...el, reserve: false }); // painted under the section's text
const headingStyles = [
  { id: 'cover', ...bare, ...dark, ...flush(), advancedDesign: full([sheet,
    box('plate', 130, 44), type('title', '{title}', 138, 27, { italic: true, fontWeight: 500 }),
    type('author', '{author}', 159, 9.5, caps)]) },
  { id: 'titlepage', ...bare, ...dark, ...flush(), breakBefore: { enabled: true, parity: 'odd' },
    advancedDesign: full([portrait, type('title', '{title}', 146, 30,
      { italic: true, fontWeight: 500 }), type('author', '{author}', 166, 10, caps)]) },
  { id: 'colophon', ...bare, hidden: true, ...flush(132), breakBefore: { parity: 'any' },
    bodyStyle: { fontSize: pt(9), lineHeight: pt(12.5), color: col('muted'), textAlign: 'left' } },
  { id: 'tale', numbered: false, toc: true, breakBefore: { enabled: true, parity: 'odd' },
    marginTop: mm(30), marginBottom: pt(28),
    dropCap: { lines: 3, fontFamily: DISPLAY, color: col('ink'), gap: mm(1.2) } },
  // The back: the damask again, and the copy set in gold on a cartouche.
  { id: 'back', ...bare, ...dark, ...flush(74, 10), breakBefore: { enabled: true,
    parity: 'even' }, advancedDesign: { enabled: true, slot: { elements: [behind(sheet),
      behind(box('plate', 62, 78))] } } },
];
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(WIDTH), height: mm(HEIGHT), dpi: 150,
    backgroundColor: col('paper'), cutLines: { enabled: false, bleed: mm(BLEED) },
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  dieCuts,
  // #region die-line: the die line on its own plate, in a PDF/X-4 for the printer
  print: { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false,
    dieLine: { output: 'page', ink: 'Die', width: pt(0.5) } },
  // #endregion
  bodyText: { fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(14), color: col('ink'),
    italicColor: col('ink'), boldColor: col('ink'), textAlign: 'justify',
    firstLineIndent: pt(12), paragraphSpacing: pt(0),
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), textAlign: 'center', levels: [
    { level: 1, fontSize: pt(20), lineHeight: pt(24), italic: true, fontWeight: 500,
      marginTop: pt(0), marginBottom: pt(14) },
  ] },
  headingStyles,
  paragraphStyles: [{ id: 'blurb', fontFamily: DISPLAY, fontSize: pt(13), lineHeight: pt(17),
    color: col('gold'), textAlign: 'center', firstLineIndent: pt(0), hyphenation: false }],
  header: { elements: [['verso', 'even', '{author}'], ['recto', 'odd', '{title}']].map(
    ([id, parity, content]) => ({ kind: 'text', id, parity, content, fontFamily: TEXT,
      fontSize: pt(9), italic: true, color: col('muted'), align: 'center', pages: 'body',
      placement: at('page', 'top', 0, 10, { width: mm(80) }) })) },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}',
    fontFamily: TEXT, fontSize: pt(9), color: col('muted'), align: 'center',
    placement: at('page', 'bottom', 0, -12, { width: mm(20) }) }] },
  // #region folio: a small hardback with a printed cover, seen low across the window
  folio: {
    tilt: 34, yaw: 0,
    paper: { type: 'bookWove', shade: '#f6efe2' },
    binding: { type: 'hardcover', cover: 'pages', coverMaterial: 'paper' },
    surface: { type: 'walnut' },
    lighting: { environment: 'lamp', intensity: 1.15 },
  },
  // #endregion
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// Cover, title page, note, the tale and the back: each a heading with a style. The cover
// and the title page print their title and author from the frontmatter.
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const PICTURES = {
  damask: [t({ en: 'An old damask: gold pomegranates, lions and griffins on oxblood.',
    es: 'Un damasco antiguo: granadas, leones y grifos dorados sobre rojo sangre.' }), 1024, 1536],
  portrait: [t({ en: 'A young woman with dark curls, painted head and shoulders, in a gilded '
    + 'oval frame on a velvet wall.', es: 'Una muchacha de rizos oscuros, pintada de busto, en '
    + 'un marco oval dorado sobre una pared de terciopelo.' }), 1024, 1536],
};
const resources = Object.entries(PICTURES).map(([id, [alt, w, h]]) => ({ id,
  typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText: alt,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w, height: h } }));
const FILES = { damask: asset('damask.jpg'), portrait: asset('portrait.jpg') };

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'EB Garamond': ['400', '400i'], 'Cormorant Garamond': ['500', '500i', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(Object.entries(FILES).map(([id, url]) => loadImage(`${id}.jpg`, url)));
// The press file first, with bleed and marks; the screen's trimmed pages last.
const cut = { ...config.page.cutLines, enabled: true };
const pressConfig = { ...config, page: { ...config.page, cutLines: cut } };
const press = await buildDocumentWithFonts({ markdown, resources }, pressConfig, kitFonts(FONTS));
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));

// #region folio-stage: the book closed on the desk, the face in the window
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The book in 3D', es: 'El libro en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.body.append(stage);
createFolioFromDocument(stage, doc, { at: 0,
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });
// #endregion

// #region see-through: the flat cover shows the title page through its window
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
showPages(doc, { title: t({ en: 'The Oval Portrait · a window cover',
  es: 'El retrato oval · una cubierta con ventana' }), beneath });
document.getElementById('pages').before(stage);
offerPdf(() => renderToPdf(press, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
