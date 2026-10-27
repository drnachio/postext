// Heading counters and numbering (#1278: split out of numbering.ts).
import type { ContentBlock } from '../../parse/index.js';
import type { DigitSystem } from '../../types.js';
import { asciiDigits } from '../arabicNumerals.js';
import { parseTemplate, renderTemplate } from './counters.js';
import type { Token } from './styles.js';

export type HeadingTemplates = Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;

/** Heading counters carried over from preceding content: `[h1..h6]`. */
export type HeadingCounterStart = readonly number[];

/** The value a heading's `startAt` attribute (`# Appendix {startAt=1}`)
 *  sets its level's counter to, in place of advancing it: a positive
 *  integer, in any digits (`{startAt=٣}`), else undefined (the attribute
 *  is ignored). */
export function headingCounterStart(block: Pick<ContentBlock, 'attrs'>): number | undefined {
  const raw = block.attrs?.startAt;
  if (raw === undefined) return undefined;
  const n = Number(asciiDigits(raw));
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** A numbered heading's counter after it: its `startAt`, else one more
 *  than the level's running count. */
export function nextHeadingCounter(block: Pick<ContentBlock, 'attrs'>, current: number): number {
  return headingCounterStart(block) ?? current + 1;
}

export interface HeadingNumberingOptions {
  /** Document language of spelled-out counters (`{1:words}`,
   *  `{1:ordinal}`). English when unset. */
  locale?: string;
  /** The document's digit system, for the decimal counters (`{1}`,
   *  `{1:01}`); `'latn'` when unset. */
  numerals?: DigitSystem;
  /** A template replacing the level's for one heading (a heading style's
   *  `numberingTemplate`); `undefined` keeps the level's. */
  templateFor?: (block: ContentBlock) => string | undefined;
}

export interface HeadingNumbering {
  /** Rendered number prefix per block index; undefined where none. */
  prefixes: Array<string | undefined>;
  /** Counter value of each numbered heading (its level's running count)
   *  per block index; undefined for other blocks and unnumbered headings. */
  values: Array<number | undefined>;
}

export function computeHeadingNumbering(
  blocks: ContentBlock[],
  templates: HeadingTemplates,
  start?: HeadingCounterStart,
  /** Whether a heading block advances its counter; an unnumbered heading
   *  (a style with `numbered: false`) gets no prefix and counts for nothing.
   *  Every heading is numbered when omitted. */
  isNumbered: (block: ContentBlock) => boolean = () => true,
  options: HeadingNumberingOptions = {},
): HeadingNumbering {
  const counters = [0, 0, 0, 0, 0, 0, 0];
  if (start) for (let lvl = 1; lvl <= 6; lvl++) counters[lvl] = start[lvl - 1] ?? 0;
  const parsed = new Map<string, Token[] | null>();
  const tokensOf = (tpl: string): Token[] | null => {
    let tokens = parsed.get(tpl);
    if (tokens === undefined) {
      tokens = tpl.length > 0 ? parseTemplate(tpl, options.locale) : null;
      parsed.set(tpl, tokens);
    }
    return tokens;
  };
  const prefixes: Array<string | undefined> = new Array(blocks.length);
  const values: Array<number | undefined> = new Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'heading' || !b.level) continue;
    if (!isNumbered(b)) continue;
    const lvl = b.level;
    counters[lvl] = nextHeadingCounter(b, counters[lvl] ?? 0);
    for (let k = lvl + 1; k <= 6; k++) counters[k] = 0;
    values[i] = counters[lvl];
    const tokens = tokensOf(options.templateFor?.(b) ?? templates[lvl as 1 | 2 | 3 | 4 | 5 | 6] ?? '');
    if (!tokens) continue;
    const rendered = renderTemplate(tokens, counters, lvl, options.locale, options.numerals);
    if (rendered.length > 0) prefixes[i] = rendered;
  }
  return { prefixes, values };
}

/** The rendered number prefix of every heading (see
 *  {@link computeHeadingNumbering}). */
export function computeHeadingNumbers(
  blocks: ContentBlock[],
  templates: HeadingTemplates,
  start?: HeadingCounterStart,
  isNumbered: (block: ContentBlock) => boolean = () => true,
  options?: HeadingNumberingOptions,
): Array<string | undefined> {
  return computeHeadingNumbering(blocks, templates, start, isNumbered, options).prefixes;
}
