// Publish the libraries on JSR (#1417), run after they are built. JSR gets
// what npm gets, each package's `dist` and the other files of its `files`:
// the sources alone would lack what the build makes (the MathJax bundle, the
// WOFF2 decoder, the embedded CSL styles).
//
// Everything JSR needs that npm does not is written into a temporary copy,
// so there is no second manifest to keep in sync:
//   - a `deno.json` per package, from its `package.json`;
//   - `@ts-self-types` at the top of each module, naming its `.d.ts`;
//   - no `/// <reference lib>`, which JSR refuses;
//   - the module doc of an entry that only has side effects, which `tsc` leaves
//     out of its empty declaration file.
//
// A version already on JSR is left alone, so a rerun is safe. Plain Node, no
// dependencies, and `deno` on the PATH. `--dry-run` publishes nothing.
//
//   node .github/scripts/jsr-publish.mjs [--dry-run]

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dryRun = process.argv.includes('--dry-run');
const MAX_BYTES = 20_000_000;

// npm name → JSR name
const PACKAGES = {
  postext: '@postext/postext',
  'postext-pdf': '@postext/pdf',
  'postext-epub': '@postext/epub',
  'postext-folio': '@postext/folio',
  'postext-citeproc': '@postext/citeproc',
  'postext-scorm': '@postext/scorm',
};

const manifests = Object.fromEntries(
  Object.keys(PACKAGES).map((name) => [name, JSON.parse(readFileSync(join(ROOT, 'packages', name, 'package.json'), 'utf8'))]),
);

/** The modules a package exports, without the ones JSR has no use for: the
 *  manifest itself, and wildcards (the ICC profiles), which JSR refuses. */
function moduleExports(pkg) {
  const out = {};
  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key === './package.json' || key.includes('*')) continue;
    out[key] = typeof value === 'string' ? value : value.default;
  }
  return out;
}

function installedMajor(dir, name) {
  const { version } = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8'));
  return version.split('.')[0];
}

/** The import map of a package: its dependencies and peers, the other
 *  libraries from JSR (two copies of `postext` would not share its state),
 *  the rest from npm. */
function importMap(pkg, dir) {
  const imports = {};
  for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    const sibling = PACKAGES[name];
    if (sibling) {
      const at = `jsr:${sibling}@^${manifests[name].version}`;
      for (const key of Object.keys(moduleExports(manifests[name]))) {
        imports[name + key.slice(1)] = at + key.slice(1);
      }
    } else {
      // A specifier takes no `>=`, which is how the peers state their floor,
      // and JSR refuses `*`: the major version the repository tests with.
      const version = range.startsWith('>=') ? `${installedMajor(dir, name)}.x` : range;
      imports[name] = `npm:${name}@${version}`;
      imports[`${name}/`] = `npm:/${name}@${version}/`;
    }
  }
  return imports;
}

/** Tests, benches and source maps stay out: npm's `files` carries them along
 *  with `dist`, and JSR takes 20 MB per version. */
function shipped(path) {
  const name = basename(path);
  return !['__tests__', '__bench__', '__fixtures__'].includes(name) && !name.endsWith('.map') && !name.includes('.test.');
}

/** Ready one file for JSR, in place. */
function prepare(file) {
  if (!/\.(js|d\.ts)$/.test(file)) return;
  let text = readFileSync(file, 'utf8').replace(/^\/\/\/ <reference lib="[^"]*" \/>\r?\n/m, '');
  text = text.replace(/^\/\/# sourceMappingURL=.*$/m, '');
  if (file.endsWith('.d.ts') && /^export \{\};\s*$/.test(text)) {
    const doc = readFileSync(file.replace(/\.d\.ts$/, '.js'), 'utf8').match(/\/\*\*(?:(?!\*\/)[\s\S])*@module\s*\*\//);
    if (doc) text = `${doc[0]}\n${text}`;
  }
  const types = file.replace(/\.js$/, '.d.ts');
  if (file.endsWith('.js') && existsSync(types)) {
    text = `/* @ts-self-types="./${basename(types)}" */\n${text}`;
  }
  writeFileSync(file, text);
}

/** Ready every file of a folder; its size in bytes once they are ready. */
function prepareAll(dir) {
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      bytes += prepareAll(path);
    } else {
      prepare(path);
      bytes += statSync(path).size;
    }
  }
  return bytes;
}

const stage = mkdtempSync(join(tmpdir(), 'postext-jsr-'));
try {
  for (const [name, jsrName] of Object.entries(PACKAGES)) {
    const pkg = manifests[name];
    const from = join(ROOT, 'packages', name);
    const to = join(stage, name);
    mkdirSync(to);
    if (!existsSync(join(from, 'dist'))) throw new Error(`Missing ${from}/dist: run the build first`);
    for (const entry of [...pkg.files, 'README.md']) {
      cpSync(join(from, entry), join(to, entry), { recursive: true, filter: shipped });
    }
    const bytes = prepareAll(to);
    console.log(`${jsrName}@${pkg.version}: ${(bytes / 1e6).toFixed(1)} MB`);
    if (bytes >= MAX_BYTES) throw new Error(`${jsrName} is past JSR's 20 MB: ask quotas@jsr.io for more`);
    writeFileSync(join(to, 'deno.json'), JSON.stringify({
      name: jsrName,
      version: pkg.version,
      license: pkg.license,
      exports: moduleExports(pkg),
      imports: importMap(pkg, from),
    }, null, 2));
  }
  writeFileSync(join(stage, 'deno.json'), JSON.stringify({ workspace: Object.keys(PACKAGES).map((name) => `./${name}`) }, null, 2));

  // `--no-check`: `tsc` has already checked these types, against the DOM
  // library Deno's own check would not load.
  const args = ['publish', '--no-check', '--allow-dirty', ...(dryRun ? ['--dry-run'] : [])];
  console.log(`deno ${args.join(' ')}  (${stage})`);
  execFileSync('deno', args, { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
