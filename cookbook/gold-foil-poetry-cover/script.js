// ═══ Postext Cookbook · Nº 188 · Gold foil on a deep-blue cover ═══════════════════════
// https://postext.dev/en/cookbook/gold-foil-poetry-cover
// Code: MIT · Text: Hopkins, Bécquer (public domain) · Nocturne: diffusion models
// Fonts: Cormorant Garamond, Cinzel, Cormorant SC (SIL OFL 1.1) · Needs postext ≥ 1.84.0
//
// A poetry chapbook with a hot-foil cover. The cover, the opener and the contents are set
// in gold foil alone on deep-blue card; inside, on cream paper, the poems print in four
// colours and every rule of the page is foil. Folio lights the foil; the PDF gives it a
// plate of its own for the block-maker.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'gold-foil-poetry-cover';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: the foil is a spot colour with a finish; the stocks print no ink at all
// Gold foil: a spot ink whose finish says what it is. The canvas paints its hex, Folio lights
// it as metal, and a CMYK or PDF/X file puts it on a Separation of its own named 'Gold foil',
// the artwork the foil block is etched from.
const foil = { hex: '#c9a24a', model: 'spot', spot: { name: 'Gold foil',
  cmyk: { c: 15, m: 30, y: 75, k: 10 }, finish: { kind: 'foil', sheen: 'gloss' } } };
// The two stocks are the paper's own colours, not inks: authored in CMYK at 0 % they paint
// on screen and put nothing on any plate. The blue card is a palette value of its own, so a
// section can turn the page blue (palette: { paper: … } in its heading style).
const stock = (hex) => ({ hex, model: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 0 } });
const palette = {
  ink: { hex: '#232530', model: 'hex' }, // the poems: a warm near-black in process
  muted: { hex: '#6c6558', model: 'hex' }, // the attributions and the colophon
  foil,
  paper: stock('#f6f0e3'), // cream wove, inside
  card: stock('#1d2a4d'), // deep-blue card, the cover and the opener leaf
};
const col = (id) => ({ ...palette[id], paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, value]) => ({ id, name: id, value })),
  { id: 'main-color', name: 'foil (defaults)', value: foil },
];
// Every blue page takes this: the paper turns to the card, and the head and foot go.
const onCard = { numbered: false, toc: false, palette: { paper: palette.card.hex },
  header: { elements: [] }, footer: { elements: [] } };
// The press file: PDF/X-4, the foil on its plate, the cream and the blue on none.
const PRINT = { standard: 'pdfx4', outputProfile: 'fogra51' };
// #endregion

const [TRIM_W, TRIM_H] = [140, 216]; // mm: a chapbook
const [TOP, FOOT, INNER, OUTER] = [24, 24, 18, 18]; // mm, mirrored
const LEAD = 14.2; // pt
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'center', placement, ...look });
const caps = (size, color = col('foil'), spacing = 0.2) => ({ fontFamily: 'Cinzel',
  fontSize: pt(size), letterSpacing: pt(size * spacing), color });
const rule = (id, y, width, thickness = 0.6, to = 'page', edge = 'top') => ({ kind: 'rule', id,
  direction: 'horizontal', color: col('foil'), thickness: pt(thickness),
  placement: at(to, edge, 0, y, { width: mm(width) }) });

// #region cover: a frame of foil rules, the title and a rule between the names
// Two frames, a hairline inside a heavier rule: foil holds a 0.3 pt line on smooth card.
const frame = (id, inset, thickness) => ({ kind: 'box', id, style: { borderColor: col('foil'),
  borderWidth: pt(thickness) }, placement: at('page', 'top-left', inset, inset,
  { width: mm(TRIM_W - 2 * inset), height: mm(TRIM_H - 2 * inset) }) });
const flush = { span: 'page', margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) } };
const cover = { ...onCard, ...flush, id: 'cover', advancedDesign: { enabled: true,
  minHeight: mm(TRIM_H), slot: { elements: [
    frame('outer', 9, 1.6), frame('inner', 11.5, 0.4),
    text('kicker', '{attr.kicker}', caps(8.5), at('page', 'top', 0, 46)),
    text('title', '{titleText}', { ...caps(40, col('foil'), 0.06), lineHeight: 1.05 },
      at('page', 'top', 0, 62, { width: mm(100) })),
    rule('rule', 112, 22, 0.8),
    text('poet', '{author}', { fontFamily: 'Cormorant SC', fontSize: pt(15), fontWeight: 500,
      letterSpacing: pt(1.5), color: col('foil') }, at('page', 'top', 0, 120)),
    text('years', '{attr.years}', caps(8), at('page', 'top', 0, 186)),
  ] } } };
