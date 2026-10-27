// Sharper paintings of the document book's pages for the magnifying glass
// (#527) (#1276: split out of postext.ts).
import { type Sharp, SHARP_MAX_PIXELS } from './constants.js';
import { trimmedSize } from './book.js';
import type { PageSource } from '../pageFlip.js';
import { renderPageToCanvas } from 'postext';
import type { FolioDocumentOptions } from './types.js';
import type { FolioDocumentState, FolioDocumentLate } from './state.js';

/** What createDocumentSharp takes from createFolioFromDocument. */
export interface DocumentSharpDeps {
  options: FolioDocumentOptions;
  free: (canvas: HTMLCanvasElement | null | undefined) => void;
  ds: FolioDocumentState;
  dlate: FolioDocumentLate;
}

export function createDocumentSharp(deps: DocumentSharpDeps) {
  const {
    options, free, ds, dlate
  } = deps;
  // ── Sharper paintings for the magnifying glass (#527) ──
  /** Page → its painting for the glass (with its decorations), the page
   *  as painted without them while it has some (to draw them again from,
   *  #543), the width it was painted at and the layout it was painted
   *  from. */
  const sharp = new Map<number, Sharp>();
  let sharpChain: Promise<unknown> = Promise.resolve();
  /** Pages whose sharp paintings wait to be decorated again (once a
   *  frame: a drag selects on every move). */
  const sharpDirty = new Set<number>();
  ds.sharpFrame = 0;

  /** Draws page `i`'s decorations over its painting for the glass, from
   *  the bare painting (kept while the page has decorations). True when
   *  it drew some. */
  function decorateSharp(i: number, entry: Sharp): boolean {
    const draw = options.decorate;
    const page = entry.doc.pages[i];
    const ctx = entry.canvas.getContext("2d");
    if (!draw || !page || !ctx) return false;
    if (entry.bare) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(entry.bare, 0, 0);
    } else {
      const bare = document.createElement("canvas");
      bare.width = entry.canvas.width;
      bare.height = entry.canvas.height;
      bare.getContext("2d")?.drawImage(entry.canvas, 0, 0);
      entry.bare = bare;
    }
    const inset = Math.max(0, entry.doc.trimOffset);
    const scale = entry.canvas.width / trimmedSize(page, entry.doc).width;
    ctx.setTransform(scale, 0, 0, scale, -inset * scale, -inset * scale);
    ctx.save();
    const drew = draw(i, ctx);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // No decorations: the painting is bare again.
    if (!drew) {
      free(entry.bare);
      entry.bare = null;
    }
    return drew;
  }

  /** The glass's paintings of these pages decorated again (the selection
   *  moved), and shown again. */
  function redecorateSharp() {
    ds.sharpFrame = 0;
    for (const i of sharpDirty) {
      const entry = sharp.get(i);
      if (!entry || entry.doc !== ds.current) continue;
      decorateSharp(i, entry);
      dlate.viewer.refreshPage(entry.canvas);
    }
    sharpDirty.clear();
  }
  /** Page `i` painted `width` px wide for the glass, within 1.5 times the
   *  page's own resolution and 24 megapixels; one page at a time, each in
   *  a task of its own (a newspaper page takes a while to paint). */
  function paintSharp(i: number, width: number): Promise<PageSource> {
    const done = sharpChain.then(
      () =>
        new Promise<PageSource>((resolve) => {
          setTimeout(() => {
            const page = ds.current.pages[i];
            if (!page) return resolve(null);
            const size = trimmedSize(page, ds.current);
            const w = Math.max(1, Math.min(width, Math.round(size.width * 1.5), Math.floor(Math.sqrt((SHARP_MAX_PIXELS * size.width) / size.height))));
            const had = sharp.get(i);
            if (had && had.doc === ds.current && had.width >= w) return resolve(had.canvas);
            const canvas = document.createElement("canvas");
            const scale = w / size.width;
            renderPageToCanvas(page, ds.current, canvas, { trim: true, scale, singleInk: options.singleInk, pageNegative: options.pageNegative, ...(options.printPreview ? { printPreview: options.printPreview } : {}) });
            const entry: Sharp = { canvas, bare: null, width: w, doc: ds.current };
            // The decorations too (a selection), over the page as painted.
            decorateSharp(i, entry);
            if (had) freeSharp(had);
            sharp.delete(i);
            sharp.set(i, entry);
            // A few pages kept: the spread on show and the one before.
            for (const [k, v] of sharp) {
              if (sharp.size <= 4) break;
              freeSharp(v);
              sharp.delete(k);
            }
            resolve(canvas);
          }, 0);
        }),
    );
    sharpChain = done.catch(() => undefined);
    return done;
  }
  function freeSharp(entry: Sharp) {
    free(entry.canvas);
    free(entry.bare);
  }
  function releaseSharp() {
    for (const v of sharp.values()) freeSharp(v);
    sharp.clear();
    sharpDirty.clear();
    cancelAnimationFrame(ds.sharpFrame);
    ds.sharpFrame = 0;
  }
  return {
    sharp, sharpDirty, redecorateSharp, paintSharp, releaseSharp
  };
}
