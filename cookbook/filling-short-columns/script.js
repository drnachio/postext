// ═══ Postext Cookbook · Nº 177 · Filling the column the widow rule left short ═════
// https://postext.dev/en/cookbook/filling-short-columns
// Code: MIT · Text: original (CC BY 4.0) · Painting: diffusion model
// Fonts: Public Sans, Libre Caslon Display, Libre Caslon Text (OFL) · Needs postext ≥ 1.65.0
//
// A magazine long read in two ragged columns, set twice. Without fillShortColumns a column
// whose paragraph would split into a widow ends a line above the foot; with it, a paragraph
// of that column is set a line longer or shorter, and the column ends on the last grid line.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'filling-short-columns';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Every colour below is linked to this palette by id.
const palette = {
  ink: '#1b2026', // text: a slate near-black
  brass: '#875a14', // the accent: kicker and crossheads (6:1 on paper)
  sea: '#2c4a5e', // the standfirst
  rule: '#c9ccd0', // hairlines
  muted: '#5d656e', // running heads, credit, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to 'main-color': point it at the accent, so nothing prints blue.
  { id: 'main-color', name: 'brass (defaults)', value: { hex: palette.brass, model: 'hex' } },
];
const TOP = 22; // top margin in mm: the opener's container starts here
const OUTER = 14; // outer margin in mm: folios and running heads align to it
const LEAD = 13.2; // body leading in pt: the baseline grid every column ends on

// #region answer: ragged columns that end on the grid: fillShortColumns
const balancing = {
  // A ragged column has no lever of its own when the widow and orphan rules hold its last
  // line back: no heading or list end to open, no justified paragraph to set looser. This
  // one lets a paragraph of the short column run a line long, within its own word spacing
  // (or a justified one no looser than maxWordSpacing), or, when none can, set one a line
  // short so the split after it takes the line. A change is kept only when the pages end
  // with fewer short columns; otherwise the column stays as it was.
  fillShortColumns: true, // default false
  // The paragraphs go first: a crosshead keeps its one line of air unless they cannot help.
  maxLinesBeforeLoose: 0,
};
const bodyText = {
  fontFamily: 'Public Sans', fontSize: pt(9.4), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'left', firstLineIndent: pt(0), paragraphSpacing: true, // a grid line between
  hyphenation: { enabled: true }, optimalLineBreaking: true, optimalRagged: true,
  avoidWidows: true, widowMinLines: 2, avoidOrphans: true, orphanMinLines: 2, // the cause
  avoidRunts: true,
};
// #endregion

// #region opener: the painting bled across the top, then kicker, headline and standfirst
const DEPTH = 150; // mm: how far down the page the painting bleeds
const sans = { fontFamily: 'Public Sans', fontWeight: 700, textTransform: 'uppercase' };
const at = (to, edge, x, y, width) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(width && { size: { width: mm(width) } }) });
const air = { padding: { bottom: mm(6) } }; // counts: the text starts 6 mm under the byline
const opener = {
  enabled: true,
  slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'lens', placement: { anchor: { to: 'bleed',
      edge: 'top-left' }, size: { width: 'fill', height: mm(DEPTH) } } },
    { kind: 'text', id: 'credit', content: '{attr.credit}', ...sans, fontWeight: 500,
      fontSize: pt(6.5), letterSpacing: pt(0.6), color: col('muted'), align: 'right',
      placement: at('container', 'top-right', 0, DEPTH - TOP + 2) },
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...sans, fontSize: pt(8.5),
      letterSpacing: pt(1.7), color: col('brass'), align: 'left',
      placement: at('container', 'top-left', 0, DEPTH - TOP + 9) },
    { kind: 'text', id: 'headline', content: '{titleText}', fontFamily: 'Libre Caslon Display',
      fontSize: pt(46), lineHeight: 1.02, color: col('ink'), align: 'left',
      placement: at('#kicker', 'below', 0, 2.5, 112) },
    { kind: 'text', id: 'standfirst', content: '{attr.standfirst}', fontFamily: 'Libre Caslon Text',
      italic: true, fontSize: pt(12), lineHeight: 1.3, color: col('sea'), align: 'left',
      placement: at('#headline', 'right-of', 8, 2.5) },
    { kind: 'text', id: 'byline', content: '{attr.byline}', ...sans, fontSize: pt(7.5),
      letterSpacing: pt(1.3), color: col('ink'), align: 'left', box: air,
      placement: at('#standfirst', 'below', 0, 3.5) },
  ] },
};
// #endregion

// #region heads: magazine and issue on the verso, the story on the recto
const label = { ...sans, fontWeight: 600, fontSize: pt(7.5), letterSpacing: pt(1.3),
  color: col('muted') };
