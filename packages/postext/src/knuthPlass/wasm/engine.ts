/**
 * The Rust line breaker, compiled to WebAssembly (#779). It chooses the
 * breaks the TypeScript one chooses, the same arithmetic in the same order,
 * two to three times faster, so which of the two answers a paragraph never
 * changes a layout: the module is compiled on the first paragraph where
 * that can be done at once (a worker, Node, Bun), and in the background
 * where it cannot (a page's main thread, where a browser compiles a module
 * this size only asynchronously); until it is ready, and wherever
 * WebAssembly is missing or refused, the TypeScript breaker answers.
 */

import { wasmBreaker, type Breaker } from './abi';
import { LINEBREAK_WASM_BASE64 } from './bytes.generated';

let breaker: Breaker | null = null;
let pending: Promise<boolean> | null = null;
/** The module could not be compiled here: never tried again. */
let unavailable = false;
/** Off by {@link useWasmLineBreaker}. */
let enabled = true;

function moduleBytes(): Uint8Array<ArrayBuffer> {
  const text = atob(LINEBREAK_WASM_BASE64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/**
 * Compiles the WebAssembly line breaker, in the background. Resolves true
 * when it answers from then on, false where WebAssembly is unavailable.
 * The engine starts it on its own; a host may call it early so that the
 * first layout of a page already uses it.
 */
export function initLineBreaker(): Promise<boolean> {
  if (breaker) return Promise.resolve(true);
  if (unavailable || typeof WebAssembly === 'undefined') return Promise.resolve(false);
  pending ??= WebAssembly.instantiate(moduleBytes(), {}).then(
    ({ instance }) => {
      breaker = wasmBreaker(instance);
      return true;
    },
    () => {
      unavailable = true;
      return false;
    },
  );
  return pending;
}

/** The WebAssembly breaker when it can answer now, else null (and the
 *  module compiles in the background when it cannot be compiled at once). */
export function readyWasmBreaker(): Breaker | null {
  if (breaker || !enabled || unavailable) return enabled ? breaker : null;
  if (pending) return null;
  if (typeof WebAssembly === 'undefined') {
    unavailable = true;
    return null;
  }
  try {
    breaker = wasmBreaker(new WebAssembly.Instance(new WebAssembly.Module(moduleBytes()), {}));
  } catch {
    // A page's main thread compiles a module this size only
    // asynchronously; a policy (CSP) may refuse it altogether.
    void initLineBreaker();
  }
  return breaker;
}

/**
 * Whether paragraphs are broken by the WebAssembly line breaker when it is
 * available (the default) or always by the TypeScript one. The two choose
 * the same breaks: this is for measuring and testing them.
 */
export function useWasmLineBreaker(on: boolean): void {
  enabled = on;
}
