// ═══ Postext Cookbook · Nº 022 · Worksheet with answer boxes and a word bank ══════
// https://postext.dev/en/cookbook/worksheet-answer-boxes
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Andika, Baloo 2, Fredoka (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'worksheet-answer-boxes';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#243040', muted: '#5d6975', paper: '#ffffff', // type; prompts; boxes
  leaf: '#2f7d4a', sun: '#f4b43a', soil: '#8a5a36', // the accent; words to pick; drawings
  tint: '#e5f1e7', rule: '#a9c9b1' }; // the activity cards; answer-box outlines
// Design elements read the hex and ignore the palette (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the leaf, so nothing prints blue.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.leaf })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, DISPLAY, LABEL] = ['Andika', 'Baloo 2', 'Fredoka']; // Andika: for early readers
const [TOP, SIDE] = [18, 16]; // mm; a sheet printed one-sided, so the margins do not mirror

// #region answer: cards that hold white answer boxes, stacked exactly, off the grid
// In the Markdown a box inside a box is a fence inside a fence (each ::: closes one):
//   :::callout{type="card"}
//   What is inside the pea pods?
//   :::callout{type="answer"}
//   Write here               ← a prompt first: a box of :::space alone collapses
//   :::space{lines=3}           (gotcha: space-dropped-box-top)
//   :::
//   :::
const [ASK, AFTER, HEAD, NEXT] = [2, 5, 3, 9]; // mm: question→box, box→next, heading→card
const card = {
  id: 'card', background: col('tint'), borderRadius: mm(4),
  padding: { top: mm(4), right: mm(5), bottom: mm(5), left: mm(5) },
  marginTop: mm(HEAD), marginBottom: mm(NEXT), // NEXT: under a card, to whatever follows
  // Off the grid, or what follows a card drops to the next grid line. Only the outer card can
  // set it: a nested box ignores snapToGrid, span and placement (gotcha: nested-callout-limits).
  snapToGrid: false,
  body: { paragraphSpacing: false }, // the boxes' margins do all the spacing
  lists: { bulletChar: '', // no bullet: in the checklist a circle chip opens each item
    gap: mm(2), itemSpacing: pt(7) }, columnGap: mm(6),
};
// A nested box's margins collapse with its neighbours', the larger winning (ASK, AFTER); the
// last box's marginBottom falls inside the card's padding instead of adding to it.
const nested = (id, look) => ({ id, background: col('paper'), borderRadius: mm(2.5),
  marginTop: mm(ASK), marginBottom: mm(AFTER), ...look });
const answer = nested('answer', { border: { enabled: true, color: col('rule'), width: pt(0.75) },
  padding: { top: mm(1.6), right: mm(3), bottom: mm(2), left: mm(3) },
  // A small grey prompt on a full 17 pt line; :::space counts in these body lines.
  body: { fontFamily: LABEL, fontSize: pt(8), color: col('muted') } });
const bank = nested('bank', { title: t({ en: 'Word bank', es: 'Banco de palabras' }),
  padding: { top: mm(2.2), right: mm(3), bottom: mm(2.4), left: mm(3) },
  titleStyle: { fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 600, color: col('leaf'),
    textTransform: 'uppercase', letterSpacing: pt(1.3), gap: mm(1.6) } });
// config() plugs in all three: calloutStyles: [card, answer, bank].
// #endregion

// #region chips: words to pick, blanks to fill, dots to join, circles to colour
const chip = (id, fill, look) => ({ id, fontFamily: LABEL, background: col(fill),
  borderWidth: pt(0), borderColor: col('leaf'), borderRadius: em(1), ...look });
// An empty chip holds a U+2060 word joiner, as one of spaces prints its markup (gotcha:
// empty-chip). Its box is a band 1.25 em tall, so paddingX ROUND makes it a circle.
const [EMPTY, ROUND, OUTLINE] = ['\u2060', em(0.625), pt(0.9)];
// A blank is all padding, 2 × paddingX wide and 19.6 pt tall: taller than the 17 pt line, so
// the card's itemSpacing sets its items 24 pt apart (gotcha: chip-overlap).
const blank = (id, width) => chip(id, 'paper', { borderWidth: OUTLINE, borderRadius: mm(1.4),
  paddingX: mm(width / 2), paddingY: em(0.12), fontSize: em(1.15) });
