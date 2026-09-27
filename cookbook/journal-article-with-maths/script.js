// ═══ Postext Cookbook · Nº 002 · Two-column paper with numbered equations ══════════
// https://postext.dev/en/cookbook/journal-article-with-maths
// Code: MIT · Text: original (CC BY 4.0) · Figures: generated in code (CC BY 4.0)
// Fonts: STIX Two Text, Schibsted Grotesk, Azeret Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// A research article in a fictional physics journal: a title block across the page, numbered
// sections, MathJax formulas in the text and in the figures, a table computed from the data.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes, initMathEngine, renderMath,
} from 'https://esm.sh/postext?bundle';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'journal-article-with-maths';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#141a1f', journal: '#0f4d3f', // text; the journal's green: band, heads, labels
  mist: '#b9d9cc', series: '#c8442a', // type on the band; data: measurements, the red bob
  tint: '#ecf3ef', rule: '#bcc9c3', // the abstract box; hairlines
  muted: '#58625d', paper: '#ffffff', // running heads, affiliations, notes; white
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [ // the defaults link to 'main-color': point it at the journal green
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'journal (defaults)', value: { hex: palette.journal, model: 'hex' } },
];
// A serif for the text around the formulas, a grotesque for heads and labels, a mono for metadata.
const [SERIF, SANS, MONO] = ['STIX Two Text', 'Schibsted Grotesk', 'Azeret Mono'];
const [BODY, LEAD] = [9.5, 12.6]; // pt: body size and leading, the grid both columns share
// mm: the A4 trim, the head, foot and side margins, and the gutter between the two columns
const [TRIM_W, TRIM_H, TOP, BOTTOM, M, GUTTER] = [210, 297, 22, 22, 17, 6];
const MEASURE = TRIM_W - 2 * M; // mm: the text width, which the band's type and rules align to
const COLUMN = (MEASURE - GUTTER) / 2; // mm: one of the two columns
const PT_PER_MM = 72 / 25.4; // a point is 1/72 in, and an inch 25.4 mm

// #region answer: maths from a CDN: the bundled engine, MathJax awaited, numbered equations
// Every postext symbol comes from https://esm.sh/postext?bundle, which carries MathJax: in
// 1.4.1 the plain URL makes initMathEngine() throw "Can't find handler for document".
await initMathEngine(); // gotcha: math-bundle. Unawaited, formulas paint as grey boxes, unwarned
const math = { // on by default: $…$ inline, $$…$$ display, and \$ for a literal dollar sign
  fontSizeScale: 0.94, // 1.4.1 gives maths an x-height of 0.5 em, STIX Two Text 0.473 em
  marginTop: pt(LEAD), // display maths: a line above, half a line below, and the grid snap
  marginBottom: pt(LEAD / 2), // then rounds the space below up to the next baseline
};
// Equation numbers: in 1.4.1 a \tag makes a formula 0 wide, so it vanishes unwarned (gotcha:
// math-tag-vanishes). numbered() sets the line instead: the formula centred, its number flush
// right, in ems of the maths as drawn (1 ex is half the size, TeX's x-height 0.442 em: ×1.13).
const MATH_EM = renderMath('\\mathmakebox[10em]{}', true, 100).widthPx / 1000;
const COLUMN_EM = (COLUMN * PT_PER_MM) / (BODY * math.fontSizeScale * MATH_EM);
const NUMBER_EM = 3; // room for "(7)", and as much on the left so the formula stays centred
const FORMULA_EM = (COLUMN_EM - 2 * NUMBER_EM - 0.1).toFixed(2); // 0.1: rounding never overflows
// Column maths only: a numbered formula in a page-wide box would need MEASURE, not COLUMN.
const numbered = (md) => md.replace(/\$\$([^$]+?)\\tag\{([^}]+)\}\s*\$\$/g, (_, body, n) =>
  `$$\\mathmakebox[${NUMBER_EM}em]{}\\mathmakebox[${FORMULA_EM}em]{${body.trim()}}`
  + `\\mathmakebox[${NUMBER_EM}em][r]{(${n})}$$`);
// Then build from the rewritten text: buildDocument({ markdown: numbered(markdown), … }).
// Formulas are MathJax paths: renderToPdf writes them as vector outlines, with no maths font.
// #endregion

