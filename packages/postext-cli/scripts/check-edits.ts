// The check of a layout that starts from the layout before (#1639), on
// whole books: every chapter is laid out with tapes
// (`BuildDocumentOptions.tapes`), then a letter is added to a paragraph
// near its start, its middle and its end, and after each the chapter is
// laid out twice: with the tapes, where each pass starts from the last
// checkpoint before the edit, and without them. The two documents must be
// equal, object for object (pages, blocks, warnings). Every other round
// runs under a guard that freezes the pages taken after the edit, so that
// a step which would set one of them a second time throws.
//
//   bun scripts/check-edits.ts [--rounds N] <book> [<book> …]
//
// A chapter is laid out here on its own, without what it would inherit
// from the chapters before it in its book: the check is of the layouts'
// equality, not of the book. Exits 1 when two documents differ. For each
// book it prints how the passes started (from a checkpoint, or from the
// first block and why) and, for its longest chapter, both times.

import { buildDocument, createLayoutTapes, createMeasurementCache, type VDTDocument } from 'postext';
// The worker's own pieces (#1642), not part of the package's face.
import { applyDocumentPatch, makeDocumentPatch, sentWhole, type SentDocument } from '../../postext/dist/worker/docPatch.js';
import { Options } from '../src/args';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';

const argv = process.argv.slice(2);
let rounds = 2;
const books: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--rounds') rounds = Number(argv[++i]);
  else books.push(argv[i]!);
}

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

