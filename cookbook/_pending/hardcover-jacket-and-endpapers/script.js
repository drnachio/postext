// ═══ Postext Cookbook · Nº 197 · A hardcover's case, dust jacket and endpapers ═══
// https://postext.dev/en/cookbook/hardcover-jacket-and-endpapers
// Code: MIT · Text: Bécquer, tr. C. F. & K. L. Bates (public domain) · Art: diffusion models
// Fonts: Crimson Pro, Cormorant Garamond, Josefin Sans (SIL OFL 1.1) · Needs postext ≥ 1.92.0
//
// The pages of Nº 196 bound two ways: the paperback with flaps, and a cloth hardcover in a
// dust jacket with painted endpapers. Each version has its binding and its ISBN; buildCover
// makes each sheet of the hardcover from the same laid-out pages.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
} from 'https://esm.sh/postext';
import { buildCover } from 'https://esm.sh/postext/production';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'hardcover-jacket-and-endpapers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The last four colours are the covers': the jacket's night, gold and bone, the case's cloth.
const palette = { ink: '#25221e', accent: '#86472a', muted: '#6b645a', paper: '#fbf7ee',
  night: '#16242a', gold: '#c99b4e', bone: '#eee5d1', cloth: '#22362f' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];

// #region answer: two versions over the same pages, each with its binding and its ISBN
// The paperback is Nº 196's, on the printer's own profile. The hardcover takes the built-in
// flat-spine case; `flaps` on a case means a dust jacket, and `caseMaterial: 'cloth'` a case
// covered in cloth and stamped, under the jacket. Spines, boards and turn-ins come from the
// laid-out pages on the paper of `folio.paper`.
const production = {
  bindings: [{ id: 'pur-flaps', name: 'PUR perfect binding, 60 mm flaps', style: 'perfect',
    signature: 16, measures: { flapWidth: 60, bleed: 3, spineAllowance: 0.5 } }],
  versions: [
    { id: 'paperback', name: t({ en: 'Paperback', es: 'Rústica' }), binding: 'pur-flaps',
      flaps: true, isbn: '978-84-0000-196-4', isbnAddOn: '90000' },
    { id: 'hardcover', name: t({ en: 'Hardcover', es: 'Cartoné' }), binding: 'case-flat',
      flaps: true, caseMaterial: 'cloth', isbn: '978-84-0000-197-1', isbnAddOn: '90000' },
  ],
};
// 100 g/m² bulky cream wove at a bulk of 2.4: each leaf is 100 × 2.4 = 240 µm thick.
const folio = { paper: { type: 'bookWove', grammage: 100, bulk: 2.4, shade: '#f7f1e3' } };
// The design every printed cover shares (the paperback's, the jacket): a night ground and
// the painting on the front panel, into the bleed, whatever the panel's width.
const cover = { background: col('night'), verticalAlign: { back: 'middle' },
  image: { resourceId: 'moncayo', area: 'front', focus: { x: 0.5, y: 0.4 } } };
// #endregion

// #region cover-type: the paragraph styles the cover's text is set in
const style = (id, fontFamily, size, lead, color, extra) => ({ id, fontFamily, fontSize: pt(size),
  lineHeight: pt(lead), color, italicColor: color, firstLineIndent: mm(0), textAlign: 'left',
  hyphenation: false, ...extra });
const caps = (tracking) => ({ fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: pt(tracking) });
const coverStyles = [
  style('cover-title', 'Cormorant Garamond', 40, 40, col('bone'), { fontWeight: 600,
    textAlign: 'center', marginTop: mm(12) }),
  style('cover-subtitle', 'Cormorant Garamond', 15, 19, col('bone'), { italic: true,
    textAlign: 'center' }),
  style('cover-author', 'Josefin Sans', 8.5, 11, col('gold'), { ...caps(1.8),
    textAlign: 'center', marginTop: pt(16) }),
  style('cover-spine', 'Josefin Sans', 7.5, 9, col('bone'), { ...caps(1.2), textAlign: 'center' }),
  style('cover-blurb', 'Crimson Pro', 10.5, 14.5, col('bone'), { marginBottom: pt(7) }),
  style('cover-note', 'Crimson Pro', 10.5, 14.5, col('gold'), { italic: true }),
  style('flap-head', 'Josefin Sans', 7.5, 10, col('gold'), caps(1.4)),
  style('flap-text', 'Crimson Pro', 9.6, 13.2, col('bone'), { marginTop: pt(5) }),
];
// #endregion

// #region pages: the book block, a small literary paperback
const [W, H, TOP, FOOT, INNER, OUTER, LEAD] = [120, 190, 20, 22, 18, 15.5, 15.2]; // mm, pt
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const text = (id, content, look, place) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', placement: place, ...look });
const face = (fontFamily, size, color, extra) => ({ fontFamily, fontSize: pt(size), color,
  ...extra });
const label = (size, color = col('muted')) => face('Josefin Sans', size, color, caps(size / 5));
const none = { header: { elements: [] }, footer: { elements: [] }, numbered: false, toc: false };
const design = (minHeight, elements) => ({ enabled: true, minHeight: mm(minHeight),
  slot: { elements } });
