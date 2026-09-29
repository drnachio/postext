// ═══ Postext Cookbook · Nº 080 · A vertical reader with zhuyin to the right ═════════
// https://postext.dev/en/cookbook/zhuyin-vertical-reader
// Code: MIT · Text: Han Feizi, zh.wikisource (CC BY-SA 4.0) · Pictures: drawn in code
// Fonts: Iansui, LXGW WenKai TC, Noto Serif TC, Noto Sans TC (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  loadVerticalAlternates,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'zhuyin-vertical-reader';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// #region palette: semantic colours, every one linked by id
const palette = {
  ink: '#2b2520', // text and zhuyin
  accent: '#b83f28', // lesson title, labels, the unit's tab (4.9:1 on the tint)
  tint: '#f7efdf', // the boxes of the upper tier
  muted: '#72675b', // lead, folios, colophon
  paper: '#ffffff', // the lettering on the tab
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'accent (defaults)', value: { hex: palette.accent, model: 'hex' } },
];
// #endregion
const KAI = 'Iansui'; // 楷: the lesson, drawn to Taiwan's standard forms (為, not 爲)
const ZHUYIN = 'LXGW WenKai TC'; // the readings: a round dot for the neutral tone
const MING = 'Noto Serif TC'; // 明: notes and the author box
const HEI = 'Noto Sans TC'; // 黑: labels, folios, the tab
const SIZE = 16; // the text size (三號)

// #region answer: vertical text with a zhuyin column right of every character
const layout = {
  writingMode: 'vertical-rl', // lines run down the page, read from the right; bound on the right
  layoutType: 'oneAndHalf', // two tiers: the text below, pictures and notes above
  sideColumnRole: 'floats', sideColumnSide: 'left', // 'left' is the top tier in vertical text
  sideColumnPercent: 34,
  gutterWidth: pt(2 * SIZE),
};
const cjk = {
  // The lower tier: 23 characters down, 13 lines across the page.
  grid: { enabled: true, charsPerLine: 23, linesPerPage: 13 },
  // Readings at half the text size; zhuyin sets its symbols at 60 % of that, 0.3 em,
  // so three symbols fit beside one character, and beside each of two in a row.
  ruby: { fontFamily: ZHUYIN, fontSize: em(0.5) },
};
// The line pitch is twice the size: a gap of one em, which the zhuyin and its tone
// marks half fill. clreq asks for 1.5 em; one em keeps 13 lines of 23 on the page.
const LINE = 2 * SIZE;
const bodyText = {
  fontFamily: KAI, fontSize: pt(SIZE), lineHeight: pt(LINE), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', firstLineIndent: em(2), indentAfterHeading: true,
};
// #endregion

// #region upper-tier: pictures without a caption line, boxes of notes set down the tier
const resourceTypes = [{ id: 'plate', name: '插圖', shortLabel: '圖', numberingTemplate: '{n}',
  resetOn: 'never', counterFormat: 'decimal', captionPrefix: '' }]; // no prefix, no caption
const box = (id, title, body) => ({ id, title, background: col('tint'),
  padding: { top: mm(3), right: mm(3), bottom: mm(3), left: mm(3) },
  titleStyle: { fontFamily: HEI, fontSize: pt(11), fontWeight: 700, color: col('accent') },
  body: { color: col('ink'), firstLineIndent: pt(0), textAlign: 'left', boldColor: col('ink'),
    italicColor: col('ink'), ...body } });
// Zhuyin is 0.3 em of the text it reads: at 13 pt the notes' readings are 3.9 pt.
const calloutStyles = [ // fenced :::callout{type="notes" span="side"} in the text
  box('notes', '注釋', { fontFamily: MING, fontSize: pt(13), lineHeight: pt(24) }),
  box('author', '作者', { fontFamily: MING, fontSize: pt(13), lineHeight: pt(24),
    textAlign: 'justify', firstLineIndent: em(2) }),
  box('chars', '生字', { fontFamily: KAI, fontSize: pt(22), lineHeight: pt(40),
    textAlign: 'center' }),
];
// #endregion

