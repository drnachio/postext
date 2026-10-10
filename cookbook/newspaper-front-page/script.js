// ═══ Postext Cookbook · Nº 027 · Newspaper front page ═══════════════════════════
// https://postext.dev/en/cookbook/newspaper-front-page
// Code: MIT · Text: original (CC BY 4.0) · Photo: Jason Blackeye (CC0)
// Fonts: Grenze Gotisch, PT Serif, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.24.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'newspaper-front-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: newsprint, ink and one red for the section flags
const palette = {
  ink: '#111315', // text and the heavy rules: a cold near-black
  paper: '#f8f5ee', // newsprint, and type reversed out of ink or red
  flag: '#a6192e', // the one accent: section flags, kickers, the Yes bars
  tint: '#ebe6db', // the In brief strip
  rule: '#9a978f', // hairlines: the column rule, table rules
  muted: '#5d5a55', // bylines, the folio line's title and date, credit notes, the imprint
};
// The hex rides along: 1.4.1 designs read it, not the link (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // defaults link to 'main-color': point it at the ink, never blue
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 246, height: 328 }; // mm: a 3 : 4 compact, smaller than a tabloid
const MARGIN = { top: 14, bottom: 15, side: 12 }; // newspaper margins: narrow, not mirrored
const GUTTER = 6; // mm between the two body columns, and between the In brief columns
const LEAD = 12.6; // body leading in pt: the baseline grid
const franklin = (size, weight, look = {}) => ({ fontFamily: 'Libre Franklin',
  fontSize: pt(size), fontWeight: weight, color: col('ink'), ...look });
const caps = (size, weight, colour = 'ink') => franklin(size, weight, { color: col(colour),
  textTransform: 'uppercase', letterSpacing: pt(size * 0.16) }); // capitals tracked 0.16 em
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', color: col('ink'), ...look, placement }); // design text defaults to centred,
// black and ellipsized (gotcha: overflow-ellipsis-default)
// A rule across the slot whose bottom sits `gap` mm above the element it names.
const rule = (id, under, weight, gap = 0) => ({ kind: 'rule', id, thickness: pt(weight),
  color: col('ink'), placement: { ...at(under, 'above', 0, -gap), size: { width: 'fill' } } });
// An empty box exactly `lines` grid lines deep sets an opener's depth, and the rest hangs from
// its foot. Ending on a grid line leaves no sliver of column beside the opener, which 1.4.1
// would rule down through the title (gotcha: column-rule-through-opener).
const depth = (lines) => ({ kind: 'box', id: 'depth', style: {}, placement: {
  ...at('container', 'top-left'), size: { width: 'fill', height: pt(lines * LEAD) } } });

// #region nameplate: the front page's H1 is the paper's name, between two ears
const NAME = 52; // pt: the blackletter nameplate
const EAR = 31; // mm: each ear, in the room the nameplate leaves at either side
const EAR_DROP = 1.8; // mm: measured so the ears' big figures sit on the nameplate's baseline
const AIR = 2; // mm between the lower rule and the masthead's foot, where the banner box starts
const ear = (side, lines) => lines.map(([id, content, look], i) => text(id, content,
  { ...look, align: side }, { ...(i === 0 ? at('container', `top-${side}`, 0, EAR_DROP)
    : at(`#${lines[i - 1][0]}`, 'below', 0, 1)), size: { width: mm(EAR) } }));
const serif = { fontFamily: 'PT Serif', fontSize: pt(9), italic: true, color: col('ink'),
  lineHeight: 1.25 }; // a multiple of the size (gotcha: design-lineheight-multiple)
const nameplate = { enabled: true, slot: { elements: [
  depth(7), // the masthead is seven grid lines deep; the rules and dateline hang from its foot
  { kind: 'rule', id: 'foot', thickness: pt(0.5), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -AIR), size: { width: 'fill' } } },
  ...[['left', '{attr.issue}'], ['center', '{publishDate}'], ['right', '{attr.area}']].map(
    ([align, content]) => text(`date-${align}`, content, { ...caps(7.5, 600), align },
      { ...at('#foot', 'above', 0, -1.4), size: { width: 'fill' } })),
  rule('thin', '#date-left', 0.5, 1.6), rule('heavy', '#thin', 2.5, 0.6), // the Oxford rule
  text('name', '{titleText}', { fontFamily: 'Grenze Gotisch', fontSize: pt(NAME),
    fontWeight: 700, lineHeight: 1, align: 'center' },
  { ...at('#heavy', 'above', 0, -1.2), size: { width: 'fill' } }), // centred between the ears
  ...ear('left', [['w-kicker', 'Weather', caps(7, 700, 'flag')],
    ['w-outlook', '{attr.outlook}', serif], ['w-temps', '{attr.temps}', franklin(15, 800)]]),
  ...ear('right', [['p-kicker', '{attr.since}', caps(7, 700, 'flag')],
    ['p-day', '{attr.day}', serif], ['p-price', '{attr.price}', franklin(15, 800)]]),
] } };
// hook-up: headingStyles gets { id: 'front', advancedDesign: nameplate, header: { elements:
// [] } }, H1 already spans the page, and the Markdown opens with
// # The Elverdale Courier {style="front" issue="…" area="…" outlook="…" temps="…" since="…"
//   day="…" price="…"}
// #endregion

