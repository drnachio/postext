// ═══ Postext Cookbook · Nº 076 · A pinyin primer: readings over every character ═══
// https://postext.dev/en/cookbook/pinyin-primer
// Code: MIT · Text: 三字經 (PD); pinyin, notes: CC BY 4.0 · Vignettes: diffusion models
// Fonts: LXGW WenKai TC, Noto Sans TC, Andika (SIL OFL 1.1) · Needs postext ≥ 1.25.0
import {
  buildDocument, withLoadedFonts, renderPageToCanvas, registerResourceImage,
} from 'https://esm.sh/postext';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'pinyin-primer';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: a primer's colours, every one linked by id
const palette = {
  ink: '#29241f', // the characters: a warm near-black
  pinyin: '#355a4d', // the readings, a shade off the ink so the two layers part
  red: '#bf3a2b', // lesson badges and the writing squares
  jade: '#2f7a5e', // the folio discs
  tint: '#edf4ea', // the band behind each lesson's title
  cream: '#faf3e4', // the note for families
  muted: '#6d665e', // series line, colophon
  paper: '#ffffff',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
// The engine's defaults link to 'main-color': point it at the red.
const colorPalette = Object.entries({ ...palette, 'main-color': palette.red })
  .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } }));
// #endregion
const [KAI, HEI, PINYIN] = ['LXGW WenKai TC', 'Noto Sans TC', 'Andika'];
const TEXT = 26; // pt: 一号, the size of a first reader's text
const LINE = 54; // pt: 2.1 × the size, so a reading fits between two lines
const CHARS = 12; // characters per line: the measure is 12 × 26 pt = 110 mm
const MEASURE = CHARS * TEXT * 25.4 / 72; // mm

// #region answer: one reading per character, in Andika, in a line gap wide enough to hold it
// {人之初|rén zhī chū} gives each character its own syllable (mono ruby): three readings for
// three characters, split on the spaces. The reading sits in the line gap, centred on its
// character; a syllable wider than the character widens that character's box by what the
// reading needs, less the quarter of the reading's size it may lend a neighbour.
const cjk = {
  // The type area in characters: 12 per line, 11 lines of 54 pt. The margins grow to centre it.
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: 11 },
  ruby: {
    fontFamily: PINYIN, // one-storey a and g, as a Chinese primer prints them
    // 9.9 pt over the text, 16 pt over the title: the widest syllables (xiāng, zhuān) still fit
    // over one character, so every couplet is 8 em long and keeps to the grid.
    fontSize: em(0.38),
    color: col('pinyin'),
  },
};
// The line pitch never changes for a reading: the gap between lines (54 − 26 = 28 pt) must
// hold it, or the build warns rubyExceedsLeading.
const text = {
  fontFamily: KAI, fontSize: pt(TEXT), lineHeight: pt(LINE),
  textAlign: 'center', firstLineIndent: pt(0), // one couplet to a line, centred
};
// #endregion

// #region opener: a tinted band with the lesson's badge and its drawing
const BAND = 68; // mm from the top edge
// Heading designs ignore parity: a place for the drawing on each side, 14 mm from the outer
// edge, named {left="…"} on a verso and {right="…"} on a recto. A missing attribute draws nothing.
const picture = (side, x) => ({ kind: 'image', id: `picture-${side}`,
  resourceId: `{attr.${side}}`, decorative: true, reserve: false,
  placement: { anchor: { to: 'page', edge: `top-${side}` }, offset: { x: mm(x), y: mm(14) },
    size: { width: mm(42), height: mm(42) } } });
const opener = { enabled: true, slot: { elements: [
  { kind: 'box', id: 'band', reserve: false, style: { backgroundColor: col('tint') },
    placement: { anchor: { to: 'page', edge: 'top-left' },
      size: { width: mm(184), height: mm(BAND) } } },
  picture('left', 14), picture('right', -14),
  { kind: 'text', id: 'lesson', content: '{titleText}', fontFamily: HEI, fontSize: pt(11),
    fontWeight: 700, letterSpacing: pt(2), color: col('paper'), align: 'center', overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top' } },
    box: { backgroundColor: col('red'), borderRadius: mm(3.5),
      padding: { top: mm(1.2), right: mm(3.6), bottom: mm(1.2), left: mm(3.6) } } },
] } };
// #endregion

