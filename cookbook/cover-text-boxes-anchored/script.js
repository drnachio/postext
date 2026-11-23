// ═══ Postext Cookbook · Nº 200 · Cover text boxes anchored, chained and grown ══════════════
// https://postext.dev/en/cookbook/cover-text-boxes-anchored
// Code: MIT · Text: E. A. Poe, tr. C. Olivera (public domain) · Art: diffusion models
// Fonts: EB Garamond, Cinzel (SIL OFL 1.1) · Needs postext ≥ 1.93.0
//
// Two of Poe's tales as a small paperback, and its cover sheet set from six text boxes.
// None of them has coordinates: each hangs from a panel of the sheet or from another box,
// so a title that runs to two lines takes the subtitle down with it, and the blurb on the
// back runs on under a quotation into a second box.
import { buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts }
  from 'https://esm.sh/postext';
import { buildCover } from 'https://esm.sh/postext/production';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'cover-text-boxes-anchored';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The pages' four colours, then the cover's: a night ground, bone type, a dull gold.
const palette = { ink: '#231f1c', accent: '#8e2219', muted: '#6a625a', paper: '#faf6ee',
  night: '#141117', bone: '#ece3cf', gold: '#c9a66b' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];

// #region answer: six text boxes placed against the panels and against each other
// A box anchored to a zone stands on that point of the zone's safe area; a box anchored to
// another box hangs below it, above it or beside it. With an anchor, `rect` gives only the
// size. The title may grow to 40 mm before its type shrinks, and the blurb sends the lines
// it cannot hold to the box under the quotation.
const size = (width, height) => ({ x: 0, y: 0, width, height });
const textBoxes = [
  // Front: the title from the top of the panel, the subtitle hung under it, the author
  // standing on the foot. Only the title's box grows; the subtitle follows it down.
  { name: 'title', rect: size(100, 14), anchor: { to: 'front', edge: 'top', y: 8 },
    maxHeight: 40 },
  { name: 'subtitle', rect: size(100, 9), anchor: { to: 'title', edge: 'below', y: 2 } },
  { name: 'author', rect: size(100, 8), anchor: { to: 'front', edge: 'bottom', y: -6 } },
  // Back: the blurb, a quotation under it, and the rest of the blurb under the quotation.
  // What the blurb's 50 mm cannot hold goes on in `blurb-end`, cut between lines.
  { name: 'blurb', rect: size(94, 50), anchor: { to: 'back', edge: 'top', y: 6 },
    next: 'blurb-end' },
  { name: 'quote', rect: size(94, 24), anchor: { to: 'blurb', edge: 'below', y: 5 },
    verticalAlign: 'middle' },
  { name: 'blurb-end', rect: size(94, 46), anchor: { to: 'quote', edge: 'below', y: 5 } },
];
const cover = {
  background: col('night'),
  elements: [{ id: 'art', kind: 'image', zone: 'front', x: 0, y: -3, width: 128, height: 201,
    resourceId: 'masque', fit: 'cover' }],
  textBoxes,
};
// #endregion

// #region binding: a slim paperback, its spine worked out from the pages
const production = {
  bindings: [{ id: 'pur', name: 'PUR perfect binding', style: 'perfect', signature: 16,
    measures: { bleed: 3, spineAllowance: 0.5 } }],
  versions: [{ id: 'paperback', name: t({ en: 'Paperback', es: 'Rústica' }), binding: 'pur',
    isbn: '978-84-0000-200-8', spineText: { minSpine: 4.5 } }],
};
const folio = { paper: { type: 'bookWove', grammage: 120, bulk: 2.2, shade: '#f8f3e8' } };
// #endregion

// #region cover-type: the paragraph styles the boxes are set in
const style = (id, fontFamily, size, lead, color, extra) => ({ id, fontFamily, fontSize: pt(size),
  lineHeight: pt(lead), color, italicColor: color, firstLineIndent: mm(0), textAlign: 'left',
  hyphenation: false, ...extra });
const mid = { textAlign: 'center' };
const caps = (tracking) => ({ fontWeight: 600, letterSpacing: pt(tracking) });
const coverStyles = [
  style('cover-title', 'Cinzel', 30, 33, col('bone'), { ...mid, fontWeight: 500 }),
  style('cover-subtitle', 'EB Garamond', 14, 18, col('gold'), { ...mid, italic: true }),
  style('cover-author', 'Cinzel', 10, 13, col('bone'), { ...mid, ...caps(2.2) }),
  style('cover-spine', 'Cinzel', 7, 8, col('bone'), { ...mid, ...caps(1.1) }),
  style('cover-blurb', 'EB Garamond', 10.5, 14.5, col('bone'), { textAlign: 'justify',
    hyphenation: true, firstLineIndent: mm(4) }),
  style('cover-blurb-first', 'EB Garamond', 10.5, 14.5, col('bone'), { textAlign: 'justify',
    hyphenation: true }),
  style('cover-quote', 'EB Garamond', 15, 19, col('gold'), { ...mid, italic: true }),
  style('cover-note', 'Cinzel', 7.5, 11, col('gold'), { ...caps(1.4), marginTop: pt(8) }),
];
// #endregion

