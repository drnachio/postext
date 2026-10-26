#!/usr/bin/env node
// Source size: which files and directories have grown past the size people
// and agents can move around in comfortably (#1276).
//
//   node scripts/source-size.mjs [--lines N] [--files N] [--all] [--json <file>] [--check]
//
// Walks the tracked TypeScript and JavaScript sources of apps/ and packages/
// (git ls-files), leaving out tests, benches, generated files, declaration
// files, locale and label tables and the bundled public presets. Reports
// every file longer than --lines (600 by default) and every directory with
// more than --files (25 by default) source files of its own. --all lists
// every file with its length instead.
//
// --check prints the same report as GitHub warnings and still exits 0: the
// limits are a target the refactor works toward, not yet a gate.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const maxLines = Number(opt('--lines', 600));
const maxFiles = Number(opt('--files', 25));

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/;
const EXEMPT = [
  /(^|\/)(node_modules|dist|public)\//,
  /(^|\/)(__tests__|__bench__|__fixtures__|fixtures)\//,
  /\.(test|spec|bench)\.[^/]+$/,
  /\.d\.ts$/,
  /\.generated\./,
  // Tables of strings: one entry per label or locale, long by nature.
  /(^|\/)labels\.ts$/,
  /(^|\/)defaultLabels\.ts$/,
  /(^|\/)messages\//,
  /(^|\/)locales?\//,
];

const files = execFileSync('git', ['ls-files', 'apps', 'packages'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((p) => SOURCE.test(p) && !EXEMPT.some((re) => re.test(p)));

const sized = files.map((path) => {
  const text = readFileSync(join(ROOT, path), 'utf8');
  return { path, lines: text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0) };
});
sized.sort((a, b) => b.lines - a.lines);

const perDir = new Map();
for (const { path } of sized) perDir.set(dirname(path), (perDir.get(dirname(path)) ?? 0) + 1);
const crowded = [...perDir].filter(([, n]) => n > maxFiles).sort((a, b) => b[1] - a[1]);
const long = sized.filter((f) => f.lines > maxLines);

if (args.includes('--json')) {
  writeFileSync(opt('--json'), JSON.stringify({ maxLines, maxFiles, long, crowded: crowded.map(([dir, files]) => ({ dir, files })) }, null, 2) + '\n');
}

if (args.includes('--all')) {
  for (const f of sized) console.log(`${String(f.lines).padStart(6)}  ${f.path}`);
} else if (args.includes('--check')) {
  for (const f of long) console.log(`::warning file=${f.path}::${f.lines} lines (target ${maxLines})`);
  for (const [dir, n] of crowded) console.log(`::warning::${dir}: ${n} source files (target ${maxFiles})`);
  console.log(`${long.length} files over ${maxLines} lines, ${crowded.length} directories over ${maxFiles} files`);
} else {
  console.log(`Files over ${maxLines} lines (${long.length} of ${sized.length}):`);
  for (const f of long) console.log(`${String(f.lines).padStart(6)}  ${f.path}`);
  console.log(`\nDirectories over ${maxFiles} source files (${crowded.length}):`);
  for (const [dir, n] of crowded) console.log(`${String(n).padStart(6)}  ${dir}`);
}