const PARAGRAPH_LINE = /^[\p{L}\p{N}«“"¿¡(]/u;

/** `markdown` with one letter added to a word of the paragraph line
 *  nearest `share` (0 to 1) of the way through its paragraph lines. */
function typed(markdown: string, share: number): string | undefined {
  const lines = markdown.split('\n');
  const body = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const candidates = lines.map((l, i) => (i >= body && PARAGRAPH_LINE.test(l) && l.length > 40 ? i : -1)).filter((i) => i >= 0);
  if (candidates.length === 0) return undefined;
  const n = candidates[Math.min(candidates.length - 1, Math.floor(candidates.length * share))]!;
  const edited = lines[n]!.replace(/\p{L}[\p{L}\p{M}]{3,}/u, (w) => w + w[0]);
  if (edited === lines[n]) return undefined;
  lines[n] = edited;
  return lines.join('\n');
}

let failed = false;
for (const path of books) {
  const opts = new Options({});
  const reporter = new Reporter('quiet', true);
  const { book, fonts } = await openBook({ command: 'check', inputs: [path], opts, reporter });
  // One layout of the book the usual way: fonts and engines as a build has them.
  const whole = await layOut(book, opts, reporter, createMeasurementCache(), fonts);
  let longest = 0;
  whole.docs.forEach((d, i) => { if (d.pages.length > whole.docs[longest]!.pages.length) longest = i; });

  let edits = 0;
  let differing = 0;
  let fromCheckpoint = 0;
  let passes = 0;
  let placedAgain = 0;
  let patched = 0;
  let pagesSent = 0;
  let pagesKept = 0;
  let pagesTaken = 0;
  let rejoined = 0;
  let pagesSeen = 0;
  const builtAgain = new Map<string, number>();
  const reasons = new Map<string, number>();
  let timing = '';
  for (let at = 0; at < book.chapters.length; at++) {
    const cache = createMeasurementCache();
    const tapes = createLayoutTapes();
    let markdown = book.chapters[at]!.markdown;
    const build = (withTapes: boolean) => buildDocument({ markdown, resources: book.resources }, book.config, cache, withTapes ? { tapes } : undefined);
    // What the layout worker and its client do with each document built
    // with tapes (#1642): the worker sends it as it differs from the one
    // before, the client puts it together from the one it holds.
    let seq = 1;
    const opened = build(true);
    let sent: SentDocument = sentWhole(opened, seq);
    let held: VDTDocument = structuredClone(opened);
    let tapedMs = 0;
    let plainMs = 0;
    for (let round = 0; round < rounds; round++) {
      // Every other round under the guard: the pages taken after the edit
      // are frozen, so a step that would set one again throws (and the
      // build is done again, counted below) where it would go unseen.
      (globalThis as { __postextGuardTaken?: boolean }).__postextGuardTaken = round % 2 === 1;
      for (const share of [0.03, 0.5, 0.97]) {
        const next = typed(markdown, share);
        if (next === undefined) continue;
        markdown = next;
        edits++;
        let t0 = performance.now();
        const taped = build(true);
        tapedMs += performance.now() - t0;
        const stats = tapes.stats;
        t0 = performance.now();
        const plain = build(false);
        plainMs += performance.now() - t0;
        passes += stats.passes;
        placedAgain += stats.placedAgain;
        pagesKept += stats.pagesKept.reduce((a, b) => a + (b ?? 0), 0);
        pagesTaken += stats.pagesTaken.reduce((a, b) => a + (b ?? 0), 0);
        rejoined += stats.rejoinedAt.filter((b) => b !== undefined).length;
        pagesSeen += stats.passes * taped.pages.length;
        if (stats.builtAgain) builtAgain.set(stats.builtAgainAt ?? '?', (builtAgain.get(stats.builtAgainAt ?? '?') ?? 0) + 1);
        stats.startedAt.forEach((b, i) => {
          if (b > 0) fromCheckpoint++;
          else reasons.set(stats.reasons[i] || 'the checkpoint is at the first block', (reasons.get(stats.reasons[i] || 'the checkpoint is at the first block') ?? 0) + 1);
        });
        const patch = structuredClone(makeDocumentPatch(taped, sent));
        sent = { seq: ++seq, pages: [...taped.pages], blocks: [...taped.blocks] };
        held = applyDocumentPatch(patch, held);
        pagesSent += patch.pages.filter((p) => typeof p !== 'number').length;
        if (JSON.stringify(held) !== JSON.stringify(taped)) {
          patched++;
          if (patched <= 2) {
            const a = JSON.stringify(held);
            const b = JSON.stringify(taped);
            let i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            process.stderr.write(`${book.name}, chapter ${at + 1}, edit at ${share}: the document put together differs from the one built\n  together: …${a.slice(Math.max(0, i - 160), i + 120)}…\n  built:    …${b.slice(Math.max(0, i - 160), i + 120)}…\n`);
          }
        }
        if (JSON.stringify(taped) !== JSON.stringify(plain)) {
          differing++;
          if (differing <= 3) {
            const a = JSON.stringify(taped);
            const b = JSON.stringify(plain);
            let i = 0;
            while (i < a.length && a[i] === b[i]) i++;
            process.stderr.write(`${book.name}, chapter ${at + 1}, edit at ${share}: the documents differ\n  tapes: …${a.slice(Math.max(0, i - 160), i + 120)}…\n  plain: …${b.slice(Math.max(0, i - 160), i + 120)}…\n`);
          }
        }
      }
    }
    if (at === longest && plainMs > 0) timing = `; longest chapter (${whole.docs[at]!.pages.length} pp), ${rounds * 3} edits: ${Math.round(tapedMs)} ms with tapes, ${Math.round(plainMs)} ms without`;
  }
  if (differing > 0 || patched > 0) failed = true;
  const why = [...reasons].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} ${r}`).join('; ');
  process.stdout.write(`${book.name}: ${edits} edits, ${differing} differing; ${fromCheckpoint} of ${passes} passes from a checkpoint, ${placedAgain} placed again${why ? ` (from the first block: ${why})` : ''}; ${rejoined} rejoined the pass before; ${patched} put together from pieces differing, ${pagesSent} pages sent of ${edits === 0 ? 0 : Math.round(pagesSeen / Math.max(1, passes) * edits)}; of ${pagesSeen} pages, ${pagesKept} kept before the edit and ${pagesTaken} taken after it${timing}\n`);
  for (const [at, n] of [...builtAgain].sort((a, b) => b[1] - a[1])) process.stdout.write(`  ${n} builds done again: ${at}\n`);
}
process.exit(failed ? 1 : 0);
