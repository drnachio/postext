// Pass trace (#1603): what every placement pass of a book's layout
// produced, one line per pass, so that two engines (two commits, or the
// TypeScript core and another one) can be compared pass by pass. The hash
// of the finished layout says that two engines agree; the trace says where
// they stop agreeing.
//
//   bun scripts/pass-trace.ts [--full] [--ts-kp] [--out FILE] <book> [<book> …]
//
// Each line is `book build pass tocRound pages hash`: `build` counts the
// chapter builds in the order the bundle runs them, `hash` is the VDT hash
// of the pass's document as the pass left it. --full adds every block and
// line of every pass under its line (large: a diff of two such files shows
// the first block that moved). --ts-kp breaks the lines with the
// TypeScript line breaker instead of the WebAssembly one. Compare two traces with `diff`; the script
// ends with the hash of the whole trace.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createMeasurementCache, useWasmLineBreaker, type VDTDocument } from 'postext';
import { Options } from '../src/args';
import type { CommandContext } from '../src/context';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';
import { vdtHash } from './vdtHash';

const argv = process.argv.slice(2);
let full = false;
let out: string | undefined;
const books: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--full') full = true;
  else if (a === '--ts-kp') useWasmLineBreaker(false);
  else if (a === '--out') out = argv[++i];
  else books.push(a);
}

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every block and line of `doc`, as the hash reads them. */
function detail(doc: VDTDocument): string[] {
  const rows: string[] = [];
  for (const b of doc.blocks) {
    rows.push(`  ${b.id} ${b.type} ${b.pageIndex}/${b.columnIndex} ${r2(b.bbox.x)},${r2(b.bbox.y)},${r2(b.bbox.width)},${r2(b.bbox.height)}`);
    for (const l of b.lines) rows.push(`   ${l.text}|${r2(l.bbox.x)},${r2(l.bbox.y)},${r2(l.bbox.width)}|${r2(l.baseline)}|${l.hyphenated ? 1 : 0}`);
  }
  return rows;
}

const hooks = globalThis as {
  __postextPassTap?: (trace: { pass: number; tocRound: number; doc: VDTDocument }) => void;
  __postextPerfTap?: (stage: string, ms: number) => void;
};
const lines: string[] = [];
for (const path of books) {
  const opts = new Options({});
  const reporter = new Reporter('quiet', true);
  const ctx: CommandContext = { command: 'check', inputs: [path], opts, reporter };
  const { book, fonts } = await openBook(ctx);
  let build = 0;
  let passes = 0;
  // A chapter build reports `build.before` once, before its first pass.
  hooks.__postextPerfTap = (stage) => { if (stage === 'build.before') build++; };
  hooks.__postextPassTap = ({ pass, tocRound, doc }) => {
    passes++;
    lines.push(`${book.name} ${build} ${pass} ${tocRound} ${doc.pages.length} ${vdtHash([doc])}`);
    if (full) lines.push(...detail(doc));
  };
  const layout = await layOut(book, opts, reporter, createMeasurementCache(), fonts);
  delete hooks.__postextPassTap;
  delete hooks.__postextPerfTap;
  lines.push(`${book.name} layout ${layout.pageCount} ${vdtHash(layout.docs)}`);
  process.stderr.write(`${book.name}: ${build} builds, ${passes} passes, ${layout.pageCount} pp, layout ${vdtHash(layout.docs)}\n`);
}
const text = `${lines.join('\n')}\n`;
if (out) writeFileSync(out, text);
else if (!full) process.stdout.write(text);
process.stderr.write(`trace ${createHash('sha256').update(text).digest('hex').slice(0, 16)}\n`);
