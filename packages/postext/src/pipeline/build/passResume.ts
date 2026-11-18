// The check of the tape of a placement pass (`passTape.ts`, #1639).
import type { PassTape, TapeImage } from './passTape.js';

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
