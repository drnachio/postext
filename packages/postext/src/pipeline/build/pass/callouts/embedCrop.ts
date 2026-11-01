// A page-span embed cropped within its picture's safe area (#1364).
// Part of the placement pass: the span-box path (calloutSpan.ts) and its
// one-column fallback (calloutInline.ts) share it.
import type { CalloutLayoutResult } from '../../../callouts/calloutLayout.js';
import type { FrameBoxOptions } from '../../../callouts/frameLayout.js';
import type { ResolvedCalloutStyleConfig } from '../../../../types.js';
import { SPAN_EMBED_STYLE_ID } from '../../../floats/spanEmbeds.js';

/**
 * The box of a page-span `::resource` embed (`wrapPageSpanEmbeds`) laid out
 * again with its picture cropped within the picture's safe area
 * (`Resource.safeArea`, #442) so the box stands at most `maxHeight` tall,
 * as an inline column embed is cropped to stay in its column
 * (`blockMeasure`). Null when the box is no embed box, already fits, holds
 * no picture with a safe area, or the safe area does not allow that much.
 */
export function cropSpanEmbed(
  style: ResolvedCalloutStyleConfig,
  result: CalloutLayoutResult,
  maxHeight: number,
  relayout: (frame: FrameBoxOptions) => CalloutLayoutResult,
): CalloutLayoutResult | null {
  if (style.id !== SPAN_EMBED_STYLE_ID || maxHeight <= 0) return null;
  const over = result.totalHeight - maxHeight;
  if (over <= 0.01) return null;
  const pictures = result.children.filter((b) => b.type === 'resource' && b.resourceBlock?.bodyFlex);
  if (pictures.length !== 1) return null;
  const flex = pictures[0]!.resourceBlock!.bodyFlex!;
  if (over > flex.shrink + 0.01) return null;
  const cropped = relayout({ pictureHeightDelta: flex.delta - over });
  return cropped.totalHeight <= maxHeight + 0.01 ? cropped : null;
}
