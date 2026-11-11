// `postext import-idml`: an InDesign document (IDML) as a new book,
// through the importer of `postext-idml`.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { createBundle } from 'postext/bundle';
import { idmlToPostext, importBundleInput, type IdmlImportResult } from 'postext-idml';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { byteLength, writeOut } from '../io';
import { style } from '../log';
import { firstPageCover } from '../outputs/cover';

const SEVERITY = { info: style.cyan, warning: style.yellow, loss: style.red } as const;

/** The bytes of a linked picture: by its file name in the folders given. */
function linkReader(dirs: readonly string[]): (link: { name: string }) => Uint8Array | undefined {
  return (link) => {
    // A link names a file, never a path of the machine it was made on.
    const name = basename(link.name);
    for (const dir of dirs) {
      const path = join(dir, name);
      if (existsSync(path)) return new Uint8Array(readFileSync(path));
    }
    return undefined;
  };
}

function printReport(ctx: CommandContext, result: IdmlImportResult, full: boolean): void {
  const { reporter } = ctx;
  const { report } = result;
  const c = report.counts;
  reporter.info(`${style.bold('Import')}: ${report.verdict}, as ${result.layout === 'pages' ? 'composed pages' : 'a flowing book'} (${result.reason})`);
  reporter.info(`  ${c.pages} pages, ${c.stories} stories, ${c.paragraphs} paragraphs, ${c.pictures} pictures, ${c.tables} tables, ${c.footnotes} notes, ${c.hyperlinks} links`);
  reporter.info(`  ${c.losses} lost, ${c.warnings} approximated, ${c.info} noted`);
  for (const f of report.findings) {
    if (!full && f.severity === 'info') continue;
    reporter.info(`  ${SEVERITY[f.severity](f.severity.padEnd(7))} ${f.id} ×${f.count}: ${f.message}${f.examples[0] ? style.dim(`  "${f.examples[0]}"`) : ''}`);
  }
  if (full) for (const s of report.styles) reporter.info(`  ${style.dim('style')}   ${s.style} ×${s.paragraphs} → ${s.target} ${style.dim(`(${s.reason})`)}`);
  if (result.fonts.length > 0) reporter.info(`  fonts the book needs: ${result.fonts.map((f) => `${f.family} (${f.styles.map((s) => s.name).join(', ')})`).join('; ')}`);
}

export default async function importIdml(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length !== 1) throw new UsageError('Give one .idml file to import');
  const file = inputs[0]!;
  if (!existsSync(file)) throw new CliError(`No such file: ${file}`);
  const bytes = new Uint8Array(readFileSync(file));
  const layout = opts.choice('layout', ['auto', 'pages', 'flow'] as const) ?? 'auto';
  const conditions = opts.choice('conditions', ['visible', 'all'] as const) ?? 'visible';
  const trackedChanges = opts.choice('changes', ['accept', 'reject'] as const) ?? 'accept';
  const links = opts.string('links');
  if (links && !existsSync(links)) throw new CliError(`No such folder: ${links}`);
  const beside = dirname(file);
  const include = (on: boolean): 'skip' | 'include' => (on ? 'include' : 'skip');
  let result: IdmlImportResult;
  try {
    result = reporter.time('convert', () => idmlToPostext(bytes, {
      layout,
      conditions,
      trackedChanges,
      linkBytes: linkReader([...(links ? [links] : []), beside, join(beside, 'Links')]),
      hiddenLayers: include(opts.flag('hidden') === true),
      hiddenObjects: include(opts.flag('hidden') === true),
      pasteboard: include(opts.flag('pasteboard') === true),
      nonPrinting: include(opts.flag('non-printing') === true),
      masterItems: opts.flag('masters') !== false,
      ...(opts.string('name') ? { name: opts.string('name')! } : {}),
      ...(opts.string('locale') ? { locale: opts.string('locale')! } : {}),
    }));
  } catch (err) {
    throw new CliError(`${file}: ${(err as Error).message}`);
  }
  reporter.data.layout = result.layout;
  reporter.data.reason = result.reason;
  reporter.data.report = result.report;
  reporter.data.fonts = result.fonts;
  reporter.data.missingLinks = result.missingLinks;
  reporter.data.chapters = result.chapters.length;
  if (!reporter.json) printReport(ctx, result, opts.flag('report') === true);
  for (const l of result.missingLinks) reporter.warn({ kind: 'idml.link.missing', severity: 'warning', message: `${l.name}: linked picture not found (used ${l.uses}×); give its folder with --links` });
  const create = (thumbnail?: { data: Uint8Array; mime: string }) => createBundle({ ...importBundleInput(result), mtime: new Date(1980, 0, 1), ...(thumbnail ? { thumbnail } : {}) });
  let created = await create();
  for (const w of created.warnings) reporter.warn({ kind: 'bundle', severity: 'warning', message: w });
  const out = opts.string('out') ?? basename(file, extname(file));
  if (/\.postext$/i.test(out)) {
    // The bundle's cover: its first page (#1210).
    if (opts.flag('auto-thumbnail') !== false) {
      const cover = await firstPageCover(ctx, created.bytes);
      if (cover) created = await create(cover);
    }
    await writeOut(out, created.bytes);
    reporter.output({ kind: 'postext', path: out, bytes: byteLength(created.bytes) });
  } else {
    if (out === '-') throw new UsageError('A book is a folder or a .postext file: give -o a path');
    for (const [path, data] of Object.entries(created.files)) await writeOut(join(out, path), data);
    reporter.output({ kind: 'folder', path: out });
  }
  reporter.info(`${result.chapters.length} chapter${result.chapters.length === 1 ? '' : 's'}, ${result.resources.length} resources`);
}