const chipStyles = [
  chip('word', 'sun', { bold: true, paddingX: em(0.6), paddingY: em(0.08), gap: em(0.45) }),
  blank('blank', 34), blank('wide', 38), // mm: in a sentence; alone in a column
  chip('dot', 'leaf', { paddingX: ROUND, fontSize: em(0.6) }),
  chip('tick', 'paper', { borderWidth: OUTLINE, paddingX: ROUND, fontSize: em(1.1), gap: em(0.5) }),
];
// #endregion

// #region activity: an in-column H2 design: the automatic number in a green disc
const DISC_H2 = 8.6; // mm: the disc and the title are this tall, so the heading reserves this
const numberDisc = { kind: 'text', id: 'num', content: '{number}', // numberingTemplate '{2}'
  fontFamily: DISPLAY, fontSize: pt(15), fontWeight: 800, color: col('paper'),
  box: { backgroundColor: col('leaf'), borderRadius: mm(DISC_H2 / 2) }, // centred both ways
  placement: { anchor: { to: 'container', edge: 'top-left' },
    size: { width: mm(DISC_H2), height: mm(DISC_H2) } } };
const activityTitle = { kind: 'text', id: 'title', content: '{titleText}',
  fontFamily: DISPLAY, fontSize: pt(17), fontWeight: 700, color: col('ink'), align: 'left',
  overflow: 'wrap', placement: { anchor: { to: '#num', edge: 'right-of' },
    offset: { x: mm(3) }, size: { width: mm(140), height: mm(DISC_H2) } } };
const activity = { enabled: true, slot: { elements: [numberDisc, activityTitle] } };
// ## How did I do? {style="review"} is not an activity: it has no number and a star for a disc.
const review = { id: 'review', numbered: false, advancedDesign: { ...activity, slot: {
  elements: [{ kind: 'image', id: 'num', resourceId: 'star', placement: numberDisc.placement },
    activityTitle] } } };
// #endregion

const [BAND, AIR, DOT] = [76, 5, 6]; // mm: the opener's band, air under the disc, dot size
const DISC = { x: 108, y: 5, d: 78 }; // mm: the drawing's disc on the page
const at = (x, y, size, edge = 'top-left') => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) }, size });
const words = (id, content, family, size, weight, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), fontWeight: weight, color: col('paper'),
  align: 'left', overflow: 'wrap', placement, ...extra });
const tag = { textTransform: 'uppercase', letterSpacing: pt(1.3) };
const dot = ([n, x, y]) => words(`dot${n}`, String(n), DISPLAY, 10.5, 800, at(DISC.x + x - DOT / 2,
  DISC.y + y - DOT / 2, { width: mm(DOT), height: mm(DOT) }), { color: col('ink'), align: 'center',
  box: { backgroundColor: col('sun'), borderRadius: mm(DOT / 2) } }); // a yellow disc per number
const field = (id, label, x, w) => [words(`${id}-label`, label, LABEL, 7.5, 600, at(x, 59), tag),
  { kind: 'box', id, style: { backgroundColor: col('paper'), borderRadius: mm(1.6) },
    placement: at(x, 63, { width: mm(w), height: mm(7.5) }) }]; // a label over a white field
