// One layout, several outputs; with --watch, again on every change.

import { watch, type FSWatcher } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createMeasurementCache } from 'postext';
import { UsageError } from '../args';
import type { CommandContext } from '../context';
import { resolveFonts } from '../fonts';
import { isProjectOnlyFile, loadBook } from '../input';
import { layOut, selectChapters } from '../layout';
import { Reporter, style } from '../log';
import { writeDocx } from '../outputs/docx';
import { writeEpub } from '../outputs/epub';
import { writeHtml } from '../outputs/html';
import { writeImages } from '../outputs/images';
import { writePdf } from '../outputs/pdf';

const TARGETS = ['pdf', 'html', 'epub', 'images', 'docx'] as const;

async function buildOnce(ctx: CommandContext, cache: ReturnType<typeof createMeasurementCache>): Promise<string[]> {
  const { opts, reporter } = ctx;
  const book = await reporter.time('read', () => loadBook(ctx.inputs, opts, reporter));
  const needsLayout = TARGETS.some((t) => t !== 'docx' && opts.string(t));
  if (needsLayout) {
    const fonts = await reporter.time('fonts', () => resolveFonts(book, {
      fontDirs: opts.list('font-dir'),
      offline: opts.flag('offline') === true,
      ...(opts.string('cache-dir') ? { cacheDir: opts.string('cache-dir')! } : {}),
    }, reporter));
    const layout = await layOut(book, opts, reporter, cache);
    reporter.info(`${book.name}: ${layout.pageCount} pages (${Math.round(reporter.timings.layout ?? 0)} ms)`);
    // The writers share the layout; the PDF and the EPUB build in parallel
    // with the images (they wait on different things).
    const jobs: Promise<void>[] = [];
    const pdf = opts.string('pdf');
    if (pdf) jobs.push(writePdf(book, layout, fonts, opts, reporter, pdf));
    const html = opts.string('html');
    if (html) jobs.push(writeHtml(book, layout, fonts, opts, reporter, html));
    const epub = opts.string('epub');
    if (epub) jobs.push(writeEpub(book, layout, fonts, opts, reporter, epub));
    const images = opts.string('images');
    if (images) jobs.push(writeImages(book, layout, opts, reporter, images, opts.string('pages')));
    await Promise.all(jobs);
  }
  const docx = opts.string('docx');
  if (docx) await writeDocx(book, selectChapters(book, opts), opts.string('template'), reporter, docx);
  return book.watchPaths;
}

export default async function build(ctx: CommandContext): Promise<void> {
  const { opts } = ctx;
  if (!TARGETS.some((t) => opts.string(t))) throw new UsageError('Say what to write: --pdf, --html, --epub, --images and/or --docx');
  const cache = createMeasurementCache();
  const paths = await buildOnce(ctx, cache);
  if (!opts.flag('watch')) return;
  if (ctx.reporter.json) throw new UsageError('--watch does not combine with --json');
  // Rebuild on change: a burst of saves is one rebuild, and a rebuild that
  // fails leaves the last good outputs in place.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  const rebuild = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const started = performance.now();
    const reporter = new Reporter(ctx.reporter.level, false);
    try {
      await buildOnce({ ...ctx, reporter }, cache);
      reporter.info(style.dim(`rebuilt in ${Math.round(performance.now() - started)} ms — watching`));
    } catch (err) {
      process.stderr.write(`${style.red('error')} ${(err as Error).message}\n`);
    } finally {
      running = false;
      if (again) {
        again = false;
        void rebuild();
      }
    }
  };
  const outputs = TARGETS.map((t) => opts.string(t)).filter((p): p is string => !!p).map((p) => resolve(p));
  const watchers: FSWatcher[] = paths.map((p) => watch(p, { recursive: true }, (_event, file) => {
    if (file) {
      const changed = resolve(p, String(file));
      // Our own outputs written inside a watched folder do not count, nor
      // do a project's sources, scripts and notes.
      if (outputs.some((o) => changed === o || changed.startsWith(o + sep))) return;
      if (isProjectOnlyFile(String(file).split(sep).join('/'))) return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 150);
  }));
  ctx.reporter.info(style.dim(`watching ${paths.join(', ')} — Ctrl+C to stop`));
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      for (const w of watchers) w.close();
      resolve();
    });
  });
}
