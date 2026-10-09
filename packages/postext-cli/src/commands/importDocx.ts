import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { PostextConfig, Resource } from 'postext';
import { bitmapSize, bundleBaseConfig, createBundle, svgSize } from 'postext/bundle';
import { analyzeDocx, emptyTemplate, parseTemplate, readDocx, wordToPostext, type ImportResult } from 'postext/word';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { deepMerge } from '../input';
import { byteLength, writeOut } from '../io';
import { style } from '../log';
import { readTemplate } from '../outputs/docx';

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
    const size = bitmapSize(pic.media.bytes) ?? { width: 0, height: 0 };
    out.push({ id: pic.id, typeId: 'figure', kind: 'bitmap', bitmap: { fileId, format, width: size.width, height: size.height }, ...meta });
  }
  for (const t of result.tables) {
    out.push({ id: t.id, typeId: 'table', kind: 'table', table: { model: t.model }, ...(t.caption ? { caption: t.caption } : {}), createdAt: 0, updatedAt: 0 });
  }
  return out;
}

export default async function importDocx(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length !== 1) throw new UsageError('Give one .docx file to import');
  const file = inputs[0]!;
  if (!existsSync(file)) throw new CliError(`No such file: ${file}`);
  let doc: ReturnType<typeof readDocx>;
  try {
    doc = reporter.time('read', () => readDocx(new Uint8Array(readFileSync(file))));
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
  const files = new Map<string, Uint8Array>();
  const resources = importedResources(result, files);
  const name = opts.string('name') ?? doc.title?.trim() ?? basename(file, extname(file));
  const created = await createBundle({
    name,
    locale,
    chapters: result.chapters,
    config: userConfig,
    resources,
    files,
    mtime: new Date(1980, 0, 1),
  });
  for (const w of created.warnings) reporter.warn({ kind: 'bundle', severity: 'warning', message: w });
  const out = opts.string('out') ?? basename(file, extname(file));
  reporter.data.chapters = result.chapters.length;
  if (/\.postext$/i.test(out)) {
    await writeOut(out, created.bytes);
    reporter.output({ kind: 'postext', path: out, bytes: byteLength(created.bytes) });
  } else {
    for (const [path, bytes] of Object.entries(created.files)) await writeOut(join(out, path), bytes);
    reporter.output({ kind: 'folder', path: out });
  }
  reporter.info(`${result.chapters.length} chapter${result.chapters.length === 1 ? '' : 's'}, ${resources.length} resources`);
}
