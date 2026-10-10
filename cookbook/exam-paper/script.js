// ═══ Postext Cookbook · Nº 049 · Exam paper with an answer sheet ═════════════════
// https://postext.dev/en/cookbook/exam-paper
// Code: MIT · Text: Lincoln (PD); questions, Spanish translation (CC BY 4.0) · Art: in code
// Fonts: PT Serif, Inter Tight (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocumentWithFonts, prepareFonts, renderPageToCanvas, registerResourceImage, inlineSvgFonts,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'exam-paper';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1b1a1f', paper: '#ffffff', muted: '#6b6466', // heads, credits: 5.8:1
  crimson: '#9b1c31', // the one accent: cover, numbering, bubbles, marks (8.1:1 on white)
  blush: '#f3cdd4', tint: '#fbeff1', // type on the band, marks chips; the grid, the rubric box
  rule: '#b9aeb0' }; // answer lines and hairlines
// col(id): a colour linked to its palette entry, with the entry's hex beside the id.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults are linked to 'main-color': point it at the accent.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.crimson })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [TEXT, LABEL, PAGE] = ['PT Serif', 'Inter Tight', { w: 215.9, h: 279.4 }]; // US Letter
const [TOP, BOTTOM, LEFT, MEASURE] = [22, 24, 24, 134]; // mm; 134 mm: about 75 characters
const RIGHT = PAGE.w - LEFT - MEASURE; // 57.9 mm: the examiner's margin, never mirrored
const [BODY, LEAD] = [11, 15]; // pt: text size and leading, the grid every line keeps to
const at = (x, y, size, edge = 'top-left') => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const text = (id, content, family, size, weight, color, placement, extra) => ({ kind: 'text',
  id, content, fontFamily: family, fontSize: pt(size), fontWeight: weight, color: col(color),
  align: 'left', overflow: 'wrap', placement, ...extra });
const tag = { textTransform: 'uppercase', letterSpacing: pt(1.4) }; // 0.16–0.19 em
const small = { fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(10), color: col('muted') };

// #region answer: ruled answer lines: a table whose rows are two body lines deep
// A table row is one line (the table's size × the body's leading ratio) plus cellPadding above
// and below: at the body size, (ROW − LEAD) / 2 of padding makes every row ROW deep, so the
// rules keep to the text's 15 pt grid, 10.6 mm apart: room for handwriting.
const ROW = 2 * LEAD; // pt
const lines = { id: 'lines', rules: 'horizontal', // a rule on the top and foot of every row
  borderColor: col('rule'), borderWidth: pt(0.5), bodyFontFamily: LABEL, bodyFontSize: pt(BODY),
  bodyColor: col('crimson'), cellPadding: pt((ROW - LEAD) / 2) };
// Every table in this paper is set 'here': where its ::resource directive stands in the text.
const table = (id, styleId, model) => ({ id, typeId: 'form', kind: 'table', createdAt: 0,
  updatedAt: 0, placement: { position: 'here' }, table: { styleId, model } });
// One table per answer, the part's number in its first margin cell.
const answerLines = (id, part, rows) => table(id, 'lines', { columnWidths: [1, 5], rows: Array
  .from({ length: rows }, (_, i) => [{ content: i ? '' : `**${part}**` }, { content: '' }]) });
// #endregion

// #region numbering: 11 → a) → i), the separators in the accent; options under a question
const [NUMBER, GAP] = [12.5, 6]; // pt: the question numbers' size; number to text
const orderedLists = { fontFamily: LABEL, color: col('ink'), // bold, by default
  separatorColor: col('crimson'), gap: pt(GAP), marginTop: pt(LEAD / 2), marginBottom: pt(0),
  itemSpacing: pt(5), numberWidth: 'level', // 5 pt to the options or next part; text after '10.'
  levels: [{ level: 1, fontSize: pt(NUMBER) }, // 'arabic' and '.', the defaults
    { level: 2, numberFormat: 'lower-alpha', separator: ')' },
    { level: 3, numberFormat: 'lower-roman', separator: ')' }] };
