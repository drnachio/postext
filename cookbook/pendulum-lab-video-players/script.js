// ═══ Postext Cookbook · Nº 132 · A lab sheet whose clips play on screen and in the EPUB ════
// https://postext.dev/en/cookbook/pendulum-lab-video-players
// Code: MIT · Text: original (CC BY 4.0) · Clips: rendered in code (CC BY 4.0)
// Fonts: Source Serif 4, Red Hat Display, Red Hat Mono (SIL OFL 1.1) · Needs postext ≥ 1.16.1
import {
  buildDocument, renderPageToCanvas, renderToHtml, applyHtmlViewerOverrides,
  clearMeasurementCache, registerResourceImage, defaultResourceTypes, resourceVideoLink,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { renderToEpub, readEpub } from 'https://esm.sh/postext-epub';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'pendulum-lab-video-players';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { // the clips' own colours: a cream ground, the rust bob, warm black ink
  ink: '#22201b', // text, the play mark, the QR modules, table heads
  rust: '#a8432b', // the accent: the band, labels, list numbers (the bob's red, darker)
  cream: '#f6f1e4', rule: '#cbc2ae', // box fills, a shade deeper than the clips; hairlines
  muted: '#68625a', paper: '#ffffff' }; // muted: running heads, notes, prompts
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.rust }) // defaults: rust
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, MONO] = ['Source Serif 4', 'Red Hat Display', 'Red Hat Mono'];
const [TOP, INNER, OUTER, BAND, LEAD] = [22, 20, 17, 84, 13.2]; // mm, A4; LEAD in pt
const px = (value) => ({ value, unit: 'px' }); // the screen edition's sizes
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x, y }, size });
const label = (size, color = 'rust') => ({ fontFamily: MONO, fontSize: pt(size), fontWeight: 600,
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase', color: col(color) });

// #region answer: two clips of the book's own: a poster and a QR code, or a player
const clip = (id, file, poster, caption, altText) => ({
  id, typeId: 'video', kind: 'video', createdAt: 0, updatedAt: 0, caption: t(caption),
  note: t({ en: '8.00 s, 25 frames per second · Postext Cookbook, CC BY 4.0',
    es: '8,00 s, 25 fotogramas por segundo · Postext Cookbook, CC BY 4.0' }),
  altText: t(altText), placement: { position: 'bottom', span: 'column' },
  video: { source: 'file', fileId: file, format: 'mp4', width: 640, height: 360, duration: 8,
    url: asset(file), // the production address: printed as the QR code, linked from the PDF
    poster: { fileId: poster, format: 'jpeg', width: 640, height: 360 }, // the first frame
  },
});
const videoStyle = {
  playMark: { shape: 'rounded', position: 'top-left', size: mm(7), inset: mm(3),
    background: col('ink'), color: col('paper') },
  qr: { position: 'bottom-right', size: mm(19), inset: mm(2.5), // 111 characters: 45 modules
    color: col('ink'), background: col('paper'), radius: mm(1) },
  // The HTML5 player of a file honours every option. download: false writes
  // controlslist="nodownload": it hides the button, and the file stays at its address.
  player: { download: false, loop: true, muted: true, preload: 'auto',
    pictureInPicture: false, remotePlayback: false },
};
const clips = [
  clip('small', 'pendulum-small.mp4', 'pendulum-small-poster.jpg',
    { en: 'Released from rest at 10°.', es: 'Soltado desde el reposo a 10°.' },
    { en: 'A rust bob on a dark string hangs a few degrees off the vertical, under a short bar.',
      es: 'Una lenteja roja cuelga de un hilo oscuro a pocos grados de la vertical.' }),
  clip('large', 'pendulum-large.mp4', 'pendulum-large-poster.jpg',
    { en: 'Released from rest at 80°.', es: 'Soltado desde el reposo a 80°.' },
    { en: 'The same pendulum pulled out almost level with its pivot, a pale arc below it.',
      es: 'El mismo péndulo, casi a la altura de su eje, sobre un arco pálido.' }),
];
// #endregion

// #region periods: Table 2 is worked out here, not typed: T = T0 / AGM(1, cos ½θ0)
// The arithmetic-geometric mean gives the elliptic integral K of the exact period in a few steps.
const T0 = 2 * Math.PI * Math.sqrt(1 / 9.81); // s: L = 1 m, g = 9.81 m/s²
const agm = (a, b) => (Math.abs(a - b) < 1e-15 ? a : agm((a + b) / 2, Math.sqrt(a * b)));
const period = (degrees) => T0 / agm(1, Math.cos((degrees * Math.PI) / 360));
const num = (x, digits) => x.toFixed(digits).replace('.', t({ en: '.', es: ',' }));
const cell = (content, align = 'right') => ({ content, align, verticalAlign: 'middle' });
const table = (id, caption, head, rows, columnWidths) => ({ id, typeId: 'table', kind: 'table',
  createdAt: 0, updatedAt: 0, caption: t(caption), placement: { position: 'here' },
  table: { model: { headerRowCount: 1, columnWidths, rows: [head.map((h, i) =>
    ({ ...cell(h, i ? 'right' : 'left'), isHeader: true })), ...rows] } } });
const periods = table('periods', { en: 'Exact periods of a pendulum 1.00 m long.',
  es: 'Periodos exactos de un péndulo de 1,00 m.' },
['Amplitude|Amplitud', 'T (s)', 'T/T~0~', 'Longer by|Aumento'].map((h) =>
  t({ en: h.split('|')[0], es: h.split('|').at(-1) })),
[5, 10, 20, 30, 45, 60, 80, 90].map((d) => [cell(`${d}°`, 'left'), cell(num(period(d), 3)),
  cell(num(period(d) / T0, 3)), cell(`${num((period(d) / T0 - 1) * 100, 2)} %`)]),
[1.2, 1, 1, 1.1]);
const blank = cell(' \n '); // two empty lines: room to write
const data = table('data', { en: 'Your measurements.', es: 'Tus medidas.' },
  t({ en: ['Clip', 'Swings in 8 s', 'T (s)'], es: ['Vídeo', 'Oscilaciones en 8 s', 'T (s)'] }),
  [10, 80].map((d, i) => [cell(`${t({ en: 'Video', es: 'Vídeo' })} ${i + 1} · ${d}°`, 'left'),
    blank, blank]), [1.2, 1.5, 0.8]);
// #endregion

// #region opener: a rust band with the sheet's number, its title and the fields to fill in
const words = (id, content, family, size, placement, extra) => ({ kind: 'text', id, content,
  fontFamily: family, fontSize: pt(size), color: col('paper'), align: 'left',
  overflow: 'wrap', placement, ...extra }); // titles wrap (gotcha: overflow-ellipsis-default)
const names = t({ en: ['Name', 'Group', 'Date'], es: ['Nombre', 'Grupo', 'Fecha'] });
const fields = [[0, 86], [90, 30], [124, 49]].flatMap(([x, width], i) => [ // mm, from the margin
  words(`label-${i}`, names[i], MONO, 7, at('page', 'top-left', mm(INNER + x), mm(BAND - 16)),
    label(7, 'paper')),
  { kind: 'box', id: `field-${i}`, style: { backgroundColor: col('paper'), borderRadius: mm(1) },
    placement: at('page', 'top-left', mm(INNER + x), mm(BAND - 12.5),
      { width: mm(width), height: mm(6.5) }) }]);
const opener = { enabled: true, minHeight: mm(BAND - TOP + 6), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('rust') },
    placement: at('bleed', 'top-left', mm(0), mm(0), { width: 'fill', height: mm(BAND) }) },
  words('kicker', '{attr.kicker}', MONO, 8.5, at('page', 'top-left', mm(INNER), mm(14)),
    label(8.5, 'paper')),
  words('title', '{titleText}', DISPLAY, 46, at('#kicker', 'below', mm(0), mm(2.5),
    { width: mm(150) }), { fontWeight: 800, lineHeight: 0.98 }),
  words('lead', '{attr.lead}', TEXT, 10, at('#title', 'below', mm(0), mm(3.5),
    { width: mm(158) }), { lineHeight: 1.4 }),
  ...fields] } }; // a label over a white field for each, to fill in by hand
