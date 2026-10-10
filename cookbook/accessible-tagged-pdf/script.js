// ═══ Postext Cookbook · Nº 039 · Accessible tagged PDF (PDF/UA) ═════════════════════
// https://postext.dev/en/cookbook/accessible-tagged-pdf
// Code: MIT · Text: original (CC BY 4.0) · Pictograms: generated in code (CC BY 4.0)
// Fonts: Atkinson Hyperlegible Next and Mono, Public Sans (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, defaultResourceTypes, parseTSV,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the sample document (this recipe is Spanish only)
const RECIPE = 'accessible-tagged-pdf';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: text colours chosen for their contrast, and never a colour without its name
const palette = {
  ink: '#14243a', // text: 15.6:1 on white
  navy: '#173556', // bands: white type on it 12.5:1
  signal: '#f2b705', // yellow: only on navy (6.9:1) or as a fill, never as text on white
  tint: '#e8eef5', // header cells and boxes: ink on it 13.4:1
  rule: '#aebccb', // table rules
  muted: '#4a5a6e', // footer and colophon: 7.0:1 on white
  paper: '#ffffff',
};
// hex beside the id: designs read the hex (gotcha: palette-skips-designs)
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// 'main-color' is the id the engine's default styles link to: any default left in them is navy
const colorPalette = [...Object.entries(palette), ['main-color', palette.navy]]
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const BIN = { amarillo: '#f2b705', azul: '#1f6fc5', verde: '#2e8b4a', marron: '#8a5a2f',
  gris: '#6b7480' }; // the street bins' colours, for the pictograms and the swatches
const NAME = { amarillo: 'Amarillo', azul: 'Azul', verde: 'Verde', marron: 'Marrón', gris: 'Gris',
  punto: 'Punto limpio' }; // a table cell never shows a colour alone: its name goes beside it
const cell = (text) => (text in NAME // an unknown colour ('none') draws an empty square
  ? `:swatch{color="${BIN[text] ?? 'none'}"} ${NAME[text]}` : text);
// #endregion

const TRIM = [210, 297]; // A4, the size residents print at home
const [TOP, FOOT, SIDE, LEAD] = [20, 22, 18, 15.5]; // margins in mm, not mirrored; leading in pt
const [PX, FIGURE, STREET] = [12, [83, 30], [174, 44]]; // drawings: px per mm, sizes in mm
const face = (fontFamily, fontWeight, size, more) => ({ fontFamily, fontWeight, fontSize: pt(size),
  ...more });
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, style, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', ...style, placement }); // default: '…' (gotcha: overflow-ellipsis-default)

// #region answer: the alt text and header cells the tags take from the resources
// renderToPdf writes a tagged PDF by default: the tag tree follows the headings, paragraphs,
// lists and boxes of the Markdown. Pictures and tables carry their own accessible text here.
const table = (id, tsv, columnWidths, caption, altText) => ({ id, typeId: 'table', kind: 'table',
  caption, altText, createdAt: 0, updatedAt: 0, // altText → the Table's /Summary
  placement: { position: 'here' }, // read where cited, not after the page (gotcha: float-read-last)
  table: { model: { headerRowCount: 1, columnWidths, // row 0: TH cells, scope Column
    rows: parseTSV(tsv).rows.map((row) => row.map(({ content }, c) => ({ content: cell(content),
      ...(c === 0 && { isHeader: true }) }))) } } }); // column 0: TH cells, scope Row
const resources = () => [
  { id: 'contenedores', typeId: 'figure', kind: 'svg', placement: { position: 'here' },
    svg: { fileId: 'contenedores.svg', width: FIGURE[0] * PX, height: FIGURE[1] * PX },
    caption: 'Una isla del barrio: de izquierda a derecha, amarillo, azul, verde, marrón y gris.',
    altText: 'Cinco contenedores en fila: amarillo con una botella de plástico, azul con una caja '
      + 'de cartón, verde con una botella de vidrio, marrón con un corazón de manzana y gris con '
      + 'una bolsa de basura cerrada.', createdAt: 0, updatedAt: 0 }, // → the Figure's /Alt
  table('dudas', dudas, [3, 2], 'Los residuos que más dudas dan.',
    'Once residuos y el contenedor de cada uno.'),
  table('horarios', horarios, [2.2, 4, 1.4], 'Días y horas de recogida.',
    'Qué días y desde qué hora se vacía cada contenedor.'),
  { id: 'calle', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, // the cover's row:
    svg: { fileId: 'calle.svg', width: STREET[0] * PX, height: STREET[1] * PX } }, // an artifact
];
const exportPdf = (doc) => renderToPdf(doc, { fontProvider: fontsourceProvider,
  resourceBytes: imageBytes }); // accessible and outlines default to true
