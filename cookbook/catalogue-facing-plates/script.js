// ═══ Postext Cookbook · Nº 034 · Catalogue entries facing their plates ══════════════
// https://postext.dev/en/cookbook/catalogue-facing-plates
// Code: MIT · Text: original (CC BY 4.0), Ormsby 1885 (PD) · Plates: Doré and Pisan, 1863 (PD)
// Fonts: Ibarra Real Nova, Libre Bodoni, Sofia Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage }
  from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'catalogue-facing-plates';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1b1918', paper: '#faf7f1', night: '#2a2724', // text; the page and plates; the cover
  sepia: '#8a6a45', gilt: '#c9ad86', // the accent on paper (4.6:1) and on the night (6.9:1)
  rule: '#cfc6b8', muted: '#6c665e', // hairlines; tombstones, credit lines, folios
};
// A linked colour carries its hex too: postext 1.4.1 reads the hex, not the palette, in design
// slots and referenceColor (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'sepia (defaults)', value: { hex: palette.sepia, model: 'hex' } },
];
const [TEXT, DISPLAY, LABEL] = ['Ibarra Real Nova', 'Libre Bodoni', 'Sofia Sans Condensed'];
const PT = 25.4 / 72; // mm per point
const [SIZE, LEAD, LINES] = [11.5, 16, 41]; // body pt, leading pt; 41 lines make the text block
const TRIM = { w: 230, h: 280 }; // mm: a catalogue trim
const [TOP, INNER, OUTER] = [24, 20, 18]; // margins, mm
const BLOCK_W = TRIM.w - INNER - OUTER; // 192 mm: the text block, and the widest plate
const BLOCK_H = LINES * LEAD * PT; // 231.4 mm
const [SIDE_PC, GUTTER] = [34, 7]; // the outer column: 65.3 mm for numeral and tombstone; mm
const SIDE = (BLOCK_W * SIDE_PC) / 100;
const MAIN_X = SIDE + GUTTER; // mm from the block's outer edge to the text column
const MAIN = BLOCK_W - MAIN_X; // 119.7 mm: the measure, about 71 characters

// #region answer: a Plate type that floats to the head of the facing recto, sized to fill it
// Each entry breaks to a verso and cites its plate in the commentary's first sentence; a 'top'
// float never lands on its citing page (gotcha: top-float-next-page), so it opens the recto.
const entryLevel = () => ({
  level: 1, span: 'page', numberingTemplate: '{1}', // {number} in the opener: Cat. 1, 2, 3
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  breakBefore: { enabled: true, parity: 'even' },
  marginBottom: pt(LEAD), advancedDesign: entryOpener(),
});
const plateType = {
  id: 'plate', name: 'Cat.', shortLabel: 'Cat.', captionPrefix: 'Cat.', // 'Cat. 1. …'
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
  defaultPlacement: { position: 'top', span: 'page', align: 'center' },
};
// Under the plate (pt): a caption and a credit line at the body's leading ratio, and their gaps.
const CAPTION = { size: 8.5, gap: 6, note: 7.2, noteGap: 1.5 };
const UNDER = (CAPTION.size + CAPTION.note) * (LEAD / SIZE) + CAPTION.gap + CAPTION.noteGap;
const PLATE_H = (LINES * LEAD - UNDER) * PT; // 221.1 mm: the rest of the text block
// A float is not shrunk to fit the room left on its page (gap: float-shrink); fitFiguresToPage
// sets the smaller picture flush left. A width fraction narrows the float, and 'center' centres it.
const plate = ({ id, file, caption, altText }, [pxW, pxH]) => ({
  id, typeId: 'plate', kind: 'bitmap', caption, note: CREDIT, altText,
  // The print master's pixels, about 275 dpi at this size (gotcha: bitmap-print-size).
  bitmap: { fileId: file, format: 'jpeg', width: pxW, height: pxH },
  placement: { width: Math.min(1, ((pxW / pxH) * PLATE_H) / BLOCK_W) }, createdAt: 0, updatedAt: 0,
});
// #endregion
const MASTER_PX = { library: [1900, 2400], vigil: [1921, 2400], windmills: [1923, 2400] };
const CREDIT = 'Public domain; scan from Wikimedia Commons.'; // the artists are in the tombstone
// A picture drawn only in a design slot or a table cell: registered, never cited or numbered.
function picture(id, image, altText) {
  registerResourceImage(`${id}.jpg`, image);
  return { id, typeId: 'plate', kind: 'bitmap', altText, createdAt: 0, updatedAt: 0,
    bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: image.width, height: image.height } };
}

