// Edits to a chapter's text as an agent states them: this exact passage
// becomes that one. Exact and unambiguous, or refused with what to do
// about it — an edit must never land on another passage than the one
// meant.

import { ToolError } from './modelContext.js';

export interface FindReplace {
  find: string;
  replace: string;
  /** Replace every occurrence instead of requiring exactly one. */
  all?: boolean;
}

const occurrences = (text: string, find: string): number[] => {
  const found: number[] = [];
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + find.length)) found.push(at);
  return found;
};

const lineOf = (text: string, offset: number): number => {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
};

/** `text` after `edits`, applied in order (each sees the text the ones
 *  before it left), with the line each landed on. */
export function applyFindReplace(text: string, edits: readonly FindReplace[]): { text: string; applied: { find: string; count: number; lines: number[] }[] } {
  let out = text;
  const applied: { find: string; count: number; lines: number[] }[] = [];
  edits.forEach((edit, i) => {
    const label = edits.length > 1 ? `Edit ${i + 1}` : 'The edit';
    if (edit.find === '') throw new ToolError(`${label} has an empty "find". To add text, find the passage next to it and replace it with itself plus the new text.`);
    const at = occurrences(out, edit.find);
    if (at.length === 0) {
      throw new ToolError(`${label}: the text to find is not in the chapter. It must match exactly, spaces and line breaks included; read the chapter again for its current text.`, { find: edit.find.slice(0, 200) });
    }
    if (at.length > 1 && !edit.all) {
      throw new ToolError(`${label}: the text to find occurs ${at.length} times (lines ${at.map((o) => lineOf(out, o)).join(', ')}). Give more of the surrounding text to single one out, or set "all" to replace every one.`, { find: edit.find.slice(0, 200) });
    }
    applied.push({ find: edit.find.length > 80 ? `${edit.find.slice(0, 80)}…` : edit.find, count: at.length, lines: at.map((o) => lineOf(out, o)) });
    out = edit.all ? out.split(edit.find).join(edit.replace) : out.slice(0, at[0]!) + edit.replace + out.slice(at[0]! + edit.find.length);
  });
  return { text: out, applied };
}

/** Lines `from`–`to` of `text` (1-based, inclusive), each behind its
 *  number, as an agent reads a long chapter in parts. */
export function numberedLines(text: string, from = 1, to = Infinity): { text: string; from: number; to: number; total: number } {
  const lines = text.split('\n');
  const first = Math.max(1, Math.min(from, lines.length));
  const last = Math.max(first, Math.min(to, lines.length));
  const width = String(last).length;
  return {
    text: lines.slice(first - 1, last).map((line, i) => `${String(first + i).padStart(width)}\t${line}`).join('\n'),
    from: first,
    to: last,
    total: lines.length,
  };
}

