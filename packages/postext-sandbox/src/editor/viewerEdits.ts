/**
 * Edits made on the previews (#568: a comic splitter dragged, a panel
 * split or merged) and how they are undone.
 *
 * An edit is dispatched as `EDIT_CHAPTER_MARKDOWN`. When the chapter's
 * editor is open, the editor picks the change up as an external value and
 * applies exactly these changes (`takeViewerChanges`), as one step of its
 * own history: Cmd/Ctrl+Z in the editor takes it back. Over the previews
 * (focus outside any field) the same keys undo the last such edit: through
 * the open editor's history when the chapter is open in it, else by
 * dispatching the inverse changes.
 */

import type { Dispatch } from 'react';
import { redo, undo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import type { SandboxAction } from '../context/SandboxContext';
import { applyTextChanges, invertTextChanges, type TextChange } from '../book/textChanges';

interface ViewerEdit {
  chapterId: string;
  changes: TextChange[];
  /** Chapter length before the edit. */
  baseLength: number;
  dispatch: Dispatch<SandboxAction>;
}

/** The open editor of each chapter (one at a time). */
const editors = new Map<string, EditorView>();
const undoStack: ViewerEdit[] = [];
const redoStack: ViewerEdit[] = [];
const MAX_EDITS = 100;
/** Changes dispatched last, for the editor to apply as they are. */
let pending: TextChange[] | null = null;

/** The Markdown editor of `chapterId` is open (`view`) or closed (null). */
export function registerEditorView(chapterId: string, view: EditorView | null): void {
  if (view) editors.set(chapterId, view);
  else editors.delete(chapterId);
}

/** The exact changes behind an external value, when it is the result of
 *  the last viewer edit on `current`; null otherwise (the editor then
 *  diffs the two texts). */
export function takeViewerChanges(current: string, next: string): TextChange[] | null {
  const changes = pending;
  if (!changes) return null;
  if (applyTextChanges(current, changes) !== next) return null;
  pending = null;
  return changes;
}

function send(edit: ViewerEdit, changes: TextChange[], baseLength: number): void {
  pending = changes;
  edit.dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId: edit.chapterId, changes, baseLength } });
}

function lengthAfter(baseLength: number, changes: readonly TextChange[]): number {
  return changes.reduce((n, c) => n + c.insert.length - (c.to - c.from), baseLength);
}

/** Apply an edit made on a preview (chapter offsets) and keep it for
 *  Cmd/Ctrl+Z over the previews. */
export function applyViewerEdit(dispatch: Dispatch<SandboxAction>, chapterId: string, changes: TextChange[], baseLength: number): void {
  if (changes.length === 0) return;
  const edit: ViewerEdit = { chapterId, changes, baseLength, dispatch };
  send(edit, changes, baseLength);
  undoStack.push(edit);
  if (undoStack.length > MAX_EDITS) undoStack.shift();
  redoStack.length = 0;
  installKeys();
}

/** Undo the last viewer edit; false when there is none. */
export function undoViewerEdit(): boolean {
  const edit = undoStack.pop();
  if (!edit) return false;
  const view = editors.get(edit.chapterId);
  if (view) undo(view);
  else send(edit, invertTextChanges(edit.changes), lengthAfter(edit.baseLength, edit.changes));
  redoStack.push(edit);
  return true;
}

/** Redo the last undone viewer edit; false when there is none. */
export function redoViewerEdit(): boolean {
  const edit = redoStack.pop();
  if (!edit) return false;
  const view = editors.get(edit.chapterId);
  if (view) redo(view);
  else send(edit, edit.changes, edit.baseLength);
  undoStack.push(edit);
  return true;
}

/** Whether a key goes to a field (which undoes its own text). */
function inField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor') !== null;
}

let keysInstalled = false;

function installKeys(): void {
  if (keysInstalled || typeof window === 'undefined') return;
  keysInstalled = true;
  window.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
    const key = ev.key.toLowerCase();
    const isUndo = key === 'z' && !ev.shiftKey;
    const isRedo = (key === 'z' && ev.shiftKey) || (key === 'y' && !ev.shiftKey);
    if (!isUndo && !isRedo) return;
    if (inField(ev.target) || inField(document.activeElement)) return;
    if (isUndo ? undoViewerEdit() : redoViewerEdit()) ev.preventDefault();
  });
}

/** Forget every viewer edit (tests). */
export function resetViewerEdits(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  pending = null;
  editors.clear();
}
