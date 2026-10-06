// ═══ Postext Cookbook · Nº 133 · A broadsheet on six columns ════════════════════
// https://postext.dev/en/cookbook/broadsheet-six-columns
// Code: MIT · Text: original (CC BY 4.0) · Photos: generated (CC BY 4.0)
// Fonts: Newsreader, Playfair Display, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.18.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'broadsheet-six-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, a cool ink and one blue
const palette = {
  ink: '#15171a', // text, headlines and the heavy rules
  paper: '#f7f5ef', // newsprint; also type reversed out of a band
  accent: '#164a72', // the paper's blue: kickers, section flags, the fact boxes' stripe
  tint: '#e6ebef', // the fact boxes
  rule: '#8e9196', // hairlines: the column rules, table rules
  muted: '#55595f', // bylines, credits, the folio line
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // defaults link to 'main-color': point it at the ink
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const MARGIN = { top: 16, bottom: 14, side: 12 }; // mm: a broadsheet's narrow, even margins
const GUTTER = 4; // mm: six columns of 55.2 mm on the 351 mm text width
const LEAD = 12.2; // pt: the baseline grid under 9 pt text (× 1.36)
const sans = (size, weight, look = {}) => ({ fontFamily: 'Archivo Narrow', fontSize: pt(size),
  fontWeight: weight, color: col('ink'), ...look });
const caps = (size, weight, colour = 'ink') => sans(size, weight, { color: col(colour),
  textTransform: 'uppercase', letterSpacing: pt(size * 0.14) });
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', color: col('ink'), ...look, placement }); // (gotcha: overflow-ellipsis-default)
const rule = (id, under, weight, gap = 0) => ({ kind: 'rule', id, thickness: pt(weight),
  color: col('ink'), placement: { ...at(under, 'above', 0, -gap), size: { width: 'fill' } } });
// An empty box a whole number of grid lines deep sets each opener's depth.
const depth = (lines) => ({ kind: 'box', id: 'depth', style: {}, placement: {
  ...at('container', 'top-left'), size: { width: 'fill', height: pt(lines * LEAD) } } });

// #region nameplate: the front page's H1 is the paper's name, between two ears
const ear = (side, lines) => lines.map(([id, content, look], i) => text(id, content,
  { ...look, align: side }, { ...(i === 0 ? at('container', `top-${side}`, 0, 4)
    : at(`#${lines[i - 1][0]}`, 'below', 0, 0.8)), size: { width: mm(30) } }));
const nameplate = { enabled: true, slot: { elements: [
  depth(9), // nine grid lines; the rules and the dateline hang from the foot
  { kind: 'rule', id: 'foot', thickness: pt(0.5), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -2), size: { width: 'fill' } } },
  ...[['left', '{attr.issue}'], ['center', '{publishDate}'], ['right', '{attr.price}']].map(
    ([align, content]) => text(`date-${align}`, content, { ...caps(8, 600), align },
      { ...at('#foot', 'above', 0, -1.5), size: { width: 'fill' } })),
  rule('thin', '#date-left', 0.5, 1.6), rule('heavy', '#thin', 3, 0.7),
  text('name', '{titleText}', { fontFamily: 'Playfair Display', fontSize: pt(64),
    fontWeight: 900, lineHeight: 1, align: 'center' }, // (gotcha: design-lineheight-multiple)
  { ...at('#heavy', 'above', 0, -2.5), size: { width: 'fill' } }),
  ...ear('left', [['w-kicker', 'Weather', caps(7.5, 700, 'accent')],
    ['w-outlook', '{attr.outlook}', { fontFamily: 'Newsreader', fontSize: pt(9.5), italic: true,
      lineHeight: 1.25 }], ['w-temps', '{attr.temps}', sans(17, 700)]]),
  ...ear('right', [['t-kicker', 'Tides', caps(7.5, 700, 'accent')],
    ['t-times', '{attr.tides}', { fontFamily: 'Newsreader', fontSize: pt(9.5), italic: true,
      lineHeight: 1.25 }], ['t-height', '{attr.height}', sans(17, 700)]]),
] } };
// #endregion

