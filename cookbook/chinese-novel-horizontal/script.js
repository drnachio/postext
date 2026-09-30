// ═══ Postext Cookbook · Nº 074 · A Chinese novel page on a 28 × 28 grid ════════════
// https://postext.dev/en/cookbook/chinese-novel-horizontal
// Code: MIT · Text: Lu Xun, 故乡 (1921), public domain, zh.wikisource · Plate: drawn in code
// Fonts: Noto Serif SC, Noto Sans SC, Ma Shan Zheng (SIL OFL 1.1) · Needs postext ≥ 1.9.0
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'chinese-novel-horizontal';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
// The night of the story's memory, and ink on a cream paper.
const palette = {
  ink: '#1f1c19', // text: a warm near-black
  night: '#1d3150', // the accent: the deep blue sky of the plate, the opener's rule
  moon: '#dcaa45', // the golden moon, on the plate only
  melon: '#3c6a3b', // the green melons
  sand: '#e4d5b0', // the sand by the sea
  rule: '#c9c1b2', // the hairline under the running heads
  muted: '#6a645b', // running heads, folios, the colophon
  paper: '#fbf8f1', // a cream book paper
};
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });
const colorPalette = [
  ...Object.entries(palette).map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  { id: 'main-color', name: 'night (defaults)', value: { hex: palette.night, model: 'hex' } },
];
const SONG = 'Noto Serif SC'; // 宋: the text, and the title in its black weight
const HEI = 'Noto Sans SC'; // 黑: running heads, folios, the author, the colophon
const KAI = 'Ma Shan Zheng'; // 楷: a brush regular script for the plate's quotation
const [BODY, LEAD] = [10.5, 16.5]; // pt: 五号 on a 6 pt line gap, the grid's pitch
const [CHARS, LINES] = [28, 28];
const TRIM = { width: 140, height: 203 }; // mm: 大32开
const MEASURE = (CHARS * BODY * 25.4) / 72; // 103.7 mm: 28 ems of 五号
const SIDE = (TRIM.width - MEASURE) / 2; // 18.1 mm: the grid centres the measure

// #region answer: 28 characters × 28 lines of 五号, mainland line breaks and Kaiming marks
const cjk = {
  // The type area in characters: 28 ems wide, 28 lines of LEAD tall. page.margins become
  // minimums, and the grid centres the type area in the room they leave.
  grid: { enabled: true, charsPerLine: CHARS, linesPerPage: LINES },
  // What 'zh-Hans' gives by itself, written out so a reader can compare regions and styles.
  region: 'mainland',
  lineBreak: 'gb', // no 。，、”》 opens a line, no “《（ ends one, and no / at either end
  punctuationWidth: 'kaiming', // ，、：； quotes, brackets ½ em; 。？！ one em, ½ at a line end
  compressAdjacent: true, // idle under Kaiming (no pair tops 1.5 em); 'fullwidth' needs it
  latinSpacing: em(0.25), // 1921年, 用Noto Serif SC五号: a quarter em, none of it typed
};
const bodyText = {
  fontFamily: SONG, fontSize: pt(BODY), lineHeight: pt(LEAD), color: col('ink'),
  boldColor: col('ink'), italicColor: col('ink'), referenceColor: col('ink'),
  textAlign: 'justify', // spread between the characters, never between words
  firstLineIndent: em(2), indentAfterHeading: true, // two characters, every paragraph
};
// #endregion

// #region page: 大32开 with a head margin larger than the foot
const page = {
  width: mm(TRIM.width), height: mm(TRIM.height), dpi: 150, backgroundColor: col('paper'),
  // 22 + 18 mm leave 163 mm, exactly 28 lines of 16.5 pt; 18 mm a side leave the 103.7 mm
  // measure 0.3 mm to share. A grid that no longer fits is cut down (cjkGridClamped).
  margins: { top: mm(22), bottom: mm(18), left: mm(18), right: mm(18), mirror: true },
};
// #endregion

