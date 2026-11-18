// The tape of a placement pass (#1639): everything a pass changes while it
// places blocks, named in one place, so that the pass can be saved at a
// block and taken up again from there.
//
// A pass keeps its state in the collections its factories declare
// (`pipeline/build/pass/`), in `PassState` and the cursor, in the document
// it builds and in side tables other modules keep by the document's
// objects. Each factory names its collections to the tape (`track`), each
// module its side tables (`passSideTable`). A checkpoint is one copy of
// all of it that keeps identity: a column that is a map's key and a member
// of its page is one object in the copy too.
//
// What the copier does not copy is kept by reference: the objects of the
// setup (content blocks, planned floats and boxes, resources, styles,
// named with `atoms`), frozen objects, functions, and objects of a class.
//
// This file imports nothing of the engine but `passMade.ts`, which
// imports nothing: the modules that keep side tables import it.

import { SOURCE_KEYS } from './passMade.js';

/** A table another module keeps by an object of the document. */
type SideTable = WeakMap<object, unknown> | WeakSet<object>;

const sideTables: { name: string; table: SideTable }[] = [];

/** Name a side table kept by objects of the document being built: a
 *  checkpoint copies the entries of the objects it copies. Returns the
 *  table. */
export function passSideTable<T extends SideTable>(name: string, table: T): T {
  sideTables.push({ name, table });
  return table;
}

/** A loose variable of a factory, read and written through its closure. */
interface TapeVariable {
  get: () => unknown;
  set: (value: never) => void;
}

/** What a checkpoint holds: a copy of every binding and variable on the
 *  tape, and the side-table entries of the objects copied. Opaque to its
 *  holders. */
export interface TapeImage {
  bindings: Map<string, unknown>;
  variables: Map<string, unknown>;
  /** Entries of the side tables, by the copy of their key and the
   *  table's name (a pass's own weak collections are made anew by every
   *  pass, under the same names). */
  side: { key: object; table: string; value: unknown }[];
  /** The image holds something a pass over other content could not take
   *  up: a function, an object of a class, an object of the setup with no
   *  number. It serves the pass that made it alone. */
  opaque?: boolean;
}

/** A read of a whole hint collection (its size, its entries), in
 *  {@link PassTape.hintReads}. */
export const ALL_OF_IT = Symbol('all of it');

/** A read of one group of a hint map ({@link PassTape.hintGroup}). */
export class HintGroupRead {
  constructor(readonly group: string) {}
}

const NO_ENTRIES: readonly [unknown, unknown][] = [];

/** How the entries of a hint map are grouped for {@link PassTape.hintGroup}:
 *  the band caps by the block, the part of it and the visit their band
 *  opens with (`BandCap` in `pipeline/columns/bandCaps.ts`). */
const HINT_GROUPS: Record<string, (value: never) => string> = {
  bandCaps: (cap: { startContentIndex: number; startPart: number; startVisit?: number }) => `${cap.startContentIndex}:${cap.startPart}:${cap.startVisit ?? 0}`,
};

/** The entries of the hint map `member` by group, in the map's order. */
export function groupHint(member: string, hints: ReadonlyMap<unknown, unknown>): Map<string, [unknown, unknown][]> {
  const groupOf = HINT_GROUPS[member];
  if (!groupOf) throw new Error(`The hint ${member} has no grouping`);
  const groups = new Map<string, [unknown, unknown][]>();
  for (const entry of hints) {
    const group = groupOf(entry[1] as never);
    const list = groups.get(group);
    if (list) list.push(entry);
    else groups.set(group, [entry]);
  }
  return groups;
}

/** How the end of the pass before is taken as the end of a pass that
 *  rejoined it (`passRejoin.ts`): the closed objects it holds of the
 *  pages the two passes share by place give way to this pass's
 *  (`stands`); a closed object of a page the edit changed that nothing
 *  stands for stops it (`gone`); and what is copied has its places in the
 *  source moved by the edit. */
export interface TapeTaken {
  stands: ReadonlyMap<object, object>;
  gone: ReadonlySet<object>;
  at: number;
  delta: number;
}

/** An object of the setup as a checkpoint names it when the pass's setup
 *  is numbered ({@link SetupNames}): by its number, which the same object
 *  of a later setup carries too. */
export class SetupRef {
  constructor(readonly id: number) {}
}

