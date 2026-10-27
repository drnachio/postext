// Labelled pictures, page cover tests and decoration anchors
// (#1278: split out of pageDesign.ts).
import type { DesignElement, DesignImageElement } from '../../types.js';
import { rectOf, toMm, sideOf } from './text.js';
import type { TextPiece, DesignInput, PlannedPicture, PlannedFrame } from './types.js';

/** Whether the brackets of a line pair up (escaped characters aside). */
function bracketsPair(line: string): boolean {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\') i++;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Words of a design text as a reader counts them (marks aside). */
const wordCount = (line: string): number => line.replace(/\*\*|[*_^~]/g, '').trim().split(/\s+/).filter(Boolean).length;

/** The pictures of a design that carry labels (#918), with them: a text of
 *  one line and at most four words, set no larger than `maxSizeMm`,
 *  horizontal, whose box (known: placed from the page's top-left with a
 *  width) lies inside a picture's box on the same side. A text over
 *  several pictures belongs to the one painted last. */
export function findLabelledPictures(
  pieces: readonly TextPiece[],
  elements: readonly DesignElement[],
  opts: NonNullable<DesignInput['labelsOnPictures']>,
): PlannedPicture[] {
  const maxSizeMm = opts.maxSizeMm;
  const candidates: PlannedPicture[] = [];
  for (const el of elements) {
    if (el.kind !== 'image') continue;
    const id = (el as DesignImageElement).resourceId;
    if (typeof id !== 'string' || id === '' || id.includes('{')) continue;
    const r = rectOf(el);
    if (!r || r.w === undefined || r.h === undefined || r.w <= 0 || r.h <= 0) continue;
    const size = opts.pictureSize(id);
    if (!size) continue;
    // The design draws the picture whole inside its box, centred: the
    // frame takes the part it covers, where the figure draws it.
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : r.w / r.h;
    const w = Math.min(r.w, r.h * aspect);
    const h = w / aspect;
    candidates.push({ element: el as DesignImageElement, x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h, labels: [], notes: [] });
  }
  if (candidates.length === 0) return [];
  const TOL = 0.5;
  for (const p of pieces) {
    if (p.x === undefined || p.y === undefined || p.width === undefined || p.height === undefined || !p.heightSure) continue;
    if (p.lines.length !== 1 || wordCount(p.lines[0]!) > 4 || wordCount(p.lines[0]!) === 0) continue;
    // `::label[…]` reads to its matching bracket and knows no escaped one:
    // a text whose brackets do not pair stays a frame.
    if (!bracketsPair(p.lines[0]!)) continue;
    if (p.look.writingMode || p.element.box || (p.element.stroke && p.element.stroke.hollow)) continue;
    const size = toMm(p.element.fontSize) ?? Infinity;
    if (size > maxSizeMm + 1e-6) continue;
    let host: PlannedPicture | undefined;
    for (const pic of candidates) {
      const side = sideOf(pic.element);
      if (side && p.side && side !== p.side) continue;
      if (side && !p.side) continue;
      if (p.x < pic.x - TOL || p.y < pic.y - TOL || p.x + p.width > pic.x + pic.width + TOL || p.y + p.height > pic.y + pic.height + TOL) continue;
      host = pic;
    }
    host?.labels.push(p);
  }
  return candidates.filter((pic) => pic.labels.length > 0);
}

/** An image that covers (nearly) the whole page: the page's art. */
export function coversPage(el: DesignElement, page: { width: number; height: number }): boolean {
  const r = rectOf(el);
  if (!r || r.w === undefined || r.h === undefined || page.width <= 0 || page.height <= 0) return false;
  if (typeof (el as DesignImageElement).resourceId !== 'string' || (el as DesignImageElement).resourceId.includes('{')) return false;
  return r.w * r.h >= 0.8 * page.width * page.height;
}

/** Decoration anchors that named a text now in a frame name the frame. */
export function remapDecorationAnchors(decoration: DesignElement[], movedTo: Map<string, number>, frames: readonly PlannedFrame[]): DesignElement[] {
  return decoration.map((el) => {
    if (el.kind === 'connector') return el;
    const to = el.placement?.anchor?.to;
    if (typeof to !== 'string' || !to.startsWith('#')) return el;
    const i = movedTo.get(to.slice(1));
    const name = i !== undefined ? frames[i]?.name : undefined;
    if (!name) return el;
    return { ...el, placement: { ...el.placement, anchor: { ...el.placement.anchor, to: `#${name}` } } } as DesignElement;
  });
}
