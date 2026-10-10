// ═══ Postext Cookbook · Nº 009 · Figures that float to where you cite them ═════════
// https://postext.dev/en/cookbook/figures-float-where-cited
// Code: MIT · Text: original (CC BY 4.0) · Figures: diffusion models, labels in code
// Fonts: Faustina, Montserrat, IBM Plex Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// Chapter 2 of a geomorphology textbook. Six of its seven figures float, each to the first
// free slot its placement allows, counting from the paragraph that first cites it. Figure 2.6
// is set where ::resource embeds it. The figures are numbered in order of first mention.
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage,
  inlineSvgFonts, parseMarkdown,
} from 'https://esm.sh/postext';

const LANG = 'es'; // @lang: the language of the sample document ('es' | 'en')
const RECIPE = 'figures-float-where-cited';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: eight named colours; the paintings were made to match them
const palette = {
  ink: '#1b2227', // text: a cold near-black
  glacier: '#34729a', // the accent: kicker, ribbon, caption labels, references, folios, water
  ice: '#e3f1f8', // the opener slab
  rock: '#5b5a57', // bedrock in the drawings
  moss: '#7d8f4e', // valley floors and pines
  rule: '#c6d3db', // the hairline under the running heads
  muted: '#5d6a72', // running heads, credit notes, the colophon
  paper: '#ffffff',
};
// A linked colour carries its hex and the palette entry it follows.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color' (#295aa3): pointing it at the accent keeps
  // that second blue off the page.
  { id: 'main-color', name: 'glacier (defaults)', value: { hex: palette.glacier, model: 'hex' } },
];
// #endregion
const TEXT = 'Faustina'; // one family each for text, display and labels
const DISPLAY = 'Montserrat';
const LABEL = 'IBM Plex Sans Condensed';
const LEAD = 13.4; // body leading in pt: the grid every float band snaps to
const [PAGE_W, PAGE_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [200, 250, 22, 20, 18, 14, 6]; // mm
const MEASURE = PAGE_W - INNER - OUTER; // 168 mm: the text block, and a page-wide figure
const COLUMN = (MEASURE - GUTTER) / 2; // 81 mm: a column, and a column figure

// #region captions: the type name in the document's language; bold label, italic description
const captions = () => ({
  // The built-in types take their names from the locale: 'Figure 2.3' and 'fig. 2.3' with
  // 'en-us', 'Figura 2.3' with 'es', numbered {h1}.{n} per chapter. It sets hyphenation too.
  locale: t({ en: 'en-us', es: 'es' }),
  captionStyle: { // the text colour follows bodyText; the note is 0.85 × the caption size
    fontFamily: LABEL, fontSize: pt(8.3), gap: mm(2.2),
    labelColor: col('glacier'), descriptionItalic: true, // the label is bold by default
    note: { color: col('muted'), gap: mm(0.6) }, // the credit line
  },
});
// #endregion

// #region furniture: an ice slab off the fore-edge, a ribbon from the head, running heads
const at = (to, edge, x, y, width, height) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: height ? mm(height) : 'auto' } }) });
const text = (id, content, family, size, color, placement, extra) => ({ kind: 'text', id,
  content, fontFamily: family, fontSize: pt(size), color: col(color), placement,
  align: 'left', ...extra });
