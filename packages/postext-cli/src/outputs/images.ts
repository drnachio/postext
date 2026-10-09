// Page images, painted by the engine's canvas renderer on Skia: the same
// painter as the Sandbox's Canvas view. Pages are addressed as printed
// ("12", "iv") or by position in the book ("#3").

import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import {
  applySingleInkToSvg,
  clearResourceImages,
  formatWarning,
  createPrintPreview,
  outputTransform,
  parseIccProfile,
  registerResourceImage,
  renderPageToCanvas,
  resolvePrintConfig,
  type VDTDocument,
  type VDTPage,
} from 'postext';
import { diagramInkHex } from 'postext/bundle';
import { CliError, UsageError, type Options } from '../args';
import { iccProfile } from '../assets';
import type { Book } from '../input';
import { writeOut } from '../io';
import type { Layout } from '../layout';
import { formatBytes, type Reporter } from '../log';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface BookPage {
  doc: VDTDocument;
  page: VDTPage;
  /** 1-based position in the book (what "#n" names). */
  position: number;
  /** The number the page prints ("12", "iv"), else its position. */
  label: string;
  /** 1-based chapter. */
  chapter: number;
}

export function bookPages(layout: Layout): BookPage[] {
  const out: BookPage[] = [];
  layout.docs.forEach((doc, ci) => {
    for (const page of doc.pages) {
      const position = out.length + 1;
      out.push({ doc, page, position, label: String(page.pageLabel || page.pageNumberValue || position), chapter: ci + 1 });
    }
  });
  return out;
}

const ROMAN = /^[ivxlcdm]+$/i;

/** Pages matching a list: "3", "7-9", "iv", "#1", "#10-#20" (or "#10-20"). */
export function selectPages(pages: readonly BookPage[], spec: string | undefined): BookPage[] {
  if (!spec) return [...pages];
  const picked = new Set<BookPage>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(#?)([^-]+)(?:-(#?)(.*))?$/.exec(part);
    if (!m) throw new UsageError(`Pages: "${part}" is not a page or range`);
    const [, hashA, a, , b] = m;
    const byPosition = hashA === '#';
    if (byPosition) {
      const from = Number(a);
      const to = b === undefined ? from : b === '' ? pages.length : Number(b);
      if (!Number.isInteger(from) || !Number.isInteger(to)) throw new UsageError(`Pages: "${part}" is not a position range`);
      for (const p of pages) if (p.position >= from && p.position <= to) picked.add(p);
      continue;
    }
    if (b === undefined) {
      const match = pages.filter((p) => p.label.toLowerCase() === a!.toLowerCase());
      if (match.length === 0 && !ROMAN.test(a!) && Number.isInteger(Number(a))) {
        throw new CliError(`No page prints "${a}" (the book has ${pages.length} pages; "#${a}" picks the ${a}th page)`);
      }
      match.forEach((p) => picked.add(p));
      continue;
    }
    // A range of printed numbers: the pages between the first that prints
    // `a` and the last that prints `b`, in book order.
    const start = pages.findIndex((p) => p.label.toLowerCase() === a!.toLowerCase());
    const endLabel = b === '' ? pages[pages.length - 1]!.label : b;
    let end = -1;
    for (let i = pages.length - 1; i >= 0; i--) if (pages[i]!.label.toLowerCase() === endLabel.toLowerCase()) { end = i; break; }
    if (start === -1 || end === -1 || end < start) throw new CliError(`No pages print "${part}"`);
    for (let i = start; i <= end; i++) picked.add(pages[i]!);
  }
  return pages.filter((p) => picked.has(p));
}

export function formatFromName(path: string | undefined, explicit: string | undefined): ImageFormat {
  const ext = explicit ?? (path && path !== '-' ? /\.(png|jpe?g|webp)$/i.exec(path)?.[1] : undefined) ?? 'png';
  const f = ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase();
  if (f !== 'png' && f !== 'jpeg' && f !== 'webp') throw new UsageError(`Image format must be png, jpeg or webp (got "${ext}")`);
  return f;
}

const EXT: Record<ImageFormat, string> = { png: '.png', jpeg: '.jpg', webp: '.webp' };

let registeredFor: Book | undefined;

/** Decode the book's pictures and hand them to the canvas renderer (once
 *  per book). */
async function registerImages(book: Book, reporter: Reporter): Promise<void> {
  if (registeredFor === book) return;
  clearResourceImages();
  registeredFor = book;
  const inkHex = diagramInkHex(book.config);
  await Promise.all(book.resources.map(async (r) => {
    const fileId = r.kind === 'svg' ? r.svg?.fileId : r.kind === 'bitmap' ? r.bitmap?.fileId : r.kind === 'video' ? r.video?.poster?.fileId : undefined;
    const bytes = fileId ? book.files.get(fileId) : undefined;
    if (!fileId || !bytes) return;
    try {
      if (r.kind === 'svg') {
        let text = new TextDecoder().decode(bytes);
        if (inkHex) text = applySingleInkToSvg(text, inkHex);
        registerResourceImage(fileId, await loadImage(Buffer.from(text)) as unknown as CanvasImageSource, { vector: true, singleInk: false });
      } else {
        registerResourceImage(fileId, await loadImage(Buffer.from(bytes)) as unknown as CanvasImageSource, { singleInk: false });
      }
    } catch (err) {
      reporter.warn({ kind: 'imageDecode', severity: 'warning', message: `${fileId}: ${(err as Error).message}` });
    }
  }));
}

