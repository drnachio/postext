import type { CommandContext } from '../context';
import { loadBook } from '../input';
import { selectChapters } from '../layout';
import { writeDocx } from '../outputs/docx';
import { defaultOutput } from '../session';

export default async function docx(ctx: CommandContext): Promise<void> {
  // Word export needs no layout and no fonts: the Markdown and the styles.
  const book = await ctx.reporter.time('read', () => loadBook(ctx.inputs, ctx.opts, ctx.reporter));
  const chapters = selectChapters(book, ctx.opts);
  await writeDocx(book, chapters, ctx.opts.string('template'), ctx.reporter, ctx.opts.string('out') ?? defaultOutput(ctx, book, '.docx'));
}