// Design-slot shorthands; text wraps instead of ending in '…' (gotcha: overflow-ellipsis-default).
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width !== undefined && { size: { width: width === 'fill' ? 'fill' : mm(width) } }) });
const text = (id, content, fontFamily, size, color, placement, more = {}) => ({ kind: 'text',
  id, content, fontFamily, fontSize: pt(size), color: col(color), align: 'left',
  overflow: 'wrap', placement, ...more });
const caps = (size) => ({ fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: pt(size * 0.2) });

// #region opener: the entry's head, a numeral and tombstone beside the title and the lead
const [KICKER, NUMERAL] = [8.5, { size: 80, y: 7 }]; // pt: labels; the numeral, y in mm
const TITLE = { size: 30, lineHeight: 1.08 }; // pt (gotcha: design-lineheight-multiple)
const HEAD_RULE = NUMERAL.y + NUMERAL.size * PT + 3; // mm: the hairline under the numeral
const LEAD_Y = HEAD_RULE + 5; // mm: the lead paragraph, with the tombstone beside it
const [LEADIN, TOMB] = [{ size: 13.5, lead: 19 }, { size: 8.5, lead: 12.5 }]; // pt
const LEAD_LINES = 5; // the longest lead: shorter ones keep the commentary on the same line
const BASE = 0.8; // 1.4.1 sets a design text's first baseline 0.8 down its line box
// em: cap heights, and Libre Bodoni's figures, which stop short of its capitals ('1': 0.716)
const [CAP_HEIGHT, FIGURE_HEIGHT] = [{ [TEXT]: 0.673, [DISPLAY]: 0.754 }, 0.716];
const inkTop = (size, lineHeight, height) => (BASE * lineHeight - height) * size; // pt to the ink
// The title's capitals level with the numeral's figures: 1.2 mm below the numeral's top.
const TITLE_Y = NUMERAL.y + (inkTop(NUMERAL.size, 1, FIGURE_HEIGHT)
  - inkTop(TITLE.size, TITLE.lineHeight, CAP_HEIGHT[DISPLAY])) * PT;
// The initial's top on the first line's capitals, its foot on the third baseline.
const dropSize = (lines) => pt(((lines - 1) * LEADIN.lead + CAP_HEIGHT[TEXT] * LEADIN.size)
  / CAP_HEIGHT[DISPLAY]);
