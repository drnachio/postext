/**
 * Lay out one composed page (#855, DESIGN §5.1–5.2): place the frames of
 * its template, pour each story (`composed/wrap.ts`) into its frames with
 * the box typesetter (`frameLayout.ts`), and hand back the blocks for the
 * page's floats with the page's `VDTComposedPage`.
 *
 * Per frame, in {@link frameOrder}: its box ({@link placeBox}, an `'auto'`
 * height measured with the content the frame will hold), then its content:
 * the story from where the frame before it in the chain stopped, cut at the
 * frame's foot when a `next` frame takes the rest, else laid whole and
 * clipped at the foot. Text runs round the frames that push it (`exclude:
 * 'push'`) already placed; groups negotiate their frames' space (#856).
 *
 * A frame whose content still does not fit climbs the reflow ladder (#858,
 * DESIGN §5.4), frame by frame in template order, each step on top of the
 * ones before it, stopping at the first that makes it fit: free space (a
 * fixed height grows to its `maxHeight`), its group pushing and yielding
 * (already part of every layout), smaller pictures in the frame and its
 * group (`fit.imageMinScale`), the group's other frames down to their
 * minimum or their content, smaller text (`fit.minScale`), continuation on
 * another page (#859). Each step lays the whole page again, so a change
 * stays on the page. What still does not fit is clipped and reported
 * (`frameOverflow`) with the steps tried and proposals worked out on the
 * page.
 *
 * A frame whose `overflow.continueIn` sends content to another page
 * (`'next-page'`, `'template:<id>'`, #859) takes the ladder's last step
 * before the warning: it is cut at its foot, with its mark, its text and
 * pictures back at full size, and the rest is handed back
 * (`ComposedPageLayout.continuations`) for `build.ts` to lay on pages it
 * adds after this one, with this function (`ComposedPageInput.continuing`).
 */
import { isCornerRadii } from '../../design/boxShape.js';
import type { ComposedPageFence, ContentBlock } from '../../parse/types.js';
import type { CornerRadius, Dimension, ResolvedCalloutStyleConfig } from '../../types.js';
import { pageIsMirrored, pageIsVertical, type ContentWarning, type FrameFitStep, type FrameOverflowProposal, type ReflowEvent, type VDTBlock, type VDTComposedPage, type VDTDesignRuleBlock, type VDTExclusionContour, type VDTFrame, type VDTPage } from '../../vdt.js';
import { contourBounds, scaleContourAbout, shiftContour } from '../../contour/index.js';
import { frameContour } from '../../composed/contour.js';
import { dimensionToPx } from '../../units.js';
import { frameBounds, frameModeTurn, quarterTurnedRect } from '../../composed/paint.js';
import { withMeasureWritingMode } from '../../measure/vertical.js';
import { chainHead, FRAME_ATTR } from '../../composed/wrap.js';
import { framePlaceable, nextFrameOf, groupPlaceable, placeBox, unionRect, type FrameAreas, type Rect } from '../../composed/geometry.js';
import { composedOrder, groupOfFrames, layoutGroup, type GroupItem } from '../../composed/groups.js';
import { reflowEvents, type FrameMotion } from '../../composed/reflowLog.js';
import { anchorTarget, lookOver, repeatInstance, repeatedFrames, resolveContinueIn } from '../../composed/templates.js';
import { collapsedOnAddedPage, collapseFrames, continuationTemplate, continuesCollapsed, continuesOffPage, trailingFrames, type ComposedContinuation, type ComposedContinuationInput } from '../../composed/continuation.js';
import type { FrameLook, FrameLookEntry, ResolvedFrame, ResolvedFrameGroup, ResolvedModule, ResolvedPageTemplate } from '../../composed/types.js';
import { isModuleTemplate, resolvePageTemplate, type PageTemplateSource } from '../../composed/templates.js';
import { frameElementId } from '../../composed/ids.js';
import { expandRepeats, instanceOf, repeatItemsOf } from '../../composed/repeat.js';
import { moduleFenceAttrs, moduleOfFrame, nestedChain } from '../../composed/modules.js';
import { frameLinePx, frameRuleBlocks } from '../../composed/rules.js';
import { overlapChecks } from '../../composed/overlap.js';
import { growMembers, grownHeight } from '../../composed/grow.js';
import { offsetCalloutToAbsolute, type BoxExclusion, type CalloutLayoutResult, type PlannedCallout } from '../callouts/calloutLayout.js';
import { isMarkerBlock } from '../blocks/buildHelpers.js';
import type { BlockMeasureContext } from '../blocks/measureContentBlock.js';
import { createLayoutMemo, layoutMemoSwitch } from './layoutMemo.js';
import { createMeasureMemo } from './measureMemo.js';
import { computeOrderedListRunMetrics } from '../text/lists.js';
import { planParagraphContainers } from '../callouts/paragraphContainers.js';
import type { CarriedNumber, ImportedJumps } from '../../composed/carry.js';
import { CUT_START, fragmentRange, frameCutRules, makeCalloutLayouter, partBreakCut, splitCalloutFragment, type CalloutCut, type CalloutLayouter, type FrameBoxOptions, type FrameLayoutPass } from '../callouts/frameLayout.js';

/** A story of the page: the box `composed/wrap.ts` made of a chain's
 *  content, by the name of the chain's first frame. */
export interface ComposedStory {
  startIdx: number;
  plan: PlannedCallout;
}

export interface ComposedPageInput {
  pass: FrameLayoutPass;
  page: VDTPage;
  template: ResolvedPageTemplate;
  fence: ComposedPageFence;
  /** Content index of the page's opening and closing markers. */
  startIdx: number;
  endIdx: number;
  /** The page's stories by head frame name. */
  stories: ReadonlyMap<string, ComposedStory>;
  /** The style a frame is drawn with: its `style`, or frameless. */
  styleOf(frame: ResolvedFrame): ResolvedCalloutStyleConfig;
  areas: FrameAreas;
  dpi: number;
  emPx: number;
  /** Source offset of the body in the chapter file. */
  bodyOffset: number;
  /** The page swaps its mirrored margins (an `'outer'` corner icon). */
  mirrored: boolean;
  /** The gap text keeps from a frame that pushes it. */
  pushGapPx: number;
  /** The box a frame takes given the one its placement gives: on a spread
   *  (#861, `composed/spread.ts`), off the spine band unless the frame
   *  crosses the gutter. An `'auto'` height is measured at the width it
   *  returns. */
  fitBox?: (frame: ResolvedFrame, rect: Rect) => Rect;
  /** Shapes a frame's lines keep off, by frame name, in page (flow)
   *  coordinates: a comic text panel's slanted edges (#909). */
  frameExclusions?: ReadonlyMap<string, readonly BoxExclusion[]>;
  /** The document's locale (`config.locale`), named by `frameOverflow`. */
  locale?: string;
  /** The book's other templates, resolved for this page's side, in
   *  `pageTemplates` order: a `useTemplate` proposal (#858) lays the page
   *  with each that has the overflowing frame's name. */
  alternatives?: () => readonly ResolvedPageTemplate[];
  /** A page added by continuation (#859): what its frames receive from
   *  the page before it. */
  continuing?: ComposedContinuationInput;
}

export interface ComposedPageLayout {
  composed: VDTComposedPage;
  /** Frame boxes and their content, in paint-independent page order (each
   *  frame's box first): for `page.floats` and `doc.blocks`. */
  blocks: VDTBlock[];
  warnings: ContentWarning[];
  /** Story heads laid in a frame of this page. A story left out (its frame
   *  is missing on this side) is set in the flow after the page. */
  laid: Set<string>;
  /** The frames `fitBox` moved or narrowed in the layout kept (a spread's
   *  gutter, #861): the box placed and the box it took. Only the
   *  composition the reflow ladder (#858) settles on counts, not the ones
   *  it tried. Not kept by the page memo (spreads are laid afresh). */
  fitted?: Map<string, { placed: Rect; kept: Rect }>;
  /** Content the page's frames send on to other pages (#859), in template
   *  order. */
  continuations?: ComposedContinuation[];
}

const MM_PER_IN = 25.4;

/** Where each story stands while its frames are filled. */
interface StoryState {
  story: ComposedStory;
  /** The story as the frame being filled sets it (its style). */
  L: CalloutLayouter;
  cut: CalloutCut;
  /** Pieces laid so far (the head is piece 0). */
  pieces: number;
  headBlockId: string;
  headFrameId: string;
  lastFrameId?: string;
}

/** What the reflow ladder (#858) changed from the template as written, for
 *  one composition of the page. */
interface FitState {
  /** Frames whose fields the ladder (or a proposal tried) replaces:
   *  `free` lets a fixed height grow to `maxHeight`. */
  patches: ReadonlyMap<string, Partial<ResolvedFrame>>;
  /** Text scale per story (by its head frame), below 1. */
  text: ReadonlyMap<string, number>;
  /** Picture scale per story (by its head frame), below 1, with the frame
   *  whose ladder set it. */
  pictures: ReadonlyMap<string, { scale: number; by: string }>;
  /** Groups whose frames give space back down to their minimum or their
   *  content, whether they `shrink` or not (`redistribute`). */
  yieldAll: ReadonlySet<string>;
  /** Frames cut at their foot whose rest goes on on another page (#859). */
  goOn: ReadonlySet<string>;
  /** Grids whose rows that do not fit go on on another page, whole
   *  (#1061). */
  gridsOn: ReadonlySet<string>;
}

const NO_FIT: FitState = { patches: new Map(), text: new Map(), pictures: new Map(), yieldAll: new Set(), goOn: new Set(), gridsOn: new Set() };

/** Where a frame that goes on to another page left its story (#859). */
interface Spill {
  head: string;
  cut: CalloutCut;
  /** The frame took some of the story. */
  advanced: boolean;
  pieces: number;
  headBlockId: string;
  frameId: string;
  /** An item of a grid that goes on whole (#1061). */
  whole?: true;
}

/** One laying out of the page's frames. */
interface Composition {
  frames: VDTFrame[];
  blocks: VDTBlock[];
  log: ReflowEvent[];
  laid: Set<string>;
  /** Each frame's content height at its final width (page px), for the
   *  frames that hold content, measured when asked. */
  needs: Map<string, () => number>;
  /** What `fitBox` did to each frame. */
  fitted: Map<string, { placed: Rect; kept: Rect }>;
  /** Groups' final boxes, by name (the overlap checks, #1053). */
  groupRects: Map<string, Rect>;
  /** The template laid (with the ladder's patches). */
  template: ResolvedPageTemplate;
  /** `textWrap` notes of the contour pushes (#883, `noContour`). */
  notes?: ContentWarning[];
  /** Frames cut for another page, and where they left their story. */
  spills: Map<string, Spill>;
  /** Frames whose contents ask for a page of their own further down (a
   *  part of the contents under `toc.parts.breakBefore`, #996) that are
   *  not allowed to go on yet: the ladder lets them. */
  wantsOn: Set<string>;
  /** Instances of a grid's rows cut at the grid's foot (#1061), and frames
   *  of modules cut at their group's foot (#1062). */
  clipped: Set<string>;
  /** The boxes of the modules laid (#1062), by instance name. */
  moduleRects: Map<string, Rect>;
}

/** Step of the text and picture scales the ladder tries (DESIGN §5.4). */
const FIT_STEP = 0.025;
/** Lowest text scale an `allowShrink` proposal goes to. */
const PROPOSAL_MIN_SCALE = 0.5;
/** Most compositions of one page the ladder and its proposals may run. */
const COMPOSE_BUDGET = 96;

/** The scales from just under 1 (or under `from`) down to `min`, in
 *  {@link FIT_STEP} steps, `min` last. */
function scaleSteps(min: number, from = 1): number[] {
  const out: number[] = [];
  for (let k = 1; ; k++) {
    const s = Math.round((from - k * FIT_STEP) * 1e4) / 1e4;
    if (s <= min + 1e-6) break;
    out.push(s);
  }
  if (min < from - 1e-6) out.push(Math.round(min * 1e4) / 1e4);
  return out;
}

/** The template with the ladder's patches on its frames. */
function patchTemplate(template: ResolvedPageTemplate, patches: ReadonlyMap<string, Partial<ResolvedFrame>>): ResolvedPageTemplate {
  if (patches.size === 0) return template;
  return { ...template, frames: template.frames.map((f) => (patches.has(f.name) ? { ...f, ...patches.get(f.name)! } : f)) };
}

/** A fixed height (a length, not a percentage). */
const fixedHeight = (f: ResolvedFrame): Dimension | undefined => {
  const h = f.height as unknown;
  return h !== null && typeof h === 'object' && 'value' in (h as object) && 'unit' in (h as object) ? (f.height as Dimension) : undefined;
};

/** The frame before each frame of a chain on the page. On a page added by
 *  continuation (#859) a frame that receives content starts its chain. */
function chainPrev(template: ResolvedPageTemplate, receivers: ReadonlyMap<string, unknown> | undefined): Map<string, string> {
  const names = new Set(template.frames.map((f) => f.name));
  const prev = new Map<string, string>();
  for (const f of template.frames) {
    const n = nextFrameOf(f);
    if (n && names.has(n) && !prev.has(n) && !receivers?.has(n)) prev.set(n, f.name);
  }
  return prev;
}

const sameCut = (a: CalloutCut, b: CalloutCut): boolean =>
  a.child === b.child && a.line === b.line && JSON.stringify(a.group ?? null) === JSON.stringify(b.group ?? null);

