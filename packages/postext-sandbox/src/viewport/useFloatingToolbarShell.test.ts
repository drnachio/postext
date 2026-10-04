import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBusyLatch } from './useFloatingToolbarShell';

describe('createBusyLatch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns on at once and off only after the grace', () => {
    const changes: boolean[] = [];
    const latch = createBusyLatch(1000, (b) => changes.push(b));
    latch.set(true);
    expect(changes).toEqual([true]);
    latch.set(false);
    vi.advanceTimersByTime(999);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it('keeps on through busy pulses inside the grace', () => {
    const changes: boolean[] = [];
    const latch = createBusyLatch(1000, (b) => changes.push(b));
    for (let i = 0; i < 10; i++) {
      latch.set(true);
      vi.advanceTimersByTime(200);
      latch.set(false);
      vi.advanceTimersByTime(600);
    }
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(400);
    expect(changes).toEqual([true, false]);
  });

  it('ignores a release while already idle', () => {
    const changes: boolean[] = [];
    const latch = createBusyLatch(1000, (b) => changes.push(b));
    latch.set(false);
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([]);
  });
});
