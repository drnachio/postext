// ═══ Postext Cookbook · Nº 019 · Parts in colour from one attribute ═══════════════════════
// https://postext.dev/en/cookbook/parts-in-colour
// Code: MIT · Text: original (CC BY 4.0) · Drawings: generated in code (CC BY 4.0)
// Fonts: Alegreya, Zilla Slab, Barlow Condensed (SIL OFL 1.1) · Needs postext ≥ 1.7.0
// A pocket field guide to two habitats. Each :::part names its own 'band' colour, and every
// colour linked to 'band' takes it: the divider and its verso, the tab, the field marks.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'parts-in-colour';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: 'band' is the entry the parts override; the others keep their value
const palette = {
  ink: '#1f2624', // text: a green-tinted near-black
  band: '#3c4b4f', // the house slate, before any part; each :::part brings its own
  paper: '#f6f3ea', // the page, and the type set on a band
  rule: '#d5d1c4', // hairlines
  muted: '#61675f', // running heads, Latin names, the colophon
};
// The paletteId is the link a part's palette="band=#…" follows; the hex is written out too,
// as the palette alone would not reach design elements (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the ink, so nothing prints blue.
  { id: 'main-color', name: 'ink (defaults)', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const TRIM = { width: 150, height: 200 }; // a pocket guide
const MARGIN = { top: 22, bottom: 20, inner: 19, outer: 21 }; // mirrored; room for a thumb
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // 110 mm, about 70 characters
const LEAD = 14.5; // body leading in pt: the baseline grid
const PLATE = { width: MEASURE, height: 55 }; // each species' plate, at the text width (mm)
const STRIP = 44; // the contents' picture strip, from the top edge (mm)
const HEAD = { y: 12, gap: 8 }; // running heads from the top edge; folio to title (mm)
const TAB = { y: 26, size: { width: mm(8), height: mm(24) } }; // the thumb tab, at the fore-edge
const TITLE_DROP = 6; // mm from the foot of the contents strip to the title's box
const BOOK = t({ en: 'Birds of the Estuary', es: 'Aves del estuario' });
const label = { fontFamily: 'Barlow Condensed', fontWeight: 600, textTransform: 'uppercase' };
const display = { fontFamily: 'Zilla Slab', fontWeight: 700 };
const at = (edge, x, y, to = 'page') => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const below = (id, y, size) => ({ ...at('below', 0, y, `#${id}`), ...(size && { size }) });
const fill = { size: { width: 'fill', height: 'fill' } };
const text = (id, content, style, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'left', ...style, placement });
const box = (id, color, placement) => ({ kind: 'box', id, style: { backgroundColor: color },
  placement });
const rule = (id, color, w, placement) => ({ kind: 'rule', id, color, thickness: pt(w),
  placement });

// #region answer: a divider, its painted verso and its list, all in the part's own 'band'
// In the Markdown:  :::part{number="I" title="The \\ Mudflats" palette="band=#8c5e24"}
// Every colour below that is linked to 'band' takes #8c5e24 until the next part.
const parts = { // passed to the config as `parts`
  // A divider opens on a recto by default. The break after it goes to the next recto too, so
  // the back of the leaf stays blank and versoDesign paints it (gotcha: verso-design-breakafter).
  breakAfter: { parity: 'odd' },
  margins: { top: mm(125) }, // the fence's text starts low, under the title
  design: { elements: [ // the divider: its container is the whole trim
    box('field', col('band'), { ...at('top-left', 0, 0, 'bleed'), ...fill }),
    text('part', t({ en: 'Part', es: 'Parte' }), { ...label, fontSize: pt(10),
      letterSpacing: pt(2.4), color: col('paper') },
    at('top-left', MARGIN.inner, MARGIN.top)), // a recto: the inner margin is on the left
    // Roman for the parts, Arabic for the species. {numberRoman} re-formats number="I" (or
    // "1"), on part pages only (gotcha: heading-number-placeholders).
    text('numeral', '{numberRoman}', { ...display, fontSize: pt(150), lineHeight: 0.9,
      color: col('paper') }, below('part', 0)),
    // The \\ in the title breaks the line here; the contents and the heads get one line.
    text('title', '{titleText}', { ...display, fontSize: pt(46), lineHeight: 0.98,
      color: col('paper') }, below('numeral', 2, { width: mm(MEASURE) })),
    rule('rule', col('paper'), 1, below('title', 7, { width: mm(14) })),
  ] },
  // The back of the leaf: the same band, edge to edge, the part's tab in reverse at the
  // fore-edge (a verso's is on the left) and its name at the foot.
  versoDesign: { elements: [
    box('field', col('band'), { ...at('top-left', 0, 0, 'bleed'), ...fill }),
    text('tab', '{partNumber}', { ...label, fontSize: pt(9), color: col('band'), align: 'center',
      box: { backgroundColor: col('paper') } }, { ...at('top-left', 0, TAB.y), size: TAB.size }),
    text('name', '{partTitle}', { ...label, fontSize: pt(9), letterSpacing: pt(2.4),
      color: col('paper') }, at('bottom-left', MARGIN.outer, -MARGIN.bottom)),
  ] },
  // The fence's list of species, in the paper colour on the band.
  bodyStyle: { fontSize: pt(11), color: col('paper'), textAlign: 'left', numberColor: col('paper'),
    orderedLists: { fontFamily: 'Barlow Condensed', separator: '', gap: mm(4) } },
};
// #endregion

