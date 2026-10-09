// ═══ Postext Cookbook · Nº 049 · Exam paper with an answer sheet ═════════════════
// https://postext.dev/en/cookbook/exam-paper
// Code: MIT · Text: Lincoln (PD); questions, Spanish translation (CC BY 4.0) · Art: in code
// Fonts: PT Serif, Inter Tight (SIL OFL 1.1) · Needs postext ≥ 1.23.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'exam-paper';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#1b1a1f', paper: '#ffffff', muted: '#6b6466', // heads, credits: 5.8:1
  crimson: '#9b1c31', // the one accent: cover, numbering, bubbles, marks (8.1:1 on white)
  blush: '#f3cdd4', tint: '#fbeff1', // type on the band, marks chips; the grid, the rubric box
  rule: '#b9aeb0' }; // answer lines and hairlines
// Hex and id: design slots and referenceColor read only the hex (gotcha: palette-skips-designs).
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
  levels: [{ level: 1, fontSize: pt(NUMBER) }, // 'arabic', '.' (gotcha: numbering-vocabularies)
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
  // Tint fills leave hairline seams between cells on a canvas: grid rules in the tint hide them.
  { ...form, id: 'grid', rules: 'grid', borderColor: col('tint'), bodyBackgroundEnabled: true,
    bodyBackground: col('tint'), bodyFontSize: pt(11.5), cellPadding: mm(1.4) }];
