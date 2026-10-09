import type { InlineSpan } from '../parse';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from './types';
import { measureBlock } from './plain';
import { measureRichBlock } from './rich';
import { cachedMeasureBlock as cachedPlainBlock, cachedMeasureRichBlock as cachedRichBlock } from './cache';
import { hasCompound } from './breakRules';

export type { BreakTrace, LineInsetStep, LineWidthStep, MeasuredBlock, MeasurementCache, MeasureBlockOptions } from './types';
export { lineIndentAt, maxLineIndent } from './types';
export { buildFontString, initHyphenator, clearMeasurementCache, createMeasurementCache } from './font';
export { measureGlyphWidth, measureTextWidth } from './canvas';
export { measureBlock } from './plain';
export { measureRichBlock } from './rich';
export { setCjkLineBreak, getCjkLineBreak } from './cjkClasses';
export { setCjkComposition, getCjkComposition, cjkCompositionOf, cjkCompositionKey, punctuationAdvance, punctuationSide, PLAIN_CJK_COMPOSITION } from './cjkPunctuation';
export type { CjkComposition, PunctuationSide } from './cjkPunctuation';

/** The caches that hold measurements made with the line-breaking options
 *  added after postext 1.4 (`breakAfterDashes`, `optimalRagged`,
 *  `breakAfterHyphens`, `hyphenateCompounds: false`, `repeatHyphen`), per
 *  cache and per combination of them. `measure/cache.ts` keys a block on
 *  the options it knew; a block measured with one of these goes to a cache
 *  of its own, so each combination keeps its own lines and the keys of the
 *  others are unchanged. A worker that drops its cache for a fresh one
 *  drops these with it. */
const optionVariants = new WeakMap<MeasurementCache, Map<string, MeasurementCache>>();

const DASH_RE = /[\u2013\u2014]/;

/** The cache for a measurement of `text` with `options`. An option that
 *  cannot change these lines (no dash or compound in the text, justified or
 *  first-fit text, hyphenation off) leaves it in the shared one. */
function cacheFor(cache: MeasurementCache, options: MeasureBlockOptions | undefined, text: string): MeasurementCache {
  const dashes = options?.breakAfterDashes === true && DASH_RE.test(text);
  const ragged = options?.optimalRagged === true && options.optimal === true && (options.textAlign ?? 'left') !== 'justify';
  const compound = (options?.breakAfterHyphens === true || options?.repeatHyphen === true
    || (options?.hyphenateCompounds === false && options.hyphenate === true)) && hasCompound(text);
  const hyphens = compound && options?.breakAfterHyphens === true;
  const whole = compound && options?.hyphenateCompounds === false && options.hyphenate === true;
  const repeat = compound && options?.repeatHyphen === true;
  const variant = `${dashes ? 'd' : ''}${ragged ? 'r' : ''}${hyphens ? 'h' : ''}${whole ? 'w' : ''}${repeat ? 'p' : ''}`;
  if (variant === '') return cache;
  let byVariant = optionVariants.get(cache);
  if (!byVariant) {
    byVariant = new Map();
    optionVariants.set(cache, byVariant);
  }
  let own = byVariant.get(variant);
  if (!own) {
    own = { _blocks: new Map() };
    byVariant.set(variant, own);
  }
  return own;
}

/** {@link measureBlock} through `cache`: the same text, font, width,
 *  leading and options measured before come back from it (a copy). A
 *  measurement with `options.keepBreaks`, `options.restWidths` or
 *  `options.lineInsets` is never cached, since its lines follow the breaks it keeps or the measures it
 *  was given: it is measured afresh and leaves the cache as it was. One
 *  with `breakAfterDashes`, `optimalRagged`, `breakAfterHyphens`,
 *  `hyphenateCompounds: false` or `repeatHyphen` is kept apart from the
 *  others, one set per combination of them. */
export function cachedMeasureBlock(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
  cache: MeasurementCache,
): MeasuredBlock {
  return options?.keepBreaks || options?.restWidths || options?.lineInsets
    ? measureBlock(text, font, maxWidthPx, lineHeightPx, options)
    : cachedPlainBlock(text, font, maxWidthPx, lineHeightPx, options, cacheFor(cache, options, text));
}

/** {@link measureRichBlock} through `cache`, as {@link cachedMeasureBlock}
 *  does it: a measurement with `options.keepBreaks` or
 *  `options.restWidths` is never cached. */
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
  return options?.keepBreaks || options?.restWidths || options?.lineInsets
    ? measureRichBlock(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options)
    : cachedRichBlock(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options, cacheFor(cache, options, spans.map((s) => s.text).join('')));
}
