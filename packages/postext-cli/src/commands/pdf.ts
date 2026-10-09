import type { CommandContext } from '../context';
import { writePdf } from '../outputs/pdf';
import { defaultOutput, openAndLayOut } from '../session';

export default async function pdf(ctx: CommandContext): Promise<void> {
  const { book, fonts, layout } = await openAndLayOut(ctx);
  await writePdf(book, layout, fonts, ctx.opts, ctx.reporter, ctx.opts.string('out') ?? defaultOutput(ctx, book, '.pdf'));
}
