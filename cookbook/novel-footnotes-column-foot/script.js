// ═══ Postext Cookbook · Nº 071 · Footnotes at the foot of the column ══════════════
// https://postext.dev/en/cookbook/novel-footnotes-column-foot
// Code: MIT · Text: Lazarillo de Tormes (1554) and Markham's 1908 translation (PD)
// Fonts: EB Garamond, Bodoni Moda, IBM Plex Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import { buildDocument, buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'novel-footnotes-column-foot';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: oxblood for the kickers, the folios and the notes' rule; ink on warm paper
const palette = {
  ink: '#241e1a', // text: a warm near-black
  oxblood: '#7d2b1f', // the one accent
  muted: '#6f655b', // running heads, colophon
  rule: '#c9bdae', // hairlines
  paper: '#fbf8f2',
};
// A design element paints the hex written beside its paletteId (gotcha: palette-skips-designs).
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  // The engine's defaults link to main-color: point it at the accent, never the default blue.
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.oxblood, model: 'hex' } },
];
// #endregion
const TRIM = { width: 210, height: 280 }; // a school edition: two 82 mm columns
const MARGIN = { top: 23, bottom: 22, inner: 21, outer: 17 }; // mirrored
const MEASURE = TRIM.width - MARGIN.inner - MARGIN.outer; // 172 mm
const LEAD = 13.5; // body leading in pt: the baseline grid
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const label = { fontFamily: 'IBM Plex Sans Condensed', fontWeight: 600,
  textTransform: 'uppercase' };

// The switches under the title change these and build again (#region live).
const options = { columns: 2, placement: 'column', numbering: 'chapter' };
const layoutFor = (columns) => (columns === 2
  ? { layoutType: 'double', gutterWidth: mm(7) } : { layoutType: 'single' });

// #region answer: the notes at the foot of the column that cites them
// In the Markdown: `Tejares,[^9]` cites a note (the id may be a word: `[^tejares]`), and
// a paragraph that opens with `[^9]:` anywhere in the chapter defines it. The engine
// numbers the notes in order of citation and keeps each note in the column of the line
// that cites it: a line whose note does not fit under it moves on with the note.
const footnotes = () => ({
  placement: options.placement, // 'column' (the foot of the citing column) or 'chapterEnd'
  numbering: options.numbering, // 'chapter': 1, 2, 3… again under every chapter heading
  fontSize: pt(8.5), // off the baseline grid: the notes stack up from the column's foot
  lineHeight: pt(10.5),
  hangingIndent: em(0.9), // turnover lines align past the number
  spaceBetween: pt(1.5),
  separator: { width: 0.25, lineWidth: pt(0.5), color: col('oxblood') },
});
// #endregion

// #region opener: kicker, a Bodoni title and a short rule, centred over both columns
const opener = {
  enabled: true,
  // The sink holds a two-line title and its rule, with ~8 mm to the first line of text,
  // so every chapter starts on the same grid line whatever its title's length.
  minHeight: pt(LEAD * 10),
  slot: { elements: [
    { kind: 'text', id: 'kicker', content: '{attr.kicker}', ...label, fontSize: pt(8.5),
      letterSpacing: pt(1.8), color: col('oxblood'), align: 'center',
      placement: at('container', 'top', 0, 7) },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: 'Bodoni Moda', italic: true,
      fontSize: pt(26), lineHeight: 1.1, color: col('ink'), align: 'center',
      overflow: 'wrap', // design text ends in an ellipsis by default
      placement: { ...at('container', 'top-left', 0, 13),
        size: { width: 'fill', height: 'auto' } } },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(0.75), color: col('oxblood'),
      placement: { anchor: { to: '#title', edge: 'below' }, // a rule starts at the box's left
        offset: { x: mm((MEASURE - 14) / 2), y: mm(4.5) }, size: { width: mm(14) } } },
  ] },
};
// #endregion

