// ═══ Postext Cookbook · Nº 086 · A Chinese dictionary page with guide words ═════════
// https://postext.dev/en/cookbook/chinese-dictionary-page
// Code: MIT · Text: 康熙字典 (1716), Wikisource transcription, CC BY-SA 4.0 · Pinyin: CC BY 4.0
// Fonts: Noto Serif TC, Noto Sans TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import { buildDocument, renderPageToCanvas, clearMeasurementCache } from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-dictionary-page';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black and one cinnabar, the second ink of a two-colour dictionary
const palette = {
  ink: '#1f1b17', // text, guide words
  cinnabar: '#a52f28', // headwords, their readings, sense numbers, the thumb tab
  rule: '#bab2a4', // the column rule
  muted: '#5c554d', // folios, colophon
  paper: '#fbf8f2', // the page, and the letter reversed out of the tab
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the cinnabar.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.cinnabar })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SONG, HEI, KAI] = ['Noto Serif TC', 'Noto Sans TC', 'LXGW WenKai TC'];
const PT = 25.4 / 72; // mm in a point
const [BODY, LEAD] = [9, 15]; // pt: 小五 on a 15 pt line, the grid both columns share
const [CHARS, LINES] = [17, 31]; // characters to a column's line, lines to a column
const TRIM = { width: 140, height: 203 }; // mm: 大32开
const MIN = { top: 20, bottom: 16, side: 12 }; // mm: minimums the grid grows to centre the area
// The type area the grid sets (two columns and a 2-em gutter) and the margins it leaves.
const AREA = { width: (2 * CHARS + 2) * BODY * PT, height: LINES * LEAD * PT }; // 114.3 × 164
const SIDE = (TRIM.width - AREA.width) / 2; // 12.85 mm
const TOP = MIN.top + (TRIM.height - MIN.top - MIN.bottom - AREA.height) / 2; // 21.5 mm

// #region answer: the first and the last headword of each page in its running head
// Each headword is a level-2 heading, '## {天|tiān}'. {firstMark.h2} prints the text of the
// first one that starts on the page, without its reading, and {lastMark.h2} the last; a
// page on which none starts repeats the one in force. They stand at the outer corner, the
// folio outside them, over a hairline as wide as the type area.
const HEAD_Y = 11; // mm from the top edge to the top of the guide words
const [GUIDE, FOLIO] = [10.5, 8]; // pt
const head = (id, content, parity, x, size, extra) => ({ kind: 'text', id, content, parity,
  fontFamily: HEI, fontWeight: 700, fontSize: pt(size), lineHeight: 1, color: col('ink'),
  // A design line puts its baseline 0.8 of its height down: the folio drops to share it.
  placement: { anchor: { to: 'page', edge: parity === 'even' ? 'top-left' : 'top-right' },
    offset: { x: mm(parity === 'even' ? x : -x), y: mm(HEAD_Y + 0.8 * (GUIDE - size) * PT) } },
  ...extra });
const folio = { color: col('muted') };
const guideWords = [
  head('verso-folio', '{pageNumber}', 'even', SIDE, FOLIO, folio),
  head('verso-guide', '{firstMark.h2}—{lastMark.h2}', 'even', SIDE + 8, GUIDE),
  head('recto-guide', '{firstMark.h2}—{lastMark.h2}', 'odd', SIDE + 8, GUIDE),
  head('recto-folio', '{pageNumber}', 'odd', SIDE, FOLIO, folio),
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.5), color: col('ink'),
    placement: { anchor: { to: 'page', edge: 'top-left' },
      offset: { x: mm(SIDE), y: mm(HEAD_Y + 5.5) }, size: { width: mm(AREA.width) } } },
];
// #endregion

// #region tab: the initial T on the fore-edge, 19th of the 23 that start a pinyin syllable
const INITIALS = 'ABCDEFGHJKLMNOPQRSTWXYZ'; // no pinyin syllable starts with I, U or V
const STEP = AREA.height / INITIALS.length; // mm: 7.13, the 23 tabs fill the type area's height
const tab = (parity) => {
  const edge = parity === 'odd' ? 'top-right' : 'top-left'; // the fore-edge
  const at = (x, width) => ({ anchor: { to: 'page', edge },
    offset: { x: mm(parity === 'odd' ? x : -x), y: mm(TOP + INITIALS.indexOf('T') * STEP + 0.3) },
    size: { width: mm(width), height: mm(STEP - 0.6) } });
  return [ // 6 mm inside the trim and 3 mm past it, into the bleed; the letter on the 6 mm
    { kind: 'box', id: `tab-${parity}`, parity, placement: at(3, 9),
      style: { backgroundColor: col('cinnabar'), borderRadius: mm(1.2) } },
    { kind: 'text', id: `tab-letter-${parity}`, parity, content: 'T', fontFamily: HEI,
      fontWeight: 700, fontSize: pt(9), lineHeight: 1, color: col('paper'), align: 'center',
      verticalAlign: 'middle', placement: at(0, 6) },
  ];
};
// #endregion

