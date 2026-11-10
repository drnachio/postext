/**
 * Inline chips (`:chip[text]{style="…"}`): resolve each chip span's style
 * into the px / hex box the rich-text measurer lays out (see
 * `measure/rich.ts`). The measurer knows neither the DPI nor the chip
 * styles, so every text path — body blocks, table cells, captions, notes —
 * runs its spans through {@link resolveChipSpans} with the font size of the
 * text the chips sit in.
 *
 * The same pass resolves the character styles (`[some words]|id|`) of the
 * spans into the face the measurer sets them in (`InlineCharStyle.look`):
 * their em sizes are read against the same text.
 */

import type { ChipBox, InlineSpan, CharStyleLook } from '../../parse/index.js';
import type { ResolvedChipStyleConfig, ResolvedCharacterStyleConfig } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { pickChipStyle } from '../../defaults/text/chipStyles.js';
import { dimensionToPx } from '../../units.js';
import { INLINE_CODE_CHIP_STYLE } from '../code/codeInline.js';
import { resolveTextDots } from '../../paint/textDots.js';
import { pickCharacterStyle } from '../../defaults/text/characterStyles.js';

/** What chip resolution needs from the resolved config. */
export interface ChipContext {
  styles: readonly ResolvedChipStyleConfig[];
  /** The character styles (`[…]|id|`). */
  characterStyles?: readonly ResolvedCharacterStyleConfig[];
  dpi: number;
}

export function chipContextOf(resolved: Pick<ResolvedConfig, 'chipStyles' | 'page'> & Partial<Pick<ResolvedConfig, 'characterStyles'>>): ChipContext {
  return { styles: resolved.chipStyles ?? [], characterStyles: resolved.characterStyles ?? [], dpi: resolved.page.dpi };
}

/** What a character style changes in the face of a run set in text of
 *  `baseFontSizePx` (see `CharStyleLook`): em sizes read against that
 *  text. */
export function resolveCharStyleLook(style: ResolvedCharacterStyleConfig, dpi: number, baseFontSizePx: number): CharStyleLook {
  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSizePx: Math.max(1, dimensionToPx(style.fontSize, dpi, baseFontSizePx)) } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.color ? { color: style.color.hex } : {}),
    ...(style.letterSpacing ? { letterSpacingPx: dimensionToPx(style.letterSpacing, dpi, baseFontSizePx) } : {}),
    ...(style.smallCaps ? { smallCaps: true } : {}),
    ...(style.textTransform === 'uppercase' ? { uppercase: true } : {}),
  };
}

/** A span of a character style with its look attached: set in capitals
 *  when the style says so (a letter whose capital is longer, `ß`, is kept,
 *  so the text keeps its length and its source map), and in small
 *  capitals. A style no `characterStyles` entry names leaves the span as
 *  it is. */
function withCharStyleLook(span: InlineSpan, ctx: ChipContext, baseFontSizePx: number): InlineSpan {
  const run = span.charStyle!;
  const style = pickCharacterStyle(ctx.characterStyles ?? [], run.style);
  if (!style) return span;
  const look = resolveCharStyleLook(style, ctx.dpi, baseFontSizePx);
  let text = span.text;
  if (look.uppercase) text = [...text].map((c) => (c.toUpperCase().length === c.length ? c.toUpperCase() : c)).join('');
  return { ...span, text, ...(look.smallCaps ? { smallCaps: true } : {}), charStyle: { ...run, look } };
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
    // Only when set, so a box without them keeps its cache key.
    ...(style.paddingTop ? { paddingTopPx: px(style.paddingTop) } : {}),
    ...(style.paddingBottom ? { paddingBottomPx: px(style.paddingBottom) } : {}),
    gapPx: px(style.gap),
    ...(style.dotted ? { dotted: resolveTextDots(style.dotted, dpi, fontSizePx) } : {}),
    ...(style.underline ? { underline: style.underline } : {}),
    ...(style.minWidth ? { minWidthPx: px(style.minWidth) } : {}),
  };
}

/** The px size of a CSS font shorthand (`16px` when it has none). */
export function fontSizePxOf(fontString: string): number {
  // A match starts only where a number starts (the lookbehind), so a long
  // run of digits is read once, not once per digit (CodeQL polynomial ReDoS).
  const m = /(?<![\d.])(\d+(?:\.\d+)?|\.\d+)px/.exec(fontString);
  return m ? parseFloat(m[1]!) : 16;
}

/** Attach the resolved box to every chip span (the style its `style` id
 *  names, else the first chip style). Spans without a chip pass through;
 *  with no chip style at all a chip keeps no box and sets as bare text. */
export function resolveChipSpans(spans: InlineSpan[], ctx: ChipContext, baseFontSizePx: number): InlineSpan[] {
  if (!spans.some((s) => s.chip || s.charStyle)) return spans;
  return spans.map((span) => {
    if (span.charStyle && !span.charStyle.look) span = withCharStyleLook(span, ctx, baseFontSizePx);
    if (!span.chip) return span;
    // Inline code set as a chip (#624) carries its own box.
    if (span.chip.box && span.chip.style === INLINE_CODE_CHIP_STYLE) return span;
    const style = pickChipStyle(ctx.styles, span.chip.style);
    if (!style) return span;
    return { ...span, chip: { ...span.chip, box: resolveChipBox(style, ctx.dpi, baseFontSizePx) } };
  });
}
