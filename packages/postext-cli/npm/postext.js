#!/usr/bin/env node
// `npx postext-cli` / `postext` installed from npm: runs the executable of
// this platform, which npm installed as one of the optional dependencies
// (postext-cli-<os>-<arch>). The executable needs no Node.js; this file
// only finds it.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const os = { darwin: 'macos', linux: 'linux', win32: 'windows' }[process.platform];
const arch = { arm64: 'arm64', x64: 'x64' }[process.arch];
const musl = process.platform === 'linux' && !process.report?.getReport()?.header?.glibcVersionRuntime;
const name = `postext-cli-${os}-${arch}${musl ? '-musl' : ''}`;
const exe = `postext${process.platform === 'win32' ? '.exe' : ''}`;

let bin;
try {
  bin = require.resolve(`${name}/bin/${exe}`);
} catch {
  console.error(`postext: no executable for ${process.platform}-${process.arch}${musl ? ' (musl)' : ''} (package ${name}).`);
  console.error('Download one from https://github.com/drnachio/postext/releases/latest');
  process.exit(1);
}
const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error(`postext: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
