// A composed page's input and result, the story and fit state the reflow
// ladder carries, its steps and budgets, and small template helpers
// (#1276: split out of composedLayout.ts).
import type { ComposedPageFence } from '../../../parse/types.js';
import type { ResolvedCalloutStyleConfig, Dimension } from '../../../types.js';
import type { VDTPage, VDTComposedPage, VDTBlock, ContentWarning, VDTFrame, ReflowEvent } from '../../../vdt.js';
import { type FrameAreas, type Rect, nextFrameOf } from '../../../composed/geometry.js';
import type { ComposedContinuationInput, ComposedContinuation } from '../../../composed/continuation.js';
import type { ResolvedPageTemplate, ResolvedFrame } from '../../../composed/types.js';
import type { PlannedCallout, BoxExclusion } from '../../callouts/calloutLayout.js';
import type { FrameLayoutPass, CalloutLayouter, CalloutCut } from '../../callouts/frameLayout.js';

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

export const MM_PER_IN = 25.4;

/** Where each story stands while its frames are filled. */
export interface StoryState {
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
export interface FitState {
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

export const NO_FIT: FitState = { patches: new Map(), text: new Map(), pictures: new Map(), yieldAll: new Set(), goOn: new Set(), gridsOn: new Set() };

/** Where a frame that goes on to another page left its story (#859). */
export interface Spill {
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
export interface Composition {
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
export const PROPOSAL_MIN_SCALE = 0.5;
/** Most compositions of one page the ladder and its proposals may run. */
export const COMPOSE_BUDGET = 96;

/** The scales from just under 1 (or under `from`) down to `min`, in
 *  {@link FIT_STEP} steps, `min` last. */
export function scaleSteps(min: number, from = 1): number[] {
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
export function patchTemplate(template: ResolvedPageTemplate, patches: ReadonlyMap<string, Partial<ResolvedFrame>>): ResolvedPageTemplate {
  if (patches.size === 0) return template;
  return { ...template, frames: template.frames.map((f) => (patches.has(f.name) ? { ...f, ...patches.get(f.name)! } : f)) };
}

/** A fixed height (a length, not a percentage). */
export const fixedHeight = (f: ResolvedFrame): Dimension | undefined => {
  const h = f.height as unknown;
  return h !== null && typeof h === 'object' && 'value' in (h as object) && 'unit' in (h as object) ? (f.height as Dimension) : undefined;
};

/** The frame before each frame of a chain on the page. On a page added by
 *  continuation (#859) a frame that receives content starts its chain. */
export function chainPrev(template: ResolvedPageTemplate, receivers: ReadonlyMap<string, unknown> | undefined): Map<string, string> {
  const names = new Set(template.frames.map((f) => f.name));
  const prev = new Map<string, string>();
  for (const f of template.frames) {
    const n = nextFrameOf(f);
    if (n && names.has(n) && !prev.has(n) && !receivers?.has(n)) prev.set(n, f.name);
  }
  return prev;
}

export const sameCut = (a: CalloutCut, b: CalloutCut): boolean =>
  a.child === b.child && a.line === b.line && JSON.stringify(a.group ?? null) === JSON.stringify(b.group ?? null);
