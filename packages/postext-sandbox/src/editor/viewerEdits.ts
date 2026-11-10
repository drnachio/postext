/**
 * Edits made on the previews (#568: a comic splitter dragged, a panel
 * split or merged; a frame's text, a fence rewritten) and how they reach
 * the text.
 *
 * An edit is dispatched as `EDIT_CHAPTER_MARKDOWN`. When the chapter's
 * editor is open, the editor picks the change up as an external value and
 * applies exactly these changes (`takeViewerChanges`), as one step of its
 * own history. When it is closed, the Sandbox's history (#899,
 * ../history/sandboxHistory) adds the edit to the chapter's saved editor
 * state. Either way Cmd/Ctrl+Z takes it back in the order the changes
 * were made, the design's among them.
 */

import type { Dispatch } from 'react';
import type { SandboxAction } from '../context/SandboxContext.js';
import { applyTextChanges, type TextChange } from '../book/textChanges.js';
import { activeHistory } from '../history/sandboxHistory.js';

/** Changes dispatched last, for the editor to apply as they are. */
let pending: TextChange[] | null = null;

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

/** Apply an edit made on a preview (chapter offsets): one step of the
 *  history. */
export function applyViewerEdit(dispatch: Dispatch<SandboxAction>, chapterId: string, changes: TextChange[], baseLength: number): void {
  if (changes.length === 0) return;
  pending = changes;
  dispatch({ type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId, changes, baseLength } });
}

/** Apply the edits of one action on several chapters (the find bar's
 *  replace-all over the book): one step of the history, undone and
 *  redone at once. The open editor takes its chapter's changes as they
 *  are only when they are the last ones sent (`takeViewerChanges`), so
 *  its edit goes last. */
export function applyViewerEdits(dispatch: Dispatch<SandboxAction>, edits: readonly { chapterId: string; changes: TextChange[]; baseLength: number }[], openChapterId?: string): void {
  const live = edits.filter((e) => e.changes.length > 0);
  const ordered = [...live].sort((a, b) => Number(a.chapterId === openChapterId) - Number(b.chapterId === openChapterId));
  if (ordered.length > 1) activeHistory()?.group('find', { chapters: ordered.map((e) => e.chapterId) });
  for (const e of ordered) applyViewerEdit(dispatch, e.chapterId, e.changes, e.baseLength);
}

/** Undo the latest change of the Sandbox's history (text or design);
 *  false when there is none. */
export function undoViewerEdit(): boolean {
  return activeHistory()?.undo() != null;
}

/** Redo the latest change undone; false when there is none. */
export function redoViewerEdit(): boolean {
  return activeHistory()?.redo() != null;
}

/** Forget the changes waiting for the editor (tests). */
export function resetViewerEdits(): void {
  pending = null;
}
