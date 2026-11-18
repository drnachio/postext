// Test setup (vitest.config.ts), on with POSTEXT_RESUME_CHECK=1 (#1639):
// every placement pass of every test saves itself at a few of the blocks
// where a page opens, and once its blocks are placed is taken up again
// from each. A pass that ends otherwise than its first run fails the test
// that built the document: something the pass changes is not on its tape
// (`pipeline/build/passTape.ts`), or is kept by reference where it should
// be copied.
import type { PassResumeCheck } from '../pipeline/build/passResume.js';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
if (env?.POSTEXT_RESUME_CHECK === '1') {
  /** The pages (counted as they open in a pass) a pass is saved at. */
  const SAVED_AT = new Set([1, 2, 4, 9, 20, 45]);
  let lastPages = -1;
  let opened = 0;
  const check: PassResumeCheck = {
    saveAt(blockIdx, pages) {
      if (blockIdx === 0 && pages <= 1) {
        lastPages = -1;
        opened = 0;
      }
      if (pages === lastPages) return false;
      lastPages = pages;
      return SAVED_AT.has(opened++);
    },
    ...(env?.POSTEXT_RESUME_BACK === '1' ? {
      wroteBack(pages: number, firstChanged: number) {
        if (pages - firstChanged > 1) throw new Error(`WROTE-BACK ${pages - firstChanged} pages (page ${firstChanged} of ${pages})`);
      },
    } : {}),
    placedAgain() {
      if (env?.POSTEXT_RESUME_BACK === '1') console.error('PLACED-AGAIN');
    },
    compared(blockIdx, first, again) {
      if (first === again) return;
      let at = 0;
      while (at < first.length && first[at] === again[at]) at++;
      const name = first.lastIndexOf('\n', at);
      // Every binding that differs, for the reader of the failure.
      const others = new Map(again.split('\n').map((line) => [line.slice(0, line.indexOf(' ')), line]));
      const differing = first.split('\n').filter((line) => others.get(line.slice(0, line.indexOf(' '))) !== line).map((line) => line.slice(0, line.indexOf(' ')));
      throw new Error(
        `Bindings that differ: ${differing.join(' ')}\n` +
        `A pass taken up again from block ${blockIdx} ended otherwise than its first run, in ${first.slice(name + 1, first.indexOf(':', name + 1))}:\n`
        + `  first: …${first.slice(Math.max(0, at - 160), at + 120)}…\n`
        + `  again: …${again.slice(Math.max(0, at - 160), at + 120)}…`,
      );
    },
  };
  (globalThis as { __postextPassResumeCheck?: PassResumeCheck }).__postextPassResumeCheck = check;
}
