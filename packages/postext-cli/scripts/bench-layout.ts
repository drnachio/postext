// Layout benchmark (#779): lays each book out
// the way `postext check` does (Skia measuring, chapter by chapter), a
// number of times, and prints the time of each run, the peak memory and a
// hash of the VDT, so that a change to the engine can be judged on speed
// and on output that must not move.
//
//   bun scripts/bench-layout.ts [--runs N] [--warm] [--stages] [--cold-host] [--threads N|auto] [--json] [--ts-kp] [--kp-dump FILE] <book> [<book> …]
//
// --stages (#1603) adds where the last run's time went: the engine reports
// each stage through `globalThis.__postextPerfTap` (`util/perfTap.ts`), and
// the nested ones are taken out of their parents here, so the shares add up
// to the run. Times are also given as CPU time of this process, which holds
// on a busy machine where wall time does not.
//
// With --stages a measurement miss is divided further (#1605): the canvas's
// `measureText` and font set, the hyphenation dictionary, and the engine's
// own work. The engine keeps the widths the canvas gave it for the life of
// the process, so only a process's first run asks the canvas: --cold-host
// drops those widths before every run, and each run then pays what the
// first layout of a book pays in a fresh process, less the JIT's warm-up.
//
// --ts-kp breaks the lines with the TypeScript line breaker instead of the
// Rust one compiled to WebAssembly (#794): the two choose the same breaks,
// and this is how their speeds are compared. --kp-dump writes every
// Knuth–Plass call of the first run (items, options with the line widths it
// reads, breaks) to FILE as JSON lines, the corpus rust/bench replays.
//
// --threads N lays the chapters out on N worker threads (#1611), as the
// command line does for a long book (`auto`: its own rule); every run
// starts its workers anew, so each pays what a first layout pays. Without
// it the book is laid out on this thread, whatever its length.
//
// Each run lays the book out on a fresh measurement cache (cold) unless
// --warm, which reuses the first run's cache (what the Sandbox's worker
// sees after the first build).

import { clearMeasurementCache, createMeasurementCache, useWasmLineBreaker, type MeasurementCache } from 'postext';
import { Options } from '../src/args';
import type { CommandContext } from '../src/context';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';
import { vdtHash } from './vdtHash';

const argv = process.argv.slice(2);
let runs = 3;
let warm = false;
let json = false;
let stages = false;
let coldHost = false;
let kpDump: string | undefined;
let threads: string | undefined;
const books: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--runs') runs = Number(argv[++i]);
  else if (a === '--warm') warm = true;
  else if (a === '--json') json = true;
  else if (a === '--stages') stages = true;
  else if (a === '--cold-host') coldHost = true;
  else if (a === '--ts-kp') useWasmLineBreaker(false);
  else if (a === '--kp-dump') kpDump = argv[++i];
  else if (a === '--threads') threads = argv[++i];
  else books.push(a);
}

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

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
  const lines = options.lineWidthUniformFrom ?? items.length;
  const widths: number[] = [];
  for (let l = 0; l <= lines; l++) widths.push(lineWidth(l));
  return JSON.stringify({ items: rows, options: { ...rest, widths }, breaks });
}

/** The stages of a run, nested ones taken out of their parents, in
 *  milliseconds with the number of times each ran. */