const caps = (size) => ({ fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.18) }); // capitals tracked 0.18 em
const [SLAB, RIBBON, RIBBON_END] = [64, 30, 70]; // mm: slab height; ribbon width and length
const [TEXT_X, KICKER_Y] = [RIBBON + 8, 10]; // mm: the opener texts start 8 mm right of the ribbon
const [TITLE_W, LEAD_W] = [118, 112]; // mm: the title's measure, and a shorter standfirst
const opener = {
  enabled: true,
  // At least 5 mm under the slab; the reserve then rounds up to whole 13.4 pt grid lines,
  // so here 69 mm becomes 15 lines (70.9 mm) and the text starts about 7 mm under the slab.
  minHeight: mm(SLAB + 5),
  slot: { elements: [
    { kind: 'box', id: 'slab', style: { backgroundColor: col('ice') }, // runs off the fore-edge
      placement: at('container', 'top-left', 0, 0, MEASURE + OUTER, SLAB) },
    { kind: 'box', id: 'ribbon', style: { backgroundColor: col('glacier') }, // hangs from the head
      placement: at('page', 'top-left', INNER, 0, RIBBON, RIBBON_END) },
    text('numeral', '{chapterNumber}', DISPLAY, 80, 'paper', // an 80 pt line box is 28 mm tall:
      at('page', 'top-left', INNER, RIBBON_END - 31, RIBBON), // it ends 3 mm above the foot
      { fontWeight: 800, lineHeight: 1, align: 'center' }),
    text('kicker', t({ en: 'Chapter {chapterNumber} · {attr.topic}',
      es: 'Capítulo {chapterNumber} · {attr.topic}' }), LABEL, 8.5, 'glacier',
    at('container', 'top-left', TEXT_X, KICKER_Y), caps(8.5)),
    text('title', '{titleText}', DISPLAY, 27, 'ink', at('#kicker', 'below', 0, 2.6, TITLE_W),
      { fontWeight: 800, lineHeight: 1.06 }),
    text('lead', '{attr.lead}', TEXT, 10.6, 'ink', at('#title', 'below', 0, 4.2, LEAD_W),
      { italic: true, lineHeight: 1.38, hyphenate: true }),
  ] },
};
const HAIRLINE = TOP - 5; // mm from the top edge: the rule under the running heads
const HEAD_Y = HAIRLINE - 4.4; // the running heads' line box, 4.4 mm above the hairline
const head = (id, content, parity, edge, x, extra) => text(id, content, LABEL, 7.6, 'muted',
  at('page', edge, x, HEAD_Y), { ...caps(7.6), parity, pages: 'body', ...extra });
const folio = (id, parity, edge, x, extra) => text(id, '{pageNumber}', DISPLAY, 8.5, 'glacier',
  at('page', edge, x, HEAD_Y), { fontWeight: 800, parity, pages: 'body', ...extra });
const header = { elements: [ // outer corners, over a hairline; never on the opener
  folio('verso-folio', 'even', 'top-left', OUTER),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8), { align: 'right' }),
  folio('recto-folio', 'odd', 'top-right', -OUTER, { align: 'right' }),
  { kind: 'rule', id: 'hairline', pages: 'body', direction: 'horizontal', color: col('rule'),
    thickness: pt(0.5), placement: { ...at('container', 'top-left', 0, HAIRLINE),
      size: { width: 'fill', height: 'auto' } } },
] };
const footer = { elements: [ // the drop folio: on the opener only, centred 9 mm under the text
  text('drop-folio', '{pageNumber}', DISPLAY, 8.5, 'glacier', at('container', 'top', 0, 9),
    { fontWeight: 800, align: 'center', pages: 'opener' })] };
// #endregion

