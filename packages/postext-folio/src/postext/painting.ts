// The document book's page paintings: which pages are wanted, painting and
// freeing them, the sweep of a turn and the idle schedule round the open
// spread (#1276: split out of postext.ts).
import { renderPageToCanvas, type FolioPaperConfig } from 'postext';
import { trimmedSize } from './book.js';
import { sweepFor, SWEEP_BUDGET_MS } from './sweep.js';
import { cancelIdle, onIdle } from './constants.js';
import type { FolioState } from '../viewer.js';
import type { FolioDocumentOptions } from './types.js';
import type { FolioDocumentState, FolioDocumentLate } from './state.js';

/** What createDocumentPainting takes from createFolioFromDocument. */
export interface DocumentPaintingDeps {
  options: FolioDocumentOptions;
  reach: number;
  slotWidth: () => number;
  sources: () => ("" | { paper?: FolioPaperConfig | undefined; src: HTMLCanvasElement; alt: string; } | { src: ""; paper: FolioPaperConfig; })[];
  ds: FolioDocumentState;
  dlate: FolioDocumentLate;
}

export function createDocumentPainting(deps: DocumentPaintingDeps) {
  const {
    options, reach, slotWidth, sources, ds, dlate
  } = deps;
  /** Pages within `reach` spreads of the ones on show. */
  function wanted(): Set<number> {
    const keep = new Set<number>();
    const span = 2 * reach + 1;
    for (const p of ds.focus) for (let i = p - span; i <= p + span; i++) if (i >= 0 && i < ds.current.pages.length) keep.add(i);
    for (const i of ds.sweep) keep.add(i);
    return keep;
  }

  /** Paints page `i` on a fresh canvas (the leaves cache their texture by
   *  element) exactly `width` device pixels wide. */
  function paint(i: number, width: number) {
    const page = ds.current.pages[i];
    if (!page) return;
    const canvas = document.createElement("canvas");
    // The page as bound: trimmed, without the slug and the crop marks.
    renderPageToCanvas(page, ds.current, canvas, {
      trim: true,
      scale: width / trimmedSize(page, ds.current).width,
      singleInk: options.singleInk,
      pageNegative: options.pageNegative,
      ...(options.printPreview ? { printPreview: options.printPreview } : {}),
    });
    const old = ds.canvases[i];
    if (old) old.width = old.height = 0;
    ds.canvases[i] = canvas;
    ds.painted.set(i, width);
    // A new painting: decorated afresh, on a canvas of its own (its
    // texture follows the element).
    free(ds.decorated[i]);
    ds.decorated[i] = null;
    decorate(i);
  }

  const free = (canvas: HTMLCanvasElement | null | undefined) => {
    if (canvas) canvas.width = canvas.height = 0;
  };

  /** Draws page `i`'s decorations over its painting. True when the page
   *  shows another canvas than before (it was not decorated). */
  function decorate(i: number): boolean {
    const draw = options.decorate;
    const base = ds.canvases[i];
    const page = ds.current.pages[i];
    if (!draw || !base || !page) return false;
    let target = ds.decorated[i];
    const fresh = !target;
    target ??= document.createElement("canvas");
    if (target.width !== base.width || target.height !== base.height) {
      target.width = base.width;
      target.height = base.height;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0);
    // The page's own pixels: the canvas shows the trimmed page at its size.
    const inset = Math.max(0, ds.current.trimOffset);
    const scale = base.width / trimmedSize(page, ds.current).width;
    ctx.setTransform(scale, 0, 0, scale, -inset * scale, -inset * scale);
    ctx.save();
    const drew = draw(i, ctx);
    ctx.restore();
    if (!drew && fresh) return false;
    ds.decorated[i] = target;
    return fresh;
  }

  /** Paints what the open spread needs now and lets go of the far pages;
   *  the rest of the window fills in when the browser is idle. */
  function refresh(urgent: number[]) {
    if (!ds.ready) return;
    const width = slotWidth();
    const keep = wanted();
    let changed = false;
    for (const i of urgent) {
      if (i < 0 || i >= ds.current.pages.length || ds.painted.get(i) === width) continue;
      paint(i, width);
      changed = true;
    }
    for (const i of [...ds.painted.keys()]) {
      if (keep.has(i)) continue;
      const canvas = ds.canvases[i];
      if (canvas) canvas.width = canvas.height = 0;
      ds.canvases[i] = null;
      free(ds.decorated[i]);
      ds.decorated[i] = null;
      ds.painted.delete(i);
      changed = true;
    }
    if (changed) dlate.viewer.setPages(sources());
    schedule();
  }

  /** A turn across several spreads: every page its leaves carry is
   *  painted, a frame at a time, in the order the leaves lift, so no page
   *  goes over blank. */
  function startSweep(target: number[]) {
    const next = sweepFor(ds.run, ds.settled, target, ds.current.pages.length);
    ds.run = next.run;
    ds.sweep = next.pages;
    cancelAnimationFrame(ds.sweepFrame);
    ds.sweepFrame = requestAnimationFrame(paintSweep);
  }

  function paintSweep() {
    ds.sweepFrame = 0;
    const width = slotWidth();
    const start = performance.now();
    let changed = false;
    for (const i of ds.sweep) {
      if (ds.painted.get(i) === width) continue;
      paint(i, width);
      changed = true;
      if (performance.now() - start > SWEEP_BUDGET_MS) break;
    }
    if (!changed) return;
    dlate.viewer.setPages(sources());
    ds.sweepFrame = requestAnimationFrame(paintSweep);
  }

  function schedule() {
    cancelIdle(ds.idle);
    ds.idle = onIdle(() => {
      const width = slotWidth();
      const distance = (i: number) => Math.min(...ds.focus.map((f) => Math.abs(i - f)));
      const next = [...wanted()].filter((i) => ds.painted.get(i) !== width).sort((a, b) => distance(a) - distance(b)).slice(0, 4);
      if (!next.length) return;
      for (const i of next) paint(i, width);
      dlate.viewer.setPages(sources());
      schedule();
    });
  }

  const around = (state: FolioState) => {
    const pages = state.pages.length ? state.pages : [0];
    // The leaf a hand would lift next shows the neighbours' pages.
    return [...pages, pages[0] - 2, pages[0] - 1, pages[pages.length - 1] + 1, pages[pages.length - 1] + 2];
  };
  return {
    wanted, paint, free, decorate, refresh, startSweep, around
  };
}
