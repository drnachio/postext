// Cover artwork of the built-in Postext guide: an open spread laid out the
// way the engine sees it — justified lines of word boxes on a baseline grid,
// a chapter band, a floated figure — on the cover's night ground, with one
// line opened up into Knuth-Plass boxes, glue and a flagged penalty, and
// crop marks at the trim. Pure shapes (no text), so it reads the same in
// every backend and stays vector in the PDF. Deterministic: a seeded
// generator draws the word widths.

/** Canvas size in SVG units: 216 × 168 mm (the cover band, 3 mm of bleed
 *  each side) at 5 units per millimetre. */
export const COVER_VW = 1080;
export const COVER_VH = 840;

const C = {
  night: '#0e1014',
  grid: '#171b22',
  page: '#161920',
  pageEdge: '#2a2f39',
  word: '#363d4a',
  wordSoft: '#232833',
  blue: '#2b4acb',
  blueSoft: '#3d5bd6',
  gilt: '#d8a21a',
  giltSoft: '#8a6a1c',
  white: '#f4f1ea',
  vermilion: '#c0452f',
};

/** Mulberry32: a small seeded PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number): string => (Math.round(v * 10) / 10).toString();

function rect(x: number, y: number, w: number, h: number, fill: string, rx = 0): string {
  return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"/>`;
}

interface LineOpts {
  x: number;
  y: number;
  width: number;
  last: boolean;
  indent: number;
  fill: string;
}

/** One justified line of word boxes; the last line of a paragraph ends
 *  short. Returns the boxes' SVG. */
function wordLine(rand: () => number, o: LineOpts, h: number): string {
  const space = 5;
  const words: number[] = [];
  const target = o.last ? o.width * (0.3 + rand() * 0.5) : o.width - o.indent;
  let used = 0;
  while (used < target) {
    const w = 7 + Math.floor(rand() * rand() * 38);
    if (used + w > target && words.length > 2) break;
    words.push(w);
    used += w + space;
  }
  const natural = words.reduce((s, w) => s + w, 0);
  const gap = o.last || words.length < 2 ? space : (target - natural) / (words.length - 1);
  let x = o.x + o.indent;
  let out = '';
  for (const w of words) {
    out += rect(x, o.y, w, h, o.fill, 1.2);
    x += w + gap;
  }
  return out;
}

interface ColumnOpts {
  x: number;
  top: number;
  bottom: number;
  width: number;
  pitch: number;
}

/** A column of paragraphs set line by line on the grid. */
function column(rand: () => number, o: ColumnOpts, fill: string): string {
  let out = '';
  let y = o.top;
  let left = 3 + Math.floor(rand() * 7);
  let first = true;
  while (y + 5 <= o.bottom) {
    const last = left === 1;
    out += wordLine(rand, { x: o.x, y, width: o.width, last, indent: first ? 14 : 0, fill }, 5);
    y += o.pitch;
    left--;
    first = false;
    if (left === 0) {
      left = 3 + Math.floor(rand() * 8);
      first = true;
    }
  }
  return out;
}

/** Crop marks at the four corners of a trim box. */
function cropMarks(x: number, y: number, w: number, h: number): string {
  const len = 22;
  const off = 8;
  const l = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M${r1(x1)},${r1(y1)} L${r1(x2)},${r1(y2)}" stroke="${C.gilt}" stroke-width="1.4" fill="none"/>`;
  return [
    l(x - off - len, y, x - off, y), l(x, y - off - len, x, y - off),
    l(x + w + off, y, x + w + off + len, y), l(x + w, y - off - len, x + w, y - off),
    l(x - off - len, y + h, x - off, y + h), l(x, y + h + off, x, y + h + off + len),
    l(x + w + off, y + h, x + w + off + len, y + h), l(x + w, y + h + off, x + w, y + h + off + len),
  ].join('');
}

/** The highlighted line: gilt boxes, glue springs between them and a
 *  flagged penalty at the break — the Knuth-Plass model drawn at scale. */
