// ═══ Postext Cookbook · Nº 020 · Endnotes in two columns instead of footnotes ═════════
// https://postext.dev/en/cookbook/endnotes-instead-of-footnotes
// Code: MIT · Text: Faraday, ed. Crookes (PD, Gutenberg #14474) · Notes, drawings: CC BY 4.0
// Fonts: Libre Bodoni, Besley, Archivo Narrow (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'endnotes-instead-of-footnotes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: soot, wax and a flame; the ember is the flame dark enough for small type
const palette = {
  ink: '#1f1c19', paper: '#fffdf8', // text and the soot of the fields; a warm white page
  flame: '#e08a1e', ember: '#a9560c', // kickers on soot (6:1); markers and numbers (5.1:1)
  wax: '#f6efe1', rule: '#d4c6ad', // type on soot; hairlines and small type on soot (10:1)
  muted: '#6d6356', blue: '#4f7cae', // running heads, colophon (5.8:1); a flame's blue foot
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the ember, so nothing prints blue.
// col() writes the hex too: design slots do not read the palette (gotcha: palette-skips-designs).
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ember })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Libre Bodoni', DISPLAY = 'Besley', LABEL = 'Archivo Narrow'; // text; titles; labels
const TOP = 22, INNER = 18, OUTER = 22; // mm: margins, and a 116 mm measure of 74 characters

// #region answer: Markdown footnotes become raised markers and a Notes section
// Use: buildDocument({ markdown: endnotes(markdown) }, config()), with a 'note' paragraph style.
// [^label] in the text → **^n^**, numbered by first citation; bold, so it takes bodyText.boldColor.
// The [^label]: definitions (one line each) print where the first stood, a 'note' paragraph each:
// '**n** text', never '1. text', which would open a numbered list (gotcha: digit-period-list).
function endnotes(markdown, style = 'note') {
  const notes = new Map(); // label → text
  const HOLE = '\u0000'; // marks where a definition stood: the first becomes the notes
  const text = markdown.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.+)\n?/gm,
    (_, label, note) => { notes.set(label, note.trim()); return HOLE; });
  const cited = []; // labels in order of first citation
  const number = (label) => {
    if (!notes.has(label)) throw new Error(`The note [^${label}] has no definition`);
    if (!cited.includes(label)) cited.push(label);
    return cited.indexOf(label) + 1;
  };
  // Markers side by side share one superscript, [^a][^b] → **^1,2^**, never 12 raised (note 12).
  // A word joiner (U+2060, no width) opens each one: after an italic, '*Royal George*' and the
  // bold's ** would make '***', which the parser reads as a bold run, and print the asterisks.
  const marked = text.replace(/(?:\[\^[^\]\s]+\])+/g, (run) => {
    const numbers = [...run.matchAll(/\[\^([^\]\s]+)\]/g)].map(([, label]) => number(label));
    return `⁠**^${numbers.join(',')}^**`;
  });
  const unused = [...notes.keys()].filter((label) => !cited.includes(label));
  if (unused.length) console.warn(`Notes never cited: ${unused.join(', ')}`);
  const entries = cited.map((label, i) => `**${i + 1}** ${notes.get(label)}`);
  const section = `:::paragraphs{style="${style}"}\n${entries.join('\n\n')}\n:::\n`;
  return marked.replace(HOLE, () => section).replaceAll(HOLE, ''); // () =>: '$&' stays text
}
// #endregion

// #region markers: the lecture has no bold of its own, so the bold colour is free for the markers
const markers = { boldColor: col('ember'), // **^n^**: a superscript at 58 % of the text size
  referenceBold: false }; // [Fig. 1] follows the bold colour, set roman
// #endregion