// Entries open on versos, whose outer column is on the left: the side column is at x = 0.
const head = (label, numeral) => [
  text('label', label, LABEL, KICKER, 'sepia', at('container', 'top-left', 0, 0), caps(KICKER)),
  text('numeral', numeral, DISPLAY, NUMERAL.size, 'sepia',
    at('container', 'top-left', 0, NUMERAL.y, SIDE), { lineHeight: 1 }),
  text('title', '{titleText}', DISPLAY, TITLE.size, 'ink', at('container', 'top-left', MAIN_X,
    TITLE_Y, MAIN), { italic: true, lineHeight: TITLE.lineHeight }),
  { kind: 'rule', id: 'head-rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    placement: at('container', 'top-left', 0, HEAD_RULE, 'fill') },
];
const entryOpener = () => ({ enabled: true, minHeight: mm(LEAD_Y + LEAD_LINES * LEADIN.lead * PT),
  slot: { elements: [...head('Cat.', '{number}'),
  text('chapter', '{attr.chapter}', LABEL, KICKER, 'sepia',
    at('container', 'top-left', MAIN_X, 0, MAIN), caps(KICKER)),
  // Baseline on the lead's; \n breaks only with a paragraphIndent (gotcha: design-text-newline).
  text('tombstone', '{attr.tombstone}', LABEL, TOMB.size, 'muted',
    at('container', 'top-left', 0, LEAD_Y + BASE * (LEADIN.lead - TOMB.lead) * PT, SIDE - 6),
    { lineHeight: TOMB.lead / TOMB.size, paragraphIndent: pt(0.01) }),
  // Drop caps exist only in design text, so the lead is an attribute (gotcha: design-text-ragged).
  text('lead', '{attr.lead}', TEXT, LEADIN.size, 'ink', at('container', 'top-left', MAIN_X,
    LEAD_Y, MAIN), { lineHeight: LEADIN.lead / LEADIN.size, dropCap: { lines: 3,
    fontFamily: DISPLAY, fontSize: dropSize(3), color: col('sepia'), gap: mm(1.6) } }),
] } });
// #endregion

// #region cover: a heading style on warm black, a framed detail of Cat. 3 and the name
const DETAIL = 'windmills-detail-540.jpg'; // a square cut from Cat. 3, at its size on screen
const FRAME = { w: 124, y: 40, pad: 3.5 }; // mm: the picture, its top, the hairline's inset
const FRAME_X = (TRIM.w - FRAME.w) / 2;
const NAME = { size: 88, track: 8, y: 176 }; // pt, pt, mm
const centred = (id, content, family, size, color, y, more, x = 0) => text(id, content, family,
  size, color, at('page', 'top', x, y, 'fill'), { align: 'center', ...more });
const coverStyle = () => ({
  id: 'cover', numbered: false, header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [ // painted in this order
    { kind: 'box', id: 'night', style: { backgroundColor: col('night') },
      placement: { ...at('bleed', 'top-left', 0, 0), size: { width: 'fill', height: 'fill' } } },
    { kind: 'box', id: 'frame', style: { borderColor: col('gilt'), borderWidth: pt(0.5) },
      placement: { ...at('page', 'top-left', FRAME_X - FRAME.pad, FRAME.y - FRAME.pad),
        size: { width: mm(FRAME.w + 2 * FRAME.pad), height: mm(FRAME.w + 2 * FRAME.pad) } } },
    { kind: 'image', id: 'detail', resourceId: 'cover-detail',
      placement: at('page', 'top-left', FRAME_X, FRAME.y, FRAME.w) },
    centred('kicker', '{attr.kicker}', LABEL, 8.5, 'gilt', 18, caps(8.5)),
    // 1.4.1 counts the tracking after the last letter as well, so the word moves right by half.
    centred('name', '{titleText}', DISPLAY, NAME.size, 'paper', NAME.y, { lineHeight: 1,
      textTransform: 'uppercase', letterSpacing: pt(NAME.track) }, (NAME.track / 2) * PT),
    centred('subtitle', '{attr.subtitle}', DISPLAY, 18, 'paper', NAME.y + NAME.size * PT + 4,
      { italic: true }),
    centred('foot', '{attr.foot}', LABEL, 8.5, 'gilt', 250, caps(8.5)),
  ] } },
});
// #endregion

// #region checklist: a table of the works with a thumbnail in each first cell
const THUMB_PX = 300; // px wide: 25 mm at 300 dpi, about the width the cell prints it
// The entries' head, label and numeral from attributes; the level gives span, break and margin.
const checklistStyle = () => ({ id: 'checklist', numbered: false,
  advancedDesign: { enabled: true, slot: { elements: head('{attr.kicker}', '{attr.range}') } } });