// #region answer: two body columns at most, so the four-up strip is a box with columns
const layout = { layoutType: 'double', gutterWidth: mm(GUTTER), // the most a body can have
  columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.5) } };
// Three or more columns live only inside a box: a :::columns group in a :::callout. Its fence
// spans the page and floats the box to the foot, so the story fills the columns above it:
//   :::callout{type="briefs" span="page" placement="bottom" title="In brief"}
//   :::columns{count=4 breaks="2,3,4"}   ← each brief opens a column (child 2, 3 and 4)
//   …four paragraphs…
//   :::
//   :::                                  (gotcha: callout-columns)
// The style could carry span and placement too; on the fence they stay in sight in the text.
// hook-up: config() takes layout as it is and lists briefs in calloutStyles.
const briefs = { id: 'briefs',
  background: col('tint'), // one device: a tint, no stripe or border
  padding: { top: mm(3), right: mm(4), bottom: mm(4), left: mm(4) },
  columnGap: mm(GUTTER), // the inner columns keep the page's gutter
  titleStyle: { ...caps(9, 800, 'flag'), gap: mm(2) },
  body: { fontFamily: 'PT Serif', fontSize: pt(8.6), lineHeight: pt(11.4), textAlign: 'left',
    firstLineIndent: pt(0) } }; // ragged and unindented, unlike the columns
// #endregion

// #region banner: a headline across both columns is a frameless page-span box
// :::callout{type="banner" span="page" title="Transport"} ← an optional kicker, then the H2
const banner = { id: 'banner', backgroundEnabled: false,
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  titleStyle: { ...caps(8, 800, 'flag'), gap: mm(1.2) }, // a kicker, when the fence has a title
  marginTop: pt(0), // flush under the nameplate or the section flag
  marginBottom: pt(LEAD / 2), // half a line, then the columns start on the next grid line
  body: { fontFamily: 'PT Serif', fontSize: pt(13), lineHeight: pt(16.5), textAlign: 'left' } };
// A story that starts mid-page: the same box under a rule. The columns above it are cut level.
const story = { ...banner, id: 'story', marginTop: pt(LEAD),
  stripe: { enabled: true, side: 'top', width: pt(1), color: col('ink') }, // its one device
  padding: { top: mm(2.5), right: pt(0), bottom: pt(0), left: pt(0) } };
// Inside the box the headline is an H2 in a heading style: one size for each rank of story.
const headline = (id, size, look = {}) => ({ id, fontSize: pt(size), lineHeight: pt(size * 1.02),
  marginBottom: pt(size * 0.2), ...look }); // tight leading, a fifth of it below
// #endregion

// #region inside: an inside page opens with a section flag and carries a folio line
const section = { enabled: true, slot: { elements: [
  depth(2), // two grid lines: the flag sits on a 3 pt bar, 1.6 mm above the foot
  { kind: 'rule', id: 'bar', thickness: pt(3), color: col('ink'),
    placement: { ...at('#depth', 'align-bottom', 0, -1.6), size: { width: 'fill' } } },
  text('flag', '{titleText}', { ...caps(11, 800, 'paper'), box: { backgroundColor: col('flag'),
    padding: { top: mm(1.3), right: mm(3), bottom: mm(1.1), left: mm(3) } } },
  at('#bar', 'above')),
] } };
const FOLIO = 6; // mm from the top edge to the folio line; its rule 4 mm lower
const folio = (parity, side, s) => [ // s: +1 on a verso (folio on the left), −1 on a recto
  text(`n-${parity}`, '{pageNumber}', { ...franklin(9, 800), align: side },
    at('page', `top-${side}`, s * MARGIN.side, FOLIO)),
  text(`t-${parity}`, '{title} · {publishDate}', { ...caps(7, 600, 'muted'), align: side },
    at(`#n-${parity}`, s > 0 ? 'right-of' : 'left-of', s * 3, 0.9)),
].map((element) => ({ ...element, parity }));
const header = { elements: [...folio('even', 'left', 1), ...folio('odd', 'right', -1),
  { kind: 'rule', id: 'folio-rule', thickness: pt(0.5), color: col('ink'),
    placement: { ...at('page', 'top-left', MARGIN.side, FOLIO + 4), size: { width: mm(TRIM.width
      - 2 * MARGIN.side) } } }] };
