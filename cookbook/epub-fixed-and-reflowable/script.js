// ═══ Postext Cookbook · Nº 115 · One book, two EPUB 3 files: fixed and reflowable ════
// https://postext.dev/en/cookbook/epub-fixed-and-reflowable
// Code: MIT · Text: Aesop, tr. G. F. Townsend, 1867; L. Alas, Clarín, 1893 (PD) · Pictures: none
// Fonts: Libre Caslon Text, Libre Caslon Display, Jost (SIL OFL 1.1) · Needs postext ≥ 1.25.0
//
// A small book of three chapters, laid out once with buildBundle and written as two EPUB 3
// files with postext-epub: a fixed layout that keeps every printed page, and reflowable text
// that a phone or an e-reader sets again. Each file is read back with readEpub to list what
// a reading system will open, with a link to download it.
import {
  buildBundle, prepareFonts, withLoadedFonts, renderPageToCanvas,
} from 'https://esm.sh/postext';
import { renderToEpub, readEpub } from 'https://esm.sh/postext-epub';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'epub-fixed-and-reflowable';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, every one linked by id
const palette = {
  ink: '#211e1b', // text: a warm near-black
  accent: '#2d5872', // Prussian blue: kickers, rules, folios
  rule: '#c8c0b4', // the title page's hairline
  muted: '#6b645d', // running heads and the imprint
  paper: '#fbf8f1', // an off-white page, kept in the fixed-layout EPUB
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const [TEXT, DISPLAY, LABEL] = ['Libre Caslon Text', 'Libre Caslon Display', 'Jost'];
const [TRIM_W, TRIM_H, TOP, BOTTOM, INNER, OUTER] = [120, 190, 20, 22, 16, 15]; // mm
const MEASURE = TRIM_W - INNER - OUTER; // 89 mm: about 62 characters of Libre Caslon Text
const LEAD = 13.5; // pt: the body leading
const at = (to, edge, x = 0, y = 0) => ({ anchor: { to, edge }, offset: { x: mm(x), y: mm(y) } });
const caps = (size, color = 'accent') => ({ fontFamily: LABEL, fontSize: pt(size),
  fontWeight: 600, letterSpacing: pt(size * 0.2), textTransform: 'uppercase', color: col(color) });

// #region openers: a title page, then each chapter sunk under its kicker and a short rule
// Each line spans the measure and centres its text; the rule centres under the title.
const text = (id, content, fontFamily, size, placement, extra = {}) => ({ kind: 'text', id,
  content, fontFamily, fontSize: pt(size), color: col('ink'), align: 'center',
  overflow: 'wrap', lineHeight: 1.15, ...extra,
  placement: { ...placement, size: { width: 'fill', height: 'auto' } } });
const rule = (id, below, y) => ({ kind: 'rule', id, direction: 'horizontal', thickness: pt(0.75),
  color: col('accent'),
  placement: { ...at(below, 'below', (MEASURE - 10) / 2, y), size: { width: mm(10) } } });
const titlePage = { id: 'title-page', header: { elements: [] }, footer: { elements: [] },
  marginBottom: pt(0), advancedDesign: { enabled: true, minHeight: mm(120), slot: { elements: [
    text('author', '{author}', LABEL, 9, at('container', 'top-left', 0, 30), caps(9)),
    text('title', '{titleText}', DISPLAY, 34, at('#author', 'below', 0, 8)),
    rule('rule', '#title', 6),
    text('subtitle', '{subtitle}', TEXT, 11, at('#title', 'below', 0, 13), { italic: true }),
  ] } } };
const opener = { enabled: true, minHeight: mm(56), slot: { elements: [
  text('kicker', '{attr.kicker}', LABEL, 8, at('container', 'top-left', 0, 14), caps(8)),
  text('title', '{titleText}', DISPLAY, 28, at('#kicker', 'below', 0, 4)),
  rule('rule', '#title', 5),
] } };
// #endregion

// #region running-heads: the book on the verso, the chapter on the recto, folios outside
const head = (id, content, parity, edge, x, extra = {}) => ({ kind: 'text', id, content, parity,
  pages: 'body', ...caps(7, 'muted'), fontWeight: 500, placement: at('page', edge, x, 11),
  ...extra });
const folio = { fontFamily: TEXT, fontSize: pt(8.5), fontWeight: 400, letterSpacing: pt(0),
  color: col('accent') };
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', OUTER, folio),
  head('verso-title', '{title}', 'even', 'top', (OUTER - INNER) / 2),
  head('recto-title', '{chapterTitle}', 'odd', 'top', (INNER - OUTER) / 2),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -OUTER, folio),
] };
const footer = { elements: [head('drop-folio', '{pageNumber}', 'all', 'bottom', 0,
  { ...folio, pages: 'opener', placement: at('page', 'bottom', 0, -11) })] };
// #endregion

