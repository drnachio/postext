/**
 * The exercises in a build (#1227): the resolved config with the chip and
 * paragraph styles every exercise style sets its exercises with, and the
 * expansion of a document's exercises against its page.
 */

import type { ContentBlock } from '../parse/index.js';
import type { LayoutContinuation, OutlineEntry } from '../types.js';
import type { ResolvedConfig, VDTBlock, VDTDocument } from '../vdt.js';
import { exerciseSettingsOf, type ExerciseSettings } from '../defaults/boxes/exercises.js';
import { resolveChipStylesConfig } from '../defaults/text/chipStyles.js';
import { resolveParagraphStylesConfig } from '../defaults/text/paragraphStyles.js';
import { relinkToPalette } from '../defaults/shared.js';
import { dimensionToPx } from '../units.js';
import { computeBaselineGrid, resolvedDirection, resolvedLocale } from '../pipeline/config.js';
import { exerciseChipStyles, exerciseParagraphStyles } from './styles.js';
import { expandExercises, numberExercises, type ExerciseExpansion } from './expand.js';
import type { ExerciseRecord } from './record.js';
import { hasExercises, readExercises } from './model.js';

const withStyles = new WeakMap<ResolvedConfig, ResolvedConfig>();

/** The exercise settings a resolved config reads: its own, else the
 *  defaults in the document language. */
export function exerciseSettingsFor(resolved: ResolvedConfig): ExerciseSettings {
  return resolved.exerciseSettings ?? exerciseSettingsOf(undefined, resolvedLocale(resolved));
}

/** `resolved` with the chip and paragraph styles of every exercise style
 *  among its own (after them, so no fence's fallback finds them first). */
export function withExerciseStyles(resolved: ResolvedConfig): ResolvedConfig {
  const hit = withStyles.get(resolved);
  if (hit) return hit;
  const settings = exerciseSettingsFor(resolved);
  // Their defaults link to `main-color`: set them to the document's palette.
  const chips = relinkToPalette(resolveChipStylesConfig(settings.styles.flatMap(exerciseChipStyles)), resolved.colorPalette);
  const paragraphs = resolveParagraphStylesConfig(settings.styles.flatMap(exerciseParagraphStyles), resolved.bodyText);
  const out: ResolvedConfig = {
    ...resolved,
    chipStyles: [...resolved.chipStyles, ...chips],
    paragraphStyles: [...resolved.paragraphStyles, ...paragraphs],
  };
  withStyles.set(resolved, out);
  return out;
}

/** The key carrying an exercise counter in `LayoutContinuation.statementCounters`. */
const COUNTER_PREFIX = 'exercise:';

/** The exercise counters a continuation carries. */
export function exerciseCountersOf(continuation: LayoutContinuation | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(continuation?.statementCounters ?? {})) {
    if (k.startsWith(COUNTER_PREFIX)) out[k.slice(COUNTER_PREFIX.length)] = v.counter;
  }
  return out;
}

/** The counters as `statementCounters` entries. */
export function exerciseCounterEntries(counters: Record<string, number>, heading: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number }): Record<string, { counter: number; heading: typeof heading }> {
  const out: Record<string, { counter: number; heading: typeof heading }> = {};
  for (const [k, v] of Object.entries(counters)) out[COUNTER_PREFIX + k] = { counter: v, heading };
  return out;
}

/** Whether the blocks need the expansion (an exercise or a `:::solutions`
 *  line). */
export function needsExerciseExpansion(blocks: readonly ContentBlock[]): boolean {
  return hasExercises(blocks) || blocks.some((b) => b.type === 'directive' && b.directiveName === 'solutions')
    || blocks.some((b) => b.type === 'containerStart' && (b.containerName === 'solution' || b.containerName === 'hint'));
}

/** Expand the exercises of `blocks` for a page of `resolved`, `measurePx`
 *  the width of the flow's first column. */
export function expandDocumentExercises(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  measurePx: number,
  continuation: LayoutContinuation | undefined,
  outline?: readonly OutlineEntry[],
): ExerciseExpansion {
  const locale = resolvedLocale(resolved);
  const dpi = resolved.page.dpi;
  const toPt = (px: number): number => (px * 72) / dpi;
  const bodyPx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  return expandExercises(blocks, {
    settings: exerciseSettingsFor(resolved),
    ...(locale ? { locale } : {}),
    ...(resolved.numerals ? { digits: resolved.numerals } : {}),
    ...(outline ? { outline } : {}),
    ...(continuation?.headings ? { headings: continuation.headings } : {}),
    counters: exerciseCountersOf(continuation),
    bodySizePt: toPt(bodyPx),
    lineHeightPt: toPt(computeBaselineGrid(resolved)),
    measurePt: toPt(measurePx),
    bodyFont: resolved.bodyText.fontFamily,
    ...(resolvedDirection(resolved) === 'rtl' ? { rtl: true } : {}),
    ...(resolved.layout.writingMode === 'vertical-rl' ? { vertical: true } : {}),
    boxIds: new Set(resolved.calloutStyles.map((s) => s.id)),
    boxInsets: new Map(resolved.calloutStyles.map((s) => {
      const px = (d: Parameters<typeof dimensionToPx>[0]): number => dimensionToPx(d, dpi, bodyPx);
      const border = s.border.enabled ? 2 * px(s.border.width) : 0;
      const stripe = s.stripe?.enabled && (s.stripe.side === 'left' || s.stripe.side === 'right') ? px(s.stripe.width) : 0;
      return [s.id, toPt(px(s.padding.left) + px(s.padding.right) + border + stripe)];
    })),
  });
}

