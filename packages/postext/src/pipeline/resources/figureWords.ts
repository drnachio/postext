/**
 * The words a `:::figure` says in its own edition (#935): its `alt`,
 * `caption` and `note`, from the fence's attributes or from `::alt[…]`,
 * `::caption[…]` and `::note[…]` lines, take the place of the resource's
 * (`altText`, `caption`, `note`) for the pages of that chapter. The
 * resource keeps one picture and one list of anchors; each Markdown file
 * brings the words of its language.
 */

import type { ContentBlock, FigureWordKind } from '../../parse/types.js';
import type { Resource } from '../../types.js';

/** What a figure says, by the resource field it replaces. */
export type FigureWordOverride = Partial<Pick<Resource, 'altText' | 'caption' | 'note'>>;

/**
 * The words of the `:::figure` blocks of `blocks`, by resource id. A
 * resource set by two figures takes the words of the first.
 */
export function figureWordOverrides(blocks: readonly ContentBlock[]): Map<string, FigureWordOverride> {
  const out = new Map<string, FigureWordOverride>();
  for (const block of blocks) {
    const words = block.figure?.words;
    const id = block.resourceId;
    if (!words || !id || out.has(id)) continue;
    const override: FigureWordOverride = {};
    if (words.alt) override.altText = words.alt.text;
    if (words.caption) override.caption = words.caption.text;
    if (words.note) override.note = words.note.text;
    if (Object.keys(override).length > 0) out.set(id, override);
  }
  return out;
}

/** A later figure of a resource that gives words the pages do not show. */
export interface FigureWordConflict {
  resourceId: string;
  /** The words it gives that differ from the first figure's, or that the
   *  first figure left unsaid (and so are not shown either). */
  words: FigureWordKind[];
  /** The source range, in `blocks`' own text, of the first of those words. */
  start: number;
  end: number;
}

const WORD_FIELDS: readonly FigureWordKind[] = ['alt', 'caption', 'note'];

/**
 * The figures that give words to a resource an earlier figure of the same
 * `blocks` already gave words to (#986): the pages show the first figure's,
 * so the later figure's words are dropped. A figure that says the same
 * words, or none, is no conflict.
 */
export function figureWordConflicts(blocks: readonly ContentBlock[]): FigureWordConflict[] {
  const first = new Map<string, NonNullable<NonNullable<ContentBlock['figure']>['words']>>();
  const out: FigureWordConflict[] = [];
  for (const block of blocks) {
    const words = block.figure?.words;
    const id = block.resourceId;
    if (!words || !id || !WORD_FIELDS.some((k) => words[k])) continue;
    const shown = first.get(id);
    if (!shown) {
      first.set(id, words);
      continue;
    }
    const lost = WORD_FIELDS.filter((k) => words[k] && words[k]!.text !== shown[k]?.text);
    if (lost.length === 0) continue;
    const at = lost.map((k) => words[k]!).reduce((a, b) => (b.sourceStart < a.sourceStart ? b : a));
    out.push({ resourceId: id, words: lost, start: at.sourceStart, end: at.sourceEnd });
  }
  return out;
}

/** `resources` with the figures' own words applied; the same array when no
 *  figure gives any, and the resources a figure leaves alone as they are. */
export function withFigureWords(resources: readonly Resource[], blocks: readonly ContentBlock[]): Resource[] {
  const overrides = figureWordOverrides(blocks);
  if (overrides.size === 0) return resources as Resource[];
  return resources.map((r) => {
    const override = overrides.get(r.id);
    return override ? { ...r, ...override } : r;
  });
}
