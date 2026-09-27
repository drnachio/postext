// ═══ Postext Cookbook · Nº 031 · Thesis back matter: appendix, glossary and index ═══
// https://postext.dev/en/cookbook/thesis-back-matter
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Libertinus Serif, Serif Display and Sans (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en')
const RECIPE = 'thesis-back-matter';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one ink; every colour is black or white, each under its own name
const palette = { ink: '#000000', band: '#000000', rule: '#000000', paper: '#ffffff' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// Bold, italic and list markers default to 'main-color': pointed at the ink, they print black.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.ink })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const TEXT = 'Libertinus Serif', DISPLAY = 'Libertinus Serif Display', LABEL = 'Libertinus Sans';
const TOP = 24, INNER = 25, OUTER = 31; // mm: a 120 mm measure, about 70 characters at 11 pt
const LEAD = 14.6; // pt: the body's leading, the grid every page is set on
const BAND = 62; // mm from the trim's top: the black band at the head of every opener

// #region answer: back matter as unnumbered heading styles, entries in hanging indents
// '# Glossary {style="glossary"}' in the Markdown picks a style. Each style starts a page
// of either parity, the appendix a recto (a style that sets no break inherits its level's
// 'odd': gotcha style-inherits-break), stays out of the chapter count (numbered: false, so
// its band has no numeral) and brings its own running heads; the glossary and the index
// set their pages in two columns until the next '#'. config() takes both lists below.
const twoColumns = { layoutType: 'double', gutterWidth: mm(6) };
const backMatter = (id, extra) => ({ id, numbered: false, breakBefore: { enabled: true,
  parity: 'any' }, advancedDesign: opener('Back matter'), header: sectionHeads, ...extra });
const headingStyles = () => [
  backMatter('appendix', { breakBefore: { enabled: true, parity: 'odd' }, // {letter="A"}
    header: appendixHeads, advancedDesign: opener('Appendix', '{attr.letter}') }),
  backMatter('glossary', { layout: twoColumns }),
  backMatter('references'),
  backMatter('index', { layout: twoColumns }),
];
// One paragraph per entry, in :::paragraphs{style="…"}: the turnover lines hang, so the
// first word of every entry stands clear at the left. Ragged, as APA asks of references,
// and so never hyphenated (gotcha: ragged-no-hyphenation).
const entries = (id, size, lead, hang, extra) => ({ id, fontSize: pt(size),
  lineHeight: pt(lead), textAlign: 'left', hangingIndent: em(hang), ...extra });
const paragraphStyles = () => [
  entries('term', 9.3, 12.4, 1), // the glossary: a bold term, then its definition
  entries('reference', 9.3, 12.4, 1.5, { spaceBetween: pt(2.4) }),
  entries('entry', 9, 11.6, 2), // the index, written by writeIndex()
];
// #endregion

// #region opener: a black band across the head of the page, the title reversed out of it
const SINK = 8; // lines reserved, 41.2 mm: 3.2 mm more than the band, and text on the grid
// Design text sets each baseline 0.8 of its line under the line's top, and a line is 1.2 × the
// size unless lineHeight says otherwise. In mm, a line's part above its baseline and below it:
const PT = 25.4 / 72;
const above = (size, lineHeight = 1.2) => 0.8 * size * lineHeight * PT;
const below = (size, lineHeight = 1.2) => 0.2 * size * lineHeight * PT;
const KICKER = 4.3, TITLE = BAND - TOP - 9.5; // mm under the text block's top: two baselines
// A bottom-aligned box that ends below() under a baseline sets its last line on it. The
// numeral's line is 0.72 of its size: a line taller than its box would hang from its top.
const text = (id, content, family, size, lineHeight, baseline, edge, w, extra) => ({
  kind: 'text', id, content, fontFamily: family, fontSize: pt(size), lineHeight,
  color: col('paper'), overflow: 'wrap', align: edge.endsWith('right') ? 'right' : 'left',
  verticalAlign: 'bottom', ...extra, placement: { anchor: { to: 'container', edge },
    size: { width: mm(w), height: mm(baseline + below(size, lineHeight)) } } });
// The mark: '{number}', empty on an unnumbered heading, or the appendix's '{attr.letter}'.
const opener = (label, mark = '{number}') => ({ enabled: true, minHeight: pt(SINK * LEAD),
  slot: { elements: [
    { kind: 'box', id: 'band', style: { backgroundColor: col('band') }, placement: {
      anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill', height: mm(BAND) } } },
    text('label', label, LABEL, 8, 1.2, KICKER, 'top-left', 80,
      { fontWeight: 700, letterSpacing: pt(1.6), textTransform: 'uppercase' }),
    text('title', '{titleText}', DISPLAY, 34, 1.04, TITLE, 'top-left', 84),
    text('mark', mark, DISPLAY, 118, 0.72, TITLE, 'top-right', 34),
    text('note', '{attr.note}', TEXT, 8.6, 1.3, TITLE, 'top-right', 44, { italic: true }),
  ] } });
// #endregion

// #region running-heads: the thesis on the verso, the section on the recto, a hairline under
const HEAD = 17.5, GAP = 9; // mm: the heads' baseline under the trim; the folio to the words
// Each text is placed by its top, above() over HEAD: the folio and the capitals share a baseline.
const head = (id, content, parity, edge, x, size = 7.5, extra) => ({ kind: 'text', id, content,
  parity, pages: 'body', fontFamily: LABEL, fontSize: pt(size), fontWeight: 700,
  letterSpacing: pt(1.3), textTransform: 'uppercase', color: col('ink'), ...extra, placement: {
    anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(HEAD - above(size)) } } });
const folio = { fontFamily: TEXT, fontWeight: 400, letterSpacing: pt(0) };
const heads = (recto) => ({ elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, 9.5, folio),
  head('verso', '{title}', 'even', 'top-left', OUTER + GAP),
  head('recto', recto, 'odd', 'top-right', -(OUTER + GAP)),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, 9.5, folio),
  // The header's container spans the text block, so one rule serves both pages.
  { kind: 'rule', id: 'hairline', pages: 'body', direction: 'horizontal', thickness: pt(0.5),
    color: col('rule'), placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { y: mm(HEAD + 2) }, size: { width: 'fill' } } },
] });
const chapterHeads = heads('Chapter {chapterNumber}. {chapterTitle}');
const sectionHeads = heads('{chapterTitle}'); // 'Glossary', 'References', 'Index'
// Openers drop the folio to the foot, centred under the text block, its baseline 12 mm below.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  pages: 'opener', ...folio, fontSize: pt(9.5), color: col('ink'), align: 'center',
  placement: { anchor: { to: 'container', edge: 'top' }, offset: { y: mm(12 - above(9.5)) } } }] };
