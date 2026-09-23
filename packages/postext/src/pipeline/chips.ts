/**
 * Inline chips (`:chip[text]{style="…"}`): resolve each chip span's style
 * into the px / hex box the rich-text measurer lays out (see
 * `measure/rich.ts`). The measurer knows neither the DPI nor the chip
 * styles, so every text path — body blocks, table cells, captions, notes —
 * runs its spans through {@link resolveChipSpans} with the font size of the
 * text the chips sit in.
 */

import type { ChipBox, InlineSpan } from '../parse';
import type { ResolvedChipStyleConfig } from '../types';
import type { ResolvedConfig } from '../vdt';
import { pickChipStyle } from '../defaults/chipStyles';
import { dimensionToPx } from '../units';

/** What chip resolution needs from the resolved config. */
export interface ChipContext {
  styles: readonly ResolvedChipStyleConfig[];
  dpi: number;
}

export function chipContextOf(resolved: Pick<ResolvedConfig, 'chipStyles' | 'page'>): ChipContext {
  return { styles: resolved.chipStyles ?? [], dpi: resolved.page.dpi };
}

/** The box of a chip set in text of `baseFontSizePx`: an em `fontSize` is
 *  read against that text, the box lengths against the chip's own size. */
export function resolveChipBox(style: ResolvedChipStyleConfig, dpi: number, baseFontSizePx: number): ChipBox {
  const fontSizePx = style.fontSize ? dimensionToPx(style.fontSize, dpi, baseFontSizePx) : baseFontSizePx;
  const px = (d: Parameters<typeof dimensionToPx>[0]) => Math.max(0, dimensionToPx(d, dpi, fontSizePx));
  const borderWidthPx = px(style.borderWidth);
  return {
    styleId: style.id,
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    fontSizePx,
    bold: style.bold,
    italic: style.italic,
    ...(style.color ? { color: style.color.hex } : {}),
    ...(style.backgroundEnabled ? { background: style.background.hex } : {}),
    ...(borderWidthPx > 0 ? { borderColor: style.borderColor.hex } : {}),
    borderWidthPx,
    borderRadiusPx: px(style.borderRadius),
    paddingXPx: px(style.paddingX),
    paddingYPx: px(style.paddingY),
    gapPx: px(style.gap),
  };
}

/** The px size of a CSS font shorthand (`16px` when it has none). */
export function fontSizePxOf(fontString: string): number {
  const m = /(\d*\.?\d+)px/.exec(fontString);
  return m ? parseFloat(m[1]!) : 16;
}

/** Attach the resolved box to every chip span (the style its `style` id
 *  names, else the first chip style). Spans without a chip pass through;
 *  with no chip style at all a chip keeps no box and sets as bare text. */
export function resolveChipSpans(spans: InlineSpan[], ctx: ChipContext, baseFontSizePx: number): InlineSpan[] {
  if (!spans.some((s) => s.chip)) return spans;
  return spans.map((span) => {
    if (!span.chip) return span;
    const style = pickChipStyle(ctx.styles, span.chip.style);
    if (!style) return span;
    return { ...span, chip: { ...span.chip, box: resolveChipBox(style, ctx.dpi, baseFontSizePx) } };
  });
}
