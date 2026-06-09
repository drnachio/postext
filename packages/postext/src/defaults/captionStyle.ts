import type {
  CaptionStyleConfig,
  ResolvedCaptionStyleConfig,
  ResolvedBodyTextConfig,
} from '../types';
import { dimensionsEqual } from './shared';

/** Static caption defaults independent of body text. */
const STATIC_DEFAULTS = {
  align: 'left' as const,
  // 0.75em ≈ half the 1.5em line height — matches the previous caption gap.
  gap: { value: 0.75, unit: 'em' as const },
  labelBold: true,
  labelItalic: false,
  descriptionItalic: false,
} satisfies Partial<ResolvedCaptionStyleConfig>;

/** Resolve a partial caption-style config. Font family, size, and colour (and
 *  thus the label colour) inherit the resolved body text when unset, so a
 *  document with no caption config renders exactly as before. */
export function resolveCaptionStyleConfig(
  partial: CaptionStyleConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedCaptionStyleConfig {
  const p = partial ?? {};
  const color = p.color ?? bodyText.color;
  return {
    fontFamily: p.fontFamily ?? bodyText.fontFamily,
    fontSize: p.fontSize ?? bodyText.fontSize,
    color,
    align: p.align ?? STATIC_DEFAULTS.align,
    gap: p.gap ?? STATIC_DEFAULTS.gap,
    labelBold: p.labelBold ?? STATIC_DEFAULTS.labelBold,
    labelItalic: p.labelItalic ?? STATIC_DEFAULTS.labelItalic,
    labelColor: p.labelColor ?? color,
    descriptionItalic: p.descriptionItalic ?? STATIC_DEFAULTS.descriptionItalic,
  };
}

/** Drop fields equal to their static default; inherited font/colour fields are
 *  kept whenever explicitly set. Returns `undefined` when nothing remains. */
export function stripCaptionStyleDefaults(
  captionStyle: CaptionStyleConfig | undefined,
): CaptionStyleConfig | undefined {
  if (!captionStyle) return undefined;
  const r: CaptionStyleConfig = {};
  let has = false;

  if (captionStyle.fontFamily !== undefined) { r.fontFamily = captionStyle.fontFamily; has = true; }
  if (captionStyle.fontSize !== undefined) { r.fontSize = captionStyle.fontSize; has = true; }
  if (captionStyle.color !== undefined) { r.color = captionStyle.color; has = true; }
  if (captionStyle.labelColor !== undefined) { r.labelColor = captionStyle.labelColor; has = true; }
  if (captionStyle.align !== undefined && captionStyle.align !== STATIC_DEFAULTS.align) { r.align = captionStyle.align; has = true; }
  if (captionStyle.gap !== undefined && !dimensionsEqual(captionStyle.gap, STATIC_DEFAULTS.gap)) { r.gap = captionStyle.gap; has = true; }
  if (captionStyle.labelBold !== undefined && captionStyle.labelBold !== STATIC_DEFAULTS.labelBold) { r.labelBold = captionStyle.labelBold; has = true; }
  if (captionStyle.labelItalic !== undefined && captionStyle.labelItalic !== STATIC_DEFAULTS.labelItalic) { r.labelItalic = captionStyle.labelItalic; has = true; }
  if (captionStyle.descriptionItalic !== undefined && captionStyle.descriptionItalic !== STATIC_DEFAULTS.descriptionItalic) { r.descriptionItalic = captionStyle.descriptionItalic; has = true; }

  return has ? r : undefined;
}
