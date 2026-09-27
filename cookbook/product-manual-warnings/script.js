// ═══ Postext Cookbook · Nº 050 · Product manual with safety notices ════════════════
// https://postext.dev/en/cookbook/product-manual-warnings
// Code: MIT · Text: original, in German (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Red Hat Text, Red Hat Display, Red Hat Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  parseTSV, mergeCells } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'product-manual-warnings';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1a1f24', paper: '#ffffff', // a blue-black on white
  brand: '#10727b', tint: '#e4f0f1', // the house teal (5.7:1 on white) and its pale tint
  warning: '#d62e1f', caution: '#f2a900', // the signal colours of WARNUNG and VORSICHT
  rule: '#cfd5da', muted: '#5b6570' }; // hairlines; running heads and notes
// 1.4.1 design slots read the hex, not the id: col() writes both (gotcha: palette-skips-designs)
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.brand }) // the defaults
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, MONO] = ['Red Hat Text', 'Red Hat Display', 'Red Hat Mono'];
const PAGE = { w: 148, h: 210, top: 19, bottom: 19.4, inner: 17, outer: 13 }; // mm: A5, mirrored
const LEAD = 12.8; // pt: the body's leading and baseline grid, 38 lines to the page
const pin = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const pad = (y, x = 0) => ({ top: pt(y), bottom: pt(y), left: pt(x), right: pt(x) }); // pt

// #region answer: signal-word boxes: a band in the hazard's colour carries its triangle
const BAND = 8.5; // mm: a stripe on the side is the icon's column; the icon is centred on it
const [TITLE, TITLE_GAP] = [8.6, 2.4]; // pt; 1.4.1 sets a box title 1.2 times its size
const PAD_Y = (2 * LEAD - 1.2 * TITLE - TITLE_GAP) / 2; // pt: title and padding fill two lines
const notice = (id, hue, ink, icon) => ({ id, backgroundEnabled: false,
  stripe: { enabled: true, side: 'left', width: mm(BAND), color: col(hue) },
  border: { enabled: true, color: col(hue), width: pt(0.75) }, // closes the band into a frame
  icon: { kind: 'resource', resourceId: icon, size: mm(5.6), align: 'top' },
  padding: { top: pt(PAD_Y), right: mm(3.2), bottom: pt(PAD_Y), left: mm(3.2) },
  titleStyle: { fontFamily: DISPLAY, fontWeight: 800, fontSize: pt(TITLE), color: col(ink),
    textTransform: 'uppercase', letterSpacing: pt(1.3), gap: pt(TITLE_GAP) },
  body: { fontSize: pt(8.8), lineHeight: pt(LEAD) }, // on the grid: a box is whole lines tall
  lists: { color: col(ink), gap: mm(2) }, marginTop: pt(LEAD), marginBottom: pt(0) });
const calloutStyles = [
  notice('warnung', 'warning', 'warning', 'triangle-white'), // white triangle, red '!'
  notice('vorsicht', 'caution', 'ink', 'triangle-ink'), // amber type would fail contrast
  { ...notice('hinweis', 'brand', 'brand'), stripe: { enabled: false }, border: { enabled: false },
    backgroundEnabled: true, background: col('tint'), borderRadius: mm(2), // property damage:
    icon: { kind: 'resource', resourceId: 'info', size: mm(4.6) } }, // no band, an icon column
];
// #endregion

// #region types: German names for figures and tables, and for a table's continuation
const counted = { numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }; // 1, 2…
const resourceTypes = [ // 1.4.1 names them in English or Spanish (gotcha: resource-types-locale)
  { id: 'figure', name: 'Abbildung', shortLabel: 'Abb.', captionPrefix: 'Abbildung', ...counted },
  { id: 'table', name: 'Tabelle', shortLabel: 'Tab.', captionPrefix: 'Tabelle', ...counted,
    captionStyle: { position: 'above' } }, // a table is captioned over its head
];
const tableStyle = { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
  headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: MONO,
  headerFontSize: pt(7.6), bodyFontSize: pt(8.2), cellPadding: mm(1.3),
  continuedSuffix: '(Fortsetzung)', continuesMarker: 'Fortsetzung auf der nächsten Seite' };
// #endregion

