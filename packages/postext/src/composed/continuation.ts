/**
 * Continuation on other pages (#859, DESIGN §5.6): a frame whose content
 * the reflow ladder (#858) cannot make fit and whose
 * `overflow.continueIn` is `'next-page'` or `'template:<id>'` is cut at its
 * foot with its mark, and the rest goes on on a page added after the
 * composed page, built from a template:
 *
 * - `'next-page'`: the page's `overflowTemplate`, or, unset, the same
 *   template with only the frames that go on filled (the others take no
 *   room: their heights follow their empty content and they leave their
 *   groups);
 * - `'template:<id>'`: that template.
 *
 * On the added page the content goes on in the frame of the same name,
 * else the template's flow frame, else its first frame free. The frames of
 * one page that go on to the same template share one added page; a frame
 * whose content still does not fit there goes on again (with its own
 * `overflow.continueIn`, else the rule that brought it), up to
 * {@link MAX_CONTINUATION_PAGES} pages after the fence's own.
 *
 * Pure helpers: `build.ts` adds the pages, `composedLayout.ts` lays them.
 */
import type { CalloutCut } from '../pipeline/callouts/frameLayout.js';
import type { PlannedCallout } from '../pipeline/callouts/calloutLayout.js';
import { nextFrameOf } from './geometry.js';
import { continueInPage, continueInTemplate, repeatInstance } from './templates.js';
import type { ComposedModuleUse, ResolvedFrame, ResolvedPageTemplate } from './types.js';

/** How many pages, one after another, the content of one composed page may
 *  go on to: the generation of added pages after which what still does not
 *  fit is cut (`frameContinuationLimit`). */
export const MAX_CONTINUATION_PAGES = 16;

/** A story of a composed page (`composedLayout.ts`'s `ComposedStory`). */
interface Story {
  startIdx: number;
  plan: PlannedCallout;
}

/** Content a frame sends on to another page. */
export interface ComposedContinuation {
  /** The frame that cut it, on the page it comes from, and that frame's
   *  id (`VDTFrame.id`). */
  frame: string;
  fromFrameId: string;
  /** The first frame of the sending frame's chain on its page (the frame
   *  itself when no frame comes before it): a story threaded through
   *  frames goes on in the frame its chain starts in (#919). */
  head: string;
  /** Where it goes on: `'next-page'`, `'template:<id>'` or `'page:<id>'`
   *  (its `{attr.x}` read from the fence). */
  rule: string;
  /** The template of the page it comes from (`'next-page'` reads its
   *  `overflowTemplate`). */
  template: string;
  /** Whether that page was itself an added page laid with the template's
   *  frames collapsed (a `'next-page'` with no `overflowTemplate`): the
   *  next one is laid alike. */
  collapsed: boolean;
  /** The story, where it stands, the pieces laid so far (its blocks go on
   *  as `<headBlockId>-cont-<n>`) and its head box's id. */
  story: Story;
  cut: CalloutCut;
  pieces: number;
  headBlockId: string;
  /** The frame of the fence's own page that first sent it on: the pieces
   *  on later pages are `cp<fence>:<slot>~<k>`. */
  slot: string;
  /** Empty frames that follow the sending frame in its stack and go with
   *  the rest to the added page (#912): on a template laid again for what
   *  goes on, they keep their size after the frame that takes it. */
  trailing?: readonly string[];
  /** The sending frame's `overflow.fromMark` (#917). */
  fromMark?: string;
  /** An item of a grid that goes on whole, by whole rows (#1061): none of
   *  it is on the page it comes from (`fromFrameId` is the last instance
   *  laid there, or its own id when none was). It goes on in the instance
   *  of its name. */
  whole?: true;
  /** A frame of a module (#1062): the module it goes on in, laid on the
   *  receiving page in that page's modules group. */
  module?: ComposedModuleUse;
  /** The story comes from another chapter of the book (#943): `chapter` is
   *  the one whose file its text is in, `from` the one whose page sent it
   *  on, positions in the book. `fromFrameId` is a frame id of that page,
   *  which this document does not have. */
  foreign?: { chapter: number; from: number };
}

/** What a page added by continuation receives. */
export interface ComposedContinuationInput {
  /** By the frame of this page that takes each one. */
  receivers: ReadonlyMap<string, ComposedContinuation>;
  /** `<k>` of `~<k>`: 1 on the pages the fence's own page adds, 2 on the
   *  pages those add, and so on. */
  generation: number;
  /** The template laid again for its continuations only (`'next-page'`
   *  with no `overflowTemplate`): frames that receive nothing take no
   *  room. */
  collapse: boolean;
  /** The last page continuation may add: what still does not fit stays
   *  here, cut at the frame's foot. */
  last: boolean;
  /** A later page fence a story jumps to (#917, `'page:<id>'`): the page
   *  is the fence's own, with its own content and frame ids; the frames
   *  that take the story go on to pages added after it (`'next-page'`). */
  jump?: true;
}

