// Publish the CLI to npm (release workflow, after the executables are
// built into bin/): one package per platform holding its executable
// (postext-cli-linux-x64…, with `os`/`cpu`/`libc` so npm installs only the
// matching one), then `postext-cli` itself, a launcher that depends on all
// of them as optional dependencies (the esbuild pattern). Plain Node, no
// dependencies. `--dry-run` packs without publishing.
//
//   node scripts/npm-publish.mjs [--dry-run]

import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'npm', 'dist');
const dryRun = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

const PLATFORMS = [
  { name: 'macos-arm64', os: 'darwin', cpu: 'arm64' },
  { name: 'macos-x64', os: 'darwin', cpu: 'x64' },
  { name: 'linux-x64', os: 'linux', cpu: 'x64', libc: 'glibc' },
  { name: 'linux-arm64', os: 'linux', cpu: 'arm64', libc: 'glibc' },
  { name: 'linux-x64-musl', os: 'linux', cpu: 'x64', libc: 'musl' },
  { name: 'windows-x64', os: 'win32', cpu: 'x64', exe: true },
];

const common = {
  version,
  license: pkg.license,
  homepage: pkg.homepage,
  repository: pkg.repository,
};

function publish(dir) {
  const args = ['publish', '--access', 'public', ...(dryRun ? ['--dry-run'] : [])];
  console.log(`npm ${args.join(' ')}  (${dir})`);
  execFileSync('npm', args, { cwd: dir, stdio: 'inherit' });
}

rmSync(OUT, { recursive: true, force: true });
const optional = {};
for (const p of PLATFORMS) {
  const file = `postext-${p.name}${p.exe ? '.exe' : ''}`;
  const src = join(ROOT, 'bin', file);
  if (!existsSync(src)) throw new Error(`Missing ${src}: run the build first`);
  const name = `postext-cli-${p.name}`;
  const dir = join(OUT, name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  const exe = join(dir, 'bin', `postext${p.exe ? '.exe' : ''}`);
  copyFileSync(src, exe);
  chmodSync(exe, 0o755);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    ...common,
    description: `The postext command line for ${p.os}-${p.cpu}${p.libc === 'musl' ? ' (musl)' : ''}: the executable postext-cli runs.`,
    os: [p.os],
    cpu: [p.cpu],
    ...(p.libc ? { libc: [p.libc] } : {}),
    files: ['bin'],
    preferUnplugged: true,
  }, null, 2) + '\n');
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\nThe \`postext\` executable for ${p.os}-${p.cpu}. Install [postext-cli](https://www.npmjs.com/package/postext-cli) instead: it picks this package on this platform.\n`);
  publish(dir);
  optional[name] = version;
}

// The launcher: package.json without the workspace's scripts and dev tools.
const dir = join(OUT, 'postext-cli');
mkdirSync(join(dir, 'npm'), { recursive: true });
mkdirSync(join(dir, 'bin'), { recursive: true });
copyFileSync(join(ROOT, 'npm', 'postext.js'), join(dir, 'npm', 'postext.js'));
chmodSync(join(dir, 'npm', 'postext.js'), 0o755);
copyFileSync(join(ROOT, 'bin', 'readme.txt'), join(dir, 'bin', 'readme.txt'));
copyFileSync(join(ROOT, 'README.md'), join(dir, 'README.md'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({
  name: pkg.name,
  ...common,
  description: pkg.description,
  keywords: pkg.keywords,
  type: 'module',
  bin: pkg.bin,
  files: pkg.files,
  optionalDependencies: optional,
}, null, 2) + '\n');
publish(dir);
