import { afterEach, describe, expect, it } from 'vitest';
import type { Resource } from 'postext';
import { sandboxReducer, type SandboxAction, type SandboxState } from '../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { state as baseState } from '../webmcp/tools/testHarness.js';
import { describeStep } from './historyKeys.js';
import { createSandboxHistory, setActiveHistory } from './sandboxHistory.js';

// #1397: the changes of an edited Word export, to several chapters and
// resources, are one step of the history.

const TABLE: Resource = {
  id: 'tabla', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, caption: 'Old caption',
  table: { model: { rows: [[{ content: 'a' }]] } },
} as unknown as Resource;

function setup() {
  let current: SandboxState = { ...baseState(), resources: [TABLE] };
  const reduce = (action: SandboxAction) => { current = sandboxReducer(current, action); };
  // The saved editor states of the chapters not in the editor: kept, as
  // the Sandbox keeps them, so their steps can be taken back.
  const saved = new Map();
  const history = createSandboxHistory({ dispatch: reduce, getState: () => current, editorStates: () => saved });
  setActiveHistory(history);
  return { history, dispatch: history.dispatch, get: () => current };
}

/** Replace a chapter's whole text, as one edit. */
const rewrite = (s: SandboxState, chapterId: string, text: string): SandboxAction => {
  const now = s.chapters.find((c) => c.id === chapterId)!.markdown;
  return { type: 'EDIT_CHAPTER_MARKDOWN', payload: { chapterId, changes: [{ from: 0, to: now.length, insert: text }], baseLength: now.length } };
};

afterEach(() => setActiveHistory(null));

describe('grouped steps of the history (#1397)', () => {
  it('takes back and puts back the edits of several chapters and a resource as one step', () => {
    const env = setup();
    const before = env.get().chapters.map((c) => c.markdown);
    env.history.group('word', { chapters: ['a', 'b'], resources: ['tabla'] });
    env.dispatch(rewrite(env.get(), 'a', '# A\n'));
    env.dispatch(rewrite(env.get(), 'b', '# B\n'));
    env.dispatch({ type: 'UPSERT_RESOURCE', payload: { ...TABLE, caption: 'New caption', updatedAt: 1 }, history: { merge: false } });
    const step = env.history.peek();
    expect(step).toEqual({ kind: 'group', source: 'word', chapterIds: ['a', 'b'], resourceIds: ['tabla'] });
    expect(describeStep(step!, env.get(), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.historyStepWordEdits);

    expect(env.history.undo()).toEqual(step);
    expect(env.get().chapters.map((c) => c.markdown)).toEqual(before);
    expect(env.get().markdown).toBe(before[0]);
    expect(env.get().resources[0]!.caption).toBe('Old caption');
    expect(env.history.canUndo()).toBe(false);

    env.history.redo();
    expect(env.get().chapters.map((c) => c.markdown)).toEqual(['# A\n', '# B\n']);
    expect(env.get().resources[0]!.caption).toBe('New caption');
  });

  it('keeps a step it was not waiting for out of the group, and a group of one is that step', () => {
    const env = setup();
    env.history.group('word', { chapters: ['b'] });
    env.dispatch(rewrite(env.get(), 'a', '# Typed elsewhere\n'));
    env.dispatch(rewrite(env.get(), 'b', '# B\n'));
    expect(env.history.peek()).toEqual({ kind: 'text', chapterId: 'b' });
    env.history.undo();
    expect(env.history.peek()).toEqual({ kind: 'text', chapterId: 'a' });
  });

  it('closes with the steps it has when told, or when its time is up', async () => {
    const env = setup();
    const group = env.history.group('word', { chapters: ['a', 'b'] });
    env.dispatch(rewrite(env.get(), 'a', '# A\n'));
    expect(env.history.canUndo()).toBe(false);
    group.close();
    expect(env.history.peek()).toEqual({ kind: 'text', chapterId: 'a' });

    env.history.group('word', { chapters: ['a', 'b'], resources: ['tabla'] }, 5);
    env.dispatch(rewrite(env.get(), 'a', '# A again\n'));
    env.dispatch(rewrite(env.get(), 'b', '# B\n'));
    await new Promise((r) => setTimeout(r, 20));
    expect(env.history.peek()).toEqual({ kind: 'group', source: 'word', chapterIds: ['a', 'b'], resourceIds: [] });
  });

  it('forgets the part of a group whose chapter left the book', () => {
    const env = setup();
    env.history.group('word', { chapters: ['a', 'b'] });
    env.dispatch(rewrite(env.get(), 'a', '# A\n'));
    env.dispatch(rewrite(env.get(), 'b', '# B\n'));
    env.history.pruneChapters(new Set(['a']));
    expect(env.history.peek()).toEqual({ kind: 'group', source: 'word', chapterIds: ['a'], resourceIds: [] });
  });

  it('lets the oldest part of a group go when its chapter\'s own history forgets it', () => {
    const env = setup();
    env.history.group('word', { chapters: ['a', 'b'] });
    env.dispatch(rewrite(env.get(), 'a', '# A\n'));
    env.dispatch(rewrite(env.get(), 'b', '# B\n'));
    // Past its depth the chapter's history forgets its oldest events: the
    // group's part of chapter a is the oldest, not a later edit.
    for (let n = 0; n < 130; n++) env.dispatch(rewrite(env.get(), 'a', `# A ${n}\n`));
    let undone = 0;
    while (env.history.canUndo() && env.history.peek()?.kind === 'text') {
      env.history.undo();
      undone++;
    }
    expect(undone).toBeGreaterThan(0);
    expect(env.history.peek()).toEqual({ kind: 'group', source: 'word', chapterIds: ['b'], resourceIds: [] });
    env.history.undo();
    expect(env.get().chapters[1]!.markdown).not.toBe('# B\n');
  });
});
