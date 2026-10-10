// ═══ Postext Cookbook · Nº 134 · A business section on salmon newsprint ═══════════════
// https://postext.dev/en/cookbook/business-section-on-salmon
// Code: MIT · Text: original (CC BY 4.0) · Pictures: generated (CC BY 4.0)
// Fonts: Source Serif 4, Playfair Display, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// An eight-page Berliner daily: four news pages on grey-white newsprint in five columns, then
// the Business section on salmon paper in six, with its own flag and accent.
// One heading style carries the change; a :::paper run gives Folio the salmon stock.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'business-section-on-salmon';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, ink and a news red; the Business section swaps three of them
const palette = {
  ink: '#16181b', // text and heavy rules
  paper: '#f6f4ef', // the page: grey-white newsprint (salmon in Business)
  accent: '#b3261e', // news red: flags, kickers, chart marks (petrol in Business)
  tint: '#e8e4da', // box fills (a deeper salmon in Business)
  rule: '#9d9a93', // hairlines
  muted: '#5c5954', // bylines, the folio line, credits
  salmon: '#f2d3c0', // the business stock, and the teaser patches on page 1
  petrol: '#0f4c5c', // the business accent
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const PAGE = { width: 315, height: 470 }; // mm: the 'berliner' preset
const M = { top: 19, bottom: 14, side: 12 }; // mm: narrow newspaper margins, not mirrored
const WIDE = PAGE.width - 2 * M.side; // the text block's width
const LEAD = 11.4; // pt: the body leading, the same in both sections so the grid holds
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', color: col('ink'), ...look, placement }); // no text ends in an ellipsis
const sans = (size, weight = 400, look = {}) => ({ fontFamily: 'Archivo Narrow',
  fontSize: pt(size), fontWeight: weight, ...look });
const caps = (size, weight, colour = 'ink') => sans(size, weight, { color: col(colour),
  textTransform: 'uppercase', letterSpacing: pt(size * 0.16) });
const rule = (id, weight, placement) => ({ kind: 'rule', id, thickness: pt(weight),
  color: col('ink'), placement: { ...placement, size: { width: 'fill' } } });
const box = (id, style, placement, size) => ({ kind: 'box', id, style, placement: { ...placement,
  size } }); // an empty box a whole number of grid lines deep sets an opener's depth:
const depth = (lines) => box('depth', {}, at('container', 'top-left'), { width: 'fill',
  height: pt(lines * LEAD) });
const pad = (y, x) => ({ top: mm(y), right: mm(x), bottom: mm(y), left: mm(x) });
const patch = (fill, padding = pad(1.5, 3)) => ({ backgroundColor: col(fill), padding });

// #region nameplate: page 1's H1 is the paper's name, between the ears and the date line
const nameplate = { enabled: true, slot: { elements: [
  depth(13),
  rule('foot', 0.5, at('#depth', 'align-bottom', 0, -2)),
  ...[['left', '{attr.issue}'], ['center', '{publishDate}'], ['right', '{attr.price}']].map(
    ([align, content]) => text(`date-${align}`, content, { ...caps(8, 600), align },
      { ...at('#foot', 'above', 0, -1.6), size: { width: 'fill' } })),
  rule('thin', 0.5, at('#date-left', 'above', 0, -1.8)),
  rule('heavy', 3, at('#thin', 'above', 0, -0.8)),
  text('name', '{titleText}', { fontFamily: 'Playfair Display', fontSize: pt(76), fontWeight: 900,
    lineHeight: 1, align: 'center' }, { ...at('#heavy', 'above', 0, -3), size: { width: 'fill' } }),
  text('weather', 'Weather · {attr.weather}', { ...caps(8, 700), box: patch('tint') },
    at('container', 'top-left')),
  // The right ear points to the salmon pages, on a patch of the same colour.
  text('ear', 'Business · the salmon pages, 5–8', { ...caps(8, 700), box: patch('salmon') },
    at('container', 'top-right')),
] } };
// #endregion

// #region flags: an inside page opens with a flag; the folio line runs above it
const flagParts = [
  depth(3),
  rule('bar', 3, at('#depth', 'align-bottom', 0, -1.4)),
  text('flag', '{titleText}', { ...caps(12, 700, 'paper'), box: patch('accent', pad(1.3, 3.5)) },
    at('#bar', 'above')),
];
const FOLIO = 9; // mm from the top edge
const folioLine = (parity, side, s) => [ // s: +1 on a verso (folio on the left), −1 on a recto
  text(`n-${parity}`, '{pageNumber}', { ...sans(11, 700), align: side },
    at('page', `top-${side}`, s * M.side, FOLIO)),
  text(`t-${parity}`, '{title} · {publishDate}', { ...caps(7.5, 600, 'muted'), align: side },
    at(`#n-${parity}`, s > 0 ? 'right-of' : 'left-of', s * 3, 1)),
  text(`c-${parity}`, '{chapterTitle}', { ...caps(7.5, 700, 'accent'),
    align: s > 0 ? 'right' : 'left' }, at('page', `top-${s > 0 ? 'right' : 'left'}`,
    -s * M.side, FOLIO + 1)),
].map((element) => ({ ...element, parity }));
const header = { elements: [...folioLine('even', 'left', 1), ...folioLine('odd', 'right', -1),
  { kind: 'rule', id: 'folio-rule', thickness: pt(0.5), color: col('ink'), placement: {
    ...at('page', 'top-left', M.side, FOLIO + 5), size: { width: mm(WIDE) } } }] };
// #endregion

// #region answer: one heading style turns a page into a Business page
// page.backgroundColor links to 'paper', so the section's palette, which turns 'paper' salmon,
// repaints every page of the section: the opener and the pages its copy runs on to.
const business = {
  id: 'business',
  advancedDesign: { enabled: true, slot: { elements: flagParts } },
  // The swap: the page, flags, kickers, the folio line, chart marks and table heads follow.
  palette: { paper: palette.salmon, accent: palette.petrol, tint: '#e6bfa8' },
  // Six narrower columns, ruled as the news pages are.
  layout: { layoutType: 'multiple', columnCount: 6, gutterWidth: mm(4) },
  bodyStyle: { fontSize: pt(8.8), lineHeight: pt(LEAD) },
};
// The section front: the same style, with a bigger flag over the market close strip.
const front = () => ({ ...business, id: 'business-front', advancedDesign: { enabled: true, slot: {
  elements: [depth(10),
    text('title', 'Business', { fontFamily: 'Playfair Display', fontSize: pt(58), fontWeight: 900,
      lineHeight: 1, color: col('accent') }, at('container', 'top-left', 0, -1)),
    text('tag', 'Companies · Markets · Money', caps(9, 700, 'accent'),
      at('#title', 'right-of', 5, 9)),
    rule('top', 3, at('#title', 'below', 0, 2)),
    ...STRIP().flatMap(([name, value, change], i) => [ // the day's close, from the market data
      text(`s${i}`, name, caps(7, 700, 'muted'), at('#top', 'below', (i * WIDE) / 6, 1.8)),
      text(`v${i}`, value, sans(13, 700), at(`#s${i}`, 'below', 0, 0.6)),
      text(`c${i}`, change, sans(9.5, 600, { color: col(change[0] === '+' ? 'accent' : 'muted') }),
        at(`#v${i}`, 'right-of', 1.6, 1))]),
    rule('under', 0.5, at('#depth', 'align-bottom', 0, -1.4))] } } });
// hook-up: headingStyles lists both, and the Markdown wraps pages 5–8 in
//   :::paper{type="newsprint" shade="#faede6"}   ← the stock Folio prints them on
//   # Business {style="business-front"}  …  # Markets {style="business"}  …  :::
// #endregion

// #region boxes: headlines across the page, story breaks, briefs, panels and adverts
const none = pad(0, 0);
const banner = { id: 'banner', backgroundEnabled: false, padding: none,
  titleStyle: { ...caps(8.5, 700, 'accent'), gap: mm(1.2) }, // the kicker
  marginTop: pt(0), marginBottom: pt(LEAD / 2),
  body: { fontFamily: 'Source Serif 4', fontSize: pt(13), lineHeight: pt(16.5), textAlign: 'left',
    firstLineIndent: pt(0) } };
const story = { ...banner, id: 'story', marginTop: pt(LEAD), padding: { ...none, top: mm(2.5) },
  stripe: { enabled: true, side: 'top', width: pt(1), color: col('ink') } };
const boxBody = { fontFamily: 'Archivo Narrow', fontSize: pt(9.5), lineHeight: pt(LEAD),
  textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true, boldColor: col('accent') };
const briefs = { id: 'briefs', background: col('tint'), padding: pad(2.8, 3),
  titleStyle: { ...caps(9, 700, 'accent'), gap: mm(1.5) }, body: boxBody };
const teaser = { ...briefs, id: 'teaser', background: col('salmon'), columnGap: mm(4.5),
  body: { ...boxBody, fontSize: pt(10.5), lineHeight: pt(13.5) } };
const panel = { ...story, id: 'panel', marginTop: pt(0), titleStyle: briefs.titleStyle,
  stripe: { ...story.stripe, width: pt(2.5), color: col('accent') },
  body: { ...boxBody, fontFamily: 'Source Serif 4' } };
const dataBox = { ...story, id: 'data', marginTop: pt(0), columnGap: mm(4.5) };
const ad = { id: 'ad', backgroundEnabled: false, marginTop: pt(LEAD),
  border: { enabled: true, color: col('ink'), width: pt(0.75) },
  padding: { ...pad(6, 6), top: mm(3) },
  titleStyle: { ...caps(6.5, 600, 'muted'), gap: mm(4) },
  body: { ...boxBody, fontSize: pt(14), lineHeight: pt(18), boldColor: col('ink') } };
const pullQuote = { ...story, id: 'quote', columns: 2, marginTop: pt(0),
  body: { ...banner.body, fontFamily: 'Playfair Display', fontSize: pt(19), lineHeight: pt(23),
    italic: true } }; // a pull quote, floated across two columns
const headline = (id, size, look = {}) => ({ id, fontSize: pt(size), lineHeight: pt(size * 1.04),
  marginBottom: pt(size * 0.2), ...look });
// #endregion

const config = () => ({
  locale: 'en-gb', colorPalette, resourceTypes,
  page: { sizePreset: 'berliner', dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(M.top), bottom: mm(M.bottom), left: mm(M.side), right: mm(M.side) } },
  layout: { layoutType: 'multiple', columnCount: 5, gutterWidth: mm(4.5),
    columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.5) } },
  bodyText: { fontFamily: 'Source Serif 4', fontSize: pt(9.4), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('muted'),
    textAlign: 'justify', firstLineIndent: mm(3.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true, maxJustifyTracking: 20,
    avoidWidows: true, avoidOrphans: true },
  headings: { fontFamily: 'Playfair Display', fontWeight: 700, color: col('ink'),
    marginBottom: pt(0), levels: [
      // A break to the next page, left or right: every page opens with its own flag.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, slot: { elements: flagParts } } },
      { level: 2, fontSize: pt(17), lineHeight: pt(19), marginTop: pt(LEAD) },
    ] },
  headingStyles: [
    { id: 'front', advancedDesign: nameplate, header: { elements: [] } }, // no folio line
    business, front(),
    headline('lead', 50, { fontWeight: 900 }), headline('wide', 34), headline('second', 22),
    ...[['ad', 60], ['ad-big', 80]].map(([id, size]) => headline(id, size, { fontWeight: 900,
      color: col('accent'), marginBottom: pt(4) })),
  ],
  calloutStyles: [banner, story, briefs, teaser, panel, dataBox, ad, pullQuote],
  paragraphStyles: [
    { id: 'byline', fontFamily: 'Archivo Narrow', fontSize: pt(8.5), textAlign: 'left',
      firstLineIndent: pt(0), color: col('muted') },
    { id: 'flush', firstLineIndent: pt(0) },
    { id: 'jump', fontFamily: 'Archivo Narrow', fontSize: pt(8.5), textAlign: 'right' },
    { id: 'kicker', ...sans(8.5, 700, { color: col('accent') }), textAlign: 'left',
      firstLineIndent: pt(0) },
    { id: 'imprint', fontFamily: 'Archivo Narrow', fontSize: pt(7.2), lineHeight: pt(9.5),
      textAlign: 'left', firstLineIndent: pt(0), color: col('muted'), marginTop: pt(LEAD / 2) },
  ],
  captionStyle: { fontFamily: 'Archivo Narrow', fontSize: pt(8.5), gap: mm(1.6),
    labelColor: col('accent'), note: { fontSize: pt(7), color: col('muted') } },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Archivo Narrow',
    headerFontSize: pt(8), bodyFontFamily: 'Archivo Narrow', bodyFontSize: pt(8.5),
    bodyColor: col('ink'), cellPadding: mm(1) },
  tableStyles: [{ id: 'prices', headerBackground: col('accent'), headerFontSize: pt(7),
    bodyFontSize: pt(7), cellPadding: mm(0.45) }],
  header, footer: { elements: [] },
  folio: { paper: { type: 'newsprint', grammage: 45, shade: { hex: '#fbfaf8', model: 'hex' } },
    binding: { type: 'folded', cover: 'pages' }, surface: { type: 'oak' },
    lighting: { environment: 'overcast' } },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region art: the market data and the drawings, every figure from one source