// #region flow: the accents of the text, linked to 'band' so that each part retints them
const bodyText = {
  fontFamily: 'Alegreya', fontSize: pt(10.5), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('band'), // the field marks: **Bill**, **Voice.**
  italicColor: col('ink'), referenceColor: col('ink'),
  firstLineIndent: mm(4), indentAfterHeading: false,
  // Tighter than the 0.6–2 defaults. runtMinCharacters counts word spaces, not letters:
  // 45 are about 20 letters of Alegreya (the default 20, about 9); a shorter last line is a runt.
  minWordSpacing: 0.75, maxWordSpacing: 1.7, runtMinCharacters: 45,
  // A runt is fixed with word spacing only: the default also tightens the tracking, which
  // 1.4.1 measures but never paints (gotcha: runt-tracking-unpainted).
  maxRuntTracking: 0,
};
const unorderedLists = { bulletChar: '▪', color: col('band'), // the field marks' bullets
  marginTop: pt(0), marginBottom: pt(0) };
// The plates are numbered with the species, and their label is in the part's colour.
const resourceTypes = [{ id: 'plate', numberingTemplate: '{n}', resetOn: 'never',
  counterFormat: 'decimal', ...t({
    en: { name: 'Plate', namePlural: 'Plates', shortLabel: 'Pl.', captionPrefix: 'Plate' },
    es: { name: 'Lámina', namePlural: 'Láminas', shortLabel: 'Lám.', captionPrefix: 'Lámina' },
  }) }];
const captionStyle = { fontSize: pt(8.5), labelColor: col('band'), descriptionItalic: true,
  gap: mm(1.8) };
// #endregion

// #region species: each entry opens with its number and status, name, Latin and a 'band' rule
const species = { enabled: true, slot: { elements: [
  text('kicker', '{number} · {attr.status}', { ...label, fontSize: pt(8.5),
    letterSpacing: pt(1.7), color: col('band') }, at('top-left', 0, 1, 'container')),
  // 'cm' is a unit symbol: it keeps its lower case, so the size is not set in capitals.
  text('size', '{attr.size}', { ...label, textTransform: 'none', fontSize: pt(8.5),
    letterSpacing: pt(0.5), color: col('muted') }, at('top-right', 0, 1, 'container')),
  text('name', '{titleText}', { ...display, fontSize: pt(22), lineHeight: 1.05,
    color: col('ink') }, below('kicker', 1.5, { width: 'fill' })),
  text('latin', '{attr.latin}', { fontFamily: 'Alegreya', italic: true, fontSize: pt(11.5),
    color: col('ink') }, below('name', 0.8)),
  rule('rule', col('band'), 0.75, below('latin', 2, { width: mm(MEASURE) })),
] } };
// #endregion

// #region contents: a band per part in that part's colour, then its species with leaders
const contents = {
  levels: [{ level: 1, fontFamily: 'Zilla Slab', fontSize: pt(12), fontWeight: 600,
    numberFontFamily: 'Barlow Condensed', numberFontWeight: 600, numberColor: col('muted'),
    numberWidth: mm(5), numberGap: mm(3), marginTop: pt(4) }],
  pageNumber: { fontFamily: 'Barlow Condensed', fontSize: pt(10), fontWeight: 600, width: mm(7) },
  leader: { char: '. ' },
  subtitle: { enabled: true, attr: 'latin', fontFamily: 'Alegreya', fontSize: pt(9.5),
    color: col('muted') }, // the Latin name, in italic by default
  // A part row lays out this design with the part's number, title, page and palette.
  parts: { height: mm(8.5), marginTop: pt(LEAD), design: { elements: [
    box('row', col('band'), { ...at('top-left', 0, 0, 'container'), ...fill }),
    text('part', t({ en: 'Part {number}', es: 'Parte {number}' }), { ...label, fontSize: pt(8),
      letterSpacing: pt(1.6), color: col('paper') }, at('left', 3, 0, 'container')),
    text('title', '{titleText}', { ...display, fontSize: pt(12), color: col('paper') },
      at('left', 20, 0, 'container')),
    text('page', '{pageNumber}', { ...label, fontSize: pt(10), color: col('paper'),
      align: 'right' }, at('right', -2.5, 0, 'container')),
  ] } },
};
// #endregion

