// ═══ Postext Cookbook · Nº 191 · A bakery menu in white ink on kraft ═════════════════════
// https://postext.dev/en/cookbook/white-ink-kraft-menu
// Code: MIT · Text: original (CC BY 4.0) · Paintings: diffusion models
// Fonts: Alfa Slab One, Lora (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// The menu of a bakery, a folded card of brown kraft. Kraft takes no white from the paper, so
// the name and the course heads print in an opaque white ink, and the paintings sit on white
// mounts that the same ink lays under them; the menu text is a dark brown in process colour.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, preflightDocument,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'white-ink-kraft-menu';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: kraft as the paper, and an opaque white as a spot ink
// The paper is a colour that prints no ink: the screen and Folio paint kraft, and no plate
// gets a dot of it. Because it is not white, the preflight knows the white ink shows on it.
// The white is a spot ink with the white finish: its own plate, laid down before the others.
const kraft = { hex: '#c19a6b', model: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 0 } };
const WHITE = { name: 'Opaque White', cmyk: { c: 0, m: 0, y: 0, k: 0 } };
// A white ink overprints by default: laid under the colours, it must not cut holes in them.
const white = { hex: '#f7f4ee', model: 'spot', spot: { ...WHITE, finish: { kind: 'white' } } };
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra52', convertImages: false,
  inks: [{ name: 'Opaque White', aliases: ['White'], finish: { kind: 'white' } }] };

// White type on a green panel must knock the green out.
// White printed under the green is hidden by it. For white type on a colour, the type must cut
// its shape out of the colour, so this white says overprint: false. Its hex differs by one
// step from the other white, since the PDF tells colours apart by hex; both print on one plate.
const whiteOut = { hex: '#f6f3ed', model: 'spot',
  spot: { ...WHITE, finish: { kind: 'white' }, overprint: false } };
// #endregion

const palette = {
  kraft, white, whiteOut,
  // The brown overprints: on the white card it lands on the white instead of cutting it away.
  ink: { hex: '#3b2a1c', model: 'cmyk', cmyk: { c: 0, m: 45, y: 75, k: 82 }, overprint: true },
  green: { hex: '#2f5a43', model: 'cmyk', cmyk: { c: 80, m: 25, y: 75, k: 40 } }, // the panel
};
const col = (id) => ({ ...palette[id], paletteId: id });
const colorPalette = [...Object.entries(palette).map(([id, value]) => ({ id, name: id, value })),
  { id: 'main-color', name: 'ink (defaults)', value: palette.ink }];

const [TRIM_W, TRIM_H] = [148, 210]; // A5, an A4 card folded once
const MARGIN = 13;
const MEASURE = TRIM_W - 2 * MARGIN;
const [BODY, LEAD] = [9.6, 13.2]; // pt
const [DISPLAY, SERIF] = ['Alfa Slab One', 'Lora'];
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', placement, ...look });
const label = (size, color) => ({ fontFamily: SERIF, fontWeight: 700, fontSize: pt(size),
  letterSpacing: pt(size * 0.14), textTransform: 'uppercase', color });
const bare = { numbered: false, toc: false, span: 'page', header: { elements: [] },
  footer: { elements: [] } };

// #region mount: a painting on a white mount, 4 mm of white round it
// The mount is a box in the white, the painting a picture over it. The white goes down first
// on press and runs on under the whole painting, so its light tones print on white.
const mount = (x, y, w, h, extra) => [
  { kind: 'box', id: 'mount', style: { backgroundColor: col('white') },
    placement: at('page', 'top-left', x, y, { width: mm(w), height: mm(h) }) },
  { kind: 'image', id: 'photo', resourceId: '{attr.photo}', fit: 'cover', ...extra,
    placement: at('page', 'top-left', x + 4, y + 4, { width: mm(w - 8), height: mm(h - 8) }) },
];
// #endregion

// The cover: the name in white straight on the kraft, the loaf on its mount.
const cover = { ...bare, id: 'cover', advancedDesign: { enabled: true, minHeight: mm(170),
  slot: { elements: [
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(50), lineHeight: 0.9,
      textTransform: 'uppercase', align: 'center', color: col('white') },
    at('page', 'top-left', MARGIN, 22, { width: mm(MEASURE) })),
    text('since', '{attr.since}', { ...label(8, col('ink')), align: 'center' },
      at('#title', 'below', 0, 3, { width: mm(MEASURE) })),
    ...mount(26, 64, 96, 96),
    text('address', '{attr.address}', { fontFamily: SERIF, italic: true,
      fontSize: pt(10), lineHeight: 1.35, color: col('ink'), align: 'center' },
    at('page', 'top-left', MARGIN, 172, { width: mm(MEASURE) })),
  ] } } };

// The inside pages open on a painting across the measure, the kicker and the title in white.
const opener = (id, height) => ({ ...bare, id, advancedDesign: { enabled: true,
  minHeight: mm(height + 20), slot: { elements: [
    ...mount(MARGIN, 14, MEASURE, height),
    text('kicker', '{attr.kicker}', label(7.5, col('ink')),
      at('page', 'top-left', MARGIN, 18 + height)),
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(24), lineHeight: 1,
      textTransform: 'uppercase', color: col('white') },
    at('#kicker', 'below', 0, 1.5, { width: mm(MEASURE) })),
  ] } } });

