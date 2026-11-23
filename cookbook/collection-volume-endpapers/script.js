// ═══ Postext Cookbook · Nº 198 · A volume of a collection, its endpapers the series ═══
// https://postext.dev/en/cookbook/collection-volume-endpapers
// Code: MIT · Text: Cervantes, tr. W. K. Kelly (public domain) · Art: diffusion models
// Fonts: Crimson Pro, Cormorant Garamond, Josefin Sans (SIL OFL 1.1) · Needs postext ≥ 1.92.0
//
// Volume XI of the twelve Exemplary Novels, one novella per hardcover: the series livery on
// the case, two ISBNs by the barcode, the twelve titles of the collection on the endpapers.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
} from 'https://esm.sh/postext';
import { buildCover, workIsbnCaption } from 'https://esm.sh/postext/production';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'collection-volume-endpapers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#2a211c', accent: '#7a2a22', muted: '#6c6258', paper: '#fbf7ee',
  case: '#5e1c1a', gold: '#d2ae6a', bone: '#f1e8d4', endpaper: '#ece0c6' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
const VOLUME = 11; // this book's place in the collection
const roman = (n) => 'I II III IV V VI VII VIII IX X XI XII'.split(' ')[n - 1];
const work = (en, es, id) => ({ id, title: t({ en, es }), resource: `cat-${id}` });

// #region answer: the volume and its collection: two ISBNs and the series' catalogue
// The collection is data of the book, beside its versions. The volume's barcode carries its
// own ISBN, and the collection's `isbn` prints as a line above the bars. `catalogue` lists
// the twelve titles with their cover pictures, and `volume` names the one this book is: the
// endpapers set the list and the pictures from it (section 4), this volume marked in both.
const collection = {
  name: t({ en: 'Exemplary Novels', es: 'Novelas ejemplares' }),
  isbn: '978-84-0000-200-8',
  catalogue: [
    work('The Little Gipsy Girl', 'La gitanilla', 'gitanilla'),
    work('The Generous Lover', 'El amante liberal', 'amante'),
    work('Rinconete and Cortadillo', 'Rinconete y Cortadillo', 'rinconete'),
    work('The Spanish-English Lady', 'La española inglesa', 'espanola'),
    work('The Licentiate Vidriera', 'El licenciado Vidriera', 'vidriera'),
    work('The Force of Blood', 'La fuerza de la sangre', 'fuerza'),
    work('The Jealous Estremaduran', 'El celoso extremeño', 'celoso'),
    work('The Illustrious Scullery-Maid', 'La ilustre fregona', 'fregona'),
    work('The Two Damsels', 'Las dos doncellas', 'doncellas'),
    work('The Lady Cornelia', 'La señora Cornelia', 'cornelia'),
    work('The Deceitful Marriage', 'El casamiento engañoso', 'casamiento'),
    work('The Dialogue of the Dogs', 'El coloquio de los perros', 'coloquio'),
  ],
};
collection.volume = collection.catalogue[VOLUME - 1].id;
const production = {
  collection,
  // A printed case with a flat spine: the case sheet and two endpapers, no jacket.
  versions: [{ id: 'hardcover', name: t({ en: 'Hardcover', es: 'Tapa dura' }),
    binding: 'case-flat', isbn: '978-84-0000-198-8', isbnAddOn: '90000' }],
};
// #endregion
const folio = { paper: { type: 'bookWove', grammage: 100, bulk: 2.4, shade: '#f7f1e3' } };

// #region livery: the series design, the same on every volume but for its number
// Every position is in mm from the top-left corner of its zone (the case's front is
// 116 × 191 mm: the 120 × 185 trim, set back 7 mm at the joint, 3 mm square round it).
const box = (id, zone, x, y, width, height, color, extra) => ({ id, kind: 'box', zone, x, y,
  width, height, color: col(color), ...extra });
const picture = (id, zone, x, y, width, height, resourceId, extra) => ({ id, kind: 'image', zone,
  x, y, width, height, resourceId, fit: 'cover', ...extra });
