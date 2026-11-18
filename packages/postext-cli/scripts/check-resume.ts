// The check of the pass tape (#1639) on whole books: every placement pass
// of every chapter saves itself at a few of the blocks where a page opens
// and, once its blocks are placed, is taken up again from each. A pass
// that ends otherwise than its first run is reported with the binding
// that differs. The pages behind each checkpoint are closed (frozen); a
// pass that writes to one is placed again with none closed, and counted: something the pass changes is not on its tape
// (`packages/postext/src/pipeline/build/passTape.ts`).
//
//   bun scripts/check-resume.ts <book> [<book> …]
//
// Exits 1 when a pass differed. The pages of a checked layout are also
// compared with those of a layout without the check (the pass finishes
// from a restored tape).

import { createMeasurementCache } from 'postext';
import { Options } from '../src/args';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';
import { vdtHash } from './vdtHash';

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

interface Check {
  placedAgain(): void;
  saveAt(blockIdx: number, pages: number, blocks: number): boolean;
  compared(blockIdx: number, first: string, again: string): void;
}
const hook = globalThis as { __postextPassResumeCheck?: Check };

/** The pages (counted as they open in a pass) a pass is saved at. */
const SAVED_AT = new Set([1, 2, 5, 13, 34, 89]);
let failed = false;

for (const path of process.argv.slice(2)) {
  const opts = new Options({});
  const reporter = new Reporter('quiet', true);
  const { book, fonts } = await openBook({ command: 'check', inputs: [path], opts, reporter });
  const plain = vdtHash((await layOut(book, opts, reporter, createMeasurementCache(), fonts)).docs);

  let lastPages = -1;
  let opened = 0;
  let saved = 0;
  let compared = 0;
  let placedAgain = 0;
  const differing = new Map<string, number>();
  hook.__postextPassResumeCheck = {
    placedAgain() {
      placedAgain++;
    },
    saveAt(blockIdx, pages) {
      if (blockIdx === 0 && pages <= 1) {
        lastPages = -1;
        opened = 0;
      }
      if (pages === lastPages) return false;
      lastPages = pages;
      if (!SAVED_AT.has(opened++)) return false;
      saved++;
      return true;
    },
    compared(blockIdx, first, again) {
      compared++;
      if (first === again) return;
      const others = new Map(again.split('\n').map((line) => [line.slice(0, line.indexOf(' ')), line]));
      for (const line of first.split('\n')) {
        const name = line.slice(0, line.indexOf(' '));
        const other = others.get(name);
        if (other === line) continue;
        if (!differing.has(name)) {
          let at = 0;
          while (other !== undefined && at < line.length && line[at] === other[at]) at++;
          process.stderr.write(`${book.name}: from block ${blockIdx}, ${name}\n  first: …${line.slice(Math.max(0, at - 140), at + 100)}…\n  again: …${(other ?? '').slice(Math.max(0, at - 140), at + 100)}…\n`);
        }
        differing.set(name, (differing.get(name) ?? 0) + 1);
      }
    },
  };
  const t0 = performance.now();
  const checked = vdtHash((await layOut(book, opts, reporter, createMeasurementCache(), fonts)).docs);
  delete hook.__postextPassResumeCheck;
  const ok = differing.size === 0 && checked === plain;
  if (!ok) failed = true;
  process.stdout.write(`${book.name}: ${saved} checkpoints, ${compared} resumed runs, ${placedAgain} passes placed again for a write to a closed page, ${differing.size === 0 ? 'all as the first run' : `differing in ${[...differing].map(([n, c]) => `${n} ${c}`).join(', ')}`}; pages ${checked === plain ? 'same' : `${plain} → ${checked}`} (${Math.round(performance.now() - t0)} ms)\n`);
}
process.exit(failed ? 1 : 0);
