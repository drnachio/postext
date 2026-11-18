// The check of the tape of a placement pass (`passTape.ts`, #1639).
import type { PassTape, TapeImage } from './passTape.js';

type Plain = Record<string, unknown>;
const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

export { ClosedPageWrite, withPassTape, type PassTape } from './passTape.js';

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
    const first = printTape(this.tape);
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
      this.check.compared(blockIdx, first, printTape(this.tape));
    }
    this.tape.putBack(end);
  }
}

/** Whether `error` is a write to a closed page: the engine's own refusal
 *  to write to a frozen object, on a tape that closed pages. */
export function isClosedPageWrite(tape: PassTape, error: unknown): boolean {
  return tape.closedAny && error instanceof TypeError;
}

/** Everything on the tape as text: two tapes in the same state give
 *  the same text. An object that is a key of a map, a member of a set or
 *  a key of a side table is numbered where it is first met and named by
 *  its number after that, so the text says which of them are one object;
 *  any other object is written out wherever it stands, so two copies of
 *  a line's words read as the words shared (what comes back from a memo
 *  is a copy). The objects of the setup are numbered and not read. */
export function printTape(tape: PassTape): string {
  const { bindings, variables, tables, kept } = tape.parts();
  // The objects whose identity the pass reads.
  const keyed = new Set<object>();
  const met = new Set<object>();
  const find = (value: unknown, key: boolean): void => {
    if (typeof value !== 'object' || value === null) return;
    if (key) keyed.add(value);
    if (met.has(value) || kept.has(value)) return;
    met.add(value);
    if (Array.isArray(value)) for (const item of value) find(item, false);
    else if (value instanceof Map) for (const [k, v] of value) { find(k, true); find(v, false); }
    else if (value instanceof Set) for (const item of value) find(item, true);
    else if (isPlain(value)) for (const name in value) find((value as Plain)[name], false);
    else return;
    for (const { table } of tables) {
      if (!table.has(value)) continue;
      keyed.add(value);
      if (table instanceof WeakMap) find(table.get(value), false);
    }
  };
  for (const value of bindings.values()) find(value, false);
  for (const v of variables.values()) find(v.get(), false);

  const out: string[] = [];
  const ids = new Map<object, number>();
  const open = new Set<object>();
  const walk = (value: unknown): void => {
    if (typeof value === 'function') value = { function: value.name };
    if (typeof value !== 'object' || value === null) {
      out.push(typeof value === 'string' ? JSON.stringify(value) : typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value));
      return;
    }
    const atom = kept.has(value);
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
    for (const { name, table } of tables) {
      if (!table.has(value)) continue;
      out.push(`~${name}=`);
      walk(table instanceof WeakMap ? table.get(value) : true);
    }
    open.delete(value);
  };
  for (const [name, value] of bindings) { out.push(`\n${name}: `); walk(value); }
  for (const [name, v] of variables) { out.push(`\n${name}= `); walk(v.get()); }
  return out.join('');
}