// The back: the bakery's story in brown, the hours on a white card.
const back = { ...bare, id: 'back', advancedDesign: { enabled: true, minHeight: mm(14),
  slot: { elements: [
    text('title', '{titleText}', { fontFamily: DISPLAY, fontSize: pt(24), lineHeight: 1,
      textTransform: 'uppercase', color: col('white') }, at('container', 'top-left')),
  ] } } };

// #region dishes: a dish and its price on a tab stop, dotted to the right margin
const dish = { id: 'dish', name: 'Dish', textAlign: 'left',
  tabStops: [{ position: 'end', align: 'end', leader: '. ' }],
  spaceBetween: pt(LEAD / 3), marginTop: pt(LEAD / 2) };
// The story on the back: half a line between paragraphs.
const story = { id: 'story', name: 'Story', spaceBetween: pt(LEAD / 2) };
// #endregion

// #region panel: the day's bake on green, its type knocked out in white
const calloutStyles = [
  { id: 'bake', background: col('green'), marginTop: pt(LEAD), marginBottom: pt(0),
    padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
    body: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('whiteOut'),
      boldColor: col('whiteOut'), italicColor: col('whiteOut'), textAlign: 'left',
      firstLineIndent: pt(0) } },
  // The hours: brown type on a card of white ink, the colour printed over the white.
  { id: 'hours', background: col('white'), marginTop: pt(LEAD), marginBottom: pt(0),
    padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) },
    body: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
      boldColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0),
      tabStops: [{ position: 'end', align: 'end' }] } },
];
// #endregion

// #region folio: a folded kraft card on an oak counter, in daylight
const folio = {
  tilt: 20, yaw: -12,
  paper: { type: 'cardStock', grammage: 250, texture: 'felt', shade: kraft },
  binding: { type: 'folded', cover: 'pages' },
  surface: { type: 'oak' },
  lighting: { environment: 'daylight', intensity: 1.1 },
};
// #endregion

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('kraft'), margins: { top: mm(14), bottom: mm(14), left: mm(MARGIN),
      right: mm(MARGIN) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0),
    hyphenation: { enabled: false }, avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('white'), levels: [
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), letterSpacing: pt(1.2),
      textTransform: 'uppercase', marginTop: pt(LEAD), marginBottom: pt(0) }] },
  headingStyles: [cover, opener('wide', 54), opener('square', 56), back],
  paragraphStyles: [dish, story], calloutStyles,
  print: PRINT,
  header: { elements: [] }, footer: { elements: [] }, folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const painting = (id, [w, h], altText) => ({ id, typeId: 'painting', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w,
    height: h }, altText });
const resourceTypes = [{ id: 'painting', name: '', captionPrefix: '', numberingTemplate: '' }];
const resources = [
  painting('loaf', [700, 683], t({ en: 'A round sourdough loaf with a floured, cross-cut crust, '
    + 'painted in gouache.', es: 'Una hogaza redonda de masa madre con la corteza enharinada '
    + 'y cortada en cruz, pintada al gouache.' })),
  painting('pastries', [900, 396], t({ en: 'A croissant, a glazed cinnamon roll and a slice of '
    + 'almond cake.', es: 'Un cruasán, una caracola de canela glaseada y una porción de tarta '
    + 'de almendra.' })),
  painting('coffee', [600, 600], t({ en: 'A white cup of milky coffee on a saucer, a spoon '
    + 'beside it.', es: 'Una taza blanca de café con leche en su plato, con la cucharilla.' })),
];
await Promise.all([loadImage('loaf.jpg', asset('loaf-700.jpg')),
  loadImage('pastries.jpg', asset('pastries-900.jpg')),
  loadImage('coffee.jpg', asset('coffee-600.jpg'))]);

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Alfa Slab One': ['400'], Lora: ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, { ...config(), resourceTypes },
  kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Horno Alto · a bakery menu in white ink on kraft',
  es: 'Horno Alto · una carta de panadería en tinta blanca sobre kraft' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// #region preflight: what the press check says of the white
// A white ink on white paper prints nothing you can see, and the preflight warns of it
// (whiteInkOnWhite). On kraft it does not fire; the findings left say which special ink the
// job carries and that the press lays the white first.
const findings = preflightDocument(doc);
const report = document.createElement('p');
report.textContent = `Preflight: ${findings.map((f) => f.kind === 'inkPressOrder'
  ? `inkPressOrder (first: ${f.first.join(', ')})` : `${f.kind}${f.ink ? ` (${f.ink})` : ''}`)
  .join('; ') || 'no findings'}`;
document.querySelector(`[data-postext-pdf="${RECIPE}.pdf"]`).after(report);
// #endregion

// The card in the hand, open on the inside, so the white reads against the brown.
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The menu in 3D', es: 'La carta en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, { at: 2,
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
