/**
 * The overlap checks of a composed page (#1053, DESIGN §12.10): what the
 * reflow ladder never sees, because no frame's content is short of its box.
 *
 * - `frameCovered`: ink of a frame (its lines, its tab and title, its
 *   pictures) under a frame painted after it (a higher `layer`, or the same
 *   layer later in template order, as `composedPaintOrder` paints them)
 *   where that frame is opaque: its fill (the boxes of its overlay with a
 *   background: the style's or `look`'s fill, a label tab, a stripe), its
 *   pictures and its text. A frame with no fill covers nothing between its
 *   pictures and lines; words cover words, not pictures (a line over a
 *   picture hides a hairline of it).
 * - `frameOutsideArea`: ink of a frame past what holds it: its text past
 *   the trim (cut there), its fill or pictures past the bleed (a fill may
 *   bleed on purpose), or any of it past the frame or group it is anchored
 *   inside (a nine-point anchor on `'#name'` whose point lies in that box).
 *
 * Pure: it reads the laid frames and their blocks, so it runs on the
 * composition the ladder settled on, before a spread is cut at its spine
 * (the facing copies do not exist yet). Every box is put on the sheet by
 * its frame's matrix (scale, turn) and compared as the box holding it.
 */
import type { VDTFrame, VDTBlock, ContentWarning, ReflowEvent, FrameCoverProposal } from '../vdt.js';
import type { Rect, FrameAreas } from './geometry.js';
import { frameMatrix, frameClips, frameContentRect } from './paint.js';
import { anchorTarget } from './templates.js';
import type { ResolvedPageTemplate } from './types.js';
import { MM_PER_IN, type PictureShapes, type Ink, intersect, mapRect, frameInk, MIN_DEPTH_MM, unionArea, r1, MIN_AREA_MM2, MIN_EXCESS_MM } from './overlap/ink.js';
import { type FrameInk, type CoverPair, inkCuts, pairKey, hostRect, overrun, insideHost, type MoveTest, clearingMove, outsideWarning } from './overlap/moves.js';

export interface OverlapCheckInput {
  /** The template laid (with the ladder's patches). */
  template: ResolvedPageTemplate;
  /** The page's frames as laid, any order. */
  frames: readonly VDTFrame[];
  /** The page's frame blocks (each frame's box first). */
  blocks: readonly VDTBlock[];
  /** Groups' final boxes, by name. */
  groupRects: ReadonlyMap<string, Rect>;
  areas: FrameAreas;
  dpi: number;
  emPx: number;
  fenceIndex: number;
  pageIndex: number;
  locale?: string;
  /** The page lays its flow out right to left (`pageIsMirrored`): a
   *  picture's shape turns in the frames' coordinates. */
  mirrored?: boolean;
  /** The page's flow is vertical: pictures cover with their boxes. */
  verticalFlow?: boolean;
}

export interface OverlapCheckResult {
  warnings: ContentWarning[];
  /** `covered` and `outside` events of the reflow log. */
  events: ReflowEvent[];
}

/**
 * The overlap warnings of one composed page (or the sheet of a spread),
 * and the reflow log's events for them.
 */