// #region notes: 8.2 pt, set ragged, each number hanging in the indent
const NOTE = 8.2; // pt: the notes' size, about four fifths of the text
// The hang is a bold number and an en space, measured in the notes' face once the fonts are in:
// a bold 5 matches 2, 3 and 6 within 0.02 em (the 4 is 0.05 em wider, the 1 0.14 em narrower).
function hang(label = '5') { // from ten notes on, pass the widest label: hang('10')
  const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  const width = (w, s) => { ctx.font = `${w} 100px "${TEXT}"`; return ctx.measureText(s).width; };
  return em((width(700, label) + width(400, ' ')) / 100);
}
// Ragged, as justifying would stretch the en space (gotcha: ragged-no-hyphenation).
const noteStyles = () => [{ id: 'note', fontSize: pt(NOTE), lineHeight: pt(NOTE * 1.3),
  textAlign: 'left', hangingIndent: hang() },
  // 22 pt above the colophon is copy-fitted: its last line and the first column's share a line.
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(9.2), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(22) },
];
// #endregion

// Design text wraps (it ends in an ellipsis by default: gotcha overflow-ellipsis-default).
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  overflow: 'wrap', align: 'left', ...extra });
const caps = (s) => ({ fontWeight: 600, textTransform: 'uppercase', letterSpacing: pt(s * 0.18) });
const display = { fontWeight: 800, lineHeight: 1 }; // the titles, set solid
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width) } }) });
const below = (id, y, width) => at(`#${id}`, 'below', 0, y, width);
// A field of soot from the trim's top, edge to edge, and a candle standing on its lower edge.
const soot = (height) => ({ kind: 'box', id: 'soot', style: { backgroundColor: col('ink') },
  placement: { ...at('page', 'top-left', 0, 0), size: { width: 'fill', height: mm(height) } } });
const art = (id, width, height, foot, x) => ({ kind: 'image', id, resourceId: id,
  placement: at('page', 'top-right', -x, foot - height, width) });

const series = text('series', '{title}', LABEL, 7.6, 'rule', at('container', 'top-left', 0, 4),
  caps(7.6)); // the book's title, from the frontmatter, heads both bands

// #region opener: the lecture opens on a field of soot with a lit candle
const FIELD = 112; // mm from the trim's top
// The field reaches below the heading, so it sets the reserve (gotcha: opener-reserves-anchored);
// the H1's default bottom margin (0.5 em of 18 pt) rides on it: the text starts a grid line lower.
const opener = { enabled: true,
  slot: { elements: [soot(FIELD), art('candle', 40, 100, FIELD, 10), series,
    text('kicker', '{attr.kicker}', LABEL, 9.5, 'flame', below('series', 17, 60), caps(9.5)),
    text('title', '{titleText}', DISPLAY, 48, 'wax', below('kicker', 1.5, 96), display),
    // 86 mm breaks the subtitle after a dash: no-break spaces do not hold (gotcha: nbsp-breaks)
    text('subtitle', '{attr.subtitle}', DISPLAY, 11.5, 'rule', below('title', 3.5, 86),
      { fontWeight: 500, italic: true, lineHeight: 1.3 }),
    text('byline', '{attr.byline}', LABEL, 7.6, 'rule', below('subtitle', 7, 84), caps(7.6)),
  ] } };
// #endregion

// #region section: the notes open a page of their own, in two columns under a band of soot
const BAND = 82; // mm from the trim's top: level with the foot of Figure 1 across the spread
// The band sets the reserve too, but the first grid line clear of it lies 3 mm under the soot:
const BAND_GAP = 5; // mm more of minHeight moves the notes down a line
const notesSection = { id: 'notes', // an opener page: the drop folio, no running heads
  breakBefore: { enabled: true, parity: 'any' }, span: 'page', // the next page, either side
  layout: { layoutType: 'double', gutterWidth: mm(6) }, // two columns of about 40 characters
  advancedDesign: { enabled: true, minHeight: mm(BAND - TOP + BAND_GAP), slot: { elements: [
    soot(BAND), art('snuffed', 32, 64, BAND, 12), series,
    text('kicker', '{attr.kicker}', LABEL, 9.5, 'flame', at('container', 'top-left', 0, 16),
      caps(9.5)),
    text('title', '{titleText}', DISPLAY, 52, 'wax', below('kicker', 0.5, 80), display),
    text('intro', '{attr.intro}', LABEL, 8.4, 'rule', below('title', 2.5, 92),
      { lineHeight: 1.3 }),
  ] } } };
// #endregion

