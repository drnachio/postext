// ═══ Postext Cookbook · Nº 199 · A cover in foil, spot varnish and emboss ═══════════════
// https://postext.dev/en/cookbook/cover-foil-varnish-emboss
// Code: MIT · Text: Manrique, tr. H. W. Longfellow (public domain) · Art: diffusion models
// Fonts: Alegreya, Alegreya SC, Alegreya Sans SC (SIL OFL 1.1) · Needs postext ≥ 1.92.0
//
// Manrique's Coplas as a slim paperback whose cover goes to the finisher after the press: a
// spot gloss over the painting, a gold-foil cartouche stamped over an emboss of the same
// shape, and a blind emboss on the back. Each finish is a shape of the cover's design; the
// varnish and the foil get spot plates of their own, the emboss a plate that prints nothing.
import { buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
  preflightDocument } from 'https://esm.sh/postext';
import { buildCover } from 'https://esm.sh/postext/production';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'cover-foil-varnish-emboss';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The pages' four colours, then the cover's: a bottle-green ground and its darker panel.
const palette = { ink: '#262320', accent: '#8a3b2a', muted: '#6d655b', paper: '#fbf7ef',
  ground: '#1d2b27', panel: '#15201d', cream: '#efe5cf', ochre: '#c8a15a' };
// The two inks the finisher is asked for: spot colours that each make a plate of their own.
const spot = (hex, name, cmyk, kind) => ({ hex, model: 'spot',
  spot: { name, cmyk, finish: { kind, sheen: 'gloss' } } });
const inks = { foil: spot('#b8963e', 'Gold foil', { c: 0, m: 20, y: 60, k: 25 }, 'foil'),
  varnish: spot('#eef0e6', 'Gloss varnish', { c: 0, m: 0, y: 0, k: 0 }, 'varnish') };
