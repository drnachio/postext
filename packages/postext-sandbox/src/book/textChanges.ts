/**
 * Text changes on a chapter's Markdown made outside the editor (the comic
 * page tools of the previews, #568): the change list `EDIT_CHAPTER_MARKDOWN`
 * applies, and what undoes it. Each change may carry the text it replaces,
 * so a change computed on an older text is refused instead of landing on
 * the wrong characters.
 */

/** One replacement in a text: `[from, to)` becomes `insert`. `expect` is
 *  the text `[from, to)` held when the change was computed. */
export interface TextChange {
  from: number;
  to: number;
  insert: string;
  expect?: string;
}

/** The smallest change that turns `before` into `after`, placed at
 *  `offset`; null when they are the same. */
export function minimalChange(before: string, after: string, offset = 0): TextChange | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let p = 0;
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  return { from: offset + p, to: offset + before.length - s, insert: after.slice(p, after.length - s), expect: before.slice(p, before.length - s) };
}

/** `text` with `changes` applied (non-overlapping, any order). */
export function applyTextChanges(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

/** Whether every change still finds the text it was computed on. */
export function changesApply(text: string, changes: readonly TextChange[]): boolean {
  return changes.every((c) => c.from >= 0 && c.to <= text.length && c.from <= c.to && (c.expect === undefined || text.slice(c.from, c.to) === c.expect));
}

/** The changes that undo `changes` once applied: each in the offsets of
 *  the edited text, putting back what it replaced. */
export function invertTextChanges(changes: readonly TextChange[]): TextChange[] {
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  let shift = 0;
  return sorted.map((c) => {
    const from = c.from + shift;
    shift += c.insert.length - (c.to - c.from);
    return { from, to: from + c.insert.length, insert: c.expect ?? '', expect: c.insert };
  });
}

/** The changes moved by `delta` (a book offset to a chapter offset). */
export function shiftTextChanges(changes: readonly TextChange[], delta: number): TextChange[] {
  return changes.map((c) => ({ ...c, from: c.from + delta, to: c.to + delta }));
}

