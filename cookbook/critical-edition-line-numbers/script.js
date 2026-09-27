// ═══ Postext Cookbook · Nº 044 · Critical edition: line numbers and line-keyed notes ═══
// https://postext.dev/en/cookbook/critical-edition-line-numbers
// Code: MIT · Text: Milton, Poems (1645) (PD) · Notes and laurel: CC BY 4.0
// Fonts: Linden Hill, Imbue, Libre Franklin (SIL OFL 1.1) · Needs postext ≥ 1.4.1
// Lycidas in the spelling of 1645, with a number beside every fifth line and two pages of
// notes keyed to those numbers, so the verse carries no note markers.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'critical-edition-line-numbers';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Black text on white, and one laurel green for the apparatus.
const palette = {
  ink: '#1b1b1b', // the text
  laurel: '#3c5a3e', // line numbers, note numbers, the kicker; the laurel's leaves
  leaf: '#6d8a5f', // the leaves behind, in the drawing
  berry: '#a4a653', // unripe berries: 'harsh and crude' (line 3)
  muted: '#6a706a', // running heads, the colophon
  paper: '#ffffff',
};
// col(id) carries the hex beside the id, because design slots paint the hex
// (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries(palette)
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Linden Hill', 'Imbue', 'Libre Franklin'];
const LEAD = 14.5; // pt: the leading of the verse, and the grid every page keeps

// #region answer: count the lines, and after every fifth set its number in the margin
// The poem is written one line of verse to a line of Markdown, with a blank line between
// verse paragraphs and two spaces before a short line. numberVerse() gives each line a
// paragraph of its own and, after every fifth, a side box that holds its number. A side box
// stands where the text has reached at its fence, under the line it follows; a top padding
// of minus one line lifts the number back onto that line. Fenced before its line instead,
// the number of a line that opens a page slides up beside the last line of the page before
// (gotcha: side-box-starts-at-fence).
const EVERY = 5;
const rows = (...lines) => lines.join('\n');
function numberVerse(markdown) {
  return markdown.replace(/^:::paragraphs\{style="verse"\}\n([\s\S]*?)\n:::$/gm, (_, poem) => {
    let n = 0;
    return poem.split('\n').map((line) => {
      if (!line.trim()) return ':::space{lines=1}'; // one blank line of the grid
      n += 1;
      const style = line.startsWith('  ') ? 'short' : 'verse';
      const verse = rows(`:::paragraphs{style="${style}"}`, line.trim(), ':::');
      if (n % EVERY) return verse;
      return rows(verse, '', ':::callout{type="lineno" span="side"}',
        ':::paragraphs{style="number"}', n, ':::', ':::');
    }).join('\n\n');
  });
}
const lineno = { id: 'lineno', backgroundEnabled: false, // no box: only the number shows
  padding: { top: pt(-LEAD), right: pt(0), bottom: pt(0), left: pt(0) } };
// The number: right-aligned, so the numbers share a right edge, and at the verse's leading,
// so it sits on the baseline of its line.
const number = { id: 'number', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(LEAD),
  color: col('laurel'), textAlign: 'right' };
// Hook-up: calloutStyles: [lineno], paragraphStyles: [number, …] and
// buildDocument({ markdown: numberVerse(markdown) }, config()).
// #endregion

// #region page: a poetry trim, and a channel for the numbers at the fore-edge
const PT = 25.4 / 72; // mm in a point
const [TRIM_W, TRIM_H] = [138, 216]; // mm
const [TOP, INNER] = [21, 20]; // mm
const LINES = 34; // lines of verse to a page
const BOTTOM = TRIM_H - TOP - LINES * LEAD * PT; // 21.08 mm
const [MEASURE, GUTTER, CHANNEL] = [80, 4, 6]; // mm: the longest line of Lycidas is 78.1 mm
const OUTER = TRIM_W - INNER - MEASURE - GUTTER - CHANNEL; // 28 mm beyond the numbers
const layout = {
  layoutType: 'oneAndHalf',
  sideColumnRole: 'floats', // the side column takes side boxes, never text
  sideColumnSide: 'outer', // right of the verse on a recto, left of it on a verso
  // 6 of 90 mm. The zero is Libre Franklin's widest figure, so '100' (4.9 mm) is the widest number.
  sideColumnPercent: (CHANNEL / (MEASURE + GUTTER + CHANNEL)) * 100,
  gutterWidth: mm(GUTTER),
};
const page = { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
  margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER), mirror: true } };