export function layoutComposedPage(asked: ComposedPageInput): ComposedPageLayout {
  // The grids that repeat a frame set (#1061) are laid with one instance of
  // the set per item the page's stories hold (`<frame>[n]`): from here on
  // they are plain frames.
  const expanded = expandRepeats(asked.template, repeatItemsOf(asked.template, asked.stories.keys()));
  const given: ComposedPageInput = expanded === asked.template ? asked : { ...asked, template: expanded };
  // A page added by continuation (#859) lays its template with the
  // continuation's rules (and, for the template laid again, its other
  // frames collapsed).
  // The ladder lays the page again at each step: the measurements of one
  // step answer the next (#953).
  const memoed: ComposedPageInput = { ...given, pass: { ...given.pass, measureMemo: createMeasureMemo(), ...(layoutMemoSwitch.enabled ? { layoutMemo: createLayoutMemo() } : {}) } };
  const input: ComposedPageInput = given.continuing ? { ...memoed, template: continuationTemplate(given.template, given.continuing) } : memoed;
  const { template, fence, dpi } = input;
  const fi = fence.fenceIndex;
  const mmPx = dpi / MM_PER_IN;
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  // (A modules group, #1062, holds its modules' frames to lay them as one
  // step: what a frame shares room with is the group of its own module.)
  const groupOf = groupOfFrames({ ...template, groups: template.groups.filter((g) => !g.modules) });
  const prev = chainPrev(template, input.continuing?.receivers);
  const headOf = (name: string): string => {
    let at = name;
    const seen = new Set([at]);
    for (let p = prev.get(at); p !== undefined && !seen.has(p); p = prev.get(at)) {
      seen.add(p);
      at = p;
    }
    return at;
  };
  /** The module a frame belongs to (#1062), when its modules group goes on
   *  by whole modules (`overflow.continueIn` off the page). */
  const movingModule = (name: string): ReturnType<typeof moduleOfFrame> => {
    const m = moduleOfFrame(template, name);
    return m && !input.continuing?.last && continuesOffPage(m.group.overflow?.continueIn) ? m : undefined;
  };

  // Compositions by fit state: the ladder and its proposals ask for some
  // twice.
  const memo = new Map<string, Composition>();
  let runs = 0;
  const keyOf = (tpl: ResolvedPageTemplate, fit: FitState): string =>
    JSON.stringify([tpl.id, [...fit.patches], [...fit.text], [...fit.pictures], [...fit.yieldAll], [...fit.goOn], [...fit.gridsOn]]);
  /** Frames a page added by continuation lays with no room (#859). */
  const collapsedHere = input.continuing ? collapsedOnAddedPage(given.template, input.continuing) : new Set<string>();
  const holdsStory = (name: string): boolean => input.stories.has(headOf(name));
  /** The empty frames that go with the rest of a frame cut for a page
   *  laid from this template again (#912), by that frame. */
  const travelling = (tpl: ResolvedPageTemplate, fit: FitState): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const f of tpl.frames) {
      if (!fit.goOn.has(f.name) || !continuesCollapsed(tpl, f, input.continuing?.collapse ?? false)) continue;
      const t = trailingFrames(tpl, f.name, holdsStory);
      if (t.length > 0) out.set(f.name, t);
    }
    return out;
  };
  const compose = (fit: FitState, tpl: ResolvedPageTemplate = template): Composition => {
    const key = keyOf(tpl, fit);
    const known = memo.get(key);
    if (known) return known;
    runs++;
    const travel = travelling(tpl, fit);
    const lay = (leaving: ReadonlySet<string>, whole: ReadonlySet<string> = new Set()): Composition =>
      composePage(input, collapseFrames(patchTemplate(tpl, fit.patches), leaving, whole), fit, leaving.size > 0 ? new Set([...collapsedHere, ...leaving]) : collapsedHere);
    const all = new Map(travel);
    let c = lay(new Set([...travel.values()].flat()));
    // The empty frames go with the rest only when there is a rest: a frame
    // that holds all of it once they leave keeps them after it…
    const staying = [...travel.keys()].filter((f) => !c.spills.has(f));
    if (staying.length > 0) {
      for (const f of staying) travel.delete(f);
      c = lay(new Set([...travel.values()].flat()));
      // …unless they then do not fit under it at their size: the whole box
      // goes on with them, and takes no room here.
      const whole = staying.filter((f) => squeezes(c, f));
      if (whole.length > 0) {
        for (const f of whole) travel.set(f, all.get(f)!);
        c = lay(new Set([...whole, ...[...travel.values()].flat()]), new Set(whole));
      }
    }
    // A box none of whose content fits goes on whole and takes no room
    // here either.
    const empty = [...fit.goOn].filter((f) => { const sp = c.spills.get(f); return sp !== undefined && !sp.advanced && sp.pieces === 0 && !frameIn(c, f)?.collapsed; });
    if (empty.length > 0) {
      for (const f of empty) if (all.has(f)) travel.set(f, all.get(f)!);
      c = lay(new Set([...empty, ...[...travel.values()].flat()]), new Set(empty));
    }
    memo.set(key, c);
    return c;
  };
  const frameIn = (c: Composition, name: string): VDTFrame | undefined => c.frames.find((f) => f.name === name);
  const overflows = (c: Composition, name: string): boolean => (frameIn(c, name)?.overflowPx ?? 0) > 0.5;
  /** A frame that can go on to another page squeezes the frames after it
   *  in its stack below their declared size (#912): the stack reached the
   *  foot of its area and the last frames were cut to fit, an answer space
   *  under the box lost its lines. The ladder treats it as content that
   *  does not fit, so the box goes on and they keep their size. */
  const squeezes = (c: Composition, name: string): boolean => {
    const frame = byName.get(name);
    if (!frame || !continuesOffPage(frame.overflow.continueIn)) return false;
    const g = groupOf.get(name);
    if (!g || g.kind !== 'stack') return false;
    for (const other of g.frames.slice(g.frames.indexOf(name) + 1)) {
      const f = byName.get(other);
      const v = frameIn(c, other);
      if (!f || !v || v.collapsed) continue;
      const min = f.minHeight ? dimensionToPx(f.minHeight, dpi, input.emPx) : fixedHeight(f) ? dimensionToPx(fixedHeight(f)!, dpi, input.emPx) : 0;
      if (v.rect.height < min - 0.5) return true;
    }
    return false;
  };
  /** The frame's content does not fit, or it squeezes the frames after it. */
  const short = (c: Composition, name: string): boolean => overflows(c, name) || squeezes(c, name);
  /** A line of the frame holds nothing but the head of a word divided
   *  because it was wider than the measure (#1084): a hyphenated line with
   *  no space in it. */
  const dividesWord = (c: Composition, name: string): boolean => {
    const ids = new Set(frameIn(c, name)?.blockIds ?? []);
    for (const b of c.blocks) {
      if (!ids.has(b.id)) continue;
      for (const l of b.lines ?? []) if (l.hyphenated && !/\s/.test(l.text.trim())) return true;
    }
    return false;
  };
  /** The ladder's last step (#859): the frame is cut at its foot and the
   *  rest goes on on another page, its text and pictures back at full
   *  size (they go on anyway). */
  const goingOn = (f: FitState, frame: ResolvedFrame): FitState => {
    const text = new Map(f.text);
    text.delete(headOf(frame.name));
    const pictures = new Map([...f.pictures].filter(([, p]) => p.by !== frame.name));
    return { ...f, text, pictures, goOn: new Set([...f.goOn, frame.name]) };
  };

  // The ladder, frame by frame in template order (ties break there).
  let fit = NO_FIT;
  let cur = compose(fit);
  // A frame whose contents ask for a page of their own further down (a part
  // of the contents under `toc.parts.breakBefore`, #996) goes on whether or
  // not they would fit: the break is the author's.
  for (const frame of template.frames) {
    if (!cur.wantsOn.has(frame.name) || fit.goOn.has(frame.name) || runs >= COMPOSE_BUDGET) continue;
    fit = goingOn(fit, frame);
    cur = compose(fit);
  }
  const tried = new Map<string, FrameFitStep[]>();
  const patched = (f: FitState, name: string, patch: Partial<ResolvedFrame>): FitState => ({ ...f, patches: new Map([...f.patches, [name, { ...f.patches.get(name), ...patch }]]) });
  const withText = (f: FitState, head: string, s: number): FitState => ({ ...f, text: new Map([...f.text, [head, s]]) });
  const withPictures = (f: FitState, heads: readonly string[], s: number, by: string): FitState => {
    const pictures = new Map(f.pictures);
    for (const h of heads) pictures.set(h, { scale: s, by });
    return { ...f, pictures };
  };
  /** Take `next` when it makes `name` fit; else keep it anyway (each step
   *  builds on the ones before it at their limit) and say so. */
  const attempt = (next: FitState, name: string): boolean => {
    fit = next;
    cur = compose(fit);
    return !short(cur, name);
  };
  /** The largest scale among `steps` (descending) at which `name` fits,
   *  checked at the lowest first, then by bisection; adopted. */
  const searchScale = (steps: readonly number[], make: (s: number) => FitState, name: string): boolean => {
    if (steps.length === 0) return false;
    if (!attempt(make(steps[steps.length - 1]!), name)) return false;
    let lo = 0;
    let hi = steps.length - 1; // fits at hi
    while (lo < hi && runs < COMPOSE_BUDGET) {
      const mid = Math.floor((lo + hi) / 2);
      if (!short(compose(make(steps[mid]!)), name)) hi = mid;
      else lo = mid + 1;
    }
    fit = make(steps[hi]!);
    cur = compose(fit);
    return true;
  };
  /** Story heads of the frame and of its group's frames whose content holds
   *  a picture. */
  /** The frames a frame shares its group's room with: its group's, or for
   *  an instance of a grid's set (#1061) its own item's. */
  const peersOf = (name: string): string[] | undefined => {
    const inst = instanceOf(template, name);
    if (inst) return inst.group.items!.find((c) => c.item === inst.item)!.frames;
    // A module's frame (#1062) outside a group of its own: its module's.
    return groupOf.get(name)?.frames ?? moduleOfFrame(template, name)?.frames;
  };
  const pictureHeads = (frame: ResolvedFrame): string[] => {
    const peers = peersOf(frame.name);
    const names = peers ? [frame.name, ...peers.filter((m) => m !== frame.name)] : [frame.name];
    const heads: string[] = [];
    for (const n of names) {
      const head = headOf(n);
      const story = input.stories.get(head);
      if (!story || heads.includes(head)) continue;
      for (let i = story.startIdx + 1; i < story.plan.endIdx; i++) {
        if (input.pass.contentBlocks[i]?.type === 'resourceBlock') {
          heads.push(head);
          break;
        }
      }
    }
    return heads;
  };
  /** The frame's story sets text (not only pictures): its text can
   *  shrink. */
  const holdsText = (frame: ResolvedFrame): boolean => {
    const story = input.stories.get(headOf(frame.name));
    if (!story) return false;
    for (let i = story.startIdx + 1; i < story.plan.endIdx; i++) {
      const b = input.pass.contentBlocks[i];
      if (b && b.type !== 'resourceBlock' && b.type !== 'directive' && !isMarkerBlock(b)) return true;
    }
    return false;
  };
  const movesOthers = (frame: ResolvedFrame): boolean => {
    const peers = peersOf(frame.name);
    if (peers && peers.filter((m) => byName.has(m)).length > 1) return true;
    return template.frames.some((f) => f.name !== frame.name && !f.grid && anchorTarget(f.placement) === frame.name);
  };
  /** `free` applies: a fixed height with room up to a higher `maxHeight`. */
  const growPatch = (frame: ResolvedFrame): Partial<ResolvedFrame> | undefined => {
    const h = fixedHeight(frame);
    if (!h || !frame.maxHeight) return undefined;
    if (dimensionToPx(frame.maxHeight, dpi, input.emPx) <= dimensionToPx(h, dpi, input.emPx) + 0.5) return undefined;
    const min = frame.minHeight && dimensionToPx(frame.minHeight, dpi, input.emPx) > dimensionToPx(h, dpi, input.emPx) ? frame.minHeight : h;
    return { height: 'auto', minHeight: min };
  };

  /** The frame's text may be set smaller (`fit.shrinkText`, a
   *  `minScale` under 1) and it holds text. */
  const textShrinks = (frame: ResolvedFrame): boolean => frame.fit.shrinkText && frame.fit.minScale < 1 && holdsText(frame);
  /** The frame divides a word wider than its measure (#1084): a smaller
   *  scale than the one its text has, down to `minScale`, that sets the
   *  word whole and still fits wins; the largest such. When none does the
   *  word stays divided: dividing is the last resort. */
  const wordWhole = (frame: ResolvedFrame): void => {
    const name = frame.name;
    if (runs >= COMPOSE_BUDGET || !dividesWord(cur, name)) return;
    const head = headOf(name);
    const now = fit.text.get(head) ?? 1;
    const scales = scaleSteps(frame.fit.minScale, now);
    if (scales.length === 0) return;
    const make = (s: number): FitState => withText(fit, head, s);
    const whole = (c: Composition): boolean => !short(c, name) && !dividesWord(c, name);
    if (!whole(compose(make(scales[scales.length - 1]!)))) return;
    let lo = 0;
    let hi = scales.length - 1; // whole at hi
    while (lo < hi && runs < COMPOSE_BUDGET) {
      const mid = Math.floor((lo + hi) / 2);
      if (whole(compose(make(scales[mid]!)))) hi = mid;
      else lo = mid + 1;
    }
    fit = make(scales[hi]!);
    cur = compose(fit);
  };

  for (const frame of template.frames) {
    const name = frame.name;
    if (runs >= COMPOSE_BUDGET) continue;
    if (!short(cur, name)) {
      // A frame that fits, held to its height (a fixed one, or a
      // `maxHeight`), may still divide a word wider than its measure
      // (#1084): a one-line pill whose word went over two lines that its
      // height holds. Its text is set smaller first.
      if ((fixedHeight(frame) || frame.maxHeight) && textShrinks(frame)) wordWhole(frame);
      continue;
    }
    const steps: FrameFitStep[] = [];
    tried.set(name, steps);
    // 1. Free space: a fixed height grows to its maximum ('auto' heights
    //    already take the room their area and group leave).
    steps.push('free');
    const grow = growPatch(frame);
    if (grow && attempt(patched(fit, name, grow), name)) continue;
    // 2. Push siblings: the group moved the frames after it and the frames
    //    that shrink gave space back when it was laid.
    if (movesOthers(frame)) steps.push('push');
    // 3. Pictures of the frame and its group, down to imageMinScale.
    const scaleImages = (): boolean => {
      const heads = frame.fit.scaleImages ? pictureHeads(frame) : [];
      if (heads.length === 0 || frame.fit.imageMinScale >= 1) return false;
      steps.push('scaleImages');
      return searchScale(scaleSteps(frame.fit.imageMinScale), (s) => withPictures(fit, heads, s, name), name);
    };
    // 4. Redistribute: every other frame of the group gives space (or
    //    width) back, down to its minimum or its content.
    const redistribute = (): boolean => {
      const g = groupOf.get(name);
      // (A grid's rows are as tall as their tallest cell: nothing to give.)
      if (!g || g.kind === 'grid' || g.frames.filter((m) => byName.has(m)).length <= 1) return false;
      steps.push('redistribute');
      return attempt({ ...fit, yieldAll: new Set([...fit.yieldAll, g.name]) }, name);
    };
    // 5. The frame's text (its whole story), down to fit.minScale.
    const shrinkText = (): boolean => {
      if (!textShrinks(frame)) return false;
      steps.push('shrinkText');
      const scales = scaleSteps(frame.fit.minScale);
      const make = (s: number): FitState => withText(fit, headOf(name), s);
      if (!searchScale(scales, make, name)) return false;
      wordWhole(frame);
      return true;
    };
    // 6. Continuation on another page (`overflow.continueIn: 'next-page'`,
    //    `'template:<id>'` or `'page:<id>'`, #859). On a page added by
    //    continuation, a frame that would take none of what it receives
    //    sends nothing on (it would go on for ever): it warns.
    // An instance of a grid's set (#1061) goes on with its whole row, as
    // the grid's main frame says (`overflow.continueIn`, `fit`).
    // A frame of a module (#1062) whose modules group goes on goes on with
    // its whole module, as the group says.
    const moving = movingModule(name);
    const grid = moving ? undefined : instanceOf(template, name)?.group;
    const ruler: ResolvedFrame = moving
      ? { ...frame, overflow: { ...frame.overflow, continueIn: moving.group.overflow!.continueIn } }
      : grid ? byName.get(grid.items![0]!.frames[0]!) ?? frame : frame;
    const goOn = (): boolean => {
      if (!continuesOffPage(ruler.overflow.continueIn)) return false;
      steps.push('continue');
      const before = { fit, cur };
      // (Only for a story that came from another page: a page's own story
      // may go on whole.)
      const received = input.continuing?.receivers.has(headOf(name)) ?? false;
      const wholeIn = moving?.group ?? grid;
      const next = wholeIn ? { ...fit, gridsOn: new Set([...fit.gridsOn, wholeIn.name]) } : goingOn(fit, frame);
      if (attempt(next, name) && (!received || cur.spills.get(name)?.advanced !== false)) return true;
      ({ fit, cur } = before);
      return false;
    };
    // A frame whose content can go on to another page goes on before its
    // pictures and text shrink (`fit.preferContinue`, #920): a story keeps
    // one size from page to page. The pictures and the text shrink only
    // when it cannot go on (the last page continuation may add, or a
    // receiver that takes none of it).
    const order = continuesOffPage(ruler.overflow.continueIn) && ruler.fit.preferContinue
      ? [redistribute, goOn, scaleImages, shrinkText]
      : [scaleImages, redistribute, shrinkText, goOn];
    for (const step of order) if (step()) break;
  }

  // 7. Warn, with what would make each frame that still overflows fit.
  const warnings: ContentWarning[] = [...(cur.notes ?? [])];
  const templateAttr = fence.attrSources.template;
  // The rows of a grid cut at its foot (#1061) warn once, on the last
  // instance cut.
  // (And so do the modules cut at the foot of their group, #1062.)
  const cutIn = (name: string): string => moduleOfFrame(template, name)?.group.name ?? instanceOf(template, name)?.group.name ?? '';
  const lastCut = new Map<string, string>();
  for (const frame of template.frames) {
    if (cur.clipped.has(frame.name) && overflows(cur, frame.name)) lastCut.set(cutIn(frame.name), frame.name);
  }
  for (const frame of template.frames) {
    const vdt = frameIn(cur, frame.name);
    if (!vdt || vdt.overflowPx <= 0.5) continue;
    if (cur.clipped.has(frame.name) && lastCut.get(cutIn(frame.name)) !== frame.name) continue;
    const overflowMm = Math.round((vdt.overflowPx / mmPx) * 10) / 10;
    const proposals = overflowProposals({
      frame,
      vdt,
      cur,
      fit,
      compose,
      overflows,
      headOf,
      withText,
      patched,
      groupOf,
      byName,
      mmPx,
      dpi,
      emPx: input.emPx,
      alternatives: input.alternatives,
      // Not on a page continuation added: its template is not the fence's.
      ...(input.continuing ? {} : { fitsWithTemplate: (alt: ResolvedPageTemplate) => fitsWithTemplate(given, alt) }),
      templateSource: templateAttr ? { sourceStart: templateAttr.sourceStart + input.bodyOffset, sourceEnd: templateAttr.sourceEnd + input.bodyOffset } : undefined,
      budgetLeft: () => runs < COMPOSE_BUDGET,
      holdsText: holdsText(frame),
      dividesWord,
    });
    warnings.push({
      kind: 'frameOverflow',
      template: template.id,
      frame: frame.name,
      fenceIndex: fi,
      overflowMm,
      configPath: frame.configPath,
      ...(input.locale ? { locale: input.locale } : {}),
      stepsTried: tried.get(frame.name) ?? ['free'],
      scale: vdt.scale,
      ...(vdt.imageScale !== undefined ? { imageScale: vdt.imageScale } : {}),
      proposals,
      ...(vdt.sourceStart !== undefined ? { sourceStart: vdt.sourceStart, sourceEnd: vdt.sourceEnd } : {}),
      pageIndex: input.page.index,
    });
  }

  // 8. What no frame's box says (#1053): ink under a frame painted over it,
  //    and ink past the trim, the bleed or the box it is anchored inside.
  const overlaps = overlapChecks({
    template: cur.template,
    frames: cur.frames,
    blocks: cur.blocks,
    groupRects: cur.groupRects,
    areas: input.areas,
    dpi,
    emPx: input.emPx,
    fenceIndex: fi,
    pageIndex: input.page.index,
    ...(input.locale ? { locale: input.locale } : {}),
    // Pictures cover by their shapes (#1123), set as the page lays them.
    mirrored: pageIsMirrored(input.page),
    verticalFlow: pageIsVertical(input.page),
  });
  warnings.push(...overlaps.warnings);
  const { frames, blocks, laid, fitted } = cur;
  const log = overlaps.events.length > 0 ? mergeLog(cur.log, overlaps.events, template) : cur.log;
  // Template order on the page record.
  const order = new Map(template.frames.map((f, i) => [f.name, i]));
  frames.sort((a, b) => order.get(a.name)! - order.get(b.name)!);
  const contentBlocks = input.pass.contentBlocks;
  const composed: VDTComposedPage = {
    template: template.id,
    ...(template.variant ? { variant: template.variant } : {}),
    fenceIndex: fi,
    role: template.role,
    attrs: { ...fence.attrs },
    attrSources: Object.fromEntries(Object.entries(fence.attrSources).map(([k, v]) => [k, { sourceStart: v.sourceStart + input.bodyOffset, sourceEnd: v.sourceEnd + input.bodyOffset }])),
    frames,
    log,
    configPath: template.configPath,
    // The modules laid (#1062), each with its box and the attributes its
    // fence writes for its decoration (#1189).
    ...(template.modules && template.modules.length > 0
      ? { modules: template.modules.map((m) => ({ name: m.name, template: m.template, configPath: m.configPath, ...(cur.moduleRects.has(m.name) ? { rect: { ...cur.moduleRects.get(m.name)! } } : {}), ...moduleFenceAttrs(fence, m.name, input.bodyOffset) })) }
      : {}),
    sourceStart: contentBlocks[input.startIdx]!.sourceStart + input.bodyOffset,
    sourceEnd: contentBlocks[input.endIdx]!.sourceEnd + input.bodyOffset,
  };
  // What goes on on other pages (#859), in template order.
  const continuations: ComposedContinuation[] = [];
  const trailing = new Map([...travelling(template, fit)].filter(([f, names]) => cur.spills.has(f) && names.every((n) => frameIn(cur, n)?.collapsed)));
  for (const frame of template.frames) {
    const spill = cur.spills.get(frame.name);
    const story = spill ? input.stories.get(spill.head) : undefined;
    if (!spill || !story) continue;
    const came = input.continuing?.receivers.get(spill.head);
    // An item of a grid (#1061) goes on whole, as its main frame says; the
    // instances of its set that hold nothing go with it.
    // A module (#1062) goes on whole as its group says, its frames that
    // hold nothing along with the first of them that goes; any frame of a
    // module goes on in that module on the page it goes to.
    const inModule = moduleOfFrame(template, frame.name);
    const wholeModule = spill.whole && inModule && continuesOffPage(inModule.group.overflow?.continueIn) ? inModule : undefined;
    const cell = spill.whole && !wholeModule ? instanceOf(template, frame.name) : undefined;
    const cellFrames = cell ? cell.group.items!.find((c) => c.item === cell.item)!.frames : [];
    const ruler = cell ? byName.get(cellFrames[0]!) ?? frame : frame;
    const firstGoing = wholeModule ? wholeModule.frames.find((n) => cur.spills.has(n)) : undefined;
    const empty = cell?.main
      ? cellFrames.filter((n) => n !== frame.name && !cur.spills.has(n))
      : wholeModule && firstGoing === frame.name ? wholeModule.frames.filter((n) => n !== frame.name && !cur.spills.has(n)) : [];
    continuations.push({
      frame: frame.name,
      fromFrameId: spill.frameId,
      head: spill.head,
      // `{attr.x}` read from the fence (#917).
      rule: resolveContinueIn(wholeModule ? wholeModule.group.overflow!.continueIn! : ruler.overflow.continueIn!, fence.attrs),
      template: template.id,
      collapsed: input.continuing?.collapse ?? false,
      story,
      cut: spill.cut,
      pieces: spill.pieces,
      headBlockId: spill.headBlockId,
      // A story that jumped here (#917) goes on named by this page's frame.
      slot: (input.continuing?.jump ? undefined : came?.slot) ?? frame.name,
      ...(trailing.has(frame.name) ? { trailing: trailing.get(frame.name)! } : empty.length > 0 ? { trailing: empty } : {}),
      ...(frame.overflow.fromMark !== undefined ? { fromMark: frame.overflow.fromMark } : {}),
      ...(spill.whole ? { whole: true as const } : {}),
      ...(inModule ? { module: { name: inModule.module.name, template: inModule.module.template } } : {}),
    });
  }
  return { composed, blocks, warnings, laid, ...(fitted.size > 0 ? { fitted } : {}), ...(continuations.length > 0 ? { continuations } : {}) };
}

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
function fitsWithTemplate(input: ComposedPageInput, alt: ResolvedPageTemplate): boolean {
  const regrouped = regroupStories(input, alt);
  if (!regrouped) return false;
  // No proposals of its own (`alternatives` left out).
  const trial = layoutComposedPage({ ...input, template: alt, pass: regrouped.pass, stories: regrouped.stories, alternatives: undefined, continuing: undefined });
  return !trial.continuations
    && trial.warnings.every((w) => w.kind !== 'frameOverflow')
    && [...regrouped.stories.keys()].every((h) => trial.laid.has(h));
}

