// ═══ Postext Cookbook · Nº 179 · A course module with a test answered on screen ═══
// https://postext.dev/en/cookbook/self-checking-course-module
// Code: MIT · Text: original (CC BY 4.0) · Painting: generated with diffusion models
// Fonts: Source Serif 4, Archivo (SIL OFL 1.1) · Needs postext ≥ 1.65.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerResourceImage, renderToHtml,
  attachExercises, exerciseSolutionValue,
} from 'https://esm.sh/postext';
import { renderToEpub } from 'https://esm.sh/postext-epub';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'self-checking-course-module';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = {
  ink: '#1f2523', // text: a green-tinted near-black
  rust: '#9c4420', // the course's accent: kicker, practice numbers, rules
  slate: '#2f5266', // the test: its numbers and its frame
  tint: '#f5efe4', // the safety box, the word bank
  rule: '#d6cdbf', // hairlines
  muted: '#646d69', // running heads, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'rust (defaults)', value: { hex: palette.rust, model: 'hex' } },
];
const [TEXT, SANS] = ['Source Serif 4', 'Archivo'];
const [TOP, OUTER, LEAD] = [22, 21, 15.5]; // mm, mm, pt
const BAND = 100; // mm: the painting's depth from the trim, over 3 mm of bleed

// #region answer: practice and test from one Markdown: the test style limits each attempt
// Practice: check, start again and see the solution as often as the learner likes.
const practice = {
  id: 'practice',
  number: { shape: 'disc', background: col('rust'), fontFamily: SANS, fontWeight: 700 },
  instruction: { fontFamily: SANS, bold: true, fontSize: pt(10) },
  options: { marker: 'circle' },
  blank: { look: 'line', color: col('ink'), weight: pt(0.6) },
  match: { look: 'dots', gap: em(3), color: col('rust') },
  bank: { box: 'bank' },
  marginTop: mm(5), marginBottom: mm(1), itemSpacing: em(0.15),
};
// The test: one check, no fresh start, the solution only once the check is spent. On paper
// the same questions print without their key.
const test = {
  id: 'test', extends: 'practice', box: 'test',
  number: { shape: 'square', background: col('slate') },
  match: { color: col('slate') },
  solutions: { placement: 'none' },
  digital: { maxChecks: 1, reset: false, showSolution: 'noChecksLeft' },
};
const exercises = {
  solutions: { placement: 'directive', layout: 'key' }, // the practice key where :::solutions is
  // The pass mark the course's results are judged against (a SCORM package reports passed or
  // failed with it); the HTML and EPUB editions carry it with the exercise data.
  digital: { passingScore: 70 },
};
// #endregion

// #region opener: the painting bled off the head, kicker, title and lead on the paper under it
const at = (to, edge, x, y, size) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(size && { size }) });
const FOOT = BAND - 3 - TOP; // the painting's foot under the top margin, in mm
const opener = { enabled: true, minHeight: mm(FOOT + 44), slot: { elements: [
  { kind: 'image', id: 'painting', resourceId: 'fault', decorative: true,
    placement: at('bleed', 'top-left', 0, 0, { width: 'fill', height: mm(BAND) }) },
  { kind: 'text', id: 'kicker', content: '{attr.kicker}', fontFamily: SANS, fontSize: pt(8),
    fontWeight: 700, letterSpacing: pt(1.6), textTransform: 'uppercase', color: col('rust'),
    align: 'left', placement: at('container', 'top-left', 0, FOOT + 9) },
  { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SANS, fontSize: pt(50),
    fontWeight: 800, lineHeight: 1, letterSpacing: pt(-1), color: col('ink'), align: 'left',
    placement: at('#kicker', 'below', 0, 3, { width: 'fill' }) },
  { kind: 'text', id: 'lead', content: '{attr.lead}', fontFamily: TEXT, fontSize: pt(12.5),
    lineHeight: 1.3, italic: true, color: col('ink'), align: 'left',
    placement: at('#title', 'below', 0, 4, { width: 'fill' }) },
] } };
// #endregion

const label = { fontFamily: SANS, fontSize: pt(7.5), fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase', color: col('muted') };
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content, parity,
  pages: 'body', ...label, placement: at('page', edge, x, 12), ...extra });