// #endregion

// #region verse: a paragraph per line, ragged, and the short lines set in
const verseStyles = [
  // Ragged, like all the text here (bodyText). A line too long for the measure would turn
  // over and hang 2 em in; none does at 80 mm.
  { id: 'verse', hangingIndent: em(2) },
  // Milton's short lines: a one-line paragraph, so the first-line indent moves all of it.
  { id: 'short', firstLineIndent: em(2) },
];
// #endregion

// #region opener: the laurel, the title in tall capitals, and the headnote of 1645
const OPENER_LINES = 20; // of the page's 34: the first verse paragraph, 14 lines, takes the rest
const at = (id, edge, y) => ({ anchor: { to: id, edge }, offset: { x: mm(0), y: mm(y) } });
const title = (size, tracking, placement) => ({ kind: 'text', id: 'title', content: '{titleText}',
  // lineHeight is a multiple of the size (gotcha: design-lineheight-multiple).
  fontFamily: DISPLAY, fontWeight: 300, fontSize: pt(size), lineHeight: 1,
  letterSpacing: pt(tracking), textTransform: 'uppercase', color: col('ink'), placement });
const opener = { enabled: true, minHeight: pt(OPENER_LINES * LEAD), slot: { elements: [
  // An image element reserves no height (gotcha: opener-image-no-reserve): the kicker, title
  // and headnote under it reach down 20 lines. minHeight is a floor at the same depth, so a
  // shorter headnote leaves the verse on line 21.
  { kind: 'image', id: 'laurel', resourceId: 'laurel',
    placement: { anchor: { to: 'page', edge: 'top-right' }, size: { width: mm(104) } } },
  { kind: 'text', id: 'kicker', content: '{author}', fontFamily: LABEL, fontWeight: 500,
    fontSize: pt(8), letterSpacing: pt(1.6), textTransform: 'uppercase', color: col('laurel'),
    placement: at('container', 'top-left', 50) },
  title(66, 2, at('#kicker', 'below', 1)),
  // # Lycidas {headnote="In this Monody …"}. Design text wraps ragged and has no inline
  // italics (gotcha: design-text-no-inline-marks); at 64 mm no word stands alone.
  { kind: 'text', id: 'headnote', content: '{attr.headnote}', fontFamily: TEXT, italic: true,
    fontSize: pt(9.5), lineHeight: 13 / 9.5, color: col('ink'), align: 'left', overflow: 'wrap',
    placement: { ...at('#title', 'below', 3), size: { width: mm(64) } } },
] } };
// Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break). span
// 'page' paints the laurel above the text block, where a column clips its design. With the
// default marginBottom the verse would start on line 22 and send line 14 to page 2.
const poem = { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
  advancedDesign: opener, marginBottom: pt(0) };
// #endregion

// #region notes: each note opens on its line number, a chip in the label face
const NOTE = 8.6; // pt: the notes, and the note on the text
const noteStyles = [
  { id: 'textnote', fontSize: pt(NOTE), lineHeight: pt(NOTE * 1.33) },
  // The note on the text ends on the grid, 2.4 mm below its last line; half a line more
  // leaves one blank line before the first note.
  { id: 'note', fontSize: pt(NOTE), lineHeight: pt(NOTE * 1.33), hangingIndent: em(1.6),
    marginTop: pt(LEAD / 2) },
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.5), color: col('muted'),
    marginTop: pt(LEAD) },
];
// :chip[8]{style="line"}: Linden Hill has no bold, so the number changes face and colour.
// The chip has no fill, outline or side padding, so nothing is drawn around the number.
const chipStyles = [{ id: 'line', backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0),
  fontFamily: LABEL, fontSize: em(0.9), color: col('laurel') }];
// # Notes {style="notes"} opens the next page under the title's capitals, smaller. A heading
// style keeps the level's break unless it sets its own (gotcha: style-inherits-break). Its
// design stays in the column, so the title lines up with the notes on either page.
const notesHead = { id: 'notes', span: 'column', breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true,
    slot: { elements: [title(30, 1, at('container', 'top-left', 0))] } } };
// #endregion

