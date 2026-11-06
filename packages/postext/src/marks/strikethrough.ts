/**
 * Struck-through text (`~~text~~`): a line through the words, as a price
 * list strikes the old price beside the new one. The parser keeps the text
 * as ordinary text (its range rides on `InlineSpan.links`, so the layout is
 * the one without the line) and the measurer stamps it on the segments of
 * its words (`VDTLineSegment.strike`). Once the document is laid out, each
 * line holding struck words gets a `VDTLine.marks` line through each run of
 * them, placed where the renderers paint the segments
 * ({@link segmentPositions}: alignment, justified word spaces and the
 * line's paint order included), which every renderer draws as it draws the
 * Chinese marks: the canvas, the PDF, the HTML and SVG outputs, on
 * horizontal and vertical pages alike.
 *
 * A run is the struck words of one `~~…~~` that follow each other along
 * the line, with the spaces between them; a run broken over two lines gets
 * a line on each, and two runs side by side keep two lines. The line goes
 * through the struck characters only: a full stop glued to the run stays
 * out. It sits 0.28 em over the baseline (about the middle of the
 * lowercase letters, where fonts put their strikeout) in Latin, Greek,
 * Cyrillic or Arabic text, and on the central axis of the em box in
 * Chinese and Japanese text and on a vertical page; a superscript or
 * subscript inside the run does not move it. It is 0.05 em thick (at least
 * half a pixel), in the colour the run's text is painted in.
 */

import type { VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from '../vdt.js';
import { segmentFont, segmentPositions } from './cjkMarks.js';
import { textLineGroups } from './highlightMarks.js';
import { CENTRAL } from '../measure/cjk/cjkAnnotate.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { measureTextWidth } from '../measure/canvas.js';
import { fontEm } from '../measure/vertical.js';

import { STRIKE_AT, STRIKE_STROKE } from './strikeGeometry.js';

type BlockLike = Parameters<typeof segmentPositions>[1] & Partial<Pick<VDTBlock, 'boldColor' | 'italicColor'>>;

/** Where the struck characters of a segment start and end, px from its
 *  start: all of it, or the part `from`–`to` of a left-to-right text
 *  segment. */
function struckExtent(seg: VDTLineSegment, width: number, font: string): [number, number] {
  const s = seg.strike!;
  if (s.from === undefined || s.to === undefined || seg.rtl || seg.kind !== 'text') return [0, width];
  const whole = measureTextWidth(seg.text, font);
  if (!(whole > 0)) return [0, width];
  const k = width / whole;
  return [measureTextWidth(seg.text.slice(0, s.from), font) * k, measureTextWidth(seg.text.slice(0, s.to), font) * k];
}

/** The colour a segment's text is painted in, when it is not the block's. */
function colorOf(seg: VDTLineSegment, block: BlockLike): string | undefined {
  if (seg.color) return seg.color;
  if (seg.bold && block.boldColor) return block.boldColor;
  if (seg.italic && block.italicColor) return block.italicColor;
  return undefined;
}

/** The strikethrough lines of a line, relative to it; empty when it holds
 *  no struck word. `vertical`: the line is set on a vertical page. */
export function lineStrikes(line: VDTLine, block: BlockLike, vertical = false): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.strike)) return [];
  const { xs, widths } = segmentPositions(line, block);
  const order = line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i);
  // Each segment's x in the line's paint order.
  const at = xs.slice();
  let x = xs[0] ?? line.bbox.x;
  for (const i of order) {
    at[i] = x;
    x += widths[i]!;
  }
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const out: VDTLineMark[] = [];
  type Run = { id: number; from: number; to: number; em: number; shift: number; script: boolean; cjk: boolean; color?: string };
  let run: Run | undefined;
  const flush = (): void => {
    const r = run;
    run = undefined;
    if (!r || !(r.to > r.from)) return;
    const axis = vertical || r.cjk ? -CENTRAL * r.em : -STRIKE_AT * r.em;
    out.push({
      kind: 'line',
      x: r.from - line.bbox.x,
      y: axis + r.shift,
      length: r.to - r.from,
      thickness: Math.max(0.5, STRIKE_STROKE * r.em),
      ...(r.color !== undefined ? { color: r.color } : {}),
    });
  };
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const seg = segments[i]!;
    const strike = seg.strike;
    if (!strike) {
      // A space between two words of one run carries the line on.
      if (run && seg.kind === 'space') {
        let j = k + 1;
        while (j < order.length && segments[order[j]!]!.kind === 'space' && !segments[order[j]!]!.strike) j++;
        const next = j < order.length ? segments[order[j]!] : undefined;
        if (next?.strike?.id === run.id) continue;
      }
      flush();
      continue;
    }
    const font = segmentFont(seg, block);
    const em = fontEm(font);
    const [from, to] = struckExtent(seg, widths[i]!, font);
    // The tracking after the last letter is no part of the word.
    const trail = seg.kind === 'text' && (strike.to === undefined || strike.to >= seg.text.length) ? tracking + (seg.tracking ?? 0) : 0;
    const left = at[i]! + from;
    const right = at[i]! + Math.max(from, to - trail);
    const color = colorOf(seg, block);
    // A superscript or a subscript does not move the line: the run's text
    // around it decides where it goes.
    const script = !!seg.script;
    const shift = script ? 0 : seg.baselineShift ?? 0;
    const cjk = seg.kind === 'text' && hasCJK(seg.text);
    if (run && run.id === strike.id && run.color === color) {
      run.from = Math.min(run.from, left);
      run.to = Math.max(run.to, right);
      if (run.script && !script) {
        run.em = em;
        run.shift = shift;
        run.script = false;
      } else if (script === run.script) {
        run.em = Math.max(run.em, em);
      }
      run.cjk ||= cjk;
      continue;
    }
    flush();
    run = { id: strike.id, from: left, to: right, em, shift: script ? seg.baselineShift ?? 0 : shift, script, cjk, ...(color !== undefined ? { color } : {}) };
  }
  flush();
  return out;
}

/** The lines each line was given by the last pass: a line object shared
 *  by two builds (a cached measurement) gets its strikes again, once. */
const given = new WeakMap<VDTLine, VDTLineMark[]>();

/** Draw the strikethrough lines of every line of the document that holds
 *  struck-through text (see the module comment): paragraphs, headings,
 *  list items, notes and the texts of resource blocks (table cells,
 *  captions), which are set horizontally on every page. */
export function strikeDocument(doc: VDTDocument): void {
  for (const { lines, like } of textLineGroups(doc)) {
    // A flow block on a vertical page is set vertically; a resource
    // block's text never is.
    const block = 'lines' in like ? (like as VDTBlock) : undefined;
    const vertical = block !== undefined && doc.pages[block.pageIndex]?.flow?.writingMode === 'vertical-rl';
    for (const line of lines) {
      const before = given.get(line);
      if (!before && !line.segments?.some((s) => s.strike)) continue;
      const kept = before ? (line.marks ?? []).filter((m) => !before.includes(m)) : line.marks ?? [];
      const marks = lineStrikes(line, like, vertical);
      given.set(line, marks);
      if (kept.length + marks.length > 0) line.marks = [...kept, ...marks];
      else delete line.marks;
    }
  }
}