// #region opener: the title in the Song face's black weight, sunk 8 lines
const SINK = 8; // lines of LEAD: a whole number, so the text under it keeps to the grid
const centred = (y) => ({ anchor: { to: 'container', edge: 'top' }, offset: { y: mm(y) } });
const opener = {
  enabled: true,
  minHeight: pt(SINK * LEAD),
  slot: { elements: [
    // The spacing after the last character is advance, not ink: the title stays centred.
    { kind: 'text', id: 'title', content: '{titleText}', fontFamily: SONG, fontWeight: 900,
      fontSize: pt(46), letterSpacing: pt(23), lineHeight: 1.1, color: col('ink'),
      align: 'center', placement: centred(6) },
    { kind: 'rule', id: 'rule', direction: 'horizontal', thickness: pt(1.2),
      color: col('night'), placement: { ...centred(30), size: { width: mm(8) } } },
    { kind: 'text', id: 'author', content: '{author}', fontFamily: HEI, fontSize: pt(10.5),
      letterSpacing: pt(5), color: col('ink'), align: 'center', placement: centred(34) },
  ] },
};
// Restated: any headings object drops the H1 break (gotcha: headings-drop-h1-break).
const chapter = { level: 1, breakBefore: { enabled: true, parity: 'any' },
  marginTop: pt(0), marginBottom: pt(0), advancedDesign: opener };
// #endregion

// #region heads: the book on the verso, the story on the recto, a hairline under both
const HEAD_Y = 11; // mm from the top edge to the heads; the hairline 5 mm lower
const label = { fontFamily: HEI, fontSize: pt(8), color: col('muted'), pages: 'body' };
const at = (edge, x, y = HEAD_Y) => ({ anchor: { to: 'page', edge },
  offset: { x: mm(x), y: mm(y) } });
const header = { elements: [
  { kind: 'text', id: 'verso-folio', content: '{pageNumber}', parity: 'even', ...label,
    placement: at('top-left', SIDE) },
  { kind: 'text', id: 'verso-book', content: '{title}', parity: 'even', ...label,
    letterSpacing: pt(4), placement: at('top', 0) },
  { kind: 'text', id: 'recto-story', content: '{chapterTitle}', parity: 'odd', ...label,
    letterSpacing: pt(4), placement: at('top', 0) },
  { kind: 'text', id: 'recto-folio', content: '{pageNumber}', parity: 'odd', ...label,
    placement: at('top-right', -SIDE) },
  { kind: 'rule', id: 'hairline', direction: 'horizontal', thickness: pt(0.5), color: col('rule'),
    pages: 'body', placement: { ...at('top-left', SIDE, HEAD_Y + 5), size: { width: mm(MEASURE) } },
  },
] };
// The opener has no head: its folio drops to the foot, centred under the text.
const footer = { elements: [{ kind: 'text', id: 'drop-folio', content: '{pageNumber}',
  ...label, pages: 'opener', align: 'center', placement: at('bottom', 0, -10) }] };
// #endregion

// #region plate: the moonlit melon field faces the opener, the quotation set in Kai
const resources = [{
  id: 'moon', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'moon.svg', width: TRIM.width, height: TRIM.height }, // the trim's ratio
  altText: t({
    en: 'A golden full moon in a deep blue sky over a strip of sea. On the sand below, among '
      + 'rows of striped watermelons, a boy with a silver collar stabs a steel fork at the '
      + 'sand ahead of him, and the small animal he aimed at runs off between his legs.',
    es: 'Una luna llena dorada en un cielo azul oscuro sobre una franja de mar. En la arena, '
      + 'entre hileras de sandías rayadas, un muchacho con un aro de plata al cuello clava una '
      + 'horquilla de acero en la arena, delante de él, y el animalillo al que apuntaba huye '
      + 'entre sus piernas.',
  }),
}];
const quote = { fontFamily: KAI, fontSize: pt(14), lineHeight: 1.5, color: col('paper') };
// # 月下的瓜地 {style="plate" line1="…" line2="…" line3="…"}: a page with no head or folio.
// 'page' spans the design over the sheet: a heading's design in the column is cut at its foot.
const plate = {
  id: 'plate', span: 'page', runningChapter: false, toc: false, // out of the PDF outline
  breakBefore: { enabled: true, parity: 'any' }, // (gotcha: style-inherits-break)
  header: { elements: [] }, footer: { elements: [] },
  advancedDesign: { enabled: true, slot: { elements: [
    { kind: 'image', id: 'picture', resourceId: 'moon', placement: { // the whole trim
      anchor: { to: 'bleed', edge: 'top-left' },
      size: { width: mm(TRIM.width), height: mm(TRIM.height) } } },
    { kind: 'text', id: 'line1', content: '{attr.line1}', ...quote, align: 'left',
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(2) } } },
    { kind: 'text', id: 'line2', content: '{attr.line2}', ...quote, align: 'left',
      placement: { anchor: { to: '#line1', edge: 'below' } } },
    { kind: 'text', id: 'line3', content: '{attr.line3}', ...quote, align: 'left',
      placement: { anchor: { to: '#line2', edge: 'below' } } },
  ] } },
};
// #endregion

