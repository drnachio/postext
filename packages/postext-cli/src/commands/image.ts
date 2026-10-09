import { UsageError } from '../args';
import type { CommandContext } from '../context';
import { byteLength, writeOut } from '../io';
import { bookPages, encode, paintOptions, paintPage, selectPages } from '../outputs/images';
import { defaultOutput, openAndLayOut } from '../session';

export default async function image(ctx: CommandContext): Promise<void> {
  const spec = ctx.opts.string('page');
  if (!spec) throw new UsageError('Say which page: --page 12 (as printed) or --page "#1" (the first page)');
  if (/[,]/.test(spec) || /\d-/.test(spec)) throw new UsageError('`image` renders one page; use `images --pages` for several');
  const { book, layout } = await openAndLayOut(ctx);
  const [page] = selectPages(bookPages(layout), spec);
  if (!page) throw new UsageError(`No page "${spec}"`);
  const out = ctx.opts.string('out') ?? defaultOutput(ctx, book, `-p${page.label}.${ctx.opts.string('format', 'png').replace('jpeg', 'jpg')}`);
  const options = paintOptions(ctx.opts, out);
  const bytes = await ctx.reporter.time('image', async () => encode(await paintPage(book, page, options, ctx.reporter), options));
  await writeOut(out, bytes);
  ctx.reporter.data.page = { label: page.label, position: page.position, chapter: page.chapter };
  ctx.reporter.output({ kind: 'image', path: out, bytes: byteLength(bytes) });
}
