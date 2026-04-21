import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLayoutWorker } from 'postext/worker';
import type { LayoutWorkerHandle } from 'postext/worker';
import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { collectFontPayloadsForFamilies, getConfigFontFamilies } from '../controls/fontLoader';

export interface LayoutWorkerApi {
  /**
   * Build a VDT document on the worker. Cancels any in-flight build for the
   * same worker handle (last-wins). Returns the new doc, or rejects with an
   * `AbortError` if cancelled.
   */
  build(content: PostextContent, config?: PostextConfig): Promise<VDTDocument>;
}

interface WorkerBundle {
  handle: LayoutWorkerHandle;
  registeredFamilies: Set<string>;
  fontQueue: Promise<void>;
}

/**
 * One persistent worker per component mount. Fonts are registered lazily the
 * first time each family is seen for this worker. Unmounting disposes the
 * worker and aborts any pending build.
 */
export function useLayoutWorker(): LayoutWorkerApi {
  const bundleRef = useRef<WorkerBundle | null>(null);
  const currentAbortRef = useRef<AbortController | null>(null);

  function ensureBundle(): WorkerBundle | null {
    if (typeof window === 'undefined') return null;
    if (!bundleRef.current) {
      bundleRef.current = {
        handle: createLayoutWorker(),
        registeredFamilies: new Set(),
        fontQueue: Promise.resolve(),
      };
    }
    return bundleRef.current;
  }

  useEffect(() => {
    return () => {
      currentAbortRef.current?.abort();
      bundleRef.current?.handle.dispose();
      bundleRef.current = null;
    };
  }, []);

  const ensureFonts = useCallback(async (
    bundle: WorkerBundle,
    config?: PostextConfig,
  ): Promise<void> => {
    if (!config) return;
    const families = getConfigFontFamilies(config);
    const missing = families.filter((f) => !bundle.registeredFamilies.has(f));
    if (missing.length === 0) {
      // Already shipped every family the config needs. Just wait for any
      // in-flight registration so we don't race against a previous call that
      // is still loading woff2 bytes into the worker.
      await bundle.fontQueue;
      return;
    }
    // Reserve the missing families up front so a concurrent call can see
    // them as "in flight" and skip re-fetching the same bytes.
    for (const f of missing) bundle.registeredFamilies.add(f);
    const next = bundle.fontQueue.then(async () => {
      try {
        const payloads = await collectFontPayloadsForFamilies(missing);
        if (payloads.length > 0) {
          await bundle.handle.registerFonts(payloads);
        }
      } catch (err) {
        // Failed registration: free the family slots so a retry can fetch
        // them again on the next build.
        for (const f of missing) bundle.registeredFamilies.delete(f);
        console.warn('[useLayoutWorker] font registration failed', err);
      }
    });
    bundle.fontQueue = next;
    await next;
  }, []);

  const build = useCallback(async (content: PostextContent, config?: PostextConfig) => {
    const bundle = ensureBundle();
    if (!bundle) throw new Error('Layout worker unavailable (SSR?)');
    currentAbortRef.current?.abort();
    const controller = new AbortController();
    currentAbortRef.current = controller;

    await ensureFonts(bundle, config);
    if (controller.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await bundle.handle.build(content, config, { signal: controller.signal });
    } finally {
      if (currentAbortRef.current === controller) currentAbortRef.current = null;
    }
  }, [ensureFonts]);

  return useMemo(() => ({ build }), [build]);
}
