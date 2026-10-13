// One layout, several outputs; with --watch, again on every change: the
// chapters whose inputs did not change are kept from the last layout, and
// page images are painted again only for the chapters laid out again.

import { watch, type FSWatcher } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createBundleLayoutCache, createMeasurementCache, type BundleLayoutCache, type MeasurementCache, type VDTDocument } from 'postext';
import { UsageError } from '../args';
import type { CommandContext } from '../context';
import { resolveFonts, type Face, type FontSet } from '../fonts';
import { isProjectOnlyFile, loadBook, type Book } from '../input';
import { sameBytes, sameFiles } from '../io';
import { layOut, selectChapters } from '../layout';
import { Reporter, style } from '../log';
import { writeDocx } from '../outputs/docx';
import { writeEpub } from '../outputs/epub';
import { writeHtml } from '../outputs/html';
import { writeImages } from '../outputs/images';
import { writePdf } from '../outputs/pdf';

const TARGETS = ['pdf', 'html', 'epub', 'images', 'docx'] as const;

/** What the pages are painted and measured with besides the text and the
 *  settings: the book's files (pictures, fonts) and the faces resolved. */
interface Assets {
  files: Map<string, Uint8Array>;
  faces: readonly Face[];
}

/** What a build hands the next one (--watch). */
interface BuildState {
  cache: MeasurementCache;
  layouts: BundleLayoutCache;
  /** The last build whose outputs were all written. */
  last?: { docs: VDTDocument[]; assets: Assets };
}

/** The chapters' Markdown and the manifest, which reach the layout as the
 *  chapters, the configuration and the resources the layout cache
 *  compares. */
const TEXT_FILE = /(?:^|\/)preset\.json$|\.(?:md|markdown|mdx|txt)$/i;

function assetsOf(book: Book, fonts: FontSet): Assets {
  return { files: new Map([...book.files].filter(([path]) => !TEXT_FILE.test(path))), faces: fonts.faces };
}

function sameAssets(a: Assets, b: Assets): boolean {
  if (!sameFiles(a.files, b.files) || a.faces.length !== b.faces.length) return false;
  return a.faces.every((f, i) => {
    const g = b.faces[i]!;
    return f.family === g.family && f.weight === g.weight && f.style === g.style && f.source === g.source && sameBytes(f.bytes, g.bytes);
  });
}

async function buildOnce(ctx: CommandContext, state: BuildState): Promise<string[]> {
  const { opts, reporter } = ctx;
  const book = await reporter.time('read', () => loadBook(ctx.inputs, opts, reporter));
  const needsLayout = TARGETS.some((t) => t !== 'docx' && opts.string(t));
  if (needsLayout) {
    const fonts = await reporter.time('fonts', () => resolveFonts(book, {
      fontDirs: opts.list('font-dir'),
      offline: opts.flag('offline') === true,
      ...(opts.string('cache-dir') ? { cacheDir: opts.string('cache-dir')! } : {}),
    }, reporter));
    const assets = assetsOf(book, fonts);
    if (state.last && !sameAssets(state.last.assets, assets)) {
      // A picture or a face changed: nothing measured or laid out stands.
      state.cache = createMeasurementCache();
      state.layouts = createBundleLayoutCache();
      state.last = undefined;
    }
    const layout = await layOut(book, opts, reporter, state.cache, fonts, state.layouts);
    const laidOut = layout.laidOut.filter(Boolean).length;
    const kept = state.last && laidOut < layout.docs.length ? `, ${laidOut} of ${layout.docs.length} chapters laid out` : '';
    reporter.info(`${book.name}: ${layout.pageCount} pages (${Math.round(reporter.timings.layout ?? 0)} ms${kept})`);
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
    // A chapter kept from the last layout has the same pages at the same
    // places in the book, already painted.
    const previous = state.last?.docs;
    const repaint = previous ? (p: { doc: VDTDocument; chapter: number }) => p.doc !== previous[p.chapter - 1] : undefined;
    if (images) jobs.push(writeImages(book, layout, opts, reporter, images, opts.string('pages'), repaint));
    await Promise.all(jobs);
    state.last = { docs: layout.docs, assets };
  }
  const docx = opts.string('docx');
  if (docx) await writeDocx(book, selectChapters(book, opts), opts.string('template'), reporter, docx);
  return book.watchPaths;
}

export default async function build(ctx: CommandContext): Promise<void> {
  const { opts } = ctx;
  if (!TARGETS.some((t) => opts.string(t))) throw new UsageError('Say what to write: --pdf, --html, --epub, --images and/or --docx');
  const state: BuildState = { cache: createMeasurementCache(), layouts: createBundleLayoutCache() };
  const paths = await buildOnce(ctx, state);
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
      await buildOnce({ ...ctx, reporter }, state);
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