const head = (id, content, parity, edge, x, extra) => ({ kind: 'text', id, content, parity,
  pages: 'body', fontFamily: LABEL, fontSize: pt(7.6), color: col('muted'), ...caps(7.6),
  placement: at('page', edge, x, 13), ...extra });
const folio = { fontFamily: DISPLAY, fontSize: pt(8.6), fontWeight: 700, color: col('ink'),
  letterSpacing: pt(0) }; // untracked figures
const header = { elements: [ // the book on the verso, the lecture on the recto, folios outside
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
  head('recto-title', '{attr.kicker} · {chapterTitle}', 'odd', 'top-right', -(OUTER + 9)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const dropFolio = text('drop', '{pageNumber}', DISPLAY, 8.6, 'ink', at('page', 'bottom', 0, -12),
  { fontWeight: 700, align: 'center', pages: 'opener' }); // the lecture's and the notes' openers

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  colorPalette, header, footer: { elements: [dropFolio] },
  page: { width: mm(156), height: mm(234), dpi: 150, // a trade octavo
    backgroundColor: col('paper'), margins: { top: mm(TOP), bottom: mm(23), left: mm(INNER),
      right: mm(OUTER), mirror: true } }, // left is the inner margin
  // Drawn only where a page has two columns: the notes' (gotcha: section-column-rule).
  layout: { layoutType: 'single', columnRule: { enabled: true, color: col('rule') } },
  bodyText: { fontFamily: TEXT, fontSize: pt(10), lineHeight: pt(13.8), color: col('ink'),
    italicColor: col('ink'), ...markers, firstLineIndent: mm(4.5), indentAfterHeading: false,
    minWordSpacing: 0.85, maxWordSpacing: 1.8 }, // the loosest lines reach 1.78 under any cap
  headings: { fontFamily: DISPLAY, color: col('ink'), levels: [
    // Break restated (gotcha: headings-drop-h1-break); the span lets the design reach the trim.
    { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'odd' },
      advancedDesign: opener },
  ] },
  headingStyles: [notesSection], paragraphStyles: noteStyles(),
  // One figure, numbered through the book: "Figure 1", not the chapter-scoped "Figure 1.1".
  resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figure',
    numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }],
  captionStyle: { fontFamily: LABEL, fontSize: pt(8.2), labelColor: col('ember') },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

const svgResource = (id, width, height, extra) => ({ id, typeId: 'figure', kind: 'svg',
  svg: { fileId: `${id}.svg`, width, height }, createdAt: 0, updatedAt: 0, ...extra });
const resources = [
  svgResource('candle', 1600, 4000), svgResource('snuffed', 1100, 2200), // uncited: design only
  // Cited on page 17, the 'top' figure heads page 18 (gotcha: top-float-next-page).
  svgResource('flame', 2320, 1200, { placement: { position: 'top' }, caption: 'A candle flame as '
    + 'it looks under a glass shade (left) and in section (right): the dark core of wax vapour '
    + 'round the wick, the blue foot where the air first meets it, the bright zone where soot '
    + 'glows, and the faint mantle, the hottest part. Heated air rises round it and draws it up.',
    altText: 'A candle flame, whole and in section, with arrows of rising air' }),
];