// `basis`: the spine drawn on; a thicker book stretches the bands and keeps the badge centred.
const spine = { basis: { width: 10, height: 191 } };
const livery = [
  box('frame', 'front', 11.2, 59.2, 93.6, 105.6, 'gold'),
  picture('art', 'front', 12, 60, 92, 104, 'cover-art'),
  picture('badge', 'front', 51.5, 169, 13, 13, 'badge', { fit: 'contain' }),
  box('head-band', 'spine', 0, 13, 10, 0.8, 'gold', spine),
  box('foot-band', 'spine', 0, 160, 10, 0.8, 'gold', spine),
  picture('spine-badge', 'spine', 1, 167, 8, 8, 'badge', { fit: 'contain', ...spine }),
  // A paper label for the barcode, whose caption is set in black.
  box('label', 'back', 53, 147, 61, 40, 'bone'),
];
// #endregion

// #region endpapers: a design of their own, half the catalogue on each
// The case takes the livery; each endpaper names a design in `sheets`. At the front the
// pastedown is the left page, at the back the right one: volumes I–VI open the book,
// VII–XII close it, the pictures always on the pastedown, in the case's colour. A catalogue
// element grids the titles' pictures in its box; `stroke` outlines this volume's.
const shelf = (first, last) => ({ id: `shelf-${first}`, kind: 'catalogue', zone: 'pastedown',
  x: 26.5, y: 18, width: 67, height: 149, columns: 2, gap: 7, first, last,
  stroke: { color: col('gold'), width: 0.8 } });
const endpaper = (first, last) => ({ background: col('endpaper'),
  zones: { pastedown: col('case') }, elements: [shelf(first, last)],
  verticalAlign: { flyleaf: 'middle' } });
const cover = {
  background: col('case'),
  elements: livery,
  verticalAlign: { back: 'top' },
  sheets: { endpaperFront: endpaper(1, 6), endpaperBack: endpaper(7, 12) },
};
// #endregion

// #region cover-type: the paragraph styles the case and the endpapers are set in
const style = (id, fontFamily, size, lead, color, extra) => ({ id, fontFamily, fontSize: pt(size),
  lineHeight: pt(lead), color, italicColor: color, boldColor: color, firstLineIndent: mm(0),
  textAlign: 'left', hyphenation: false, ...extra });
const caps = (k) => ({ fontWeight: 600, textTransform: 'uppercase', letterSpacing: pt(k) });
const centre = { textAlign: 'center' };
const coverStyles = [
  style('cover-title', 'Cormorant Garamond', 42, 40, col('bone'), { fontWeight: 600,
    ...centre, marginTop: mm(5) }),
  style('cover-subtitle', 'Josefin Sans', 8, 11, col('gold'), { ...caps(1.8), ...centre,
    marginTop: pt(9) }),
  style('cover-author', 'Cormorant Garamond', 15, 18, col('bone'), { fontWeight: 500, italic: true,
    ...centre, marginTop: pt(3) }),
  style('cover-spine', 'Josefin Sans', 7, 8, col('bone'), { ...caps(1.1), ...centre }),
  style('back-series', 'Josefin Sans', 7.5, 10, col('gold'), { ...caps(1.4),
    marginBottom: pt(9) }),
  style('back-blurb', 'Crimson Pro', 10.5, 14.5, col('bone'), { marginBottom: pt(7) }),
  // The endpapers' lines: the series' name, a note, and the titles `::catalogue` sets in
  // `cover-catalogue`, this volume's in `cover-catalogue-current`.
  style('ad-head', 'Cormorant Garamond', 19, 22, col('accent'), { fontWeight: 600, ...centre }),
  style('ad-note', 'Crimson Pro', 9.5, 13, col('muted'), { italic: true, ...centre,
    marginTop: pt(4), marginBottom: pt(14) }),
  ...['cover-catalogue', 'cover-catalogue-current'].map((id, own) => style(id, 'Crimson Pro',
    11, 17, col(own ? 'accent' : 'ink'), { fontWeight: own ? 600 : 400, ...centre })),
];
// #endregion