// Images reserve no height in an opener (gotcha: opener-image-no-reserve), so minHeight does.
const opener = () => ({ enabled: true, minHeight: mm(DISC.y + DISC.d + AIR - TOP),
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('leaf') },
      placement: at(0, 0, { height: mm(BAND) }) },
    { kind: 'image', id: 'plant', resourceId: 'plant',
      placement: at(DISC.x, DISC.y, { width: mm(DISC.d), height: mm(DISC.d) }) },
    ...LABELS.map(dot),
    words('unit', '{attr.unit}', LABEL, 9, 600, at(SIDE, TOP - 4), { ...tag, color: col('ink'),
      box: { backgroundColor: col('sun'), borderRadius: mm(3),
        padding: { top: mm(1), right: mm(2.6), bottom: mm(1), left: mm(2.6) } } }),
    words('title', '{titleText}', DISPLAY, 40, 800, at(SIDE, 23.5, { width: mm(88) }),
      { lineHeight: 0.98 }), // two lines: the headings break with \\
    words('series', '{title} · {subtitle} · {attr.sheet}', LABEL, 9.5, 500, at(SIDE, 53)),
    ...field('name', t({ en: 'Name', es: 'Nombre' }), SIDE, 58),
    ...field('date', t({ en: 'Date', es: 'Fecha' }), SIDE + 62, 22),
  ] } });

// #region tables: a rounded panel with a picture in each row and chips to join
const tableStyles = [{ id: 'match', borderRadius: mm(3), // no header row, so no header fill
  headerBackgroundEnabled: false, bodyBackgroundEnabled: true, bodyBackground: col('paper'),
  bodyFontFamily: LABEL, bodyFontSize: pt(13), bodyColor: col('ink'), cellPadding: mm(1.4),
  // White rules on the white panel: unseen, but they hide the canvas's seams between cells.
  rules: 'grid', borderColor: col('paper'), borderWidth: pt(1) }];
const cell = (content, extra) => ({ content, verticalAlign: 'middle', ...extra });
const dotCell = () => cell(`:chip[${EMPTY}]{style="dot"}`, { align: 'center' });
const matchRow = (icon, food, part) => [cell('', { image: { resourceId: icon, width: 0.76 },
  align: 'center' }), cell(food), dotCell(), cell(''), dotCell(),
cell(`:chip[${part}]{style="word"}`)];
const sheetType = { id: 'sheet', name: 'Worksheet item', shortLabel: '', captionPrefix: '',
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }; // no caption, no number
// Set 'here' in its card, after a :::space (gotcha: box-embed-no-gap); built once FOODS exist.
const foods = () => ({ id: 'foods', typeId: 'sheet', kind: 'table', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' }, table: { styleId: 'match', model: {
    columnWidths: [0.14, 0.25, 0.06, 0.31, 0.06, 0.18], // the widest gap: room to draw a line
    rows: FOODS.map((name, r) => matchRow(ICONS[r], name, PARTS[r])) } } });
// #endregion

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  locale: t({ en: 'en-us', es: 'es' }), // exact codes only (gotcha: hyphenation-locales)
  resourceTypes: [sheetType], colorPalette, chipStyles, tableStyles, header: { elements: [] },
  footer: { elements: [words('foot', '{title} · {subtitle} · {attr.unit} · {pageNumber}', LABEL,
    7.8, 600, at(SIDE, -11, undefined, 'bottom-left'), { ...tag, color: col('muted') })] },
  page: { width: mm(200), height: mm(260), dpi: 150, margins: { top: mm(TOP), bottom: mm(20),
    left: mm(SIDE), right: mm(SIDE) } }, layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(17), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  // #region grid: the headings leave the grid too, and nothing stretches the gaps
  headings: { fontFamily: DISPLAY, snapToGrid: false, // or what follows snaps back to the grid
    balancing: { enabled: false }, // no extra space above headings to fill out a page
    levels: [
      // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener() },
      { level: 2, numberingTemplate: '{2}', marginTop: mm(0), marginBottom: mm(0),
        advancedDesign: activity },
    ] },
  // #endregion
  orderedLists: { fontFamily: DISPLAY, fontWeight: 800, marginTop: mm(ASK), // a bank's AFTER wins
    numberVerticalOffset: pt(1.7) }, // centred 0.3 em over the baseline, Baloo 2 sat high
  headingStyles: [review], calloutStyles: [card, answer, bank],
  paragraphStyles: [{ id: 'lead', fontSize: pt(14), lineHeight: pt(20) }, { id: 'colophon',
    fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10), color: col('muted') }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// The matching table's words. The parts are shuffled so that no food faces its own part.
