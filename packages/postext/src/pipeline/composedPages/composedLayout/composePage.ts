// composePage: every frame of the page placed and filled once with the
// ladder's fit, laid again while a box grows with its frames
// (#1276: split out of composedLayout.ts).
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import { pageIsVertical } from '../../../vdt.js';
import { scaleContourAbout } from '../../../contour/index.js';
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import type { ResolvedPageTemplate, ResolvedFrame, FrameLookEntry } from '../../../composed/types.js';
import { frameElementId } from '../../../composed/ids.js';
import { growMembers, grownHeight } from '../../../composed/grow.js';
import { frameCutRules, type FrameBoxOptions } from '../../callouts/frameLayout.js';
import { keepChromeAt, withNamedLook } from './frameStyles.js';
import { lengthPx, withPage } from './pagePlan.js';
import { type ComposedPageInput, type FitState, type Composition, MM_PER_IN, chainPrev } from './state.js';
import { createRun } from './composePage/run.js';
import type { ComposeState } from './composePage/state.js';

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
  const state = {} as ComposeState;
  /** What the frames are placed in: the page, or, while a module's frames
   *  are placed (#1062), the page with the module's box as its area. */
  state.input = pageInput;
  const { pass, fence, dpi } = state.input;
  const fi = fence.fenceIndex;
  const cont = state.input.continuing;
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
  const toGuess = String(state.input.page.index + 2);
  const fromGuess = String(Math.max(1, state.input.page.index));
  /** The named look (#1089) the `:::frame` fence of a frame's story names
   *  (`look="<id>"`), when `frameLooks` has it: the story's, so every
   *  frame of a chain and the frames it goes on in on later pages wear it. */
  const frameLooks = pass.resolved.frameLooks;
  const namedLookOf = (frame: ResolvedFrame): FrameLookEntry | undefined => {
    if (!frameLooks) return undefined;
    const id = state.input.stories.get(headOf(frame.name))?.plan.attrs.look?.trim();
    return id ? frameLooks.find((l) => l.id === id) : undefined;
  };
  /** The look a frame's story names that `frameLooks` does not have
   *  (#1095): the canvas marks the frame. */
  const unknownLookOf = (frame: ResolvedFrame): string | undefined => {
    const id = state.input.stories.get(headOf(frame.name))?.plan.attrs.look?.trim();
    return id && !frameLooks?.some((l) => l.id === id) ? id : undefined;
  };
  /** The style a frame is laid out in: its box as drawn at any text scale. */
  const styleOf = (frame: ResolvedFrame): ResolvedCalloutStyleConfig => {
    const style = keepChromeAt(state.input.styleOf(withNamedLook(frame, namedLookOf(frame))), textScale(frame));
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
  const pageMode = pageIsVertical(state.input.page) ? 'vertical-rl' : 'horizontal-tb';
  const ownMode = (frame: ResolvedFrame): 'horizontal-tb' | 'vertical-rl' | undefined =>
    frame.writingMode !== undefined && frame.writingMode !== pageMode ? frame.writingMode : undefined;
  /** A vertical frame of a right-to-left page (#960): the page's flow is
   *  painted mirrored, which would set its lines from left to right, so the
   *  frame is laid out as on a left-to-right page and painted unmirrored
   *  (`VDTFrame.unmirrorX`). The mirror's origin, else undefined. */
  const unmirroredAt = (frame: ResolvedFrame): number | undefined => {
    const flow = state.input.page.flow;
    return ownMode(frame) && flow?.writingMode === 'horizontal-tb' ? flow.mirror.originX : undefined;
  };
  /** Whether a frame's lines are set as on a mirrored page: those of the
   *  page's own mode, not an unmirrored frame's. */
  const mirroredIn = (frame: ResolvedFrame): boolean => state.input.mirrored && unmirroredAt(frame) === undefined;
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
    const room = across - lengthPx(pad.top, dpi, state.input.emPx) - lengthPx(pad.bottom, dpi, state.input.emPx);
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

  const {
    run
  } = createRun({
    pageInput, template, fit, collapsed, pass, dpi, cont, cutRules, frameIdOf, byName, repeated,
    prev, headOf, textScale, toGuess, unknownLookOf, styleOf, fromMarkOf, pictureScale, ownMode,
    unmirroredAt, mirroredIn, uprightIn, inMode, unscale, state
  });
  const first = run();
  const { frames, blocks, log, laid, needs, fitted, notes, spills, wantsOn, clipped, groupRects, moduleRects } = first.pushRects.size > 0 ? run(first.pushRects, first.pushShapes) : first;
  return { frames, blocks, log, laid, needs, template, fitted, spills, wantsOn, clipped, groupRects, moduleRects, ...(notes.length > 0 ? { notes } : {}) };
}
