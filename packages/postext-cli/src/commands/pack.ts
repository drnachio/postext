import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createBundle, isBundleManifest, mimeForFile, zipBundle } from 'postext/bundle';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { inputKind, looseBundleInput, readTree } from '../input';
import { byteLength, writeOut } from '../io';

/** Zip a book folder as it is, or loose Markdown through `createBundle`. */
export default async function pack(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length === 0) throw new UsageError('Give a book folder (with preset.json) or Markdown files to pack');
  const kind = inputKind(inputs);
  if (kind === 'bundle') throw new UsageError(`${inputs[0]} is packed already`);
  let bytes: Uint8Array;
  let name: string;
  if (kind === 'folder') {
    const dir = inputs[0]!;
    const files = readTree(dir);
    const manifest = JSON.parse(new TextDecoder().decode(files.get('preset.json')!)) as unknown;
    if (!isBundleManifest(manifest)) throw new CliError(`${dir}/preset.json is not a postext manifest`);
    // A fixed date: the same folder always packs to the same bytes.
    bytes = zipBundle(Object.fromEntries(files), { mtime: new Date(1980, 0, 1) });
    name = basename(resolve(dir));
  } else {
    const input = await looseBundleInput(inputs, opts);
    const thumbnail = opts.string('thumbnail');
    const created = await createBundle({
      ...input,
      ...(opts.string('id') ? { id: opts.string('id') } : {}),
      ...(opts.string('description') ? { description: opts.string('description') } : {}),
      ...(thumbnail ? { thumbnail: { data: new Uint8Array(readFileSync(thumbnail)), mime: mimeForFile(thumbnail) } } : {}),
    });
    for (const w of created.warnings) reporter.warn({ kind: 'bundle', severity: 'warning', message: w });
    bytes = created.bytes;
    name = inputs.length === 1 ? basename(resolve(inputs[0]!)).replace(/\.[^.]*$/, '') : created.manifest.id;
  }
  const out = opts.string('out') ?? `${name}.postext`;
  await writeOut(out, bytes);
  reporter.output({ kind: 'postext', path: out, bytes: byteLength(bytes) });
}
