// ═══ Postext Cookbook · Nº 193 · A peek-a-boo board book with holes in register ════════
// https://postext.dev/en/cookbook/peek-a-boo-board-book
// Code: MIT · Text: original (CC BY 4.0) · Paintings: generated with diffusion models
// Fonts: Andika, Fredoka, Nunito (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// A fourteen-page board book for toddlers: on every other recto a hole is cut through the
// painting, and what shows through it is a scrap of the next picture. The words on the left
// make a guess from the scrap; the turned page shows what it really is. The leaves have
// rounded corners, the holes step down from the cover, and the PDF carries the die line.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'peek-a-boo-board-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a cream board, a robin red for the title and the guesses, a dusk blue
const palette = {
  ink: '#2a2420', // text: a warm near-black
  accent: '#b8432c', // the cover title and the guesses: the robin's breast
  paper: '#fbf5e8', // the board the words are printed on
  dusk: '#253a63', // the back cover, the blue of the last painting's sky
  cream: '#fff9ec', // type on the cover and the back
  muted: '#7a6f64', // the colophon
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TRIM, BLEED] = [160, 3]; // mm: a square board book, and its bleed
const [TOP, FOOT, INNER, OUTER] = [44, 16, 18, 16]; // the words sit low, under the holes' tops
const [TEXT, DISPLAY, LABEL] = ['Andika', 'Fredoka', 'Nunito'];
const LEAD = 31; // pt: 24 pt type on a generous leading, for reading aloud
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });

// #region answer: the dies, and the pages they cut
// Each painting is cut where the next one's telling part lies: the cat's striped flank, the
// sheep's wool, the lantern's glow. The cover's window is wider than the hedge's hole and
// holds it, so from the cover you see the hedge, and through the hedge the cat. A hole cuts
// both sides of its leaf, mirrored on the verso, and the words there run round it.
const circle = (id, name, cx, cy, d) => ({ id, name, shape: 'circle', x: mm(cx - d / 2),
  y: mm(cy - d / 2), width: mm(d), height: mm(d), wrap: { gap: mm(4) } });
const dieCuts = {
  shapes: [
    circle('window', t({ en: 'Cover window', es: 'Ventana de la cubierta' }), 112, 68, 60),
    circle('hedge', t({ en: 'Gap in the hedge', es: 'Hueco del seto' }), 112, 60, 36),
    { id: 'knot', name: t({ en: 'Knothole', es: 'Nudo de la valla' }), shape: 'ellipse',
      x: mm(102), y: mm(48), width: mm(32), height: mm(40), wrap: { gap: mm(4) } },
    circle('peephole', t({ en: 'Barn-door peephole', es: 'Mirilla del granero' }), 91, 29, 20),
  ],
  // By position in the book: page 1 is the cover, 3 the hedge, 7 the fence, 11 the door.
  pages: [{ pages: '1', die: 'window' }, { pages: '3', die: 'hedge' },
    { pages: '7', die: 'knot' }, { pages: '11', die: 'peephole' }],
  corners: { radius: mm(9), edges: 'all' }, // board books are rounded on all four corners
};
// #endregion

// #region pictures: a painting to the bleed, the page's heading naming it
// Each painting hangs from the trim and runs BLEED past it on every side, so the holes hit it
// in the same place on screen and in print. A picture's section drops the foot margin, so its
// design reaches the foot of the page; the words on the verso behind it, in the same section,
// start TOP down.
const SHEET = { width: mm(TRIM + 2 * BLEED), height: mm(TRIM + 2 * BLEED) }; // trim + bleed
const painting = { kind: 'image', id: 'painting', resourceId: '{attr.picture}', fit: 'cover',
  placement: at('page', 'top-left', -BLEED, -BLEED, SHEET) };
const full = (elements) => ({ enabled: true, minHeight: mm(TRIM - TOP), slot: { elements } });
const flush = { margins: { top: mm(TOP), bottom: mm(0), left: mm(INNER), right: mm(OUTER) } };
const title = { kind: 'text', id: 'title', content: '{titleText}', fontFamily: DISPLAY,
  fontWeight: 600, fontSize: pt(40), lineHeight: 1, color: col('accent'), align: 'left',
  placement: at('page', 'top-left', 62, 8, { width: mm(88) }) };
