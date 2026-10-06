// ═══ Postext Cookbook · Nº 127 · A hiragana picture book, spaced by phrase ══════════
// https://postext.dev/en/cookbook/hiragana-picture-book
// Code: MIT · Story: written for the recipe (CC BY 4.0) · Pictures: generated with diffusion models
// Fonts: Klee One, Zen Maru Gothic (SIL OFL 1.1) · Needs postext ≥ 1.16.1
// A picture book for small readers: hiragana only, a space between phrases, vertical.
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the frame; the story is Japanese in both editions
const RECIPE = 'hiragana-picture-book';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: the paper boat's red, river blues, a warm paper
const palette = {
  ink: '#2e2a26', // the text: a soft near-black
  boat: '#cf4430', // the boat, the title (4.6:1 on the paper)
  river: '#5d93ad',
  grass: '#86b665',
  muted: '#6e675f', // the colophon
  paper: '#fbf6ea',
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'boat (defaults)', value: { hex: palette.boat, model: 'hex' } },
];
// #endregion

const HAND = 'Klee One'; // 教科書体: the hand a child learns to write kana from
const ROUND = 'Zen Maru Gothic'; // the cover's title
const [BODY, LEAD] = [20, 36]; // pt: large kana, a line gap of 0.8 em
const PT = 25.4 / 72; // mm in a point
const TRIM = { w: 260, h: 200 }; // mm: a landscape picture book (横長)
const [CHARS, PICTURE, LINES] = [8, 14, 17]; // characters: text tier, picture tier; lines
const ART = { w: LINES * LEAD * PT, h: PICTURE * BODY * PT }; // mm: 215.9 × 98.8

// #region answer: わかち書き — a space between phrases, and lines that break only there
// The story is typed with an ordinary space (U+0020) after each phrase (文節). Japanese
// text may break between any two kana, so the space alone does not keep a phrase whole:
// keep-all drops the breaks between two letters and keeps those at a space, after 、。」
// and before 「. Kinsoku still applies.
const phrases = { wordBreak: 'keep-all' }; // cjk.wordBreak
const bodyText = {
  fontFamily: HAND, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  // Ragged: a justified line would stretch its spaces and its kana to fill the tier.
  textAlign: 'left', firstLineIndent: em(0),
};
// #endregion

// #region layout: the picture tier above, eight characters of text below it
// In vertical text 'left' is the top of the page: the side column is a tier that takes
// the pictures (floats), and the text runs in the tier under it, right to left.
const layout = {
  layoutType: 'oneAndHalf', writingMode: 'vertical-rl', sideColumnRole: 'floats',
  sideColumnSide: 'left', sideColumnPercent: 58, gutterWidth: pt(2 * BODY),
};
const cjk = { ...phrases, grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES } };
const resourceTypes = [{ id: 'picture', name: 'え', shortLabel: 'え', numberingTemplate: '{n}',
  resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }]; // pictures, no captions
// #endregion

// #region cover: the first picture across the page, the title down its sky
// In the flow frame of a vertical page x runs down the sheet and y leftward from its right
// edge; a box's width runs down the sheet.
const at = (down, across) => ({ anchor: { to: 'page', edge: 'top-left' },
  offset: { x: mm(down), y: mm(across) } });
