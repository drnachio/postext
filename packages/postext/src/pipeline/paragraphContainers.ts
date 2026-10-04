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
  /** The `style` id the container names. */
  styleId: string;
  /** Style for every paragraph in the container. */
  style: BlockStyle;
  /** Style for the container's last paragraph: its `marginBottomPx` is
   *  the space under the container, the larger of `spaceBetween` and
   *  `marginBottom` (a negative `marginBottom` as it is). With
   *  `bodyText.paragraphContainerSpacing: 'add'` (1.4) it is baked into
   *  the grid snap that closes the container (grid wins, margin is a
   *  minimum — the same convention snapped headings follow); with
   *  `'collapse'` the flow snaps under the text and carries what the snap
   *  left of the space, so it merges with the next block's own. */
  tailStyle: BlockStyle;
  /** Applied on entry through pending spacing. */
  marginTopPx: number;
  /** Fallback for containers whose last block is not a paragraph. */
  marginBottomPx: number;
  /** The style's `snapToGrid`: whether the flow snaps back onto the
   *  baseline grid under the container's last paragraph (EF-184). */
  snapToGrid: boolean;
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
  // containers and for unknown style ids (those render as plain body text,
  // and `collectContentWarnings` reports them in `doc.contentWarnings`).
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
            // A negative margin pulls the flow after the container up past
            // the entries' own spacing instead of collapsing with it.
            const tailMarginPx = marginBottomPx < 0 ? marginBottomPx : Math.max(style.marginBottomPx, marginBottomPx);
            base = {
              styleId,
              style,
              tailStyle: { ...style, marginBottomPx: tailMarginPx },
              marginTopPx: dimensionToPx(cfg.marginTop, dpi, style.fontSizePx),
              marginBottomPx,
              snapToGrid: cfg.snapToGrid,
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

/** The paragraph style a block is set in (`VDTBlock.paragraphStyleId`): a
 *  poem's fence style when the config has it, else, for a paragraph, the
 *  style of the innermost `:::paragraphs` container around it — as
 *  `buildBlockKind` picks the block's style. */
export function paragraphStyleIdOf(
  raw: ContentBlock,
  container: ParagraphContainer | undefined,
  resolved: ResolvedConfig,
): string | undefined {
  if (raw.type !== 'paragraph') return undefined;
  const verseStyle = raw.verse?.attrs.style?.trim();
  if (verseStyle && resolved.paragraphStyles.some((s) => s.id === verseStyle)) return verseStyle;
  return container?.styleId;
}