// #region chips: keys in the mono face, outlined; signal words and part numbers filled
const filled = (id, fill, ink) => ({ id, fontFamily: DISPLAY, bold: true, fontSize: em(0.82),
  background: col(fill), color: col(ink), borderWidth: pt(0), paddingX: em(0.45) }); // no outline
const chipStyles = [
  { id: 'taste', fontFamily: MONO, bold: true, fontSize: em(0.92), backgroundEnabled: false,
    borderColor: col('ink'), borderWidth: pt(0.6), borderRadius: pt(2.2), paddingX: em(0.4) },
  filled('warnung', 'warning', 'paper'), filled('vorsicht', 'caution', 'ink'),
  filled('hinweis', 'brand', 'paper'), { ...filled('nr', 'brand', 'paper'), fontSize: em(0.95),
    borderRadius: em(1) }, // a part number, round like the drawing's
];
// #endregion

// #region steps: big teal step numbers; teal dashes under them, grey at the third level
const orderedLists = { separator: '', fontFamily: DISPLAY, fontWeight: 800, color: col('brand'),
  numberFontSize: pt(15), gap: mm(3), itemSpacing: pt(5), marginTop: pt(LEAD / 2),
  marginBottom: pt(0), numberVerticalOffset: pt(-1) }; // gotcha: list-number-centred
const unorderedLists = { color: col('brand'), gap: mm(2), marginTop: pt(0), marginBottom: pt(0),
  levels: [{ level: 2, bulletChar: '–', indent: mm(6.5) }, // at a step's text: number + 3 mm gap
    { level: 3, bulletChar: '–', color: col('muted') }] }; // teal •, teal –, grey –
// #endregion

// #region section: the section number reversed out of a teal tab, the title beside it
const H1 = 14, TAB = 2 * LEAD - 3.6, PAD = (TAB - H1 * 1.2) / 2; // pt: a square 2 lines less 3.6
const face = { fontFamily: DISPLAY, fontWeight: 800, fontSize: pt(H1), lineHeight: 1.2 }; // both
const section = { level: 1, numberingTemplate: '{1}', // {number}: 1, 2, 3 …
  breakBefore: { enabled: false }, marginTop: pt(LEAD), marginBottom: pt(LEAD / 2), // run on
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'text', id: 'tab', content: '{number}', ...face, color: col('paper'), align: 'center',
      box: { backgroundColor: col('brand'), padding: pad(PAD) },
      placement: pin('container', 'top-left', 0, 0, { width: pt(TAB) }) },
    { kind: 'text', id: 'title', content: '{titleText}', ...face, color: col('ink'),
      overflow: 'wrap', box: { padding: { top: pt(PAD) } }, placement: pin('#tab', 'right-of', 3) },
  ] } } };
// #endregion

const words = (id, content, family, size, weight, color, placement, extra) => ({ kind: 'text',
  id, content, fontFamily: family, fontSize: pt(size), fontWeight: weight, color: col(color),
  align: 'left', overflow: 'wrap', placement, ...extra });
const ART = { x: 36, y: 52, w: 73 }; // mm: the cover's white kettle, on a teal wall and a worktop
const COUNTER = ART.y + (ART.w * 119.4) / 112; // mm: its base's foot (row 119.4 of 112 wide)
const cover = { id: 'cover', numbered: false, breakBefore: { enabled: false },
  span: 'page', // in the column, 1.4.1 clips the design at the column top, 19 mm down the page
  advancedDesign: { enabled: true, minHeight: mm(PAGE.h - PAGE.top - PAGE.bottom),
    slot: { elements: [
      { kind: 'box', id: 'wall', style: { backgroundColor: col('brand') },
        placement: pin('page', 'top-left', 0, 0, { width: 'fill', height: mm(COUNTER) }) },
      { kind: 'image', id: 'art', resourceId: 'kettle',
        placement: pin('page', 'top-left', ART.x, ART.y, { width: mm(ART.w) }) },
      words('title', '{titleText}', DISPLAY, 48, 800, 'paper',
        pin('page', 'top-left', PAGE.inner - 0.6, 24), { lineHeight: 1 }),
      words('product', '{attr.product}', DISPLAY, 17, 500, 'tint', pin('#title', 'below', 0.4, 1)),
      words('manual', 'Bedienungsanleitung', DISPLAY, 15, 800, 'ink',
        pin('page', 'top-left', PAGE.inner, COUNTER + 12)),
      words('keep', 'Vor dem ersten Gebrauch lesen und aufbewahren.', TEXT, 8.6, 400, 'ink',
        pin('#manual', 'below', 0, 1)),
      words('lang', 'DE', DISPLAY, 11, 800, 'paper', pin('page', 'top-right', -PAGE.outer,
        COUNTER + 12), { box: { backgroundColor: col('brand'), padding: pad(3, 5) } }),
      words('model', '{attr.model}', MONO, 7.5, 500, 'muted',
        pin('page', 'bottom-left', PAGE.inner, -PAGE.bottom)),
    ] } } };

