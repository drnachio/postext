// A chapter's text changed by a tool, and the change taken back. The edit
// goes the way an edit made on the previews goes (editor/viewerEdits.ts):
// one step of the chapter's history, in the Sandbox's one history of text
// and design (#899) that Cmd/Ctrl+Z and the tools undo from.

import { minimalChange } from '../book/textChanges.js';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import { applyViewerEdit } from '../editor/viewerEdits.js';
import type { SandboxToolHost } from './host.js';
import { ToolError } from './modelContext.js';

/** How long an edit may take to reach the state: a render away, which a
 *  long book can make slow. */
const LANDING_MS = 5000;

/** A chapter's text as it stands (the one on screen is mirrored in
 *  `markdown`), or null when the book has no such chapter. */
export function chapterText(state: SandboxState, chapterId: string): string | null {
  if (chapterId === state.activeChapterId) return state.markdown;
  return state.chapters.find((c) => c.id === chapterId)?.markdown ?? null;
}

/** Resolves once `done` holds for the state, or after `timeoutMs` with
 *  whether it does by then. */
export function stateReaches(host: SandboxToolHost, done: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (done()) {
      resolve(true);
      return;
    }
    const finish = (reached: boolean) => {
      unsubscribe();
      clearTimeout(timer);
      resolve(reached);
    };
    const unsubscribe = host.store.subscribe(() => {
      if (done()) finish(true);
    });
    const timer = setTimeout(() => finish(done()), timeoutMs);
  });
}

/** Turn a chapter's text from `before` (what the state holds) into
 *  `after`, as one edit that can be taken back. False when they are the
 *  same text. */
export async function editChapter(host: SandboxToolHost, chapterId: string, before: string, after: string): Promise<boolean> {
  const change = minimalChange(before, after);
  if (!change) return false;
  const dispatch = (action: SandboxAction) => host.store.dispatch(action);
  applyViewerEdit(dispatch, chapterId, [change], before.length);
  const landed = await stateReaches(host, () => chapterText(host.store.getSnapshot(), chapterId) === after, LANDING_MS);
  if (!landed) {
    // Refused by the state: the chapter was no longer the text the edit
    // was worked out on.
    throw new ToolError('The chapter changed while the edit was on its way, so nothing was changed. Read the chapter again and edit its current text.');
  }
  return true;
}

export interface TakenBack {
  chapterId: string;
  /** The chapter's text afterwards. */
  text: string;
  /** Whether there is an edit to take back, and one to put back, after
   *  this one. */
  canUndo: boolean;
  canRedo: boolean;
}

/** Take back the last change when it is a text edit (any: typed in the
 *  editor, made on the previews or by a tool), or with `redo` put back
 *  the last one taken back. `only` refuses an edit to another chapter.
 *  The change before it may be to the design: the history is one
 *  (#899), and `sandbox_undo` takes back either. */
export async function undoChapterEdit(host: SandboxToolHost, redo: boolean, only?: string): Promise<TakenBack> {
  const { history } = host.store;
  const step = history.peek(redo);
  if (!step) {
    throw new ToolError(redo
      ? 'There is no edit to put back: nothing was taken back since the last change.'
      : 'There is no edit to take back. The history holds the changes made since the book was opened: text typed in the editor, edits made on the previews, the edits of sandbox_write_text, sandbox_edit_text and sandbox_import_word (into a chapter), and changes to the design.');
  }
  if (step.kind !== 'text') {
    const what = step.kind === 'resource'
      ? `to the marks of the picture ${JSON.stringify(step.resourceId)}`
      : step.kind === 'group'
        ? step.source === 'find'
          ? 'a replace-all of the find bar, to several chapters at once'
          : 'the changes of an edited Word export, to several chapters at once'
        : `to the design (${step.paths.join(', ')})`;
    throw new ToolError(`The last change ${redo ? 'taken back ' : ''}was ${what}, not to the text. Changes come back in the order they were made: sandbox_undo takes back the last one whatever it is.`);
  }
  const state = host.store.getSnapshot();
  const position = state.chapters.findIndex((c) => c.id === step.chapterId) + 1;
  if (only !== undefined && only !== step.chapterId && position > 0) {
    throw new ToolError(`The last edit ${redo ? 'taken back ' : ''}was to chapter ${position} (${state.chapters[position - 1]!.title}), not to the chapter named. Edits come back in the order they were made, whatever the chapter: name that chapter, or none.`);
  }
  const before = chapterText(state, step.chapterId);
  const done = redo ? history.redo({ kind: 'text' }) : history.undo({ kind: 'text' });
  if (!done || done.kind !== 'text') {
    throw new ToolError(`There is no edit to ${redo ? 'put' : 'take'} back: the chapters the history named are no longer in the book.`);
  }
  const current = (): string | null => chapterText(host.store.getSnapshot(), done.chapterId);
  if (done.chapterId === step.chapterId) await stateReaches(host, () => current() !== before, LANDING_MS);
  return { chapterId: done.chapterId, text: current() ?? '', canUndo: history.canUndo(), canRedo: history.canRedo() };
}
