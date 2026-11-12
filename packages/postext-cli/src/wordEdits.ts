// The corrections made in Word to a file `postext docx` exported (#1396):
// `applyDocxEdits` merges them into the book as it stands now, and they
// are written to the project's own files: the chapter files, and the
// resource entries of preset.json (or of resources.json beside loose
// Markdown). A packed book is written again with the files changed.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Resource } from 'postext';
import { MANIFEST_FILE, openBundleZip, pickLocaleOverrides, zipBundle, type BundleLocaleOverrides, type BundleManifest, type BundleResourceSpec } from 'postext/bundle';
import { applyDocxEdits, rebuildExportMap, type DocxEdit, type DocxEditResult, type DocxImportNote, type RebuiltMap } from 'postext/word';
import { CliError, type Options } from './args';
import { inputKind, loadBook, type Book, type BookChapter } from './input';
import { writeStdout } from './io';
import { sourceAt } from './layout';
import { style, type Reporter } from './log';
import { chapterIds, resourceBytes, svgPicture, wordChapters } from './outputs/docx';
import { unifiedDiff } from './unifiedDiff';

/** One file the edits change: its path inside the project (shown in the
 *  diff) and its text before and after. */
interface FileChange {
  path: string;
  before: string;
  after: string;
}

const BOM = '﻿';
const RESOURCE_FIELDS = ['caption', 'note', 'altText'] as const;

type Spec = Partial<BundleResourceSpec> & { id: string };
type CellRows = { content?: unknown }[][];

/** A deep copy of a JSON value. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The resource fields an edit changed, written onto the spec that gives
 * them. An edition with its own wording (`localized.<lang>`, a language
 * other than the book's own) takes every edit made in it: a caption
 * corrected in the Spanish file must not reword the English book. The
 * book's own language writes onto the shared spec (`ownLanguage`: the
 * edition is the block the manifest keeps for its own language, which
 * takes an edit only to a field it already rewords).
 */