const head = (id, content, parity, edge, x) => words(id, content, MONO, 7.5, 500, 'muted',
  pin('page', edge, x, 10.5), { parity, pages: 'body', letterSpacing: pt(1.1),
    textTransform: 'uppercase', align: x > 0 ? 'left' : 'right' });
const folio = (parity, edge) => words(`folio-${parity}`, '{pageNumber}', DISPLAY, 9, 800,
  'paper', pin('page', edge, 0, -9, { width: mm(11) }), { parity, pages: 'body', align: 'center',
    box: { backgroundColor: col('brand'), padding: pad(3.5) } });

const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  locale: 'de', resourceTypes, colorPalette, calloutStyles, chipStyles, tableStyle, orderedLists,
  tableStyles: [{ id: 'bare', cellPadding: mm(1.1) }], // the legend and the data: no head row
  unorderedLists, headingStyles: [cover], layout: { layoutType: 'single' },
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, margins: { top: mm(PAGE.top),
    bottom: mm(PAGE.bottom), left: mm(PAGE.inner), right: mm(PAGE.outer), mirror: true } },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    boldFontWeight: 600, boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), referenceBold: false, firstLineIndent: pt(0),
    paragraphSpacing: true, minWordSpacing: 0.8, maxWordSpacing: 1.8, // from 0.6 and 2
    maxRuntTracking: 0 }, // gotcha: runt-tracking-unpainted
  headings: { fontFamily: DISPLAY, fontWeight: 800, color: col('ink'), lineHeight: pt(LEAD),
    levels: [section, { level: 2, fontSize: pt(10.4), color: col('brand'), marginTop: pt(LEAD),
      marginBottom: pt(0), numberingTemplate: '{1}.{2}' }] }, // 3.1, 3.2 …
  captionStyle: { fontFamily: TEXT, fontSize: pt(8.2), labelColor: col('brand'), gap: mm(1.6) },
  paragraphStyles: [{ id: 'colophon', fontFamily: TEXT, fontSize: pt(7), lineHeight: pt(9.6),
    color: col('muted'), textAlign: 'left', marginTop: pt(LEAD) }],
  header: { elements: [head('verso', '{title}', 'even', 'top-left', PAGE.outer),
    head('recto', 'Wasserkocher VW-170', 'odd', 'top-right', -PAGE.outer)] },
  footer: { elements: [folio('odd', 'bottom-right'), folio('even', 'bottom-left')] }, // thumb
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the manual, in German
const parts = /* @content:teile */ ''; // TSV: number chip, part; in the drawing's order
const faults = /* @content:stoerungen */ ''; // TSV: fault, cause, remedy
const data = /* @content:daten */ ''; // TSV: technical data, two columns

// #region tables: a TSV per table; a blank first cell shares the fault above it
function faultTable(tsv) { // parseTSV leaves the head row to you: headerRowCount
  let m = { ...parseTSV(tsv), headerRowCount: 1, columnWidths: [30, 34, 36] }; // weights
  for (let r = 2, top = 1; r < m.rows.length; r++) { // a rowspan per fault: no cut runs through it
    if (m.rows[r][0].content) top = r; // mergeCells hides what it covers: merged-cells-hiddenby
    else m = mergeCells(m, { start: { row: top, col: 0 }, end: { row: r, col: 0 } });
  }
  return m;
}
const fold = (rows, columnWidths) => ({ columnWidths, rows: rows.slice(0, rows.length / 2) // 2 up
  .map((row, k) => [...row, ...rows[k + rows.length / 2]]) });
const legend = fold(parseTSV(parts).rows.map(([chip, name]) => [{ ...chip, align: 'center' },
  name]), [7, 43, 7, 43]); // each part's number chip centred in its narrow column
