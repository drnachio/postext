/**
 * Inline chips (`:chip[text]{style="…"}`): resolve each chip span's style
 * into the px / hex box the rich-text measurer lays out (see
 * `measure/rich.ts`). The measurer knows neither the DPI nor the chip
 * styles, so every text path — body blocks, table cells, captions, notes —
 * runs its spans through {@link resolveChipSpans} with the font size of the
 * text the chips sit in.
 *
 * The same pass resolves the character styles (`:span[…]{style="id"}`) of
 * the spans into the face the measurer sets them in
 * (`InlineCharStyle.look`): their em sizes are read against the same text.
 */

import type { ChipBox, InlineSpan, CharStyleLook, InlineLink } from '../../parse/index.js';
import type { ResolvedChipStyleConfig, ResolvedCharacterStyleConfig } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { pickChipStyle } from '../../defaults/text/chipStyles.js';
import { dimensionToPx } from '../../units.js';
import { INLINE_CODE_CHIP_STYLE } from '../code/codeInline.js';
import { resolveTextDots } from '../../paint/textDots.js';
import { pickCharacterStyle } from '../../defaults/text/characterStyles.js';
import { resolvedLocale } from '../config.js';

/** What chip resolution needs from the resolved config. */
export interface ChipContext {
  styles: readonly ResolvedChipStyleConfig[];
  /** The character styles (`:span[…]{style="id"}`). */
  characterStyles?: readonly ResolvedCharacterStyleConfig[];
  /** The document's language: the case rules a style set in capitals
   *  follows. */
  locale?: string;
  dpi: number;
}

export function chipContextOf(resolved: Pick<ResolvedConfig, 'chipStyles' | 'page'> & Partial<Pick<ResolvedConfig, 'characterStyles' | 'locale' | 'bodyText'>>): ChipContext {
  const styles = resolved.characterStyles ?? [];
  return {
    styles: resolved.chipStyles ?? [],
    characterStyles: styles,
    ...(styles.length > 0 && resolved.bodyText ? { locale: resolvedLocale(resolved as ResolvedConfig) } : {}),
    dpi: resolved.page.dpi,
  };
}

/** What a character style changes in the face of a run set in text of
 *  `baseFontSizePx` (see `CharStyleLook`): em sizes read against that
 *  text. The colour is no part of it: it is painted once the document is
 *  laid out (`marks/characterStyles.ts`), so it never moves a line. */
export function resolveCharStyleLook(style: ResolvedCharacterStyleConfig, dpi: number, baseFontSizePx: number): CharStyleLook {
  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSizePx: Math.max(1, dimensionToPx(style.fontSize, dpi, baseFontSizePx)) } : {}),
    ...(style.fontWeight !== undefined ? { fontWeight: style.fontWeight } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.letterSpacing ? { letterSpacingPx: dimensionToPx(style.letterSpacing, dpi, baseFontSizePx) } : {}),
    ...(style.smallCaps ? { smallCaps: true } : {}),
    ...(style.textTransform === 'uppercase' ? { uppercase: true } : {}),
  };
}

/** `text` in capitals by the case rules of `locale` (`i` → `İ` in
 *  Turkish), the same length as `text`, so the source map and the plain
 *  text hold character for character: the whole text at once when its
 *  capitals keep its length, else one character at a time, a character
 *  whose capital is longer (`ß` → `SS`) kept as it is. */
export function uppercaseInLocale(text: string, locale: string | undefined): string {
  const upper = (s: string): string => {
    try {
      return locale ? s.toLocaleUpperCase(locale) : s.toUpperCase();
    } catch {
      return s.toUpperCase();
    }
  };
  const whole = upper(text);
  if (whole.length === text.length) return whole;
  let out = '';
  for (const ch of text) {
    const up = upper(ch);
    out += up.length === ch.length ? up : ch;
  }
  return out;
}

/** The numbers a character style's band takes among the highlight marks
 *  of its text (`InlineLink.mark.id`): far above the marks written
 *  `:mark[…]`, which count from 1. */
const STYLE_MARK_BASE = 1_000_000;

/** A span of a character style with its look attached: set in capitals
 *  when the style says so (`charStyle.source` keeps the letters as
 *  written, which copying and assistive technology read), in small
 *  capitals, and inside the highlight mark the style names. A style no
 *  `characterStyles` entry names leaves the span as it is. */
function withCharStyleLook(span: InlineSpan, ctx: ChipContext, baseFontSizePx: number): InlineSpan {
  const run = span.charStyle!;
  const style = pickCharacterStyle(ctx.characterStyles ?? [], run.style);
  if (!style) return span;
  const look = resolveCharStyleLook(style, ctx.dpi, baseFontSizePx);
  let text = span.text;
  let source: string | undefined;
  if (look.uppercase) {
    text = uppercaseInLocale(span.text, ctx.locale);
    if (text !== span.text) source = span.text;
  }
  let links = span.links;
  if (style.mark !== undefined && span.text.length > 0) {
    const band: InlineLink = { start: 0, end: span.text.length, href: '', mark: { style: style.mark, id: STYLE_MARK_BASE + run.id } };
    links = [...(links ?? []), band];
  }
  return {
    ...span,
    text,
    ...(links ? { links } : {}),
    ...(look.smallCaps ? { smallCaps: true } : {}),
    charStyle: { ...run, look, ...(source !== undefined ? { source } : {}) },
  };
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
