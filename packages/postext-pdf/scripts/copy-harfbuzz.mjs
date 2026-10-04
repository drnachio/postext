// Put HarfBuzz's WebAssembly binary in dist, beside dist/harfbuzz.js,
// which loads it from `new URL('./harfbuzz.wasm', import.meta.url)`: Node
// reads it there, a bundler emits it as an asset, and a CDN that serves
// the package's files (jsDelivr, unpkg) serves it from there.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = require.resolve('harfbuzzjs/dist/harfbuzz.wasm');
const target = new URL('../dist/harfbuzz.wasm', import.meta.url);
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
copyFileSync(source, target);
