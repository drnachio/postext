// A layout that starts from the layout before (#1639): the checkpoints of
// each placement pass are kept from one build of a document to the next,
// and a pass over edited content starts from the last checkpoint taken
// before anything had read what the edit changed.
//
// A checkpoint of the pass before serves this pass only when the pass
// would have reached it in the same state. That holds when:
//
// - the two setups are equal, object by object, but for the blocks the
//   edit changed and the places in the source after it (`pairSetups`);
// - the hints of the two passes are equal (they are part of the setup
//   compared);
// - nothing placed before the checkpoint had read a changed block (the
//   tape counts the highest block read, `PassTape.counting`);
// - fonts and the maths engine are as they were.
//
// Anything else, and the pass is placed from its first block, as without
// tapes. A pass that starts from a checkpoint and then writes to a page
// the checkpoint had closed is placed again from its first block too
// (`ClosedPageWrite`).

import { measurementGeneration } from '../../measure/canvas.js';
import { isMathReady } from '../../math/index.js';
import { ALL_OF_IT, ClosedPageWrite, HintGroupRead, groupHint, type PassTape, type SetupNames, type TapeImage } from './passTape.js';

/** A checkpoint is taken when this many pages have opened since the last. */
const PAGES_BETWEEN_CHECKPOINTS = 4;

/** Where a block or a line stands in the source: an edit moves these, for
 *  everything after it, by its length. */
const SOURCE_KEYS = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'attrSources', 'titleSourceStart']);

/** Members of a setup the comparison leaves alone: the text itself and
 *  its parse (the blocks made from it are compared one by one). */
const TEXT_KEYS = new Set(['markdown', 'markdownBody', 'parsedBody']);

interface Checkpoint {
  /** The block the pass was about to place. */
  blockIdx: number;
  /** The highest block it had read. */
  readUpTo: number;
  /** How many reads of the hints it had made (`PassTape.hintReads`). */
  hintReads: number;
  image: TapeImage;
}

/** What a pass leaves for the same pass of the next build. */
interface PassRecord {
  roots: Record<string, unknown>;
  /** The content blocks, for where each stands in the source. */
  blocks: readonly { sourceStart: number; sourceEnd: number }[];
  /** The text the blocks were read from. */
  body: string;
  /** Fonts and engines the pass measured with. */
  environment: string;
  /** Whether an object is on the pass's tape (state, not setup). */
  tracks: (value: object) => boolean;
  names: Names;
  checkpoints: Checkpoint[];
  /** The reads of the hints the pass made, in order. */
  hintReads: [member: string, key: unknown][];
}

/** The numbers of the objects of a pass's setups, build after build. */
class Names implements SetupNames {
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

/** What the last build with a set of tapes did, for tests and benchmarks. */
export interface LayoutTapeStats {
  /** Placement passes run. */
  passes: number;
  /** The block each pass started from (0: from the first). */
  startedAt: number[];
  /** Why a pass that had a pass before it started from its first block. */
  reasons: string[];
  /** Passes placed again from the first block after starting from a
   *  checkpoint (a write to a closed page). */
  placedAgain: number;
}

/**
 * The checkpoints of a document's layout, kept by its host from one build
 * to the next (`BuildDocumentOptions.tapes`): a build of the document
 * after an edit then places only from the page before the edit. One set
 * of tapes serves one document (a chapter); its content, configuration
 * and resources must not be changed in place between two builds.
 */
export interface LayoutTapes {
  readonly stats: LayoutTapeStats;
}

class Tapes implements LayoutTapes {
  previous: (PassRecord | undefined)[] = [];
  current: (PassRecord | undefined)[] = [];
  private held: (PassRecord | undefined)[] | undefined;
  stats: LayoutTapeStats = { passes: 0, startedAt: [], reasons: [], placedAgain: 0 };

  /** A build starts: its passes pair with those of the build before. */
  begin(): void {
    this.held = this.previous;
    this.previous = this.current;
    this.current = [];
    this.stats = { passes: 0, startedAt: [], reasons: [], placedAgain: 0 };
  }