// #region title: the title block: a heading style draws the band, the masthead and the byline
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width) } }) });
const caps = (size, fontWeight = 600) => ({ fontWeight, letterSpacing: pt(size * 0.18),
  textTransform: 'uppercase' }); // tracked capitals: design text and callout titles take them
const [RULE_Y, BAND, BYLINE] = [21, 130, 152]; // mm from the top: rule, band foot, byline foot
const titleBlock = {
  enabled: true,
  minHeight: mm(BYLINE - TOP), // from the top margin down to the byline: the abstract follows
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('journal') },
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: 'fill', height: mm(BAND) } } },
    { kind: 'image', id: 'swing', resourceId: 'strobe', // drawn in code, hung from the rule
      placement: at('page', 'top-left', 54, RULE_Y, 136) },
    text('journal', 'Measure', SANS, 17, 'paper', at('page', 'top-left', M, 11.2),
      { fontWeight: 700, overflow: 'clip' }),
    text('subject', 'Journal of Experimental Physics', SANS, 7, 'mist',
      at('#journal', 'right-of', 3, 2.2), { ...caps(7), overflow: 'clip' }),
    text('issue', 'Vol. 7 · No. 3 · 2026', MONO, 7, 'mist', at('page', 'top-right', -M, 13.3),
      { align: 'right', overflow: 'clip' }),
    { kind: 'rule', id: 'hairline', thickness: pt(0.5), color: col('mist'),
      placement: at('page', 'top-left', M, RULE_Y, MEASURE) },
    text('kicker', '{attr.kicker}', SANS, 7.5, 'mist', at('page', 'top-left', M, BAND - 39, 110),
      caps(7.5)), // 39 mm above the band's foot: room for itself and a two-line title
    text('title', '{titleText}', SANS, 36, 'paper', at('#kicker', 'below', 0, 3, 170),
      { fontWeight: 700, lineHeight: 1.04 }), // broken where the heading line has its \\
    // Design text prints ^1^ as it is (gotcha: design-text-no-inline-marks): the author
    // marks in the attribute are the characters ¹ and ², which the latin subset carries.
    text('authors', '{attr.authors}', SANS, 11, 'ink', at('page', 'top-left', M, BAND + 7, 120),
      { fontWeight: 600 }),
    text('affiliations', '{attr.affiliations}', SANS, 7.5, 'muted',
      at('#authors', 'below', 0, 1.6, 120), { lineHeight: 1.35 }),
    ...[['Received {attr.received}', 'muted', 400], ['Accepted {attr.accepted}', 'muted', 400],
      ['Published {publishDate}', 'muted', 400], ['Open access · CC BY 4.0', 'journal', 600]]
      .map(([content, color, fontWeight], i) => text(`d${i}`, content, MONO, 6.6, color,
        at('page', 'top-right', -M, BAND + 7.6 + 3.4 * i), { align: 'right', fontWeight })),
  ] },
};
// #endregion

// Running heads 12.4 mm from the trim, over a hairline at 16 mm: 6 mm above the text block.
const head = (id, content, parity, edge, x, extra) => text(id, content, SANS, 7.5, 'muted',
  at('page', `top-${edge}`, x, 12.4), { overflow: 'clip', ...caps(7.5, 500), align: edge,
    parity, pages: 'body', ...extra });
