/**
 * Pre-pass for `:::paragraphs{style="…"}` containers. The placement loop
 * rewinds `blockIdx` on keep-with-next rollbacks and replays the blocks in
 * between (marker blocks included), so container state is resolved up front
 * per content-block index instead of being pushed/popped inside the loop.
 */

import type { ContentBlock } from '../parse';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import { resolveParagraphStyle, type BlockStyle } from './styles';

export interface ParagraphContainer {
  /** `containerId` of the start/end marker pair. */
  id: number;
  /** Style for every paragraph in the container. */
  style: BlockStyle;
  /** Style for the container's last paragraph: the container's
   *  `marginBottom` is baked into its `marginBottomPx` so the grid snap that
   *  closes the container guarantees the margin (grid wins, margin is a
   *  minimum — the same convention snapped headings follow). */
  tailStyle: BlockStyle;
  /** Applied on entry through pending spacing. */
  marginTopPx: number;
  /** Fallback for containers whose last block is not a paragraph. */
  marginBottomPx: number;
}

export interface ParagraphContainerPlan {
  /** Container id → entry, for `paragraphs` containers with a known style. */
  byId: Map<number, ParagraphContainer>;
  /** Content-block index → innermost enclosing paragraph container. */
  byBlock: Array<ParagraphContainer | undefined>;
}

export function planParagraphContainers(
  contentBlocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
): ParagraphContainerPlan {
  const byId = new Map<number, ParagraphContainer>();
  const byBlock = new Array<ParagraphContainer | undefined>(contentBlocks.length);
  const dpi = resolved.page.dpi;
  // Every open container occupies one slot, undefined for non-`paragraphs`
  // containers and for unknown style ids (those render as plain body text —
  // the build has no warnings channel; the editor's warnings phase can flag
  // them).
  const open: Array<ParagraphContainer | undefined> = [];
  const cache = new Map<string, Omit<ParagraphContainer, 'id'>>();

  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.type === 'containerStart') {
      let entry: ParagraphContainer | undefined;
      const styleId = b.containerAttrs?.style;
      if (b.containerName === 'paragraphs' && styleId !== undefined && b.containerId !== undefined) {
        let base = cache.get(styleId);
        if (!base) {
          const cfg = resolved.paragraphStyles.find((s) => s.id === styleId);
          if (cfg) {
            const style = resolveParagraphStyle(cfg, resolved);
            const marginBottomPx = dimensionToPx(cfg.marginBottom, dpi, style.fontSizePx);
            base = {
              style,
              tailStyle: { ...style, marginBottomPx: Math.max(style.marginBottomPx, marginBottomPx) },
              marginTopPx: dimensionToPx(cfg.marginTop, dpi, style.fontSizePx),
              marginBottomPx,
            };
            cache.set(styleId, base);
          }
        }
        if (base) {
          entry = { id: b.containerId, ...base };
          byId.set(b.containerId, entry);
        }
      }
      open.push(entry);
      continue;
    }
    if (b.type === 'containerEnd') {
      open.pop();
      continue;
    }
    for (let j = open.length - 1; j >= 0; j--) {
      if (open[j]) { byBlock[i] = open[j]; break; }
    }
  }
  return { byId, byBlock };
}
