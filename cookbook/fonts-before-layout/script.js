// ═══ Postext Cookbook · Nº 026 · Type specimen with every font loaded before layout ═════════
// https://postext.dev/en/cookbook/fonts-before-layout
// Code: MIT · Text: original (CC BY 4.0) · Picture: cut from the pen's own first and last builds
// Fonts: Ysabeau Office, Noto Serif Display, IBM Plex Mono (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import { buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes,
  registerResourceImage } from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'fonts-before-layout';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const PAGE = { width: 180, height: 240 }; // mm
const MARGIN = { top: 22, bottom: 24, inner: 20, outer: 48 }; // mm: inner is the spine side
const MEASURE = PAGE.width - MARGIN.inner - MARGIN.outer; // 112 mm: about 70 letters at 11 pt
const FIELD = 122; // mm from the top edge: the ultramarine field of the opener
const LEAD = 15.5; // pt: the body leading and the step of every vertical space
const DPI = 150; // font strings carry px at this resolution; the audit turns them back into pt
const [TEXT, DISPLAY, MONO] = ['Ysabeau Office', 'Noto Serif Display', 'IBM Plex Mono'];
const palette = { ink: '#16161a', ultramarine: '#3246d3', mist: '#c9d0f6', // mist: 4.6:1 on
  rule: '#cfc9bd', muted: '#6b6a70', paper: '#ffffff' }; // ultramarine, for labels on the field
// Every colour keeps its palette id beside its hex, because 1.4.1 paints design slots from the
// hex (gotcha: palette-skips-designs); main-color catches any default left unstated.
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = () => Object.entries({ ...palette, 'main-color': palette.ultramarine })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const label = { fontFamily: MONO, fontSize: pt(7.5), letterSpacing: pt(1.2),
  textTransform: 'uppercase' };
const display = { fontFamily: DISPLAY, fontWeight: 900, italic: true };

// #region type: the text face at 11 on 15.5 pt, and a waterfall of it on two leads a line
const bodyText = () => ({ // one family name, never a CSS stack (gotcha: font-family-one-name)
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
  overflow: 'wrap', ...style, placement }); // design text wraps instead of ending in an ellipsis
