import { createLayoutWorker } from 'postext/worker';
import type { BuildProgress, BuildStats, LayoutWorkerHandle } from 'postext/worker';
import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import { collectFontPayloadsForFamilies, getConfigFontFamilies, onCustomFontsChanged } from '../controls/fontLoader';
import { resourcesKeyOf } from '../book/layoutKeys';
import { perfSizeKb, perfSpan } from '../perf/marks';

/** Who is asking, by urgency: what the reader is looking at, what they
 *  asked for, what runs behind their back. */
export type LayoutPriority = 'preview' | 'pdf' | 'background';

const RANK: Record<LayoutPriority, number> = { preview: 0, pdf: 1, background: 2 };

export interface LayoutRequest {
  /** One client keeps one build: a new request from the same client
   *  supersedes its earlier one (queued or running). */
  clientId: string;
  priority: LayoutPriority;
  content: PostextContent;
  config: PostextConfig;
  /** Fingerprint of everything the document depends on; the worker keeps
   *  the last few documents by it. Omit for a document not worth keeping. */
  cacheKey?: string;
  onProgress?: (progress: BuildProgress) => void;
}

export interface LayoutService {
  /** Lay `content` out on the shared worker. Rejects with an `AbortError`
   *  when a later request from the same client supersedes this one, or
   *  when the client is cancelled. */
  build(request: LayoutRequest): Promise<VDTDocument>;
  /** Drop whatever `clientId` has pending (a component unmounting). */
  cancel(clientId: string): void;
  dispose(): void;
  /** Disposed services reject every build: the host makes a new one. */
  readonly disposed: boolean;
}

interface Entry {
  request: LayoutRequest;
  resolve: (doc: VDTDocument) => void;
  reject: (err: unknown) => void;
  /** Set while the entry runs on the worker. */
  controller: AbortController | null;
  /** The running build was interrupted for a more urgent one and goes
   *  back to the queue when the worker acknowledges the cancel. */
  requeue: boolean;
  /** The running build was superseded or cancelled: its rejection is final. */
  dropped: boolean;
}

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

/**
 * One layout worker for the whole sandbox — previews, the PDF tab and the
 * background paginator share its fonts, its measurement cache and its
 * document cache — with one build in flight at a time, chosen by priority:
 * a preview's build goes before the PDF's, which goes before a background
 * chapter's. A more urgent request interrupts a less urgent build (the
 * worker stops at the next pass) and puts it back in the queue, promise
 * still pending, so a paginator never loses a chapter to the reader's
 * typing. Within one client the last request wins: the earlier one is
 * cancelled and rejected.
 */
