import type { CommandContext } from '../context';
import { writeHtml } from '../outputs/html';
import { defaultOutput, openAndLayOut } from '../session';

export default async function html(ctx: CommandContext): Promise<void> {
  const { book, fonts, layout } = await openAndLayOut(ctx);
  await writeHtml(book, layout, fonts, ctx.opts, ctx.reporter, ctx.opts.string('out') ?? defaultOutput(ctx, book, '.html'));
}