// #region heads: the author on the verso, the section on the recto, folios at the fore-edge
const HEAD = 13; // mm from the trim to the running heads' baseline
// A design text's first baseline sits 0.8 of a line below the top of its box: 0.96 em at the
// default lineHeight of 1.2, which the running heads keep.
const BASE = 1.2 * 0.8;
const head = (id, parity, content, x, size = 7.5, extra = {}) => ({ kind: 'text', id, parity,
  content, pages: 'body', fontFamily: LABEL, fontWeight: 500, fontSize: pt(size),
  letterSpacing: pt(1.3), textTransform: 'uppercase', color: col('muted'), ...extra,
  placement: { anchor: { to: 'page', edge: parity === 'even' ? 'top-left' : 'top-right' },
    offset: { x: mm(x), y: mm(HEAD - BASE * size * PT) } } });
const folio = { fontFamily: TEXT, fontWeight: 400, letterSpacing: pt(0), color: col('ink') };
const header = { elements: [
  head('verso-folio', 'even', '{pageNumber}', OUTER, 10, folio),
  head('verso-head', 'even', '{author}', OUTER + 9),
  head('recto-head', 'odd', '{chapterTitle}', -(OUTER + 9)), // LYCIDAS, then NOTES
  head('recto-folio', 'odd', '{pageNumber}', -OUTER, 10, folio),
] };
// The two openers carry their folio at the foot instead, at the outer edge of the text block.
const drop = (parity, edge, x) => ({ ...head(`drop-${parity}`, parity, '{pageNumber}', 0, 10,
  folio), pages: 'opener', placement: { anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(-12) } } });
const footer = { elements: [drop('odd', 'bottom-right', -OUTER),
  drop('even', 'bottom-left', OUTER)] };
// #endregion