const cell = (content, extra) => ({ content, align: 'center', verticalAlign: 'middle', ...extra });
// The MARK cell sets the row's depth: three lines, the blank one a U+2060 word joiner, since a
// cell line that is empty or holds only a no-break space is dropped (gotcha: cell-blank-line).
const candidate = table('candidate', 'candidate', { columnWidths: [4.2, 1.2, 2, 1.3], rows: [[
  ...t({ en: ['NAME', 'CLASS', 'CANDIDATE NUMBER'], es: ['NOMBRE Y APELLIDOS', 'GRUPO',
    'N.º DE EXAMEN'] }).map((l) => cell(`**${l}**`, { align: 'left', verticalAlign: 'top' })),
  cell(`**${t({ en: 'MARK', es: 'NOTA' })}**\n\u2060\n**/ ${t({ en: '25', es: '10' })}**`,
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
// span 'page': an opener page, and the band paints above the column (a design in it is clipped).
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

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  locale: t({ en: 'en-us', es: 'es' }), // exact codes only (gotcha: hyphenation-locales)
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
// The digits are Inter Tight 800 outlines (SIL OFL), 102.4 units to the em, cap height 74.5,
// on a baseline at 0: an SVG drawn as an image cannot use web fonts (gotcha: svg-no-webfonts).
const YEAR_OUTLINE = 'M38.2-74.5V0H20.2V-57.7H19.8L3.1-47.5V-63.1L21.5-74.5ZM75.8 1Q67.1 1 60.3-1.8'
  + 'Q53.6-4.5 49.7-9.3Q45.8-14.1 45.8-20.1Q45.8-24.8 48-28.6Q50.2-32.5 54-35'
  + 'Q57.8-37.6 62.5-38.4V-38.9Q56.4-40.1 52.4-44.7Q48.5-49.2 48.5-55.4Q48.5-61.2 52-65.7'
  + 'Q55.6-70.2 61.8-72.9Q68-75.5 75.8-75.5Q83.7-75.5 89.9-72.9Q96.1-70.2 99.7-65.7'
  + 'Q103.2-61.2 103.2-55.4Q103.2-49.2 99.2-44.6Q95.2-40.1 89.2-38.9V-38.4'
  + 'Q93.8-37.6 97.6-35Q101.4-32.5 103.7-28.6Q105.9-24.8 105.9-20.1Q105.9-14.1 102-9.3'
  + 'Q98.2-4.5 91.4-1.8Q84.6 1 75.8 1ZM75.8-11.7Q79.2-11.7 81.7-13Q84.2-14.2 85.6-16.5'
  + 'Q87-18.8 87-21.7Q87-24.5 85.6-26.8Q84.1-29 81.6-30.3Q79.1-31.6 75.8-31.6'
  + 'Q72.6-31.6 70.1-30.3Q67.6-29 66.1-26.8Q64.7-24.6 64.7-21.7Q64.7-18.8 66.1-16.5'
  + 'Q67.5-14.3 70-13Q72.6-11.7 75.8-11.7ZM75.8-44.3Q78.7-44.3 80.9-45.5'
  + 'Q83.1-46.6 84.3-48.7Q85.6-50.8 85.6-53.4Q85.6-56 84.3-58Q83.1-60 80.9-61.1'
  + 'Q78.7-62.2 75.8-62.2Q73-62.2 70.8-61.1Q68.6-60 67.3-58Q66.1-56 66.1-53.4'
  + 'Q66.1-50.8 67.3-48.7Q68.6-46.7 70.8-45.5Q73-44.3 75.8-44.3ZM143.7 1Q137.6 1 132-1'
  + 'Q126.4-3 122.1-7.3Q117.7-11.7 115.2-18.7Q112.7-25.8 112.7-36Q112.7-45.2 114.9-52.5'
  + 'Q117.1-59.8 121.2-65Q125.4-70.1 131.1-72.8Q136.9-75.5 144-75.5Q151.9-75.5 157.8-72.5'
  + 'Q163.8-69.4 167.4-64.3Q171-59.2 171.7-53H154Q153.2-56.5 150.5-58.3Q147.8-60.2 144-60.2'
  + 'Q137.2-60.2 133.8-54.2Q130.5-48.4 130.5-38.4H130.9Q132.5-41.8 135.3-44.2'
  + 'Q138.2-46.6 141.9-47.8Q145.7-49.1 149.8-49.1Q156.5-49.1 161.6-46Q166.7-43 169.6-37.6'
  + 'Q172.5-32.2 172.5-25.3Q172.5-17.5 168.9-11.6Q165.2-5.7 158.7-2.3Q152.2 1 143.7 1Z'
  + 'M143.6-12.9Q146.9-12.9 149.5-14.4Q152.1-16 153.6-18.7Q155.1-21.4 155.1-24.7'
  + 'Q155.1-28.1 153.6-30.8Q152.1-33.5 149.5-35Q147-36.6 143.6-36.6Q140.4-36.6 137.7-35'
  + 'Q135.1-33.4 133.6-30.7Q132.1-28.1 132.1-24.7Q132.1-21.4 133.6-18.7Q135.1-16 137.7-14.4'
  + 'Q140.3-12.9 143.6-12.9ZM208.3 1Q199.8 1 193.2-1.9Q186.6-4.8 182.8-10'
  + 'Q179.1-15.2 179-21.9H197.1Q197.2-19.5 198.6-17.6Q200.1-15.7 202.7-14.7'
  + 'Q205.2-13.7 208.4-13.7Q211.6-13.7 214-14.8Q216.5-15.9 217.8-17.9Q219.2-19.9 219.2-22.5'
  + 'Q219.2-25.2 217.7-27.2Q216.2-29.2 213.4-30.4Q210.7-31.5 206.9-31.5H199.6V-44.3H206.9'
  + 'Q210.2-44.3 212.7-45.4Q215.2-46.5 216.6-48.5Q218-50.5 218-53Q218-55.6 216.8-57.4'
  + 'Q215.6-59.3 213.5-60.4Q211.3-61.5 208.4-61.5Q205.4-61.5 203-60.4Q200.6-59.3 199.2-57.4'
  + 'Q197.8-55.5 197.7-53H180.5Q180.5-59.6 184.2-64.7Q187.8-69.8 194.1-72.6'
  + 'Q200.4-75.5 208.5-75.5Q216.5-75.5 222.5-72.7Q228.6-69.9 232-65.1Q235.4-60.2 235.4-54.2'
  + 'Q235.4-48 231.3-43.9Q227.2-39.8 220.7-38.8V-38.2Q229.3-37.2 233.7-32.6'
  + 'Q238.1-28.1 238.1-21.2Q238.1-14.7 234.3-9.7Q230.5-4.7 223.7-1.8Q217 1 208.3 1Z';
function year() { // 10 units to the millimetre
  const [w, h] = [PAGE.w * 10, (YEAR.cap - YEAR.cut + YEAR.pad) * 10];
  const s = (YEAR.cap * 10) / 74.5; // scale: cap height to YEAR.cap
  const x = LEFT * 10 - 3.1 * s; // the 1's flag starts 3.1 units in: line it up with the text
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} `
    + `${h}"><path transform="translate(${x.toFixed(1)} ${(YEAR.cap + YEAR.pad) * 10}) `
    + `scale(${s.toFixed(4)})" d="${YEAR_OUTLINE}" fill="none" stroke="${palette.paper}" `
    + `stroke-width="${(8.5 / s).toFixed(3)}" stroke-linejoin="round"/></svg>`; // 0.85 mm
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
const FONTS = { 'PT Serif': ['400', '400i', '700', '700i'], // (gotcha: fonts-first)
  'Inter Tight': ['400', '600', '700', '800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all([loadFonts(FONTS, markdown), loadSvg('year.svg', year())]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'History Paper 2', es: 'Historia, prueba 2' }) });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
