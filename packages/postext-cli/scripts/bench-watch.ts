// Watch-mode benchmark (#782): lays a book out, then applies scripted
// edits one after another, as a session of saves would, and lays the book
// out after each one twice: incrementally (a layout cache kept from the
// last layout, what `build --watch` does) and in full (every chapter, on a
// measurement cache kept warm, what `build --watch` did before). It prints
// both times, how many chapters the incremental layout laid out, and
// whether the two give the same VDT hash. A last full layout on a fresh
// measurement cache checks the end state against a cold build.
//
//   bun scripts/bench-watch.ts [--json] <book> [<book> …]

import { createBundleLayoutCache, createMeasurementCache, type BundleLayoutCache, type MeasurementCache } from 'postext';
import { Options } from '../src/args';
import type { CommandContext } from '../src/context';
import type { Book, BookChapter } from '../src/input';
import { layOut, type Layout } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';
import { vdtHash } from './vdtHash';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const books = argv.filter((a) => a !== '--json');

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

/** One scripted edit: a new list of chapters, or undefined when the book
 *  has nothing it applies to. */
interface Edit {
  name: string;
  apply: (chapters: readonly BookChapter[]) => { chapters: BookChapter[]; at: number } | undefined;
}

const PARAGRAPH_LINE = /^[\p{L}\p{N}«“"¿¡(]/u;

/** The index of a plain paragraph line of `markdown` near its middle,
 *  past its front matter (an edit there is one of the book's metadata). */
function paragraphLine(markdown: string): number | undefined {
  const lines = markdown.split('\n');
  const body = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;
  const candidates = lines.map((l, i) => (i >= body && PARAGRAPH_LINE.test(l) && l.length > 60 ? i : -1)).filter((i) => i >= 0);
  return candidates.length > 0 ? candidates[Math.floor(candidates.length / 2)] : undefined;
}

/** The first chapter at or after `from` with a paragraph line. */
function chapterWithText(chapters: readonly BookChapter[], from: number): number | undefined {
  for (let i = from; i < chapters.length; i++) if (paragraphLine(chapters[i]!.markdown) !== undefined) return i;
  for (let i = from - 1; i >= 0; i--) if (paragraphLine(chapters[i]!.markdown) !== undefined) return i;
  return undefined;
}

function replaceLine(chapters: readonly BookChapter[], at: number, edit: (lines: string[]) => void): BookChapter[] {
  const lines = chapters[at]!.markdown.split('\n');
  edit(lines);
  return chapters.map((c, i) => (i === at ? { ...c, markdown: lines.join('\n') } : c));
}

/** Change one word of a paragraph of chapter `pick(chapters)`. */
const wordEdit = (name: string, pick: (chapters: readonly BookChapter[]) => number | undefined): Edit => ({
  name,
  apply: (chapters) => {
    const at = pick(chapters);
    if (at === undefined) return undefined;
    return {
      at,
      chapters: replaceLine(chapters, at, (lines) => {
        const n = paragraphLine(lines.join('\n'))!;
        lines[n] = lines[n]!.replace(/\p{L}{5,}/u, (w) => [...w].reverse().join(''));
      }),
    };
  },
});

const middle = (chapters: readonly BookChapter[]) => chapterWithText(chapters, Math.floor(chapters.length / 2));

const EDITS: Edit[] = [
  wordEdit('word, first chapter', (c) => chapterWithText(c, 0)),
  wordEdit('word, middle chapter', middle),
  wordEdit('word, last chapter', (c) => chapterWithText(c, c.length - 1)),
  {
    // Forty copies of a paragraph: enough to move the page count.
    name: 'paragraph added (pages move)',
    apply: (chapters) => {
      const at = middle(chapters);
      if (at === undefined) return undefined;
      return {
        at,
        chapters: replaceLine(chapters, at, (lines) => {
          const n = paragraphLine(lines.join('\n'))!;
          lines.splice(n + 1, 0, ...Array.from({ length: 40 }, () => ['', lines[n]!]).flat());
        }),
      };
    },
  },
  {
    name: 'heading edited (outline)',
    apply: (chapters) => {
      const from = Math.floor(chapters.length / 2);
      const order = [...chapters.keys()].sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
      const at = order.find((i) => /^#{1,3} \S/m.test(chapters[i]!.markdown));
      if (at === undefined) return undefined;
      return {
        at,
        chapters: replaceLine(chapters, at, (lines) => {
          const n = lines.findIndex((l) => /^#{1,3} \S/.test(l));
          lines[n] = lines[n]!.replace(/^(#{1,3} )(.*?)(\s*\{[^}]*\})?$/, (_, hashes: string, title: string, attrs: string | undefined) => `${hashes}${title} revisado${attrs ?? ''}`);
        }),
      };
    },
  },
  { name: 'no-op save', apply: (chapters) => ({ at: -1, chapters: chapters.map((c) => ({ ...c })) }) },
];

interface Row {
  edit: string;
  chapter: number;
  pages: number;
  incrementalMs: number;
  fullMs: number;
  laidOut: number;
  layouts: number;
  chapters: number;
  same: boolean;
}

async function timed(book: Book, opts: Options, cache: MeasurementCache, fonts: Awaited<ReturnType<typeof openBook>>['fonts'], layouts?: BundleLayoutCache): Promise<{ layout: Layout; ms: number }> {
  const reporter = new Reporter('quiet', true);
  const t0 = performance.now();
  const layout = await layOut(book, opts, reporter, cache, fonts, layouts);
  return { layout, ms: performance.now() - t0 };
}

const results: { book: string; chapters: number; initial: { incrementalMs: number; fullMs: number; same: boolean }; edits: Row[]; cold: { ms: number; same: boolean }; rssMB: number }[] = [];
for (const path of books) {
  const opts = new Options({});
  const ctx: CommandContext = { command: 'check', inputs: [path], opts, reporter: new Reporter('quiet', true) };
  const { book: opened, fonts } = await openBook(ctx);
  let book = opened;
  const layoutCache = createBundleLayoutCache();
  const incCache = createMeasurementCache();
  const fullCache = createMeasurementCache();
  const first = await timed(book, opts, incCache, fonts, layoutCache);
  const firstFull = await timed(book, opts, fullCache, fonts);
  const initial = { incrementalMs: Math.round(first.ms), fullMs: Math.round(firstFull.ms), same: vdtHash(first.layout.docs) === vdtHash(firstFull.layout.docs) };
  if (!json) process.stdout.write(`${book.name}: ${first.layout.pageCount} pp, ${book.chapters.length} chapters; first layout ${initial.incrementalMs} ms (full ${initial.fullMs} ms) ${initial.same ? 'same' : 'DIFFERENT'}\n`);
  const rows: Row[] = [];
  let last = first.layout;
  for (const edit of EDITS) {
    const applied = edit.apply(book.chapters);
    if (!applied) {
      if (!json) process.stdout.write(`  ${edit.name}: not applicable\n`);
      continue;
    }
    // As a save re-reads the book: new objects, resources stamped anew.
    const now = Date.now();
    book = { ...book, chapters: applied.chapters, config: structuredClone(book.config), resources: book.resources.map((r) => ({ ...structuredClone(r), createdAt: now, updatedAt: now })) };
    const inc = await timed(book, opts, incCache, fonts, layoutCache);
    const full = await timed(book, opts, fullCache, fonts);
    const row: Row = {
      edit: edit.name,
      chapter: applied.at + 1,
      pages: inc.layout.pageCount,
      incrementalMs: Math.round(inc.ms),
      fullMs: Math.round(full.ms),
      laidOut: inc.layout.laidOut.filter(Boolean).length,
      layouts: layoutCache.stats.layouts,
      chapters: book.chapters.length,
      same: vdtHash(inc.layout.docs) === vdtHash(full.layout.docs),
    };
    rows.push(row);
    if (!json) {
      const moved = inc.layout.pageCount !== last.pageCount ? ` (was ${last.pageCount})` : '';
      process.stdout.write(`  ${row.edit} [ch ${row.chapter > 0 ? row.chapter : '-'}]: ${row.incrementalMs} ms vs full ${row.fullMs} ms; laid out ${row.laidOut}/${row.chapters} chapters (${row.layouts} layouts); ${row.pages} pp${moved}; ${row.same ? 'same' : 'DIFFERENT'}\n`);
    }
    last = inc.layout;
  }
  const cold = await timed(book, opts, createMeasurementCache(), fonts);
  const coldCheck = { ms: Math.round(cold.ms), same: vdtHash(cold.layout.docs) === vdtHash(last.docs) };
  const rssMB = Math.round(process.memoryUsage().rss / 2 ** 20);
  if (!json) process.stdout.write(`  cold full layout of the end state: ${coldCheck.ms} ms, ${coldCheck.same ? 'same' : 'DIFFERENT'}; rss ${rssMB} MB\n`);
  results.push({ book: book.name, chapters: book.chapters.length, initial, edits: rows, cold: coldCheck, rssMB });
}
if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
if (results.some((r) => !r.initial.same || !r.cold.same || r.edits.some((e) => !e.same))) process.exitCode = 1;
