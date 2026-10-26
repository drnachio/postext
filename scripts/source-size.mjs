#!/usr/bin/env node
// Source size: which files and directories have grown past the size people
// and agents can move around in comfortably (#1276).
//
//   node scripts/source-size.mjs [--lines N] [--files N] [--all] [--json <file>] [--check] [--update]
//
// Walks the tracked TypeScript and JavaScript sources of apps/ and packages/
// (git ls-files), leaving out tests, benches, generated files, declaration
// files, locale and label tables and the bundled public presets. Reports
// every file longer than --lines (600 by default) and every directory with
// more than --files (25 by default) source files of its own. --all lists
// every file with its length instead.
//
// The files and directories still over the limits are listed, with their
// size, in scripts/source-size.baseline.json. --check fails (exit 1) when a
// file or directory not in the baseline goes over a limit, or one in it
// grows; the ones in it are reported as warnings. --update rewrites the
// baseline from the tree as it is: run it after splitting a listed file,
// never to let one grow.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE = join(ROOT, 'scripts/source-size.baseline.json');
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
  .filter((p) => SOURCE.test(p) && !EXEMPT.some((re) => re.test(p)) && existsSync(join(ROOT, p)));

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

if (args.includes('--update')) {
  const baseline = {
    $comment: 'Files and directories still over the limits of scripts/source-size.mjs (#1276), with their size. CI fails when one grows or a new one appears; shrink this list, never grow it.',
    files: Object.fromEntries(long.map((f) => [f.path, f.lines])),
    dirs: Object.fromEntries(crowded),
  };
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 1) + '\n');
  console.log(`baseline: ${long.length} files, ${crowded.length} directories`);
} else if (args.includes('--all')) {
  for (const f of sized) console.log(`${String(f.lines).padStart(6)}  ${f.path}`);
} else if (args.includes('--check')) {
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { files: {}, dirs: {} };
  let failures = 0;
  for (const f of long) {
    const was = baseline.files[f.path];
    if (was === undefined) { console.log(`::error file=${f.path}::${f.lines} lines, over the ${maxLines}-line limit: split it (see CONTRIBUTING.md, Code Layout)`); failures++; }
    else if (f.lines > was) { console.log(`::error file=${f.path}::grew from ${was} to ${f.lines} lines; it is already over the ${maxLines}-line limit`); failures++; }
    else console.log(`::warning file=${f.path}::${f.lines} lines (target ${maxLines})`);
  }
  for (const [dir, n] of crowded) {
    const was = baseline.dirs[dir];
    if (was === undefined) { console.log(`::error::${dir}: ${n} source files, over the ${maxFiles}-file limit: group them into folders`); failures++; }
    else if (n > was) { console.log(`::error::${dir}: grew from ${was} to ${n} source files; it is already over the ${maxFiles}-file limit`); failures++; }
    else console.log(`::warning::${dir}: ${n} source files (target ${maxFiles})`);
  }
  const fixed = Object.keys(baseline.files).filter((p) => !long.some((f) => f.path === p)).length
    + Object.keys(baseline.dirs).filter((d) => !crowded.some(([c]) => c === d)).length;
  if (fixed) console.log(`${fixed} baseline entries are no longer over a limit: run node scripts/source-size.mjs --update`);
  console.log(`${long.length} files over ${maxLines} lines, ${crowded.length} directories over ${maxFiles} files, ${failures} new or grown`);
  if (failures) process.exit(1);
} else {
  console.log(`Files over ${maxLines} lines (${long.length} of ${sized.length}):`);
  for (const f of long) console.log(`${String(f.lines).padStart(6)}  ${f.path}`);
  console.log(`\nDirectories over ${maxFiles} source files (${crowded.length}):`);
  for (const [dir, n] of crowded) console.log(`${String(n).padStart(6)}  ${dir}`);
}
