// A run's frame preparation and natural sizes: exclusions, what a frame
// holds and how tall or wide it would be laid alone.
import type { ResolvedFrame, ResolvedPageTemplate } from '../../../../../composed/types.js';
import { type Rect, nextFrameOf, framePlaceable, placeBox } from '../../../../../composed/geometry.js';
import { type FrameBoxOptions, makeCalloutLayouter, type CalloutCut, partBreakCut, type FrameLayoutPass } from '../../../../callouts/frameLayout.js';
import type { BoxExclusion } from '../../../../callouts/calloutLayout.js';
import { shiftContour, contourBounds } from '../../../../../contour/index.js';
import { continuesOffPage, type ComposedContinuationInput } from '../../../../../composed/continuation.js';
import { sameRect } from '../../placedFrames.js';
import type { ResolvedCalloutStyleConfig } from '../../../../../types.js';
import type { ComposeState } from '../state.js';
import type { StoryState } from '../../state.js';
import type { VDTFrame, VDTExclusionContour } from '../../../../../vdt.js';
import type { Prep } from './types.js';

/** What createMeasure takes from the pass. */
export interface MeasureDeps {
  template: ResolvedPageTemplate;
  pass: FrameLayoutPass;
  cont: ComposedContinuationInput | undefined;
  frameIdOf: (name: string) => string;
  byName: Map<string, ResolvedFrame>;
  prev: Map<string, string>;
  headOf: (name: string) => string;
  textScale: (frame: ResolvedFrame) => number;
  styleOf: (frame: ResolvedFrame) => ResolvedCalloutStyleConfig;
  fromMarkOf: (frame: ResolvedFrame) => string | undefined;
  pictureScale: (frame: ResolvedFrame) => number | undefined;
  ownMode: (frame: ResolvedFrame) => "horizontal-tb" | "vertical-rl" | undefined;
  mirroredIn: (frame: ResolvedFrame) => boolean;
  uprightIn: (frame: ResolvedFrame, across: number) => Pick<FrameBoxOptions, "uprightMaxLength">;
  inMode: <T>(frame: ResolvedFrame, fn: () => T) => T;
  unscale: (rs: FrameBoxOptions["exclusions"], s: number) => FrameBoxOptions["exclusions"];
  state: ComposeState;
  stateOf: (frame: ResolvedFrame) => StoryState | undefined;
  atEnd: (st: StoryState) => boolean;
  vdtByName: Map<string, VDTFrame>;
  fitted: Map<string, { placed: Rect; kept: Rect; }>;
  pushed: { name: string; box: Rect; contour?: VDTExclusionContour }[];
}

export function createMeasure(deps: MeasureDeps) {
  const {
    template, pass, cont, frameIdOf, byName, prev, headOf, textScale, styleOf, fromMarkOf,
    pictureScale, ownMode, mirroredIn, uprightIn, inMode, unscale, state, stateOf, atEnd, vdtByName,
    fitted, pushed
  } = deps;
    /** The rectangles of the pushing frames placed so far that `rect`
     *  meets, in the frame block's coordinates. */
    const exclusionsFor = (frame: ResolvedFrame, rect: Rect, open: boolean): FrameBoxOptions['exclusions'] => {
      const out: BoxExclusion[] = [];
      // The frame's own shapes (a comic panel's slanted edges, #909).
      for (const ex of state.input.frameExclusions?.get(frame.name) ?? []) {
        out.push({ x: ex.x - rect.x, y: ex.y - rect.y, width: ex.width, height: ex.height, ...(ex.contour ? { contour: shiftContour(ex.contour, -rect.x, -rect.y) } : {}) });
      }
      const g = state.input.pushGapPx;
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
        const opts: FrameBoxOptions = { ...(exclusions ? { exclusions } : {}), ...(pic !== undefined ? { pictureScale: pic } : {}), ...(p.fromMark !== undefined ? { continuedMark: p.fromMark } : {}), ...uprightIn(p.frame, state.input.areas.area.height / s) };
        const r = p.st!.L.peekRange(p.st!.cut, naturalEnd(p), width / s, p.blockId, p.continuation, state.input.mirrored, Object.keys(opts).length > 0 ? opts : undefined);
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
        const r = L.layoutRange(p.st!.cut, L.end, (room * 8) / s, p.blockId, p.continuation, state.input.mirrored);
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
      const most = Math.max(state.input.areas.area.height, state.input.emPx);
      let h = most;
      if (across(most) <= width + 0.5) {
        let lo = Math.min(state.input.emPx, most);
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
      if (!state.input.fitBox) return r;
      const keep = (placed: Rect): Rect => {
        const kept = state.input.fitBox!(frame, placed);
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
  return {
    exclusionsFor, prepare, naturalOf, naturalWidthOf, placeFitted, declaredNatural
  };
}