/** `continueIn` sends content to another page. */
export function continuesOffPage(continueIn: string | undefined): boolean {
  return continueIn === 'next-page' || continueInTemplate(continueIn) !== undefined || continueInPage(continueIn) !== undefined;
}

/** The page an added page is built from for `c`: its template id, and
 *  whether the template's frames that receive nothing collapse. */
export function continuationTarget(
  c: Pick<ComposedContinuation, 'rule' | 'template' | 'collapsed'>,
  overflowTemplateOf: (id: string) => string | undefined,
): { template: string; collapse: boolean } {
  const named = continueInTemplate(c.rule);
  if (named !== undefined) return { template: named, collapse: false };
  // 'next-page': the template's overflow template, or the template again.
  const over = overflowTemplateOf(c.template);
  if (over !== undefined && over !== c.template) return { template: over, collapse: false };
  return { template: c.template, collapse: over === undefined || c.collapsed };
}

/**
 * The frames of `template` that take `list`, in order: each goes on in
 * the frame of its name, else the flow frame, else the first frame no
 * other continuation took. A story threaded through a chain of frames
 * goes on where its chain starts (#919): in the frame of the chain head's
 * name, else the flow frame, else the frame of the sending frame's name.
 * Those that find no free frame are `left` for another page.
 */
export function assignReceivers(
  template: Pick<ResolvedPageTemplate, 'frames'> & Partial<Pick<ResolvedPageTemplate, 'groups'>>,
  list: readonly ComposedContinuation[],
): { receivers: Map<string, ComposedContinuation>; left: ComposedContinuation[] } {
  const receivers = new Map<string, ComposedContinuation>();
  const left: ComposedContinuation[] = [];
  const names = new Set(template.frames.map((f) => f.name));
  /** Frames a grid of the template repeats (#1061): an item of one goes on
   *  in the instance of its own name, which the page makes for it. */
  const repeated = new Set((template.groups ?? []).flatMap((g) => g.repeat?.frames ?? []));
  const flow = template.frames.find((f) => f.flow && !repeated.has(f.name))?.name;
  for (const c of list) {
    const inst = repeatInstance(c.frame);
    if (inst && repeated.has(inst.frame) && !receivers.has(c.frame)) {
      receivers.set(c.frame, c);
      continue;
    }
    const first = c.head !== undefined && c.head !== c.frame ? [c.head, flow, c.frame] : [c.frame, flow];
    const take = [...first, ...template.frames.map((f) => f.name)].find((n) => n !== undefined && names.has(n) && !receivers.has(n));
    if (take === undefined) left.push(c);
    else receivers.set(take, c);
  }
  return { receivers, left };
}

/**
 * The template an added page is laid with: the receivers (and the frames
 * their chains go on in on that page) continue as the rule that brought
 * the content, unless they send content off the page themselves; on the
 * last page allowed nothing goes on; with `collapse`, every other frame
 * takes no room and leaves its group, but the empty frames that came
 * along with the content (`trailing`, #912).
 */
/**
 * The frames of a later page fence that take the stories jumping to it
 * (#917), in order: the frame `'page:<id>#<frame>'` names, else the frame
 * of the sending chain's head name, else the first frame of the page its
 * own content leaves empty (`holds`: the frame's chain holds a story of
 * the fence). Those that find none are `left`: they go on after it.
 */
export function assignJumpReceivers(
  template: Pick<ResolvedPageTemplate, 'frames'>,
  list: readonly ComposedContinuation[],
  holds: (name: string) => boolean,
): { receivers: Map<string, ComposedContinuation>; left: ComposedContinuation[] } {
  const receivers = new Map<string, ComposedContinuation>();
  const left: ComposedContinuation[] = [];
  const free = template.frames.map((f) => f.name).filter((n) => !holds(n));
  for (const c of list) {
    const named = continueInPage(c.rule)?.frame;
    const take = [named, c.head, c.frame, ...free].find((n) => n !== undefined && free.includes(n) && !receivers.has(n));
    if (take === undefined) left.push(c);
    else receivers.set(take, c);
  }
  return { receivers, left };
}

/** Whether content `frame` sends on lands on the same template laid again
 *  with its other frames collapsed (`'next-page'` with no other
 *  `overflowTemplate`), as {@link continuationTarget} decides. */
export function continuesCollapsed(template: Pick<ResolvedPageTemplate, 'id' | 'overflowTemplate'>, frame: Pick<ResolvedFrame, 'overflow'>, collapsed: boolean): boolean {
  if (frame.overflow.continueIn !== 'next-page') return false;
  const over = template.overflowTemplate;
  return over === undefined || (over === template.id && collapsed);
}

