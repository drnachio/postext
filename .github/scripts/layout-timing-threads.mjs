// The Layout timing workflow's table of worker threads (#1611): the long
// books laid out on one thread and on several (`postext --threads N`), each
// in a process of its own that lays the book out once, as a run of the
// command line does — so every number holds the start of its workers and
// the warm-up of each thread.
//
//   node .github/scripts/layout-timing-threads.mjs <dir>
//
// reads <dir>/threads-<N>-<round>.json, what
// packages/postext-cli/scripts/bench-layout.ts --runs 1 --json [--threads N]
// printed (N = 1: no --threads). A cell is the median of its rounds.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir] = process.argv.slice(2);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** threads → rounds, each a list of books. */
const byThreads = new Map();
for (const file of readdirSync(dir).sort()) {
  const m = /^threads-(\d+)-\d+\.json$/.exec(file);
  if (!m) continue;
  const list = byThreads.get(Number(m[1])) ?? [];
  list.push(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  byThreads.set(Number(m[1]), list);
}
const counts = [...byThreads.keys()].sort((a, b) => a - b);
const out = ['## Worker threads', ''];
if (!byThreads.has(1) || counts.length < 2) {
  out.push('No comparison: a run on one thread and one on several are needed.');
} else {
  const cell = (rounds, book) => {
    const rows = rounds.map((r) => r.find((b) => b.book === book)).filter(Boolean);
    return rows.length ? { ms: median(rows.map((r) => r.runs[0])), cpu: median(rows.map((r) => r.cpuRuns?.[0] ?? 0)), hashes: new Set(rows.map((r) => r.hash)), pages: rows[0].pages } : undefined;
  };
  const books = byThreads.get(1)[0].map((b) => b.book);
  out.push(`One layout per process, ${byThreads.get(1).length} processes each, in turns: the time of a first layout, as the command line pays it. In brackets, the processor time of the process.`, '');
  out.push(`| Book | Pages | ${counts.map((n) => (n === 1 ? '1 thread ms' : `${n} threads ms`)).join(' | ')} | Best | Pages hash |`);
  out.push(`| --- | ---: | ${counts.map(() => '---:').join(' | ')} | ---: | ---: |`);
  for (const book of books) {
    const cells = counts.map((n) => cell(byThreads.get(n), book));
    const one = cells[0];
    if (!one) continue;
    const hashes = new Set(cells.flatMap((c) => (c ? [...c.hashes] : [])));
    const best = cells.reduce((b, c, i) => (c && c.ms < b.ms ? { ms: c.ms, n: counts[i] } : b), { ms: one.ms, n: 1 });
    out.push(`| ${book.replaceAll('|', '\\|')} | ${one.pages} | ${cells.map((c) => (c ? `${Math.round(c.ms)} (${Math.round(c.cpu)})` : '–')).join(' | ')} | ${best.n === 1 ? '1 thread' : `${best.n} threads, ${(one.ms / best.ms).toFixed(2)}×`} | ${hashes.size === 1 ? 'same' : `**differ**: ${[...hashes].join(' ')}`} |`);
  }
}
process.stdout.write(`${out.join('\n')}\n`);
