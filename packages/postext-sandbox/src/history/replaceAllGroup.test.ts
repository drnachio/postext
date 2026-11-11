import { afterEach, describe, expect, it } from 'vitest';
import { sandboxReducer, type SandboxAction, type SandboxState } from '../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { state as baseState } from '../webmcp/tools/testHarness.js';
import { applyViewerEdits, resetViewerEdits } from '../editor/viewerEdits.js';
import { describeStep } from './historyKeys.js';
import { createSandboxHistory, setActiveHistory } from './sandboxHistory.js';

// The find bar's replace-all over the book: the edits of every chapter it
// touched are one step of the history.

function setup() {
  let current: SandboxState = baseState();
  const reduce = (action: SandboxAction) => { current = sandboxReducer(current, action); };
  // The saved editor states of the chapters not in the editor: kept, as
  // the Sandbox keeps them, so their steps can be taken back.
  const saved = new Map();
  const history = createSandboxHistory({ dispatch: reduce, getState: () => current, editorStates: () => saved });
  setActiveHistory(history);
  return { history, dispatch: history.dispatch, get: () => current };
}

afterEach(() => {
  setActiveHistory(null);
  resetViewerEdits();
});

describe('replace-all over the book', () => {
  it('takes back the replacements of several chapters as one step', () => {
    const env = setup();
    const before = env.get().chapters.map((c) => c.markdown);
    const edits = env.get().chapters.slice(0, 2).map((c) => ({
      chapterId: c.id,
      changes: [{ from: 0, to: 0, insert: 'X ' }],
      baseLength: c.markdown.length,
    }));
    applyViewerEdits(env.dispatch, edits, env.get().activeChapterId);
    const step = env.history.peek();
    expect(step).toMatchObject({ kind: 'group', source: 'find' });
    expect(describeStep(step!, env.get(), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.historyStepReplaceAll);
    expect(env.get().chapters.slice(0, 2).every((c) => c.markdown.startsWith('X '))).toBe(true);

    env.history.undo();
    expect(env.get().chapters.map((c) => c.markdown)).toEqual(before);
    expect(env.history.canUndo()).toBe(false);
  });

  it('keeps a replacement in one chapter as an ordinary text step', () => {
    const env = setup();
    const c = env.get().chapters[0]!;
    applyViewerEdits(env.dispatch, [{ chapterId: c.id, changes: [{ from: 0, to: 0, insert: 'X ' }], baseLength: c.markdown.length }], c.id);
    expect(env.history.peek()).toMatchObject({ kind: 'text', chapterId: c.id });
  });
});
