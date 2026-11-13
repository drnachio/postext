// `postext import-idml`: an InDesign document (IDML) as a new book,
// through the importer of `postext-idml`. The document is a bare `.idml`,
// or one inside a zipped InDesign package (File › Package, zipped), whose
// linked pictures and font files the book then takes (#1539).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { createBundle } from 'postext/bundle';
import { idmlToPostext, importBundleInput, openIdmlArchive, readFontFace, readIdml, splitFontCollection, type IdmlArchive, type IdmlDocument, type IdmlFontFile, type IdmlImportResult } from 'postext-idml';
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

/** The document to import: the file itself, or the IDML of the zipped
 *  package it is, with the package. */
interface Source {
  bytes: Uint8Array;
  archive?: IdmlArchive;
  /** The document's path inside the package. */
  path?: string;
}

/** Open `file` as the Sandbox does: a zip that is no IDML itself is a
 *  zipped InDesign package, whose IDML `wanted` names (needed only when it
 *  holds several). Anything else goes to the reader, which says what it is. */
function openSource(file: string, bytes: Uint8Array, wanted: string | undefined): Source {
  const zip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  let archive: IdmlArchive | undefined;
  if (zip) {
    try {
      archive = openIdmlArchive(bytes);
    } catch {
      // The reader's own words about it come next.
    }
  }
  if (!archive || archive.documents.includes('')) {
    if (wanted !== undefined) throw new UsageError(`--document names an IDML inside a zipped InDesign package; ${file} is no such package`);
    return { bytes };
  }
  const { documents, indd } = archive;
  if (documents.length === 0) throw new CliError(`${file} holds no IDML document${indd.length > 0 ? ` (only ${indd.join(', ')})` : ''}: in InDesign, tick Include IDML in File › Package, or save the document as IDML (File › Export)`);
  const path = wanted ?? (documents.length === 1 ? documents[0]! : undefined);
  const list = documents.map((d) => `\n  ${d}`).join('');
  if (path === undefined) throw new UsageError(`${file} holds ${documents.length} IDML documents; name the one to import with --document:${list}`);
  if (!documents.includes(path)) throw new UsageError(`${file} has no IDML document "${path}"; it holds:${list}`);
  return { bytes: archive.document(path), archive, path };
}

const norm = (s: string | undefined): string => (s ?? '').normalize('NFC').toLowerCase().replace(/[\s_-]+/g, '');

/** The font files of the folders given with --font-dir whose family the
 *  document sets text in. They go before the package's, so a face found
 *  there is the one the book carries. */
function userFontFiles(dirs: readonly string[], doc: IdmlDocument): IdmlFontFile[] {
  const families = new Set(doc.fonts.map((f) => norm(f.family)));
  const out: IdmlFontFile[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(otf|ttf|woff2|ttc|otc)$/i.test(name)) continue;
      const bytes = new Uint8Array(readFileSync(path));
      // A collection (#1558) goes in whole when one of its faces is of a
      // family the document names: the importer splits it and keeps the
      // faces the text is set in.
      const split = splitFontCollection(bytes);
      if (split) {
        const named = split.some((part) => {
          const face = part.bytes && readFontFace('', part.bytes);
          return !!face && !('unusable' in face) && (families.has(norm(face.family)) || families.has(norm(face.legacyFamily)));
        });
        if (named) out.push({ name, bytes });
        continue;
      }
      const face = readFontFace(name, bytes);
      if ('unusable' in face) continue;
      // A WOFF2 file's names are compressed: its file name (`Lora-Bold`) stands for them.
      const stem = norm(basename(name, extname(name)));
      const ours = face.format === 'woff2' ? [...families].some((f) => f && stem.startsWith(f)) : families.has(norm(face.family)) || families.has(norm(face.legacyFamily));
      if (ours) out.push({ name, bytes });
    }
  };
  for (const dir of dirs) if (existsSync(dir)) walk(dir);
  return out;
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
  if (inputs.length !== 1) throw new UsageError('Give one .idml file, or one zipped InDesign package, to import');
  const file = inputs[0]!;
  if (!existsSync(file)) throw new CliError(`No such file: ${file}`);
  const source = openSource(file, new Uint8Array(readFileSync(file)), opts.string('document'));
  const layout = opts.choice('layout', ['auto', 'pages', 'flow'] as const) ?? 'auto';
  const conditions = opts.choice('conditions', ['visible', 'all'] as const) ?? 'visible';
  const trackedChanges = opts.choice('changes', ['accept', 'reject'] as const) ?? 'accept';
  const links = opts.string('links');
  if (links && !existsSync(links)) throw new CliError(`No such folder: ${links}`);
  const beside = dirname(file);
  const include = (on: boolean): 'skip' | 'include' => (on ? 'include' : 'skip');
  // A link takes the file of --links first, then the package's, then the
  // one beside the file.
  const given = linkReader(links ? [links] : []);
  const besideFile = linkReader([beside, join(beside, 'Links')]);
  const { archive, path } = source;
  const fromPackage = new Set<string>();
  const linkBytes = (link: { name: string; uri?: string }): Uint8Array | undefined => {
    const bytes = given(link);
    if (bytes || !archive) return bytes ?? besideFile(link);
    const found = archive.linkBytes(link, path);
    if (found) fromPackage.add(link.name);
    return found ?? besideFile(link);
  };
  let result: IdmlImportResult;
  let packageFonts = 0;
  try {
    const doc = readIdml(source.bytes);
    // The package's fonts go into the book, after the faces of --font-dir.
    let fontFiles: IdmlFontFile[] | undefined;
    if (archive) {
      const own = archive.fontFiles();
      packageFonts = own.length;
      fontFiles = [...userFontFiles(opts.list('font-dir'), doc), ...own];
    }
    result = reporter.time('convert', () => idmlToPostext(doc, {
      layout,
      conditions,
      trackedChanges,
      linkBytes,
      ...(fontFiles?.length ? { fontFiles } : {}),
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
  if (archive) {
    reporter.data.package = { document: path, documents: archive.documents, links: [...fromPackage], fonts: packageFonts, carriedFonts: (result.config.customFonts ?? []).map((f) => f.name) };
    if (!reporter.json) reporter.info(`${style.bold('Package')}: ${path}, ${fromPackage.size} linked picture${fromPackage.size === 1 ? '' : 's'} and ${packageFonts} font file${packageFonts === 1 ? '' : 's'} in it`);
  }
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