// #endregion

const head = (id, content, edge, x, extra) => ({ kind: 'text', id, content, parity: 'even',
  pages: 'body', ...label(7, 'muted'), fontWeight: 500, placement: at('page', edge, mm(x),
    mm(12)), ...extra });
const header = { elements: [
  head('folio', '{pageNumber}', 'top-left', OUTER, { color: col('rust'), fontWeight: 700 }),
  head('title', '{title} · {attr.kicker}', 'top-left', OUTER + 7)] };
const footer = { elements: [head('drop-folio', '{title} · {pageNumber}', 'bottom-right', 0, {
  parity: 'all', pages: 'opener', placement: at('page', 'bottom-right', mm(-OUTER), mm(-11)) })] };
const box = (id, extra) => ({ id, background: col('cream'), borderRadius: mm(1.5),
  padding: { top: mm(3), right: mm(3.5), bottom: mm(3), left: mm(3.5) },
  titleStyle: { ...label(7.5), gap: mm(1.2) }, body: { fontSize: pt(9.2), lineHeight: pt(LEAD),
    textAlign: 'left', firstLineIndent: pt(0) }, ...extra });

const config = () => ({ // a factory: the engine caches configs by identity
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  // Figure, Table, Video in the sheet's language, counted 1, 2… (gotcha: resource-types-locale)
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    resetOn: 'never', shortLabel: t({ en: type.name, es: type.name.toLowerCase() }) })),
  colorPalette, videoStyle,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150, margins: {
    top: mm(TOP), bottom: mm(22), left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) }, // columns of 83 mm
  bodyText: { fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('rust'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: DISPLAY, color: col('ink'), fontWeight: 700, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
    { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(LEAD / 2) },
  ] },
  orderedLists: { numberFormat: 'arabic', fontFamily: MONO, fontWeight: 700,
    color: col('rust'), marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [
    box('aim', { stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('rust') } }),
    box('method'), box('sheet'),
    { id: 'answer', background: col('paper'), borderRadius: mm(1), marginTop: mm(1.2),
      marginBottom: mm(2.5), border: { enabled: true, color: col('rule'), width: pt(0.6) },
      padding: { top: mm(1), right: mm(2.5), bottom: mm(1), left: mm(2.5) },
      body: { ...label(6.5, 'muted'), fontWeight: 500, lineHeight: pt(LEAD) } },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: MONO,
    headerFontSize: pt(7.5), bodyFontFamily: MONO, bodyFontSize: pt(8.5),
    bodyColor: col('ink'), cellPadding: mm(1.4) },
  captionStyle: { fontFamily: TEXT, fontSize: pt(8), color: col('ink'), labelBold: true,
    labelColor: col('rust'), gap: mm(2), note: { fontSize: pt(7), color: col('muted') } },
  paragraphStyles: [
    { id: 'formula', fontSize: pt(11), textAlign: 'center', firstLineIndent: pt(0),
      marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
    { id: 'colophon', fontFamily: MONO, fontSize: pt(6.5), lineHeight: pt(9.5),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  header, footer, htmlViewer: { overrides: screen }, // canvas and PDF ignore the overrides
});

// #region screen: the screen edition: one column at the pane's width, the clips as players
const [PANE_W, PANE_H] = [400, 640]; // px
const screen = {
  page: { width: px(PANE_W), height: px(PANE_H), dpi: 122, // so the 9.4 pt text is 16 px
    margins: { top: px(28), bottom: px(28), left: px(22), right: px(22), mirror: false } },
  layout: { layoutType: 'single' }, bodyText: { textAlign: 'left' }, // ragged in a narrow pane
  headings: { levels: [{ level: 1, span: 'column', breakBefore: { enabled: false },
    fontSize: px(28), lineHeight: px(32), fontWeight: 800, marginBottom: px(16),
    advancedDesign: { enabled: false } }] }, // the title alone: the band and fields are print's
  header: { elements: [] }, footer: { elements: [] } };
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const resources = [...clips, data, periods];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Source Serif 4': ['400', '400i', '700', '700i'], 'Red Hat Display': ['700', '800'],
  'Red Hat Mono': ['400', '500', '600', '700'] };