interface ProposalContext {
  frame: ResolvedFrame;
  vdt: VDTFrame;
  cur: Composition;
  fit: FitState;
  compose(fit: FitState, tpl?: ResolvedPageTemplate): Composition;
  overflows(c: Composition, name: string): boolean;
  headOf(name: string): string;
  withText(f: FitState, head: string, s: number): FitState;
  patched(f: FitState, name: string, patch: Partial<ResolvedFrame>): FitState;
  groupOf: ReadonlyMap<string, ResolvedFrameGroup>;
  byName: ReadonlyMap<string, ResolvedFrame>;
  mmPx: number;
  dpi: number;
  emPx: number;
  alternatives?: () => readonly ResolvedPageTemplate[];
  /** The page set with another template as the build would set it (#937):
   *  every frame fits and nothing goes on to another page. */
  fitsWithTemplate?(alt: ResolvedPageTemplate): boolean;
  templateSource?: { sourceStart: number; sourceEnd: number };
  budgetLeft(): boolean;
  /** The frame sets text, which a smaller scale would shrink. */
  holdsText: boolean;
  /** A line of the frame holds nothing but the head of a word wider than
   *  its measure (#1084). */
  dividesWord(c: Composition, name: string): boolean;
}

const mmDim = (value: number): Dimension => ({ value, unit: 'mm' });

/** What would make `frame`'s content fit, each value worked out from the
 *  shortfall and, where the page can tell, tried on it (DESIGN §5.7). */
function overflowProposals(c: ProposalContext): FrameOverflowProposal[] {
  const { frame, vdt, cur, fit, mmPx } = c;
  const name = frame.name;
  const out: FrameOverflowProposal[] = [];
  const path = (key: string): string => frame.fieldPaths[key] ?? `${frame.configPath}/${key}`;
  const fits = (next: FitState, tpl?: ResolvedPageTemplate): boolean => c.budgetLeft() && !c.overflows(c.compose(next, tpl), name);

  // More shrink: the largest text scale, in 2.5 % steps, at which it fits.
  // When that scale divides a word wider than the frame's measure, the
  // largest smaller one that fits with every word whole, as the ladder
  // prefers (#1084, #1090); none, and the largest that fits, saying the
  // word will be divided.
  const head = c.headOf(name);
  const from = frame.fit.shrinkText ? Math.min(frame.fit.minScale, vdt.scale) : 1;
  const steps = scaleSteps(PROPOSAL_MIN_SCALE, from);
  const shrunk = (i: number): FitState => c.withText(fit, head, steps[i]!);
  if (c.holdsText && steps.length > 0 && fits(shrunk(steps.length - 1))) {
    const last = steps.length - 1;
    /** The largest step from `lo` down at which `ok` holds, given it holds
     *  at the last one: by bisection. */
    const largest = (lo: number, ok: (i: number) => boolean): number => {
      let hi = last;
      while (lo < hi && c.budgetLeft()) {
        const mid = Math.floor((lo + hi) / 2);
        if (ok(mid)) hi = mid;
        else lo = mid + 1;
      }
      return hi;
    };
    let at = largest(0, (i) => fits(shrunk(i)));
    let word: 'whole' | 'divided' | undefined;
    if (c.budgetLeft() && c.dividesWord(c.compose(shrunk(at)), name)) {
      const whole = (i: number): boolean => {
        if (!c.budgetLeft()) return false;
        const comp = c.compose(shrunk(i));
        return !c.overflows(comp, name) && !c.dividesWord(comp, name);
      };
      if (at < last && whole(last)) {
        at = largest(at + 1, whole);
        word = 'whole';
      } else word = 'divided';
    }
    out.push({
      kind: 'allowShrink',
      path: path('fit/minScale'),
      value: steps[at]!,
      ...(frame.fit.shrinkText ? {} : { also: [{ path: path('fit/shrinkText'), value: true }] }),
      ...(word ? { word } : {}),
    });
  }

  // A frame that holds content (an empty one is short of its own box, #911:
  // more height, text or pages do not help it).
  const holds = cur.needs.has(name);
  // A higher maximum: the frame's height plus the shortfall, in whole mm.
  const fixed = fixedHeight(frame);
  if (holds && (frame.maxHeight || fixed)) {
    const want = Math.ceil((vdt.rect.height + vdt.overflowPx) / mmPx - 1e-6);
    const patch: Partial<ResolvedFrame> = { maxHeight: mmDim(want), ...(fixed ? { height: 'auto' as const, minHeight: fixed } : {}) };
    if (fits(c.patched(fit, name, patch))) out.push({ kind: 'raiseMax', path: path('maxHeight'), value: mmDim(want) });
  }

  // A lower minimum on a frame of its group that stands at its minimum
  // with less content than that: lowered by the shortfall, not below its
  // content.
  const g = c.groupOf.get(name);
  if (g) {
    for (const other of g.frames) {
      const f = c.byName.get(other);
      // An empty frame's minimum is the room it stands for (an answer
      // space, a picture slot), not room to take (#911).
      if (!f || other === name || f.pin || !f.minHeight || !cur.needs.has(other)) continue;
      const box = cur.frames.find((x) => x.name === other);
      if (!box) continue;
      const minPx = dimensionToPx(f.minHeight, c.dpi, c.emPx);
      const need = cur.needs.get(other)?.() ?? 0;
      if (Math.abs(box.rect.height - minPx) > 0.5 || need >= minPx - mmPx) continue;
      const lowered = Math.max(Math.ceil(need / mmPx - 1e-6), Math.floor((minPx - vdt.overflowPx) / mmPx + 1e-6));
      if (lowered * mmPx >= minPx - 0.5) continue;
      if (fits(c.patched(fit, other, { minHeight: mmDim(lowered) }))) {
        out.push({ kind: 'lowerMin', path: f.fieldPaths.minHeight ?? `${f.configPath}/minHeight`, value: mmDim(lowered), frame: other });
      }
    }
  }

  // An empty frame cut short by its group: a lower minimum of its own, the
  // height it was left (#911).
  if (!holds && g && frame.minHeight) {
    const lowered = Math.floor(vdt.rect.height / mmPx + 1e-6);
    if (lowered * mmPx < dimensionToPx(frame.minHeight, c.dpi, c.emPx) - 0.5 && fits(c.patched(fit, name, { minHeight: mmDim(lowered) }))) {
      out.push({ kind: 'lowerMin', path: path('minHeight'), value: mmDim(lowered), frame: name });
    }
  }

  // Continue on the next page (#859 lays it out).
  if (holds && !frame.overflow.continueIn) out.push({ kind: 'continueNextPage', path: path('overflow/continueIn'), value: 'next-page' });

  // Another template of the book with a frame of this name, where the
  // page fits once set with it: its stories regrouped for it and its own
  // ladder run (#937).
  for (const alt of c.alternatives?.() ?? []) {
    if (!c.budgetLeft() || !c.fitsWithTemplate) break;
    if (!alt.frames.some((f) => f.name === name)) continue;
    if (c.fitsWithTemplate(alt)) {
      out.push({ kind: 'useTemplate', value: alt.id, ...(c.templateSource ?? {}) });
      break;
    }
  }

  // Shorter text: the lines that do not fit, at the frame's characters a
  // line.
  const lines = cur.blocks.filter((b) => vdt.blockIds.includes(b.id) && b.type !== 'resource').flatMap((b) => b.lines.filter((l) => l.text.length > 0));
  if (lines.length > 0) {
    // Characters of a full line: the lines that do not end their paragraph.
    const full = lines.filter((l) => !l.isLastLine);
    const sample = full.length > 0 ? full : lines;
    const perLine = sample.reduce((n, l) => n + l.text.length, 0) / sample.length;
    const lineH = (lines.reduce((h, l) => h + l.bbox.height, 0) / lines.length) * vdt.scale;
    if (lineH > 0) {
      const over = Math.ceil(vdt.overflowPx / lineH - 1e-6);
      out.push({ kind: 'shortenText', value: Math.ceil(over * perLine), ...(vdt.sourceStart !== undefined ? { sourceStart: vdt.sourceStart, sourceEnd: vdt.sourceEnd! } : {}) });
    }
  }
  return out;
}

/** A frame style whose box keeps its drawn size when the frame's text is
 *  set at `scale` (#858): the frame is laid out `1 / scale` as large and
 *  painted at `scale`, so its padding, border, corner radius, stripe and
 *  tab are laid out `1 / scale` as large to come out as drawn. Only the
 *  text and what it holds shrink: padding that keeps room for the photos
 *  set over a box stays that room. */
export function keepChromeAt(style: ResolvedCalloutStyleConfig, scale: number): ResolvedCalloutStyleConfig {
  if (scale === 1) return style;
  const d = (v: Dimension): Dimension => ({ ...v, value: v.value / scale });
  const radiusAt = (r: CornerRadius): CornerRadius => (isCornerRadii(r)
    ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ? d(v) : v]))
    : d(r));
  const p = style.padding;
  return {
    ...style,
    padding: { top: d(p.top), right: d(p.right), bottom: d(p.bottom), left: d(p.left) },
    border: {
      ...style.border,
      width: d(style.border.width),
      ...(style.border.sides
        ? { sides: Object.fromEntries(Object.entries(style.border.sides).map(([k, v]) => [k, { ...v, width: d(v.width) }])) as NonNullable<ResolvedCalloutStyleConfig['border']['sides']> }
        : {}),
    },
    borderRadius: radiusAt(style.borderRadius),
    stripe: { ...style.stripe, width: d(style.stripe.width) },
    ...(style.label
      ? { label: { ...style.label, height: d(style.label.height), paddingX: d(style.label.paddingX), offset: d(style.label.offset), inset: d(style.label.inset), rule: { ...style.label.rule, width: d(style.label.rule.width) }, ...(style.label.fillet ? { fillet: d(style.label.fillet) } : {}), ...(style.label.borderRadius !== undefined ? { borderRadius: radiusAt(style.label.borderRadius) } : {}) } }
      : {}),
  };
}

