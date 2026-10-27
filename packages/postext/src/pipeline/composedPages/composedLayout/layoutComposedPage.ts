// layoutComposedPage: the page composed and its reflow ladder climbed frame
// by frame until its content fits, alternatives and proposals included
// (#1276: split out of composedLayout.ts).
import { type VDTFrame, type FrameFitStep, type ContentWarning, pageIsMirrored, pageIsVertical, type VDTComposedPage } from '../../../vdt.js';
import { dimensionToPx } from '../../../units.js';
import { groupOfFrames } from '../../../composed/groups.js';
import { anchorTarget, resolveContinueIn } from '../../../composed/templates.js';
import { continuationTemplate, continuesOffPage, collapsedOnAddedPage, continuesCollapsed, trailingFrames, collapseFrames, type ComposedContinuation } from '../../../composed/continuation.js';
import type { ResolvedPageTemplate, ResolvedFrame } from '../../../composed/types.js';
import { expandRepeats, repeatItemsOf, instanceOf } from '../../../composed/repeat.js';
import { moduleOfFrame, moduleFenceAttrs } from '../../../composed/modules.js';
import { overlapChecks } from '../../../composed/overlap.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import { layoutMemoSwitch, createLayoutMemo } from '../layoutMemo.js';
import { createMeasureMemo } from '../measureMemo.js';
import { composePage } from './composePage.js';
import { overflowProposals } from './overflowProposals.js';
import { mergeLog } from './placedFrames.js';
import { type ComposedPageInput, type ComposedPageLayout, MM_PER_IN, chainPrev, type Composition, type FitState, patchTemplate, fixedHeight, NO_FIT, COMPOSE_BUDGET, scaleSteps } from './state.js';
import { fitsWithTemplate } from './trialPasses.js';

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
