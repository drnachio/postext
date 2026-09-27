// The debounced save of the working copy: every change schedules one write
// a moment later; a flush writes a pending one now (before another book is
// opened, when the page is hidden or left, when the sandbox unmounts), a
// discard drops it (the book it belongs to is being deleted).

export interface SaveScheduler {
  /** A change happened: write it once the changes pause. */
  schedule: () => void;
  /** Write the pending change now, if there is one. */
  flush: () => Promise<void>;
  /** Drop the pending change without writing it. */
  discard: () => void;
  /** Whether a change is waiting to be written. */
  pending: () => boolean;
}

export interface SaveTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const DEFAULT_TIMERS: SaveTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSaveScheduler(
  persist: () => Promise<void>,
  delayMs: number,
  timers: SaveTimers = DEFAULT_TIMERS,
): SaveScheduler {
  let handle: unknown;
  let dirty = false;
  const stop = () => {
    if (handle !== undefined) timers.clear(handle);
    handle = undefined;
  };
  const write = (): Promise<void> => {
    stop();
    dirty = false;
    return persist().catch(() => undefined);
  };
  return {
    schedule: () => {
      dirty = true;
      stop();
      handle = timers.set(() => {
        handle = undefined;
        void write();
      }, delayMs);
    },
    flush: () => (dirty ? write() : Promise.resolve()),
    discard: () => {
      dirty = false;
      stop();
    },
    pending: () => dirty,
  };
}