export function createLayoutService(options?: { handle?: LayoutWorkerHandle }): LayoutService {
  const handle = options?.handle ?? createLayoutWorker();
  const queue: Entry[] = [];
  let active: Entry | null = null;
  let disposed = false;

  // --- fonts: registered lazily, once per family, for the worker's lifetime
  const registeredFamilies = new Set<string>();
  let fontQueue: Promise<void> = Promise.resolve();
  const unsubscribeFonts = onCustomFontsChanged((families) => {
    const toUnregister = families.filter((f) => registeredFamilies.has(f));
    for (const f of families) registeredFamilies.delete(f);
    if (toUnregister.length === 0) return;
    fontQueue = fontQueue.then(() =>
      handle.unregisterFonts(toUnregister).catch((err) => {
        console.warn('[LayoutService] font unregister failed', err);
      }),
    );
  });

  const ensureFonts = async (config: PostextConfig): Promise<void> => {
    const families = getConfigFontFamilies(config);
    const missing = families.filter((f) => !registeredFamilies.has(f));
    if (missing.length === 0) {
      await fontQueue;
      return;
    }
    for (const f of missing) registeredFamilies.add(f);
    const next = fontQueue.then(async () => {
      try {
        const payloads = await collectFontPayloadsForFamilies(missing);
        if (payloads.length > 0) await handle.registerFonts(payloads);
        const delivered = new Set(payloads.map((p) => p.family));
        for (const f of missing) if (!delivered.has(f)) registeredFamilies.delete(f);
      } catch (err) {
        for (const f of missing) registeredFamilies.delete(f);
        console.warn('[LayoutService] font registration failed', err);
      }
    });
    fontQueue = next;
    await next;
  };

  // --- the queue
  const takeNext = (): Entry | null => {
    if (queue.length === 0) return null;
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if (RANK[queue[i]!.request.priority] < RANK[queue[best]!.request.priority]) best = i;
    }
    return queue.splice(best, 1)[0]!;
  };

  const run = async (entry: Entry): Promise<void> => {
    active = entry;
    const controller = new AbortController();
    entry.controller = controller;
    const { request } = entry;
    const span = perfSpan('worker.build', {
      client: request.priority,
      markdownKb: Math.round(request.content.markdown.length / 1024),
      contentKb: perfSizeKb(request.content),
    });
    let stats: BuildStats | null = null;
    try {
      await ensureFonts(request.config);
      if (controller.signal.aborted) throw abortError();
      const doc = await handle.build(request.content, request.config, {
        signal: controller.signal,
        onProgress: request.onProgress,
        onStats: (s) => { stats = s; },
        resourcesKey: request.content.resources ? resourcesKeyOf(request.content.resources) : undefined,
        cacheKey: request.cacheKey,
      });
      const built = stats as BuildStats | null;
      span.end({
        pages: doc.pages.length,
        docKb: perfSizeKb(doc),
        cached: built?.cached ?? false,
        workerMs: built?.totalMs,
        passes: built?.passes.length,
        passMs: built?.passes.map((p) => Math.round(p.ms)).join('/'),
      });
      entry.resolve(doc);
    } catch (err) {
      const aborted = (err as { name?: string } | null)?.name === 'AbortError';
      if (aborted && entry.requeue && !entry.dropped && !disposed) {
        span.end({ requeued: true });
        entry.requeue = false;
        entry.controller = null;
        queue.push(entry);
      } else {
        span.end({ aborted });
        entry.reject(err);
      }
    } finally {
      if (active === entry) active = null;
      pump();
    }
  };

  const pump = (): void => {
    if (disposed || active) return;
    const next = takeNext();
    if (next) void run(next);
  };

  const interrupt = (entry: Entry, requeue: boolean): void => {
    entry.requeue = requeue;
    entry.dropped = !requeue;
    entry.controller?.abort();
  };

  return {
    get disposed() { return disposed; },
    build(request) {
      if (disposed) return Promise.reject(new Error('Layout service disposed'));
      return new Promise<VDTDocument>((resolve, reject) => {
        // Last wins within a client: the earlier request is dropped.
        for (let i = queue.length - 1; i >= 0; i--) {
          const q = queue[i]!;
          if (q.request.clientId === request.clientId) {
            queue.splice(i, 1);
            q.reject(abortError());
          }
        }
        if (active?.request.clientId === request.clientId) interrupt(active, false);
        // A more urgent request interrupts a less urgent build, which
        // returns to the queue once the worker has stopped it.
        else if (active && RANK[request.priority] < RANK[active.request.priority] && !active.requeue) interrupt(active, true);
        queue.push({ request, resolve, reject, controller: null, requeue: false, dropped: false });
        pump();
      });
    },
    cancel(clientId) {
      for (let i = queue.length - 1; i >= 0; i--) {
        const q = queue[i]!;
        if (q.request.clientId === clientId) {
          queue.splice(i, 1);
          q.reject(abortError());
        }
      }
      if (active?.request.clientId === clientId) interrupt(active, false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeFonts();
      for (const q of queue.splice(0)) q.reject(abortError());
      if (active) interrupt(active, false);
      handle.dispose();
    },
  };
}
