/**
 * Dev-only performance marks for the sandbox.
 *
 * Off unless `localStorage.postextPerf === '1'` or the page URL carries
 * `?perf` (or `perf=1`). When on, every span becomes a `performance.measure`
 * (visible in the DevTools Performance panel) and one `console.debug` row
 * `[perf] name ms detail`, so a session can be read back from the console
 * or from `performance.getEntriesByType('measure')`.
 *
 * Nothing here allocates or stringifies while the switch is off: the size
 * helpers return 0, spans are no-ops.
 */

const STORAGE_KEY = 'postextPerf';

let enabled: boolean | null = null;

export function perfEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === 'undefined') return (enabled = false);
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) === '1';
    const query = /[?&]perf(=1|&|$)/.test(window.location.search);
    enabled = stored || query;
  } catch {
    enabled = false;
  }
  return enabled;
}

/** Toggle at runtime (from the console: `postextPerf.set(true)`). */
export function setPerfEnabled(on: boolean): void {
  enabled = on;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type PerfDetail = Record<string, string | number | boolean | null | undefined>;

export interface PerfSpan {
  /** Close the span; `extra` is merged into the detail of the row. */
  end(extra?: PerfDetail): number;
}

const NOOP_SPAN: PerfSpan = { end: () => 0 };

const now = (): number => performance.now();

function log(name: string, ms: number, detail: PerfDetail | undefined): void {
  const parts: string[] = [];
  if (detail) {
    for (const [k, v] of Object.entries(detail)) {
      if (v === undefined) continue;
      parts.push(`${k}=${typeof v === 'number' ? Math.round(v * 10) / 10 : String(v)}`);
    }
  }
  console.debug(`[perf] ${name.padEnd(22)} ${String(Math.round(ms)).padStart(6)} ms  ${parts.join(' ')}`);
}

/** A point in time with no duration. */
export function perfMark(name: string, detail?: PerfDetail): void {
  if (!perfEnabled()) return;
  try {
    performance.mark(`postext:${name}`, { detail });
  } catch {
    /* older browsers */
  }
  log(name, 0, detail);
}

/** Open a span; call `end()` when the work is done. */
export function perfSpan(name: string, detail?: PerfDetail): PerfSpan {
  if (!perfEnabled()) return NOOP_SPAN;
  const start = now();
  let closed = false;
  return {
    end(extra) {
      if (closed) return 0;
      closed = true;
      const ms = now() - start;
      const merged = extra ? { ...detail, ...extra } : detail;
      try {
        performance.measure(`postext:${name}`, { start, end: start + ms, detail: merged });
      } catch {
        /* older browsers */
      }
      log(name, ms, merged);
      return ms;
    },
  };
}

/** Approximate serialized size in KB of a structured-clone payload; 0 when off. */
export function perfSizeKb(value: unknown): number {
  if (!perfEnabled()) return 0;
  try {
    return Math.round(JSON.stringify(value).length / 1024);
  } catch {
    return -1;
  }
}

/**
 * Observers for what the marks cannot see: input events whose handling
 * (React render + commit included) took longer than a frame, and
 * animation frames blocked longer than 50 ms, attributed to their scripts.
 */
export function installPerfObservers(): void {
  if (!perfEnabled() || typeof PerformanceObserver === 'undefined') return;
  const w = window as Window & { __postextPerfObservers?: boolean };
  if (w.__postextPerfObservers) return;
  w.__postextPerfObservers = true;
  try {
    const events = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const entry = e as PerformanceEntry & { processingStart?: number; processingEnd?: number };
        if (entry.name !== 'input' && entry.name !== 'keydown' && entry.name !== 'click') continue;
        const processing = entry.processingEnd !== undefined && entry.processingStart !== undefined
          ? entry.processingEnd - entry.processingStart
          : undefined;
        log(`event.${entry.name}`, entry.duration, { processing });
      }
    });
    events.observe({ type: 'event', buffered: false, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* Event Timing unsupported */
  }
  try {
    const frames = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const entry = e as PerformanceEntry & { blockingDuration?: number; scripts?: Array<{ invoker?: string; sourceFunctionName?: string; duration: number }> };
        if (entry.duration < 50) continue;
        const scripts = (entry.scripts ?? [])
          .slice(0, 3)
          .map((s) => `${s.invoker ?? ''}|${s.sourceFunctionName ?? ''}|${Math.round(s.duration)}`)
          .join(' ');
        log('long-frame', entry.duration, { blocking: entry.blockingDuration, scripts });
      }
    });
    frames.observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    /* LoAF unsupported */
  }
}

declare global {
  interface Window {
    postextPerf?: { set(on: boolean): void; enabled(): boolean };
  }
}

if (typeof window !== 'undefined' && !window.postextPerf) {
  window.postextPerf = { set: setPerfEnabled, enabled: perfEnabled };
  installPerfObservers();
}
