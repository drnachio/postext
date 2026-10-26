// ═══ Postext Cookbook · Nº 170 · Column arithmetic as each country writes it ═══════
// https://postext.dev/en/cookbook/column-arithmetic-by-country
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Fira Sans, Lexend (SIL OFL 1.1) · Needs postext ≥ 1.63.0
import { buildDocumentWithFonts, buildDocument, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'es'; // @lang: the language of the worksheet ('es' | 'en' | 'fr' | 'de')
const RECIPE = 'column-arithmetic-by-country';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: ink, one orange accent, a pale tint, the grey of squared paper
const palette = {
  ink: '#1f2328', accent: '#c4511c', tint: '#fbeee6', rule: '#b9c0c8', muted: '#5f6670',
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TEXT, LABEL] = ['Fira Sans', 'Lexend'];

// #region answer: operations in squares, long division as the edition's schools set it
// `- 864 : 4` in the Markdown is one operation; the style sets it digit by digit in squares
// of 7.2 mm, a cell for each figure of the answer. Long division follows the country: the
// divisor in an L right of the dividend in Spain and France (potence), `864 : 4 =` on one
// line in Germany, the bracket ⟌ in English-speaking schools.
const calculo = {
  id: 'calculo',
  number: { shape: 'disc', background: col('accent'), fontFamily: LABEL, fontWeight: 700 },
  instruction: { bold: true, color: col('ink') },
  grid: { cell: mm(9), fontFamily: TEXT, fontSize: pt(15), rule: col('rule'),
    color: col('ink') },
  arithmetic: { columns: 4,
    division: t({ es: 'potence', fr: 'potence', de: 'inline', en: 'bracket' }) },
  blank: { look: 'box', width: em(3.2), color: col('rule'), weight: pt(0.8) },
  area: { kind: 'grid', spacing: mm(5), color: col('rule'), weight: pt(0.4) },
  answers: { color: col('accent'), fontFamily: LABEL }, // the teacher's copy, in the accent
  marginTop: mm(7), marginBottom: mm(2), itemSpacing: em(0.5),
};
// #endregion

// #region head: the unit pill, the title and the lines for a name and a date
const at = (to, edge, x = 0, y = 0, size) => ({ anchor: { to, edge },
  offset: { x: mm(x), y: mm(y) }, ...(size && { size }) });
const field = (id, attr, x, width) => [
  { kind: 'text', id, content: `{attr.${attr}}`, fontFamily: LABEL, fontSize: pt(9.5),
    fontWeight: 600, color: col('muted'), align: 'left',
    placement: at('container', 'top-left', x, 26) },
  { kind: 'rule', id: `${id}-line`, direction: 'horizontal', thickness: pt(0.75),
    color: col('rule'), placement: at('container', 'top-left', x + 17, 31, { width: mm(width) }) },
];
const head = { enabled: true, minHeight: mm(36), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('accent'), borderRadius: mm(3) },
    placement: at('container', 'top-left', 0, 0, { width: 'fill', height: mm(19) }) },
  { kind: 'text', id: 'unit', content: '{attr.unidad}', fontFamily: LABEL, fontSize: pt(9),
    fontWeight: 700, color: col('accent'), align: 'center', verticalAlign: 'middle',
    textTransform: 'uppercase', letterSpacing: pt(1.2), lineHeight: 1.1,
    box: { backgroundColor: col('paper'), borderRadius: mm(3.5) },
    placement: at('container', 'top-left', 5, 5, { width: mm(26), height: mm(9) }) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: LABEL, fontSize: pt(21),
    fontWeight: 700, color: col('paper'), align: 'left', lineHeight: 1.1,
    placement: at('container', 'top-left', 37, 5.2) },
  ...field('name', 'nombre', 0, 100), ...field('date', 'fecha', 124, 38),
] } };
// #endregion

const config = {
  locale: t({ es: 'es', en: 'en-gb', fr: 'fr', de: 'de' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(210), height: mm(297), dpi: 150,
    margins: { top: mm(18), bottom: mm(20), left: mm(18), right: mm(18), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: {
    fontFamily: TEXT, fontSize: pt(12), lineHeight: pt(18), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false },
    optimalLineBreaking: true, avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  },
  headings: { fontFamily: LABEL, color: col('ink'), fontWeight: 700, levels: [
    { level: 1, fontSize: pt(21), breakBefore: { parity: 'any' }, marginTop: pt(0),
      marginBottom: mm(1), advancedDesign: head },
  ] },
  exerciseStyles: [calculo],
  exercises: { edition: 'student' }, // the switch above the pages sets 'teacher'
  orderedLists: { fontFamily: LABEL, numberFormat: 'arabic', color: col('accent'),
    fontWeight: 600, marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [{ id: 'colofon', fontFamily: TEXT, fontSize: pt(7.5), lineHeight: pt(10),
    color: col('muted'), firstLineIndent: pt(0), marginTop: mm(6) }],
  header: { elements: [] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontFamily: LABEL,
    fontSize: pt(9), fontWeight: 700, color: col('accent'), align: 'center',
    placement: at('page', 'bottom', 0, -11) }] },
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Fira Sans': ['400', '700'], Lexend: ['600', '700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
const title = t({ es: 'Cuaderno de cálculo', en: 'Calculation book', fr: 'Cahier de calcul',
  de: 'Rechenheft' });
// The pupil's sheet first, then the teacher's copy: the capture shows both.
await buildDocumentWithFonts({ markdown }, config, kitFonts(FONTS));
config.exercises.edition = 'teacher';
buildDocument({ markdown }, config);

// #region live: a switch between the pupil's sheet and the teacher's copy
const form = document.getElementById('controls');
const labels = t({ es: ['Alumno', 'Profesor'], en: ['Pupil', 'Teacher'],
  fr: ['Élève', 'Enseignant'], de: ['Schüler', 'Lehrkraft'] });
form.querySelectorAll('label span').forEach((span, k) => { span.textContent = labels[k]; });
function render() {
  // The same config, edited in place: the next build sees the edition the form asks for.
  config.exercises.edition = form.elements.edition.value;
  const doc = buildDocument({ markdown }, config); // the faces are loaded by now
  showPages(doc, { title });
  document.querySelectorAll('#pt-actions a, [data-postext-pdf]').forEach((old) => old.remove());
  offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }),
    `${RECIPE}-${LANG}-${config.exercises.edition}.pdf`);
}
form.addEventListener('change', render);
render();
// #endregion

// @kit core fonts viewer pdf
