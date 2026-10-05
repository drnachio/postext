// ═══ Postext Cookbook · Nº 108 · A two-column Arabic newspaper page ══════════════════
// https://postext.dev/en/cookbook/arabic-newspaper-two-columns
// Code: MIT · Text: original Arabic news copy (CC BY 4.0) · Map: drawn in code
// Fonts: Aref Ruqaa, Noto Kufi Arabic, Noto Naskh Arabic (SIL OFL 1.1) · Needs postext ≥ 1.15.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the paper is Arabic in both editions
const RECIPE = 'arabic-newspaper-two-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, a cold ink and the sea blue of the paper's name
const palette = {
  ink: '#121416', // text and the heavy rules
  sea: '#0f5f7a', // the accent: the nameplate, section flags, kickers, the tram line
  sand: '#e9e2d2', // the In brief strip and the map's land
  rule: '#9b988f', // hairlines: the column rule, the folio line
  muted: '#5b5852', // bylines, captions' credits, the imprint
  paper: '#f8f5ee', // newsprint, and type reversed out of the flags
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ink })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [NAME, HEAD, TEXT] = ['Aref Ruqaa', 'Noto Kufi Arabic', 'Noto Naskh Arabic'];
const TRIM = { width: 246, height: 328 }; // mm: a 3 : 4 compact
const SIDE = 12; // mm: newspaper margins, narrow and not mirrored
const LEAD = 16; // pt: the body leading, 1.5 × an 10.7 pt Naskh
const kufi = (size, weight, colour = 'ink') => ({ fontFamily: HEAD, fontSize: pt(size),
  fontWeight: weight, color: col(colour) });
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  ...look, placement });

// #region answer: two columns, the first one on the right
// locale 'ar' mirrors the page: the body's first column is the right one, the story runs down
// it and on at the top of the left one, and the column rule sits between them as before.
const layout = { layoutType: 'double', gutterWidth: mm(6),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.5) } };
// A headline over both columns is a page-span box without a frame: the columns under it start
// level, right then left, and a box with placement="bottom" closes the page the same way.
const banner = { id: 'banner', backgroundEnabled: false, span: 'page',
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { ...kufi(9, 700, 'sea'), gap: mm(1.2) }, // the kicker, from the fence's title
  marginTop: pt(0), marginBottom: pt(LEAD / 2),
  body: { fontFamily: TEXT, fontSize: pt(13), lineHeight: pt(21), textAlign: 'right' } };
// #endregion

// #region nameplate: the paper's name in Ruqʿa between two ears
const ear = (id, side, lines) => lines.map(([key, content, look], i) => text(`${id}-${key}`,
  content, { ...look, align: side }, { ...(i === 0 ? at('container', `top-${side}`, 0, 4)
    : at(`#${id}-${lines[i - 1][0]}`, 'below', 0, 1)), size: { width: mm(48) } }));
const nameplate = { enabled: true, minHeight: mm(46), slot: { elements: [
  text('name', '{titleText}', { fontFamily: NAME, fontSize: pt(84), fontWeight: 700,
    lineHeight: 1.1, color: col('sea'), align: 'center' },
  { ...at('container', 'top', 0, -3), size: { width: 'fill' } }),
  // In the mirrored page, 'right' is the start of the line: issue and date there, price opposite.
  ...ear('start', 'right', [['k', '{attr.issue}', kufi(8, 700, 'sea')],
    ['d', '{publishDate}', kufi(9, 400)]]),
  ...ear('end', 'left', [['k', '{attr.city}', kufi(8, 700, 'sea')],
    ['p', '{attr.price}', kufi(9, 400)]]),
  { kind: 'rule', id: 'thick', thickness: pt(2.5), color: col('ink'),
    placement: { ...at('container', 'top-left', 0, 40), size: { width: 'fill' } } },
  { kind: 'rule', id: 'thin', thickness: pt(0.5), color: col('ink'),
    placement: { ...at('#thick', 'below', 0, 0.8), size: { width: 'fill' } } },
] } };
// #endregion

