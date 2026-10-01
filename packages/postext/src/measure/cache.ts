import type { InlineSpan } from '../parse';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from './types';
import { measureBlock } from './plain';
import { measureRichBlock } from './rich';
import { getHyphenationLocale } from '../hyphenate';
import { hasCJK } from './cjk';
import { getCjkLineBreak } from './cjkClasses';
import { getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode } from './vertical';
import { cjkCompositionKey, getCjkComposition } from './cjkPunctuation';

/** Options that change a block's lines, joined into its cache key. The
 *  active hyphenation dictionary is one: soft hyphens (and the syllables an
 *  overlong word is divided at) depend on it. */
function optionsKey(options: MeasureBlockOptions | undefined): string {
  return `${options?.textAlign ?? ''}\x00${options?.hyphenate ?? ''}\x00${options?.firstLineIndentPx ?? ''}\x00${options?.hangingIndent ?? ''}\x00${options?.optimal ?? ''}\x00${options?.maxStretchRatio ?? ''}\x00${options?.minShrinkRatio ?? ''}\x00${options?.runtPenalty ?? ''}\x00${options?.runtMinCharacters ?? ''}\x00${options?.looseness ?? ''}\x00${options?.letterSpacingPx ?? ''}\x00${options?.hyphenationZonePx ?? ''}\x00${getHyphenationLocale()}${options?.justifyTrackingPx ? `\x00${options.justifyTrackingPx}` : ''}${options?.runtGraded ? '\x00rg' : ''}${options?.avoidHyphenAtLines?.length ? `\x00ah${options.avoidHyphenAtLines.join(',')}` : ''}`;
}

/** The CJK line-break level and composition (punctuation widths, hanging,
 *  the Han–Latin space), joined to the key of a text that holds CJK only,
 *  so every other key is unchanged; and the vertical writing mode (with the
 *  region whose cells it measures), which gives every character that stands
 *  in a cell its cell (`verticalTextWidth`) — CJK or not. */
function cjkKey(text: string, options: MeasureBlockOptions | undefined): string {
  const vertical = (options?.writingMode ?? getMeasureWritingMode()) === 'vertical-rl';
  // Short numbers set in one cell (`cjk.uprightDigits`) join the key only
  // when they are not the default two digits.
  const digits = getMeasureUprightDigits();
  const v = vertical ? `:v:${getMeasureRegion()}${digits !== 2 ? `:d${digits}` : ''}` : '';
  if (!hasCJK(text)) return vertical ? `\x00${v}` : '';
  return `\x00cjk:${options?.cjkLineBreak ?? getCjkLineBreak()}:${cjkCompositionKey(options?.cjkComposition ?? getCjkComposition())}${v}`;
}

function buildPlainCacheKey(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): string {
  return `${text}\x00${font}\x00${maxWidthPx}\x00${lineHeightPx}\x00${optionsKey(options)}${cjkKey(text, options)}`;
}

/** A chip is one placeholder char in the span text: its words and resolved
 *  box decide its measure, so they join the key. */
function chipCacheKey(chip: NonNullable<InlineSpan['chip']>): string {
  const words = chip.spans.map((s) => `${s.text}~${s.bold}~${s.italic}~${s.script ?? ''}${s.smallCaps ? '~sc' : ''}`).join('~');
  return `|chip:${words}|${chip.box ? JSON.stringify(chip.box) : ''}`;
}

/** A formula is one placeholder char in the span text too: its TeX decides
 *  what is painted, and its render's size (which follows the maths font
 *  scale, or is a placeholder's before the engine is ready) its measure. */
function mathCacheKey(span: InlineSpan): string {
  const render = span.mathRender;
  return `|m:${span.math!.tex}${render ? `|${render.widthPx}x${render.heightPx}` : ''}`;
}

/** The Chinese annotations of a span (#193–#195): marks set on the same
 *  text change its segments, a reading or a note its measure. Empty for a
 *  span without any, so its key is unchanged. */
function annotationCacheKey(s: InlineSpan): string {
  if (!s.emphasisMark && s.properName === undefined && !s.bookTitle && !s.ruby && !s.warichu && !s.inserted) return '';
  let key = '';
  if (s.emphasisMark) key += `|em:${s.emphasisMark.style ?? ''}:${s.emphasisMark.fill ?? ''}:${s.emphasisMark.position ?? ''}`;
  if (s.properName !== undefined) key += `|pn:${s.properName}`;
  if (s.bookTitle) key += `|bt:${s.bookTitle.id}.${s.bookTitle.depth}`;
  if (s.ruby) key += `|rb:${s.ruby.text}|${s.ruby.group ? 'g' : 'm'}|${s.ruby.position ?? ''}|${s.ruby.fontString ?? ''}|${s.ruby.color ?? ''}|${s.ruby.id}`;
  if (s.warichu) key += `|wc:${s.warichu.id}|${s.warichu.fontString ?? ''}|${s.warichu.open ?? ''}|${s.warichu.close ?? ''}|${s.warichu.color ?? ''}`;
  if (s.inserted) key += '|ins';
  return key;
}

function buildRichCacheKey(
  spans: InlineSpan[],
  fonts: [string, string, string, string],
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): string {
  // Script and small-caps marks change the measure of the same text, and a
  // formula or a swatch colour what a placeholder paints: they join the key
  // only when set, so the common keys are unchanged.
  const spanKey = spans.map((s) => `${s.text}|${s.bold}|${s.italic}|${s.ref?.resourceId ?? ''}${s.footnote ? `|fn:${s.footnote.id}${s.footnote.scale !== undefined ? `@${s.footnote.scale}` : ''}` : ''}${s.chip ? chipCacheKey(s.chip) : ''}${s.math ? mathCacheKey(s) : ''}${s.swatch ? `|sw:${s.swatch.color}` : ''}${s.script ? `|${s.script}` : ''}${s.smallCaps ? '|sc' : ''}${s.combineUpright ? '|tcy' : ''}${s.orientation === 'upright' ? '|up' : s.orientation === 'sideways' ? '|side' : ''}${annotationCacheKey(s)}`).join('\x01');
  return `R\x00${spanKey}\x00${fonts[0]}\x00${fonts[1]}\x00${fonts[2]}\x00${fonts[3]}\x00${maxWidthPx}\x00${lineHeightPx}\x00${optionsKey(options)}${cjkKey(spanKey, options)}${cjkLinkKey(spans, spanKey)}`;
}

/** The ranges of the Markdown links of a text that holds CJK: the CJK
 *  composer gives linked characters segments of their own. Empty for any
 *  other text, so its key is unchanged. */
function cjkLinkKey(spans: InlineSpan[], spanKey: string): string {
  if (!spans.some((s) => s.links !== undefined && s.links.length > 0) || !hasCJK(spanKey)) return '';
  return `\x00ln:${spans.map((s) => (s.links ?? []).map((l) => `${l.start}-${l.end}`).join(',')).join(';')}`;
}

/** A cached result must read exactly like a fresh measure: the block's own
 *  fields (`totalHeight`, `lastLineRunt`, whatever it gains) are carried
 *  whole, and only the lines — which the pipeline shifts and stamps — are
 *  copied. */
function cloneMeasuredBlock(block: MeasuredBlock): MeasuredBlock {
  return {
    ...block,
    lines: block.lines.map((l) => ({
      ...l,
      bbox: { ...l.bbox },
      segments: l.segments ? l.segments.map((s) => ({ ...s })) : undefined,
    })),
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
