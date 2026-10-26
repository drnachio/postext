// Frames once placed: held by their foot, turned, the motions between two
// lays, and committed to the page with their source and attribute text
// (#1276: split out of composedLayout.ts).
import type { ReflowEvent, VDTFrame, VDTBlock } from '../../../vdt.js';
import type { Rect } from '../../../composed/geometry.js';
import { groupOfFrames } from '../../../composed/groups.js';
import type { FrameMotion } from '../../../composed/reflowLog.js';
import { anchorTarget } from '../../../composed/templates.js';
import type { ResolvedFrame, ResolvedPageTemplate } from '../../../composed/types.js';
import { type CalloutLayoutResult, offsetCalloutToAbsolute } from '../../callouts/calloutLayout.js';
import type { ComposedStory, ComposedPageInput } from './state.js';

/** A module's frame placed by its box's foot or middle, or sized by its
 *  height (#1062): it does not say how tall the module is. */
export function heldByFoot(f: ResolvedFrame): boolean {
  if (f.height === 'fill' || (typeof f.height === 'object' && 'percent' in f.height)) return true;
  const anchor = f.placement?.anchor;
  if (!anchor || anchor.to !== 'container') return false;
  return FOOT_EDGES.has(anchor.edge);
}

/** The nine-point edges below a box's top. */
const FOOT_EDGES: ReadonlySet<string> = new Set(['left', 'center', 'right', 'start', 'end', 'bottom-left', 'bottom', 'bottom-right', 'bottom-start', 'bottom-end']);

/** `r` turned `deg` (±90) about the centre of `about`: an axis-aligned
 *  box again, its width and height swapped. */
export function turnRectAbout(r: Rect, about: Rect, deg: number): Rect {
  const cx = about.x + about.width / 2;
  const cy = about.y + about.height / 2;
  const turn = (x: number, y: number): { x: number; y: number } =>
    deg > 0 ? { x: cx - (y - cy), y: cy + (x - cx) } : { x: cx + (y - cy), y: cy - (x - cx) };
  const a = turn(r.x, r.y);
  const b = turn(r.x + r.width, r.y + r.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export const sameRect = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

/** Each laid frame's declared and final boxes, in template order, with
 *  what moves it: what it anchors to (a group: its frames, last first),
 *  then, in a group, the frames before it (nearest first), what the group
 *  anchors to, and the frames after it. */
export function motionsOf(template: ResolvedPageTemplate, rects: ReadonlyMap<string, Rect>, declared: ReadonlyMap<string, Rect>): FrameMotion[] {
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
export function mergeLog(reflow: readonly ReflowEvent[], overflow: readonly ReflowEvent[], template: ResolvedPageTemplate): ReflowEvent[] {
  const order = new Map(template.frames.map((f, i) => [f.name, i]));
  const all = [...reflow.map((e, i) => ({ e, i })), ...overflow.map((e, i) => ({ e, i: reflow.length + i }))];
  all.sort((a, b) => (order.get(a.e.frame) ?? 0) - (order.get(b.e.frame) ?? 0) || a.i - b.i);
  return all.map((x) => x.e);
}

/** Stamp a frame's laid-out box with its source and page, move it to the
 *  frame's place and add it (box first) to `out` and to the frame's ids. */
export function commitFrame(
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