// #region running-heads: book title on the verso, chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'body', // never on openers
  ...label, fontSize: pt(7.5), letterSpacing: pt(1.3), color: col('muted'),
  placement: at('page', edge, x, 13), ...extra,
});
const folio = { color: col('oxblood') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', MARGIN.outer,
    { ...folio, align: 'left' }),
  head('verso-title', '{title}', 'even', 'top-left', MARGIN.outer + 9, { align: 'left' }),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(MARGIN.outer + 9),
    { align: 'right', overflow: 'ellipsis', size: { width: mm(120) } }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -MARGIN.outer,
    { ...folio, align: 'right' }),
] };
// Openers carry a drop folio instead, centred under the text block.
const footer = { elements: [{ ...head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, align: 'center', placement: at('page', 'bottom', 0, -11) }), pages: 'opener' }] };
// #endregion

const config = { // one object: the switches below change it in place
  locale: t({ en: 'en-us', es: 'es' }), // exact codes (gotcha: hyphenation-locales)
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MARGIN.top), bottom: mm(MARGIN.bottom), left: mm(MARGIN.inner),
      right: mm(MARGIN.outer), mirror: true } }, // left = inner
  layout: layoutFor(options.columns),
  bodyText: { fontFamily: 'EB Garamond', fontSize: pt(10.5), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: 'EB Garamond', color: col('ink'), levels: [
    // Restated on purpose: any headings object drops the H1 break
    // (gotcha: headings-drop-h1-break). 'any': the treatise opens on the next page.
    { level: 1, span: 'page', advancedDesign: opener, marginBottom: pt(0),
      breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, fontSize: pt(12.5), lineHeight: pt(LEAD), italic: true, fontWeight: 400,
      color: col('oxblood'), marginTop: pt(LEAD), marginBottom: pt(0) },
  ] },
  paragraphStyles: [
    { id: 'colophon', ...label, textTransform: 'none', fontSize: pt(7.5), lineHeight: pt(10),
      color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
  ],
  footnotes: footnotes(),
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses, loaded before the first build with the ones the config names.
const FONTS = {
  'EB Garamond': ['400', '400i', '600', '600i', '700'],
  'Bodoni Moda': ['400i'],
  'IBM Plex Sans Condensed': ['600'],
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const TITLE = t({ en: 'Footnotes at the foot of the column', es: 'Notas al pie de columna' });
let doc = await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
showPages(doc, { title: TITLE });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// #region live: three switches, each a fresh build of the chapter with the other option
const CHOICES = {
  columns: [[2, t({ en: 'Two columns', es: 'Dos columnas' })],
    [1, t({ en: 'One column', es: 'Una columna' })]],
  placement: [['column', t({ en: 'Column foot', es: 'Pie de columna' })],
    ['chapterEnd', t({ en: 'End of chapter', es: 'Final del capítulo' })]],
  numbering: [['chapter', t({ en: 'Per chapter', es: 'Por capítulo' })],
    ['document', t({ en: 'Continuous', es: 'Continua' })]],
};
const bar = document.createElement('form');
bar.id = 'options';
bar.ariaLabel = t({ en: 'Footnote options', es: 'Opciones de las notas' });
for (const [key, choices] of Object.entries(CHOICES)) {
  const group = bar.appendChild(document.createElement('fieldset'));
  for (const [value, text] of choices) {
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: key,
      value: String(value), checked: options[key] === value });
    const item = group.appendChild(document.createElement('label'));
    item.append(input, text);
  }
}
bar.addEventListener('change', (event) => {
  const { name, value } = event.target;
  options[name] = name === 'columns' ? Number(value) : value;
  config.layout = layoutFor(options.columns); // changed in place: the build sees it
  config.footnotes = footnotes();
  doc = buildDocument({ markdown }, config); // the fonts are loaded by now
  showPages(doc, { title: TITLE });
});
document.getElementById('pages').before(bar);
// #endregion

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
