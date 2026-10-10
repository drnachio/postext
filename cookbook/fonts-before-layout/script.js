// ═══ Postext Cookbook · Nº 026 · Type specimen with every font loaded before layout ═════════
// https://postext.dev/en/cookbook/fonts-before-layout
// Code: MIT · Text: original (CC BY 4.0) · Picture: cut from the pen's own early and last builds
// Fonts: Ysabeau Office, Noto Serif Display, IBM Plex Mono (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, buildDocumentWithFonts, renderPageToCanvas, defaultResourceTypes,
  registerResourceImage } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'fonts-before-layout';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const PAGE = { width: 180, height: 240 }; // mm
const MARGIN = { top: 22, bottom: 24, inner: 20, outer: 48 }; // mm: inner is the spine side
const MEASURE = PAGE.width - MARGIN.inner - MARGIN.outer; // 112 mm: about 70 letters at 11 pt
const FIELD = 122; // mm from the top edge: the ultramarine field of the opener
const LEAD = 15.5; // pt: the body leading and the step of every vertical space
const DPI = 150; // the page's resolution: the proof on page 4 is cut at twice this
const [TEXT, DISPLAY, MONO] = ['Ysabeau Office', 'Noto Serif Display', 'IBM Plex Mono'];
const palette = { ink: '#16161a', ultramarine: '#3246d3', mist: '#c9d0f6', // mist: 4.6:1 on
  rule: '#cfc9bd', muted: '#6b6a70', paper: '#ffffff' }; // ultramarine, for labels on the field
// Every colour is linked to its palette entry; main-color catches any default left unstated.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = () => Object.entries({ ...palette, 'main-color': palette.ultramarine })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const label = { fontFamily: MONO, fontSize: pt(7.5), letterSpacing: pt(1.2),
  textTransform: 'uppercase' };
const display = { fontFamily: DISPLAY, fontWeight: 900, italic: true };

// #region type: the text face at 11 on 15.5 pt, and a waterfall of it on two leads a line
const bodyText = () => ({
  fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true }); // ragged and spaced
// Every waterfall size and pangram is two leads (31 pt) deep, on the text's 15.5 pt rhythm.
const line = (size) => ({ fontSize: pt(size), lineHeight: pt(2 * LEAD) });
const paragraphStyles = () => [
  ...[7, 8, 9, 10, 11, 12, 14].map((size) => ({ id: `s${size}`, ...line(size) })),
  { id: 'pangram', ...line(13) },
  { id: 'colophon', fontSize: pt(7), lineHeight: pt(10), fontFamily: MONO, color: col('muted') }];
// Size labels: boxless mono chips. A Plex Mono letter is 0.6 em wide, so a one-digit label gets
// half a letter each side and the samples start on one edge.
const tag = { fontFamily: MONO, fontSize: pt(7), color: col('ultramarine'),
  backgroundEnabled: false, borderWidth: pt(0), paddingX: pt(0), gap: mm(2.5) };
const chipStyles = () => [{ id: 'size', ...tag }, { id: 'size-1', ...tag, paddingX: em(0.3) }];
// #endregion

// #region opener: the H1 as a bleed field, the display face at 240 pt, labels naming the faces
const Y = { kicker: 14, glyphs: 17, label: FIELD - 12, title: FIELD + 10, // mm from the top edge
  end: FIELD + 42 }; // where the opener ends: under the title, the lead and a line of air
const ITALIC_FOOT = 5; // mm: the italic A's foot reaches this far left of the glyphs' origin
const at = (x, y, width) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(x), y: mm(y) }, ...(width && { size: { width: mm(width) } }) });
const text = (id, content, style, placement) => ({ kind: 'text', id, content, align: 'left',
  overflow: 'wrap', ...style, placement }); // a running head wraps too, never '…'