export function overlapChecks(input: OverlapCheckInput): OverlapCheckResult {
  const { template, dpi } = input;
  const mmPx = dpi / MM_PER_IN;
  const resolved = new Map(template.frames.map((f) => [f.name, f]));
  const order = new Map(template.frames.map((f, i) => [f.name, i]));
  const byId = new Map(input.blocks.map((b) => [b.id, b]));
  const shapes: PictureShapes = input.verticalFlow ? false : { mirrored: input.mirrored === true };
  const live = input.frames.filter((f) => !f.collapsed && !f.facingBlocks && resolved.has(f.name));
  /** Each frame's ink on the sheet, covered side and covering side, clipped
   *  to its box when its content overflows (painted clipped). */
  const inkOf = new Map<string, { all: Ink[]; covers: Ink[] }>();
  for (const f of live) {
    const blocks = f.blockIds.map((id) => byId.get(id)).filter((b): b is VDTBlock => b !== undefined);
    const m = frameMatrix(f);
    const clip = frameClips(f) ? frameContentRect(f) : undefined;
    const place = (list: Ink[]): Ink[] => list.flatMap((ink) => {
      const cut = clip ? intersect(ink.box, clip) : ink.box;
      if (!cut) return [];
      const shape = ink.shape?.flatMap((r) => {
        const piece = clip ? intersect(r, clip) : r;
        return piece ? [mapRect(piece, m)] : [];
      });
      return [{ ...ink, box: mapRect(cut, m), ...(shape ? { shape } : {}) }];
    });
    const rules: Ink[] = (f.rules ?? []).map((r) => ({ box: { ...r.bbox }, kind: 'fill' as const }));
    inkOf.set(f.name, { all: [...place(frameInk(blocks, false)), ...rules], covers: place(frameInk(blocks, true, shapes)) });
  }
  const warnings: ContentWarning[] = [];
  const events: ReflowEvent[] = [];
  const base = (f: VDTFrame): { template: string; frame: string; fenceIndex: number; configPath: string } => ({
    template: template.id,
    frame: f.name,
    fenceIndex: input.fenceIndex,
    configPath: f.configPath,
  });
  const where = (f: VDTFrame): { sourceStart?: number; sourceEnd?: number; pageIndex: number } => ({
    ...(f.sourceStart !== undefined ? { sourceStart: f.sourceStart, sourceEnd: f.sourceEnd } : {}),
    pageIndex: input.pageIndex,
  });
  const locale = input.locale ? { locale: input.locale } : {};
  const depth = MIN_DEPTH_MM * mmPx;

  // frameCovered: each frame against every frame painted after it.
  const paintRank = (f: VDTFrame): [number, number] => [f.layer, order.get(f.name) ?? 0];
  const later = (a: VDTFrame, b: VDTFrame): boolean => {
    const [la, oa] = paintRank(a);
    const [lb, ob] = paintRank(b);
    return lb > la || (lb === la && ob > oa);
  };
  /** What `over` covers of `under`, by the check's rules: the covered
   *  frame's ink that is not fill against the covering frame's opaque ink
   *  (its pictures left out when they push with a contour), each read
   *  through `ink` (the frames where they lie). `skipLines` leaves out the
   *  covered frame's body lines (they run round a pushing frame). */
  const pairInk = (under: VDTFrame, over: VDTFrame, ink: (name: string) => FrameInk, skipLines = false): { covered: Ink[]; covers: Ink[] } | undefined => {
    if (over === under || !later(under, over)) return undefined;
    const ru = resolved.get(under.name)!;
    const ro = resolved.get(over.name)!;
    if (ru.overlap === 'allow' || ro.overlap === 'allow') return undefined;
    const covered = ink(under.name).all.filter((i) => i.kind !== 'fill' && !(skipLines && i.flow === 'line'));
    // Text set round a frame's pictures (`wrap: 'contour'`) comes into
    // their box by design: the contour, not the box, keeps it clear.
    const contourWrap = ro.exclude === 'push' && ro.wrap === 'contour';
    const covers = ink(over.name).covers.filter((c) => !(contourWrap && c.kind === 'picture'));
    return covered.length > 0 && covers.length > 0 ? { covered, covers } : undefined;
  };
  const here = (name: string): FrameInk => inkOf.get(name)!;
  const found: CoverPair[] = [];
  for (const under of live) {
    for (const over of live) {
      const pi = pairInk(under, over, here);
      if (!pi) continue;
      let area = 0;
      let words: string | undefined;
      let picture: string | undefined;
      let hitLine = false;
      const hitBoxes: Rect[] = [];
      const hitCovers: Rect[] = [];
      for (const ink of pi.covered) {
        const cuts = inkCuts(ink, pi.covers, depth);
        if (cuts.length === 0) continue;
        area += unionArea(cuts.map((x) => x.cut));
        hitBoxes.push(ink.box);
        for (const x of cuts) hitCovers.push(x.c.box);
        if (ink.kind === 'text') {
          if (ink.flow === 'line') hitLine = true;
          if (ink.text !== undefined) words = words === undefined ? ink.text : words.length < 40 ? `${words} ${ink.text}` : words;
        } else if (picture === undefined && ink.resourceId) picture = ink.resourceId;
      }
      if (r1(area / (mmPx * mmPx)) < MIN_AREA_MM2) continue;
      found.push({ under, over, area, words, picture, hitLine, hitBoxes, hitCovers });
    }
  }

  // A move is proposed only where it lands clear (#1075).
  const warned = new Set(found.map((x) => pairKey(x.under.name, x.over.name)));
  const minArea = MIN_AREA_MM2 * mmPx * mmPx;
  const byName = new Map(live.map((f) => [f.name, f]));
  /** The frames that move with `name`: it, and those anchored to it. */
  const movers = (name: string): Set<string> => {
    const set = new Set([name]);
    for (let grew = true; grew;) {
      grew = false;
      for (const f of live) {
        const rf = resolved.get(f.name)!;
        const to = rf.grid ? undefined : anchorTarget(rf.placement);
        if (to !== undefined && set.has(to) && !set.has(f.name)) {
          set.add(f.name);
          grew = true;
        }
      }
    }
    return set;
  };
  const hostHere = (name: string): Rect | undefined => {
    const h = byName.get(name);
    return h ? hostRect(h) : input.groupRects.get(name);
  };
  /** How far a frame's ink runs past the page (text past the trim, the
   *  rest past the bleed) or past the box it is anchored inside, px. */
  const pastArea = (f: VDTFrame, ink: readonly Ink[], hostOf: (name: string) => Rect | undefined): number => {
    const text = ink.filter((i) => i.kind === 'text').map((i) => i.box);
    const rest = ink.filter((i) => i.kind !== 'text').map((i) => i.box);
    let max = Math.max(text.length ? overrun(text, input.areas.page).max : 0, rest.length ? overrun(rest, input.areas.bleed).max : 0);
    const host = insideHost(resolved.get(f.name)!, input, hostOf, (n) => resolved.get(n)?.overlap === 'allow');
    if (host && ink.length) max = Math.max(max, overrun(ink.map((i) => i.box), host.box).max);
    return max;
  };
  /**
   * The page with the frames of `moved` shifted by (dx, dy) px, read by the
   * check's own rules: whether the pair `target` (`under<over`) is clear,
   * whether each moved frame stays inside what holds it (no further past
   * it than it was), and the pieces of ink of pairs no warning names that
   * would come to cover each other (`m` the moved frame's piece where it
   * lies now, `b` the other frame's).
   */
  const tryMove: MoveTest = (moved, dx, dy, target) => {
    const move = (r: Rect): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
    const shift = (list: Ink[]): Ink[] => list.map((i) => ({ ...i, box: move(i.box), ...(i.shape ? { shape: i.shape.map(move) } : {}) }));
    const shifted = new Map<string, FrameInk>();
    for (const name of moved) {
      const ink = inkOf.get(name);
      if (ink) shifted.set(name, { all: shift(ink.all), covers: shift(ink.covers) });
    }
    const at = (name: string): FrameInk => shifted.get(name) ?? inkOf.get(name)!;
    const hostAt = (name: string): Rect | undefined => {
      const r = hostHere(name);
      return r && moved.has(name) ? { ...r, x: r.x + dx, y: r.y + dy } : r;
    };
    for (const name of moved) {
      const f = byName.get(name);
      if (!f || resolved.get(name)!.overlap === 'allow') continue;
      const after = pastArea(f, at(name).all, hostAt);
      if (after >= MIN_EXCESS_MM * mmPx && after > pastArea(f, inkOf.get(name)!.all, hostHere) + 0.5) return { clear: false, outside: true, blockers: [] };
    }
    let clear = true;
    const blockers: Array<{ m: Rect; b: Rect }> = [];
    for (const under of live) {
      for (const over of live) {
        // Two frames that move together lie as they did to each other.
        if (moved.has(under.name) === moved.has(over.name)) continue;
        // Lines run round a pushing frame wherever it lies.
        const pi = pairInk(under, over, at, resolved.get(over.name)!.exclude === 'push');
        if (!pi) continue;
        let area = 0;
        const pieces: Array<{ m: Rect; b: Rect }> = [];
        for (const ink of pi.covered) {
          const cuts = inkCuts(ink, pi.covers, depth);
          if (cuts.length === 0) continue;
          area += unionArea(cuts.map((x) => x.cut));
          for (const x of cuts) {
            const [mv, other] = moved.has(under.name) ? [ink.box, x.c.box] : [x.c.box, ink.box];
            pieces.push({ m: { ...mv, x: mv.x - dx, y: mv.y - dy }, b: other });
          }
        }
        if (area < minArea) continue;
        const key = pairKey(under.name, over.name);
        if (key === target) clear = false;
        else if (!warned.has(key)) blockers.push(...pieces);
      }
    }
    return { clear, outside: false, blockers };
  };

  for (const { under, over, area, words, picture, hitLine, hitBoxes, hitCovers } of found) {
    const ro = resolved.get(over.name)!;
    const areaMm2 = r1(area / (mmPx * mmPx));
    const proposals: FrameCoverProposal[] = [];
    // Painted under it, the covering frame is hidden in turn wherever the
    // covered one is opaque (a fill, a picture): proposed only where the
    // covered frame has nothing but text over it.
    const covers = pairInk(under, over, here)!.covers;
    const underOpaque = inkOf.get(under.name)!.covers.filter((c) => c.kind !== 'text');
    const swaps = underOpaque.some((u) => covers.some((c) => {
      const cut = intersect(u.box, c.box);
      return cut !== undefined && cut.width >= depth && cut.height >= depth;
    }));
    if (!swaps) proposals.push({ kind: 'layer', path: `${over.configPath}/layer`, value: under.layer - 1 });
    // Body lines run round a frame that pushes; a caption or a tab do not.
    if (hitLine && ro.exclude !== 'push' && ro.rotate === 0 && !over.writingMode) proposals.push({ kind: 'exclude', path: `${over.configPath}/exclude`, value: 'push' });
    // The covered frame anchored to the covering one moves with it: no
    // move takes one off the other.
    const moved = movers(over.name);
    const move = moved.has(under.name) ? undefined : clearingMove(hitBoxes, hitCovers, mmPx, (dx, dy) => tryMove(moved, dx, dy, pairKey(under.name, over.name)));
    if (move) proposals.push({ kind: 'move', frame: over.name, dxMm: move.dxMm, dyMm: move.dyMm });
    const text = words !== undefined ? words.trim().replace(/\s+/g, ' ').slice(0, 40) : undefined;
    warnings.push({
      kind: 'frameCovered',
      ...base(under),
      coveredBy: over.name,
      coveredByPath: over.configPath,
      overlapMm2: areaMm2,
      ...(text ? { text } : {}),
      ...(picture !== undefined ? { picture } : {}),
      ...locale,
      proposals,
      ...where(under),
    });
    events.push({ frame: under.name, kind: 'covered', cause: over.name, areaMm2 });
  }

  // frameOutsideArea: past the trim (text) or the bleed (fills, pictures),
  // and past the box it is anchored inside.
  const moveIsClear = (name: string) => (dx: number, dy: number): boolean => {
    const t = tryMove(movers(name), dx, dy);
    return t.clear && !t.outside && t.blockers.length === 0;
  };
  for (const f of live) {
    const rf = resolved.get(f.name)!;
    if (rf.overlap === 'allow') continue;
    const ink = inkOf.get(f.name)!.all;
    if (ink.length === 0) continue;
    const textInk = ink.filter((i) => i.kind === 'text').map((i) => i.box);
    const restInk = ink.filter((i) => i.kind !== 'text').map((i) => i.box);
    const overTrim = overrun(textInk, input.areas.page);
    const overBleed = overrun(restInk, input.areas.bleed);
    const pageCase = overTrim.max >= overBleed.max ? { past: 'trim' as const, o: overTrim } : { past: 'bleed' as const, o: overBleed };
    if (pageCase.o.max >= MIN_EXCESS_MM * mmPx) {
      warnings.push(outsideWarning(f, rf, pageCase.past, undefined, pageCase.o, mmPx, base, where, locale, byName, moveIsClear(f.name)));
      events.push({ frame: f.name, kind: 'outside', toMm: r1(pageCase.o.max / mmPx), past: pageCase.past });
    }
    // Anchored inside another frame or a group.
    const host = insideHost(rf, input, hostHere, (n) => resolved.get(n)?.overlap === 'allow');
    if (!host) continue;
    const o = overrun(ink.map((i) => i.box), host.box);
    if (o.max < MIN_EXCESS_MM * mmPx) continue;
    const past = byName.has(host.target) ? 'frame' as const : 'group' as const;
    warnings.push(outsideWarning(f, rf, past, host.target, o, mmPx, base, where, locale, byName, moveIsClear(f.name)));
    events.push({ frame: f.name, kind: 'outside', toMm: r1(o.max / mmPx), past: `#${host.target}` });
  }
  return { warnings, events };
}