const page = (parity) => ({ breakBefore: { enabled: true, parity } });
const rule = (id, y, to = 'page') => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(0.6), color: col('accent'), placement: at(to, 'top', 0, y, { width: mm(10) }) });
const folioAt = (y, pages) => ({ elements: [text('f', '{pageNumber}',
  { ...face('Crimson Pro', 9, col('ink')), pages }, at('page', 'bottom', 0, y))] });
const serif = (size, extra) => face('Cormorant Garamond', size, col('ink'), extra);
const headingStyles = [
  { ...none, id: 'half-title', advancedDesign: design(60, [
    text('t', '{title}', serif(17, { fontWeight: 500 }), at('page', 'top', 0, 62))]) },
  { ...none, ...page('odd'), id: 'title-page', advancedDesign: design(H - TOP - FOOT, [
    text('t', '{title}', serif(27, { fontWeight: 600 }), at('page', 'top', 0, 46)),
    text('s', '{subtitle}', serif(13, { italic: true }), at('page', 'top', 0, 58)),
    rule('r', 67),
    text('a', '{author}', label(8, col('accent')), at('page', 'top', 0, 72)),
    text('tr', '{attr.translators}', face('Crimson Pro', 9.5, col('muted'), { italic: true }),
      at('page', 'top', 0, 118, { width: mm(70) })),
    text('i', '{attr.imprint}', label(7), at('page', 'bottom', 0, -26)),
  ]) },
  // The rights at the foot of the verso, under a short rule.
  { ...none, ...page('even'), id: 'rights',
    advancedDesign: design(92, [rule('r', 86, 'container')]) },
  { ...none, ...page('odd'), id: 'contents', advancedDesign: design(34, [
    text('t', '{titleText}', label(8, col('accent')), at('container', 'top', 0, 14)),
    rule('r', 21, 'container')]) },
  // Each legend has a title leaf of its own (the contents point to it), then opens on the
  // next recto, sunk 40 mm.
  { ...none, ...page('odd'), id: 'tale-title', toc: true, advancedDesign: design(90, [
    text('k', '{attr.kicker}', serif(15, { fontWeight: 600, color: col('accent') }),
      at('page', 'top', 0, 58)),
    text('t', '{titleText}', serif(23, { fontWeight: 500 }), at('page', 'top', 0, 67)),
    text('p', '{attr.place}', face('Crimson Pro', 10.5, col('muted'), { italic: true }),
      at('page', 'top', 0, 79)),
    rule('r', 88)]) },
  { ...page('odd'), id: 'tale', toc: false, advancedDesign: design(40, [
    text('t', '{titleText}', serif(15, { fontWeight: 500, italic: true }),
      at('container', 'top', 0, 16)),
    rule('r', 25, 'container')]) },
  { ...none, ...page('any'), id: 'colophon', advancedDesign: design(70, [
    rule('r', 60, 'container')]) },
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
  bodyText: { fontFamily: 'Crimson Pro', fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify',
    firstLineIndent: mm(4), indentAfterHeading: false, hyphenation: { enabled: true },
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: 'Cormorant Garamond', color: col('ink'), textAlign: 'center', levels: [
    { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), fontWeight: 600, color: col('accent'),
      marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) }] },
  headingStyles,
  paragraphStyles: [
    style('rights', 'Crimson Pro', 8, 11, col('muted'), { marginBottom: pt(5) }),
    style('colophon', 'Crimson Pro', 9.5, 13, col('muted'), { italic: true, textAlign: 'center' }),
    ...coverStyles,
  ],
  toc: { levels: [{ level: 1, fontFamily: 'Crimson Pro', fontSize: pt(11), color: col('ink'),
    marginBottom: pt(LEAD / 2) }], pageNumber: { fontFamily: 'Crimson Pro', fontSize: pt(11),
    color: col('ink'), width: mm(8) }, leader: { char: ' ', gap: mm(2) } },
  header: { elements: [head('v', '{author}', 'even'), head('r', '{chapterTitle}', 'odd')] },
  footer: folioAt(-12, 'body'),
  production, cover, folio,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The book runs on through three files (each within the Cookbook's 2,500 words), cut
// between paragraphs. The cover's text is a fifth: a frame per panel.
const markdown = /* @content */ '';
const part2 = /* @content:part-2 */ '';
const part3 = /* @content:part-3 */ '';
const coverText = /* @content:cover */ '';
const picture = (id, w, h, alt) => ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w, height: h },
  altText: t(alt) });