// #endregion

// #region opener: the opener leaf and the contents, in foil on the blue card
const opener = { ...onCard, id: 'opener', breakBefore: { enabled: true, parity: 'odd' },
  advancedDesign: { enabled: true, minHeight: mm(120), slot: { elements: [
    rule('top', 52, 60, 0.4, 'page'),
    text('title', '{titleText}', { ...caps(24, col('foil'), 0.08) }, at('page', 'top', 0, 66)),
    text('note', '{attr.note}', { fontFamily: 'Cormorant Garamond', italic: true,
      fontSize: pt(12.5), lineHeight: 1.3, color: col('foil') },
    at('page', 'top', 0, 84, { width: mm(80) })),
    rule('foot', 108, 60, 0.4, 'page'),
  ] } } };
const contentsPage = { ...onCard, id: 'contents', breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: mm(30), slot: { elements: [
    text('title', '{titleText}', caps(10), at('container', 'top', 0, 8)),
    rule('rule', 16, 14, 0.6, 'container'),
  ] } } };
// The contents in foil: its entries, leaders and page numbers from the poems' headings.
const toc = { levels: [{ level: 1, fontFamily: 'Cormorant Garamond', fontSize: pt(12.5),
  color: col('foil'), marginBottom: pt(LEAD * 0.6) }],
pageNumber: { fontFamily: 'Cinzel', fontSize: pt(9), color: col('foil'), width: mm(8) },
leader: { char: '. ', gap: mm(2) } };
// #endregion

// #region rules: inside, every rule is foil: a double rule over the head, a rule per poem
const poem = { enabled: true, minHeight: mm(23), slot: { elements: [
  text('title', '{titleText}', { ...caps(13, col('ink'), 0.1), lineHeight: 1.2 },
    at('container', 'top', 0, 6, { width: mm(90) })),
  { ...rule('rule', 3.5, 12, 0.8, '#title', 'below') },
  text('sub', '{attr.sub}', { fontFamily: 'Cormorant Garamond', italic: true, fontSize: pt(11),
    color: col('muted') }, at('#rule', 'below', 0, 3)),
] } };
const HEAD_Y = 12; // mm from the top edge to the running heads
const headText = (id, content, parity, edge, x) => text(id, content, { ...caps(7.5,
  col('muted'), 0.18), align: edge.endsWith('left') ? 'left' : 'right', parity },
at('page', edge, x, HEAD_Y));
const header = { elements: [
  // The double rule across the text block, a thick and a thin line 1 mm apart.
  { ...rule('head-a', HEAD_Y + 5.5, TRIM_W - INNER - OUTER, 0.9, 'container', 'top'),
    placement: at('page', 'top', 0, HEAD_Y + 5, { width: mm(TRIM_W - INNER - OUTER) }) },
  { ...rule('head-b', 0, 0, 0.3), placement: at('page', 'top', 0, HEAD_Y + 6.2,
    { width: mm(TRIM_W - INNER - OUTER) }) },
  headText('verso', '{title}', 'even', 'top-left', OUTER),
  headText('recto', '{chapterTitle}', 'odd', 'top-right', -OUTER),
] };
const footer = { elements: [
  text('folio', '{pageNumber}', caps(9, col('ink'), 0.05), at('page', 'bottom', 0, -13)),
  rule('folio-l', -12, 6, 0.6, 'page', 'bottom'), // a short foil rule under the folio
] };
// #endregion

// The nocturne on its own page, in a foil frame.
const plate = { id: 'plate', numbered: false, toc: false, header: { elements: [] },
  footer: { elements: [] }, advancedDesign: { enabled: true,
    minHeight: mm(TRIM_H - TOP - FOOT), slot: { elements: [
      { kind: 'image', id: 'art', resourceId: 'nocturne',
        placement: at('page', 'top', 0, 30, { width: mm(92), height: mm(144.9) }) },
      { kind: 'box', id: 'frame', style: { borderColor: col('foil'), borderWidth: pt(1.2) },
        placement: at('page', 'top', 0, 27, { width: mm(98), height: mm(150.9) }) },
    ] } } };

