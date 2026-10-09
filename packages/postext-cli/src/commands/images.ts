import type { CommandContext } from '../context';
import { writeImages } from '../outputs/images';
import { openAndLayOut } from '../session';

export default async function images(ctx: CommandContext): Promise<void> {
  const { book, layout } = await openAndLayOut(ctx);
  await writeImages(book, layout, ctx.opts, ctx.reporter, ctx.opts.string('out') ?? 'pages', ctx.opts.string('pages'));
}
