// The running text of a flowing book as one threaded story (#1559).
//
// A page Postext laid out in columns (not a composed page, not a page set
// vertically or right to left) gives each of its text columns a text frame
// the size of the column, and the frames of every such page of the book
// are threaded in reading order: the running text (paragraphs, headings,
// lists, quotes, code) runs through them as one story, as it runs through
// an InDesign book set in a master's frames. What stands beside it (boxes,
// floats, notes, running heads, figures and their captions) keeps the
// frames it had.
//
// With lines kept (the default) every line still ends in a forced line
// break and every column in a frame break, so InDesign shows the pages as
// Postext set them. Those breaks are Postext's, not the author's: the
// first frame of the thread carries a label (`THREAD_LABEL`) that says,
// for each break and paragraph end of the story in order, what it was,
// so the importer reads the paragraphs back as they were written
// (`import/fidelity/keptThread.ts`). The codes:
//
//   s  a line end where the words were apart (a space)
//   n  a line end inside a word or after a dash (nothing)
//   h  a line end on a hyphen Postext added (the hyphen goes)
//   b  a line the author broke (`\`): stays a forced line break
//   p  a paragraph end
//   c  a paragraph end the author broke to the next column
//
// The label is `<mode>:<codes>`, `k` for kept lines, `r` for lines left to
// InDesign (whose story has paragraph ends only to tell).

import type { DisplayItem, DisplayLine, DisplayPage, DisplayRect } from 'postext';
import type { VDTDocument } from 'postext/writer';
import { pageIsVertical } from 'postext';
import { flowCallouts } from './styles.js';
import { keepsLines, type StoryItem, type TextItem, type Writer } from './writer.js';

/** The key of the label on the thread's first frame. */
export const THREAD_LABEL = 'postext:thread';

/** Display roles of the running text: what the thread holds. */
const RUNNING: ReadonlySet<TextItem['role']> = new Set(['body', 'heading', 'list', 'quote', 'code', 'marker']);

export interface ThreadFrame {
  self: string;
  /** Its column's box on the sheet. */
  box: DisplayRect;
  items: TextItem[];
  /** The author ended the column (`:::columnbreak`). */
  forced: boolean;
  /** Its page's key (`pageKey`). */
  page: string;
}

/** A box of the flow in a column of the thread: its frame's rectangle
 *  and its text, anchored above the line of the running text that
 *  follows it (`host`), so it travels with the text and an importer reads
 *  it where it stood. */
export interface ThreadBox {
  rect: Extract<DisplayItem, { kind: 'rect' }>;
  texts: TextItem[];
  /** The column it stands in. */
  column: DisplayRect;
  host?: TextItem;
  /** Its anchored frame, written with its page. */
  xml?: string;
}

export interface Thread {
  story: string;
  /** The boxes of the thread's pages, by page key. */
  boxes: Map<string, ThreadBox[]>;
  /** The boxes anchored in each item of running text. */
  anchors: Map<TextItem, ThreadBox[]>;
  /** Frames by document, then by page, in reading order. */
  byPage: Map<string, ThreadFrame[]>;
  /** The documents' frames in reading order, a list per document. */
  segments: ThreadFrame[][];
  /** Display items the thread writes (running text, its boxes). */
  taken: Set<DisplayItem>;
  /** The page key of the first frame. */
  first: string;
}

export const pageKey = (doc: number, page: number): string => `${doc}:${page}`;

/** The thread of a book, or undefined when it has no page of running
 *  text in columns. `lists` holds each document's display lists. */
export function planThread(w: Writer, docs: readonly VDTDocument[], lists: readonly (readonly DisplayPage[])[]): Thread | undefined {
  if (w.opts.text === 'frames') return undefined;
  const byPage = new Map<string, ThreadFrame[]>();
  const segments: ThreadFrame[][] = [];
  const taken = new Set<DisplayItem>();
  const boxes = new Map<string, ThreadBox[]>();
  const anchors = new Map<TextItem, ThreadBox[]>();
  let first: string | undefined;
  docs.forEach((doc, d) => {
    const frames: ThreadFrame[] = [];
    doc.pages.forEach((vdt, p) => {
      // Composed pages keep their frames; vertical and right-to-left
      // pages (told in a flow frame of their own) theirs.
      if (vdt.composed || vdt.flow || pageIsVertical(vdt)) return;
      const columns = vdt.columns.filter((c) => c.kind !== 'side');
      if (!columns.length) return;
      const own = columns.map((c) => ({ c, items: [] as TextItem[] }));
      const inBoxes = flowCallouts(vdt);
      for (const it of lists[d]![p]!.items) {
        if (it.kind !== 'text' || !it.clip || it.frame || it.rotate || it.halo || !RUNNING.has(it.role) || !it.lines.length) continue;
        // A block of a box of the flow stays in the box's frames.
        if (it.source?.blockKey && inBoxes.has(it.source.blockKey)) continue;
        const cx = it.clip.x + it.clip.width / 2;
        const cy = it.clip.y + it.clip.height / 2;
        const at = own.find(({ c }) => cx >= c.bbox.x && cx <= c.bbox.x + c.bbox.width && cy >= c.bbox.y - 1 && cy <= c.bbox.y + c.bbox.height + 1);
        if (at) at.items.push(it);
      }
      // A column with no running text is no frame of the thread: a frame
      // break goes to the next frame, and so to the next text.
      const mine = own.filter((o) => o.items.length).map(({ c, items }) => ({ self: w.next(), box: { ...c.bbox }, items, forced: !!c.forcedBreak, page: pageKey(d, p) }));
      if (!mine.length) return;
      for (const f of mine) for (const it of f.items) taken.add(it);
      byPage.set(pageKey(d, p), mine);
      first ??= pageKey(d, p);
      frames.push(...mine);
      const found = flowBoxes(lists[d]![p]!, columns.map((c) => c.bbox), taken);
      if (found.length) boxes.set(pageKey(d, p), found);
    });
    segments.push(frames);
  });
  if (!first) return undefined;
  // Each box anchors in the first line of running text under it in its
  // column, or else in the next frame's; a box with none after it keeps
  // its frames on the page.
  const all = segments.flat();
  for (const [key, list] of boxes) {
    for (const b of list) {
      const bottom = b.rect.rect.y + b.rect.rect.height - 1;
      const at = all.findIndex((f) => f.page === key && f.box.x === b.column.x && f.box.y === b.column.y);
      const host = at >= 0 ? (all[at]!.items.find((it) => it.bbox.y >= bottom) ?? all[at + 1]?.items[0]) : undefined;
      if (!host) continue;
      b.host = host;
      anchors.set(host, [...(anchors.get(host) ?? []), b]);
      taken.add(b.rect);
      for (const t of b.texts) taken.add(t);
    }
  }
  return { story: w.next(), byPage, segments, taken, first, boxes, anchors };
}

