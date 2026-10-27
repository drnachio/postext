import type { InlineSpan } from '../parse/index.js';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from './types.js';
import { measureBlock } from './plain.js';
import { measureRichBlock, measureRichSnippet } from './rich.js';
import { getHyphenationLocale, getHyphenationRulesKey } from '../hyphenation/hyphenate.js';
import { hasCJK } from './cjk/cjk.js';
import { getCjkLineBreak } from './cjk/cjkClasses.js';
import { getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode } from './vertical.js';
import { cjkCompositionKey, getCjkComposition } from './cjk/cjkPunctuation.js';
import { getMeasureArabicNumbers, getMeasureDirection } from './rtl/bidiLines.js';
import { evictionsSince, measurementGeneration, measureLanguageKey } from './canvas.js';
import { scriptContextKey } from './script.js';
import { getSlashBreaks } from './breakRules.js';

/** Options that change a block's lines, joined into its cache key. The
 *  active hyphenation dictionary is one: soft hyphens (and the syllables an
 *  overlong word is divided at) depend on it. So is a right-to-left base
 *  direction (`MeasureBlockOptions.direction`, else the build's), which
 *  joins the key only when set, so every left-to-right key is unchanged;
 *  and the Arabic reading of leading numbers (#665), in the documents
 *  that have it; and the script a word with no letter falls back on
 *  (#725), in the documents whose language is not written in Latin
 *  letters or that switch the rule off; and the breaks after a slash
 *  (#1164), in the documents that switch them off. */
function optionsKey(options: MeasureBlockOptions | undefined): string {
  return `${(options?.direction ?? getMeasureDirection()) === 'rtl' ? 'rtl\x00' : ''}${getMeasureArabicNumbers() ? 'an\x00' : ''}${scriptContextKey()}${measureLanguageKey()}${options?.textAlign ?? ''}\x00${options?.hyphenate ?? ''}\x00${options?.firstLineIndentPx ?? ''}\x00${options?.hangingIndent ?? ''}\x00${options?.optimal ?? ''}\x00${options?.maxStretchRatio ?? ''}\x00${options?.minShrinkRatio ?? ''}\x00${options?.runtPenalty ?? ''}\x00${options?.runtMinCharacters ?? ''}\x00${options?.looseness ?? ''}\x00${options?.letterSpacingPx ?? ''}\x00${options?.hyphenationZonePx ?? ''}\x00${getHyphenationLocale()}${options?.justifyTrackingPx ? `\x00${options.justifyTrackingPx}` : ''}${options?.runtGraded ? '\x00rg' : ''}${options?.labelColumnPx !== undefined ? `\x00lc${options.labelColumnPx}` : ''}${options?.labelLength ? `\x00ll${options.labelLength}` : ''}${options?.numberSeams?.length ? `\x00ns${options.numberSeams.join(',')}` : ''}${options?.avoidHyphenAtLines?.length ? `\x00ah${options.avoidHyphenAtLines.join(',')}` : ''}${options?.kashida ? `\x00k${options.kashida.patterns}:${options.kashida.perWord}:${options.kashida.maxLengthPx}` : ''}${options?.lineIndentsPx?.length ? `\x00li${options.lineIndentsPx.join(',')}` : ''}${options?.tabs ? `\x00tb${JSON.stringify(options.tabs)}` : ''}${hyphenationRulesKey()}${getSlashBreaks() ? '' : '\x00s/'}`;
}

/** The document's hyphenation rules (#699: words kept whole, capitalised
 *  words, cited names), joined to the key only when one is set, so every key
 *  of a document without rules is unchanged. */