const folio = { fontWeight: 700, color: col('ink') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top-left', OUTER + 8),
  head('recto-title', '{chapterTitle}', 'odd', 'top-right', -(OUTER + 8)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, pages: 'opener', placement: at('page', 'bottom', 0, -11) })] };
const sansBody = { fontFamily: SANS, fontSize: pt(9.5), lineHeight: pt(13.5), color: col('ink'),
  boldColor: col('ink'), firstLineIndent: pt(0) };

const config = {
  locale: t({ en: 'en-us', es: 'es' }),
  colorPalette,
  page: { sizePreset: 'custom', width: mm(176), height: mm(250), dpi: 96, // CSS px on screen
    backgroundColor: col('paper'),
    margins: { top: mm(TOP), bottom: mm(22), left: mm(21), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(10.8), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4.5), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: SANS, color: col('ink'), fontWeight: 700, levels: [
    { level: 1, fontSize: pt(50), breakBefore: { parity: 'any' }, marginTop: pt(0),
      marginBottom: pt(0), advancedDesign: opener },
    { level: 2, fontSize: pt(13), lineHeight: pt(LEAD), marginTop: pt(LEAD),
      marginBottom: pt(0) },
  ] },
  exerciseStyles: [practice, test],
  exercises,
  orderedLists: { numberFormat: 'arabic', color: col('rust'), fontWeight: 700,
    marginTop: pt(0), marginBottom: pt(0) },
  calloutStyles: [
    { id: 'keep', background: col('tint'),
      stripe: { enabled: true, side: 'left', width: pt(3), color: col('rust') },
      padding: { top: mm(3), right: mm(4), bottom: mm(3.2), left: mm(4) },
      titleStyle: { fontFamily: SANS, fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1.2),
        textTransform: 'uppercase', color: col('rust') },
      body: sansBody, marginTop: mm(3), marginBottom: mm(1), keepTogether: true },
    { id: 'bank', title: '', background: col('tint'), borderRadius: mm(1.5),
      padding: { top: mm(1.6), right: mm(3), bottom: mm(1.6), left: mm(3) },
      body: sansBody, marginTop: mm(1), marginBottom: mm(1.5), keepTogether: true },
    { id: 'test', title: '', backgroundEnabled: false,
      stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('slate') },
      padding: { top: mm(2.5), right: mm(0), bottom: mm(0), left: mm(0) },
      marginTop: mm(2), marginBottom: mm(0), keepTogether: true },
  ],
  paragraphStyles: [{ id: 'colophon', ...label, fontWeight: 400, letterSpacing: pt(0),
    textTransform: 'none', lineHeight: pt(10), textAlign: 'left', firstLineIndent: pt(0),
    marginTop: mm(3) }],
  header,
  footer,
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Source Serif 4': ['400', '400i', '700'], Archivo: ['400', '600', '700', '800'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadImage('fault-1500.jpg', asset('fault-1500.jpg'));
const resources = [{ id: 'fault', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'fault-1500.jpg', format: 'jpeg', width: 1500, height: 857 } }];
const doc = await buildDocumentWithFonts({ markdown, resources }, config, kitFonts(FONTS));
showPages(doc, { title: t({ en: 'The Restless Planet · Module 4',
  es: 'El planeta inquieto · Módulo 4' }) });

// #region attempt: a learner's saved test, as a learning platform hands it back
// The platform keeps each exercise's answers under its key; this learner checked three
// questions of the test, with two mistakes, and left the ordering one to do.
const tests = doc.exercises.filter((ex) => ex.style === 'test');
const mistakes = { 'test-statements': 2, 'test-distance': 1 }; // a wrong slot in each
const attempt = (ex) => ({ checked: true, n: 1, v: Object.fromEntries(ex.slots.map((slot, i) => {
  const right = exerciseSolutionValue(slot, ex);
  const wrong = slot.kind === 'truefalse' ? 3 - right : '180'; // 25 s × 8 km, slipped
  return [slot.key, mistakes[ex.anchor] === i ? wrong : right];
})) });
const kept = new Map(tests.filter((ex) => ex.anchor !== 'test-sequence')
  .map((ex) => [ex.anchor, JSON.stringify(attempt(ex))]));
const saved = new Map();
const platform = { // the three calls of localStorage, over the platform's record
  getItem: (key) => saved.get(key) ?? kept.get(key.split(':').pop()) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: (key) => saved.delete(key),
};
// #endregion