// #region squares: six writing squares (田字格) with the lesson's characters to copy
// Design text prints no readings, so the squares hold the characters alone. A Han character
// is one em wide, so tracking of (pitch − em) sets one in the middle of each square.
const [SQ, GAP, WRITE] = [15, 3.4, 30]; // mm, mm, pt
const ROW = 6 * SQ + 5 * GAP; // mm
const X0 = (MEASURE - ROW) / 2; // the row is centred on the measure
const EM = WRITE * 25.4 / 72; // mm: one character at 30 pt, 10.6 mm wide
const squares = { enabled: true, slot: { elements: [
  { kind: 'text', id: 'label', content: '{titleText}', fontFamily: HEI, fontSize: pt(10),
    fontWeight: 700, letterSpacing: pt(1.5), color: col('red'), align: 'left', overflow: 'wrap',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(X0) } } },
  ...Array.from({ length: 6 }, (_, k) => ({ kind: 'image', id: `square${k}`, resourceId: 'tian',
    decorative: true, placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(X0 + k * (SQ + GAP)), y: mm(7) },
      size: { width: mm(SQ), height: mm(SQ) } } })),
  { kind: 'text', id: 'chars', content: '{attr.write}', fontFamily: KAI, fontSize: pt(WRITE),
    lineHeight: 1, letterSpacing: mm(SQ + GAP - EM), color: col('ink'), align: 'left',
    verticalAlign: 'middle', overflow: 'clip',
    placement: { anchor: { to: 'container', edge: 'top-left' },
      offset: { x: mm(X0 + (SQ - EM) / 2), y: mm(7) },
      size: { width: mm(ROW + GAP), height: mm(SQ) } } },
] } };
// #endregion

// The page number in a jade disc at the outer foot, the series beside it.
const DISC = 8; // mm
const at = (edge, x) => ({ anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-10) } });
const folio = (parity, edge, x, sign) => [
  { kind: 'text', id: `n-${parity}`, parity, content: '{pageNumber}', fontFamily: PINYIN,
    fontSize: pt(10), fontWeight: 700, color: col('paper'), align: 'center',
    verticalAlign: 'middle', overflow: 'clip',
    placement: { ...at(edge, x), size: { width: mm(DISC), height: mm(DISC) } },
    box: { backgroundColor: col('jade'), borderRadius: mm(DISC / 2) } },
  { kind: 'text', id: `s-${parity}`, parity, content: '{title}　第一冊', fontFamily: HEI,
    fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1), color: col('muted'),
    align: sign > 0 ? 'left' : 'right', verticalAlign: 'middle', overflow: 'clip',
    placement: { ...at(edge, x + sign * (DISC + 3)), size: { width: mm(60), height: mm(DISC) } } },
];