function stageTable(raw: Map<string, { ms: number; n: number }>, totalMs: number): Record<string, { ms: number; pct: number; n: number }> {
  const of = (k: string) => raw.get(k)?.ms ?? 0;
  const count = (k: string) => raw.get(k)?.n ?? 0;
  const measured = of('measure.key') + of('measure.hit') + of('measure.miss') + of('measure.uncached');
  const setup = of('pass.config') + of('pass.pageSetup') + of('pass.contentSetup') + of('pass.wiring');
  const passes = setup + of('pass.blocks') + of('pass.finish');
  const builds = of('build.before') + of('build.rounds') + of('post.warnings') + of('post.marks') + of('post.fonts') + of('post.config') + of('bundle.chapterOutline');
  const rows: [string, number, number][] = [
    ['setup (config, parse, content, wiring)', setup, count('pass.blocks')],
    ['measure: cache key and lookup', of('measure.key'), count('measure.key')],
    ['measure: hit (copy)', of('measure.hit'), count('measure.hit')],
    ['measure: miss, engine (tokens, items, lines)', of('measure.miss') + of('measure.uncached') - of('kp') - of('host.measureText') - of('host.font') - of('hyphenate'), count('measure.miss') + count('measure.uncached')],
    ['measure: miss, host measureText', of('host.measureText'), count('host.measureText')],
    ['measure: miss, host font set', of('host.font'), count('host.font')],
    ['measure: miss, hyphenation dictionary', of('hyphenate'), count('hyphenate')],
    ['line breaking (Knuth–Plass)', of('kp'), count('kp')],
    ['placement (block loop, less measuring)', of('pass.blocks') - measured, count('pass.blocks')],
    ['pass finish', of('pass.finish'), count('pass.finish')],
    ['build: before the passes (fonts, chapter style, config)', of('build.before'), count('build.before')],
    ['build: drivers between passes (balancing, caps, rounds)', of('build.rounds') - passes, count('build.rounds')],
    ['post-pass: warnings', of('post.warnings'), count('post.warnings')],
    ['post-pass: marks and annotations', of('post.marks'), count('post.marks')],
    ['post-pass: font and glyph fallback scans', of('post.fonts'), count('post.fonts')],
    ['post-pass: config warnings', of('post.config'), count('post.config')],
    // The flags are the first to ask for each chapter's blocks: the stage
    // is the Markdown parse of the book, and little else (#1608).
    ['bundle: Markdown parse of each chapter, contents flags', of('bundle.flags'), count('bundle.flags')],
    ['bundle: page fence ids', of('bundle.pageIds'), count('bundle.pageIds')],
    ['bundle: citation sources', of('bundle.citations'), count('bundle.citations')],
    ['bundle: provisional outline', of('bundle.provisionalOutline'), count('bundle.provisionalOutline')],
    ['bundle: outline of each laid chapter', of('bundle.chapterOutline'), count('bundle.chapterOutline')],
    ['bundle: counters after each chapter', of('bundle.continuation'), count('bundle.continuation')],
    ['rest (bundle keys, rounds, CLI around the bundle)', totalMs - builds - of('bundle.flags') - of('bundle.pageIds') - of('bundle.citations') - of('bundle.provisionalOutline') - of('bundle.continuation'), 1],
  ];
  return Object.fromEntries(rows.map(([k, ms, n]) => [k, { ms: Math.round(ms), pct: r2((ms / totalMs) * 100), n }]));
}

/** What a measure miss spends outside the engine's own code (#1605): the
 *  canvas's `measureText` and `font` setter, and the hyphenation
 *  dictionary, each wrapped with a timer while `probe.on`. A timer pair
 *  costs about as much as the cheapest of these calls, so the time of an
 *  empty pair (`probe.pairMs`, measured here) is taken off every call. */
const probe = { on: false, pairMs: 0, acc: new Map<string, { ms: number; n: number }>() };
function timed<A extends unknown[], R>(stage: string, fn: (this: unknown, ...args: A) => R): (this: unknown, ...args: A) => R {
  return function (this: unknown, ...args: A): R {
    if (!probe.on) return fn.apply(this, args);
    const t0 = performance.now();
    try {
      return fn.apply(this, args);
    } finally {
      const row = probe.acc.get(stage) ?? { ms: 0, n: 0 };
      row.ms += performance.now() - t0;
      row.n++;
      probe.acc.set(stage, row);
    }
  };
}
if (stages) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as Record<string, unknown>;
  proto.measureText = timed('host.measureText', proto.measureText as (text: string) => unknown);
  const font = Object.getOwnPropertyDescriptor(proto, 'font')!;
  Object.defineProperty(proto, 'font', { ...font, set: timed('host.font', font.set as (v: string) => void) });
  const { createRequire } = await import('node:module');
  const Hypher = createRequire(import.meta.resolve('postext'))('hypher') as { prototype: Record<string, unknown> };
  for (const m of ['hyphenate', 'hyphenateText']) {
    // `hyphenateText` calls `hyphenate` per word: only the outermost counts.
    const inner = Hypher.prototype[m] as (...a: unknown[]) => unknown;
    let depth = 0;
    const outer = timed('hyphenate', inner);
    Hypher.prototype[m] = function (this: unknown, ...a: unknown[]) {
      if (depth > 0) return inner.apply(this, a);
      depth++;
      try { return outer.apply(this, a); } finally { depth--; }
    };
  }
  const empty = timed('pair', () => undefined);
  probe.on = true;
  for (let i = 0; i < 2_000_000; i++) empty();
  probe.on = false;
  probe.pairMs = probe.acc.get('pair')!.ms / 2_000_000;
  probe.acc.clear();
}

