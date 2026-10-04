'use client';

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/**
 * Completion of the `dir` attribute (#367): a heading's `{dir=rtl}` and a
 * container's `:::callout{dir=ltr}` set the direction of the block, and of
 * every block inside a container. The engine reads it on those two lines
 * only (`attachDirections`), so the source offers it there: after `{` or a
 * space inside the braces, from `d` on.
 */

/** A heading line or a `:::` opener: the lines whose braces take `dir`. */
const HOST_RE = /^(?:#{1,6}\s|\s*:::+[\w-]*\{)/;
/** `d`, `di`, `dir`, `dir=`, `dir=r`, `dir=rt`, `dir=rtl` and the same
 *  towards `ltr`, at the start of an attribute inside open braces. */
const ATTR_RE = /(?:\{|\{[^{}\n]*\s)(d(?:ir?)?|dir=(?:r(?:tl?)?|l(?:tr?)?)?)$/;

/** The two values, right to left first: the source offers them where an
 *  Arabic book turns a block the other way, and the reverse. */
const VALUES = ['dir=rtl', 'dir=ltr'] as const;

/** The completion source: `dir=rtl` and `dir=ltr` inside the braces of a
 *  heading or a `:::` opener. */
export function directionCompletionSource(cx: CompletionContext): CompletionResult | null {
  const line = cx.state.doc.lineAt(cx.pos);
  const before = line.text.slice(0, cx.pos - line.from);
  if (!HOST_RE.test(before)) return null;
  // Only inside an open `{…}`: the last brace before the caret opens.
  if (before.lastIndexOf('{') <= before.lastIndexOf('}')) return null;
  const m = ATTR_RE.exec(before);
  if (!m) return null;
  const typed = m[1]!;
  const options = VALUES.filter((v) => v.startsWith(typed)).map((label) => ({ label, type: 'property' }));
  if (options.length === 0) return null;
  return { from: cx.pos - typed.length, to: cx.pos, options, filter: false };
}
