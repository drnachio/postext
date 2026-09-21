import { useCallback, useEffect, useId, useMemo } from 'react';
import type { BuildProgress } from 'postext/worker';

export type { BuildProgress } from 'postext/worker';
import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { useLayoutService } from './LayoutServiceContext';
import type { LayoutPriority } from './LayoutService';

export interface LayoutWorkerApi {
  /**
   * Build a VDT document on the sandbox's shared worker. Cancels any
   * in-flight build of this component (last-wins). Returns the new doc, or
   * rejects with an `AbortError` if cancelled.
   */
  build(
    content: PostextContent,
    config: PostextConfig,
    opts?: { onProgress?: (progress: BuildProgress) => void; cacheKey?: string },
  ): Promise<VDTDocument>;
}

/**
 * A component's handle on the shared layout service: one client id for
 * its lifetime, its builds at `priority`, cancelled when it unmounts.
 */
export function useLayoutWorker(priority: LayoutPriority = 'preview'): LayoutWorkerApi {
  const service = useLayoutService();
  const clientId = useId();

  useEffect(() => {
    return () => { service.cancel(clientId); };
  }, [service, clientId]);

  const build = useCallback(
    (content: PostextContent, config: PostextConfig, opts?: { onProgress?: (progress: BuildProgress) => void; cacheKey?: string }) =>
      service.build({ clientId, priority, content, config, cacheKey: opts?.cacheKey, onProgress: opts?.onProgress }),
    [service, clientId, priority],
  );

  return useMemo(() => ({ build }), [build]);
}