// #region greek: θ and π come from the text face's greek file, which the kit does not load
// Fontsource cuts each face by script, and the PDF keeps its latin file (gotcha: latin-subset).
const GREEK = 'U+0370-03FF'; // Greek and Coptic
const file = (family, subset, [weight, style]) => 'https://cdn.jsdelivr.net/npm/@fontsource/'
  + `${fontsourceId(family)}@5/files/${fontsourceId(family)}-${subset}-${weight}-${style}.woff2`;
const faceOf = (spec) => [parseInt(spec, 10), spec.endsWith('i') ? 'italic' : 'normal'];
const bytesOf = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const greek = FONTS[TEXT].map(faceOf).map(([weight, style]) => ({ family: TEXT, weight, style,
  url: file(TEXT, 'greek', [weight, style]) }));
const loadGreek = () => Promise.all(greek.map(async ({ weight, style, url }) => document.fonts.add(
  await new FontFace(TEXT, `url(${url})`, { weight: `${weight}`, style, unicodeRange: GREEK })
    .load())));
// The PDF takes both files of a text face; it asks for every weight, and Source Serif 4 ships
// 200 to 900 (gotcha: pdf-provider-all-styles). A character comes from the first file with it.
const pdfFont = async (family, weight, style) => {
  const latin = await fontsourceProvider(family, weight, style);
  return family !== TEXT ? latin : [latin, await decompressWoff2(await bytesOf(file(TEXT,
    'greek', [Math.max(weight, 200), style])))];
};
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([loadFonts(FONTS, markdown), loadGreek(),
  ...clips.map(({ video }) => loadImage(video.poster.fileId, asset(video.poster.fileId)))]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'The period of a pendulum', es: 'El periodo de un péndulo' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: pdfFont, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// #region epub: a fixed-layout EPUB that carries both MP4 files and plays them on the page
const media = new Map(await Promise.all(clips.map(async ({ video }) =>
  [video.fileId, { bytes: await bytesOf(asset(video.fileId)), mediaType: 'video/mp4' }])));
const fonts = await Promise.all([ // every face as bytes (gotcha: epub-embeds-given-fonts)
  ...Object.entries(FONTS).flatMap(([family, specs]) => specs.map(faceOf).map(([w, s]) =>
    ({ family, weight: w, style: s, url: file(family, 'latin', [w, s]) }))),
  ...greek.map((face) => ({ ...face, unicodeRange: GREEK })), // after latin: tried first
].map(async ({ url, ...face }) => ({ ...face, format: 'woff2', bytes: await bytesOf(url) })));
const epub = await renderToEpub([doc], { layout: 'fixed', fonts,
  metadata: { title: doc.metadata.title, creators: ['Postext Cookbook'], language: LANG,
    rights: 'CC BY 4.0', modified: new Date('2026-10-05T00:00:00Z') }, // the same bytes each run
  // The clips as video/mp4 and the posters as pictures; the book packs both under media/.
  resourceBytes: (fileId) => media.get(fileId)
    ?? { bytes: imageBytes(fileId), mediaType: 'image/jpeg' },
});
// #endregion

const [read, kb] = [readEpub(epub), (bytes) => `${Math.round(bytes.length / 1024)} KB`];
const list = (lines) => `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
const desk = Object.assign(document.createElement('section'), { id: 'editions', innerHTML: `
<style>#editions{display:flex;flex-wrap:wrap;gap:28px;justify-content:center;align-items:start;
padding:28px 16px 0;color:#d9d5cc}#editions figure{margin:0}#editions figcaption{margin-top:16px;
color:#8b8f97}#screen{width:${PANE_W}px;height:${PANE_H}px;overflow:auto;border-radius:12px;
box-shadow:0 0 0 8px #1d1f24}#editions article{width:min(380px,92vw);padding:4px 18px;
border-radius:8px;background:#15181d;overflow-wrap:anywhere}#editions a{color:#d8a21a}</style>
<figure><div id="screen" role="region" tabindex="0"></div><figcaption>${t({ en: 'Screen'
  + ' edition', es: 'Edición de pantalla' })} · HTML · ${PANE_W} × ${PANE_H} px</figcaption>
</figure><article><h3>EPUB 3 · ${read.layout}</h3>
<p>${read.spine.length} pages · ${kb(epub)}. The book carries:</p>${list([...read.manifest
  .values()].filter((item) => item.mediaType === 'video/mp4').map(({ path }) =>
  `${path.slice(read.root.length)} · ${kb(read.files.get(path))}`))}
<p>The QR codes and the PDF links open:</p>${list(clips.map(resourceVideoLink))}
<a download="${RECIPE}.epub" href="${URL.createObjectURL(new Blob([epub],
  { type: 'application/epub+zip' }))}">Download ${RECIPE}.epub</a></article>` });
document.getElementById('pages').before(desk);

// #region pane: the screen edition as HTML, each clip in the browser's own player
// A shadow root keeps the page's styles out, so the pane shows the lines as they were measured.
const pane = desk.querySelector('#screen').attachShadow({ mode: 'open' });
pane.innerHTML = renderToHtml(buildDocument({ markdown, resources },
  applyHtmlViewerOverrides(config())), { mode: 'single', padding: 0, background: '#ffffff',
  resourceImageUrl: imageUrl, // the posters, until a clip plays
  resourceVideoUrl: (fileId) => asset(fileId) }); // the file each <video> plays: the asset here
const top = (el) => el.getBoundingClientRect().top; // open the pane on the first player
pane.host.scrollTop = top(pane.querySelector('video')) - top(pane.host) - 48;
// #endregion

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