// #region running-heads: on body pages only, never on a divider or its verso; a 'band' tab
const head = (id, content, parity, placement, style = {}) => ({ ...text(id, content, { ...label,
  fontSize: pt(8), letterSpacing: pt(1.4), color: col('muted'), overflow: 'clip', ...style },
placement), parity, pages: 'body' }); // dividers are 'part' pages, their versos 'blank'
const folio = { fontSize: pt(9), fontWeight: 700, color: col('band') };
const tab = (parity, edge) => head(`tab-${parity}`, '{partNumber}', parity,
  { ...at(edge, 0, TAB.y), size: TAB.size },
  { fontSize: pt(9), color: col('paper'), align: 'center', box: { backgroundColor: col('band') } });
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', at('top-left', MARGIN.outer, HEAD.y), folio),
  head('verso-title', BOOK, 'even', at('top-left', MARGIN.outer + HEAD.gap, HEAD.y)),
  head('recto-title', '{partTitle}', 'odd', at('top-right', -(MARGIN.outer + HEAD.gap), HEAD.y)),
  head('recto-folio', '{pageNumber}', 'odd', at('top-right', -MARGIN.outer, HEAD.y), folio),
  tab('even', 'top-left'), tab('odd', 'top-right'), // on the fore-edge, left on a verso
] };
// #endregion

// The cover and the contents are headings with no number and no contents entry. They get
// no running heads either: a page-wide heading makes its page an 'opener', not 'body'.
const unlisted = { numbered: false, toc: false, span: 'page' };
const cover = { enabled: true, slot: { elements: [
  { kind: 'image', id: 'art', resourceId: 'cover',
    placement: { ...at('top-left', 0, 0, 'bleed'), size: { width: 'fill' } } },
  text('kicker', '{subtitle}', { ...label, fontSize: pt(9), letterSpacing: pt(1.8),
    color: col('band') }, at('top-left', MARGIN.inner, MARGIN.top)), // slate: no part yet
  text('title', '{titleText}', { ...display, fontSize: pt(50), lineHeight: 0.95,
    color: col('ink') }, below('kicker', 3, { width: mm(120) })),
] } };
// The contents open under a strip of the estuary: mud and waders, then the reeds.
const contentsOpener = { enabled: true, minHeight: mm(STRIP), slot: { elements: [
  { kind: 'image', id: 'strip', resourceId: 'strip',
    placement: { ...at('top-left', 0, 0, 'bleed'), size: { width: 'fill' } } },
  text('title', '{titleText}', { ...display, fontSize: pt(26), color: col('ink') },
    at('top-left', 0, STRIP - MARGIN.top + TITLE_DROP, 'container')),
] } };

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation, by exact code (gotcha: hyphenation-locales)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText, unorderedLists, resourceTypes, captionStyle,
  headings: { ...display, levels: [
    // breakBefore stated: the documented H1 page break would make each species page an
    // 'opener', with no running heads (gotcha: headings-drop-h1-break). :::pagebreak instead.
    { level: 1, fontSize: pt(22), breakBefore: { enabled: false }, numberingTemplate: '{1}',
      marginBottom: pt(0), advancedDesign: species },
  ] },
  headingStyles: [
    { id: 'cover', ...unlisted, advancedDesign: cover },
    { id: 'contents', ...unlisted, advancedDesign: contentsOpener },
  ],
  toc: contents,
  parts,
  paragraphStyles: [
    // The habitat's few lines on a divider: no indent, in the paper colour.
    { id: 'habitat', fontSize: pt(11), color: col('paper'), textAlign: 'left',
      firstLineIndent: pt(0), marginBottom: pt(LEAD / 2) },
    // In the box its margins do not count; the leading adds air (gotcha: box-paragraph-margins).
    { id: 'colophon', fontFamily: 'Barlow Condensed', fontSize: pt(8), lineHeight: pt(15),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0) },
  ],
  // The note under the contents is pinned to the foot of the text block.
  calloutStyles: [{ id: 'about', placement: 'fixed', backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
    padding: { top: mm(3), right: pt(0), bottom: pt(0), left: pt(0) },
    titleStyle: { ...label, fontSize: pt(8), letterSpacing: pt(1.6), color: col('band') },
    body: { fontSize: pt(9.5), lineHeight: pt(13), firstLineIndent: pt(0), textAlign: 'left' } }],
  header,
  footer: { elements: [] }, // the default footer would centre a folio in Open Sans
});

