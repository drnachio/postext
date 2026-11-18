// Typing benchmark (#1639): a letter typed again and again at one place of
// a book's longest chapter, the chapter laid out after each with tapes
// (`BuildDocumentOptions.tapes`: each pass starts from the page before the
// edit, the pages before it keep what the build before made of them) and
// without. Prints both medians (the first build after the chapter is
// opened, which records, is not among them), whether the documents are equal, and how
// the last build with tapes went.
//
//   bun scripts/bench-typing.ts <book> [share of the way through, 0.9] [letters, 12]
//
// The chapter is laid out on its own, without what its book hands it.

import { buildDocument, createLayoutTapes, createMeasurementCache } from 'postext';
import { Options } from '../src/args';
import { layOut } from '../src/layout';
import { Reporter } from '../src/log';
import { openBook } from '../src/session';

process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
await import('../src/env');

const PARAGRAPH_LINE = /^[\p{L}\p{N}«“"¿¡(]/u;
const path = process.argv[2]!;
const share = Number(process.argv[3] ?? 0.9);
const letters = Number(process.argv[4] ?? 12);

const opts = new Options({});
const reporter = new Reporter('quiet', true);
const { book, fonts } = await openBook({ command: 'check', inputs: [path], opts, reporter });
const whole = await layOut(book, opts, reporter, createMeasurementCache(), fonts);
let at = 0;
whole.docs.forEach((d, i) => { if (d.pages.length > whole.docs[at]!.pages.length) at = i; });
let markdown = book.chapters[at]!.markdown;
const candidates = markdown.split('\n').map((l, i) => (PARAGRAPH_LINE.test(l) && l.length > 40 ? i : -1)).filter((i) => i >= 0);
const n = candidates[Math.min(candidates.length - 1, Math.floor(candidates.length * share))]!;

// The chapter after each letter.
const texts: string[] = [];
for (let k = 0; k < letters; k++) {
  const lines = markdown.split('\n');
  lines[n] = lines[n]!.replace(/\p{L}[\p{L}\p{M}]{3,}/u, (w) => w + w[0]);
  markdown = lines.join('\n');
  texts.push(markdown);
}

// The two kinds of build are timed one after the other, each on a
// measurement cache of its own that the first text has filled: builds of
// both kinds in turns slow each other (the same code then sees pages that
// are frozen and pages that are not), which no host does. Nothing is kept
// of a timed build. The documents are compared afterwards, in a run of
// their own.
const first = book.chapters[at]!.markdown;
const content = (text: string) => ({ markdown: text, resources: book.resources });
const time = (options?: { tapes: ReturnType<typeof createLayoutTapes> }): number[] => {
  const cache = createMeasurementCache();
  buildDocument(content(first), book.config, cache, options);
  return texts.map((text) => {
    const t0 = performance.now();
    buildDocument(content(text), book.config, cache, options);
    return performance.now() - t0;
  });
};
const plain = time();
const tapes = createLayoutTapes();
const taped = time({ tapes });
const last = { ...tapes.stats };

let same = true;
{
  const checked = createLayoutTapes();
  const caches = [createMeasurementCache(), createMeasurementCache()];
  buildDocument(content(first), book.config, caches[0], { tapes: checked });
  for (const text of texts) {
    const a = JSON.stringify(buildDocument(content(text), book.config, caches[0], { tapes: checked }));
    const b = JSON.stringify(buildDocument(content(text), book.config, caches[1]));
    if (a === b) continue;
    if (same) {
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      process.stderr.write(`the documents differ:\n  tapes: …${a.slice(Math.max(0, i - 200), i + 120)}…\n  plain: …${b.slice(Math.max(0, i - 200), i + 120)}…\n`);
    }
    same = false;
  }
}
const median = (xs: number[]) => Math.round([...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!);
const s = last;
process.stdout.write(`${book.name}: chapter ${at + 1}, ${whole.docs[at]!.pages.length} pp, ${letters} letters at ${share}: ${median(taped)} ms with tapes, ${median(plain)} ms without; documents ${same ? 'equal' : 'DIFFER'}; last build: passes from blocks ${s.startedAt.join(', ')}, pages kept ${s.pagesKept.join(', ')}, rejoined at ${s.rejoinedAt.map((b) => b ?? '–').join(', ') || '–'}, pages taken ${s.pagesTaken.join(', ')}${s.apartAt.some(Boolean) ? `, apart at ${s.apartAt.filter(Boolean).join(' | ')}` : ''}${s.reasons.some(Boolean) ? `, ${s.reasons.filter(Boolean).join('; ')}` : ''}${s.builtAgain ? `, built again (${s.builtAgainAt})` : ''}\n`);
process.exit(same ? 0 : 1);
