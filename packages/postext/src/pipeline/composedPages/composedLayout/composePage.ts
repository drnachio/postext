// composePage: every frame of the page placed and filled once with the
// ladder's fit, laid again while a box grows with its frames
// (#1276: split out of composedLayout.ts).
import type { ResolvedCalloutStyleConfig, Dimension } from '../../../types.js';
import { pageIsVertical, type VDTExclusionContour, type ContentWarning, type VDTFrame, type VDTBlock, type ReflowEvent, type VDTDesignRuleBlock, pageIsMirrored } from '../../../vdt.js';
import { scaleContourAbout, shiftContour, contourBounds } from '../../../contour/index.js';
import { frameContour } from '../../../composed/contour.js';
import { dimensionToPx } from '../../../units.js';
import { quarterTurnedRect, frameModeTurn, frameBounds } from '../../../composed/paint.js';
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import { type Rect, groupPlaceable, placeBox, unionRect, nextFrameOf, framePlaceable } from '../../../composed/geometry.js';
import { type GroupItem, layoutGroup, composedOrder } from '../../../composed/groups.js';
import { reflowEvents } from '../../../composed/reflowLog.js';
import { anchorTarget, repeatInstance } from '../../../composed/templates.js';
import { continuesOffPage } from '../../../composed/continuation.js';
import type { ResolvedPageTemplate, ResolvedFrame, FrameLookEntry, ResolvedFrameGroup, ResolvedModule } from '../../../composed/types.js';
import { frameElementId } from '../../../composed/ids.js';
import { nestedChain } from '../../../composed/modules.js';
import { frameLinePx, frameRuleBlocks } from '../../../composed/rules.js';
import { growMembers, grownHeight } from '../../../composed/grow.js';
import type { BoxExclusion, CalloutLayoutResult } from '../../callouts/calloutLayout.js';
import { frameCutRules, type FrameBoxOptions, makeCalloutLayouter, CUT_START, type CalloutCut, partBreakCut, splitCalloutFragment, fragmentRange } from '../../callouts/frameLayout.js';
import { keepChromeAt, withNamedLook } from './frameStyles.js';
import { lengthPx, withPage, tagPageMark } from './pagePlan.js';
import { sameRect, turnRectAbout, commitFrame, heldByFoot, mergeLog, motionsOf } from './placedFrames.js';
import { type ComposedPageInput, type FitState, type Composition, MM_PER_IN, chainPrev, type StoryState, type Spill, sameCut } from './state.js';

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
export function composePage(pageInput: ComposedPageInput, template: ResolvedPageTemplate, fit: FitState, collapsed: ReadonlySet<string>): Composition {
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
