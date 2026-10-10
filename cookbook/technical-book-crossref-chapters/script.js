// ═══ Postext Cookbook · Nº 094 · A technical book whose references cross chapters ═══
// https://postext.dev/en/cookbook/technical-book-crossref-chapters
// Code: MIT · Text: original (CC BY 4.0) · Charts: generated in code (CC BY 4.0)
// Fonts: IBM Plex Serif, Sans Condensed and Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A small handbook in four Markdown documents. The text writes @fig:sun, @tbl:loads and
// @sec:array-size the way pandoc-crossref reads them, and buildBundle resolves each one to
// the right number, title or page wherever in the book its target lies.
import {
  buildBundle, prepareFonts, withLoadedFonts, renderPageToCanvas, registerResourceImage,
  defaultResourceTypes, parseTSV, setAlignment,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'technical-book-crossref-chapters';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a night-blue band, one burnt-orange accent, an amber for the charts
const palette = {
  ink: '#1c1f24', // text: a cool near-black
  night: '#1f3247', // openers, the cover, table heads
  accent: '#a8471a', // numbers, kickers, references (5.6:1 on paper)
  sun: '#e9a33a', // the charts and the cover only, never text on paper
  tint: '#f5ede3', // daylight in the charts
  rule: '#cfc7bc', // hairlines
  muted: '#5e636a', // running heads, colophon, chart labels
  paper: '#ffffff',
};
// A design element paints the hex beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const SERIF = 'IBM Plex Serif', COND = 'IBM Plex Sans Condensed', MONO = 'IBM Plex Mono';
const TRIM = { w: 178, h: 233 }; // mm: a technical-book trim
const MARGIN = { top: 22, bottom: 22, inner: 20, outer: 32 }; // a 126 mm measure
const LEAD = 13.8; // pt: the body leading
const MEASURE = TRIM.w - MARGIN.inner - MARGIN.outer;
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const caps = (size, extra = {}) => ({ fontFamily: MONO, fontSize: pt(size), fontWeight: 600,
  letterSpacing: pt(size * 0.14), textTransform: 'uppercase', align: 'left', ...extra });

// #region answer: one set of identifiers for the whole book, resolved across chapters
// buildBundle lays the chapters out in order. Each chapter whose text names a target it
// does not hold (`@sec:array-size` in chapter 1, `@tbl:loads` in chapter 3) is laid out
// with the outline of the whole book, so the reference prints "section 2.3" and its page,
// and links to it. Headings carry their ids in the Markdown, `## Sizing the array
// {#sec:array-size}`; figures and tables are resources whose ids are what follows the @.
const book = () => buildBundle({ chapters, config: config(), resources });
const crossRefs = {
  chapter: t({ en: 'chapter {n}', es: 'capítulo {n}' }), // @sec:array → "chapter 2"
  section: t({ en: 'section {n}', es: 'apartado {n}' }), // @sec:losses → "section 2.2"
  page: t({ en: 'p. {n}', es: 'pág. {n}' }), // :ref{id="sec:losses" style=page} → "p. 7"
};
// Figures and tables count per chapter ({h1}.{n}) and carry on from one document to the
// next. A reference prints the type's shortLabel: @fig:sun → "Fig. 2.1", @Tbl:loads (capital
// T, at the start of a sentence) → "Table 1.1", [-@tbl:loads] → the bare "1.1".
const resourceTypes = defaultResourceTypes(LANG).map((type) => ({ ...type,
  shortLabel: type.id === 'table' ? t({ en: 'table', es: 'tabla' })
    : t({ en: 'fig.', es: 'figura' }),
  ...(type.id === 'table' && { captionStyle: { position: 'above' } }) }));
// #endregion

// #region opener: each chapter under a night-blue band, its number large on the outer side
const BAND = 52; // mm from the trim's top
const opener = { enabled: true, minHeight: mm(54), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('night') },
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(BAND + 3) } } },
  { kind: 'text', id: 'kicker', content: t({ en: 'Chapter', es: 'Capítulo' }), ...caps(8.5),
    color: col('sun'), placement: at('container', 'top-left', 0, 2) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: COND, fontWeight: 600,
    fontSize: pt(30), lineHeight: 1.05, color: col('paper'), align: 'left', overflow: 'wrap',
    placement: { ...at('#kicker', 'below', 0, 3), size: { width: mm(MEASURE - 26) } } },
  { kind: 'text', id: 'number', content: '{chapterNumber}', fontFamily: COND, fontWeight: 600,
    fontSize: pt(84), lineHeight: 1, color: col('sun'), align: 'right',
    placement: { ...at('container', 'top-right', 0, -6), size: { width: mm(40) } } },
  { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: SERIF, italic: true,
    fontSize: pt(11), lineHeight: 1.38, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { ...at('container', 'top-left', 0, BAND - MARGIN.top + 8),
      size: { width: mm(MEASURE - 10) } } },
] } };
// The contents page wears the same band, with the book's subtitle as its kicker.
const contentsOpener = { ...opener, minHeight: mm(BAND - MARGIN.top + 4), slot: { elements:
  opener.slot.elements.filter((e) => ['band', 'kicker', 'title'].includes(e.id))
    .map((e) => (e.id === 'kicker' ? { ...e, content: '{subtitle}' } : e)) } };
