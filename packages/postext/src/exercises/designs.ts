/**
 * The drawn parts of an exercise (#1227, #1228): writing areas, and the
 * grids of word searches, crosswords and operations in columns. Each is a
 * frameless box whose design draws it — paths for the rules, texts for the
 * letters — so every output paints it as it paints any box design, a
 * right-to-left page mirrors it, and the layout places and keeps it whole.
 * Lengths are given in points.
 */

import type { CalloutStyleConfig, ColorValue, DesignElement, DesignPathElement, DesignTextElement, Dimension } from '../types.js';
import { graphemesOf } from '../measure/graphemes.js';

const PT = (value: number): Dimension => ({ value: Math.round(value * 1000) / 1000, unit: 'pt' });
const ZERO = PT(0);

/** A frameless box drawn by `elements`, `heightPt` tall. */
export function drawnBox(id: string, elements: DesignElement[], heightPt: number, marginTopPt = 3, marginBottomPt = 3): CalloutStyleConfig {
  return {
    id,
    title: '',
    backgroundEnabled: false,
    border: { enabled: false },
    padding: { top: ZERO, right: ZERO, bottom: ZERO, left: ZERO },
    stripe: { enabled: false },
    icon: { kind: 'none' },
    marker: { kind: 'none' },
    marginTop: PT(marginTopPt),
    marginBottom: PT(marginBottomPt),
    snapToGrid: false,
    keepTogether: true,
    design: { enabled: true, slot: { elements }, minHeight: PT(heightPt) },
  };
}

/** A path element over `[0, w] × [0, h]` points, from the box's top left. */
export function pathElement(id: string, d: string, wPt: number, hPt: number, stroke: ColorValue, widthPt: number, extra: Partial<DesignPathElement> = {}): DesignPathElement {
  return {
    kind: 'path',
    id,
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: PT(wPt), height: PT(hPt) } },
    d,
    viewBox: [Math.max(0.001, wPt), Math.max(0.001, hPt)],
    stroke,
    width: PT(widthPt),
    ...extra,
  };
}

/** A text element: `content` set in a box `wPt` × `hPt` at (`xPt`, `yPt`). */
export function textElement(id: string, content: string, xPt: number, yPt: number, wPt: number, hPt: number, sizePt: number, extra: Partial<DesignTextElement> = {}): DesignTextElement {
  return {
    kind: 'text',
    id,
    content: content.replace(/[{}]/g, (c) => (c === '{' ? '\uFF5B' : '\uFF5D')),
    fontSize: PT(sizePt),
    align: 'center',
    verticalAlign: 'middle',
    overflow: 'clip',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: PT(xPt), y: PT(yPt) }, size: { width: PT(wPt), height: PT(hPt) } },
    ...extra,
  };
}

const r = (n: number): string => String(Math.round(n * 100) / 100);

export type AreaKind = 'lines' | 'dots' | 'grid' | 'seyes' | 'tianzige' | 'box' | 'none';

export interface AreaSpec {
  kind: AreaKind;
  lines: number;
  /** Distance between two lines (the side of a grid's square), points. */
  spacingPt: number;
  /** The room the area may take across, points. */
  widthPt: number;
  color: ColorValue;
  weightPt: number;
  /** Answers written on the lines (a teacher's edition), one a line, in
   *  `answerColor`. */
  answers?: string[];
  answerColor?: ColorValue;
  answerSizePt?: number;
  answerFont?: string;
  /** Squares (`grid`, `tianzige`) in groups of so many cells, side by side
   *  a square apart and wrapping at the measure (`cells="2 2 3"`, #1244):
   *  a word's squares each, `lines` rows tall. One number sizes the area to
   *  that many cells. Absent: the whole measure. */
  cells?: number[];
}

/** Where the groups of an area's squares stand (see {@link AreaSpec.cells}):
 *  each one's first cell, column and row of cells, a cell and the rows of
 *  a group apart. */
function cellGroups(cells: number[], cols: number, lines: number): { at: Array<{ c: number; r: number; n: number }>; rows: number } {
  const at: Array<{ c: number; r: number; n: number }> = [];
  let c = 0;
  let r = 0;
  for (const n0 of cells) {
    const n = Math.max(1, Math.min(cols, Math.floor(n0)));
    if (c > 0 && c + n > cols) { c = 0; r += lines + 0.5; }
    at.push({ c, r, n });
    c += n + 1;
  }
  return { at, rows: r + lines };
}

/** A space a row may end at (a no-break space joins). */
const isBreakSpace = (g: string): boolean => g === ' ' || g === '\t' || g === '\n' || g === '\r';
/** A character that stands as a word of its own: Han, kana, CJK
 *  punctuation and full-width forms, written without spaces. */