/** The numbers of the objects of a setup. */
export interface SetupNames {
  idOf(value: object): number | undefined;
  byId(id: number): object | undefined;
  /** A number for an object that has none yet. */
  name(value: object): number;
}

type Plain = Record<string, unknown>;

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

export class PassTape {
  private readonly bindings = new Map<string, object>();
  private readonly variables = new Map<string, TapeVariable>();
  /** The tables of this pass, beside the modules': the weak collections
   *  its factories track. */
  private readonly tables: { name: string; table: SideTable }[] = [...sideTables];
  private readonly tracked = new Set<object>();
  private readonly kept = new Set<object>();
  /** Whether a page was closed: a write to one then throws. */
  closedAny = false;
  /** The numbers of the setup's objects, when checkpoints are to outlive
   *  the pass (#1639): they then name those objects by number. */
  names: SetupNames | undefined;
  private readonly refs = new Map<number, SetupRef>();
  /** The highest content block read since {@link counting} began, and
   *  whether reads count now (not while the setup reads the whole list). */
  readUpTo = -1;
  countsReads = false;
  /** Whether the pass's checkpoints are to outlive it. */
  recording = false;
  /** Called once what follows the placing is done (`passReuse.ts`). */
  afterFinish: (() => void) | undefined;
  /** The hints the pass has read, in order: the member of the hints and
   *  the key asked of it, or `ALL_OF_IT` for a read of the whole
   *  collection. A checkpoint keeps how long the list was. */
  hintReads: [member: string, key: unknown][] = [];

  /** `hints` as the pass is to read them when checkpoints outlive the
   *  pass: each map and set through a note of what was asked of it. A
   *  checkpoint then serves a later pass whose hints differ only in what
   *  had not been read yet (the cap of the last page, say). */
  countingHints<T extends object>(hints: T): T {
    if (!this.recording) return hints;
    const out: Record<string, unknown> = {};
    for (const member in hints) {
      const value = (hints as Record<string, unknown>)[member];
      out[member] = value instanceof Map || value instanceof Set ? this.countingCollection(member, value) : value;
    }
    return out as T;
  }

  /** The collections the pass was given, by what it reads them through. */
  private readonly givenHints = new WeakMap<object, Map<unknown, unknown>>();
  private readonly hintGroups = new Map<string, Map<string, [unknown, unknown][]>>();

  /**
   * The entries of the hint `member` (a map, as the pass reads it) that
   * {@link HINT_GROUPS} puts in `group`, in the map's order. For a hint
   * the pass looks up by something other than its key (the band caps, by
   * the block their band opens with): the read is noted as a read of the
   * group, not of the whole map, so that a cap for another band does not
   * count as read here.
   */
  hintGroup<K, V>(member: string, hints: ReadonlyMap<K, V>, group: string): readonly [K, V][] {
    let groups = this.hintGroups.get(member);
    if (!groups) {
      groups = groupHint(member, this.givenHints.get(hints) ?? hints);
      this.hintGroups.set(member, groups);
    }
    if (this.recording) this.hintReads.push([member, new HintGroupRead(group)]);
    return (groups.get(group) ?? NO_ENTRIES) as [K, V][];
  }

  private countingCollection(member: string, collection: Map<unknown, unknown> | Set<unknown>): object {
    const reads = this.hintReads;
    const proxy = new Proxy(collection, {
      get: (target, key) => {
        const value = Reflect.get(target, key, target) as unknown;
        if (typeof value !== 'function') {
          reads.push([member, ALL_OF_IT]);
          return value;
        }
        if (key === 'get' || key === 'has') {
          return (asked: unknown): unknown => {
            reads.push([member, asked]);
            return (value as (k: unknown) => unknown).call(target, asked);
          };
        }
        reads.push([member, ALL_OF_IT]);
        return (value as (...args: unknown[]) => unknown).bind(target);
      },
    });
    if (collection instanceof Map) this.givenHints.set(proxy, collection);
    return proxy;
  }

  /** Whether `value` is on the tape: state of the pass, not its setup. */
  tracks(value: object): boolean {
    this.named();
    return this.tracked.has(value);
  }