const config = () => ({
  ...captions(),
  colorPalette,
  page: { width: mm(PAGE_W), height: mm(PAGE_H), dpi: 150, // a compact textbook trim
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  bodyText: { // justified serif; first lines indented 4 mm, except after a heading
    fontFamily: TEXT, fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('glacier'), // citations in the accent, like the caption labels they name
    firstLineIndent: mm(4), indentAfterHeading: false },
  headings: {
    fontFamily: DISPLAY, fontWeight: 800, color: col('ink'),
    // Columns end flush by adding grid lines above the H2s. Beside a float band a column can
    // come up several lines short; one line per heading (the default is 4) keeps a section
    // head from floating in a gap, and the balancer's other levers take what is left.
    balancing: { maxLinesPerHeading: 1 },
    levels: [
      // A chapter opens on a recto; 'odd' leaves a blank verso only when one is needed.
      { level: 1, fontSize: pt(27), span: 'page', breakBefore: { enabled: true, parity: 'odd' },
        marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), numberingTemplate: '{1}.{2}',
        marginTop: pt(LEAD), marginBottom: pt(0) }, // one grid line above, none below
    ],
  },
  unorderedLists: { color: col('glacier'), marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.2), lineHeight: pt(10),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// Caption, credit note ('-' for none) and alt text of each figure, one block per figure.
const figureTexts = /* @content:figures */ '';
const TEXTS = Object.fromEntries(figureTexts.trim().split(/\n\s*\n/)
  .map((block) => block.split('\n').map((line) => line.trim()))
  .map(([id, caption, note, alt]) => [id, [caption, note === '-' ? undefined : note, alt]]));

// #region answer: six figures float to the first slot their placement allows; one stays put
// In the Markdown, :ref{id="valleys" case="lower"} prints 'fig. 2.1' and places Figure 2.1.
// Captions, credits and alt texts come from content.figures.<lang>.md.
const figure = (id, height, placement) => {
  if (!TEXTS[id]) throw new Error(`content.figures has no caption block for "${id}"`);
  const [caption, note, altText] = TEXTS[id];
  // An SVG fills the width of its slot (a column or the text block, or a fraction of
  // either), so its width and height only give its shape.
  const width = (placement.span === 'page' ? MEASURE : COLUMN) * (placement.width ?? 1);
  return { id, typeId: 'figure', kind: 'svg', caption, note, altText,
    svg: { fileId: `${id}.svg`, width, height }, placement, createdAt: 0, updatedAt: 0 };
};
// In any order: the first mention of each one in the text, a :ref or a ::resource line,
// decides its number.
const resources = [
  // Cited on the opener page: 'auto' may take that page's foot band, where 'top'
  // could only open the next page (gotcha: top-float-next-page).
  figure('valleys', 56, { position: 'auto', span: 'page' }),
  // Across both columns, but only in a foot band: the page it is cited on, if both
  // columns still have room there, else the foot of the next page.
  figure('profile', 60, { position: 'bottom', span: 'page' }),
  // A column figure that takes only a column head: the next one still empty after its
  // citation, here the right column of the same page, above the text that follows it.
  figure('cirque', 48, { position: 'top' }),
  // Cited in the same sentence, the two take the next two column heads, side by side.
  figure('abrasion', 48, { position: 'top' }),
  figure('plucking', 48, { position: 'top' }),
  // No float: set exactly where ::resource{id="roche"} stands, with the same gap above it
  // and below it.
  figure('roche', 42, { position: 'here' }),
  // A band of its own, half the text width and centred. It is cited on the chapter's last
  // page, where a 'top' float would wait for the next page; a float cannot leave its
  // chapter, so this one goes to the foot of the last page.
  figure('moraines', 50, { position: 'top', span: 'page', width: 0.5, align: 'center' }),
];
// #endregion

// #region check: stop on an unknown id, and on a figure the text never places
// The build lists every :ref and ::resource to an id no resource has in doc.contentWarnings
// (kind 'unknownResourceId'); each prints '?' on the page. A figure nobody names is never
// placed and raises no warning, so the pen reads the mentions with the engine's own parser;
// an embed needs double quotes (gotcha: resource-double-quotes).
function checkFigures(doc) {
  const [named, embedded] = [new Set(), new Set()];
  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'resourceBlock' && block.resourceId) {
      named.add(block.resourceId);
      embedded.add(block.resourceId);
    }
    for (const span of block.spans) if (span.ref?.resourceId) named.add(span.ref.resourceId);
  }
  const unknown = (doc.contentWarnings ?? []).filter((w) => w.kind === 'unknownResourceId');
  const problems = [
    ...new Set(unknown.map((w) => `unknown id "${w.resourceId}"`)),
    ...resources.filter((r) => !named.has(r.id)).map((r) => `"${r.id}" is never cited`),
    ...resources.filter((r) => r.placement.position === 'here' && !embedded.has(r.id))
      .map((r) => `"${r.id}" is placed 'here' but no ::resource line embeds it`),
  ];
  if (problems.length) throw new Error(`Figures: ${problems.join('; ')}`);
}
// #endregion