function modelLine(x: number, y: number, width: number): string {
  const h = 22;
  const widths = [58, 34, 76, 28, 52, 42];
  const natural = widths.reduce((s, w) => s + w, 0);
  const penalty = 26;
  const gap = (width - natural - penalty) / (widths.length - 1);
  let out = '';
  let cx = x;
  widths.forEach((w, i) => {
    out += rect(cx, y, w, h, C.gilt, 3);
    if (i < widths.length - 1) {
      // A spring: a zig-zag across the glue.
      const g0 = cx + w + 4;
      const g1 = cx + w + gap - 4;
      const steps = 6;
      let d = `M${r1(g0)},${r1(y + h / 2)}`;
      for (let s = 1; s <= steps; s++) {
        const px = g0 + ((g1 - g0) * s) / steps;
        const py = s === steps ? y + h / 2 : y + (s % 2 ? 3 : h - 3);
        d += ` L${r1(px)},${r1(py)}`;
      }
      out += `<path d="${d}" stroke="${C.gilt}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    cx += w + gap;
  });
  // The flagged penalty: a hyphen at the break and a flag above it.
  const px = x + width - penalty + 8;
  out += rect(px, y + h / 2 - 2.5, 16, 5, C.gilt, 2);
  out += `<path d="M${r1(px + 8)},${r1(y - 8)} L${r1(px + 8)},${r1(y - 42)} L${r1(px + 32)},${r1(y - 34)} L${r1(px + 8)},${r1(y - 26)} Z" fill="${C.gilt}" stroke="${C.gilt}" stroke-width="2" stroke-linejoin="round"/>`;
  // Bracket under the line: the measure it was justified to.
  out += `<path d="M${r1(x)},${r1(y + h + 12)} L${r1(x)},${r1(y + h + 20)} L${r1(x + width)},${r1(y + h + 20)} L${r1(x + width)},${r1(y + h + 12)}" stroke="${C.giltSoft}" stroke-width="2" fill="none"/>`;
  return out;
}

/** A display numeral "1" as a single path, `h` units tall. */
function numeralOne(x: number, y: number, h: number, fill: string): string {
  const u = h / 10;
  const d = [
    [3.2, 0], [5.6, 0], [5.6, 8.9], [7.4, 8.9], [7.4, 10], [1.6, 10], [1.6, 8.9], [3.4, 8.9], [3.4, 2.2], [1.4, 3.1], [1.0, 2.1],
  ].map(([px, py], i) => `${i ? 'L' : 'M'}${r1(x + px! * u)},${r1(y + py! * u)}`).join(' ');
  return `<path d="${d} Z" fill="${fill}"/>`;
}

export function coverArtSvg(es: boolean): string {
  const rand = prng(1983);
  const ariaLabel = es
    ? 'Un pliego abierto dibujado como lo ve el motor: líneas justificadas de cajas de palabra sobre una rejilla de línea base, una banda de capítulo, una figura flotante y una línea abierta en cajas, gomas y una penalización'
    : 'An open spread drawn the way the engine sees it: justified lines of word boxes on a baseline grid, a chapter band, a floated figure and one line opened into boxes, glue and a penalty';

  const pitch = 11;
  let grid = '';
  for (let y = 38; y < COVER_VH; y += pitch) grid += rect(0, y + 5, COVER_VW, 0.8, C.grid);

  // The spread: two 210 × 280 pages at 2.2 units per millimetre.
  const pw = 462;
  const ph = 616;
  const sx = (COVER_VW - 2 * pw) / 2;
  const sy = 92;
  const margin = { top: 53, bottom: 48, inner: 44, outer: 44 };
  const colW = (pw - margin.inner - margin.outer - 20) / 2;

  let pages = '';
  pages += `<rect x="${sx}" y="${sy}" width="${2 * pw}" height="${ph}" fill="${C.page}" stroke="${C.pageEdge}" stroke-width="1.2"/>`;
  pages += `<path d="M${sx + pw},${sy} L${sx + pw},${sy + ph}" stroke="${C.pageEdge}" stroke-width="1.2"/>`;

  // Verso: a chapter opener — a blue band with the title bars and the big
  // numeral block, then two columns of text.
  const vx = sx + margin.outer;
  const bandH = 150;
  pages += rect(sx, sy, pw, bandH, C.blue);
  pages += rect(vx, sy + 34, 60, 4, C.white, 1);
  pages += rect(vx, sy + 52, 220, 16, C.white, 2);
  pages += rect(vx, sy + 74, 150, 16, C.white, 2);
  pages += rect(vx, sy + 104, 250, 5, C.blueSoft, 1);
  pages += rect(vx, sy + 115, 210, 5, C.blueSoft, 1);
  pages += numeralOne(sx + pw - margin.inner - 80, sy + 22, 96, C.white);
  pages += rect(sx, sy + bandH, pw, 4, C.night);
  const vTop = sy + bandH + 24;
  pages += column(rand, { x: vx, top: vTop, bottom: sy + ph - margin.bottom, width: colW, pitch }, C.word);
  pages += column(rand, { x: vx + colW + 20, top: vTop, bottom: sy + ph - margin.bottom, width: colW, pitch }, C.word);

  // Recto: a figure floated to the head of the first column, a pull quote
  // rule in the second, the text around them — and the model line.
  const rx = sx + pw + margin.inner;
  const rTop = sy + margin.top;
  const figH = 132;
  pages += rect(rx, rTop, colW, figH, C.wordSoft, 2);
  // A small chart inside the figure: bars rising to a gilt one.
  [0.35, 0.55, 0.42, 0.7, 0.95].forEach((v, i) => {
    const bw = 18;
    const bx = rx + 16 + i * (bw + 9);
    const bh = (figH - 40) * v;
    pages += rect(bx, rTop + figH - 22 - bh, bw, bh, i === 4 ? C.gilt : C.blueSoft, 1.5);
  });
  pages += rect(rx, rTop + figH + 8, colW * 0.8, 4, C.giltSoft, 1);
  pages += column(rand, { x: rx, top: rTop + figH + 26, bottom: sy + ph - margin.bottom, width: colW, pitch }, C.word);
  const qx = rx + colW + 20;
  pages += column(rand, { x: qx, top: rTop, bottom: rTop + 150, width: colW, pitch }, C.word);
  pages += rect(qx, rTop + 162, colW, 3, C.vermilion);
  pages += rect(qx, rTop + 176, colW * 0.92, 9, C.vermilion, 2);
  pages += rect(qx, rTop + 190, colW * 0.7, 9, C.vermilion, 2);
  pages += column(rand, { x: qx, top: rTop + 218, bottom: sy + ph - margin.bottom, width: colW, pitch }, C.word);

  // The model line, lifted out of the recto and drawn at a larger scale
  // across the gutter of the spread.
  const mw = 470;
  const mx = sx + pw - mw / 2;
  const my = sy + ph - 190;
  const model = `<rect x="${mx - 26}" y="${my - 66}" width="${mw + 52}" height="136" rx="8" fill="${C.night}" stroke="${C.gilt}" stroke-width="2.4"/>${modelLine(mx, my, mw)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_VW} ${COVER_VH}" role="img" aria-label="${ariaLabel}">
  <rect width="${COVER_VW}" height="${COVER_VH}" fill="${C.night}"/>
  ${grid}
  ${pages}
  ${cropMarks(sx, sy, 2 * pw, ph)}
  ${model}
</svg>`;
}

/** A preview of the guide's cover for the preset picker (the built-in preset
 *  has no bundle `thumbnail.jpg`): the artwork over the night ground with the
 *  title and its gilt rule, on a 210 × 280 page. System fonts only — an SVG
 *  shown as an image cannot load web fonts. */
export function coverThumbnailSvg(): string {
  const artH = 168;
  const art = coverArtSvg(false)
    .replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg x="-3" y="-3" width="216" height="${artH}"`)
    .replace(/ role="img" aria-label="[^"]*"/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 280">
  <rect width="210" height="280" fill="${C.night}"/>
  ${art}
  <text x="20" y="${artH + 30}" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="700" fill="${C.white}">Postext</text>
  <rect x="20" y="${artH + 40}" width="34" height="1.6" fill="${C.gilt}"/>
</svg>`;
}