// #endregion

const label = { fontFamily: 'Libre Franklin', fontSize: pt(8), firstLineIndent: pt(0) };
const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, resourceTypes,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.side), right: mm(MARGIN.side) } },
  // An inline picture or drawing keeps a line of air above it, in a box too, and none below:
  // the caption's note sits on the text that follows, which keeps the copy fitted.
  layout: { ...layout, inlineResourceGap: 'above' },
  // Hyphenation stays at its defaults: on, in 'en-us'.
  bodyText: { fontFamily: 'PT Serif', fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    // boldColor is restated: :ref labels take it, because 1.4.1 never points referenceColor
    // at main-color (gotcha: palette-skips-designs), and bold in a box copies it before the
    // palette applies. Italics do follow main-color.
    boldColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(3.5), indentAfterHeading: false,
    minWordSpacing: 0.75, maxWordSpacing: 1.6, // tighter than the 0.6–2 defaults
    maxRuntTracking: 0 }, // tracking 1.4.1 never paints (gotcha: runt-tracking-unpainted)
  headings: { fontFamily: 'Libre Franklin', fontWeight: 800, // in ink, through main-color
    marginBottom: pt(0), levels: [
      // Restated (gotcha: headings-drop-h1-break); 'any': a section opens the next page.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: section },
      { level: 2, fontSize: pt(17), lineHeight: pt(19) }, // Letters; banners restyle it
      { level: 3, fontSize: pt(10), lineHeight: pt(LEAD), fontWeight: 700, marginTop: pt(LEAD) },
    ] },
  headingStyles: [
    { id: 'front', advancedDesign: nameplate, header: { elements: [] } }, // no folio line
    headline('lead', 56, { fontWeight: 900 }), headline('wide', 30), headline('second', 22),
  ],
  calloutStyles: [banner, story, briefs],
  chipStyles: [{ id: 'flag', background: col('flag'), color: col('paper'), borderWidth: pt(0),
    borderRadius: pt(0), fontFamily: 'Libre Franklin', fontSize: em(0.875), bold: true,
    paddingX: em(0.4), paddingY: em(0.15) }],
  paragraphStyles: [{ ...label, id: 'byline', textAlign: 'left', color: col('muted') },
    { id: 'flush', firstLineIndent: pt(0) }, // a story's first paragraph, the second letter
    { ...label, id: 'jump', textAlign: 'right' }, // "…: page 2", where a story turns
    { id: 'sign', textAlign: 'right', firstLineIndent: pt(0) }, // a letter's signature
    { id: 'imprint', fontFamily: 'Libre Franklin', fontSize: pt(6.8), lineHeight: pt(9),
      textAlign: 'left', firstLineIndent: pt(0), color: col('muted'), marginTop: pt(LEAD) }],
  captionStyle: { fontFamily: 'Libre Franklin', fontSize: pt(8), gap: mm(1.6),
    note: { fontSize: pt(6.8), color: col('muted') } }, // the credit line
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ink'), headerColor: col('paper'), headerFontFamily: 'Libre Franklin',
    headerFontSize: pt(7.5), bodyFontFamily: 'Libre Franklin', bodyFontSize: pt(8.5),
    cellPadding: mm(1.3) },
  tableStyles: [{ id: 'results', cellPadding: mm(1) }, // tighter rows: the bars read as one chart
    { id: 'forecast', headerBackground: col('flag'), bodyFontSize: pt(8), // the weather box
      cellPadding: mm(1.2) }],
  header, footer: { elements: [] }, // newspapers put the folio at the head, if anywhere
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// #region art: the two tables as data, and the bridge and the ward bars drawn in code
const WARDS = [ // Tuesday's parish poll: yes, no (they add up to 3,904 and 2,393)
  ['Market', 942, 418], ['Riverside', 861, 402], ['St Oswald’s', 896, 471],
  ['Brook Lane', 736, 591], ['Harrow', 469, 511]];