const cover = () => ({ level: 1, fontSize: pt(30), italic: true, // headings.levels[0]
  breakBefore: { enabled: true, parity: 'odd' }, // the cover is a recto
  span: 'page', // the heading is set across the page; its field hangs from the bleed
  advancedDesign: { enabled: true, minHeight: mm(Y.end - MARGIN.top), // from the top margin
    slot: { elements: [
      { kind: 'box', id: 'field', style: { backgroundColor: col('ultramarine') }, placement: {
        anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(FIELD) } } },
      text('kicker', '{attr.kicker}', { ...label, fontWeight: 700, color: col('paper') },
        at(MARGIN.inner, Y.kicker)),
      text('glyphs', '{attr.glyphs}', { ...display, fontSize: pt(240), lineHeight: 1,
        color: col('paper') }, at(MARGIN.inner + ITALIC_FOOT, Y.glyphs)),
      text('label', '{attr.label}', { ...label, color: col('mist') }, at(MARGIN.inner, Y.label)),
      text('faces', '{attr.faces}', { ...label, color: col('mist') },
        { anchor: { to: '#label', edge: 'below' }, offset: { y: mm(1.2) } }),
      text('title', '{titleText}', { ...display, fontSize: pt(30), lineHeight: 1.05,
        color: col('ink') }, at(MARGIN.inner, Y.title, PAGE.width - 2 * MARGIN.inner)),
      text('lead', '{attr.lead}', { fontFamily: TEXT, italic: true, fontSize: pt(12),
        lineHeight: 1.35, color: col('ink') }, { anchor: { to: '#title', edge: 'below' },
        offset: { y: mm(3) }, size: { width: mm(MEASURE) } }),
    ] } } });
// #endregion

// Running heads at the outer edge of the text; a drop folio there too on the opener (a recto).
const HEADS = { top: 13, bottom: 12 }; // mm from the top and the bottom edge of the page
const head = (id, content, parity, edge, x, pages = 'body') => text(id, content, { parity,
  pages, fontFamily: MONO, fontSize: pt(7.5), color: col('muted') }, { anchor: { to: 'page',
  edge }, offset: { x: mm(x), y: mm(edge.startsWith('top') ? HEADS.top : -HEADS.bottom) } });
const header = () => ({ elements: [
  head('verso', '{pageNumber} · {title}', 'even', 'top-left', MARGIN.outer),
  head('recto', '{chapterTitle} · {pageNumber}', 'odd', 'top-right', -MARGIN.outer)] });
const footer = () => ({ elements: [
  head('drop-folio', '{pageNumber}', 'all', 'bottom-right', -MARGIN.outer, 'opener')] });

