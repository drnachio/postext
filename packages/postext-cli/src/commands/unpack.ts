import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { openBundleZip } from 'postext/bundle';
import { CliError, UsageError } from '../args';
import type { CommandContext } from '../context';
import { writeOut } from '../io';

export default async function unpack(ctx: CommandContext): Promise<void> {
  const { opts, reporter, inputs } = ctx;
  if (inputs.length !== 1) throw new UsageError('Give one .postext file to unpack');
  const file = inputs[0]!;
  if (!existsSync(file)) throw new CliError(`No such file: ${file}`);
  let zip: ReturnType<typeof openBundleZip>;
  try {
    zip = openBundleZip(new Uint8Array(readFileSync(file)));
  } catch (err) {
    throw new CliError(`${file}: ${(err as Error).message}`);
  }
  const dir = opts.string('out') ?? basename(file).replace(/\.(postext|zip)$/i, '');
  if (existsSync(dir) && readdirSync(dir).length > 0 && !opts.flag('force')) {
    throw new CliError(`${dir} is not empty (--force writes into it)`);
  }
  for (const [path, bytes] of zip.files) {
    if (path.split('/').includes('..')) continue;
    await writeOut(join(dir, path), bytes);
  }
  reporter.data.files = zip.files.size;
  reporter.output({ kind: 'folder', path: dir });
  reporter.detail(`  ${zip.files.size} files`);
}