/** Stamp `turn` on the frame and the content of every box printed upside
 *  down (`turn="180"`): the frame's centre on its page. */
export function markTurnedBoxes(doc: VDTDocument): void {
  const lists: VDTBlock[][] = [doc.blocks, ...doc.pages.map((p) => p.floats ?? [])];
  for (const list of lists) {
    for (const frame of list) {
      if (frame.type !== 'callout' || !frame.callout?.turned) continue;
      const turn = { cx: frame.bbox.x + frame.bbox.width / 2, cy: frame.bbox.y + frame.bbox.height / 2 };
      const own = frame.calloutPath ? frame.calloutPath[frame.calloutPath.length - 1] : frame.containerId;
      for (const b of list) {
        if (b.pageIndex !== frame.pageIndex) continue;
        const inside = b === frame || (frame.calloutPath ? b.calloutPath?.includes(own!) : b.containerId === own);
        if (inside) b.turn = turn;
      }
    }
  }
}

/** The exercise counters after `blocks`, numbered on from `before` (a
 *  book's earlier chapters), for the next chapter's continuation. */
export function exerciseCountersAfter(blocks: readonly ContentBlock[], resolved: ResolvedConfig, before: LayoutContinuation | undefined): Record<string, number> {
  const counters = exerciseCountersOf(before);
  const { exercises } = readExercises(blocks);
  if (exercises.length === 0) return counters;
  const locale = resolvedLocale(resolved);
  return numberExercises(blocks, exercises, {
    settings: exerciseSettingsFor(resolved),
    ...(locale ? { locale } : {}),
    ...(before?.headings ? { headings: before.headings } : {}),
    counters,
    bodySizePt: 0,
    lineHeightPt: 0,
    measurePt: 0,
    boxIds: new Set(),
  }).counters;
}

/** The outline entries of a document's exercises (#1229): each one's number,
 *  key and worked solution, under the chapter it is in, for a
 *  `:::solutions{scope="book"}` in another chapter. */
export function exerciseOutlineEntries(blocks: readonly ContentBlock[], resolved: ResolvedConfig, before: LayoutContinuation | undefined): OutlineEntry[] {
  return exerciseOutline(blocks, resolved, before).entries;
}

/** {@link exerciseOutlineEntries}, and what a reference to each exercise
 *  with an `{#id}` prints ("Exercise 3"), by id. */
export function exerciseOutline(blocks: readonly ContentBlock[], resolved: ResolvedConfig, before: LayoutContinuation | undefined): { entries: OutlineEntry[]; records: ExerciseRecord[] } {
  if (!hasExercises(blocks)) return { entries: [], records: [] };
  const expansion = expandDocumentExercises(blocks, resolved, 400, before);
  const titles = new Map<number, string>();
  let chapter = '';
  for (const b of blocks) {
    if (b.type === 'heading' && b.level === 1) chapter = b.text;
    if (b.type === 'containerStart' && b.containerName === 'exercise' && b.containerId !== undefined) titles.set(b.containerId, chapter);
  }
  const entries = expansion.records.map((r): OutlineEntry => ({
    kind: 'exercise',
    level: 0,
    title: r.number,
    number: r.number,
    numbered: false,
    listed: false,
    exercise: { key: r.key, ...(r.solution ? { solution: r.solution } : {}), chapter: titles.get(r.id) ?? '' },
  }));
  return { entries, records: expansion.records };
}

/** The outline with the anchor of each exercise that has an `{#id}`
 *  numbered as a numbered box's is: a reference prints "Exercise 3", with
 *  `style=number` its number, with `style=title` its title. */
export function nameExerciseAnchors(outline: OutlineEntry[], records: readonly ExerciseRecord[]): OutlineEntry[] {
  const byAnchor = new Map(records.filter((r) => r.anchor && r.anchorText).map((r) => [r.anchor!, r]));
  if (byAnchor.size === 0) return outline;
  return outline.map((e) => {
    const r = e.kind === 'anchor' && e.anchorId !== undefined ? byAnchor.get(e.anchorId) : undefined;
    return r ? { ...e, number: r.number, numbered: true, numberLabel: r.anchorText!, title: r.title ?? '' } : e;
  });
}

/** Whether the blocks print the book's solutions (`:::solutions{scope="book"}`). */
export function hasBookSolutions(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === 'directive' && b.directiveName === 'solutions' && b.directiveAttrs?.scope === 'book');
}
