// The Layout timing workflow's report (#1603): the JSON that
// packages/postext-cli/scripts/bench-layout.ts writes with --stages --json,
// as two Markdown tables: the books, and the share of each stage in each.
//
//   node .github/scripts/layout-timing.mjs layout-timing.json [heading]

import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cell = (s) => String(s).replaceAll('|', '\\|');
const table = (head, body) =>
  [`| ${head.map(cell).join(' | ')} |`, `|${head.map((_, i) => (i ? ' ---: ' : ' --- ')).join('|')}|`, ...body.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

const heading = process.argv[3] ?? 'Whole book, cold';
const out = [`## ${heading}`, ''];
out.push(
  table(
    ['Book', 'Pages', 'Chapters', 'Median ms', 'ms/page', 'Runs ms', 'CPU ms', 'RSS MB', 'Hash'],
    rows.map((r) => [r.book, r.pages, r.chapters, r.medianMs, r.msPerPage, r.runs.join(' '), r.cpuRuns.join(' '), r.rssMB, `\`${r.hash}\``]),
  ),
);

const staged = rows.filter((r) => r.stages);
if (staged.length) {
  const stages = Object.keys(staged[0].stages);
  out.push('', `## ${heading}: share of each stage, % of the last run`, '');
  out.push(table(['Stage', ...staged.map((r) => r.book)], stages.map((s) => [s, ...staged.map((r) => r.stages[s]?.pct ?? '')])));
}
process.stdout.write(`${out.join('\n')}\n`);
