import type { VDTBlock, VDTDocument, VDTLine, VDTPage } from './vdt';
import { DEFAULT_DEBUG_CONFIG } from './defaults/debug';

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/**
 * How loosely a line is set, as a word-space ratio: its
 * `justifiedSpaceRatio`, or, for a CJK line spread between its characters
 * (segment `tracking`), `1 + tracking / (⅛ em)` — at the default threshold
 * of 3, a line whose characters are spread by more than ¼ em is loose. The
 * larger of the two when a line has both; undefined when it has neither.
 * `fontSizePx` is the block's text size.
 */
export function lineLooseness(line: VDTLine, fontSizePx: number): number | undefined {
  let tracking = 0;
  for (const seg of line.segments ?? []) if (seg.tracking !== undefined && seg.tracking > tracking) tracking = seg.tracking;
  const cjk = tracking > 0 && fontSizePx > 0 ? 1 + tracking / (fontSizePx / 8) : undefined;
  const spaces = line.justifiedSpaceRatio;
  if (cjk === undefined) return spaces;
  return spaces === undefined ? cjk : Math.max(spaces, cjk);
}

/** A justified line whose word spaces stretch past the loose-line threshold,
 *  with the band the highlight covers. */
export interface LooseLine {
  block: VDTBlock;
  line: VDTLine;
  /** Applied word-space width over the font's normal space
   *  (`line.justifiedSpaceRatio`); for a CJK line spread between its
   *  characters, the ratio {@link lineLooseness} gives. */
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
    let fontSizePx: number | undefined;
    for (const line of block.lines) {
      let ratio = line.justifiedSpaceRatio;
      if (line.segments?.some((s) => s.tracking !== undefined)) {
        fontSizePx ??= Number(FONT_SIZE_RE.exec(block.fontString ?? '')?.[1] ?? 16);
        ratio = lineLooseness(line, fontSizePx);
      }
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