// #endregion

// #region headings: one outline: cover and contents unnumbered, then sections 1 and 2 with H2s
const [BAND, COVER] = [54, 176]; // mm from the trim top to the foot of each band
const band = (height) => ({ kind: 'box', id: 'band', style: { backgroundColor: col('navy') },
  placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(height) } } });
const display = (size, hue) => face('Public Sans', 800, size, { lineHeight: 1, color: col(hue) });
const section = { enabled: true, slot: { elements: [band(BAND),
  text('number', '{number}', display(64, 'signal'), at('container', 'top-left', 0, 4)),
  text('title', '{titleText}', display(28, 'paper'),
    { ...at('#number', 'right-of', 6, 3.5), size: { width: mm(130) } })] } };
// A heading design's text is tagged as the heading, so the cover's band holds only the title.
const cover = { enabled: true, minHeight: mm(COVER - TOP + 24), slot: { elements: [band(COVER),
  { kind: 'box', id: 'kerb', style: { backgroundColor: col('signal') },
    placement: { ...at('bleed', 'top-left', 0, COVER), size: { width: 'fill', height: mm(3) } } },
  { kind: 'image', id: 'bins', resourceId: 'calle', // the wheels stand on the kerb
    placement: { ...at('#kerb', 'align-bottom', SIDE), size: { width: mm(STREET[0]) } } },
  text('title', '{titleText}', display(66, 'paper'),
    { ...at('container', 'top-left', 0, 26), size: { width: mm(STREET[0]) } })] } };
const plain = (id, more) => ({ id, numbered: false, span: 'column', ...more,
  advancedDesign: { enabled: false }, fontSize: pt(26), lineHeight: pt(2 * LEAD) });
const headingStyles = [
  { id: 'portada', numbered: false, toc: false, span: 'page', advancedDesign: cover,
    layout: { layoutType: 'single' }, footer: { elements: [] } },
  plain('indice', { toc: false }), // the contents leave their own heading out
  plain('presentacion', { breakBefore: { enabled: false } }), // gotcha: style-inherits-break
];
const headings = { fontFamily: 'Public Sans', fontWeight: 800, color: col('ink'),
  levels: [ // restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break)
    { level: 1, numberingTemplate: '{1}', breakBefore: { enabled: true, parity: 'any' },
      span: 'page', advancedDesign: section, marginBottom: pt(LEAD) }, // 9.7 mm under the band
    { level: 2, fontWeight: 700, fontSize: pt(13.5), lineHeight: pt(LEAD), marginTop: pt(0),
      marginBottom: pt(0) }, // the line above an H2 is the paragraph's, or the resource's, gap
  ] };
// #endregion

// #region contents: the H1s and H2s with their page numbers; each row links in the PDF
const [NUMBER, GAP] = [6, 2.5]; // mm: the number column and the gap before a title
const toc = { levels: [{ level: 1, ...face('Public Sans', 700, 12), numberWidth: mm(NUMBER),
  numberGap: mm(GAP), marginTop: pt(LEAD / 2) }, { level: 2, indent: mm(NUMBER + GAP) }],
  unnumbered: { indent: mm(NUMBER + GAP) }, leader: { gap: mm(1.5) }, // Presentación: no number
  // The leaders take this face, not Public Sans (gotcha: toc-leader-kerning)
  pageNumber: { fontFamily: 'Atkinson Hyperlegible Next', fontWeight: 700, width: mm(8) } };
// #endregion

const label = (size, color, weight = 400) => face('Atkinson Hyperlegible Mono', weight, size,
  { color: col(color) });
const footer = { elements: [ // the PDF tags these as pagination artifacts
  text('where', '{title} · Castrovalle', { ...label(7.5, 'muted'), letterSpacing: pt(0.6),
    overflow: 'clip' }, at('container', 'bottom-left', 0, -11)),
  text('folio', '{pageNumber}', { ...label(9, 'ink', 700), align: 'right', overflow: 'clip' },
    at('container', 'bottom-right', 0, -10.6))] };

