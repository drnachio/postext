// Where a pass over edited content rejoins the pass before it (#1639).
//
// A pass that started from a checkpoint before an edit places the pages
// the edit changed. Most edits change a page or two: after them the pass
// is where the pass before was at the same block, and from there on it
// would do what that pass did. `tapeRejoins` says when: the live tape
// against the checkpoint the pass before left at that block.
//
// The two are in the same state when everything on the tape is equal,
// but for two things. The places in the source after the edit are moved
// by its length. And the closed pages are not looked into: the pages the
// edit changed are other pages now, so a closed object of the one tape is
// matched with the closed object that stands in its place on the other.
// Counters are compared as they are: a paragraph the edit made break
// into one block more has moved every block number after it, and the two
// passes do not rejoin.

import { SOURCE_KEYS } from './passMade.js';
import { SetupRef, type PassTape, type TapeImage } from './passTape.js';

type Plain = Record<string, unknown>;

/**
 * Whether the live `tape` is in the state `image` holds (a checkpoint of
 * the pass before, taken before the same block), the text having become
 * `delta` longer at `at` since. Returns the closed objects of the image
 * with the live closed object in the place of each; when the two states
 * differ, where the first difference is (for the benchmarks).
 */
export function tapeRejoins(tape: PassTape, image: TapeImage, at: number, delta: number): Map<object, object> | string {
  const names = tape.names;
  if (!names || image.opaque) return 'the checkpoint cannot be read by another pass';
  const { bindings, variables, tables, kept } = tape.parts();
  const closed = new Map<object, object>();
  const open = new Map<object, object>();
  const sideOf = new Map<object, { table: string; value: unknown }[]>();
  for (const entry of image.side) {
    const list = sideOf.get(entry.key);
    if (list) list.push(entry);
    else sideOf.set(entry.key, [entry]);
  }

  /** Where the walk is, for the report of a difference. */
  const path: string[] = [];
  let differs = '';
  const no = (): false => {
    if (!differs) differs = path.join('.');
    return false;
  };

  /** `source`: under a member that holds places in the source. `word`: a
   *  word of a line, read whole even where a test has frozen it. */
  const same = (live: unknown, old: unknown, source: boolean, word: boolean): boolean => {
    if (old instanceof SetupRef) return typeof live === 'object' && live !== null && names.idOf(live) === old.id;
    if (typeof old !== 'object' || old === null) {
      if (Object.is(live, old)) return true;
      return source && typeof old === 'number' && delta !== 0 && old >= at && live === old + delta;
    }
    if (typeof live !== 'object' || live === null || kept.has(live)) return false;
    const frozen = Object.isFrozen(old);
    if (!word) {
      if (frozen !== Object.isFrozen(live)) return false;
      if (frozen) {
        const paired = closed.get(old);
        if (paired !== undefined) return paired === live;
        closed.set(old, live);
        return true;
      }
    }
    const paired = open.get(old);
    if (paired !== undefined) return paired === live;
    open.set(old, live);
    if (Array.isArray(old)) {
      if (!Array.isArray(live) || live.length !== old.length) return false;
      for (let i = 0; i < old.length; i++) {
        path.push(String(i));
        if (!same(live[i], old[i], source, word)) return no();
        path.pop();
      }
    } else if (old instanceof Map) {
      if (!(live instanceof Map) || live.size !== old.size) return false;
      const entries = live.entries();
      for (const [k, v] of old) {
        const [lk, lv] = entries.next().value as [unknown, unknown];
        if (!same(lk, k, false, false) || !same(lv, v, source, false)) return false;
      }
    } else if (old instanceof Set) {
      if (!(live instanceof Set) || live.size !== old.size) return false;
      const items = live.values();
      for (const item of old) if (!same(items.next().value, item, false, false)) return false;
    } else {
      const proto = Object.getPrototypeOf(old) as unknown;
      if ((proto !== Object.prototype && proto !== null) || Object.getPrototypeOf(live) !== proto) return live === old;
      const a = live as Plain;
      const b = old as Plain;
      for (const key in b) {
        const inSource = source || SOURCE_KEYS.has(key);
        path.push(key);
        if (!same(a[key], b[key], inSource, key === 'segments')) return no();
        path.pop();
      }
      for (const key in a) if (!(key in b) && a[key] !== undefined) return no();
    }
    if (word) return true;
    // What the side tables hold of the two objects.
    const entries = sideOf.get(old);
    for (const { name, table } of tables) {
      const entry = entries?.find((e) => e.table === name);
      if (table.has(live) !== (entry !== undefined)) return false;
      if (entry && table instanceof WeakMap && !same(table.get(live), entry.value, false, false)) return false;
    }
    return true;
  };

  for (const [name, value] of bindings) {
    path.length = 0;
    path.push(name);
    if (!image.bindings.has(name) || !same(value, image.bindings.get(name), false, false)) return differs || name;
  }
  for (const [name, v] of variables) {
    if (!same(v.get(), image.variables.get(name), false, false)) return name;
  }
  return closed;
}

/** Every object of `values` (pages), the words of their lines apart. */
export function objectsOf(values: readonly unknown[]): Set<object> {
  const out = new Set<object>();
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || out.has(value)) return;
    const array = Array.isArray(value);
    if (!array) {
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) return;
    }
    out.add(value);
    if (array) for (const item of value as unknown[]) walk(item);
    else for (const key in value) if (key !== 'segments') walk((value as Plain)[key]);
  };
  for (const value of values) walk(value);
  return out;
}
