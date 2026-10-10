// ═══ Postext Cookbook · Nº 116 · Photos that grow to fill a short column ═══════════
// https://postext.dev/en/cookbook/photos-fill-short-columns
// Code: MIT · Text: original (CC BY 4.0) · Photos: diffusion models
// Fonts: Newsreader, Archivo, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// A magazine feature set twice. Without safe areas some columns end short; with them the
// engine crops each photo outside its area to set it taller, and the photos fill those lines.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'photos-fill-short-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: six named colours, the accents taken from the photos: sea slate, net green
const palette = {
  ink: '#1d2326', // text: a cold near-black
  sea: '#2f5d73', // the accent: kicker, caption labels, folios, references
  net: '#3f6b55', // the second colour: the opener's rule
  rule: '#c9d1d3', // hairlines
  muted: '#5f6a6e', // running heads, credits, the colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': pointed at the accent, no default blue shows.
  { id: 'main-color', name: 'sea (defaults)', value: { hex: palette.sea, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Newsreader', 'Archivo', 'Archivo Narrow'];
const LEAD = 13.6; // body leading in pt: the grid the photos grow by
const [PAGE_W, PAGE_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [225, 297, 22, 22, 18, 16, 7]; // mm
const PHOTO_H = 150; // the opener's bleed photo: 225 × 150 mm, the shape of the file
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  align: 'left', overflow: 'wrap', ...extra }); // the running heads ask for an ellipsis instead
const caps = (size) => ({ fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.18) });

// #region answer: a safe area per photo, and balancing that may only grow pictures
// Each photo names the rectangle that must always show, in fractions of the file:
// x and width of its width, y and height of its height. Outside it the engine may crop,
// so the photo can stand taller (sides cut, down to the area's width) or lower (top and
// bottom cut, down to its height) than the file, always as wide as its column.
const SAFE_AREAS = {
  mariscadora: { x: 0.2, y: 0.36, width: 0.34, height: 0.46 }, // Carmen, her rake and basket
  redeira: { x: 0.34, y: 0.14, width: 0.4, height: 0.66 }, // Rosa and the net in her lap
  carpintero: { x: 0.12, y: 0.2, width: 0.64, height: 0.62 }, // Manuel and the whole hull
  faro: { x: 0.34, y: 0.14, width: 0.32, height: 0.56 }, // the tower and the walker below it
  pulpeira: { x: 0.2, y: 0.08, width: 0.56, height: 0.82 }, // Lucía, the octopus, the cauldron
};
// Columns end flush on this grid by whole lines. A heading or a photo that does not fit a
// column's foot leaves lines empty there; these settings forbid the usual fixes (space above
// a heading, under a photo, or a paragraph run long), so only a photo with a safe area can
// take them, by growing a line at a time. Without safe areas the short columns stay short.
const balancing = { enabled: true, maxLinesPerHeading: 0, stretchAfterLists: false,
  stretchAfterFloats: false, looseParagraphs: false };
// #endregion

// #region opener: the estuary across the head of the page, then kicker, title and standfirst
const opener = {
  enabled: true,
  // The opener reserves down to the standfirst's last line; minHeight is a floor under that,
  // which leaves about two lines of air before the text in both editions.
  minHeight: mm(188),
  slot: { elements: [
    { kind: 'image', id: 'photo', resourceId: 'estuario', // bleeds off the top and both sides
      placement: at('page', 'top-left', 0, 0, { width: mm(PAGE_W), height: mm(PHOTO_H) }) },
    text('kicker', '{attr.kicker}', LABEL, 8.5, 'sea', at('container', 'top-left', 0,
      PHOTO_H - TOP + 9), caps(8.5)),
    text('title', '{titleText}', DISPLAY, 34, 'ink', at('#kicker', 'below', 0, 2.5,
      { width: mm(150), height: 'auto' }), { fontWeight: 800, lineHeight: 1.04 }),
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(2), color: col('net'),
      placement: at('#title', 'below', 0, 4, { width: mm(16) }) },
    text('lead', '{attr.lead}', TEXT, 11.2, 'ink', at('#rule', 'below', 0, 4,
      { width: mm(150), height: 'auto' }), { italic: true, lineHeight: 1.36, hyphenate: true }),
  ] },
};
// #endregion

// #region furniture: magazine and issue on the verso, the feature's title on the recto
const HEAD_Y = 12; // mm from the top edge
const head = (id, content, parity, edge, x, extra) => text(id, content, LABEL, 7.6, 'muted',
  at('page', edge, x, HEAD_Y), { ...caps(7.6), fontWeight: 600, parity, pages: 'body',
    overflow: 'ellipsis', ...extra });