/** The boxes of the flow on a page that stand in its columns: a box's
 *  rectangle (`rect.box`) and the text items inside it. */
function flowBoxes(page: DisplayPage, columns: DisplayRect[], taken: ReadonlySet<DisplayItem>): ThreadBox[] {
  const out: ThreadBox[] = [];
  const inside = (r: DisplayRect, x: number, y: number) => x >= r.x - 0.5 && x <= r.x + r.width + 0.5 && y >= r.y - 0.5 && y <= r.y + r.height + 0.5;
  for (const it of page.items) {
    if (it.kind !== 'rect' || !it.box || it.rotate) continue;
    const cx = it.rect.x + it.rect.width / 2;
    const cy = it.rect.y + it.rect.height / 2;
    const column = columns.find((c) => inside(c, cx, cy) && it.rect.width <= c.width + 1);
    if (!column) continue;
    const texts = page.items.filter((t): t is TextItem => t.kind === 'text' && !taken.has(t) && !t.frame && !t.rotate && !t.halo && inside(it.rect, t.bbox.x + t.bbox.width / 2, t.bbox.y + t.bbox.height / 2));
    // A box inside another box goes with it.
    if (out.some((b) => inside(b.rect.rect, cx, cy))) continue;
    out.push({ rect: it, texts, column });
  }
  return out;
}

/** The frames before and after `f` in the whole thread. */
export function neighbours(thread: Thread, f: ThreadFrame): { prev?: string; next?: string } {
  const all = thread.segments.flat();
  const i = all.indexOf(f);
  return { ...(i > 0 ? { prev: all[i - 1]!.self } : {}), ...(i >= 0 && i < all.length - 1 ? { next: all[i + 1]!.self } : {}) };
}

/** A document's running text as story items: each item told in its
 *  frame (`frame` is the frame's self, so a change of frame is a frame
 *  break), the rest of a paragraph a column break split joined to it, the
 *  first item after a column the author broke marked. */
export function segmentItems(frames: readonly ThreadFrame[], anchors?: ReadonlyMap<TextItem, ThreadBox[]>): StoryItem[] {
  const out: StoryItem[] = [];
  let forced = false;
  for (const f of frames) {
    f.items.forEach((x, k) => {
      const before = out[out.length - 1];
      const item: StoryItem = { ...x, frame: f.self };
      const boxes = anchors?.get(x)?.filter((b) => b.xml);
      if (boxes?.length) {
        item.anchors = boxes.map((b) => b.xml!);
        item.anchorHeight = boxes.reduce((h, b) => h + b.rect.rect.height, 0);
      }
      if (k === 0 && before) {
        if (before.source?.blockKey && before.source.blockKey === x.source?.blockKey && x.role !== 'marker') item.joinsPrevious = true;
        else if (forced) item.columnBreak = true;
      }
      out.push(item);
    });
    forced = f.forced;
  }
  return out;
}

/** What a line end Postext chose was: `h` on a hyphen it added, `s`
 *  where the words were apart, `n` inside a word; `b` a line the author
 *  broke. */
export function lineJoin(line: DisplayLine, next: DisplayLine | undefined): string {
  if (line.hardBreak) return 'b';
  if (line.addedHyphen) return 'h';
  if (!next) return 's';
  const end = [...line.map].reverse().find((m) => m >= 0);
  const start = next.map.find((m) => m >= 0);
  const gap = end !== undefined && start !== undefined ? start - end > 1 : !/[\s\-‐–—/]$/.test(line.text.slice(-1));
  return gap || /\s$/.test(line.text) || /^\s/.test(next.text) ? 's' : 'n';
}

/** The code of the paragraph end before `item`, the first paragraph of a
 *  story item. */
export function itemJoin(w: Writer, prev: StoryItem | undefined, item: StoryItem): string {
  if (item.joinsPrevious && keepsLines(w) && prev) {
    const last = prev.lines[prev.lines.length - 1]!;
    return lineJoin(last, item.lines[0]);
  }
  return item.columnBreak ? 'c' : 'p';
}

/** The label of the thread's first frame. */
export function threadLabel(w: Writer, codes: readonly string[]): string {
  return `<Label><KeyValuePair Key="${THREAD_LABEL}" Value="${keepsLines(w) ? 'k' : 'r'}:${codes.join('')}"/></Label>`;
}