const cover = {
  id: 'cover', numbered: false, toc: false, span: 'page', header: { elements: [] },
  breakBefore: { enabled: true, parity: 'any' },
  advancedDesign: { enabled: true, minHeight: mm(TRIM.w - 40), slot: { elements: [
    { kind: 'image', id: 'art', resourceId: 'cover', decorative: true,
      placement: { anchor: { to: 'bleed', edge: 'top-left' },
        size: { width: mm(TRIM.h), height: mm(TRIM.w) } } },
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: ROUND, fontWeight: 700,
      fontSize: pt(60), lineHeight: 1, letterSpacing: pt(6), color: col('boat'),
      placement: at(22, 34) },
    { kind: 'text', id: 'latin', content: '{attr.latin}', fontFamily: ROUND, fontWeight: 700,
      fontSize: pt(9), lineHeight: 1.4, color: col('ink'), placement: at(22, 62) },
  ] } },
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'ja', // written out, never LANG (gotcha: ja-locale-tag)
  colorPalette,
  resourceTypes,
  page: {
    sizePreset: 'custom', width: mm(TRIM.w), height: mm(TRIM.h), dpi: 150,
    backgroundColor: col('paper'),
    margins: { top: mm(14), bottom: mm(16), left: mm(22), right: mm(22), mirror: true },
  },
  layout,
  cjk,
  bodyText,
  headings: { fontFamily: ROUND, color: col('boat'),
    levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, // the H1 break
  headingStyles: [cover],
  paragraphStyles: [
    { id: 'end', fontFamily: ROUND, fontWeight: 700, color: col('boat'), textAlign: 'right',
      marginTop: pt(LEAD) }, // おしまい at the foot of its line
    { id: 'colophon', fontFamily: HAND, fontSize: pt(7.5), lineHeight: pt(LEAD),
      color: col('muted'), textAlign: 'left', marginTop: pt(LEAD) },
  ],
  header: { elements: [] }, // a picture book has no running heads and no folios
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, a space after each phrase

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { 'Klee One': ['400'], 'Zen Maru Gothic': ['700'] };

// #region pictures: ten paintings, declared at their pixel size under the file ids they load as
// The scenes have the tier's shape, 612 : 280 (ART); the cover has the page's, 260 : 200.
const PICTURES = { // id: [file, width, height, alt text in the book's language]
  cover: ['cover-1430.jpg', 1430, 1100, 'あおい かわに あかい かみの ふねが うかんで いる。'],
  rain: ['rain-1400.jpg', 1400, 641, 'まどべの ちゃぶだいで、みいちゃんが あかい かみで ふねを おって いる。'],
  stream: ['stream-1400.jpg', 1400, 641, 'みいちゃんが おがわに ふねを ながし、てを ふって いる。'],
  frog: ['frog-1400.jpg', 1400, 641, 'かわの いしの うえの かえるが、ながれて いく ふねに はなしかけて いる。'],
  bridge: ['bridge-1400.jpg', 1400, 641, 'きの はしの したを ふねが くぐり、ちいさな さかなが ついて くる。'],
  heron: ['heron-1400.jpg', 1400, 641, 'ひろい かわの きしで、しろい さぎが ふねを みおくって いる。'],
  dusk: ['dusk-1400.jpg', 1400, 641, 'ももいろの ゆうやけの かわに ふねが うかび、とおくに うみが みえる。'],
  night: ['night-1400.jpg', 1400, 641, 'まんげつが かわに うつり、ひかりの みちの そばを ふねが すすむ。'],
  sea: ['sea-1400.jpg', 1400, 641, 'あおい うみに でた ふねの うえを、かもめが とんで いる。'],
  window: ['window-1400.jpg', 1400, 641, 'みいちゃんが まどから、まちの むこうの うみを みて いる。'],
};
const pictures = Object.entries(PICTURES).map(([id, [fileId, w, h, altText]]) => ({
  id, typeId: 'picture', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText,
  placement: { span: 'side' }, bitmap: { fileId, format: 'jpeg', width: w, height: h } }));
// #endregion

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [HAND]: FONTS[HAND] }, markdown, { vertical: true });
await loadCjkFonts({ [ROUND]: FONTS[ROUND] }, 'かみのふねおしまい', { vertical: true });
// A design slot or ::resource names a resource, the resource a file id: load each file.
await Promise.all(Object.values(PICTURES).map(([file]) => loadImage(file, asset(file))));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources: pictures }, config()), markdown);
showBook(doc, { title: t({ en: 'A hiragana picture book',
  es: 'Un libro ilustrado en hiragana' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
