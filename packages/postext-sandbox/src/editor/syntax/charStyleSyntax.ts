'use client';

import type { EditorView } from '@codemirror/view';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { findAnnotations } from 'postext';

/**
 * Editor commands for the character styles (`:span[some words]{style="id"}`,
 * #1488): set the selection in a style (or change the style of the run the
 * selection is in), take a run's style off, and complete the style's id
 * inside `{style="…"}`. The runs are found by the engine's own reader
 * (`findAnnotations`), so the editor, the layout and the Word export read
 * the same text; the highlighting is the annotations'
 * (`annotationSyntax.ts`).
 */

/** A character style run of a line: where it starts and ends, where its
 *  words are, where its style id is written (`idFrom`–`idTo`, both -1
 *  when it names none), and the id. Offsets are relative to the line. */
export interface CharStyleRun {
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  idFrom: number;
  idTo: number;
  style: string;
}

const OPEN = ':span[';

/** Where the value of `style=` is in an attribute block `{…}` starting at
 *  `at` of `text`: its first and last offsets (quotes left out), or
 *  undefined when the block names no style. */
function styleValueAt(text: string, at: number, end: number): [number, number] | undefined {
  const block = text.slice(at, end);
  const m = /\bstyle\s*=\s*(?:"([^"\n]*)"|([^\s"}]+))/.exec(block);
  if (!m) return undefined;
  const value = m[1] ?? m[2] ?? '';
  const from = at + m.index + m[0].length - value.length - (m[1] !== undefined ? 1 : 0);
  return [from, from + value.length];
}

/** Every character style run of a line, nested ones included. */
export function charStyleRuns(text: string): CharStyleRun[] {
  if (!text.includes(OPEN)) return [];
  const out: CharStyleRun[] = [];
  for (const a of findAnnotations(text)) {
    if (a.name !== 'span') continue;
    const value = a.end > a.contentEnd + 1 ? styleValueAt(text, a.contentEnd + 1, a.end) : undefined;
    out.push({
      start: a.start,
      contentStart: a.contentStart,
      contentEnd: a.contentEnd,
      end: a.end,
      idFrom: value?.[0] ?? -1,
      idTo: value?.[1] ?? -1,
      style: value ? text.slice(value[0], value[1]).trim() : '',
    });
  }
  return out;
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

type Edit = { from: number; to: number; insert: string; anchor: number; head: number };

/** What setting `[from, to)` of `text` (one line) in the style `id` does:
 *  the change and the new selection, relative to the line. A selection
 *  inside a run (its words, or the run whole) changes that run's style; any
 *  other wraps the selection, or, with nothing selected, inserts an empty
 *  run with the caret between its brackets. */
export function charStyleEdit(text: string, from: number, to: number, id: string): Edit {
  const run = runAt(text, from, to);
  if (run && ((from >= run.contentStart && to <= run.contentEnd) || (from <= run.start && to >= run.end))) {
    // The style of the run the selection is in: its id, or a whole new
    // attribute block when it names none. A selection over the whole run
    // keeps covering it.
    const [at, upTo, insert] = run.idFrom >= 0 ? [run.idFrom, run.idTo, id] : [run.contentEnd + 1, run.end, `{style="${id}"}`];
    return { from: at, to: upTo, insert, anchor: from, head: to <= at ? to : to + insert.length - (upTo - at) };
  }
  const selected = text.slice(from, to);
  const insert = `${OPEN}${selected}]{style="${id}"}`;
  return { from, to, insert, anchor: from + OPEN.length, head: from + OPEN.length + selected.length };
}

/** What taking the style off the run the selection is in does: its words
 *  back as plain text, the selection kept on them; `undefined` when the
 *  selection is in no run. */
export function charStyleRemoval(text: string, from: number, to: number): Edit | undefined {
  const run = runAt(text, from, to);
  if (!run) return undefined;
  const words = text.slice(run.contentStart, run.contentEnd);
  return { from: run.start, to: run.end, insert: words, anchor: run.start, head: run.start + words.length };
}

function dispatchEdit(view: EditorView, lineFrom: number, e: Edit): void {
  view.dispatch({
    changes: { from: lineFrom + e.from, to: lineFrom + e.to, insert: e.insert },
    selection: { anchor: lineFrom + e.anchor, head: lineFrom + e.head },
  });
  view.focus();
}

/** Apply a style to the main selection of `view` (one line). */
export function applyCharStyle(view: EditorView, id: string): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  // A selection over several lines: only its first line's part.
  const end = Math.min(to, line.to);
  dispatchEdit(view, line.from, charStyleEdit(line.text, from - line.from, end - line.from, id));
}

/** Take the style off the run the main selection of `view` is in. */
export function removeCharStyle(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const e = charStyleRemoval(line.text, from - line.from, Math.min(to, line.to) - line.from);
  if (e) dispatchEdit(view, line.from, e);
}

/** A style the completion offers: its id and, when different, its name. */
export interface CharStyleOption {
  id: string;
  name?: string;
}

/** Whether the `]` at `close` of `text` ends a `:span[…]`: the bracket
 *  that opens it, found walking back over nested pairs and escapes, has
 *  `:span` before it. One pass back over the line. */
function closesSpan(text: string, close: number): boolean {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const c = text[i];
    if (c !== '[' && c !== ']') continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) slashes++;
    if (slashes % 2 === 1) continue;
    if (c === ']') depth++;
    else if (--depth === 0) return text.slice(i - OPEN.length + 1, i + 1) === OPEN;
  }
  return false;
}

/** The style id being typed after `style=` in the attribute block of a
 *  `:span[…]`, at the end of `before`; undefined anywhere else. */
function typedStyle(before: string): { quote: string; typed: string } | undefined {
  const brace = before.lastIndexOf('{');
  if (brace < 1 || before[brace - 1] !== ']') return undefined;
  const m = /^\{[^}\n]*\bstyle=(["']?)([\w-]*)$/.exec(before.slice(brace));
  if (!m || !closesSpan(before, brace - 1)) return undefined;
  return { quote: m[1] ?? '', typed: m[2] ?? '' };
}

/** The completion source: the book's character style ids inside the
 *  `{style="…"}` of a `:span[…]`. */
export function charStyleCompletionSource(getStyles: () => readonly CharStyleOption[]) {
  return (cx: CompletionContext): CompletionResult | null => {
    const line = cx.state.doc.lineAt(cx.pos);
    const at = typedStyle(line.text.slice(0, cx.pos - line.from));
    if (!at) return null;
    const options: Completion[] = getStyles().map((s) => ({
      label: s.id,
      ...(s.name && s.name !== s.id ? { detail: s.name } : {}),
      apply: at.quote ? s.id : `"${s.id}"`,
    }));
    if (options.length === 0) return null;
    return { from: cx.pos - at.typed.length, to: cx.pos, options, validFor: /^[\w-]*$/ };
  };
}
