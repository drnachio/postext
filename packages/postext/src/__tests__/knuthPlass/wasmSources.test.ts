/**
 * The committed WebAssembly line breaker against its Rust sources (#1463):
 * bytes.generated.ts carries the hash of the sources it was built from
 * (rust/scripts/sourcesHash.mjs). A change to the Rust crates, the lockfile
 * or the pinned toolchain without `node rust/scripts/build-wasm.mjs` fails
 * here. CI's WebAssembly job rebuilds the module and checks the bytes.
 */
import { describe, expect, it } from 'vitest';
import { LINEBREAK_WASM_SOURCES } from '../../knuthPlass/wasm/bytes.generated.js';

const script = new URL('../../../../../rust/scripts/sourcesHash.mjs', import.meta.url).href;

describe('the WebAssembly line breaker', () => {
  it('was built from the Rust sources in the repository', async () => {
    const { wasmSourcesHash } = (await import(/* @vite-ignore */ script)) as { wasmSourcesHash: () => string };
    expect(LINEBREAK_WASM_SOURCES, 'the Rust sources changed: run node rust/scripts/build-wasm.mjs').toBe(wasmSourcesHash());
  });
});
