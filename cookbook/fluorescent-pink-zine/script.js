// ═══ Postext Cookbook · Nº 190 · A zine in black and fluorescent pink ════════════════════
// https://postext.dev/en/cookbook/fluorescent-pink-zine
// Code: MIT · Text: original (CC BY 4.0) · Photographs: diffusion models
// Fonts: Archivo Black, IBM Plex Sans, IBM Plex Mono (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// A music zine printed on two plates, black and a fluorescent pink. The pink is a spot ink
// with a fluorescent finish; the job prints those two plates and nothing else, so the grey
// photographs print as duotones and every other colour is projected onto the two inks.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'fluorescent-pink-zine';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: two plates: black and a fluorescent pink that glows
// The pink is a spot ink; the ink table says it is fluorescent, as the printer will be told.
// The screen paints its hex, Folio makes it stand brighter than the paper, and the PDF puts it
// on a plate of its own. The ink table also takes the name the poster files gave it.
const PINK = { name: 'PANTONE 806 C', cmyk: { c: 0, m: 77, y: 0, k: 0 } };
const pink = (hex, tint) => ({ hex, model: 'spot', spot: { ...PINK, tint } });
// The job prints these two plates and nothing else. Pictures print as duotones: each
// plate takes the grey of a pixel through its curve, [tone, ink] in percent.
const CURVES = { Black: [[0, 0], [45, 8], [100, 92]], // the shadows
  'PANTONE 806 C': [[0, 0], [35, 45], [70, 80], [100, 60]] }; // the middle tones
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra51',
  inks: [{ name: 'PANTONE 806 C', aliases: ['Fluo pink'], finish: { kind: 'fluorescent' } }],
  plates: { inks: ['Black', 'PANTONE 806 C'], images: ['Black', 'PANTONE 806 C'],
    curves: CURVES } };
// #endregion
// Black is the K plate alone, and it overprints: on the pink it prints over the ink instead of
// knocking a hole that a sheet out of register would show as a white rim.
const palette = {
  black: { hex: '#1b1a1d', model: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 100 }, overprint: true },
  pink: pink('#ff3ea5'),
  pink30: pink('#ffc5e4', 30),
  paper: { hex: '#ffffff', model: 'hex' },
};
const col = (id) => ({ ...palette[id], paletteId: id });
const colorPalette = [...Object.entries(palette).map(([id, value]) => ({ id, name: id, value })),
  { id: 'main-color', name: 'pink (defaults)', value: palette.pink }];

const [TRIM_W, TRIM_H] = [148, 210]; // A5, an A4 sheet folded once
const MARGIN = { top: 16, bottom: 18, inner: 14, outer: 12 };
const LEAD = 12.4; // pt
const [DISPLAY, SANS, MONO] = ['Archivo Black', 'IBM Plex Sans', 'IBM Plex Mono'];
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', placement, ...look });
const label = (size, color) => ({ fontFamily: MONO, fontWeight: 500, fontSize: pt(size),
  letterSpacing: pt(size * 0.12), textTransform: 'uppercase', color });
const bare = { numbered: false, toc: false, span: 'page', header: { elements: [] },
  footer: { elements: [] } };

// #region cover: the crowd over a black band, the title in pink on the black
const BAND = 134; // mm from the top of the bleed to the black band
const cover = { ...bare, id: 'cover', advancedDesign: { enabled: true, minHeight: mm(150),
  slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: 'crowd', fit: 'cover', focus: { x: 0.35, y: 0.5 },
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(BAND + 4) }) },
    { kind: 'box', id: 'band', style: { backgroundColor: col('black') },
      placement: at('bleed', 'top-left', 0, BAND + 3, { width: 'fill', height: mm(90) }) },
    text('issue', '{attr.issue}', label(8, col('pink')), at('page', 'top-left', 12, 12)),
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(70), lineHeight: 0.82,
      textTransform: 'uppercase', color: col('pink') },
    at('page', 'top-left', 10, BAND + 9, { width: mm(130) })),
    text('lines', '{attr.lines}', { fontFamily: SANS, fontWeight: 700, fontSize: pt(11),
      lineHeight: 1.25, color: col('paper') }, at('page', 'top-left', 12, BAND + 55,
      { width: mm(110) })),
  ] } } };