const col = (id) => (inks[id] ? { ...inks[id], paletteId: id }
  : { hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  ...Object.entries(inks).map(([id, value]) => ({ id, name: value.spot.name, value })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];

// #region art: the cartouche, a frame with hollow corners, drawn as a shape of the design
// Fractions of its box, so the frame stretches with it. Two rings, each an outer contour and
// an inner one run the other way round: the hole between them stays empty, and the foil and
// the emboss take exactly this outline.
const [CW, CH] = [97, 46]; // the cartouche's box, mm
const K = 0.5523; // a quarter circle as a cubic
function contour(inset, notch) {
  const [tx, ty, rx, ry] = [inset / CW, inset / CH, (notch + inset) / CW, (notch + inset) / CH];
  // Each corner: the point on the edge before it and on the edge after it, a hollow arc
  // between them whose handles leave each edge square.
  const corners = [
    [[1 - rx, ty], [1 - tx, ry], 'h'], [[1 - tx, 1 - ry], [1 - rx, 1 - ty], 'v'],
    [[rx, 1 - ty], [tx, 1 - ry], 'h'], [[tx, ry], [rx, ty], 'v']];
  return corners.flatMap(([[ax, ay], [bx, by], edge]) => [
    { x: ax, y: ay, out: edge === 'h' ? { x: ax, y: ay + K * (by - ay) }
      : { x: ax + K * (bx - ax), y: ay } },
    { x: bx, y: by, in: edge === 'h' ? { x: bx - K * (bx - ax), y: by }
      : { x: bx, y: by - K * (by - ay) } }]);
}
const reversed = (nodes) => nodes.slice().reverse()
  .map(({ x, y, in: i, out: o }) => ({ x, y, ...(o && { in: o }), ...(i && { out: i }) }));
const ring = (outer, inner, notch) => [{ closed: true, nodes: contour(outer, notch) },
  { closed: true, nodes: reversed(contour(inner, notch)) }];
const cartouche = [...ring(0, 1.3, 6), ...ring(2.3, 2.75, 6)];
// The emblem on the back: a lozenge with a lozenge cut out of it, as a saved outline.
const lozenge = (d) => [[0.5, d], [1 - d, 0.5], [0.5, 1 - d], [d, 0.5]].map(([x, y]) => ({ x, y }));
const emblem = [lozenge(0), lozenge(0.24).reverse()];
// #endregion

// #region answer: three finishes, each over a shape of the cover's design
// A slim paperback: PUR perfect binding, the spine from the pages on 120 g/m² wove. The
// spine is under the 6 mm a spine is lettered from by default, so this version letters it
// from 4.5 mm.
const production = {
  bindings: [{ id: 'pur', name: 'PUR perfect binding', style: 'perfect', signature: 16,
    measures: { bleed: 3, spineAllowance: 0.5 } }],
  versions: [{ id: 'paperback', name: t({ en: 'Paperback', es: 'Rústica' }), binding: 'pur',
    isbn: '978-84-0000-199-5', spineText: { minSpine: 4.5 } }],
};
const folio = { paper: { type: 'bookWove', grammage: 120, bulk: 2.2, shade: '#f7f1e3' } };
const cover = {
  background: col('ground'),
  elements: [
    { id: 'art', kind: 'image', zone: 'front', x: 0, y: -3, width: 128, height: 206,
      resourceId: 'river', fit: 'cover' },
    // The title's panel, a shade darker than the ground, and the frame round it. The frame
    // prints nothing in four colours (it has the panel's colour): the foil plate carries it.
    { id: 'panel', kind: 'shape', zone: 'front', x: 14, y: 77, width: CW, height: CH,
      color: col('panel'), path: [{ closed: true, nodes: contour(0, 6) }] },
    { id: 'cartouche', kind: 'shape', zone: 'front', x: 14, y: 77, width: CW, height: CH,
      color: col('panel'), path: cartouche },
  ],
  finishes: [
    // A spot gloss over the painting above and below the panel, 4 mm clear of it, so the
    // varnish never lies on the foil. The back and the spine stay matt.
    ...[[-3, 76], [127, 76]].map(([y, height], i) => ({ id: `gloss-${i + 1}`, process: 'varnish',
      ink: col('varnish'), shape: { box: { zone: 'front', x: 0, y, width: 128, height } } })),
    // Gold foil on the frame, and the whole panel embossed: the title prints on a raised
    // field, the foil stamped round its edge.
    { id: 'gold', process: 'foil', ink: col('foil'), shape: { element: 'cartouche' } },
    { id: 'relief', process: 'emboss', shape: { element: 'panel' } },
    // A blind emboss: no ink and no foil, only the paper raised.
    { id: 'emblem', process: 'emboss', shape: { outline: emblem,
      box: { zone: 'back', x: 52.5, y: 30, width: 20, height: 20 } } },
  ],
  verticalAlign: { front: 'middle', back: 'middle' },
};
// The press file: PDF/X-4. The varnish and the foil are spot inks with a finish, each on
// its plate; the emboss goes on a plate named Emboss, beside the die line.
const print = { standard: 'pdfx4', outputProfile: 'fogra51', convertImages: false };
// #endregion

// #region cover-type: the paragraph styles the cover's text is set in
const style = (id, fontFamily, size, lead, color, extra) => ({ id, fontFamily, fontSize: pt(size),
  lineHeight: pt(lead), color, italicColor: color, firstLineIndent: mm(0), textAlign: 'left',
  hyphenation: false, ...extra });
const caps = (tracking) => ({ fontWeight: 700, letterSpacing: pt(tracking) });
const mid = { textAlign: 'center' };
const coverStyles = [
  style('cover-title', 'Alegreya SC', 40, 40, col('cream'), { ...mid, fontWeight: 500 }),
  style('cover-subtitle', 'Alegreya', 13, 17, col('cream'), { ...mid, italic: true }),
  style('cover-author', 'Alegreya Sans SC', 9, 12, col('ochre'), { ...mid, ...caps(1.6),
    marginTop: pt(9) }),
  style('cover-spine', 'Alegreya Sans SC', 7, 8, col('cream'), { ...mid, ...caps(1.1) }),
  style('cover-quote', 'Alegreya', 13, 17, col('ochre'), { ...mid, italic: true,
    marginBottom: pt(16) }),
  style('cover-blurb', 'Alegreya', 10.5, 14.5, col('cream'), { marginBottom: pt(7) }),
  style('cover-note', 'Alegreya Sans SC', 8, 11, col('ochre'), { ...caps(1.2),
    marginTop: pt(4) }),
];
// #endregion

// #region pages: the book block, a chapbook of verse
const [W, H, TOP, FOOT, INNER, OUTER, LEAD] = [125, 200, 22, 24, 19, 17, 15]; // mm, pt
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const text = (id, content, look, place) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', placement: place, ...look });
const face = (fontFamily, size, color, x) => ({ fontFamily, fontSize: pt(size), color, ...x });
const label = (size, color = col('muted')) => face('Alegreya Sans SC', size, color, caps(size / 6));
const sc = (size, extra) => face('Alegreya SC', size, col('ink'), { fontWeight: 500, ...extra });
const none = { header: { elements: [] }, footer: { elements: [] }, numbered: false, toc: false };
const design = (minHeight, elements) => ({ enabled: true, minHeight: mm(minHeight),
  slot: { elements } });
const page = (parity) => ({ breakBefore: { enabled: true, parity } });
const rule = (id, y, to = 'page') => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(0.6), color: col('accent'), placement: at(to, 'top', 0, y, { width: mm(12) }) });
const headingStyles = [
  { ...none, id: 'half-title', advancedDesign: design(60, [
    text('t', '{title}', sc(18), at('page', 'top', 0, 64))]) },
  { ...none, ...page('odd'), id: 'title-page', advancedDesign: design(H - TOP - FOOT, [
    text('t', '{title}', sc(34), at('page', 'top', 0, 50)),
    text('s', '{subtitle}', face('Alegreya', 13, col('ink'), { italic: true }),
      at('page', 'top', 0, 66)),
    rule('r', 76),
    text('a', '{author}', label(8.5, col('accent')), at('page', 'top', 0, 81)),
    text('c', '{attr.credit}', face('Alegreya', 9.5, col('muted'), { italic: true }),
      at('page', 'top', 0, 120, { width: mm(76) })),
    text('i', '{attr.imprint}', label(7.5), at('page', 'bottom', 0, -28)),
  ]) },
  { ...none, ...page('even'), id: 'rights',
    advancedDesign: design(92, [rule('r', 86, 'container')]) },
  // The poem opens on a recto, sunk 46 mm, its title in small capitals over a short rule.
  { ...page('odd'), id: 'poem', toc: false, header: { elements: [] }, advancedDesign: design(46, [
    text('t', '{titleText}', sc(19), at('container', 'top', 0, 18)),
    text('n', '{attr.note}', face('Alegreya', 10.5, col('muted'), { italic: true }),
      at('container', 'top', 0, 28, { width: mm(80) })),
    rule('r', 38, 'container')]) },
  { ...none, ...page('odd'), id: 'colophon', advancedDesign: design(64, [
    rule('r', 56, 'container')]) },
];
const head = (id, content, parity) => text(id, content, { ...label(6.8), parity, pages: 'body' },
  at('page', 'top', 0, 11));
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(W), height: mm(H), dpi: 300,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Alegreya', fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false, avoidWidows: true,
    hyphenation: { enabled: true }, optimalLineBreaking: true, avoidOrphans: true },
  headings: { fontFamily: 'Alegreya SC', color: col('ink'), textAlign: 'center' },
  headingStyles,
  paragraphStyles: [
    style('verse', 'Alegreya', 11, LEAD, col('ink')),
    style('rights', 'Alegreya', 8, 11, col('muted'), { marginBottom: pt(5) }),
    style('colophon', 'Alegreya', 9.5, 13, col('muted'), { ...mid, italic: true }),
    ...coverStyles,
  ],
  header: { elements: [head('v', '{author}', 'even'), head('r', '{title}', 'odd')] },
  footer: { elements: [text('f', '{pageNumber}', { ...face('Alegreya', 9, col('ink')),
    pages: 'body' }, at('page', 'bottom', 0, -13))] },
  print, production, cover, folio,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The poem runs on through two files (each within the Cookbook's 2,500 words), cut between
// stanzas. The cover's text is a third: the back cover's frame.
const markdown = /* @content */ '';
const part2 = /* @content:part-2 */ '';
const coverText = /* @content:cover */ '';
const resources = [{ id: 'river', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'river.jpg', format: 'jpeg', width: 1100, height: 1740 },
  altText: t({ en: 'A ruined castle on a crag against a sunset sky, the sea shining far off, '
    + 'and below a broad river with poplars, a stone bridge and a boat moored in the reeds.',
  es: 'Un castillo en ruinas sobre un peñasco al ocaso, el mar que brilla a lo lejos y, abajo, '
    + 'un río ancho con chopos, un puente de piedra y una barca entre los juncos.' }) }];
