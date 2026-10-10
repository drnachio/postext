// ═══ Postext Cookbook · Nº 083 · Tang poems facing their English verse ═══════════════
// https://postext.dev/en/cookbook/tang-poems-facing-english
// Code: MIT · Text: Tang poems, zh.wikisource; H. A. Giles, 1901, Project Gutenberg (PD)
// Fonts: Noto Serif TC, LXGW WenKai TC, Noto Sans TC, Source Serif 4 (OFL) · Needs postext ≥ 1.25.0
import { buildDocument, withLoadedFonts, renderPageToCanvas } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'tang-poems-facing-english';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// Ink and seal red on a cream paper, and a pale moon for the title page.
const palette = {
  ink: '#1f1b18', // text: a warm near-black
  seal: '#ad3526', // the accent: vermilion seal paste, for the poets, the rules and the seal
  moon: '#eadcb4', // the title page's moon
  leaf: '#f2e8cf', // the recto's tint, under the Chinese
  muted: '#6d655c', // running heads and the colophon
  paper: '#faf6ed', // a cream paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'seal (defaults)', value: { hex: palette.seal, model: 'hex' } },
];
const SERIF = 'Noto Serif TC'; // 明: the Chinese titles and the notes
const KAI = 'LXGW WenKai TC'; // 楷: the poems
const HEI = 'Noto Sans TC'; // 黑: the poet lines and the recto's running head
const ROMAN = 'Source Serif 4'; // the English: the Latin that Noto Serif TC is built on
const LABEL = 'Source Sans 3'; // English labels and folios
const [BODY, LEAD, SHI] = [10.5, 16, 16]; // pt: 五号 on a 16 pt pitch; the poems' size
const [CHARS, LINES] = [28, 30]; // the character grid: 28 ems by 30 lines
const TRIM = { width: 148, height: 210 }; // mm: 25開, a Taiwan trade trim
const [INNER, OUTER] = [18, 21]; // mm: minimum sides; the grid centres its measure between them
const MEASURE = (CHARS * BODY * 25.4) / 72; // 103.7 mm: 28 ems of 五号
const EDGE = OUTER + (TRIM.width - INNER - OUTER - MEASURE) / 2; // 23.6 mm: the outer text edge

// #region answer: the English opens the next verso, the Chinese the recto that faces it
const SINK = 6; // lines of LEAD under both titles, so the two poems start on the same line
const at = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });
// A title whose foot is 23 mm down at any size, and the poet's line under it at 24 mm.
const titled = (size, title, poet, under = []) => ({
  enabled: true, minHeight: pt(SINK * LEAD),
  slot: { elements: [...under,
    { kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(size), lineHeight: 1.2,
      align: 'center', overflow: 'wrap', color: col('ink'),
      placement: at(23 - (size * 1.2 * 25.4) / 72), ...title },
    { kind: 'text', id: 'poet', align: 'center', overflow: 'wrap', color: col('seal'),
      placement: at(24), ...poet },
  ] },
});
// Each style breaks to its own side of the spread (gotcha: style-inherits-break).
const english = { id: 'en', breakBefore: { enabled: true, parity: 'even' }, // a verso
  advancedDesign: titled(19, { fontFamily: ROMAN, italic: true },
    { content: '{attr.kicker}', fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 600,
      letterSpacing: pt(1.5), textTransform: 'uppercase' }) };
// The original on a tinted leaf: span 'page' lets the tint reach past the text column.
const chinese = { id: 'zh', span: 'page', breakBefore: { enabled: true, parity: 'odd' },
  advancedDesign: titled(28, { fontFamily: SERIF, fontWeight: 700, letterSpacing: pt(7) },
    { content: '{attr.poet}', fontFamily: HEI, fontSize: pt(9), letterSpacing: pt(1.5) },
    [{ kind: 'box', id: 'leaf', reserve: false, style: { backgroundColor: col('leaf') },
      placement: { anchor: { to: 'page', edge: 'top-left' },
        size: { width: 'fill', height: 'fill' } } }]) };