// Options: a bulletless item at the questions' depth, '10.' plus GAP in (boxes set their own).
const width = (s) => { const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  ctx.font = `700 ${NUMBER}pt "${LABEL}"`; return ctx.measureText(s).width * 0.75; }; // pt
const unorderedLists = () => ({ gap: pt(0), marginTop: pt(0), marginBottom: pt(0),
  itemSpacing: pt(LEAD), // after the options: a line before the next question
  indent: pt(width('10') + width('.') + GAP), levels: [{ level: 1, bulletChar: '' }] });
// #endregion

// #region chips: bubbles that read as circles, and marks at the end of a part
// A chip is 0.8 em above the baseline and 0.25 em below, plus paddingY and the border on each
// side: 1.29 em and two borders. One capital is 0.63–0.72 em wide, so paddingX 0.3 em (and the
// same two borders) squares the box; a radius over half its smaller side is clamped to that half.
const chip = (id, look) => ({ id, fontFamily: LABEL, fontSize: em(0.8), bold: true,
  paddingY: em(0.12), ...look });
const bubble = (id, fill, ink, edge = 'crimson') => chip(id, { color: col(ink), paddingX: em(0.3),
  background: col(fill), borderColor: col(edge), borderWidth: pt(0.7), borderRadius: em(1) });
const chipStyles = [bubble('bubble', 'paper', 'crimson'), // first: a bare :chip[A] takes it
  bubble('filled', 'ink', 'paper', 'ink'), chip('marks', { color: col('crimson'),
    background: col('blush'), borderWidth: pt(0), paddingX: em(0.45), gap: em(0.5) })];
// #endregion

// #region forms: the candidate boxes and the bubble grid are named table styles too
// No table has a header row; the flag keeps the default grey fill off one added later.
const form = { bodyFontFamily: LABEL, borderRadius: mm(2), headerBackgroundEnabled: false };
const tableStyles = [lines,
  { ...form, id: 'candidate', rules: 'grid', borderColor: col('rule'), borderWidth: pt(0.75),
    bodyFontSize: pt(7.5), bodyColor: col('crimson'), cellPadding: mm(1.8) },
  // No rules: the tint of each cell meets its neighbours' and the grid reads as one panel.
  { ...form, id: 'grid', rules: 'none', bodyBackgroundEnabled: true,
    bodyBackground: col('tint'), bodyFontSize: pt(11.5), cellPadding: mm(1.4) }];
const cell = (content, extra) => ({ content, align: 'center', verticalAlign: 'middle', ...extra });
// The MARK cell sets the row's depth: three lines, the blank one a no-break space.
const candidate = table('candidate', 'candidate', { columnWidths: [4.2, 1.2, 2, 1.3], rows: [[
  ...t({ en: ['NAME', 'CLASS', 'CANDIDATE NUMBER'], es: ['NOMBRE Y APELLIDOS', 'GRUPO',
    'N.º DE EXAMEN'] }).map((l) => cell(`**${l}**`, { align: 'left', verticalAlign: 'top' })),
  cell(`**${t({ en: 'MARK', es: 'NOTA' })}**\n\u00A0\n**/ ${t({ en: '25', es: '10' })}**`,
    { align: 'right', background: col('tint') })]] });
const GROUP = ['A', 'B', 'C', 'D'].map((l) => cell(`:chip[${l}]`)), num = (n) => cell(`**${n}**`);
const grid = { ...table('grid', 'grid', { columnWidths: [0.7, 1, 1, 1, 1, 1.4, 0.7, 1, 1, 1, 1],
  rows: [1, 2, 3, 4, 5].map((n) => [num(n), ...GROUP, cell(''), num(n + 5), ...GROUP]) }),
  caption: t({ en: '**Section A answer grid**', es: '**Parte A: plantilla de respuestas**' }) };
// The grid's title is its caption: a heading would stand a body line off any 'here' table.
const captionStyle = { fontFamily: LABEL, fontSize: pt(9.4), color: col('crimson'),
  position: 'above', gap: mm(1.6) }; // the rubric's size
// #endregion

