// ═══ Postext Cookbook · Nº 127 · A hiragana picture book, spaced by phrase ══════════
// https://postext.dev/en/cookbook/hiragana-picture-book
// Code: MIT · Story and pictures: written and drawn for the recipe (CC BY 4.0)
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

// #region art: ten scenes drawn in code, a seeded hand for the waves and the stars
const W = 2186; // the art's width in its own units; its height is 1000 (ART is 2.186 : 1)
const COVER = Math.round((W * TRIM.h) / TRIM.w); // 1682: the cover is the page's shape
const P = palette;
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const svgDoc = (body, h = 1000, w = W) => `<svg xmlns="http://www.w3.org/2000/svg" `
  + `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const rect = (fill, y = 0, h = 1000, x = 0, w = W) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const wave = (y, amp, fill, seed, h = 1000, w = W) => { // a band whose top edge undulates
  const r = mulberry32(seed);
  let d = `M0 ${h} L0 ${y}`;
  for (let x = 0; x <= w; x += 120) d += ` Q${x + 60} ${y + (r() - 0.5) * 2 * amp} ${x + 120} ${y}`;
  return `<path d="${d} L${w} ${h} Z" fill="${fill}"/>`;
};
const ripples = (y0, y1, n, seed, stroke = '#ffffff') => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const x = r() * (W - 160) + 40; const y = y0 + r() * (y1 - y0); const l = 40 + r() * 70;
    return `<path d="M${x} ${y} q${l / 2} -14 ${l} 0" fill="none" stroke="${stroke}" `
      + 'stroke-width="7" stroke-linecap="round" opacity=".7"/>';
  }).join('');
};
const boat = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + `<path d="M-95 0 L95 0 L66 42 L-66 42 Z" fill="${P.boat}"/>`
  + `<path d="M-70 0 L0 -88 L70 0 Z" fill="#e0624c"/><path d="M0 -88 L0 0" stroke="#a83322" `
  + 'stroke-width="4"/></g>';
const girl = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + '<path d="M-14 120 L-14 170 M14 120 L14 170" stroke="#2e2a26" stroke-width="9" '
  + 'stroke-linecap="round"/><path d="M0 40 L-55 130 L55 130 Z" fill="#e7a83c"/>'
  + '<circle cx="0" cy="0" r="40" fill="#f6d8c2"/><path d="M-42 4 Q-44 -46 0 -46 Q44 -46 42 4 '
  + 'L30 -12 Q0 -30 -30 -12 Z" fill="#2e2a26"/><circle cx="-14" cy="6" r="4" fill="#2e2a26"/>'
  + '<circle cx="14" cy="6" r="4" fill="#2e2a26"/></g>';
const frog = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + '<ellipse cx="0" cy="40" rx="130" ry="44" fill="#a9a39a"/>'
  + '<ellipse cx="0" cy="0" rx="62" ry="42" fill="#5f9e47"/><circle cx="-34" cy="-38" r="20" '
  + 'fill="#5f9e47"/><circle cx="34" cy="-38" r="20" fill="#5f9e47"/><circle cx="-34" cy="-40" '
  + 'r="9" fill="#2e2a26"/><circle cx="34" cy="-40" r="9" fill="#2e2a26"/>'
  + '<path d="M-26 6 Q0 22 26 6" fill="none" stroke="#2e2a26" stroke-width="5"/></g>';
const fish = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + '<ellipse cx="0" cy="0" rx="42" ry="20" fill="#e8893a"/><path d="M38 0 L72 -22 L72 22 Z" '
  + 'fill="#e8893a"/><circle cx="-22" cy="-4" r="5" fill="#2e2a26"/></g>';
const heron = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">`
  + '<path d="M0 60 L0 230" stroke="#6e675f" stroke-width="8"/>'
  + '<ellipse cx="10" cy="40" rx="70" ry="38" fill="#ffffff" stroke="#c9c2b8" stroke-width="4"/>'
  + '<path d="M-48 30 Q-80 -40 -40 -110" fill="none" stroke="#ffffff" stroke-width="20" '
  + 'stroke-linecap="round"/><circle cx="-40" cy="-114" r="20" fill="#ffffff"/>'
  + '<path d="M-58 -116 L-118 -104 L-58 -104 Z" fill="#e3b33c"/><circle cx="-44" cy="-118" '
  + 'r="4" fill="#2e2a26"/></g>';
const gull = (x, y, s = 1) => `<path d="M${x - 50 * s} ${y} q${25 * s} ${-30 * s} ${50 * s} 0 `
  + `q${25 * s} ${-30 * s} ${50 * s} 0" fill="none" stroke="#2e2a26" stroke-width="7" `
  + 'stroke-linecap="round"/>';
