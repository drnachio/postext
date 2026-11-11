// The keys of the find bar's two fields. Pure, so the rules are tested
// without a browser.
//
// - Enter: next match (search field) or replace this one (replace field);
//   Shift+Enter: previous match. Cmd/Ctrl+Alt+Enter in the replace field:
//   replace all.
// - Escape: close the bar.
// - Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y: `undo` / `redo`, which the bar
//   takes only right after a replacement (otherwise the field undoes what
//   was typed in it).
// - While an input method composes (Chinese, Japanese, Korean), Enter
//   confirms the conversion and Escape cancels it: those keys are the
//   IME's, never the bar's.

export type FindFieldAction = 'next' | 'previous' | 'replace' | 'replaceAll' | 'close' | 'undo' | 'redo' | null;

export interface FindKey {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** `KeyboardEvent.isComposing`, or keyCode 229, which some browsers
   *  send for the keydown that ends a composition. */
  composing: boolean;
}

export function findFieldKey(e: FindKey, field: 'query' | 'replace', mac: boolean): FindFieldAction {
  if (e.composing) return null;
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (e.key === 'Enter') {
    if (field === 'replace' && mod && e.altKey) return 'replaceAll';
    if (mod || e.altKey) return null;
    if (field === 'replace') return e.shiftKey ? 'previous' : 'replace';
    return e.shiftKey ? 'previous' : 'next';
  }
  if (e.key === 'Escape') return 'close';
  const letter = e.key.toLowerCase();
  if (mod && !e.altKey && letter === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (!mac && e.ctrlKey && !e.shiftKey && !e.altKey && letter === 'y') return 'redo';
  return null;
}

/** Whether a history step (the one undo or redo would take) is the find
 *  bar's last replacement: a replace-all over several chapters, or a
 *  text step of the chapter it changed. The bar's Undo takes back only
 *  its own replacement, not a change made since. */
export function isReplacementStep(
  step: { kind: string; source?: string; chapterId?: string } | null,
  chapterIds: readonly string[],
): boolean {
  if (!step) return false;
  if (step.kind === 'group') return step.source === 'find';
  return step.kind === 'text' && step.chapterId !== undefined && chapterIds.length === 1 && chapterIds[0] === step.chapterId;
}
