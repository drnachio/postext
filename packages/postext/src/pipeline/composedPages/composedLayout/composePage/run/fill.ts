// A run's filling of a placed frame with its story, and the clip, stretch
// and spill that follow it.
import { type Rect, nextFrameOf } from '../../../../../composed/geometry.js';
import { quarterTurnedRect, frameModeTurn, frameBounds } from '../../../../../composed/paint.js';
import type { CalloutLayoutResult } from '../../../../callouts/calloutLayout.js';
import { CUT_START, type FrameBoxOptions, partBreakCut, splitCalloutFragment, fragmentRange, type FrameLayoutPass, type FrameCutRules } from '../../../../callouts/frameLayout.js';
import { continuesOffPage, type ComposedContinuationInput } from '../../../../../composed/continuation.js';
import { type VDTDesignRuleBlock, type VDTFrame, pageIsMirrored, type VDTExclusionContour, type ContentWarning, type VDTBlock, type ReflowEvent } from '../../../../../vdt.js';
import { frameLinePx, frameRuleBlocks } from '../../../../../composed/rules.js';
import type { Dimension, ResolvedCalloutStyleConfig } from '../../../../../types.js';
import { dimensionToPx } from '../../../../../units.js';
import { turnRectAbout, sameRect, commitFrame, heldByFoot } from '../../placedFrames.js';
import { repeatInstance } from '../../../../../composed/templates.js';
import { tagPageMark, withPage } from '../../pagePlan.js';
import { sameCut, MM_PER_IN, type FitState, type Spill } from '../../state.js';
import { frameContour } from '../../../../../composed/contour.js';
import { scaleContourAbout } from '../../../../../contour/index.js';
import type { ResolvedFrame } from '../../../../../composed/types.js';
import type { ComposeState } from '../state.js';
import type { Prep } from './types.js';
import type { RunState } from './state.js';

/** What createFill takes from the pass. */
export interface FillDeps {
  seed: ReadonlyMap<string, Rect> | undefined;
  fit: FitState;
  collapsed: ReadonlySet<string>;
  pass: FrameLayoutPass;
  dpi: number;
  cont: ComposedContinuationInput | undefined;
  cutRules: FrameCutRules;
  frameIdOf: (name: string) => string;
  byName: Map<string, ResolvedFrame>;
  repeated: Set<string>;
  headOf: (name: string) => string;
  textScale: (frame: ResolvedFrame) => number;
  toGuess: string;
  unknownLookOf: (frame: ResolvedFrame) => string | undefined;
  styleOf: (frame: ResolvedFrame) => ResolvedCalloutStyleConfig;
  pictureScale: (frame: ResolvedFrame) => number | undefined;
  ownMode: (frame: ResolvedFrame) => "horizontal-tb" | "vertical-rl" | undefined;
  unmirroredAt: (frame: ResolvedFrame) => number | undefined;
  mirroredIn: (frame: ResolvedFrame) => boolean;
  uprightIn: (frame: ResolvedFrame, across: number) => Pick<FrameBoxOptions, "uprightMaxLength">;
  inMode: <T>(frame: ResolvedFrame, fn: () => T) => T;
  unscale: (rs: FrameBoxOptions["exclusions"], s: number) => FrameBoxOptions["exclusions"];
  state: ComposeState;
  pushRects: Map<string, Rect>;
  pushShapes: Map<string, VDTExclusionContour>;
  notes: ContentWarning[];
  rects: Map<string, Rect>;
  declared: Map<string, Rect>;
  boxShort: Map<string, number>;
  frames: VDTFrame[];
  vdtByName: Map<string, VDTFrame>;
  blocks: VDTBlock[];
  overflowLog: ReflowEvent[];
  fitLog: ReflowEvent[];
  needs: Map<string, () => number>;
  laid: Set<string>;
  spills: Map<string, Spill>;
  wantsOn: Set<string>;
  clipped: Set<string>;
  pushed: { name: string; box: Rect; contour?: VDTExclusionContour }[];
  exclusionsFor: (frame: ResolvedFrame, rect: Rect, open: boolean) => FrameBoxOptions["exclusions"];
  prepare: (frame: ResolvedFrame) => Prep;
  naturalOf: (p: Prep, at?: Rect) => (width: number) => number;
  runState: RunState;
}

export function createFill(deps: FillDeps) {
  const {
    seed, fit, collapsed, pass, dpi, cont, cutRules, frameIdOf, byName, repeated, headOf, textScale,
    toGuess, unknownLookOf, styleOf, pictureScale, ownMode, unmirroredAt, mirroredIn, uprightIn,
    inMode, unscale, state, pushRects, pushShapes, notes, rects, declared, boxShort, frames,
    vdtByName, blocks, overflowLog, fitLog, needs, laid, spills, wantsOn, clipped, pushed,
    exclusionsFor, prepare, naturalOf, runState
  } = deps;
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
          result.frame.designOverlay.blocks.push(...frameRuleBlocks(frame.rules, result.frame.callout.innerRect, linePx, s, dpi, state.input.emPx));
        } else if (!result) {
          const pad = (d: Dimension): number => dimensionToPx(d, dpi, state.input.emPx);
          const p = style.padding;
          const inner = { x: rect.x + pad(p.left), y: rect.y + pad(p.top), width: rect.width - pad(p.left) - pad(p.right), height: rect.height - pad(p.top) - pad(p.bottom) };
          const blocks = frameRuleBlocks(frame.rules, inner, linePx, 1, dpi, state.input.emPx);
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
        commitFrame(result, rect, st.story, range, state.input, vdt, blocks);
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
          ? frameContour(result.children, { gapPx: state.input.pushGapPx, dpi, emPx: state.input.emPx, mirrored: pageIsMirrored(state.input.page), pageIndex: state.input.page.index })
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
      if (runState.clipFoot === undefined || r.y + r.height <= runState.clipFoot + 0.5) return r;
      clipped.add(name);
      const y = Math.min(r.y, runState.clipFoot);
      const out = { ...r, y, height: Math.max(0, Math.min(r.y + r.height, runState.clipFoot) - y) };
      rects.set(name, out);
      return out;
    };
    /** A module's `'auto'` box that ends at the module's foot, in a row
     *  that stretches the module (#1095): to the row's foot, its declared
     *  box by as much (the template asks for it). A frame as wide as its
     *  content (a pill, a tab) keeps its height. */
    const stretchAuto = (name: string, r: Rect): Rect => {
      const s = runState.stretchTo;
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
  return {
    fill, clipAtFoot, stretchAuto, spillWhole
  };
}
