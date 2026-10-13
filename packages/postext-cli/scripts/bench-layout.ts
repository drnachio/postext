// Layout benchmark for the Rust/WASM research (#779): lays each book out
// the way `postext check` does (Skia measuring, chapter by chapter), a
// number of times, and prints the time of each run, the peak memory and a
// hash of the VDT, so that a change to the engine can be judged on speed
// and on output that must not move.
//
//   bun scripts/bench-layout.ts [--runs N] [--warm] [--json] [--kp-dump FILE] [--wasm-kp] <book> [<book> …]
//
// --kp-dump writes every Knuth–Plass call of the first run (items, options
// with the line widths it reads, breaks) to FILE as JSON lines: the corpus
// another line breaker is replayed against (rust/bench). --wasm-kp breaks
// the lines with the Rust line breaker compiled to WebAssembly
// (rust/target/postext_wasm.opt.wasm) instead of the TypeScript one.
//
// Each run lays the book out on a fresh measurement cache (cold) unless
// --warm, which reuses the first run's cache (what the Sandbox's worker
// sees after the first build).

import { createHash } from 'node:crypto';
import { createMeasurementCache, type MeasurementCache, type VDTDocument } from 'postext';
import { Options } from '../src/args';
import type { CommandContext } from '../src/context';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';

const argv = process.argv.slice(2);
let runs = 3;
let warm = false;
let json = false;
let kpDump: string | undefined;
let wasmKp = false;
const books: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--runs') runs = Number(argv[++i]);
  else if (a === '--warm') warm = true;
  else if (a === '--json') json = true;
  else if (a === '--kp-dump') kpDump = argv[++i];
  else if (a === '--wasm-kp') wasmKp = true;
  else books.push(a);
}

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

if (wasmKp) {
  const { readFileSync } = await import('node:fs');
  const here = new URL('.', import.meta.url).pathname;
  // @ts-expect-error: a plain ES module of the Rust workspace, untyped.
  const { loadLineBreaker } = await import('../../../rust/crates/wasm/js/linebreak.mjs');
  (globalThis as { __postextKpImpl?: unknown }).__postextKpImpl = await loadLineBreaker(readFileSync(`${here}../../../rust/target/postext_wasm.opt.wasm`));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One Knuth–Plass call as a JSON line: items as compact rows
 *  `[kind, width, stretch, shrink, penalty, flags, chars, postWidth,
 *  postChars, postShift]` (kind 0 box, 1 glue, 2 penalty; flags 1 flagged,
 *  2 zoned, 4 noTracking, 8 a word space — `sourceIndex >= 0`, 16 a box
 *  with its own stretch), the options with `lineWidth` read for every line
 *  until it is uniform, and the breaks. */
interface KpItemLike { type: string; width: number; stretch?: number; shrink?: number; penalty?: number; flagged?: boolean; zoned?: boolean; noTracking?: boolean; sourceIndex: number; chars?: number; postWidth?: number; postChars?: number; postShift?: number }
function kpLine(items: KpItemLike[], options: Record<string, unknown> & { lineWidth: (l: number) => number; lineWidthUniformFrom?: number }, breaks: number[]): string {
  const rows = items.map((it) => {
    const kind = it.type === 'box' ? 0 : it.type === 'glue' ? 1 : 2;
    const flags = (it.flagged ? 1 : 0) | (it.zoned ? 2 : 0) | (it.noTracking ? 4 : 0) | (it.sourceIndex >= 0 ? 8 : 0) | (kind === 0 && it.stretch !== undefined ? 16 : 0);
    return [kind, it.width, it.stretch ?? 0, it.shrink ?? 0, it.penalty ?? 0, flags, it.chars ?? 0, it.postWidth ?? 0, it.postChars ?? 0, it.postShift ?? 0];
  });
  const { lineWidth, ...rest } = options;
  // Uniform from `lineWidthUniformFrom` on; without it, every line a
  // paragraph of these items could have.
  const lines = options.lineWidthUniformFrom ?? items.length;
  const widths: number[] = [];
  for (let l = 0; l <= lines; l++) widths.push(lineWidth(l));
  return JSON.stringify({ items: rows, options: { ...rest, widths }, breaks });
}

/** What a reader sees of the layout: every block's place, every line's
 *  text and place, page by page. */
export function vdtHash(docs: VDTDocument[]): string {
  const h = createHash('sha256');
  for (const doc of docs) {
    h.update(`doc ${doc.pages.length}\n`);
    for (const b of doc.blocks) {
      h.update(`${b.id} ${b.type} ${b.pageIndex}/${b.columnIndex} ${r2(b.bbox.x)},${r2(b.bbox.y)},${r2(b.bbox.width)},${r2(b.bbox.height)}\n`);
      for (const l of b.lines) h.update(` ${l.text}|${r2(l.bbox.x)},${r2(l.bbox.y)},${r2(l.bbox.width)}|${r2(l.baseline)}|${l.hyphenated ? 1 : 0}\n`);
    }
  }
  return h.digest('hex').slice(0, 16);
}

const results = [];
for (const path of books) {
  const opts = new Options({});
  const reporter = new Reporter('quiet', true);
  const ctx: CommandContext = { command: 'check', inputs: [path], opts, reporter };
  const { book, fonts } = await openBook(ctx);
  const times: number[] = [];
  let hash = '';
  let pages = 0;
  let cache: MeasurementCache | undefined;
  const dump: string[] = [];
  for (let i = 0; i < runs; i++) {
    if (!warm || !cache) cache = createMeasurementCache();
    const g = globalThis as { __postextKpTap?: unknown };
    if (kpDump && i === 0) g.__postextKpTap = (items: KpItemLike[], options: never, breaks: number[]) => dump.push(kpLine(items, options, breaks));
    else delete g.__postextKpTap;
    const t0 = performance.now();
    const layout = await layOut(book, opts, reporter, cache, fonts);
    times.push(performance.now() - t0);
    const h = vdtHash(layout.docs);
    if (hash && h !== hash) process.stderr.write(`${book.name}: run ${i + 1} hash ${h} differs from ${hash}\n`);
    hash = h;
    pages = layout.pageCount;
  }
  if (kpDump) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(kpDump, dump.join('\n') + '\n');
    delete (globalThis as { __postextKpTap?: unknown }).__postextKpTap;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const row = {
    book: book.name,
    pages,
    chapters: book.chapters.length,
    runs: times.map((t) => Math.round(t)),
    medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]!),
    msPerPage: r2(sorted[Math.floor(sorted.length / 2)]! / pages),
    rssMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    hash,
  };
  results.push(row);
  if (!json) process.stdout.write(`${row.book}: ${row.pages} pp, median ${row.medianMs} ms (${row.msPerPage} ms/page) runs ${row.runs.join(' ')} rss ${row.rssMB} MB hash ${row.hash}\n`);
}
if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