const cover = () => ({ level: 1, fontSize: pt(30), italic: true, // headings.levels[0]
  breakBefore: { enabled: true, parity: 'odd' }, // restated (gotcha: headings-drop-h1-break)
  span: 'page', // lets the field reach the top edge: in the column it stops at the top margin
  advancedDesign: { enabled: true, minHeight: mm(Y.end - MARGIN.top), // from the top margin
    slot: { elements: [
      { kind: 'box', id: 'field', style: { backgroundColor: col('ultramarine') }, placement: {
        anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(FIELD) } } },
      text('kicker', '{attr.kicker}', { ...label, fontWeight: 700, color: col('paper') },
        at(MARGIN.inner, Y.kicker)),
      // lineHeight multiplies the size (gotcha: design-lineheight-multiple)
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

const config = () => ({ // a new object per build (gotcha: config-cache-identity)
  // "Table 1", not "Table 1.1": the booklet has one chapter. Table captions sit above.
  resourceTypes: defaultResourceTypes(LANG).map((type) => ({ ...type, numberingTemplate: '{n}',
    ...(type.id === 'table' && { captionStyle: { position: 'above' } }) })),
  colorPalette: colorPalette(), layout: { layoutType: 'single' },
  page: { width: mm(PAGE.width), height: mm(PAGE.height), dpi: DPI,
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } },
  bodyText: bodyText(), paragraphStyles: paragraphStyles(), chipStyles: chipStyles(),
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
const here = { position: 'here' }; // both sit where ::resource puts them
const resources = () => [
  { id: 'faces', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, placement: here,
    caption: 'Faces this document asked for, read from its own layout.', note: audit.note,
    table: { model: { headerRowCount: 1, columnWidths: [3, 2, 5], rows: [
      ['Family', 'Face', 'Sizes (pt)'].map((content) => ({ content, isHeader: true })),
      ...audit.rows] } } },
  proofFigure(), // drawn from the builds just below
];

// #region art-proof: page 1's first paragraph from the first build, over the same from the last
const STRIP = { lines: 8, overrun: 10 }; // page 1's first paragraph; mm shown past the measure
const PROOF = { // px: two strips a lead apart, cut at 300 dpi
  width: Math.round(((MEASURE + STRIP.overrun) / 25.4) * 2 * DPI),
  height: Math.round((((2 * STRIP.lines + 1) * LEAD) / 72) * 2 * DPI) };
const proof = { moved: 0, total: 0 }; // lines of text the first build broke elsewhere, of all
const proofFigure = () => ({ id: 'proof', typeId: 'figure', kind: 'bitmap', createdAt: 0,
  updatedAt: 0, placement: here,
  bitmap: { fileId: 'proof.png', format: 'png', width: PROOF.width, height: PROOF.height },
  caption: 'The first paragraph of page 1 as the first build set it, measured before the fonts '
    + 'had arrived (above), and as the last build set it (below). The first build broke '
    + `${proof.moved} of its ${proof.total} lines of text elsewhere. The rule marks the measure.`,
  altText: `Two strips of the same ${STRIP.lines} lines of text. In the upper strip the lines `
    + 'break in other places and some run past a vertical rule; in the lower one every line '
    + 'stops short of it.' });
function drawProof(first, last) {
  const linesOf = (doc) => doc.blocks.filter((b) => b.type === 'paragraph')
    .map((b) => b.lines.map((l) => l.text));
  const [before, after] = [first, last].map(linesOf);
  proof.total = before.flat().length;
  proof.moved = before.flatMap((lines, i) => lines.filter((t, j) => t !== after[i]?.[j])).length;
  const canvas = Object.assign(document.createElement('canvas'), PROOF);
  const ctx = canvas.getContext('2d');
  const strip = (PROOF.height * STRIP.lines) / (2 * STRIP.lines + 1);
  const edge = Math.round((PROOF.width * MEASURE) / (MEASURE + STRIP.overrun));
  // The renderer clips each column 2 pt past its edge, which would cut the first build's lines
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
  ['first', 'last'].forEach((name, i) => // on the last line of each strip
    ctx.fillText(name, edge + 12, (i ? PROOF.height : strip) - 16));
  registerResourceImage('proof.png', canvas);
}
// #endregion

const markdown = /* @content */ ''; // content.<lang>.md: every frontmatter value is quoted

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the layout asks for (page 3 lists them), each declared from two files.
const FONTS = {
  'Ysabeau Office': ['400', '400i', '700', '700i'], // text, waterfall, pangrams, lead
  'Noto Serif Display': ['900', '900i'], // the glyphs, the title, the subheads
  'IBM Plex Mono': ['400', '400i', '700', '700i'], // labels, chips, the table, captions
};

// #region declare: one FontFace per file, as a stylesheet has one @font-face rule per file
const SUBSETS = { // the characters each file covers, copied from the family's @font-face CSS
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
    + 'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,'
    + 'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,'
    + 'U+A720-A7FF' };
function declareFaces(fonts) { // Fontsource's static files stand in for your own /fonts/ folder
  for (const [family, specs] of Object.entries(fonts)) {
    const id = family.toLowerCase().replaceAll(' ', '-');
    for (const spec of specs) {
      const [weight, style] = [spec.slice(0, 3), spec.endsWith('i') ? 'italic' : 'normal'];
      for (const [subset, unicodeRange] of Object.entries(SUBSETS)) {
        const file = `${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
        // Adding a face fetches nothing: the file downloads when a load or a line needs it.
        const url = `https://cdn.jsdelivr.net/npm/@fontsource/${file}`;
        document.fonts.add(new FontFace(family, `url(${url})`, { weight, style, unicodeRange }));
      }
    }
  }
}
// #endregion

// #region answer: build, collect every font the layout asked for, load it, clear, build again
// Every block, table, caption, chip, opener and running head keeps the font string it is set in
// (fontString, headerFontString…) and those of the bold and italics it may use (boldFontString…).
function fontStringsIn(doc) {
  const found = new Map(); // font string → true when something is set in it
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value !== 'string' || !/fontString$/i.test(key)) walk(value);
      else found.set(value, found.get(value) || !/(bold|italic)FontString$/i.test(key));
    }
  };
  walk(doc.pages); walk(doc.blocks); // not doc.config: it is large and holds no font strings
  return found;
}
function faceOf(font) { // 'italic 700 22.9px "Source Serif 4"' → { family, weight, style, px }
  const [, italic, weight = '400', px, family] = /^(italic )?(\d+ )?([\d.]+)px (.+)$/.exec(font);
  return { family: family.replaceAll('"', ''), weight: weight.trim(), px: Number(px),
    style: italic ? 'italic' : 'normal' };
}
const nameOf = (face) => `${face.family} ${face.weight} ${face.style}`; // a FontFace works too
async function buildWithLoadedFonts(build, sample) { // → every build, first to last
  const builds = [];
  while (builds.length < 4) {
    builds.push(build()); // the first one measures with whatever faces the browser has
    // fonts.check() says yes to an undeclared family and to a face it can fake, so each face that
    // something is set in needs a FontFace of its own; a bold or italic that is only named loads
    // if declared (a family with no italic has none). load() fetches the files the sample needs.
    const declared = new Set([...document.fonts].map(nameOf)), missing = new Set(), pending = [];
    for (const [font, set] of fontStringsIn(builds.at(-1))) {
      const name = nameOf(faceOf(font));
      if (!declared.has(name)) { if (set) missing.add(name); }
      else if (!document.fonts.check(font, sample)) pending.push(font);
    }
    if (missing.size) throw new Error(`No FontFace for ${[...missing].join(', ')}`);
    if (!pending.length) return builds;
    await Promise.all(pending.map((font) => document.fonts.load(font, sample)));
    clearMeasurementCache(); // the widths measured with a fallback stay cached until cleared
  }
  throw new Error(`The fonts had not settled after ${builds.length} builds.`);
}
// #endregion

// #region audit: page 3's table, one row per face the walk found, with every size it set
function auditOf(builds) {
  const doc = builds.at(-1), faces = new Map(), declared = new Set([...document.fonts].map(nameOf));
  for (const face of [...fontStringsIn(doc).keys()].map(faceOf)) {
    const name = `${face.weight}${face.style === 'italic' ? ' italic' : ''}`; // '400 italic'
    const key = `${Object.keys(FONTS).indexOf(face.family)} ${name}`; // FONTS order, upright first
    // A face with no file is only named, never set: the browser fakes it if a line asks for it.
    if (!faces.has(key)) faces.set(key, { family: face.family, sizes: new Set(),
      face: declared.has(nameOf(face)) ? name : `${name} · no file` });
    faces.get(key).sizes.add(Math.round((face.px * 72 * 10) / DPI) / 10); // px back to pt
  }
  const rows = [...faces].sort(([a], [b]) => a.localeCompare(b)).map(([, f], i, all) => [
    i && all[i - 1][1].family === f.family ? '' : f.family, // each family named once
    f.face, [...f.sizes].sort((a, b) => a - b).join(' · ')].map((content) => ({ content })));
  const files = [...document.fonts].filter((face) => face.status === 'loaded').length;
  const warnings = doc.warnings?.length || 'no'; // what else to read in a finished layout
  return { rows, note: `Build ${builds.length}: ${rows.length} faces · ${files} files loaded · `
    + `${doc.converged ? 'converged' : 'not converged'} · ${warnings} layout warnings` };
}
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: declare the files, build until the fonts settle, audit, build the last time
kitStatus('Loading fonts…'); // the kit's bar: it also reports any error thrown below
declareFaces(FONTS);
const build = () => buildDocument({ markdown, resources: resources() }, config());
const builds = await buildWithLoadedFonts(build, markdown);
audit = auditOf(builds); // page 3's table
drawProof(builds[0], builds.at(-1)); // page 4's picture
const doc = (await buildWithLoadedFonts(build, markdown)).at(-1); // nothing is left to load
showPages(doc, { title: 'Load every font before layout' });
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
