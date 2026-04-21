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
  return `${text}\0${font}\0${maxWidthPx}\0${lineHeightPx}\0${options?.textAlign ?? ''}\0${options?.hyphenate ?? ''}\0${options?.firstLineIndentPx ?? ''}\0${options?.hangingIndent ?? ''}\0${options?.optimal ?? ''}\0${options?.maxStretchRatio ?? ''}\0${options?.minShrinkRatio ?? ''}\0${options?.runtPenalty ?? ''}\0${options?.runtMinCharacters ?? ''}`;
}

function buildRichCacheKey(
  spans: InlineSpan[],
  fonts: [string, string, string, string],
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): string {
  const spanKey = spans.map((s) => `${s.text}|${s.bold}|${s.italic}`).join('\x01');
  return `R\0${spanKey}\0${fonts[0]}\0${fonts[1]}\0${fonts[2]}\0${fonts[3]}\0${maxWidthPx}\0${lineHeightPx}\0${options?.textAlign ?? ''}\0${options?.hyphenate ?? ''}\0${options?.firstLineIndentPx ?? ''}\0${options?.hangingIndent ?? ''}\0${options?.optimal ?? ''}\0${options?.maxStretchRatio ?? ''}\0${options?.minShrinkRatio ?? ''}\0${options?.runtPenalty ?? ''}\0${options?.runtMinCharacters ?? ''}`;
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
