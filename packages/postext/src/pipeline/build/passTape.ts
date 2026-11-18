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
// This file imports nothing of the engine: the modules that keep side
// tables import it.

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
  /** Entries of the side tables, by the copy of their key. */
  side: { key: object; table: SideTable; value: unknown }[];
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
  /** The objects of the pages closed so far ({@link close}). */
  private closed = new WeakSet<object>();
  /** Whether a page was closed: a write to one then throws. */
  closedAny = false;

  /** Name the collections and objects `owner` changes during the pass. A
   *  weak collection becomes a side table of the pass. */
  track(owner: string, bindings: Record<string, object>): void {
    for (const name in bindings) {
      const value = bindings[name]!;
      this.tracked.add(value);
      if (value instanceof WeakMap || value instanceof WeakSet) this.tables.push({ name: `${owner}.${name}`, table: value });
      else this.bindings.set(`${owner}.${name}`, value);
    }
  }

  /** Name a loose variable of `owner`. */
  variable<T>(name: string, get: () => T, set: (value: T) => void): void {
    this.variables.set(name, { get, set: set as (value: never) => void });
  }

  /** Name the objects of the setup: everything reachable from `roots`
   *  that is not on the tape is kept by reference in a checkpoint. Call
   *  it after the factories that own what is tracked. */
  atoms(roots: unknown): void {
    const walk = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      if (this.kept.has(value) || this.tracked.has(value)) return;
      if (value instanceof WeakMap || value instanceof WeakSet) return;
      this.kept.add(value);
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
    const freeze = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return;
      if (this.kept.has(value) || Object.isFrozen(value)) return;
      if (!Array.isArray(value) && !isPlain(value)) return;
      Object.freeze(value);
      this.closed.add(value);
      if (Array.isArray(value)) for (const item of value) freeze(item);
      else for (const key in value) freeze((value as Plain)[key]);
    };
    for (const page of pages) freeze(page);
    this.closedAny = true;
  }

  /** Give the tape pages it may write to again: the closed pages are left
   *  as they are, for the checkpoints that hold them, and the tape goes on
   *  with copies. For what comes after the blocks are placed, which sets
   *  things on every page. */
  open(): void {
    if (!this.closedAny) return;
    const side: TapeImage['side'] = [];
    const copy = this.copier(side, true);
    const bindings = new Map<string, unknown>();
    for (const [name, value] of this.bindings) bindings.set(name, copy(value));
    const variables = new Map<string, unknown>();
    for (const [name, v] of this.variables) variables.set(name, copy(v.get()));
    this.fill({ bindings, variables, side });
    this.closed = new WeakSet();
    this.closedAny = false;
  }

  /** `thaw`: copy the closed pages too. */
  private copier(side: TapeImage['side'], thaw = false): (value: unknown) => unknown {
    const done = new Map<object, object>();
    const copy = (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null) return value;
      if (this.kept.has(value) || (Object.isFrozen(value) && !(thaw && this.closed.has(value)))) return value;
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
        for (const key in value) object[key] = copy((value as Plain)[key]);
      } else {
        // An object of a class, a weak collection: by reference.
        return value;
      }
      for (const { table } of this.tables) {
        if (!table.has(value)) continue;
        side.push({ key: out, table, value: table instanceof WeakMap ? copy(table.get(value)) : true });
      }
      return out;
    };
    return copy;
  }

  /** A copy of everything on the tape. */
  record(): TapeImage {
    const side: TapeImage['side'] = [];
    const copy = this.copier(side);
    const bindings = new Map<string, unknown>();
    for (const [name, value] of this.bindings) bindings.set(name, copy(value));
    const variables = new Map<string, unknown>();
    for (const [name, v] of this.variables) variables.set(name, copy(v.get()));
    return { bindings, variables, side };
  }

  /** Put the tape back to `image`, which stays as it is: the collections
   *  are emptied and filled with a copy of it, in place, so that every
   *  closure that holds one sees it. */
  putBack(image: TapeImage): void {
    // One copy of the whole image: its side entries ride along as members
    // of the graph, so their keys are the copies the bindings hold.
    const side: TapeImage['side'] = [];
    const copy = this.copier(side);
    this.fill(copy({ bindings: image.bindings, variables: image.variables, side: image.side }) as TapeImage);
  }

  /** Fill the tape with `fresh`, which becomes its own. */
  private fill(fresh: TapeImage): void {
    for (const [name, target] of this.bindings) refill(target, fresh.bindings.get(name));
    for (const [name, v] of this.variables) v.set(fresh.variables.get(name) as never);
    for (const { key, table, value } of fresh.side) {
      if (table instanceof WeakMap) table.set(key, value);
      else table.add(key);
    }
  }

  /** Everything on the tape as text: two tapes in the same state give
   *  the same text. An object that is a key of a map, a member of a set or
   *  a key of a side table is numbered where it is first met and named by
   *  its number after that, so the text says which of them are one object;
   *  any other object is written out wherever it stands, so two copies of
   *  a line's words read as the words shared (what comes back from a memo
   *  is a copy). The objects of the setup are numbered and not read. */
  print(): string {
    // The objects whose identity the pass reads.
    const keyed = new Set<object>();
    const met = new Set<object>();
    const find = (value: unknown, key: boolean): void => {
      if (typeof value !== 'object' || value === null) return;
      if (key) keyed.add(value);
      if (met.has(value) || this.kept.has(value)) return;
      met.add(value);
      if (Array.isArray(value)) for (const item of value) find(item, false);
      else if (value instanceof Map) for (const [k, v] of value) { find(k, true); find(v, false); }
      else if (value instanceof Set) for (const item of value) find(item, true);
      else if (isPlain(value)) for (const name in value) find((value as Plain)[name], false);
      else return;
      for (const { table } of this.tables) {
        if (!table.has(value)) continue;
        keyed.add(value);
        if (table instanceof WeakMap) find(table.get(value), false);
      }
    };
    for (const value of this.bindings.values()) find(value, false);
    for (const v of this.variables.values()) find(v.get(), false);

    const out: string[] = [];
    const ids = new Map<object, number>();
    const open = new Set<object>();
    const walk = (value: unknown): void => {
      if (typeof value === 'function') value = { function: value.name };
      if (typeof value !== 'object' || value === null) {
        out.push(typeof value === 'string' ? JSON.stringify(value) : typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value));
        return;
      }
      const atom = this.kept.has(value);
      if (atom || keyed.has(value)) {
        const seen = ids.get(value);
        if (seen !== undefined) {
          out.push(`${atom ? '@' : '#'}${seen}`);
          return;
        }
        ids.set(value, ids.size);
        out.push(`${atom ? '@' : '#'}${ids.size - 1}`);
        if (atom) return;
      }
      if (open.has(value)) {
        out.push('<itself>');
        return;
      }
      open.add(value);
      if (Array.isArray(value)) {
        out.push('[');
        for (let i = 0; i < value.length; i++) {
          if (i in value) walk(value[i]);
          else out.push('<hole>');
          out.push(',');
        }
        out.push(']');
      } else if (value instanceof Map) {
        out.push('Map{');
        for (const [k, v] of value) { walk(k); out.push('=>'); walk(v); out.push(','); }
        out.push('}');
      } else if (value instanceof Set) {
        out.push('Set{');
        for (const item of value) { walk(item); out.push(','); }
        out.push('}');
      } else if (isPlain(value)) {
        out.push('{');
        for (const key in value) {
          // A key set to undefined reads as a key left out: what comes
          // back from a memo kept as JSON has lost them.
          const member = (value as Plain)[key];
          if (member === undefined) continue;
          out.push(`${key}:`);
          walk(member);
          out.push(',');
        }
        out.push('}');
      } else {
        out.push(`<${(value as object).constructor?.name ?? 'object'}>`);
        open.delete(value);
        return;
      }
      for (const { name, table } of this.tables) {
        if (!table.has(value)) continue;
        out.push(`~${name}=`);
        walk(table instanceof WeakMap ? table.get(value) : true);
      }
      open.delete(value);
    };
    for (const [name, value] of this.bindings) { out.push(`\n${name}: `); walk(value); }
    for (const [name, v] of this.variables) { out.push(`\n${name}= `); walk(v.get()); }
    return out.join('');
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

