// ═══ Postext Cookbook · Nº 162 · An org chart and a photo grid built from modules ═══
// https://postext.dev/en/cookbook/org-chart-from-modules
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Public Sans, Source Serif 4 (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'org-chart-from-modules';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: an ink, the town's green for the lines and the areas, a warm mayor's box
const palette = {
  ink: '#1f2b2a', // text
  green: '#1d6b57', // the lines of the chart, the areas' boxes, the headings
  mayor: '#a8452e', // the box at the head of the chart
  tint: '#e6f1ec', // the services' boxes and the galleries' ground
  rule: '#b9cbc3', // the hairline round a service
  muted: '#5c6b67', // running heads and the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'green (defaults)', value: { hex: palette.green, model: 'hex' } },
];
// #endregion

const SANS = 'Public Sans', SERIF = 'Source Serif 4';
const PAGE = { w: 210, h: 297, top: 22, bottom: 22, inner: 18, outer: 15 }; // mm, mirrored
const W = PAGE.w - PAGE.inner - PAGE.outer; // the type area's width: 177 mm
const SPINE = 12; // mm: the room on the left of the areas where the chart's spine runs down
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const line = (more) => ({ kind: 'connector', color: col('green'), width: pt(1.2), radius: mm(2.5),
  ...more });

// #region answer: a module per area of the town hall, stacked by the page's modules group
// The page template draws the head of the chart and a group that takes the page's modules;
// the module draws one area: its box, a grid of its services and the lines between them.
const area = {
  id: 'area', role: 'module',
  frames: [
    { name: 'concejalia', style: 'area', width: mm(84), placement: at('container', 'top-left') },
    { name: 'servicio', style: 'servicio' }, // repeated: one per :::frame{slot="servicio"}
  ],
  groups: [{ name: 'servicios', kind: 'grid', columns: 3, columnGap: mm(4), rowGap: mm(4),
    repeat: { frames: ['servicio'] }, // rowAlign 'stretch': a row's boxes are one height
    placement: { ...at('#concejalia', 'below', 0, 7), size: { width: 'fill', height: 'fill' } } }],
  decoration: { elements: [
    // From the area down to each of its services: a tree with a bar over the row.
    line({ id: 'rama', routing: 'tree', from: { to: '#concejalia', side: 'bottom' },
      to: { to: '#servicio[*]', side: 'top' }, endCap: 'dot', capSize: mm(1.8) }),
    // From the mayor's box, a frame of the page, to this area: the spine and its branch.
    line({ id: 'tronco', routing: 'elbow', width: pt(1.8),
      from: { to: '#alcaldia', side: 'bottom', at: 0.06 }, to: { to: '#concejalia', side: 'left' },
      endCap: 'arrow', capSize: mm(2.6) }),
  ] },
};
const chart = {
  id: 'organigrama',
  frames: [
    { name: 'titulo', takes: 'h1', width: mm(W), placement: at('container', 'top-left') },
    { name: 'entradilla', flow: true, width: mm(W) },
    { name: 'alcaldia', style: 'alcaldia', width: mm(96) },
  ],
  groups: [{ name: 'cabeza', kind: 'stack', gap: mm(6),
    frames: ['titulo', 'entradilla', 'alcaldia'] },
    { name: 'areas', modules: true, gap: mm(6), placement: { ...at('#alcaldia', 'below', SPINE, 9),
      size: { width: mm(W - SPINE), height: 'fill' } } }],
};
// #endregion

// #region gallery: a module of a heading and a grid of photo cards; a notice box module
const gallery = {
  id: 'galeria', role: 'module',
  frames: [
    { name: 'cabecera', takes: 'h2', placement: at('container', 'top-left', 4, 4) },
    { name: 'foto', style: 'marco' }, // the photo of a card
    { name: 'pie', style: 'ficha', placement: at('#foto', 'below', 0, 2.5) }, // and its words
  ],
  groups: [{ name: 'fotos', kind: 'grid', columns: 3, columnGap: mm(5), rowGap: mm(6),
    rowAlign: 'start', repeat: { frames: ['foto', 'pie'] },
    placement: { ...at('#cabecera', 'below', 0, 3), size: { width: mm(W - 8), height: 'fill' } } }],
  // The module's own ground: a tint as large as the module, whatever its rows.
  decoration: { elements: [{ kind: 'box', id: 'suelo',
    placement: { ...at('container', 'top-left'), size: { width: 'fill', height: 'fill' } },
    style: { backgroundColor: col('tint'), borderRadius: mm(3) } }] },
};
// A notice box as a module of its own: one frame whose tab grows out of the box (joined).
const notice = { id: 'aviso', role: 'module', frames: [{ name: 'texto', style: 'aviso',
  placement: at('container', 'top-left', 0, 7) }] };
const places = {
  id: 'centros',
  frames: [
    { name: 'titulo', takes: 'h1', width: mm(W), placement: at('container', 'top-left') },
    { name: 'entradilla', flow: true, width: mm(W) },
    { name: 'colofon', style: 'colofon', optional: true, width: mm(W),
      placement: at('container', 'bottom-left', 0, 8) },
  ],
  groups: [{ name: 'cabeza', kind: 'stack', gap: mm(5), frames: ['titulo', 'entradilla'] },
    { name: 'galerias', modules: true, gap: mm(7), placement: { ...at('#entradilla', 'below', 0, 7),
      size: { width: mm(W), height: 'fill' } } }],
};
// #endregion

const text = (size, lead, more) => ({ fontFamily: SANS, fontSize: pt(size), lineHeight: pt(lead),
  color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: pt(0),
  textAlign: 'left', hyphenation: false, ...more });
const pad = (v, h) => ({ top: mm(v), right: mm(h), bottom: mm(v), left: mm(h) });
const calloutStyles = [
  { id: 'alcaldia', backgroundEnabled: true, background: col('mayor'), border: { enabled: false },
    borderRadius: mm(2), padding: pad(3, 4),
    body: text(10.5, 14, { color: col('paper'), boldColor: col('paper') }) },
  { id: 'area', backgroundEnabled: true, background: col('green'), border: { enabled: false },
    borderRadius: mm(2), padding: pad(2.2, 3.5),
    body: text(9.5, 12.5, { color: col('paper'), boldColor: col('paper') }) },
  { id: 'servicio', backgroundEnabled: true, background: col('tint'), borderRadius: mm(1.5),
    border: { enabled: true, color: col('rule'), width: pt(0.5) }, padding: pad(2, 2.8),
    body: text(8.4, 11, { boldColor: col('green') }) },
  { id: 'marco', backgroundEnabled: false, border: { enabled: false }, padding: pad(0, 0) },
  { id: 'ficha', backgroundEnabled: false, border: { enabled: false }, // room under the words
    padding: { ...pad(0, 0), bottom: mm(4) },
    body: text(8.2, 11, { boldColor: col('green') }) },
  { id: 'aviso', backgroundEnabled: true, background: col('tint'), borderRadius: mm(2.5),
    border: { enabled: true, color: col('green'), width: pt(1.2) }, padding: pad(3.5, 5),
    label: { position: 'top-left', joined: true, inset: mm(0), offset: mm(0), height: mm(7),
      paddingX: mm(4), fontFamily: SANS, fontSize: pt(9), fontWeight: 700, color: col('green'),
      rule: { enabled: false } }, // joined: the tab takes the box's fill and outline
    body: text(9.5, 13.5, { boldColor: col('green') }) },
  { id: 'colofon', backgroundEnabled: false, border: { enabled: false }, padding: pad(0, 0),
    body: text(6.8, 9, { color: col('muted') }) },
];

// Running heads: the guide's name on the outer side at the head, the folio at the foot.
const outer = (parity, v, y) => at('page', `${v}-${parity === 'even' ? 'left' : 'right'}`,
  parity === 'even' ? PAGE.outer : -PAGE.outer, y);
const head = (parity) => ({ kind: 'text', id: `head-${parity}`, content: '{title}', parity,
  fontFamily: SANS, fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted'), align: parity === 'even' ? 'left' : 'right',
  placement: outer(parity, 'top', 12) });
const folio = (parity) => ({ kind: 'text', id: `folio-${parity}`, content: '{pageNumber}',
  parity, fontFamily: SANS, fontSize: pt(9), fontWeight: 700, color: col('green'),
  align: parity === 'even' ? 'left' : 'right', placement: outer(parity, 'bottom', -11) });

const config = {
  canvasViewer: { pageGap: 0 }, // the two pages are shown as a spread
  locale: t({ es: 'es', en: 'en-gb' }),
  resourceTypes: [{ id: 'foto', name: t({ es: 'Foto', en: 'Photo' }), shortLabel: '',
    numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '',
    defaultPlacement: { position: 'here' } }],
  colorPalette, calloutStyles,
  page: { sizePreset: 'custom', width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150,
    margins: { top: mm(PAGE.top), bottom: mm(PAGE.bottom), left: mm(PAGE.inner),
      right: mm(PAGE.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: text(10.5, 15, { fontFamily: SERIF, paragraphSpacing: true }),
  headings: { fontFamily: SERIF, fontWeight: 700, color: col('ink'), levels: [
    { level: 1, fontSize: pt(28), lineHeight: pt(32), marginTop: pt(0), marginBottom: pt(0),
      breakBefore: { enabled: false } },
    { level: 2, fontFamily: SANS, fontSize: pt(9), lineHeight: pt(11), fontWeight: 700,
      letterSpacing: pt(1.4), textTransform: 'uppercase', color: col('green'),
      marginTop: pt(0), marginBottom: pt(0) }] },
  header: { elements: [head('even'), head('odd')] },
  footer: { elements: [folio('even'), folio('odd')] },
  pageTemplates: [chart, area, places, gallery, notice],
};
// The guide opens on a verso, so its two pages face each other.
const continuation = { pageIndexOffset: 1 };

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: six watercolours of the town's buildings, at the size they print
const ART = {
  biblioteca: t({ es: 'La sala de lectura de la biblioteca, con estanterías de madera y vecinos '
      + 'de todas las edades leyendo en mesas largas.',
    en: 'The library reading room, with wooden shelves and neighbours of every age reading at '
      + 'long tables.' }),
  musica: t({ es: 'Un aula de la escuela de música: niños con violines, una profesora y una niña '
      + 'al piano.',
    en: 'A room of the music school: children with violins, a teacher and a girl at the piano.' }),
  'centro-mayores': t({ es: 'El centro de día: mayores jugando a las cartas y pintando junto a '
      + 'una puerta al jardín.',
    en: 'The day centre: older people playing cards and painting beside a door to the garden.' }),
  piscina: t({ es: 'La piscina cubierta bajo un techo de madera, con nadadores en las calles y un '
      + 'socorrista.',
    en: 'The covered pool under a timber roof, with swimmers in the lanes and a lifeguard.' }),
  polideportivo: t({ es: 'La pista del polideportivo, con niños jugando al baloncesto y gradas a '
      + 'un lado.',
    en: 'The sports hall court, with children playing basketball and stands along one side.' }),
  mercado: t({ es: 'El mercado de los sábados en los soportales de la plaza, con el ayuntamiento '
      + 'al fondo.',
    en: 'The Saturday market under the arcades of the square, with the town hall behind.' }),
};
const resources = await Promise.all(Object.entries(ART).map(async ([id, altText]) => {
  const fileId = `${id}-900.jpg`;
  await loadImage(fileId, asset(fileId));
  return { id, typeId: 'foto', kind: 'bitmap', caption: '', altText, createdAt: 0, updatedAt: 0,
    bitmap: { fileId, format: 'jpeg', width: 900, height: 600, resolution: 400 } };
}));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Public Sans': ['400', '600', '700'], 'Source Serif 4': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
const doc = await withLoadedFonts(
  () => buildDocument({ markdown, resources, continuation }, config),
  { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ es: 'Organigrama y rejilla de fotos con módulos',
  en: 'An org chart and a photo grid built from modules' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images
