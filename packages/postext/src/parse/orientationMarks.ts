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

/** The openers of `:tcy[…]`, `:upright[…]` and `:sideways[…]` (one line,
 *  not empty, other inline marks allowed inside, `\]` for a literal
 *  bracket; see {@link orientationMarkAt}). */
export const ORIENTATION_OPENERS: readonly string[] = [':tcy[', ':upright[', ':sideways['];

/** The kind of an orientation mark. */
export type OrientationMark = 'tcy' | 'upright' | 'sideways';
type Mark = OrientationMark;

const MARKS: readonly Mark[] = ['tcy', 'upright', 'sideways'];

/** An orientation mark opened at `at`: its kind, the start of its text
 *  and the index of its closing `]` (before `end`, on the same line), or
 *  undefined when `at` opens none. The closing bracket is the one that
 *  balances the opener, so a mark may hold another mark or a link
 *  (`:tcy[:upright[AB]]`, `:sideways[[iPhone](…)]`); when the brackets
 *  inside never balance on the line, the first `]` closes it. `\]` is a
 *  literal bracket. The text is never empty. */
export function orientationMarkAt(text: string, at: number, end = text.length): { kind: Mark; start: number; close: number } | undefined {
  if (text[at] !== ':') return undefined;
  for (const kind of MARKS) {
    if (!text.startsWith(`:${kind}[`, at)) continue;
    const start = at + kind.length + 2;
    let depth = 0;
    let first = -1;
    for (let j = start; j < end; j++) {
      const c = text[j]!;
      if (c === '\n') break;
      if (c === '\\') {
        j++;
        continue;
      }
      if (c === '[') depth++;
      else if (c === ']') {
        if (first < 0) first = j;
        if (depth === 0) return j > start ? { kind, start, close: j } : undefined;
        depth--;
      }
    }
    return first > start ? { kind, start, close: first } : undefined;
  }
  return undefined;
}

/** `text` with every orientation mark replaced by `wrap(kind, inner)`,
 *  the marks inside a mark's text replaced first. */
function replaceOrientationMarks(text: string, wrap: (kind: Mark, inner: string) => string): string {
  if (!ORIENTATION_OPENERS.some((o) => text.includes(o))) return text;
  let out = '';
  let last = 0;
  for (let i = text.indexOf(':'); i >= 0 && i < text.length; i = text.indexOf(':', i + 1)) {
    const mark = orientationMarkAt(text, i);
    if (!mark) continue;
    out += text.slice(last, i) + wrap(mark.kind, replaceOrientationMarks(text.slice(mark.start, mark.close), wrap));
    last = mark.close + 1;
    i = mark.close;
  }
  return out + text.slice(last);
}

/** Private-use marks bracketing each kind while the emphasis regexes run
 *  (outside the escape range and the other marks of `inlineFormatting.ts`). */
const OPEN: Record<Mark, string> = { tcy: '\uE1C0', upright: '\uE1C2', sideways: '\uE1C4' };
const CLOSE: Record<Mark, string> = { tcy: '\uE1C1', upright: '\uE1C3', sideways: '\uE1C5' };
const MARK_OF = new Map<string, { mark: Mark; open: boolean }>([
  ...(Object.keys(OPEN) as Mark[]).map((m): [string, { mark: Mark; open: boolean }] => [OPEN[m], { mark: m, open: true }]),
  ...(Object.keys(CLOSE) as Mark[]).map((m): [string, { mark: Mark; open: boolean }] => [CLOSE[m], { mark: m, open: false }]),
]);
const ANY_MARK_RE = /[\uE1C0-\uE1C5]/;

const unescapeBrackets = (inner: string): string => inner.replace(/\\([[\]])/g, '$1');

/** Replace every orientation mark by its text between its private-use
 *  marks (a mark inside another one too). */
export function markOrientation(text: string): string {
  return replaceOrientationMarks(text, (kind, inner) => `${OPEN[kind]}${unescapeBrackets(inner)}${CLOSE[kind]}`);
}

/** The text of every orientation mark without its markup, each wrapped in
 *  `boundary` (the plain text `stripInlineFormatting` gives). */
export function stripOrientationMarks(text: string, boundary: string): string {
  return replaceOrientationMarks(text, (_kind, inner) => boundary + unescapeBrackets(inner) + boundary);
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
 *  closing `]` comes later on the same line (see {@link orientationMarkAt}).
 *  The length of the opener, or 0. */
export function orientationOpenerAt(markdown: string, r: number, end: number): number {
  const mark = orientationMarkAt(markdown, r, end);
  return mark ? mark.start - r : 0;
}
