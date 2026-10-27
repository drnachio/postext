// The passes a page is laid with beside its own: trial passes for merged
// stories, the pass of stories carried in from other chapters, and the
// test whether an alternative template fits (#1276: split out of composedLayout.ts).
import type { ContentBlock } from '../../../parse/types.js';
import { chainHead, FRAME_ATTR } from '../../../composed/wrap.js';
import { repeatedFrames, repeatInstance } from '../../../composed/templates.js';
import type { ResolvedPageTemplate } from '../../../composed/types.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import { computeOrderedListRunMetrics } from '../../text/lists.js';
import { planParagraphContainers } from '../../callouts/paragraphContainers.js';
import type { ImportedJumps, CarriedNumber } from '../../../composed/carry.js';
import type { FrameLayoutPass } from '../../callouts/frameLayout.js';
import { layoutComposedPage } from './layoutComposedPage.js';
import type { ComposedPageInput, ComposedStory } from './state.js';

/** The pass of a trial layout (#953): `base` with `extra` blocks appended to
 *  its content, each a copy of the block at `originOf[k]`, and every lookup
 *  the box typesetter keys by content index answered for the appended
 *  blocks as for the blocks they copy. The paragraph groups
 *  (`paragraphContainers.byBlock`), the heading and list numbers, the drop
 *  cap and indent rules (which read the neighbours of a block in
 *  `contentBlocks`), the comic strips and heading designs follow the
 *  copies, so a trial sets a merged story as the build sets the story
 *  itself. The trial also keeps its own notes (`dropCapNotes`,
 *  `joiningLetterSpacing`), which the build reports for the page it lays. */
function trialPass(base: FrameLayoutPass, extra: readonly ContentBlock[], originOf: readonly number[], measureOrigin: ReadonlyMap<number, number>): FrameLayoutPass {
  const n = base.contentBlocks.length;
  const at = (idx: number): number => (idx < n ? idx : originOf[idx - n] ?? idx);
  const extend = <T,>(arr: T[] | undefined): T[] | undefined => (arr && extra.length > 0 ? [...arr, ...originOf.map((o) => arr[o]!)] : arr);
  const contentBlocks = extra.length > 0 ? [...base.contentBlocks, ...extra] : base.contentBlocks;
  const contexts = new Map<BlockMeasureContext, BlockMeasureContext>();
  const trialCtx = (ctx: BlockMeasureContext): BlockMeasureContext => {
    const known = contexts.get(ctx);
    if (known) return known;
    const perBlock = new Map(ctx.orderedMetrics.perBlock);
    originOf.forEach((o, k) => {
      const m = ctx.orderedMetrics.perBlock.get(o);
      if (m) perBlock.set(n + k, m);
    });
    const out: BlockMeasureContext = {
      ...ctx,
      contentBlocks,
      headingPrefixes: extend(ctx.headingPrefixes)!,
      ...(ctx.headingNumbers ? { headingNumbers: extend(ctx.headingNumbers)! } : {}),
      orderedMetrics: { ...ctx.orderedMetrics, perBlock },
      dropCapNotes: new Map(),
      joiningLetterSpacing: new Set(),
    };
    contexts.set(ctx, out);
    return out;
  };
  const byBlock = base.paragraphContainers.byBlock;
  return {
    ...base,
    contentBlocks,
    paragraphContainers: extra.length > 0 ? { byId: base.paragraphContainers.byId, byBlock: [...byBlock, ...originOf.map((o) => byBlock[o])] } : base.paragraphContainers,
    // A merged story's box is set in the context of the story whose box
    // it replaces.
    measureCtxFor: (startIdx, style) => trialCtx(base.measureCtxFor(measureOrigin.get(startIdx) ?? startIdx, style)),
    stripBlock: (raw, idx, width) => base.stripBlock(raw, at(idx), width),
    ...(base.headingDesign ? { headingDesign: (raw, blockIdx, heading, width) => base.headingDesign!(raw, at(blockIdx), heading, width) } : {}),
  };
}