const FOODS = t({ en: 'carrot|asparagus|lettuce|broccoli|orange|kidney beans',
  es: 'zanahoria|espárrago|lechuga|brócoli|naranja|alubias' }).split('|');
const PARTS = t({ en: 'leaf|seeds|root|fruit|stem|flower',
  es: 'hoja|semillas|raíz|fruto|tallo|flor' }).split('|');

// #region art: the pea plant, the six foods and the star, in the palette's colours
// No words in them: an SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts);
// the plant's numbers are design elements set in Baloo 2 over the drawing (see the band).
// [number, x, y] in the disc's millimetres: each numbered dot, where its leader line starts.
const LABELS = [[1, 58, 8], [2, 68, 33], [3, 9, 44], [4, 13, 20], [5, 62, 52], [6, 18, 66]];
const n = (v) => +v.toFixed(2);
const svgDoc = (w, h, body, scale = 10) => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" `
  + `fill="${fill}"${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const stroke = (d, color, width) => path(d, 'none', ` stroke="${color}" stroke-width="${width}" `
  + 'stroke-linecap="round" stroke-linejoin="round"');
const leafShape = (x, y, len, wid, turn, fill, vein) => `<g transform="translate(${n(x)} `
  + `${n(y)}) rotate(${n(turn)})">${path(`M0 0C${n(len * 0.3)} ${n(-wid)} ${n(len * 0.8)} `
  + `${n(-wid)} ${n(len)} 0C${n(len * 0.8)} ${n(wid)} ${n(len * 0.3)} ${n(wid)} 0 0Z`, fill)}`
  + `${vein ? stroke(`M${n(len * 0.12)} 0L${n(len * 0.8)} 0`, vein, 0.35) : ''}</g>`;