// #region cover: a band with the outlined year, filled in from the heading's attributes
const BAND = 116; // mm: the crimson band, bled off the top and both sides
const YEAR = { cap: 62, cut: 12, pad: 2 }; // mm: the digits' cap height; the band cuts 12 off
// span 'page' makes the cover an opener page, which the body pages' furniture skips.
const cover = { id: 'cover', span: 'page', margins: { right: mm(LEFT) }, // forms full width
  advancedDesign: { enabled: true, slot: { elements: [ // the date line sets the height
    { kind: 'box', id: 'band', style: { backgroundColor: col('crimson') },
      placement: at(0, 0, { width: mm(PAGE.w), height: mm(BAND) }) },
    // Design text has no outline, so the year is an image, cut off by the band's foot.
    { kind: 'image', id: 'year', resourceId: 'year', placement: at(0, BAND - YEAR.cap
      + YEAR.cut - YEAR.pad, { width: mm(PAGE.w), height: mm(YEAR.cap - YEAR.cut + YEAR.pad) }) },
    text('session', '{attr.session}', LABEL, 8.5, 600, 'blush', at(LEFT, 14), tag),
    // 0.9 mm to the left: the H's side bearing at 64 pt (84 of 2048 units), so its stem aligns.
    text('title', '{titleText}', LABEL, 64, 800, 'paper', at(LEFT - 0.9, 19), { lineHeight: 1 }),
    text('paper', '{attr.paper}', LABEL, 15, 700, 'paper', at(LEFT, 44)),
    text('topic', '{attr.topic}', TEXT, 15, 400, 'blush', at(LEFT, 52), { italic: true }),
    text('date', '{attr.date}', LABEL, 9.5, 700, 'ink', at(LEFT, BAND + 6))] } } };
// #endregion

// #region furniture: margin, folio and 'Turn over' on body pages; a notice on the cover
const [MARGIN, FOOT] = [LEFT + MEASURE + 7, -13]; // mm: the margin rule, 7 off the text; the foot
const body = { pages: 'body', ...tag }; // body pages only: never the cover
const header = { elements: [
  text('running', '{title} · {chapterTitle}', LABEL, 7.5, 600, 'muted', at(LEFT, 12), body),
  { kind: 'rule', id: 'margin', direction: 'vertical', pages: 'body', color: col('rule'),
    thickness: pt(0.75), placement: at(MARGIN, TOP, { height: mm(PAGE.h - TOP - BOTTOM) }) },
  text('note', t({ en: 'Do not write in this margin', es: 'No escribas en este margen' }), LABEL,
    7.5, 600, 'muted', at(MARGIN + 3, TOP, { width: mm(28) }), { ...body, lineHeight: 1.3 })] };
const footer = { elements: [
  text('notice', t({ en: 'Do not turn over until you are told to do so',
    es: 'No des la vuelta a la hoja hasta que se te indique' }), LABEL, 8.5, 700, 'crimson',
  at(0, FOOT, { width: mm(PAGE.w) }, 'bottom-left'), { pages: 'opener', align: 'center', ...tag }),
  text('folio', '{pageNumber}', LABEL, 9, 700, 'ink', at(LEFT, FOOT, { width: mm(MEASURE) },
    'bottom-left'), { ...body, align: 'center' }), // centred under the text
  // Rectos only: a verso faces the page that follows it.
  text('turn', t({ en: 'Turn over ›', es: 'Pasa la página ›' }), LABEL, 9, 700, 'ink',
    at(-RIGHT, FOOT, null, 'bottom-right'), { ...body, parity: 'odd', align: 'right' })] };
// #endregion

