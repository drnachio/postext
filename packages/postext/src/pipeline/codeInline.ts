/**
 * Inline code in a code face (#624, `codeStyle.inline`): the characters of
 * a block's `` `x` `` spans (`ContentBlock.inlineCode`, source ranges)
 * become chips set in the code face, at the size, colour and fill the
 * style gives, each one unit as a chip is. A chip span keeps the code's
 * characters as its text, so the block's plain text and source map stay
 * as they are. Without `codeStyle.inline` inline code is set in the text's
 * face, as before #624.
 */

import type { ChipBox, ContentBlock, InlineSpan } from '../parse';
import type { ResolvedConfig } from '../vdt';
import { sliceSpan } from '../parse/links';
import { setsObject } from '../measure/rich';
import { dimensionToPx } from '../units';

/** Style id of an inline code chip: no chip style can name it. */
export const INLINE_CODE_CHIP_STYLE = '__postext-code';

/** The chip box of inline code in text of `fontSizePx`. */
function inlineCodeBox(resolved: ResolvedConfig, fontSizePx: number): ChipBox | undefined {
  const inline = resolved.codeStyle?.inline;
  if (!inline) return undefined;
  const dpi = resolved.page.dpi;
  const sizePx = dimensionToPx(inline.fontSize, dpi, fontSizePx);
  const px = (d: Parameters<typeof dimensionToPx>[0]) => Math.max(0, dimensionToPx(d, dpi, sizePx));
  const borderWidthPx = inline.borderColor ? px(inline.borderWidth) : 0;
  return {
    styleId: INLINE_CODE_CHIP_STYLE,
    fontFamily: inline.fontFamily,
    fontSizePx: sizePx,
    bold: inline.bold,
    italic: inline.italic,
    ...(inline.color ? { color: inline.color.hex } : {}),
    ...(inline.background ? { background: inline.background.hex } : {}),
    ...(borderWidthPx > 0 && inline.borderColor ? { borderColor: inline.borderColor.hex } : {}),
    borderWidthPx,
    borderRadiusPx: px(inline.borderRadius),
    paddingXPx: px(inline.paddingX),
    paddingYPx: px(inline.paddingY),
    gapPx: 0,
  };
}

/**
 * `block` (the block being measured: `raw` with its heading number, its
 * capitals…) with the characters of its inline code set as code chips,
 * when `codeStyle.inline` is set and the block has inline code. `raw` is
 * the parsed block, whose source map tells which characters were written
 * between backticks.
 */
export function withInlineCode(block: ContentBlock, raw: ContentBlock, resolved: ResolvedConfig, fontSizePx: number): ContentBlock {
  const ranges = raw.inlineCode;
  if (!ranges || ranges.length === 0 || !resolved.codeStyle?.inline) return block;
  const box = inlineCodeBox(resolved, fontSizePx);
  if (!box) return block;
  const prefix = block.text.length - raw.text.length;
  const map = raw.sourceMap;
  const isCode = (p: number): boolean => {
    const i = p - prefix;
    if (i < 0 || i >= map.length) return false;
    const at = map[i]!;
    return ranges.some((r) => at >= r.start && at < r.end);
  };
  const out: InlineSpan[] = [];
  let at = 0;
  let changed = false;
  for (const span of block.spans) {
    const len = span.text.length;
    if (setsObject(span) || span.tab || span.inserted || len === 0) {
      out.push(span);
      at += len;
      continue;
    }
    let k = 0;
    while (k < len) {
      const code = isCode(at + k);
      let j = k + 1;
      while (j < len && isCode(at + j) === code) j++;
      if (!code) {
        out.push(k === 0 && j === len ? span : sliceSpan(span, k, j));
      } else {
        const text = span.text.slice(k, j);
        out.push({ text, bold: span.bold, italic: span.italic, chip: { style: INLINE_CODE_CHIP_STYLE, spans: [{ text, bold: false, italic: false }], box } });
        changed = true;
      }
      k = j;
    }
    at += len;
  }
  return changed ? { ...block, spans: out } : block;
}
