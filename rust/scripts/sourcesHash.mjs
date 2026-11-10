// The hash of what the WebAssembly line breaker is built from (#1463): the
// sources and manifests of the crates it compiles, the workspace manifest,
// the lockfile and the pinned toolchain. build-wasm.mjs writes it into
// bytes.generated.ts, and a test of the engine fails when the sources no
// longer hash to it: the module was not rebuilt after a change.
//
//   node rust/scripts/sourcesHash.mjs    # prints it

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rustRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The crates the module compiles (`postext-wasm` and what it depends on). */
const CRATES = ['crates/linebreak', 'crates/wasm'];
const TOP = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'];

function rustFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...rustFiles(p));
    else if (e.name.endsWith('.rs')) out.push(p);
  }
  return out;
}

/** The files hashed, relative to rust/, in a fixed order. */
export function wasmSourceFiles(root = rustRoot) {
  const files = [...TOP.map((f) => join(root, f))];
  for (const c of CRATES) files.push(join(root, c, 'Cargo.toml'), ...rustFiles(join(root, c, 'src')));
  return files.map((f) => relative(root, f).split('\\').join('/')).sort();
}

/** SHA-256 over each file's path and contents (line endings as LF). */
export function wasmSourcesHash(root = rustRoot) {
  const h = createHash('sha256');
  for (const f of wasmSourceFiles(root)) {
    h.update(`${f}\0`);
    h.update(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'));
    h.update('\0');
  }
  return h.digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(wasmSourcesHash());
}
