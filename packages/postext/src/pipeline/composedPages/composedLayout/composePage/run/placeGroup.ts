// A run's placing of one frame and of a stacked group of frames.
import { type Rect, framePlaceable, groupPlaceable, placeBox, unionRect } from '../../../../../composed/geometry.js';
import type { ResolvedFrameGroup, ResolvedFrame, ResolvedPageTemplate } from '../../../../../composed/types.js';
import { MM_PER_IN, type FitState } from '../../state.js';
import { type GroupItem, layoutGroup } from '../../../../../composed/groups.js';
import { dimensionToPx } from '../../../../../units.js';
import type { ComposeState } from '../state.js';
import type { FrameBoxOptions } from '../../../../callouts/frameLayout.js';
import type { Prep } from './types.js';

/** What createPlaceGroup takes from the pass. */
export interface PlaceGroupDeps {
  template: ResolvedPageTemplate;
  fit: FitState;
  dpi: number;
  state: ComposeState;
  rects: Map<string, Rect>;
  declared: Map<string, Rect>;
  groupRects: Map<string, Rect>;
  groupDeclared: Map<string, Rect>;
  refOf: (name: string) => Rect | undefined;
  declaredRefOf: (name: string) => Rect | undefined;
  pinned: { name: string; rect: Rect }[];
  boxShort: Map<string, number>;
  exclusionsFor: (frame: ResolvedFrame, rect: Rect, open: boolean) => FrameBoxOptions["exclusions"];
  prepare: (frame: ResolvedFrame) => Prep;
  naturalOf: (p: Prep, at?: Rect) => (width: number) => number;
  naturalWidthOf: (p: Prep) => ((room: number) => number) | undefined;
  placeFitted: (frame: ResolvedFrame, placeable: ReturnType<typeof framePlaceable>, ctx: Parameters<typeof placeBox>[2], refs: (n: string) => Rect | undefined, nat: (width: number) => number, natW?: (room: number) => number) => Rect;
  declaredNatural: (frame: ResolvedFrame, natural: (w: number) => number) => (width: number) => number;
}

export function createPlaceGroup(deps: PlaceGroupDeps) {
  const {
    template, fit, dpi, state, rects, declared, groupRects, groupDeclared, refOf, declaredRefOf,
    pinned, boxShort, exclusionsFor, prepare, naturalOf, naturalWidthOf, placeFitted,
    declaredNatural
  } = deps;
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
        const r0 = placeFitted(frame, placeable, state.input, refs, natural, natW);
        if (!p.holds || !exclusionsFor(frame, r0, true)) return { rect: r0, natural };
        const round = naturalOf(p, r0);
        return { rect: placeFitted(frame, placeable, state.input, refs, round, natW), natural: round };
      };
      const decl = frame.pin ? at(declaredRefOf) : undefined;
      const fin = decl ?? at(refOf);
      const declRect = placeFitted(frame, placeable, state.input, declaredRefOf, declaredNatural(frame, fin.natural), natW);
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
        const ownBox = own ? placeBox(own, template, state.input, refs, () => 0) : undefined;
        const ownRects = new Map<string, Rect>();
        const memberRefs = (n: string): Rect | undefined => ownRects.get(n) ?? (n === group.name ? ownBox : refs(n));
        const items: GroupItem[] = members.map((f, k) => {
          // A frame placed nowhere stands in its group's box.
          const ctx = ownBox && !f.placement && !f.grid ? { ...state.input, areas: { ...state.input.areas, area: ownBox } } : state.input;
          const natural = naturals[k]!;
          const placeable = framePlaceable(f);
          // On a spread the member's own box keeps off the spine band, and
          // the negotiation starts from it (#861).
          const box = placeFitted(f, placeable, ctx, memberRefs, declaredNatural(f, natural), natWs[k]);
          ownRects.set(f.name, box);
          const auto = f.height === 'auto' && !(f.grid && !placeable.heightSet);
          const fill = f.height === 'fill';
          const minH = f.minHeight ? dimensionToPx(f.minHeight, dpi, state.input.emPx) : 0;
          const want = fill ? minH : auto ? (mode === 'final' ? natural(box.width) : declaredNatural(f, natural)(box.width)) : box.height;
          const max = f.maxHeight ? dimensionToPx(f.maxHeight, dpi, state.input.emPx) : Infinity;
          const item: GroupItem = {
            name: f.name,
            own: box,
            want,
            min: minH,
            max,
            minWidth: f.minWidth ? dimensionToPx(f.minWidth, dpi, state.input.emPx) : 0,
            maxWidth: f.maxWidth ? dimensionToPx(f.maxWidth, dpi, state.input.emPx) : Infinity,
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
        const start = firstFree?.own ?? state.input.areas.area;
        const box = ownBox ?? { x: start.x, y: start.y, width: 0, height: 0 };
        const out = layoutGroup({
          kind: group.kind === 'row' ? 'row' : 'stack',
          box,
          elastic: !ownBox,
          limit: state.input.areas.area,
          gap: dimensionToPx(group.gap, dpi, state.input.emPx),
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
  return {
    placeFrame, placeGroup
  };
}