const config = () => ({
  locale: LANG,
  colorPalette,
  page: { sizePreset: 'custom', width: mm(TRIM_W), height: mm(TRIM_H), dpi: 150,
    backgroundColor: col('paper'), margins: { top: mm(TOP), bottom: mm(BOTTOM),
      left: mm(INNER), right: mm(OUTER), mirror: true } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: TEXT, fontSize: pt(9.6), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: mm(4), indentAfterHeading: false,
    hyphenation: { enabled: true }, optimalLineBreaking: true,
    avoidWidows: true, avoidOrphans: true, avoidRunts: true },
  headings: { fontFamily: TEXT, color: col('ink'), fontWeight: 400, levels: [
    // A book or chapter opens on the next page, left or right: no blank versos in an EPUB.
    { level: 1, fontFamily: DISPLAY, fontSize: pt(28),
      breakBefore: { enabled: true, parity: 'any' }, advancedDesign: opener },
    { level: 2, fontSize: pt(11.5), lineHeight: pt(LEAD), italic: true, color: col('accent'),
      marginTop: pt(LEAD), marginBottom: pt(LEAD / 2) }, // kept with its text by default
  ] },
  headingStyles: [titlePage],
  paragraphStyles: [
    // The imprint on the title's verso: the book's line in ink, then the notes in grey.
    { id: 'imprint-head', fontFamily: TEXT, fontSize: pt(8), lineHeight: pt(11.5),
      color: col('ink'), italicColor: col('ink'), textAlign: 'left', firstLineIndent: pt(0),
      marginBottom: pt(8) },
    { id: 'imprint', fontFamily: TEXT, fontSize: pt(8), lineHeight: pt(11.5),
      color: col('muted'), italicColor: col('muted'), textAlign: 'left',
      firstLineIndent: pt(0), spaceBetween: pt(5) },
    { id: 'asterism', fontSize: pt(9), color: col('accent'),
      textAlign: 'center', firstLineIndent: pt(0), marginTop: pt(LEAD / 2),
      marginBottom: pt(LEAD / 2) },
  ],
  header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
// The title page and its imprint, then three chapters: one document each in the book.
const chapters = [/* @content */ '', /* @content:c1 */ '', /* @content:c2 */ '',
  /* @content:c3 */ ''].map((markdown) => ({ markdown }));
const markdown = chapters.map((c) => c.markdown).join('\n\n'); // every word, for the fonts

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Libre Caslon Text': ['400', '400i'], // the text, the fable titles, the imprint
  'Libre Caslon Display': ['400'], // the book's and the chapters' titles
  Jost: ['500', '600'], // kickers, author, running heads
};

// #region embed: the same Fontsource files, as the EPUB's font files
// Only the latin files: they hold every letter of both samples. A text beyond Latin-1 would
// add each family's latin-ext file with its unicodeRange.
const epubFonts = (faces) => Promise.all(Object.entries(faces).flatMap(([family, specs]) =>
  specs.map(async (spec) => {
    const [weight, style] = [parseInt(spec, 10), spec.endsWith('i') ? 'italic' : 'normal'];
    const id = fontsourceId(family);
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/`
      + `${id}-latin-${weight}-${style}.woff2`);
    if (!res.ok) throw new Error(`Fontsource has no ${family} ${weight} ${style}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { family, weight, style, format: 'woff2', bytes };
  })));
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await prepareFonts(markdown, config(), kitFonts(FONTS));
const docs = await withLoadedFonts(() => buildBundle({ chapters, config: config() }),
  { ...kitFonts(FONTS), text: markdown });
showPages(docs, { title: `${docs[0].metadata.title} · EPUB 3` });

// #region answer: one layout, two EPUB 3 files: every printed page, or text that reflows
const { title, subtitle, author } = docs[0].metadata; // the first chapter's front matter
const book = {
  metadata: { title, subtitle, creators: [author], language: LANG,
    rights: t({ en: 'Public domain', es: 'Dominio público' }),
    // A fixed date gives the same bytes on every run; the identifier (a urn:uuid) comes
    // from the title, the author and the language, so a new version keeps its place.
    modified: new Date('2026-10-04T00:00:00Z') },
  // Every face the pages use, as bytes: a face left out is set in the reader's own
  // (gotcha: epub-embeds-given-fonts).
  fonts: await epubFonts(FONTS),
  onWarning: (w) => console.warn(`[epub] ${w.kind}`, w.family ?? w.fileId ?? w.detail),
};
// The same documents renderToPdf would print: one per chapter, in book order.
const fixed = await renderToEpub(docs, { ...book, layout: 'fixed' });
const reflowable = await renderToEpub(docs, { ...book, layout: 'reflowable' });
// #endregion

// #region shelf: each file read back: its spine, its contents and a link to keep it
const el = (tag, css, text) => Object.assign(document.createElement(tag),
  { textContent: text ?? '' }, { style: css });
const shelf = el('section', 'display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;'
  + 'padding: 24px 16px 0; color: #d9d5cc; font: 13px/1.5 system-ui, sans-serif');
shelf.id = 'epub';
for (const [layout, bytes] of [['fixed', fixed], ['reflowable', reflowable]]) {
  const epub = readEpub(bytes); // what a reading system opens: spine, contents, page list
  const file = `${RECIPE}-${layout}.epub`;
  const card = el('article', 'width: min(420px, 92vw); padding: 16px 18px;'
    + 'border: 1px solid #2c3038; border-radius: 6px; background: #15181d');
  const spine = el('ol', 'margin: 8px 0; padding-left: 22px; max-height: 9em; overflow: auto');
  spine.append(...epub.spine.map((item) => el('li', '', item.path.slice(epub.root.length))));
  const link = el('a', 'color: #d8a21a', `Download ${file}`);
  link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/epub+zip' }));
  link.download = file;
  card.append(el('h2', 'margin: 0; font-size: 15px; color: #f4f1ea', `EPUB 3 · ${epub.layout}`),
    el('p', 'margin: 4px 0 0', `${epub.spine.length} documents in the spine · `
      + `${epub.toc.length} contents entries · ${epub.pageList.length} print pages · `
      + `${Math.round(bytes.length / 1024)} KB`), spine, link);
  shelf.append(card);
}
document.getElementById('pages').before(shelf);
kitStatus(`${docs.length} documents laid out · two EPUB 3 files`);
// #endregion

// @kit core fonts viewer · the Cookbook inlines cookbook/_kit/*.js here