const folio = (id, parity, edge, x, extra) => text(id, '{pageNumber}', DISPLAY, 8.5, 'sea',
  at('page', edge, x, HEAD_Y), { fontWeight: 800, parity, pages: 'body', ...extra });
const header = { elements: [
  folio('verso-folio', 'even', 'top-left', OUTER),
  head('verso-title', '{title} · {subtitle}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8), { align: 'right' }),
  folio('recto-folio', 'odd', 'top-right', -OUTER, { align: 'right' }),
] };
const footer = { elements: [] }; // the opener carries no folio: its photo bleeds off the head
// #endregion

const types = () => defaultResourceTypes(LANG).map((type) => ({ ...type,
  numberingTemplate: '{n}', resetOn: 'never' })); // 'Figura 3', not '1.3', in a one-article issue

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }), // the hyphenation patterns of each edition
  resourceTypes: types(), // the built-in types of the edition's language, renumbered
  colorPalette,
  page: { width: mm(PAGE_W), height: mm(PAGE_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(9.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('sea'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: {
    fontFamily: DISPLAY, fontWeight: 800, color: col('ink'),
    balancing,
    levels: [
      // parity 'odd': the feature opens on a recto, after a blank verso only when needed.
      { level: 1, fontSize: pt(34), span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontSize: pt(12), lineHeight: pt(LEAD), marginTop: pt(LEAD),
        marginBottom: pt(0) }, // one grid line above, none below
    ],
  },
  captionStyle: { fontFamily: LABEL, fontSize: pt(8), color: col('ink'), gap: mm(2),
    labelBold: true, labelColor: col('sea'), descriptionItalic: false,
    note: { color: col('muted') } },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region photos: one resource per file; the safe area is the only difference between builds
const FILES = { estuario: [1700, 1133] }; // px, declared as they are; the rest 1600 × 1067
// Caption and alt text of each photo, one block per photo: content.figures.<lang>.md.
const figureTexts = /* @content:figures */ '';
const CAPTIONS = Object.fromEntries(figureTexts.trim().split(/\n\s*\n/)
  .map((block) => block.split('\n').map((line) => line.trim()))
  .map(([id, caption, alt]) => [id, [caption, alt]]));
const PLACEMENT = { pulpeira: { position: 'here' } }; // the rest float to the first free slot
const photo = (id, safe) => {
  const [w, h] = FILES[id] ?? [1600, 1067];
  const [caption, alt] = CAPTIONS[id] ?? [];
  return { id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: `${id}-${w}.jpg`, format: 'jpeg', width: w, height: h },
    ...(caption && { caption, altText: alt, placement: PLACEMENT[id] ?? { position: 'auto' } }),
    ...(safe && SAFE_AREAS[id] && { safeArea: SAFE_AREAS[id] }) };
};
const resources = (safe) => ['estuario', ...Object.keys(CAPTIONS)].map((id) => photo(id, safe));
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  Newsreader: ['400', '400i', '600'], Archivo: ['800'], 'Archivo Narrow': ['600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(resources(false).map((r) => loadImage(r.bitmap.fileId, asset(r.bitmap.fileId))));
// #region builds: the same text, config and photos, without and then with the safe areas
const build = (safe) => buildDocumentWithFonts({ markdown, resources: resources(safe) }, config(),
  kitFonts(FONTS));
const docs = { plain: await build(false), safe: await build(true) };
// #endregion
const title = t({ en: 'Photos that grow to fill a short column',
  es: 'Fotos que crecen hasta llenar la columna' });
// Two buttons put either build on the desk; the PDF follows the one shown.
const LABELS = { plain: t({ en: 'Without safe areas', es: 'Sin zona segura' }),
  safe: t({ en: 'With safe areas', es: 'Con zona segura' }) };
const switches = Object.keys(docs).map((key) => Object.assign(document.createElement('button'),
  { type: 'button', value: key, textContent: LABELS[key] }));
const show = (key) => {
  showPages(docs[key], { title });
  for (const b of switches) b.ariaPressed = String(b.value === key);
  document.querySelectorAll('#pt-actions a, [data-postext-pdf]').forEach((old) => old.remove());
  offerPdf(() => renderToPdf(docs[key], { fontProvider: fontsourceProvider,
    resourceBytes: imageBytes }), `${RECIPE}-${key}.pdf`);
};
for (const b of switches) b.addEventListener('click', () => show(b.value));
show('safe');
document.getElementById('pt-actions').prepend(...switches);
document.head.insertAdjacentHTML('beforeend',
  '<style>#pt-actions [aria-pressed=true] { text-decoration: underline }</style>');

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