export function updateSpec(specs: Spec[], edition: BundleLocaleOverrides | undefined, before: Resource, after: Resource, ownLanguage = false): boolean {
  const own = specs.find((s) => s.id === after.id);
  let local = (edition?.resources as Spec[] | undefined)?.find((s) => s.id === after.id);
  if (!own && !local) return false;
  const editionSpec = (): Spec => {
    if (!local) {
      local = { id: after.id };
      edition!.resources = [...(edition!.resources ?? []), local as BundleResourceSpec];
    }
    return local;
  };
  const shared = (field: string): boolean => ownLanguage && !!own && !(local && field in local);
  const target = (field: string): Record<string, unknown> => (shared(field) ? own! : edition || !own ? editionSpec() : own) as Record<string, unknown>;
  let changed = false;
  for (const f of RESOURCE_FIELDS) {
    if (after[f] === before[f]) continue;
    target(f)[f] = after[f];
    changed = true;
  }
  const rowsAfter = after.table?.model.rows as CellRows | undefined;
  const rowsBefore = before.table?.model.rows as CellRows | undefined;
  if (rowsAfter && rowsBefore) {
    const edits: [number, number, unknown][] = [];
    rowsAfter.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.content !== rowsBefore[r]?.[c]?.content) edits.push([r, c, cell.content]);
    }));
    if (edits.length > 0) {
      // The table the edition shows: its own, else a copy of the shared
      // one it then keeps.
      const t = target('table') as Spec;
      if (!t.table && t !== own && own?.table) t.table = copy(own.table);
      const rows = t.table?.model?.rows as CellRows | undefined;
      for (const [r, c, content] of edits) {
        const into = rows?.[r]?.[c];
        if (into) {
          into.content = content;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** JSON written back with the indentation it was read with. */
function jsonLike(original: string, value: unknown): string {
  const indent = /\n([ \t]+)"/.exec(original)?.[1] ?? '  ';
  return JSON.stringify(value, null, indent) + (original.endsWith('\n') ? '\n' : '');
}

/** The resource entries the edits changed, as the file that declares
 *  them: preset.json of a folder or a packed book, resources.json of loose
 *  Markdown's pictures folder. */
function resourceChange(book: Book, result: DocxEditResult, opts: Options, readText: (path: string) => string | undefined, reporter: Reporter): FileChange | undefined {
  if (!result.resources) return undefined;
  const changed = result.resources.filter((r) => {
    const was = book.resources.find((b) => b.id === r.id);
    return was && JSON.stringify(was) !== JSON.stringify(r);
  });
  if (changed.length === 0) return undefined;
  const loose = book.kind === 'markdown';
  const dir = opts.string('resources');
  const path = loose ? (dir ? join(dir, 'resources.json') : undefined) : MANIFEST_FILE;
  const text = path ? readText(path) : undefined;
  if (!path || text === undefined) {
    reporter.warn({ kind: 'docx.resourcesNotStored', severity: 'warning', message: `${changed.map((r) => r.id).join(', ')}: loose Markdown keeps its resources' wording in resources.json (--resources DIR); the edits to it were not written` });
    return undefined;
  }
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new CliError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  const specs = (loose ? data : (data as BundleManifest).resources ?? []) as Spec[];
  const edition = loose ? undefined : pickLocaleOverrides(data as BundleManifest, book.locale) ?? undefined;
  // The block a manifest keeps for its own language rewords the config;
  // a caption corrected in that language belongs to the shared resource.
  const own = (data as BundleManifest).locale;
  const ownLanguage = !loose && !!own && own.toLowerCase() === book.locale.toLowerCase();
  let any = false;
  for (const r of changed) any = updateSpec(specs, edition, book.resources.find((b) => b.id === r.id)!, r, ownLanguage) || any;
  return any ? { path, before: text, after: jsonLike(text, data) } : undefined;
}

/** Where an edit is: `chapters/02.md:14`, or a resource's field. */
function editPlace(edit: DocxEdit | { chapter?: string; resourceId?: string; field?: string; start: number }, chapters: Map<string, BookChapter>): string {
  if (edit.resourceId) return `resource ${edit.resourceId}${'field' in edit && edit.field ? ` ${edit.field}` : ''}`;
  const chapter = edit.chapter !== undefined ? chapters.get(edit.chapter) : undefined;
  return sourceAt(chapter, edit.start) ?? (edit.chapter ?? 'generated text');
}

/** `data` into `path` through a file beside it renamed over it, so a
 *  write cut short never leaves a chapter or a packed book half written. */
function writeAtomic(path: string, data: Uint8Array | string): void {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temp, data);
    renameSync(temp, path);
  } catch (err) {
    rmSync(temp, { force: true });
    throw new CliError(`${path}: could not be written (${(err as Error).message})`);
  }
}

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
};

const REASONS: Record<string, string> = {
  generated: 'generated text (numbers, labels) is written by postext',
  'bookmarks-lost': 'the file lost the bookmarks that place its text',
  'resource-removed': 'a figure or table deleted in Word stays in the book (delete its reference in the Markdown)',
  'changed-since-export': 'the text was changed in the book since the export',
  'target-missing': 'the book no longer has this chapter or resource',
  'no-snapshot': 'the file carries no copy of the exported text to merge against',
  overlap: 'overlaps another edit',
  'format-crosses-markup': 'the formatting crosses Markdown markup',
  'format-partial': 'the formatting covers only part of a marked span',
  moved: 'a paragraph moved in Word stays where it is in the book (move it in the Markdown)',
  'table-row': 'a row or a line added to a table in Word does not come into the book (add it to the table in the book)',
  'bookmark-unpaired': 'its bookmark is gone and none of the text that stands around its place could be told to be its own: read as deleted, and that text as added',
  'bookmark-placed': 'its bookmark is gone: read from the text most like it among the text that stands in its place, the rest as added',
  citation: 'citation text is written from the bibliography (change the reference, or the citation, in the book)',
  'citation-part': 'printed otherwise than it is written in the book: change it in the book',
};

/** What an edit changed, in words a reader can follow: a paragraph mark
 *  added or taken out is named, since its text is only white space. */
function editWhat(e: { before: string; after: string; kind: string; citation?: string; citationPart?: string }): string {
  // An edit inside a printed citation names the citation and the part of
  // it the author wrote (#1516).
  if (e.citation !== undefined) return `citation ${e.citation}: ${e.citationPart ? `${e.citationPart} ` : ''}"${clip(e.before)}" → "${clip(e.after)}"`;
  const before = clip(e.before);
  const after = clip(e.after);
  if (!before && !after) {
    if (/\n/.test(e.after) && !/\n/.test(e.before)) return 'paragraph break added';
    if (/\n/.test(e.before) && !/\n/.test(e.after)) return 'paragraphs joined';
    return e.before.length > e.after.length ? 'white space removed' : 'white space added';
  }
  return before && after ? `"${before}" → "${after}"` : after ? `+ "${after}"` : `- "${before}"`;
}

