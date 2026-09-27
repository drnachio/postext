// ═══ Postext Cookbook · Nº 057 · One-page CV with a sidebar ═══════════════════════
// https://postext.dev/en/cookbook/cv-with-sidebar
// Code: MIT · Text: original (CC BY 4.0) · Drawing: made in code (CC BY 4.0)
// Fonts: Hedvig Letters Serif, Hanken Grotesk (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'cv-with-sidebar';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#231b22', // text: a plum-tinted near-black
  band: '#3a2235', // the sidebar
  accent: '#8f3b62', // on paper: the role and the section heads (7.1:1)
  glow: '#f1b98f', // on the band: the sidebar titles (8.3:1)
  chip: '#744d6c', // on the band: the skill chips
  rule: '#d9cdd5', // the hairlines after the section heads
  muted: '#6c5f69', // dates, employers, the colophon (6.0:1)
  paper: '#ffffff', // the page, and the text on the band (14.4:1)
};
// 1.4.1 design elements paint the hex and ignore the paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
const [SERIF, SANS] = ['Hedvig Letters Serif', 'Hanken Grotesk'];
const PT = 25.4 / 72; // mm in a point
const [TRIM_W, TRIM_H] = [210, 297]; // mm: A4, printed on one side, so nothing is mirrored
const [TOP, LEFT, RIGHT] = [18, 9, 16]; // mm
const LEAD = 13.2; // pt: the body leading
const BOTTOM = TRIM_H - TOP - 56 * LEAD * PT; // mm: the text block holds 56 lines
const CONTENT = TRIM_W - LEFT - RIGHT; // 185 mm between the margins
const [SIDE, GUTTER] = [57, 10]; // mm: the sidebar column, and the white after it
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const LABEL = 7.8; // pt: the role and the sidebar titles, tracked capitals
const caps = (colour) => ({ fontFamily: SANS, fontSize: pt(LABEL), fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: pt(LABEL * 0.18), color: col(colour) });
const NAME = { size: 46, gap: 2.6 }; // pt and mm: the name, and the room under it
const ROLE_Y = NAME.size * PT + NAME.gap; // mm under the top margin: the role's line
// mm under the top margin: the name's baseline. Hedvig Letters Serif, set solid, puts it 0.795
// of the size down the line (measured on the page); another face needs its own ratio.
const BASELINE = 0.795 * NAME.size * PT;
const BOOKS = { w: 46, h: 18 }; // mm: the drawing at the head of the band

// #region answer: a float-only column on the left, filled by one box
const layout = {
  layoutType: 'oneAndHalf',
  sideColumnPercent: (SIDE / CONTENT) * 100, // 57 of the 185 mm between the margins
  sideColumnSide: 'left',
  sideColumnRole: 'floats', // no body text: only boxes fenced with span="side"
  gutterWidth: mm(GUTTER), // the text column keeps 185 − 57 − 10 = 118 mm
};
// A side box stands where the text has reached at its fence, so the Markdown opens with it,
// before the name, and it starts at the head of the column (gotcha: side-box-starts-at-fence):
//   :::callout{type="sidebar" span="side"}
//   :::callout{type="section" title="Contact"} … :::     ← the sections nest inside it
//   …
//   :::space{lines=2.76}    ← last: runs the band to the column's foot; a fifth of a line
//   :::                       more and the whole box moves to page 2
//   # Irene Salcedo {role="Book designer and art director"}
const sidebar = { id: 'sidebar', background: col('band'),
  // The first title stands on the role's line. The text starts 10 mm from the trim, the
  // left margin plus 1 mm, and stops 10 mm short of the band's right edge.
  padding: { top: mm(ROLE_Y), right: mm(10), bottom: pt(0), left: mm(1) },
  body: { fontFamily: SANS, fontSize: pt(8.4), lineHeight: pt(12.4), color: col('paper'),
    boldColor: col('paper'), paragraphSpacing: false } };
// #endregion

// #region margins: header boxes paint the band into the margins around the column
// Header elements are painted after the text, over it, so these stay in the margins, where
// no text runs (gotcha: header-paints-over-text). They repeat on every page.
const BAND_W = LEFT + SIDE; // mm from the trim edge to the band's right edge
const SEAM = 0.5; // mm of overlap with the box, so no hairline of paper shows between them
const REACH = 1; // mm the foot box climbs above the column's foot, over the end of the box
const bandBox = (id, x, y, w, h) => ({ kind: 'box', id, style: { backgroundColor: col('band') },
  placement: { ...at('page', 'top-left', x, y), size: { width: mm(w), height: mm(h) } } });