function mulberry32(seed) { // a seeded PRNG: the same prices on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const sign = (n, d = 1) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(d)}`;
// A table: its first `words` columns are text, flush left; the figures sit flush right.
const table = (widths, heads, rows, words = 1) => ({ headerRowCount: 1, columnWidths: widths,
  rows: [heads, ...rows].map((row, r) => row.map((c, i) => ({ content: String(c),
    align: i < words ? 'left' : 'right', ...(r ? {} : { isHeader: true }) }))) });
const INDICES = [['MX 40', '8,412.6', 66.8, 0.80, 14.1],
  ['MX All-Share', '4,516.2', 27.0, 0.60, 11.8],
  ['MX Small Cap', '6,904.3', -12.4, -0.18, 7.2], ['Europe 350', '2,118.7', 5.9, 0.28, 6.0],
  ['North America 500', '6,702.4', -8.1, -0.12, 9.4],
  ['Asia-Pacific 200', '3,281.9', 14.6, 0.45, 4.8],
  ['Nordic 120', '1,604.2', 7.3, 0.46, 8.1], ['Emerging 100', '1,148.2', 3.1, 0.27, 3.9],
  ['World 1000', '3,902.6', 4.4, 0.11, 7.7], ['Latin America 80', '2,416.0', -9.6, -0.40, 2.2],
  ['Gulf 60', '1,873.5', 6.2, 0.33, 5.1], ['MX Mid 100', '9,127.4', 22.9, 0.25, 9.8],
  ['MX Dividend 30', '3,640.1', 12.6, 0.35, 10.4]];
const CURRENCIES = [['US dollar', '1.3218', -0.20], ['Euro', '1.1634', 0.10],
  ['Japanese yen', '197.42', 0.31], ['Swiss franc', '1.1281', -0.05],
  ['Norwegian krone', '14.212', 0.22], ['Swedish krona', '14.508', 0.12],
  ['Canadian dollar', '1.8215', -0.14], ['Australian dollar', '2.0127', 0.08],
  ['Danish krone', '8.6812', 0.09], ['Polish zloty', '4.9873', 0.18],
  ['Indian rupee', '111.06', -0.25],
  ['Chinese yuan', '9.4127', -0.11], ['Hong Kong dollar', '10.281', -0.19]];
const COMMODITIES = [['Crude oil, $/barrel', '71.40', 1.10],
  ['Natural gas, p/therm', '84.60', 2.30], ['Gold, $/oz', '2,688', -0.40],
  ['Silver, $/oz', '31.42', -0.70], ['Copper, $/tonne', '9,812', 0.60],
  ['Aluminium, $/tonne', '2,604', 0.20], ['Wheat, £/tonne', '182.50', -0.30],
  ['Cocoa, $/tonne', '6,212', 1.80], ['Coffee, $/tonne', '4,890', -0.90],
  ['Sugar, $/tonne', '512.4', 0.40],
  ['Salmon, NOK/kg', '78.20', -1.20], ['Cotton, c/lb', '71.85', 0.15],
  ['Zinc, $/tonne', '2,884', 0.70]];
// Page 5's strip reads the rows page 6's tables print: one source for both.
const quote = (name, [, value, ...rest], pct = rest.at(-1)) => [name, value, `${sign(pct, 2)}%`];
const STRIP = () => [quote('MX 40', INDICES[0], INDICES[0][3]),
  quote('MX All-Share', INDICES[1], INDICES[1][3]), quote('£ / $', CURRENCIES[0]),
  quote('£ / €', CURRENCIES[1]), quote('Crude oil $', COMMODITIES[0]),
  quote('Gold $', COMMODITIES[2])];
const FORECAST = [['Tue', 'Gales easing, showers', '13°', '8°', 'W 40'],
  ['Wed', 'Bright and breezy', '14°', '7°', 'W 25'],
  ['Thu', 'Cloudy, rain later', '12°', '9°', 'SW 30'],
  ['Fri', 'Rain clearing', '13°', '6°', 'NW 22'], ['Sat', 'Sunny spells', '14°', '5°', 'N 12']];
const TIDES = [['Tue', '10.51', '5.9', '23.14', '6.1'], ['Wed', '11.32', '5.6', '23.55', '5.8'],
  ['Thu', '—', '—', '12.14', '5.4'], ['Fri', '0.37', '5.5', '12.58', '5.1'],
  ['Sat', '1.22', '5.1', '13.45', '4.8']];
const PREFIX = ['Ardley', 'Brack', 'Calder', 'Carrow', 'Wynd', 'Corran', 'Dunmere', 'Fairlie',
  'Fenner', 'Haddow', 'Holm', 'Holmside', 'Kelby', 'Quay', 'Lusk', 'Marrow', 'Orvane', 'Pellow',
  'Rennie', 'Skerra', 'Strand', 'Tessary', 'Wendholm'];
const SECTORS = [['Banks', ['Bank', 'Cap', 'Svgs', 'Trust', 'Fin']],
  ['Insurance', ['Ins', 'Life', 'Re', 'Assur']], ['Shipping', ['Lines', 'Freight', 'Shpg', 'Tugs',
    'Ports']], ['Food & drink', ['Foods', 'Bakers', 'Brew', 'Dairies', 'Fish']],
  ['Retail', ['Stores', 'Home', 'Outfit', 'Retail']], ['Engineering', ['Eng', 'Pumps', 'Cables',
    'Castings', 'Marine']], ['Energy', ['Energy', 'Power', 'Wind', 'Water']],
  ['Property', ['Ests', 'Homes', 'Land', 'Props']], ['Technology', ['Soft', 'Data', 'Sys',
    'Digital']], ['Health', ['Pharma', 'Care', 'Diag', 'Med']]]; // listing abbreviations
function pricesTable(i, rows) { // one sector of the share prices, seeded
  const rand = mulberry32(2026 + i);
  const names = new Set();
  while (names.size < rows) {
    const [a, b] = [PREFIX, SECTORS[i][1]].map((list) => list[Math.floor(rand() * list.length)]);
    names.add(`${a} ${b}`);
  }
  const fmt = (v) => Math.round(v).toLocaleString('en-GB');
  return table([3.6, 1.2, 1, 1.2, 1.2], [SECTORS[i][0], 'Price', '+/−', 'High', 'Low'],
    [...names].sort().map((name) => {
      const price = 40 + rand() ** 2 * 2400;
      return [name, fmt(price), sign(price * (rand() - 0.47) * 0.05, price < 200 ? 1 : 0),
        fmt(price * (1.05 + rand() * 0.3)), fmt(price * (0.7 + rand() * 0.25))];
    }));
}
// Every table on pages 3, 6, 7 and 8: [model, caption, credit note].
const TABLES = {
  budget: [table([3, 1.2, 1.2, 1], ['Service, £m', '2026/27', '2027/28', 'Change'],
    [['Adult social care', '412.3', '426.9', '+14.6'], ['Children’s services', '236.8', '241.0',
      '+4.2'], ['Housing', '39.5', '41.2', '+1.7'], ['Waste and recycling', '47.2', '47.9', '+0.7'],
    ['Libraries and culture', '21.6', '21.6', '0.0'],
    ['Roads and transport', '88.4', '84.9', '−3.5'],
    ['Public health', '38.2', '38.9', '+0.7'], ['Planning', '24.1', '22.0', '−2.1'],
    ['Everything else', '134.3', '115.6', '−18.7'], ['**Total**', '**1,042.4**', '**1,040.0**',
      '**−2.4**']]), '**Where the money goes**', 'Source: Marrowick City Council.'],
  forecast: [table([0.8, 3, 0.8, 0.8, 1], ['Day', 'Outlook', 'High', 'Low', 'Wind mph'], FORECAST,
    2),
    '**Weather**', 'Forecast: Marrowick Met Station.'],
  tides: [table([1, 1, 0.8, 1, 0.8], ['Day', 'High', 'm', 'High', 'm'], TIDES),
    '**Tides at Kingsquay**', 'Times BST; heights above chart datum.'],
  indices: [table([2.6, 1.3, 1, 1, 1], ['Index', 'Close', 'Chg', '%', 'Year %'],
    INDICES.map(([n, v, c, p, y]) => [n, v, sign(c), sign(p, 2), sign(y)])), '**Indices**'],
  currencies: [table([2.4, 1.2, 1], ['Per pound', 'Rate', '%'],
    CURRENCIES.map(([n, v, p]) => [n, v, sign(p, 2)])), '**Currencies**'],
  commodities: [table([2.6, 1.2, 1], ['Commodity', 'Price', '%'],
    COMMODITIES.map(([n, v, p]) => [n, v, sign(p, 2)])), '**Commodities**'],
  active: [table([2.6, 1.2, 1.2, 1], ['Most traded', 'Shares m', 'Close p', '%'], [
    ['Corvane Group', '31.0', '1,184', '+6.2'], ['Tessary Insurance', '18.4', '642', '+1.9'],
    ['Skerra Lines', '12.9', '318', '+3.1'], ['Ashby Stores', '11.2', '97.4', '−3.4'],
    ['Dunmore Bank', '9.7', '455', '+0.6'], ['Fenner Holdings', '8.3', '736', '+2.7'],
    ['Halden Bakeries', '6.1', '1,092', '+1.2'], ['Kelby Software', '5.8', '214', '+0.4'],
    ['Wendholm Water', '5.2', '871', '−0.2'], ['Calder Life', '4.9', '388', '+0.9'],
    ['Orvane Marine', '4.4', '152', '+1.5'], ['Brack Cables', '3.9', '611', '−0.8'],
    ['Saltmarsh Fish', '3.6', '86.5', '+2.4']]), '**Most traded**'],
  results: [table([2.6, 1.1, 1.1, 0.9], ['£m', 'Sales', 'Profit', 'Div p'],
    [['Halden (year)', '214.0', '19.6', '14.4'], ['Skerra Lines (half)', '58.3', '3.1', '4.2'],
      ['Kelby Software (half)', '31.7', '4.9', '2.0'], ['Fenner (year)', '96.2', '11.4', '9.8'],
      ['Ashby Stores (half)', '142.5', '−2.3', '1.0'],
      ['Calder Life (year)', '388.0', '41.6', '12.2'],
      ['Orvane Marine (half)', '44.9', '3.8', '1.6']]),
  '**Results**'],
  diary: [table([1, 2.6, 2], ['Day', 'Company', 'Event'], [['Wed', 'Ashby Stores',
    'Half-year results'], ['Wed', 'Wendholm Water', 'Trading update'], ['Thu', 'Kelby Software',
    'Annual meeting'], ['Fri', 'Dunmore Bank', 'Third-quarter update'], ['Fri', 'Calder Life',
    'Dividend paid, 6.1p'], ['Mon', 'Halden Bakeries', 'Annual meeting'],
    ['Tue', 'Tessary Insurance', 'Storm claims update']], 3), '**Company diary**'],
  savings: [table([2.6, 1], ['Account', 'Rate'], [['1-year fixed, Dunmore Bank', '4.15%'],
    ['2-year fixed, Holm BS', '4.02%'], ['Easy access, Marrow Mutual', '3.85%'],
    ['90-day notice, Kelby Savings', '3.90%'], ['Cash ISA, Fairlie Bank', '3.70%']]),
  '**Best buys**', 'Gross annual rates on £10,000.'],
};
// The pictures' captions, descriptions and credits.
const GENERATED = 'Picture: Generated With Diffusion Models';
const LEDGER = 'Source: Ledger Data';
const CAPTIONS = Object.fromEntries(Object.entries({
  barrier: ['**The Marrow Barrier at 9.30pm on Monday,** its gates closed against the surge. The '
    + 'river behind them rose by 30 centimetres.', 'A row of curved steel flood gates closed '
    + 'across a river in a storm, waves breaking against them, two engineers on a walkway.'],
  welders: ['**First week:** apprentices welding a hull section in the fabrication hall at '
    + 'Brackwater.', 'Two young welders in masks at a steel hull, sparks flying, an instructor '
    + 'watching.'],
  gate: ['**How a gate turns.** Each segment turns on a pin in the pier, from its sill on the '
    + 'riverbed to stand against the sea.', 'Diagram of two barrier gates in section, one lying '
    + 'in its sill, one turned up.', 'Drawing: The Ledger'],
  ferry: ['**The Holm Maid** leaves Skerra pier on her first crossing since May.', 'A blue and '
    + 'white car ferry leaving a stone harbour on a grey day, gulls overhead.'],
  cartoon: ['**Holding the line,** by Kit Carrow.', 'Cartoon: a steel flood gate drawn as a '
    + 'castle wall holds back a huge wave while townspeople drink tea behind it; on top, an '
    + 'official with an empty piggy bank.'],
  cranes: ['**The Outer Quay at dawn.** The new berth would take ships three times the size of '
    + 'those the port handles now.', 'Container cranes unloading a ship at dawn, a tug in front.'],
  throughput: ['**Containers through Marrowick,** thousands of twenty-foot units a year.',
    'Bar chart of container traffic, 2016 to 2026, rising from 982,000 to 1,185,000 units, close '
    + 'to capacity.', 'Source: Marrowick Harbour Board'],
  mx40: ['**The MX 40 over the past year,** daily closes.', 'Line chart of the MX 40 index, '
    + 'rising from 7,370 to 8,412.6 over twelve months.', LEDGER],
  sectors: ['**Sectors on the Marrowick Exchange,** change on the day.', 'Bar chart of ten '
    + 'sectors, from shipping, up 3.4%, to retail, down 2.1%.', LEDGER],
  loaves: ['**Halden’s Quayside plant** bakes 1.1 million loaves a week.', 'Bakery workers in '
    + 'white coats checking loaves on a conveyor leaving an oven.'],
}).map(([id, [caption, altText, note = GENERATED]]) => [id, { caption, altText, note }]));
// The labels are set in Archivo Narrow: loadSvg embeds the face the root names.
const svg = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" `
  + `height="${H * 10}" viewBox="0 0 ${W} ${H}" font-family="Archivo Narrow">${body}</svg>`;
const label = (x, y, s, content, look = '', fill = palette.ink) => `<text x="${x.toFixed(2)}" `
  + `y="${y.toFixed(2)}" font-size="${s}" fill="${fill}" ${look}>${content}</text>`;
function mx40Svg() { // the MX 40 over a year: a seeded walk, scaled to end on the close
  const rand = mulberry32(40);
  const walk = [0];
  for (let i = 1; i < 253; i++) walk.push(walk[i - 1] + rand() - 0.46);
  const level = walk.map((v) => 7370 + (v * 1042.6) / walk[252]);
  const [W, H, L, R, B] = [291, 100, 14, 18, 8]; // mm: size, left and right gutters, axis
  const x = (i) => L + (i * (W - L - R)) / 252;
  const y = (v) => H - B - ((v - 7200) * (H - B - 4)) / 1400;
  let out = '';
  for (const v of [7400, 7800, 8200, 8600]) {
    out += `<path d="M${L} ${y(v).toFixed(2)}H${W - R}" stroke="${palette.rule}" `
      + 'stroke-width="0.2"/>'
      + label(L - 1.5, y(v) + 1, 3, v.toLocaleString('en-GB'), 'text-anchor="end"');
  }
  'Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug Sep'.split(' ').forEach((m, k) => {
    out += label(x(k * 21 + 10), H - 2, 3, m, 'text-anchor="middle"');
  });
  const line = level.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join('');
  return svg(W, H, `${out}<path d="${line}L${x(252)} ${H - B}L${L} ${H - B}Z" `
    + `fill="${palette.petrol}" fill-opacity="0.14"/><path d="${line}" fill="none" `
    + `stroke="${palette.petrol}" stroke-width="0.6"/><path d="M${L} ${H - B}H${W - R}" `
    + `stroke="${palette.ink}" stroke-width="0.35"/>`
    + label(x(252) + 1.5, y(level[252]) + 1, 3.4, '8,412.6', 'font-weight="700"'));
}
function throughputSvg() { // container traffic, thousands of TEU a year
  const DATA = [982, 1004, 1031, 1047, 918, 996, 1072, 1108, 1139, 1164, 1185]; // 2016–2026
  const [W, H, B] = [113, 70, 8];
  const y = (v) => H - B - (v * (H - B - 8)) / 1300;
  let out = '';
  DATA.forEach((v, i) => {
    out += `<rect x="${3 + i * 10}" y="${y(v).toFixed(2)}" width="7" height="${(H - B - y(v))
      .toFixed(2)}" fill="${i === 10 ? palette.petrol : palette.rule}"/>`
      + label(6.5 + i * 10, H - 3, 2.8, `’${16 + i}`, 'text-anchor="middle"');
  });
  return svg(W, H, `${out}<path d="M2 ${y(1200).toFixed(2)}H111" stroke="${palette.ink}" `
    + 'stroke-width="0.4" stroke-dasharray="1.2 0.8"/>'
    + label(3, y(1200) - 1.6, 3, 'Capacity today, 1.2 million')
    + label(109.5, y(1185) + 4, 2.8, '1,185', 'text-anchor="end" font-weight="700"',
      palette.salmon));
}
function gateSvg() { // a gate in section, lying in its sill and turned up against the sea
  const [r, bed] = [14, 38];
  const py = bed - r * Math.SQRT1_2; // the pivot: the arc's ends sit on the riverbed
  const p = (cx, a) => `${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(2)} `
    + `${(py - r * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
  const gate = (cx, a) => `<path d="M${p(cx, a)}A${r} ${r} 0 0 0 ${p(cx, a + 90)}Z" `
    + `fill="${palette.accent}"/><path d="M${p(cx, a)}L${cx} ${py.toFixed(2)}L${p(cx, a + 90)}" `
    + `fill="none" stroke="${palette.ink}" stroke-width="0.35"/><circle cx="${cx}" `
    + `cy="${py.toFixed(2)}" r="1.4" fill="${palette.ink}"/>`;
  const water = (x, w, top) => `<rect x="${x}" y="${top}" width="${w}" height="${bed - top}" `
    + `fill="${palette.rule}" fill-opacity="0.4"/>`;
  return svg(113, 50, water(0, 54, 24) + water(59, 30, 30) + water(89, 24, 19)
    + `<rect x="0" y="${bed}" width="54" height="12" fill="${palette.muted}"/>`
    + `<rect x="59" y="${bed}" width="54" height="12" fill="${palette.muted}"/>`
    + gate(27, 225) + gate(80, -45)
    + label(1, 5, 3.2, 'Open', 'font-weight="700"')
    + label(1, 9.5, 2.8, 'The gate lies in its sill')
    + label(60, 5, 3.2, 'Closed', 'font-weight="700"')
    + label(60, 9.5, 2.8, 'Turned up through 90°')
    + label(61, 34, 2.8, 'River') + label(111, 23, 2.8, 'Sea', 'text-anchor="end"'));
}
const SECTOR_MOVES = [['Shipping', 3.4], ['Insurance', 1.6], ['Engineering', 1.1], ['Banks', 0.7],
  ['Energy', 0.5], ['Food and drink', 0.3], ['Property', -0.1], ['Technology', -0.2],
  ['Health', -0.4], ['Retail', -2.1]];
function sectorsSvg() { // the day's move of each sector, in per cent
  const [W, H, Z, k] = [291, 82, 150, 30]; // mm; the zero line; mm per point
  let out = '';
  SECTOR_MOVES.forEach(([name, move], i) => {
    const y = 2 + i * 8;
    const [x, w] = move >= 0 ? [Z, move * k] : [Z + move * k, -move * k];
    out += `<rect x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="5.6" `
      + `fill="${move >= 0 ? palette.petrol : palette.rule}"/>`
      + label(move >= 0 ? Z - 2 : Z + 2, y + 4, 3.6, name,
        `text-anchor="${move >= 0 ? 'end' : 'start'}"`)
      + label(move >= 0 ? x + w + 1.5 : x - 1.5, y + 4, 3.6, `${sign(move)}%`,
        `font-weight="700" text-anchor="${move >= 0 ? 'start' : 'end'}"`);
  });
  return svg(W, H, `${out}<path d="M${Z} 0V${H}" stroke="${palette.ink}" stroke-width="0.35"/>`);
}
// #endregion

// #region floats: pictures, charts and tables across k of the page's columns
const unnumbered = (id, name, captionStyle) => ({ id, name, shortLabel: name, captionPrefix: '',
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionStyle });
const resourceTypes = [unnumbered('picture', 'Picture'),
  unnumbered('panel', 'Panel', { position: 'above', fontSize: pt(9.5) })];
const res = (id, typeId, kind, body, extra) => ({ id, typeId, kind, [kind]: body,
  createdAt: 0, updatedAt: 0, ...extra });
const photo = (id, file, [w, h], placement) => res(id, 'picture', 'bitmap',
  { fileId: file, format: 'jpeg', width: w, height: h }, { placement, ...CAPTIONS[id] });
const drawing = (id, [w, h], placement) => res(id, 'picture', 'svg',
  { fileId: `${id}.svg`, width: w, height: h }, { placement, ...CAPTIONS[id] });
const data = (id, model, caption, note) => res(id, 'panel', 'table', { model },
  { placement: here, caption, note });
const top = (columns) => ({ position: 'top', columns }); // a float across k columns
const here = { position: 'here' }; // in the flow: in a column, or across a box
const resources = [
  photo('barrier', 'barrier-1800.jpg', [1800, 1106], here), // in the banner box: page-wide
  photo('welders', 'apprentices-1536.jpg', [1536, 1024], top(3)),
  drawing('gate', [1130, 500], top(3)),
  photo('ferry', 'ferry-1536.jpg', [1536, 1024], top(4)),
  photo('cartoon', 'cartoon-1280.jpg', [1280, 853], top(4)),
  photo('cranes', 'cranes-1800.jpg', [1800, 750], here),
  drawing('throughput', [1130, 700], top(2)),
  drawing('mx40', [2910, 1000], here), drawing('sectors', [2910, 820], here),
  photo('loaves', 'bakery-1536.jpg', [1536, 1024], top(3)),
  // The tables sit where the text names them, in a column or a data box: no float.
  ...Object.entries(TABLES).map(([id, [model, caption, note]]) => data(id, model, caption, note)),
  ...SECTORS.map((_, i) => res(`prices-${i + 1}`, 'panel', 'table',
    { styleId: 'prices', model: pricesTable(i, 21) }, { placement: here })),
];
// #endregion
const markdown = /* @content */ ''; // content.en.md: pages 1–4
const businessPages = /* @content:business */ ''; // content.business.en.md: pages 5–8

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  'Source Serif 4': ['400', '400i', '700'], 'Playfair Display': ['400i', '700', '900'],
  'Archivo Narrow': ['400', '400i', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const all = `${markdown}\n\n${businessPages}`;
await Promise.all([...resources.filter((r) => r.bitmap)
  .map((r) => loadImage(r.bitmap.fileId, asset(r.bitmap.fileId))),
loadSvg('gate.svg', gateSvg()), loadSvg('throughput.svg', throughputSvg()),
loadSvg('mx40.svg', mx40Svg()), loadSvg('sectors.svg', sectorsSvg())]);
const doc = await buildDocumentWithFonts({ markdown: all, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: 'The Marrowick Ledger · Business on salmon' });

// @kit