function plant() { // a pea plant in a white disc, its roots in a slice of soil
  const [c, r, ground] = [39, 39, 58];
  const dx = Math.sqrt(r * r - (ground - c) ** 2);
  let out = circle(c, c, r, palette.paper);
  out += path(`M${n(c - dx)} ${ground}Q20 ${ground - 2.2} 39 ${ground}T${n(c + dx)} ${ground}`
    + `A${r} ${r} 0 0 1 ${n(c - dx)} ${ground}Z`, palette.soil);
  for (const [x, y, rr] of [[22, 70, 0.9], [55, 66, 0.7], [47, 73, 1.1], [26, 62, 0.6]]) {
    out += circle(x, y, rr, palette.paper, ' fill-opacity=".25"');
  }
  out += stroke('M39 58C38 63 36 66 33 70M39 58C40 64 43 67 46 71M38 62C35 63 31 63 27 65'
    + 'M40 63C44 63 48 62 52 63M36 66C35 69 34 72 34 75M44 68C45 71 46 73 45 76',
  palette.paper, 0.7); // roots
  out += stroke('M39 58C37 50 42 44 39 36S37 22 41 11', palette.leaf, 1.5); // the stem
  for (const [y, s] of [[49, 1], [39, -1], [28, 1], [19, -1]]) { // leaflets in pairs
    out += leafShape(39, y, 12, 3.6, s > 0 ? -28 : -152, palette.leaf, palette.tint);
    out += leafShape(39, y + 2, 10, 3.2, s > 0 ? -160 : -20, palette.leaf, palette.tint);
  }
  out += stroke('M41 12c2.5-1 4.6.4 4.2 2.6s-3 2.2-3.4.2 1.8-1.8 2.4-.4M39 27c-2.6-1.4-5.4-.6-5.2 '
    + '1.6s2.8 2.4 3.4.6-1.4-2-2.2-.8M40 38c2.8-.8 5.2.6 4.6 2.6', palette.leaf, 0.45); // tendrils
  // A closed pod (the fruit) on the right, its peas showing through; an open one (the seeds).
  const calyx = (x, y, turn) => `<g transform="translate(${x} ${y}) rotate(${turn})">`
    + path('M0 0L1.6-1.2 1.2.4 2.4 1.2.6 1.4Z', palette.leaf) + '</g>';
  out += stroke('M40 31.5Q42 31 43.4 32', palette.leaf, 0.5)
    + path('M43 31.6C48 30.8 54 32.4 57.6 37.8C53 38.6 47.4 36.8 43 31.6Z', palette.rule,
      ` stroke="${palette.leaf}" stroke-width=".5"`)
    + [[46.4, 33.4], [49.6, 34.8], [52.8, 36.1]].map(([x, y]) => circle(x, y, 1.15,
      palette.leaf, ' fill-opacity=".35"')).join('') + calyx(42.6, 31.8, -10);
  out += stroke('M38 36Q37 36 36.2 36.4', palette.leaf, 0.5)
    + path('M36 36C30 37 23 40 20 45C25 47 33 43 36 36Z', palette.tint,
      ` stroke="${palette.leaf}" stroke-width=".5"`)
    + stroke('M35.4 36.6C31 39.6 26 42.6 20.6 44.8', palette.leaf, 0.3) + calyx(36.4, 36.4, 160);
  for (const [x, y] of [[32.6, 39.4], [29.8, 41], [27, 42.5], [24.2, 43.9]]) {
    out += circle(x, y, 1.25, palette.leaf);
  }
  // Pea flowers, seen from the front: white, as a garden pea's are, outlined in green.
  for (const [x, y, turn] of [[42, 9, -18], [48, 20.5, 24]]) {
    const edge = ` stroke="${palette.leaf}" stroke-width=".4"`;
    out += `<g transform="translate(${x} ${y}) rotate(${turn})">`
      + stroke('M0 2.6L0 4.6', palette.leaf, 0.5) + path('M-1.1 1.1L0 3 1.1 1.1Z', palette.leaf)
      + path('M0 0C-4.2-.6-5.2-6.4-1.6-7.2C-.8-7.4-.2-6.8 0-6.2C.2-6.8.8-7.4 1.6-7.2'
        + 'C5.2-6.4 4.2-.6 0 0Z', palette.paper, edge) // the standard petal
      + path('M-2.6-1.4C-3.4 1.2-1 2.6 0 1.4C1 2.6 3.4 1.2 2.6-1.4C1.4-.4-1.4-.4-2.6-1.4Z',
        palette.tint, edge) + stroke('M0-1.2L0-5', palette.rule, 0.3) + '</g>'; // the wings
  }
  // Where each leader ends: 2 on the pod's wall past its last pea (the fruit), 3 on a pea in
  // the open pod (the seeds), 4 in the middle of a leaf's blade, well clear of the stem.
  const targets = { 1: [43, 5.6], 2: [55.5, 36.6], 3: [27, 42.5], 4: [33.2, 15.9],
    5: [39.4, 47], 6: [36.7, 64.4] };
  for (const [num, x, y] of LABELS) { // leader lines from each dot to its part
    const [tx, ty] = targets[num];
    out += stroke(`M${x} ${y}L${tx} ${ty}`, palette.ink, 0.35) + circle(tx, ty, 0.7, palette.ink);
  }
  return svgDoc(78, 78, out);
}
function star() { // the self-check's badge: a white star on a sun disc
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 4.4 : 9.4;
    return `${n(12 + Math.cos(a) * rr)} ${n(12.6 + Math.sin(a) * rr)}`;
  });
  return svgDoc(24, 24, circle(12, 12, 12, palette.sun) + path(`M${pts.join('L')}Z`,
    palette.paper), 10);
}
const food = {
  carrot: () => path('M3.5 17.5C8 13 12 8.5 16.2 5.2C18 4 20.6 6.4 19.2 8.2C15.8 12.4 10 15.8 '
    + '3.5 17.5Z', palette.sun) + stroke('M8 13.6l1.4 1.2M11.6 10.6l1.3 1.3M14.6 8l1.2 1.2',
    palette.soil, 0.4) + [-120, -80, -40].map((a) => leafShape(18.4, 6.4, 6, 1.4, a,
    palette.leaf)).join(''),
  asparagus: () => [[10, 7], [12, 12], [14, 17]].map(([x0, x1]) => path(`M${x0 - 1.3} 19`
    + `L${x1 - 1} 5Q${x1} 1.4 ${x1 + 1} 5L${x0 + 1.3} 19Z`, palette.leaf) + stroke(`M${x1 - 0.8} `
    + `7.6l.8.8.8-.8M${(x0 + x1) / 2 - 0.9} 11.4l.9.9.9-.9`, palette.tint, 0.35)).join('')
    + path('M7.8 13.4h8.4v2.2H7.8Z', palette.sun),
  lettuce: () => { // a head seen from the side: two dark outer leaves cupping a pale heart
    const side = path('M13 19C6 19 2.6 15 3 9.6C3.2 7.4 4.6 6 5.8 7C6.2 5.4 7.8 4.8 8.6 6.2'
      + 'C9.4 5.2 10.6 5.6 10.6 6.8C9 10 9.4 15 13 19Z', palette.leaf)
      + stroke('M11 17.6C7.6 16 5.2 12.6 5.2 8.6', palette.tint, 0.4); // a frilled leaf, its vein
    return `<ellipse cx="12" cy="11.4" rx="5.8" ry="6.8" fill="${palette.rule}"/>`
      + stroke('M12 17.6C11.6 14 11.8 10 12.8 6', palette.tint, 0.45)
      + side + `<g transform="translate(24 0) scale(-1 1)">${side}</g>`;
  },
  broccoli: () => path('M10 19l1-7h2l1 7Z', palette.rule) + [[8, 9, 3.4], [12, 7, 3.8],
    [16, 9, 3.4], [10, 11.5, 2.6], [14, 11.5, 2.6]].map(([x, y, rr]) => circle(x, y, rr,
    palette.leaf)).join(''),
  orange: () => circle(12, 11.5, 7.5, palette.sun) + leafShape(12, 4.2, 5, 1.6, -30,
    palette.leaf) + circle(9, 9, 1.2, palette.paper, ' fill-opacity=".45"'),
  beans: () => [[7, 13, -20], [13, 9, 15], [16, 15, -35]].map(([x, y, a]) => `<g transform=`
    + `"translate(${x} ${y}) rotate(${a})">${path('M-4 0C-4 -3 -1 -3 0 -1.5C1 -3 4 -3 4 0'
    + 'C4 3 -4 3 -4 0Z', palette.soil)}</g>`).join(''),
};
const ICONS = Object.keys(food); // carrot … beans: the matching table's rows, in order
const drawings = { plant, star,
  ...Object.fromEntries(Object.entries(food).map(([id, draw]) => [id, () => svgDoc(24, 20,
    draw())])) };