/** Lay out every frame of the page once, with the reflow ladder's `fit`. */
/** Most times a page is laid again for its growing boxes (#1117): a box's
 *  members stand where its top puts them, so one more lay is enough
 *  unless a member hangs from a box that grows in turn. */
const GROW_ROUNDS = 3;

/**
 * Lay the page; then, while a box that grows with the frames laid inside
 * it (`growWith`, #1117) ends above the foot of one of them and its bottom
 * padding, lay it again with that height as the box's least height. What
 * the box's foot places (a frame `below` it, the rest of its stack) moves
 * down as under any growing box.
 */
function composePage(pageInput: ComposedPageInput, template: ResolvedPageTemplate, fit: FitState, collapsed: ReadonlySet<string>): Composition {
  let c = composePageOnce(pageInput, template, fit, collapsed);
  if (!template.frames.some((f) => f.growWith)) return c;
  const mmPx = pageInput.dpi / MM_PER_IN;
  let tpl = template;
  for (let round = 0; round < GROW_ROUNDS; round++) {
    const grown = new Map<string, number>();
    const laid = new Map(c.frames.filter((f) => !f.collapsed).map((f) => [f.name, f]));
    for (const box of tpl.frames) {
      const v = box.growWith && box.rotate === 0 && !collapsed.has(box.name) ? laid.get(box.name) : undefined;
      if (!v) continue;
      const members = growMembers(tpl, box);
      const rects = [
        ...members.frames.flatMap((n) => (laid.has(n) ? [laid.get(n)!.rect] : [])),
        ...members.groups.flatMap((n) => (c.groupRects.has(n) ? [c.groupRects.get(n)!] : [])),
      ];
      const pad = lengthPx(pageInput.styleOf(box).padding.bottom, pageInput.dpi, pageInput.emPx);
      const need = grownHeight(v.rect, rects, pad);
      if (need !== undefined) grown.set(box.name, need);
    }
    if (grown.size === 0) break;
    tpl = { ...tpl, frames: tpl.frames.map((f) => (grown.has(f.name) ? { ...f, minHeight: { value: grown.get(f.name)! / mmPx, unit: 'mm' as const } } : f)) };
    c = composePageOnce(pageInput, tpl, fit, collapsed);
  }
  return c;
}

