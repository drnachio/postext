// ═══ Postext Cookbook · Nº 192 · Spot gloss over a soft-touch magazine ═════════════════
// https://postext.dev/en/cookbook/spot-uv-photo-magazine
// Code: MIT · Text: original (CC BY 4.0) · Photographs: diffusion models
// Fonts: Bodoni Moda, Source Serif 4, Source Sans 3 (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// A photography magazine whose pages are coated in a soft-touch varnish, with a gloss
// varnish laid over the photographs and the masthead only: the spot UV a printer sells as
// the contrast between a velvet page and a shining picture. Varnish puts no colour on the
// page, so the canvas shows the pages as they print and the finish views show the varnish.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'spot-uv-photo-magazine';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: two varnishes, each a spot ink with a finish
// A varnish is a spot ink: its own plate in the PDF, clear on screen. Soft touch goes over
// the whole sheet, the gloss over the pictures and the masthead. Both overprint by default,
// so neither cuts a hole in the colours under it. Each has a hex of its own all the same:
// a print render tells inks apart by their hex.
const varnish = (hex, name, sheen) => ({ hex, model: 'spot',
  spot: { name, cmyk: { c: 0, m: 0, y: 0, k: 0 }, finish: { kind: 'varnish', sheen } } });
const palette = {
  velvet: varnish('#e9e4f0', 'Soft-touch varnish', 'softTouch'),
  gloss: varnish('#e4f0ee', 'Spot UV gloss', 'gloss'),
  // The colours that print: a near-black, a slate for the bands, the paper.
  ink: { hex: '#1d1d22', model: 'cmyk', cmyk: { c: 30, m: 20, y: 10, k: 95 } },
  slate: { hex: '#262b3a', model: 'cmyk', cmyk: { c: 80, m: 65, y: 35, k: 60 } },
  muted: { hex: '#6c6a70', model: 'cmyk', cmyk: { c: 0, m: 5, y: 0, k: 65 } },
  paper: { hex: '#ffffff', model: 'hex' },
};
// The ink table names both varnishes as the order to the printer will.
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false, inks: [
  { name: 'Soft-touch varnish', finish: { kind: 'varnish', sheen: 'softTouch' } },
  { name: 'Spot UV gloss', finish: { kind: 'varnish', sheen: 'gloss' } }] };
// #endregion
const col = (id) => ({ ...palette[id], paletteId: id });
const colorPalette = [...Object.entries(palette).map(([id, value]) => ({ id, name: id, value })),
  { id: 'main-color', name: 'ink (defaults)', value: palette.ink }];

const [TRIM_W, TRIM_H] = [210, 280];
const MARGIN = { top: 18, bottom: 20, inner: 18, outer: 16 };
const LEAD = 13.6; // pt
const [DISPLAY, SERIF, SANS] = ['Bodoni Moda', 'Source Serif 4', 'Source Sans 3'];
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', placement, ...look });
const label = (size, color) => ({ fontFamily: SANS, fontWeight: 700, fontSize: pt(size),
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase', color });

// #region velvet: soft touch over every page, a box in the varnish to the bleed
// The page's footer carries it, after the folios: the footer is painted last, and whatever
// is painted after a varnish cuts it away in the PDF. The cover and the back keep it alone.
const velvet = { kind: 'box', id: 'velvet', style: { backgroundColor: col('velvet') },
  placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: 'fill' }) };
// #endregion

// #region gloss: a photograph with a gloss box laid over it, the same size
// The gloss box comes after the picture, so it lies on top; being a varnish it paints
// nothing on the canvas, and in the PDF it overprints the picture on a plate of its own.
const glossed = (resourceId, placement, focus) => [
  { kind: 'image', id: 'photo', resourceId, fit: 'cover', placement, ...(focus && { focus }) },
  { kind: 'box', id: 'shine', style: { backgroundColor: col('gloss') }, placement },
];
// #endregion