const config = () => ({
  // #region identity: the language the PDF declares, and captions in that language
  locale: LANG, // → /Lang es (it hyphenates justified text only: gotcha ragged-no-hyphenation)
  resourceTypes: defaultResourceTypes(LANG), // "Figura", "Tabla" (gotcha: resource-types-locale)
  // /Title and /Author come from the frontmatter, every value quoted (gotcha: quote-frontmatter)
  // #endregion
  colorPalette, headings, headingStyles, toc, footer,
  header: { elements: [] }, // each page opens with an H1, so the folio goes in the footer
  page: { width: mm(TRIM[0]), height: mm(TRIM[1]), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(FOOT), left: mm(SIDE), right: mm(SIDE) } },
  layout: { gutterWidth: mm(8) }, // two columns: the default layout
  bodyText: { fontFamily: 'Atkinson Hyperlegible Next', fontSize: pt(10.5), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left',
    firstLineIndent: mm(0), paragraphSpacing: true }, // ragged, so no runt check: ragged-runts
  unorderedLists: { color: col('ink'), marginTop: pt(0), marginBottom: pt(LEAD) },
  orderedLists: { color: col('ink'), fontWeight: 700, marginTop: pt(0), marginBottom: pt(LEAD) },
  paragraphStyles: [{ id: 'entradilla', fontSize: pt(17), lineHeight: pt(24) },
    { id: 'carta', fontSize: pt(12), lineHeight: pt(18), spaceBetween: pt(9) },
    // the council's imprint drops seven lines below the lead, to the cover's last line
    { id: 'sello', ...label(9, 'ink'), lineHeight: pt(LEAD), marginTop: pt(7 * LEAD) },
    { id: 'colofon', ...label(7, 'muted'), lineHeight: pt(10), marginTop: pt(LEAD) }],
  calloutStyles: [{ id: 'formatos', background: col('tint'), padding: mm(4), snapToGrid: false,
    titleStyle: { ...label(8, 'navy', 700), letterSpacing: pt(0.6), textTransform: 'uppercase' },
    marginTop: mm(4.5), body: { fontSize: pt(10), lineHeight: pt(14.5) } }],
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('tint'), headerColor: col('ink'), headerFontSize: pt(9.5),
    bodyFontSize: pt(9.5), cellPadding: mm(1.35) }, // faces and colours follow the body text
  captionStyle: { fontSize: pt(9) },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook
const dudas = /* @content:dudas */ ''; // TSV, as a spreadsheet exports it: residuo, contenedor
const horarios = /* @content:horarios */ ''; // TSV: contenedor, días, desde qué hora

// #region reading-order: the order of the tags, which is the order renderToPdf paints the page in
// An opener band's title, each column from top to bottom, then the page's floats. A paragraph
// continued in the next column stays one element, so its second part keeps its number.
const tagOf = (b) => ({ heading: `H${b.headingLevel ?? 1}`, callout: 'Div', listItem: 'LI',
  resource: b.resourceBlock?.kind === 'table' ? 'Table' : 'Figure' })[b.type] ?? 'P';
function readingOrder(page) {
  const ids = new Map(); // element → its number
  const add = (block, box) => {
    const key = block.id.replace(/-cont-\d+$/, ''); // fragments share their block's id
    if (!ids.has(key)) ids.set(key, ids.size + 1);
    return { n: ids.get(key), tag: tagOf(block), box, cont: key !== block.id };
  };
  const blocks = page.columns.flatMap((c) => c.blocks);
  const title = blocks.find((b) => b.hidden && b.type === 'heading'); // drawn by the band
  return [...(page.openerBand && title ? [add(title, union(page.openerBand.blocks
    .filter((b) => b.kind === 'text')))] : []),
  ...blocks.filter((b) => !b.hidden).map((b) => add(b, b.bbox)),
  ...(page.floats ?? []).map((b) => add(b, b.bbox))];
}
// #endregion

// #region art: the five street bins, and the reading order painted over page 3
const n = (v) => Math.round(v * 100) / 100;
const rgb = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16));
const shade = (hex, k) => `#${rgb(hex).map((c) => Math.round(c * k).toString(16).padStart(2, '0'))
  .join('')}`;
const luminance = (hex) => rgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92
  : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