// #endregion

// #region cover: the sun's December and June paths over the panels, the title in the band
const COVER_BAND = 168; // mm
const cover = { enabled: true, slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('night') },
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(COVER_BAND) } } },
  { kind: 'image', id: 'art', resourceId: 'cover',
    placement: { ...at('bleed', 'top-left'), size: { width: 'fill' } } },
  // Stacked upwards from the subtitle, so a title of one line or two keeps its distance.
  { kind: 'text', id: 'subtitle', content: '{subtitle}', fontFamily: SERIF, italic: true,
    fontSize: pt(14), color: col('tint'), align: 'left',
    placement: at('page', 'top-left', MARGIN.inner, COVER_BAND - 22) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: COND, fontWeight: 600,
    fontSize: pt(52), lineHeight: 1, color: col('paper'), align: 'left', overflow: 'wrap',
    placement: { ...at('#subtitle', 'above', 0, -4), size: { width: mm(140) } } },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...caps(8.5), color: col('sun'),
    placement: at('#title', 'above', 0, -4) },
  { kind: 'text', id: 'author', content: '{author}', fontFamily: COND, fontWeight: 600,
    fontSize: pt(13), color: col('ink'), align: 'left',
    placement: at('page', 'top-left', MARGIN.inner, COVER_BAND + 14) },
  { kind: 'text', id: 'edition', content: '{attr.edition}', ...caps(7.5), color: col('muted'),
    placement: at('#author', 'below', 0, 2.5) },
] } };
// #endregion

// #region running-heads: the book on the verso, the chapter on the recto, folios in orange
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content,
  parity, pages: 'body', ...caps(7), color: col('muted'), placement: at('page', edge, x, 12),
  ...extra });
const folio = { color: col('accent'), fontSize: pt(8) };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer, folio),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 9),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 9),
    { align: 'right' }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer,
    { ...folio, align: 'right' }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'top', 0,
  { ...folio, pages: 'opener', align: 'center', placement: at('container', 'bottom', 0, 8) })] };
const bare = { header: { elements: [] }, footer: { elements: [] } };
// #endregion

const contents = { // what :::toc prints: chapters in the condensed face, sections under them
  levels: [
    { level: 1, fontFamily: COND, fontSize: pt(13), fontWeight: 600, lineHeight: pt(18),
      numberFontFamily: MONO, numberFontSize: pt(10), numberFontWeight: 600,
      numberColor: col('accent'), numberWidth: mm(9), numberGap: mm(2), marginTop: pt(10) },
    { level: 2, fontFamily: SERIF, fontSize: pt(9.5), lineHeight: pt(13.5), indent: mm(11),
      numberFontFamily: MONO, numberFontSize: pt(8), numberColor: col('muted'),
      numberWidth: mm(9), numberGap: mm(2) },
  ],
  pageNumber: { fontFamily: MONO, fontSize: pt(8.5), fontWeight: 600, width: mm(8) },
  leader: { char: '. ', gap: mm(2) },
};