const header = { elements: [
  bandBox('head', 0, 0, BAND_W, TOP + SEAM), // above the column: the top margin
  bandBox('edge', 0, 0, LEFT + SEAM, TRIM_H), // beside it: the left margin, top to bottom
  bandBox('foot', 0, TRIM_H - BOTTOM - REACH, BAND_W, BOTTOM + REACH), // below it
  // Painted last, over the box's top padding, where no text runs. The bottom of the stack
  // sits on the name's baseline.
  { kind: 'image', id: 'books', resourceId: 'books', placement: {
    ...at('page', 'top-left', LEFT + 1, TOP + BASELINE - BOOKS.h),
    size: { width: mm(BOOKS.w), height: mm(BOOKS.h) } } },
] };
// #endregion

// #region sections: boxes nested in the band, one per section; chips for the skills
// The sections nest in one side box. As separate side boxes they would stand at least a line
// of paper apart (gotcha: side-boxes-line-apart). A nested box ignores span and flows inside
// its parent (gotcha: nested-callout-limits).
const section = (id, lineHeight) => ({ id, backgroundEnabled: false, // the band shows through
  padding: { top: pt(0), right: pt(0), bottom: pt(0), left: pt(0) },
  marginTop: mm(10),
  titleStyle: { ...caps('glow'), gap: mm(2.4) },
  body: { ...sidebar.body, lineHeight: pt(lineHeight) } });
const chipStyles = [{ id: 'skill', fontFamily: SANS, fontSize: pt(7.6), bold: true,
  background: col('chip'), color: col('paper'), borderWidth: pt(0),
  borderRadius: em(1), // past half the chip's height: a pill
  paddingX: em(0.6), paddingY: em(0.22), gap: em(0.3) }];
// #endregion

// #region name: the H1 sets the name and the role at the head of the text column
const nameplate = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'name', content: '{titleText}', fontFamily: SERIF,
    fontSize: pt(NAME.size), lineHeight: 1, color: col('ink'),
    placement: at('container', 'top-left') },
  { kind: 'text', id: 'role', content: '{attr.role}', ...caps('accent'),
    placement: at('#name', 'below', 0, NAME.gap) },
] } };
const nameLevel = { level: 1, // span stays 'column': the name heads the text column only
  // No break before the name: the sidebar box is already on the page, and a break would
  // move the name and the whole text column to page 2. 1.4.1 drops the H1 break anyway once
  // `headings` is set (gotcha: headings-drop-h1-break); the explicit value keeps the page
  // whole once that default returns.
  breakBefore: { enabled: false },
  marginBottom: pt(LEAD), // one grid line of air under the role
  advancedDesign: nameplate };
// #endregion

const sectionHead = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SERIF, fontSize: pt(14),
    lineHeight: 20 / 14, color: col('accent'), placement: at('container', 'top-left') },
  { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    // 3 mm after the title, level with the middle of its lower case, on to the column's edge
    placement: { ...at('#title', 'right-of', 3, 3.9), size: { width: 'fill' } } },
] } };

// #region jobs: each job heading sets the title left and the dates flush right
const JOB = 9.8; // pt: the job title, the dates and the employer share the size and leading
const jobText = (id, content, look) => ({ kind: 'text', id, content, fontFamily: SANS,
  fontSize: pt(JOB), lineHeight: LEAD / JOB, // a multiple (gotcha: design-lineheight-multiple)
  align: 'left', ...look }); // without align, design text is centred in its box
const job = { enabled: true, slot: { elements: [
  jobText('title', '{titleText}', { fontWeight: 700, color: col('ink'), overflow: 'wrap',
    placement: { ...at('container', 'top-left'), size: { width: mm(84) } } }), // clear of dates
  jobText('dates', '{attr.dates}', { color: col('muted'),
    placement: at('container', 'top-right') }), // the title's top and size, so its baseline
  jobText('org', '{attr.org}', { italic: true, color: col('muted'),
    placement: at('#title', 'below') }),
] } };
const jobLevel = { level: 3, fontSize: pt(JOB), lineHeight: pt(LEAD), marginTop: pt(9),
  marginBottom: pt(0), advancedDesign: job };
