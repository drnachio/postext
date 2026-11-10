import type { CommandContext } from '../context';
import { loadBook } from '../input';
import { selectChapters } from '../layout';
import { docxVariant, embedsFonts, needsLayout, writeDocx } from '../outputs/docx';
import { defaultOutput, openAndLayOut, openBook } from '../session';

export default async function docx(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const book = await reporter.time('read', () => loadBook(ctx.inputs, opts, reporter));
  const variant = docxVariant(opts);
  const out = opts.string('out') ?? defaultOutput(ctx, book, '.docx');
  if (needsLayout(variant)) {
    // The facsimile is the PDF's pages: the book laid out as for the PDF.
    const { fonts, layout } = await openAndLayOut(ctx, undefined, book);
    await writeDocx(book, { variant, chapters: layout.chapters, layout, ...(embedsFonts(opts) ? { fonts } : {}) }, reporter, out);
    return;
  }
  // The flow files need no layout: the Markdown, the settings and, for
  // the formatted one, the faces it embeds.
  const fonts = embedsFonts(opts, 'embed-fonts', variant) ? (await openBook(ctx, book)).fonts : undefined;
  await writeDocx(book, { variant, chapters: selectChapters(book, opts), ...(fonts ? { fonts } : {}) }, reporter, out);
}