// #endregion

// #region verse: a Chinese row faces two lines of English on the grid both pages share
// Each English poem is a :::verse block: a line of verse a line of Markdown, Giles's indents
// as two leading spaces (two ems: bodyText.verse.indentStep), a blank line between stanzas.
// The block is centred on its longest line in the 103.7 mm measure, so a short poem and a
// long one both sit in the middle.
const verse = { id: 'verse', fontFamily: ROMAN, fontSize: pt(BODY), lineHeight: pt(LEAD) };
const shi = { id: 'shi', fontFamily: KAI, fontSize: pt(SHI), lineHeight: pt(2 * LEAD),
  textAlign: 'left', firstLineIndent: pt(0), // two lines of verse to a row: 2 × LEAD
  // Five characters and a full-width mark, twice: 12 ems, centred in the 28 of the grid.
  // A fixed left edge, and the note numbers after each row's 。: every character keeps its column.
  indent: pt((CHARS * BODY - 12 * SHI) / 2) };
// #endregion

// #region notes: glosses at the foot of the recto, in the edition's language
const footnotes = { placement: 'column', numbering: 'page', // the page foot; ① again on each page
  numberFormat: 'circled-decimal', markerSize: em(0.6), fontSize: pt(8), lineHeight: pt(11),
  color: col('ink'), textAlign: 'left', spaceAbove: pt(LEAD), spaceBelowRule: pt(5),
  spaceBetween: pt(3), separator: { width: 0.12, lineWidth: pt(0.6), color: col('seal') } };
// #endregion

// #region title: 唐詩 on a pale moon, with a seal
const onPage = (y, size) => ({ anchor: { to: 'page', edge: 'top' }, offset: { y: mm(y) },
  ...(size ? { size: { width: mm(size), height: mm(size) } } : {}) });
const [MOON_Y, MOON, HAN] = [36, 78, 60]; // mm: the moon's top and width; pt: the title
const UNDER = MOON_Y + MOON; // mm: the English lines start under the moon
const line = (id, content, y, style) => ({ kind: 'text', id, content, align: 'center',
  overflow: 'wrap', color: col('ink'), placement: onPage(y), ...style });
const titlePage = {
  id: 'title', span: 'page', runningChapter: false,
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'box', id: 'moon', placement: onPage(MOON_Y, MOON),
      style: { backgroundColor: col('moon'), borderRadius: mm(MOON / 2) } },
    line('han', '{titleText}', MOON_Y + MOON / 2 - (HAN * 25.4) / 144, { fontFamily: SERIF,
      fontWeight: 900, fontSize: pt(HAN), letterSpacing: pt(HAN / 4), lineHeight: 1 }),
    line('en', '{attr.en}', UNDER + 10, { fontFamily: LABEL, fontSize: pt(10), fontWeight: 600,
      letterSpacing: pt(3), textTransform: 'uppercase', color: col('seal') }),
    line('poets', '{attr.poets}', UNDER + 19, { fontFamily: ROMAN, fontSize: pt(12) }),
    line('giles', '{attr.english}', UNDER + 26, { fontFamily: ROMAN, fontSize: pt(11),
      italic: true }),
    // A seal reading 明月, the bright moon of three of the four poems, set down its square.
    { kind: 'box', id: 'seal', placement: onPage(170, 13),
      style: { backgroundColor: col('seal'), borderRadius: mm(1) } },
    line('seal-text', '明月', 170, { placement: onPage(170, 13), writingMode: 'vertical-rl',
      fontFamily: KAI, fontSize: pt(14), lineHeight: 1, color: col('paper'),
      verticalAlign: 'middle' }),
  ] } },
};
// #endregion

// #region heads: the book in English over the verso, the poet in Chinese over the recto
const head = (id, content, parity, edge, x, style) => ({ kind: 'text', id, content, parity,
  pages: 'opener', // every poem page opens with its title; a blank page stays bare
  fontFamily: LABEL, fontSize: pt(7.5), fontWeight: 600, color: col('muted'),
  placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(12) } }, ...style });