const folio = { fontWeight: 700, color: col('journal'), letterSpacing: pt(0.4) };
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'left', M, folio),
  head('v-title', 'Measure · Vol. 7 · 2026', 'even', 'left', M + 10), // 10 mm after the folio
  head('r-title', 'Oyelaran et al. · Pendulum at large amplitudes', 'odd', 'right', -(M + 10)),
  head('r-folio', '{pageNumber}', 'odd', 'right', -M, folio),
  { kind: 'rule', id: 'head-rule', thickness: pt(0.5), color: col('rule'), pages: 'body',
    placement: at('page', 'top-left', M, 16, MEASURE) },
] };
// The first page carries the citation line and its folio at the foot instead, 12 mm up.
const footer = { elements: [
  text('cite', 'Measure 7, 213–216 (2026) · doi:10.5555/measure.7.3.213', MONO, 6.4, 'muted',
    at('page', 'bottom-left', M, -12), { pages: 'opener', overflow: 'clip' }),
  text('drop-folio', '{pageNumber}', SANS, 7.5, 'journal', at('page', 'bottom-right', -M, -12),
    { ...folio, align: 'right', pages: 'opener', overflow: 'clip' }),
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  resourceTypes, colorPalette, // resourceTypes below: Figure 1, Table 1 through the article
  page: { width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150, pageNumbering: { startAt: 213 },
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(M), right: mm(M), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  // Justified, hyphenated, optimal breaks, no widows or runts: defaults; :ref follows boldColor.
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), firstLineIndent: mm(3.5),
    indentAfterHeading: false, minWordSpacing: 0.78, // no line's spaces below 0.78 of a space
    maxRuntTracking: 4 }, // a runt fix tightens by 4/1000 em at most (default 10): no dark lines
  math,
  headings: { fontFamily: SANS, color: col('journal'), levels, // bold by default; levels below
    balancing: { stretchAfterFloats: false } }, // gotcha: float-stretch-closing-page (page 4)
  headingStyles, calloutStyles, chipStyles, paragraphStyles, // defined below
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackgroundEnabled: false, headerColor: col('journal'), headerFontFamily: SANS,
    headerFontSize: pt(7.8), bodyFontSize: pt(8.6), cellPadding: mm(1) }, // gap: booktabs-rules
  captionStyle: { fontFamily: SANS, fontSize: pt(8), labelColor: col('journal'), gap: mm(2),
    note: { fontSize: pt(7), color: col('muted') } }, // in the text's ink; labels bold
  header, footer,
});

// #region numbering: numbered sections styled by level, an uncounted title, figures 1, 2, 3
// Each level has its own template, {2} for a section and {2}.{3} for a subsection, and its own
// type. Heads snap the text after them back onto the grid, so the two columns stay level.
const levels = [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, // the title; its
  // break is restated, as a headings object drops it (gotcha: headings-drop-h1-break)
  { level: 2, numberingTemplate: '{2}', fontSize: pt(11.5), lineHeight: pt(LEAD * 2),
    marginTop: pt(LEAD), marginBottom: pt(0) }, // "1 Introduction", journal green
  { level: 3, numberingTemplate: '{2}.{3}', fontSize: pt(10), lineHeight: pt(LEAD),
    fontWeight: 600, color: col('ink'), marginTop: pt(LEAD / 2), marginBottom: pt(0) }, // "2.1"
];
const headingStyles = [ // the article title and the back matter are headings, but uncounted
  { id: 'article', numbered: false, span: 'page', advancedDesign: titleBlock },
  // In 1.4.1 a heading takes no letterSpacing: the back-matter capitals stay untracked.
  { id: 'back', numbered: false, fontSize: pt(7.5), lineHeight: pt(9), // bold, from its H2 level
    textTransform: 'uppercase', marginTop: pt(LEAD), marginBottom: pt(2) },
];
// The default "{h1}.{n}" prints Figure 1 here too, as an empty {h1} drops with its dot; "{n}"
// says outright that figures and tables count through the article. Tables caption above.
const resourceTypes = defaultResourceTypes(LANG).map((type) => ({ ...type,
  numberingTemplate: '{n}', resetOn: 'never',
  ...(type.id === 'table' && { captionStyle: { position: 'above' } }) }));
// #endregion

// #region abstract: a page-wide box under the title, with the keywords as chips
const calloutStyles = [{ id: 'abstract', title: 'Abstract', span: 'page',
  background: col('tint'), marginTop: pt(0), marginBottom: pt(LEAD),
  padding: { top: mm(4.2), right: mm(22), bottom: mm(4.2), left: mm(22) }, // ~90 characters
  // The title takes the heading face; the body the text's face, ink and justification.
  titleStyle: { fontSize: pt(7.5), ...caps(7.5, 700), color: col('journal'), gap: mm(1.6) },
  body: { fontSize: pt(9.8), lineHeight: pt(13.2), firstLineIndent: pt(0) } }];
// Keyword chips never break, set ragged: a justified line of chips opens its spaces into gaps.
const keywords = { id: 'keywords', fontFamily: SANS, fontSize: pt(8), lineHeight: pt(14),
  textAlign: 'left', firstLineIndent: pt(0), boldColor: col('journal') };