// #region furniture: the unit's tab and the folios, on the outer edge of a right-bound book
// The verso lies on the right of the spread, so even pages carry both at the right edge.
const tab = (parity, edge) => [
  { kind: 'box', id: `tab-${parity}`, parity, pages: 'all',
    placement: { anchor: { to: 'page', edge }, offset: { y: mm(24) },
      size: { width: mm(9), height: mm(64) } }, style: { backgroundColor: col('accent') } },
  { kind: 'text', id: `unit-${parity}`, content: '第三單元　寓言故事', parity, pages: 'all',
    writingMode: 'vertical-rl', fontFamily: HEI, fontSize: pt(9), fontWeight: 700,
    color: col('paper'), align: 'center', verticalAlign: 'middle',
    placement: { anchor: { to: `#tab-${parity}`, edge: 'align-top' },
      size: { width: mm(9), height: mm(64) } } },
];
const foot = (id, parity, edge, x, content, extra = {}) => ({
  kind: 'text', id, content, parity, pages: 'all', fontFamily: HEI, fontSize: pt(8),
  color: col('muted'), placement: { anchor: { to: 'page', edge }, offset: { x: mm(x), y: mm(-9) } },
  ...extra,
});
const folio = { fontSize: pt(9), fontWeight: 700 };
const header = { elements: [...tab('even', 'top-right'), ...tab('odd', 'top-left')] };
const footer = {
  elements: [
    foot('folio-even', 'even', 'bottom-right', -16, '{pageNumber}', folio),
    foot('book', 'even', 'bottom-right', -26, '國語　第九冊'),
    foot('folio-odd', 'odd', 'bottom-left', 16, '{pageNumber}', folio),
    foot('lesson', 'odd', 'bottom-left', 26, '{chapterTitle}'),
  ],
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hant', // Taiwan: full-width punctuation, centred in its cell (gotcha: cjk-locale-tag)
  colorPalette,
  resourceTypes,
  page: {
    sizePreset: 'custom', width: mm(184), height: mm(260), dpi: 150, // 16開
    margins: { top: mm(24), bottom: mm(18), left: mm(18), right: mm(16), mirror: true },
  },
  layout,
  cjk,
  bodyText,
  headings: {
    fontFamily: KAI, color: col('ink'), fontWeight: 400, // Iansui has one weight
    levels: [
      // The lesson and fable numbers are typed in the headings: a numberingTemplate would
      // join the number to the title's first reading (see the recipe's workarounds).
      { level: 1, fontSize: pt(30), lineHeight: pt(2 * LINE), color: col('accent'),
        breakBefore: { enabled: true, parity: 'any' }, marginBottom: pt(0) },
      { level: 2, fontSize: pt(20), lineHeight: pt(2 * LINE), marginTop: pt(LINE),
        marginBottom: pt(0) },
      { level: 3, fontFamily: HEI, fontWeight: 700, fontSize: pt(13), lineHeight: pt(LINE),
        color: col('accent'), marginTop: pt(LINE / 2), marginBottom: pt(0) },
    ],
  },
  // 想一想 and 語文天地: exercise heads in the label face, one line tall.
  headingStyles: [{ id: 'drill', fontFamily: HEI, fontWeight: 700, fontSize: pt(13),
    lineHeight: pt(LINE), color: col('accent'), marginTop: pt(LINE / 2), marginBottom: pt(0) }],
  orderedLists: { numberFormat: 'trad-chinese-informal', separator: '、', color: col('accent'),
    fontFamily: HEI, fontWeight: 700, marginTop: pt(0), marginBottom: pt(0) },
  paragraphStyles: [
    { id: 'lead', fontFamily: KAI, fontSize: pt(14), lineHeight: pt(LINE), color: col('muted'),
      textAlign: 'justify', firstLineIndent: em(0) },
    { id: 'plain', fontFamily: KAI, fontSize: pt(14), lineHeight: pt(LINE), color: col('ink'),
      textAlign: 'justify', firstLineIndent: em(2) },
    { id: 'idiom', fontFamily: KAI, fontSize: pt(SIZE), lineHeight: pt(LINE), color: col('ink'),
      boldColor: col('accent'), boldFontWeight: 400, textAlign: 'justify', // bold in colour only
      firstLineIndent: em(0) },
    { id: 'colophon', fontFamily: HEI, fontSize: pt(7), lineHeight: pt(11), color: col('muted'),
      textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LINE) },
  ],
  calloutStyles,
  header,
  footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = {
  Iansui: ['400'],
  'LXGW WenKai TC': ['400'],
  'Noto Serif TC': ['400'],
  'Noto Sans TC': ['400', '700'],
};
// What the label face sets: the tab, the foot of the page, box titles and exercise heads.
const LABELS = '第三單元寓言故事國語第九冊十二課兩則注釋作者生字語譯想一文天地、0123456789';

