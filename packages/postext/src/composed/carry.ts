/**
 * A story that jumps from one chapter file into a page fence of a later one
 * (#943, DESIGN §5.17). The sending chapter cannot lay the rest out: the
 * page lives in another `buildDocument` call. It hands the rest back
 * ({@link StoryJump}, `VDTDocument.pendingJumps`) and the host gives it to
 * the chapter that has the page (`LayoutContinuation.jumps`), which sets it
 * in the frames its page leaves free, as it would a story of its own.
 *
 * A jump carries the story as the sender had it ready to lay: the box and
 * its children (parsed, with numbers, tables and citations in place), the
 * cut where the sender stopped, and the little the children's layout reads
 * by their place in the sender's block list (heading numbers, the width of
 * ordered-list markers, footnote numbers). The receiver appends the blocks
 * past its own, shifts their source offsets so that `offset + bodyOffset`
 * is still the offset in the sender's file (`VDTBlock.sourceChapter` says
 * whose), gives their containers ids of their own and lays them through a
 * pass that answers every lookup for them.
 *
 * Pure helpers; `build.ts` exports the jump and `composedLayout.ts` lays
 * the imported story.
 */
import type { ContentBlock } from '../parse/types.js';
import type { CarriedNumber, StoryJump, CarriedNote } from './carryTypes.js';
export type { CarriedNumber, StoryJump, CarriedNote } from './carryTypes.js';
import { planCallouts } from '../pipeline/callouts/calloutLayout.js';
import type { ComposedContinuation } from './continuation.js';
import { CAP_HEADING_ATTR } from './wrap.js';

/** First container id the carried stories take: past every id the parser
 *  and the other synthetic boxes hand out. */
const CARRIED_CONTAINER_BASE = 1_900_000_000;

/** The keys whose number is an offset in the sender's body. */
const OFFSET_KEYS = new Set(['sourceStart', 'sourceEnd']);

/** How a carried story is renamed in its new chapter. */
interface Renames {
  /** Offsets move by this much. */
  delta: number;
  /** Container ids. */
  ids: ReadonlyMap<number, number>;
  /** Note ids: a note of the sending chapter is not one of this one's. */
  notes: ReadonlyMap<string, string>;
}

/** `value` copied with every source offset moved, every container id and
 *  note id renamed. Plain data only (a parse result). */
function carry(value: unknown, r: Renames, key?: string): unknown {
  const { delta, ids, notes } = r;
  if (typeof value === 'number') {
    if (key !== undefined && OFFSET_KEYS.has(key)) return value + delta;
    if (key === 'containerId') return ids.get(value) ?? value;
    return value;
  }
  if (typeof value === 'string') return key === 'footnoteDef' ? notes.get(value) ?? value : value;
  if (Array.isArray(value)) {
    if (key === 'sourceMap') return (value as unknown[]).map((v) => (typeof v === 'number' ? v + delta : v));
    return value.map((v) => carry(v, r));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // The heading another frame of the sender's page took names a block
      // that is not carried.
      if (key === 'containerAttrs' && k === CAP_HEADING_ATTR) continue;
      // A note marker: `footnote.id`.
      if (key === 'footnote' && k === 'id' && typeof v === 'string') out[k] = notes.get(v) ?? v;
      else out[k] = carry(v, r, k);
    }
    return out;
  }
  return value;
}

/** Every container id the blocks name, in order of appearance. */
function containerIdsOf(blocks: readonly ContentBlock[]): number[] {
  const seen = new Set<number>();
  for (const b of blocks) if (b.containerId !== undefined) seen.add(b.containerId);
  return [...seen];
}

/** The stories carried into a chapter, laid past its own blocks. */
export interface ImportedJumps {
  /** The carried blocks, to append to the chapter's content blocks. */
  blocks: ContentBlock[];
  /** The continuations, with their stories at the positions they will have
   *  once appended, by the page id they jump to, in source order. */
  byTarget: Map<string, ComposedContinuation[]>;
  /** Per story, by the position of its opening marker once appended. */
  stories: Map<number, { jump: StoryJump; chapter: number; numbers: ReadonlyMap<number, CarriedNumber>; startIdx: number; endIdx: number }>;
  /** The notes the stories cite, under the ids they have here. */
  footnotes: (CarriedNote & { chapter: number })[];
  /** The position of `blocks[0]` among the chapter's content blocks. */
  baseLength: number;
}

/**
 * The jumps `jumps` as this chapter lays them: appended after
 * `baseLength` content blocks, source offsets as this chapter's body reads
 * them (`bodyOffset`), containers renamed. A jump with no blocks is
 * skipped.
 */
export function importJumps(jumps: readonly StoryJump[], baseLength: number, bodyOffset: number): ImportedJumps {
  const blocks: ContentBlock[] = [];
  const byTarget = new Map<string, ComposedContinuation[]>();
  const stories: ImportedJumps['stories'] = new Map();
  const footnotes: ImportedJumps['footnotes'] = [];
  let nextId = CARRIED_CONTAINER_BASE;
  let nextNote = 0;
  for (const jump of jumps) {
    if (jump.blocks.length === 0) continue;
    const ids = new Map<number, number>();
    for (const id of containerIdsOf(jump.blocks)) ids.set(id, nextId++);
    // `offset + bodyOffset` of a carried block is its offset in the
    // sending chapter's file.
    const delta = jump.bodyOffset - bodyOffset;
    const notes = new Map<string, string>();
    for (const n of jump.footnotes ?? []) notes.set(n.id, `~${nextNote++}~${n.id}`);
    const renames: Renames = { delta, ids, notes };
    const own = jump.blocks.map((b) => carry(b, renames) as ContentBlock);
    for (const n of jump.footnotes ?? []) {
      footnotes.push({ id: notes.get(n.id)!, number: n.number, chapter: jump.chapter ?? -1, ...(n.def ? { def: carry(n.def, renames) as ContentBlock } : {}) });
    }
    const startIdx = baseLength + blocks.length;
    blocks.push(...own);
    const plan = planCallouts(own).get(0);
    if (!plan) {
      blocks.length = startIdx - baseLength;
      continue;
    }
    const chapter = jump.chapter ?? -1;
    const c: ComposedContinuation = {
      frame: jump.frame,
      fromFrameId: jump.fromFrameId,
      head: jump.head,
      rule: jump.rule,
      template: jump.template,
      collapsed: jump.collapsed,
      story: { startIdx, plan: { endIdx: plan.endIdx + startIdx, attrs: plan.attrs, containerId: plan.containerId } },
      cut: jump.cut,
      pieces: jump.pieces,
      // A block id of the sending chapter's page could be a block id of
      // this one's.
      headBlockId: `j${chapter}:${jump.headBlockId}`,
      slot: jump.slot,
      ...(jump.trailing ? { trailing: jump.trailing } : {}),
      ...(jump.fromMark !== undefined ? { fromMark: jump.fromMark } : {}),
      foreign: { chapter, from: jump.fromChapter ?? chapter },
    };
    const list = byTarget.get(jump.target) ?? [];
    list.push(c);
    byTarget.set(jump.target, list);
    stories.set(startIdx, { jump, chapter, numbers: new Map((jump.numbers ?? []).map((n) => [startIdx + n.at, n])), startIdx, endIdx: startIdx + own.length - 1 });
  }
  return { blocks, byTarget, stories, footnotes, baseLength };
}
