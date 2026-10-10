// ═══ Postext Cookbook · Nº 091 · Vertical Chinese with citations in inline notes ══════
// https://postext.dev/en/cookbook/vertical-book-with-jiazhu-citations
// Code: MIT · Text: original (CC BY 4.0) · Pictures: none
// Fonts: Noto Serif SC, Noto Sans SC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerCitationEngine,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';
import { createCiteprocEngine, STYLES, LOCALES } from 'https://esm.sh/postext-citeproc';

const LANG = 'en'; // @lang: the language of the frame; the chapter is Chinese in both editions
const RECIPE = 'vertical-book-with-jiazhu-citations';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: black ink, one vermilion for the opener's rules, the paper of the page
const palette = {
  ink: '#22201c', vermilion: '#a8352a', muted: '#6d665d', paper: '#fbf8f1',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = Object.entries({ ...palette, 'main-color': palette.vermilion })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [SONG, HEI, KAI] = ['Noto Serif SC', 'Noto Sans SC', 'LXGW WenKai TC']; // 宋, 黑, 楷
const [BODY, LEAD] = [10.5, 19]; // pt: 五號 on a column pitch of 1.8 em
const cols = (n) => pt(n * LEAD); // n columns across the page

// #region answer: a note style set as 夾注, two half-size rows inside the column
// The GB/T 7714 note style turns each citation into a note. notes: 'warichu' sets the note
// in the column where the citation stands, in two rows at half the text size, the right
// row read first; a note longer than what is left of the column goes on in the next one.
// The list at the chapter's end comes from :::bibliography{scope=chapter}, numbered in
// the order the works are cited. Latin words turn sideways in the notes and in the list.
registerCitationEngine(createCiteprocEngine({ styles: STYLES, locales: LOCALES }));
const citations = {
  style: 'china-national-standard-gb-t-7714-2015-note',
  notes: 'warichu', // 夾注; 'footnote' sets the same notes at the foot of the page
  bibliography: { fontSize: em(0.9), entrySpacing: pt(0) },
};
const cjk = {
  grid: { enabled: true, charsPerLine: 36, linesPerPage: 15 },
  warichu: { fontSize: em(0.5), color: col('ink') }, // no brackets: the half size sets it off
};
// #endregion

// #region opener: 第三章 and the title in two ruled columns, the text after a blank one
// In the flow frame x runs down the column and y across the page, right to left, so a
// 'horizontal' rule is a vertical line on the sheet: three of them rule the two columns.
const [TITLE, PITCH] = [15, 1.6 * LEAD]; // pt: the title's size and its column pitch
const rule = (n) => ({ kind: 'rule', id: `rule-${n}`, direction: 'horizontal',
  thickness: pt(n === 1 ? 0.4 : 0.8), color: col('vermilion'),
  placement: { anchor: { to: 'container', edge: 'top-left' },
    offset: { y: pt(LEAD + n * PITCH) }, size: { width: 'fill' } } });
// A line of PITCH in column n (0, 1), its characters centred between two rules.
const title = (id, content, n, family, size, weight) => ({ kind: 'text', id, content,
  fontFamily: family, fontWeight: weight, fontSize: pt(size), lineHeight: PITCH / size,
  color: col('ink'), letterSpacing: pt(size * 0.25), align: 'left',
  placement: { anchor: { to: 'container', edge: 'top-left' },
    offset: { x: pt(2 * BODY), y: pt(LEAD + n * PITCH) } } }); // two characters down
const opener = { enabled: true, minHeight: cols(5), slot: { elements: [
  rule(0), rule(1), rule(2),
  title('number', '{number}', 0, HEI, 12, 700), // 第三章 in the first column, in 黑
  title('title', '{titleText}', 1, KAI, TITLE, 400), // the title in the second, in 楷
] } };
// #endregion

// The fore-edge: the book's title or the chapter's down the outer margin, the folio low.
const foreEdge = (id, content, parity, edge, y, pages) => ({
  kind: 'text', id, content, parity, pages, writingMode: 'vertical-rl',
  fontFamily: HEI, fontSize: pt(8), color: col('muted'), overflow: 'clip',
  placement: { anchor: { to: 'outer', edge }, offset: { y: em(y) } },
});
const header = { elements: [
  foreEdge('book', '{title}', 'even', 'top', 4, 'body'),
  foreEdge('chapter', '{chapterNumber}　{chapterTitle}', 'odd', 'top', 4, 'body'),
  foreEdge('folio', '{pageNumber}', 'all', 'bottom', -5, 'all'),
  // Across the foot of the opening page, in the edition's language: what is invented.
  { kind: 'text', id: 'imprint', content: '{subtitle}', pages: 'opener', fontFamily: SONG,
    fontSize: pt(6.5), color: col('muted'), align: 'center', overflow: 'wrap',
    placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { y: mm(-9) },
      size: { width: mm(100) } } },
] };

const config = () => ({
  // Traditional characters to the mainland's rules, as Beijing and Shanghai publishers set
  // classical scholarship (gotcha: cjk-locale-tag). The citations follow it: zh-TW terms.
  locale: 'zh-Hant-CN',
  colorPalette,
  citations,
  cjk,
  page: { sizePreset: 'custom', width: mm(140), height: mm(203), dpi: 150, // 大32開
    backgroundColor: col('paper'),
    margins: { top: mm(34), bottom: mm(26), left: mm(15), right: mm(19), mirror: true },
    pageNumbering: { format: 'trad-chinese-informal', startAt: 45 } }, // 四十五
  layout: { layoutType: 'single', writingMode: 'vertical-rl' }, // bound on the right
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
  },
  headings: { fontFamily: SONG, fontWeight: 700, color: col('ink'),
    levels: [{ level: 1, numberingTemplate: '第{1:一}章', numberSeparator: '　',
      breakBefore: { enabled: true, parity: 'odd' }, // a chapter opens on an odd page
      marginBottom: pt(0), advancedDesign: opener }] },
  header,
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same Chinese text in both

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build
  'Noto Serif SC': ['400', '700'], // SONG: the text, notes, list, imprint; the list's title
  'Noto Sans SC': ['400', '700'], // HEI: the fore-edge heads and folios; 第三章
  'LXGW WenKai TC': ['400'], // KAI: the chapter's title
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of what it sets; the Song also what the style writes.
const heading = markdown.match(/^# (.*?)(?: \{.*\})?$/m)[1]; // the title, no attributes
const book = markdown.match(/^title: "(.*)"/m)[1]; // 版刻叢談, the head of the even pages
const numerals = '第章一二三四五六七八九十';
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, `${markdown}卷等頁`, { vertical: true });
await loadCjkFonts({ [HEI]: ['400'] }, `${heading}${book}${numerals}`, { vertical: true });
await loadCjkFonts({ [SONG]: ['700'] }, markdown.match(/bibliography\{title="([^"]*)"/)[1],
  { vertical: true });
await loadCjkFonts({ [HEI]: ['700'] }, numerals);
await loadCjkFonts({ [KAI]: ['400'] }, heading);
const doc = await withLoadedFonts(() => buildDocument({ markdown }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'Vertical Chinese with citations in inline notes',
  es: 'Chino vertical con citas en notas dentro del renglón' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider }), `${RECIPE}.pdf`);

// @kit core fonts viewer pdf cjk