// #region art: two pictures for the upper tier, drawn in code
// The pictures' own colours: a spring field under a pale sky.
const hue = {
  sky: '#edf1e6', far: '#d9e3cb', hill: '#bccfa6', field: '#e7d4a2', furrow: '#d3b97f',
  leaf: '#7e9a58', bark: '#86603f', wood: '#dcbd8e', straw: '#e2bf6e', skin: '#eecba4',
  robe: '#44617a', shade: '#2f4557', fur: '#f6f2ea', sun: '#f4d98a',
};
const seeded = (seed) => () => { // Mulberry32: the same tufts on every run
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" `
  + `width="${w}" height="${h}">${body}</svg>`;
const fill = (d, color) => `<path d="${d}" fill="${color}"/>`;
const line = (d, color, width, extra = '') => `<path d="${d}" fill="none" stroke="${color}" `
  + `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const dot = (cx, cy, r, color) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
const at = (x, y, s, body, flip = false) => `<g transform="translate(${x} ${y}) `
  + `scale(${flip ? -s : s} ${s})">${body}</g>`;
const tufts = (rand, n, x0, x1, y0, y1, color) => Array.from({ length: n }, () => {
  const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0), h = 14 + rand() * 16;
  return line(`M${x - 9} ${y}Q${x - 8} ${y - h * 0.6} ${x - 15} ${y - h}M${x} ${y}V${y - h * 1.2}`
    + `M${x + 9} ${y}Q${x + 8} ${y - h * 0.6} ${x + 15} ${y - h}`, color, 4);
}).join('');
const cloud = (x, y, s) => at(x, y, s, fill('M-90 0Q-96 -34 -60 -38Q-50 -76 -8 -70Q24 -96 56 -64'
  + 'Q98 -66 96 -28Q120 -18 104 0Z', palette.paper));
const tree = (x, y, s) => at(x, y, s, fill('M-10 0L-6 -120H6L10 0Z', hue.bark)
  + fill('M0 -250Q70 -240 76 -170Q96 -110 40 -96Q0 -80 -40 -96Q-96 -110 -76 -170'
    + 'Q-70 -240 0 -250Z', hue.leaf));
const landscape = (w) => fill(`M0 0H${w}V700H0Z`, hue.sky) + cloud(560, 150, 1)
  + cloud(980, 96, 0.7)
  + fill(`M0 320C200 250 380 300 560 290S900 230 1100 270S1380 300 ${w} 250V700H0Z`, hue.far)
  + fill(`M0 390C240 340 480 380 700 365S1100 330 ${w} 380V700H0Z`, hue.hill)
  + fill(`M0 430Q400 405 800 425T${w} 420V700H0Z`, hue.field);
// A farmer in a straw hat, drawn about his feet, facing left: sitting with his chin on his
// hand, or walking. Limbs are round-capped strokes.
const hat = fill('M-66 -262Q-4 -312 62 -262Q-2 -250 -66 -262Z', hue.straw)
  + line('M-66 -262Q-2 -250 62 -262', hue.bark, 4);
