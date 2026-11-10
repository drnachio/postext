/**
 * Resources placed after the paragraph that cites them
 * (`placement.position: 'paragraph'`): set inline, in the text column,
 * right after the block of their first reference, as if a `::resource`
 * directive followed it. No directive is needed: this pass, run before the
 * layout, inserts one (a `resourceBlock` with a zero-width source range at
 * the end of the anchor block), so every index the layout keys by is
 * computed on the blocks it sets.
 *
 * The anchor is the end of what reads as one with the citing block:
 * - the box or `:::paragraphs` / `:::columns` group the citation sits in,
 *   wherever in it the citation stands (the figure goes after the
 *   outermost such container, in the main flow);
 * - the paragraph a heading opens (a figure never parts a heading from its
 *   text);
 * - the rest of a list (a figure never splits a list);
 * - the paragraph a display formula continues.
 *
 * A footnote's definition is no citing block: its note is set at a column
 * foot or after the chapter, where no figure can follow it. A resource cited
 * only in notes is set nowhere, and the build says so
 * ({@link paragraphResourcesCitedInNotes}). A resource whose first reference
 * is its own `::resource` directive is set there, as `here` would; a later
 * directive for a resource this pass placed is only a reference, and is
 * dropped.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { Resource, ResourceType } from '../../types.js';
import { resourceRefId } from '../references/crossRefs.js';
import { resolveResourcePlacement } from './floatPlacement.js';

/** Containers a resource placed after its paragraph steps out of. */
const STEP_OUT = new Set(['callout', 'paragraphs', 'columns']);

/** For every block, the index of the matching `containerEnd` of the
 *  outermost {@link STEP_OUT} container it stands in, when it stands in
 *  one. */
function stepOutEnds(blocks: readonly ContentBlock[]): Map<number, number> {
  const open: { start: number; stepOut: boolean }[] = [];
  /** Start index of the outermost step-out container open at each block. */
  const outerStart = new Map<number, number>();
  const endOfStart = new Map<number, number>();
  blocks.forEach((b, i) => {
    if (b.type === 'containerStart') {
      open.push({ start: i, stepOut: !!b.containerName && STEP_OUT.has(b.containerName) });
      return;
    }
    if (b.type === 'containerEnd') {
      const top = open.pop();
      if (top) endOfStart.set(top.start, i);
      return;
    }
    const outer = open.find((o) => o.stepOut);
    if (outer) outerStart.set(i, outer.start);
  });
  const out = new Map<number, number>();
  for (const [i, start] of outerStart) {
    const end = endOfStart.get(start);
    if (end !== undefined) out.set(i, end);
  }
  return out;
}

/** The block after which a resource first cited in `blocks[i]` is set. */
function anchorAfter(blocks: readonly ContentBlock[], i: number, ends: ReadonlyMap<number, number>): number {
  // Out of the box or group the citation sits in, wherever in it.
  const end = ends.get(i);
  if (end !== undefined) return end;
  let j = i;
  for (let guard = 0; guard < blocks.length; guard++) {
    const here = blocks[j]!;
    const next = blocks[j + 1];
    if (!next) break;
    // The paragraph a heading opens (the next heading's, when one follows
    // at once); a box or group opening right under it is that text too.
    if (here.type === 'heading' && next.type !== 'containerEnd') {
      const nextEnd = ends.get(j + 2);
      if (next.type === 'containerStart' && nextEnd !== undefined) { j = nextEnd; break; }
      j++;
      continue;
    }
    // The rest of the list.
    if (here.type === 'listItem' && next.type === 'listItem') { j++; continue; }
    // A display formula the paragraph goes on after.
    if (next.type === 'mathDisplay' && blocks[j + 2]?.continuesParagraph) { j += 2; continue; }
    break;
  }
  return j;
}

/** The resources a block's `:ref`s name, in reading order. */
function refsOf(b: ContentBlock, isResource: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const span of b.spans) {
    const ref = span.ref?.resourceId;
    if (ref) out.push(resourceRefId(ref, isResource));
  }
  return out;
}

/** Whether `id` names a resource placed after its citing paragraph. */
function paragraphPlaced(resources: readonly Resource[], resourceTypes: readonly ResourceType[]): (id: string) => boolean {
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const typeById = new Map(resourceTypes.map((t) => [t.id, t]));
  return (id) => {
    const r = resourceById.get(id);
    return !!r && resolveResourcePlacement(r, typeById.get(r.typeId)).position === 'paragraph';
  };
}

