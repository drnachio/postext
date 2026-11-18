// The setups of two passes compared (#1639): whether a pass over edited
// content may start from a checkpoint of the pass before it, and the
// numbers its checkpoints name the objects of a setup by.
import { SOURCE_KEYS } from './passMade.js';
import { ALL_OF_IT, HintGroupRead, groupHint, type SetupNames } from './passTape.js';

/** What a pass leaves of its setup for the next build's comparison. */
export interface PassSetup {
  roots: Record<string, unknown>;
  /** The text the blocks were read from. */
  body: string;
  /** Whether an object is on the pass's tape (state, not setup). */
  tracks: (value: object) => boolean;
  /** The reads of the hints the pass made, in order. */
  hintReads: [member: string, key: unknown][];
}

/** Members of a setup the comparison leaves alone: the text itself and
 *  its parse (the blocks made from it are compared one by one). */
const TEXT_KEYS = new Set(['markdown', 'markdownBody', 'parsedBody']);

/** The numbers of the objects of a pass's setups, build after build. */
export class Names implements SetupNames {
  private readonly ids = new WeakMap<object, number>();
  private objects = new Map<number, object>();
  private next = 0;

  idOf(value: object): number | undefined {
    return this.ids.get(value);
  }

  byId(id: number): object | undefined {
    return this.objects.get(id);
  }

  name(value: object): number {
    let id = this.ids.get(value);
    if (id === undefined) {
      id = this.next++;
      this.ids.set(value, id);
      this.objects.set(id, value);
    }
    return id;
  }

  /** A new setup takes the numbers of the one before: each object of
   *  `pairs` its predecessor's. What the new setup has no pair for (what a
   *  changed block holds) is forgotten with the old setup. */
  succeed(pairs: ReadonlyMap<object, object>): void {
    const objects = new Map<number, object>();
    for (const [before, now] of pairs) {
      const id = this.ids.get(before);
      if (id === undefined) continue;
      this.ids.set(now, id);
      objects.set(id, now);
    }
    this.objects = objects;
  }
}

export interface Pairing {
  /** First place of the text that differs, and by how much its length. */
  at: number;
  delta: number;
  pairs: Map<object, object>;
  /** Content blocks that differ, by index. */
  changed: number[];
  tracksBefore: (value: object) => boolean;
  tracksNow: (value: object) => boolean;
}

/** Whether `before` and `now` are equal for a layout: the same data, the
 *  places in the source after the edit moved by its length. Pairs the
 *  objects it finds equal. `key`: the member name they stand under. */
function same(before: unknown, now: unknown, key: string, p: Pairing): boolean {
  if (typeof before !== 'object' || before === null) {
    if (Object.is(before, now)) return true;
    return typeof before === 'number' && SOURCE_KEYS.has(key) && p.delta !== 0 && before >= p.at && now === before + p.delta;
  }
  // Objects are walked even when they are one object in both setups: the
  // pairing must hold every object the checkpoints may name.
  if (typeof now !== 'object' || now === null) return false;
  const other = now as object;
  const paired = p.pairs.get(before);
  if (paired !== undefined) return paired === other;
  const stateBefore = p.tracksBefore(before);
  if (stateBefore || p.tracksNow(other)) return stateBefore && p.tracksNow(other);
  p.pairs.set(before, other);
  if (Array.isArray(before)) {
    if (!Array.isArray(other) || other.length !== before.length) return false;
    for (let i = 0; i < before.length; i++) if (!same(before[i], other[i], key, p)) return false;
    return true;
  }
  if (before instanceof Map) {
    if (!(other instanceof Map) || other.size !== before.size) return false;
    const entries = other.entries();
    for (const [k, v] of before) {
      const [ok, ov] = entries.next().value as [unknown, unknown];
      if (!same(k, ok, '', p) || !same(v, ov, key, p)) return false;
    }
    return true;
  }
  if (before instanceof Set) {
    if (!(other instanceof Set) || other.size !== before.size) return false;
    const items = other.values();
    for (const item of before) if (!same(item, items.next().value, '', p)) return false;
    return true;
  }
  const proto = Object.getPrototypeOf(before) as unknown;
  if ((proto !== Object.prototype && proto !== null) || Object.getPrototypeOf(other) !== proto) return false;
  const a = before as Record<string, unknown>;
  const b = other as Record<string, unknown>;
  // Under a member that holds places in the source (`attrSources`: each
  // attribute's start and end) every number is one.
  const places = SOURCE_KEYS.has(key);
  for (const name in a) if (!same(a[name], b[name], places ? key : name, p)) return false;
  for (const name in b) if (!(name in a) && b[name] !== undefined) return false;
  return true;
}