// #region pages: the book block, two tales in a small paperback
const [W, H, TOP, FOOT, INNER, OUTER, LEAD] = [125, 195, 21, 23, 18, 16, 14.6]; // mm, pt
const at = (to, edge, x, y, box) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(box && { size: box }) });
const text = (id, content, look, place) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', placement: place, ...look });
const face = (fontFamily, size, color, x) => ({ fontFamily, fontSize: pt(size), color, ...x });
const label = (size, color = col('muted')) => face('Cinzel', size, color, caps(size / 6));
const titling = (size, extra) => face('Cinzel', size, col('ink'), { fontWeight: 500, ...extra });
const none = { header: { elements: [] }, footer: { elements: [] }, numbered: false, toc: false };
const design = (minHeight, elements) => ({ enabled: true, minHeight: mm(minHeight),
  slot: { elements } });
const page = (parity) => ({ breakBefore: { enabled: true, parity } });
const rule = (id, y, to = 'page') => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(0.6), color: col('accent'), placement: at(to, 'top', 0, y, { width: mm(12) }) });
const wide = { width: mm(84) };
const headingStyles = [
  { ...none, id: 'half-title', advancedDesign: design(60, [
    text('t', '{title}', titling(12), at('page', 'top', 0, 62, wide))]) },
  // The title runs to two lines at 22 pt in both editions; the subtitle sits under them.
  { ...none, ...page('odd'), id: 'title-page', advancedDesign: design(H - TOP - FOOT, [
    text('t', '{title}', titling(22, { lineHeight: pt(27) }), at('page', 'top', 0, 44, wide)),
    text('s', '{subtitle}', face('EB Garamond', 13, col('ink'), { italic: true }),
      at('page', 'top', 0, 67)),
    rule('r', 77),
    text('a', '{author}', label(8.5, col('accent')), at('page', 'top', 0, 82)),
    text('c', '{attr.credit}', face('EB Garamond', 10, col('muted'), { italic: true }),
      at('page', 'top', 0, 118, { width: mm(76) })),
    text('i', '{attr.imprint}', label(7.5), at('page', 'bottom', 0, -26)),
  ]) },
  { ...none, ...page('even'), id: 'rights',
    advancedDesign: design(90, [rule('r', 84, 'container')]) },
  // Each tale opens on a recto, sunk 50 mm, its title on one line of Cinzel over a short rule.
  { ...page('odd'), id: 'tale', toc: false, header: { elements: [] }, advancedDesign: design(50, [
    text('t', '{titleText}', titling(13.5, { letterSpacing: pt(0.6) }),
      at('container', 'top', 0, 24, { width: mm(W - INNER - OUTER) })),
    rule('r', 40, 'container')]) },
  { ...none, ...page('odd'), id: 'colophon', advancedDesign: design(70, [
    rule('r', 62, 'container')]) },
];
const head = (id, content, parity) => text(id, content, { ...label(6.6), parity, pages: 'body' },
  at('page', 'top', 0, 11));
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(W), height: mm(H), dpi: 300,
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'EB Garamond', fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false, avoidWidows: true,
    hyphenation: { enabled: true }, optimalLineBreaking: true, avoidOrphans: true },
  headings: { fontFamily: 'Cinzel', color: col('ink'), textAlign: 'center' },
  headingStyles,
  paragraphStyles: [
    style('rights', 'EB Garamond', 8.5, 11.5, col('muted'), { marginBottom: pt(5) }),
    style('colophon', 'EB Garamond', 9.5, 13, col('muted'), { ...mid, italic: true }),
    ...coverStyles,
  ],
  header: { elements: [head('v', '{author}', 'even'), head('r', '{chapterTitle}', 'odd')] },
  footer: { elements: [text('f', '{pageNumber}', { ...face('EB Garamond', 9.5, col('ink')),
    pages: 'body' }, at('page', 'bottom', 0, -13))] },
  production, cover, folio,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The book runs on through two files (each within the Cookbook's 2,500 words), cut between
// paragraphs. The cover's text is a third: a frame per text box.
const markdown = /* @content */ '';
const part2 = /* @content:part-2 */ '';
const coverText = /* @content:cover */ '';
const resources = [{ id: 'masque', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'masque.jpg', format: 'jpeg', width: 1024, height: 1536 },
  altText: t({ en: 'A masked ball under a dark Gothic vault: a file of rooms lit blue, purple, '
    + 'green, orange, white and violet runs to a black room with blood-red windows; an ebony '
    + 'clock stands on the left, and a tall figure in a grave-shroud and a spattered mask '
    + 'stands still among the dancers.',
  es: 'Un baile de máscaras bajo una bóveda gótica en sombra: una hilera de salas iluminadas '
    + 'de azul, púrpura, verde, naranja, blanco y violeta termina en una sala negra de '
    + 'ventanas rojo sangre; a la izquierda, un reloj de ébano, y entre los danzantes, '
    + 'inmóvil, una figura alta con mortaja y una máscara salpicada.' }) }];