// #endregion

// #region appendix: the letter comes from the heading, '# Interview guide {letter="A"}'
// In 1.4.1 a heading style cannot change the numbering: the appendix is unnumbered, and its
// letter feeds the band (see answer), the running head and a table type that counts A.1.
const appendixHeads = heads('Appendix {attr.letter}. {chapterTitle}');
const appendixTables = { ...defaultResourceTypes(LANG).find((type) => type.id === 'table'),
  id: 'table-a', numberingTemplate: 'A.{n}' }; // a copy of 'table'
// #endregion

const config = () => ({ // a factory, never a shared object (gotcha: config-cache-identity)
  colorPalette, header: chapterHeads, footer, layout: { layoutType: 'single' },
  page: { sizePreset: 'custom', width: mm(176), height: mm(250), dpi: 150, // B5
    margins: { top: mm(TOP), bottom: mm(24), left: mm(INNER), right: mm(OUTER), mirror: true } },
  bodyText: { fontFamily: TEXT, fontSize: pt(11), lineHeight: pt(LEAD), color: col('ink'),
    // 'Table 6.1' in roman and in ink, outside the palette's reach (gotcha: palette-skips-designs)
    referenceColor: col('ink'), referenceBold: false,
    firstLineIndent: mm(4.5), indentAfterHeading: false, minWordSpacing: 0.8, maxWordSpacing: 1.8 },
  // Exact heading margins (snapToGrid: false) keep the index's letters close to their entries,
  // and no lines are added above them; the chapter's heads measure whole grid lines.
  headings: { fontFamily: DISPLAY, fontWeight: 400, color: col('ink'), snapToGrid: false,
    balancing: { maxLinesPerHeading: 0 }, levels: [
      // The H1 break restated (gotcha: headings-drop-h1-break). span: 'page' (the styles inherit
      // it) sets the band above the columns: inside a column, its top would be clipped.
      { level: 1, numberingTemplate: '{1}', span: 'page', marginBottom: pt(0),
        advancedDesign: opener('Chapter'), breakBefore: { enabled: true, parity: 'odd' } },
      { level: 2, numberingTemplate: '{1}.{2}', fontSize: pt(14), lineHeight: pt(LEAD),
        marginTop: pt(LEAD * 1.5), marginBottom: pt(LEAD / 2) }, // three lines in all
      // The index's letters carry their space in their own line, so both columns start level.
      { level: 3, fontSize: pt(13), lineHeight: pt(21), marginTop: pt(0), marginBottom: pt(0) },
    ] },
  headingStyles: headingStyles(), paragraphStyles: paragraphStyles(),
  orderedLists: { marginTop: pt(LEAD / 2), marginBottom: pt(LEAD / 2) },
  unorderedLists: { bulletChar: '–' },
  resourceTypes: [...defaultResourceTypes(LANG), appendixTables], // tables 6.1… and A.1…
  // Captions in the text face, as APA sets a table's number and title.
  captionStyle: { fontSize: pt(9), position: 'above', gap: pt(4), note: { fontSize: pt(8) } },
  // Rules only and a bold header: filled header cells show seams between the columns.
  tableStyle: { rules: 'horizontal', borderColor: col('rule'), borderWidth: pt(0.5),
    headerBackgroundEnabled: false, headerFontSize: pt(9.5),
    bodyFontSize: pt(9.5), cellPadding: mm(1) },
  calloutStyles: [{ id: 'colophon', span: 'page', marginTop: pt(LEAD), backgroundEnabled: false,
    stripe: { enabled: true, side: 'top', width: pt(0.5), color: col('rule') },
    padding: { top: mm(2.5), right: mm(0), bottom: mm(0), left: mm(0) },
    body: { fontSize: pt(8), lineHeight: pt(10.5), firstLineIndent: pt(0), textAlign: 'left' } }],
});