const folio = { fontFamily: 'Public Sans', fontWeight: 700, fontSize: pt(8.5), color: col('ink') };
const pin = (edge, x, y) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(y) } });
const sides = [['even', 'left', 1], ['odd', 'right', -1]]; // 1: the outer edge is on the left
const header = { elements: sides.flatMap(([parity, edge, s]) => [
  { kind: 'text', id: `folio-${parity}`, content: '{pageNumber}', ...folio,
    placement: pin(`top-${edge}`, s * OUTER, 12) },
  { kind: 'text', id: `head-${parity}`, ...label,
    content: s > 0 ? '{title} · {subtitle}' : '{chapterTitle}',
    placement: pin(`top-${edge}`, s * (OUTER + 9), 12.35) }, // the smaller size's baseline
  { kind: 'rule', id: `rule-${parity}`, direction: 'horizontal', thickness: pt(0.5),
    color: col('rule'), placement: { ...pin(`top-${edge}`, s * OUTER, 17),
      size: { width: mm(197) } } },
].map((element) => ({ ...element, parity, pages: 'body' }))) }; // none on the opener
const footer = { elements: sides.map(([parity, edge, s]) => ({ kind: 'text', parity,
  id: `drop-folio-${parity}`, ...folio, content: '{pageNumber}', pages: 'opener', align: edge,
  placement: pin(`bottom-${edge}`, s * OUTER, -11) })) }; // the opener's only folio
// #endregion

const config = {
  locale: t({ en: 'en-gb', es: 'es' }), // each edition's hyphenation patterns
  colorPalette,
  page: { width: mm(225), height: mm(297), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(21), left: mm(16), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(7) }, // a 94 mm measure, about 62 characters
  bodyText,
  headings: {
    fontFamily: 'Libre Caslon Text', fontWeight: 400, color: col('ink'),
    balancing, // the first build turns it off (see builds)
    levels: [
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginBottom: pt(0), advancedDesign: opener },
      { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), italic: true, color: col('brass'),
        marginTop: pt(LEAD), marginBottom: pt(0) }, // crossheads, one grid line above
    ],
  },
  paragraphStyles: [{ id: 'colophon', fontFamily: 'Public Sans', fontSize: pt(6.8),
    lineHeight: pt(9.6), color: col('muted'), textAlign: 'left', firstLineIndent: pt(0),
    marginTop: pt(LEAD) }],
  header, footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const resources = [
  { id: 'lens', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, // never cited:
    // only the opener draws it, cropped to its 225 × 150 mm box
    bitmap: { fileId: 'lens-1400.jpg', format: 'jpeg', width: 1400, height: 933 },
    altText: t({ en: 'A lit Fresnel lens of brass and glass rings in a lighthouse lantern at '
      + 'dusk, with the sea and a sunset behind the diagonal panes.',
    es: 'Una lente de Fresnel encendida, de anillos de vidrio y latón, en la linterna de un faro '
      + 'al anochecer, con el mar y la puesta de sol tras los cristales en rombo.' }) },
];
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // text, display and label faces, loaded before the build
  'Public Sans': ['400', '400i', '500', '600', '700'], 'Libre Caslon Display': ['400'],
  'Libre Caslon Text': ['400', '400i'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage('lens-1400.jpg', asset('lens-1400.jpg'));
// #region builds: the same text and design, without and then with fillShortColumns
const withFill = (fill) => ({ ...config, headings: { ...config.headings,
  balancing: { ...balancing, fillShortColumns: fill } } }); // a copy: config keeps true
const build = (fill) => buildDocumentWithFonts({ markdown, resources }, withFill(fill),
  kitFonts(FONTS));
const docs = { off: await build(false), on: await build(true) };
// #endregion
const title = t({ en: 'Filling the column the widow rule left short',
  es: 'La columna que la regla de viudas dejaba corta' });
// Two buttons put either build on the desk.
const LABELS = { off: 'fillShortColumns: false', on: 'fillShortColumns: true' };
const switches = Object.keys(docs).map((key) => Object.assign(document.createElement('button'),
  { type: 'button', value: key, textContent: LABELS[key] }));
const show = (key) => {
  showPages(docs[key], { title });
  for (const b of switches) b.ariaPressed = String(b.value === key);
};
for (const b of switches) b.addEventListener('click', () => show(b.value));
show('on');
document.getElementById('pt-actions').prepend(...switches);
document.head.insertAdjacentHTML('beforeend',
  '<style>#pt-actions [aria-pressed=true] { text-decoration: underline }</style>');

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