// A white glyph where it reaches 3:1 against the bin (WCAG's figure for graphics), else ink.
const glyphOn = (hex) => (1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : palette.ink);
// Pictograms in an 8 × 10 box centred on (0, 0): a bottle, a box, a wine bottle, an apple core
// and a tied bag. Strokes only, so they stay vector in the PDF.
const GLYPH = {
  amarillo: 'M-1.2 -5L1.2 -5L1.2 -3.6C2.8 -3 3 -2 3 -1L3 4.2C3 4.8 2.6 5 2 5L-2 5C-2.6 5 -3 4.8 '
    + '-3 4.2L-3 -1C-3 -2 -2.8 -3 -1.2 -3.6Z M-3 0.6L3 0.6',
  azul: 'M-4 -1L0 -3L4 -1L4 4L0 5.6L-4 4Z M-4 -1L0 1L4 -1 M0 1L0 5.6 M-4 -1L-5 -3.4L-1 -5.4L0 -3',
  verde: 'M-0.9 -5.4L0.9 -5.4L0.9 -2.2C2.6 -1.4 2.8 -0.4 2.8 0.8L2.8 4.6C2.8 5.1 2.5 5.4 2 5.4L-2 '
    + '5.4C-2.5 5.4 -2.8 5.1 -2.8 4.6L-2.8 0.8C-2.8 -0.4 -2.6 -1.4 -0.9 -2.2Z',
  marron: 'M-2.6 -3.2C-0.6 -3.8 0.6 -3.8 2.6 -3.2C1.2 -1.6 1.2 1.6 2.6 3.6C0.6 4.4 -0.6 4.4 '
    + '-2.6 3.6C-1.2 1.6 -1.2 -1.6 -2.6 -3.2Z M0 -3.6L0.4 -5.6 M0.4 -5C1.6 -6 2.8 -5.6 3.2 -5',
  gris: 'M-3.4 -1.6C-3.8 1.4 -3.4 5 0 5C3.4 5 3.8 1.4 3.4 -1.6C2.6 -2.6 1 -3 0 -3.2C-1 -3 '
    + '-2.6 -2.6 -3.4 -1.6Z M-1.6 -3.1L-2.4 -5.2L0 -4L2.4 -5.2L1.6 -3.1',
};
function binsSvg([w, h], size) { // five bins across w mm, their wheels on the foot of the drawing
  const step = w / 5;
  const bins = Object.keys(BIN).map((id, i) => {
    const [cx, bw, r] = [step * (i + 0.5), size * 0.68, size * 0.06]; // centre, width, wheel
    const [top, foot] = [h - size - r, h - r];
    const lid = `M${n(cx - bw / 2 - r / 2)} ${n(top)}L${n(cx + bw / 2 + r / 2)} ${n(top)}`
      + `L${n(cx + bw / 2)} ${n(top - size * 0.1)}L${n(cx - bw / 2)} ${n(top - size * 0.1)}Z`;
    const body = `M${n(cx - bw / 2)} ${n(top)}L${n(cx + bw / 2)} ${n(top)}L${n(cx + bw * 0.46)} `
      + `${n(foot)}L${n(cx - bw * 0.46)} ${n(foot)}Z`;
    const wheel = (x) => `<circle cx="${n(x)}" cy="${n(foot)}" r="${n(r)}" fill="${palette.ink}"/>`;
    return `<path d="${body}" fill="${BIN[id]}"/><path d="${lid}" fill="${shade(BIN[id], 0.72)}"/>`
      + wheel(cx - bw * 0.34) + wheel(cx + bw * 0.34)
      + `<path d="${GLYPH[id]}" transform="translate(${n(cx)} ${n(top + size * 0.48)}) `
      + `scale(${n(size / 16)})" fill="none" stroke="${glyphOn(BIN[id])}" stroke-width="0.8" `
      + 'stroke-linejoin="round" stroke-linecap="round"/>'; // the glyphs are drawn for a 16 mm bin
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * PX}" height="${h * PX}" `
    + `viewBox="0 0 ${w} ${h}">${bins.join('')}</svg>`;
}
function union(boxes) { // the box around several design elements
  return boxes.reduce((u, { bbox: b }) => {
    const [x, y] = [Math.min(u.x, b.x), Math.min(u.y, b.y)];
    return { x, y, width: Math.max(u.x + u.width, b.x + b.width) - x,
      height: Math.max(u.y + u.height, b.y + b.height) - y };
  }, boxes[0].bbox);
}
function drawReadingOrder(ctx, page, scale) {
  const mmPx = (v) => (v * page.width * scale) / TRIM[0];
  const [r, pad, ink] = [mmPx(2.8), mmPx(1.2), '#d6146e']; // disc radius, box padding, magenta
  const inset = mmPx(0.6); // a gap under a box another one touches, such as a heading
  const boxOf = ({ x, y, width, height }, grow = 0) => ({ x: x * scale - pad, y: y * scale
    + inset - grow, w: width * scale + 2 * pad, h: height * scale - inset + 2 * grow });
  const tab = (label, { x, y, w }, fill) => { // a label straddling the box's top-right corner
    ctx.font = `700 ${r * 0.95}px "Atkinson Hyperlegible Mono"`;
    const lw = ctx.measureText(label).width + r * 0.8;
    ctx.fillStyle = fill;
    ctx.fillRect(x + w - lw, y - r * 0.55, lw, r * 1.1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + w - lw / 2, y + r * 0.02);
  };
  const marks = readingOrder(page).map((m) => ({ ...m, ...boxOf(m.box) }));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = r / 4.5;
  ctx.strokeStyle = ink;
  marks.forEach((m, i) => { // a line down each column, from one number to the next
    const p = marks[i - 1];
    if (!p || m.y < p.y) return; // no line for the jump to the next column
    ctx.beginPath();
    ctx.moveTo(p.x - r * 1.3, p.y + r);
    ctx.lineTo(m.x - r * 1.3, m.y + r);
    ctx.stroke();
  });
  for (const m of marks) {
    ctx.fillStyle = 'rgba(214, 20, 110, 0.07)';
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.setLineDash(m.cont ? [r / 2, r / 3] : []);
    ctx.strokeRect(m.x, m.y, m.w, m.h);
    ctx.setLineDash([]);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(m.x - r * 1.3, m.y + r, r, 0, Math.PI * 2);
    ctx.fill();
    tab(m.cont ? `${m.tag} (cont.)` : m.tag, m, ink);
    ctx.font = `700 ${r * 1.15}px "Atkinson Hyperlegible Mono"`;
    ctx.fillText(String(m.n), m.x - r * 1.3, m.y + r * 1.05);
  }
  if (page.footer?.blocks.length) { // running heads and folios: artifacts, never read
    const foot = boxOf(union(page.footer.blocks), pad);
    ctx.strokeStyle = '#6b7480';
    ctx.setLineDash([r / 2, r / 3]);
    ctx.strokeRect(foot.x, foot.y, foot.w, foot.h);
    tab('Artifact', foot, '#6b7480');
  }
  ctx.restore();
}
function showReadingOrder(page) { // over the viewer's page, and in the Cookbook's page images
  const canvas = [...document.querySelectorAll('#pages canvas')]
    .find((c) => c.postext.page === page);
  const layer = Object.assign(document.createElement('canvas'), { width: canvas.clientWidth * 2,
    height: canvas.clientHeight * 2 }); // transparent, over the painted page
  layer.style.cssText = 'position:absolute;top:0;left:0;width:100%;background:none;box-shadow:none';
  canvas.parentElement.style.position = 'relative';
  canvas.after(layer);
  drawReadingOrder(layer.getContext('2d'), page, layer.width / page.width);
  window.__postextOverlay = (ctx, p, _, scale) => p.index === page.index
    && drawReadingOrder(ctx, p, scale);
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Loaded before layout; the PDF embeds the same files (gotcha: latin-subset)
const FONTS = { 'Atkinson Hyperlegible Next': ['400', '400i', '700', '700i'],
  'Atkinson Hyperlegible Mono': ['400', '700'], 'Public Sans': ['700', '800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadSvg('contenedores.svg', binsSvg(FIGURE, 23));
await loadSvg('calle.svg', binsSvg(STREET, 36));
const content = { markdown, resources: resources() };
const doc = await buildDocumentWithFonts(content, config(), kitFonts(FONTS));
showPages(doc, { title: 'Reciclar en el barrio · PDF accesible' });
showReadingOrder(doc.pages[2]); // page 3: every tagged block numbered in reading order
offerPdf(() => exportPdf(doc), `${RECIPE}.pdf`);

// @kit