// The section head takes 20 pt under 19.6 pt of space, three grid lines, so a job head
// starts the same 9 pt under a grid line after a section head as after a list. The 9 pt
// below it merge with a job head's 9 pt above. Under Selected books they push the list to
// the next grid line, as the default 7 pt would; with 0 it would start one line higher.
const sectionLevel = { level: 2, fontSize: pt(14), lineHeight: pt(20),
  marginTop: pt(3 * LEAD - 20), marginBottom: pt(9), advancedDesign: sectionHead };
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  colorPalette, layout, chipStyles, header, footer: { elements: [] },
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(LEFT), right: mm(RIGHT) } },
  bodyText: { fontFamily: SANS, fontSize: pt(9.3), lineHeight: pt(LEAD), color: col('ink'),
    italicColor: col('ink'), // the titles in Selected books
    referenceColor: col('ink'), // no :ref yet; one added later prints in ink, not default blue
    textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true },
  // Each level draws its own design, but 1.4.1 still measures the hidden heading text in this
  // face. Without it the default is Open Sans, and the page would have to load that face too.
  headings: { fontFamily: SANS, levels: [nameLevel, sectionLevel, jobLevel] },
  unorderedLists: { bulletChar: '–', color: col('ink'), fontWeight: 400, itemSpacing: pt(0),
    marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'lead', fontSize: pt(11), lineHeight: pt(16) },
    { id: 'colophon', fontSize: pt(7), lineHeight: pt(9.6), color: col('muted'),
      marginTop: pt(LEAD) },
  ],
  calloutStyles: [sidebar, section('section', 12.4), section('chips', 16)],
});

// #region art: a stack of cloth-bound books, drawn in the palette
function books() { // BOOKS.w × BOOKS.h mm, in tenths of a millimetre; the bottom book first
  const lilac = mix(palette.band, palette.paper, 0.55);
  const stack = [ // [left edge, length, thickness, cloth, label]
    [0, 430, 40, palette.glow, palette.paper],
    [22, 380, 32, palette.paper, palette.accent],
    [6, 400, 36, palette.accent, palette.glow],
    [40, 330, 30, lilac, palette.paper],
    [18, 300, 34, mix(palette.glow, palette.paper, 0.45), palette.accent],
  ];
  let y = BOOKS.h * 10;
  let art = '';
  for (const [x, length, thick, cloth, label] of stack) {
    y -= thick;
    const [top, h] = [y + 3, thick - 3]; // a dark hairline above each book
    art += `<rect x="${x}" y="${top}" width="${length}" height="${h}" rx="3" fill="${cloth}"/>`
      + `<rect x="${x + 14}" y="${top}" width="5" height="${h}" fill="${label}"/>` // bands
      + `<rect x="${x + length - 19}" y="${top}" width="5" height="${h}" fill="${label}"/>`
      + `<rect x="${x + length * 0.34}" y="${top + h * 0.28}" width="${length * 0.32}" `
      + `height="${h * 0.44}" rx="2" fill="${label}"/>`; // the title label
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOOKS.w * 10} ${BOOKS.h * 10}" `
    + `width="${BOOKS.w * 10}" height="${BOOKS.h * 10}">${art}</svg>`;
}
function mix(a, b, k) { // a blend of two palette colours, k of the way from a to b
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [p, q] = [rgb(a), rgb(b)];
  return `#${p.map((v, i) => Math.round(v + (q[i] - v) * k).toString(16).padStart(2, '0'))
    .join('')}`;
}
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build (gotcha: fonts-first).
const FONTS = { 'Hedvig Letters Serif': ['400'], 'Hanken Grotesk': ['400', '400i', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadSvg('books.svg', books());
const resources = [{ id: 'books', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'books.svg', width: BOOKS.w * 10, height: BOOKS.h * 10 },
  altText: t({ en: 'A stack of five cloth-bound books',
    es: 'Una pila de cinco libros encuadernados en tela' }) }];
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'One-page CV with a sidebar',
  es: 'Currículum de una página con barra lateral' }) });

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