// #region screen: the HTML edition, answerable, and what the platform hears from it
const el = (tag, css, text) => Object.assign(document.createElement(tag),
  { textContent: text ?? '' }, { style: css });
const course = el('section', 'display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;'
  + 'padding: 24px 16px 0; font: 13px/1.5 system-ui, sans-serif; color: #d9d5cc');
course.id = 'course';
const frame = el('div', 'width: min(700px, 94vw); height: 720px; overflow: auto;'
  + 'border-radius: 6px; background: #2a2e35');
frame.innerHTML = renderToHtml(doc, { mode: 'single', background: palette.paper, padding: 16,
  resourceImageUrl: imageUrl });
const card = el('aside', 'width: min(300px, 94vw); padding: 14px 16px; border-radius: 6px;'
  + 'border: 1px solid #2c3038; background: #15181d');
const results = new Map();
function report(result) { // every check, fresh start and solution shown
  if (result.style !== 'test') return;
  results.set(result.key, result);
  const all = [...results.values()];
  const [right, total] = all.reduce(([r, n], x) => [r + x.right, n + x.total], [0, 0]);
  const score = Math.round((100 * right) / total);
  const done = all.length === tests.length && all.every((x) => x.checked || x.locked);
  const verdict = !done ? t({ en: 'incomplete', es: 'sin terminar' })
    : score >= exercises.digital.passingScore ? t({ en: 'passed', es: 'aprobado' })
      : t({ en: 'failed', es: 'suspenso' });
  card.replaceChildren(el('h2', 'margin: 0; font-size: 15px; color: #f4f1ea',
    t({ en: 'What the platform hears', es: 'Lo que recibe la plataforma' })),
  el('p', 'margin: 6px 0; font-size: 22px; color: #f4f1ea', `${score} % · ${verdict}`),
  el('p', 'margin: 0 0 8px', t({ en: `${right} of ${total} answers right in the test, pass `
    + `mark ${exercises.digital.passingScore} %`, es: `${right} de ${total} respuestas bien en el `
    + `examen, aprueba con el ${exercises.digital.passingScore} %` })),
  ...all.map((x) => el('p', 'margin: 0; font-variant-numeric: tabular-nums',
    `${t({ en: 'Exercise', es: 'Ejercicio' })} ${x.number} · `
    + `${x.right}/${x.total} · ${x.checked || x.locked ? t({ en: 'checked', es: 'comprobado' })
      : t({ en: 'to do', es: 'por hacer' })}`)));
}
attachExercises(frame, { storageKey: 'restless-planet:4', store: platform, onResult: report });
course.append(frame, card);
document.getElementById('pages').before(course);
const first = frame.querySelector(`[data-pt-ex="${tests[0].id}"]`);
frame.scrollTop = first.getBoundingClientRect().top - frame.getBoundingClientRect().top - 120;
// #endregion

// #region epub: the same pages as a fixed-layout EPUB, its exercises answerable in a reader
const epubFonts = (faces) => Promise.all(Object.entries(faces).flatMap(([family, specs]) =>
  specs.map(async (spec) => {
    const [weight, style, id] = [parseInt(spec, 10), spec.endsWith('i') ? 'italic' : 'normal',
      fontsourceId(family)];
    const res = await fetch(`${await fontsourceAt(id)}files/${id}-latin-${weight}-${style}.woff2`);
    if (!res.ok) throw new Error(`Fontsource has no ${family} ${weight} ${style}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { family, weight, style, format: 'woff2', bytes };
  })));
const epub = await renderToEpub([doc], { layout: 'fixed',
  metadata: { title: doc.metadata.title, subtitle: doc.metadata.subtitle, language: LANG,
    modified: new Date('2026-10-31T00:00:00Z') }, // fixed: the same bytes on every run
  fonts: await epubFonts(FONTS),
  resourceBytes: (fileId) => ({ bytes: imageBytes(fileId), mediaType: 'image/jpeg' }) });
const link = el('a', 'color: #d8a21a', `${RECIPE}.epub · ${Math.round(epub.length / 1024)} KB`);
link.href = URL.createObjectURL(new Blob([epub], { type: 'application/epub+zip' }));
link.download = `${RECIPE}.epub`;
document.getElementById('pt-actions').append(link);
// #endregion

// @kit core fonts viewer images
