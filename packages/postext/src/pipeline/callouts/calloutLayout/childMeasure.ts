// Measuring a box's first child across the widths the box may take, and
// the steps a measure across widths goes through.
// Part of layoutCallout (layoutCallout.ts), split out of it in #1276.
import type { ContentBlock } from '../../../parse/index.js';
import { type MeasureContentBlockOptions, measureContentBlock, type BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import { acrossWidthsMemo } from './layoutCallout.js';
import { measureLanguageKey } from '../../../measure/canvas.js';
import type { CalloutLayoutInput } from './inputs.js';
import type { ResolvedCalloutStyleConfig } from '../../../types/boxes/callouts.js';

/** What createChildMeasure takes from the pass. */
export interface ChildMeasureDeps {
  input: CalloutLayoutInput;
  style: ResolvedCalloutStyleConfig;
  derivedCtx: BlockMeasureContext;
  isFirstRealOf: (k: number) => boolean;
  childWidthAt: (boxWidth: number, width: number) => number;
}

export function createChildMeasure(deps: ChildMeasureDeps) {
  const {
    input, style, derivedCtx, isFirstRealOf, childWidthAt
  } = deps;
  /** The first child of a continuation that goes on in a column of another
   *  width than the fragments before it (`lineWidths`), measured as they
   *  counted its lines and, from `lineFrom` on, for this box: the lines
   *  the earlier fragments placed keep their breaks. `undefined` when the
   *  child is measured at `width` alone: no width changed, the child is
   *  not the first one or opens at its head, or its placed lines cannot
   *  be set again as they were (then it is sliced from a measure at
   *  `width`, as before). */
  const measureFirstChildAcrossWidths = (
    raw: ContentBlock,
    blockIdx: number,
    k: number,
    width: number,
    styleOverride: MeasureContentBlockOptions['styleOverride'],
  ) => {
    const history = input.lineWidths;
    const lineFrom = input.lineFrom ?? 0;
    if (!history || history.length === 0 || lineFrom <= 0 || !isFirstRealOf(k)) return undefined;
    if (history.every((h) => Math.abs(h.width - input.width) <= 0.5)) return undefined;
    // Every fragment's measure: the head's, then each one after it, which
    // keeps the lines the fragments before it placed and breaks the rest
    // for its own width. The one this fragment is set from is the last.
    const last = history[history.length - 1]!;
    const widths = Math.abs(last.width - input.width) <= 0.5
      ? history
      : [...history, { fromLine: lineFrom, width: input.width }];
    return measureAcrossSteps(raw, blockIdx, styleOverride, lineFrom, widths.map((h) => ({ fromLine: h.fromLine, columnWidth: childWidthAt(h.width, width) })));
  };
  /** A child set from line `lineFrom` on, its lines measured at the widths
   *  of `steps` (the child's own measures, in line order), the lines placed
   *  before kept as they were: see `measureFirstChildAcrossWidths`. A
   *  paragraph of a `:::columns` group that goes on in sub-columns of
   *  another width uses it too (#634). */
  const measureAcrossSteps = (
    raw: ContentBlock,
    blockIdx: number,
    styleOverride: MeasureContentBlockOptions['styleOverride'],
    lineFrom: number,
    steps: readonly { fromLine: number; columnWidth: number }[],
  ) => {
    // A split tries many cuts from the same start, and these measures are
    // not cached by the measurement cache (they break at several widths).
    let perBlock = acrossWidthsMemo.get(input.resolved);
    if (!perBlock) acrossWidthsMemo.set(input.resolved, (perBlock = new WeakMap()));
    let memo = perBlock.get(raw);
    if (!memo) perBlock.set(raw, (memo = new Map()));
    const styleAt = input.resolved.calloutStyles.indexOf(style);
    const base = steps[0]!.columnWidth;
    let prev: ReturnType<typeof measureContentBlock> | undefined;
    for (let i = 0; i < steps.length; i++) {
      const key = `${measureLanguageKey()}${styleAt}|${blockIdx}|${steps.slice(0, i + 1).map((st) => `${st.fromLine}:${st.columnWidth}`).join(',')}`;
      if (memo.has(key)) {
        prev = memo.get(key);
        if (!prev) return undefined;
        continue;
      }
      let next: ReturnType<typeof measureContentBlock> | undefined;
      if (i === 0) {
        next = measureContentBlock(raw, blockIdx, base, derivedCtx, { styleOverride }) ?? undefined;
      } else if (prev) {
        const keep = steps[i]!.fromLine;
        const breaks = prev.measured.breaks;
        const keepBreaks = breaks && breaks.at.length >= keep ? { path: breaks.path, at: breaks.at.slice(0, keep) } : undefined;
        const again = measureContentBlock(raw, blockIdx, base, derivedCtx, {
          styleOverride,
          restColumnWidths: steps.slice(1, i + 1),
          ...(keepBreaks ? { keepBreaks } : {}),
          // No shorter setting for a runt: its tracking would part the
          // lines kept from the ones placed before.
          looseness: 0,
        });
        const a = again?.measured.lines ?? [];
        const b = prev.measured.lines;
        next = again && (again.letterSpacingPx ?? 0) === (prev.letterSpacingPx ?? 0) && a.length > keep && b.length >= keep
          && b.slice(0, keep).every((l, j) => a[j]!.text === l.text && a[j]!.hyphenated === l.hyphenated)
          ? again
          : undefined;
      }
      memo.set(key, next);
      if (!next) return undefined;
      prev = next;
    }
    return prev && prev.measured.lines.length > lineFrom ? prev : undefined;
  };
  /** A comic strip the box lays out (see `stripBlock`). */
  const isStripChild = (raw: ContentBlock): boolean =>
    input.stripBlock !== undefined && raw.type === 'directive' && raw.directiveName === 'strip' && raw.comic !== undefined;
  return {
    measureFirstChildAcrossWidths, measureAcrossSteps, isStripChild
  };
}