const head = dot(-4, -238, 26, hue.skin);
const sitter = line('M10 -58L-58 -104L-78 -20', hue.shade, 34) // thigh up to the knee, shin down
  + fill('M-26 -200Q8 -212 34 -196L44 -56Q0 -40 -34 -60Z', hue.robe)
  + fill('M-30 -122H40V-108H-30Z', palette.accent)
  + line('M-6 -190L-54 -112L-30 -214', hue.robe, 26) // elbow on the knee, hand under the chin
  + dot(-30, -214, 12, hue.skin) + line('M-100 -12H-66', hue.shade, 16) + head + hat;
const walker = line('M0 -80L-34 -6', hue.shade, 26) + line('M4 -80L40 -10', hue.shade, 26)
  + line('M-40 -6H-24M34 -8H52', palette.ink, 14) + line('M-10 -176L-44 -104', hue.shade, 22)
  + fill('M-26 -200Q8 -212 30 -198L48 -70Q0 -56 -46 -70Z', hue.robe)
  + fill('M-32 -134H38V-120H-32Z', palette.accent)
  + line('M14 -184L52 -120', hue.robe, 24) + dot(56, -112, 11, hue.skin) + head + hat;
const rabbit = fill('M-46 -18Q-50 -52 -10 -54Q34 -56 42 -26Q44 -6 22 -4H-34Q-46 -6 -46 -18Z',
  hue.fur) + fill('M30 -48Q40 -70 62 -62Q74 -52 66 -38Q54 -30 38 -34Z', hue.fur)
  + fill('M50 -64Q46 -104 58 -110Q66 -100 60 -62Z', hue.fur)
  + fill('M58 -62Q66 -98 80 -100Q84 -88 66 -58Z', hue.fur)
  + dot(62, -50, 3.5, palette.ink) + dot(-46, -24, 9, hue.fur);
const shoes = [100, 200, 300, 400, 500].map((x, i) => fill(`M${x} 440Q${x + 4} 412 ${x + 30} 414`
  + `H${x + 58}Q${x + 70} 424 ${x + 66} 440ZM${x + 34} 440Q${x + 38} 418 ${x + 60} 420H${x + 80}`
  + `Q${x + 90} 428 ${x + 86} 440Z`, i % 2 ? hue.robe : palette.ink)).join('');
