// The laid-out book as an InDesign Markup (IDML) package, for finishing
// in InDesign: `postext idml` and `postext build --idml` write it from a
// layout. With linked images the pictures go beside it in Links/, with
// fonts the font files in Document fonts/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { idmlDocument } from 'postext-idml';
import { UsageError, type Options } from '../args';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import { writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';

export interface IdmlChoices {
  images: 'embed' | 'link';
  lineBreaks: 'keep' | 'reflow';
  packFonts: boolean;
  /** Facing spreads or one page to a spread; unset follows the margins. */
  spreads: 'facing' | 'single' | undefined;
  /** The running text threaded through a frame per column (default), or
   *  a frame per block (#1559). */
  text: 'thread' | 'frames';
}

/** What the options ask of the package; `prefix` is `idml-` in `build`. */
export function idmlChoices(opts: Options, prefix: string, out: string | undefined): IdmlChoices {
  const images = opts.choice(`${prefix}images`, ['embed', 'link'] as const) ?? 'embed';
  // Linked pictures go into Links/ beside the package, which stdout has not.
  if (images === 'link' && out === '-') throw new UsageError(`--${prefix}images link writes the pictures beside the package: give it a file, or embed them`);
  const lineBreaks = opts.choice(`${prefix}lines`, ['keep', 'reflow'] as const) ?? 'keep';
  const packFonts = opts.flag(`${prefix}fonts`) === true;
  if (packFonts && out === '-') throw new UsageError(`--${prefix}fonts writes the font files beside the package: give it a file`);
  const spreads = opts.choice(`${prefix}spreads`, ['facing', 'single'] as const);
  const text = opts.choice(`${prefix}text`, ['thread', 'frames'] as const) ?? 'thread';
  return { images, lineBreaks, packFonts, spreads, text };
}

export async function writeIdml(book: Book, layout: Layout, fonts: FontSet, choices: IdmlChoices, reporter: Reporter, out: string): Promise<void> {
  const result = await reporter.time('idml', async () =>
    idmlDocument({
      docs: layout.docs,
      resourceBytes: (id) => book.files.get(id),
      images: choices.images,
      lineBreaks: choices.lineBreaks,
      text: choices.text,
      ...(choices.spreads ? { spreads: choices.spreads } : {}),
      // A face is named as its file names it, which is how InDesign finds it.
      fontFile: (family, weight, italic) => fonts.pick(family, weight, italic ? 'italic' : 'normal')?.bytes,
      title: book.name,
      onWarning: (w) => reporter.warn({ kind: `idml.${w.code}`, severity: 'warning', message: w.message }),
    }));
  await writeOut(out, result.bytes);
  const beside = (path: string, bytes: Uint8Array): void => {
    const to = join(dirname(resolve(out)), path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, bytes);
  };
  if (choices.images === 'link') for (const l of result.links) beside(l.path, l.bytes);
  if (choices.packFonts) {
    // InDesign serves the fonts of a `Document fonts` folder beside a
    // document to that document. A family the book may not hand on
    // (`redistributable: false`) stays out.
    const closed = new Set((book.config.customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
    for (const f of result.fonts) {
      const face = fonts.faces.find((x) => x.bytes === f.bytes);
      if (face && closed.has(face.family.toLowerCase())) {
        reporter.warn({ kind: 'idml.font.closed', severity: 'warning', message: `${face.family}: the book may not hand this family on; its files are left out of Document fonts` });
        continue;
      }
      beside(f.path, f.bytes);
    }
  }
  reporter.output({ kind: 'idml', path: out, bytes: result.bytes.length, pages: layout.pageCount });
}
