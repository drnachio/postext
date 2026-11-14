// Which stories and page items make the book, by the options: what
// stands on a hidden layer, is hidden itself, lies on the pasteboard or
// is set not to print is left out unless asked for, and counted.

import type { IdmlPageItem, IdmlParagraph, IdmlSpread, IdmlStory } from '../model/document.js';
import { locatedGeometry, type ItemGeometry, type Located } from '../resolve/geometry.js';
import type { OrderedStory } from '../resolve/order.js';
import { plainText } from '../read/story.js';
import type { Context } from './context.js';
import type { Look } from './looks.js';

const words = (story: IdmlStory): string => plainText(story.paragraphs).replace(/\s+/g, ' ').trim().slice(0, 60);

/** The story holds something a reader sees: text, a table, an object. */
export function hasContent(story: IdmlStory): boolean {
  for (const p of story.paragraphs) for (const r of p.runs) for (const i of r.content) if (i.kind !== 'text' ? i.kind !== 'special' && i.kind !== 'destination' : i.text.trim() !== '') return true;
  return false;
}

/** The top-level stories of the book in reading order. Master stories
 *  and InDesign's endnote story are not among them: the masters and the
 *  notes take them. */
export function selectStories(ctx: Context): OrderedStory[] {
  const out: OrderedStory[] = [];
  for (const e of ctx.order) {
    const f = e.flags;
    if (f.master || f.endnotes) continue;
    if (!hasContent(e.story)) continue;
    const sample = words(e.story);
    if (f.unplaced) {
      ctx.rep.add('unplacedStories', 'info', 'A story no frame holds (text left over in the document) is left out', sample);
      continue;
    }
    if (f.hiddenLayer && !ctx.opt.hiddenLayers) {
      ctx.rep.add('hiddenLayers', 'info', 'Text on hidden layers is left out (hiddenLayers: "include" keeps it)', sample);
      continue;
    }
    if (f.hidden && !ctx.opt.hiddenObjects) {
      ctx.rep.add('hiddenObjects', 'info', 'Hidden objects are left out (hiddenObjects: "include" keeps them)', sample);
      continue;
    }
    if (f.nonprinting && !ctx.opt.nonPrinting) {
      ctx.rep.add('nonPrinting', 'info', 'Non-printing objects are left out (nonPrinting: "include" keeps them)', sample);
      continue;
    }
    if (f.pasteboard && !ctx.opt.pasteboard) {
      ctx.rep.add('pasteboard', 'info', 'Objects on the pasteboard are left out (pasteboard: "include" keeps their text)', sample);
      continue;
    }
    if (f.textPath) ctx.rep.add('textOnPath', 'loss', 'Text set on a path is set as straight text', sample);
    out.push(e);
  }
  return out;
}

/** Count the looks of every paragraph the book will hold: the stories'
 *  own, and those of their notes, cells and anchored frames. Returns the
 *  looks of `main`'s own paragraphs. */
export function countLooks(ctx: Context, stories: readonly OrderedStory[], main: OrderedStory | undefined): Set<Look> {
  const mainLooks = new Set<Look>();
  const seen = new Set<IdmlStory>();
  const walk = (paragraphs: readonly IdmlParagraph[], into: Set<Look> | undefined, depth: number): void => {
    let before: Look | undefined;
    for (const p of paragraphs) {
      const look = ctx.looks.count(p);
      into?.add(look);
      if (before) {
        const gap = Math.round((before.pf.spaceAfter + look.pf.spaceBefore) * 100) / 100;
        (look.gaps ??= new Map()).set(gap, (look.gaps.get(gap) ?? 0) + 1);
      }
      before = look;
      if (depth > 8) continue;
      for (const r of p.runs) {
        for (const i of r.content) {
          if (i.kind === 'footnote' || i.kind === 'endnote') walk(i.paragraphs, undefined, depth + 1);
          else if (i.kind === 'table') for (const c of i.table.cells) walk(c.paragraphs, undefined, depth + 1);
          else if (i.kind === 'item') items(i.item, depth + 1);
        }
      }
    }
  };
  const items = (item: IdmlPageItem, depth: number): void => {
    const story = item.textFrame?.story ? ctx.doc.stories.get(item.textFrame.story) : undefined;
    if (story && !seen.has(story)) {
      seen.add(story);
      walk(story.paragraphs, undefined, depth);
    }
    for (const c of item.children) items(c, depth);
  };
  for (const e of stories) {
    if (seen.has(e.story)) continue;
    seen.add(e.story);
    walk(e.story.paragraphs, e === main ? mainLooks : undefined, 0);
  }
  return mainLooks;
}

export interface Leaf {
  at: Located;
  g: ItemGeometry;
  /** Paint order in its spread, back to front. */
  z: number;
}

/** The items of a spread that draw something themselves (groups opened),
 *  back to front, with where each stands. Items the options leave out
 *  are counted and skipped. */
export function leavesOf(ctx: Context, spread: IdmlSpread): Leaf[] {
  const hiddenLayers = new Set(ctx.doc.layers.filter((l) => !l.visible).map((l) => l.self));
  const out: Leaf[] = [];
  let z = 0;
  const walk = (item: IdmlPageItem, parents: IdmlPageItem[], depth: number): void => {
    // The die line is read as the book's die-cuts (`dieCuts.ts`).
    if (ctx.dieItems.has(item)) return;
    const chain = [...parents, item];
    const inside = item.children.length ? item.children : (item.states?.find((s) => s.active) ?? item.states?.[0])?.items ?? [];
    if (item.states?.length) ctx.rep.add('interactiveObjects', 'warning', 'Buttons, multi-state objects and form fields are set as the state they show; they do nothing in the book', item.name ?? item.kind);
    if (inside.length && depth < 64) {
      for (const c of inside) walk(c, chain, depth + 1);
      return;
    }
    const name = item.name ?? item.kind;
    const layer = chain.map((i) => i.layer).find((l) => l !== undefined);
    if (layer !== undefined && hiddenLayers.has(layer) && !ctx.opt.hiddenLayers) {
      if (!item.textFrame?.story) ctx.rep.add('hiddenLayers', 'info', 'Text on hidden layers is left out (hiddenLayers: "include" keeps it)', name);
      return;
    }
    if (chain.some((i) => !i.visible) && !ctx.opt.hiddenObjects) {
      if (!item.textFrame?.story) ctx.rep.add('hiddenObjects', 'info', 'Hidden objects are left out (hiddenObjects: "include" keeps them)', name);
      return;
    }
    if (chain.some((i) => i.nonprinting) && !ctx.opt.nonPrinting) {
      if (!item.textFrame?.story) ctx.rep.add('nonPrinting', 'info', 'Non-printing objects are left out (nonPrinting: "include" keeps them)', name);
      return;
    }
    const at: Located = { item, spread, parents };
    const g = locatedGeometry(at);
    if (!g) {
      ctx.rep.add('noGeometry', 'warning', 'An object with no outline, or whose place cannot be worked out (a transform that is not a number), is left out', name);
      return;
    }
    if (g.pasteboard) {
      if (!item.textFrame?.story) ctx.rep.add('pasteboard', 'info', 'Objects on the pasteboard are left out (pasteboard: "include" keeps their text)', name);
      return;
    }
    out.push({ at, g, z: z++ });
  };
  for (const item of spread.items) walk(item, [], 0);
  return out;
}
