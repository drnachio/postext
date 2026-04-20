type DecompressFn = (input: Uint8Array) => Uint8Array | Promise<Uint8Array>;

let wawoff2Promise: Promise<DecompressFn> | null = null;

function loadWawoff2(): Promise<DecompressFn> {
  if (!wawoff2Promise) {
    wawoff2Promise = (async () => {
      const mod = await import('wawoff2');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyMod = mod as any;
      const fn: DecompressFn | undefined =
        typeof anyMod === 'function'
          ? anyMod
          : typeof anyMod.decompress === 'function'
            ? anyMod.decompress
            : typeof anyMod.default === 'function'
              ? anyMod.default
              : typeof anyMod.default?.decompress === 'function'
                ? anyMod.default.decompress
                : undefined;
      if (!fn) throw new Error('wawoff2: no decompress export');
      return fn;
    })();
  }
  return wawoff2Promise;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Decompress a WOFF2 (RFC 8844) binary to raw TTF/OTF bytes. The WASM
 * decoder weighs ~200 KB and is loaded lazily on first use.
 *
 * Calls are serialized and the output is copied out of WASM memory: the
 * emscripten-generated module keeps a single shared heap, so concurrent
 * invocations corrupt each other, and the returned Uint8Array is a live
 * view that a subsequent call would overwrite.
 */
export async function decompressWoff2(input: Uint8Array): Promise<Uint8Array> {
  const run = async (): Promise<Uint8Array> => {
    const decompress = await loadWawoff2();
    const out = await decompress(input);
    const view = out instanceof Uint8Array ? out : new Uint8Array(out);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
