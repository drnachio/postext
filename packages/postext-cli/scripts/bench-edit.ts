// Edit benchmark (#1637): what one keystroke in a long chapter costs and
// how much of the chapter it changes. Lays a book out, then changes one
// letter of a paragraph near the start, the middle and the end of its
// longest chapter, laying the book out after each with the layout cache
// kept (only the edited chapter is laid out again, as in the Sandbox and
// in `build --watch`). For each edit it prints the time, the stages it
// went to (`util/perfTap.ts`), the passes, and the pages of the chapter
// that differ from the layout before: the rest is what an incremental
// layout would not have to redo, and what a host would not have to
// receive again.
//
//   bun scripts/bench-edit.ts [--json] [--rounds N] <book> [<book> …]

import { createBundleLayoutCache, createMeasurementCache, type VDTDocument } from 'postext';
import { Options } from '../src/args';
import type { CommandContext } from '../src/context';
import type { BookChapter } from '../src/input';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
let rounds = 3;
const books: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--json') continue;
  if (argv[i] === '--rounds') rounds = Number(argv[++i]);
  else books.push(argv[i]!);
}

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

const PARAGRAPH_LINE = /^[\p{L}\p{N}«“"¿¡(]/u;

/** The index of the plain paragraph line of `markdown` nearest `share`
 *  (0 to 1) of the way through its paragraph lines. */
function paragraphLine(markdown: string, share: number): number | undefined {
  const lines = markdown.split('\n');
  const body = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const candidates = lines.map((l, i) => (i >= body && PARAGRAPH_LINE.test(l) && l.length > 60 ? i : -1)).filter((i) => i >= 0);
  return candidates.length > 0 ? candidates[Math.min(candidates.length - 1, Math.floor(candidates.length * share))] : undefined;
}

/** `chapters` with one letter added to a word of line `n` of chapter `at`
 *  (the `turn`-th edit there: each adds one more letter). */
function typed(chapters: readonly BookChapter[], at: number, n: number): BookChapter[] {
  const lines = chapters[at]!.markdown.split('\n');
  lines[n] = lines[n]!.replace(/\p{L}[\p{L}\p{M}]{3,}/u, (w) => w + w[0]);
  return chapters.map((c, i) => (i === at ? { ...c, markdown: lines.join('\n') } : c));
}

/** Where a block or a line stands in the source: an edit moves these for
 *  everything after it, by the length of the edit, with no page moving. */
const SOURCE_KEYS = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'attrSources']);

/** A page as text, for comparison: what a renderer reads of it, without
 *  the places in the source. */
const pageText = (doc: VDTDocument, i: number): string => JSON.stringify(doc.pages[i], (key, value) => (SOURCE_KEYS.has(key) ? undefined : value));
/** The same with them. */
const pageSourceText = (doc: VDTDocument, i: number): string => JSON.stringify(doc.pages[i]);

interface Row {
  where: string;
  ms: number;
  passes: number;
  passMs: number;
  stages: Record<string, number>;
  pages: number;
  /** Pages of the chapter that differ from the layout before the edit,
   *  and the first and last of them (0-based, in the chapter). */
  changed: number;
  first: number;
  last: number;
  /** Pages that differ only by their places in the source. */
  shifted: number;
  cloneMs: number;
  docMB: number;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const out: { book: string; chapter: string; pages: number; rows: Row[] }[] = [];

for (const path of books) {
  const opts = new Options({});
  const reporter = new Reporter('quiet', true);
  const ctx: CommandContext = { command: 'check', inputs: [path], opts, reporter };
  const { book: opened, fonts } = await openBook(ctx);
  let book = opened;
  const layouts = createBundleLayoutCache();
  const cache = createMeasurementCache();
  let layout = await layOut(book, opts, reporter, cache, fonts, layouts);
  // The longest chapter: where a keystroke costs most.
  let at = 0;
  for (let i = 1; i < layout.docs.length; i++) if (layout.docs[i]!.pages.length > layout.docs[at]!.pages.length) at = i;
  const rows: Row[] = [];
  for (const [where, share] of [['start', 0.02], ['middle', 0.5], ['end', 0.98]] as const) {
    const n = paragraphLine(book.chapters[at]!.markdown, share);
    if (n === undefined) continue;
    const samples: Row[] = [];
    for (let round = 0; round < rounds; round++) {
      const before = layout.docs[at]!;
      const beforePages = before.pages.map((_, i) => pageText(before, i));
      const beforeSource = before.pages.map((_, i) => pageSourceText(before, i));
      book = { ...book, chapters: typed(book.chapters, at, n) };
      const stages: Record<string, number> = {};
      let passes = 0;
      let passMs = 0;
      const perf = globalThis as { __postextPerfTap?: (stage: string, ms: number) => void };
      perf.__postextPerfTap = (stage, ms) => {
        stages[stage] = (stages[stage] ?? 0) + ms;
        if (stage === 'pass.finish') passes++;
        if (stage.startsWith('pass.')) passMs += ms;
      };
      const t0 = performance.now();
      layout = await layOut(book, opts, reporter, cache, fonts, layouts);
      const ms = performance.now() - t0;
      delete perf.__postextPerfTap;
      const after = layout.docs[at]!;
      let changed = 0;
      let first = -1;
      let last = -1;
      let shifted = 0;
      const total = Math.max(after.pages.length, beforePages.length);
      for (let i = 0; i < total; i++) {
        if (i < after.pages.length && i < beforePages.length && pageText(after, i) === beforePages[i]) {
          if (pageSourceText(after, i) !== beforeSource[i]) shifted++;
          continue;
        }
        changed++;
        if (first < 0) first = i;
        last = i;
      }
      const c0 = performance.now();
      structuredClone(after);
      const cloneMs = performance.now() - c0;
      samples.push({ where, ms, passes, passMs, stages, pages: after.pages.length, changed, first, last, shifted, cloneMs, docMB: JSON.stringify(after).length / 1e6 });
    }
    // The round of median time stands for the edit.
    const mid = median(samples.map((s) => s.ms));
    rows.push(samples.find((s) => s.ms === mid)!);
  }
  out.push({ book: book.name, chapter: String(at + 1), pages: layout.docs[at]!.pages.length, rows });
}

if (json) console.log(JSON.stringify(out, null, 2));
else {
  for (const b of out) {
    console.log(`\n${b.book}: chapter ${b.chapter}, ${b.pages} pages`);
    for (const r of b.rows) {
      const top = Object.entries(r.stages).sort((x, y) => y[1] - x[1]).slice(0, 9).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
      console.log(`  ${r.where.padEnd(6)} ${r.ms.toFixed(0).padStart(5)} ms, ${r.passes} passes (${r.passMs.toFixed(0)} ms); pages changed ${r.changed} of ${r.pages} (${r.first}…${r.last}), ${r.shifted} more only by their source places; clone ${r.cloneMs.toFixed(0)} ms, ${r.docMB.toFixed(1)} MB`);
      console.log(`         ${top}`);
    }
  }
}
