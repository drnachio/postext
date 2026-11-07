// Paint order around floating tables (#1444). A floating Word table sits
// in the text layer: every drawing in front of the text covers it, every
// drawing behind the text lies under it. A page's drawings keep their
// paint order among themselves (`relativeHeight`), and the ones painted
// before a table that they overlap go behind the text, as does anything
// painted before one of those that it overlaps, so nothing that was under
// the table, or under something under it, comes out over it.

import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';

/** The drawings of one display item (or one part of a table) in paint
 *  order: `rect` is where they lie on the page; `table` marks the place
 *  of a floating table, which has no drawings of its own. */
export interface Layer {
  runs: string[];
  rect?: DisplayRect;
  table?: boolean;
}

/** Overlap below this many px is a shared edge, not an overlap. */
const EPS = 0.5;

export function overlaps(a: DisplayRect, b: DisplayRect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
}

/** Where an item's drawings lie on the page (unturned). */
export function itemRect(item: DisplayItem): DisplayRect {
  switch (item.kind) {
    case 'text':
      return item.bbox;
    case 'path':
      return item.bbox;
    case 'rule': {
      const h = item.widthPx / 2;
      const x = Math.min(item.x1, item.x2) - h;
      const y = Math.min(item.y1, item.y2) - h;
      return { x, y, width: Math.abs(item.x2 - item.x1) + 2 * h, height: Math.abs(item.y2 - item.y1) + 2 * h };
    }
    default:
      return item.rect;
  }
}

/** A drawing run sent behind the text. */
export function behindText(run: string): string {
  return run.replaceAll('behindDoc="0"', 'behindDoc="1"');
}

/** The page's runs in paint order, the layers under a floating table
 *  behind the text. */
export function layerRuns(layers: readonly Layer[]): string[] {
  const behind = new Array<boolean>(layers.length).fill(false);
  const barriers: DisplayRect[] = [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (!l.rect) continue;
    if (l.table) {
      barriers.push(l.rect);
    } else if (barriers.some((b) => overlaps(l.rect!, b))) {
      behind[i] = true;
      barriers.push(l.rect);
    }
  }
  return layers.flatMap((l, i) => (behind[i] ? l.runs.map(behindText) : l.runs));
}
