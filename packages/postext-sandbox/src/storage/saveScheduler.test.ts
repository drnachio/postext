import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from './saveScheduler';

describe('createSaveScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes once after the changes pause', async () => {
    const persist = vi.fn(() => Promise.resolve());
    const s = createSaveScheduler(persist, 1000);
    s.schedule();
    vi.advanceTimersByTime(500);
    s.schedule();
    vi.advanceTimersByTime(999);
    expect(persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(s.pending()).toBe(false);
  });

  it('flush writes a pending change now, and only once', async () => {
    const persist = vi.fn(() => Promise.resolve());
    const s = createSaveScheduler(persist, 1000);
    await s.flush();
    expect(persist).not.toHaveBeenCalled();
    s.schedule();
    await s.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(persist).toHaveBeenCalledTimes(1);
    await s.flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('discard drops the pending change', () => {
    const persist = vi.fn(() => Promise.resolve());
    const s = createSaveScheduler(persist, 1000);
    s.schedule();
    s.discard();
    vi.advanceTimersByTime(2000);
    expect(persist).not.toHaveBeenCalled();
    expect(s.pending()).toBe(false);
  });

  it('a failing write does not reject the flush', async () => {
    const s = createSaveScheduler(() => Promise.reject(new Error('quota')), 1000);
    s.schedule();
    await expect(s.flush()).resolves.toBeUndefined();
  });
});