// #region index: the index's page numbers, read off the laid-out pages
// The Markdown lists the entries in :::paragraphs{style="index-terms"}, one a line, as 'term:
// pattern' (a regular expression, in any case, from a word's start); two spaces: a sub-entry.
const TERMS = /^:::paragraphs\{style="index-terms"\}\n([\s\S]*?)\n:::$/m;
const KIND = { glossary: 'term', references: 'skip', index: 'skip' }; // other sections: 'text'
// Every searched line in one string (of the glossary, only the bold terms), with the page and
// kind of each character. A line ending in '-' runs into the next without it, a hard hyphen too
// ('meta-' + 'analyses' reads 'metaanalyses'), so every hyphen in a pattern is optional.
function pagesText(doc) {
  let text = ''; const at = [];
  const termOf = (line) => line.segments.filter((s) => s.bold).map((s) => s.text).join('');
  const read = (lines, page, kind) => (lines ?? []).forEach((line) => {
    const words = kind === 'term' ? termOf(line) : line.text; // the glossary: the term defined
    const part = words.endsWith('-') ? words.slice(0, -1) : `${words} `; // 'expos-' + 'itory'
    text += part;
    at.push(...Array(part.length).fill({ page, kind }));
  });
  let kind = 'text';
  for (const block of doc.blocks) {
    if (block.headingLevel === 1) kind = KIND[block.headingStyleId] ?? 'text'; // a new section
    if (kind !== 'skip') read(block.lines, doc.pages[block.pageIndex], kind);
  }
  for (const page of doc.pages) { // tables float: they hang on their page, not in doc.blocks
    page.floats?.flatMap((float) => float.resourceBlock?.table?.cells ?? [])
      .forEach((cell) => read(cell.lines, page, 'table'));
  }
  return { text, at };
}
// 'look-backs, *171*, 172, **174**': runs of text pages join (171–72, Chicago's short form); a
// page that names the term only in a table is set in italics, the glossary's page in bold.
const MARK = { text: '', table: '*', term: '**' };
function locators(pattern, { text, at }) {
  const pages = new Map(); // page number → 'text', 'table' or 'term'
  const start = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern.replaceAll('-', '-?')})`, 'giu');
  for (const m of text.matchAll(start)) { // from the start of a word: 'índice' too
    const { page: { pageNumberValue: n }, kind } = at[m.index];
    if (pages.get(n) !== 'text') pages.set(n, kind); // the text outranks a table on its page
  }
  const runs = [];
  for (const [n, kind] of [...pages].sort(([a], [b]) => a - b)) {
    const run = runs.at(-1);
    if (run?.kind === 'text' && kind === 'text' && n === run.to + 1) run.to = n;
    else runs.push({ from: n, to: n, kind });
  }
  return runs.map(({ from, to, kind }) => {
    const last = from % 100 && Math.trunc(from / 100) === Math.trunc(to / 100) ? to % 100 : to;
    return `${MARK[kind]}${from === to ? from : `${from}–${last}`}${MARK[kind]}`;
  }).join(', ');
}
// Sorts the entries, heads each letter and adds the numbers (none on the first pass).
function writeIndex(markdown, found) {
  const tree = [];
  for (const line of TERMS.exec(markdown)[1].split('\n').filter((row) => row.trim())) {
    const [, indent, term, pattern] = /^( *)(.+?): (.+)$/.exec(line);
    (indent ? tree.at(-1).subs : tree).push({ term, pattern, subs: [] });
  }
  const byTerm = (a, b) => a.term.localeCompare(b.term, LANG);
  const entry = ({ term, pattern }, lead = '') => {
    const pages = found && locators(pattern, found);
    if (found && !pages) console.warn(`Index: no page mentions “${term}”`);
    return `${lead}${term}${pages ? `, ${pages}` : ''}`;
  };
  const out = []; let letter = '';
  for (const main of tree.sort(byTerm)) {
    const initial = main.term.normalize('NFD')[0].toUpperCase(); // 'Á' files under A
    if (initial !== letter) out.push(`### ${(letter = initial)}`); // an H3 among the entries
    // Two en spaces behind a zero-width space indent a sub-entry (gotcha: latin-subset): the
    // font lacks an em space, which a plain PDF line sets at no width; a bare space is trimmed.
    out.push(entry(main), ...main.subs.sort(byTerm).map((sub) => entry(sub, '\u200B\u2002\u2002')));
  }
  return markdown.replace(TERMS, () => `:::paragraphs{style="entry"}\n${out.join('\n\n')}\n:::`);
}
// #endregion

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// A table from rows of 'cell|cell|cell'; aligns has a letter a column, l or r.
const table = (id, typeId, caption, note, widths, aligns, rows) => ({ id, typeId, kind: 'table',
  caption, note, createdAt: 0, updatedAt: 0, table: { model: { headerRowCount: 1,
    columnWidths: widths, rows: rows.map((row, r) => row.split('|').map((content, c) => ({
      content, isHeader: r === 0, align: aligns[c] === 'r' ? 'right' : 'left' }))) } } });
