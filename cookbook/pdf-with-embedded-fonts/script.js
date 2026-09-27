// ═══ Postext Cookbook · Nº 025 · A real PDF with the same fonts embedded ═══════════
// https://postext.dev/en/cookbook/pdf-with-embedded-fonts
// Code: MIT · Text: notes original (CC BY 4.0), poems in the public domain · Cover: drawn in code
// Fonts: Crimson Text, Fraunces, Tenor Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'pdf-with-embedded-fonts';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region answer: one download per face: the layout measures it, the PDF embeds it
// Hook-up: `await registerFaces()` before the first build; `renderToPdf(doc, { fontProvider })`.
const files = new Map(); // 'crimson-text-latin-600-normal' → its WOFF2 (gotcha: latin-subset)
function fontFile(family, weight, style) {
  const id = family.toLowerCase().replaceAll(' ', '-'), file = `${id}-latin-${weight}-${style}`;
  if (!files.has(file)) {
    files.set(file, fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${file}.woff2`)
      .then((res) => {
        if (!res.ok) throw new Error(`Fontsource has no ${family} ${weight} ${style}`);
        return res.arrayBuffer();
      }));
  }
  return files.get(file);
}
const facesOf = (family) => (FONTS[family] ?? []).map((spec) =>
  ({ spec, weight: parseInt(spec, 10), style: spec.endsWith('i') ? 'italic' : 'normal' }));

// The screen: a FontFace per face, from those bytes, before the first build (gotcha: fonts-first).
const registerFaces = () => Promise.all(Object.keys(FONTS).flatMap((family) =>
  facesOf(family).map(async ({ weight, style }) => {
    const face = new FontFace(family, await fontFile(family, weight, style),
      { weight: `${weight}`, style });
    document.fonts.add(await face.load());
  })));

// The PDF: the same bytes as TrueType. renderToPdf asks for the bold and italic of every family,
// set or not, and a refusal stops it (gotcha: pdf-provider-all-styles). A face FONTS lacks gets
// the closest one it has, and is logged as a stand-in: no text may be set in a stand-in.
const embedded = new Set(), standIns = new Set(); // shown once the PDF is ready
async function fontProvider(family, weight, style) {
  if (!FONTS[family]) throw new Error(`${family} is not in FONTS: no page was set in it`);
  const cost = (f) => (f.style === style ? 0 : 1000) + Math.abs(f.weight - weight);
  const best = facesOf(family).reduce((a, b) => (cost(b) < cost(a) ? b : a));
  const asked = `${weight}${style === 'italic' ? 'i' : ''}`;
  embedded.add(`${family} ${best.spec}`);
  if (asked !== best.spec) standIns.add(`${family} ${asked} → ${best.spec}`);
  return decompressWoff2(new Uint8Array(await fontFile(family, best.weight, best.style)));
}
// #endregion

const palette = { // eight named colours; every colour in the config links to one of them
  ink: '#1a2326', band: '#0f2a33', // text, a sea-green near-black; night teal: cover and titles
  gilt: '#c9a227', bronze: '#806414', // the accent; deepened to 5.4:1 for small type on paper
  foam: '#e3ebe8', rule: '#b9c6c2', // cover small type and the table's total; hairlines
  muted: '#5c6b70', paper: '#fbfaf6' }; // feet and colophon; the page
// The hex rides along: 1.4.1 designs read it, not the link (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [...Object.entries(palette), ['main-color', palette.band]] // the defaults'
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })); // id: teal, never blue

const PAGE = { width: 148, height: 210 }; // mm: an A5 programme
const MARGIN = { top: 22, bottom: 20, inner: 18, outer: 28 }; // mm, mirrored: a 102 mm measure
const LEAD = 13.3; // pt: the leading of text and verse, 1.33 × the 10 pt body
const LABEL = 7.5, TRACK = 0.2; // pt: kickers, feet, table head, date; em: capitals' tracking
const H2 = { italic: true, fontSize: pt(13.5), lineHeight: pt(2 * LEAD) }; // two lines of text

const label = (size, ink) => ({ fontFamily: 'Tenor Sans', fontSize: pt(size),
  letterSpacing: pt(size * TRACK), textTransform: 'uppercase', color: col(ink) });
const title = (size) => ({ fontFamily: 'Fraunces', fontWeight: 300, italic: true,
  fontSize: pt(size), lineHeight: 1 }); // a multiple (gotcha: design-lineheight-multiple)
const text = (id, content, placement, style) => ({ kind: 'text', id, content, placement,
  overflow: 'wrap', ...style }); // not '…' (gotcha: overflow-ellipsis-default)
const at = (to, edge, y, width) => ({ anchor: { to, edge }, offset: { y: mm(y) },
  ...(width && { size: { width: mm(width) } }) });

// #region cover: the drawing fills the page; the frontmatter and the heading set the type
const cover = {
  id: 'cover', span: 'page', header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'night', resourceId: 'cover',
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill' } } },
    text('consort', '{author}', at('page', 'top', 18), label(8.5, 'gilt')),
    text('title', '{titleText}', at('page', 'top', 26, 120), // the \\ in the heading breaks it
      { ...title(68), lineHeight: 0.95, color: col('gilt') }),
    text('subtitle', '{subtitle}', at('page', 'top', 75, 66), { fontFamily: 'Crimson Text',
      italic: true, fontSize: pt(12.5), lineHeight: 1.25, color: col('foam') }),
    text('when', '{attr.when}', at('page', 'top', 91), label(LABEL, 'foam')),
    text('where', '{attr.where}', at('page', 'top', 96), label(LABEL, 'foam')),
  ] } },
};
// #endregion

const opener = { enabled: true, minHeight: pt(4 * LEAD), slot: { elements: [ // kicker, title, rule
  text('kicker', '{attr.kicker}', at('container', 'top-left', 0), label(LABEL, 'bronze')),
  text('title', '{titleText}', at('#kicker', 'below', 1.5), { ...title(26), color: col('band') }),
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1), color: col('gilt'),
    placement: { ...at('#title', 'below', 2.5), size: { width: mm(14) } } },
] } };

const foot = (parity, edge, x, content) => ({ kind: 'text', id: parity, content, parity,
  ...label(LABEL, 'muted'), placement: { anchor: { to: 'page', edge }, offset: { x: mm(x),
    y: mm(-MARGIN.bottom / 2) } } });

// #region headings: the heading tree is the bookmark tree
const headings = { fontFamily: 'Fraunces', fontWeight: 300, color: col('band'),
  marginTop: pt(0), marginBottom: pt(0), // a two-line H2 carries its own space above
  levels: [ // a headings object drops the H1 break: restated (gotcha: headings-drop-h1-break)
    { level: 1, breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
    { level: 2, ...H2 },
  ] };
// The performers: a top-level bookmark, no break, no opener (gotcha: style-inherits-break).
const aside = { id: 'aside', breakBefore: { enabled: false }, advancedDesign: { enabled: false },
  ...H2, marginTop: pt(LEAD) };
// #endregion

const config = () => ({ // a new object per build (gotcha: config-cache-identity)
  colorPalette, resourceTypes: [plain],
  page: { width: mm(PAGE.width), height: mm(PAGE.height), backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  bodyText: { fontFamily: 'Crimson Text', fontSize: pt(10), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), boldFontWeight: 600,
    firstLineIndent: mm(4.5), indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.6 },
  headings, headingStyles: [cover, aside], layout: { layoutType: 'single' },
  paragraphStyles: [ // verse: a paragraph per line, never stretched if a line ever turns over
    { id: 'verse', textAlign: 'left', firstLineIndent: pt(0) },
    { id: 'verse-in', textAlign: 'left' }, // a line the poet indented: the body's 4.5 mm
    { id: 'colophon', fontFamily: 'Tenor Sans', fontSize: pt(6.5), lineHeight: pt(9.3),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('band'), headerColor: col('paper'), headerFontFamily: 'Tenor Sans',
    headerFontSize: pt(LABEL), headerBold: false, bodyFontSize: pt(9), cellPadding: mm(1.2) },
  header: { elements: [] }, footer: { elements: [ // no running heads: folios in the feet, 10 mm up
    foot('even', 'bottom-left', MARGIN.outer, '{pageNumber} · {title}'), // verso: the programme
    foot('odd', 'bottom-right', -MARGIN.outer, '{chapterTitle} · {pageNumber}')] }, // recto
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const plain = { id: 'plain', name: 'Programme', shortLabel: '', captionPrefix: '', // no "Table 1"
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal' };
const row = (who, what, time, more) => [who, what, time].map((content, i) =>
  ({ content, align: i === 2 ? 'right' : 'left', ...more })); // durations flush right
const resources = [
  { id: 'order', typeId: 'plain', kind: 'table', createdAt: 0, updatedAt: 0,
    placement: { position: 'here' }, // where ::resource sets it, not floated to the foot
    table: { model: { headerRowCount: 1, columnWidths: [28, 55, 17], rows: [
      row('COMPOSER', 'WORK', 'DURATION', { isHeader: true }), // capitals: the head is a label
      row('Felix Mendelssohn', '*Venetian Boat Song*, op. 30 no. 6', '3′05″'),
      row('Hester Vane', '*The Tide Rises, the Tide Falls* · Longfellow', '4′20″'),
      row('Gabriel Fauré', '*Élégie*, op. 24', '6′50″'),
      row('Hester Vane', '*Requiem* · Stevenson', '3′10″'),
      row('Claude Debussy', '*La cathédrale engloutie*', '6′15″'),
      row('Hester Vane', '*Crossing the Bar* · Tennyson', '5′40″'),
      row('', 'About half an hour, without an interval', '29′20″', { background: col('foam') }),
    ] } } },
  { id: 'cover', typeId: 'plain', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'cover.svg', width: PAGE.width * 10, height: PAGE.height * 10 },
    altText: 'Night-teal cover whose lower half is rows of gilt wave scales, fading upward.' },
];

// #region art: seigaiha, the blue-sea-wave pattern, as gilt rings on night teal
const WAVES = 115; // mm from the top edge: where the waves begin, under the venue
function coverArt(w, h, top) { // mm: the page, and where the waves begin
  const R = 12.5; // mm: the radius of one scale
  const f = (n) => +n.toFixed(2);
  const rows = Math.ceil((h - top) / (R / 2)) + 1;
  let out = `<rect width="${w}" height="${h}" fill="${palette.band}"/>`;
  for (let i = 0; i <= rows; i++) { // top row first: each row hides the lower half of the last
    const y = top + (i * R) / 2;
    const glow = f(0.5 + 0.5 * (i / rows) ** 1.3); // half-lit at the top, full gilt at the foot
    for (let x = (i % 2) * R; x <= w + R; x += 2 * R) {
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${R}" fill="${palette.band}"/>`;
      for (const k of [0.9, 0.64, 0.38]) {
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(k * R)}" fill="none" `
          + `stroke="${palette.gilt}" stroke-width="${f(0.09 * R)}" stroke-opacity="${glow}"/>`;
      }
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.12 * R)}" fill="${palette.gilt}" `
        + `fill-opacity="${glow}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" height="${h * 10}" `
    + `viewBox="0 0 ${w} ${h}"><clipPath id="page"><rect width="${w}" height="${h}"/></clipPath>`
    + `<g clip-path="url(#page)">${out}</g></svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Each bold and italic a block may ask for. Tenor Sans has 400 only (gotcha: faked-font-styles).
const FONTS = { 'Crimson Text': ['400', '400i', '600', '600i'], Fraunces: ['300', '300i'],
  'Tenor Sans': ['400'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: the faces first, then the layout, then a check that nothing was missed
await registerFaces(); // the answer: every face in FONTS, from its own bytes
await loadSvg('cover.svg', coverArt(PAGE.width, PAGE.height, WAVES));
// buildWithFonts (the Cookbook kit) adds any face FONTS forgot, for the screen only, and rebuilds.
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'Home from Sea · a recital programme' });
// #endregion

// #region pdf: the export: bookmarks from the headings, a progress bar, the faces it embedded
const bar = Object.assign(document.createElement('progress'), { max: 1, value: 0 });
const list = (faces) => [...faces].join(', ') || 'none';
offerPdf(() => {
  document.getElementById('pt-actions').prepend(bar);
  return renderToPdf(doc, {
    fontProvider, // the answer: the page's own font files
    resourceBytes: imageBytes, // the cover drawing, as vector paths
    outlines: true, // the default, spelled out: each heading becomes a bookmark
    onProgress: ({ phase, pages, totalPages }) => {
      bar.value = pages / totalPages;
      const says = { prepare: 'fonts and cover embedded', pages: `page ${pages} of ${totalPages}`,
        save: `embedded: ${list(embedded)} · stand-ins: ${list(standIns)}` };
      kitStatus(`PDF · ${says[phase]}`);
    },
  });
}, `${RECIPE}.pdf`);
// #endregion

// @kit