// #region art: the cover, the strip and the plates, drawn in code from a fixed seed
// The habitats' colours, as each :::part writes them. An SVG keeps the colours written in it,
// so the drawings are painted in their part's colours here, not by the palette.
const HABITAT = { mud: '#8c5e24', reed: '#51702f' };
let seed = 2026; // Mulberry32, a tiny seeded PRNG: never Math.random() in a recipe
const rand = () => {
  let r = Math.imul((seed = (seed + 0x6d2b79f5) | 0) ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};
const n = (v) => v.toFixed(2);
const pts = (...values) => values.map(n).join(' '); // path coordinates
const channel = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
const mix = (a, b, k) => `#${[1, 3, 5].map((i) => Math.round(channel(a, i) * (1 - k)
  + channel(b, i) * k).toString(16).padStart(2, '0')).join('')}`; // a tint of a towards b
const paint = (c, o = 1) => `fill="${c}"${o < 1 ? ` fill-opacity="${o}"` : ''}`;
const stroke = (c, w, o = 1) => `fill="none" stroke="${c}" stroke-width="${w}" `
  + `stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` stroke-opacity="${o}"` : ''}`;
const sheet = ({ width, height }, body) => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${width * 10}" height="${height * 10}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const place = (x, y, k, body) => `<g transform="translate(${n(x)} ${n(y)}) scale(${k})">`
  + `${body}</g>`;
const PLUME = '#8d7565'; // reed plumes: a purple-brown
const WATER = '#71878d'; // the tide's edge on the cover: a grey estuary blue

// The birds face left in a 100-unit box, feet at y = 68. Waders keep their outline apart,
// for the reflection on the wet mud.
const CURLEW = {
  body: 'M21.5 17 C26 20.5 30.5 25 31.5 31 C30 39 37 47 49 48.5 C60 50 71 46 80 40.5 L90.5 35.5 '
    + 'C86 33 81 31 76 30 C68 25 58 22.5 49 22.5 C42.5 22 39 19.5 35.5 14.5 C33.5 10 31 7.5 27 7.5 '
    + 'C23 7.5 20.3 10 20.5 13.3 C20.6 15 20.8 16.3 21.5 17 Z',
  bill: 'M20.8 11.2 C12 12.4 5 18 0.9 30.4 C0.7 31 1.3 31.1 1.5 30.6 C6 21.2 13 16.8 21.2 15.2 Z',
  legs: 'M47 46 L43.8 68 M54 46 L58.5 68',
  draw() {
    const [brown, dark, pale, legs] = ['#8a7556', '#5b4a35', '#dcd0b6', '#76868d'];
    let g = `<path d="M54 46 L56 56.5 L58.5 68 M58.5 68 l3.2 0.2 M58.5 68 l-2.3 0.3" `
      + `${stroke(legs, 1.6)}/><path d="M47 46 L45.8 56.5 L43.8 68 M43.8 68 l-3.5 0.2 `
      + `M43.8 68 l2.5 0.4" ${stroke(legs, 1.7)}/><path d="${this.body}" ${paint(brown)}/>`
      + `<path d="M31.8 33 C31.5 41 39 47 49.5 48 C58 48.8 66 46.5 73 42.8 C62 44 51 42.5 43 38.5 `
      + `C38 36 34 34.5 31.8 33 Z" ${paint(pale)}/><path d="M42 26.5 C52 23.5 66 25 76 30 `
      + `C82 32 88 34 92 36.2 C84 38.5 76 39.4 68 39.4 C58 39.4 48 36 42 30.5 Z" ${paint(dark)}/>`;
    for (let i = 0; i < 5; i++) { // pale edges of the folded wing
      g += `<path d="M${51 + i * 7.2} ${n(30.2 + i * 1.25)} q5 2.4 10.5 2.5" `
        + `${stroke(pale, 0.75, 0.75)}/>`;
    }
    for (let i = 0; i < 46; i++) { // streaks on the neck and breast, inside the outline
      const y = 12 + rand() * 24;
      const front = y < 18 ? 21.5 + (y - 12) * 0.2 : 22.7 + (y - 18) * 0.55;
      const back = y < 22 ? 30 + (y - 12) * 0.8 : 40;
      g += `<path d="M${n(front + 1.2 + rand() * (back - front - 2.4))} ${n(y)} l0.25 1.3" `
        + `${stroke(dark, 0.55, 0.75)}/>`;
    }
    return `${g}<path d="${this.bill}" ${paint('#352c26')}/><path d="M21.6 9.8 `
      + `C23.2 8.4 26.2 8.2 28.6 9.3" ${stroke(pale, 0.9, 0.85)}/>`
      + `<circle cx="24.6" cy="11.5" r="1.05" ${paint(palette.ink)}/>`;
  },
};
const REDSHANK = {
  body: 'M20 22 C23 27 26 30 28 35 C27 43 36 51 50 51.5 C61 52 71 47 79 42 L90 36 C86 33.5 82 32 '
    + '76 31 C67 26 58 24.5 48 25 C41 24.5 36 22 33 17 C31 13.5 28.5 12 25 12 C20.5 12 18 15 18.3 '
    + '18.4 C18.5 20 19 21.2 20 22 Z',
  bill: 'M19 16.8 L3.5 20.6 L3.3 21.3 L19.2 21 Z',
  legs: 'M50 49 L46.5 68 M56 49 L60.5 68',
  draw() {
    const [back, dark, white, legs] = ['#86796a', '#5f5446', '#f4f1e8', '#dd5530'];
    let g = `<path d="M56 49 L58.5 58.5 L60.5 68 M60.5 68 l3 0.2 M60.5 68 l-2.4 0.3" `
      + `${stroke(legs, 1.9)}/><path d="M50 49 L48.5 58.5 L46.5 68 M46.5 68 l-3.4 0.2 `
      + `M46.5 68 l2.4 0.4" ${stroke(legs, 2)}/><path d="${this.body}" ${paint(back)}/>`
      + `<path d="M27.8 37 C28 44 36 50.5 50 51 C60 51.4 68 48.5 75 44.5 C63 46 52 45 43 41.5 `
      + `C37 39.5 31 38.5 27.8 37 Z" ${paint(white)}/><path d="M42 29 C52 26 65 27.5 75 31.5 `
      + `C81 33.5 87 35 91.5 37 C84 39.5 76 40.5 68 40.5 C58 40.5 48 37.5 42 32.5 Z" `
      + `${paint(dark)}/>`;
    for (let i = 0; i < 26; i++) { // pale spots on the wing
      const x = 48 + rand() * 38;
      const y = 31.5 + rand() * 6 + (x - 48) * 0.05;
      if (y > 29 + (x - 42) * 0.2 && y < 39) {
        g += `<circle cx="${n(x)}" cy="${n(y)}" r="0.45" ${paint(white, 0.7)}/>`;
      }
    }
    for (let i = 0; i < 30; i++) { // streaks on the breast
      const y = 24 + rand() * 13;
      g += `<path d="M${n(23 + (y - 22) * 0.35 + rand() * 9)} ${n(y)} l0.2 1" `
        + `${stroke(dark, 0.55, 0.7)}/>`;
    }
    return `${g}<path d="${this.bill}" ${paint('#2e2622')}/>` // the bill, red at the base
      + `<path d="M19 16.8 L11 18.8 L11 21.1 L19.2 21 Z" ${paint('#c9452b')}/>`
      + `<circle cx="23.2" cy="17.2" r="1.9" ${paint(white)}/>`
      + `<circle cx="23.2" cy="17.2" r="1.05" ${paint(palette.ink)}/>`;
  },
};
// A male clinging to a stem that stands at x = 46.2 of his box.
const REEDLING = { draw() {
  const [tawny, grey, cream, wing] = ['#c68a50', '#9aa8b2', '#f2ede2', '#a8733f'];
  const dark = palette.ink;
  return `<path d="M24 31 C24 25.5 28 22.5 32 23 C36.5 23.5 38.5 27 38.5 31 C43 34 46 39 46 46 `
    + `C46 51 44.5 55 43.5 58.5 L55.2 89.6 C56 92.6 52.2 94.6 50.6 92.2 L37.8 62 C32 61 27 57 `
    + `25.5 51 C24 46 24.5 41 26.5 37.5 C25 35.5 24 33.5 24 31 Z" ${paint(tawny)}/>`
    + `<path d="M24 31 C24 25.5 28 22.5 32 23 C36.5 23.5 38.5 27 38.5 31 C36 33.5 31 35 27 35.5 `
    + `C25.2 34.5 24 33 24 31 Z" ${paint(grey)}/><path d="M25 35.5 C27 36 28.5 38 29.5 41 `
    + `C28.5 44 27.8 46.5 27.4 49 C25.3 45 24.6 40 25 35.5 Z" ${paint(cream)}/>`
    + `<path d="M26.3 30.8 C28.6 31.8 30.6 35 30.9 40.8 C29.3 40 27.8 37.2 27 35.2 `
    + `C26.4 33.8 26 32.2 26.3 30.8 Z" ${paint(dark)}/>` // the moustache
    + `<path d="M37 35.5 C42.5 38 45.2 43.5 45.2 49.5 C44.4 53.5 42.5 56 40.3 57.2 `
    + `C38.2 51 37 44 37 35.5 Z" ${paint(wing)}/><path d="M39.5 42 C41 47 41.8 51.5 41.5 56" `
    + `${stroke(dark, 1.3)}/><path d="M38 43.5 C39.3 48 39.8 52 39.5 56.3" ${stroke(cream, 0.8)}/>`
    + `<path d="M36.8 58.8 C38.6 60.8 41 61.6 43 60.6 L41.8 57.8 Z" ${paint(dark)}/>`
    + `<path d="M44.2 60 L54.2 90" ${stroke(cream, 0.55, 0.8)}/>`
    + `<path d="M41 62 L51.5 90.5" ${stroke(wing, 0.5)}/>`
    + `<path d="M24.4 28.4 L19.8 29.8 L24.5 31.1 Z" ${paint('#e2a43c')}/>`
    + `<circle cx="27.8" cy="28.9" r="1.3" ${paint('#e7b53e')}/>`
    + `<circle cx="27.8" cy="28.9" r="0.62" ${paint(dark)}/>`
    + `<path d="M42.5 50.5 L47.5 51.2 M43 56.5 L47.6 57" ${stroke('#2c2724', 0.9)}/>`;
} };
// Singing, one foot on each of two stems at x = 37 and 55 of its box.
const WARBLER = { draw() {
  const [brown, buff, throat, dark] = ['#9a7a55', '#e5d4b2', '#f3ecdc', '#4a3d31'];
  return `<path d="M38 50 L37 58 M35 58.4 L39 57.6 M52 49 L55 58 M53 58.4 L57 57.6" `
    + `${stroke('#8c7c6c', 1.3)}/><path d="M14 37 C15.5 33 19.5 31 24.5 31.2 C29 31.4 32 33.5 `
    + `34 36.5 C42 36.3 52 37.5 60 40 L71 42.2 C73.5 42.8 74 46.2 71.6 46.8 L60 46.5 C54 50 46 52 `
    + `38 51 C30 50 24 46.5 22 42.5 C19 41.5 15.5 40 14 37 Z" ${paint(brown)}/>`
    + `<path d="M22 42.5 C26 43.5 32 45 40 45.5 C48 46 55 45.5 60.5 44.6 C55 49.2 46 51.8 38 51 `
    + `C30 50 24 46.5 22 42.5 Z" ${paint(buff)}/><path d="M17 38.7 C19.5 39 22 40.5 23 42.8 `
    + `C20 42 17.5 40.8 17 38.7 Z" ${paint(throat)}/><path d="M35 38 C44 37.5 53 38.8 60 41.2 `
    + `C54 42.6 44 42.8 36 41.5 Z" ${paint('#86683f')}/>`
    + `<path d="M18 34.3 C21 33.6 24 34 26 35" ${stroke(throat, 0.7, 0.85)}/>`
    + `<path d="M14.8 34.6 L8 33.2 L14.4 36.2 Z" ${paint(dark)}/>` // the bill, open
    + `<path d="M14.4 37.6 L8.4 37.4 L14.6 36.4 Z" ${paint('#b8906a')}/>`
    + `<circle cx="20.6" cy="35.4" r="1.05" ${paint(palette.ink)}/>`;
} };

// A reed from (x, foot) up to height h, leaning by `lean`, with leaves and perhaps a plume.
function reed(x, foot, h, lean, colour, width, leaves, plume) {
  const [tx, ty] = [x + lean, foot - h];
  let g = `<path d="M${pts(x, foot)} Q${pts(x + lean * 0.2, foot - h * 0.6, tx, ty)}" `
    + `${stroke(colour, width)}/>`;
  for (let i = 0; i < leaves; i++) {
    const k = 0.25 + (i / leaves) * 0.6 + rand() * 0.08;
    const [dir, len] = [rand() < 0.5 ? -1 : 1, 7 + rand() * 9];
    const [out, back] = [pts(dir * len * 0.5, -len * 0.35, dir * len, len * 0.25),
      pts(-dir * len * 0.45, -len * 0.28, -dir * len, -len * 0.2)];
    g += `<path d="M${pts(x + lean * k * k, foot - h * k)} q${out} q${back}Z" ${paint(colour)}/>`;
  }
  for (let i = 0; plume && i < 9; i++) { // a feathery plume, drooping to one side
    const curl = pts(2.5 + i / 8, 1.5 + i / 4, 3 + i / 4, 5 + i * 0.375);
    g += `<path d="M${pts(tx, ty + i * 0.875)} q${curl}" ${stroke(plume, 0.9, 0.9)}/>`;
  }
  return g;
}
// Far birds in flight, a shallow 'm' each.
const flock = (x, y, count, spread, colour) => Array.from({ length: count }, () => {
  const [fx, fy, w] = [x + rand() * spread, y + rand() * spread * 0.3, 1.2 + rand() * 0.8];
  return `<path d="M${pts(fx - w, fy - 0.4)} Q${pts(fx - w / 2, fy - 0.9, fx, fy)} `
    + `Q${pts(fx + w / 2, fy - 0.9, fx + w, fy - 0.4)}" ${stroke(colour, 0.35)}/>`;
}).join('');
// Shining channels across wet mud: [y, from x, to x, opacity].
const channels = (rows) => rows.map(([y, x0, x1, o]) => `<path d="M${pts(x0, y)} `
  + `Q${pts((x0 + x1) / 2, y - 1, x1, y)} Q${pts((x0 + x1) / 2, y + 1.3, x0, y)} Z" `
  + `${paint(palette.paper, o)}/>`).join('');
// A wader standing at (x, ground), scale k, over its reflection on the wet mud.
const wader = (bird, x, ground, k) => `<g transform="translate(${n(x)} ${n(ground + 34 * k)}) `
  + `scale(${k} ${-k / 2})" opacity="0.1"><path d="${bird.body}" ${paint(palette.ink)}/>`
  + `<path d="${bird.bill}" ${paint(palette.ink)}/>`
  + `<path d="${bird.legs}" ${stroke(palette.ink, 1.7)}/></g>`
  + place(x, ground - 68 * k, k, bird.draw());

// The mudflat plates: a far shore, the mud and its channels, the bird; a creek for the redshank.
function mudflat(bird, x, k, creek) {
  const wash = (t) => mix(HABITAT.mud, palette.paper, t);
  const { width: w, height: h } = PLATE;
  const [top, ground] = [h - 29, h - 12]; // the far shore, and where the bird stands
  let g = `<rect width="${w}" height="${h}" ${paint(wash(0.9))}/><path d="M0 ${top - 1} `
    + `C14 ${top - 3} 26 ${top - 2} 38 ${top - 3.4} C50 ${top - 4.4} 58 ${top - 1.6} `
    + `72 ${top - 1.5} L${w} ${top - 1.2} V${top + 2} H0 Z" ${paint(wash(0.72))}/>`
    + `<rect y="${top}" width="${w}" height="${h - top}" ${paint(wash(0.8))}/>`
    + channels([[top + 3.5, -2, 64, 0.6], [top + 7, 58, w + 2, 0.5], [h - 7, -2, 36, 0.5],
      [h - 4, 70, w + 2, 0.45]]);
  for (let i = 0; i < 36; i++) { // ripples, longer towards the viewer
    const y = top + 4 + rand() * (h - top - 5);
    const len = 1.6 + (y - top) * 0.14;
    g += `<path d="M${n(rand() * w)} ${n(y)} q${n(len / 2)} -0.45 ${n(len)} 0" `
      + `${stroke(wash(0.62), 0.25 + (y - top) * 0.008, 0.8)}/>`;
  }
  if (creek) { // behind the bird: the saltmarsh on the far bank, then the creek
    const y = (v) => n(top + v * 0.8);
    const marsh = mix(HABITAT.reed, palette.paper, 0.72);
    g += `<path d="M0 ${y(3)} C18 ${y(1.5)} 36 ${y(3.5)} 58 ${y(2)} C80 ${y(0.8)} 98 ${y(2.8)} `
      + `${w} ${y(1.8)} V${y(12)} H0 Z" ${paint(marsh)}/>`;
    for (let i = 0; i < 90; i++) { // tufts of grass along its top
      const gx = rand() * w;
      const gy = Number(y(2.2 + Math.sin(gx / 9) * 0.8 + rand() * 1.5));
      g += `<path d="M${pts(gx, gy)} l-0.9 -1.8 M${pts(gx, gy)} l0.1 -2.4 M${pts(gx, gy)} l1 -1.6" `
        + `${stroke(mix(HABITAT.reed, palette.paper, 0.4), 0.3)}/>`;
    }
    g += `<path d="M${w} ${y(9)} C90 ${y(8)} 80 ${y(13)} 64 ${y(13.5)} C44 ${y(14)} 24 ${y(10)} `
      + `0 ${y(11)} V${y(16)} C24 ${y(15)} 44 ${y(19)} 66 ${y(18)} C82 ${y(17.5)} 92 ${y(13)} `
      + `${w} ${y(13.5)} Z" ${paint(wash(0.62))}/>`;
  } else g += flock(78, 4, 5, 18, wash(0.35));
  return sheet(PLATE, g + wader(bird, x, ground, k));
}
// The reedbed plates: pale reeds far off, plumed ones nearer, and the stems the bird holds.
function reedbed(bird, x, y, k, stems) {
  const wash = (t) => mix(HABITAT.reed, palette.paper, t);
  const { width: w, height: h } = PLATE;
  let g = `<rect width="${w}" height="${h}" ${paint(wash(0.9))}/>`;
  for (let i = 0; i < 24; i++) {
    g += reed(rand() * w, h + 2, 30 + rand() * 22, -2 + rand() * 4, wash(0.78), 0.5, 2,
      rand() < 0.5 && mix(PLUME, palette.paper, 0.6));
  }
  for (let i = 0; i < 11; i++) {
    const rx = rand() * w;
    if (stems.every((s) => Math.abs(s - rx) >= 6)) {
      g += reed(rx, h + 2, 38 + rand() * 18, -3 + rand() * 6, wash(0.55), 0.6, 3, PLUME);
    }
  }
  for (const s of stems) g += reed(s, h + 2, h + 4, 0, wash(0.3), 0.9, 2);
  return sheet(PLATE, g + place(x, y, k, bird.draw()));
}
// The cover: sky for the title, the far shore, the mud with a curlew, the reeds in front.
function coverArt() {
  const { width: w, height: h } = TRIM;
  const wash = (c, t) => mix(c, palette.paper, t);
  const [shore, mud, ground] = [98, 102, 152];
  let g = `<rect width="${w}" height="${h}" ${paint(palette.paper)}/>`
    + `<path d="M0 ${shore} C20 ${shore - 3} 34 ${shore - 2} 52 ${shore - 5} C70 ${shore - 8} `
    + `86 ${shore - 3} 104 ${shore - 2.5} C120 ${shore - 2} 136 ${shore - 4} ${w} ${shore - 3} `
    + `V${mud} H0 Z" ${paint(wash(HABITAT.mud, 0.6))}/>`
    + `<rect y="${mud}" width="${w}" height="${h - mud}" ${paint(wash(HABITAT.mud, 0.66))}/>`
    + `<path d="M0 ${mud} H${w} V${mud + 2.5} C100 ${mud + 4.5} 50 ${mud + 1.5} 0 ${mud + 3.5} Z" `
    + `${paint(WATER)}/>` + channels([[mud + 9, -2, 80, 0.5], [mud + 16, 50, w + 2, 0.45],
      [ground + 8, -2, 60, 0.45], [ground + 17, 40, 120, 0.4]])
    + flock(92, 80, 7, 26, wash(HABITAT.mud, 0.3)) + wader(CURLEW, 10, ground, 0.92);
  for (let i = 0; i < 64; i++) { // reeds low along the foot, rising towards the fore-edge
    const rx = rand() * (w + 8);
    const tall = Math.max(0, rx - 96) * 1.6;
    g += reed(rx, h + 2, 14 + rand() * 10 + tall, -3 + rand() * 6,
      i % 3 ? HABITAT.reed : mix(HABITAT.reed, palette.ink, 0.35), 0.8, tall > 20 ? 3 : 2,
      tall > 20 && rand() < 0.6 && PLUME);
  }
  return sheet(TRIM, g);
}
// The contents' strip: the mud and its waders on the left, the reedbed on the right.
function stripArt() {
  const size = { width: TRIM.width, height: STRIP };
  const wash = (c, t) => mix(c, palette.paper, t);
  const [shore, ground] = [22, 38];
  const w = size.width;
  let g = `<rect width="${w}" height="${STRIP}" ${paint(wash(HABITAT.mud, 0.9))}/>`
    + `<path d="M0 ${shore} C24 ${shore - 3} 40 ${shore - 1} 64 ${shore - 4} C84 ${shore - 6} `
    + `110 ${shore - 2} ${w} ${shore - 3} V${shore + 2} H0 Z" ${paint(wash(HABITAT.mud, 0.7))}/>`
    + `<rect y="${shore + 1.5}" width="${w}" height="${STRIP}" ${paint(wash(HABITAT.mud, 0.78))}/>`
    + channels([[shore + 5, -2, 70, 0.6], [shore + 13, 10, 90, 0.5], [STRIP - 3, -2, 60, 0.45]])
    + flock(40, 8, 6, 22, wash(HABITAT.mud, 0.35))
    + wader(CURLEW, 14, ground, 0.27) + wader(REDSHANK, 50, ground + 2.5, 0.21);
  for (let i = 0; i < 46; i++) { // the reedbed takes over towards the fore-edge
    const rx = 78 + rand() * 80;
    const tall = (rx - 78) * 0.4;
    g += reed(rx, STRIP + 2, 7 + tall + rand() * 7, -2 + rand() * 4,
      i % 2 ? HABITAT.reed : wash(HABITAT.reed, 0.4), 0.6, 2, tall > 10 && rand() < 0.5 && PLUME);
  }
  return sheet(size, g);
}
const drawings = () => ({
  cover: coverArt(), strip: stripArt(),
  curlew: mudflat(CURLEW, 26, 0.6, false),
  redshank: mudflat(REDSHANK, 32, 0.56, true),
  reedling: reedbed(REEDLING, 36, -3, 0.5, [36 + 46.2 * 0.5]),
  warbler: reedbed(WARBLER, 32, -6, 0.66, [32 + 37 * 0.66, 32 + 55 * 0.66]),
});
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
// The plates' captions, and the alt text of every drawing.
const CAPTIONS = t({ en: {
  cover: 'A curlew on the mud, with reeds in front.',
  strip: 'A curlew and a redshank on the mud, with the reedbed beyond.',
  curlew: 'Adult at low water. The female’s bill is the longer.',
  redshank: 'Adult by a saltmarsh creek, on the red legs that give it its name.',
  reedling: 'Male on a reed stem. The female has a plain brown head.',
  warbler: 'Singing from the reeds, one foot on each stem.',
}, es: {
  cover: 'Un zarapito en el fango, con carrizos delante.',
  strip: 'Un zarapito y un archibebe en el fango, y el carrizal al fondo.',
  curlew: 'Adulto en bajamar. La hembra tiene el pico más largo.',
  redshank: 'Adulto junto a un caño de la marisma, sobre las patas rojas que lo delatan.',
  reedling: 'Macho en un tallo de carrizo. La hembra tiene la cabeza parda.',
  warbler: 'Cantando en el carrizal, con una pata en cada tallo.',
} });
// Every drawing is an SVG resource, sized in mm at 10 px per mm (as sheet() draws them).
const drawing = (id, { width, height }, more) => ({ id, typeId: 'plate', kind: 'svg',
  createdAt: 0, updatedAt: 0, altText: CAPTIONS[id],
  svg: { fileId: `${id}.svg`, width: width * 10, height: height * 10 }, ...more });
// Plates stand where ::resource{id="…"} is; since 1.5 an inline figure keeps a line of space below it too.
const resources = [drawing('cover', TRIM), drawing('strip', { width: TRIM.width, height: STRIP }),
  ...['curlew', 'redshank', 'reedling', 'warbler'].map((id) => drawing(id, PLATE,
    { caption: CAPTIONS[id], placement: { position: 'here' } }))];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = { Alegreya: ['400', '400i', '700'], 'Zilla Slab': ['600', '700'], // text, display
  'Barlow Condensed': ['400', '600', '700'] }; // and labels

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
for (const [id, svg] of Object.entries(drawings())) await loadSvg(`${id}.svg`, svg);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: BOOK });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
