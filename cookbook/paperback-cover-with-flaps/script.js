// ═══ Postext Cookbook · Nº 196 · A paperback cover with flaps, spine from the pages ═══
// https://postext.dev/en/cookbook/paperback-cover-with-flaps
// Code: MIT · Text: Bécquer, tr. C. F. & K. L. Bates (public domain) · Art: diffusion models
// Fonts: Crimson Pro, Cormorant Garamond, Josefin Sans (SIL OFL 1.1) · Needs postext ≥ 1.93.0
//
// Two of Bécquer's legends as a 120 × 190 mm paperback with 60 mm flaps. Postext lays the
// pages out first; buildCover then makes the cover sheet from them, its spine as thick as
// the pages on their paper.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
} from 'https://esm.sh/postext';
import { buildCover } from 'https://esm.sh/postext/production';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'paperback-cover-with-flaps';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#25221e', accent: '#86472a', muted: '#6b645a', paper: '#fbf7ee',
  night: '#16242a', gold: '#c99b4e', bone: '#eee5d1' }; // the last three: the cover's
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];

// #region answer: the paperback: a printer's binding with 60 mm flaps, its ISBN, its paper
// The book's own binding profile: PUR perfect binding in 16-page signatures, flaps of
// 60 mm whatever the trim. The spine is written nowhere: buildCover works it out from the
// laid-out pages, rounded up to whole signatures, on the paper of `folio.paper`.
const production = {
  bindings: [{ id: 'pur-flaps', name: 'PUR perfect binding, 60 mm flaps', style: 'perfect',
    signature: 16, measures: { flapWidth: 60, bleed: 3, spineAllowance: 0.5 } }],
  versions: [{ id: 'paperback', name: t({ en: 'Paperback', es: 'Rústica' }), binding: 'pur-flaps',
    flaps: true, isbn: '978-84-0000-196-4', isbnAddOn: '90000' }],
};
// 100 g/m² bulky cream wove at a bulk of 2.4: each leaf is 100 × 2.4 = 240 µm thick.
const folio = { paper: { type: 'bookWove', grammage: 100, bulk: 2.4, shade: '#f7f1e3' } };
// The design: a night ground over the whole sheet and the painting on the front, into the
// bleed at head and foot and up to the flap's fold. The texts come from the cover Markdown,
// the title, subtitle and author from the book's metadata.
const cover = {
  background: col('night'),
  elements: [{ id: 'art', kind: 'image', zone: 'front', x: 0, y: -3, width: 118, height: 196,
    resourceId: 'moncayo', fit: 'cover' }],
  verticalAlign: { back: 'middle' },
};
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
const resources = [{ id: 'moncayo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'moncayo.jpg', format: 'jpeg', width: 1100, height: 1771 },
  altText: t({ en: 'A ruined chapel with a lit window on a rocky hill at night, a snowy '
    + 'ridge behind it and a rider in a red cloak on the path below.',
  es: 'Una capilla en ruinas con una ventana encendida en un cerro de noche, una sierra '
    + 'nevada detrás y un jinete de capa roja en el camino.' }) }];
await loadImage('moncayo.jpg', asset('moncayo-1100.jpg'));

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Crimson Pro': ['400', '400i', '600'], 'Cormorant Garamond': ['500', '600', '600i'],
  'Josefin Sans': ['600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const book = await buildDocumentWithFonts({ markdown: [markdown, part2, part3]
  .join('\n\n'), resources }, config, kitFonts(FONTS));

// #region sheet: the cover sheet, built from the pages just laid out
const built = buildCover({ config, version: 'paperback', pages: book.pages, markdown: coverText,
  metadata: book.metadata, resources });
if (!('config' in built)) throw new Error(built.issues.map((i) => i.kind).join(', '));
// The barcode is the cover's own picture. Its digits name OCR-B, which no font server
// has: they are set in the label face, which the PDF embeds like the rest.
for (const [id, bytes] of Object.entries(built.files)) {
  await loadSvg(id, new TextDecoder().decode(bytes)
    .replace(/font-family="[^"]*"/g, 'font-family="Josefin Sans"'));
}
const sheet = await buildDocumentWithFonts(built.content, built.config, kitFonts(FONTS));
// #endregion

showPages(book, { title: t({ en: 'The Spirits’ Mountain · paperback with flaps',
  es: 'El monte de las ánimas · rústica con solapas' }) });
// The sheet above the pages, with the measures buildCover worked out.
const { spine, width, height } = built.sheet;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display: block; width: min(1200px, 94vw); margin: 32px auto 8px';
canvas.title = `${book.pages.length} pp. · spine ${spine.toFixed(1)} mm · sheet `
  + `${width.toFixed(1)} × ${height.toFixed(1)} mm`;
document.getElementById('pages').before(canvas, canvas.title);
renderPageToCanvas(sheet.pages[0], sheet, canvas, { scale: 2400 / sheet.pages[0].width });

// One file for the printer: the pages, then the sheet at its own size.
offerPdf(() => renderToPdf([book, sheet], { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