const config = () => ({
  locale: t({ en: 'en-gb', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  crossRefs, resourceTypes, colorPalette, toc: contents, header, footer,
  page: { sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: SERIF, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('accent'), // every reference is a link: orange says so
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: COND, color: col('ink'), fontWeight: 600, levels: [
    // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
    // 'any': short chapters start on the next page, recto or verso.
    { level: 1, fontSize: pt(30), numberingTemplate: '{1}',
      breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener,
      marginBottom: pt(0) },
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD * 1.5), numberingTemplate: '{1}.{2}',
      numberSeparator: '   ', marginTop: pt(LEAD / 2), marginBottom: pt(0) },
  ] },
  // The cover and the contents take no number and no contents line, so the first
  // chapter is still chapter 1.
  headingStyles: [
    { id: 'cover', numbered: false, toc: false, advancedDesign: cover, ...bare },
    { id: 'contents', numbered: false, toc: false, advancedDesign: contentsOpener, ...bare },
  ],
  paragraphStyles: [
    { id: 'formula', fontFamily: MONO, fontSize: pt(9), textAlign: 'center',
      firstLineIndent: pt(0), marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
    { id: 'colophon', fontFamily: COND, fontSize: pt(7.5), lineHeight: pt(10.5),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), spaceBetween: pt(4),
      marginTop: pt(LEAD * 3) },
  ],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('night'), headerColor: col('paper'), headerFontFamily: COND,
    headerFontSize: pt(8.2), bodyFontFamily: COND, bodyFontSize: pt(8.6),
    bodyColor: col('ink'), cellPadding: mm(1.4) },
  captionStyle: { fontFamily: COND, fontSize: pt(8.4), color: col('ink'),
    labelBold: true, labelColor: col('accent'), gap: mm(2.5) },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const front = /* @content */ ''; // frontmatter, cover and contents (content.<lang>.md)
const load = /* @content:load */ ''; // chapter 1: content.load.<lang>.md
const array = /* @content:array */ ''; // chapter 2
const battery = /* @content:battery */ ''; // chapter 3
const tables = /* @content:tables */ ''; // the three tables as TSV, blank-line separated
// Four Markdown documents in reading order, one book.
const chapters = [front, load, array, battery].map((markdown) => ({ markdown }));

// #region tables: three tables pasted from a spreadsheet as TSV, parsed into table models
function tableModel(tsv, columnWidths) {
  let m = Object.assign(parseTSV(tsv), { headerRowCount: 1, columnWidths });
  for (let r = 0; r < m.rows.length; r++) { // figures flush right, words flush left
    for (let c = 1; c < m.rows[r].length; c++) m = setAlignment(m, { row: r, col: c }, 'right');
  }
  return m;
}
const [loads, losses, chemistry] = tables.trim().split(/\n\s*\n/);
const TABLES = { loads, losses, chemistry };
// #endregion
const CAPTIONS = t({ en: {
  loads: 'Daily loads of the example cabin on a winter day',
  losses: 'Losses between the panels and the sockets, multiplied',
  chemistry: 'Three battery chemistries for 3,480 Wh of usable energy',
  profile: 'Average draw, hour by hour, on a winter day. Grey: the constant floor of fridge, '
    + 'router and inverter; orange: everything else; pale band: daylight.',
  sun: 'Peak sun hours a day by month at 42°\u00a0N, panels tilted at 60°. December is the '
    + 'design month.',
  soc: 'State of charge of the 5.1 kWh bank over five December days: clear, three overcast, '
    + 'clear. Shaded: night. Dashed: the 20% floor.',
}, es: {
  loads: 'Consumos diarios de la cabaña de ejemplo en un día de invierno',
  losses: 'Pérdidas entre los paneles y los enchufes, multiplicadas',
  chemistry: 'Tres químicas de batería para 3480\u00a0Wh de energía útil',
  profile: 'Consumo medio, hora a hora, en un día de invierno. Gris: el suelo constante de '
    + 'frigorífico, rúter e inversor; naranja: todo lo demás; banda clara: horas de luz.',
  sun: 'Horas de sol pico al día por mes a 42°\u00a0N, con los paneles inclinados 60°. Diciembre '
    + 'es el mes de diseño.',
  soc: 'Estado de carga del banco de 5,1 kWh durante cinco días de diciembre: despejado, tres '
    + 'nublados, despejado. Sombreado: noche. Discontinua: el suelo del 20\u00a0%.',
} });
const table = (id, widths) => ({ id: `tbl:${id}`, typeId: 'table', kind: 'table',
  caption: CAPTIONS[id], createdAt: 0, updatedAt: 0,
  table: { model: tableModel(TABLES[id], widths) } });
const figure = (id, [w, h]) => ({ id: `fig:${id}`, typeId: 'figure', kind: 'svg',
  caption: CAPTIONS[id], altText: CAPTIONS[id], createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: w * 10, height: h * 10 } });