const [W, H, TOP, FOOT, INNER, OUTER, LEAD] = [120, 185, 20, 22, 18, 15.5, 15.2]; // mm, pt
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const text = (id, content, look, place) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', placement: place, ...look });
const face = (fontFamily, fontSize, color, extra) => ({ fontFamily, fontSize: pt(fontSize), color,
  ...extra });
const label = (size, color = col('muted')) => face('Josefin Sans', size, color, caps(size / 5));
const serif = (size, extra) => face('Cormorant Garamond', size, col('ink'), extra);
const none = { header: { elements: [] }, footer: { elements: [] }, numbered: false, toc: false };
const design = (h, elements) => ({ enabled: true, minHeight: mm(h), slot: { elements } });
const page = (parity) => ({ breakBefore: { enabled: true, parity } });
const rule = (id, y, to = 'page') => ({ kind: 'rule', id, direction: 'horizontal',
  thickness: pt(0.6), color: col('accent'), placement: at(to, 'top', 0, y, { width: mm(10) }) });
const headingStyles = [
  { ...none, id: 'half-title', advancedDesign: design(60, [
    text('t', '{title}', serif(17, { fontWeight: 500 }), at('page', 'top', 0, 62))]) },
  { ...none, ...page('odd'), id: 'title-page', advancedDesign: design(H - TOP - FOOT, [
    text('s', '{subtitle}', label(7.5, col('accent')), at('page', 'top', 0, 36)),
    text('v', '{attr.volume}', face('Crimson Pro', 10, col('muted'), { italic: true }),
      at('page', 'top', 0, 41)),
    text('t', '{title}', serif(26, { fontWeight: 600 }), at('page', 'top', 0, 56,
      { width: mm(80) })),
    rule('r', 80),
    text('a', '{author}', label(8, col('accent')), at('page', 'top', 0, 85)),
    text('tr', '{attr.translators}', face('Crimson Pro', 9.5, col('muted'), { italic: true }),
      at('page', 'top', 0, 118, { width: mm(70) })),
    text('i', '{attr.imprint}', label(7), at('page', 'bottom', 0, -26)),
  ]) },
  { ...none, ...page('even'), id: 'rights',
    advancedDesign: design(80, [rule('r', 74, 'container')]) },
  // The novella opens on a recto, sunk under its number in the collection.
  { ...page('odd'), id: 'novella', numbered: false, toc: false, advancedDesign: design(62, [
    text('k', '{attr.kicker}', serif(30, { fontWeight: 600, color: col('accent') }),
      at('container', 'top', 0, 14)),
    text('t', '{titleText}', serif(19, { fontWeight: 500, italic: true }),
      at('container', 'top', 0, 33)),
    rule('r', 45, 'container')]) },
  { ...none, ...page('any'), id: 'colophon', advancedDesign: design(40, [
    rule('r', 30, 'container')]) },
];
const head = (id, content, parity) => text(id, content, { ...label(6.8), parity, pages: 'body' },
  at('page', 'top', 0, 11));

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
  headings: { fontFamily: 'Cormorant Garamond', color: col('ink'), textAlign: 'center' },
  headingStyles,
  paragraphStyles: [
    style('rights', 'Crimson Pro', 8, 11, col('muted'), { spaceBetween: pt(5) }),
    style('colophon', 'Crimson Pro', 9.5, 13, col('muted'), { italic: true, ...centre }),
    ...coverStyles,
  ],
  header: { elements: [head('v', '{author}', 'even'), head('r', '{title}', 'odd')] },
  footer: { elements: [text('f', '{pageNumber}', { ...face('Crimson Pro', 9, col('ink')),
    pages: 'body' }, at('page', 'bottom', 0, -12))] },
  production, cover, folio,
  // The line buildCover prints over the barcode is the engine's own wording of the ISBN.
  checks: { contentInConfig: { allow: [workIsbnCaption(collection.isbn, LANG)] } },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The novella runs through three files; the cover's text, case and endpapers, is a fourth.