// #region art: a lit candle, a snuffed one and the flame in section, in the palette (seeded)
// No words in the drawings: an SVG drawn as an image cannot use web fonts
// (gotcha: svg-no-webfonts). Arrowheads are paths (gotcha: svg-no-marker-filters).
function rng(seed) { // Mulberry32: the same smoke on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (v) => +v.toFixed(2);
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 10}" `
  + `height="${h * 10}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const shape = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d, stroke, width, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const dot = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const op = (v) => ` fill-opacity="${v}"`;
// Light round a flame: a radial gradient from the flame's colour to nothing.
const halo = (x, y, r, strength) => `<radialGradient id="h${x}" cx="0.5" cy="0.5" r="0.5">`
  + `<stop offset="0" stop-color="${palette.flame}" stop-opacity="${strength}"/>`
  + `<stop offset="0.45" stop-color="${palette.flame}" stop-opacity="${strength * 0.35}"/>`
  + `<stop offset="1" stop-color="${palette.flame}" stop-opacity="0"/></radialGradient>`
  + dot(x, y, r, `url(#h${x})`);
// A flame from its foot (x, base) up to its tip: round below, drawn out above.
function tongue(x, base, top, half) {
  const h = base - top;
  return `M${n(x)} ${n(top)}C${n(x + half * 0.3)} ${n(top + h * 0.28)} ${n(x + half)} `
    + `${n(top + h * 0.5)} ${n(x + half)} ${n(top + h * 0.74)}`
    + `C${n(x + half)} ${n(base - h * 0.04)} `
    + `${n(x + half * 0.5)} ${n(base)} ${n(x)} ${n(base)}C${n(x - half * 0.5)} ${n(base)} `
    + `${n(x - half)} ${n(base - h * 0.04)} ${n(x - half)} ${n(top + h * 0.74)}C${n(x - half)} `
    + `${n(top + h * 0.5)} ${n(x - half * 0.3)} ${n(top + h * 0.28)} ${n(x)} ${n(top)}Z`;
}
// The flame's zones: mantle, bright body, dark core round the wick, blue foot.
function flameAt(x, base, top, half, { lit = true, section = false } = {}) {
  const h = base - top;
  const P = palette;
  let out = shape(tongue(x, base + 2, top - h * 0.08, half * 1.22), P.flame,
    section ? `${op(0.16)} stroke="${P.flame}" stroke-width="0.8"` : op(0.22));
  out += shape(tongue(x, base, top, half), P.flame);
  if (!section) { // as seen: brighter above, darker below
    out += shape(tongue(x, base - h * 0.22, top + h * 0.1, half * 0.72), P.wax, op(0.55))
      + shape(tongue(x, base - h * 0.38, top + h * 0.2, half * 0.42), P.wax, op(0.75));
  }
  out += shape(tongue(x, base, base - h * (section ? 0.5 : 0.36), half * (section ? 0.5 : 0.36)),
    section ? P.ink : P.ember, op(section ? 0.72 : 0.7));
  out += shape(`M${n(x - half * 0.95)} ${n(base - h * 0.1)}Q${n(x)} ${n(base + h * 0.06)} `
    + `${n(x + half * 0.95)} ${n(base - h * 0.1)}Q${n(x + half * 0.7)} ${n(base + h * 0.03)} `
    + `${n(x)} ${n(base + h * 0.03)}Q${n(x - half * 0.7)} ${n(base + h * 0.03)} `
    + `${n(x - half * 0.95)} ${n(base - h * 0.1)}Z`, P.blue, op(lit ? 0.9 : 0));
  return out;
}
// A pillar of wax from y down past the art's foot, with the cup of melted wax on top.
function pillar(x, y, half, foot, drip = 0) {
  const P = palette;
  const shade = `<linearGradient id="w${x}" x1="0" x2="1" y1="0" y2="0">` // rounded by light
    + `<stop offset="0" stop-color="${P.rule}"/><stop offset="0.3" stop-color="${P.wax}"/>`
    + `<stop offset="0.62" stop-color="${P.wax}"/><stop offset="1" stop-color="${P.rule}"/>`
    + '</linearGradient>';
  return shade + `<rect x="${n(x - half)}" y="${n(y)}" width="${n(half * 2)}" `
    + `height="${n(foot - y)}" fill="url(#w${x})"/>`
    + (drip ? shape(`M${n(x - half * 0.78)} ${n(y)}h${n(half * 0.34)}v${n(drip)}a${n(half * 0.17)} `
      + `${n(half * 0.17)} 0 0 1-${n(half * 0.34)} 0Z`, P.wax) : '')
    + `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(half)}" ry="${n(half * 0.2)}" `
    + `fill="${P.wax}"/>`
    + `<ellipse cx="${n(x)}" cy="${n(y + half * 0.02)}" rx="${n(half * 0.76)}" `
    + `ry="${n(half * 0.13)}" fill="${P.rule}"${op(0.8)}/>`; // the cup of melted wax
}
const wick = (x, y, len, lean = 2) => line(`M${n(x)} ${n(y)}q${n(lean * 0.3)} ${n(-len * 0.5)} `
  + `${n(lean)} ${n(-len)}`, palette.ink, 1.6);
// Rising air: a curve from beside the foot to above the tip, and a path arrowhead.
function draught(x0, y0, x1, y1, color, width, opacity) {
  const head = shape(`M${n(x1 - 2.2)} ${n(y1 + 3.2)}L${n(x1)} ${n(y1 - 0.6)}L${n(x1 + 2.2)} `
    + `${n(y1 + 3.2)}Z`, color, op(opacity));
  return line(`M${n(x0)} ${n(y0)}C${n(x0)} ${n((y0 + y1) / 2)} ${n(x1)} ${n(y0 - (y0 - y1) * 0.6)} `
    + `${n(x1)} ${n(y1 + 2)}`, color, width, ` stroke-opacity="${opacity}"`) + head;
}
function candle() { // the opener's: 40 × 100 mm, lit, with a halo on the soot
  return svg(160, 400, halo(80, 128, 80, 0.34) + flameAt(80, 206, 66, 19)
    + pillar(80, 222, 30, 400, 46) + wick(79, 223, 22));
}
function snuffed() { // the notes band's: 32 × 64 mm, blown out, three strands of smoke
  const r = rng(7);
  const P = palette;
  let out = pillar(55, 140, 24, 220, 26) + wick(54, 141, 14, 3);
  for (let k = 0; k < 3; k++) { // three strands of vapour, thinning as they rise
    let d = `M${n(57 + k)} 126`;
    for (let y = 126, a = r() * 6; y > 8; y -= 14, a += 1.3) {
      d += `S${n(57 + Math.sin(a) * (4 + (126 - y) * 0.12))} ${n(y - 7)} `
        + `${n(57 + Math.sin(a + 0.8) * (3 + (126 - y) * 0.1))} ${n(y - 14)}`;
    }
    out += line(d, P.rule, 1.2 - k * 0.3, ` stroke-opacity="${0.55 - k * 0.15}"`);
  }
  return svg(110, 220, out + dot(57, 127, 1.6, P.ember));
}
function flame() { // Figure 1: 116 × 60 mm, as seen and in section, on soot
  const P = palette;
  let out = `<rect width="232" height="120" rx="2" fill="${P.ink}"/>`;
  out += halo(70, 60, 46, 0.3) + flameAt(70, 92, 24, 11) + pillar(70, 100, 17, 120, 12)
    + wick(69.5, 101, 12) // then the glass shade, open below, drawn over the candle it stands round
    + `<path d="M47 112V17a5 5 0 0 1 5-5h36a5 5 0 0 1 5 5v95" fill="${P.wax}"${op(0.05)} `
    + `stroke="${P.rule}" stroke-opacity="0.4" stroke-width="0.8"/>`
    + line('M52 18v88', P.wax, 1.4, ' stroke-opacity="0.18"');
  for (const side of [-1, 1]) { // the air the flame heats, rising round it
    out += draught(160 + side * 32, 108, 160 + side * 10, 14, P.rule, 1, 0.75)
      + draught(160 + side * 44, 104, 160 + side * 22, 30, P.rule, 1, 0.5);
  }
  return svg(232, 120, out + flameAt(160, 92, 24, 11, { section: true })
    + pillar(160, 100, 17, 120) + wick(159.5, 101, 12));
}
const drawings = { candle, snuffed, flame };
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = { 'Libre Bodoni': ['400', '400i', '700'], // text and notes (700: the numbers)
  Besley: ['500i', '700', '800'], 'Archivo Narrow': ['400', '400i', '600', '700'] }; // labels

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const source = endnotes(markdown); // the answer, run before the engine sees the text
await Promise.all([loadFonts(FONTS, source),
  ...Object.entries(drawings).map(([id, draw]) => loadSvg(`${id}.svg`, draw()))]);
// The lecture starts on folio 15, a recto, 14 pages into the book (gotcha: parity-page1-recto).
const continuation = { pageIndexOffset: 14, pageNumbering: { startAt: 15 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown: source, resources, continuation }, config()), source);
showPages(doc, { title: 'The Chemical History of a Candle, Lecture I' });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
