// ═══ Postext Cookbook · Nº 019 · Parts in colour from one attribute ═══════════════════════
// https://postext.dev/en/cookbook/parts-in-colour
// Code: MIT · Text: original (CC BY 4.0) · Pictures: diffusion models
// Fonts: Alegreya, Zilla Slab, Barlow Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
// A pocket field guide to two habitats. Each :::part names its own 'band' colour, and every
// colour linked to 'band' takes it: the divider and its verso, the tab, the field marks.
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage,
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
// The paletteId is the link a part's palette="band=#…" follows, in text and designs alike.
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
    // "1"); the species design prints {number}, from numberingTemplate '{1}'.
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

const config = () => ({
  locale: t({ en: 'en-us', es: 'es' }), // hyphenation patterns and the built-in labels
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom),
      left: mm(MARGIN.inner), right: mm(MARGIN.outer), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText, unorderedLists, resourceTypes, captionStyle,
  headings: { ...display, levels: [
    // No break of its own: an H1 that breaks the page makes each species page an 'opener',
    // with no running heads. A :::pagebreak, or the part's break, starts each species.
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
    // Set in the note under the contents: the 15 pt leading gives its lines their air.
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
// Every picture is a JPEG in assets/, cut to the shape of its frame, declared at its pixels.
const drawing = (id, [w, h], more) => ({ id, typeId: 'plate', kind: 'bitmap',
  bitmap: { fileId: `${id}-${w}.jpg`, format: 'jpeg', width: w, height: h },
  createdAt: 0, updatedAt: 0, altText: CAPTIONS[id], ...more });
// Plates stand where ::resource{id="…"} is; since 1.5 an inline figure keeps a line of space
// below it too.
const resources = [drawing('cover', [1152, 1536]), drawing('strip', [1536, 451]),
  ...['curlew', 'redshank', 'reedling', 'warbler'].map((id) => drawing(id, [1200, 600],
    { caption: CAPTIONS[id], placement: { position: 'here' } }))];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build.
const FONTS = { Alegreya: ['400', '400i', '700'], 'Zilla Slab': ['600', '700'], // text, display
  'Barlow Condensed': ['400', '600', '700'] }; // and labels

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await Promise.all(resources.map(({ bitmap: b }) => loadImage(b.fileId, asset(b.fileId))));
const doc = await buildDocumentWithFonts({ markdown, resources }, config(), kitFonts(FONTS));
showPages(doc, { title: BOOK });

// @kit core fonts viewer images · the Cookbook inlines cookbook/_kit/*.js here
