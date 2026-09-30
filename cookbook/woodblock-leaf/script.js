// ═══ Postext Cookbook · Nº 085 · A woodblock leaf: double frame, rules and centre strip ═══
// https://postext.dev/en/cookbook/woodblock-leaf
// Code: MIT · Text: 論語集註 卷一, 四庫全書 copy, zh.wikisource (CC BY-SA 4.0) · Pictures: none
// Fonts: Noto Serif TC, LXGW WenKai TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
// A title page and three leaves of Zhu Xi's commentary on the Analects, set as a woodblock
// printed them: each spread is one leaf, its two halves either side of the centre strip
// (版心), the text in a double frame with a rule between every two columns, the commentary
// folded into two small rows inside the column.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the colophon; the leaves are Chinese in both
const RECIPE = 'woodblock-leaf';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: one ink on a warm paper, and a red for the editor's note
const palette = {
  ink: '#1f1b17', // the text, as the block printed it
  rule: '#1f1b17', // the frame, the column rules and the fish tail: the same block, same ink
  vermilion: '#a3301f', // 朱: this edition's note, on the title page; 5.9 : 1 on the paper
  muted: '#6d6358', // the colophon
  paper: '#f2ead8',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'defaults', value: { hex: palette.ink, model: 'hex' } },
];
// #endregion
const [SONG, KAI] = ['Noto Serif TC', 'LXGW WenKai TC']; // 宋: the block's face; 楷: the title
// The leaf in points: 半葉九行，行十七字, a 20 pt character on a column pitch of 29 pt.
const [BODY, PITCH, CHARS, LINES] = [20, 29, 17, 9];
const HALF = 17; // half the centre strip, from the fold to the column rule beside it
const GAP = 4.5; // the text to the inner frame line, as a character to a column rule
const RULES = 4.5; // the thin inner frame line to the heavy outer one (文武線)
const [HEAD, FOOT, SIDE] = [164, 82, 60]; // paper outside the frame: 天頭 twice 地腳
const TOP = HEAD + RULES + GAP; // the page's margins
const BOTTOM = FOOT + RULES + GAP;
const OUTER = SIDE + RULES;
const W = HALF + LINES * PITCH + OUTER; // a half-leaf, 121 × 213 mm
const H = TOP + CHARS * BODY + BOTTOM;

// #region answer: a half-leaf to a page, so that every spread is one whole leaf
// A block printed both halves of a leaf (葉) at once, the centre strip between them. Each
// page here is a half-leaf. Page 1, the title, is a recto: in a book bound on the right it
// stands alone left of the spine, and every spread after it is one leaf, read from the
// right. The grid sets the block's 9 columns of 17 characters; the text has no
// punctuation, so every column ends on its 17th character.
const page = {
  sizePreset: 'custom', width: pt(W), height: pt(H), dpi: 150,
  backgroundColor: col('paper'),
  // left is the inner margin, the half of the centre strip on this side of the fold
  margins: { top: pt(TOP), bottom: pt(BOTTOM), left: pt(HALF), right: pt(OUTER), mirror: true },
};
const layout = { layoutType: 'single', writingMode: 'vertical-rl' }; // bound on the right
const cjk = { grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } };
// Postext numbers pages, not leaves. Each leaf opens with a hidden level-1 heading, which
// prints nothing and starts a right-hand page; the centre strip prints their count.
const leaf = {
  level: 1, hidden: true, numberingTemplate: '{1:一}', // 一, 二, 三
  breakBefore: { enabled: true, parity: 'even' }, // gotcha: headings-drop-h1-break
};
// #endregion

// #region frame: the double frame, a rule between every two columns, the centre strip
// Header elements are placed on the sheet, pt from the page's top left corner. Both halves
// read right to left: a right-hand page (even) from the outer frame to the fold, a
// left-hand page (odd) from the fold to the outer frame.
const at = (x, y) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(x), y: pt(y) } });
// A column of characters stands in the middle of its pitch, so the rules between columns
// fall on whole pitches. The k-th, counted from the right edge of the type area:
const line = (parity, k) =>
  (parity === 'even' ? HALF + LINES * PITCH : W - HALF) - k * PITCH;
const [Y0, Y1] = [TOP - GAP, TOP + CHARS * BODY + GAP]; // the inner frame's top and foot
// A rule is drawn from its x, a box's border inside the box: each is set so that the line
// is centred where it belongs.
const rule = (id, x, parity) => ({ kind: 'rule', id, parity, direction: 'vertical',
  thickness: pt(0.6), color: col('rule'),
  placement: { ...at(x - 0.3, Y0), size: { height: pt(Y1 - Y0) } } });
const frame = (id, [x0, x1], parity) => [[RULES, 1.8], [0, 0.6]].map(([out, t], i) => ({
  kind: 'box', id: `${id}-${i}`, parity, style: { borderColor: col('rule'), borderWidth: pt(t) },
  placement: { ...at(x0 - out - t / 2, Y0 - out - t / 2),
    size: { width: pt(x1 - x0 + 2 * out + t), height: pt(Y1 - Y0 + 2 * out + t) } } }));
// The middle of the strip, where its text stands: the fold, halfway between its two rules.
// Both pages draw the text whole, and each shows its half.
const mid = (parity) => (parity === 'even' ? 0 : W);
const strip = (id, content, parity, y) => ({ kind: 'text', id: `${id}-${parity}`, parity,
  content, writingMode: 'vertical-rl', fontFamily: SONG, fontSize: pt(11), color: col('ink'),
  align: 'left', overflow: 'clip',
  placement: { ...at(mid(parity) - HALF, TOP + y),
    size: { width: pt(2 * HALF), height: pt(CHARS * BODY - y) } } });
