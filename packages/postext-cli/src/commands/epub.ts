import type { CommandContext } from '../context';
import { writeEpub } from '../outputs/epub';
import { defaultOutput, openAndLayOut } from '../session';

export default async function epub(ctx: CommandContext): Promise<void> {
  const { book, fonts, layout } = await openAndLayOut(ctx);
  await writeEpub(book, layout, fonts, ctx.opts, ctx.reporter, ctx.opts.string('out') ?? defaultOutput(ctx, book, '.epub'));
}