// #region answer: six equal columns, and floats that take k of them
const layout = { layoutType: 'multiple', columnCount: 6, gutterWidth: mm(GUTTER),
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } };
// A float across k columns takes the head of the first run of k empty columns that start
// level, counted left to right from the column the text is in, or the foot of that column
// and the empty ones after it. So the order of the fences places them:
//   :::callout{type="head" placement="top" columns="4"}  ← columns 1–4, the text not begun
//   ::resource{id="quays"}                              ← columns 1–4 again, under the box
//   …the lead runs in columns 1–4…
//   :::callout{type="head" placement="top" columns="2"}  ← columns 5–6: 1–4 hold text now
const photo = (id, file, [w, h], columns, extra) => ({ id, typeId: 'photo', kind: 'bitmap',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: file, format: 'jpeg', width: w, height: h },
  placement: { position: 'top', span: 'column', columns },
  note: 'Photograph: Despatch picture desk', ...extra });
// A table across two columns, at the foot of the column that cites it and the next one.
const panel = (id, model, extra) => ({ id, typeId: 'panel', kind: 'table', createdAt: 0,
  updatedAt: 0, table: { model }, placement: { position: 'bottom', columns: 2 }, ...extra });
// As many columns as the page has (or more) is page-wide: columns: 6 = span: 'page'.
// #endregion

// #region boxes: headline boxes, fact boxes and advertisements
const NO_PAD = { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) };
const head = { id: 'head', backgroundEnabled: false, padding: NO_PAD, // a headline and its deck
  titleStyle: { ...caps(8.5, 700, 'accent'), gap: mm(1.5) }, // the kicker: the fence's title
  marginBottom: pt(LEAD), keepTogether: true,
  body: { fontFamily: 'Newsreader', fontSize: pt(13), lineHeight: pt(16.5), italic: true,
    textAlign: 'left', firstLineIndent: pt(0) } };
const jump = { ...head, id: 'jump', marginTop: pt(LEAD), // a page-wide head under a 1 pt rule
  stripe: { enabled: true, side: 'top', width: pt(1), color: col('ink') },
  padding: { ...NO_PAD, top: mm(2.5) } };
const facts = { id: 'facts', background: col('tint'), keepTogether: true,
  stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') },
  padding: { top: mm(2.5), right: mm(3), bottom: mm(3), left: mm(3) },
  titleStyle: { ...caps(8.5, 700, 'accent'), gap: mm(1.5) }, marginBottom: pt(LEAD),
  body: { fontFamily: 'Archivo Narrow', fontSize: pt(9), lineHeight: pt(11.5),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true } };
const weather = { ...facts, id: 'weather', keepTogether: true,
  padding: { top: mm(3), right: mm(4), bottom: mm(4), left: mm(4) },
  body: { ...facts.body, fontFamily: 'Newsreader', fontSize: pt(10.5), lineHeight: pt(14) } };
const ad = { id: 'ad', backgroundEnabled: false, keepTogether: true,
  border: { enabled: true, color: col('ink'), width: pt(0.75) },
  padding: { top: mm(5), right: mm(6), bottom: mm(5), left: mm(6) },
  titleStyle: { ...caps(7, 600, 'muted'), gap: mm(3) }, // "Advertisement"
  body: { fontFamily: 'Archivo Narrow', fontSize: pt(13), lineHeight: pt(17),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true } };
const sky = { id: 'sky', background: col('tint'), columnGap: mm(GUTTER), // the teaser strip
  padding: { top: mm(2.5), right: mm(3), bottom: mm(2.5), left: mm(3) }, marginBottom: pt(LEAD),
  body: { fontFamily: 'Archivo Narrow', fontSize: pt(9.5), lineHeight: pt(12),
    textAlign: 'left', firstLineIndent: pt(0) } };
const headline = (id, size, look = {}) => ({ id, fontFamily: 'Playfair Display', fontWeight: 700,
  fontSize: pt(size), lineHeight: pt(size * 1.06), marginTop: pt(0),
  marginBottom: pt(size * 0.22), ...look });
// #endregion