  /** The build did not end (cancelled, failed): the build before stands. */
  abandon(): void {
    this.current = this.previous;
    this.previous = this.held ?? [];
  }
}

/** Tapes for one document. */
export function createLayoutTapes(): LayoutTapes {
  return new Tapes();
}

/** A build with `tapes` starts. */
export function beginLayoutTapes(tapes: LayoutTapes | undefined): void {
  (tapes as Tapes | undefined)?.begin();
}

/** A build with `tapes` did not end. */
export function abandonLayoutTapes(tapes: LayoutTapes | undefined): void {
  (tapes as Tapes | undefined)?.abandon();
}

/** The place of the next pass among the passes of the build. */
export function nextTapePass(tapes: LayoutTapes | undefined): number | undefined {
  return tapes ? (tapes as Tapes).stats.passes++ : undefined;
}

/** Pass `ordinal` started from a checkpoint and could not go on: it leaves
 *  no record, and is placed again without the tapes. */
export function dropTapePass(tapes: LayoutTapes, ordinal: number): void {
  const t = tapes as Tapes;
  t.current[ordinal] = undefined;
  t.stats.startedAt[ordinal] = 0;
  t.stats.placedAgain++;
}

interface Pairing {
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
  for (const name in a) if (!same(a[name], b[name], name, p)) return false;
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
function pairSetups(before: PassRecord, roots: Record<string, unknown>, body: string, tracksNow: (value: object) => boolean): Pairing | string {
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
function sameHintReads(before: PassRecord, hints: Record<string, unknown>, p: Pairing): number {
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

const environment = (): string => `${measurementGeneration()}|${isMathReady() ? 1 : 0}`;

/** What a pass hands over to be recorded. */
export interface PassRecordingInput {
  /** The setup, as objects of named members (see {@link pairSetups}). */
  roots: Record<string, unknown>;
  /** The text the content blocks were read from. */
  body: string;
  blocks: readonly { sourceStart: number; sourceEnd: number }[];
  doc: { pages: unknown[] };
}

/** One pass of a build with tapes: where it starts, and the checkpoints
 *  it leaves. */
export class PassRecording {
  private readonly record: PassRecord;
  private readonly from: Checkpoint | undefined;
  private readonly adopted: Checkpoint[] = [];
  private readonly before: PassRecord | undefined;
  private lastPages = 0;

  constructor(
    private readonly tapes: LayoutTapes,
    private readonly ordinal: number,
    private readonly tape: PassTape,
    private readonly input: PassRecordingInput,
  ) {
    const t = tapes as Tapes;
    const before = t.previous[ordinal];
    this.before = before;
    // Comparing and naming the setup reads every block: not reads of the
    // layout.
    tape.countsReads = false;
    const tracks = (value: object): boolean => tape.tracks(value);
    let names: Names | undefined;
    let reason = before ? '' : 'no pass before';
    if (before) {
      const pairing = before.environment !== environment() ? 'fonts or engines changed' : pairSetups(before, input.roots, input.body, tracks);
      if (typeof pairing === 'string') reason = pairing;
      else {
        // The first block the edit reaches: the first that ends at or
        // after the first place that differs. Every block that changed
        // must be at or after it.
        let first = before.blocks.length;
        if (pairing.at < Math.max(before.body.length, input.body.length)) {
          first = before.blocks.findIndex((b) => b.sourceEnd >= pairing.at);
          if (first < 0) first = before.blocks.length;
        }
        if (pairing.changed.some((i) => i < first)) reason = 'a block before the edit changed';
        else {
          const hintsSame = sameHintReads(before, input.roots.hints as Record<string, unknown>, pairing);
          names = before.names;
          names.succeed(pairing.pairs);
          for (let i = before.checkpoints.length - 1; i >= 0; i--) {
            const c = before.checkpoints[i]!;
            if (c.image.opaque || c.readUpTo >= first || c.blockIdx > first || c.hintReads > hintsSame) continue;
            this.from = c;
            this.adopted = before.checkpoints.slice(0, i + 1);
            break;
          }
          if (!this.from) {
            reason = before.checkpoints.length === 0 ? 'the pass before left no checkpoint'
              : before.checkpoints.every((c) => c.hintReads > hintsSame) ? `the hints differ from read ${hintsSame} on (${String(before.hintReads[hintsSame]?.[0])})`
                : 'no checkpoint before the edit';
          }
        }
      }
    }
    names ??= new Names();
    tape.names = names;
    tape.atoms(input.roots);
    this.record = { roots: input.roots, blocks: input.blocks, body: input.body, environment: environment(), tracks, names, checkpoints: [], hintReads: tape.hintReads };
    t.stats.reasons[ordinal] = reason;
    t.stats.startedAt[ordinal] = 0;
    tape.countsReads = true;
  }

  /** Put the pass where it starts: at its first block (0), or at the
   *  block of the checkpoint it takes up. */
  start(): number {
    const from = this.from;
    if (!from) return 0;
    this.tape.putBack(from.image);
    // The pages the checkpoint holds by reference are closed: a write to
    // one throws, and the pass is placed again from its first block.
    this.tape.close(this.input.doc.pages.slice(0, -1));
    this.tape.readUpTo = from.readUpTo;
    // The reads the checkpoint stands on, then this pass's own.
    this.tape.hintReads.splice(0, Infinity, ...this.before!.hintReads.slice(0, from.hintReads));
    this.record.checkpoints = this.adopted;
    this.lastPages = this.input.doc.pages.length;
    (this.tapes as Tapes).stats.startedAt[this.ordinal] = from.blockIdx;
    return from.blockIdx;
  }

  /** The pass is about to place block `blockIdx`. */
  atBlock(blockIdx: number): void {
    const pages = this.input.doc.pages.length;
    if (pages < this.lastPages + PAGES_BETWEEN_CHECKPOINTS) return;
    this.lastPages = pages;
    this.tape.close(this.input.doc.pages.slice(0, -1));
    this.record.checkpoints.push({ blockIdx, readUpTo: this.tape.readUpTo, hintReads: this.tape.hintReads.length, image: this.tape.record() });
  }

  /** The pass has placed its blocks. */
  done(): void {
    (this.tapes as Tapes).current[this.ordinal] = this.record;
  }
}

export { ClosedPageWrite };