const config = () => ({ // a factory: configs are cached by identity (gotcha: config-cache-identity)
  colorPalette, page, layout, header, footer,
  bodyText: { // every paragraph sits in a styled container and takes these as defaults
    fontFamily: TEXT, fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    // Ragged throughout, verse and notes alike, so nothing is hyphenated
    // (gotcha: ragged-no-hyphenation).
    textAlign: 'left', firstLineIndent: pt(0),
  },
  // The designs print the titles, but each heading's own text is still measured, in this face.
  // Left at the default, the page would fetch Open Sans 700 for text it never paints.
  headings: { fontFamily: DISPLAY, fontWeight: 300, levels: [poem] },
  headingStyles: [notesHead],
  paragraphStyles: [...verseStyles, number, ...noteStyles],
  calloutStyles: [lineno],
  chipStyles,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook: the poem
const notes = /* @content:notes */ ''; // content.notes.<lang>.md: the notes

// #region art: a sprig of bay laurel with its unripe berries, in the page's greens
let seed = 1645; // Mulberry32: a seeded generator, never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const f1 = (v) => v.toFixed(1);
const ring = (pts) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`;
const line = (pts) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}`;
const fill = (d, hex) => `<path d="${d}" fill="${hex}"/>`;
const stroke = (d, hex, w) => `<path d="${d}" fill="none" stroke="${hex}" stroke-width="${w}" `
  + 'stroke-linecap="round"/>';
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(palette[a].slice(i, i + 2),
  16) * (1 - k) + parseInt(palette[b].slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
  .join('')}`;
// A point on a cubic Bézier, with its direction.
const bez = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  const pos = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i]
    + t * t * t * p3[i];
  const d = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i])
    + 3 * t * t * (p3[i] - p2[i]);
  return { x: pos(0), y: pos(1), a: Math.atan2(d(1), d(0)) };
};
// The stem: the curve as a band tapering from w0 to w1.
const band = (curve, w0, w1) => {
  const [left, right] = [[], []];
  for (let i = 0; i <= 48; i++) {
    const p = bez(curve, i / 48);
    const w = (w0 + (w1 - w0) * (i / 48)) / 2;
    left.push([p.x - Math.sin(p.a) * w, p.y + Math.cos(p.a) * w]);
    right.unshift([p.x + Math.sin(p.a) * w, p.y - Math.cos(p.a) * w]);
  }
  return ring([...left, ...right]);
};
// A bay leaf from its base (x, y) along angle a: narrow at the stalk, widest a third of the
// way up, drawn out to a point, with its midrib bowed by `bend`. Returns the blade, the midrib
// and four pairs of side veins.
function bayLeaf(x, y, a, len, wide, bend) {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const to = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const mid = (t) => bend * len * Math.sin(Math.PI * t);
  const half = (t) => wide * Math.sin(Math.PI * t ** 0.72) ** 1.1;
  const edge = (sign) => Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return to(len * t, mid(t) + sign * half(t) * (1 + 0.035 * Math.sin(t * 23 + sign)));
  });
  const veins = [];
  for (const t of [0.24, 0.4, 0.56, 0.7]) {
    for (const sign of [1, -1]) {
      veins.push(line([to(len * t, mid(t)),
        to(len * (t + 0.13), mid(t + 0.13) + sign * half(t + 0.13) * 0.72)]));
    }
  }
  return { blade: ring([...edge(1), ...edge(-1).reverse()]),
    rib: line(Array.from({ length: 17 }, (_, i) => to(len * i / 18, mid(i / 18)))),
    veins: veins.join('') };
}
function laurel(w, h) {
  const stem = [[w + 40, -60], [w * 0.8, h * 0.12], [w * 0.62, h * 0.62], [w * 0.14, h * 0.7]];
  const back = [];
  const front = [];
  const berries = [];
  const N = 15;
  for (let i = 0; i < N; i++) {
    const t = 0.03 + (i / (N - 1)) * 0.9;
    const p = bez(stem, t);
    const side = i % 2 ? 1 : -1;
    const len = (300 - 150 * t) * (0.88 + rand() * 0.24);
    const turned = i % 4 === 2; // seen edge-on, its paler underside up
    const a = p.a + side * (0.42 + rand() * 0.5);
    const stalk = [p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14];
    const blade = bayLeaf(stalk[0], stalk[1], a, len, len * (turned ? 0.12 : 0.2),
      side * (0.04 + rand() * 0.05));
    (turned ? back : front).push({ ...blade, stalk: line([[p.x, p.y], stalk]) });
    if (i % 4 === 1 && t < 0.8) { // a small umbel of berries in the leaf's axil
      const b = p.a - side * 0.9;
      const hub = [p.x + Math.cos(b) * 26, p.y + Math.sin(b) * 26];
      for (let k = 0; k < 4; k++) {
        const ba = b + (k - 1.5) * 0.42;
        const r = 40 + rand() * 12;
        berries.push({ stalk: line([[p.x, p.y], hub, [hub[0] + Math.cos(ba) * r * 0.6,
          hub[1] + Math.sin(ba) * r * 0.6]]), x: hub[0] + Math.cos(ba) * r,
        y: hub[1] + Math.sin(ba) * r, a: ba });
      }
    }
  }
  const [end, bud] = [bez(stem, 1), bez(stem, 0.97)]; // the shoot ends in two young leaves
  front.push({ ...bayLeaf(end.x, end.y, end.a - 0.08, 120, 21, 0.05), stalk: '' },
    { ...bayLeaf(bud.x, bud.y, bud.a + 0.55, 72, 13, -0.06), stalk: '' });
  const [wood, pale, vein] = [mix('laurel', 'ink', 0.35), mix('leaf', 'paper', 0.25),
    mix('laurel', 'paper', 0.28)];
  const out = [];
  for (const b of back) {
    out.push(stroke(b.stalk, wood, 5), fill(b.blade, palette.leaf), stroke(b.rib, pale, 3));
  }
  out.push(fill(band(stem, 17, 6), wood));
  for (const b of berries) {
    out.push(stroke(b.stalk, wood, 3.5), `<ellipse cx="${f1(b.x)}" cy="${f1(b.y)}" rx="21" `
      + `ry="16.5" transform="rotate(${f1(b.a * 180 / Math.PI)} ${f1(b.x)} ${f1(b.y)})" `
      + `fill="${palette.berry}"/>`);
  }
  for (const b of front) {
    out.push(stroke(b.stalk, wood, 5), fill(b.blade, palette.laurel), stroke(b.rib, vein, 3.2),
      stroke(b.veins, vein, 1.6));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `
    + `viewBox="0 0 ${w} ${h}">${out.join('')}</svg>`;
}
await loadSvg('laurel.svg', laurel(1040, 740)); // tenths of a millimetre: 104 × 74 mm
// #endregion
const resources = [{ id: 'laurel', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'laurel.svg', width: 1040, height: 740 },
  altText: 'A sprig of bay laurel with a cluster of unripe berries, entering from the corner.' }];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before the first build (gotcha: fonts-first). Linden Hill has no bold, Imbue no italic.
const FONTS = { 'Linden Hill': ['400', '400i'], Imbue: ['300'], 'Libre Franklin': ['400', '500'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown + notes);
const source = `${numberVerse(markdown)}\n\n${notes}`;
const doc = await buildWithFonts(() => buildDocument({ markdown: source, resources }, config()),
  source);
showPages(doc, { title: 'Lycidas · with line numbers and notes' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