const plates = {
  // 守株待兔: the farmer sits by the stump, his tool dropped; a rabbit runs off.
  'plate-1': svg(1500, 700, landscape(1500) + dot(1330, 128, 58, hue.sun)
    + tree(150, 440, 1.1) + tree(250, 430, 0.8)
    + line('M60 520Q420 480 800 505T1500 500M0 590Q400 560 820 585T1500 585'
      + 'M0 660Q420 640 840 660T1500 660', hue.furrow, 10)
    + tufts(seeded(80), 46, 20, 1480, 450, 690, hue.leaf)
    + fill('M836 560Q846 470 840 440H960Q954 470 966 560Q980 574 1002 580H800Q822 574 836 560Z',
      hue.bark)
    + `<ellipse cx="900" cy="440" rx="60" ry="17" fill="${hue.wood}"/>`
    + line('M864 440Q900 424 936 440Q900 454 872 442M886 440Q900 434 914 441', hue.bark, 3)
    + line('M930 450L948 400L962 408', hue.bark, 7)
    + fill('M958 400Q990 380 996 408Q978 420 958 410Z', hue.leaf)
    + fill('M1020 590Q1110 560 1200 590Z', hue.furrow) + at(1110, 588, 1, sitter)
    + line('M1210 640L1420 560M1236 630L1214 598M1254 623L1232 591', hue.bark, 9)
    + at(330, 505, 0.9, rabbit, true)
    + line('M470 486Q430 470 400 478M476 500Q440 494 410 500', hue.furrow, 4)),
  // 鄭人買履: from the shoe stall back home, where the measure lies on the stool.
  'plate-2': svg(1500, 700, landscape(1500)
    + tufts(seeded(81), 24, 640, 1480, 440, 530, hue.leaf)
    + fill('M0 560Q500 530 1000 550T1500 540V700H0Z', hue.furrow)
    + line('M620 600Q820 575 1000 585T1300 590', palette.paper, 6, ' stroke-dasharray="2 22"')
    + fill('M1130 300L1290 200L1450 300Z', hue.shade)
    + fill('M1160 300H1420V560H1160Z', palette.tint)
    + fill('M1240 400H1320V560H1240Z', hue.bark)
    + fill('M1180 340H1226V386H1180ZM1354 340H1400V386H1354Z', hue.shade)
    + fill('M1330 486H1440V504H1330ZM1342 504H1356V566H1342ZM1414 504H1428V566H1414Z', hue.bark)
    + line('M1340 480Q1360 458 1380 480T1420 480', palette.accent, 7)
    + dot(1360, 469, 7, palette.accent) + dot(1400, 491, 7, palette.accent)
    + tree(1060, 440, 0.9) + fill('M60 250H600L630 320H30Z', palette.accent)
    + fill('M120 250H180L186 320H110ZM240 250H300L318 320H236ZM360 250H420L446 320H364Z'
      + 'M480 250H540L578 320H492Z', palette.paper)
    + fill('M60 320H74V560H60ZM586 320H600V560H586Z', hue.bark)
    + fill('M40 440H620V466H40Z', hue.bark) + fill('M60 466H600V560H60Z', hue.wood) + shoes
    + at(860, 566, 1.05, walker, true)),
};
// #endregion
const altText = {
  'plate-1': '守株待兔：農夫坐在樹樁旁，農具丟在田裡，一隻兔子跑遠了。',
  'plate-2': '鄭人買履：鄭國人從鞋攤走回家，量好的尺碼還放在家門口的凳子上。',
};
const resources = Object.keys(plates).map((id) => ({ id, typeId: 'plate', kind: 'svg',
  createdAt: 0, updatedAt: 0, altText: altText[id], placement: { span: 'side' }, // upper tier
  svg: { fileId: `${id}.svg`, width: 1500, height: 700 } }));

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// #region build: each voice loads with the text it sets; vertical forms for the canvas
// {株|ㄓㄨ}: the characters are the text, the readings go to the zhuyin face.
const BOXES = /^:::callout\{type="(?:notes|author)"[^}]*\}\n([\s\S]*?)^:::$/gm;
const bases = (md) => md.replace(/\{([^|{}]+)((?:\|[^|{}]+)+)\}/g, '$1');
const readings = [...markdown.matchAll(/\{[^|{}]+((?:\|[^|{}]+)+)\}/g)].map((m) => m[1]).join('');
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [KAI]: ['400'] }, bases(markdown.replace(BOXES, '')), { vertical: true });
const notesText = [...markdown.matchAll(BOXES)].map((m) => m[1]).join('\n');
await loadCjkFonts({ [MING]: ['400'] }, bases(notesText), { vertical: true });
await loadCjkFonts({ [ZHUYIN]: ['400'] }, readings.replaceAll('|', ''), { vertical: true });
await loadCjkFonts({ [HEI]: ['400', '700'] }, LABELS, { vertical: true });
await Promise.all(Object.entries(plates).map(([id, markup]) => loadSvg(`${id}.svg`, markup)));
// Lesson 12 of a reader: page 86 is a verso, so the lesson opens on a spread.
const continuation = { pageIndexOffset: 1, pageNumbering: { startAt: 86 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showBook(doc, { title: t({ en: 'A vertical reader with zhuyin',
  es: 'Un libro de lectura vertical con zhuyin' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);
// #endregion

// @kit core fonts viewer pdf images cjk
