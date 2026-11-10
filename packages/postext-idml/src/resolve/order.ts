// Reading order: the stories of a document in the order a reader meets
// them.
//
// IDML keeps stories in the order they were made, which says nothing of
// the page. What orders them is where their text starts: the page of the
// first frame of the story's thread, then the place of that frame on the
// page. Frames that stand side by side are columns, read from the start
// side; frames one under another are read downwards. A story anchored in
// another's text (an inline or anchored frame, a frame in a table cell)
// has no place of its own: it belongs to its host, at the anchor.
//
// Nothing is dropped. Stories on the pasteboard, on hidden layers, in
// hidden or non-printing frames, on master spreads or in no frame at all
// are given with a flag that says so.

import type { IdmlDocument, IdmlPage, IdmlPageItem, IdmlParagraph, IdmlSpread, IdmlStory } from '../model/document.js';
import type { Box } from '../model/geometry.js';
import { itemIndex, locatedGeometry, type Located } from './geometry.js';

export interface FramePlace {
  /** The text frame, or the item whose path the story is set on. */
  item: IdmlPageItem;
  spread: IdmlSpread;
  page?: IdmlPage;
  /** Index of the page in the document; -1 on the pasteboard and on a
   *  master spread. */
  pageIndex: number;
  /** Bounding box in page coordinates (of the spread's first page when
   *  the frame is on the pasteboard). */
  box?: Box;
  /** The story runs on the item's path (`TextPath`), not in a frame. */
  textPath: boolean;
  hidden: boolean;
  hiddenLayer: boolean;
  nonprinting: boolean;
  pasteboard: boolean;
}

export interface StoryFlags {
  /** No frame of the story stands on a page. */
  pasteboard: boolean;
  /** Every frame is on a layer that is switched off. */
  hiddenLayer: boolean;
  /** Every frame (or a group it is in) is hidden. */
  hidden: boolean;
  /** Every frame is non-printing. */
  nonprinting: boolean;
  /** The story is on a master spread. */
  master: boolean;
  /** The story is set on a path. */
  textPath: boolean;
  /** No frame holds the story. */
  unplaced: boolean;
  /** The story is anchored in another one's text. */
  anchored: boolean;
  /** InDesign's own story of endnotes. */
  endnotes: boolean;
}

export interface AnchoredStory {
  /** The frame in the host's text that holds the story. */
  item: IdmlPageItem;
  /** Index of the host's top-level paragraph the anchor stands in. */
  paragraph: number;
  /** Where in that paragraph: its text, a footnote, a note, a table. */
  within: 'text' | 'footnote' | 'note' | 'table';
  entry: OrderedStory;
}

export interface OrderedStory {
  story: IdmlStory;
  /** The story's thread, first frame first. Empty for an anchored or an
   *  unplaced story. */
  frames: FramePlace[];
  flags: StoryFlags;
  /** Stories anchored in this one's text, in the order of their anchors. */
  anchored: AnchoredStory[];
}

function places(doc: IdmlDocument): Map<string, FramePlace[]> {
  const hiddenLayers = new Set(doc.layers.filter((l) => !l.visible).map((l) => l.self));
  const out = new Map<string, FramePlace[]>();
  const add = (story: string, at: Located, textPath: boolean): void => {
    if (!story) return;
    const g = locatedGeometry(at);
    const chain = [...at.parents, at.item];
    // An item in a group takes the group's layer.
    const layer = chain.map((i) => i.layer).find((l) => l !== undefined);
    const place: FramePlace = {
      item: at.item,
      spread: at.spread,
      pageIndex: g?.page ? g.page.index : -1,
      textPath,
      hidden: chain.some((i) => !i.visible),
      hiddenLayer: layer !== undefined && hiddenLayers.has(layer),
      nonprinting: chain.some((i) => i.nonprinting),
      pasteboard: !g?.page,
    };
    if (g?.page) place.page = g.page;
    if (g) place.box = g.box;
    const list = out.get(story);
    if (list) list.push(place);
    else out.set(story, [place]);
  };
  for (const at of itemIndex(doc).values()) {
    if (at.item.textFrame) add(at.item.textFrame.story, at, false);
    for (const path of at.item.textPaths) add(path.story, at, true);
  }
  return out;
}

/** A story's frames in the order of its thread. The thread is followed
 *  from each frame nothing leads to; frames a broken thread leaves over
 *  (one that loops, or names frames that are not there) follow in the
 *  order of the document, each still given once. */