/**
 * The empty frames that go with the rest of `frame` to the page it goes
 * on to (#912): those right after it in its stack that hold no story
 * (`holds` says which do) and are not pinned, up to the first that holds
 * one. An answer space under an activity box follows the end of its text.
 */
export function trailingFrames(template: Pick<ResolvedPageTemplate, 'frames' | 'groups'>, frame: string, holds: (name: string) => boolean): string[] {
  const g = template.groups.find((gr) => gr.kind === 'stack' && gr.frames.includes(frame));
  if (!g) return [];
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  const out: string[] = [];
  for (const name of g.frames.slice(g.frames.indexOf(frame) + 1)) {
    const f = byName.get(name);
    if (!f) continue;
    if (f.pin || holds(name)) break;
    out.push(name);
  }
  return out;
}

/** `template` with `names` taking no room: `'auto'` (`empty`: no height
 *  at all, for a frame whose content goes on whole) with no min/max and
 *  out of their groups (#859, #912). A group's frames that stay start
 *  where its first frame did when that one leaves and they have no
 *  placement of their own. */
export function collapseFrames(template: ResolvedPageTemplate, names: ReadonlySet<string>, empty: ReadonlySet<string> = new Set()): ResolvedPageTemplate {
  if (names.size === 0) return template;
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  /** A frame that stays and opens its group takes the placement of the
   *  group's first frame. */
  const inherit = new Map<string, ResolvedFrame['placement']>();
  const groups = template.groups.map((g) => {
    const frames = g.frames.filter((n) => !names.has(n));
    const lead = byName.get(g.frames[0] ?? '');
    const first = byName.get(frames[0] ?? '');
    if (lead && first && lead !== first && names.has(lead.name) && lead.placement && !first.placement && !first.grid) inherit.set(first.name, lead.placement);
    return frames.length === g.frames.length ? g : { ...g, frames };
  });
  const frames = template.frames.map((f): ResolvedFrame => {
    if (inherit.has(f.name)) return { ...f, placement: inherit.get(f.name) };
    if (!names.has(f.name)) return f;
    // A frame whose content goes on whole (#912) is laid with no height,
    // so it keeps none of it.
    const out: ResolvedFrame = { ...f, height: empty.has(f.name) ? { value: 0, unit: 'mm' } : 'auto', grow: 0 };
    delete out.minHeight;
    delete out.maxHeight;
    return out;
  });
  return { ...template, frames, groups };
}

/** The frames a page added by continuation lays with no room: with
 *  `collapse`, every frame that neither receives content (nor is in the
 *  chain it goes on in) nor came along with it (`trailing`, #912). */
export function collapsedOnAddedPage(template: Pick<ResolvedPageTemplate, 'frames'>, input: ComposedContinuationInput): Set<string> {
  if (!input.collapse) return new Set();
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  const kept = new Set<string>();
  for (const [name, c] of input.receivers) {
    for (let n: string | undefined = name; n !== undefined && byName.has(n) && !kept.has(n); n = nextFrameOf(byName.get(n)!)) kept.add(n);
    for (const t of c.trailing ?? []) kept.add(t);
  }
  return new Set(template.frames.map((f) => f.name).filter((n) => !kept.has(n)));
}

export function continuationTemplate(template: ResolvedPageTemplate, input: ComposedContinuationInput): ResolvedPageTemplate {
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  /** Frames the received content fills, with the rule it came by. */
  const filled = new Map<string, string>();
  for (const [name, c] of input.receivers) {
    const seen = new Set<string>();
    for (let n: string | undefined = name; n !== undefined && byName.has(n) && !seen.has(n); n = nextFrameOf(byName.get(n)!)) {
      seen.add(n);
      if (!filled.has(n)) filled.set(n, c.rule);
    }
  }
  const frames = template.frames.map((f): ResolvedFrame => {
    const rule = filled.get(f.name);
    if (rule !== undefined) {
      const own = f.overflow.continueIn;
      if (input.last && continuesOffPage(own)) {
        const overflow = { ...f.overflow };
        delete overflow.continueIn;
        return { ...f, overflow };
      }
      // The last frame of the chain goes on as the content came, unless
      // it says where itself; after a jump (#917), on the pages added
      // after the one it jumped to.
      const inherited = continueInPage(rule) !== undefined ? 'next-page' : rule;
      if (!input.last && nextFrameOf(f) === undefined && !continuesOffPage(own)) return { ...f, overflow: { ...f.overflow, continueIn: inherited } };
      return f;
    }
    return f;
  });
  return collapseFrames({ ...template, frames }, collapsedOnAddedPage(template, input));
}