const HERE = { placement: { position: 'here' } }; // at the resource's ::resource line
const table = (id, caption, model, styleId = 'bare', where = HERE) => ({ id, typeId: 'table',
  kind: 'table', caption, table: { model, styleId }, createdAt: 0, updatedAt: 0, ...where });
const tables = [table('legende', 'Teile des Verra W1', legend),
  table('daten', 'Kenndaten des VW-170', fold(parseTSV(data).rows, [20, 30, 20, 30])),
  table('stoerungen', 'Störungen und ihre Behebung', faultTable(faults), null, // the house style,
    { placement: { position: 'top' } })]; // a float, so it can split (gotcha: here-table-no-split)
// #endregion

const svgFile = (id, width = 240, height = 240) => ({ id, typeId: 'figure', kind: 'svg',
  svg: { fileId: `${id}.svg`, width, height }, createdAt: 0, updatedAt: 0 });
const resources = [
  { ...svgFile('teile', 1180, 560), ...HERE, caption: 'Der Verra W1 von links, mit Kanne und '
    + 'Sockel', altText: 'Wasserkocher von der Seite; acht Linien zeigen auf seine Teile.' },
  ...tables, svgFile('kettle', 1120, 1300), svgFile('triangle-white'), svgFile('triangle-ink'),
  svgFile('info'), // never cited, so never placed: the cover and the boxes draw them by id
];

// #region art: the kettle, its parts diagram with embedded digits, and the three notice icons
const n = (v) => +v.toFixed(2);
const svg = (w, h, body, style = '') => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w * 10}" height="${h * 10}" viewBox="0 0 ${w} ${h}">${style}${body}</svg>`;
const path = (d, fill, stroke = 'none', width = 0, extra = '') => `<path d="${d}" `
  + `fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" `
  + `stroke-linecap="round"${extra}/>`;