// #region headwords: 15 pt Song Black in cinnabar, the pinyin over it in the line gap
// A heading with no design of its own keeps its reading: '## {天|tiān}' sets tiān over 天.
// Two grid lines hold the headword and a 7.5 pt reading, so every entry stays on the grid.
const cjk = {
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  // The composer counts ① ② as Latin and would put a quarter em between each number and
  // the character after it. The entries hold no Latin words, so the space goes.
  latinSpacing: pt(0),
  // The regular Song, not the heading's Black: a reading takes the face of its base.
  ruby: { fontFamily: SONG, fontSize: em(0.5), color: col('cinnabar') },
};
const headword = { level: 2, fontSize: pt(15), lineHeight: pt(2 * LEAD), marginTop: pt(0),
  marginBottom: pt(0) };
// #endregion

// #region senses: one paragraph to an entry, the sense numbers ① ② in cinnabar
// As the Kangxi Dictionary sets an entry: the rhyme-book readings (反切), then the senses
// run in, each after its number. '**②**' marks a number, and the text prints its bold in
// cinnabar: the only bold on these pages.
const bodyText = { fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('cinnabar'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: pt(0) }; // no indent: the headword opens the entry
// #endregion
const paragraphStyles = [
  { id: 'colophon', fontFamily: KAI, fontSize: pt(7.5), lineHeight: pt(11), color: col('muted'),
    firstLineIndent: pt(0), textAlign: 'left', marginTop: pt(LEAD) },
];

const config = () => ({ // a factory: the engine caches resolved configs per object
  // Taiwan's rules: full-width punctuation, centred in Noto Serif TC, and the basic
  // line breaking. Written out, never LANG (gotcha: cjk-locale-tag).
  locale: 'zh-Hant',
  colorPalette,
  page: { width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(MIN.top), bottom: mm(MIN.bottom), left: mm(MIN.side),
      right: mm(MIN.side), mirror: true } },
  layout: { layoutType: 'double', gutterWidth: pt(2 * BODY),
    columnRule: { enabled: true, color: col('rule'), lineWidth: pt(0.4) } },
  cjk,
  bodyText,
  headings: { fontFamily: SONG, fontWeight: 900, color: col('cinnabar'), textAlign: 'left',
    // Columns end level: the lines a column has left over go above its headwords, one to a
    // headword at most, so no entry stands three lines clear of the one before it.
    balancing: { maxLinesPerHeading: 1 },
    levels: [
      // No letter opens in these pages; restated all the same, since any headings object
      // drops the H1 break (gotcha: headings-drop-h1-break).
      { level: 1, breakBefore: { enabled: true, parity: 'any' } },
      headword,
    ] },
  paragraphStyles,
  header: { elements: [...guideWords, ...tab('even'), ...tab('odd')] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif TC': ['400', '700', '900'], // SONG: the entries and the readings; the headwords
  'Noto Sans TC': ['700'], // HEI: guide words, folios, the tab
  'LXGW WenKai TC': ['400'], // KAI: the colophon
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files of the characters it sets
// Fontsource cuts a Chinese face into about a hundred files (gotcha: cjk-fonts-slices).
// The regular Song sets the whole sample; each other voice gets only its own text.
const all = (re) => [...markdown.matchAll(re)].map((m) => m[1]).join('');
const heads = all(/^## \{(.+?)\|/gm);
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, markdown);
await loadCjkFonts({ [SONG]: ['700'] }, all(/\*\*(.+?)\*\*/g));
await loadCjkFonts({ [SONG]: ['900'] }, heads);
await loadCjkFonts({ [HEI]: ['700'] }, `${heads}—0123456789T`);
await loadCjkFonts({ [KAI]: ['400'] }, all(/style="colophon"\}\n(.+)\n/g));
// #endregion
// Pages 634 to 637 of the dictionary: page 1 is a verso, so the four lie as two spreads.
const continuation = { pageIndexOffset: 633, pageNumbering: { startAt: 634 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'A Chinese dictionary page',
  es: 'Una página de diccionario chino' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk · the Cookbook inlines cookbook/_kit/*.js here
