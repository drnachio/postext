// `postext idml`: the laid-out book as an InDesign Markup (IDML) package,
// for finishing in InDesign; with --images link, the pictures go beside it
// in Links/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { idmlDocument } from 'postext-idml';
import type { CommandContext } from '../context';
import { UsageError } from '../args';
import { writeOut } from '../io';
import { defaultOutput, openAndLayOut } from '../session';

export default async function idml(ctx: CommandContext): Promise<void> {
  const { opts, reporter } = ctx;
  const images = opts.string('images') ?? 'embed';
  if (images !== 'embed' && images !== 'link') throw new UsageError('--images is embed or link');
  // Linked pictures go into Links/ beside the package, which stdout has not.
  if (images === 'link' && opts.string('out') === '-') throw new UsageError('--images link writes the pictures beside the package: give -o a file, or embed them');
  const lineBreaks = opts.choice('lines', ['keep', 'reflow'] as const) ?? 'keep';
  const packFonts = opts.flag('fonts') === true;
  if (packFonts && opts.string('out') === '-') throw new UsageError('--fonts writes the font files beside the package: give -o a file');
  const { book, layout, fonts } = await openAndLayOut(ctx);
  const out = opts.string('out') ?? defaultOutput(ctx, book, '.idml');
  const result = await reporter.time('idml', async () =>
    idmlDocument({
      docs: layout.docs,
      resourceBytes: (id) => book.files.get(id),
      images,
      lineBreaks,
      // A face is named as its file names it, which is how InDesign finds it.
      fontFile: (family, weight, italic) => fonts.pick(family, weight, italic ? 'italic' : 'normal')?.bytes,
      title: book.name,
      onWarning: (w) => reporter.warn({ kind: `idml.${w.code}`, severity: 'warning', message: w.message }),
    }));
  await writeOut(out, result.bytes);
  if (images === 'link') {
    const dir = dirname(resolve(out));
    for (const l of result.links) {
      const path = join(dir, l.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, l.bytes);
    }
  }
  if (packFonts) {
    // InDesign serves the fonts of a `Document fonts` folder beside a
    // document to that document. A family the book may not hand on
    // (`redistributable: false`) stays out.
    const closed = new Set((book.config.customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
    const dir = dirname(resolve(out));
    for (const f of result.fonts) {
      const face = fonts.faces.find((x) => x.bytes === f.bytes);
      if (face && closed.has(face.family.toLowerCase())) {
        reporter.warn({ kind: 'idml.font.closed', severity: 'warning', message: `${face.family}: the book may not hand this family on; its files are left out of Document fonts` });
        continue;
      }
      const path = join(dir, f.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, f.bytes);
    }
  }
  reporter.output({ kind: 'idml', path: out, bytes: result.bytes.length, pages: layout.pageCount });
}