const markdown = /* @content */ '';
const part2 = /* @content:part-2 */ '';
const part3 = /* @content:part-3 */ '';
const coverText = /* @content:cover */ '';
const resources = [
  { id: 'cover-art', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'cover-art.jpg', format: 'jpeg', width: 1000, height: 1125 }, altText: t({
    en: 'A pale soldier leaning on his sword at a hospital gate; a man in black crosses himself.',
    es: 'Un soldado pálido apoyado en la espada a la puerta del hospital; otro se santigua.' }) },
  ...collection.catalogue.map((e) => ({ id: e.resource, typeId: 'figure', kind: 'bitmap',
    createdAt: 0, updatedAt: 0, altText: e.title,
    bitmap: { fileId: `${e.resource}.jpg`, format: 'jpeg', width: 320, height: 480 } })),
  { id: 'badge', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'badge.svg', width: 49, height: 49 }, altText: roman(VOLUME) },
];
await loadImage('cover-art.jpg', asset('casamiento-1000.jpg'));
const THUMBS = [asset('gitanilla-320.jpg'), asset('amante-320.jpg'), asset('rinconete-320.jpg'),
  asset('espanola-320.jpg'), asset('vidriera-320.jpg'), asset('fuerza-320.jpg'),
  asset('celoso-320.jpg'), asset('fregona-320.jpg'), asset('doncellas-320.jpg'),
  asset('cornelia-320.jpg'), asset('casamiento-320.jpg'), asset('coloquio-320.jpg')];
await Promise.all(collection.catalogue.map((e, i) => loadImage(`${e.resource}.jpg`, THUMBS[i])));
// #region art: the volume's badge, its number in a ring in the series' gold
await loadSvg('badge.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="13mm" height="13mm" '
  + `viewBox="0 0 26 26" fill="none" stroke="${palette.gold}"><circle cx="13" cy="13" r="12.4" `
  + 'stroke-width="0.8"/><circle cx="13" cy="13" r="10.8" stroke-width="0.4"/><text x="13" '
  + `y="17.4" text-anchor="middle" stroke="none" fill="${palette.gold}" `
  + 'font-family="Cormorant Garamond" font-weight="600" font-size="12">'
  + `${roman(VOLUME)}</text></svg>`);
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Crimson Pro': ['400', '400i', '600'], 'Cormorant Garamond': ['500', '600', '500i'],
  'Josefin Sans': ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const book = await buildDocumentWithFonts({ markdown: [markdown, part2, part3].join('\n\n'),
  resources }, config, kitFonts(FONTS));

// #region sheets: the case and both endpapers, from the pages just laid out
const sheet = async (kind) => {
  const built = buildCover({ config, version: 'hardcover', pages: book.pages,
    markdown: coverText, metadata: book.metadata, resources, sheet: kind });
  if (!('config' in built)) throw new Error(built.issues.map((i) => i.kind).join(', '));
  // The barcode's digits name OCR-B, which no font server has: the label face sets them.
  for (const [id, bytes] of Object.entries(built.files)) {
    await loadSvg(id, new TextDecoder().decode(bytes)
      .replace(/font-family="[^"]*"/g, 'font-family="Josefin Sans"'));
  }
  return { built, doc: await buildDocumentWithFonts(built.content, built.config, kitFonts(FONTS)) };
};
const sheets = [await sheet('cover'), await sheet('endpaperFront'), await sheet('endpaperBack')];
// #endregion

showPages([book, ...sheets.map((s) => s.doc)], { title: t({ en: 'Exemplary Novels XI · hardcover',
  es: 'Novelas ejemplares XI · tapa dura' }) });
// What buildCover worked out from the pages, above them.
const { sheets: made, sheet: caseSheet } = sheets[0].built;
document.getElementById('pages').before(`${book.pages.length} pp. · spine `
  + `${made.spine.caseSpine.toFixed(1)} mm · case ${caseSheet.width.toFixed(1)} mm wide`);

// One file for the printer: the pages, then the case and the two endpapers at their sizes.
offerPdf(() => renderToPdf([book, ...sheets.map((s) => s.doc)], { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
