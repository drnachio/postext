// A paragraph's inline reading kept by its text (#1647). A keystroke in a
// chapter changes one paragraph and moves the ones after it in the source;
// each reading of the chapter (the Sandbox's book plan on the page, the
// layout on the worker) read every paragraph again. A paragraph read
// before, with the same text and the same reading, comes back as it was
// read, its places in the source moved to where it stands now.
//
// Where a reading names a place in the source: `sourceStart` and
// `sourceEnd` (maths, references, citations, footnote markers, swatches,
// gaps, issues) and the `sourceMap` lists. A chip's `sourceOffsets` count
// from the chip and do not move.

import type { ParseIssue } from '../types.js';

/** What a reading gave: its result and the issues it reported. */
export interface KeptReading<T> {
  result: T;
  issues: ParseIssue[];
}

interface Kept {
  /** Where the paragraph stood in the source when it was read. */
  start: number;
  result: unknown;
  issues: ParseIssue[];
  size: number;
}

/** The readings kept, oldest first; at most this many characters of text
 *  in their keys (a long book's chapters, a few times over). */
const MAX_KEPT_CHARS = 6_000_000;
const kept = new Map<string, Kept>();
let keptChars = 0;

/** On in tests (`POSTEXT_PARSE_CHECK=1`): every reading taken from the
 *  kept ones is read again and must be the same. */
interface KeptRunsCheck {
  differ(key: string, kept: string, fresh: string): never;
}
const check = (): KeptRunsCheck | undefined => (globalThis as { __postextKeptRunsCheck?: KeptRunsCheck }).__postextKeptRunsCheck;

/** `value` copied, with every place in the source moved by `delta`. Objects
 *  held twice are copied once. */
function moved<T>(value: T, delta: number, done = new Map<object, unknown>()): T {
  if (typeof value !== 'object' || value === null) return value;
  const known = done.get(value);
  if (known !== undefined) return known as T;
  if (Array.isArray(value)) {
    const list: unknown[] = new Array(value.length);
    done.set(value, list);
    for (let i = 0; i < value.length; i++) list[i] = moved(value[i] as unknown, delta, done);
    return list as T;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  done.set(value, out);
  for (const key in value) {
    const member = (value as Record<string, unknown>)[key];
    if ((key === 'sourceStart' || key === 'sourceEnd') && typeof member === 'number') out[key] = member + delta;
    else if (key === 'sourceMap' && Array.isArray(member)) {
      const map = new Array<unknown>(member.length);
      for (let i = 0; i < member.length; i++) {
        const n: unknown = member[i];
        map[i] = typeof n === 'number' ? n + delta : moved(n, delta, done);
      }
      out[key] = map;
    } else out[key] = moved(member, delta, done);
  }
  return out as T;
}

function remember(key: string, entry: Kept): void {
  const had = kept.get(key);
  if (had) {
    kept.delete(key);
    keptChars -= had.size;
  }
  kept.set(key, entry);
  keptChars += entry.size;
  for (const [oldKey, old] of kept) {
    if (keptChars <= MAX_KEPT_CHARS) break;
    kept.delete(oldKey);
    keptChars -= old.size;
  }
}

/**
 * The reading `key` names, of a paragraph that stands at `start` in the
 * source: kept from an earlier reading of the same text, or read now by
 * `read`. The issues it reported go to `issues` either way. What comes back
 * is the caller's own (later steps of the parse write to it).
 */
export function keptInlineRun<T>(key: string, start: number, issues: ParseIssue[], read: () => KeptReading<T>): T {
  const hit = kept.get(key);
  if (hit) {
    // The most recently used last.
    kept.delete(key);
    kept.set(key, hit);
    const delta = start - hit.start;
    const result = moved(hit.result as T, delta);
    const reported = moved(hit.issues, delta);
    const checking = check();
    if (checking) {
      const fresh = read();
      const a = JSON.stringify([result, reported]);
      const b = JSON.stringify([fresh.result, fresh.issues]);
      if (a !== b) checking.differ(key, a, b);
    }
    for (const issue of reported) issues.push(issue);
    return result;
  }
  const fresh = read();
  remember(key, { start, result: moved(fresh.result, 0), issues: moved(fresh.issues, 0), size: key.length });
  for (const issue of fresh.issues) issues.push(issue);
  return fresh.result;
}

/** Forget every kept reading (tests). */
export function forgetKeptRuns(): void {
  kept.clear();
  keptChars = 0;
}
