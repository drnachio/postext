import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { PostextConfig, Resource } from 'postext';
import { bitmapInfo, bundleBaseConfig, createBundle, svgSize } from 'postext/bundle';
import { analyzeDocx, applyStyleTracking, emptyTemplate, isExportedDocx, parseTemplate, pictureResolution, readDocx, wordStyleTracking, wordToPostext, type ImportResult } from 'postext/word';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { deepMerge } from '../input';
import { byteLength, writeOut } from '../io';
import { firstPageCover } from '../outputs/cover';
import { style } from '../log';
import { readTemplate } from '../outputs/docx';
import { importWordEdits } from '../wordEdits';

const BITMAP_FORMATS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };

/** The pictures and tables of an import as resources, their files by id
 *  (the Sandbox stores the same things as blobs). */
function importedResources(result: ImportResult, files: Map<string, Uint8Array>): Resource[] {
  const out: Resource[] = [];
  for (const pic of result.pictures) {
    const meta = { ...(pic.caption ? { caption: pic.caption } : {}), ...(pic.alt ? { altText: pic.alt } : {}), createdAt: 0, updatedAt: 0 };
    if (pic.media.contentType === 'image/svg+xml') {
      const fileId = `resources/${pic.id}.svg`;
      files.set(fileId, pic.media.bytes);
      out.push({ id: pic.id, typeId: 'figure', kind: 'svg', svg: { fileId, ...(svgSize(new TextDecoder().decode(pic.media.bytes)) ?? { width: 0, height: 0 }) }, ...meta } as Resource);
      continue;
    }
    const format = BITMAP_FORMATS[pic.media.contentType];
    if (!format) continue;
    const fileId = `resources/${pic.id}.${EXT[format]}`;
    files.set(fileId, pic.media.bytes);
    const info = bitmapInfo(pic.media.bytes);
    const size = info ?? { width: 0, height: 0 };
    // The resolution the picture was printed at in Word (its extent), else
    // the one its file states (#631).
    const fileResolution = pictureResolution(pic, size.width) ?? info?.resolution?.x;
    out.push({ id: pic.id, typeId: 'figure', kind: 'bitmap', bitmap: { fileId, format, width: size.width, height: size.height, ...(fileResolution ? { fileResolution } : {}) }, ...meta });
  }
  for (const t of result.tables) {
    out.push({ id: t.id, typeId: 'table', kind: 'table', table: { model: t.model }, ...(t.caption ? { caption: t.caption } : {}), createdAt: 0, updatedAt: 0 });
  }
  return out;
}