// #endregion

// #region feature: a photograph to the head of the page, the title in black on a pink band
const feature = { ...bare, id: 'feature', span: 'page', advancedDesign: { enabled: true,
  minHeight: mm(128), slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: '{attr.photo}', fit: 'cover',
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(96) }) },
    { kind: 'box', id: 'band', style: { backgroundColor: col('pink') },
      placement: at('bleed', 'top-left', 0, 93, { width: 'fill', height: mm(36) }) },
    text('kicker', '{attr.kicker}', label(7.5, col('black')), at('page', 'top-left', 12, 98)),
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(21), lineHeight: 1,
      textTransform: 'uppercase', color: col('black') },
    at('#kicker', 'below', 0, 2, { width: mm(124) })),
  ] } } };
// #endregion

// An ordinary section: a pink kicker over a black title.
const opener = { enabled: true, minHeight: mm(26), slot: { elements: [
  text('kicker', '{attr.kicker}', label(7.5, col('pink')), at('container', 'top-left')),
  text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(22), lineHeight: 1,
    textTransform: 'uppercase', color: col('black') },
  at('#kicker', 'below', 0, 1.5, { width: mm(122) })),
] } };

// The back cover: a pink flood to the bleed, the colophon over it in black.
const back = { ...bare, id: 'back', breakBefore: { enabled: true, parity: 'even' },
  advancedDesign: { enabled: true, minHeight: mm(150), slot: { elements: [
    { kind: 'box', id: 'flood', style: { backgroundColor: col('pink') },
      placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: 'fill' }) },
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(40), lineHeight: 0.85,
      textTransform: 'uppercase', color: col('black') }, at('page', 'top-left', 12, 120,
      { width: mm(120) })),
    text('colophon', '{attr.colophon}', { fontFamily: SANS, fontSize: pt(8), lineHeight: 1.35,
      color: col('black') }, at('#title', 'below', 0, 6, { width: mm(100) })),
  ] } } };

const footer = { elements: [
  text('folio', '{pageNumber}  ·  {title}', { ...label(6.5, col('black')), parity: 'even' },
    at('page', 'bottom-left', MARGIN.outer, -10)),
  text('folio-r', '{chapterTitle}  ·  {pageNumber}', { ...label(6.5, col('black')),
    parity: 'odd', align: 'right' }, at('page', 'bottom-right', -MARGIN.outer, -10)),
] };

// #region folio: a saddle-stitched zine on a dark table under a dim, flat light
const folio = {
  tilt: 22, yaw: -14,
  paper: { type: 'uncoated', grammage: 100, shade: '#ffffff' },
  binding: { type: 'saddleStitch', cover: 'pages' },
  surface: { type: 'plain', color: { hex: '#2b2b30', model: 'hex' } },
  lighting: { environment: 'overcast', intensity: 1.05 },
};
// #endregion

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(5) },
  bodyText: { fontFamily: SANS, fontSize: pt(8.8), lineHeight: pt(LEAD), color: col('black'),
    boldColor: col('black'), italicColor: col('black'), referenceColor: col('black'),
    textAlign: 'left', firstLineIndent: mm(3), indentAfterHeading: false,
    hyphenation: { enabled: true }, avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: SANS, fontWeight: 700, color: col('black'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: opener },
    { level: 2, fontSize: pt(8.8), lineHeight: pt(LEAD), color: col('pink'),
      marginTop: pt(LEAD), marginBottom: pt(0) }] },
  headingStyles: [cover, feature, back],
  calloutStyles: [{ id: 'quote', background: col('pink'), marginTop: pt(LEAD),
    marginBottom: pt(LEAD), padding: { top: mm(3), right: mm(3), bottom: mm(3), left: mm(3) },
    body: { fontFamily: DISPLAY, fontSize: pt(13), lineHeight: pt(15), color: col('black'),
      textTransform: 'uppercase', textAlign: 'left', firstLineIndent: pt(0) } },
  { id: 'gigs', background: col('pink30'), columnGap: mm(4), marginTop: pt(LEAD),
    marginBottom: pt(LEAD),
    padding: { top: mm(5), right: mm(4), bottom: mm(5), left: mm(4) },
    body: { fontFamily: SANS, fontSize: pt(9.6), lineHeight: pt(14), color: col('black'),
      boldColor: col('black'), textAlign: 'left', firstLineIndent: pt(0) } }],
  unorderedLists: { bulletChar: '+', color: col('pink'), marginTop: pt(0), marginBottom: pt(0) },
  captionStyle: { fontFamily: MONO, fontSize: pt(6.5), color: col('black'), gap: mm(1.5) },
  print: PRINT,
  header: { elements: [] }, footer, folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region duotone: the screen shows each photograph as the two plates will print it