/**
 * The pass the stories carried in from other chapters (#943) are laid with:
 * `base` with their blocks appended to its content, and every lookup the
 * box typesetter keys by content index answered for them from what the
 * sender gave (heading numbers) or worked out again from the carried
 * blocks alone (paragraph groups, ordered-list markers). A carried story's
 * box is set in the context of the text, with the list indents its sender
 * set its lists with; the typography of a styled section or a part of this
 * chapter does not reach it.
 */
export function carriedPass(base: FrameLayoutPass, carried: ImportedJumps): FrameLayoutPass {
  if (carried.blocks.length === 0) return base;
  const n = base.contentBlocks.length;
  const contentBlocks = [...base.contentBlocks, ...carried.blocks];
  const local = planParagraphContainers(carried.blocks, base.resolved);
  const byBlock = [...base.paragraphContainers.byBlock];
  byBlock.length = n;
  byBlock.push(...local.byBlock);
  const paragraphContainers = { byId: new Map([...base.paragraphContainers.byId, ...local.byId]), byBlock };
  const numberAt = new Map<number, CarriedNumber>();
  for (const story of carried.stories.values()) for (const [at, num] of story.numbers) numberAt.set(at, num);
  const extend = <T,>(arr: T[] | undefined, pick: (num: CarriedNumber) => T | undefined): T[] | undefined => {
    if (!arr) return arr;
    const out = [...arr];
    out.length = n;
    out.length = contentBlocks.length;
    for (const [at, num] of numberAt) out[at] = pick(num) as T;
    return out;
  };
  const contexts = new Map<BlockMeasureContext, Map<number, BlockMeasureContext>>();
  const carriedCtx = (ctx: BlockMeasureContext, startIdx: number): BlockMeasureContext => {
    const story = carried.stories.get(startIdx)!;
    const of = contexts.get(ctx) ?? new Map<number, BlockMeasureContext>();
    contexts.set(ctx, of);
    const known = of.get(startIdx);
    if (known) return known;
    const metrics = computeOrderedListRunMetrics(carried.blocks, base.resolved, ctx.bodyStyle.fontSizePx);
    const perBlock = new Map(ctx.orderedMetrics.perBlock);
    for (const [i, m] of metrics.perBlock) perBlock.set(n + i, m);
    const out: BlockMeasureContext = {
      ...ctx,
      contentBlocks,
      headingPrefixes: extend(ctx.headingPrefixes, (num) => num.prefix)!,
      ...(ctx.headingNumbers ? { headingNumbers: extend(ctx.headingNumbers, (num) => num.value)! } : {}),
      orderedMetrics: { perBlock, maxWidthByDepth: ctx.orderedMetrics.maxWidthByDepth },
      ...(story.jump.orderedLevelIndentsPx ? { orderedLevelIndentsPx: story.jump.orderedLevelIndentsPx } : {}),
      dropCapNotes: new Map(),
      joiningLetterSpacing: new Set(),
    };
    of.set(startIdx, out);
    return out;
  };
  return {
    ...base,
    contentBlocks,
    paragraphContainers,
    measureCtxFor: (startIdx, style) => {
      const ctx = base.measureCtxFor(startIdx, style);
      return carried.stories.has(startIdx) ? carriedCtx(ctx, startIdx) : ctx;
    },
  };
}

/** The page's stories as `wrapComposedPages` would group them for template
 *  `alt` (#937): a story whose head names a frame of `alt` stays the story
 *  of that frame's chain, one a `takes` frame took goes to `alt`'s frame
 *  that takes the same level, and the rest go to `alt`'s flow frame, after
 *  its own content, in Markdown order. Merged stories are boxes appended
 *  past the pass's content blocks (`trialPass`), so the page can be laid
 *  with them. `undefined` when some content would leave the page (no frame
 *  of `alt` takes it). */