// #region inside: an inside page opens with a section flag; folio lines on the sheet
const flag = { enabled: true, minHeight: mm(13), slot: { elements: [
  { kind: 'rule', id: 'bar', thickness: pt(3), color: col('ink'),
    placement: { ...at('container', 'top-left', 0, 9), size: { width: 'fill' } } },
  text('flag', '{titleText}', { ...kufi(12, 700, 'paper'), align: 'right',
    box: { backgroundColor: col('sea'), padding: { top: mm(1), right: mm(3), bottom: mm(1.4),
      left: mm(3) } } }, at('#bar', 'above')),
] } };
// The folio line keeps its physical sides: the number at the outer corner of each page.
const folio = (parity, edge, x) => ({ kind: 'text', id: `n-${parity}`, parity,
  content: '{pageNumber}  ·  {title}  ·  {publishDate}', ...kufi(8, 600, 'muted'),
  align: edge, placement: at('page', `top-${edge}`, x, 7) });
const header = { elements: [folio('even', 'right', -SIDE), folio('odd', 'left', SIDE),
  { kind: 'rule', id: 'folio-rule', thickness: pt(0.5), color: col('rule'),
    placement: { ...at('page', 'top-left', SIDE, 11.5),
      size: { width: mm(TRIM.width - 2 * SIDE) } } }] };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ar', // written out, never LANG (gotcha: arabic-locale-tag): rtl, digits ٠–٩
  colorPalette, resourceTypes, layout,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(16), bottom: mm(14), left: mm(SIDE),
      right: mm(SIDE) } },
  bodyText: { fontFamily: TEXT, fontSize: pt(10.7), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(1), indentAfterHeading: false },
  headings: { fontFamily: HEAD, fontWeight: 800, color: col('ink'), marginBottom: pt(0),
    levels: [
      // Restated (gotcha: headings-drop-h1-break); 'any': a section opens the next page.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: flag },
      { level: 2, fontSize: pt(12.5), lineHeight: pt(20), marginTop: pt(LEAD / 2) },
      { level: 3, fontSize: pt(11), lineHeight: pt(LEAD), fontWeight: 700, marginTop: pt(LEAD) },
    ] },
  headingStyles: [
    { id: 'front', advancedDesign: nameplate, header: { elements: [] } }, // no folio line
    { id: 'lead', fontSize: pt(31), lineHeight: pt(48), fontWeight: 900, marginBottom: pt(4) },
    { id: 'wide', fontSize: pt(24), lineHeight: pt(38), marginBottom: pt(2) },
  ],
  calloutStyles: [banner,
    { ...banner, id: 'briefs', background: col('sand'), backgroundEnabled: true,
      padding: { top: mm(3), right: mm(4), bottom: mm(3.5), left: mm(4) }, columnGap: mm(6),
      marginTop: pt(LEAD), titleStyle: { ...kufi(10, 800, 'sea'), gap: mm(2) },
      body: { fontFamily: TEXT, fontSize: pt(9.5), lineHeight: pt(14), textAlign: 'right',
        firstLineIndent: pt(0) } }],
  paragraphStyles: [
    { id: 'byline', ...kufi(8, 400, 'muted'), firstLineIndent: pt(0), textAlign: 'right' },
    { id: 'flush', firstLineIndent: pt(0) },
    { id: 'imprint', fontFamily: TEXT, fontSize: pt(8), lineHeight: pt(12), color: col('muted'),
      firstLineIndent: pt(0), textAlign: 'right', marginTop: pt(LEAD) },
    { id: 'imprint-latin', fontFamily: TEXT, fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), firstLineIndent: pt(0), textAlign: 'left' },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('sea'), headerColor: col('paper'), headerFontFamily: HEAD,
    headerFontSize: pt(9), bodyFontFamily: HEAD, bodyFontSize: pt(11), bodyColor: col('ink'),
    cellPadding: mm(1.4) },
  captionStyle: { fontFamily: TEXT, fontSize: pt(9), color: col('ink'), gap: mm(1.5),
    note: { fontSize: pt(7.5), color: col('muted') } },
  header, footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Arabic paper in both

