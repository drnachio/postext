// Word expansion for double-click selection in plain text fields (resource
// captions, notes, table cells, SVG text nodes). Mirrors CodeMirror's
// `wordAt` loosely: a word is a run of letters, digits, marks or connector
// punctuation, so accented and non-Latin words expand as one unit.

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

/** The `[from, to)` range of the word around `offset` (a caret between two
 *  words takes the word after it; on whitespace, the whitespace run stays
 *  collapsed). Returns a collapsed range when no word is there. */
export function wordRangeAt(text: string, offset: number): { from: number; to: number } {
  const n = text.length;
  const at = Math.max(0, Math.min(offset, n));
  const isWord = (i: number): boolean => i >= 0 && i < n && WORD_CHAR.test(text[i]!);
  let from = at;
  let to = at;
  if (isWord(at)) {
    while (isWord(from - 1)) from--;
    while (isWord(to)) to++;
  } else if (isWord(at - 1)) {
    from = at - 1;
    while (isWord(from - 1)) from--;
  }
  return { from, to };
}