export interface PaintOptions {
  format: ImageFormat;
  dpi: number;
  quality: number;
  printPreview: boolean;
}

export function paintOptions(opts: Options, path?: string): PaintOptions {
  const quality = opts.number('quality', 90);
  if (quality < 1 || quality > 100) throw new UsageError('--quality goes from 1 to 100');
  const dpi = opts.number('dpi', 150);
  if (dpi <= 0 || dpi > 2400) throw new UsageError('--dpi goes from 1 to 2400');
  return { format: formatFromName(path, opts.string('format')), dpi, quality, printPreview: opts.flag('print-preview') === true };
}

function printPreviewFor(book: Book, doc: VDTDocument) {
  const print = resolvePrintConfig(book.config.print);
  const bytes = print.outputProfile === 'custom'
    ? (print.customProfile ? book.files.get(print.customProfile.fileId) : undefined)
    : iccProfile(print.outputProfile);
  if (!bytes) throw new CliError(`--print-preview: the output profile "${print.outputProfile}" is not available`);
  const transform = outputTransform(parseIccProfile(bytes), {
    intent: print.renderingIntent,
    blackPointCompensation: print.blackPointCompensation,
    preserveNeutrals: print.black.kOnlyNeutrals,
  });
  return createPrintPreview(transform, print, { paper: true, dpi: doc.config.page.dpi });
}

export async function paintPage(book: Book, p: BookPage, options: PaintOptions, reporter: Reporter): Promise<Canvas> {
  await registerImages(book, reporter);
  const canvas = createCanvas(1, 1);
  renderPageToCanvas(p.page, p.doc, canvas as unknown as HTMLCanvasElement, {
    scale: options.dpi / (p.doc.config.page.dpi || 300),
    ...(options.printPreview ? { printPreview: printPreviewFor(book, p.doc) } : {}),
    onWarning: (w) => reporter.warn({ kind: `canvas.${w.kind}`, severity: 'warning', message: formatWarning(w), page: p.label }),
  });
  return canvas;
}

export async function encode(canvas: Canvas, options: PaintOptions): Promise<Uint8Array> {
  if (options.format === 'png') return new Uint8Array(await canvas.encode('png'));
  if (options.format === 'jpeg') return new Uint8Array(await canvas.encode('jpeg', options.quality));
  return new Uint8Array(await canvas.encode('webp', options.quality));
}

/** File name of a page from the pattern: {n}, {n:03}, {label}, {chapter}. */
export function pageFileName(pattern: string, p: BookPage, format: ImageFormat): string {
  const name = pattern.replace(/\{(n|label|chapter)(?::(0?)(\d+))?\}/g, (_, key: string, zero: string, width: string) => {
    const value = key === 'n' ? String(p.position) : key === 'chapter' ? String(p.chapter) : p.label;
    return width ? value.padStart(Number(width), zero === '0' ? '0' : ' ') : value;
  }).replace(/[\\/:*?"<>|]/g, '_');
  return /\.(png|jpe?g|webp)$/i.test(name) ? name : name + EXT[format];
}

/** Paint `pages` into `dir`: pages are painted one after another (the
 *  painter shares its caches) while up to `jobs` encodes run on Skia's
 *  thread pool. */
export async function writeImages(
  book: Book,
  layout: Layout,
  opts: Options,
  reporter: Reporter,
  dir: string,
  spec: string | undefined,
): Promise<void> {
  const options = paintOptions(opts);
  const pages = selectPages(bookPages(layout), spec);
  if (pages.length === 0) throw new CliError(`No page matches "${spec}"`);
  const pattern = opts.string('pattern', 'page-{n:03}');
  const jobs = Math.max(1, opts.number('jobs', availableParallelism()));
  const running = new Set<Promise<void>>();
  let total = 0;
  await reporter.time('images', async () => {
    for (const p of pages) {
      const canvas = await paintPage(book, p, options, reporter);
      const path = join(dir, pageFileName(pattern, p, options.format));
      const task = encode(canvas, options).then(async (bytes) => {
        await writeOut(path, bytes);
        total += bytes.byteLength;
        reporter.outputs.push({ kind: 'image', path, bytes: bytes.byteLength });
        reporter.detail(`  ${path} (page ${p.label}, ${canvas.width}×${canvas.height})`);
      });
      running.add(task);
      void task.finally(() => running.delete(task));
      if (running.size >= jobs) await Promise.race(running);
    }
    await Promise.all(running);
  });
  reporter.info(`wrote ${pages.length} ${options.format.toUpperCase()} images to ${dir} (${formatBytes(total)})`);
}