const section = { enabled: true, slot: { elements: [ // Section A, Section B: in the column
  { kind: 'rule', id: 'top', color: col('crimson'), thickness: pt(2),
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } },
  text('kicker', '{attr.section} · {attr.marks}', LABEL, 8.5, 700, 'crimson', { anchor: {
    to: 'container', edge: 'top-left' }, offset: { y: mm(3) } }, tag),
  text('title', '{titleText}', LABEL, 20, 800, 'ink', { anchor: { to: '#kicker',
    edge: 'below' }, offset: { y: mm(1.2) }, size: { width: 'fill' } }, { lineHeight: 1.05 })] } };

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // the language of the hyphenation patterns
  resourceTypes: [{ id: 'form', name: 'Form', shortLabel: '', captionPrefix: '',
    numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' }], // no label
  colorPalette, chipStyles, tableStyles, captionStyle, orderedLists, header, footer,
  headingStyles: [cover], unorderedLists: unorderedLists(), // measured now that the fonts are in
  page: { width: mm(PAGE.w), height: mm(PAGE.h), dpi: 150, margins: { top: mm(TOP),
    bottom: mm(BOTTOM), left: mm(LEFT), right: mm(RIGHT) } }, layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'), textAlign: 'left',
    firstLineIndent: pt(0), paragraphSpacing: true, tabStops: [{ position: 'end', align: 'end' }] },
  // No page break: a :::pagebreak opens each section, so its page stays a body page with a
  // folio. A heading that breaks the page makes an opener, which pages: 'body' leaves bare.
  headings: { fontFamily: LABEL, levels: [{ level: 1, breakBefore: { enabled: false },
    marginTop: pt(0), marginBottom: pt(0), advancedDesign: section }] },
  calloutStyles: [{ id: 'rubric', background: col('tint'), borderRadius: mm(2), columnGap: mm(8),
    padding: { top: mm(4), right: mm(5), bottom: mm(4), left: mm(5) }, marginTop: pt(0),
    marginBottom: pt(0), lists: { bulletChar: '–', color: col('crimson'), gap: mm(2), indent: pt(0),
      itemSpacing: pt(3) }, body: { fontFamily: LABEL, fontSize: pt(9.4), lineHeight: pt(13),
      boldColor: col('crimson'), paragraphSpacing: false } },
  { id: 'source', backgroundEnabled: false, marginTop: pt(LEAD), stripe: { enabled: true,
    side: 'left', width: pt(3), color: col('crimson') }, padding: { top: mm(1), right: mm(0),
    bottom: mm(1), left: mm(6) }, titleStyle: { fontFamily: LABEL, fontSize: pt(8.5),
      fontWeight: 700, color: col('crimson'), gap: mm(2), ...tag }, body: { fontSize: pt(10.5),
      lineHeight: pt(LEAD), textAlign: 'justify', paragraphSpacing: false,
      firstLineIndent: mm(4) } }],
  paragraphStyles: [{ id: 'signature', textAlign: 'right' }, { id: 'credit', ...small },
    { id: 'end', ...small, boldColor: col('crimson'), textAlign: 'center', spaceBetween: pt(8) }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the outlined year
// The year is SVG text in Inter Tight 800, stroked and not filled: loadSvg embeds the face the
// text names (inlineSvgFonts). The capitals are 0.7275 em tall, and the 1's flag starts 0.03 em in.
function year() { // 10 units to the millimetre
  const [w, h] = [PAGE.w * 10, (YEAR.cap - YEAR.cut + YEAR.pad) * 10];
  const size = (YEAR.cap * 10) / 0.7275; // font size: cap height to YEAR.cap
  const x = LEFT * 10 - 0.0303 * size; // line the 1's flag up with the text
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} `
    + `${h}"><text x="${x.toFixed(1)}" y="${(YEAR.cap + YEAR.pad) * 10}" font-family="${LABEL}" `
    + `font-weight="800" font-size="${size.toFixed(1)}" fill="none" stroke="${palette.paper}" `
    + 'stroke-width="8.5" stroke-linejoin="round">1863</text></svg>'; // 0.85 mm
}
// typeId 'form' too: the drawing is placed by the cover's design, never by ::resource, and a
// type with no captionPrefix spares it a figure number.
const picture = { id: 'year', typeId: 'form', kind: 'svg', altText: '1863', createdAt: 0,
  updatedAt: 0, svg: { fileId: 'year.svg', width: PAGE.w * 10,
    height: (YEAR.cap - YEAR.cut + YEAR.pad) * 10 } }; // in the drawing's own units
// #endregion

const resources = [picture, candidate, grid, answerLines('lines-ai', '11 a) i)', 1),
  answerLines('lines-aii', '11 a) ii)', 2), answerLines('lines-b', '11 b)', 4),
  answerLines('lines-c', '11 c)', 8)];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'PT Serif': ['400', '400i', '700', '700i'],
  'Inter Tight': ['400', '600', '700', '800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([prepareFonts(markdown, config(), kitFonts(FONTS)), loadSvg('year.svg', year())]);
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: t({ en: 'History Paper 2', es: 'Historia, prueba 2' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
