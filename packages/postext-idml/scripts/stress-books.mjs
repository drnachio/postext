#!/usr/bin/env node
// Stress the export on whole books: every book of a folder of Postext
// bundles (the showcase books of the web app by default) is written as an
// IDML package by the command line, read back by this package's reader,
// and summed up: pages, spreads, stories, frames, tables, links, pictures,
// what the writer and the reader warned about, time and size.
//
//   node scripts/stress-books.mjs [folder of books] [--only id,id] [--out dir]
//
// Needs the workspace built (`pnpm turbo run build --filter=postext-idml`)
// and Bun for the command line (`packages/postext-cli`).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const only = opt('--only')?.split(',');
const out = resolve(opt('--out') ?? join(tmpdir(), 'postext-idml-stress'));
const books = resolve(args[0] ?? join(root, 'apps/web/public/presets'));
mkdirSync(out, { recursive: true });
const { readIdml, inspectIdml, readingOrder } = await import(join(root, 'packages/postext-idml/dist/index.js'));

const rows = [];
let failed = 0;
for (const id of readdirSync(books).sort()) {
  const dir = join(books, id);
  if (!existsSync(join(dir, 'preset.json')) || (only && !only.includes(id))) continue;
  const file = join(out, `${id}.idml`);
  const row = { book: id };
  const t0 = Date.now();
  try {
    const log = execFileSync('bun', ['src/main.ts', 'idml', dir, '-o', file, '--json'], { cwd: join(root, 'packages/postext-cli'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
    row.seconds = ((Date.now() - t0) / 1000).toFixed(1);
    const json = JSON.parse(log.slice(log.indexOf('{')));
    const kinds = {};
    for (const w of json.warnings ?? []) if (String(w.kind).startsWith('idml.')) kinds[w.kind.slice(5)] = (kinds[w.kind.slice(5)] ?? 0) + 1;
    row.writer = Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(' ') || '-';
    const bytes = new Uint8Array(readFileSync(file));
    row.mb = (statSync(file).size / 1e6).toFixed(1);
    const t1 = Date.now();
    const doc = readIdml(bytes);
    const sum = inspectIdml(doc);
    const order = readingOrder(doc);
    row.read = `${((Date.now() - t1) / 1000).toFixed(1)}s`;
    row.pages = sum.pages;
    row.spreads = doc.spreads.length;
    row.stories = doc.stories.size;
    row.ordered = order.length;
    row.tables = sum.tables ?? 0;
    row.links = doc.hyperlinks.length;
    row.reader = doc.warnings.length ? [...new Set(doc.warnings.map((w) => w.code))].join(' ') : '-';
    if (doc.warnings.length) failed++;
  } catch (e) {
    failed++;
    row.error = String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200);
  }
  rows.push(row);
  console.error(JSON.stringify(row));
}
console.table(rows);
process.exit(failed ? 1 : 0);