/** `blocks` with a `resourceBlock` after the anchor block of every
 *  resource placed `paragraph` (see the module comment). `incorporated`:
 *  resources the preceding content already took in, only referred to
 *  here. The same array comes back when no resource is placed so. */
export function insertParagraphEmbeds(
  blocks: readonly ContentBlock[],
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
  incorporated: ReadonlySet<string> = new Set(),
): ContentBlock[] {
  const afterParagraph = paragraphPlaced(resources, resourceTypes);
  if (!resources.some((r) => afterParagraph(r.id))) return blocks as ContentBlock[];
  const ids = new Set(resources.map((r) => r.id));
  const isResource = (x: string): boolean => ids.has(x);

  const ends = stepOutEnds(blocks);
  const seen = new Set(incorporated);
  /** Block index → the resources set after it, in citation order. */
  const inserts = new Map<number, string[]>();
  /** Resources this pass sets: their `::resource` directives are dropped. */
  const placed = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'resourceBlock' && b.resourceId) {
      seen.add(b.resourceId);
      continue;
    }
    // A note's text is set apart from the flow (at a column's foot, or
    // after the chapter): no figure follows it.
    if (b.footnoteDef !== undefined || b.footnoteNote !== undefined) continue;
    for (const id of refsOf(b, isResource)) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!afterParagraph(id)) continue;
      const at = anchorAfter(blocks, i, ends);
      inserts.set(at, [...(inserts.get(at) ?? []), id]);
      placed.add(id);
    }
  }
  if (placed.size === 0) return blocks as ContentBlock[];

  const out: ContentBlock[] = [];
  blocks.forEach((b, i) => {
    if (!(b.type === 'resourceBlock' && b.resourceId && placed.has(b.resourceId))) out.push(b);
    for (const id of inserts.get(i) ?? []) {
      out.push({ type: 'resourceBlock', text: '', spans: [], resourceId: id, sourceStart: b.sourceEnd, sourceEnd: b.sourceEnd, sourceMap: [] });
    }
  });
  return out;
}

/** A resource placed after its paragraph that only notes cite: its first
 *  `:ref`, as the source range of the reference (body offsets, front
 *  matter excluded). */
export interface ParagraphCitedInNote {
  resourceId: string;
  sourceStart: number;
  sourceEnd: number;
}

/**
 * The resources placed `paragraph` that a footnote's definition (`notes`)
 * cites while nothing in `blocks` sets them (the running text never cites
 * them, no `::resource` embeds them, and the content before did not take
 * them in, `incorporated`), in the order of their first reference in the
 * notes. They are on no page: a note has no paragraph in the flow to
 * follow. `blocks` are the ones {@link insertParagraphEmbeds} returned.
 */
export function paragraphResourcesCitedInNotes(
  blocks: readonly ContentBlock[],
  notes: Iterable<ContentBlock>,
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
  incorporated?: ReadonlySet<string>,
): ParagraphCitedInNote[] {
  const afterParagraph = paragraphPlaced(resources, resourceTypes);
  if (!resources.some((r) => afterParagraph(r.id))) return [];
  const ids = new Set(resources.map((r) => r.id));
  const isResource = (x: string): boolean => ids.has(x);
  const set = new Set<string>();
  for (const b of blocks) if (b.type === 'resourceBlock' && b.resourceId) set.add(b.resourceId);
  const out: ParagraphCitedInNote[] = [];
  const seen = new Set<string>();
  for (const b of notes) {
    let plain = 0;
    for (const span of b.spans) {
      const at = plain;
      plain += span.text.length;
      if (!span.ref?.resourceId) continue;
      const id = resourceRefId(span.ref.resourceId, isResource);
      if (seen.has(id)) continue;
      seen.add(id);
      if (set.has(id) || incorporated?.has(id) || !afterParagraph(id)) continue;
      const start = b.sourceMap[at] ?? b.sourceStart;
      const next = b.sourceMap[plain];
      out.push({ resourceId: id, sourceStart: start, sourceEnd: next !== undefined && next > start ? next : b.sourceEnd });
    }
  }
  return out;
}