// #region sections: inside pages open on a flag; the opinion page takes five columns
const flag = { enabled: true, slot: { elements: [
  depth(4),
  { kind: 'rule', id: 'bar', thickness: pt(3), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -2.5), size: { width: 'fill' } } },
  text('flag', '{titleText}', { fontFamily: 'Playfair Display', fontSize: pt(30),
    fontWeight: 900, lineHeight: 1 }, at('#bar', 'above', 0, -1.5)),
  text('tag', '{attr.tag}', { ...caps(8, 600, 'muted'), align: 'right' },
    { ...at('#bar', 'above', 0, -2), size: { width: 'fill' } }),
] } };
const FOLIO = 8; // mm from the top edge to the folio line, its rule 4.5 mm lower
const folio = (parity, side, s) => [ // s: +1 on a verso, −1 on a recto
  text(`n-${parity}`, '{pageNumber}', { ...sans(10, 700), align: side },
    at('page', `top-${side}`, s * MARGIN.side, FOLIO)),
  text(`t-${parity}`, '{title} · {publishDate}', { ...caps(7.5, 600, 'muted'), align: side },
    at(`#n-${parity}`, s > 0 ? 'right-of' : 'left-of', s * 3, 0.9)),
].map((element) => ({ ...element, parity }));
const header = { elements: [...folio('even', 'left', 1), ...folio('odd', 'right', -1),
  { kind: 'rule', id: 'folio-rule', thickness: pt(0.5), color: col('ink'),
    placement: { ...at('page', 'top-left', MARGIN.side, FOLIO + 4.5),
      size: { width: mm(375 - 2 * MARGIN.side) } } }] };
const opinion = { id: 'opinion', advancedDesign: flag, // its section runs in five columns
  layout: { layoutType: 'multiple', columnCount: 5 } }; // 67 mm: a 47-character measure
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, resourceTypes,
  page: { sizePreset: 'broadsheet', dpi: 150, backgroundColor: col('paper'), // 375 × 597 mm
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.side),
      right: mm(MARGIN.side) } },
  layout,
  bodyText: { fontFamily: 'Newsreader', fontSize: pt(9), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(3), indentAfterHeading: false,
    minWordSpacing: 0.8, // a 38-character measure: spaces never close up,
    maxJustifyTracking: 15, // and a little tracking comes before a wide one
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'Playfair Display', fontWeight: 700, color: col('ink'),
    balancing: { trailing: false }, // every page closes a section: fill each column to the foot
    levels: [
    // Restated (gotcha: headings-drop-h1-break): each section opens a page of its own.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' }, advancedDesign: flag },
    { level: 2, fontSize: pt(17), lineHeight: pt(19), marginTop: pt(LEAD), marginBottom: pt(3) },
    { level: 3, fontFamily: 'Archivo Narrow', fontSize: pt(9.5), lineHeight: pt(LEAD),
      marginTop: pt(LEAD * 0.5), marginBottom: pt(0) },
  ] },
  headingStyles: [
    { id: 'front', advancedDesign: nameplate, header: { elements: [] } }, // no folio line
    opinion,
    headline('lead', 50, { fontWeight: 800 }), headline('second', 25), headline('third', 30),
    headline('ad-title', 40, { fontWeight: 900 }), headline('ad-big', 60, { fontWeight: 900 }),
    headline('ad-huge', 88, { fontWeight: 900, lineHeight: pt(84) }), headline('ad-date', 32),
    headline('stat', 26, { marginTop: pt(LEAD * 0.5), marginBottom: pt(0) }), // a fact box's figure
  ],
  calloutStyles: [head, jump, facts, weather, ad, sky],
  paragraphStyles: [
    { id: 'byline', ...sans(8.5, 600), textAlign: 'left', firstLineIndent: pt(0),
      textTransform: 'uppercase' },
    { id: 'intro', fontSize: pt(11), lineHeight: pt(LEAD * 1.25), firstLineIndent: pt(0),
      fontWeight: 600, textAlign: 'left' }, // the drop intro: larger, bold and ragged
    { id: 'brief', firstLineIndent: pt(0), spaceBetween: pt(LEAD) }, // the digest's items
    { id: 'label', ...sans(10, 700, { color: col('accent'), textTransform: 'uppercase' }),
      lineHeight: pt(LEAD), firstLineIndent: pt(0),
      textAlign: 'left', marginBottom: pt(LEAD * 0.5) }, // In brief, Letters, What's on
    { id: 'flush', firstLineIndent: pt(0) },
    { id: 'turn', ...sans(8.5, 700), textAlign: 'right', firstLineIndent: pt(0) },
    { id: 'ad-deck', fontFamily: 'Newsreader', fontSize: pt(16), lineHeight: pt(20),
      italic: true, firstLineIndent: pt(0), textAlign: 'left' },
    { id: 'imprint', ...sans(7, 400), color: col('muted'), textAlign: 'left',
      firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  captionStyle: { fontFamily: 'Archivo Narrow', fontSize: pt(8.5), gap: mm(1.5),
    labelBold: true, color: col('ink'), note: { fontSize: pt(7), color: col('muted') } },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Archivo Narrow',
    headerFontSize: pt(8), bodyFontFamily: 'Archivo Narrow', bodyFontSize: pt(8.5),
    bodyColor: col('ink'), cellPadding: mm(1.2) },
  header, footer: { elements: [] }, // the folio line sits at the head of inside pages
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const unnumbered = (id, name, captionStyle) => ({ id, name, shortLabel: name, captionPrefix: '',
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionStyle });
const resourceTypes = [unnumbered('photo', 'Photo'),
  unnumbered('panel', 'Panel', { position: 'above', fontSize: pt(9.5) })];
// #region art: the two tables as data, and the forecast's sky icons drawn in code
const cell = (content, extra = {}) => ({ content, ...extra });
const th = (content, align = 'left') => cell(content, { isHeader: true, align });
const funding = { headerRowCount: 1, columnWidths: [62, 18, 20], rows: [
  [th('Source'), th('£m', 'right'), th('Share', 'right')],
  ...[['National transport fund', 318], ['City council borrowing', 212], ['Port authority', 64],
    ['Eastern Quays developers', 46], ['**Total**', 640]].map(([who, m]) => [cell(who),
    cell(m === 640 ? '**640**' : String(m), { align: 'right' }),
    cell(`${Math.round((100 * m) / 640)}%`, { align: 'right' })])] };
const cloud = (x, y, k, fill) => `<path fill="${fill}" d="M${x} ${y}h${60 * k}a${16 * k} ${16 * k} `
  + `0 0 0-6-31a${22 * k} ${22 * k} 0 0 0-40-6a${15 * k} ${15 * k} 0 0 0-14 37z"/>`;
const sun = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${palette.accent}"/>`
  + [...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; const c = Math.cos(a);
    const s = Math.sin(a); return `<path d="M${(x + c * r * 1.35).toFixed(1)} `
      + `${(y + s * r * 1.35).toFixed(1)}L${(x + c * r * 1.75).toFixed(1)} `
      + `${(y + s * r * 1.75).toFixed(1)}" stroke="${palette.accent}" stroke-width="4"/>`;
  }).join('');