// #region art: seven paintings (JPEGs in assets/) under vector labels in the book's language
// Each figure is an SVG: the painting, embedded as a data URL at the figure's printed size in
// mm, then its labels as text, so they stay sharp and follow the edition's language.
const mix = (hex, other, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16)
  * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
const C = { ink: palette.ink, flow: mix(palette.glacier, palette.ink, 0.4), snow: palette.paper };
const n2 = (v) => +v.toFixed(2);
// A hairline, drawn over a wider white one so it reads on rock and ice alike.
const hairline = ([x1, y1], [x2, y2]) => [['#ffffff', 0.55], [C.ink, 0.18]].map(([c, w]) =>
  `<path d="M${n2(x1)} ${n2(y1)}L${n2(x2)} ${n2(y2)}" stroke="${c}" stroke-width="${w}" `
  + 'stroke-linecap="round"/>').join('');
// A label with a thin white halo, and an optional leader to the point it names.
function label(x, y, words, { anchor = 'start', to, bold = false, color = C.ink } = {}) {
  const halo = color === C.snow ? C.ink : '#ffffff';
  const leader = to ? hairline([to[0], to[1]], [to[2] ?? x, to[3] ?? y - 0.9]) : '';
  return `${leader}<text x="${n2(x)}" y="${n2(y)}" text-anchor="${anchor}" fill="${color}"`
    + ` stroke="${halo}" stroke-width="0.5" stroke-linejoin="round" paint-order="stroke"`
    + `${bold ? ' font-weight="600"' : ''}>${words}</text>`;
}
const L = (en, es) => t({ en, es });
// The labels name their face on the SVG's root element, and loadSvg embeds the weights they
// set in the drawing: an SVG shown as an image cannot reach the page's fonts by itself.
const LABEL_MM = 2.45; // the label size in the drawings' millimetres: about 7 pt in print
// The viewBox is the figure's printed size in mm; the SVG's own size is set in mm too.
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}mm" `
  + `height="${n2(h)}mm" viewBox="0 0 ${n2(w)} ${n2(h)}" font-family="${LABEL}" `
  + `font-size="${LABEL_MM}">${body}</svg>`;