/** The passages a changed book leaves out of the comparison, in words. */
function leftAlone(note: DocxImportNote): string {
  const n = (count: number) => `${count} ${count === 1 ? 'passage' : 'passages'}`;
  const left = [
    note.unplaced ? `${n(note.unplaced)} of the book not found in the file` : '',
    note.foreign ? `${n(note.foreign)} of the file no longer in the book` : '',
  ].filter(Boolean).join(', ');
  return left ? `; left alone: ${left}` : '';
}

/** What the import says about the file as a whole, in words. */
function noteText(note: DocxImportNote, file: string): { severity: 'info' | 'warning'; message: string } {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  switch (note.code) {
    case 'map-rebuilt':
      return { severity: 'info', message: `${file} came back without its export map (Google Docs leaves it out): the map was written again from the book` };
    case 'book-changed': {
      const where = note.chapters?.length ? ` (${note.chapters.join(', ')})` : '';
      const what = note.unverified
        ? `the book, or the version of postext that writes it, changed since ${file} was exported`
        : note.chapters?.length ? `the book changed since ${file} was exported${where}` : `the book's settings or resources changed since ${file} was exported`;
      return { severity: 'warning', message: `${what}, and the file carries no copy of the text it was exported with: it was compared with the book as it is now, so a change made in the book since then may show below as an edit that undoes it${leftAlone(note)}` };
    }
    case 'book-unverified':
      return { severity: 'info', message: `${file} does not say what the book was like when it was exported: if the book changed since, those changes may show below as edits that undo them` };
    case 'writer-changed':
      return { severity: 'warning', message: `${file} was written by another version of postext: its text was matched with the book's passage by passage${leftAlone(note)}` };
    case 'chapters-missing':
      return { severity: 'warning', message: `${n(note.count ?? 0, 'chapter', 'chapters')} of ${file} ${note.count === 1 ? 'is' : 'are'} no longer in the book: ${note.count === 1 ? 'its' : 'their'} edits were not applied` };
  }
}

/**
 * Apply the edits of an exported Word file to the book at `project`.
 * `withoutMap`: the file's editor left the export map out; the map is
 * written again from the book.
 * With `--dry-run` nothing is written: the diff goes to stdout. Exit code
 * 3 when an edit could not be applied (a conflict with a change made since
 * the export, or a rejected one).
 */
