// The pages beneath a die-cut page painted on the spot (#1567), for a
// picture of one page painted away from the viewer (the WebMCP page image):
// each page a hole shows is painted once, on its own canvas, with the pages
// beneath it in its own holes, so every cut edge keeps its shadow and wall.

import { renderPageToCanvas, type PageImageSource, type RenderPageOptions, type VDTDocument } from 'postext';
import { throughChain } from './chain.js';

/** A `beneath` for `renderPageToCanvas` and the canvases it painted. */
export interface BeneathOnTheFly {
  source: PageImageSource;
  /** Frees the canvases painted for it. */
  release(): void;
}

/**
 * Paints, on demand, the pages seen through page `pageIndex`'s holes with
 * `opts` (its trim, negative and forms; never a print preview, which the
 * page itself applies once over all of it). Pixels are shared out so that
 * the pages beneath hold at most `maxPixels` together: the nearest at the
 * page's own scale when they fit. `undefined` for a page without holes.
 */
export function beneathOnTheFly(doc: VDTDocument, pageIndex: number, opts: RenderPageOptions, maxPixels = 48_000_000): BeneathOnTheFly | undefined {
  if (!doc.pages[pageIndex]?.dieCut?.holes.length || typeof document === 'undefined') return undefined;
  const chain = throughChain(doc);
  const reach = chain?.reach.get(pageIndex) ?? [];
  if (reach.length === 0) return undefined;
  const page = doc.pages[pageIndex]!;
  const scale = opts.scale ?? 1;
  const fit = Math.sqrt(maxPixels / (reach.length * page.width * page.height));
  const deepScale = Math.min(scale, fit);
  const canvases = new Map<number, HTMLCanvasElement>();
  const painting = new Set<number>();
  const { printPreview: _proof, onWarning: _warn, ...rest } = opts;
  void _proof;
  void _warn;
  const source: PageImageSource = (j) => {
    const kept = canvases.get(j);
    if (kept) return kept;
    const beneath = doc.pages[j];
    if (!beneath || painting.has(j)) return undefined;
    const canvas = document.createElement('canvas');
    painting.add(j);
    try {
      renderPageToCanvas(beneath, doc, canvas, { ...rest, scale: deepScale, ...(chain?.seen.has(j) ? { beneath: source } : {}) });
    } finally {
      painting.delete(j);
    }
    canvases.set(j, canvas);
    return canvas;
  };
  return {
    source,
    release() {
      for (const c of canvases.values()) {
        c.width = 1;
        c.height = 1;
      }
      canvases.clear();
    },
  };
}
