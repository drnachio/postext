// The PDF: postext-pdf with the book's fonts, its pictures, HarfBuzz for
// complex scripts and, for print, the ICC output profile.

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { resolvePrintConfig, type PrintConfig } from 'postext';
import { bundlePreviewBytes, bundleResourceBytes } from 'postext/bundle';
import { renderToPdf, type RenderToPdfOptions } from 'postext-pdf';
import { CliError, UsageError, type Options } from '../args';
import { harfbuzzWasm, iccProfile, ICC_PROFILES } from '../assets';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import { byteLength, writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';
import { rasterizeSvg } from '../svgImage';

const PDFX = { none: 'none', x1a: 'pdfx1a', x4: 'pdfx4', pdfx1a: 'pdfx1a', pdfx4: 'pdfx4' } as const;

export async function pdfOptions(book: Book, fonts: FontSet, opts: Options, reporter: Reporter): Promise<RenderToPdfOptions> {
  const options: RenderToPdfOptions = {
    fontProvider: fonts.provider(),
    resourceBytes: bundleResourceBytes(book),
    previewBytes: bundlePreviewBytes(book),
    harfbuzzWasm: harfbuzzWasm(),
    rasterizeSvg,
    onWarning: (w) => reporter.warn({ kind: `pdf.${w.kind}`, severity: 'warning', message: (w as { message?: string }).message ?? w.kind }),
    onProgress: (p) => {
      if (p.phase === 'pages' && p.pages % 50 === 0 && p.pages > 0) reporter.detail(`  pdf: ${p.pages}/${p.totalPages} pages`);
    },
  };
  const accessible = opts.flag('accessible');
  if (accessible !== undefined) options.accessible = accessible;
  const outlines = opts.flag('outlines');
  if (outlines !== undefined) options.outlines = outlines;
  if (opts.flag('page-negative')) options.pageNegative = true;
  const colorSpace = opts.choice('color-space', ['rgb', 'cmyk', 'grayscale'] as const);
  if (colorSpace) options.colorSpace = colorSpace;

  // Print: the book's settings, with --pdfx and --profile over them.
  let print: PrintConfig = { ...(book.config.print ?? {}) };
  const pdfx = opts.string('pdfx');
  if (pdfx !== undefined) {
    const standard = PDFX[pdfx as keyof typeof PDFX];
    if (!standard) throw new UsageError(`--pdfx must be none, x1a or x4 (got "${pdfx}")`);
    print = { ...print, standard };
  }
  let customBytes: Uint8Array | undefined;
  const profile = opts.string('profile');
  if (profile !== undefined) {
    if (ICC_PROFILES.includes(profile)) print = { ...print, outputProfile: profile };
    else if (existsSync(profile)) {
      customBytes = new Uint8Array(readFileSync(profile));
      print = { ...print, outputProfile: 'custom', customProfile: { name: basename(profile), fileId: profile } };
    } else throw new UsageError(`--profile: "${profile}" is neither a profile name (${ICC_PROFILES.join(', ')}) nor a file`);
  }
  // The die line of die-cut pages (#1566): on its own plate, or left out.
  const dieLine = opts.choice('die-line', ['page', 'none'] as const);
  if (dieLine) print = { ...print, dieLine: { ...(print.dieLine ?? {}), output: dieLine } };
  if (pdfx !== undefined || profile !== undefined || dieLine) options.print = print;
  const resolved = resolvePrintConfig(print);
  const pdfGen = book.config.pdfGeneration;
  const cmyk = (colorSpace ?? (pdfGen?.forceColorSpace ? pdfGen.colorSpace ?? 'cmyk' : 'rgb')) === 'cmyk';
  if (resolved.standard !== 'none' || cmyk) {
    const bytes = resolved.outputProfile === 'custom'
      ? customBytes ?? (resolved.customProfile ? book.files.get(resolved.customProfile.fileId) : undefined)
      : iccProfile(resolved.outputProfile);
    if (!bytes) throw new CliError(`The output profile "${resolved.outputProfile}" is not available`);
    options.outputProfile = bytes;
  }
  return options;
}

export async function writePdf(book: Book, layout: Layout, fonts: FontSet, opts: Options, reporter: Reporter, out: string): Promise<void> {
  const options = await pdfOptions(book, fonts, opts, reporter);
  const bytes = await reporter.time('pdf', () => renderToPdf(layout.docs, options));
  await writeOut(out, bytes);
  reporter.output({ kind: 'pdf', path: out, bytes: byteLength(bytes), pages: layout.pageCount });
}