const disc = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const stars = (n, seed) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => disc(r() * W, r() * 420, 3 + r() * 5, '#f7e7a8')).join('');
};
const hills = (y, fill, seed) => wave(y, 60, fill, seed);
const SCENES = {
  // The cover is the whole page, 260 × 200 mm: 2186 × 1682 units. The sky on the right
  // takes the title.
  cover: svgDoc(rect('#d9ecf2', 0, COVER) + disc(560, 260, 110, '#f6d27a')
    + wave(980, 70, P.grass, 3, COVER) + wave(1180, 24, P.river, 4, COVER)
    + ripples(1250, 1640, 22, 5) + boat(1000, 1330, 2.2), COVER),
  rain: svgDoc(rect('#e6eef0') + ripples(60, 360, 10, 7, '#9fb9c4') + rect('#f1e3c8', 640, 360)
    + `<rect x="760" y="560" width="660" height="90" rx="12" fill="#b07d53"/>`
    + girl(1260, 380, 1.4) + boat(880, 520, 0.9)),
  stream: svgDoc(rect('#e3f0f4') + hills(420, P.grass, 11) + wave(600, 22, P.river, 12)
    + ripples(650, 960, 14, 13) + girl(1800, 300, 1.5) + boat(1300, 700, 1)),
  frog: svgDoc(rect('#e3f0f4') + hills(380, P.grass, 21) + wave(560, 22, P.river, 22)
    + ripples(620, 960, 14, 23) + frog(1480, 600, 1.6) + boat(820, 760, 1)),
  bridge: svgDoc(rect('#e3f0f4') + hills(400, P.grass, 31) + wave(540, 20, P.river, 32)
    + '<path d="M300 560 Q1093 120 1886 560" fill="none" stroke="#9a6b45" stroke-width="60"/>'
    + ripples(600, 960, 12, 33) + boat(1093, 720, 1) + fish(1450, 860, 1.1) + fish(1680, 800, 0.9)
    + fish(1300, 930, 0.8)),
  heron: svgDoc(rect('#e3f0f4') + hills(300, '#a7cc8a', 41) + wave(420, 16, '#7aaec4', 42)
    + ripples(480, 960, 18, 43) + heron(1700, 230, 1.3) + boat(700, 700, 0.8)),
  dusk: svgDoc(rect('#f4c9b5') + disc(500, 520, 110, '#f29a5c') + hills(470, '#c79c87', 51)
    + wave(560, 18, '#c98f8a', 52) + ripples(600, 960, 14, 53, '#f6ddd0') + boat(1300, 760, 0.9)),
  night: svgDoc(rect('#2f3e5c') + stars(40, 61) + disc(1500, 200, 80, '#f7e7a8')
    + hills(470, '#253247', 62) + wave(560, 14, '#3f5878', 63)
    + '<path d="M1460 600 L1540 600 L1580 980 L1420 980 Z" fill="#f7e7a8" opacity=".35"/>'
    + ripples(600, 960, 12, 64, '#8aa3c2') + boat(900, 760, 0.9)),
  sea: svgDoc(rect('#d6ecf4') + disc(1700, 200, 70, '#f6d27a') + wave(420, 8, '#4f88a6', 71)
    + ripples(470, 960, 22, 72) + gull(900, 200, 1.2) + gull(1150, 140, 0.9) + boat(700, 650, 0.8)),
  window: svgDoc(rect('#efe2c8') + rect('#d6ecf4', 90, 640, 420, 1100)
    + rect('#4f88a6', 470, 260, 420, 1100) + boat(1250, 500, 0.4) + `<rect x="420" y="90" `
    + 'width="1100" height="640" fill="none" stroke="#b07d53" stroke-width="40"/><path '
    + 'd="M970 90 L970 730" stroke="#b07d53" stroke-width="24"/>' + rect('#b07d53', 730, 60)
    + girl(1750, 470, 1.6)),
};
// #endregion
const pictures = Object.keys(SCENES).map((id) => ({ id, typeId: 'picture', kind: 'svg',
  createdAt: 0, updatedAt: 0, placement: { span: 'side' },
  svg: { fileId: `${id}.svg`, width: W, height: id === 'cover' ? COVER : 1000 } }));

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [HAND]: FONTS[HAND] }, markdown, { vertical: true });
await loadCjkFonts({ [ROUND]: FONTS[ROUND] }, 'かみのふねおしまい', { vertical: true });
await Promise.all(Object.entries(SCENES).map(([id, svg]) => loadSvg(`${id}.svg`, svg)));
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources: pictures }, config()), markdown);
showBook(doc, { title: t({ en: 'A hiragana picture book',
  es: 'Un libro ilustrado en hiragana' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk
