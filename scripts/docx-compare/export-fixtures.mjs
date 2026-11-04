#!/usr/bin/env node
// The reference fixtures of the Word fidelity check (#1399): each book laid
// out once by the CLI, written as the PDF and as the formatted .docx from
// that same layout (`postext build --pdf --docx --docx-variant formatted`),
// and optionally as the semantic .docx too. With --compare, each pair then
// goes through compare.mjs (which needs LibreOffice).
//
//   node scripts/docx-compare/export-fixtures.mjs [--out DIR] [--only a,b]
//        [--semantic] [--compare] [--list]
//
// The CLI runs from its sources under Bun, as its own tests run it, or as
// the executable POSTEXT_BIN names. postext and postext-pdf must be built
// (`pnpm turbo run build --filter=postext --filter=postext-pdf`).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTool, isMain } from './compare.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const PRESETS = join(ROOT, 'apps/web/public/presets');

/**
 * name → the book and the CLI options that pick the part laid out. Long
 * books are cut to a few chapters so a run stays short; `--chapters`
 * restarts the page numbers, the same in the PDF and the .docx.
 */
export const FIXTURES = [
  { name: 'guide', what: 'the built-in guide (English), a designed book with parts, boxes, figures and tables', guide: 'en' },
  { name: 'two-column', what: 'Deep Sky, a two-column book with floats', book: 'deep-sky', args: ['--locale', 'en'] },
  // Bioquímica (Feduchi) is the other column-and-a-half book; its formatted
  // .docx crashes the CLI's SVG rasteriser for now (see README.md).
  { name: 'column-and-a-half', what: 'Física (OpenStax), chapter 1: a column-and-a-half textbook with a side column', book: 'openstax-fisica', args: ['--locale', 'es', '--chapters', '1'] },
  { name: 'footnotes', what: 'Paradise Lost, Book I: verse with footnotes lettered per page', book: 'paradise-lost', args: ['--chapters', '4'] },
  { name: 'rtl', what: 'Alf layla wa-layla, the first nights: Arabic set right to left, right-bound', book: 'alf-layla', args: ['--locale', 'ar', '--chapters', '1-4'] },
  { name: 'vertical-cjk', what: 'Kokoro, the opening chapters: Japanese set vertically with furigana', book: 'kokoro', args: ['--locale', 'ja', '--chapters', '1-3'] },
];

const USAGE = `usage: export-fixtures.mjs [--out DIR] [--only ${FIXTURES.map((f) => f.name).join(',')}] [--semantic] [--compare] [--list]`;

/** The options, or a message (thrown as a string) for wrong usage. */
export function parseArgs(argv) {
  const opts = { out: join(tmpdir(), 'postext-docx-fixtures'), only: null, semantic: false, compare: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // A missing value must not fall back to '' (resolve('') is the current
    // folder, and the fixtures would be written into the checkout).
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === '' || v.startsWith('-')) throw `${a} needs a value`;
      return v;
    };
    if (a === '--out' || a === '-o') opts.out = resolve(value());
    else if (a === '--only') {
      opts.only = new Set(value().split(',').map((s) => s.trim()).filter(Boolean));
      const unknown = [...opts.only].filter((n) => !FIXTURES.some((f) => f.name === n));
      if (unknown.length || !opts.only.size) throw `--only: no fixture ${unknown.join(', ') || '(empty list)'}`;
    } else if (a === '--semantic') opts.semantic = true;
    else if (a === '--compare') opts.compare = true;
    else if (a === '--list') opts.list = true;
    else throw `unknown argument ${a}`;
  }
  return opts;
}

function cli() {
  if (process.env.POSTEXT_BIN) return [resolve(process.env.POSTEXT_BIN)];
  const bun = findTool(['bun']) ?? (existsSync(join(process.env.HOME ?? '', '.bun/bin/bun')) ? join(process.env.HOME, '.bun/bin/bun') : null);
  if (!bun) {
    console.error('export-fixtures: the CLI runs under Bun (https://bun.sh); install it or set POSTEXT_BIN to a built postext executable');
    process.exit(2);
  }
  return [bun, join(ROOT, 'packages/postext-cli/src/main.ts')];
}

