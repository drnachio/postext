import { describe, it, expect, vi } from 'vitest';

// The MathJax module fails to load the first time, then works.
const mathjaxModule = vi.hoisted(() => ({ fail: true, loads: 0 }));
vi.mock('../math/mathjax', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../math/mathjax')>();
  return {
    ...actual,
    createMathJaxConverter: () => {
      mathjaxModule.loads++;
      if (mathjaxModule.fail) throw new Error('network down');
      return actual.createMathJaxConverter();
    },
  };
});

import { initMathEngine, isMathReady, onMathReady } from '../math';

describe('initMathEngine failure', () => {
  it('rejects with a clear message, and a later call starts the engine', async () => {
    const ready = vi.fn();
    onMathReady(ready);
    await expect(initMathEngine()).rejects.toThrow('[postext] the math engine failed to start: network down');
    expect(isMathReady()).toBe(false);
    expect(ready).not.toHaveBeenCalled();

    mathjaxModule.fail = false;
    await initMathEngine();
    expect(isMathReady()).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
    // Started: later calls do not load MathJax again.
    await initMathEngine();
    expect(mathjaxModule.loads).toBe(2);
  });
});
