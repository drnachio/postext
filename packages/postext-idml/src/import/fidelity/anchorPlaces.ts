// The custom-anchored objects of a story set in frames of a page, each
// with the place its rule gives it (`anchored.ts`).
//
// IDML does not say where a line falls, so the line of an anchor is
// taken from the share of the story's text that stands before it: each
// frame of the thread (each column of it) is taken to hold a share of
// the text proportional to its area.

import type { IdmlPage, IdmlPageItem } from '../../model/document.js';
import { boxHeight, boxWidth, type Box } from '../../model/geometry.js';
import type { OrderedStory } from '../../resolve/order.js';
import type { Context } from '../context.js';
import { ownText } from '../looks.js';
import { anchoredPlace } from './anchored.js';
import { frameSetup } from './baseline.js';

export interface HostFrame {
  item: IdmlPageItem;
  /** The frame's box on its page (upright). */
  box: Box;
  page: IdmlPage;
}

export interface PlacedAnchor {
  item: IdmlPageItem;
  box: Box;
  page: IdmlPage;
  /** The frame its anchor is taken to stand in. */
  host: IdmlPageItem;
  estimated: boolean;
}

/** An object the importer can give a frame of its own: a picture or a
 *  text frame anchored at a custom position (a group stays in the text). */
export const isCustomAnchored = (item: IdmlPageItem): boolean => item.anchored?.position === 'Anchored' && !item.children.length && (!!item.graphic || !!item.textFrame?.story);

export function customAnchors(ctx: Context, entry: OrderedStory, hosts: readonly HostFrame[]): PlacedAnchor[] {
  const out: PlacedAnchor[] = [];
  const paragraphs = entry.story.paragraphs;
  if (!hosts.length || !paragraphs.some((p) => p.runs.some((r) => r.content.some((i) => i.kind === 'item' && isCustomAnchored(i.item))))) return out;
  // The columns of the thread, each with the share of the text it holds.
  const columns: { host: HostFrame; box: Box; from: number; to: number }[] = [];
  let area = 0;
  for (const host of hosts) {
    const [top, left, bottom, right] = frameSetup(ctx, host.item).inset;
    const n = Math.max(1, Math.min(40, host.item.textFrame?.columns ?? 1));
    const gutter = host.item.textFrame?.gutter ?? 0;
    const inner: Box = { left: host.box.left + left, top: host.box.top + top, right: Math.max(host.box.left + left, host.box.right - right), bottom: Math.max(host.box.top + top, host.box.bottom - bottom) };
    const width = Math.max(0, (boxWidth(inner) - gutter * (n - 1)) / n);
    for (let c = 0; c < n; c++) {
      const box: Box = { left: inner.left + c * (width + gutter), top: inner.top, right: inner.left + c * (width + gutter) + width, bottom: inner.bottom };
      const a = Math.max(0, width * boxHeight(box));
      columns.push({ host, box, from: area, to: area + a });
      area += a;
    }
  }
  const total = paragraphs.reduce((a, p) => a + ownText(p).length + 1, 0);
  if (!(area > 0) || !(total > 0)) return out;
  let before = 0;
  for (const para of paragraphs) {
    let inside = 0;
    const look = ctx.looks.of(para);
    for (const run of para.runs) {
      for (const i of run.content) {
        if (i.kind === 'text') inside += i.text.length;
        if (i.kind !== 'item' || !isCustomAnchored(i.item)) continue;
        const at = ((before + inside) / total) * area;
        const column = columns.find((c) => at < c.to) ?? columns[columns.length - 1]!;
        const within = column.to > column.from ? Math.min(1, Math.max(0, (at - column.from) / (column.to - column.from))) : 0;
        const leading = look.cf.leading;
        const baseline = column.box.top + within * boxHeight(column.box) + leading * 0.8;
        const placed = anchoredPlace(i.item, { frame: column.host.box, column: column.box, page: column.host.page, baseline, size: look.cf.pointSize, leading });
        if (placed) out.push({ item: i.item, box: placed.box, page: column.host.page, host: column.host.item, estimated: placed.estimated });
      }
    }
    before += ownText(para).length + 1;
  }
  return out;
}
