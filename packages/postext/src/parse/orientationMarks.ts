/**
 * Orientation marks for vertical text (#190): `:tcy[12]` sets its text
 * side by side in one upright cell (tate-chu-yoko), `:upright[GDP]` stands
 * each character upright in a cell of its own, `:sideways[12]` turns the
 * whole run with the line. They keep their text in the plain text (like
 * `:smallcaps[…]`) and only change how it stands in vertical text
 * (`layout.writingMode: 'vertical-rl'`); in horizontal text they change
 * nothing.
 *
 * The parser replaces each mark by its text between two private-use marks
 * before the emphasis scanners run ({@link markOrientation}) and turns the
 * marks into span fields once the spans exist ({@link applyOrientationMarks}).
 */

import type { InlineSpan } from './types';

/** `:tcy[…]`, `:upright[…]` or `:sideways[…]`: one line, not empty, other
 *  inline marks allowed inside, `\]` for a literal bracket. */
export const ORIENTATION_MARK_RE = /:(tcy|upright|sideways)\[((?:\\.|[^\]\\\n])+)\]/g;

/** The openers of the marks in the source (see `computeSourceMap`). */
export const ORIENTATION_OPENERS: readonly string[] = [':tcy[', ':upright[', ':sideways['];

type Mark = 'tcy' | 'upright' | 'sideways';

/** Private-use marks bracketing each kind while the emphasis regexes run
 *  (outside the escape range and the other marks of `inlineFormatting.ts`). */
const OPEN: Record<Mark, string> = { tcy: '', upright: '', sideways: '' };
const CLOSE: Record<Mark, string> = { tcy: '', upright: '', sideways: '' };
const MARK_OF = new Map<string, { mark: Mark; open: boolean }>([
  ...(Object.keys(OPEN) as Mark[]).map((m): [string, { mark: Mark; open: boolean }] => [OPEN[m], { mark: m, open: true }]),
  ...(Object.keys(CLOSE) as Mark[]).map((m): [string, { mark: Mark; open: boolean }] => [CLOSE[m], { mark: m, open: false }]),
]);
const ANY_MARK_RE = /[-]/;

const unescapeBrackets = (inner: string): string => inner.replace(/\\([[\]])/g, '$1');

/** Replace every orientation mark by its text between its private-use
 *  marks. */
export function markOrientation(text: string): string {
  if (!text.includes(':tcy[') && !text.includes(':upright[') && !text.includes(':sideways[')) return text;
  return text.replace(ORIENTATION_MARK_RE, (_, kind: Mark, inner: string) => `${OPEN[kind]}${unescapeBrackets(inner)}${CLOSE[kind]}`);
}

/** The text of every orientation mark without its markup, each wrapped in
 *  `boundary` (the plain text `stripInlineFormatting` gives). */
export function stripOrientationMarks(text: string, boundary: string): string {
  return text.replace(ORIENTATION_MARK_RE, (_, _kind: string, inner: string) => boundary + unescapeBrackets(inner) + boundary);
}

/** Split the spans at the orientation marks, setting `combineUpright` or
 *  `orientation` on the text between them and dropping the marks (and any
 *  piece left empty). The innermost mark wins. */
export function applyOrientationMarks(spans: InlineSpan[]): InlineSpan[] {
  if (!spans.some((s) => ANY_MARK_RE.test(s.text))) return spans;
  const out: InlineSpan[] = [];
  const open: Mark[] = [];
  for (const span of spans) {
    let piece = '';
    const flush = (): void => {
      if (piece.length === 0) return;
      const mark = open[open.length - 1];
      const fields: Partial<InlineSpan> = mark === 'tcy' ? { combineUpright: true } : mark ? { orientation: mark } : {};
      out.push({ ...span, text: piece, ...fields });
      piece = '';
    };
    for (const ch of span.text) {
      const m = MARK_OF.get(ch);
      if (!m) {
        piece += ch;
        continue;
      }
      flush();
      if (m.open) open.push(m.mark);
      else {
        const at = open.lastIndexOf(m.mark);
        if (at >= 0) open.splice(at, 1);
      }
    }
    flush();
  }
  return out;
}

/** An orientation mark's opener at `r` that the parser took as markup: its
 *  closing `]` comes later on the same line. The length of the opener, or
 *  0. */
export function orientationOpenerAt(markdown: string, r: number, end: number): number {
  if (markdown[r] !== ':') return 0;
  for (const opener of ORIENTATION_OPENERS) {
    if (!markdown.startsWith(opener, r)) continue;
    for (let j = r + opener.length; j < end; j++) {
      const c = markdown[j]!;
      if (c === '\n') return 0;
      if (c === '\\') { j++; continue; }
      if (c === ']') return j > r + opener.length ? opener.length : 0;
    }
    return 0;
  }
  return 0;
}