function composePageOnce(pageInput: ComposedPageInput, template: ResolvedPageTemplate, fit: FitState, collapsed: ReadonlySet<string>): Composition {
  /** What the frames are placed in: the page, or, while a module's frames
   *  are placed (#1062), the page with the module's box as its area. */
  let input = pageInput;
  const { pass, fence, dpi } = input;
  const fi = fence.fenceIndex;
  const cont = input.continuing;
  const cutRules = frameCutRules(pass.resolved);
  /** A frame's id: `cp<fence>:<name>`; on a page added by continuation
   *  (#859) `~<k>`, a frame that receives content named by the frame of
   *  the fence's page that first sent it on. */
  const frameIdOf = (name: string): string => (cont && !cont.jump ? frameElementId(fi, cont.receivers.get(name)?.slot ?? name, cont.generation) : frameElementId(fi, name));
  const byName = new Map(template.frames.map((f) => [f.name, f]));
  /** Frames a grid repeats (#1061): their instances are `<frame>[n]`. */
  const repeated = new Set(template.groups.flatMap((g) => (g.items ? g.repeat?.frames ?? [] : [])));
  const prev = chainPrev(template, cont?.receivers);
  /** The head of the chain a frame belongs to. */
  const headOf = (name: string): string => {
    let at = name;
    const seen = new Set([at]);
    for (let p = prev.get(at); p !== undefined && !seen.has(p); p = prev.get(at)) {
      seen.add(p);
      at = p;
    }
    return at;
  };
  /** The text scale of a frame's story (#858). */
  const textScale = (frame: ResolvedFrame): number => fit.text.get(headOf(frame.name)) ?? 1;
  /** A page number a mark's `{page}` is laid out with (#917): a guess of
   *  the right width, the build writing the true one once pages are
   *  numbered (`VDTDesignTextBlock.pageMark`). */
  const toGuess = String(input.page.index + 2);
  const fromGuess = String(Math.max(1, input.page.index));
  /** The named look (#1089) the `:::frame` fence of a frame's story names
   *  (`look="<id>"`), when `frameLooks` has it: the story's, so every
   *  frame of a chain and the frames it goes on in on later pages wear it. */
  const frameLooks = pass.resolved.frameLooks;
  const namedLookOf = (frame: ResolvedFrame): FrameLookEntry | undefined => {
    if (!frameLooks) return undefined;
    const id = input.stories.get(headOf(frame.name))?.plan.attrs.look?.trim();
    return id ? frameLooks.find((l) => l.id === id) : undefined;
  };
  /** The look a frame's story names that `frameLooks` does not have
   *  (#1095): the canvas marks the frame. */
  const unknownLookOf = (frame: ResolvedFrame): string | undefined => {
    const id = input.stories.get(headOf(frame.name))?.plan.attrs.look?.trim();
    return id && !frameLooks?.some((l) => l.id === id) ? id : undefined;
  };
  /** The style a frame is laid out in: its box as drawn at any text scale. */
  const styleOf = (frame: ResolvedFrame): ResolvedCalloutStyleConfig => {
    const style = keepChromeAt(input.styleOf(withNamedLook(frame, namedLookOf(frame))), textScale(frame));
    if (!fit.goOn.has(frame.name)) return style;
    // A frame cut for another page (#859) ends with its mark: its own
    // words, none (`false`), or its style's localized ones.
    const mark = frame.overflow.mark;
    return { ...style, continuesMarkerEnabled: mark !== false, continuesMarker: typeof mark === 'string' ? withPage(mark, toGuess) : style.continuesMarker };
  };
  /** The mark of a frame that receives a story from another page (#917):
   *  its own `overflow.fromMark`, else the sending frame's, set at the
   *  head of the first piece it lays here. */
  const fromMarkOf = (frame: ResolvedFrame): string | undefined => {
    const came = cont?.receivers.get(headOf(frame.name));
    const words = frame.overflow.fromMark ?? came?.fromMark;
    return came && words !== undefined ? withPage(words, fromGuess) : undefined;
  };
  /** The scale of a frame's pictures (#858), below 1, or undefined. */
  const pictureScale = (frame: ResolvedFrame): number | undefined => fit.pictures.get(headOf(frame.name))?.scale;
  /** A frame set in a writing mode other than the page's flow (#944): its
   *  mode, else undefined. Its content is laid out in that mode, its lines
   *  along the box's height and following each other across its width. */
  const pageMode = pageIsVertical(input.page) ? 'vertical-rl' : 'horizontal-tb';
  const ownMode = (frame: ResolvedFrame): 'horizontal-tb' | 'vertical-rl' | undefined =>
    frame.writingMode !== undefined && frame.writingMode !== pageMode ? frame.writingMode : undefined;
  /** A vertical frame of a right-to-left page (#960): the page's flow is
   *  painted mirrored, which would set its lines from left to right, so the
   *  frame is laid out as on a left-to-right page and painted unmirrored
   *  (`VDTFrame.unmirrorX`). The mirror's origin, else undefined. */
  const unmirroredAt = (frame: ResolvedFrame): number | undefined => {
    const flow = input.page.flow;
    return ownMode(frame) && flow?.writingMode === 'horizontal-tb' ? flow.mirror.originX : undefined;
  };
  /** Whether a frame's lines are set as on a mirrored page: those of the
   *  page's own mode, not an unmirrored frame's. */
  const mirroredIn = (frame: ResolvedFrame): boolean => input.mirrored && unmirroredAt(frame) === undefined;
  /** The widest a picture's upright frame may be in a frame whose lines run
   *  down the page (#960, #971): the frame's extent across its lines, less
   *  the box's padding. A vertical frame of a horizontal page is turned a
   *  quarter turn on the page, a frame of a vertical page's own mode lies in
   *  the flow, which is turned the same way; either way its pictures are
   *  laid out counter-rotated to stand upright. A horizontal frame of a
   *  vertical page is turned against the flow and already stands upright;
   *  none of that on a horizontal page's own mode. */
  const uprightIn = (frame: ResolvedFrame, across: number): Pick<FrameBoxOptions, 'uprightMaxLength'> => {
    if ((frame.writingMode ?? pageMode) !== 'vertical-rl') return {};
    const pad = styleOf(frame).padding;
    const room = across - lengthPx(pad.top, dpi, input.emPx) - lengthPx(pad.bottom, dpi, input.emPx);
    return { uprightMaxLength: Math.max(1, room) };
  };
  /** `fn` measured in the frame's own writing mode. */
  const inMode = <T>(frame: ResolvedFrame, fn: () => T): T => {
    const mode = ownMode(frame);
    return mode ? withMeasureWritingMode(mode, fn) : fn();
  };
  /** Rectangles in a frame's box coordinates, in its laid-out (scaled)
   *  coordinates. */
  const unscale = (rs: FrameBoxOptions['exclusions'], s: number): FrameBoxOptions['exclusions'] =>
    rs && s !== 1
      ? rs.map((r) => ({ x: r.x / s, y: r.y / s, width: r.width / s, height: r.height / s, ...(r.contour ? { contour: scaleContourAbout(r.contour, 0, 0, 1 / s) } : {}) }))
      : rs;
  /** Place and fill every frame. `seed`: the boxes of the frames that push
   *  text, from a first run, so a frame placed before one that pushes it
   *  (the photo anchored to its box) still runs round it. */
  const run = (seed?: ReadonlyMap<string, Rect>, seedShapes?: ReadonlyMap<string, VDTExclusionContour>) => {
    const pushRects = new Map<string, Rect>();
    /** The shapes of the frames that push with their pictures' contour (#883). */
    const pushShapes = new Map<string, VDTExclusionContour>();
    /** Pictures of a contour push whose shape is not known (#883). */
    const notes: ContentWarning[] = [];
    const states = new Map<string, StoryState>();
    const stateOf = (frame: ResolvedFrame): StoryState | undefined => {
      const head = headOf(frame.name);
      const known = states.get(head);
      if (known) return known;
      const story = input.stories.get(head);
      const headFrame = byName.get(head);
      if (!story || !headFrame) return undefined;
      // Content from the page before (#859) goes on where it was cut, its
      // blocks numbered on from its pieces there.
      const came = cont?.receivers.get(head);
      const st: StoryState = {
        story,
        L: makeCalloutLayouter(pass, story.startIdx, story.plan, styleOf(frame)),
        cut: came?.cut ?? CUT_START,
        pieces: came?.pieces ?? 0,
        headBlockId: came?.headBlockId ?? frameIdOf(head),
        headFrameId: came?.fromFrameId ?? frameIdOf(head),
      };
      states.set(head, st);
      return st;
    };
    const atEnd = (st: StoryState): boolean => st.cut.child >= st.L.end.child && st.cut.line === 0 && !st.cut.group;

    /** The frames' boxes as laid, and as the template declares them. */
    const rects = new Map<string, Rect>();
    const declared = new Map<string, Rect>();
    /** Groups' boxes once their step is laid. */
    const groupRects = new Map<string, Rect>();
    const groupDeclared = new Map<string, Rect>();
    const groupRect = (name: string, boxes: ReadonlyMap<string, Rect>, solved: ReadonlyMap<string, Rect>, refs: (n: string) => Rect | undefined): Rect | undefined => {
      const done = solved.get(name);
      if (done) return done;
      const g = template.groups.find((gr) => gr.name === name);
      if (!g) return undefined;
      const own = groupPlaceable(g);
      if (own) return placeBox(own, template, input, refs, () => 0);
      return unionRect(g.frames.flatMap((m) => (boxes.has(m) ? [boxes.get(m)!] : [])));
    };
    const refOf = (name: string): Rect | undefined => rects.get(name) ?? groupRect(name, rects, groupRects, refOf);
    const declaredRefOf = (name: string): Rect | undefined => declared.get(name) ?? groupRect(name, declared, groupDeclared, declaredRefOf);
    /** Pinned frames laid so far: a group's frames flow round them. */
    const pinned: { name: string; rect: Rect }[] = [];
    /** How far a stack cut each frame below its least height (#911). */
    const boxShort = new Map<string, number>();

    const frames: VDTFrame[] = [];
    const vdtByName = new Map<string, VDTFrame>();
    const blocks: VDTBlock[] = [];
    const overflowLog: ReflowEvent[] = [];
    const fitLog: ReflowEvent[] = [];
    const needs = new Map<string, () => number>();
    /** What `fitBox` did to each frame (#861), last placement wins. */
    const fitted = new Map<string, { placed: Rect; kept: Rect }>();
    const laid = new Set<string>();
    const spills = new Map<string, Spill>();
    const wantsOn = new Set<string>();
    const clipped = new Set<string>();
    const moduleRects = new Map<string, Rect>();
    /** The foot a module cut at its group's foot is clipped to (#1062). */
    let clipFoot: number | undefined;
    /** A module a stretching row lays taller than it is (#1095): its
     *  frames, its own foot (`at`) and the row's. */
    let stretchTo: { at: number; foot: number; names: ReadonlySet<string> } | undefined;
    const pushed: { name: string; box: Rect; contour?: VDTExclusionContour }[] = seed
      ? [...seed].map(([name, box]) => ({ name, box, ...(seedShapes?.get(name) ? { contour: seedShapes.get(name)! } : {}) }))
      : [];

    /** The rectangles of the pushing frames placed so far that `rect`
     *  meets, in the frame block's coordinates. */
    const exclusionsFor = (frame: ResolvedFrame, rect: Rect, open: boolean): FrameBoxOptions['exclusions'] => {
      const out: BoxExclusion[] = [];
      // The frame's own shapes (a comic panel's slanted edges, #909).
      for (const ex of input.frameExclusions?.get(frame.name) ?? []) {
        out.push({ x: ex.x - rect.x, y: ex.y - rect.y, width: ex.width, height: ex.height, ...(ex.contour ? { contour: shiftContour(ex.contour, -rect.x, -rect.y) } : {}) });
      }
      const g = input.pushGapPx;
      for (const p of pushed) {
        if (p.name === frame.name) continue;
        // A contour (#883) pushes with its shape, its margin round it.
        const cb = p.contour ? contourBounds(p.contour) : undefined;
        const b = cb ?? p.box;
        const e = cb ? 0 : g;
        const below = open ? true : b.y < rect.y + rect.height;
        if (b.x - e >= rect.x + rect.width || b.x + b.width + e <= rect.x || !below || b.y + b.height + e <= rect.y) continue;
        out.push({
          x: b.x - e - rect.x, y: b.y - e - rect.y, width: b.width + 2 * e, height: b.height + 2 * e,
          ...(cb && p.contour ? { contour: shiftContour(p.contour, -rect.x, -rect.y) } : {}),
        });
      }
      return out.length > 0 ? out : undefined;
    };

    /** Where a frame's story stands when the frame is reached. */
    interface Prep {
      frame: ResolvedFrame;
      st: StoryState | undefined;
      before: string | undefined;
      holds: boolean;
      continuation: boolean;
      blockId: string;
      /** "Continued from page …" at its head (#917). */
      fromMark?: string;
    }
    const prepare = (frame: ResolvedFrame): Prep => {
      const st = stateOf(frame);
      // Each frame of a chain sets the story in its own style: the cuts are
      // positions in the story's blocks, the same in any.
      if (st) st.L = makeCalloutLayouter(pass, st.story.startIdx, st.story.plan, styleOf(frame));
      // A frame continues its story only once the frame before it in the
      // chain was filled (a frame placed before it, through an anchor, starts
      // empty).
      const before = prev.get(frame.name);
      const reached = st !== undefined && (before === undefined || vdtByName.has(before));
      const holds = reached && !atEnd(st!);
      const continuation = st !== undefined && st.pieces > 0;
      const blockId = st && st.pieces > 0 ? `${st.headBlockId}-cont-${st.pieces}` : frameIdOf(frame.name);
      // The first piece here of a story that came from another page.
      const came = cont?.receivers.get(headOf(frame.name));
      const fromMark = st && came && continuation && st.pieces === came.pieces ? fromMarkOf(frame) : undefined;
      return { frame, st, before, holds, continuation, blockId, ...(fromMark !== undefined ? { fromMark } : {}) };
    };
    /** The content's height at `width`, running round the pushing frames
     *  below the top of `at` (the frame's box as first placed). A frame
     *  whose text the ladder scales (#858) is laid out `1 / scale` as
     *  wide and is `scale` as tall as that. */
    /** Where the frame's content ends for its height: at a part of the
     *  contents that opens a page of its own (#996) when the frame can go
     *  on, else at the end of the story. */
    const naturalEnd = (p: Prep): CalloutCut => {
      const nextName = nextFrameOf(p.frame);
      const nextFrame = nextName !== undefined ? byName.get(nextName) : undefined;
      const goes = (nextFrame !== undefined && !vdtByName.has(nextFrame.name)) || continuesOffPage(p.frame.overflow.continueIn);
      return (goes ? partBreakCut(pass, p.st!.L, p.st!.cut) : undefined) ?? p.st!.L.end;
    };
    const naturalOf = (p: Prep, at?: Rect) => {
      const memo = new Map<number, number>();
      const s = textScale(p.frame);
      const pic = pictureScale(p.frame);
      if (ownMode(p.frame)) return turnedNaturalOf(p, memo, s, pic);
      return (width: number): number => {
        if (!p.holds) return 0;
        const key = Math.round(width * 1000);
        const known = memo.get(key);
        if (known !== undefined) return known;
        const exclusions = at ? unscale(exclusionsFor(p.frame, { ...at, width }, true), s) : undefined;
        // The room a vertical page's upright picture may take down the page
        // is the flow's whole extent: the frame's height is what it settles.
        const opts: FrameBoxOptions = { ...(exclusions ? { exclusions } : {}), ...(pic !== undefined ? { pictureScale: pic } : {}), ...(p.fromMark !== undefined ? { continuedMark: p.fromMark } : {}), ...uprightIn(p.frame, input.areas.area.height / s) };
        const r = p.st!.L.peekRange(p.st!.cut, naturalEnd(p), width / s, p.blockId, p.continuation, input.mirrored, Object.keys(opts).length > 0 ? opts : undefined);
        const h = r.totalHeight * s;
        memo.set(key, h);
        return h;
      };
    };
    /** The width an `'auto'`-width frame (#982) needs when it may take up
     *  to `room`: the right edge of its longest line (a picture counting
     *  by its own box), and what the box keeps to the right of its text
     *  (padding, a stripe). The text is set flush left whatever its
     *  alignment, so a centred title is as wide as its words, and not set
     *  to a measure it would fill. Undefined for a frame of fixed or
     *  `'fill'` width, or one in its own writing mode. */
    const naturalWidthOf = (p: Prep): ((room: number) => number) | undefined => {
      if (p.frame.width !== 'auto' || ownMode(p.frame)) return undefined;
      const memo = new Map<number, number>();
      return (room: number): number => {
        if (!p.holds) return 0;
        const key = Math.round(room * 1000);
        const known = memo.get(key);
        if (known !== undefined) return known;
        const s = textScale(p.frame);
        const style = styleOf(p.frame);
        const flush = { ...style, body: { ...style.body, textAlign: 'left' as const } };
        const L = makeCalloutLayouter(pass, p.st!.story.startIdx, p.st!.story.plan, flush);
        // Set at a measure far wider than the room, so that nothing wraps:
        // the frame is then as wide as its words, and the room caps it
        // (text that does not fit wraps at the room, as in a shrink-wrapped
        // box).
        const r = L.layoutRange(p.st!.cut, L.end, (room * 8) / s, p.blockId, p.continuation, input.mirrored);
        let right = 0;
        for (const b of r.children) {
          if (b.type === 'callout' || b.hidden) continue;
          if (b.type === 'resource' || b.lines.length === 0) right = Math.max(right, b.bbox.x + b.bbox.width);
          for (const l of b.lines) if (l.text.length > 0) right = Math.max(right, l.bbox.x + l.bbox.width);
        }
        const inner = r.frame.callout?.innerRect;
        const keep = inner ? Math.max(0, r.width - (inner.x + inner.width)) : 0;
        // A quarter of a pixel over: a line is never set to its exact width.
        const w = Math.min(room, (right + keep + 0.25) * s);
        memo.set(key, w);
        return w;
      };
    };
    /** The height a frame set in its own writing mode (#944) needs at
     *  `width`: its lines run down the box, so the least height whose
     *  lines, following each other across, fit `width`; the area's height
     *  when even that is not enough (the frame then overflows). */
    const turnedNaturalOf = (p: Prep, memo: Map<number, number>, s: number, pic: number | undefined) => (width: number): number => {
      if (!p.holds) return 0;
      const key = Math.round(width * 1000);
      const known = memo.get(key);
      if (known !== undefined) return known;
      const opts: FrameBoxOptions = { ...(pic !== undefined ? { pictureScale: pic } : {}), ...(p.fromMark !== undefined ? { continuedMark: p.fromMark } : {}), ...uprightIn(p.frame, width / s) };
      const across = (measure: number): number => inMode(p.frame, () =>
        p.st!.L.peekRange(p.st!.cut, p.st!.L.end, measure / s, p.blockId, p.continuation, mirroredIn(p.frame), Object.keys(opts).length > 0 ? opts : undefined).totalHeight * s);
      const most = Math.max(input.areas.area.height, input.emPx);
      let h = most;
      if (across(most) <= width + 0.5) {
        let lo = Math.min(input.emPx, most);
        let hi = most;
        if (across(lo) <= width + 0.5) hi = lo;
        // Whole px are enough: a line is never set that finely.
        while (hi - lo > 1) {
          const mid = (lo + hi) / 2;
          if (across(mid) <= width + 0.5) hi = mid;
          else lo = mid;
        }
        h = hi;
      }
      memo.set(key, h);
      return h;
    };
    /** `placeBox`, then the box the page lets the frame take (`fitBox`:
     *  off a spread's spine band, #861), its `'auto'` height measured at the
     *  width it is left with. Declared and final boxes alike: the band is
     *  the template's, not a reflow. */
    const placeFitted = (frame: ResolvedFrame, placeable: ReturnType<typeof framePlaceable>, ctx: Parameters<typeof placeBox>[2], refs: (n: string) => Rect | undefined, nat: (width: number) => number, natW?: (room: number) => number): Rect => {
      const r = placeBox(placeable, template, ctx, refs, nat, natW);
      if (!input.fitBox) return r;
      const keep = (placed: Rect): Rect => {
        const kept = input.fitBox!(frame, placed);
        if (sameRect(kept, placed)) fitted.delete(frame.name);
        else fitted.set(frame.name, { placed, kept });
        return kept;
      };
      const first = keep(r);
      if (Math.abs(first.width - r.width) < 0.01) return first;
      return keep(placeBox(placeable, template, ctx, refs, () => nat(first.width), natW));
    };
    /** A frame's height as its template declares it: its `minHeight` where
     *  the height follows the content, else the content's (`natural`). */
    const declaredNatural = (frame: ResolvedFrame, natural: (w: number) => number) => (width: number): number => (frame.minHeight ? 0 : natural(width));

    /** Place a frame outside any group: its box, placed with the content's
     *  own height, then again with the height it takes running round the
     *  frames that push it there; a pinned frame where the template puts
     *  it. */
    const placeFrame = (p: Prep): Rect => {
      const frame = p.frame;
      const placeable = framePlaceable(frame);
      const natural = naturalOf(p);
      const natW = naturalWidthOf(p);
      const at = (refs: (n: string) => Rect | undefined) => {
        const r0 = placeFitted(frame, placeable, input, refs, natural, natW);
        if (!p.holds || !exclusionsFor(frame, r0, true)) return { rect: r0, natural };
        const round = naturalOf(p, r0);
        return { rect: placeFitted(frame, placeable, input, refs, round, natW), natural: round };
      };
      const decl = frame.pin ? at(declaredRefOf) : undefined;
      const fin = decl ?? at(refOf);
      const declRect = placeFitted(frame, placeable, input, declaredRefOf, declaredNatural(frame, fin.natural), natW);
      const rect = frame.pin ? declRect : fin.rect;
      declared.set(frame.name, declRect);
      rects.set(frame.name, rect);
      if (frame.pin) pinned.push({ name: frame.name, rect });
      return rect;
    };

    /** Lay a group: its frames' boxes as the template declares them and as
     *  their content needs (`composed/groups.ts`). With the ladder's
     *  `redistribute` (#858) every frame gives space back, down to its
     *  minimum or its content, whether it `shrink`s or not. */
    const placeGroup = (group: ResolvedFrameGroup, members: readonly ResolvedFrame[]): Map<string, Rect> => {
      const own = groupPlaceable(group);
      const mmPx = dpi / MM_PER_IN;
      const yieldAll = fit.yieldAll.has(group.name);
      const preps = members.map(prepare);
      const natWs = preps.map(naturalWidthOf);
      const solve = (mode: 'final' | 'declared', naturals: ((w: number) => number)[]): { rects: Map<string, Rect>; box: Rect; items: GroupItem[] } => {
        const refs = mode === 'final' ? refOf : declaredRefOf;
        const ownBox = own ? placeBox(own, template, input, refs, () => 0) : undefined;
        const ownRects = new Map<string, Rect>();
        const memberRefs = (n: string): Rect | undefined => ownRects.get(n) ?? (n === group.name ? ownBox : refs(n));
        const items: GroupItem[] = members.map((f, k) => {
          // A frame placed nowhere stands in its group's box.
          const ctx = ownBox && !f.placement && !f.grid ? { ...input, areas: { ...input.areas, area: ownBox } } : input;
          const natural = naturals[k]!;
          const placeable = framePlaceable(f);
          // On a spread the member's own box keeps off the spine band, and
          // the negotiation starts from it (#861).
          const box = placeFitted(f, placeable, ctx, memberRefs, declaredNatural(f, natural), natWs[k]);
          ownRects.set(f.name, box);
          const auto = f.height === 'auto' && !(f.grid && !placeable.heightSet);
          const fill = f.height === 'fill';
          const minH = f.minHeight ? dimensionToPx(f.minHeight, dpi, input.emPx) : 0;
          const want = fill ? minH : auto ? (mode === 'final' ? natural(box.width) : declaredNatural(f, natural)(box.width)) : box.height;
          const max = f.maxHeight ? dimensionToPx(f.maxHeight, dpi, input.emPx) : Infinity;
          const item: GroupItem = {
            name: f.name,
            own: box,
            want,
            min: minH,
            max,
            minWidth: f.minWidth ? dimensionToPx(f.minWidth, dpi, input.emPx) : 0,
            maxWidth: f.maxWidth ? dimensionToPx(f.maxWidth, dpi, input.emPx) : Infinity,
            grow: fill ? Math.max(1, f.grow) : f.grow,
            shrink: f.shrink,
            priority: f.priority,
            pin: f.pin,
            fixedHeight: !auto && !fill,
            need: natural,
            floor: minH,
          };
          if (yieldAll && mode === 'final' && !f.pin) {
            // Down to its minimum, never under what its content needs, never
            // over the height it has.
            const height = Math.min(Math.max(want, minH), max);
            item.shrink = f.shrink > 0 ? f.shrink : 1;
            // (A row's frames give width, each down to the narrowest width
            // its content still fits: their heights stay the row's.)
            if (group.kind === 'stack') item.min = Math.min(height, Math.max(minH, natural(box.width)));
          }
          if (fit.goOn.has(f.name) && mode === 'final' && !f.pin) {
            // A frame cut for another page (#859) gives the room first,
            // down to its minimum: the frames after it in the group keep
            // their size (#912), and its rest goes on.
            item.shrink = Math.max(f.shrink, 1);
            item.priority = Number.NEGATIVE_INFINITY;
            item.min = minH;
          }
          return item;
        });
        const firstFree = items.find((it) => !it.pin) ?? items[0];
        const start = firstFree?.own ?? input.areas.area;
        const box = ownBox ?? { x: start.x, y: start.y, width: 0, height: 0 };
        const out = layoutGroup({
          kind: group.kind === 'row' ? 'row' : 'stack',
          box,
          elastic: !ownBox,
          limit: input.areas.area,
          gap: dimensionToPx(group.gap, dpi, input.emPx),
          align: group.align,
          items,
          obstacles: pinned.filter((q) => !members.some((m) => m.name === q.name)).map((q) => q.rect),
          mmPx,
          negotiate: mode === 'final',
        });
        // A pinned frame of the group stands where the template puts it.
        for (const it of items) if (it.pin) out.set(it.name, it.own);
        return { rects: out, box: ownBox ?? unionRect([...out.values()]) ?? box, items };
      };
      let naturals = preps.map((p) => naturalOf(p));
      let fin = solve('final', naturals);
      // Text that runs round a pushing frame is taller: measured at the box
      // first found, then laid again.
      const round = preps.map((p) => (p.holds && exclusionsFor(p.frame, fin.rects.get(p.frame.name)!, true) ? naturalOf(p, fin.rects.get(p.frame.name)!) : undefined));
      if (round.some((r) => r !== undefined)) {
        naturals = naturals.map((n, k) => round[k] ?? n);
        fin = solve('final', naturals);
      }
      const decl = solve('declared', naturals);
      // A frame the stack cut below the least it may have (its
      // `minHeight`, a fixed height its own) is short of its box, content
      // or none (#911): an empty answer space or picture slot overflows
      // too.
      for (const it of fin.items) {
        if (it.pin || group.kind !== 'stack') continue;
        const least = it.fixedHeight && (it.floor ?? 0) <= 0.5 ? it.own.height : it.floor ?? 0;
        const got = fin.rects.get(it.name)!.height;
        if (least - got > 0.5) boxShort.set(it.name, least - got);
        else boxShort.delete(it.name);
      }
      for (const m of members) {
        rects.set(m.name, fin.rects.get(m.name)!);
        declared.set(m.name, decl.rects.get(m.name)!);
        if (m.pin) pinned.push({ name: m.name, rect: fin.rects.get(m.name)! });
      }
      groupRects.set(group.name, fin.box);
      groupDeclared.set(group.name, decl.box);
      return fin.rects;
    };

    /** Lay a grid (#1061): its cells fill rows from the start side of the
     *  page's lines (the flow frame is mirrored on a right-to-left page, so
     *  its left is the start), `columns` to a row, `columnGap` and `rowGap`
     *  between them. A cell is one item of a repeated frame set (or one
     *  frame of a grid that repeats none): the main frame takes the cell's
     *  width and its own height rule, the set's other frames are placed as
     *  the template draws them, anchored to the main frame or to each
     *  other (one that anchors to nothing in the set moves with the cell).
     *  A row is as tall as its tallest cell, the set's frames counted;
     *  `rowAlign` places the shorter ones (`'stretch'`: their main frame
     *  grows to the row). The grid runs down its own box, or to the foot of
     *  the area from where the template draws its main frame. A row that
     *  does not fit is clipped at the foot, or, when the grid goes on to
     *  another page (`FitState.gridsOn`), it and every row after it are
     *  left for that page, whole (`spilled`). */
    const placeGrid = (group: ResolvedFrameGroup, members: readonly ResolvedFrame[]): { rects: Map<string, Rect>; spilled: Set<string>; laidAny: boolean; clipped: string[] } => {
      const byMember = new Map(members.map((f) => [f.name, f]));
      const cells = (group.items ?? (group.repeat ? [] : members.map((f) => ({ item: 0, frames: [f.name] }))))
        .map((c) => c.frames.filter((n) => byMember.has(n)))
        .filter((c) => c.length > 0);
      const laidBoxes = new Map<string, Rect>();
      const spilled = new Set<string>();
      const cut: string[] = [];
      const own = groupPlaceable(group);
      const ownBox = own ? placeBox(own, template, input, refOf, () => 0) : undefined;
      const area = input.areas.area;
      const first = cells[0] ? byMember.get(cells[0][0]!)! : undefined;
      /** Where the template draws a cell's main frame. */
      const drawnOf = (main: ResolvedFrame): Rect => placeBox(framePlaceable(main), template, input, refOf, () => 0);
      const drawnFirst = first ? drawnOf(first) : area;
      const box: Rect = ownBox ?? { x: drawnFirst.x, y: drawnFirst.y, width: Math.max(0, area.x + area.width - drawnFirst.x), height: Math.max(0, area.y + area.height - drawnFirst.y) };
      const foot = box.y + box.height;
      const columns = Math.max(1, group.columns ?? 1);
      const colGap = dimensionToPx(group.columnGap ?? group.gap, dpi, input.emPx);
      const rowGap = dimensionToPx(group.rowGap ?? group.gap, dpi, input.emPx);
      const colW = Math.max(1, (box.width - colGap * (columns - 1)) / columns);
      const xOf = (c: number): number => box.x + c * (colW + colGap);
      const px = (d: Dimension | undefined): number | undefined => (d ? dimensionToPx(d, dpi, input.emPx) : undefined);
      /** The main frame's height in a cell `w` wide: its own rule, held
       *  between its minimum and maximum. */
      const mainHeight = (f: ResolvedFrame, w: number): number => {
        const h = f.height;
        let v: number;
        if (h === 'auto') v = naturalOf(prepare(f))(w);
        else if (h === 'fill') v = 0;
        else if ('percent' in h) v = (area.height * h.percent) / 100;
        else v = dimensionToPx(h, dpi, input.emPx);
        const min = px(f.minHeight) ?? 0;
        const max = px(f.maxHeight) ?? Infinity;
        return Math.max(min, Math.min(v, max));
      };
      /** The boxes of a cell's frames with its main frame at `(x, y)`,
       *  `h` tall; and the frames that count for the cell's extent. */
      const layCell = (cell: readonly string[], x: number, y: number, h: number): { boxes: Map<string, Rect>; inCell: string[] } => {
        const main = byMember.get(cell[0]!)!;
        const boxes = new Map<string, Rect>([[main.name, { x, y, width: colW, height: h }]]);
        const inCell = [main.name];
        const set = new Set(cell);
        const drawn = drawnOf(main);
        const refs = (n: string): Rect | undefined => boxes.get(n) ?? refOf(n);
        // A frame anchored in the set fills (and takes its percentages of)
        // the cell's column, not the whole area.
        const column = { ...input, areas: { ...input.areas, area: { x, y: area.y, width: colW, height: area.height } } };
        let todo = cell.slice(1);
        for (let pass = 0; todo.length > 0 && pass <= cell.length; pass++) {
          const later: string[] = [];
          for (const name of todo) {
            const f = byMember.get(name)!;
            const target = f.grid ? undefined : anchorTarget(f.placement);
            // Anchored to a frame of the set not placed yet: next pass.
            if (target !== undefined && set.has(target) && !boxes.has(target) && pass < cell.length) {
              later.push(name);
              continue;
            }
            const p = prepare(f);
            const inSet = target !== undefined && set.has(target);
            const r = placeFitted(f, framePlaceable(f), inSet ? column : input, refs, naturalOf(p), naturalWidthOf(p));
            if (target !== undefined && !set.has(target)) {
              // Anchored to a frame outside the set: where it says.
              boxes.set(name, r);
              continue;
            }
            // Anchored in the set, or to nothing in it: with the cell.
            boxes.set(name, target !== undefined ? r : { ...r, x: r.x + x - drawn.x, y: r.y + y - drawn.y });
            inCell.push(name);
          }
          todo = later;
        }
        return { boxes, inCell };
      };
      const stretchable = (f: ResolvedFrame): boolean => f.height === 'auto' || f.height === 'fill';
      let cursor = box.y;
      let laidAny = false;
      let out = false;
      for (let r = 0; r * columns < cells.length; r++) {
        const row = cells.slice(r * columns, (r + 1) * columns);
        if (out) {
          for (const c of row) for (const n of c) spilled.add(n);
          continue;
        }
        // Each cell at the row's top, to see how far it reaches above and
        // below its main frame.
        const measured = row.map((cell, c) => {
          const main = byMember.get(cell[0]!)!;
          const h = mainHeight(main, colW);
          const { boxes, inCell } = layCell(cell, xOf(c), 0, h);
          const u = unionRect(inCell.map((n) => boxes.get(n)!))!;
          return { cell, main, h, above: Math.max(0, -u.y), below: u.y + u.height };
        });
        const above = Math.max(0, ...measured.map((m) => m.above));
        const below = Math.max(0, ...measured.map((m) => m.below));
        const rowH = above + below;
        const fits = cursor + rowH <= foot + 0.5;
        if (!fits && fit.gridsOn.has(group.name)) {
          // This row and the rest go on, whole.
          out = true;
          for (const c of row) for (const n of c) spilled.add(n);
          continue;
        }
        measured.forEach((m, c) => {
          const spare = below - m.below;
          let dy = 0;
          let h = m.h;
          if (spare > 0.01) {
            const align = group.rowAlign ?? 'stretch';
            if (align === 'end') dy = spare;
            else if (align === 'center') dy = spare / 2;
            else if (align === 'stretch' && stretchable(m.main)) h = Math.min(m.h + spare, px(m.main.maxHeight) ?? Infinity);
          }
          const { boxes } = layCell(m.cell, xOf(c), cursor + above + dy, h);
          if (!fits) cut.push(...m.cell);
          for (const [n, b] of boxes) {
            // A row past the grid's foot is cut there: what is cut shows as
            // the frames' overflow.
            const y = Math.min(b.y, foot);
            laidBoxes.set(n, fits ? b : { ...b, y, height: Math.max(0, Math.min(b.y + b.height, foot) - y) });
          }
        });
        laidAny = true;
        cursor += rowH + rowGap;
      }
      for (const [n, b] of laidBoxes) {
        // A grid's cells are its template's drawing: no reflow events.
        declared.set(n, b);
        rects.set(n, b);
      }
      const laidRects = [...laidBoxes.values()];
      const union = ownBox ?? unionRect(laidRects) ?? { ...box, height: 0 };
      groupRects.set(group.name, union);
      groupDeclared.set(group.name, union);
      return { rects: laidBoxes, spilled, laidAny, clipped: cut };
    };

    /** Pour a frame's content into its box and record the frame. A frame
     *  whose text the ladder scales (#858) is laid out in a box `1 / scale`
     *  as large, painted at `scale` (`frameMatrix`). */
    const fill = (p: Prep, placed: Rect): void => {
      const { frame, st, holds, continuation, blockId, before } = p;
      const style = styleOf(frame);
      const s = textScale(frame);
      const pic = pictureScale(frame);
      // A frame in its own writing mode (#944) is laid out in its box
      // turned a quarter turn, its lines along the box's height; painted
      // turned back (`VDTFrame.writingMode`).
      const turned = ownMode(frame);
      const rect = turned ? quarterTurnedRect(placed) : placed;
      const laidW = rect.width / s;
      const laidH = rect.height / s;
      let result: CalloutLayoutResult | undefined;
      let overflowPx = 0;
      let goesOn = false;
      const from = st?.cut ?? CUT_START;
      if (holds) {
        // What its content needs at its width, measured only when a
        // proposal asks (`lowerMin`), from where the frame starts.
        const width = placed.width;
        const startAt: Prep = { ...p, st: { ...st!, cut: from } };
        let known: number | undefined;
        needs.set(frame.name, () => (known ??= naturalOf(startAt)(width)));
        // Text running round the frames that push it runs along the page's
        // lines: a frame set across them keeps its whole box.
        const exclusions = turned ? undefined : unscale(exclusionsFor(frame, rect, false), s);
        const extra: FrameBoxOptions = { ...(exclusions ? { exclusions } : {}), ...(pic !== undefined ? { pictureScale: pic } : {}), ...(p.fromMark !== undefined ? { continuedMark: p.fromMark } : {}), ...uprightIn(frame, laidH) };
        const opts: FrameBoxOptions = { boxHeight: laidH, verticalAlign: frame.verticalAlign, ...extra };
        const whole = inMode(frame, () => st!.L.layoutRange(from, st!.L.end, laidW, blockId, continuation, mirroredIn(frame), opts));
        const nextName = nextFrameOf(frame);
        const nextFrame = nextName !== undefined ? byName.get(nextName) : undefined;
        const chained = nextFrame !== undefined && !vdtByName.has(nextFrame.name);
        // Cut for another page (#859) when the chain ends here.
        goesOn = !chained && fit.goOn.has(frame.name);
        // A part of the contents that opens a page of its own further down
        // (`toc.parts.breakBefore`, #996): the frame is cut there when it
        // can go on, though what it holds would fit.
        const partBreak = partBreakCut(pass, st!.L, from) !== undefined;
        if (partBreak && !chained && !goesOn && continuesOffPage(frame.overflow.continueIn)) wantsOn.add(frame.name);
        if (((whole.overflowPx ?? 0) > 0.5 || partBreak) && (chained || goesOn)) {
          // The rest goes on in the next frame of the chain, or on another
          // page.
          const minLines = Math.max(1, style.splitMinLines);
          // A heading stays with what follows it, a list keeps two items
          // on each side of the cut (#913).
          const frag = inMode(frame, () => splitCalloutFragment(pass, st!.L, from, laidW, laidH, blockId, continuation, minLines, mirroredIn(frame), extra.exclusions || extra.pictureScale !== undefined || extra.continuedMark !== undefined || extra.uprightMaxLength !== undefined ? extra : undefined, cutRules, true));
          const to = frag?.to ?? from;
          // A frame none of whose content fits draws nothing: the whole box
          // goes on (#912), not a tab and a mark over an empty piece.
          result = frag ? inMode(frame, () => st!.L.layoutRange(from, to, laidW, blockId, continuation, mirroredIn(frame), opts)) : undefined;
          st!.cut = to;
        } else {
          goesOn = false;
          result = whole;
          overflowPx = (whole.overflowPx ?? 0) * s;
          st!.cut = st!.L.end;
        }
      } else if (st && frame.style) {
        // A styled frame with nothing (left) to hold still draws its box;
        // an empty story's own frame (#1084) its tab and title too.
        result = inMode(frame, () => st.L.layoutRange(st.L.end, st.L.end, laidW, blockId, continuation, mirroredIn(frame), { boxHeight: laidH }));
      }
      // A frame cut below its least height overflows by the cut, holding
      // content or not (#911).
      overflowPx = Math.max(overflowPx, boxShort.get(frame.name) ?? 0);
      // Ruled lines (#914): on the box, over its background, in its
      // laid-out coordinates; an empty frame keeps them for the decoration.
      let emptyRules: VDTDesignRuleBlock[] | undefined;
      if (frame.rules) {
        const linePx = frameLinePx(style, dpi);
        if (result?.frame.designOverlay && result.frame.callout) {
          result.frame.designOverlay.blocks.push(...frameRuleBlocks(frame.rules, result.frame.callout.innerRect, linePx, s, dpi, input.emPx));
        } else if (!result) {
          const pad = (d: Dimension): number => dimensionToPx(d, dpi, input.emPx);
          const p = style.padding;
          const inner = { x: rect.x + pad(p.left), y: rect.y + pad(p.top), width: rect.width - pad(p.left) - pad(p.right), height: rect.height - pad(p.top) - pad(p.bottom) };
          const blocks = frameRuleBlocks(frame.rules, inner, linePx, 1, dpi, input.emPx);
          // On the page, a frame in its own writing mode turns its rules
          // with it (#944): across its lines, as the page shows them.
          if (blocks.length > 0) emptyRules = turned ? blocks.map((b) => ({ ...b, bbox: turnRectAbout(b.bbox, rect, frameModeTurn({ writingMode: turned })) })) : blocks;
        }
      }
      const instance = repeated.has(repeatInstance(frame.name)?.frame ?? '') ? repeatInstance(frame.name) : undefined;
      const vdt: VDTFrame = {
        id: frameIdOf(frame.name),
        name: frame.name,
        ...(instance ? { repeat: instance } : {}),
        rect: { ...rect },
        rotate: frame.rotate + (turned ? frameModeTurn({ writingMode: turned }) : 0),
        ...(turned ? { writingMode: turned } : {}),
        ...(unmirroredAt(frame) !== undefined ? { unmirrorX: unmirroredAt(frame)! } : {}),
        layer: frame.layer,
        ...(frame.style ? { styleId: frame.style } : {}),
        ...(holds && unknownLookOf(frame) !== undefined ? { lookUnknown: unknownLookOf(frame)! } : {}),
        scale: s,
        ...(pic !== undefined && holds ? { imageScale: pic } : {}),
        overflowPx,
        blockIds: [],
        configPath: frame.configPath,
        ...(frame.exclude === 'push' ? { push: true as const } : {}),
        ...(collapsed.has(frame.name) ? { collapsed: true as const } : {}),
        ...(emptyRules ? { rules: emptyRules } : {}),
      };
      const declPlaced = declared.get(frame.name);
      const decl = declPlaced && turned ? quarterTurnedRect(declPlaced) : declPlaced;
      if (decl && !sameRect(decl, rect)) vdt.declaredRect = { ...decl };
      if (before && vdtByName.has(before) && st && st.lastFrameId) {
        vdt.continuedFrom = st.lastFrameId;
        const q = frames.find((f) => f.id === st.lastFrameId);
        if (q) q.continuesTo = vdt.id;
      } else if (holds && cont?.receivers.has(frame.name) && !cont.receivers.get(frame.name)!.whole) {
        // Content from the page before (#859). (An item of a grid that
        // came whole, #1061, starts here.)
        const came = cont.receivers.get(frame.name)!;
        vdt.continuedFrom = came.fromFrameId;
        // From a page of an earlier chapter (#943).
        if (came.foreign) vdt.continuedFromChapter = came.foreign.from;
      }
      if (result) {
        // The marks whose `{page}` the build fills in (#917).
        if (goesOn && typeof frame.overflow.mark === 'string' && frame.overflow.mark.includes('{page}')) tagPageMark(result.frame, withPage(frame.overflow.mark, toGuess), frame.overflow.mark, 'to');
        const fromWords = frame.overflow.fromMark ?? cont?.receivers.get(headOf(frame.name))?.fromMark;
        if (p.fromMark !== undefined && fromWords?.includes('{page}')) tagPageMark(result.frame, p.fromMark, fromWords, 'from');
      }
      if (result && st) {
        const range = fragmentRange(st.L, from, st.cut);
        commitFrame(result, rect, st.story, range, input, vdt, blocks);
        st.pieces++;
        st.lastFrameId = vdt.id;
        laid.add(headOf(frame.name));
        // What the ladder changed in the frame's content (#858).
        const pictures = fit.pictures.get(headOf(frame.name));
        if (pictures && result.children.some((b) => b.type === 'resource')) {
          fitLog.push({ frame: frame.name, kind: 'imageScaled', scale: pictures.scale, ...(pictures.by !== frame.name ? { cause: pictures.by } : {}) });
        }
        if (s !== 1 && holds) fitLog.push({ frame: frame.name, kind: 'textScaled', scale: s });
      }
      if (goesOn && st) {
        // Laid here even when none of it fits: the rest goes on (#912).
        laid.add(headOf(frame.name));
        spills.set(frame.name, { head: headOf(frame.name), cut: st.cut, advanced: !sameCut(from, st.cut), pieces: st.pieces, headBlockId: st.headBlockId, frameId: vdt.id });
      }
      if (overflowPx > 0.5) {
        const overflowMm = Math.round((overflowPx / dpi) * MM_PER_IN * 10) / 10;
        overflowLog.push({ frame: frame.name, kind: 'overflow', toMm: overflowMm });
      }
      if (frame.exclude === 'push') {
        const box = frameBounds({ rect: placed, rotate: frame.rotate });
        pushRects.set(frame.name, box);
        // `wrap: 'contour'` (#883): the shape of the pictures it holds; a
        // turned frame pushes with its box.
        const shape = frame.wrap === 'contour' && frame.rotate === 0 && !turned && result
          ? frameContour(result.children, { gapPx: input.pushGapPx, dpi, emPx: input.emPx, mirrored: pageIsMirrored(input.page), pageIndex: input.page.index })
          : undefined;
        if (shape) notes.push(...shape.notes);
        // A frame whose text the ladder scaled (#858) holds its pictures in
        // its laid-out coordinates: on the page they are `s` as large, from
        // its box's corner (`frameMatrix`).
        const contour = shape?.contour && s !== 1 ? scaleContourAbout(shape.contour, rect.x, rect.y, s, false) : shape?.contour;
        if (contour) pushShapes.set(frame.name, contour);
        if (!seed) pushed.push({ name: frame.name, box, ...(contour ? { contour } : {}) });
      }
      frames.push(vdt);
      vdtByName.set(frame.name, vdt);
    };

    /** A frame's box cut at `clipFoot` (a module cut at its group's foot,
     *  #1062): what is cut shows as the frame's overflow. */
    const clipAtFoot = (name: string, r: Rect): Rect => {
      if (clipFoot === undefined || r.y + r.height <= clipFoot + 0.5) return r;
      clipped.add(name);
      const y = Math.min(r.y, clipFoot);
      const out = { ...r, y, height: Math.max(0, Math.min(r.y + r.height, clipFoot) - y) };
      rects.set(name, out);
      return out;
    };
    /** A module's `'auto'` box that ends at the module's foot, in a row
     *  that stretches the module (#1095): to the row's foot, its declared
     *  box by as much (the template asks for it). A frame as wide as its
     *  content (a pill, a tab) keeps its height. */
    const stretchAuto = (name: string, r: Rect): Rect => {
      const s = stretchTo;
      if (!s || !s.names.has(name)) return r;
      const f = byName.get(name);
      if (!f || f.height !== 'auto' || f.width === 'auto' || f.pin || heldByFoot(f)) return r;
      const bottom = r.y + r.height;
      if (Math.abs(bottom - s.at) > 0.5 || s.foot - bottom <= 0.01) return r;
      const out = { ...r, height: s.foot - r.y };
      rects.set(name, out);
      const d = declared.get(name);
      if (d) declared.set(name, { ...d, height: d.height + (s.foot - bottom) });
      return out;
    };
    /** The frames of `names` whose content goes on whole on another page
     *  (#1061, #1062): none of it is laid here. */
    const spillWhole = (names: readonly string[], advanced: boolean, lastLaid: string | undefined): void => {
      for (const n of names) {
        const f = byName.get(n);
        const st = f ? prepare(f).st : undefined;
        if (!st) continue;
        laid.add(headOf(n));
        spills.set(n, { head: headOf(n), cut: st.cut, advanced, pieces: st.pieces, headBlockId: st.headBlockId, frameId: lastLaid ?? frameIdOf(n), whole: true });
      }
    };
    /** Place (and, `filling`, fill) one step of `composedOrder`. */
    const runStep = (step: ReturnType<typeof composedOrder>[number], filling: boolean): void => {
      if (step.kind === 'frame') {
        const p = prepare(step.frame);
        const r = clipAtFoot(step.frame.name, stretchAuto(step.frame.name, placeFrame(p)));
        if (filling) fill(p, r);
        return;
      }
      if (step.group.modules) {
        // A modules group (#1062): its modules, one under another.
        placeModules(step.group, step.frames);
        return;
      }
      if (step.group.kind === 'grid') {
        // A grid (#1061): its cells, and the items of the rows left for
        // another page, which go on whole.
        const grid = placeGrid(step.group, step.frames);
        if (!filling) return;
        for (const n of grid.clipped) clipped.add(n);
        let lastLaid: string | undefined;
        for (const f of step.frames) {
          if (!grid.spilled.has(f.name)) {
            fill(prepare(f), clipAtFoot(f.name, stretchAuto(f.name, grid.rects.get(f.name)!)));
            lastLaid = frameIdOf(f.name);
            continue;
          }
          spillWhole([f.name], grid.laidAny, lastLaid);
        }
        return;
      }
      const solved = placeGroup(step.group, step.frames);
      // A frame of a chain inside the group is reached once the frame
      // before it was filled: each is prepared again as it is filled.
      for (const f of step.frames) {
        const r = clipAtFoot(f.name, stretchAuto(f.name, solved.get(f.name)!));
        if (filling) fill(prepare(f), r);
      }
    };

    /** Lay a modules group (#1062): its modules in rows down the group's
     *  box (its own, else the area). A stack gives each module a row of
     *  its own, as wide as the group (or its template's `width`, #1088), a
     *  `'row'` puts them all in one, start to end (each its `width`, else
     *  an equal share of what is left), a `'grid'` `columns` to a row in
     *  equal columns; a run of modules a group inside it takes (`within`)
     *  is laid as that group says where its first module comes: its rows
     *  among a stack's, one cell of a row or a grid (#1095: to any depth).
     *  A row's room past its modules' widths goes by `grow`, what it is
     *  short by comes back by `shrink` (#1095). Rows run from the start side of the page's lines (the flow frame is
     *  mirrored on a right-to-left page, so its left is the start). A
     *  module is placed as its template draws its frames in its box
     *  (`'container'` is the box) and its groups laid in it: first in the
     *  room left, to find how tall it is (the frames held by the box's foot
     *  or middle, or sized by its height, left out), then in a box that
     *  tall, or (`rowAlign` `'stretch'`, a row of several) as tall as its
     *  row, its `'auto'` boxes that end at its foot reaching the row's
     *  (#1095). A row that does not fit is cut at the group's foot (its frames
     *  clipped there), or, when the group goes on to another page
     *  (`FitState.gridsOn`), it and every row after it go on, whole. The
     *  modules' declared boxes follow each other at the heights their
     *  frames declare, so the log tells a module moved by the one before
     *  it. */
    const placeModules = (group: ResolvedFrameGroup, members: readonly ResolvedFrame[]): void => {
      const byMember = new Map(members.map((f) => [f.name, f]));
      const own = groupPlaceable(group);
      const ownBox = own ? placeBox(own, template, pageInput, refOf, () => 0) : undefined;
      const box = ownBox ?? pageInput.areas.area;
      const foot = box.y + box.height;
      const toPx = (d: Dimension): number => dimensionToPx(d, dpi, pageInput.emPx);
      const groupNamed = new Map(template.groups.map((g) => [g.name, g]));
      /** A module, its frames, and the groups inside the page's it lies
       *  in, innermost first (#1095). */
      type Laid = { mod: ResolvedModule; names: string[]; chain: string[] };
      /** An item of a row: a module, or a run of modules of a group inside
       *  the row's group, laid as that group in the cell (#1095). */
      type Cell = { kind: 'module'; l: Laid } | { kind: 'group'; group: ResolvedFrameGroup; list: Laid[] };
      type Row = { cells: Cell[]; xs: number[]; widths: number[]; align: 'start' | 'center' | 'end' | 'stretch'; gapBefore: number };
      const mods: Laid[] = [];
      for (const item of group.items ?? []) {
        const mod = template.modules?.find((m) => m.name === item.module);
        const names = item.frames.filter((n) => byMember.has(n));
        if (mod && names.length > 0) mods.push({ mod, names, chain: nestedChain(template.groups, mod.nested) });
      }
      /** A module's width by its template in a group `width` wide
       *  (`'fill'`: none). */
      const fixedWidth = (l: Laid, width: number): number | undefined => {
        const w = l.mod.width;
        if (w === undefined || w === 'fill') return undefined;
        return 'percent' in w ? (width * w.percent) / 100 : toPx(w);
      };
      /** The cells of `list` in `g`: each module `g` lays itself, and each
       *  run of the modules of a group inside `g`. */
      const cellsOf = (list: readonly Laid[], g: ResolvedFrameGroup): Cell[] => {
        const out: Cell[] = [];
        for (const l of list) {
          const name = l.chain.find((n) => groupNamed.get(n)?.within === g.name);
          const child = name !== undefined ? groupNamed.get(name) : undefined;
          const last = out[out.length - 1];
          if (child && last?.kind === 'group' && last.group === child) last.list.push(l);
          else out.push(child ? { kind: 'group', group: child, list: [l] } : { kind: 'module', l });
        }
        return out;
      };
      const namesOf = (c: Cell): string[] => (c.kind === 'module' ? c.l.names : c.list.flatMap((l) => l.names));
      /** `cells` side by side across `width` from `x`, `gap` between them:
       *  each as wide as its template says, then the room left shared by
       *  `grow` (a `'fill'` module, and a group's cell, 1 at least), or,
       *  when the widths run past the end, given back by `shrink` in
       *  proportion to each width (#1095). */
      const across = (cells: readonly Cell[], gap: number, x: number, width: number): { xs: number[]; widths: number[] } => {
        const fixed = cells.map((c) => (c.kind === 'module' ? fixedWidth(c.l, width) : undefined));
        const taken = fixed.reduce<number>((a, w) => a + (w ?? 0), 0) + gap * Math.max(0, cells.length - 1);
        const spare = width - taken;
        let widths: number[];
        if (spare >= 0) {
          const grows = cells.map((c, k) => (c.kind !== 'module' ? 1 : fixed[k] === undefined ? Math.max(1, c.l.mod.grow ?? 1) : c.l.mod.grow ?? 0));
          const total = grows.reduce((a, g) => a + g, 0);
          widths = fixed.map((w, k) => Math.max(0, total > 0 ? (w ?? 0) + (spare * grows[k]!) / total : w ?? 0));
        } else {
          const weights = cells.map((c, k) => (c.kind === 'module' && fixed[k] !== undefined ? (c.l.mod.shrink ?? 0) * fixed[k]! : 0));
          const total = weights.reduce((a, g) => a + g, 0);
          widths = fixed.map((w, k) => Math.max(0, total > 0 ? (w ?? 0) + (spare * weights[k]!) / total : w ?? 0));
        }
        const xs: number[] = [];
        let at = x;
        for (const w of widths) {
          xs.push(at);
          at += w + gap;
        }
        return { xs, widths };
      };
      /** The rows `list` makes in a group of `g`'s kind across `width`
       *  from `x`, the first `first` after the row before it. A group
       *  inside a stack adds its rows to the stack's; inside a row or a
       *  grid, a run of its modules is one cell. */
      const rowsOf = (list: readonly Laid[], g: ResolvedFrameGroup, x: number, width: number, first: number): Row[] => {
        const gap = toPx(g.gap);
        const align = g.rowAlign ?? 'stretch';
        const cells = cellsOf(list, g);
        if (g.kind === 'row') return [{ cells, ...across(cells, gap, x, width), align, gapBefore: first }];
        if (g.kind === 'grid') {
          const columns = Math.max(1, g.columns ?? 1);
          const colGap = toPx(g.columnGap ?? g.gap);
          const rowGap = toPx(g.rowGap ?? g.gap);
          const colW = Math.max(1, (width - colGap * (columns - 1)) / columns);
          const out: Row[] = [];
          for (let k = 0; k < cells.length; k += columns) {
            const chunk = cells.slice(k, k + columns);
            out.push({ cells: chunk, xs: chunk.map((_, c) => x + c * (colW + colGap)), widths: chunk.map(() => colW), align, gapBefore: k === 0 ? first : rowGap });
          }
          return out;
        }
        // A stack: a row of its own per module, at its width from the
        // start; a group's rows in turn.
        const out: Row[] = [];
        cells.forEach((c, k) => {
          const before = k === 0 ? first : gap;
          if (c.kind === 'module') out.push({ cells: [c], xs: [x], widths: [fixedWidth(c.l, width) ?? width], align: 'start', gapBefore: before });
          else out.push(...rowsOf(c.list, c.group, x, width, before));
        });
        return out;
      };
      const rows = rowsOf(mods, group, box.x, box.width, 0);
      let cursor = box.y;
      let declCursor = box.y;
      let out = false;
      let laidAny = false;
      let lastLaid: string | undefined;
      const boxes: Rect[] = [];
      const declBoxes: Rect[] = [];
      const nestedBoxes = new Map<string, { laid: Rect[]; declared: Rect[] }>();
      const restore = <K, V>(to: Map<K, V>, from: ReadonlyMap<K, V>): void => {
        to.clear();
        for (const [k, v] of from) to.set(k, v);
      };
      const lay = (l: Laid, x: number, y: number, width: number, height: number, filling: boolean): void => {
        const steps = composedOrder({ frames: l.names.map((n) => byMember.get(n)!), groups: template.groups.filter((g) => l.mod.groups.includes(g.name)) });
        input = { ...pageInput, areas: { ...pageInput.areas, area: { x, y, width, height: Math.max(0, height) } } };
        try {
          for (const step of steps) runStep(step, filling);
        } finally {
          input = pageInput;
        }
      };
      /** How tall a module is at `(x, y)`, `width` wide: its frames placed
       *  in the room left, then everything they set put back. */
      const measure = (l: Laid, x: number, y: number, width: number): number => {
        const kept = { rects: new Map(rects), declared: new Map(declared), groupRects: new Map(groupRects), groupDeclared: new Map(groupDeclared), pinned: pinned.length, boxShort: new Map(boxShort), fitted: new Map(fitted) };
        lay(l, x, y, width, foot - y, false);
        const placed = l.names.filter((n) => rects.has(n));
        const measured = placed.filter((n) => !heldByFoot(byMember.get(n)!));
        const reach = unionRect((measured.length > 0 ? measured : placed).map((n) => rects.get(n)!));
        restore(rects, kept.rects);
        restore(declared, kept.declared);
        restore(groupRects, kept.groupRects);
        restore(groupDeclared, kept.groupDeclared);
        restore(boxShort, kept.boxShort);
        restore(fitted, kept.fitted);
        pinned.length = kept.pinned;
        return reach ? Math.max(0, reach.y + reach.height - y) : 0;
      };
      /** How tall a cell is at `(x, y)`, `width` wide: a module's height,
       *  or a group's rows one after another (#1095). */
      const measureCell = (c: Cell, x: number, y: number, width: number): number => {
        if (c.kind === 'module') return measure(c.l, x, y, width);
        let at = y;
        rowsOf(c.list, c.group, x, width, 0).forEach((row, r) => {
          if (r > 0) at += row.gapBefore;
          at += Math.max(0, ...row.cells.map((d, k) => measureCell(d, row.xs[k]!, at, row.widths[k]!)));
        });
        return at - y;
      };
      /** Lay `row` at `rowTop` (its declared top `declTop`), its cells
       *  `heights` tall: each module in a box that tall (cut at the foot
       *  when the row does not fit), a shorter one placed by `rowAlign`; a
       *  group's cell its rows in turn. The row's foot, laid and declared. */
      const layRow = (row: Row, rowTop: number, declTop: number, heights: readonly number[], fits: boolean): { bottom: number; declBottom: number } => {
        const rowH = Math.max(0, ...heights);
        const several = row.cells.length > 1;
        let rowBottom = rowTop;
        let rowDeclBottom = declTop;
        row.cells.forEach((c, k) => {
          const x = row.xs[k]!;
          const width = row.widths[k]!;
          const spare = rowH - heights[k]!;
          const stretched = fits && several && row.align === 'stretch' && c.kind === 'module';
          const dy = fits && several && spare > 0.01 ? (row.align === 'end' ? spare : row.align === 'center' ? spare / 2 : 0) : 0;
          const y = rowTop + dy;
          if (c.kind === 'group') {
            // A run of a group inside this one (#1095): its rows, from the
            // cell's top.
            const laid = layRows(rowsOf(c.list, c.group, x, width, 0), y, declTop + dy, fits);
            rowBottom = Math.max(rowBottom, laid.bottom);
            rowDeclBottom = Math.max(rowDeclBottom, laid.declBottom);
            return;
          }
          const l = c.l;
          clipFoot = fits ? undefined : foot;
          // Its 'auto' boxes that end at its foot reach the row's (#1095).
          stretchTo = stretched && spare > 0.01 ? { at: y + heights[k]!, foot: y + rowH, names: new Set(l.names) } : undefined;
          try {
            lay(l, x, y, width, fits ? (stretched ? rowH : heights[k]!) : foot - rowTop, true);
          } finally {
            clipFoot = undefined;
            stretchTo = undefined;
          }
          const u = unionRect(l.names.flatMap((n) => (rects.has(n) ? [rects.get(n)!] : [])));
          const bottom = Math.max(stretched ? y + rowH : y, u ? u.y + u.height : y);
          const moduleBox = { x, y, width, height: bottom - y };
          moduleRects.set(l.mod.name, moduleBox);
          boxes.push(moduleBox);
          // Declared: after the rows before it as they declare themselves.
          const shift = declTop - rowTop;
          for (const n of l.names) {
            const d = declared.get(n);
            if (d && Math.abs(shift) > 0.001) declared.set(n, { ...d, y: d.y + shift });
          }
          const declY = declTop + dy;
          const du = unionRect(l.names.flatMap((n) => (declared.has(n) ? [declared.get(n)!] : [])));
          const declBottom = du ? Math.max(declY, du.y + du.height) : declY;
          const declBox = { x, y: declY, width, height: declBottom - declY };
          declBoxes.push(declBox);
          for (const name of l.chain) {
            const n = nestedBoxes.get(name) ?? { laid: [], declared: [] };
            n.laid.push(moduleBox);
            n.declared.push(declBox);
            nestedBoxes.set(name, n);
          }
          rowBottom = Math.max(rowBottom, bottom);
          rowDeclBottom = Math.max(rowDeclBottom, declBottom);
        });
        return { bottom: rowBottom, declBottom: rowDeclBottom };
      };
      /** The rows of a group's cell, one after another from `top`. */
      const layRows = (list: readonly Row[], top: number, declTop: number, fits: boolean): { bottom: number; declBottom: number } => {
        let at = top;
        let declAt = declTop;
        list.forEach((row, r) => {
          if (r > 0) {
            at += row.gapBefore;
            declAt += row.gapBefore;
          }
          const heights = row.cells.map((c, k) => measureCell(c, row.xs[k]!, at, row.widths[k]!));
          const laid = layRow(row, at, declAt, heights, fits);
          at = laid.bottom;
          declAt = laid.declBottom;
        });
        return { bottom: at, declBottom: declAt };
      };
      rows.forEach((row, r) => {
        const names = row.cells.flatMap(namesOf);
        if (out) {
          spillWhole(names, laidAny, lastLaid);
          return;
        }
        if (r > 0) {
          cursor += row.gapBefore;
          declCursor += row.gapBefore;
        }
        const heights = row.cells.map((c, k) => measureCell(c, row.xs[k]!, cursor, row.widths[k]!));
        const rowH = Math.max(0, ...heights);
        const fits = cursor + rowH <= foot + 0.5;
        if (!fits && fit.gridsOn.has(group.name)) {
          // This row and the ones after it go on, whole.
          out = true;
          spillWhole(names, laidAny, lastLaid);
          return;
        }
        const laid = layRow(row, cursor, declCursor, heights, fits);
        laidAny = true;
        lastLaid = frameIdOf(names[names.length - 1]!);
        cursor = laid.bottom;
        declCursor = laid.declBottom;
      });
      // A group inside another (#1088, #1095) is the box of its modules.
      for (const [name, b] of nestedBoxes) {
        groupRects.set(name, unionRect(b.laid)!);
        groupDeclared.set(name, unionRect(b.declared)!);
      }
      groupRects.set(group.name, ownBox ?? unionRect(boxes) ?? { ...box, height: 0 });
      groupDeclared.set(group.name, ownBox ?? unionRect(declBoxes) ?? { ...box, height: 0 });
    };

    for (const step of composedOrder(template)) runStep(step, true);

    const log = mergeLog(reflowEvents(motionsOf(template, rects, declared), dpi / MM_PER_IN), [...fitLog, ...overflowLog], template);
    return { frames, blocks, log, laid, needs, pushRects, pushShapes, fitted, notes, spills, wantsOn, clipped, groupRects, moduleRects };
  };
  const first = run();
  const { frames, blocks, log, laid, needs, fitted, notes, spills, wantsOn, clipped, groupRects, moduleRects } = first.pushRects.size > 0 ? run(first.pushRects, first.pushShapes) : first;
  return { frames, blocks, log, laid, needs, template, fitted, spills, wantsOn, clipped, groupRects, moduleRects, ...(notes.length > 0 ? { notes } : {}) };
}

