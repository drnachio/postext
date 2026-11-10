'use client';

import type { EditorView } from '@codemirror/view';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { findAnnotations } from 'postext';

/**
 * Editor commands for the character styles (`[some words]|id|`): set the
 * selection in a style (or change the style of the run the selection is
 * in), take a run's style off, and complete the style's id after `]|`.
 * The highlighting is the annotations' (`annotationSyntax.ts`).
 */

/** A character style run of a line: where it starts and ends, where its
 *  words are, and its style. Offsets are relative to the line. */
export interface CharStyleRun {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  style: string;
}

/** Every character style run of a line, nested ones included. */
export function charStyleRuns(text: string): CharStyleRun[] {
  if (!text.includes(']|')) return [];
  return findAnnotations(text)
    .filter((a) => a.name === 'charstyle' && a.style !== undefined)
    .map((a) => ({ start: a.start, contentStart: a.contentStart, contentEnd: a.contentEnd, end: a.end, style: a.style! }));
}

/** The innermost run of a line that holds `[from, to]` (relative to the
 *  line): the run whose words, or whose markup, the selection is in. */
export function runAt(text: string, from: number, to: number): CharStyleRun | undefined {
  let best: CharStyleRun | undefined;
  for (const run of charStyleRuns(text)) {
    if (from >= run.start && to <= run.end && (!best || run.end - run.start < best.end - best.start)) best = run;
  }
  return best;
}

/** What setting `[from, to)` of `text` (one line) in the style `id` does:
 *  the change and the new selection, relative to the line. A selection
 *  inside a run (its words, or the run whole) changes that run's style; any
 *  other wraps the selection, or, with nothing selected, inserts an empty
 *  run with the caret between its brackets. */
export function charStyleEdit(text: string, from: number, to: number, id: string): { from: number; to: number; insert: string; anchor: number; head: number } {
  const run = runAt(text, from, to);
  if (run && from >= run.contentStart && to <= run.contentEnd) {
    // The style of the run the selection is in.
    const nameFrom = run.contentEnd + 2;
    const nameTo = run.end - 1;
    return { from: nameFrom, to: nameTo, insert: id, anchor: from, head: to };
  }
  if (run && from <= run.start && to >= run.end) {
    return { from: run.contentEnd + 2, to: run.end - 1, insert: id, anchor: from, head: to + id.length - run.style.length };
  }
  const selected = text.slice(from, to);
  const insert = `[${selected}]|${id}|`;
  return { from, to, insert, anchor: from + 1, head: from + 1 + selected.length };
}

/** What taking the style off the run the selection is in does: its words
 *  back as plain text, the selection kept on them; `undefined` when the
 *  selection is in no run. */
export function charStyleRemoval(text: string, from: number, to: number): { from: number; to: number; insert: string; anchor: number; head: number } | undefined {
  const run = runAt(text, from, to);
  if (!run) return undefined;
  const words = text.slice(run.contentStart, run.contentEnd);
  return { from: run.start, to: run.end, insert: words, anchor: run.start, head: run.start + words.length };
}

/** Apply a style to the main selection of `view` (one line). */
export function applyCharStyle(view: EditorView, id: string): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  // A selection over several lines: only its first line's part.
  const end = Math.min(to, line.to);
  const e = charStyleEdit(line.text, from - line.from, end - line.from, id);
  view.dispatch({
    changes: { from: line.from + e.from, to: line.from + e.to, insert: e.insert },
    selection: { anchor: line.from + e.anchor, head: line.from + e.head },
  });
  view.focus();
}

/** Take the style off the run the main selection of `view` is in. */
export function removeCharStyle(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const e = charStyleRemoval(line.text, from - line.from, Math.min(to, line.to) - line.from);
  if (!e) return;
  view.dispatch({
    changes: { from: line.from + e.from, to: line.from + e.to, insert: e.insert },
    selection: { anchor: line.from + e.anchor, head: line.from + e.head },
  });
  view.focus();
}

/** A style the completion offers: its id and, when different, its name. */
export interface CharStyleOption {
  id: string;
  name?: string;
}

/** `]|` and the id being typed, at the end of the text before the caret. */
const STYLE_ID_RE = /\]\|([\p{L}\p{N}_-]*)$/u;

/** The completion source: the style ids after the `]|` of `[words]|`; the
 *  closing bar is added when it is not there yet. */
export function charStyleCompletionSource(getStyles: () => readonly CharStyleOption[]) {
  return (cx: CompletionContext): CompletionResult | null => {
    const line = cx.state.doc.lineAt(cx.pos);
    const before = line.text.slice(0, cx.pos - line.from);
    const m = STYLE_ID_RE.exec(before);
    if (!m) return null;
    // Only after a bracket that closes one opened on the line.
    const close = before.length - m[0].length;
    if (!before.slice(0, close).includes('[')) return null;
    const typed = m[1] ?? '';
    const closed = line.text[cx.pos - line.from] === '|';
    const options: Completion[] = getStyles().map((s) => ({
      label: s.id,
      ...(s.name && s.name !== s.id ? { detail: s.name } : {}),
      apply: closed ? s.id : `${s.id}|`,
    }));
    if (options.length === 0) return null;
    return { from: cx.pos - typed.length, to: cx.pos, options, validFor: /^[\p{L}\p{N}_-]*$/u };
  };
}
