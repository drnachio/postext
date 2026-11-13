// `layout: 'auto'`: a flowing book or composed pages.
//
// A document is a flowing book when one threaded story holds most of the
// text, runs over most of the pages, and stands in frames that follow the
// page's margins: a novel, a report, a manual. Anything else (a magazine,
// a brochure, a poster) keeps its pages.

import type { IdmlMargins } from '../model/document.js';
import { boxHeight, boxWidth } from '../model/geometry.js';
import { pageSize } from '../resolve/geometry.js';
import type { OrderedStory } from '../resolve/order.js';
import { plainText } from '../read/story.js';
import type { Context } from './context.js';
import { allPages } from './pagesetup.js';

const lengthOf = (e: OrderedStory): number => plainText(e.story.paragraphs).length;

/** The story that holds most of the text. */
export function mainStory(stories: readonly OrderedStory[]): OrderedStory | undefined {
  let best: OrderedStory | undefined;
  let most = 0;
  for (const e of stories) {
    const n = lengthOf(e);
    if (n > most) {
      most = n;
      best = e;
    }
  }
  return best;
}

/** The widths of a page's columns: as its guides stand when they give
 *  each column's edges, else of equal width. */
export function columnWidths(m: IdmlMargins, area: number): number[] {
  const n = Math.max(1, m.columnCount);
  const p = m.columnsPositions;
  if (p.length === 2 * n) return Array.from({ length: n }, (_, i) => p[2 * i + 1]! - p[2 * i]!);
  return [(area - m.columnGutter * (n - 1)) / n];
}

export function decideLayout(ctx: Context, stories: readonly OrderedStory[], main: OrderedStory | undefined): { layout: 'pages' | 'flow'; reason: string } {
  if (ctx.opt.layout !== 'auto') return { layout: ctx.opt.layout, reason: `The layout was asked for: ${ctx.opt.layout}.` };
  const pages = allPages(ctx);
  if (!main || !pages.length) return { layout: 'pages', reason: 'The document holds no story of text: its pages are kept as they are.' };
  const total = stories.reduce((a, e) => a + lengthOf(e), 0) || 1;
  const share = lengthOf(main) / total;
  const frames = main.frames.filter((f) => f.page && f.box);
  const on = new Set(frames.map((f) => f.pageIndex));
  const coverage = on.size / pages.length;
  let follow = 0;
  for (const f of frames) {
    const page = f.page!;
    const size = pageSize(page);
    const m = page.margins;
    // Mirrored margins: `left` is the inside margin.
    const inside = page.side === 'left' ? size.width - m.left : m.left;
    const outside = page.side === 'left' ? m.right : size.width - m.right;
    const left = Math.min(inside, outside);
    const right = Math.max(inside, outside);
    const b = f.box!;
    const within = b.left >= left - 4 && b.right <= right + 4 && b.top >= m.top - 4 && b.bottom <= size.height - m.bottom + 4;
    // A frame as wide as the type area, or as one of its columns (of
    // their own widths when the guides say where each stands: the main
    // column of a column-and-a-half page).
    const widths = columnWidths(m, right - left);
    const wide = Math.abs(boxWidth(b) - (right - left)) < 6 || widths.some((w) => Math.abs(boxWidth(b) - w) < 6);
    if (within && wide && boxHeight(b) > 0) follow++;
  }
  const following = frames.length ? follow / frames.length : 0;
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  const facts = `its longest story holds ${pct(share)} of the text, runs over ${on.size} of ${pages.length} pages, and ${pct(following)} of its frames follow the margins`;
  if (share >= 0.6 && coverage >= 0.6 && following >= 0.7 && main.frames.length >= 2) return { layout: 'flow', reason: `A flowing book: ${facts}.` };
  return { layout: 'pages', reason: `Composed pages: ${facts} (a flowing book needs 60%, 60% of the pages and 70%, in a thread of two frames or more).` };
}