// #region cover: the masthead set twice, in paper white and again in the gloss
const BAND = 222; // mm from the top of the bleed to the slate band
const masthead = (id, color) => text(id, '{titleText}', { fontFamily: DISPLAY, fontWeight: 700,
  fontSize: pt(84), lineHeight: 0.9, align: 'center', color },
at('page', 'top-left', 0, 12, { width: mm(TRIM_W) }));
const cover = { id: 'cover', numbered: false, toc: false, span: 'page',
  footer: { elements: [velvet] }, advancedDesign: { enabled: true, minHeight: mm(230),
    slot: { elements: [
      ...glossed('saltflat', at('bleed', 'top-left', 0, 0, { width: 'fill',
        height: mm(BAND + 3) }), { x: 0.5, y: 0.62 }),
      { kind: 'box', id: 'band', style: { backgroundColor: col('slate') },
        placement: at('bleed', 'top-left', 0, BAND, { width: 'fill', height: mm(70) }) },
      masthead('title', col('paper')), masthead('title-gloss', col('gloss')),
      text('issue', '{attr.issue}', { ...label(8, col('paper')), align: 'center' },
        at('page', 'top-left', 0, 46, { width: mm(TRIM_W) })),
      text('lines', '{attr.lines}', { fontFamily: SERIF, fontSize: pt(12), lineHeight: 1.35,
        color: col('paper') }, at('page', 'top-left', MARGIN.outer, BAND + 4,
        { width: mm(150) })),
    ] } } };
// #endregion

// A story opens on a photograph to the bleed, glossed, the kicker and the title under it.
const story = { id: 'story', numbered: false, span: 'page', advancedDesign: { enabled: true,
  minHeight: mm(150), slot: { elements: [
    ...glossed('{attr.photo}', at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(160) })),
    text('kicker', '{attr.kicker}', label(7.5, col('muted')),
      at('page', 'top-left', MARGIN.outer, 166)),
    text('title', '{titleText}', { fontFamily: DISPLAY, fontWeight: 700, fontSize: pt(30),
      lineHeight: 1, color: col('ink') }, at('#kicker', 'below', 0, 2,
      { width: mm(170) })),
  ] } } };

// The back: a slate flood, the masthead again in white and gloss, the colophon under it.
const back = { id: 'back', numbered: false, toc: false, span: 'page',
  breakBefore: { enabled: true, parity: 'even' }, footer: { elements: [velvet] },
  advancedDesign: { enabled: true, minHeight: mm(240), slot: { elements: [
    { kind: 'box', id: 'flood', style: { backgroundColor: col('slate') },
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: 'fill' }) },
    { ...masthead('title', col('paper')), placement: at('page', 'top-left', 0, 110,
      { width: mm(TRIM_W) }) },
    { ...masthead('title-gloss', col('gloss')), placement: at('page', 'top-left', 0, 110,
      { width: mm(TRIM_W) }) },
    text('colophon', '{attr.colophon}', { fontFamily: SANS, fontSize: pt(8), lineHeight: 1.45,
      align: 'center', color: col('paper') }, at('page', 'top-left', 40, 150,
      { width: mm(130) })),
  ] } } };

// The editorial: a second dusk inside the margins, glossed, the kicker and the title under it.
const editorial = { id: 'editorial', numbered: false, span: 'page', advancedDesign: {
  enabled: true, minHeight: mm(120), slot: { elements: [
    ...glossed('dusk', at('container', 'top-left', 0, 0, { width: 'fill', height: mm(104) }),
      { x: 0.5, y: 0.6 }),
    text('kicker', '{attr.kicker}', label(7.5, col('muted')), at('container', 'top-left', 0, 109)),
    text('title', '{titleText}', { fontFamily: DISPLAY, fontWeight: 700, fontSize: pt(30),
      lineHeight: 1, color: col('ink') }, at('#kicker', 'below', 0, 2, { width: mm(170) })),
  ] } } };

const footer = { elements: [
  text('folio', '{pageNumber}  ·  {title}', { ...label(6.5, col('muted')), parity: 'even' },
    at('page', 'bottom-left', MARGIN.outer, -11)),
  text('folio-r', '{chapterTitle}  ·  {pageNumber}', { ...label(6.5, col('muted')),
    parity: 'odd', align: 'right' }, at('page', 'bottom-right', -MARGIN.outer, -11)),
  velvet,
] };

