// ═══ Postext Cookbook · Nº 103 · A bench for the Folio viewer's settings ═══════════════
// https://postext.dev/en/cookbook/folio-settings-bench
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Source Serif 4, Outfit (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// A pocket book of knots, laid out once and opened in postext-folio next to a form of every
// folio setting: paper, binding, covers, desk, light and tilt. Each change goes to the viewer
// with setAppearance, so the book is redrawn in place and no page is laid out or painted
// again. The settings as code sit under the form, ready to paste into config.folio.
import { buildDocumentWithFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { createFolioFromDocument } from 'https://esm.sh/postext-folio';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'folio-settings-bench';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: brick red for the covers and the knot numbers, a warm ink for the text
const palette = {
  ink: '#24211f',
  brick: '#9a3b2e', // the cover field, kickers and folios
  cream: '#f6efe2', // type on the covers
  muted: '#6f6860',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.brick, model: 'hex' } },
];
// #endregion
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [110, 160, 15, 17, 14, 12]; // mm: a pocket
const LEAD = 12.4; // pt
const SANS = 'Outfit';
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const text = (id, content, look, placement) => ({ kind: 'text', id, content, overflow: 'wrap',
  align: 'left', placement, ...look });
const caps = (size, color) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: 600,
  letterSpacing: pt(size * 0.16), textTransform: 'uppercase', color });

// #region covers: a full-page colour field on page 1 and on the last page
const field = { kind: 'box', id: 'field', style: { backgroundColor: col('brick') },
  placement: { ...at('bleed', 'top-left'), size: { width: 'fill', height: mm(TRIM_H) } } };
const flush = { numbered: false, span: 'page', footer: { elements: [] },
  margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) } };
const cover = (id, title, extra = {}) => ({ id, ...flush, ...extra, advancedDesign: {
  enabled: true, minHeight: mm(TRIM_H), slot: { elements: [field, ...title] } } });
const headingStyles = [
  cover('cover', [
    text('title', '{titleText}', { fontFamily: SANS, fontWeight: 700, fontSize: pt(40),
      lineHeight: 0.92, color: col('cream') },
    { ...at('page', 'top-left', INNER, 30), size: { width: mm(80) } }),
    text('strap', '{attr.strap}', { fontFamily: 'Source Serif 4', italic: true,
      fontSize: pt(11), lineHeight: 1.3, color: col('cream') },
    { ...at('#title', 'below', 0, 6), size: { width: mm(72) } }),
    text('author', '{author}', caps(7, col('cream')), at('page', 'bottom-left', INNER, -16)),
  ]),
  cover('back', [
    text('strap', '{attr.strap}', { fontFamily: 'Source Serif 4', italic: true,
      fontSize: pt(11), lineHeight: 1.3, color: col('cream'), align: 'center' },
    { ...at('page', 'center', 0, 0), size: { width: mm(76) } }),
  ], { breakBefore: { enabled: true, parity: 'even' } }), // the back: always a verso
];
// #endregion

const opener = { enabled: true, minHeight: mm(22), slot: { elements: [
  text('kicker', '{attr.kicker}', caps(6.8, col('brick')), at('container', 'top-left', 0, 1)),
  text('title', '{titleText}', { fontFamily: SANS, fontWeight: 600, fontSize: pt(19),
    lineHeight: 1, color: col('ink') },
  { ...at('#kicker', 'below', 0, 2), size: { width: 'fill' } }),
] } };

// #region form: the form's fields (index.html) are named by their path in config.folio
const form = document.getElementById('controls');
const hex = (value) => ({ hex: value, model: 'hex' });
function folioOf() { // 'paper.grammage' → { paper: { grammage } }, typed by the input
  const folio = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'button' || el.tagName === 'OUTPUT') continue;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value)
      : el.type === 'color' ? hex(el.value) : el.value;
    const [group, key] = el.name.split('.');
    if (key) (folio[group] ??= {})[key] = value;
    else folio[group] = value;
  }
  return folio;
}
const show = (name, value) => { form.elements[name].value = value; };
// #endregion

const config = () => ({
  locale: 'en-us',
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Source Serif 4', fontSize: pt(9.3), lineHeight: pt(LEAD),
    color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink'), textAlign: 'justify', firstLineIndent: mm(3.5),
    indentAfterHeading: false, hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 600, levels: [
    // A chapter opens on the next page, recto or verso.
    { level: 1, fontSize: pt(19), breakBefore: { enabled: true, parity: 'any' },
      marginBottom: pt(LEAD / 2), advancedDesign: opener },
  ] },
  headingStyles,
  paragraphStyles: [{ id: 'colophon', fontFamily: SANS, fontSize: pt(6.5), lineHeight: pt(9),
    color: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) }],
  header: { elements: [] },
  folio: folioOf(), // the form's starting settings: the document's own look in the Sandbox
  footer: { elements: [text('folio', '{pageNumber}', { ...caps(6.5, col('brick')),
    align: 'center' }, at('page', 'bottom', 0, -9))] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Source Serif 4': ['400', '400i', '700'], Outfit: ['400', '600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const doc = await buildDocumentWithFonts({ markdown }, config(), kitFonts(FONTS));
showPages(doc, { title: 'Six Knots · the Folio settings bench' });
// cover: 'pages' needs an even count (gotcha: folio-cover-pages-even); the back's break
// gives it one.
if (doc.pages.length % 2) console.warn(`${doc.pages.length} pages: the back cover is missing`);


// #region answer: one viewer, restyled in place by setAppearance on every change
const book = createFolioFromDocument(document.getElementById('folio'), doc, {
  // The look starts from doc.config.folio; setAppearance replaces it on every change.
  appearance: { textureBaseUrl: 'https://postext.dev/folio/textures' },
  onChange: ({ pages }) => kitStatus(`${doc.pages.length} pages · open at `
    + pages.map((i) => i + 1).join('–')),
});
function update() {
  const folio = folioOf();
  // Only the appearance changes: the pages keep their paintings, nothing is laid out again.
  book.setAppearance({ folio });
  show('grammage-out', `${folio.paper.grammage} g/m²`);
  show('intensity-out', folio.lighting.intensity.toFixed(2));
  show('tilt-out', `${folio.tilt}°`);
  document.getElementById('folio-json').textContent = `folio: ${JSON.stringify(folio, null, 2)}`;
}
form.addEventListener('input', update);
// A stock sets its own weight: picking one moves the weight slider to the stock's.
const WEIGHTS = { uncoated: 90, bookWove: 80, coatedMatte: 115, coatedSilk: 115,
  coatedGloss: 115, bible: 40, newsprint: 48, cardStock: 250 };
form.elements['paper.type'].addEventListener('change', (event) => {
  form.elements['paper.grammage'].value = WEIGHTS[event.target.value];
  update();
});
document.getElementById('reset-view').addEventListener('click', () => book.resetView());
update();
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
