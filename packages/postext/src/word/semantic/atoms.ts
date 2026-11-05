// Inline constructs Word cannot hold as such (#1390): their source extent
// (the parser records only where a placeholder starts) and the text the
// Word file shows for them.

import type { InlineSpan } from '../../parse/types.js';
import type { WriterContext } from './context.js';
import { resourceRefLabel } from './engineNumbers.js';

/** Index just past a balanced `open … close` group starting at `i`
 *  (backslash escapes and quoted strings inside braces skipped), or `i`
 *  when there is none. */
function balanced(md: string, i: number, open: string, close: string, limit: number): number {
  if (md[i] !== open) return i;
  let depth = 0;
  let quote = '';
  for (let k = i; k < limit; k++) {
    const c = md[k];
    if (c === '\\') {
      k++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (open === '{' && (c === '"' || c === "'")) quote = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return k + 1;
    else if (c === '\n' && md[k + 1] === '\n') break;
  }
  return i;
}

/**
 * The end of the inline markup that starts at `start` (`:ref{…}`,
 * `:chip[…]{…}`, `\ref{…}`, `[@key, p. 3]`, `[^id]`, `[[…]]{…}`, `@key`),
 * at most `limit` (the source offset of the next mapped character).
 */
export function atomEnd(md: string, start: number, limit: number): number {
  const lim = Math.min(md.length, limit > start ? limit : md.length);
  let i = start;
  const c = md[start];
  if (c === ':') {
    const m = /^:[A-Za-z][\w-]*/.exec(md.slice(start, lim));
    if (m) {
      i = start + m[0].length;
      i = balanced(md, i, '[', ']', lim);
      i = balanced(md, i, '{', '}', lim);
    }
  } else if (c === '\\') {
    const m = /^\\[A-Za-z]+\*?/.exec(md.slice(start, lim));
    if (m) i = balanced(md, start + m[0].length, '{', '}', lim);
  } else if (c === '[') {
    i = balanced(md, start, '[', ']', lim);
    i = balanced(md, i, '{', '}', lim);
  } else if (c === '@') {
    const m = /^@[\w:./-]*[\w]/.exec(md.slice(start, lim));
    if (m) i = start + m[0].length;
  }
  if (i <= start) i = Math.min(lim, start + 1);
  return Math.min(i, lim);
}

/** The text a `:ref` shows: its own `text=`, else the resource's label
 *  and number, else the anchor's id. */
export function refLabel(ctx: WriterContext, ref: NonNullable<InlineSpan['ref']>): string {
  if (ref.text) return ref.text;
  const res = ref.anchor ? undefined : ctx.resources.get(ref.resourceId);
  if (!res) return ref.resourceId;
  ctx.usedResources.add(res.id);
  return resourceRefLabel(ref, ctx.numbers, [res], ctx.resolved);
}

/** The text a chip shows: its words. */
export function chipText(chip: NonNullable<InlineSpan['chip']>): string {
  return chip.spans.map((s) => s.text).join('').replace(/\u2028/g, ' ');
}