// The check of the tape (#1639), for tests and benchmarks: a pass saves
// itself at the blocks the checker asks for, and once its blocks are
// placed goes back to each and places the rest again. What it is in the
// end, the document included, must be what the first run was.

/** Asked of a pass by the check mode. */
export interface PassResumeCheck {
  /** Whether to save the pass before block `blockIdx`, the document at
   *  `pages` pages. */
  saveAt(blockIdx: number, pages: number, blocks: number): boolean;
  /** A pass taken up again from `blockIdx` ended as `again`, where the
   *  first run ended as `first` (both {@link PassTape.print}). */
  compared(blockIdx: number, first: string, again: string): void;
  /** Asked when present: of the `pages` pages the document had at a
   *  checkpoint, `firstChanged` is the first the rest of the pass wrote to
   *  (`pages` when it wrote to none of them). */
  wroteBack?(pages: number, firstChanged: number): void;
  /** Told when present: a pass wrote to a page it had closed and is
   *  placed again from its first block with no page closed. */
  placedAgain?(): void;
}

/** The checker listening, when one is. */
export function passResumeCheck(): PassResumeCheck | undefined {
  return (globalThis as { __postextPassResumeCheck?: PassResumeCheck }).__postextPassResumeCheck;
}

/** A pass under the check: its checkpoints, and the runs from them. */
export class PassResume {
  private readonly saved: { blockIdx: number; image: TapeImage; pages?: string[] }[] = [];
  /** The document being built. */
  doc: { pages: unknown[] } | undefined;
  /** Whether the pages behind a checkpoint are closed. */
  closes = true;

