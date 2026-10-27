// Ruby blocks, reordered bidi spans and the ink of shaped text.
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import { layoutTextElementAt } from '../../../design/layout.js';
import { primitiveToBlock } from '../../../pipeline/pages/headerFooter.js';
import type { CjkRegion, ResolvedDesignTextElement } from '../../../types.js';
import type { VDTDesignTextBlock } from '../../../vdt.js';
import { type PreparedText, isIsolateControl } from '../text.js';
import type { LetteringStyle, Rect } from '../types.js';
import { type ShapeOptions, inkMetrics } from '../shape-text.js';
import type { Candidate } from './breaks.js';
import { measurerFor, type Measurer } from './measure.js';

/** A block with the isolate controls of its text taken out (they set the
 *  bidi order of the lines and print nothing). */
export function stripIsolates(block: VDTDesignTextBlock): VDTDesignTextBlock {
  const re = /[\u2066-\u2069]/g;
  if (!block.lines.some((l) => /[\u2066-\u2069]/.test(l.text))) return block;
  return {
    ...block,
    lines: block.lines.map((l) => ({
      ...l,
      text: l.text.replace(re, ''),
      ...(l.runs ? { runs: l.runs.map((r) => ({ ...r, text: r.text.replace(re, '') })) } : {}),
    })),
  };
}

/**
 * The ruby (furigana) of a shaped text as small design-text blocks: each
 * reading at half the text's size, centred over its base in horizontal
 * lines and beside it (to the right) in columns, in the gap the leading
 * leaves. A group ruby is one reading over its whole run; a mono ruby one
 * reading per character. Lines a bidi run reorders take none.
 */
export function rubyBlocks(
  p: PreparedText,
  style: LetteringStyle,
  opts: ShapeOptions,
  c: Candidate,
  block: VDTDesignTextBlock,
  ink: readonly Rect[],
  ctx: { vertical: boolean; em: number; region: CjkRegion; rich: boolean },
): VDTDesignTextBlock[] {
  if (!p.style.some((st) => st.ruby)) return [];
  const { vertical, em, region } = ctx;
  const size = em * 0.5;
  const out: VDTDesignTextBlock[] = [];
  const printed = block.lines.filter((l) => l.text.length > 0);
  withMeasureWritingMode(vertical ? 'vertical-rl' : 'horizontal-tb', () => {
    const m = measurerFor(p, style);
    c.lines.forEach((line, li) => {
      const pl = printed[li];
      const box = ink[li];
      if (!pl || !box) return;
      // A line the bidi algorithm reorders (a Japanese name in an Arabic
      // balloon): where each base sits comes from its run's place.
      const where = pl.order || pl.runs?.some((r) => r.rtl) ? reorderedSpan(p, line, pl, m) : undefined;
      let k = line.start;
      while (k < line.end) {
        const r = p.style[k]!.ruby;
        if (!r) {
          k++;
          continue;
        }
        let e = k + 1;
        if (r.group) while (e < line.end && p.style[e]!.ruby?.id === r.id) e++;
        let from = m.width(line.start, k);
        let to = m.width(line.start, e);
        if (where) {
          const span = where(k, e);
          // A base cut across runs, or set right to left: no reading.
          if (!span) {
            k = e;
            continue;
          }
          [from, to] = span;
        }
        const reading = r.text;
        const el: ResolvedDesignTextElement = {
          kind: 'text', id: 'ruby', parity: 'all',
          placement: { anchor: { to: 'container', edge: 'top-left' } },
          content: reading,
          fontFamily: style.fontFamily,
          fontSize: { value: size, unit: 'px' },
          fontWeight: style.fontWeight ?? 400,
          italic: false,
          color: { hex: style.color, model: 'hex' },
          align: 'center', verticalAlign: 'top', lineHeight: 1,
          overflow: 'wrap', hyphenate: false, direction: 'ltr',
          ...(vertical ? { writingMode: 'vertical-rl' as const } : {}),
        };
        const rb = withMeasureWritingMode('horizontal-tb', () => primitiveToBlock(layoutTextElementAt(el, reading, 0, 0, opts.dpi, {})) as VDTDesignTextBlock, region);
        let dx: number;
        let dy: number;
        if (vertical) {
          // Beside the column, centred along its run.
          dx = box.x + box.width + 0.04 * em - rb.bbox.x;
          dy = box.y + (from + to) / 2 - (rb.bbox.y + rb.bbox.height / 2);
        } else {
          dx = block.bbox.x + pl.xOffset + (from + to) / 2 - (rb.bbox.x + rb.bbox.width / 2);
          dy = box.y - 0.06 * em - (rb.bbox.y + rb.bbox.height) + 0.12 * size;
        }
        out.push({ ...translateBlock(rb, dx, dy), artifact: true });
        k = e;
      }
    });
  }, region);
  return out;
}

