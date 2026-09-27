import { describe, expect, it } from 'vitest';
import type { PanelId } from '../types';
import { openBookThenShowChapters } from './openBook';

function harness(panel: PanelId | null = 'projects') {
  const calls: string[] = [];
  let current = panel;
  return {
    calls,
    setPanel: (p: PanelId | null) => { current = p; },
    deps: {
      getPanel: () => current,
      showChapters: () => { calls.push('chapters'); current = 'chapters'; },
    },
  };
}

describe('openBookThenShowChapters', () => {
  it('moves to the Chapters panel once the book is open', async () => {
    const h = harness();
    let opened = false;
    await openBookThenShowChapters(async () => { opened = true; }, h.deps);
    expect(opened).toBe(true);
    expect(h.calls).toEqual(['chapters']);
  });

  it('switches only after the open resolves', async () => {
    const h = harness();
    let resolve!: (v: boolean) => void;
    const done = openBookThenShowChapters(() => new Promise<boolean>((r) => { resolve = r; }), h.deps);
    expect(h.calls).toEqual([]);
    resolve(true);
    await done;
    expect(h.calls).toEqual(['chapters']);
  });

  it('stays when the book did not open', async () => {
    const h = harness();
    await openBookThenShowChapters(async () => false, h.deps);
    await openBookThenShowChapters(async () => { throw new Error('Project not found'); }, h.deps);
    expect(h.calls).toEqual([]);
  });

  it('does not pull the reader back from another panel', async () => {
    const h = harness();
    await openBookThenShowChapters(async () => { h.setPanel('config'); return true; }, h.deps);
    expect(h.calls).toEqual([]);
  });
});