  /** `setup`: the objects of the pass's setup, kept by reference in a
   *  checkpoint; everything else on the tape is copied. */
  constructor(private readonly tape: PassTape, private readonly check: PassResumeCheck, setup: unknown) {
    tape.atoms(setup);
  }

  /** The first run is about to place block `blockIdx`. */
  atBlock(blockIdx: number, pages: number, blocks: number): void {
    if (!this.check.saveAt(blockIdx, pages, blocks)) return;
    // Every page but the one being filled is closed (#1639): the rest of
    // a pass writes to the open page alone, but for a box or a story that
    // goes back to a page behind it.
    if (this.closes && this.doc) this.tape.close(this.doc.pages.slice(0, -1));
    const then = this.check.wroteBack && this.doc ? this.doc.pages.map((p) => JSON.stringify(p)) : undefined;
    this.saved.push({ blockIdx, image: this.tape.record(), ...(then ? { pages: then } : {}) });
  }

  /** The first run has placed its blocks. Each checkpoint is put back and
   *  the rest placed again (`placeFrom(blockIdx, true)`): the tape must
   *  end as the first run left it. Then the first run's end is put back,
   *  so the pass finishes from a restored tape too. */
  again(placeFrom: (blockIdx: number, again: boolean) => void): void {
    if (this.saved.length === 0) return;
    const first = this.tape.print();
    const end = this.tape.record();
    if (this.check.wroteBack && this.doc) {
      const now = this.doc.pages.map((p) => JSON.stringify(p));
      for (const { pages } of this.saved) {
        if (!pages) continue;
        let at = 0;
        while (at < pages.length && pages[at] === now[at]) at++;
        this.check.wroteBack(pages.length, at);
      }
    }
    for (const { blockIdx, image } of this.saved) {
      this.tape.putBack(image);
      placeFrom(blockIdx, true);
      this.check.compared(blockIdx, first, this.tape.print());
    }
    this.tape.putBack(end);
  }
}

/** Whether `error` is a write to a closed page: the engine's own refusal
 *  to write to a frozen object, on a tape that closed pages. */
export function isClosedPageWrite(tape: PassTape, error: unknown): boolean {
  return tape.closedAny && error instanceof TypeError;
}

/** Thrown out of a pass that wrote to a page it had closed. */
export class ClosedPageWrite extends Error {}