function run(cmd, label) {
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', cwd: ROOT, env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(`export-fixtures: ${label} failed (${r.status ?? r.error?.message})\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-15).join('\n')}`);
    return false;
  }
  return true;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (typeof e !== 'string') throw e;
    console.error(`export-fixtures: ${e}\n${USAGE}`);
    process.exit(2);
  }
  if (opts.list) {
    for (const f of FIXTURES) console.log(`${f.name.padEnd(18)} ${f.what}`);
    return;
  }
  if (!existsSync(join(ROOT, 'packages/postext/dist/index.js')) || !existsSync(join(ROOT, 'packages/postext-pdf/dist'))) {
    console.error('export-fixtures: build postext and postext-pdf first: pnpm turbo run build --filter=postext --filter=postext-pdf');
    process.exit(2);
  }
  mkdirSync(opts.out, { recursive: true });
  const postext = cli();
  const done = [];
  const failedNames = new Set();
  let failed = 0;
  for (const f of FIXTURES) {
    if (opts.only && !opts.only.has(f.name)) continue;
    let input;
    if (f.guide) {
      input = join(opts.out, `${f.name}.postext`);
      const bun = /^bun(\.exe)?$/i.test(basename(postext[0])) ? postext[0] : findTool(['bun', 'bun.exe']);
      if (!bun || !run([bun, join(HERE, 'guide-bundle.ts'), f.guide, input], `${f.name}: packing the guide`)) {
        if (!bun) console.error(`export-fixtures: ${f.name}: packing the guide needs Bun`);
        failedNames.add(f.name);
        failed++;
        continue;
      }
    } else input = join(PRESETS, f.book);
    const pdf = join(opts.out, `${f.name}.pdf`);
    const docx = join(opts.out, `${f.name}.docx`);
    const semantic = join(opts.out, `${f.name}.semantic.docx`);
    // Files of an earlier run must not pass for this one when a build fails
    // half way (the CLI may write the PDF and then stop on the .docx).
    for (const p of [pdf, docx, semantic]) rmSync(p, { force: true });
    const started = Date.now();
    const args = ['build', input, ...(f.args ?? []), '--pdf', pdf, '--docx', docx, '--docx-variant', 'formatted', '--quiet'];
    if (!run([...postext, ...args], `${f.name}: postext build`) || !existsSync(pdf) || !existsSync(docx)) {
      if (existsSync(pdf) !== existsSync(docx)) console.error(`export-fixtures: ${f.name}: the build wrote ${existsSync(pdf) ? 'no .docx' : 'no PDF'}`);
      failedNames.add(f.name);
      failed++;
      continue;
    }
    const entry = { name: f.name, what: f.what, input, args: f.args ?? [], pdf, docx };
    if (opts.semantic) {
      if (run([...postext, 'docx', input, ...(f.args ?? []), '-o', semantic, '--quiet'], `${f.name}: postext docx`)) entry.semantic = semantic;
    }
    console.log(`${f.name}: ${pdf} + ${docx}${entry.semantic ? ` + ${entry.semantic}` : ''} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    if (opts.compare) {
      const r = spawnSync(process.execPath, [join(HERE, 'compare.mjs'), docx, pdf, '--out', join(opts.out, `${f.name}-compare`), '--sheets'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.status === 3) {
        console.error(r.stderr.trim());
        opts.compare = false;
      } else {
        process.stdout.write(r.stdout.replace(/^/gm, '  '));
        if (r.status === 2) console.error(r.stderr.trim());
        entry.compare = { exit: r.status, report: join(opts.out, `${f.name}-compare`, 'report.json') };
      }
    }
    done.push(entry);
  }
  // A partial run (--only) keeps the other fixtures already listed; one
  // that failed now is dropped, its files are gone.
  const listPath = join(opts.out, 'fixtures.json');
  let listed = [];
  try {
    listed = JSON.parse(readFileSync(listPath, 'utf8')).fixtures ?? [];
  } catch {
    // none yet
  }
  const fixtures = [...listed.filter((e) => !failedNames.has(e.name) && !done.some((d) => d.name === e.name)), ...done].sort((a, b) => FIXTURES.findIndex((f) => f.name === a.name) - FIXTURES.findIndex((f) => f.name === b.name));
  writeFileSync(listPath, JSON.stringify({ updated: new Date().toISOString(), fixtures }, null, 2));
  console.log(`export-fixtures: ${done.length} fixture(s) in ${opts.out}${failed ? `, ${failed} failed` : ''}`);
  process.exit(failed ? 1 : 0);
}

if (isMain(import.meta.url)) main();
