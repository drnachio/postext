// Build the self-contained executables: one per platform, each with the Bun
// runtime, the engine, Skia (@napi-rs/canvas), HarfBuzz, the ICC profiles
// and the default fonts inside. Cross-compiles from any machine.
//
//   bun scripts/build-bin.ts                 every target
//   bun scripts/build-bin.ts macos-arm64     some targets (by name)
//   bun scripts/build-bin.ts --current       this machine's target only
//
// Skia's native addon differs per platform: its package for each target is
// fetched from the npm registry (cached in node_modules/.cache) and the
// addon's loader is swapped for a static require of that file, which
// `bun build --compile` embeds.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BunPlugin } from 'bun';

const ROOT = resolve(import.meta.dir, '..');
const BIN = join(ROOT, 'bin');
const CACHE = join(ROOT, 'node_modules', '.cache', 'postext-cli');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
const napiPkg = JSON.parse(readFileSync(join(ROOT, 'node_modules', '@napi-rs', 'canvas', 'package.json'), 'utf8')) as { version: string };

export interface Target {
  /** Name in the file and on the command line. */
  name: string;
  bun: string;
  /** Suffix of the @napi-rs/canvas platform package. */
  napi: string;
  os: 'macos' | 'linux' | 'windows';
  label: string;
  exe?: boolean;
}

export const TARGETS: Target[] = [
  { name: 'macos-arm64', bun: 'bun-darwin-arm64', napi: 'darwin-arm64', os: 'macos', label: 'macOS, Apple silicon (M1 and later)' },
  { name: 'macos-x64', bun: 'bun-darwin-x64', napi: 'darwin-x64', os: 'macos', label: 'macOS, Intel' },
  { name: 'linux-x64', bun: 'bun-linux-x64', napi: 'linux-x64-gnu', os: 'linux', label: 'Linux x86-64 (glibc: Debian, Ubuntu, Fedora…)' },
  { name: 'linux-arm64', bun: 'bun-linux-arm64', napi: 'linux-arm64-gnu', os: 'linux', label: 'Linux ARM64 (glibc: Raspberry Pi OS 64-bit, Graviton…)' },
  { name: 'linux-x64-musl', bun: 'bun-linux-x64-musl', napi: 'linux-x64-musl', os: 'linux', label: 'Linux x86-64, musl (Alpine)' },
  { name: 'windows-x64', bun: 'bun-windows-x64', napi: 'win32-x64-msvc', os: 'windows', label: 'Windows x64', exe: true },
];

export const fileName = (t: Target) => `postext-${t.name}${t.exe ? '.exe' : ''}`;

function currentTarget(): Target {
  const os = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const t = TARGETS.find((x) => x.name === `${os}-${arch}`);
  if (!t) throw new Error(`No target for ${process.platform}-${process.arch}`);
  return t;
}

/** The Skia addon of a platform: from node_modules when installed, else
 *  from the npm registry. */
async function napiAddon(t: Target): Promise<string> {
  const file = `skia.${t.napi}.node`;
  const installed = join(ROOT, 'node_modules', '@napi-rs', `canvas-${t.napi}`, file);
  if (existsSync(installed)) return installed;
  const dir = join(CACHE, `canvas-${t.napi}-${napiPkg.version}`);
  const cached = join(dir, 'package', file);
  if (existsSync(cached)) return cached;
  const url = `https://registry.npmjs.org/@napi-rs/canvas-${t.napi}/-/canvas-${t.napi}-${napiPkg.version}.tgz`;
  console.log(`  fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  mkdirSync(dir, { recursive: true });
  const tgz = join(dir, 'package.tgz');
  writeFileSync(tgz, new Uint8Array(await res.arrayBuffer()));
  const tar = Bun.spawnSync(['tar', '-xzf', tgz, '-C', dir]);
  if (tar.exitCode !== 0) throw new Error(`tar: ${tar.stderr.toString()}`);
  rmSync(tgz);
  if (!existsSync(cached)) throw new Error(`${url} has no ${file}`);
  return cached;
}

/** Load the given Skia addon instead of searching for one at run time.
 *  The addon is embedded as a plain file and copied once into the cache
 *  folder (~/.cache/postext/skia-<version>-<platform>.node): loaded from
 *  there, it starts in a few milliseconds instead of being unpacked to a
 *  temporary file on every run. Where the cache cannot be written, the
 *  embedded copy is loaded as it is. */
function napiPlugin(addon: string, t: Target): BunPlugin {
  const name = `skia-${napiPkg.version}-${t.napi}.node`;
  return {
    name: 'napi-canvas-addon',
    setup(build) {
      build.onResolve({ filter: /^postext-skia-addon$/ }, () => ({ path: 'postext-skia-addon', namespace: 'postext-skia' }));
      build.onLoad({ filter: /.*/, namespace: 'postext-skia' }, () => ({
        contents: `import path from ${JSON.stringify(addon)} with { type: 'file' };\nexport default path;\n`,
        loader: 'js',
      }));
      build.onLoad({ filter: /@napi-rs[\\/]canvas[\\/]js-binding\.js$/ }, () => ({
        contents: `
const fs = require('fs');
const nodePath = require('path');
const os = require('os');
const embedded = require('postext-skia-addon').default;
function cacheDir() {
  if (process.env.POSTEXT_CACHE_DIR) return process.env.POSTEXT_CACHE_DIR;
  if (process.platform === 'win32') return nodePath.join(process.env.LOCALAPPDATA || nodePath.join(os.homedir(), 'AppData', 'Local'), 'postext', 'cache');
  return nodePath.join(process.env.XDG_CACHE_HOME || nodePath.join(os.homedir(), '.cache'), 'postext');
}
function load() {
  try {
    const target = nodePath.join(cacheDir(), ${JSON.stringify(name)});
    const size = fs.statSync(embedded).size;
    let ok = false;
    try { ok = fs.statSync(target).size === size; } catch {}
    if (!ok) {
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      const tmp = target + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, fs.readFileSync(embedded));
      fs.renameSync(tmp, target);
    }
    return require(target);
  } catch {
    return require(embedded);
  }
}
module.exports = load();
`,
        loader: 'js',
      }));
    },
  };
}

async function buildTarget(t: Target): Promise<string> {
  const addon = await napiAddon(t);
  const outfile = join(BIN, fileName(t));
  const result = await Bun.build({
    entrypoints: [join(ROOT, 'src', 'main.ts')],
    compile: {
      target: t.bun as Bun.Build.CompileTarget,
      outfile,
      ...(t.os === 'windows' ? { windows: { title: 'postext', publisher: 'postext', version: `${pkg.version}.0`, description: 'postext command line' } } : {}),
    },
    minify: true,
    bytecode: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [napiPlugin(addon, t)],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Build failed for ${t.name}`);
  }
  // A macOS binary built on a Mac is ad-hoc signed again: Gatekeeper kills
  // an executable whose signature does not match its contents.
  if (t.os === 'macos' && process.platform === 'darwin') {
    const sign = Bun.spawnSync(['codesign', '--force', '--sign', '-', outfile]);
    if (sign.exitCode !== 0) throw new Error(`codesign: ${sign.stderr.toString()}`);
  }
  return outfile;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function mb(path: string): string {
  return `${(statSync(path).size / 1024 / 1024).toFixed(0)} MB`;
}