const cell = (content, extra = {}) => ({ content, ...extra });
const head = (content, align = 'left') => cell(content, { isHeader: true, align });
const num = (n) => n.toLocaleString('en-GB');
const share = (yes, no) => `${Math.round((100 * yes) / (yes + no))}%`;
function barSvg(yes, no) { // 1000 × 34 units: yes in red from the left, no in grey, 50% marked
  const split = (1000 * yes) / (yes + no);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="34" viewBox="0 0 1000 34">'
    + `<rect width="${split.toFixed(1)}" height="34" fill="${palette.flag}"/>`
    + `<rect x="${(split + 4).toFixed(1)}" width="${(996 - split).toFixed(1)}" height="34" `
    + `fill="${palette.rule}"/><rect x="499" y="-1" width="2" height="36" fill="${palette.ink}"/>`
    + '</svg>';
}
const TOWN = WARDS.reduce(([, y, n], [, yes, no]) => ['Whole town', y + yes, n + no], ['', 0, 0]);
const bars = [...WARDS, TOWN].map(([ward, yes, no], i) => ({ ward, yes, no,
  id: i < WARDS.length ? `bar-${i + 1}` : 'bar-town', svg: barSvg(yes, no) })); // one per row
function mulberry32(seed) { // a seeded PRNG: the same stones on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a towards b by k
function bridgeSvg() { // 119 × 46 mm, 1 unit = 1 mm, about 2.6 mm to the metre
  const rand = mulberry32(1791); // the year the bridge was built, as far as the Courier knows
  const f = (v) => v.toFixed(2);
  const [W, H, TOP, DECK, WATER, BED] = [119, 46, 4.5, 8, 25, 30]; // heights from the top, mm
  const stone = mix(palette.tint, palette.muted, 0.35);
  const joint = mix(palette.tint, palette.ink, 0.55);
  const arches = [[16, 57], [62, 103]]; // two spans; the central pier stands between them
  const [SPRING, CROWN] = [WATER - 7, 13]; // the arches spring 7 mm above the water
  const CTRL = 2 * CROWN - SPRING; // the Bézier control point that puts the top at CROWN
  // The banks: road level at each end, down under the outer half of each arch to the water's
  // edge, 24 mm in, and on at the same slope to the bed.
  const EDGE = 24;
  const run = ((BED - WATER) * (EDGE - 10)) / (WATER - DECK);
  const bank = [[0, DECK], [10, DECK], [EDGE, WATER], [EDGE + run, BED]];
  const profile = [...bank, ...bank.map(([x, y]) => [W - x, y]).reverse()];
  const groundAt = (x) => { // the height of the ground at x, between two profile points
    const i = profile.findIndex(([px]) => px >= x);
    if (i <= 0) return profile[Math.max(i, 0)][1];
    const [[x0, y0], [x1, y1]] = [profile[i - 1], profile[i]];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  };
  const water = mix(palette.paper, palette.ink, 0.14);
  let out = `<rect x="0" y="${WATER}" width="${W}" height="${BED - WATER}" fill="${water}"/>`;
  out += `<path d="M${EDGE} ${WATER}H${W - EDGE}" stroke="${palette.muted}" stroke-width="0.3"/>`;
  for (let i = 0; i < 9; i++) { // ripples on the river, between the banks
    const [x, y] = [EDGE + 3 + rand() * (W - 2 * EDGE - 12),
      WATER + 1.2 + rand() * (BED - WATER - 2.4)];
    out += `<path d="M${f(x)} ${f(y)}h${f(3 + rand() * 5)}" stroke="${palette.paper}" `
      + 'stroke-width="0.4"/>';
  }
  // The masonry: parapet to riverbed, less the two arch openings (even-odd fill). The banks
  // are drawn over it, so only the stone above the ground shows.
  const opening = ([a, b]) => `M${a} ${BED}L${a} ${SPRING}Q${(a + b) / 2} ${CTRL} `
    + `${b} ${SPRING}L${b} ${BED}Z`;
  const outline = `M4 ${BED}L10 ${DECK}V${TOP}H${W - 10}V${DECK}L${W - 4} ${BED}`;
  out += `<path fill-rule="evenodd" fill="${stone}" `
    + `d="${outline}Z${arches.map(opening).join('')}"/>`;
  // Where the masonry is at height y: inside the sloping ends, outside the arch openings.
  const solid = (x, y) => {
    const end = y < DECK ? 10 : 10 - (6 * (y - DECK)) / (BED - DECK);
    if (x < end || x > W - end) return false;
    return !arches.some(([a, b]) => { // the opening's half width at y (a parabola)
      const c = (SPRING - y) / (2 * (SPRING - CTRL)); // t(1 − t) at height y
      const half = c <= 0 ? 0.5 : c >= 0.25 ? -1 : Math.sqrt(0.25 - c);
      return Math.abs(x - (a + b) / 2) <= half * (b - a);
    });
  };
  for (let y = TOP + 2.2; y < BED; y += 2.2) { // courses of stone, joints staggered
    for (let x = 4; x < W - 4; x += 0.5) {
      if (solid(x, y) && solid(x + 0.5, y)) {
        out += `<path d="M${f(x)} ${f(y)}h0.5" stroke="${joint}" stroke-width="0.2"/>`;
      }
    }
    for (let x = 4 + rand() * 4; x < W - 6; x += 3 + rand() * 4) {
      if (solid(x, y) && solid(x, y - 2.2)) {
        out += `<path d="M${f(x)} ${f(y - 2.2)}v2.2" stroke="${joint}" stroke-width="0.2"/>`;
      }
    }
  }
  for (const [a, b] of arches) { // the voussoirs: a ring of stones round each opening
    const cx = (a + b) / 2;
    for (let t = 0; t <= 1.0001; t += 1 / 14) {
      const x = a + (b - a) * t;
      const y = SPRING - 2 * t * (1 - t) * (SPRING - CTRL);
      const [dx, dy] = [x - cx, y - (WATER + 2)];
      const k = 3 / Math.hypot(dx, dy);
      out += `<path d="M${f(x)} ${f(y)}l${f(dx * k)} ${f(dy * k)}" stroke="${joint}" `
        + 'stroke-width="0.25"/>';
    }
    out += `<path d="${opening([a, b]).replace(/Z$/, '')}" fill="none" stroke="${palette.ink}" `
      + 'stroke-width="0.35"/>';
  }
  out += `<path d="${outline}" fill="none" stroke="${palette.ink}" stroke-width="0.4"/>`;
  // The ground in section: the banks and the riverbed, hatched below the profile.
  const edge = profile.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
  out += `<path d="M${edge}L${W} ${H}L0 ${H}Z" fill="${palette.paper}"/>`;
  for (let x0 = -H; x0 < W; x0 += 1.6) { // 45° hatching, cut where it leaves the ground
    let from = null;
    for (let t = 0; t <= H + 0.05; t += 0.1) {
      const [x, y] = [x0 + t, H - t];
      const inside = x >= 0 && x <= W && y > groundAt(x);
      if (inside && !from) from = [x, y];
      if (from && (!inside || t + 0.1 > H + 0.05)) {
        out += `<path d="M${f(from[0])} ${f(from[1])}L${f(x - 0.1)} ${f(y + 0.1)}" `
          + `stroke="${palette.rule}" stroke-width="0.25"/>`;
        from = null;
      }
    }
  }
  out += `<path d="M${edge}" fill="none" stroke="${palette.muted}" stroke-width="0.3"/>`
    + `<rect x="55.5" y="${BED}" width="8" height="15.6" fill="${palette.flag}"/>` // 6 m deep
    + `<path d="M9.4 ${TOP}H${W - 9.4}" stroke="${palette.ink}" stroke-width="1.2"/>`; // coping
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" `
    + `viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
function resultsTable() {
  const row = (name, yes, no, bar, bold = '') => [cell(`${bold}${name}${bold}`),
    cell('', { image: { resourceId: bar } }), cell(`${bold}${num(yes)}${bold}`,
      { align: 'right' }), cell(`${bold}${num(no)}${bold}`, { align: 'right' }),
    cell(`${bold}${share(yes, no)}${bold}`, { align: 'right' })];
  return { headerRowCount: 1, columnWidths: [22, 110, 14, 14, 14], rows: [
    [head('Ward'), head('Share of the vote'), head('Yes', 'right'),
      head('No', 'right'), head('Yes share', 'right')],
    ...bars.map((b) => row(b.ward, b.yes, b.no, b.id, b.id === 'bar-town' ? '**' : ''))] };
}
function forecastTable() {
  const days = [['Thu', 'Bright spells', 16, 8, 'W 18'], ['Fri', 'Showers', 14, 9, 'W 22'],
    ['Sat', 'Heavy rain', 12, 9, 'SW 30'], ['Sun', 'Clearing', 13, 6, 'NW 20'],
    ['Mon', 'Sunny, cold start', 15, 4, 'N 8']];
  return { headerRowCount: 1, columnWidths: [10, 40, 12, 12, 16], rows: [
    [head('Day'), head('Outlook'), head('High', 'right'), head('Low', 'right'),
      head('Wind mph', 'right')],
    ...days.map(([day, sky, hi, lo, wind]) => [cell(`**${day}**`), cell(sky),
      cell(`${hi}°`, { align: 'right' }), cell(`${lo}°`, { align: 'right' }),
      cell(wind, { align: 'right' })])] };
}
// #endregion

// #region floats: the photo sits in its box, the results float to a foot, the forecast to a head
// A caption label prints only when captionPrefix has text: '' leaves no "Figure 1".
const unnumbered = (id, name, captionStyle) => ({ id, name, shortLabel: name, captionPrefix: '',
  numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionStyle });
const resourceTypes = [unnumbered('picture', 'Picture'), // captions under the picture
  unnumbered('panel', 'Panel', { position: 'above', fontSize: pt(9.5) })]; // tables: titled above
const resource = (id, typeId, kind, body, extra) => ({ id, typeId, kind, [kind]: body,
  createdAt: 0, updatedAt: 0, ...extra });
const resources = [
  // Set inline in the page-span banner box: a 'top' float never lands above the line that
  // cites it (gotcha: top-float-next-page). It keeps the float gap above it, inside the box too.
  // 2400 px at 150 dpi is 406 mm: the photo shrinks to the box (gotcha: bitmap-print-size).
  resource('ridge', 'picture', 'bitmap', { fileId: 'ridge-2400.jpg', format: 'jpeg', width: 2400,
    height: 800 }, { placement: { position: 'here' },
    altText: 'Wind turbines on a snow-covered ridge under a bright, cloudy sky.',
    caption: '**File picture:** turbines on an upland ridge. Each of the three planned for '
      + 'Harrow Ridge would generate 2.3 megawatts.',
    note: 'Photograph: Jason Blackeye, CC0, via Wikimedia Commons' }),
  // Drawn in code (the art region) and set inline, where ::resource puts it in column 1,
  // at the column's right with the next paragraph running beside it (text wrap).
  resource('bridge', 'picture', 'svg', { fileId: 'bridge.svg', width: 1190, height: 460 },
    { placement: { position: 'here', wrap: 'right', width: 0.47 },
      altText: 'Drawing of a two-arch stone bridge between sloping river banks; under its '
        + 'central pier, a red concrete footing.',
      caption: '**The rebuilt pier.** Its new concrete footing (red) goes six metres below the '
        + 'riverbed. Both arches were relaid with their own stones.',
      note: 'Drawing: The Courier' }),
  // A page-span 'bottom' float sits under both columns of the page that cites it. On the last
  // page it follows the balanced columns, so the copy there is fitted to bring it to the foot.
  resource('wards', 'panel', 'table', { styleId: 'results', model: resultsTable() },
    { placement: { position: 'bottom', span: 'page' }, caption: '**How the wards voted**',
      note: 'Red: yes. Grey: no. The black line marks half the vote. '
        + 'Source: Elverdale Town Council.' }),
  // A column 'top' float waits for the head of the next column with room.
  resource('forecast', 'panel', 'table', { styleId: 'forecast', model: forecastTable() },
    { placement: { position: 'top', span: 'column' }, caption: '**The next five days**',
      note: 'Sunrise 6.57, sunset 19.03 on Thursday. Forecast: Wend Valley Weather Station.' }),
];
// #endregion
resources.push(...bars.map((b) => resource(b.id, 'panel', 'svg', // the bars the table cells draw
  { fileId: `${b.id}.svg`, width: 1000, height: 34 },
  { altText: `${b.ward}: ${num(b.yes)} yes, ${num(b.no)} no` })));
const markdown = /* @content */ ''; // content.en.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build (gotcha: fonts-first)
  'PT Serif': ['400', '400i', '700'], 'Grenze Gotisch': ['700'],
  'Libre Franklin': ['400', '600', '700', '800', '900'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await Promise.all([loadImage('ridge-2400.jpg', asset('ridge-2400.jpg')),
  loadSvg('bridge.svg', bridgeSvg()), ...bars.map((b) => loadSvg(`${b.id}.svg`, b.svg))]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: 'Newspaper front page' });

// @kit