function regroupStories(input: ComposedPageInput, alt: ResolvedPageTemplate): { pass: FrameLayoutPass; stories: Map<string, ComposedStory> } | undefined {
  const names = new Set(alt.frames.map((f) => f.name));
  const flow = alt.frames.find((f) => f.flow);
  const flowHead = flow ? chainHead(alt, flow.name) : undefined;
  const current = input.template.frames;
  const repeatedIn = repeatedFrames(alt);
  const headIn = (head: string): string | undefined => {
    if (names.has(head)) return chainHead(alt, head);
    // An instance of a frame `alt` repeats too (#1061) stays an instance.
    const inst = repeatInstance(head);
    if (inst && repeatedIn.has(inst.frame)) return head;
    const takes = current.find((f) => f.name === head)?.takes;
    const taker = takes ? alt.frames.find((f) => f.takes === takes) : undefined;
    return taker ? chainHead(alt, taker.name) : flowHead;
  };
  const groups = new Map<string, [string, ComposedStory][]>();
  for (const [head, story] of [...input.stories].sort((a, b) => a[1].startIdx - b[1].startIdx)) {
    const to = headIn(head);
    if (to === undefined) return undefined;
    groups.set(to, [...(groups.get(to) ?? []), [head, story]]);
  }
  // Every story stays its frame's own: the page as it is.
  if ([...groups].every(([to, list]) => list.length === 1 && list[0]![0] === to)) return { pass: trialPass(input.pass, [], [], new Map()), stories: new Map(input.stories) };
  const base = input.pass.contentBlocks;
  const extra: ContentBlock[] = [];
  /** The block of the page each appended block copies. */
  const originOf: number[] = [];
  /** Where each appended box's blocks come from: the first story's box. */
  const origin = new Map<number, number>();
  let nextId = base.reduce((m, b) => Math.max(m, b.containerId ?? 0), 0) + 1;
  const stories = new Map<string, ComposedStory>();
  for (const [to, list] of groups) {
    if (list.length === 1 && list[0]![0] === to) {
      stories.set(to, list[0]![1]);
      continue;
    }
    const own = list.find(([h]) => h === to)?.[1] ?? list[0]![1];
    const open = base[own.startIdx]!;
    const id = nextId++;
    const startIdx = base.length + extra.length;
    const attrs = { ...own.plan.attrs, [FRAME_ATTR]: to };
    extra.push({ ...open, containerAttrs: attrs, containerId: id });
    originOf.push(own.startIdx);
    for (const [, s] of list) {
      extra.push(...base.slice(s.startIdx + 1, s.plan.endIdx));
      for (let i = s.startIdx + 1; i < s.plan.endIdx; i++) originOf.push(i);
    }
    const last = list[list.length - 1]![1];
    extra.push({ ...base[last.plan.endIdx]!, containerId: id });
    originOf.push(last.plan.endIdx);
    origin.set(startIdx, own.startIdx);
    stories.set(to, { startIdx, plan: { endIdx: base.length + extra.length - 1, attrs, containerId: id } });
  }
  return { pass: trialPass(input.pass, extra, originOf, origin), stories };
}

/** The page fits when set with template `alt` (#937): its stories regrouped
 *  for it (`regroupStories`), its own reflow ladder run; no frame
 *  overflows, every story is laid, and nothing goes on to another page. */
export function fitsWithTemplate(input: ComposedPageInput, alt: ResolvedPageTemplate): boolean {
  const regrouped = regroupStories(input, alt);
  if (!regrouped) return false;
  // No proposals of its own (`alternatives` left out).
  const trial = layoutComposedPage({ ...input, template: alt, pass: regrouped.pass, stories: regrouped.stories, alternatives: undefined, continuing: undefined });
  return !trial.continuations
    && trial.warnings.every((w) => w.kind !== 'frameOverflow')
    && [...regrouped.stories.keys()].every((h) => trial.laid.has(h));
}