const resources = [
  { id: 'cover', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'cover.svg', width: TRIM.w * 10, height: 110 * 10 } },
  figure('profile', [MEASURE, 50]), figure('sun', [MEASURE, 46]), figure('soc', [MEASURE, 50]),
  table('loads', [44, 18, 18, 18]), table('losses', [70, 20]),
  table('chemistry', [26, 16, 15, 12, 26, 12]),
];

// #region art: the cover and three charts, drawn in code in the book's palette
// An SVG loaded as an image has no access to the page's web fonts (gotcha:
// svg-no-webfonts), so the charts embed the one IBM Plex Mono face their labels use.
async function labelFace() {
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5/files/'
    + 'ibm-plex-mono-latin-400-normal.woff2';
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `@font-face{font-family:L;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`
    + `text{font-family:L;font-size:2.5px;fill:${palette.muted}}`;
}
const n2 = (v) => +v.toFixed(2);
const sheet = (w, h, body, style = '') => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w * 10}" height="${h * 10}" viewBox="0 0 ${w} ${h}"><style>${style}</style>`
  + `${body}</svg>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" `
  + `height="${n2(h)}" fill="${palette[fill]}" ${extra}/>`;
const pathOf = (pts) => pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L');
const line = (pts, stroke, width, extra = '') => `<path d="M${pathOf(pts)}" fill="none" `
  + `stroke="${palette[stroke]}" stroke-width="${width}" ${extra}/>`;
const label = (x, y, text, anchor = 'middle') => `<text x="${n2(x)}" y="${n2(y)}" `
  + `text-anchor="${anchor}">${text}</text>`;
// A chart frame: plot area from x0 to w − 2, y from top 3 to the axis at h − 7.
function axes(w, h, x0, max, step, unit) {
  const y = (v) => h - 7 - (v / max) * (h - 10);
  let out = '';
  for (let v = 0; v <= max; v += step) {
    out += line([[x0, y(v)], [w - 2, y(v)]], 'rule', v ? 0.15 : 0.35)
      + label(x0 - 1.5, y(v) + 0.9, `${v}${v === max ? unit : ''}`, 'end');
  }
  return { out, y };
}
// The hourly profile of chapter 1, built from the same loads as its table.
const FLOOR = 27.46; // W: fridge 275 Wh + router + inverter 192 Wh each, over 24 hours
const EXTRA = Array.from({ length: 24 }, (_, h) => (h >= 18 && h <= 22 ? 30 : 0) // lights
  + (h === 7 || h === 19 ? 30 : 0) + (h >= 9 && h <= 12 ? 45 : 0) // pump, laptop
  + (h === 21 || h === 22 ? 10 : 0) + (h >= 17 && h <= 22 ? 15 : 0)); // phones, stove fan