const config = () => ({
  // "Table 1", not "Table 1.1": the booklet has one chapter. Table captions sit above.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  colorPalette: colorPalette(), layout: { layoutType: 'single' },
  page: { width: mm(PAGE.width), height: mm(PAGE.height), dpi: DPI,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  bodyText: { ...bodyText(), paragraphContainerSpacing: 'add' }, // samples stay two leads apart
  paragraphStyles: paragraphStyles(), chipStyles: chipStyles(),
  headings: { fontFamily: DISPLAY, fontWeight: 900, color: col('ink'), levels: [cover(),
    { level: 2, fontSize: pt(16), lineHeight: pt(2 * LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) }] },
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackground: col('ultramarine'), headerColor: col('paper'), headerFontFamily: MONO,
    headerFontSize: pt(7.5), bodyFontFamily: MONO, bodyFontSize: pt(7.5), cellPadding: mm(1) },
  captionStyle: { fontFamily: MONO, fontSize: pt(7.5), labelColor: col('ultramarine'),
    note: { color: col('muted') } },
  header: header(), footer: footer(),
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The table and the picture come from the builds themselves (section 4).
let audit = { rows: [], note: '' };
const content = () => ({ markdown, resources: resources() }); // read again for each build
const here = { position: 'here' }; // both sit where ::resource puts them
const resources = () => [
  { id: 'faces', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: here,
    caption: 'Every face this booklet declares: whether Postext found it set in the pages, and '
      + 'the files the browser fetched for it.', note: audit.note,
    table: { model: { headerRowCount: 1, columnWidths: [31, 19, 28, 34], rows: [
      ['Family', 'Face', 'In the pages', 'Files fetched']
        .map((cell) => ({ content: cell, isHeader: true })),
      ...audit.rows] } } },
  proofFigure(), // drawn from the builds just below
];

// #region art-proof: page 1's first paragraph from the early build, over the same from the last
const STRIP = { lines: 8, overrun: 10 }; // page 1's first paragraph; mm shown past the measure
const PROOF = { // px: two strips a lead apart, cut at 300 dpi
  width: Math.round(((MEASURE + STRIP.overrun) / 25.4) * 2 * DPI),
  height: Math.round((((2 * STRIP.lines + 1) * LEAD) / 72) * 2 * DPI) };
const proof = { moved: 0, total: 0, faces: 0 }; // lines the early build broke elsewhere, of all
const fallbacksIn = (doc) => // a build lists each face its font set could not give
  (doc.contentWarnings ?? []).filter((w) => w.kind === 'fontFallback').length;
const proofFigure = () => ({ id: 'proof', typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, placement: here,
  bitmap: { fileId: 'proof.png', format: 'png', width: PROOF.width, height: PROOF.height },
  caption: 'The first paragraph of page 1 as the early build set it, measured before the fonts '
    + 'had arrived (above), and as the last build set it (below). The early build broke '
    + `${proof.moved} of its ${proof.total} lines of text elsewhere, and its own warnings name `
    + `${proof.faces} faces set in a fallback. The rule marks the measure.`,
  altText: `Two strips of the same ${STRIP.lines} lines of text. In the upper strip the lines `
    + 'break in other places and some run past a vertical rule; in the lower one every line '
    + 'stops short of it.' });
function drawProof(first, last) {
  const linesOf = (doc) => doc.blocks.filter((b) => b.type === 'paragraph')
    .map((b) => b.lines.map((l) => l.text));
  const [before, after] = [first, last].map(linesOf);
  proof.total = before.flat().length;
  proof.faces = fallbacksIn(first);
  proof.moved = before.flatMap((lines, i) => lines.filter((t, j) => t !== after[i]?.[j])).length;
  const canvas = Object.assign(document.createElement('canvas'), PROOF);
  const ctx = canvas.getContext('2d');
  const strip = (PROOF.height * STRIP.lines) / (2 * STRIP.lines + 1);
  const edge = Math.round((PROOF.width * MEASURE) / (MEASURE + STRIP.overrun));
  // The renderer clips each column 2 pt past its edge, which would cut the early build's lines
  // at the measure: paint a copy of page 1 whose column reaches across the whole strip.
  const wide = (column) => ({ ...column,
    bbox: { ...column.bbox, width: column.bbox.width + (STRIP.overrun / 25.4) * DPI } });
  [first, last].forEach((doc, i) => {
    const page = document.createElement('canvas');
    renderPageToCanvas({ ...doc.pages[0], columns: doc.pages[0].columns.map(wide) }, doc, page,
      { scale: 2 }); // 300 dpi
    const { x, y } = doc.pages[0].columns[0].blocks.find((b) => b.type === 'paragraph').bbox;
    ctx.drawImage(page, 2 * x, 2 * y, PROOF.width, strip,
      0, i * (PROOF.height - strip), PROOF.width, strip);
  });
  ctx.fillStyle = `${palette.ultramarine}1f`; // a pale wash over the margin past the measure
  ctx.fillRect(edge, 0, PROOF.width - edge, PROOF.height);
  ctx.fillStyle = palette.ultramarine; // a hairline at the measure, and each strip's name
  ctx.fillRect(edge, 0, 2, PROOF.height);
  ctx.font = `700 ${(7 / 72) * 2 * DPI}px "IBM Plex Mono"`; // 7 pt, loaded by now
  ['early', 'last'].forEach((name, i) => // on the last line of each strip
    ctx.fillText(name, edge + 12, (i ? PROOF.height : strip) - 16));
  registerResourceImage('proof.png', canvas);
}
// #endregion

const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design may ask for (page 3 lists them), each declared from two files.
const FONTS = {
  'Ysabeau Office': ['400', '400i', '700', '700i'], // text, waterfall, pangrams, lead
  'Noto Serif Display': ['900', '900i'], // the glyphs, the title, the subheads
  'IBM Plex Mono': ['400', '400i', '700', '700i'], // labels, chips, the table, captions
};
const facesOf = (fonts) => Object.entries(fonts).flatMap(([family, specs]) => specs.map((spec) =>
  ({ family, weight: parseInt(spec, 10), style: spec.endsWith('i') ? 'italic' : 'normal' })));

// #region declare: one FontFace per file, as a stylesheet has one @font-face rule per file
const SUBSETS = { // the characters each file covers, copied from the family's @font-face CSS
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
    + 'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,'
    + 'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,'
    + 'U+A720-A7FF' };
const FILES = new Map(); // FontFace → the subset its file covers, for the audit
function declareFaces(fonts) { // Fontsource's static files stand in for your own /fonts/ folder
  for (const { family, weight, style } of facesOf(fonts)) {
    const id = family.toLowerCase().replaceAll(' ', '-');
    for (const [subset, unicodeRange] of Object.entries(SUBSETS)) {
      const file = `${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
      // Adding a face fetches nothing: the file downloads when a load or a line needs it.
      const face = new FontFace(family, `url(https://cdn.jsdelivr.net/npm/@fontsource/${file})`,
        { weight: `${weight}`, style, unicodeRange });
      FILES.set(face, subset);
      document.fonts.add(face);
    }
  }
}
// #endregion

// #region audit: page 3's table: every face declared or set, the report's word, its files
const SET = { loaded: 'yes', synthesized: 'faked', missing: 'in a fallback' }; // the report
const nameOf = (f) => `${f.family.replaceAll('"', '')} ${f.weight} ${f.style}`; // or a FontFace
function auditOf(doc, report) {
  const found = Object.keys(SET).flatMap((kind) => report[kind].map((f) => [nameOf(f), kind]));
  const inPages = new Map(found);
  const loaded = [...FILES].filter(([face]) => face.status === 'loaded');
  const faces = new Map([...facesOf(FONTS), ...Object.keys(SET).flatMap((kind) => report[kind])]
    .map((f) => [nameOf(f), f])); // the declared faces, then any the pages set without a file
  const rows = [...faces].map(([name, f], i, all) => [
    i && all[i - 1][1].family === f.family ? '' : f.family, // each family named once
    `${f.weight}${f.style === 'italic' ? ' italic' : ''}`, SET[inPages.get(name)] ?? 'no',
    loaded.filter(([face]) => nameOf(face) === name).map(([, subset]) => subset).join(' · ')
      || 'none'].map((cell) => ({ content: cell })));
  // What else to read in a finished layout: its content warnings, its passes, its warnings.
  return { rows, note: `${report.loaded.length} of ${rows.length} faces set in the pages · `
    + `${loaded.length} of ${FILES.size} files fetched · fontFallback warnings: `
    + `${fallbacksIn(doc) || 'none'} · ${doc.converged ? '' : 'not '}converged · layout warnings: `
    + `${doc.warnings?.length || 'none'}` };
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region answer: one call loads every face the config and the text ask for, then builds
// buildDocumentWithFonts starts with prepareFonts: it reads the config and the text for every
// face they ask for (text, headings, chips, table, captions, opener, running heads), in each
// weight and slant, and loads them for the characters the document sets. The page declares its
// files (declareFaces), so they load through document.fonts; a face nothing declares would be
// asked of a resolve(family, weight, style) option. Then it builds, reads the faces the pages
// are set in, loads any that the config did not name and builds again.
let report; // { loaded, missing, synthesized }: lists of { family, weight, style }
const build = () => buildDocumentWithFonts(content(), config(),
  { onFonts: (found) => { report = found; } }); // what the last look at the pages found

kitStatus('Loading fonts…'); // the kit's bar: it also reports any error thrown below
const early = buildDocument(content(), config()); // on purpose: the page has no font yet (page 4)
declareFaces(FONTS);
const fitted = await build(); // every face loaded before a line is measured
audit = auditOf(fitted, report); // page 3's table
drawProof(early, fitted); // page 4's picture
const doc = await build(); // nothing left to load: the same pages, table and picture filled in
showPages(doc, { title: 'Load every font before layout' });
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