const resources = [
  table('findings', 'table', 'Main results by medium',
    'Means for 48 participants. Bias is the predicted minus the actual score.', [5, 1.4, 1.4],
    'lrr', ['Measure|Paper|Screen', 'Literal comprehension (of 10)|7.8|7.7',
      'Inferential comprehension (of 10)|6.4|5.6', 'Predicted score (%)|75|78',
      'Actual score (%)|71|66.5', 'Calibration bias (points)|+4.0|+11.5',
      'Look-backs per text|5.8|3.1']),
  table('session-plan', 'table-a', 'Timing of an interview session', undefined, [1, 6, 1.4],
    'llr', ['Part|Content|Minutes', '1|Welcome, consent and a check of the recorder|3',
      '2|Free recall of the two study texts|5',
      '3|Questions 1–4: reading habits, look-backs and confidence|12',
      '4|Questions 5–7: the two media and an ideal design|12', '5|Debrief|3']),
];

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Libertinus Serif': ['400', '400i', '700'], 'Libertinus Serif Display': ['400'],
  'Libertinus Sans': ['700'] }; // every face the pages use, loaded first (gotcha: fonts-first)

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// The thesis's sixth and last chapter opens on page 171, a recto.
const continuation = { pageIndexOffset: 170, pageNumbering: { startAt: 171 }, headings: { h1: 5 } };
const build = (source) => buildDocument({ markdown: source, resources, continuation }, config());
await loadFonts(FONTS, markdown);
// Two passes: the first lays the index out without numbers, the second writes them in. The
// index is the last section and opens a page, so no page before it moves between passes.
const draft = await buildWithFonts(() => build(writeIndex(markdown, null)), markdown);
const doc = build(writeIndex(markdown, pagesText(draft)));
showPages(doc, { title: 'Reading on Screens and Paper: the back matter' });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf · the Cookbook inlines cookbook/_kit/*.js here
