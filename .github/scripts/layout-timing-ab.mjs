// The Layout timing workflow's comparison (#1607): the base commit and the
// head laid out on the same runner, in alternate rounds, each round one
// process of packages/postext-cli/scripts/bench-layout.ts --stages --json.
// Two runners differ by more than most changes save, so the difference
// that counts is the one inside a run of the workflow.
//
//   node .github/scripts/layout-timing-ab.mjs <dir> <mode> [heading]
//
// reads <dir>/base-<mode>-<round>.json and <dir>/head-<mode>-<round>.json.
// A round's time for a book is its fastest run after the first (the first
// run of a process also pays the JIT's warm-up, and is reported apart); a
// side's time is the median of its rounds, and its spread is the distance
// between its slowest and fastest round, as a share of that median. A
// difference smaller than the spread is the runner, not the change.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, mode, heading = 'Base and head on this runner'] = process.argv.slice(2);

/** `<side>-<mode>-<round>.json`: a round's file, the round in digits. */
const isRound = (file, side) => {
  const start = `${side}-${mode}-`;
  if (!file.startsWith(start) || !file.endsWith('.json')) return false;
  return /^\d+$/.test(file.slice(start.length, -'.json'.length));
};

const rounds = (side) =>
  readdirSync(dir)
    .filter((f) => isRound(f, side))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)} %`;
const spread = (x) => `${(x * 100).toFixed(1)} %`;
const cell = (s) => String(s).replaceAll('|', '\\|');
const table = (head, body) =>
  [`| ${head.map(cell).join(' | ')} |`, `|${head.map((_, i) => (i ? ' ---: ' : ' --- ')).join('|')}|`, ...body.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

/** What one side's rounds say of one book. */
function side(all, book) {
  const rows = all.map((r) => r.find((b) => b.book === book)).filter(Boolean);
  if (!rows.length) return undefined;
  const best = rows.map((r) => Math.min(...(r.runs.length > 1 ? r.runs.slice(1) : r.runs)));
  const ms = median(best);
  const stages = {};
  for (const name of Object.keys(rows[0].stages ?? {})) stages[name] = median(rows.map((r) => r.stages?.[name]?.ms ?? 0));
  return {
    ms,
    spread: (Math.max(...best) - Math.min(...best)) / ms,
    first: median(rows.map((r) => r.runs[0])),
    pages: rows[0].pages,
    hashes: [...new Set(rows.map((r) => r.hash))],
    stages,
  };
}

const base = rounds('base');
const head = rounds('head');
const out = [`## ${heading}`, ''];

if (!base.length || !head.length) {
  out.push(`No comparison: ${!head.length ? 'the head' : 'the base commit'} has no rounds in this run.`);
} else {
  const books = head[0].map((b) => b.book).filter((b) => base[0].some((x) => x.book === b));
  const sides = books.map((b) => ({ book: b, a: side(base, b), b: side(head, b) }));
  out.push(`${base.length} rounds of the base and ${head.length} of the head, in turns. Time: the fastest run after a process's first, median of the rounds. A difference in bold is larger than the spread of either side.`, '');
  out.push(
    table(
      ['Book', 'Pages', 'Base ms', 'Head ms', 'Difference', 'Base spread', 'Head spread', 'First run, base → head ms', 'Pages hash'],
      sides.map(({ book, a, b }) => {
        const d = b.ms / a.ms - 1;
        const beyond = Math.abs(d) > Math.max(a.spread, b.spread);
        const same = a.hashes.length === 1 && b.hashes.length === 1 && a.hashes[0] === b.hashes[0];
        return [
          book,
          a.pages === b.pages ? b.pages : `${a.pages} → ${b.pages}`,
          Math.round(a.ms),
          Math.round(b.ms),
          beyond ? `**${pct(d)}**` : pct(d),
          spread(a.spread),
          spread(b.spread),
          `${Math.round(a.first)} → ${Math.round(b.first)}`,
          same ? 'same' : `\`${a.hashes.join(' ')}\` → \`${b.hashes.join(' ')}\``,
        ];
      }),
    ),
  );

  // The stages that weigh at least 1 % of a book on either side, or that
  // only one side reports
  const names = [...new Set(sides.flatMap(({ a, b }) => [...Object.keys(b.stages), ...Object.keys(a.stages)]))];
  const shown = names.filter((n) => sides.some(({ a, b }) => (a.stages[n] ?? 0) >= a.ms / 100 || (b.stages[n] ?? 0) >= b.ms / 100));
  if (shown.length) {
    const ms = (x) => (x === undefined ? '–' : Math.round(x));
    out.push('', `## ${heading}: each stage, base → head ms`, '');
    out.push('The last run of each round, median of the rounds; the stages under 1 % of every book are left out.', '');
    out.push(table(['Stage', ...sides.map((s) => s.book)], shown.map((n) => [n, ...sides.map(({ a, b }) => `${ms(a.stages[n])} → ${ms(b.stages[n])}`)])));
  }
}
process.stdout.write(`${out.join('\n')}\n`);