await loadImage('river.jpg', asset('river-1100.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Alegreya: ['400', '400i'], 'Alegreya SC': ['500'], 'Alegreya Sans SC': ['700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const book = await buildDocumentWithFonts({ markdown: `${markdown}\n\n${part2}`, resources },
  config, kitFonts(FONTS));

// #region sheet: the cover sheet, built from the pages just laid out
const built = buildCover({ config, version: 'paperback', pages: book.pages, markdown: coverText,
  metadata: book.metadata, resources });
if (!('config' in built)) throw new Error(built.issues.map((i) => i.kind).join(', '));
// The barcode's digits name OCR-B, which no font server has: the label face sets them.
for (const [id, bytes] of Object.entries(built.files)) {
  await loadSvg(id, new TextDecoder().decode(bytes)
    .replace(/font-family="[^"]*"/g, 'font-family="Alegreya Sans SC"'));
}
const sheet = await buildDocumentWithFonts(built.content, built.config, kitFonts(FONTS));
// #endregion

showPages(book, { title: t({ en: 'Coplas · a paperback with foil, varnish and emboss',
  es: 'Coplas · una rústica con oro, barniz y gofrado' }) });

// #region views: the sheet as it prints, then what each plate covers
// 'flat' paints the inks: the foil in its colour, the varnish and the emboss not at all.
// 'map' marks the special plates in false colour over a faded sheet, 'sheen' rakes a light
// across it. The emboss plate is drawn from the page's technical plates, the outlines the
// PDF fills on its Emboss separation.
const leaf = sheet.pages[0];
const scale = 1100 / leaf.width;
const outline = (ctx, paths) => {
  ctx.beginPath();
  for (const c of paths.flat()) {
    if (c.op === 'M') ctx.moveTo(c.x, c.y);
    else if (c.op === 'L') ctx.lineTo(c.x, c.y);
    else if (c.op === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.op === 'Q') ctx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
    else ctx.closePath();
  }
  ctx.fill('nonzero');
};
const VIEWS = [
  ['flat', t({ en: 'As it prints', es: 'Como se imprime' })],
  ['map', t({ en: 'The varnish and foil plates', es: 'Las planchas de barniz y oro' })],
  ['sheen', t({ en: 'Under a raking light', es: 'Con luz rasante' })],
  ['emboss', t({ en: 'The Emboss plate', es: 'La plancha de gofrado' })],
];
const views = document.createElement('section');
views.id = 'finish-views';
views.style.cssText = 'display: grid; grid-template-columns: repeat(2, minmax(0, 560px)); '
  + 'gap: 18px; justify-content: center; padding: 24px max(16px, calc(50% - 520px)); color: #ddd; '
  + 'font: 14px sans-serif';
for (const [mode, name] of VIEWS) {
  const [figure, canvas, caption] = ['figure', 'canvas', 'figcaption']
    .map((tag) => document.createElement(tag));
  figure.style.margin = '0';
  canvas.style.cssText = 'display: block; width: 100%';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${t({ en: 'The cover sheet', es: 'El pliego' })}: ${name}`);
  renderPageToCanvas(leaf, sheet, canvas, { scale, finishes: mode === 'emboss' ? 'flat' : mode });
  if (mode === 'emboss') {
    // The die-maker's film: the plate in black on white, the sheet faded under it.
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#111';
    outline(ctx, (leaf.plates ?? []).flatMap((p) => p.paths));
  }
  caption.textContent = name;
  figure.append(canvas, caption);
  views.append(figure);
}
// What the preflight reads from the sheet: its spot plates and the reliefs it checks.
const spots = preflightDocument(sheet).find((i) => i.kind === 'spotInks');
const list = document.createElement('p');
list.style.cssText = 'grid-column: 1 / -1; margin: 0; text-align: center';
list.textContent = `${t({ en: 'Plates beside CMYK', es: 'Planchas además de CMYK' })}: `
  + [...(spots?.inks ?? []), ...new Set((leaf.plates ?? [])
    .map((p) => `${p.process[0].toUpperCase()}${p.process.slice(1)}`))].join(' · ');
views.append(list);
document.getElementById('pages').before(views);
// #endregion

// One file for the printer: the pages, then the sheet at its own size, with its plates.
offerPdf(() => renderToPdf([book, sheet], { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes, profileBaseUrl: 'https://postext.dev/icc/' }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