const config = () => ({
  // #region locale: Hong Kong's rules, the ones the Kai face is drawn for
  // Punctuation at full width, where LXGW WenKai TC centres it as Hong Kong and Taiwan print
  // it, and the basic line-breaking rules. Written out, never LANG (gotcha: cjk-locale-tag).
  locale: 'zh-HK',
  // #endregion
  colorPalette,
  page: { sizePreset: 'custom', width: mm(184), height: mm(260), dpi: 150, // 16开
    // Minimums, the head deeper than the foot (天头 over 地脚): cjk.grid adds what the
    // 12 × 11 type area (110 × 210 mm) leaves, 3.2 mm to each, so 27.2 over 23.2 mm.
    margins: { top: mm(24), bottom: mm(20), left: mm(18), right: mm(18), mirror: true } },
  layout: { layoutType: 'single' },
  cjk,
  bodyText: { ...text, color: col('ink'), boldColor: col('ink'), italicColor: col('ink'),
    referenceColor: col('ink') }, // references in ink, not in the default accent
  headings: { fontFamily: KAI, color: col('ink'), fontWeight: 400, textAlign: 'center',
    snapToGrid: false,
    levels: [
      // Every lesson opens a page, on either side; span 'page' paints the band under the text.
      { level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        marginBottom: mm(4), advancedDesign: opener },
      // The lesson's title: a plain heading, so its readings print (初号, 42 pt).
      { level: 2, fontSize: pt(42), lineHeight: pt(76), marginTop: pt(0), marginBottom: mm(6) },
      { level: 3, marginTop: mm(7), marginBottom: mm(6), advancedDesign: squares },
    ] },
  paragraphStyles: [
    { id: 'colophon', fontFamily: PINYIN, fontSize: pt(7), lineHeight: pt(9),
      color: col('muted'), textAlign: 'center', marginTop: mm(3) },
  ],
  calloutStyles: [
    { id: 'family', background: col('cream'), borderRadius: mm(3), snapToGrid: false,
      marginTop: mm(0), marginBottom: mm(0),
      padding: { top: mm(3), right: mm(5), bottom: mm(3.5), left: mm(5) },
      titleStyle: { fontFamily: PINYIN, fontSize: pt(8), fontWeight: 700, letterSpacing: pt(1.2),
        textTransform: 'uppercase', color: col('red') },
      body: { fontFamily: PINYIN, fontSize: pt(9.5), lineHeight: pt(13), color: col('ink'),
        boldColor: col('ink'), italicColor: col('ink'), textAlign: 'left',
        firstLineIndent: pt(0), paragraphSpacing: true } },
  ],
  header: { elements: [] },
  footer: { elements: [...folio('even', 'bottom-left', 20, 1),
    ...folio('odd', 'bottom-right', -20, -1)] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the writing square in code, the lessons' vignettes as watercolours
// The square: a red frame and a dashed cross, the guide for placing strokes.
const P = palette;
const mix = (a, b, t) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16)
  * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;
const tian = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" '
  + 'viewBox="0 0 15 15"><path d="M7.5 .4V14.6M.4 7.5H14.6" fill="none" stroke-width=".18" '
  + `stroke="${mix(P.red, P.paper, 0.55)}" stroke-dasharray=".7 .55"/><rect x=".2" y=".2" `
  + `width="14.6" height="14.6" fill="none" stroke="${P.red}" stroke-width=".35"/></svg>`;
// The vignettes: 人之初 a seedling, 昔孟母 the loom's shuttle, 養不教 a brush's first stroke,
// 玉不琢 a jade disc. Painted on white and multiplied by the band's tint, so they sit on it.
const VIGNETTES = ['sprout-800.jpg', 'shuttle-800.jpg', 'brush-800.jpg', 'jade-800.jpg'];
const artwork = [{ id: 'tian', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'tian.svg', width: 150, height: 150 } }, ...VIGNETTES.map((fileId) => ({
  id: fileId.split('-')[0], typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId, format: 'jpeg', width: 800, height: 800 } }))]; // at their pixels
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
// Every face the design uses. Layout measures with the browser's fonts, so the
// kit loads them from Fontsource before the first build.
const FONTS = {
  'LXGW WenKai TC': ['400'], // 楷: the text and the titles
  'Noto Sans TC': ['700'], // 黑: badges, labels, the series line
  Andika: ['400', '700'], // the pinyin, the notes, the folios
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region voices: each Chinese face loads the files of the characters it sets
// Fontsource cuts a Chinese face into about a hundred files by character range
// (gotcha: cjk-fonts-slices). The Kai sets the whole sample; the Hei only the headings'
// labels and the footer's series line, so it fetches a few files.
const labels = (markdown.match(/^#{1,3} [^{\n]*/gm) ?? []).join('') + '蒙學誦讀　第一冊';
await loadFonts(FONTS, markdown); // the latin files, and Andika's latin-ext for ǎ ǐ ǒ ǔ
await Promise.all([loadCjkFonts({ [KAI]: FONTS[KAI] }, markdown),
  loadCjkFonts({ [HEI]: FONTS[HEI] }, labels),
  loadSvg('tian.svg', tian), ...VIGNETTES.map((fileId) => loadImage(fileId, asset(fileId)))]);
// #endregion
// Page 1 is page 36 of the primer: a verso, so the four lessons lie as two spreads.
const continuation = { pageIndexOffset: 35, pageNumbering: { startAt: 36 } };
const doc = await withLoadedFonts(() => buildDocument({ markdown, resources: artwork,
  continuation }, config()),
  { ...kitFonts(FONTS), text: markdown });
showBook(doc, { title: t({ en: 'A pinyin primer', es: 'Una cartilla con pinyin' }) });

// @kit core fonts viewer images cjk