export default async function importDocx(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length < 1 || inputs.length > 2) throw new UsageError('Give one .docx file to import, and the book it was exported from to apply its edits');
  const file = inputs[0]!;
  if (!existsSync(file)) throw new CliError(`No such file: ${file}`);
  const bytes = new Uint8Array(readFileSync(file));
  // A file `postext docx` exported: its edits go back into the book.
  const exported = isExportedDocx(bytes);
  const project = inputs[1];
  if (project) {
    // The edits are written into the book itself.
    if (opts.string('out')) throw new UsageError('-o converts a Word file into a new book: with a book named, the edits are written into it (--dry-run to see them first)');
    if (!exported) throw new CliError(`${file} was not exported by postext (it has no export map): import it without naming a book to convert it`);
    await importWordEdits(bytes, file, project, opts, reporter);
    return;
  }
  if (opts.flag('dry-run')) throw new UsageError('--dry-run applies to the edits of an exported file: name the book it was exported from');
  if (exported) reporter.info(style.dim(`${file} was exported by postext: name its book (postext import-docx ${file} book/) to apply the edits made in Word; converting it into a new book instead`));
  let doc: ReturnType<typeof readDocx>;
  try {
    doc = reporter.time('read', () => readDocx(bytes));
  } catch (err) {
    throw new CliError(`${file}: ${(err as Error).message}`);
  }
  const locale = opts.string('locale', 'en');
  const configPath = opts.string('config');
  const userConfig: PostextConfig = configPath ? JSON.parse(readFileSync(configPath, 'utf8')) as PostextConfig : {};
  const config = deepMerge(bundleBaseConfig(locale), userConfig);
  const templatePath = opts.string('template');
  const template = templatePath ? readTemplate(templatePath) : parseTemplate(doc.embeddedTemplate) ?? emptyTemplate();
  if (opts.flag('report') || reporter.json) {
    const report = analyzeDocx(doc, template, config);
    reporter.data.report = report;
    if (!reporter.json) {
      reporter.info(`${style.bold('Quality')}: ${report.verdict} — ${report.styled}/${report.paragraphs} paragraphs styled, ${report.pictures} pictures, ${report.tables} tables, ${report.footnotes} notes`);
      for (const f of report.findings) reporter.info(`  ${f.severity === 'warn' ? style.yellow('warn') : style.cyan('info')} ${f.id} ×${f.count}${f.examples[0] ? style.dim(`  "${f.examples[0]}"`) : ''}`);
    }
  }
  const result = reporter.time('convert', () => wordToPostext(doc, {
    template,
    config,
    chapters: opts.flag('split') === false ? 'single' : 'split',
    existingIds: new Set(),
    untitledChapter: 'Untitled',
  }));
  for (const name of result.skippedPictures) reporter.warn({ kind: 'unsupportedPicture', severity: 'warning', message: `${name}: EMF, WMF and TIFF pictures are left out` });
  if (result.droppedHeadingNotes > 0) reporter.warn({ kind: 'headingNote', severity: 'warning', message: `${result.droppedHeadingNotes} footnote(s) on headings were dropped` });
  // The character spacing of Word's styles goes on the book's styles that
  // set none (#932): a style is form, which the Markdown cannot carry.
  const tracked = applyStyleTracking(userConfig, wordStyleTracking(doc, template, config));
  if (tracked.applied.length + tracked.skipped.length > 0) {
    const say = (t: { style: string; letterSpacing: { value: number } }) => `${t.style} ${t.letterSpacing.value} em`;
    reporter.data.styleTracking = { applied: tracked.applied.map(say), skipped: tracked.skipped.map(say) };
    if (tracked.applied.length > 0) reporter.info(`character spacing from Word styles: ${tracked.applied.map(say).join(', ')}`);
    if (tracked.skipped.length > 0) reporter.info(`character spacing left out (the book sets its own, or has no such style): ${tracked.skipped.map(say).join(', ')}`);
  }
  const files = new Map<string, Uint8Array>();
  const resources = importedResources(result, files);
  const name = opts.string('name') ?? doc.title?.trim() ?? basename(file, extname(file));
  const create = (thumbnail?: { data: Uint8Array; mime: string }) => createBundle({
    name,
    locale,
    chapters: result.chapters,
    config: tracked.config,
    resources,
    files,
    mtime: new Date(1980, 0, 1),
    ...(thumbnail ? { thumbnail } : {}),
  });
  let created = await create();
  for (const w of created.warnings) reporter.warn({ kind: 'bundle', severity: 'warning', message: w });
  const out = opts.string('out') ?? basename(file, extname(file));
  reporter.data.chapters = result.chapters.length;
  if (/\.postext$/i.test(out)) {
    // The bundle's cover: its first page (#1210).
    if (opts.flag('auto-thumbnail') !== false) {
      const cover = await firstPageCover(ctx, created.bytes);
      if (cover) created = await create(cover);
    }
    await writeOut(out, created.bytes);
    reporter.output({ kind: 'postext', path: out, bytes: byteLength(created.bytes) });
  } else {
    for (const [path, bytes] of Object.entries(created.files)) await writeOut(join(out, path), bytes);
    reporter.output({ kind: 'folder', path: out });
  }
  reporter.info(`${result.chapters.length} chapter${result.chapters.length === 1 ? '' : 's'}, ${resources.length} resources`);
}
