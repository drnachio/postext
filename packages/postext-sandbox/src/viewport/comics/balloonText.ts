/**
 * The words of a comic balloon under the pointer (#595): a press on the
 * glyphs of a balloon selects its text in the Markdown editor, as a press
 * on the body text does, while a press on the rest of the balloon (its
 * body round the words, its tail) still drags it.
 *
 * The lettering lays each balloon's words out as a design text block that
 * carries the script line's source map (`sourceText` / `sourceMap`: one
 * source offset per printed character, the line breaks mapping to the next
 * line's start). This module finds the line and the character under a
 * sheet point the way the renderers paint them (`renderTextBlock`): a
 * horizontal line from `bbox.x + xOffset`, its runs in paint order (a
 * right-to-left run painted from its right end); a vertical block in its
 * own frame, turned a quarter turn clockwise about the box's top right
 * corner (columns right to left, each running down); a sound effect turned
 * about its box's centre.
 *
 * The block keeps a line's advance, not each glyph's: within a run the
 * characters share its advance as the font measures them (a canvas 2D
 * context in the browser), or evenly where nothing can measure (tests).
 *
 * Pure apart from the default measurer: sheet px, no DOM.
 */

import type { VDTComicBalloon, VDTDesignTextBlock, VDTPoint } from 'postext';
import { toBalloonFrame } from './balloonDrag';

/** The advance of a text in a CSS font (px), or null when nothing can
 *  measure it (the characters then share a run's advance evenly). */
export type TextMeasure = (text: string, font: string) => number | null;

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** The browser's measure: a canvas 2D context, null outside a browser
 *  (jsdom has no canvas). */
export const canvasMeasure: TextMeasure = (text, font) => {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return null;
  measureCtx.font = font;
  const w = measureCtx.measureText(text).width;
  return Number.isFinite(w) ? w : null;
};

/** One printed character of a line: its index in the block's `sourceText`,
 *  where it lies along the line (`a` to `b`, from the line's start: left
 *  to right on a horizontal line, top to bottom in a column), and whether
 *  it is painted right to left (its start boundary on its right). */
interface PlacedChar {
  plain: number;
  a: number;
  b: number;
  rtl: boolean;
}

/** A line of a balloon's text in its own frame: `s` runs along it from its
 *  start, `t` across it. */
interface LineFrame {
  /** The block's index in `balloon.text`. */
  block: number;
  /** The line's first character in the block's `sourceText`. */
  plainStart: number;
  length: number;
  /** Along: the line's extent. */
  s0: number;
  s1: number;
  /** Across: the band the line owns (its share of the leading). */
  t0: number;
  t1: number;
  chars: PlacedChar[];
}

/** The font size of a CSS font string (px). */
function fontSizeOf(font: string, fallback: number): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : fallback;
}

/** Spread a run's advance over its characters, measured with its font. */
function spread(text: string, font: string, width: number, measure: TextMeasure): number[] {
  const n = text.length;
  if (n === 0) return [0];
  const edges: number[] = [0];
  const full = measure(text, font);
  if (full === null || !(full > 0)) {
    for (let k = 1; k <= n; k++) edges.push((k / n) * width);
    return edges;
  }
  for (let k = 1; k < n; k++) {
    const w = measure(text.slice(0, k), font);
    edges.push(w === null ? (k / n) * width : (w / full) * width);
  }
  edges.push(width);
  return edges;
}

/** Whether a block's words map back to the script. */
function mapped(block: VDTDesignTextBlock): boolean {
  return !block.artifact && !!block.sourceMap && block.sourceMap.length > 0 && block.sourceText !== undefined;
}

/** The lines of a balloon's mapped text blocks in their own frames. */
function lineFrames(balloon: VDTComicBalloon, measure: TextMeasure): LineFrame[] {
  const out: LineFrame[] = [];
  balloon.text.forEach((block, bi) => {
    if (!mapped(block)) return;
    const em = fontSizeOf(block.fontString, block.bbox.height || 12);
    const lines = block.lines;
    const pitch = lines.length > 1 ? Math.abs(lines[1]!.baselineY - lines[0]!.baselineY) || em * 1.2 : em * 1.2;
    const vertical = !!block.vertical;
    const family = Object.keys(block.vertical?.centralBaselines ?? {})[0];
    const central = (family !== undefined ? block.vertical?.centralBaselines[family] : undefined) ?? 0.38;
    let plain = 0;
    for (const line of lines) {
      const length = line.text.length;
      const chars: PlacedChar[] = [];
      if (!line.runs || line.runs.length === 0) {
        const edges = spread(line.text, block.fontString, line.width, measure);
        for (let k = 0; k < length; k++) chars.push({ plain: plain + k, a: edges[k]!, b: edges[k + 1]!, rtl: false });
      } else {
        // Logical starts of the runs (the line's text is their
        // concatenation), then their places in paint order.
        const starts: number[] = [];
        let at = 0;
        for (const r of line.runs) {
          starts.push(at);
          at += r.text.length;
        }
        const order = line.order && line.order.length === line.runs.length ? line.order : line.runs.map((_, i) => i);
        let x = 0;
        for (const i of order) {
          const run = line.runs[i]!;
          const edges = spread(run.text, run.fontString, run.width, measure);
          const rtl = run.rtl === true && !vertical;
          for (let k = 0; k < run.text.length; k++) {
            const a = rtl ? x + run.width - edges[k + 1]! : x + edges[k]!;
            const b = rtl ? x + run.width - edges[k]! : x + edges[k + 1]!;
            chars.push({ plain: plain + starts[i]! + k, a, b, rtl });
          }
          x += run.width;
        }
        chars.sort((p, q) => p.a - q.a);
      }
      // Across: a horizontal line owns the leading above its baseline (most
      // of it) and a little below; a column is centred on its axis.
      let t0: number;
      let t1: number;
      if (vertical) {
        const axis = line.baselineY - central * em;
        t0 = axis - pitch / 2;
        t1 = axis + pitch / 2;
      } else {
        t0 = line.baselineY - 0.8 * pitch;
        t1 = line.baselineY + 0.2 * pitch;
      }
      out.push({ block: bi, plainStart: plain, length, s0: line.xOffset, s1: line.xOffset + line.width, t0, t1, chars });
      // The next line starts after this one's `\n` in `sourceText`.
      plain += length + 1;
    }
  });
  return out;
}

