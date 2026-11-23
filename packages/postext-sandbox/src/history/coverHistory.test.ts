import { afterEach, describe, expect, it } from 'vitest';
import { sandboxReducer, type SandboxAction, type SandboxState } from '../context/SandboxContext.js';
import { state as baseState } from '../webmcp/tools/testHarness.js';
import { COALESCE_MS, createSandboxHistory, setActiveHistory } from './sandboxHistory.js';
import { describeStep } from './historyKeys.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';

// #1669: the cover's text written from the Cover panel is a step of the one
// undo history.

function setup() {
  let current: SandboxState = { ...baseState() };
  let clock = 1_000;
  const reduce = (action: SandboxAction) => { current = sandboxReducer(current, action); };
  const history = createSandboxHistory({ dispatch: reduce, getState: () => current, editorStates: () => new Map(), now: () => clock });
  setActiveHistory(history);
  return { history, dispatch: history.dispatch, get: () => current, tick: (ms: number) => { clock += ms; } };
}

const write = (payload: string, history?: false): SandboxAction => ({ type: 'SET_COVER_MARKDOWN', payload, ...(history === false ? { history } : {}) });

afterEach(() => setActiveHistory(null));

describe('cover steps of the history (#1669)', () => {
  it('undoes and redoes a write of the cover’s text', () => {
    const env = setup();
    env.dispatch(write(':::frame{slot="back"}\nA blurb\n:::'));
    expect(env.history.peek()).toEqual({ kind: 'cover' });
    expect(describeStep({ kind: 'cover' }, env.get(), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.historyStepCover);
    env.history.undo();
    expect(env.get().coverMarkdown).toBeUndefined();
    env.history.redo();
    expect(env.get().coverMarkdown).toContain('A blurb');
  });

  it('joins writes typed close together, and keeps apart those that are not', () => {
    const env = setup();
    env.dispatch(write('a'));
    env.tick(200);
    env.dispatch(write('ab'));
    env.tick(COALESCE_MS + 1);
    env.dispatch(write('abc'));
    env.history.undo();
    expect(env.get().coverMarkdown).toBe('ab');
    env.history.undo();
    expect(env.get().coverMarkdown).toBeUndefined();
    expect(env.history.canUndo()).toBe(false);
  });

  it('leaves out writes that say so, and a write back to where it was', () => {
    const env = setup();
    env.dispatch(write('x', false));
    expect(env.history.canUndo()).toBe(false);
    env.dispatch(write('xy'));
    env.tick(100);
    env.dispatch(write('x'));
    expect(env.history.canUndo()).toBe(false);
  });
});
