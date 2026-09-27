import type { VDTBlock, VDTDocument, VDTLine, VDTPage } from './vdt';
import { DEFAULT_DEBUG_CONFIG } from './defaults/debug';

/** A justified line whose word spaces stretch past the loose-line threshold,
 *  with the band the highlight covers. */
export interface LooseLine {
  block: VDTBlock;
  line: VDTLine;
  /** Applied word-space width over the font's normal space
   *  (`line.justifiedSpaceRatio`). */
  ratio: number;
  /** The highlight band, in page pixels: the block's full width across the
   *  line's box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindLooseLinesOptions {
  /** A line counts as loose when its ratio exceeds this. Default: 3, the
   *  default `debug.looseLineHighlight.threshold`; pass a config's own with
   *  `resolveDebugConfig(config.debug).looseLineHighlight.threshold`. */
  threshold?: number;
  /** Only the lines of this page. Default: every page. */
  pageIndex?: number;
}

export interface DrawLooseLinesOptions {
  /** See {@link FindLooseLinesOptions.threshold}. */
  threshold?: number;
  /** Any canvas fill style. Default: `#ff000040` (a translucent red), the
   *  default `debug.looseLineHighlight.color`. */
  color?: string;
}

/**
 * The loose lines of a laid-out document, in block and line order: the lines
 * the Sandbox's loose-line highlight and its `looseLine` check mark.
 */
export function findLooseLines(doc: VDTDocument, options: FindLooseLinesOptions = {}): LooseLine[] {
  const threshold = options.threshold ?? DEFAULT_DEBUG_CONFIG.looseLineHighlight.threshold;
  const out: LooseLine[] = [];
  for (const block of doc.blocks) {
    if (options.pageIndex !== undefined && block.pageIndex !== options.pageIndex) continue;
    for (const line of block.lines) {
      const ratio = line.justifiedSpaceRatio;
      if (ratio === undefined || ratio <= threshold) continue;
      out.push({
        block,
        line,
        ratio,
        x: block.bbox.x,
        y: line.bbox.y,
        width: block.bbox.width,
        height: line.bbox.height,
      });
    }
  }
  return out;
}

/**
 * Paint the loose-line highlight of one page onto a 2D context, in page
 * pixels under the context's current transform — call it right after
 * `renderPage` / `renderPageToCanvas` on the same canvas, which leave the
 * context scaled to the page. Returns the lines it painted.
 */
export function drawLooseLines(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  page: VDTPage,
  doc: VDTDocument,
  options: DrawLooseLinesOptions = {},
): LooseLine[] {
  const lines = findLooseLines(doc, { threshold: options.threshold, pageIndex: page.index });
  if (lines.length === 0) return lines;
  ctx.save();
  ctx.fillStyle = options.color ?? DEFAULT_DEBUG_CONFIG.looseLineHighlight.color.hex;
  for (const l of lines) ctx.fillRect(l.x, l.y, l.width, l.height);
  ctx.restore();
  return lines;
}
