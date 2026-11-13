// Painting the Canvas pages with what shows through their die-cut holes
// (#1567). Every paint of the viewer goes through `paintPages`: a book
// without holes paints each page as before; a book with holes paints the
// pages beneath first, hands their canvases to the engine as `beneath`,
// paints the deeper pages it lacks into hidden canvases at a reduced
// scale, and repaints (or marks stale) every page that shows a page it
// just painted.

import { composedPagePaintKey, renderPageToCanvas, type PageImageSource, type RenderPageOptions, type VDTDocument, type VDTPage } from 'postext';
import { optionsKey, type PaintedPages } from '../pageReuse.js';
import { hiddenScale, paintOrder, throughChain, throughPaintKey, type ThroughChain } from './chain.js';

/** The see-through state of the document on screen: its chain and the
 *  hidden canvases of pages painted only to be seen through a hole. */
export interface ThroughState {
  doc: VDTDocument | null;
  chain: ThroughChain | undefined;
  /** The paint options the hidden canvases were painted with, as a key. */
  optsKey: string;
  hidden: Map<number, HTMLCanvasElement>;
  /** Pages being painted (a guard: the chain never loops, but a hidden
   *  page is painted from inside another page's paint). */
  painting: Set<number>;
}

export function createThroughState(): ThroughState {
  return { doc: null, chain: undefined, optsKey: '', hidden: new Map(), painting: new Set() };
}

/** Frees a hidden canvas's bitmap. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
}

/** Points `state` at `doc` painted with `opts`: a new document or new
 *  paint options (a new scale, a print preview) drop the hidden pages. */
export function syncThrough(state: ThroughState, doc: VDTDocument, opts: RenderPageOptions): void {
  const key = optionsKey(opts);
  if (state.doc === doc && state.optsKey === key) return;
  if (state.doc !== doc) state.chain = throughChain(doc);
  state.doc = doc;
  state.optsKey = key;
  dropHidden(state);
}

/** Drops every hidden page. */
export function dropHidden(state: ThroughState): void {
  for (const canvas of state.hidden.values()) release(canvas);
  state.hidden.clear();
}

/** The bytes the hidden canvases hold, counted in the painted-pages
 *  budget. */
export function hiddenBytes(state: ThroughState): number {
  let bytes = 0;
  for (const c of state.hidden.values()) bytes += c.width * c.height * 4;
  return bytes;
}

/** What `paintPages` reads and writes: the viewer's canvases and its
 *  bookkeeping of which ones are painted, stale or in view. */
export interface PaintPagesDeps {
  doc: VDTDocument;
  canvasMap: Map<number, HTMLCanvasElement>;
  rendered: Set<number>;
  stale: Set<number>;
  visible: Set<number>;
  painted: PaintedPages;
  through: ThroughState;
}

/** The see-through part of page `i`'s paint key (see `throughPaintKey`). */
export function throughKeyOf(deps: Pick<PaintPagesDeps, 'doc' | 'through'>, i: number): string | undefined {
  return throughPaintKey(deps.doc, i, deps.through.chain, composedPagePaintKey);
}

/** A page with a cut (holes or a shaped outline) shows what is behind its
 *  canvas there: no white CSS background behind it. A shaped page casts
 *  its shadow from its outline (`drop-shadow` follows the alpha), not
 *  from the canvas's box. */
export function styleCutCanvas(canvas: HTMLCanvasElement, page: VDTPage): void {
  const cut = page.dieCut;
  const cuts = !!cut && (cut.holes.length > 0 || !!cut.outline);
  const shaped = !!cut?.outline;
  canvas.style.backgroundColor = cuts ? 'transparent' : '#ffffff';
  if (shaped) {
    canvas.dataset.dieShaped = '1';
    canvas.style.boxShadow = 'none';
    canvas.style.filter = 'drop-shadow(0 2px 5px rgba(0, 0, 0, 0.18))';
  } else if (canvas.dataset.dieShaped) {
    delete canvas.dataset.dieShaped;
    canvas.style.boxShadow = '';
    canvas.style.filter = '';
  }
}

/** The canvas of page `j` as it is on screen, when it is painted and up
 *  to date. A print preview proofs every page it paints: a page beneath
 *  drawn from a proofed canvas would be proofed twice, so the hidden
 *  (unproofed) copy is used then. */
function freshCanvas(deps: PaintPagesDeps, j: number, opts: RenderPageOptions): HTMLCanvasElement | undefined {
  if (opts.printPreview) return undefined;
  const c = deps.canvasMap.get(j);
  return c && c.width > 1 && deps.rendered.has(j) && !deps.stale.has(j) && !deps.through.painting.has(j) ? c : undefined;
}

