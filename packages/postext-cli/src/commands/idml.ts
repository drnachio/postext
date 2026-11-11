// `postext idml`: the laid-out book as an InDesign Markup (IDML) package
// (`outputs/idml.ts`).
import type { CommandContext } from '../context';
import { idmlChoices, writeIdml } from '../outputs/idml';
import { defaultOutput, openAndLayOut } from '../session';

export default async function idml(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const choices = idmlChoices(opts, '', opts.string('out'));
  const { book, layout, fonts } = await openAndLayOut(ctx);
  await writeIdml(book, layout, fonts, choices, reporter, opts.string('out') ?? defaultOutput(ctx, book, '.idml'));
}
