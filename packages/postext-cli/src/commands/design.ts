import { basename, resolve } from 'node:path';
import { DESIGN_PARTS, extractDesign } from 'postext';
import { createDesignBundle } from 'postext/bundle';
import { CliError } from '../args';
import type { CommandContext } from '../context';
import { designFilesOf, parseDesignParts } from '../design';
import { loadBook } from '../input';
import { byteLength, writeOut } from '../io';

/** Take a book's design (#1523): the parts asked for, with the font files
 *  and colour profile they name, as a design file (a .postext with no
 *  chapters) that the Sandbox's Design panel and `--design` read. */
export default async function design(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  const parts = parseDesignParts(opts.string('parts'), 'parts') ?? [...DESIGN_PARTS];
  const book = await loadBook(inputs, opts, reporter);
  const taken = extractDesign(book.config, parts);
  if (taken.parts.length === 0) throw new CliError('None of the parts asked for is in the book');
  const name = opts.string('design-name') ?? book.name;
  const created = await createDesignBundle({
    name,
    ...(opts.string('id') ? { id: opts.string('id') } : {}),
    ...(opts.string('description') ? { description: opts.string('description') } : {}),
    locale: book.locale,
    design: taken,
    files: designFilesOf(book, taken),
    // A fixed date: the same book always gives the same bytes.
    mtime: new Date(1980, 0, 1),
  });
  for (const w of created.warnings) reporter.warn({ kind: 'bundle', severity: 'warning', message: w });
  const base = inputs.length === 1 ? basename(resolve(inputs[0]!)).replace(/\.[^.]*$/, '') : created.manifest.id;
  const out = opts.string('out') ?? `${base}.design.postext`;
  await writeOut(out, created.bytes);
  reporter.data.design = { name, parts: taken.parts };
  reporter.output({ kind: 'postext', path: out, bytes: byteLength(created.bytes) });
}