// The fish tail (魚尾): a black band with a notch, from one side of the strip to the other.
const FISH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 18">
  <path d="M0 0H32V13L16 6L0 13Z" fill="${palette.rule}"/></svg>`;
const resources = [{ id: 'fish', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'fish.svg', width: 32, height: 18 } }];
const fish = (parity) => ({ kind: 'image', id: `fish-${parity}`, parity, resourceId: 'fish',
  decorative: true, placement: { ...at(mid(parity) - HALF + 0.3, TOP + 3.4 * BODY),
    size: { width: pt(2 * HALF - 0.6), height: 'auto' } } });
const furniture = (parity) => [
  // The frame runs 40 pt past the fold, where the other half of the leaf takes it on.
  ...frame(`frame-${parity}`, parity === 'even' ? [-40, line(parity, 0)]
    : [line(parity, LINES), W + 40], parity),
  // Nine rules: eight between the columns (界行) and the side of the strip.
  ...Array.from({ length: LINES }, (_, i) =>
    rule(`rule-${i}-${parity}`, line(parity, parity === 'even' ? i + 1 : i), parity)),
  strip('book', '{title}', parity, 0.7 * BODY), // 書名, above the fish tail
  fish(parity),
  strip('juan', '卷一', parity, 5.2 * BODY), // 卷次, under it
  strip('leaf', '{chapterNumber}', parity, 11.5 * BODY), // 葉碼, the leaf's number
];
// #endregion

// #region title: the title page (內封), a half-leaf in a closed frame, three columns
// A heading style of its own: hidden and unnumbered, so the leaves still count from 一, and
// its header replaces the leaves' furniture on its page. Its attributes hold the byline,
// this edition's note in red and the colophon, the one line that changes with the language.
const CELLS = [0, 2, LINES - 2, LINES]; // the byline, title and note, in pitches from the right
const cell = (i) => [CELLS[i], CELLS[i + 1]];
const column = (id, content, [k0, k1], style) => ({ kind: 'text', id, content,
  writingMode: 'vertical-rl', color: col('ink'), overflow: 'clip', verticalAlign: 'middle',
  placement: { ...at(line('odd', k1), TOP),
    size: { width: pt((k1 - k0) * PITCH), height: pt(CHARS * BODY) } }, ...style });
const titlePage = {
  id: 'title', numbered: false, hidden: true, breakBefore: { enabled: true, parity: 'any' },
  footer: { elements: [] },
  header: { elements: [
    ...frame('title-frame', [line('odd', LINES), line('odd', 0)]),
    rule('title-rule-1', line('odd', CELLS[1])), rule('title-rule-2', line('odd', CELLS[2])),
    column('byline', '{attr.byline}', cell(0), { fontFamily: SONG, fontSize: pt(14),
      align: 'left' }),
    column('book', '{title}', cell(1), { fontFamily: KAI, fontSize: pt(60),
      letterSpacing: pt(20), align: 'center' }),
    column('note', '{attr.note}', cell(2), { fontFamily: KAI, fontSize: pt(11),
      lineHeight: pt(0.6 * PITCH), color: col('vermilion'), align: 'right' }), // 3 in 2 pitches
    { kind: 'text', id: 'colophon', content: '{attr.colophon}', fontFamily: SONG,
      fontSize: pt(6.5), lineHeight: 1.4, color: col('muted'), align: 'left', overflow: 'wrap',
      placement: { ...at(line('odd', LINES) - RULES - 0.9, Y1 + RULES + 16),
        size: { width: pt(LINES * PITCH) } } },
  ] },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette, page, layout, cjk,
  header: { elements: [...furniture('even'), ...furniture('odd')] },
  footer: { elements: [] },
  bodyText: {
    fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(PITCH), color: col('ink'),
    boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
    textAlign: 'justify', firstLineIndent: pt(0), indentAfterHeading: false, // 頂格
  },
  headings: { fontFamily: SONG, fontWeight: 400, color: col('ink'), levels: [leaf] },
  headingStyles: [titlePage],
  // The byline's seven characters (宋　朱子　集註) end at the foot of the column.
  paragraphStyles: [{ id: 'byline', indent: em(CHARS - 7), firstLineIndent: pt(0),
    textAlign: 'left' }],
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md: the same leaves, another colophon

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  'Noto Serif TC': ['400'], // 宋: the text, the notes, the centre strip, the colophon
  'LXGW WenKai TC': ['400'], // 楷: the title page's title and this edition's note
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each face loads the files of the characters it sets
// Song sets the leaves, the strip and its leaf numbers; Kai only the title page's title
// and note (gotcha: cjk-fonts-slices). No punctuation: no vertical forms to load.
const note = markdown.match(/note="([^"]*)"/)?.[1].replaceAll('\\n', '') ?? '';
await loadFonts(FONTS, markdown); // their Latin files: the colophon
await loadCjkFonts({ [SONG]: FONTS[SONG] }, `${markdown}論語集註卷一二三四五六七八九十`);
await loadCjkFonts({ [KAI]: FONTS[KAI] }, `論語集註${note}`);
// #endregion
await loadSvg('fish.svg', FISH);
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources }, config()), markdown);
showBook(doc, { title: t({ en: 'A woodblock leaf: double frame, rules and centre strip',
  es: 'Una hoja xilográfica: marco doble, filetes y franja central' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