// The labels of each figure, in its millimetres, placed on its painting.
const DRAWINGS = {
  valleys: () => label(14, 5, L('River valley', 'Valle fluvial'), { bold: true })
    + label(100, 5, L('Glacial valley', 'Valle glaciar'), { bold: true })
    + label(47, 50.4, L('river', 'río'), { to: [43.4, 46.6, 46.8, 49.4] })
    + label(126, 21, L('ice', 'hielo'), { anchor: 'middle', bold: true })
    + label(125.5, 53.2, L('earlier V-shaped valley', 'antiguo valle en V'), { anchor: 'middle',
      to: [125.5, 48, 125.5, 51.3] }),
  profile: () => label(48, 8, L('accumulation zone', 'zona de acumulación'),
    { anchor: 'middle', bold: true, color: C.flow })
    + label(100, 20, L('ablation zone', 'zona de ablación'), { anchor: 'middle', bold: true,
      color: C.flow })
    + label(57, 19.6, L('equilibrium line', 'línea de equilibrio'), { to: [52.8, 27, 56.6, 20.2] })
    + label(108, 43.3, L('ice flow', 'flujo del hielo'), { bold: true, color: C.flow })
    + label(166, 41.6, L('terminal moraine', 'morrena frontal'), { anchor: 'end',
      to: [146, 45.5, 150, 42.2] })
    + label(4, 57.4, L('bedrock', 'lecho rocoso')),
  cirque: () => label(2.5, 30, L('back wall', 'pared'))
    + label(26, 6.6, L('bergschrund', 'rimaya'), { to: [20, 12.5, 25.6, 7.2] })
    + label(30, 22.6, L('rotation', 'rotación'), { bold: true, color: C.flow })
    + label(33, 40, L('basin', 'cubeta'))
    + label(66, 17.4, L('rock lip', 'umbral'), { anchor: 'middle', to: [60.5, 22.8, 64.4, 18.3] }),
  abrasion: () => label(55.5, 8.3, L('ice moves', 'el hielo avanza'), { bold: true, color: C.flow })
    + label(24, 16.6, L('stones in the ice', 'cantos presos en el hielo'),
      { to: [38.5, 22.6, 38, 17.4] })
    + label(20, 37, L('striations', 'estrías'), { anchor: 'end', to: [24, 29.5, 18, 35.8] })
    + label(40.5, 37, L('rock flour', 'harina de roca'), { to: [32, 26, 40.5, 35.8] }),
  plucking: () => label(30, 9.3, L('ice moves', 'el hielo avanza'), { bold: true, color: C.flow })
    + label(63.5, 18.5, L('plucked block', 'bloque arrancado'), { to: [60, 21, 63.3, 19.2] })
    + label(4, 43, L('ice in the joints', 'hielo en las diaclasas'), { to: [25.2, 32, 14, 41.3] }),
  roche: () => label(4, 5, L('ice, long gone', 'el hielo, hoy fundido'), { bold: true,
    color: C.flow })
    + label(25, 16.5, L('abrasion: smooth', 'abrasión: pulida'), { anchor: 'end',
      to: [30, 18.8, 25.5, 16.9] })
    + label(63, 11.2, L('plucking: rough', 'arranque: rugosa'), { to: [57.5, 15.5, 63.2, 11.9] }),
  // Placed on a 100.8 × 60 mm drawing; k scales the positions, not the type, to the figure.
  moraines: (w) => {
    const k = w / 100.8;
    const at = (x, y, words, o = {}) => label(x * k, y * k, words,
      { ...o, ...(o.to && { to: o.to.map((v) => v * k) }) });
    return at(4, 25.5, L('lateral moraine', 'morrena lateral'), { to: [37, 16, 21, 24.3] })
      + at(62, 33, L('medial moraine', 'morrena central'), { to: [50.5, 33, 61.5, 32.3] })
      + at(50, 45, L('lake', 'lago'), { anchor: 'middle', bold: true, color: C.snow })
      + at(97.5, 55, L('terminal moraine', 'morrena frontal'), { anchor: 'end',
        to: [60, 49, 78, 54] });
  },
};
// A painting as a data URL: an SVG drawn as an image cannot fetch anything itself.
async function dataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Painting not found (${res.status}): ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
const PAINTINGS = { // each figure's painting, a file in assets/, named by its width in pixels
  valleys: asset('valleys-1536.jpg'), profile: asset('profile-1400.jpg'),
  cirque: asset('cirque-1080.jpg'), abrasion: asset('abrasion-1080.jpg'),
  plucking: asset('plucking-1080.jpg'), roche: asset('roche-1080.jpg'),
  moraines: asset('moraines-1080.jpg') };
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the layout uses, loaded before the build
  Faustina: ['400', '400i', '700'], // text
  Montserrat: ['800'], // display: title, section heads, numeral, folios
  'IBM Plex Sans Condensed': ['400', '400i', '600', '700'], // labels: kicker, heads, captions
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const words = `${markdown}\n${figureTexts}`; // captions too: their letters decide the subsets
await prepareFonts(words, config(), kitFonts(FONTS));
// #region build: register the drawings, then set chapter 2 of a longer book
for (const { id, svg: { fileId, width, height } } of resources) { // each under its svg.fileId
  const art = await dataUrl(PAINTINGS[id]);
  await loadSvg(fileId, svg(width, height, `<image href="${art}" width="${n2(width)}" `
    + `height="${n2(height)}" preserveAspectRatio="none"/>${DRAWINGS[id](width, height)}`));
}
// One chapter came before: figures number 2.1, 2.2… and the folios start at 27.
const continuation = { pageNumbering: { startAt: 27 }, // odd, to match the recto of page 1
  headings: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } }; // the next # is chapter 2
const doc = await buildDocumentWithFonts({ markdown, resources, continuation }, config(),
  { ...kitFonts(FONTS), text: words });
checkFigures(doc); // a wrong id stops here, and the viewer's bar says why
showPages(doc, { title: t({ en: 'Figures that float to where you cite them',
  es: 'Figuras que flotan hasta donde las citas' }) });
// #endregion

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