// #region folio: a perfect-bound magazine in studio light, where the gloss catches
const folio = {
  tilt: 26, yaw: -18,
  paper: { type: 'coatedMatte', grammage: 150 },
  binding: { type: 'paperback', cover: 'pages' },
  surface: { type: 'marble' },
  lighting: { environment: 'studio', intensity: 1.15 },
};
// #endregion

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  bodyText: { fontFamily: SERIF, fontSize: pt(9.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), textAlign: 'justify',
    firstLineIndent: mm(4), indentAfterHeading: false, hyphenation: { enabled: true },
    avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: SANS, fontWeight: 700, color: col('ink'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [cover, editorial, story, back],
  print: PRINT,
  header: { elements: [] }, footer, folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const photo = (id, [w, h], altText) => ({ id, typeId: 'photo', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w,
    height: h }, altText });
const resourceTypes = [{ id: 'photo', name: '', captionPrefix: '', numberingTemplate: '' }];
const resources = [
  photo('saltflat', [800, 1200], t({ en: 'A lone figure in a long coat '
    + 'crossing a cracked salt flat at dusk.', es: 'Una figura sola con abrigo largo cruza un '
    + 'salar agrietado al anochecer.' })),
  photo('nets', [1100, 733], t({ en: 'An old fisherman mending an orange net '
    + 'on a harbour quay.', es: 'Un pescador mayor remienda una red naranja en el muelle.' })),
  photo('fog', [800, 1000], t({ en: 'Pine trunks fading into morning fog.',
    es: 'Troncos de pino que se pierden en la niebla de la mañana.' })),
  photo('road', [1100, 733], t({ en: 'An empty desert road running between '
    + 'red mesas.', es: 'Una carretera vacía en el desierto entre mesetas rojas.' })),
  photo('dusk', [560, 840], t({ en: 'The salt flat again, the sun on the '
    + 'horizon.', es: 'El salar otra vez, con el sol en el horizonte.' })),
];
await Promise.all([loadImage('saltflat.jpg', asset('saltflat-800.jpg')),
  loadImage('nets.jpg', asset('nets-1100.jpg')), loadImage('fog.jpg', asset('fog-800.jpg')),
  loadImage('road.jpg', asset('road-1100.jpg')), loadImage('dusk.jpg', asset('dusk-560.jpg'))]);

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Bodoni Moda': ['700'], 'Source Serif 4': ['400', '400i', '700'],
  'Source Sans 3': ['400', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, { ...config(), resourceTypes },
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Long Light · spot gloss over a soft-touch magazine',
  es: 'Long Light · brillo selectivo sobre una revista en tacto suave' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// #region views: the cover as it prints, as a proof maps the varnish, and in a raking light
// 'flat' paints the inks and leaves the varnish out; 'map' marks the special plates in false
// colour (varnish in cyan) over a faded page; 'sheen' sweeps a light across the page.
const views = document.createElement('section');
views.id = 'finish-views';
views.style.cssText = 'display: flex; gap: 16px; justify-content: center; padding: 16px';
const VIEWS = { flat: t({ en: 'As it prints', es: 'Como se imprime' }),
  map: t({ en: 'The varnish plates', es: 'Las planchas de barniz' }),
  sheen: t({ en: 'Under a raking light', es: 'Con luz rasante' }) };
for (const [finishes, name] of Object.entries(VIEWS)) {
  const [figure, canvas, caption] = ['figure', 'canvas', 'figcaption']
    .map((tag) => document.createElement(tag));
  figure.style.margin = '0';
  canvas.style.width = '260px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${t({ en: 'The cover', es: 'La cubierta' })}: ${name}`);
  renderPageToCanvas(doc.pages[0], doc, canvas, { scale: 520 / doc.pages[0].width, finishes });
  caption.textContent = name;
  figure.append(canvas, caption);
  views.append(figure);
}
document.getElementById('pages').before(views);
// #endregion

// The magazine on a marble table, open on the first story, where the gloss shines.
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The magazine in 3D', es: 'La revista en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
views.before(stage);
createFolioFromDocument(stage, doc, { at: 2,
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
