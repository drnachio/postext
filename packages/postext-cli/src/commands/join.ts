import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inspectBundleJoin, joinBundleFiles, openBundleZip, zipBundle, type BundleJoinInspection, type PartChoice, type PartProblem } from 'postext/bundle';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { isProjectOnlyFile, readTree } from '../input';
import { byteLength, writeAtomic, writeOut } from '../io';
import { style } from '../log';

/** A book's files: a folder with preset.json (its project-only files left
 *  out) or a .postext. */
function readBook(path: string, what: string): { files: Map<string, Uint8Array>; kind: 'folder' | 'bundle'; rootPrefix: string } {
  if (!existsSync(path)) throw new CliError(`No such file or folder: ${path}`);
  if (statSync(path).isDirectory()) {
    const files = new Map([...readTree(path)].filter(([rel]) => !isProjectOnlyFile(rel)));
    if (!files.has('preset.json')) throw new CliError(`${path} has no preset.json: give a book folder or a .postext as the ${what}`);
    return { files, kind: 'folder', rootPrefix: '' };
  }
  try {
    const zip = openBundleZip(new Uint8Array(readFileSync(path)));
    return { files: new Map(zip.files), kind: 'bundle', rootPrefix: zip.rootPrefix };
  } catch (err) {
    throw new CliError(`${path}: ${(err as Error).message}`);
  }
}

/** `--chapters "replace,add:5,skip"`: one entry per chapter of the part,
 *  in its order; a number after the action moves the chapter there. */
export function parseJoinChapters(spec: string, own: readonly (number | null)[]): PartChoice[] {
  const entries = spec.split(',').map((s) => s.trim());
  if (entries.length !== own.length) throw new UsageError(`--chapters needs one entry per chapter of the part (it has ${own.length}): add, add:N, replace, replace:N or skip`);
  return entries.map((entry, i) => {
    const m = /^(add|replace|skip)(?::(\d+))?$/.exec(entry);
    if (!m) throw new UsageError(`--chapters: "${entry}" is not add, add:N, replace, replace:N or skip`);
    const number = m[2] !== undefined ? Number(m[2]) : own[i] ?? 0;
    return { action: m[1] as PartChoice['action'], number };
  });
}

/** `--rename fig-1-1=fig-9-1` (repeatable). */
export function parseJoinRenames(list: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list) {
    const at = item.indexOf('=');
    if (at <= 0 || at === item.length - 1) throw new UsageError(`--rename: "${item}" is not OLD=NEW`);
    out[item.slice(0, at).trim()] = item.slice(at + 1).trim();
  }
  return out;
}

const PROBLEMS: Record<PartProblem, string> = {
  noSuchChapter: 'the book has no chapter with that number to replace',
  sameNumber: 'the number is taken (by the book or another chapter of the part): replace that chapter, or choose another number',
  badNumber: 'the number must be 1 or more',
  unnumbered: 'it has no numbered heading, so the chapters after the one it replaces would lose a number: add it instead',
};

function printPlan(seen: BundleJoinInspection, info: (line: string) => void): void {
  info(style.bold('Book') + style.dim(` (${seen.locale})`));
  for (const c of seen.book) info(`  ${c.number === null ? style.dim(' –') : String(c.number).padStart(2)}  ${c.title}  ${style.dim(c.file)}`);
  info(style.bold('Part'));
  seen.part.forEach((c, i) => {
    const choice = seen.choices[i]!;
    const at = seen.replaces[i]!;
    const what = choice.action === 'skip' ? style.dim('left out')
      : choice.action === 'replace' ? `replaces ${at >= 0 ? `"${seen.book[at]!.title}"` : `chapter ${choice.number}`}`
        : `added as chapter ${choice.number}`;
    info(`  ${c.number === null ? style.dim(' –') : String(c.number).padStart(2)}  ${c.title}: ${what}`);
  });
  for (const c of seen.clashes) info(`  ${style.yellow('rename')} ${c.id} → ${c.rename} ${style.dim('(the book keeps using its own)')}`);
}

/** `postext join <book> <part>`: the chapters of another book (a part of
 *  this one made apart) joined to it, each at its number (#1727). */
export default async function joinCommand(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length !== 2) throw new UsageError('Give the book (folder or .postext) and the .postext whose chapters join it');
  const [bookPath, partPath] = inputs as [string, string];
  const book = readBook(bookPath, 'book');
  const part = readBook(partPath, 'part');
  const locale = opts.string('locale');
  const renames = parseJoinRenames(opts.list('rename'));
  const proposed = await inspectBundleJoin(book.files, part.files, { ...(locale ? { locale } : {}) });
  const spec = opts.string('chapters');
  const choices = spec ? parseJoinChapters(spec, proposed.part.map((c) => c.number)) : proposed.choices;
  const seen = await inspectBundleJoin(book.files, part.files, { ...(locale ? { locale } : {}), choices, renames });
  seen.clashes = seen.clashes.map((c) => ({ id: c.id, rename: renames[c.id] ?? c.rename }));
  reporter.data.join = seen;
  printPlan(seen, (line) => reporter.info(line));

  if (seen.problems.length > 0) {
    throw new CliError(`The choices do not fit the book:\n${seen.problems.map((p) => `  chapter ${p.chapter + 1} of the part ("${seen.part[p.chapter]!.title}"): ${PROBLEMS[p.problem]}`).join('\n')}\nChoose with --chapters, e.g. --chapters "${seen.part.map(() => 'add').join(',')}"`);
  }
  if (seen.badNames.length > 0) throw new CliError(`These resources cannot take the names given (an id of letters, digits, _ . : -, free in the book and the part): ${seen.badNames.join(', ')}`);
  if (seen.choices.every((c) => c.action === 'skip')) throw new CliError('No chapter of the part is chosen to join the book');
  if (opts.flag('dry-run')) {
    reporter.info('dry run: nothing was written');
    return;
  }

  const joined = await joinBundleFiles(book.files, part.files, { ...(locale ? { locale } : {}), choices, renames });
  reporter.data.added = joined.added;
  reporter.data.replaced = joined.replaced;
  reporter.data.resources = joined.resources;
  reporter.data.renamed = joined.renamed;
  reporter.data.fontsAdded = joined.fontsAdded;
  reporter.data.written = joined.written;
  const out = opts.string('out');
  if (out && /\.postext$/i.test(out) || (!out && book.kind === 'bundle')) {
    const target = out ?? bookPath;
    const prefix = out ? '' : book.rootPrefix;
    const bytes = zipBundle(Object.fromEntries([...joined.files].map(([p, b]) => [prefix + p, b])), { mtime: new Date(1980, 0, 1) });
    if (out) await writeOut(target, bytes);
    else writeAtomic(target, bytes);
    reporter.output({ kind: 'postext', path: target, bytes: byteLength(bytes) });
  } else if (out) {
    for (const [path, bytes] of joined.files) await writeOut(join(out, path), bytes);
    reporter.output({ kind: 'folder', path: out });
  } else {
    // The book folder itself: only the files the join wrote.
    for (const path of joined.written) writeAtomic(join(bookPath, path), joined.files.get(path)!);
    reporter.output({ kind: 'folder', path: bookPath });
  }
  const say = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
  reporter.info(`${say(joined.added.length, 'chapter')} added, ${joined.replaced.length} replaced, ${say(joined.resources.length, 'resource')}${joined.renamed.length ? ` (${joined.renamed.map((r) => `${r.from} → ${r.to}`).join(', ')})` : ''}${joined.fontsAdded.length ? `, fonts added: ${joined.fontsAdded.join(', ')}` : ''}`);
}