/** The pages beneath, for the engine's `beneath`: the canvas on screen
 *  when it is fresh, else a hidden one painted now (and kept). */
function beneathSource(deps: PaintPagesDeps, opts: RenderPageOptions): PageImageSource {
  const { through, doc } = deps;
  const source: PageImageSource = (j) => {
    const onScreen = freshCanvas(deps, j, opts);
    if (onScreen) return onScreen;
    const kept = through.hidden.get(j);
    if (kept) return kept;
    const page = doc.pages[j];
    if (!page || through.painting.has(j) || typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    through.painting.add(j);
    try {
      const { printPreview: _proof, ...rest } = opts;
      void _proof;
      const hiddenOpts: RenderPageOptions = { ...rest, scale: hiddenScale(opts.scale ?? 1) };
      if (through.chain?.seen.has(j)) hiddenOpts.beneath = source;
      renderPageToCanvas(page, doc, canvas, hiddenOpts);
    } finally {
      through.painting.delete(j);
    }
    through.hidden.set(j, canvas);
    return canvas;
  };
  return source;
}

/** Paints one page on its canvas, with the pages beneath in its holes. */
function paintOne(deps: PaintPagesDeps, i: number, opts: RenderPageOptions): boolean {
  const canvas = deps.canvasMap.get(i);
  const page = deps.doc.pages[i];
  if (!canvas || !page) return false;
  const holed = deps.through.chain?.seen.has(i) === true;
  deps.through.painting.add(i);
  try {
    renderPageToCanvas(page, deps.doc, canvas, holed ? { ...opts, beneath: beneathSource(deps, opts) } : opts);
  } finally {
    deps.through.painting.delete(i);
  }
  if (page.dieCut || canvas.style.backgroundColor === 'transparent' || canvas.dataset.dieShaped) styleCutCanvas(canvas, page);
  deps.painted.painted(i, page, opts, throughKeyOf(deps, i));
  deps.rendered.add(i);
  deps.stale.delete(i);
  // Its own hidden copy, if it had one, is older than this paint.
  const old = deps.through.hidden.get(i);
  if (old) {
    release(old);
    deps.through.hidden.delete(i);
  }
  return true;
}

/**
 * Paints pages `indices` (each must have a canvas) with `opts`, the pages
 * a holed page shows before it. Then every page that shows one of them
 * through a hole is repainted when it is in view, or marked stale (its
 * hidden copy dropped) when it is not. Returns how many pages were
 * painted, the chain's repaints included.
 */
export function paintPages(deps: PaintPagesDeps, indices: Iterable<number>, opts: RenderPageOptions): number {
  syncThrough(deps.through, deps.doc, opts);
  const chain = deps.through.chain;
  const order = paintOrder(deps.doc, indices, chain);
  // Pages about to repaint hold old pixels: none is a source until painted.
  if (chain) for (const i of order) if (deps.rendered.has(i)) deps.stale.add(i);
  let count = 0;
  const done = new Set<number>();
  for (const i of order) {
    if (paintOne(deps, i, opts)) {
      count++;
      done.add(i);
    }
  }
  if (!chain || done.size === 0) return count;
  // The repaint chain: what shows the pages just painted.
  const owed = new Set<number>();
  for (const i of done) {
    for (const d of chain.dependents.get(i) ?? []) if (!done.has(d)) owed.add(d);
  }
  const now: number[] = [];
  for (const d of owed) {
    const old = deps.through.hidden.get(d);
    if (old) {
      release(old);
      deps.through.hidden.delete(d);
    }
    if (!deps.rendered.has(d)) continue;
    if (deps.visible.has(d)) {
      now.push(d);
      deps.stale.add(d);
    } else {
      deps.stale.add(d);
      deps.painted.forget(d);
    }
  }
  for (const d of paintOrder(deps.doc, now, chain)) if (paintOne(deps, d, opts)) count++;
  return count;
}

/** Frees one hidden canvas, the one farthest from `anchor`; `false` when
 *  there is none. Hidden pages go before painted ones when the bitmaps
 *  are over budget: they are small and painted again when a hole needs
 *  them. */
export function evictHidden(state: ThroughState, anchor: number): boolean {
  let victim = -1;
  let farthest = -1;
  for (const idx of state.hidden.keys()) {
    const dist = Math.abs(idx - anchor);
    if (dist > farthest) {
      farthest = dist;
      victim = idx;
    }
  }
  if (victim < 0) return false;
  release(state.hidden.get(victim)!);
  state.hidden.delete(victim);
  return true;
}