/**
 * Where a range `[k, e)` of the prepared text sits along a printed line
 * whose runs the bidi algorithm reordered: `[from, to]` from the line's
 * start (`xOffset`), or undefined when the range is not inside one
 * left-to-right run. The runs carry the printed text in logical order
 * (isolate controls stripped); `order` is the visual order they are
 * painted in.
 */
function reorderedSpan(
  p: PreparedText,
  line: { start: number; end: number },
  pl: VDTDesignTextBlock['lines'][number],
  m: Measurer,
): (k: number, e: number) => [number, number] | undefined {
  const runs = pl.runs ?? [];
  const order = pl.order ?? runs.map((_, i) => i);
  // Visual x of each run.
  const xs = new Array<number>(runs.length).fill(0);
  let x = 0;
  for (const i of order) {
    xs[i] = x;
    if (!runs[i]!.stacked) x += runs[i]!.width;
  }
  // The prepared-text index where each run starts (printed characters only).
  const kept: number[] = [];
  for (let q = line.start; q < line.end; q++) if (!isIsolateControl(p.text[q]!)) kept.push(q);
  const starts: number[] = [];
  let printed = 0;
  for (const r of runs) {
    starts.push(kept[printed] ?? line.end);
    printed += r.text.length;
  }
  return (k, e) => {
    for (let i = 0; i < runs.length; i++) {
      const a = starts[i]!;
      const b = i + 1 < runs.length ? starts[i + 1]! : line.end;
      if (k < a || e > b) continue;
      if (runs[i]!.rtl) return undefined;
      const from = xs[i]! + m.width(a, k);
      return [from, from + m.width(k, e)];
    }
    return undefined;
  };
}

/** The ink box of every line (column) of a laid-out block. */
export function inkOf(block: VDTDesignTextBlock, em: number, vertical: boolean): Rect[] {
  const b = block.bbox;
  if (vertical) {
    const family = Object.keys(block.vertical?.centralBaselines ?? {})[0];
    const central = (family !== undefined ? block.vertical?.centralBaselines[family] : undefined) ?? 0.38;
    return block.lines.filter((l) => l.text.length > 0).map((l) => {
      const cx = b.x + b.width - (l.baselineY - central * em);
      return { x: cx - em / 2, y: b.y + l.xOffset, width: em, height: l.width };
    });
  }
  const tracking = block.letterSpacingPx ?? 0;
  return block.lines.filter((l) => l.text.length > 0).map((l) => {
    const { asc, desc } = inkMetrics(l.text);
    const w = Math.max(0, l.width - (tracking && l.text.length ? tracking : 0));
    return { x: b.x + l.xOffset, y: l.baselineY - asc * em, width: w, height: (asc + desc) * em };
  });
}

/** A copy of a block moved by (dx, dy): horizontal baselines are page
 *  coordinates, vertical ones are measured from the box. */
export function translateBlock(block: VDTDesignTextBlock, dx: number, dy: number): VDTDesignTextBlock {
  return {
    ...block,
    bbox: { ...block.bbox, x: block.bbox.x + dx, y: block.bbox.y + dy },
    lines: block.lines.map((l) => ({ ...l, ...(block.vertical ? {} : { baselineY: l.baselineY + dy }), ...(l.runs ? { runs: l.runs.map((r) => ({ ...r })) } : {}) })),
  };
}