const cell = (content, more) => ({ content, verticalAlign: 'middle', ...more });
const checklist = (plates) => ({
  id: 'checklist', typeId: 'list', kind: 'table', placement: { position: 'here' },
  altText: 'Checklist of the three works with thumbnails, titles, chapters and pages.',
  table: { model: { headerRowCount: 1, columnWidths: [26, 9, 70, 11], rows: [
    ['', 'Cat.', 'Work and chapter', 'Page'].map((label, i) =>
      cell(label, { isHeader: true, align: i === 3 ? 'right' : 'left' })),
    ...plates.map((p, i) => [
      { content: '', image: { resourceId: `${p.id}-thumb` } },
      cell(String(i + 1)), cell(`*${p.caption}*. ${p.illustrates}`),
      cell(String(platePage(i + 1)), { align: 'right' }),
    ]),
  ] } },
  createdAt: 0, updatedAt: 0,
});
// The cover is page 1 and entry n opens page 2n, so its plate prints on page 2n + 1.
const platePage = (n) => 2 * n + 1;
const listType = { id: 'list', name: 'List', shortLabel: 'List', captionPrefix: '', // no caption
  numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' };
// #endregion

const foot = (id, content, parity, edge, x, more) => text(id, content, LABEL, 7.5, 'muted',
  at('page', edge, x, TRIM.h - 15), { ...caps(7.5), parity, ...more });
const footer = { elements: [ // folios at the outer foot; entries (versos) add the title
  foot('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, { color: col('ink') }),
  foot('verso-title', '{title}', 'even', 'top-left', OUTER + 9),
  foot('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER,
    { color: col('ink'), align: 'right' }),
] };

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, resourceTypes: [plateType, listType],
  // A bitmap is never set wider than its declared pixels at this dpi: at 150 dpi a 1,900-px
  // scan may reach 322 mm, so the width fraction decides (at 300 dpi it stops at 161 mm).
  page: { width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150, backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(TRIM.h - TOP - BLOCK_H), left: mm(INNER),
      right: mm(OUTER), mirror: true } },
  // Body text never enters the outer column: the openers draw in it and the plates span it.
  layout: { layoutType: 'oneAndHalf', sideColumnPercent: SIDE_PC, sideColumnRole: 'floats',
    sideColumnSide: 'outer', gutterWidth: mm(GUTTER) },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(SIZE), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('sepia'), referenceBold: false, // 'Cat. 1' in the accent, regular weight
    firstLineIndent: mm(4.5), indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.5,
    maxRuntTracking: 0, // gotcha: runt-tracking-unpainted
  },
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('ink'), levels: [entryLevel()] },
  headingStyles: [coverStyle(), checklistStyle()],
  captionStyle: { fontFamily: LABEL, fontSize: pt(CAPTION.size), gap: pt(CAPTION.gap),
    labelColor: col('sepia'), // the label is bold by default
    note: { fontSize: pt(CAPTION.note), gap: pt(CAPTION.noteGap), color: col('muted') } },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    cellPadding: mm(1.8), headerBackground: col('ink'), headerColor: col('paper'),
    headerFontFamily: LABEL, headerFontSize: pt(8), bodyFontFamily: TEXT, bodyFontSize: pt(9.5) },
  paragraphStyles: [{ id: 'colophon', fontFamily: LABEL, fontSize: pt(7.5), lineHeight: pt(11),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header: { elements: [] }, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// id, scan file, caption, the chapter it illustrates and alt text: one block per plate.
const plateTexts = /* @content:plates */ '';
const FIELDS = ['id', 'file', 'caption', 'illustrates', 'altText'];
const PLATES = plateTexts.trim().split(/\n\s*\n/).map((block) =>
  Object.fromEntries(block.split('\n').map((line, i) => [FIELDS[i], line.trim()])));

// #region art: the engravings printed on the page's paper
// Multiplying by the paper colour turns the scan's white into the page's cream.
function onPaper(source) {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, source.width, source.height);
  return canvas.transferToImageBitmap();
}
const resized = (scan, width) => createImageBitmap(scan,
  { resizeWidth: width, resizeQuality: 'high' });
// #endregion

// #region scans: the plates, their thumbnails and the cover's detail, fetched from assets/
// plate() sizes each plate from its master, the Commons scan at 2,400 px tall (MASTER_PX);
// the canvas draws the registered 835-px copy (the block's width on a 1,000-px page) in that box.
async function scan(file) {
  const res = await fetch(asset(file));
  if (!res.ok) throw new Error(`Scan not found (${res.status}): ${file}`);
  return createImageBitmap(await res.blob());
}
async function loadPlates() {
  const [detail, ...scans] = await Promise.all([DETAIL, ...PLATES.map((p) => p.file)].map(scan));
  const resources = [checklist(PLATES), picture('cover-detail', onPaper(detail),
    'Detail of Cat. 3: the knight and his horse caught on the sail.')];
  for (const [i, p] of PLATES.entries()) {
    registerResourceImage(p.file, onPaper(scans[i]));
    resources.push(plate(p, MASTER_PX[p.id]), // and a thumbnail: its own small file and size
      picture(`${p.id}-thumb`, onPaper(await resized(scans[i], THUMB_PX)), p.altText));
  }
  return resources;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Ibarra Real Nova': ['400', '400i'], // text, the lead, the checklist
  'Libre Bodoni': ['400', '400i'], // numerals, titles, drop caps, the cover
  'Sofia Sans Condensed': ['400', '600', '700'], // labels, tombstones, captions, folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const words = `${markdown}\n${plateTexts}\n${CREDIT}`; // their letters decide the font subsets
const [, resources] = await Promise.all([loadFonts(FONTS, words), loadPlates()]);
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), words);
// #region check: every page past an opener holds a plate, so each plate faces its entry
const astray = doc.pages.find((pg) => pg.role !== 'opener' && !pg.floats?.length);
if (astray) { // text run past its verso, or the blank page that follows it
  const error = new Error(`Page ${astray.pageLabel} holds no plate: shorten the entry before it.`);
  kitFail(error); // the viewer's bar says why
  throw error;
}
// #endregion
showPages(doc, { title: t({ en: 'Catalogue entries facing their plates' }) });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