export async function importWordEdits(bytes: Uint8Array, file: string, project: string, opts: Options, reporter: Reporter, withoutMap = false): Promise<void> {
  const kind = inputKind([project]);
  const book = await reporter.time('read', () => loadBook([project], opts, reporter));
  const ids = chapterIds(book);
  const chapters = wordChapters(book.chapters, ids);
  let result: DocxEditResult;
  try {
    let rebuilt: RebuiltMap | undefined;
    if (withoutMap) {
      rebuilt = await reporter.time('map', () => rebuildExportMap(bytes, {
        chapters,
        config: book.config,
        resources: book.resources,
        resourceBytes: resourceBytes(book),
        rasterizeSvg: svgPicture,
        ...(book.start ? { start: book.start } : {}),
      }));
      if (!rebuilt) throw new Error('comes from a postext export, but its export map is gone and cannot be written again from this book: none of its text is in the book, or it is a page facsimile, which needs the file as it was exported');
    }
    result = reporter.time('edits', () => applyDocxEdits(bytes, { chapters, resources: book.resources }, rebuilt ? { rebuilt } : {}));
  } catch (err) {
    throw new CliError(`${file}: ${(err as Error).message}`);
  }
  const byId = new Map(book.chapters.map((c) => [ids.get(c)!, c]));
  const foreign = [...new Set(result.edits.map((e) => e.chapter).filter((id): id is string => id !== undefined && !byId.has(id)))];
  if (foreign.length > 0) {
    reporter.warn({ kind: 'docx.unknownChapter', severity: 'warning', message: `${file} was exported with chapters this book does not have (${foreign.join(', ')}): their edits were not applied` });
  }

  // The files as they are now, and as the edits leave them.
  const zip = kind === 'bundle' ? openBundleZip(new Uint8Array(readFileSync(project))) : undefined;
  const diskPath = (path: string) => (kind === 'folder' ? join(project, path) : path);
  const readText = (path: string): string | undefined => {
    if (zip) {
      const b = zip.files.get(path);
      return b ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(b) : undefined;
    }
    const p = diskPath(path);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  };
  const changes: FileChange[] = [];
  for (const c of book.chapters) {
    const after = result.chapters.find((r) => r.id === ids.get(c))?.markdown;
    if (after === undefined || after === c.markdown || !c.file) continue;
    const before = readText(c.file) ?? c.markdown;
    // The edits were merged into the text the book was read with: a file
    // that no longer holds it (changed while this ran) is left alone.
    if (before.replace(/^\uFEFF/, '') !== c.markdown) {
      reporter.warn({ kind: 'docx.fileChanged', severity: 'warning', message: `${c.file} changed while the edits were merged: it was not written` });
      continue;
    }
    // The file's byte-order mark, which the book was read without.
    changes.push({ path: c.file, before, after: before.startsWith(BOM) ? BOM + after : after });
  }
  const resources = resourceChange(book, result, opts, readText, reporter);
  if (resources) changes.push(resources);

  // The report: every edit with where it lands, then the comments.
  const count = { applied: 0, conflict: 0, rejected: 0 };
  for (const e of result.edits) count[e.status]++;
  for (const note of result.notes ?? []) {
    const { severity, message } = noteText(note, file);
    if (severity === 'info') reporter.info(style.dim(message));
    else reporter.warn({ kind: `docx.${note.code}`, severity, message });
  }
  if (result.notes) reporter.data.notes = result.notes;
  // The export by the name the user chose (#1517); the writer as the
  // file's properties name it.
  reporter.data.variant = result.variant;
  reporter.data.writer = result.writer;
  reporter.data.exportId = result.exportId;
  reporter.data.edits = result.edits.map((e) => ({ ...e, at: editPlace(e, byId) }));
  reporter.data.comments = result.comments.map((c) => ({ ...c, at: c.start >= 0 ? editPlace(c, byId) : undefined }));
  reporter.data.files = changes.map((c) => c.path);
  const mark = { applied: style.green('applied'), conflict: style.yellow('conflict'), rejected: style.red('rejected') };
  for (const e of result.edits) {
    const what = editWhat(e);
    const why = e.reason ? style.dim(`  (${REASONS[e.reason] ?? e.reason})`) : '';
    reporter.info(`  ${mark[e.status]} ${editPlace(e, byId)} ${e.kind}: ${what}${why}`);
  }
  for (const c of result.comments) {
    reporter.info(`  ${style.cyan('comment')} ${c.start >= 0 ? editPlace(c, byId) : 'outside the exported text'}${c.author ? ` ${c.author}` : ''}: ${clip(c.text)}`);
  }
  reporter.info(`${file} (${result.variant}): ${count.applied} applied, ${count.conflict} in conflict, ${count.rejected} rejected${result.comments.length ? `, ${result.comments.length} comments` : ''}`);
  if (count.conflict + count.rejected > 0) reporter.exitCode = 3;

  if (opts.flag('dry-run')) {
    const diff = changes.map((c) => unifiedDiff(c.path, c.before, c.after)).join('');
    if (reporter.json) reporter.data.diff = diff;
    else if (diff) await writeStdout(diff);
    reporter.info(changes.length ? `dry run: ${changes.length} file${changes.length === 1 ? '' : 's'} would change` : 'dry run: nothing would change');
    return;
  }
  if (changes.length === 0) return;
  if (zip) {
    const files: Record<string, Uint8Array> = {};
    for (const [path, data] of zip.files) files[zip.rootPrefix + path] = data;
    for (const c of changes) files[zip.rootPrefix + c.path] = new TextEncoder().encode(c.after);
    writeAtomic(project, zipBundle(files, { mtime: new Date(1980, 0, 1) }));
    reporter.output({ kind: 'postext', path: project });
    return;
  }
  for (const c of changes) {
    writeAtomic(diskPath(c.path), c.after);
    reporter.output({ kind: 'file', path: diskPath(c.path) });
  }
}