const ALT = { ...Object.fromEntries(ICONS.map((id, i) => [id, FOODS[i]])),
  plant: t({ en: 'A pea plant with its flower, pod, peas, leaf, stem and roots numbered 1 to 6',
    es: 'Una planta de guisante con la flor, la vaina, los guisantes, la hoja, el tallo y las '
      + 'raíces numerados del 1 al 6' }),
  star: t({ en: 'A white star on a yellow disc',
    es: 'Una estrella blanca en un disco amarillo' }) };
// Each drawing is a resource that the opener, a table cell or the review heading names by
// id. None is cited, so none is placed as a figure. Sizes in px, 10 to the millimetre.
const pictures = Object.keys(drawings).map((id) => ({ id, typeId: 'sheet', kind: 'svg',
  altText: ALT[id], createdAt: 0, updatedAt: 0, svg: { fileId: `${id}.svg`,
    width: 240, height: 200,
    ...{ plant: { width: 780, height: 780 }, star: { width: 240, height: 240 } }[id] } }));
// #endregion

const resources = [...pictures, foods()];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Andika: ['400', '700'], 'Baloo 2': ['700', '800'], // (gotcha: fonts-first)
  Fredoka: ['400', '500', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([loadFonts(FONTS, markdown),
  ...Object.entries(drawings).map(([id, draw]) => loadSvg(`${id}.svg`, draw()))]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Plants and their parts', es: 'Las plantas y sus partes' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