const pill = (x, y, w, h, fill, stroke, sw) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" `
  + `height="${n(h)}" rx="${n(h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
// The kettle in profile, spout left, handle right, on a 112 × 128 grid.
const K = {
  body: 'M23 106Q17.6 106 18 101L22.8 41H77.2L82 101Q82.4 106 77 106Z',
  collar: 'M22.4 34H77.6L77.2 41H22.8Z',
  lid: 'M24 34C31.5 25.8 68.5 25.8 76 34Z',
  spout: 'M22.4 35.2L8 29.4Q5.9 28.8 7 30.8Q14.6 42.4 21.9 47.8Z',
  handle: 'M77.6 35.2H93Q100.5 35.2 100.5 42.7V83.5Q100.5 91 93 91H81.7L81.1 83.6H89Q92.4 83.6'
    + ' 92.4 80.2V46.2Q92.4 42.8 89 42.8H77.3Z',
  release: 'M80.5 30.6H90.6Q92.6 30.6 92.6 32.6V35.2H78.6Z',
  base: 'M14 106.6H86Q90.6 106.6 90.6 111.2V113.8Q90.6 118.4 86 118.4H14Q9.4 118.4 9.4 113.8'
    + 'V111.2Q9.4 106.6 14 106.6Z',
};
function kettle(line, fill, water, sw) {
  let out = ['body', 'collar', 'lid', 'handle', 'release', 'spout']
    .map((k) => path(K[k], fill, line, sw)).join('');
  out += path('M63.7 66H68.2L69.8 98H65Z', water) // water in the window
    + path('M62.5 47H67.3L69.8 98H65Z', 'none', line, sw * 0.8);
  for (const [y, w] of [[51, 3.2], [61, 1.8], [71, 1.8], [81, 1.8], [91, 3.2]]) { // MAX … MIN
    out += path(`M${n(60.4 - w)} ${y}H60.4`, 'none', line, sw * 0.7);
  }
  out += path('M11.8 32.4L18.9 35.4M13.4 35.6L19.6 38.2', 'none', line, sw * 0.6) // the filter
    + path('M30 45V98', 'none', water, sw * 1.6) // light on the steel
    + path(K.base, fill, line, sw)
    + path('M90.6 114C97.6 114.4 100.6 118.6 100.6 122.4S105 127 111 127', 'none', line, sw);
  for (const x of [33, 45, 57]) out += pill(x, 110.3, 9, 4.4, water, line, sw * 0.6); // keys
  return out;
}
function coverArt() { // a white kettle: its teal outline does not show on the teal wall
  const steam = [0, 1, 2].map((k) => path(`M${3.5 + k * 4.6} 24q-2.8-4.6 0-9.2t0-9.2`, 'none',
    palette.paper, 1.2, ' stroke-opacity=".6"')).join('');
  return svg(112, 130, `<g transform="translate(0 1)">${kettle(palette.brand, palette.paper,
    palette.tint, 1.5)}${steam}</g>`);
}
// Parts diagram, 118 × 56 mm: the kettle at half size, numbered leaders in two columns.
const [S, X0, Y0] = [0.5, 30, -8.5];
const PARTS = [ // a point on the kettle grid, then the leader's corners in mm; the disk ends it
  [[42, 28.6], [[X0 + 21, 2.5], [8, 2.5]]], [[15, 34], [[8, 14]]], [[13, 112.5], [[8, 42]]],
  [[37.5, 112.5], [[8, 52]]], [[87, 30.6], [[X0 + 43.5, 2.5], [110, 2.5]]],
  [[100.5, 58], [[110, 22]]], [[68.2, 94], [[110, 38.5]]], [[104, 125], [[110, 52]]]];
function partsArt(face) { // the digits need a face embedded in the SVG (gotcha: svg-no-webfonts)
  let out = `<g transform="translate(${X0} ${Y0}) scale(${S})">`
    + kettle(palette.ink, palette.paper, palette.tint, 1.4) + '</g>';
  PARTS.forEach(([[x, y], corners], i) => {
    const pts = [[X0 + x * S, Y0 + y * S], ...corners];
    const [dx, dy] = pts.at(-1);
    out += path(`M${pts.map(([px, py]) => `${n(px)} ${n(py)}`).join('L')}`, 'none',
      palette.brand, 0.3) + `<circle cx="${n(pts[0][0])}" cy="${n(pts[0][1])}" r="0.65" `
      + `fill="${palette.brand}"/><circle cx="${dx}" cy="${dy}" r="2.5" fill="${palette.brand}"/>`
      + `<text x="${dx}" y="${n(dy + 1.2)}" text-anchor="middle" fill="${palette.paper}">`
      + `${i + 1}</text>`;
  });
  return svg(118, 56, out, `<style>${face}text{font-family:N;font-size:3.3px}</style>`);
}
function triangle(fg, mark) { // a rounded safety alert triangle, its '!' in the band's colour
  return svg(24, 24, path('M12 2.4L22.6 20.6H1.4Z', fg, fg, 2.2) + path('M12 8.6V14.4', 'none',
    mark, 2.4) + `<circle cx="12" cy="17.6" r="1.35" fill="${mark}"/>`);
}
function info() {
  return svg(24, 24, `<circle cx="12" cy="12" r="11" fill="${palette.brand}"/>`
    + `<circle cx="12" cy="7.2" r="1.6" fill="${palette.paper}"/>`
    + path('M12 11V17.6', 'none', palette.paper, 2.8));
}
async function embeddedFace(family, weight) { // a Fontsource file as a data URL
  const id = family.toLowerCase().replace(/\s+/g, '-');
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-`
    + `${weight}-normal.woff2`);
  if (!res.ok) throw new Error(`Font not found (${res.status}): ${family} ${weight}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `@font-face{font-family:N;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`;
}
const drawings = async () => ({ 'kettle.svg': coverArt(),
  'teile.svg': partsArt(await embeddedFace(DISPLAY, 700)),
  'triangle-white.svg': triangle(palette.paper, palette.warning),
  'triangle-ink.svg': triangle(palette.ink, palette.caution), 'info.svg': info() });
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Red Hat Text': ['400', '400i', '600'], // text, continuation notes, bold runs
  'Red Hat Display': ['500', '600', '700', '800'], // heads, tabs and numbers; chips; the SVG
  'Red Hat Mono': ['500', '600'] }; // running heads, keys, table heads (gotcha: fonts-first)

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const allText = [markdown, parts, faults, data].join('\n');
await Promise.all([loadFonts(FONTS, allText),
  ...Object.entries(await drawings()).map(([id, markup]) => loadSvg(id, markup))]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), allText);
showPages(doc, { title: 'Verra W1 · Bedienungsanleitung' }); // the sample is German in both

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