function hyphenationRulesKey(): string {
  const key = getHyphenationRulesKey();
  return key === '' ? '' : `\x00hr${key}`;
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
  // A paragraph's own word-break rule joins the key only when it sets one.
  const wb = options?.cjkWordBreak !== undefined ? `:w${options.cjkWordBreak}` : '';
  return `\x00cjk:${options?.cjkLineBreak ?? getCjkLineBreak()}:${cjkCompositionKey(options?.cjkComposition ?? getCjkComposition())}${wb}${v}`;
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
  const words = chip.spans.map((s) => `${s.text}~${s.bold}~${s.italic}~${s.script ?? ''}${s.smallCaps ? '~sc' : ''}${s.textFace ? '~tf' : ''}${s.ruby ? `~r${s.ruby.id}:${s.ruby.text}${s.ruby.group ? 'g' : ''}${s.ruby.position ?? ''}` : ''}`).join('~');
  // An exercise's blank (#1227): its width text, that it is a blank and
  // the slot it answers ride on the measured chip.
  const exercise = chip.widthText !== undefined || chip.blank || chip.exercise || chip.upright
    ? `|ex:${chip.widthText ?? ''}${chip.blank ? `~b~${chip.blankLabel ?? ''}` : ''}${chip.exercise ? `~${chip.exercise.ex}:${chip.exercise.slot}` : ''}${chip.upright ? '~up' : ''}`
    : '';
  return `|chip:${words}|${chip.box ? JSON.stringify(chip.box) : ''}${chip.joinNext ? '|jn' : ''}${exercise}`;
}

/** A formula is one placeholder char in the span text too: its TeX decides
 *  what is painted, and its render's size (which follows the maths font
 *  scale, or is a placeholder's before the engine is ready) its measure. */
function mathCacheKey(span: InlineSpan): string {
  const render = span.mathRender;
  return `|m:${span.math!.tex}${render ? `|${render.widthPx}x${render.heightPx}` : ''}`;
}

/** The Chinese and Japanese annotations of a span (#193–#195, #421, #430):
 *  marks set on the same text change its segments, a reading or a note its
 *  measure. A directional isolate (#367) changes the order of its line.
 *  Empty for a span without any, so its key is unchanged. */