const results = [];
for (const path of books) {
  const opts = new Options(threads !== undefined ? { threads } : {});
  const reporter = new Reporter('quiet', true);
  const ctx: CommandContext = { command: 'check', inputs: [path], opts, reporter };
  const { book, fonts } = await openBook(ctx);
  const times: number[] = [];
  const cpu: number[] = [];
  const raw = new Map<string, { ms: number; n: number }>();
  let inBlocks = false;
  let hash = '';
  let pages = 0;
  let cache: MeasurementCache | undefined;
  const dump: string[] = [];
  for (let i = 0; i < runs; i++) {
    if (!warm || !cache) cache = createMeasurementCache();
    const g = globalThis as { __postextKpTap?: unknown };
    if (kpDump && i === 0) g.__postextKpTap = (items: KpItemLike[], options: never, breaks: number[]) => dump.push(kpLine(items, options, breaks));
    else delete g.__postextKpTap;
    const perf = globalThis as { __postextPerfTap?: (stage: string, ms: number) => void };
    if (stages && i === runs - 1) {
      perf.__postextPerfTap = (stage, ms) => {
        // Measuring outside the block loop (a heading measured during the
        // setup, the notes set when a pass ends) stays in its parent's time.
        if (stage === 'pass.wiring') inBlocks = true;
        else if (stage === 'pass.blocks') inBlocks = false;
        else if (!inBlocks && (stage === 'kp' || stage.startsWith('measure.'))) return;
        // The probes' time since the cache was asked belongs to this miss;
        // what they took elsewhere (a hit asks nothing of them) is dropped.
        if (stage === 'measure.key') probe.acc.clear();
        else if (stage === 'measure.miss' || stage === 'measure.uncached') {
          let calls = 0;
          for (const [k, v] of probe.acc) {
            const row = raw.get(k) ?? { ms: 0, n: 0 };
            row.ms += Math.max(0, v.ms - v.n * probe.pairMs);
            row.n += v.n;
            raw.set(k, row);
            calls += v.n;
          }
          probe.acc.clear();
          ms -= calls * probe.pairMs;
        }
        const row = raw.get(stage) ?? { ms: 0, n: 0 };
        row.ms += ms;
        row.n++;
        raw.set(stage, row);
      };
    }
    if (coldHost) clearMeasurementCache();
    probe.on = stages && i === runs - 1;
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    const layout = await layOut(book, opts, reporter, cache, fonts, undefined, threads !== undefined ? { command: 'check', inputs: [path] } : undefined);
    times.push(performance.now() - t0);
    const used = process.cpuUsage(c0);
    cpu.push((used.user + used.system) / 1000);
    delete perf.__postextPerfTap;
    probe.on = false;
    const h = vdtHash(layout.docs);
    if (hash && h !== hash) process.stderr.write(`${book.name}: run ${i + 1} hash ${h} differs from ${hash}\n`);
    hash = h;
    pages = layout.pageCount;
  }
  if (kpDump) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(kpDump, `${dump.join('\n')}\n`);
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
    cpuRuns: cpu.map((t) => Math.round(t)),
    rssMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    hash,
    ...(stages ? { stages: stageTable(raw, times[times.length - 1]!) } : {}),
  };
  results.push(row);
  if (!json) process.stdout.write(`${row.book}: ${row.pages} pp, median ${row.medianMs} ms (${row.msPerPage} ms/page) runs ${row.runs.join(' ')} cpu ${row.cpuRuns.join(' ')} rss ${row.rssMB} MB hash ${row.hash}\n`);
  if (!json && row.stages) for (const [k, v] of Object.entries(row.stages)) process.stdout.write(`  ${String(v.ms).padStart(7)} ms ${String(v.pct).padStart(6)} %  ${k} (×${v.n})\n`);
}
if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