function threaded(frames: FramePlace[]): FramePlace[] {
  if (frames.length < 2) return frames;
  const byId = new Map<string, FramePlace>();
  for (const f of frames) if (!f.textPath && f.item.self && !byId.has(f.item.self)) byId.set(f.item.self, f);
  const done = new Set<FramePlace>();
  const out: FramePlace[] = [];
  const follow = (from: FramePlace): void => {
    let at: FramePlace | undefined = from;
    while (at && !done.has(at)) {
      done.add(at);
      out.push(at);
      const next: string | undefined = at.item.textFrame?.next;
      at = next ? byId.get(next) : undefined;
    }
  };
  for (const f of frames) {
    if (f.textPath) continue;
    const previous = f.item.textFrame?.previous;
    if (!previous || !byId.has(previous)) follow(f);
  }
  for (const f of frames) if (!done.has(f)) follow(f);
  return out;
}

interface Anchor {
  story: string;
  item: IdmlPageItem;
  paragraph: number;
  within: AnchoredStory['within'];
}

/** The text frames anchored in a story's text, in the order of their
 *  anchors. Footnotes, notes and table cells are looked into; what a
 *  cell's or a note's own anchored frames hold belongs to the story too. */
function anchorsOf(story: IdmlStory): Anchor[] {
  const out: Anchor[] = [];
  const frames = (item: IdmlPageItem, paragraph: number, within: Anchor['within']): void => {
    const stack: IdmlPageItem[] = [item];
    while (stack.length) {
      const it = stack.pop()!;
      if (it.textFrame?.story) out.push({ story: it.textFrame.story, item: it, paragraph, within });
      for (const path of it.textPaths) if (path.story) out.push({ story: path.story, item: it, paragraph, within });
      for (let i = it.children.length - 1; i >= 0; i--) stack.push(it.children[i]!);
    }
  };
  story.paragraphs.forEach((top, index) => {
    const stack: { paragraphs: readonly IdmlParagraph[]; within: Anchor['within'] }[] = [{ paragraphs: [top], within: 'text' }];
    while (stack.length) {
      const { paragraphs, within } = stack.pop()!;
      for (const p of paragraphs) {
        for (const r of p.runs) {
          for (const i of r.content) {
            if (i.kind === 'item') frames(i.item, index, within);
            else if (i.kind === 'footnote' || i.kind === 'endnote') stack.push({ paragraphs: i.paragraphs, within: within === 'text' ? 'footnote' : within });
            else if (i.kind === 'note') stack.push({ paragraphs: i.paragraphs, within: within === 'text' ? 'note' : within });
            else if (i.kind === 'table') {
              const inTable = within === 'text' ? 'table' : within;
              for (const cell of i.table.cells) {
                for (const item of cell.items) frames(item, index, inTable);
                stack.push({ paragraphs: cell.paragraphs, within: inTable });
              }
            }
          }
        }
      }
    }
  });
  return out;
}

/** Frames of one page in reading order. Frames that share a stretch of
 *  the page's height stand in one band and are read across it, from the
 *  start side; the bands are read downwards. */
function acrossPage<T extends { box?: Box; rtl: boolean }>(entries: T[], rightToLeft: boolean): T[] {
  const boxed = entries.filter((e) => e.box);
  const rest = entries.filter((e) => !e.box);
  boxed.sort((a, b) => a.box!.top - b.box!.top || a.box!.left - b.box!.left);
  const out: T[] = [];
  let band: T[] = [];
  let top = 0;
  let bottom = 0;
  const flush = (): void => {
    const rtl = rightToLeft || (band.length > 0 && band.every((e) => e.rtl));
    band.sort((a, b) => (rtl ? b.box!.right - a.box!.right : a.box!.left - b.box!.left) || a.box!.top - b.box!.top);
    out.push(...band);
    band = [];
  };
  for (const e of boxed) {
    const b = e.box!;
    const shared = Math.min(bottom, b.bottom) - Math.max(top, b.top);
    const least = Math.min(bottom - top, b.bottom - b.top);
    // Side by side: they share at least half the height of the shorter.
    if (band.length && shared > 0 && shared >= least / 2) {
      band.push(e);
      bottom = Math.max(bottom, b.bottom);
    } else {
      flush();
      band = [e];
      top = b.top;
      bottom = b.bottom;
    }
  }
  flush();
  return [...out, ...rest];
}

/** The stories of the document in reading order. Stories anchored in
 *  another's text are under their host (`anchored`), not in the list. */