const headingStyles = [
  { id: 'cover', numbered: false, toc: false, ...flush, advancedDesign: full([painting, title]) },
  { id: 'picture', numbered: false, ...flush, breakBefore: { enabled: true, parity: 'odd' },
    advancedDesign: full([painting]) },
  // The back cover: the board printed dusk blue (the section's palette), the type in cream.
  { id: 'back', numbered: false, toc: false, breakBefore: { enabled: true, parity: 'even' },
    color: col('cream'), palette: { paper: palette.dusk } },
];
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM), height: mm(TRIM), dpi: 150,
    backgroundColor: col('paper'), cutLines: { enabled: false, bleed: mm(BLEED) },
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  dieCuts,
  // #region die-line: the die-maker's plate, and the press file around it
  // The die line is stroked on a Separation plate of its own ('Die'), overprinting, that the
  // press never inks. PDF/X-4 on coated stock: the board is printed on coated paper.
  print: { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false,
    dieLine: { output: 'page', ink: 'Die', width: pt(0.5) } },
  // #endregion
  bodyText: { fontFamily: TEXT, fontSize: pt(24), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: pt(8),
    hyphenation: { enabled: false }, // a word read aloud is never broken
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 600, levels: [
    { level: 1, fontSize: pt(30), lineHeight: pt(34), breakBefore: { enabled: true,
      parity: 'odd' }, marginTop: pt(0), marginBottom: pt(12) },
  ] },
  headingStyles,
  paragraphStyles: [
    // The guess, and the answer to it: the line a child shouts.
    { id: 'shout', fontFamily: DISPLAY, fontWeight: 600, fontSize: pt(32), lineHeight: pt(36),
      color: col('accent'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(6),
      marginBottom: pt(6) },
    { id: 'colophon', fontFamily: LABEL, fontSize: pt(9), lineHeight: pt(12.5),
      color: col('cream'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(8) },
  ],
  header: { elements: [] }, // a board book prints no running heads
  footer: { elements: [] }, // and no folios
  // #region folio: grey board, rounded leaves, seen low so the holes show their depth
  folio: {
    tilt: 50, yaw: -32,
    paper: { type: 'board', shade: '#fbf5e8' },
    binding: { type: 'hardcover', cover: 'pages', coverMaterial: 'paper' },
    surface: { type: 'oak' },
    lighting: { environment: 'daylight', intensity: 1.05 },
  },
  // #endregion
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// # The hedge {style="picture" picture="hedge"} names a painting; the words after it fill the
// verso behind that picture, the guess on the left of the hole that answers it.
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const PICTURES = {
  cover: t({ en: 'A cottage garden: a tall hedge under a blue sky, hollyhocks and a robin.',
    es: 'Un jardín: un seto alto bajo el cielo azul, malvarrosas y un petirrojo.' }),
  hedge: t({ en: 'A green hedge of small leaves with white flowers and a ladybird.',
    es: 'Un seto verde de hojas pequeñas con flores blancas y una mariquita.' }),
  cat: t({ en: 'A ginger tabby cat asleep, curled up on the lawn among daisies.',
    es: 'Un gato atigrado pelirrojo dormido, hecho un ovillo en el césped entre margaritas.' }),
  fence: t({ en: 'A weathered wooden fence, buttercups growing at its foot.',
    es: 'Una valla de madera vieja, con botones de oro al pie.' }),
  sheep: t({ en: 'A woolly white sheep with a black face, standing in the meadow.',
    es: 'Una oveja blanca y lanuda de cara negra, de pie en el prado.' }),
  door: t({ en: 'The red plank door of a barn, with black iron hinges.',
    es: 'La puerta roja de tablas de un granero, con bisagras de hierro negro.' }),
  lantern: t({ en: 'Grandpa walks down the garden path at dusk, holding up a glowing lantern.',
    es: 'El abuelo baja por el jardín al anochecer con un farolillo encendido en alto.' }),
};
const resources = Object.entries(PICTURES).map(([id, alt]) => ({ id, typeId: 'figure', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, altText: alt,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 900, height: 900 } }));
const FILES = { cover: asset('cover.jpg'), hedge: asset('hedge.jpg'), cat: asset('cat.jpg'),
  fence: asset('fence.jpg'), sheep: asset('sheep.jpg'), door: asset('door.jpg'),
  lantern: asset('lantern.jpg') };

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Andika: ['400', '700'], Fredoka: ['600'], Nunito: ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(Object.entries(FILES).map(([id, url]) => loadImage(`${id}.jpg`, url)));
// The press file is built first, with bleed and crop marks; the screen shows the trimmed
// pages, built last, with the corners and holes cut out against the desk.
const cut = { ...config.page.cutLines, enabled: true };
const pressConfig = { ...config, page: { ...config.page, cutLines: cut } };
const press = await buildDocumentWithFonts({ markdown, resources }, pressConfig, kitFonts(FONTS));
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));

// #region folio-stage: the book closed on the desk, the cover's window first
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The board book in 3D', es: 'El libro de cartón en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.body.append(stage);
createFolioFromDocument(stage, doc, { at: 0,
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });
// #endregion

// #region see-through: the flat pages show what lies beneath their holes
// renderPageToCanvas cuts the holes; `beneath` hands it the pages under them, painted here
// at a lower scale (the composite stretches them to the page), each with its own holes.
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
showPages(doc, { title: t({ en: 'Peek-a-boo! · a board book with holes',
  es: '¡Cucú! · un libro de cartón con agujeros' }), beneath });
document.getElementById('pages').before(stage);
offerPdf(() => renderToPdf(press, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
