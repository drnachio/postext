// ═══ Postext Cookbook · Nº 186 · Citations and statistics off the line edges ═══════════
// https://postext.dev/en/cookbook/clinical-paper-line-edges
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: STIX Two Text, IBM Plex Sans and Sans Condensed (SIL OFL 1.1) · Needs postext ≥ 1.78.0
import {
  buildDocumentWithFonts, renderPageToCanvas, registerCitationEngine,
} from 'https://esm.sh/postext';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'clinical-paper-line-edges';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: an indigo journal, a pale amber band for the proof marks
const palette = { ink: '#1b1e26', accent: '#2c4a7c', tint: '#e9eef6', mark: '#f7dfa9',
  muted: '#596173', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.accent })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SERIF, SANS, COND] = ['STIX Two Text', 'IBM Plex Sans', 'IBM Plex Sans Condensed'];
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER, GUTTER] = [170, 240, 20, 22, 17, 15, 6];
const MEASURE = TRIM_W - INNER - OUTER; // 138 mm: two columns of 66 mm, about 45 characters
const LEAD = 12.8; // pt, for 9.5 pt type

// #region answer: no line opens on a citation, no line ends or opens on a lone sign
const bodyText = {
  fontFamily: SERIF, fontSize: pt(9.5), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  referenceBold: false, textAlign: 'justify', firstLineIndent: mm(3.5),
  indentAfterHeading: false, hyphenation: { enabled: true },
  optimalLineBreaking: true, // the rules price breaks in the Knuth–Plass breaker
  avoidWidows: true, avoidOrphans: true, avoidRunts: true,
  // A line that opens on a citation, "[8, 9]" (citationBreak), or ends or opens on a sign
  // set between spaces, "p <" / "0.05" (operatorBreak). 'warn' reports each one and changes
  // nothing; 'avoid' adds the penalty to the demerits of those breaks and reports the ones
  // it keeps. The first proof sets 'warn' (see proofs).
  citationBreaks: 'avoid', operatorBreaks: 'avoid',
  // 10000 by default, what a line spaced to the limit costs. A 66 mm column offers few other
  // breaks; at 30000 the breaker takes looser lines, never past maxWordSpacing.
  citationBreakPenalty: 30000, operatorBreakPenalty: 30000,
};
// #endregion

// #region citations: numbered references in brackets, the list in the Vancouver order
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = { style: 'elsevier-vancouver', locale: t({ en: 'en-GB', es: 'es-ES' }),
  marker: 'brackets', collapseRanges: true, // [8, 9] and [4–6], set after a word space
  bibliography: { fontSize: em(0.8), lineHeight: pt(9.6), entrySpacing: pt(1),
    labelWidth: mm(6), labelAlign: 'right', doi: 'hide' } };
// #endregion

// #region title: the masthead band, article type, title, authors and the note
const text = (id, content, family, size, extra) => ({ kind: 'text', id, content, align: 'left',
  fontFamily: family, fontSize: pt(size), color: col('ink'), overflow: 'wrap', ...extra });
const at = (to, edge, x, y, width) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) },
  ...(width && { size: { width: mm(width), height: 'auto' } }) });
const caps = { fontFamily: COND, fontWeight: 600, letterSpacing: pt(1.2),
  textTransform: 'uppercase' };