// The PDF separates the grey original through CURVES. The screen would paint it grey, so the
// picture registered for the canvas and Folio is the same grey run through the same curves:
// the black over the pink, multiplied as inks lie on paper. The PDF still gets the original.
const ink = (curve, tone) => { // a curve read at a tone, both 0–1
  const i = curve.findIndex(([x]) => x / 100 >= tone);
  const [[x0, y0], [x1, y1]] = [curve[Math.max(0, i - 1)], curve[Math.max(0, i)]];
  return (x1 === x0 ? y1 : y0 + ((tone * 100 - x0) * (y1 - y0)) / (x1 - x0)) / 100;
};
const PINK_RGB = [0xff, 0x3e, 0xa5];
async function loadDuotone(fileId, url) {
  await loadImage(fileId, url); // the grey bytes, kept for the PDF
  const grey = await createImageBitmap(new Blob([imageBytes(fileId)]));
  const canvas = new OffscreenCanvas(grey.width, grey.height);
  const g = canvas.getContext('2d');
  g.drawImage(grey, 0, 0);
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const tone = 1 - img.data[i] / 255;
    const [k, p] = [ink(CURVES.Black, tone), ink(CURVES['PANTONE 806 C'], tone)];
    for (let c = 0; c < 3; c++) {
      img.data[i + c] = 255 * (1 - k) * (1 - p * (1 - PINK_RGB[c] / 255));
    }
  }
  g.putImageData(img, 0, 0);
  registerResourceImage(fileId, canvas.transferToImageBitmap());
}
// #endregion

const photo = (id, [w, h], altText, extra) => ({ id, typeId: 'photo', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w,
    height: h }, altText, ...extra });
const resourceTypes = [{ id: 'photo', name: '', captionPrefix: '', numberingTemplate: '' }];
const resources = [
  photo('crowd', [900, 600], t({ en: 'A crowd with raised arms in front of a singer in a low '
    + 'basement.', es: 'Un público con los brazos en alto ante un cantante en un sótano bajo.' })),
  photo('guitarist', [600, 750], t({ en: 'A young guitarist on a small stage under fairy '
    + 'lights.', es: 'Un guitarrista joven en un escenario pequeño bajo unas luces.' })),
  photo('posters', [560, 700], t({ en: 'A wet alley at night, its brick wall layered with torn '
    + 'posters.', es: 'Un callejón mojado de noche, con la pared cubierta de carteles rotos.' }),
  { placement: { position: 'top' }, caption: t({ en: 'The wall behind the Lavadero, March.',
    es: 'La pared de detrás del Lavadero, en marzo.' }) }),
];
await Promise.all([loadDuotone('crowd.jpg', asset('crowd-900.jpg')),
  loadDuotone('guitarist.jpg', asset('guitarist-600.jpg')),
  loadDuotone('posters.jpg', asset('posters-560.jpg'))]);

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Archivo Black': ['400'], 'IBM Plex Sans': ['400', '400i', '700'],
  'IBM Plex Mono': ['500'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, { ...config(), resourceTypes },
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Pink Noise · a zine in black and fluorescent pink',
  es: 'Pink Noise · un fanzine en negro y rosa flúor' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// The zine in the hand, under a dim light where the pink stands out from the paper.
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The zine in 3D', es: 'El fanzine en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, { at: 2, // open at the interview
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