/** A module's frame placed by its box's foot or middle, or sized by its
 *  height (#1062): it does not say how tall the module is. */
function heldByFoot(f: ResolvedFrame): boolean {
  if (f.height === 'fill' || (typeof f.height === 'object' && 'percent' in f.height)) return true;
  const anchor = f.placement?.anchor;
  if (!anchor || anchor.to !== 'container') return false;
  return FOOT_EDGES.has(anchor.edge);
}

/** The nine-point edges below a box's top. */
const FOOT_EDGES: ReadonlySet<string> = new Set(['left', 'center', 'right', 'start', 'end', 'bottom-left', 'bottom', 'bottom-right', 'bottom-start', 'bottom-end']);

/** `r` turned `deg` (±90) about the centre of `about`: an axis-aligned
 *  box again, its width and height swapped. */
function turnRectAbout(r: Rect, about: Rect, deg: number): Rect {
  const cx = about.x + about.width / 2;
  const cy = about.y + about.height / 2;
  const turn = (x: number, y: number): { x: number; y: number } =>
    deg > 0 ? { x: cx - (y - cy), y: cy + (x - cx) } : { x: cx + (y - cy), y: cy - (x - cx) };
  const a = turn(r.x, r.y);
  const b = turn(r.x + r.width, r.y + r.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

const sameRect = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

/** Each laid frame's declared and final boxes, in template order, with
 *  what moves it: what it anchors to (a group: its frames, last first),
 *  then, in a group, the frames before it (nearest first), what the group
 *  anchors to, and the frames after it. */
function motionsOf(template: ResolvedPageTemplate, rects: ReadonlyMap<string, Rect>, declared: ReadonlyMap<string, Rect>): FrameMotion[] {
  const groupOf = groupOfFrames(template);
  const groups = new Map(template.groups.map((g) => [g.name, g]));
  const expand = (target: string | undefined): string[] => {
    if (!target) return [];
    const g = groups.get(target);
    return g && !rects.has(target) ? [...g.frames].reverse() : [target];
  };
  const out: FrameMotion[] = [];
  for (const f of template.frames) {
    const fin = rects.get(f.name);
    const decl = declared.get(f.name);
    if (!fin || !decl) continue;
    const deps = f.grid ? [] : expand(anchorTarget(f.placement));
    const g = groupOf.get(f.name);
    if (g) {
      const k = g.frames.indexOf(f.name);
      deps.push(...g.frames.slice(0, k).reverse());
      if (!g.grid) deps.push(...expand(anchorTarget(g.placement)));
      deps.push(...g.frames.slice(k + 1));
    }
    out.push({ name: f.name, declared: decl, final: fin, deps });
  }
  return out;
}

/** The page's log: each frame's events in template order, what groups and
 *  anchors changed first, then its overflow. */
function mergeLog(reflow: readonly ReflowEvent[], overflow: readonly ReflowEvent[], template: ResolvedPageTemplate): ReflowEvent[] {
  const order = new Map(template.frames.map((f, i) => [f.name, i]));
  const all = [...reflow.map((e, i) => ({ e, i })), ...overflow.map((e, i) => ({ e, i: reflow.length + i }))];
  all.sort((a, b) => (order.get(a.e.frame) ?? 0) - (order.get(b.e.frame) ?? 0) || a.i - b.i);
  return all.map((x) => x.e);
}

/** Stamp a frame's laid-out box with its source and page, move it to the
 *  frame's place and add it (box first) to `out` and to the frame's ids. */
function commitFrame(
  result: CalloutLayoutResult,
  rect: Rect,
  story: ComposedStory,
  range: { firstChildIdx: number; lastChildIdx: number },
  input: ComposedPageInput,
  vdt: VDTFrame,
  out: VDTBlock[],
): void {
  const { pass, page, bodyOffset } = input;
  const blocks = pass.contentBlocks;
  const box = result.frame;
  box.contentIndex = story.startIdx;
  const first = blocks[Math.max(story.startIdx + 1, Math.min(range.firstChildIdx, story.plan.endIdx - 1))];
  const last = blocks[Math.max(story.startIdx + 1, Math.min(range.lastChildIdx, story.plan.endIdx - 1))];
  if (first && last && range.lastChildIdx >= range.firstChildIdx) {
    box.sourceStart = first.sourceStart + bodyOffset;
    box.sourceEnd = last.sourceEnd + bodyOffset;
    vdt.sourceStart = box.sourceStart;
    vdt.sourceEnd = box.sourceEnd;
  }
  box.pageIndex = page.index;
  box.columnIndex = 0;
  stampFrameAttrText(box, blocks[story.startIdx]?.containerAttrSources, story.plan.attrs, bodyOffset);
  offsetCalloutToAbsolute(result, rect.x, rect.y);
  out.push(box);
  vdt.blockIds.push(box.id);
  for (const child of result.children) {
    child.pageIndex = page.index;
    child.columnIndex = 0;
    out.push(child);
    vdt.blockIds.push(child.id);
  }
}

/** The frame's tab (`label`) and title (`title`) as the box draws them,
 *  stamped with where the `:::frame` fence writes them (#857): the
 *  attribute's value range, and a per-character map when the text is
 *  printed as written. */
function stampFrameAttrText(
  box: VDTBlock,
  sources: Readonly<Record<string, { sourceStart: number; sourceEnd: number }>> | undefined,
  attrs: Readonly<Record<string, string>>,
  bodyOffset: number,
): void {
  if (!sources || !box.designOverlay) return;
  for (const name of ['label', 'title'] as const) {
    const src = sources[name];
    const value = attrs[name];
    if (!src || value === undefined || value.trim() === '') continue;
    const start = src.sourceStart + bodyOffset;
    const end = src.sourceEnd + bodyOffset;
    for (const b of box.designOverlay.blocks) {
      if (b.kind !== 'text' || b.attr !== undefined) continue;
      const shown = b.lines.map((l) => l.text).join(' ');
      if (shown.trim() !== value.trim() && shown.trim().toLocaleLowerCase() !== value.trim().toLocaleLowerCase()) continue;
      b.sourceStart = start;
      b.sourceEnd = end;
      b.attr = name;
      if (shown === value && end - start === value.length) {
        b.sourceText = value;
        b.sourceMap = Array.from({ length: value.length }, (_, i) => start + i);
      }
      break;
    }
  }
}

/** The callout style a frame is drawn with: `base` (its `style`, or the
 *  frameless frame style) with what a frame sets of its own: its padding
 *  (side by side) and a measure that is the frame's. A style's placement,
 *  span, width and margins do not apply to a frame. */
export function frameStyleOf(base: ResolvedCalloutStyleConfig, frame: ResolvedFrame): ResolvedCalloutStyleConfig {
  const padding = frame.padding ? { ...base.padding, ...frame.padding } : base.padding;
  return {
    ...(frame.look ? styleWithLook(base, frame.look) : base),
    padding,
    width: 'fill',
    placement: 'here',
    span: 'column',
    marginTop: { value: 0, unit: 'px' },
    marginBottom: { value: 0, unit: 'px' },
  };
}

const lookedStyles = new WeakMap<object, WeakMap<object, ResolvedCalloutStyleConfig>>();
/** Frames with a named look laid over theirs (#1089), per look and frame:
 *  the same look object each time, so `styleWithLook` keeps its styles. */
const namedLookFrames = new WeakMap<FrameLookEntry, WeakMap<ResolvedFrame, ResolvedFrame>>();

/** `frame` with the named look `named` (#1089) laid over its own `look`
 *  (`lookOver`): the order is the style, the template frame's look, then
 *  the named look. `frame` itself when there is none. */
export function withNamedLook(frame: ResolvedFrame, named: FrameLookEntry | undefined): ResolvedFrame {
  if (!named) return frame;
  let byFrame = namedLookFrames.get(named);
  if (!byFrame) namedLookFrames.set(named, (byFrame = new WeakMap()));
  const known = byFrame.get(frame);
  if (known) return known;
  const out: ResolvedFrame = { ...frame, look: lookOver(frame.look, named) };
  byFrame.set(frame, out);
  return out;
}

/** `base` with what a frame's `look` sets (#976) written over it: colours
 *  of the fill, border, stripe, icon, marker, title, text and label tab,
 *  and the tracking of the body. A fill colour turns the fill on. A part
 *  the style does not have (a label tab it lacks) is left out. Kept per
 *  style and look, so the pieces a measurement is keyed by (`body`,
 *  `lists`) keep their identity from one call to the next. */
export function styleWithLook(base: ResolvedCalloutStyleConfig, look: FrameLook): ResolvedCalloutStyleConfig {
  let byLook = lookedStyles.get(base);
  if (!byLook) lookedStyles.set(base, (byLook = new WeakMap()));
  const known = byLook.get(look);
  if (known) return known;
  const out: ResolvedCalloutStyleConfig = { ...base };
  if (look.background) {
    out.background = look.background;
    out.backgroundEnabled = true;
  }
  if (look.border?.color) {
    // Every side takes the look's border colour too (#1059).
    const color = look.border.color;
    const sides = base.border.sides;
    out.border = {
      ...base.border,
      color,
      ...(sides ? { sides: { top: { ...sides.top, color }, right: { ...sides.right, color }, bottom: { ...sides.bottom, color }, left: { ...sides.left, color } } } : {}),
    };
  }
  if (look.stripe?.color) out.stripe = { ...base.stripe, color: look.stripe.color };
  if (look.icon?.color) out.icon = { ...base.icon, color: look.icon.color };
  if (look.marker?.color || look.marker?.rule?.color) {
    out.marker = {
      ...base.marker,
      ...(look.marker.color ? { color: look.marker.color } : {}),
      ...(look.marker.rule?.color ? { rule: { ...base.marker.rule, color: look.marker.rule.color } } : {}),
    };
  }
  if (look.titleStyle?.color) out.titleStyle = { ...base.titleStyle, color: look.titleStyle.color };
  if (look.body) {
    const b = look.body;
    out.body = {
      ...base.body,
      ...(b.color ? { color: b.color } : {}),
      ...(b.boldColor ? { boldColor: b.boldColor } : {}),
      ...(b.italicColor ? { italicColor: b.italicColor } : {}),
      ...(b.letterSpacing ? (b.letterSpacing.value !== 0 ? { letterSpacing: b.letterSpacing } : { letterSpacing: undefined }) : {}),
    };
  }
  if (look.label && base.label) {
    out.label = {
      ...base.label,
      ...(look.label.color ? { color: look.label.color } : {}),
      ...(look.label.background ? { background: look.label.background } : {}),
      ...(look.label.rule?.color ? { rule: { ...base.label.rule, color: look.label.rule.color } } : {}),
    };
  }
  byLook.set(look, out);
  return out;
}

/** The story heads of a composed page's stories, by the head frame's
 *  name, read from the boxes `wrapComposedPages` made (`FRAME_ATTR`). */
export function composedStories(
  startIdx: number,
  endIdx: number,
  plans: ReadonlyMap<number, PlannedCallout>,
): Map<string, ComposedStory> {
  const out = new Map<string, ComposedStory>();
  for (let i = startIdx + 1; i < endIdx; i++) {
    const plan = plans.get(i);
    if (!plan) continue;
    const head = plan.attrs[FRAME_ATTR];
    if (head !== undefined && !out.has(head)) out.set(head, { startIdx: i, plan });
    i = plan.endIdx;
  }
  return out;
}

/** `d` in px, 0 when unset. */
export function lengthPx(d: Parameters<typeof dimensionToPx>[0] | undefined, dpi: number, emPx: number): number {
  return d ? dimensionToPx(d, dpi, emPx) : 0;
}

/** A composed page of the pass whose template is known: its markers and
 *  its stories. */
export interface PlannedComposedPage {
  startIdx: number;
  endIdx: number;
  stories: Map<string, ComposedStory>;
  /** The story box holding block `idx`, if any. */
  storyAt(idx: number): ComposedStory | undefined;
}

/** The composed pages of `blocks` whose template `source` has, by their
 *  opening marker's index. */
export function planComposedPages(
  blocks: readonly ContentBlock[],
  plans: ReadonlyMap<number, PlannedCallout>,
  source: PageTemplateSource,
): Map<number, PlannedComposedPage> {
  const out = new Map<number, PlannedComposedPage>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'containerStart' || b.containerName !== 'composedPage' || !b.composedPage) continue;
    let end = i + 1;
    while (end < blocks.length && !(blocks[end]!.type === 'containerEnd' && blocks[end]!.containerId === b.containerId)) end++;
    end = Math.min(end, blocks.length - 1);
    // (A module, #1062, is never laid as a page.)
    const t = resolvePageTemplate(source, b.composedPage.template);
    if (t && !isModuleTemplate(t)) {
      const stories = composedStories(i, end, plans);
      const list = [...stories.values()];
      out.set(i, {
        startIdx: i,
        endIdx: end,
        stories,
        storyAt: (idx) => list.find((s) => idx > s.startIdx && idx < s.plan.endIdx),
      });
    }
    i = end;
  }
  return out;
}

/** The planned composed page whose markers enclose block `idx`. */
export function composedPageAt(pages: ReadonlyMap<number, PlannedComposedPage>, idx: number): PlannedComposedPage | undefined {
  for (const p of pages.values()) if (idx > p.startIdx && idx < p.endIdx) return p;
  return undefined;
}

/** `words` with `{page}` as `page` (#917). */
const withPage = (words: string, page: string): string => words.split('{page}').join(page);

/** Mark the design text of `box` that sets `shown` as a continuation mark
 *  whose `{page}` the build fills in once pages are numbered (#917). */
function tagPageMark(box: VDTBlock, shown: string, text: string, page: 'to' | 'from'): void {
  const want = shown.trim();
  for (const b of box.designOverlay?.blocks ?? []) {
    if (b.kind !== 'text' || !b.artifact || b.pageMark) continue;
    if (b.lines.map((l) => l.text).join(' ').trim() !== want && b.lines.map((l) => l.text).join('').trim() !== want) continue;
    b.pageMark = { text: text.trim(), page };
    return;
  }
}