/** A sheet point in a block's line frame: `s` along its lines (from the
 *  box's left edge, or its top in a vertical block), `t` across them (the
 *  sheet's y, or the distance from the box's right edge). */
function toFrame(block: VDTDesignTextBlock, p: VDTPoint): { s: number; t: number } {
  if (block.vertical) return { s: p.y - block.bbox.y, t: block.bbox.x + block.bbox.width - p.x };
  return { s: p.x - block.bbox.x, t: p.y };
}

/** The caret boundary nearest `s` on a line (an index into the block's
 *  `sourceText`). */
function boundaryAt(line: LineFrame, s: number): number {
  if (line.chars.length === 0) return line.plainStart;
  let hit = line.chars[0]!;
  let best = Infinity;
  for (const c of line.chars) {
    const d = s < c.a ? c.a - s : s > c.b ? s - c.b : 0;
    if (d < best) {
      best = d;
      hit = c;
    }
    if (d === 0) break;
  }
  const before = s < (hit.a + hit.b) / 2;
  // A character painted right to left starts on its right.
  return before !== hit.rtl ? hit.plain : hit.plain + 1;
}

/** The source offset of a caret boundary of a block's text: before the
 *  character there, or after the last one of its line. */
function boundaryToSource(block: VDTDesignTextBlock, line: LineFrame, plain: number): number {
  const map = block.sourceMap!;
  const end = line.plainStart + line.length;
  if (plain < end && plain < map.length) return map[Math.max(0, plain)]!;
  if (line.length === 0) return map[Math.min(plain, map.length - 1)]!;
  return map[Math.min(end - 1, map.length - 1)]! + 1;
}

/** The point in the balloon's own frame (a sound effect turned and
 *  leaned back). */
function unturned(balloon: VDTComicBalloon, x: number, y: number): VDTPoint {
  return toBalloonFrame(balloon, { x, y });
}

export interface BalloonTextOptions {
  measure?: TextMeasure;
  /** Room past a line's ends that still counts as its glyphs (sheet px). */
  slop?: number;
}

/**
 * The source offset of the caret a press at `(x, y)` puts in a balloon's
 * words: the boundary nearest the point on the line under it. Null when
 * the point is off its glyphs (the balloon's body round the words, its
 * tail) or its words do not map back to the script.
 */
export function balloonTextAt(balloon: VDTComicBalloon, x: number, y: number, opts: BalloonTextOptions = {}): number | null {
  const measure = opts.measure ?? canvasMeasure;
  const slop = opts.slop ?? 0;
  const p = unturned(balloon, x, y);
  for (const line of lineFrames(balloon, measure)) {
    const block = balloon.text[line.block]!;
    const { s, t } = toFrame(block, p);
    if (t < line.t0 || t > line.t1) continue;
    if (line.length === 0 || s < line.s0 - slop || s > line.s1 + slop) continue;
    return boundaryToSource(block, line, boundaryAt(line, s - line.s0));
  }
  return null;
}

/**
 * The source offset nearest `(x, y)` in a balloon's words, wherever the
 * point is (the head of a selection dragged from them: past the words it
 * holds to their nearest line and end). Null when its words do not map
 * back to the script.
 */
export function balloonTextNearest(balloon: VDTComicBalloon, x: number, y: number, opts: BalloonTextOptions = {}): number | null {
  const measure = opts.measure ?? canvasMeasure;
  const p = unturned(balloon, x, y);
  let best: { line: LineFrame; s: number; d: number } | null = null;
  for (const line of lineFrames(balloon, measure)) {
    const { s, t } = toFrame(balloon.text[line.block]!, p);
    const d = t < line.t0 ? line.t0 - t : t > line.t1 ? t - line.t1 : 0;
    if (!best || d < best.d) best = { line, s, d };
  }
  if (!best) return null;
  const block = balloon.text[best.line.block]!;
  return boundaryToSource(block, best.line, boundaryAt(best.line, best.s - best.line.s0));
}
