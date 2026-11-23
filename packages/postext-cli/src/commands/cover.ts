import { extname } from 'node:path';
import { renderToPdf } from 'postext-pdf';
import type { CommandContext } from '../context';
import { byteLength, writeOut } from '../io';
import { encode, paintOptions } from '../outputs/images';
import { pdfOptions } from '../outputs/pdf';
import { layOutCover, paintCover } from '../outputs/printCover';
import { defaultOutput, openAndLayOut } from '../session';

/** `postext cover`: a version's cover sheet as a PDF, or a panel of it
 *  (the front cover, by default) as a picture. */
export default async function cover(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const { book, fonts, layout } = await openAndLayOut(ctx);
  const out = opts.string('out') ?? defaultOutput(ctx, book, '-cover.pdf');
  const laid = await reporter.time('cover', () => layOutCover(book, layout, fonts, opts, reporter));
  if ((out !== '-' && /^\.(png|jpe?g|webp)$/i.test(extname(out))) || opts.string('format')) {
    const options = paintOptions(opts, out);
    const bytes = await reporter.time('image', async () => encode(await paintCover(laid, opts.string('zone', 'front'), options, reporter), options));
    await writeOut(out, bytes);
    reporter.output({ kind: 'image', path: out, bytes: byteLength(bytes) });
    return;
  }
  const options = await pdfOptions(laid.book, fonts, opts, reporter);
  const bytes = await reporter.time('pdf', () => renderToPdf([laid.doc], options));
  await writeOut(out, bytes);
  reporter.output({ kind: 'pdf', path: out, bytes: byteLength(bytes), pages: 1 });
}