// #region art: the tram route on a stretch of coast, stations as rings
function routeSvg() { // 222 × 44 mm, 1 unit = 1 mm
  const [W, H] = [222, 44];
  const coast = 'M0 36C30 33 52 40 80 35S128 24 152 28S196 37 222 31V44H0Z';
  // Eighteen stations along a line that leaves the port (east, on the right) for the university.
  const line = 'M210 22C186 17 170 13 150 16S112 25 92 20S56 9 34 12S14 19 10 17';
  const stops = Array.from({ length: 18 }, (_, i) => i / 17);
  const pointAt = (t) => { // the line as three cubic pieces, sampled per piece
    const seg = [[210, 22, 186, 17, 170, 13, 150, 16], [150, 16, 130, 19, 112, 25, 92, 20],
      [92, 20, 72, 15, 56, 9, 34, 12], [34, 12, 22, 14, 14, 19, 10, 17]];
    const k = Math.min(3, Math.floor(t * 4));
    const u = t * 4 - k;
    const [x0, y0, x1, y1, x2, y2, x3, y3] = seg[k];
    const b = (a, c, d, e) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * c + 3 * (1 - u) * u * u * d
      + u ** 3 * e;
    return [b(x0, x1, x2, x3), b(y0, y1, y2, y3)];
  };
  const rings = stops.map((t, i) => {
    const [x, y] = pointAt(t);
    const big = i === 0 || i === 17 || i === 8;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 2.6 : 1.6}" `
      + `fill="${palette.paper}" stroke="${palette.ink}" stroke-width="${big ? 1 : 0.7}"/>`;
  }).join('');
  let grid = '';
  for (let x = 6; x < W; x += 12) grid += `M${x} 0V${H}`;
  for (let y = 6; y < H; y += 12) grid += `M0 ${y}H${W}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${palette.sand}"/>`
    + `<path d="${grid}" stroke="${palette.paper}" stroke-width="0.6"/>`
    + `<path d="${coast}" fill="${palette.sea}" fill-opacity="0.25"/>`
    + `<path d="${line}" fill="none" stroke="${palette.sea}" stroke-width="2.4"/>${rings}</svg>`;
}
// #endregion
// Newspapers do not number their pictures: a type with no caption label and no counter.
const unnumbered = (id, name, captionStyle) => ({ id, name, shortLabel: name, captionPrefix: '',
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionStyle });
const resourceTypes = [unnumbered('picture', 'صورة'),
  unnumbered('panel', 'جدول', { position: 'above', fontSize: pt(10) })]; // tables titled above
// The prayer times, a table set right to left like the page: its first column is on the right.
const cell = (content, extra = {}) => ({ content, ...extra });
const PRAYERS = [['الفجر', '٥:٤١'], ['الشروق', '٧:٠٦'], ['الظهر', '١٢:٥٢'], ['العصر', '٤:١٧'],
  ['المغرب', '٦:٣٨'], ['العشاء', '٧:٥٤']];
const prayerTable = { headerRowCount: 1, rows: [
  PRAYERS.map(([name]) => cell(name, { isHeader: true, align: 'center' })),
  PRAYERS.map(([, time]) => cell(time, { align: 'center' }))] };
const resources = [{ id: 'prayer', typeId: 'panel', kind: 'table', createdAt: 0, updatedAt: 0,
  table: { model: prayerTable }, placement: { position: 'bottom', span: 'page' },
  caption: '**مواقيت الصلاة** في رأس المرجان، الخميس ١ أكتوبر' },
{ id: 'route', typeId: 'picture', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'route.svg', width: 2220, height: 440 }, placement: { position: 'here' },
  caption: '**مسار الخط الأول:** ثماني عشرة محطة بين الميناء شرقًا والجامعة غربًا.',
  note: 'رسم: الساحل',
  altText: t({ en: 'Map: a blue tram line along a stretch of coast, from the port on the right '
    + 'to the university on the left, with eighteen stations marked as rings.',
  es: 'Mapa: una línea de tranvía azul a lo largo de la costa, del puerto a la derecha a la '
    + 'universidad a la izquierda, con dieciocho estaciones marcadas con anillos.' }) }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Aref Ruqaa': ['700'], // NAME: the nameplate
  'Noto Kufi Arabic': ['400', '600', '700', '800', '900'], // HEAD: headlines, flags, labels
  'Noto Naskh Arabic': ['400', '700'], // TEXT: the stories, captions; bold emphasis
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
// Each Arabic face's letters live in a file of their own (gotcha: arabic-fonts-subset).
await loadArabicFonts(FONTS, markdown + JSON.stringify(resources));
await loadSvg('route.svg', routeSvg());
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A two-column Arabic newspaper page',
  es: 'Una página de periódico árabe a dos columnas' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: arabicPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images arabic book · the Cookbook inlines cookbook/_kit/*.js here