const chipStyles = [{ id: 'keyword', fontFamily: MONO, fontSize: em(0.88), color: col('journal'),
  background: col('paper'), borderColor: col('rule'), // the border is 0.5 pt by default
  borderRadius: pt(8), paddingX: em(0.55), paddingY: em(0.12), gap: em(0.45) }];
// #endregion

// #region references: a bibliography with hanging indents, and the colophon under it
const paragraphStyles = [keywords,
  { id: 'references', fontSize: pt(8.2), lineHeight: pt(10.5), textAlign: 'left',
    hangingIndent: mm(5), spaceBetween: pt(2.5) }, // ragged, so never hyphenated
  { id: 'colophon', fontFamily: SANS, fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), spaceBetween: pt(3), marginTop: pt(LEAD) },
];
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region figures: one set of numbers feeds Table 1 and Figure 2; labels set by MathJax
const [L, G] = [1.000, 9.812]; // the bench pendulum: length (m) and local gravity (m s^-2)
const T0 = 2 * Math.PI * Math.sqrt(L / G); // s: Eq. (1), 2.0059 s
const agm = (a, b) => [1, 2, 3].reduce(([x, y]) => [(x + y) / 2, Math.sqrt(x * y)], [a, b])[0];
const exact = (deg) => T0 / agm(1, Math.cos((deg * Math.PI) / 360)); // Eq. (6)
const runs = [[5, 2.0069], [10, 2.0096], [20, 2.0210], [30, 2.0412], [45, 2.0864],
  [60, 2.1517], [75, 2.2458], [90, 2.3658]]; // amplitude (°), measured period (s): simulated
const fixed = (x, n, sign) => (sign && x >= 0 ? '+' : '') + x.toFixed(n).replace('-', '−');
const cell = (content) => ({ content, align: 'right' }); // headerRowCount marks row 0
const table = { headerRowCount: 1, columnWidths: [1.25, 1.35, 1, 1.1, 1.2], rows: [
  ['Amplitude', 'Measured', 'Eq. (6)', 'Over *T*~0~', 'Residual'],
  ...runs.map(([deg, T]) => [`${deg}°`, fixed(T, 4), fixed(exact(deg), 4),
    `${fixed((exact(deg) / T0 - 1) * 100, 2)}%`, `${fixed((T / exact(deg) - 1) * 100, 3, 1)}%`]),
].map((row) => row.map(cell)) }; // cells take no maths (gap: math-in-captions): *T*~0~ is plain
// An SVG cannot see the page's fonts (gotcha: svg-no-webfonts), so the figure labels are
// MathJax paths too: the same italic θ as the text, and vector in the PDF.
const R = (x) => Math.round(x * 100) / 100; // coordinates to 0.01 mm keep the SVG short
function tex(markup, x, y, size, anchor = 0, color = 'ink') { // anchor 0 left, .5 centre, 1 right
  const r = renderMath(markup, false, 100); // paths in MathJax units: 1000 to the em
  const k = size / 1000;
  return `<g transform="translate(${R(x - anchor * r.viewBox.width * k)} ${R(y)}) scale(${k})" `
    + `fill="${palette[color]}">${r.paths.map((p) => `<path d="${p.d}"/>`).join('')}</g>`;
}
const PX_PER_MM = 10; // the drawings are in mm, declared to the engine at 10 px to the mm
const figure = (id, w, h, caption, altText, placement) => ({ id, typeId: 'figure', kind: 'svg',
  svg: { fileId: `${id}.svg`, width: w * PX_PER_MM, height: h * PX_PER_MM }, caption, altText,
  placement, createdAt: 0, updatedAt: 0 });
