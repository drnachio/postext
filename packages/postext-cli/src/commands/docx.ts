import type { CommandContext } from '../context';
import { loadBook } from '../input';
import { selectChapters } from '../layout';
import { docxVariant, embedsFonts, writeDocx } from '../outputs/docx';
import { defaultOutput, openAndLayOut, openBook } from '../session';

export default async function docx(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const variant = docxVariant(opts);
  if (variant === 'formatted') {
    // The PDF's pages: the book laid out as for the PDF.
    const { book, fonts, layout } = await openAndLayOut(ctx);
    await writeDocx(book, { variant, chapters: layout.chapters, layout, ...(embedsFonts(opts) ? { fonts } : {}) }, reporter, opts.string('out') ?? defaultOutput(ctx, book, '.docx'));
    return;
  }
  // The semantic file needs no layout: the Markdown, the settings and,
  // to embed, the faces.
  const { book, fonts } = embedsFonts(opts)
    ? await openBook(ctx)
    : { book: await reporter.time('read', () => loadBook(ctx.inputs, opts, reporter)), fonts: undefined };
  await writeDocx(book, { variant, chapters: selectChapters(book, opts), ...(fonts ? { fonts } : {}) }, reporter, opts.string('out') ?? defaultOutput(ctx, book, '.docx'));
}
