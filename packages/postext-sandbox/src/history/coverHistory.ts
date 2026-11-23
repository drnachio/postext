/**
 * Cover steps of the Sandbox's history (#1669): the cover's Markdown (the
 * back cover's blurb, a flap's text) written from the Cover panel. Writes
 * within {@link COALESCE_MS} of each other are one step, as a number typed
 * digit by digit is; undo puts the Markdown back as it was.
 */

import type { Dispatch } from 'react';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';

/** Writes of the cover closer than this are one step (the history's own
 *  {@link import('./sandboxHistory.js').COALESCE_MS}). */
const COVER_COALESCE_MS = 1000;

export type CoverStep = { kind: 'cover'; before: string; after: string; at: number; open: boolean };

export interface CoverRecorderDeps {
  dispatch: Dispatch<SandboxAction>;
  getState: () => SandboxState;
  now: () => number;
  /** The latest step of the undo list. */
  top: () => { kind: string } | undefined;
  push: (step: CoverStep) => void;
  /** Take the latest step off (a write that came back to where it was). */
  pop: () => void;
  clearRedo: () => void;
  /** Whether writes are steps now (not while a book is being opened). */
  recording: () => boolean;
  notify: () => void;
}

export function coverRecorder(deps: CoverRecorderDeps) {
  // The cover written before React renders it: the next write builds on it.
  let eager: { base: string; next: string } | null = null;
  const stored = () => deps.getState().coverMarkdown ?? '';
  const current = () => {
    const s = stored();
    return eager && eager.base === s ? eager.next : s;
  };
  const setEager = (next: string) => {
    eager = { base: stored(), next };
  };

  const record = (action: Extract<SandboxAction, { type: 'SET_COVER_MARKDOWN' }>) => {
    const before = current();
    const after = action.payload;
    setEager(after);
    if (action.history === false || !deps.recording() || before === after) return;
    const at = deps.now();
    const top = deps.top() as CoverStep | undefined;
    if (top?.kind === 'cover' && top.open && at - top.at <= COVER_COALESCE_MS) {
      top.after = after;
      top.at = at;
      if (top.before === top.after) deps.pop();
      deps.clearRedo();
    } else {
      deps.push({ kind: 'cover', before, after, at, open: true });
    }
    deps.notify();
  };

  const run = (step: CoverStep, dir: 'undo' | 'redo') => {
    const next = dir === 'undo' ? step.before : step.after;
    setEager(next);
    deps.dispatch({ type: 'SET_COVER_MARKDOWN', payload: next, history: false });
  };

  return { record, run, reset: () => { eager = null; } };
}
