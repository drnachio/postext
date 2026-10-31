// ═══ Postext Cookbook · Nº 178 · One design for three language editions ═══════════
// https://postext.dev/en/cookbook/shared-design-per-language
// Code: MIT · Text: original (CC BY 4.0) · Photographs: The Met, Open Access (CC0)
// Fonts: Source Serif 4, Source Sans 3, Amiri, IBM Plex Sans Arabic (OFL) · Needs postext ≥ 1.65.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage, mergeConfigLayers,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the edition: 'en' | 'es' | 'ar'
const RECIPE = 'shared-design-per-language';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: night ink, the brass of the instruments, a parchment tint
const palette = {
  ink: '#1f2230', // text: a blue near-black
  brass: '#80561c', // the one accent: kickers, rules, the box stripe (6.2:1 on paper)
  tint: '#f4eee2', // the box ground
  rule: '#cfc5b2', // hairlines
  muted: '#6a655c', // running heads, credits
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'brass (defaults)', value: { hex: palette.brass, model: 'hex' } },
];
// #endregion
const [TEXT, LABEL] = ['Source Serif 4', 'Source Sans 3'];
const PAGE = { w: 148, h: 210 }; // mm: an A5 booklet
const LEAD = 14; // pt

// #region cover: the photograph to the trim, the title on its dark head
const at = (edge, x, y, width) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) }, ...(width ? { size: { width: mm(width) } } : {}) });
const caps = { fontFamily: LABEL, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: pt(1.6) };
// Every side is named by the direction of the text: 'top-start' is the left of an English
// page and the right of an Arabic one, so the cover needs no override to turn round.
const cover = { id: 'cover',
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: 'rasulid', decorative: true, fit: 'cover',
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: mm(PAGE.w), height: mm(PAGE.h) } } },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontSize: pt(8.5), align: 'start',
      color: col('paper'), ...caps, placement: at('top-start', 17, 18) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.5), color: col('tint'),
      placement: { anchor: { to: '#kicker', edge: 'below' }, offset: { x: mm(0), y: mm(3) },
        size: { width: mm(16) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: TEXT, fontWeight: 600,
      fontSize: pt(46), lineHeight: 1.02, color: col('paper'), align: 'start',
      placement: at('top-start', 16, 29, PAGE.w - 32) },
    { kind: 'text', id: 'facts', content: '{attr.facts}', fontSize: pt(8), align: 'start',
      color: col('ink'), ...caps, placement: at('bottom-start', 17, -14) },
  ] } } };
// #endregion

// #region heads: title on the verso, subtitle on the recto, folios on the outer edge
// An even page's outer edge is its start side in either direction (the left of an English
// verso, the right of an Arabic one), an odd page's its end side.
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 600,
  letterSpacing: pt(1.1), textTransform: 'uppercase', color: col('muted'),
  align: edge.endsWith('start') ? 'start' : 'end',
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } }, ...extra });
const folio = { fontWeight: 700, color: col('brass') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-start', 16, folio),
  head('verso-title', '{title}', 'even', 'top-start', 24),
  head('recto-title', '{subtitle}', 'odd', 'top-end', -24),
  head('recto-folio', '{pageNumber}', 'odd', 'top-end', -16, folio),
] };
// #endregion