function profileArt(w, h) {
  const x0 = 12, bw = (w - 2 - x0) / 24;
  const { out, y } = axes(w, h, x0, 120, 30, ' W');
  let bars = rect(x0 + 8.5 * bw, 3, 9.25 * bw, h - 10, 'tint') + out; // daylight, 8:30 to 17:45
  EXTRA.forEach((extra, i) => {
    const x = x0 + i * bw + 0.35;
    bars += rect(x, y(FLOOR), bw - 0.7, y(0) - y(FLOOR), 'rule')
      + (extra ? rect(x, y(FLOOR + extra), bw - 0.7, y(FLOOR) - y(FLOOR + extra), 'accent') : '');
  });
  const hours = [0, 6, 12, 18, 24].map((hr) => label(x0 + hr * bw, h - 2.5, `${hr}h`)).join('');
  return bars + hours;
}
const PSH = [3.1, 3.9, 4.6, 5.0, 5.2, 5.3, 5.6, 5.6, 5.2, 4.3, 3.3, 2.8]; // peak sun hours
const MONTHS = t({ en: 'JFMAMJJASOND', es: 'EFMAMJJASOND' });
function sunArt(w, h) {
  const x0 = 12, bw = (w - 2 - x0) / 12;
  const { out, y } = axes(w, h, x0, 6, 1, ' h');
  const value = (v) => (LANG === 'es' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));
  return out + PSH.map((v, i) => rect(x0 + i * bw + 1.6, y(v), bw - 3.2, y(0) - y(v),
    i === 11 ? 'accent' : 'night') + label(x0 + (i + 0.5) * bw, y(v) - 1.2, value(v))
    + label(x0 + (i + 0.5) * bw, h - 2.5, MONTHS[i])).join('');
}
// Five December days, hour by hour: the array (620 W × 0.79) against the load profile.
function socSeries() {
  const bank = 5120, days = [2.8, 0.5, 0.4, 0.7, 2.8];
  const sun = Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 17
    ? Math.sin(Math.PI * (h - 7.5) / 9) : 0));
  const sum = sun.reduce((a, b) => a + b);
  let soc = 0.8 * bank;
  const out = [0.8];
  days.forEach((d) => sun.forEach((s, h) => {
    soc = Math.min(bank, soc + d * 620 * 0.79 * s / sum - FLOOR - EXTRA[h]);
    out.push(soc / bank);
  }));
  return out;
}
function socArt(w, h) {
  const x0 = 12, step = (w - 2 - x0) / 120;
  const { out, y } = axes(w, h, x0, 100, 20, t({ en: '%', es: ' %' }));
  let night = '';
  for (let d = 0; d < 5; d++) {
    night += rect(x0 + d * 24 * step, 3, 8.5 * step, h - 10, 'tint')
      + rect(x0 + (d * 24 + 17.75) * step, 3, 6.25 * step, h - 10, 'tint')
      + label(x0 + (d * 24 + 12) * step, h - 2.5, t({ en: `day ${d + 1}`, es: `día ${d + 1}` }));
  }
  const curve = line(socSeries().map((v, i) => [x0 + i * step, y(v * 100)]), 'accent', 0.6,
    'stroke-linejoin="round"');
  return night + out + line([[x0, y(20)], [w - 2, y(20)]], 'night', 0.35,
    'stroke-dasharray="1.2 0.8"') + curve;
}
// The cover: the sun's paths in June and December over a tilted panel, on the night band.
function coverArt(w, h) {
  const horizon = 86, cx = w * 0.56;
  const path = (r, k) => line(Array.from({ length: 41 }, (_, i) => {
    const a = Math.PI * (i / 40);
    return [cx - r * Math.cos(a), horizon - k * r * Math.sin(a)];
  }), 'sun', 0.5);
  const sunAt = (r, k, color, size) => `<circle cx="${n2(cx)}" cy="${n2(horizon - k * r)}" `
    + `r="${size}" fill="${palette[color]}"/>`;
  let cells = ''; // a panel tilted towards the low sun, 6 × 4 cells
  const px = 14, py = 84, pw = 46, ph = 30, skew = 14;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const [x, y] = [px + c * pw / 6 + (r + 0.5) * skew / 4, py - (r + 1) * ph / 4];
      const pts = [[x, y], [x + pw / 6 - 0.8, y], [x + pw / 6 - 0.8 + skew / 4 * 0.8,
        y - ph / 4 + 0.8], [x + skew / 4 * 0.8, y - ph / 4 + 0.8]].map(([a, b]) => [a, b + ph / 4]);
      cells += `<path d="M${pts.map(([a, b]) => `${n2(a)} ${n2(b)}`).join('L')}Z" `
        + `fill="${palette.paper}" fill-opacity="${0.16 + ((r + c) % 3) * 0.05}"/>`;
    }
  }
  return path(70, 0.9) + path(54, 0.45) + sunAt(70, 0.9, 'sun', 2.2) + sunAt(54, 0.45, 'sun', 4)
    + line([[8, horizon], [w - 8, horizon]], 'sun', 0.35) + cells;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses.
const FONTS = {
  'IBM Plex Serif': ['400', '400i', '600'],
  'IBM Plex Sans Condensed': ['400', '600', '700'],
  'IBM Plex Mono': ['400', '600', '700'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const text = chapters.map((chapter) => chapter.markdown).join('\n');
await prepareFonts(text, config(), kitFonts(FONTS));
const face = await labelFace();
await loadSvg('cover.svg', sheet(TRIM.w, 110, coverArt(TRIM.w, 110)));
await loadSvg('profile.svg', sheet(MEASURE, 50, profileArt(MEASURE, 50), face));
await loadSvg('sun.svg', sheet(MEASURE, 46, sunArt(MEASURE, 46), face));
await loadSvg('soc.svg', sheet(MEASURE, 50, socArt(MEASURE, 50), face));
// One VDTDocument per Markdown document.
const docs = await withLoadedFonts(book, { ...kitFonts(FONTS), text });
showPages(docs, { title: t({ en: 'Power for a Cabin', es: 'Energía para una cabaña' }) });
// One PDF for the book: a reference in chapter 3 links to its table in chapter 1.
offerPdf(() => renderToPdf(docs, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