const JOURNAL = t({ en: 'Ribera Paediatric Journal', es: 'Revista Pediátrica de la Ribera' });
const white = { ...caps, color: col('paper') };
const titleBlock = { enabled: true, minHeight: mm(58), slot: { elements: [
  { kind: 'box', id: 'band', style: { backgroundColor: col('accent') }, placement: {
    anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill', height: mm(13) } } },
  text('journal', JOURNAL, COND, 9, { ...white, placement: at('page', 'top-left', INNER, 5) }),
  text('issue', '{attr.issue}', COND, 9, { ...white, align: 'right',
    placement: at('page', 'top-right', -OUTER, 5, 60) }),
  text('kind', '{attr.kind}', COND, 8.5, { ...caps, color: col('accent'),
    placement: at('container', 'top-left', 0, 0, MEASURE) }),
  text('title', '{titleText}', SANS, 16, { fontWeight: 600, lineHeight: 1.18,
    placement: at('#kind', 'below', 0, 2.5, MEASURE - 6) }),
  text('authors', '{attr.authors}', SERIF, 10, { inlineMarks: true, // ^1^ → ¹
    placement: at('#title', 'below', 0, 3.5, MEASURE) }),
  text('affiliations', '{attr.affiliations}', SANS, 7.2, { inlineMarks: true, lineHeight: 1.35,
    color: col('muted'), placement: at('#authors', 'below', 0, 1.6, MEASURE) }),
  text('note', '{attr.note}', SANS, 7.2, { color: col('muted'),
    placement: at('#affiliations', 'below', 0, 2.4, MEASURE) }),
] } };
// #endregion

const small = { fontFamily: SANS, fontSize: pt(7.8), lineHeight: pt(10.6), textAlign: 'left',
  firstLineIndent: pt(0), color: col('ink'), boldColor: col('accent') };
const box = (id, spaced, more) => ({ id, border: { enabled: false }, snapToGrid: false,
  background: col('tint'), padding: mm(3), marginTop: pt(LEAD / 2), marginBottom: pt(LEAD),
  titleStyle: { ...caps, fontSize: pt(8), color: col('accent') },
  body: { ...small, paragraphSpacing: spaced }, ...more });
const calloutStyles = [box('abstract', true, { marginTop: pt(0) }), box('slip', false,
  { stripe: { enabled: true, side: 'top', width: pt(2.5), color: col('accent') } })];
const head = (id, content, parity, edge, x, extra) => text(id, content, COND, 7.8, {
  parity, pages: 'body', fontWeight: 500, letterSpacing: pt(0.4), color: col('muted'),
  overflow: 'clip', placement: at('page', edge, x, 11, 100), ...extra });
const [folio, right] = [{ fontWeight: 600, color: col('accent') }, { align: 'right' }];
const header = { elements: [
  head('v-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('v-title', '{attr.verso}', 'even', 'top-left', OUTER + 9), // the H1's attributes
  head('r-title', '{attr.recto}', 'odd', 'top-right', -OUTER - 9, right),
  head('r-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, { ...folio, ...right }),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom-right', -OUTER,
  { ...folio, ...right, pages: 'opener', placement: at('page', 'bottom-right', -OUTER, -12, 10) },
)] };

const sans = (size) => ({ fontFamily: SANS, fontSize: pt(size), fontWeight: 600 });
const config = {
  locale: t({ en: 'en-gb', es: 'es' }),
  colorPalette, citations, calloutStyles, header, footer, bodyText,
  checks: { contentInConfig: { allow: [JOURNAL] } }, // the journal's name (#849)
  headingStyles: [{ id: 'article', numbered: false, span: 'page', advancedDesign: titleBlock },
    { id: 'back', numbered: false, ...sans(9), color: col('ink') }],
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    pageNumbering: { startAt: 211 }, // the article opens on page 211 of the issue
    margins: { top: mm(TOP), bottom: mm(BOTTOM), left: mm(INNER), right: mm(OUTER),
      mirror: true } },
  layout: { layoutType: 'double', gutterWidth: mm(GUTTER) },
  headings: { fontFamily: SANS, color: col('accent'), fontWeight: 600, levels: [
    { level: 1, breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, ...sans(10.5), lineHeight: pt(LEAD), marginTop: pt(LEAD), marginBottom: pt(0) },
    { level: 3, ...sans(9), color: col('ink'), lineHeight: pt(LEAD), marginTop: pt(LEAD / 2),
      marginBottom: pt(0) },
  ] },
  paragraphStyles: [{ id: 'info', ...small }], // the article information, as journals set it
  markStyles: [{ id: 'edge', name: t({ en: 'Line edge', es: 'Borde de línea' }), color: col('ink'),
    background: col('mark'), paddingX: em(0.08), paddingTop: em(0.02), paddingBottom: em(0.08) }],
};

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'STIX Two Text': ['400', '400i', '600'], 'IBM Plex Sans': ['400', '600'],
  'IBM Plex Sans Condensed': ['500', '600'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region marks: each break a build reported, marked in the source of the second build
// The word before the citation and the citation, or the sign and the number on its other
// side, wrapped in :mark[…]: a band under ordinary text, so the breaks stay where they were.
const wordEnd = (s, i) => i + s.slice(i).search(/[\s;)]|[,.](?!\d)|$/); // 0.09, not 0
function sides(source, w, a, b) { // a warning names line a, before the break, by its source
  if (w.kind === 'citationBreak') { // "colleagues [@simel1991]"
    const cite = source.lastIndexOf('[@', b.sourceStart + 2);
    return [source.lastIndexOf(' ', cite - 2) + 1, source.indexOf(']', cite) + 1];
  }
  if (w.edge === 'end') { // "LR− = 0.09": the sign ends line a, the number opens line b
    const from = source.lastIndexOf(` ${w.text} `, a.sourceEnd) + 1;
    return [from, wordEnd(source, from + w.text.length + 1)];
  }
  const sign = source.indexOf(` ${w.text} `, b.sourceStart - 1); // the sign opens line b
  return [source.lastIndexOf(' ', sign - 1) + 1, sign + 1 + w.text.length];
}
function markBreaks(source, doc, found) {
  const pairs = doc.blocks.flatMap((b) => b.lines.map((line, i) => [line, b.lines[i + 1]]));
  const spans = new Map();
  for (const w of found) {
    const [a, b] = pairs.find(([line]) => line.sourceStart === w.sourceStart) ?? [];
    const [from, to] = b ? sides(source, w, a, b) : [];
    if (from > a?.sourceStart && to > from && to <= b.sourceEnd) spans.set(from, to);
  }
  return [...spans].sort(([x], [y]) => y - x).reduce((md, [from, to]) => `${md.slice(0, from)}`
    + `:mark[${md.slice(from, to)}]{style="edge"}${md.slice(to)}`, source);
}
// #endregion

// #region proofs: the same article twice, 'warn' then 'avoid', each with a query slip
const KIND = { citationBreak: t({ en: 'citation', es: 'cita' }),
  operatorBreak: t({ en: 'sign', es: 'signo' }) };
const edge = (s, end) => (end ? s.trim().split(/\s+/).slice(-2) : s.trim().split(/\s+/)
  .slice(0, 2)).join('\u00a0').replace(/[.,;]$/, ''); // no-break spaces: no breaks of its own
const query = (doc, w) => `${t({ en: 'p.', es: 'pág.' })}\u00a0${doc.pages[w.pageIndex]
  .pageLabel}, ${KIND[w.kind]}: …${edge(w.lines[0], true)}\u00a0/ ${edge(w.lines[1])}…`;
const slip = (mode, doc, found) => ['', `:::callout{type="slip" title="${mode === 'warn'
  ? t({ en: 'First proof: queries', es: 'Primeras pruebas: consultas' })
  : t({ en: 'Second proof: queries', es: 'Segundas pruebas: consultas' })}"}`,
`citationBreaks / operatorBreaks: '${mode}' · ${found.length} ${found.length === 1
  ? t({ en: 'break', es: 'corte' }) : t({ en: 'breaks', es: 'cortes' })}.`,
...found.flatMap((w) => ['', query(doc, w)]), ':::', ''].join('\n');
const build = (md, mode) => buildDocumentWithFonts({ markdown: md }, { ...config,
  bodyText: { ...bodyText, citationBreaks: mode, operatorBreaks: mode } }, kitFonts(FONTS));
async function proof(mode) {
  const plain = await build(markdown, mode); // pass 1: where the breaks are
  const found = (plain.contentWarnings ?? []).filter((w) => /^(citation|operator)Break$/
    .test(w.kind));
  return build(markBreaks(markdown, plain, found) + slip(mode, plain, found), mode); // pass 2
}
const docs = { warn: await proof('warn'), avoid: await proof('avoid') };
// #endregion

const TITLE = t({ en: 'Citations and statistics off the line edges',
  es: 'Citas y estadísticos fuera de los bordes de línea' });
const show = (key) => showPages(docs[key], { title: `${TITLE} · '${key}'` });
const button = (key) => Object.assign(document.createElement('button'),
  { type: 'button', textContent: key, onclick: () => show(key) });
document.getElementById('pt-actions').prepend(button('warn'), button('avoid'));
show('warn');

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