const rain = [0, 1, 2].map((i) => `<path d="M${98 + i * 18} 92l-6 16" stroke="${palette.accent}" `
  + 'stroke-width="4"/>').join('');
const svg = (body) => '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" '
  + `viewBox="0 0 240 120">${body}</svg>`;
const SKY = { // 240 × 120 units: a symbol per kind of day
  'sky-sunny': svg(sun(120, 60, 24)),
  'sky-bright': svg(sun(100, 48, 20) + cloud(110, 96, 1, palette.rule)),
  'sky-cloudy': svg(cloud(80, 90, 1.2, palette.rule)),
  'sky-rain': svg(cloud(84, 80, 1.1, palette.muted) + rain),
};
function forecast() { // Thursday to Monday: sky, outlook, °C, wind, rain, sun, high water
  const days = [['Thu', 'rain', 'Rain from midday, clearing late', 14, 9, 'W 18', 12, '7.31',
    '18.12', '7.21 · 19.40'], ['Fri', 'bright', 'Bright and blustery', 13, 6, 'NW 22', 1, '7.33',
    '18.10', '8.02 · 20.21'], ['Sat', 'sunny', 'Sunny, a cold wind', 12, 5, 'N 14', 0, '7.35',
    '18.08', '8.44 · 21.03'], ['Sun', 'cloudy', 'Cloudy and dry', 12, 7, 'NE 8', 0, '7.36',
    '18.05', '9.27 · 21.48'], ['Mon', 'sunny', 'Frost, then sunshine', 13, 2, 'E 6', 0, '7.38',
    '18.03', '10.13 · 22.37']];
  const right = (v) => cell(String(v), { align: 'right' });
  return { headerRowCount: 1, columnWidths: [7, 15, 25, 6, 6, 8, 8, 8, 8, 13], rows: [
    [th('Day'), th(''), th('Outlook'), th('High', 'right'), th('Low', 'right'),
      th('Wind mph', 'right'), th('Rain mm', 'right'), th('Sunrise', 'right'),
      th('Sunset', 'right'), th('High water', 'right')],
    ...days.map(([day, sky, text, hi, lo, wind, mm, rise, set, tide]) => [cell(`**${day}**`),
      cell('', { image: { resourceId: `sky-${sky}` } }), cell(text), right(`${hi}°`),
      right(`${lo}°`), right(wind), right(mm), right(rise), right(set), right(tide)])] };
}
// #endregion
const resources = [
  photo('quays', 'quays-1440.jpg', [1440, 1080], 4, {
    altText: 'A cobbled harbour quay at sunrise, with old rail tracks, three dockside cranes '
      + 'and brick warehouses beside calm water.',
    caption: '**The end of the line.** The Eastern Quays at sunrise. The trams will run on '
      + 'the old dock railway’s route past the bonded warehouses.' }),
  photo('barrier', 'barrier-1152.jpg', [1152, 1152], 2, {
    altText: 'Three engineers in orange jackets watch a steel flood gate hold back a high '
      + 'tide between two concrete towers.',
    caption: '**Holding.** Engineers watch the gate at 6.40 yesterday morning.' }),
  photo('terrace', 'terrace-1440.jpg', [1440, 1080], 4, {
    altText: 'A woman carries a box up the steps of a red-brick terraced house on an '
      + 'autumn street.',
    caption: '**Moving day** on Albion Terrace, where a two-bedroom flat now lets for £1,240.' }),
  photo('baths', 'baths-1536x768.jpg', [1536, 768], 3, {
    altText: 'A long Victorian swimming pool under an iron and glass roof, with one woman '
      + 'swimming and wooden cubicles along both sides.',
    caption: '**Forty lengths.** The Albert Baths, opened in 1894, on a weekday morning.' }),
  photo('stage', 'stage-1800.jpg', [1800, 1350], 5, {
    altText: 'Three actors in 1920s costume in a shipping office set on a theatre stage.',
    caption: '**Ledgers and lies.** The shipping office of *The Tally Clerk*.',
    note: 'Photograph: Corrington Playhouse' }),
  panel('funding', funding, { caption: '**Paying for the line**',
    note: 'Source: Corrington City Council, cabinet report, October 2026.' }),
  { ...panel('forecast', forecast(), { placement: { position: 'here' },
    caption: '**The next five days in Corrington**',
    note: 'High water at Salter’s Cut, Arle gate. Forecast: Despatch weather desk.' }) },
  ...Object.keys(SKY).map((id) => ({ id, typeId: 'photo', kind: 'svg', createdAt: 0,
    updatedAt: 0, svg: { fileId: `${id}.svg`, width: 240, height: 120 }, altText: id.slice(4) })),
];
const front = /* @content */ ''; // content.en.md: the front page
const city = /* @content:city */ ''; // content.city.en.md: page 2
const views = /* @content:opinion */ ''; // content.opinion.en.md: page 3
const back = /* @content:back */ ''; // content.back.en.md: page 4
const markdown = [front, city, views, back].join('\n\n');

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  Newsreader: ['400', '400i', '600', '700', '700i'], 'Playfair Display': ['700', '800', '900'],
  'Archivo Narrow': ['400', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all([loadImage('quays-1440.jpg', asset('quays-1440.jpg')),
  loadImage('barrier-1152.jpg', asset('barrier-1152.jpg')),
  loadImage('terrace-1440.jpg', asset('terrace-1440.jpg')),
  loadImage('baths-1536x768.jpg', asset('baths-1536x768.jpg')),
  loadImage('stage-1800.jpg', asset('stage-1800.jpg')),
  ...Object.entries(SKY).map(([id, svg]) => loadSvg(`${id}.svg`, svg))]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'The Corrington Despatch' });

// @kit
