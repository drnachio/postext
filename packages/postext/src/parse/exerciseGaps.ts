/**
 * The answers written into the text of an exercise (#1225): `[[water]]`,
 * `[[colour | color]]` (accepted answers), `[[go | (goes) | going]]` (an
 * inline choice, the one in parentheses right), with optional attributes
 * right after (`[[went]]{width=6}`). Read only inside a `:::exercise`, so
 * no other document changes.
 *
 * A gap is set as a chip (the chip path measures, breaks and paints it on
 * every output): the parser replaces it with {@link GAP_PLACEHOLDER} while
 * the source is mapped, then with the chip placeholder, its span carrying
 * `chip.gap`. The exercise expansion (`exercises/expand.ts`) gives the chip
 * its style and decides what it shows.
 */

import type { DirectiveAttrs, ExerciseGap, InlineSpan } from './types.js';
import { parseDirectiveAttrs } from './attrs.js';
import { injectPlaceholderSpans } from './injectSpans.js';
import { CHIP_PLACEHOLDER, parseInlineFormatting, type InlineFormatOptions } from './inlineFormatting.js';

/** Stands for a `[[…]]` while the source is mapped (see `buildBlockMapping`). */
export const GAP_PLACEHOLDER = '\uE1AC';

/** The chip style id a gap takes until the expansion resolves it. */
export const GAP_CHIP_STYLE = '__postext-gap';

/** A gap as written. */
export interface GapMeta {
  /** The options, as written between the `|` (trimmed, parentheses kept). */
  raw: string[];
  attrs?: DirectiveAttrs;
  sourceStart: number;
  sourceEnd: number;
}

/** Where the `]]` closing a gap opened at `from` (just past `[[`) stands,
 *  or -1: a backslash escapes, a single `[`…`]` pair inside is kept. */
export function gapCloseAt(text: string, from: number): number {
  let depth = 0;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (c === '\\') { k++; continue; }
    if (c === '\n') return -1;
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth > 0) { depth--; continue; }
      return text[k + 1] === ']' ? k : -1;
    }
  }
  return -1;
}

/** The options of a gap's text, split at each `|` no backslash escapes
 *  and no `{…}` holds (a ruby, `[[{春天|chūn tiān}]]`, is one answer). */
function splitOptions(inner: string): string[] {
  const out: string[] = [];
  let cur = '';
  let braces = 0;
  for (let k = 0; k < inner.length; k++) {
    const c = inner[k]!;
    if (c === '\\' && inner[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '{') braces++;
    else if (c === '}' && braces > 0) braces--;
    else if (c === '|' && braces === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Take every `[[…]]` (with its `{…}`) out of `text`, each replaced by
 *  {@link GAP_PLACEHOLDER}. `fallbackStart` is the text's source offset. */
export function extractExerciseGaps(text: string, fallbackStart: number): { cleaned: string; gaps: GapMeta[] } {
  const gaps: GapMeta[] = [];
  let out = '';
  let last = 0;
  for (let index = text.indexOf('[['); index >= 0; ) {
    if (index > 0 && text[index - 1] === '\\') { index = text.indexOf('[[', index + 2); continue; }
    const close = gapCloseAt(text, index + 2);
    if (close < 0) { index = text.indexOf('[[', index + 2); continue; }
    const inner = text.slice(index + 2, close);
    let end = close + 2;
    let attrs: DirectiveAttrs | undefined;
    if (text[end] === '{') {
      const stop = text.indexOf('}', end);
      if (stop > 0 && !text.slice(end, stop).includes('\n')) {
        attrs = parseDirectiveAttrs(text.slice(end + 1, stop));
        end = stop + 1;
      }
    }
    out += text.slice(last, index) + GAP_PLACEHOLDER;
    gaps.push({ raw: splitOptions(inner), ...(attrs ? { attrs } : {}), sourceStart: fallbackStart + index, sourceEnd: fallbackStart + end });
    last = end;
    index = text.indexOf('[[', end);
  }
  out += text.slice(last);
  return { cleaned: out, gaps };
}

/** An option written `(…)` whole: a right one of an inline choice. */
function inParens(s: string): boolean {
  return s.length >= 2 && s.startsWith('(') && s.endsWith(')');
}

/** What a gap asks: the options read for their inline Markdown, the right
 *  ones, whether it is a choice. With two options or more and at least
 *  one in parentheses it is an inline choice; otherwise every option is
 *  an accepted answer. `inline` as `parseInlineFormatting` takes it. */
export function gapOf(meta: GapMeta, inline?: InlineFormatOptions): ExerciseGap {
  const raw = meta.raw;
  const choice = raw.length > 1 && raw.some(inParens);
  const texts = raw.map((s) => (choice && inParens(s) ? s.slice(1, -1).trim() : s));
  const correct = choice ? raw.flatMap((s, k) => (inParens(s) ? [k] : [])) : raw.map((_, k) => k);
  return {
    options: texts.map((t) => parseInlineFormatting(t, inline)),
    texts: texts.map((t) => parseInlineFormatting(t, inline).map((s) => s.text).join('')),
    correct,
    choice,
    ...(meta.attrs ? { attrs: meta.attrs } : {}),
  };
}

/** Put a chip span with its `gap` at each {@link GAP_PLACEHOLDER}. The
 *  chip's words are the first right answer. */
export function injectGapSpans(spans: InlineSpan[], gaps: GapMeta[], inline?: InlineFormatOptions): InlineSpan[] {
  return injectPlaceholderSpans(spans, gaps, GAP_PLACEHOLDER, (meta, bold, italic) => {
    const gap = gapOf(meta, inline);
    return {
      text: GAP_PLACEHOLDER,
      bold,
      italic,
      chip: { style: GAP_CHIP_STYLE, spans: gap.options[gap.correct[0] ?? 0] ?? [], gap },
    };
  });
}

/** A mapped run with its gap placeholders turned into chip placeholders,
 *  once the source map no longer needs them. */
export function settleGapPlaceholders<T extends { text: string; spans: InlineSpan[] }>(mapping: T): T {
  if (!mapping.text.includes(GAP_PLACEHOLDER)) return mapping;
  mapping.text = mapping.text.split(GAP_PLACEHOLDER).join(CHIP_PLACEHOLDER);
  for (const s of mapping.spans) if (s.text === GAP_PLACEHOLDER) s.text = CHIP_PLACEHOLDER;
  return mapping;
}