await loadImage('masque.jpg', asset('masque-1024.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'EB Garamond': ['400', '400i'], Cinzel: ['500', '600'] };

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
    .replace(/font-family="[^"]*"/g, 'font-family="Cinzel"'));
}
const sheet = await buildDocumentWithFonts(built.content, built.config, kitFonts(FONTS));
// #endregion

showPages(book, { title: t({ en: 'The Masque of the Red Death · a paperback and its cover',
  es: 'La máscara de la muerte · una rústica y su cubierta' }) });

// #region views: the sheet as it prints, then the boxes the layout placed
// Each text box comes back as a frame of the sheet's composed page, with the rect it was
// given after anchoring and growing, and `continuesTo` when its text goes on elsewhere.
const leaf = sheet.pages[0];
const scale = 1100 / leaf.width;
const names = new Set(textBoxes.map((b) => b.name));
const frames = (leaf.composed?.frames ?? []).filter((f) => names.has(f.name));
const views = document.createElement('section');
views.id = 'box-views';
views.style.cssText = 'display: grid; gap: 18px; '
  + 'grid-template-columns: repeat(auto-fit, minmax(300px, 600px)); justify-content: center; '
  + 'padding: 24px 16px; color: #ddd; font: 14px sans-serif';
for (const [mode, name] of [['flat', t({ en: 'As it prints', es: 'Como se imprime' })],
  ['boxes', t({ en: 'The text boxes', es: 'Las cajas de texto' })]]) {
  const [figure, canvas, caption] = ['figure', 'canvas', 'figcaption']
    .map((tag) => document.createElement(tag));
  figure.style.cssText = 'margin: 0; min-width: 0';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${t({ en: 'The cover sheet', es: 'El pliego' })}: ${name}`);
  renderPageToCanvas(leaf, sheet, canvas, { scale });
  if (mode === 'boxes') {
    // Each box outlined and named; a chain drawn from the foot of a box to its next.
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineWidth = 2 / scale;
    ctx.font = `${13 / scale}px sans-serif`;
    for (const f of frames) {
      const { x, y, width, height } = f.rect;
      ctx.strokeStyle = ctx.fillStyle = '#f2c14e';
      ctx.setLineDash([8 / scale, 5 / scale]);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
      // The name on a dark tab over the box's top-left corner, clear of the text.
      const tab = ctx.measureText(f.name).width + 10 / scale;
      ctx.fillStyle = '#141117';
      ctx.fillRect(x, y - 18 / scale, tab, 18 / scale);
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(f.name, x + 5 / scale, y - 5 / scale);
      const next = frames.find((g) => g.id === f.continuesTo);
      if (next) {
        ctx.strokeStyle = '#ff7a59';
        // Out of the box's foot, down its right side, into the top of the next.
        const side = Math.max(x + width, next.rect.x + next.rect.width) + 14 / scale;
        ctx.beginPath();
        ctx.moveTo(x + width - 20 / scale, y + height);
        ctx.lineTo(side, y + height);
        ctx.lineTo(side, next.rect.y);
        ctx.lineTo(next.rect.x + next.rect.width - 20 / scale, next.rect.y);
        ctx.stroke();
      }
    }
  }
  // After the render, which sizes the canvas in CSS pixels: the column sets its width.
  canvas.style.cssText = 'display: block; width: 100%; height: auto';
  caption.textContent = name;
  figure.append(canvas, caption);
  views.append(figure);
}
document.getElementById('pages').before(views);
// #endregion

// One file for the printer: the pages, then the sheet at its own size.
offerPdf(() => renderToPdf([book, sheet], { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
