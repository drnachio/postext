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
import { ClosedPageWrite, type PassTape, type TapeImage } from './passTape.js';
import { carryMarks, lastPlaceOf, makeMoves, markMade, moveSourcePlaces, movesWait, unfrozenCopy, type WaitingMoves } from './passMade.js';
import { objectsOf, tapeRejoins } from './passRejoin.js';
import { Names, pairSetups, sameHintReads, type PassSetup } from './passSetups.js';

/** A checkpoint is taken when this many pages have opened since the last. */
const PAGES_BETWEEN_CHECKPOINTS = 4;


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
interface PassRecord extends PassSetup {
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
  /** The pass's pages and blocks as it placed them and as its finish (and
   *  the marks after it) left them, place by place; its document, whose
   *  block list ends with what the finish added. */
  finished?: { placed: Listed; made: Listed; doc: Document; lastPlace: (number | undefined)[]; moves?: WaitingMoves; movesFrom?: number };
  /** The tape once the pass had placed its last block. */
  end?: TapeImage;
  /** Freeze pages or blocks of this pass (its own setup left alone). */
  freeze: (values: readonly unknown[]) => void;
}

interface Listed {
  pages: object[];
  blocks: object[];
}

interface Document {
  pages: object[];
  blocks: object[];
}

/** The page a block is on, as blocks and pages say it. */
const pageOf = (value: object): unknown => (value as { pageIndex?: unknown }).pageIndex;
const indexOf = (page: object): unknown => (page as { index?: unknown }).index;

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
  /** For each pass, the pages that kept what the build before made of
   *  them: not finished again. */
  pagesKept: number[];
  /** For each pass, the block where it rejoined the pass before it and
   *  stopped placing (undefined: it placed to its last block), and the
   *  pages after that block it took from the build before. */
  rejoinedAt: (number | undefined)[];
  pagesTaken: number[];
  /** For a pass that tried to rejoin and did not: the last block it tried
   *  at and what first differed there. */
  apartAt: (string | undefined)[];
  /** The build was done again without what the build before left: a
   *  step after the placing wrote to a page that was kept. */
  builtAgain: boolean;
  /** Where that write was, when there was one. */
  builtAgainAt?: string;
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
  stats: LayoutTapeStats = { passes: 0, startedAt: [], reasons: [], placedAgain: 0, pagesKept: [], rejoinedAt: [], pagesTaken: [], apartAt: [], builtAgain: false };

  /** A build starts: its passes pair with those of the build before. */
  begin(): void {
    this.held = this.previous;
    this.previous = this.current;
    this.current = [];
    this.stats = { passes: 0, startedAt: [], reasons: [], placedAgain: 0, pagesKept: [], rejoinedAt: [], pagesTaken: [], apartAt: [], builtAgain: false };
  }

  /** The build did not end (cancelled, failed): the build before stands. */
  abandon(): void {
    this.current = this.previous;
    this.previous = this.held ?? [];
  }

  /** Forget every build: the next one starts from nothing. */
  forget(error: Error): void {
    this.previous = [];
    this.current = [];
    this.held = undefined;
    const at = String(error.stack).split('\n').slice(0, 4).map((line) => line.trim().replace(/\(.*\/(src|dist)\//, '(')).join(' < ');
    this.stats = { passes: 0, startedAt: [], reasons: [], placedAgain: 0, pagesKept: [], rejoinedAt: [], pagesTaken: [], apartAt: [], builtAgain: true, builtAgainAt: at };
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

/** A build with `tapes` wrote to a page it had kept from the build before
 *  and is done again: with the same tapes, emptied. */
export function forgetLayoutTapes(tapes: LayoutTapes, error: Error): void {
  (tapes as Tapes).forget(error);
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

const environment = (): string => `${measurementGeneration()}|${isMathReady() ? 1 : 0}`;

/** What a pass hands over to be recorded. */
export interface PassRecordingInput {
  /** The setup, as objects of named members (see {@link pairSetups}). */
  roots: Record<string, unknown>;
  /** The text the content blocks were read from. */
  body: string;
  blocks: readonly { sourceStart: number; sourceEnd: number }[];
  doc: { pages: unknown[] };
  /** The document numbers its lines in the margin. */
  numbersLines: boolean;
  /** Where the text starts in the source the places count from. */
  bodyOffset: number;
}

/** Whether the steps after the placing make, of a page of `doc`, only
 *  what stays on the page. Line numbers in the margin, composed pages and
 *  comics also leave records and warnings with the document (numbers that
 *  overlap, a folio a page lost): such a document's pages are all made
 *  again, so that those are too. */
function pagesStandAlone(input: PassRecordingInput, pages: readonly unknown[] = input.doc.pages): boolean {
  if (input.numbersLines) return false;
  return !pages.some((page) => (page as { composed?: unknown }).composed !== undefined || (page as { comic?: unknown }).comic !== undefined);
}

/** One pass of a build with tapes: where it starts, and the checkpoints
 *  it leaves. */
export class PassRecording {
  private readonly record: PassRecord;
  private readonly from: Checkpoint | undefined;
  private readonly adopted: Checkpoint[] = [];
  /** Where the edit starts in the source, and by how much it moves what
   *  follows (0: nothing moves). */
  private editAt = 0;
  private editDelta = 0;
  /** The checkpoints of the pass before that this pass may rejoin, by
   *  their block; and where it did: the pages and blocks it had then. */
  private rejoins: Map<number, Checkpoint> | undefined;
  /** The setup of this pass is that of the pass before, but for the edit. */
  private paired = false;
  private rejoined: { pages: number; blocks: number } | undefined;
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
          this.editAt = pairing.at + input.bodyOffset;
          this.editDelta = pairing.delta;
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
          // Where this pass may rejoin the one before: at its checkpoints
          // past every block the edit changed, when every hint that pass
          // read is answered the same now and its pages stand alone.
          const last = Math.max(first, ...pairing.changed);
          // (A pass that starts from its first block, the edit being before
          // its first checkpoint, may rejoin all the same.)
          this.paired = true;
          {
            const whyNot = !before.end || !before.finished ? 'the pass before left no end'
              : before.end.opaque ? 'the end of the pass before cannot be read by another pass'
                : hintsSame !== before.hintReads.length ? `the hints differ from read ${hintsSame} on (${String(before.hintReads[hintsSame]?.[0])})`
                  : !pagesStandAlone(input, before.finished.made.pages) ? 'the pages do not stand alone' : '';
            if (!whyNot) this.rejoins = new Map(before.checkpoints.filter((c) => c.blockIdx > last && !c.image.opaque).map((c) => [c.blockIdx, c]));
            t.stats.apartAt[ordinal] = whyNot || (this.rejoins!.size === 0 ? 'the pass before left no checkpoint after the edit' : undefined);
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
    this.record = {
      roots: input.roots, blocks: input.blocks, body: input.body, environment: environment(), tracks, names, checkpoints: [], hintReads: tape.hintReads,
      freeze: (values) => tape.close(values),
    };
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

  /** The pass is about to place block `blockIdx`. True when it need not:
   *  it has rejoined the pass before it, and its tape is now as that pass
   *  left its own. */
  atBlock(blockIdx: number): boolean {
    const candidate = this.rejoins?.get(blockIdx);
    if (candidate && this.rejoin(candidate, blockIdx)) return true;
    this.checkpoint(blockIdx);
    return false;
  }

  /** Try to rejoin the pass before at its checkpoint `c`. */
  private rejoin(c: Checkpoint, blockIdx: number): boolean {
    const doc = this.input.doc as Document;
    const old = this.before!;
    this.tape.close(doc.pages.slice(0, -1));
    const closed = tapeRejoins(this.tape, c.image, this.editAt, this.editDelta);
    if (typeof closed === 'string') {
      (this.tapes as Tapes).stats.apartAt[this.ordinal] = `block ${blockIdx}: ${closed}`;
      return false;
    }
    // The closed objects of the pages the edit changed: the end of the
    // pass before must hold none that nothing here stands for.
    const pages = doc.pages.length - 1;
    const changed = old.finished!.placed.pages.slice(0, pages).filter((page, i) => page !== doc.pages[i]);
    const gone = objectsOf(changed);
    for (const object of closed.keys()) gone.delete(object);
    const here: Checkpoint = { blockIdx, readUpTo: this.tape.readUpTo, hintReads: this.tape.hintReads.length, image: this.tape.record() };
    const blocks = doc.blocks.length;
    try {
      this.tape.putBack(old.end!, { stands: closed, gone, at: this.editAt, delta: this.editDelta });
    } catch (error) {
      if (!(error instanceof ClosedPageWrite)) throw error;
      return false;
    }
    // The checkpoint the next build may rejoin at, and the hints the
    // pass before read from here on.
    this.record.checkpoints.push(here);
    this.tape.hintReads.push(...old.hintReads.slice(c.hintReads));
    this.rejoined = { pages, blocks };
    (this.tapes as Tapes).stats.rejoinedAt[this.ordinal] = blockIdx;
    return true;
  }

  private checkpoint(blockIdx: number): void {
    const pages = this.input.doc.pages.length;
    if (pages < this.lastPages + PAGES_BETWEEN_CHECKPOINTS) return;
    this.lastPages = pages;
    this.tape.close(this.input.doc.pages.slice(0, -1));
    this.record.checkpoints.push({ blockIdx, readUpTo: this.tape.readUpTo, hintReads: this.tape.hintReads.length, image: this.tape.record() });
  }

  /**
   * The pass has placed its blocks; what follows sets things on its pages
   * (notes at the column feet, page labels, running heads, line frames).
   * The pages the pass took from its checkpoint are the pages the pass
   * before placed: what the build before made of them stands, frozen, and
   * the steps that follow leave a frozen page alone. The other pages are
   * opened (`PassTape.open`). Kept only while the document has as many
   * pages as it had: a page's foot may print their number.
   */
  done(): void {
    const doc = this.input.doc as Document;
    // Every page is closed, the last too: the end of the pass holds them
    // as they are, for a pass of the next build that rejoins this one.
    this.tape.close(doc.pages);
    this.record.end = this.tape.record();
    const placed: Listed = { pages: [...doc.pages], blocks: [...doc.blocks] };
    const old = this.paired ? this.before?.finished : undefined;
    const usable = old !== undefined && old.placed.pages.length === placed.pages.length && pagesStandAlone(this.input);
    const stands = new Map<object, object>();
    // The pages this pass takes from the one before, and the moves that
    // pass left waiting on its own: they go on waiting when the same
    // pages are taken again (a letter typed after another), and are made
    // now otherwise, before anything reads those pages.
    const takes: object[] = [];
    if (usable && this.rejoined) {
      for (let i = this.rejoined.pages; i < placed.pages.length; i++) if (placed.pages[i] === old.placed.pages[i]) takes.push(old.made.pages[i]!);
    }
    let moves = old?.moves;
    // The same pages: taken from the same page on. A page that was taken
    // and is now before the edit must have its moves made to be kept.
    if (moves && (moves.list.length >= 8 || old!.movesFrom !== this.rejoined?.pages || takes.some((page) => !moves!.objects.includes(page) || Object.isFrozen(page)))) {
      makeMoves(moves);
      moves = undefined;
    }
    // A page is kept when it is the page the pass before placed and what
    // was made of it names no place the edit moved: a note set at its foot
    // may be written after the edit, wherever it is cited.
    const stays = (i: number): boolean => {
      if (placed.pages[i] !== old!.placed.pages[i]) return false;
      if (this.editDelta === 0) return true;
      const last = (old!.lastPlace[i] ??= lastPlaceOf(old!.made.pages[i]));
      return last < this.editAt;
    };
    let kept = 0;
    const keptPages = new Set<unknown>();
    if (usable) {
      while (kept < placed.pages.length - 1 && stays(kept)) {
        stands.set(placed.pages[kept]!, old.made.pages[kept]!);
        keptPages.add(indexOf(placed.pages[kept]!));
        kept++;
      }
    }
    // The pages after the block where the pass rejoined the one before
    // are that pass's pages: what was made of them stands too, its places
    // in the source moved by the edit, in place. A page an earlier build
    // froze (it was before that build's edit) gives way to a copy first.
    const at = this.editAt;
    const delta = this.editDelta;
    const moved = new Set<object>();
    const copies = new Map<object, object>();
    const owed: object[] = [];
    const taken = (made: object): object => {
      let page = copies.get(made) ?? made;
      if (Object.isFrozen(page)) {
        page = unfrozenCopy(made, copies);
        carryMarks(made, page);
      }
      owed.push(page);
      markMade(page);
      return page;
    };
    const takenPages = new Set<unknown>();
    if (usable && this.rejoined) {
      for (let i = this.rejoined.pages; i < placed.pages.length; i++) {
        if (placed.pages[i] !== old.placed.pages[i]) continue;
        stands.set(placed.pages[i]!, taken(old.made.pages[i]!));
        takenPages.add(indexOf(placed.pages[i]!));
      }
    }
    // Their blocks, by their place in the list. A block of the pass before
    // that no page stands for keeps its place: its copy is moved below.
    const frozen: object[] = [];
    const stale: number[] = [];
    if (old) {
      for (let j = 0; j < placed.blocks.length; j++) {
        const block = placed.blocks[j]!;
        const same = block === old.placed.blocks[j];
        if (same && keptPages.has(pageOf(block))) {
          stands.set(block, old.made.blocks[j]!);
          frozen.push(old.made.blocks[j]!);
        } else if (same && takenPages.has(pageOf(block))) {
          stands.set(block, taken(old.made.blocks[j]!));
        } else if (this.rejoined && j >= this.rejoined.blocks && Object.isFrozen(block)) {
          stale.push(j);
        }
      }
    }
    // What the finish before added to the list (the notes at the columns'
    // feet) comes after the blocks placed, page after page: for the pages
    // kept, before what this finish adds; for the pages taken, after it.
    const added = old ? old.doc.blocks.slice(old.placed.blocks.length) : [];
    const before = added.filter((b) => keptPages.has(pageOf(b)));
    const after = added.filter((b) => takenPages.has(pageOf(b))).map(taken);
    if (kept > 0) this.before!.freeze([...old!.made.pages.slice(0, kept), ...frozen, ...before]);
    this.tape.open(stands.size > 0 ? stands : undefined);
    for (const j of stale) moveSourcePlaces(doc.blocks[j], at, delta, moved);
    for (const block of before) doc.blocks.push(block);
    if (after.length > 0) this.tape.afterFinish = () => { for (const block of after) doc.blocks.push(block); };
    // The move this edit owes the pages taken waits with the others.
    const waits: WaitingMoves | undefined = owed.length > 0 && delta !== 0
      ? { objects: owed, list: [...(moves?.list ?? []), { at, delta }] }
      : owed.length > 0 && moves && moves.list.length > 0 ? { objects: owed, list: moves.list } : undefined;
    // Under the guard of the checks (`__postextGuardTaken`), the pages
    // taken are moved now and frozen: a step after the placing that is not
    // taught to leave a made page alone then throws, as it does on a page
    // kept before the edit, instead of setting it twice unseen.
    if ((globalThis as { __postextGuardTaken?: boolean }).__postextGuardTaken && owed.length > 0) {
      if (waits) makeMoves(waits);
      this.before!.freeze(owed);
    } else if (waits) movesWait(waits);
    this.record.finished = {
      placed, made: { pages: [...doc.pages], blocks: doc.blocks.slice(0, placed.blocks.length) }, doc,
      lastPlace: old ? old.lastPlace.slice(0, kept) : [],
      ...(waits ? { moves: waits, movesFrom: this.rejoined!.pages } : {}),
    };
    const t = this.tapes as Tapes;
    t.stats.pagesKept[this.ordinal] = kept;
    t.stats.pagesTaken[this.ordinal] = takenPages.size;
    t.current[this.ordinal] = this.record;
  }
}

export { ClosedPageWrite };