const resources = [ // each is placed where the text first cites it with :ref; sizes in mm
  figure('strobe', 136, 70, '', 'A swinging pendulum, lit by flashes.'), // uncited: the band's
  figure('geometry', 84, 60, 'The pendulum and its symbols: the length *L* from the pivot to '
    + 'the centre of the bob, the mass *m* and the amplitude, the angle between the vertical '
    + 'and either turning point of the swing.', // the caption face has no Greek: no θ here
  'A bob on a rod hanging from a pivot, pulled aside by an angle.', { position: 'top' }),
  { id: 'runs', typeId: 'table', kind: 'table', table: { model: table }, createdAt: 0,
    updatedAt: 0, caption: 'Measured and predicted periods of the one-metre pendulum, in seconds, '
    + 'and their excess and residual in per cent.',
    note: 'Amplitudes to ±0.5°. The measurements are simulated for this example.' },
  figure('period', 84, 60, 'The period against the amplitude, as a ratio to *T*~0~: Eq. (6) '
    + '(solid), the first two terms of Eq. (7) (dashed) and the measurements (dots).',
  'The period grows with the amplitude, slowly, then fast; the measured points sit on the curve.'),
  figure('phase', 176, 76, 'The phase plane of the pendulum: one orbit for each amplitude from '
    + '30° to 150° in steps of 30°, the 90° orbit of our widest runs in red, and the separatrix '
    + 'of a swing to 180° dashed.', 'Nested closed orbits growing into lemon shapes.',
  { position: 'top', span: 'page' }), // cited on page 3, it opens page 4 across both columns
];
// #endregion

// #region art: the swinging pendulum, the geometry, the plot and the phase plane
const rad = (deg) => (deg * Math.PI) / 180;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX_PER_MM}" `
  + `height="${h * PX_PER_MM}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const line = (x1, y1, x2, y2, color, width, extra = '') => `<line x1="${R(x1)}" y1="${R(y1)}" `
  + `x2="${R(x2)}" y2="${R(y2)}" stroke="${palette[color]}" stroke-width="${width}" ${extra}/>`;
const dot = (x, y, r, color, extra = '') => `<circle cx="${R(x)}" cy="${R(y)}" r="${r}" `
  + `fill="${palette[color]}" ${extra}/>`;
const arc = (cx, cy, r, from, to, color, width, extra = '') => `<path d="M${R(cx + r * Math.sin(
  from))} ${R(cy + r * Math.cos(from))}A${r} ${r} 0 0 0 ${R(cx + r * Math.sin(to))} ${R(cy + r
  * Math.cos(to))}" fill="none" stroke="${palette[color]}" stroke-width="${width}" ${extra}/>`;
const path = (points, color, width, extra = '') => `<path d="${points.map(([x, y], i) =>
  `${i ? 'L' : 'M'}${R(x)} ${R(y)}`).join('')}" fill="none" stroke="${palette[color]}" `
  + `stroke-width="${width}" ${extra}/>`;