// The general settings: every edition reads them. Only the language is each edition's own.
const config = {
  locale: t({ en: 'en-gb', es: 'es', ar: 'ar' }), // ar: right to left, bound on the right
  colorPalette,
  page: { sizePreset: 'custom', width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150,
    margins: { top: mm(21), bottom: mm(20), left: mm(18), right: mm(16), mirror: true } },
  bodyText: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: TEXT, color: col('ink'), fontWeight: 600, levels: [
    { level: 1, span: 'page', breakBefore: { parity: 'any' } }, // the cover, to the trim
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD * 1.25), color: col('brass'),
      marginTop: pt(LEAD), marginBottom: pt(LEAD * 0.25) },
  ] },
  headingStyles: [cover],
  layout: { layoutType: 'single', wrap: { gap: mm(5) } },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.4), lineHeight: pt(10),
    color: col('muted'), textAlign: 'start', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  // 'start': the stripe stands where the lines start, left in English, right in Arabic.
  calloutStyles: [{ id: 'note', background: col('tint'),
    stripe: { enabled: true, side: 'start', width: pt(3), color: col('brass') },
    padding: { top: mm(3), right: mm(4), bottom: mm(3.2), left: mm(4) },
    titleStyle: { fontFamily: LABEL, fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1.1),
      textTransform: 'uppercase', color: col('brass') },
    body: { fontSize: pt(9.4), lineHeight: pt(13), firstLineIndent: pt(0) },
    marginTop: pt(LEAD * 0.5), marginBottom: pt(LEAD * 0.5) }],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: LABEL,
    headerFontSize: pt(7.8), bodyFontFamily: LABEL, bodyFontSize: pt(8.4), bodyColor: col('ink'),
    cellPadding: mm(1.4) },
  captionStyle: { fontFamily: LABEL, fontSize: pt(7.8), color: col('ink'), labelBold: true,
    labelColor: col('brass'), gap: mm(1.8), note: { color: col('muted'), fontSize: pt(6.8) } },
  header,
  footer: { elements: [] },
};

// #region answer: what each language sets otherwise; the rest comes from the general settings
const ARABIC_LABEL = { fontFamily: 'IBM Plex Sans Arabic', letterSpacing: pt(0),
  textTransform: 'none' }; // Arabic letters join: never tracked, and they have no capitals
// English and Spanish need nothing more than their locale: it picks the hyphenation patterns
// and the words of the figure and table labels. Arabic sets the faces of its script.
const overrides = {
  ar: {
    bodyText: { fontFamily: 'Amiri', fontSize: pt(12), lineHeight: pt(19),
      firstLineIndent: em(1.5) },
    headings: { fontFamily: 'Amiri', fontWeight: 700,
      levels: [{ level: 2, fontSize: pt(15), lineHeight: pt(24) }] },
    // Lists keyed by id merge entry by entry: only these fields of these elements change.
    headingStyles: [{ id: 'cover', advancedDesign: { slot: { elements: [
      { id: 'kicker', ...ARABIC_LABEL, fontSize: pt(10) },
      { id: 'title', fontFamily: 'Amiri', fontWeight: 700, fontSize: pt(50), lineHeight: 1.25 },
      { id: 'facts', ...ARABIC_LABEL, fontSize: pt(9.5) },
    ] } } }],
    header: { elements: ['verso-folio', 'verso-title', 'recto-title', 'recto-folio']
      .map((id) => ({ id, ...ARABIC_LABEL, fontSize: pt(9) })) },
    calloutStyles: [{ id: 'note', titleStyle: { ...ARABIC_LABEL, fontSize: pt(10) },
      body: { fontSize: pt(11.5), lineHeight: pt(19) } }],
    tableStyle: { headerFontFamily: 'IBM Plex Sans Arabic', headerFontSize: pt(9),
      bodyFontFamily: 'IBM Plex Sans Arabic', bodyFontSize: pt(9.4) },
    captionStyle: { fontFamily: 'IBM Plex Sans Arabic', fontSize: pt(9) },
    paragraphStyles: [{ id: 'colophon', fontFamily: 'IBM Plex Sans Arabic', fontSize: pt(8.4),
      lineHeight: pt(13) }],
  },
};
const edition = mergeConfigLayers(config, overrides[LANG]); // config itself for en and es
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region pictures: three photographs, the figures wrapped at the end side of the text
const photo = (id, file, w, h, extra = {}) => ({ id, typeId: 'figure', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, ...extra,
  bitmap: { fileId: file, format: 'jpeg', width: w, height: h } });