export function readingOrder(doc: IdmlDocument): OrderedStory[] {
  const framesOf = places(doc);
  const entries = new Map<string, OrderedStory>();
  for (const story of doc.stories.values()) {
    const frames = threaded(framesOf.get(story.self) ?? []);
    const all = (test: (f: FramePlace) => boolean): boolean => frames.length > 0 && frames.every(test);
    entries.set(story.self, {
      story,
      frames,
      flags: {
        pasteboard: all((f) => f.pasteboard && !f.spread.master),
        hiddenLayer: all((f) => f.hiddenLayer),
        hidden: all((f) => f.hidden),
        nonprinting: all((f) => f.nonprinting),
        master: frames.length > 0 && frames[0]!.spread.master,
        textPath: all((f) => f.textPath),
        unplaced: frames.length === 0,
        anchored: false,
        endnotes: story.endnotes,
      },
      anchored: [],
    });
  }

  // Anchored stories go under their host. A story is taken once, by the
  // first anchor that names it; a story with frames on a spread is not
  // anchored whatever names it.
  const taken = new Set<string>();
  for (const host of entries.values()) {
    for (const a of anchorsOf(host.story)) {
      const entry = entries.get(a.story);
      if (!entry || entry === host || taken.has(a.story) || entry.frames.length) continue;
      taken.add(a.story);
      entry.flags.anchored = true;
      entry.flags.unplaced = false;
      host.anchored.push({ item: a.item, paragraph: a.paragraph, within: a.within, entry });
    }
  }
  // Two stories anchored in each other, and in nothing else, would both
  // be taken and neither listed: give such a ring back to the list.
  const reachable = new Set<OrderedStory>();
  const stack = [...entries.values()].filter((e) => !e.flags.anchored);
  while (stack.length) {
    const e = stack.pop()!;
    if (reachable.has(e)) continue;
    reachable.add(e);
    for (const a of e.anchored) stack.push(a.entry);
  }
  for (const e of entries.values()) {
    if (reachable.has(e)) continue;
    e.flags.anchored = false;
    e.flags.unplaced = true;
    e.anchored = e.anchored.filter((a) => reachable.has(a.entry));
    reachable.add(e);
  }

  const top = [...entries.values()].filter((e) => !e.flags.anchored);
  const onPages = new Map<number, OrderedStory[]>();
  const pasteboard = new Map<IdmlSpread, OrderedStory[]>();
  const masters: OrderedStory[] = [];
  const unplaced: OrderedStory[] = [];
  const push = <K>(map: Map<K, OrderedStory[]>, key: K, e: OrderedStory): void => {
    const list = map.get(key);
    if (list) list.push(e);
    else map.set(key, [e]);
  };
  for (const e of top) {
    // Where the story starts: its first frame that stands on a page.
    const first = e.frames.find((f) => !f.pasteboard) ?? e.frames[0];
    if (!first) unplaced.push(e);
    else if (first.spread.master) masters.push(e);
    else if (first.pasteboard) push(pasteboard, first.spread, e);
    else push(onPages, first.pageIndex, e);
  }
  const rightToLeft = doc.preferences.rightToLeft;
  const sorted = (list: OrderedStory[]): OrderedStory[] =>
    acrossPage(list.map((e) => ({ e, box: (e.frames.find((f) => !f.pasteboard) ?? e.frames[0])?.box, rtl: e.story.direction === 'rtl' })).map((x) => (x.box ? { e: x.e, box: x.box, rtl: x.rtl } : { e: x.e, rtl: x.rtl })), rightToLeft).map((x) => x.e);

  const out: OrderedStory[] = [];
  for (const spread of doc.spreads) {
    for (const page of spread.pages) out.push(...sorted(onPages.get(page.index) ?? []));
    out.push(...sorted(pasteboard.get(spread) ?? []));
  }
  // Master stories page by page of their spread, as a document's are.
  const byMaster = new Map<IdmlSpread, OrderedStory[]>();
  for (const e of masters) push(byMaster, e.frames[0]!.spread, e);
  for (const spread of doc.masterSpreads) {
    const list = byMaster.get(spread) ?? [];
    for (const page of spread.pages) out.push(...sorted(list.filter((e) => e.frames[0]!.page === page)));
    out.push(...sorted(list.filter((e) => !e.frames[0]!.page)));
  }
  out.push(...unplaced);
  return out;
}

/** The entry of a story, wherever it stands in the order (anchored ones
 *  included). */
export function findOrdered(order: readonly OrderedStory[], self: string): OrderedStory | undefined {
  const stack = [...order];
  const seen = new Set<OrderedStory>();
  while (stack.length) {
    const e = stack.pop()!;
    if (seen.has(e)) continue;
    seen.add(e);
    if (e.story.self === self) return e;
    for (const a of e.anchored) stack.push(a.entry);
  }
  return undefined;
}