function strobe() { // 136 × 70 mm on the band: one half swing, lit at equal times
  const [px, len, amp] = [74, 60, rad(68)]; // pivot x, rod length (mm), amplitude
  let out = arc(px, 0, len, -amp, amp, 'mist', 0.35, 'stroke-dasharray="1 1.6" '
    + 'stroke-opacity="0.7"');
  for (let i = 8; i >= 0; i--) { // nine flashes at equal times: the bob bunches up where it
    const th = amp * Math.cos((Math.PI * (i + 0.5)) / 9); // slows down; the red one last
    const [x, y, last] = [px + len * Math.sin(th), len * Math.cos(th), i === 0];
    out += line(px, 0, x, y, last ? 'paper' : 'mist', last ? 0.5 : 0.3,
      `stroke-opacity="${last ? 0.9 : 0.4}"`)
      + dot(x, y, 4, last ? 'series' : 'mist', `fill-opacity="${last ? 1 : 0.34}"`);
  }
  return svg(136, 70, out + dot(px, 0, 1.1, 'paper'));
}
function geometry() { // 84 × 60 mm, one column
  const [px, py, len, a] = [42, 6, 44, rad(38)];
  const [bx, by] = [px + len * Math.sin(a), py + len * Math.cos(a)];
  return svg(84, 60, `<rect x="${px - 14}" y="${py - 3}" width="28" height="3" `
    + `fill="${palette.rule}"/>`
    + line(px, py, px, py + len + 6, 'muted', 0.3, 'stroke-dasharray="1.2 1"')
    + arc(px, py, len, -a, a, 'rule', 0.4, 'stroke-dasharray="1.2 1"')
    + arc(px, py, 12, 0, a, 'journal', 0.4)
    + line(px, py, 2 * px - bx, by, 'rule', 0.4) + dot(2 * px - bx, by, 3.4, 'rule')
    + line(px, py, bx, by, 'ink', 0.6) + dot(px, py, 0.9, 'ink') + dot(bx, by, 3.4, 'series')
    + tex('\\theta_0', px + 3.4, py + 18.4, 4.2)
    + tex('L', (px + bx) / 2 + 3.2 * Math.cos(a), (py + by) / 2 - 3.2 * Math.sin(a) + 1.4, 4.2)
    + tex('m', bx + 5, by + 1.5, 4.2));
}
function period() { // 84 × 60 mm: T/T0 against the amplitude
  const [x0, y0, w, h] = [13, 8, 66, 40];
  const X = (deg) => x0 + (deg / 90) * w;
  const Y = (ratio) => y0 + h - ((ratio - 1) / 0.2) * h;
  const curve = (f) => Array.from({ length: 91 }, (_, d) => [X(d), Y(f(d))]);
  let out = '';
  for (const r of [1, 1.05, 1.1, 1.15, 1.2]) {
    out += line(x0, Y(r), x0 + w, Y(r), 'rule', 0.2)
      + tex(r.toFixed(2), x0 - 1.8, Y(r) + 1.1, 3.1, 1, 'muted');
  }
  for (const d of [0, 30, 60, 90]) out += tex(`${d}^\\circ`, X(d), y0 + h + 4.6, 3.1, 0.5, 'muted');
  return svg(84, 60, out + path(curve((d) => exact(d) / T0), 'journal', 0.6)
    + path(curve((d) => 1 + rad(d) ** 2 / 16), 'muted', 0.4, 'stroke-dasharray="1.4 1"')
    + runs.map(([d, T]) => dot(X(d), Y(T / T0), 1, 'series')).join('')
    + tex('\\theta_0', x0 + w, y0 + h + 9.5, 3.6, 1) + tex('T/T_0', x0 - 1.8, y0 - 4.2, 3.6, 1));
}
function phase() { // 176 × 76 mm, across the page: the orbits of Eq. (3)
  const [cx, cy, sx, sy] = [88, 39, 24, 16]; // origin, and mm per radian and per unit of θ̇/ω0
  let out = line(cx - 84, cy, cx + 84, cy, 'rule', 0.3)
    + line(cx, cy - 37, cx, cy + 37, 'rule', 0.3);
  for (const [x, label] of [[-Math.PI, '-\\pi'], [Math.PI, '\\pi']]) {
    out += line(cx + sx * x, cy, cx + sx * x, cy + 1.2, 'muted', 0.3)
      + tex(label, cx + sx * x, cy + 5, 3.1, 0.5, 'muted');
  }
  for (const deg of [30, 60, 90, 120, 150, 180]) {
    const a = rad(deg);
    const v = (th) => Math.sqrt(Math.max(0, 2 * (Math.cos(th) - Math.cos(a)))); // Eq. (3)
    const orbit = Array.from({ length: 241 }, (_, i) => { // over the top, then back under
      const [u, s] = i < 120 ? [i / 120, 1] : [(i - 120) / 120, -1];
      const th = a * Math.sin(Math.PI * (u - 0.5));
      return [cx + sx * th * s, cy - sy * v(th) * s];
    });
    out += deg === 90 ? path(orbit, 'series', 0.7) : path(orbit, 'journal', deg === 180 ? 0.35
      : 0.45, deg === 180 ? 'stroke-dasharray="1.4 1"' : '');
  }
  return svg(176, 76, out + tex('\\theta', cx + 84, cy - 1.6, 3.8, 1)
    + tex('\\dot\\theta/\\omega_0', cx + 1.6, cy - 34.4, 3.8));
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages paint, loaded before the first build (gotcha: fonts-first)
  'STIX Two Text': ['400', '400i', '700'],
  'Schibsted Grotesk': ['400', '400i', '500', '600', '700', '700i'],
  'Azeret Mono': ['400', '600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
for (const [id, draw] of Object.entries({ strobe, geometry, period, phase })) {
  await loadSvg(`${id}.svg`, draw()); // registered for the canvas, kept as bytes for the PDF
}
const doc = await buildWithFonts(
  () => buildDocument({ markdown: numbered(markdown), resources }, config()), markdown);
showPages(doc, { title: 'Two-column paper with numbered equations' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`); // text in the Fontsource faces; formulas and figures as vector paths

// @kit core fonts viewer pdf images · the Cookbook inlines cookbook/_kit/*.js here