const header = { elements: [
  head('verso-folio', '{pageNumber}', 'even', 'top-left', EDGE, { color: col('ink') }),
  head('verso-book', '{subtitle}', 'even', 'top-left', EDGE + 8,
    { letterSpacing: pt(1.2), textTransform: 'uppercase' }),
  head('recto-poet', '{attr.name}', 'odd', 'top-right', -(EDGE + 8),
    { fontFamily: HEI, fontWeight: 400, fontSize: pt(8), letterSpacing: pt(3) }),
  head('recto-folio', '{pageNumber}', 'odd', 'top-right', -EDGE, { color: col('ink') }),
] };
// #endregion

const paragraphStyles = [shi, verse,
  // Justified like the body, and divided by the patterns of the edition's language (bodyText).
  { id: 'prose', fontFamily: ROMAN, fontSize: pt(10), lineHeight: pt(LEAD),
    firstLineIndent: mm(4) },
  { id: 'colophon', fontFamily: LABEL, fontSize: pt(7), lineHeight: pt(10), color: col('muted'),
    italicColor: col('muted'), textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD) },
];

const config = () => ({
  locale: 'zh-Hant', // the Chinese sets the rules; written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette,
  page: {
    width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
    // 23 + 17.5 mm leave 169.5 mm for 30 lines of 16 pt (169.3 mm): a head deeper than the foot.
    margins: { top: mm(23), bottom: mm(17.5), left: mm(INNER), right: mm(OUTER), mirror: true },
  },
  layout: { layoutType: 'single' },
  cjk: { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } },
  bodyText: { fontFamily: SERIF, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: false,
    hyphenation: { enabled: true, locale: LANG }, // no Chinese patterns: the Latin's language
    verse: { indentStep: em(1) } }, // Giles's two-space indents: two ems
  // The designs paint the titles; weight 400 keeps the heading blocks in a loaded face.
  // Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
  headings: { fontFamily: SERIF, fontWeight: 400, levels: [{ level: 1, marginTop: pt(0),
    marginBottom: pt(0), breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [titlePage, english, chinese],
  paragraphStyles, footnotes, header, footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Noto Serif TC': ['400', '700', '900'], // SERIF: the notes; the titles; 唐詩
  'LXGW WenKai TC': ['400'], // KAI: the poems and the seal
  'Noto Sans TC': ['400'], // HEI: the poet lines, the recto's head
  'Source Serif 4': ['400', '400i'], // ROMAN: the verse, the titles, the note on the text
  'Source Sans 3': ['400', '400i', '600'], // LABEL: kickers, the verso's head, folios, colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each Chinese face loads the files of the characters it sets
const grab = (re) => (markdown.match(re) ?? []).join('');
// Each poem to its closing `:::` (not the `:::space` between stanzas), then the note numbers.
const poems = grab(/:::paragraphs\{style="shi"\}[\s\S]*?\n:::(?=\n|$)/g) + '①②③④⑤⑥⑦⑧⑨⑩';
await loadFonts(FONTS, markdown);
await Promise.all([
  loadCjkFonts({ [SERIF]: ['400'] }, markdown + poems), // the notes and their ①, the heading blocks
  loadCjkFonts({ [SERIF]: ['700'] }, grab(/^# \S+(?= \{style="zh")|\*\*[^*]+\*\*/gm)),
  loadCjkFonts({ [SERIF]: ['900'] }, grab(/^# \S+(?= \{style="title")/gm)),
  loadCjkFonts({ [KAI]: ['400'] }, `${poems}明月`),
  loadCjkFonts({ [HEI]: ['400'] }, grab(/(?<=(?:poet|name)=")[^"]*/g)),
]);
// #endregion
const doc = await withLoadedFonts(
  () => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showPages(doc, { title: t({ en: 'Tang poems facing their English verse',
  es: 'Poemas Tang frente a su versión inglesa' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk · the Cookbook inlines cookbook/_kit/*.js here