function annotationCacheKey(s: InlineSpan): string {
  if (!s.emphasisMark && s.properName === undefined && !s.bookTitle && !s.ruby && !s.warichu && !s.inserted && !s.direction && !s.sideline && !s.kunten) return '';
  let key = '';
  if (s.emphasisMark) key += `|em:${s.emphasisMark.style ?? ''}:${s.emphasisMark.fill ?? ''}:${s.emphasisMark.position ?? ''}`;
  if (s.properName !== undefined) key += `|pn:${s.properName}`;
  if (s.bookTitle) key += `|bt:${s.bookTitle.id}.${s.bookTitle.depth}`;
  if (s.ruby) {
    const r = s.ruby;
    key += `|rb:${r.text}|${r.group ? 'g' : 'm'}|${r.position ?? ''}|${r.fontString ?? ''}|${r.color ?? ''}|${r.id}`;
    // The Japanese rules (#422): absent on other rubies, whose key stays.
    if (r.jukugo || r.mono || r.align || r.overhang || r.fullKana) key += `|${r.jukugo ? 'j' : ''}${r.mono ? 'o' : ''}:${r.align ?? ''}:${r.overhang ?? ''}:${r.fullKana ? 'f' : ''}`;
  }
  if (s.warichu) key += `|wc:${s.warichu.id}|${s.warichu.fontString ?? ''}|${s.warichu.open ?? ''}|${s.warichu.close ?? ''}|${s.warichu.color ?? ''}`;
  if (s.inserted) key += '|ins';
  for (let d = s.direction; d; d = d.outer) key += `|dir:${d.dir}${d.id}${d.lang ? `:${d.lang}` : ''}`;
  if (s.sideline) key += `|sl:${s.sideline.id}:${s.sideline.style ?? ''}:${s.sideline.position ?? ''}`;
  if (s.kunten) key += `|kt:${s.kunten.id}:${s.kunten.kaeri ?? ''}:${s.kunten.okuri ?? ''}:${s.kunten.tate ? 't' : ''}:${s.kunten.fontString ?? ''}:${s.kunten.color ?? ''}:${s.kunten.placement ?? ''}`;
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
  const spanKey = spans.map((s) => `${s.text}|${s.bold}|${s.italic}|${s.ref?.resourceId ?? ''}${s.ref?.anchor ? `@a${s.ref.pageIndex ?? ''}` : ''}${s.ref?.breakable ? '@b' : ''}${s.footnote ? `|fn:${s.footnote.id}${s.footnote.scale !== undefined ? `@${s.footnote.scale}` : ''}${s.footnote.place ? `:${s.footnote.place}` : ''}` : ''}${s.chip ? chipCacheKey(s.chip) : ''}${s.math ? mathCacheKey(s) : ''}${s.swatch ? `|sw:${s.swatch.color}${s.swatch.icon ? `:${JSON.stringify(s.swatch.icon)}` : ''}${s.swatch.box ? `:${JSON.stringify(s.swatch.box)}` : ''}` : ''}${s.script ? `|${s.script}` : ''}${s.smallCaps ? '|sc' : ''}${s.fixedSpace ? '|fx' : ''}${s.codeSpace ? `|cs:${JSON.stringify(s.codeSpace)}` : ''}${s.labelTab ? `|lt:${s.labelTab}` : ''}${s.tab ? `|tab:${s.tab.px ? JSON.stringify(s.tab.px) : ''}` : ''}${s.combineUpright ? '|tcy' : ''}${s.orientation === 'upright' ? '|up' : s.orientation === 'sideways' ? '|side' : ''}${annotationCacheKey(s)}`).join('\x01');
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

/** Whether a cache key sets text in one of `families` (lower case): the
 *  key holds the font strings it was measured with. A key whose text
 *  names the family counts too, which only costs a measure. */
function keyNamesFamily(key: string, families: ReadonlySet<string>): boolean {
  const lower = key.toLowerCase();
  for (const f of families) if (lower.includes(f)) return true;
  return false;
}

/** `cache`, its blocks measured in faces that changed since it was filled
 *  dropped (#629): a host that keeps its cache across font loads gets
 *  fresh lines without clearing it. A cache not stamped yet is stamped. */
function current(cache: MeasurementCache): MeasurementCache {
  const generation = measurementGeneration();
  if (cache._generation === generation) return cache;
  if (cache._generation !== undefined && cache._blocks.size > 0) {
    const { all, families } = evictionsSince(cache._generation);
    if (all) cache._blocks.clear();
    else for (const key of cache._blocks.keys()) if (keyNamesFamily(key, families)) cache._blocks.delete(key);
  }
  cache._generation = generation;
  return cache;
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
  const cached = current(cache)._blocks.get(key);
  if (cached) return cloneMeasuredBlock(cached);
  const result = measureBlock(text, font, maxWidthPx, lineHeightPx, options);
  cache._blocks.set(key, result);
  return cloneMeasuredBlock(result);
}

/** {@link cachedMeasureRichBlock} for a table cell's paragraph or a piece
 *  of a caption or a note ({@link measureRichSnippet}), in a key space of
 *  its own: a text of nothing but no-break spaces sets a line there and
 *  none in the body (#781). */
export function cachedMeasureRichSnippet(
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
  const key = `S${buildRichCacheKey(spans, [normalFont, boldFont, italicFont, boldItalicFont], maxWidthPx, lineHeightPx, options)}`;
  const cached = current(cache)._blocks.get(key);
  if (cached) return cloneMeasuredBlock(cached);
  const result = measureRichSnippet(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
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
  const cached = current(cache)._blocks.get(key);
  if (cached) return cloneMeasuredBlock(cached);
  const result = measureRichBlock(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
  cache._blocks.set(key, result);
  return cloneMeasuredBlock(result);
}