const isOwnWord = (g: string): boolean => /^[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u.test(g) || /^[\u{20000}-\u{3134F}]/u.test(g);

/** `chars` laid on rows of `cols` squares, one character a square, with
 *  the blank squares that start a word on the next row when it does not
 *  fit the rest of one; a space at the start of a row is dropped, a word
 *  longer than a row starts one and is cut where it ends. */
function inWords(chars: string[], cols: number): string[] {
  const words: string[][] = [];
  let word: string[] = [];
  const flush = (): void => { if (word.length > 0) words.push(word); word = []; };
  for (const g of chars) {
    if (isBreakSpace(g)) { flush(); words.push([' ']); continue; }
    if (isOwnWord(g)) { flush(); words.push([g]); continue; }
    word.push(g);
  }
  flush();
  const out: string[] = [];
  for (const w of words) {
    const col = out.length % cols;
    if (w[0] === ' ') { if (col > 0) out.push(' '); continue; }
    if (col > 0 && col + w.length > cols) out.push(...Array<string>(cols - col).fill(' '));
    out.push(...w);
  }
  return out;
}

/** The elements and height of a writing area. */
export function areaElements(a: AreaSpec): { elements: DesignElement[]; heightPt: number } {
  const n = Math.max(1, Math.floor(a.lines));
  const sp = a.spacingPt;
  const w = a.widthPt;
  const els: DesignElement[] = [];
  let h = n * sp;
  switch (a.kind) {
    case 'lines': case 'dots': {
      let d = '';
      for (let i = 0; i < n; i++) d += `M0 ${r((i + 0.85) * sp)}H${r(w)}`;
      els.push(pathElement('area', d, w, h, a.color, a.weightPt, a.kind === 'dots' ? { dash: [PT(a.weightPt * 1.2), PT(a.weightPt * 3)] } : {}));
      break;
    }
    case 'grid': case 'tianzige': {
      const cols = Math.max(1, Math.floor(w / sp));
      // The groups of squares (`cells`), else one as wide as the measure.
      const groups = a.cells && a.cells.length > 0 ? cellGroups(a.cells, cols, n) : { at: [{ c: 0, r: 0, n: cols }], rows: n };
      h = groups.rows * sp;
      const gw = Math.max(...groups.at.map((g) => (g.c + g.n) * sp));
      let d = '';
      let x = '';
      for (const g of groups.at) {
        const x0 = g.c * sp; const y0 = g.r * sp; const x1 = (g.c + g.n) * sp; const y1 = (g.r + n) * sp;
        for (let i = 0; i <= n; i++) d += `M${r(x0)} ${r(y0 + i * sp)}H${r(x1)}`;
        for (let j = 0; j <= g.n; j++) d += `M${r(x0 + j * sp)} ${r(y0)}V${r(y1)}`;
        for (let i = 0; i < n; i++) x += `M${r(x0)} ${r(y0 + (i + 0.5) * sp)}H${r(x1)}`;
        for (let j = 0; j < g.n; j++) x += `M${r(x0 + (j + 0.5) * sp)} ${r(y0)}V${r(y1)}`;
      }
      els.push(pathElement('area', d, gw, h, a.color, a.weightPt));
      if (a.kind === 'tianzige') els.push(pathElement('cross', x, gw, h, a.color, a.weightPt * 0.6, { dash: [PT(a.weightPt * 3), PT(a.weightPt * 3)] }));
      break;
    }
    case 'seyes': {
      // French Seyès ruling: a heavy line every `sp`, three light ones
      // between, light verticals every `sp`, a margin line on the left.
      let heavy = '';
      let light = '';
      const cols = Math.max(1, Math.floor(w / sp));
      for (let i = 0; i < n; i++) {
        heavy += `M0 ${r((i + 1) * sp)}H${r(w)}`;
        for (let k = 1; k < 4; k++) light += `M0 ${r((i + k / 4) * sp)}H${r(w)}`;
      }
      for (let j = 1; j <= cols; j++) light += `M${r(j * sp)} 0V${r(h)}`;
      h = n * sp + a.weightPt;
      els.push(pathElement('light', light, w, h, a.color, a.weightPt * 0.5));
      els.push(pathElement('heavy', heavy, w, h, a.color, a.weightPt));
      break;
    }
    case 'box':
      els.push(pathElement('area', `M0 0H${r(w)}V${r(h)}H0Z`, w, h, a.color, a.weightPt));
      break;
    case 'none':
      break;
  }
  if (a.answers && a.answerColor && (a.kind === 'grid' || a.kind === 'tianzige')) {
    // On squares a model answer is written a character to a square, row
    // after row (group after group), as a pupil writes on 田字格 or
    // squared paper.
    const cols = Math.max(1, Math.floor(w / sp));
    const groups = a.cells && a.cells.length > 0 ? cellGroups(a.cells, cols, n).at : [{ c: 0, r: 0, n: cols }];
    const squares = groups.flatMap((g) => Array.from({ length: g.n * n }, (_, k) => ({ x: (g.c + (k % g.n)) * sp, y: (g.r + Math.floor(k / g.n)) * sp })));
    // On squared paper across the measure a pupil keeps the words of a
    // language written with spaces whole (#1312); 田字格 and groups of
    // cells take a character to a square.
    const chars = a.kind === 'grid' && !(a.cells && a.cells.length > 0)
      ? inWords(graphemesOf(a.answers.join(' ')), cols)
      : graphemesOf(a.answers.join('')).filter((ch) => !(a.cells && ch.trim() === ''));
    chars.slice(0, squares.length).forEach((ch, k) => {
      if (ch.trim() === '') return;
      els.push(textElement(`answer${k}`, ch, squares[k]!.x, squares[k]!.y, sp, sp, sp * 0.62, {
        color: a.answerColor, overflow: 'clip', ...(a.answerFont ? { fontFamily: a.answerFont } : {}),
      }));
    });
  } else if (a.answers && a.answerColor) {
    const size = a.answerSizePt ?? sp * 0.6;
    a.answers.slice(0, n).forEach((text, i) => {
      if (!text) return;
      els.push(textElement(`answer${i}`, text, sp * 0.15, i * sp, w - sp * 0.3, sp * 0.85, size, {
        align: 'start', verticalAlign: 'bottom', color: a.answerColor, overflow: 'ellipsis-end', ...(a.answerFont ? { fontFamily: a.answerFont } : {}),
      }));
    });
  }
  return { elements: els, heightPt: h };
}