// 'end' is the right of an English column and the left of an Arabic one.
const wrapped = { position: 'here', wrap: 'end', width: 0.38 };
const note = (n) => `The Met, ${n}, CC0`;
const resources = [
  photo('rasulid', 'rasulid-cover-1400.jpg', 1400, 1985),
  photo('mashhad', 'mashhad-800.jpg', 800, 1187, { placement: wrapped, note: note('63.166a–j'),
    caption: t({ en: 'Planispheric astrolabe, Iran, 1654–55. Brass and steel.',
      es: 'Astrolabio planisférico, Irán, 1654-1655. Latón y acero.',
      ar: 'أسطرلاب مسطّح، إيران، ١٠٦٥\u00a0هـ / ١٦٥٤–١٦٥٥\u00a0م. نحاس أصفر وفولاذ.' }),
    altText: t({ en: 'A brass astrolabe whose rete is a lattice of leaves and scrolls',
      es: 'Un astrolabio de latón cuya red es un enrejado de hojas y volutas',
      ar: 'أسطرلاب من النحاس الأصفر عنكبوته شبكة من الأوراق والأغصان الملتفّة' }) }),
  photo('regiomontanus', 'regiomontanus-800.jpg', 800, 1083,
    { placement: wrapped,
    note: note('2025.347a–j'),
    caption: t({ en: 'Astrolabe attributed to Regiomontanus, 1462. Copper alloy.',
      es: 'Astrolabio atribuido a Regiomontano, 1462. Aleación de cobre.',
      ar: 'أسطرلاب يُنسب إلى ريجيومونتانوس، ١٤٦٢\u00a0م. سبيكة نحاسية.' }),
    altText: t({ en: 'A round brass astrolabe with Latin star names on its rete',
      es: 'Un astrolabio redondo de latón con nombres latinos de estrellas en la red',
      ar: 'أسطرلاب مستدير من النحاس عليه أسماء نجوم لاتينية' }) }),
];
// #endregion

// #region table: the three instruments, in the edition's words and digits
const row = (...cells) => cells.map((content) => ({ content }));
const head2 = (...cells) => cells.map((content) => ({ content, isHeader: true }));
resources.push({ id: 'three', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' },
  caption: t({ en: 'The three instruments.', es: 'Los tres instrumentos.',
    ar: 'الأدوات الثلاث.' }),
  table: { model: { headerRowCount: 1, columnWidths: [1.15, 1.1, 1.2, 1.1], rows: t({
    en: [head2('Made', 'Where', 'Maker', 'Size'),
      row('1291', 'Yemen', 'ʿUmar ibn Yūsuf', '15.6 cm wide'),
      row('1654–55', 'Iran, Mashhad?', 'Muhammad Zaman', '21.6 cm high'),
      row('1462', 'Germany or Italy', 'Regiomontanus', '13.5 cm high')],
    es: [head2('Fecha', 'Lugar', 'Autor', 'Tamaño'),
      row('1291', 'Yemen', 'ʿUmar ibn Yūsuf', '15,6 cm de ancho'),
      row('1654-1655', 'Irán, ¿Mashhad?', 'Muhammad Zaman', '21,6 cm de alto'),
      row('1462', 'Alemania o Italia', 'Regiomontano', '13,5 cm de alto')],
    ar: [head2('التاريخ', 'المكان', 'الصانع', 'المقاس'),
      row('٦٩٠\u00a0هـ / ١٢٩١\u00a0م', 'اليمن', 'عمر بن يوسف', 'عرضه ١٥٫٦\u00a0سم'),
      row('١٠٦٥\u00a0هـ / ١٦٥٤\u00a0م', 'إيران، مشهد؟', 'محمد زمان', 'ارتفاعه ٢١٫٦\u00a0سم'),
      row('١٤٦٢\u00a0م', 'ألمانيا أو إيطاليا', 'ريجيومونتانوس', 'ارتفاعه ١٣٫٥\u00a0سم')] }) } } });
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// The faces of all three editions; the Arabic ones set only the Arabic edition.
const FONTS = {
  'Source Serif 4': ['400', '400i', '600'],
  'Source Sans 3': ['400', '600', '700'],
  Amiri: ['400', '700'],
  'IBM Plex Sans Arabic': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadArabicFonts(FONTS, markdown); // gotcha: arabic-fonts-subset
await loadImage('rasulid-cover-1400.jpg', asset('rasulid-cover-1400.jpg'));
await loadImage('mashhad-800.jpg', asset('mashhad-800.jpg'));
await loadImage('regiomontanus-800.jpg', asset('regiomontanus-800.jpg'));
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources }, edition),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Three Astrolabes, English edition',
  es: 'Tres astrolabios, edición en español', ar: 'ثلاثة أسطرلابات، الطبعة العربية' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images arabic book