// #region styles: the editor's note in 小五 Song, the colophon in Hei
const paragraphStyles = [
  // 小五 (9 pt) nudged to 9.1875 pt: 32 of its characters fill the 28-em measure exactly.
  { id: 'note', fontSize: pt((CHARS * BODY) / 32), lineHeight: pt(LEAD), color: col('ink'),
    firstLineIndent: em(2), marginTop: pt(LEAD) }, // on the grid, a line below the text
  { id: 'colophon', fontFamily: HEI, fontSize: pt(7), lineHeight: pt(11), color: col('muted'),
    textAlign: 'left', firstLineIndent: pt(0), marginTop: pt(LEAD / 2) },
];
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: 'zh-Hans', // written out, never LANG (gotcha: cjk-locale-tag)
  colorPalette, page, layout: { layoutType: 'single' }, cjk, bodyText,
  // The designs paint the titles; weight 400 keeps the heading blocks in the loaded face.
  headings: { fontFamily: SONG, fontWeight: 400, levels: [chapter] },
  headingStyles: [plate], paragraphStyles, header, footer,
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ ''; // content.<lang>.md, inlined by the Cookbook

// #region art: the boy, the moon and the melon field, drawn in millimetres at the trim size
function mulberry32(seed) { // a seeded PRNG: the same field on every run
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (hex, other, k) => `#${[1, 3, 5].map((i) => Math.round(
  parseInt(hex.slice(i, i + 2), 16) * (1 - k) + parseInt(other.slice(i, i + 2), 16) * k)
  .toString(16).padStart(2, '0')).join('')}`;
const n2 = (v) => +v.toFixed(2);
function drawPlate(W, H) {
  const rnd = mulberry32(1921);
  const P = palette;
  const out = [];
  const rect = (y0, y1, fill) => out.push(`<rect x="0" y="${n2(y0)}" width="${W}" `
    + `height="${n2(y1 - y0)}" fill="${fill}"/>`);
  const circle = (cx, cy, r, fill, extra = '') => out.push(`<circle cx="${n2(cx)}" `
    + `cy="${n2(cy)}" r="${n2(r)}" fill="${fill}"${extra}/>`);
  const line = (pts, color, w) => out.push(`<path d="M${pts.map(([x, y]) => `${n2(x)} ${n2(y)}`)
    .join('L')}" fill="none" stroke="${color}" stroke-width="${n2(w)}" `
    + 'stroke-linecap="round" stroke-linejoin="round"/>');
  const HORIZON = 112; // mm: the line of the sea
  const SHORE = 120; // mm: where the sand begins
  // The sky in four flat steps, darkest at the top; the moon in three rings of light.
  [[0, 0], [56, 0.06], [84, 0.12], [100, 0.19]].forEach(([y, k]) => rect(y, HORIZON,
    mix(P.night, '#6f8fb8', k)));
  const [MX, MY] = [98, 66];
  [[30, 0.1], [23, 0.15], [17.5, 0.22]].forEach(([r, k]) => circle(MX, MY, r,
    mix(P.night, '#9fb6d4', k)));
  circle(MX, MY, 13, P.moon);
  circle(MX - 3.8, MY - 2.6, 2.4, mix(P.moon, '#ffffff', 0.22));
  circle(MX + 4.4, MY + 3.6, 1.6, mix(P.moon, P.night, 0.1));
  // The sea: a dark strip, the moon's path broken on the swell.
  rect(HORIZON, SHORE, mix(P.night, '#0f2a33', 0.55));
  for (let i = 0; i < 9; i++) {
    const w = 1.5 + rnd() * (4 + i * 0.8);
    out.push(`<rect x="${n2(MX - w / 2 + (rnd() - 0.5) * 5)}" y="${n2(HORIZON + 0.8 + i * 0.8)}" `
      + `width="${n2(w)}" height="0.35" fill="${mix(P.moon, P.night, 0.1 + i * 0.06)}"/>`);
  }
  // The sand, in two tones.
  rect(SHORE, H, P.sand);
  out.push(`<path d="M0 ${SHORE + 12}C35 ${SHORE + 6} 80 ${SHORE + 16} ${W} ${SHORE + 8}`
    + `L${W} ${H}L0 ${H}Z" fill="${mix(P.sand, P.melon, 0.07)}"/>`);
  // Rows of melons to the sea: each nearer row lower, larger and sparser.
  const [leaf, stripe] = [mix(P.melon, P.ink, 0.25), mix(P.melon, P.ink, 0.5)];
  const melon = (x, y, s) => {
    out.push(`<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(s)}" ry="${n2(s * 0.66)}" `
      + `fill="${P.melon}"/>`);
    for (const k of [-0.62, -0.2, 0.2, 0.62]) { // stripes follow the melon's curve
      out.push(`<path d="M${n2(x - s * 0.96)} ${n2(y)}Q${n2(x)} ${n2(y + k * s * 1.3)} `
        + `${n2(x + s * 0.96)} ${n2(y)}" fill="none" stroke="${stripe}" `
        + `stroke-width="${n2(s * 0.11)}" stroke-linecap="round"/>`);
    }
    out.push(`<ellipse cx="${n2(x - s * 0.38)}" cy="${n2(y - s * 0.34)}" rx="${n2(s * 0.3)}" `
      + `ry="${n2(s * 0.1)}" fill="${mix(P.melon, '#ffffff', 0.35)}"/>`);
  };
  const leafAt = (x, y, s, a) => out.push(`<path d="M0 0C${n2(s * 0.3)} ${n2(-s * 0.9)} `
    + `${n2(s * 1.4)} ${n2(-s * 0.8)} ${n2(s * 1.6)} 0C${n2(s * 1.4)} ${n2(s * 0.7)} `
    + `${n2(s * 0.3)} ${n2(s * 0.8)} 0 0Z" fill="${leaf}" `
    + `transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)})"/>`);
  const rows = 8;
  const rowY = (row) => SHORE + 3 + (H - SHORE + 8) * ((row + 1) / rows) ** 1.8;
  const field = [];
  for (let row = 0; row < rows; row++) {
    const depth = (row + 1) / rows; // 0 far, 1 near
    const y = rowY(row);
    const s = 0.8 + 6.4 * depth ** 1.7; // a melon's half-length, mm
    const wave = (x) => y + Math.sin(x / 11 + row * 1.7) * (0.3 + depth * 1.2);
    const vine = [];
    for (let x = -3; x <= W + 3; x += 3) vine.push([x, wave(x)]);
    line(vine, leaf, 0.15 + depth * 0.45);
    for (let x = rnd() * s * 4; x < W + s; x += s * (3.2 + rnd() * 3.4)) {
      field.push({ row, x, y: wave(x) - s * 0.5, s, depth });
    }
  }
  // The boy with the silver collar stabs at the badger-like zha, which slips between his legs.
  const boy = { x: 47, y: rowY(4) + 2, h: 31 }; // feet on the fifth row
  for (const m of field) {
    if (m.row === 4 && m.x > boy.x - 14 && m.x < boy.x + 32) continue; // his patch, the fork's
    leafAt(m.x - m.s * 0.6, m.y + m.s * 0.4, m.s * 0.9, 190 + rnd() * 40);
    leafAt(m.x + m.s * 0.5, m.y + m.s * 0.45, m.s * 0.8, -20 + rnd() * 40);
    melon(m.x, m.y, m.s);
  }
  const figure = mix(P.night, P.ink, 0.35);
  const u = boy.h / 30; // the figure is drawn on a 30-unit height
  const at = (x, y) => [boy.x + x * u, boy.y - y * u];
  const xy = (x, y) => at(x, y).map(n2).join(' ');
  const steel = mix(P.sand, '#ffffff', 0.4);
  line([at(-1, 12), at(-5.5, 0.4)], figure, 2 * u); // the back leg
  line([at(1.2, 12), at(6, 5.5), at(7.5, 0.4)], figure, 2 * u); // the front knee bent
  out.push(`<path d="M${xy(-3.2, 22.6)}L${xy(3.4, 22.6)}L${xy(4.2, 11)}L${xy(-3.8, 11)}Z" `
    + `fill="${figure}"/>`); // the tunic
  // The silver collar round the neck: its back arc behind the neck, its front arc over it.
  const collar = (sweep) => out.push(`<path d="M${xy(-1.2, 23.1)}A${n2(1.6 * u)} `
    + `${n2(0.55 * u)} 0 0 ${sweep} ${xy(2, 23.1)}" fill="none" stroke="${steel}" `
    + `stroke-width="${n2(0.55 * u)}"/>`);
  collar(1);
  line([at(0.4, 22.2), at(0.4, 24.4)], figure, 2 * u); // the neck
  circle(...at(0.4, 26.4), 2.9 * u, figure); // the head
  collar(0);
  line([at(2.6, 21.5), at(8.2, 11.8)], figure, 1.5 * u); // both hands on the shaft
  line([at(-2.4, 21), at(4.4, 14.3)], figure, 1.5 * u);
  // The steel fork stabs down at the sand: a shaft, a crossbar and three parallel tines.
  const [butt, head] = [[-3, 19.4], [19, 4.4]];
  const len = Math.hypot(head[0] - butt[0], head[1] - butt[1]);
  const [dx, dy] = [(head[0] - butt[0]) / len, (head[1] - butt[1]) / len];
  const across = (k) => [head[0] - k * 1.3 * dy, head[1] + k * 1.3 * dx];
  line([at(...butt), at(...head)], steel, 0.55 * u);
  line([at(...across(-1)), at(...across(1))], steel, 0.45 * u);
  for (const k of [-1, 0, 1]) {
    const [x0, y0] = across(k);
    line([at(x0, y0), at(x0 + 3.8 * dx, y0 + 3.8 * dy)], steel, 0.45 * u);
  }
  // The zha he aimed at has slipped between his legs and runs off to the left, tail up.
  const fur = mix(P.sand, P.ink, 0.62);
  const [zx, zy] = at(0.6, 1.6);
  out.push(`<path d="M${n2(zx - 4.6 * u)} ${n2(zy - 0.2 * u)}L${n2(zx - 2.6 * u)} `
    + `${n2(zy - 1.6 * u)}C${n2(zx)} ${n2(zy - 2.4 * u)} ${n2(zx + 3 * u)} ${n2(zy - 1.8 * u)} `
    + `${n2(zx + 3.4 * u)} ${n2(zy - 0.2 * u)}C${n2(zx + 2 * u)} ${n2(zy + 1 * u)} `
    + `${n2(zx - 2 * u)} ${n2(zy + 1 * u)} ${n2(zx - 4.6 * u)} ${n2(zy - 0.2 * u)}Z" `
    + `fill="${fur}"/>`); // a pointed snout, a round back
  line([[zx + 3 * u, zy - 1 * u], [zx + 4.8 * u, zy - 2.8 * u]], fur, 0.7 * u); // tail
  [[-2, 1.8], [-0.8, 2.2], [1.4, 2], [2.6, 1.6]].forEach(([ddx, ddy], i) => line(
    [[zx + ddx * u, zy + 0.4 * u], [zx + (ddx + (i % 2 ? 1 : -1)) * u, zy + ddy * u]],
    fur, 0.45 * u)); // legs mid-stride
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" `
    + `viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
}
// #endregion

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { // every face the pages use, loaded before the build (gotcha: fonts-first)
  'Noto Serif SC': ['400', '900'], // SONG: the text; the title
  'Noto Sans SC': ['400'], // HEI: running heads, folios, the author, the colophon
  'Ma Shan Zheng': ['400'], // KAI: the plate's quotation
};

// ─── 4 · Build & show ───────────────────────────────────────────────────────
// Each voice loads the files of the characters it sets (gotcha: cjk-fonts-slices).
const part = (re) => markdown.match(re)?.[0] ?? '';
const colophon = part(/:::paragraphs\{style="colophon"\}[\s\S]*$/);
await loadFonts(FONTS, markdown);
await loadCjkFonts({ [SONG]: ['400'] }, markdown);
await loadCjkFonts({ [SONG]: ['900'] }, '故乡');
await loadCjkFonts({ [HEI]: ['400'] }, `呐喊故乡鲁迅0123456789${colophon}`);
await loadCjkFonts({ [KAI]: ['400'] }, part(/^# .*style="plate".*$/m));
await loadSvg('moon.svg', drawPlate(TRIM.width, TRIM.height));
// The plate is page 70 of the book, a verso: folios and parity follow the book.
const continuation = { pageIndexOffset: 69, pageNumbering: { startAt: 70 } };
const doc = await buildWithFonts(
  () => buildDocument({ markdown, resources, continuation }, config()), markdown);
showPages(doc, { title: t({ en: 'A Chinese novel page on a 28 × 28 grid',
  es: 'Una página de novela china en una retícula de 28 × 28' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: cjkPdfProvider, resourceBytes: imageBytes }),
  `${RECIPE}.pdf`);

// @kit core fonts viewer pdf images cjk · the Cookbook inlines cookbook/_kit/*.js here
