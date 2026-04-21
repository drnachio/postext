import type { InlineSpan } from '../parse';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from './types';
import { measureBlock } from './plain';
import { measureRichBlock } from './rich';

function buildPlainCacheKey(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): string {
  return `${text}\x00${font}\x00${maxWidthPx}\x00${lineHeightPx}\x00${options?.textAlign ?? ''}\x00${options?.hyphenate ?? ''}\x00${options?.firstLineIndentPx ?? ''}\x00${options?.hangingIndent ?? ''}\x00${options?.optimal ?? ''}\x00${options?.maxStretchRatio ?? ''}\x00${options?.minShrinkRatio ?? ''}\x00${options?.runtPenalty ?? ''}\x00${options?.runtMinCharacters ?? ''}`;
}

function buildRichCacheKey(
  spans: InlineSpan[],
  fonts: [string, string, string, string],
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): string {
  const spanKey = spans.map((s) => `${s.text}|${s.bold}|${s.italic}`).join('\x01');
  return `R\x00${spanKey}\x00${fonts[0]}\x00${fonts[1]}\x00${fonts[2]}\x00${fonts[3]}\x00${maxWidthPx}\x00${lineHeightPx}\x00${options?.textAlign ?? ''}\x00${options?.hyphenate ?? ''}\x00${options?.firstLineIndentPx ?? ''}\x00${options?.hangingIndent ?? ''}\x00${options?.optimal ?? ''}\x00${options?.maxStretchRatio ?? ''}\x00${options?.minShrinkRatio ?? ''}\x00${options?.runtPenalty ?? ''}\x00${options?.runtMinCharacters ?? ''}`;
}

function cloneMeasuredBlock(block: MeasuredBlock): MeasuredBlock {
  return {
    lines: block.lines.map((l) => ({
      ...l,
      bbox: { ...l.bbox },
      segments: l.segments ? l.segments.map((s) => ({ ...s })) : undefined,
    })),
    totalHeight: block.totalHeight,
  };
}

export function cachedMeasureBlock(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
  cache: MeasurementCache,
): MeasuredBlock {
  const key = buildPlainCacheKey(text, font, maxWidthPx, lineHeightPx, options);
  const cached = cache._blocks.get(key);
  if (cached) return cloneMeasuredBlock(cached);
  const result = measureBlock(text, font, maxWidthPx, lineHeightPx, options);
  cache._blocks.set(key, result);
  return cloneMeasuredBlock(result);
}

export function cachedMeasureRichBlock(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
  cache: MeasurementCache,
): MeasuredBlock {
  const key = buildRichCacheKey(spans, [normalFont, boldFont, italicFont, boldItalicFont], maxWidthPx, lineHeightPx, options);
  const cached = cache._blocks.get(key);
  if (cached) return cloneMeasuredBlock(cached);
  const result = measureRichBlock(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
  cache._blocks.set(key, result);
  return cloneMeasuredBlock(result);
}