/** bin/readme.txt: what each file is, where to get it, how to run it. */
export function readme(version: string): string {
  const base = 'https://github.com/drnachio/postext/releases';
  const rows = TARGETS.map((t) => `  ${fileName(t).padEnd(28)} ${t.label}`);
  return `postext command line ${version}
${'='.repeat(`postext command line ${version}`.length)}

One self-contained executable per system: no installation, no runtime and
no libraries. The postext engine, the PDF, EPUB, HTML and Word writers,
the page painter (Skia), the default fonts (EB Garamond, Open Sans) and the
print colour profiles are all inside.

Executables (115 to 140 MB each)
--------------------------------

${rows.join('\n')}

Download the latest (every release of postext publishes them):

  ${base}/latest/download/<file>

  e.g. ${base}/latest/download/postext-linux-x64

or a given version: ${base}/tag/v${version}
SHA256SUMS lists the checksum of each file.

Install
-------

Linux and macOS:

  curl -fL -o postext ${base}/latest/download/postext-linux-x64
  chmod +x postext
  ./postext                       # prints the help
  sudo mv postext /usr/local/bin  # optional: run it from anywhere

Linux builds need only the C library every distribution has (glibc 2.27
or later; musl for Alpine, which also needs \`apk add libstdc++ libgcc\`).

macOS: a file downloaded with a browser is quarantined; clear the flag once:

  xattr -d com.apple.quarantine postext-macos-arm64

Windows (PowerShell):

  Invoke-WebRequest ${base}/latest/download/postext-windows-x64.exe -OutFile postext.exe
  .\\postext.exe

With Node.js installed, \`npx postext-cli\` downloads and runs the right one.

Use
---

  postext                                   help
  postext help <command>                    options of a command
  postext pdf book.postext -o book.pdf      PDF
  postext html book.postext -o book.html    HTML (one self-contained file)
  postext epub book.postext -o book.epub    EPUB 3
  postext image book.postext --page 1 -o p1.png        one page as an image
  postext images book.postext -o pages/ --dpi 100      every page
  postext docx book.postext -o book.docx    Word
  postext import-docx draft.docx -o draft/  Word to a postext book
  postext pack book/ -o book.postext        folder (or Markdown files) to a bundle
  postext unpack book.postext -o book/      bundle to a folder
  postext info book.postext                 chapters, fonts, resources
  postext check book.postext --json         problems, as JSON for scripts and agents
  postext build book/ --pdf b.pdf --html b.html --watch   several outputs, rebuild on change

A book is a .postext file, an unpacked folder with its preset.json, or loose
Markdown files (one chapter each) with --config, --resources and --fonts.
Fonts the book does not carry are looked up in --font-dir folders, then
downloaded once from Google Fonts into ~/.cache/postext (--offline never
downloads).

Exit codes: 0 done, 1 failed, 2 wrong usage, 3 check found problems.

Docs: https://postext.dev/docs · Source: https://github.com/drnachio/postext
`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targets = args.includes('--current')
    ? [currentTarget()]
    : args.filter((a) => !a.startsWith('--')).length > 0
      ? args.filter((a) => !a.startsWith('--')).map((n) => {
          const t = TARGETS.find((x) => x.name === n);
          if (!t) throw new Error(`Unknown target "${n}" (${TARGETS.map((x) => x.name).join(', ')})`);
          return t;
        })
      : TARGETS;
  mkdirSync(BIN, { recursive: true });
  const built = new Map<string, string>();
  for (const t of targets) {
    const started = performance.now();
    const path = await buildTarget(t);
    built.set(fileName(t), path);
    console.log(`${fileName(t)}  ${mb(path)}  ${Math.round(performance.now() - started)} ms`);
  }
  // Checksums of every executable in bin/ (built now or before).
  const present = readdirSync(BIN).filter((f) => f.startsWith('postext-')).sort();
  writeFileSync(join(BIN, 'SHA256SUMS'), present.map((f) => `${sha256(join(BIN, f))}  ${f}`).join('\n') + '\n');
  writeFileSync(join(BIN, 'readme.txt'), readme(pkg.version));
  console.log('bin/SHA256SUMS and bin/readme.txt written');
}

if (import.meta.main) await main();