  /** `blocks` as the pass is to read it when checkpoints outlive the pass:
   *  through a counter of the highest block read, so that a checkpoint
   *  knows how far ahead of its block the pass had looked. */
  counting<T extends object>(blocks: T[]): T[] {
    if (!this.recording) return blocks;
    return new Proxy(blocks, {
      get: (target, key, receiver) => {
        if (this.countsReads && typeof key === 'string') {
          const c = key.charCodeAt(0);
          if (c >= 48 && c <= 57) {
            const index = Number(key);
            if (index > this.readUpTo) this.readUpTo = index;
          }
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  }

  /** What the factories named, as they named it: read into the tables
   *  above only when a checkpoint is first asked for ({@link named}). A
   *  pass that takes none pays one list entry per factory. */
  private pending: [owner: string, bindings: Record<string, object>][] = [];

  /** Name the collections and objects `owner` changes during the pass. A
   *  weak collection becomes a side table of the pass. */
  track(owner: string, bindings: Record<string, object>): void {
    this.pending.push([owner, bindings]);
  }

  /** Read what {@link track} was given since the last call. */
  private named(): void {
    if (this.pending.length === 0) return;
    for (const [owner, bindings] of this.pending) {
      for (const name in bindings) {
        const value = bindings[name]!;
        this.tracked.add(value);
        if (value instanceof WeakMap || value instanceof WeakSet) this.tables.push({ name: `${owner}.${name}`, table: value });
        else this.bindings.set(`${owner}.${name}`, value);
      }
    }
    this.pending = [];
  }

  /** Name a loose variable of `owner`. */
  variable<T>(name: string, get: () => T, set: (value: T) => void): void {
    this.variables.set(name, { get, set: set as (value: never) => void });
  }

  /** Name the objects of the setup: everything reachable from `roots`
   *  that is not on the tape is kept by reference in a checkpoint. Call
   *  it after the factories that own what is tracked. */
  atoms(roots: unknown): void {
    this.named();
    const walk = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      if (this.kept.has(value) || this.tracked.has(value)) return;
      if (value instanceof WeakMap || value instanceof WeakSet) return;
      this.kept.add(value);
      this.names?.name(value);
      if (Array.isArray(value)) for (const item of value) walk(item);
      else if (value instanceof Map) for (const [k, v] of value) { walk(k); walk(v); }
      else if (value instanceof Set) for (const item of value) walk(item);
      else if (isPlain(value)) for (const key in value) walk((value as Plain)[key]);
    };
    walk(roots);
  }

  /** Close `pages`: nothing of them is written from here on, so every
   *  checkpoint after this holds them by reference. Their objects are
   *  frozen, and a write to one throws: a pass that still had something to
   *  set on a page behind it is placed again from its first block, with no
   *  page closed. The objects of the setup they point at are left alone. */
  close(pages: readonly unknown[]): void {
    this.named();
    const freeze = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      if (this.kept.has(value) || Object.isFrozen(value)) return;
      if (!Array.isArray(value) && !isPlain(value)) return;
      Object.freeze(value);
      if (Array.isArray(value)) for (const item of value) freeze(item);
      else {
        for (const key in value) {
          const member = (value as Plain)[key];
          // The list of a line's words is frozen, the words are not: they
          // are never written to once placed (#1609), and a justified
          // Arabic line makes its own at every pass.
          if (key === 'segments' && Array.isArray(member)) Object.freeze(member);
          else freeze(member);
        }
      }
    };
    for (const page of pages) freeze(page);
    this.closedAny = true;
  }

  /** Give the tape pages it may write to again: the closed pages are left
   *  as they are, for the checkpoints that hold them, and the tape goes on
   *  with copies. For what comes after the blocks are placed, which sets
   *  things on every page. `finished`: pages and blocks that take, in
   *  place of a copy, the object given for them (what the build before
   *  made of the same page, #1639); those stay frozen. */
  open(finished?: ReadonlyMap<object, object>): void {
    this.countsReads = false;
    if (!this.closedAny) return;
    this.named();
    const side: TapeImage['side'] = [];
    const copy = this.copier(side, 'thaw', undefined, finished);
    const bindings = new Map<string, unknown>();
    for (const [name, value] of this.bindings) bindings.set(name, copy(value));
    const variables = new Map<string, unknown>();
    for (const [name, v] of this.variables) variables.set(name, copy(v.get()));
    this.fill({ bindings, variables, side });
    this.closedAny = false;
  }

  /** `mode`: `thaw` copies what is frozen too (the closed pages); `name` writes the objects
   *  of the setup as their numbers and notes in `flags` what a later pass
   *  could not take up; `resolve` reads those numbers back as the objects
   *  of this pass's setup, and throws on a number it does not have. */
  private copier(side: TapeImage['side'], mode?: 'thaw' | 'name' | 'resolve', flags?: { opaque: boolean }, finished?: ReadonlyMap<object, object>, taken?: TapeTaken): (value: unknown) => unknown {
    const done = new Map<object, object>();
    /** A member that holds places in the source, moved by the edit. */
    const movedPlaces = (member: unknown): unknown => {
      if (typeof member === 'number') return member >= taken!.at ? member + taken!.delta : member;
      if (typeof member !== 'object' || member === null) return member;
      const known = done.get(member);
      if (known !== undefined) return known;
      const out = (Array.isArray(member) ? [] : {}) as Record<string | number, unknown>;
      done.set(member, out);
      for (const key in member) out[key] = movedPlaces((member as Record<string, unknown>)[key]);
      return out;
    };
    const thaw = mode === 'thaw';
    const names = this.names;
    const copy = (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null) {
        if (flags && typeof value === 'function') flags.opaque = true;
        return value;
      }
      // A page (or a block) the build before finished stands as it left it.
      const stands = finished?.get(value);
      if (stands !== undefined) return stands;
      if (taken?.gone.has(value)) throw new ClosedPageWrite('The end of the pass before holds an object of a page the edit changed');
      if (value instanceof SetupRef) {
        if (mode !== 'resolve') return value;
        const found = names?.byId(value.id);
        if (found === undefined) throw new ClosedPageWrite('A checkpoint names an object this setup does not have');
        return found;
      }
      if (this.kept.has(value)) {
        if (mode !== 'name' || !names) return value;
        const id = names.idOf(value);
        if (id === undefined) {
          flags!.opaque = true;
          return value;
        }
        let ref = this.refs.get(id);
        if (!ref) this.refs.set(id, (ref = new SetupRef(id)));
        return ref;
      }
      // A frozen object is shared as it is, but when pages are opened
      // again: then every object of a closed page is copied, whichever
      // pass closed it, save the words of its lines (below).
      if (!thaw && Object.isFrozen(value)) return value;
      const known = done.get(value);
      if (known !== undefined) return known;
      let out: object;
      if (Array.isArray(value)) {
        const list: unknown[] = new Array(value.length);
        done.set(value, (out = list));
        for (let i = 0; i < value.length; i++) if (i in value) list[i] = copy(value[i]);
      } else if (value instanceof Map) {
        const map = new Map<unknown, unknown>();
        done.set(value, (out = map));
        for (const [k, v] of value) map.set(copy(k), copy(v));
      } else if (value instanceof Set) {
        const set = new Set<unknown>();
        done.set(value, (out = set));
        for (const item of value) set.add(copy(item));
      } else if (isPlain(value)) {
        const object: Plain = Object.getPrototypeOf(value) === null ? Object.create(null) as Plain : {};
        done.set(value, (out = object));
        for (const key in value) {
          const member = (value as Plain)[key];
          // The words of a line (`VDTLine.segments`) are shared with the
          // measurement cache and never written to once placed (#1609): an
          // opened page takes a list of its own with the same words.
          if (taken && SOURCE_KEYS.has(key)) object[key] = movedPlaces(member);
          else object[key] = thaw && key === 'segments' && Array.isArray(member) ? member.map((word) => (Object.isFrozen(word) ? word : copy(word))) : copy(member);
        }
      } else {
        // An object of a class, a weak collection: by reference.
        if (flags) flags.opaque = true;
        return value;
      }
      for (const { name, table } of this.tables) {
        if (!table.has(value)) continue;
        side.push({ key: out, table: name, value: table instanceof WeakMap ? copy(table.get(value)) : true });
      }
      return out;
    };
    return copy;
  }

  /** A copy of everything on the tape. */
  record(): TapeImage {
    this.named();
    const side: TapeImage['side'] = [];
    const flags = { opaque: false };
    const copy = this.names ? this.copier(side, 'name', flags) : this.copier(side);
    const bindings = new Map<string, unknown>();
    for (const [name, value] of this.bindings) bindings.set(name, copy(value));
    const variables = new Map<string, unknown>();
    for (const [name, v] of this.variables) variables.set(name, copy(v.get()));
    return { bindings, variables, side, ...(flags.opaque ? { opaque: true } : {}) };
  }

  /** (`taken`: the image is the end of the pass before, taken as the end
   *  of this one where the two rejoined, see {@link TapeTaken}.)
   *  Put the tape back to `image`, which stays as it is: the collections
   *  are emptied and filled with a copy of it, in place, so that every
   *  closure that holds one sees it. */
  putBack(image: TapeImage, taken?: TapeTaken): void {
    this.named();
    // One copy of the whole image: its side entries ride along as members
    // of the graph, so their keys are the copies the bindings hold.
    const side: TapeImage['side'] = [];
    const copy = this.names ? this.copier(side, 'resolve', undefined, taken?.stands, taken) : this.copier(side);
    this.fill(copy({ bindings: image.bindings, variables: image.variables, side: image.side }) as TapeImage);
  }

  /** Fill the tape with `fresh`, which becomes its own. */
  private fill(fresh: TapeImage): void {
    // An image of another pass must hold what this pass keeps, name for
    // name: a pass with a collection the other did not have starts over.
    for (const name of this.bindings.keys()) if (!fresh.bindings.has(name)) throw new ClosedPageWrite(`A checkpoint lacks ${name}`);
    for (const [name, target] of this.bindings) refill(target, fresh.bindings.get(name));
    for (const [name, v] of this.variables) v.set(fresh.variables.get(name) as never);
    const tables = new Map(this.tables.map((t) => [t.name, t.table]));
    for (const { key, table: name, value } of fresh.side) {
      const table = tables.get(name);
      if (!table) throw new ClosedPageWrite(`A checkpoint names the side table ${name}, which this pass does not keep`);
      if (table instanceof WeakMap) table.set(key, value);
      else table.add(key);
    }
  }

  /** What the tape holds, for the code that reads it whole (the check of
   *  a resumed pass, the search for where two layouts rejoin). */
  parts(): { bindings: ReadonlyMap<string, object>; variables: ReadonlyMap<string, { get: () => unknown }>; tables: readonly { name: string; table: WeakMap<object, unknown> | WeakSet<object> }[]; kept: ReadonlySet<object> } {
    this.named();
    return { bindings: this.bindings, variables: this.variables, tables: this.tables, kept: this.kept };
  }
}

/** Empty `target` and fill it with what `source` holds: the same
 *  collection afterwards, with the other's members. A plain object's
 *  arrays are filled in place too, so that `doc.pages` stays the array
 *  the pass's closures may hold. */
function refill(target: object, source: unknown): void {
  if (Array.isArray(target)) {
    const from = source as unknown[];
    target.length = 0;
    for (let i = 0; i < from.length; i++) target.push(from[i]);
  } else if (target instanceof Map) {
    target.clear();
    for (const [k, v] of source as Map<unknown, unknown>) target.set(k, v);
  } else if (target instanceof Set) {
    target.clear();
    for (const item of source as Set<unknown>) target.add(item);
  } else {
    const to = target as Plain;
    const from = source as Plain;
    for (const key of Object.keys(to)) if (!(key in from)) delete to[key];
    for (const key in from) {
      const now = to[key];
      const next = from[key];
      if (Array.isArray(now) && Array.isArray(next)) refill(now, next);
      else to[key] = next;
    }
  }
}

// The tape of the pass being run. A pass runs to its end before another
// starts (the drivers run them one after another), so one variable holds
// it; `withPassTape` puts back the one before, should a pass ever start
// inside another.
let current: PassTape | undefined;

/** The tape of the pass being run. */
export function passTape(): PassTape {
  if (!current) throw new Error('No placement pass is running: there is no tape to write to');
  return current;
}

/** Run `pass` with a new tape. */
export function withPassTape<T>(pass: (tape: PassTape) => T): T {
  const before = current;
  const tape = new PassTape();
  current = tape;
  try {
    return pass(tape);
  } finally {
    current = before;
  }
}

/** Thrown out of a pass that wrote to a page it had closed, or that could
 *  not take up the checkpoint it started from: the pass is placed again
 *  from its first block, with no checkpoint. */
export class ClosedPageWrite extends Error {}
