// The run of composing a page: every frame placed and filled once.
import { type Rect, groupPlaceable, placeBox, unionRect } from '../../../../composed/geometry.js';
import { type VDTExclusionContour, type ContentWarning, type VDTFrame, type VDTBlock, type ReflowEvent } from '../../../../vdt.js';
import { type StoryState, type Spill, MM_PER_IN, type ComposedPageInput, type FitState } from '../state.js';
import type { ResolvedFrame, ResolvedPageTemplate } from '../../../../composed/types.js';
import { makeCalloutLayouter, CUT_START, type FrameBoxOptions, type FrameLayoutPass, type FrameCutRules } from '../../../callouts/frameLayout.js';
import { type ComposedContinuationInput } from '../../../../composed/continuation.js';
import { mergeLog, motionsOf } from '../placedFrames.js';
import { composedOrder } from '../../../../composed/groups.js';
import type { ResolvedCalloutStyleConfig } from '../../../../types.js';
import { reflowEvents } from '../../../../composed/reflowLog.js';
import type { ComposeState } from './state.js';
import { createMeasure } from './run/measure.js';
import { createPlaceGroup } from './run/placeGroup.js';
import { createPlaceGrid } from './run/placeGrid.js';
import { createFill } from './run/fill.js';
import { createPlaceModules } from './run/placeModules.js';
import type { RunState } from './run/state.js';

/** What createRun takes from the pass. */
export interface RunDeps {
  pageInput: ComposedPageInput;
  template: ResolvedPageTemplate;
  fit: FitState;
  collapsed: ReadonlySet<string>;
  pass: FrameLayoutPass;
  dpi: number;
  cont: ComposedContinuationInput | undefined;
  cutRules: FrameCutRules;
  frameIdOf: (name: string) => string;
  byName: Map<string, ResolvedFrame>;
  repeated: Set<string>;
  prev: Map<string, string>;
  headOf: (name: string) => string;
  textScale: (frame: ResolvedFrame) => number;
  toGuess: string;
  unknownLookOf: (frame: ResolvedFrame) => string | undefined;
  styleOf: (frame: ResolvedFrame) => ResolvedCalloutStyleConfig;
  fromMarkOf: (frame: ResolvedFrame) => string | undefined;
  pictureScale: (frame: ResolvedFrame) => number | undefined;
  ownMode: (frame: ResolvedFrame) => "horizontal-tb" | "vertical-rl" | undefined;
  unmirroredAt: (frame: ResolvedFrame) => number | undefined;
  mirroredIn: (frame: ResolvedFrame) => boolean;
  uprightIn: (frame: ResolvedFrame, across: number) => Pick<FrameBoxOptions, "uprightMaxLength">;
  inMode: <T>(frame: ResolvedFrame, fn: () => T) => T;
  unscale: (rs: FrameBoxOptions["exclusions"], s: number) => FrameBoxOptions["exclusions"];
  state: ComposeState;
}

export function createRun(deps: RunDeps) {
  const {
    pageInput, template, fit, collapsed, pass, dpi, cont, cutRules, frameIdOf, byName, repeated,
    prev, headOf, textScale, toGuess, unknownLookOf, styleOf, fromMarkOf, pictureScale, ownMode,
    unmirroredAt, mirroredIn, uprightIn, inMode, unscale, state
  } = deps;
  /** Place and fill every frame. `seed`: the boxes of the frames that push
   *  text, from a first run, so a frame placed before one that pushes it
   *  (the photo anchored to its box) still runs round it. */
  const run = (seed?: ReadonlyMap<string, Rect>, seedShapes?: ReadonlyMap<string, VDTExclusionContour>) => {
    const runState = {} as RunState;
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
      const story = state.input.stories.get(head);
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
      if (own) return placeBox(own, template, state.input, refs, () => 0);
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
    runState.clipFoot = undefined;
    /** A module a stretching row lays taller than it is (#1095): its
     *  frames, its own foot (`at`) and the row's. */
    runState.stretchTo = undefined;
    const pushed: { name: string; box: Rect; contour?: VDTExclusionContour }[] = seed
      ? [...seed].map(([name, box]) => ({ name, box, ...(seedShapes?.get(name) ? { contour: seedShapes.get(name)! } : {}) }))
      : [];

    const {
      exclusionsFor, prepare, naturalOf, naturalWidthOf, placeFitted, declaredNatural
    } = createMeasure({
      template, pass, cont, frameIdOf, byName, prev, headOf, textScale, styleOf, fromMarkOf,
      pictureScale, ownMode, mirroredIn, uprightIn, inMode, unscale, state, stateOf, atEnd, vdtByName,
      fitted, pushed
    });

    const {
      placeFrame, placeGroup
    } = createPlaceGroup({
      template, fit, dpi, state, rects, declared, groupRects, groupDeclared, refOf, declaredRefOf,
      pinned, boxShort, exclusionsFor, prepare, naturalOf, naturalWidthOf, placeFitted,
      declaredNatural
    });

    const {
      placeGrid
    } = createPlaceGrid({
      template, fit, dpi, state, rects, declared, groupRects, groupDeclared, refOf, prepare, naturalOf,
      naturalWidthOf, placeFitted
    });

    const {
      fill, clipAtFoot, stretchAuto, spillWhole
    } = createFill({
      seed, fit, collapsed, pass, dpi, cont, cutRules, frameIdOf, byName, repeated, headOf, textScale,
      toGuess, unknownLookOf, styleOf, pictureScale, ownMode, unmirroredAt, mirroredIn, uprightIn,
      inMode, unscale, state, pushRects, pushShapes, notes, rects, declared, boxShort, frames,
      vdtByName, blocks, overflowLog, fitLog, needs, laid, spills, wantsOn, clipped, pushed,
      exclusionsFor, prepare, naturalOf, runState
    });
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

    const {
      placeModules
    } = createPlaceModules({
      pageInput, template, fit, dpi, frameIdOf, state, rects, declared, groupRects, groupDeclared,
      refOf, pinned, boxShort, fitted, moduleRects, spillWhole, runStep, runState
    });

    for (const step of composedOrder(template)) runStep(step, true);

    const log = mergeLog(reflowEvents(motionsOf(template, rects, declared), dpi / MM_PER_IN), [...fitLog, ...overflowLog], template);
    return { frames, blocks, log, laid, needs, pushRects, pushShapes, fitted, notes, spills, wantsOn, clipped, groupRects, moduleRects };
  };
  return {
    run
  };
}