// The colophon and the back cover go back to the blue card.
const colophon = { ...onCard, id: 'colophon', breakBefore: { enabled: true, parity: 'odd' },
  advancedDesign: { enabled: true, minHeight: mm(118), slot: { elements: [
    rule('rule', 112, 14, 0.6) ] } } };
const back = { ...onCard, ...flush, id: 'back', breakBefore: { enabled: true, parity: 'even' },
  advancedDesign: { enabled: true, minHeight: mm(TRIM_H), slot: { elements: [
    frame('outer', 9, 1.6), frame('inner', 11.5, 0.4),
    text('title', '{titleText}', caps(10), at('page', 'top', 0, 98)),
    rule('rule', 106, 10, 0.6),
  ] } } };

// #region folio: a paperback in the hand, under studio lights that catch the foil
const folio = {
  tilt: 24, yaw: -16,
  paper: { type: 'bookWove', grammage: 100, shade: '#ffffff' }, // the colour is the page's
  binding: { type: 'paperback', cover: 'pages' },
  surface: { type: 'walnut' },
  lighting: { environment: 'studio', intensity: 1.1 },
};
// #endregion

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 300,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Cormorant Garamond', fontSize: pt(12.2), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: true },
    avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: 'Cinzel', fontWeight: 400, color: col('ink'), levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, advancedDesign: poem }] },
  headingStyles: [cover, opener, contentsPage, plate, colophon, back,
    // A short poem runs on under the one before it.
    { id: 'run-on', breakBefore: { enabled: false }, marginTop: pt(LEAD) }],
  paragraphStyles: [
    { id: 'verse', fontFamily: 'Cormorant Garamond', fontSize: pt(12.2), lineHeight: pt(LEAD) },
    { id: 'colophon', fontFamily: 'Cormorant Garamond', italic: true, fontSize: pt(10.5),
      lineHeight: pt(13.5), color: col('foil'), italicColor: col('foil'), textAlign: 'center',
      firstLineIndent: pt(0) },
  ],
  toc,
  print: PRINT,
  header, footer, folio,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region content: blue card around the cream leaves, as the binder gathers them
// :::paper{type=cardStock grammage=300}     pages 1–4: the cover leaf and the opener leaf
// # Shook Foil {style="cover"}  # Shook Foil {style="opener"}  # Contents {style="contents"}
// :::
// # God's Grandeur  …  # Spring             pages 5–10: cream wove, the poems
// :::paper{type=cardStock grammage=300}     pages 11–12: the back cover leaf
// # Colophon {style="colophon"}  # Shook Foil {style="back"}
// :::
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// #endregion
const resources = [{ id: 'nocturne', typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, bitmap: { fileId: 'nocturne.jpg', format: 'jpeg', width: 600, height: 945 },
  altText: t({ en: 'A night meadow under a sky of stars: tall poplars, a stone wall, a thin '
    + 'moon over the hills and a lit window in the valley.',
  es: 'Un prado de noche bajo un cielo de estrellas: chopos altos, una tapia de piedra, una '
    + 'luna fina sobre los montes y una ventana encendida en el valle.' }) }];
await loadImage('nocturne.jpg', asset('nocturne-600.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Cormorant Garamond': ['400', '400i'],
  Cinzel: ['400'],
  'Cormorant SC': ['500'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'Shook Foil · a chapbook with a gold-foil cover',
  es: 'Rimas · un cuaderno con portada en oro en caliente' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes,
  profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// The book in the hand: the cover, closed, turning its foil to the lamp.
const stage = document.createElement('section');
stage.id = 'folio';
stage.ariaLabel = t({ en: 'The chapbook in 3D', es: 'El cuaderno en 3D' });
stage.style.cssText = 'height: min(78vh, 720px); margin: 0 auto; max-width: 1280px';
document.getElementById('pages').before(stage);
createFolioFromDocument(stage, doc, {
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' } });

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
