/**
 * Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y over the whole Sandbox (#899):
 * the previews, the panels, the toolbars. The Markdown editor binds the
 * same keys to the same history itself; a text box (a title, a number
 * being typed, a search) keeps its own undo of what is typed in it.
 */

import type { SandboxLabels } from '../types/index.js';
import type { SandboxState } from '../context/SandboxContext.js';
import { announce } from '../ui/announcer.js';
import { SETTINGS_SECTIONS } from '../sidebar/sections/registry.js';
import type { HistoryStepInfo, SandboxHistory } from './sandboxHistory.js';
import { hasWindow } from '../env/window.js';

/** Inputs that take no typing: the keys go to the history over them. */
const KEYLESS_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** Whether a key goes to a field that undoes its own typing (or to the
 *  Markdown editor, which binds the keys itself). */
export function typesOwnUndo(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest('.cm-editor')) return true;
  const field = el.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') as HTMLElement | null;
  if (!field) return false;
  if (field.tagName === 'INPUT') return !KEYLESS_INPUTS.has(((field as HTMLInputElement).type || 'text').toLowerCase());
  return true;
}

/** Which history key an event is, if any. */
export function historyKeyOf(ev: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): 'undo' | 'redo' | null {
  if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return null;
  const key = ev.key.toLowerCase();
  if (key === 'z') return ev.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !ev.shiftKey) return 'redo';
  return null;
}

/** What a step was, in the words the announcement uses. */
export function describeStep(step: HistoryStepInfo, state: Pick<SandboxState, 'chapters'>, labels: SandboxLabels): string {
  if (step.kind === 'text') {
    const chapter = state.chapters.find((c) => c.id === step.chapterId);
    return labels.historyStepText.replace('__chapter__', chapter?.title ?? '');
  }
  // A picture's marks (#866): the resource by its id.
  if (step.kind === 'resource') return labels.historyStepResource.replace('__resource__', step.resourceId);
  // The changes of an edited Word export (#1397), or of a replace-all over
  // the book, all at once.
  if (step.kind === 'group') return step.source === 'find' ? labels.historyStepReplaceAll : labels.historyStepWordEdits;
  // The Design panel sections of the settings it touched, by their names.
  const names: string[] = [];
  for (const key of step.keys) {
    const section = SETTINGS_SECTIONS.find((sec) => (sec.configKeys as readonly string[]).includes(key));
    const name = section ? labels[section.labelKey] : undefined;
    if (typeof name === 'string' && name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0 || names.length > 2) return labels.historyStepDesign;
  return labels.historyStepDesignIn.replace('__section__', names.join(', '));
}

/** Undo or redo from the interface (keys, toolbar), showing the chapter a
 *  text step belongs to, and say what was taken back or put back. */
export function runHistoryFromUi(history: SandboxHistory, dir: 'undo' | 'redo', getState: () => SandboxState): HistoryStepInfo | null {
  const step = dir === 'undo' ? history.undo({ follow: true }) : history.redo({ follow: true });
  const state = getState();
  const labels = state.labels;
  if (!step) {
    announce(dir === 'undo' ? labels.historyNothingToUndo : labels.historyNothingToRedo);
    return null;
  }
  const what = describeStep(step, state, labels);
  announce((dir === 'undo' ? labels.historyUndone : labels.historyRedone).replace('__what__', what));
  return step;
}

/** Listen for the keys on the window; returns the function that stops. */
export function installHistoryKeys(history: SandboxHistory, getState: () => SandboxState): () => void {
  if (!hasWindow()) return () => undefined;
  const onKey = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented) return;
    const dir = historyKeyOf(ev);
    if (!dir) return;
    if (typesOwnUndo(ev.target) || typesOwnUndo(document.activeElement)) return;
    ev.preventDefault();
    runHistoryFromUi(history, dir, getState);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