const resources = [
  picture('moncayo', 1100, 1771, { en: 'A ruined chapel with a lit window '
    + 'on a rocky hill at night, a snowy ridge behind it and a rider in a red cloak below.',
  es: 'Una capilla en ruinas con una ventana encendida en un cerro de noche, una sierra '
    + 'nevada detrás y un jinete de capa roja en el camino.' }),
  picture('soria', 1300, 1036, { en: 'Soria on its slope above the Duero at '
    + 'dusk, the stone bridge on the left, a hill with a ruined chapel on the right.',
  es: 'Soria en su ladera sobre el Duero al anochecer, el puente de piedra a la izquierda y un '
    + 'cerro con una capilla en ruinas a la derecha.' }),
  picture('fuente', 1300, 1036, { en: 'A still green pool among rocks and '
    + 'poplars under the moon, a waterfall on the left and a snowy summit behind.',
  es: 'Una poza verde y quieta entre rocas y álamos bajo la luna, una cascada a la izquierda y '
    + 'una cumbre nevada al fondo.' }),
];
await loadImage('moncayo.jpg', asset('moncayo-1100.jpg'));
await loadImage('soria.jpg', asset('soria-1300.jpg'));
await loadImage('fuente.jpg', asset('fuente-1300.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Crimson Pro': ['400', '400i', '600'], 'Cormorant Garamond': ['500', '600', '600i'],
  'Josefin Sans': ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const book = await buildDocumentWithFonts({ markdown: [markdown, part2, part3]
  .join('\n\n'), resources }, config, kitFonts(FONTS));

// #region sheets: the hardcover's four sheets, built from the pages just laid out
// One call per sheet. The jacket takes the book's design and cover text; the cloth case
// gets a ground of its cloth, the title and author stamped in gold, and no barcode (the
// jacket carries it); each endpaper gets its painting across both its leaves.
const hardcover = production.versions[1];
const gold = config.paragraphStyles.map((s) => (s.id.startsWith('cover-')
  ? { ...s, color: col('gold'), italicColor: col('gold') } : s));
const looks = {
  cover: { cover: { background: col('cloth') }, paragraphStyles: gold },
  endpaperFront: { cover: { image: { resourceId: 'soria' } } },
  endpaperBack: { cover: { image: { resourceId: 'fuente' } } },
};
const built = {};
for (const sheet of ['cover', 'jacket', 'endpaperFront', 'endpaperBack']) {
  const made = buildCover({ config: { ...config, ...looks[sheet] }, sheet, pages: book.pages,
    version: sheet === 'cover' ? { ...hardcover, isbn: undefined } : 'hardcover',
    markdown: sheet === 'cover' ? '' : coverText, metadata: book.metadata, resources });
  if (!('config' in made)) throw new Error(made.issues.map((i) => i.kind).join(', '));
  // The barcode's digits name OCR-B, which no font server has: set in the label face.
  for (const [id, bytes] of Object.entries(made.files)) {
    await loadSvg(id, new TextDecoder().decode(bytes)
      .replace(/font-family="[^"]*"/g, 'font-family="Josefin Sans"'));
  }
  built[sheet] = made;
}
const sheetDoc = (b) => buildDocumentWithFonts(b.content, b.config, kitFonts(FONTS));
const caseDoc = await sheetDoc(built.cover);
const jacketDoc = await sheetDoc(built.jacket);
// #endregion

// #region endpapers: the two endpapers in one document
// Both endpapers are the size of two pages: one document holds them, a page each, the
// back's template renamed so the two templates do not share an id.
const [ef, eb] = [built.endpaperFront, built.endpaperBack];
const back = { ...eb.config.pageTemplates.at(-1), id: 'endpaper-back' };
const endpapers = await buildDocumentWithFonts({ ...ef.content, markdown: `${ef.content.markdown}`
  + `\n\n${eb.content.markdown.replace('postext-cover', back.id)}` },
{ ...ef.config, pageTemplates: [...ef.config.pageTemplates, back] }, kitFonts(FONTS));
// #endregion

showPages(book, { title: t({ en: 'The Spirits’ Mountain · hardcover in a dust jacket',
  es: 'El monte de las ánimas · cartoné con sobrecubierta' }) });
// The sheets above the pages, each with the measures buildCover worked out.
const show = (doc, page, b, name) => {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display: block; width: min(1200px, 94vw); margin: 32px auto 8px';
  const { width, height } = b.sheet;
  const caption = `${name} · ${width.toFixed(1)} × ${height.toFixed(1)} mm`;
  document.getElementById('pages').before(canvas, caption);
  renderPageToCanvas(doc.pages[page], doc, canvas, { scale: 2400 / doc.pages[page].width });
};
show(caseDoc, 0, built.cover, t({ en: `Cloth case · ${book.pages.length} pp., spine `
  + `${built.cover.sheet.spine.toFixed(1)} mm`, es: `Tapa de tela · ${book.pages.length} pp., `
  + `lomo de ${built.cover.sheet.spine.toFixed(1)} mm` }));
show(jacketDoc, 0, built.jacket, t({ en: 'Dust jacket', es: 'Sobrecubierta' }));
show(endpapers, 0, ef, t({ en: 'Front endpaper', es: 'Guarda delantera' }));
show(endpapers, 1, eb, t({ en: 'Back endpaper', es: 'Guarda trasera' }));

// One file for the binder: the pages, then each sheet at its own size.
offerPdf(() => renderToPdf([book, caseDoc, jacketDoc, endpapers], {
  fontProvider: fontsourceProvider, resourceBytes: imageBytes }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