/**
 * Compare the setup of the pass before (`before`) with this pass's
 * (`now`). Undefined with the reason when they differ in more than the
 * blocks an edit changed; else the pairing, its `changed` the blocks that
 * differ. The roots are objects of named members: the text and its parse
 * are left out, a function that is a member of a root stands for itself
 * (the helpers a setup makes from what is compared here), and the content
 * blocks are compared one by one.
 */
export function pairSetups(before: PassSetup, roots: Record<string, unknown>, body: string, tracksNow: (value: object) => boolean): Pairing | string {
  let at = 0;
  const limit = Math.min(before.body.length, body.length);
  while (at < limit && before.body.charCodeAt(at) === body.charCodeAt(at)) at++;
  const p: Pairing = { at, delta: body.length - before.body.length, pairs: new Map(), changed: [], tracksBefore: before.tracks, tracksNow };
  // The content blocks first, each a zone of its own: a block that differs
  // is paired with its successor all the same, so that the lists that
  // hold it compare equal; what it holds stays unpaired.
  const blocksBefore = (before.roots.contentSetup as { contentBlocks?: unknown[] } | undefined)?.contentBlocks;
  const blocksNow = (roots.contentSetup as { contentBlocks?: unknown[] } | undefined)?.contentBlocks;
  if (!blocksBefore || !blocksNow || blocksBefore.length !== blocksNow.length) return 'the number of blocks changed';
  for (let i = 0; i < blocksBefore.length; i++) {
    const a = blocksBefore[i] as object;
    const b = blocksNow[i] as object;
    if (same(a, b, '', p)) continue;
    p.changed.push(i);
    p.pairs.set(a, b);
  }
  p.pairs.set(before.roots, roots);
  for (const rootName in before.roots) {
    if (rootName === 'hints') continue;
    const a = before.roots[rootName] as Record<string, unknown> | undefined;
    const b = roots[rootName] as Record<string, unknown> | undefined;
    if (a === undefined && b === undefined) continue;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${rootName} changed`;
    p.pairs.set(a, b);
    for (const name in a) {
      if (TEXT_KEYS.has(name) || name === 'contentBlocks') continue;
      if (typeof a[name] === 'function' && typeof b[name] === 'function') continue;
      if (!same(a[name], b[name], name, p)) return `${rootName}.${name} changed`;
    }
    for (const name in b) if (!(name in a) && b[name] !== undefined) return `${rootName}.${name} is new`;
  }
  return p;
}

/**
 * How many of the reads the pass before made of its hints this pass's
 * hints answer the same way: a checkpoint taken before the first read
 * that differs was reached under the same answers. Pairs the hint objects
 * found equal. A hint that is no map or set (read with no note) must be
 * equal, or none of the reads counts.
 */
export function sameHintReads(before: PassSetup, hints: Record<string, unknown>, p: Pairing): number {
  const old = before.roots.hints as Record<string, unknown>;
  p.pairs.set(old, hints);
  const strict: Pairing = { ...p, delta: 0 };
  for (const member of new Set([...Object.keys(old), ...Object.keys(hints)])) {
    const a = old[member];
    const b = hints[member];
    if (a instanceof Map || a instanceof Set || b instanceof Map || b instanceof Set) continue;
    if (!same(a, b, member, strict)) return 0;
  }
  const whole = new Map<string, boolean>();
  const wholeSame = (member: string): boolean => {
    let known = whole.get(member);
    if (known === undefined) whole.set(member, (known = same(old[member], hints[member], member, { ...strict, pairs: new Map(p.pairs) })));
    return known;
  };
  for (let i = 0; i < before.hintReads.length; i++) {
    const [member, key] = before.hintReads[i]!;
    const a = old[member] as Map<unknown, unknown> | Set<unknown> | undefined;
    const b = hints[member] as Map<unknown, unknown> | Set<unknown> | undefined;
    if (key === ALL_OF_IT || a === undefined || b === undefined) {
      if (!wholeSame(member)) return i;
      continue;
    }
    if (key instanceof HintGroupRead) {
      if (!(a instanceof Map) || !(b instanceof Map)) return i;
      const before = groupHint(member, a).get(key.group) ?? [];
      const now = groupHint(member, b).get(key.group) ?? [];
      if (before.length !== now.length || !before.every(([k, v], n) => Object.is(k, now[n]![0]) && same(v, now[n]![1], member, strict))) return i;
      continue;
    }
    if (a.has(key) !== b.has(key)) return i;
    if (a instanceof Map && b instanceof Map && !same(a.get(key), b.get(key), member, strict)) return i;
  }
  return before.hintReads.length;
}
