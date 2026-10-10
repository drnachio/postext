import type { PostextContent, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';
import type { BuildProgress } from '../pipeline/build';

export type { BuildProgress } from '../pipeline/build';
import type { BuildStats, FontPayload, RequestMessage, ResponseMessage } from './protocol';
import { cdnWorkerEntryUrl } from './entryUrl';
import { fontSampleText, prepareFonts, type FontReport, type PrepareFontsOptions } from '../fonts/prepare';
import { registeredFontFiles } from '../svg/fontRegistry';

export type { BuildStats, FontPayload } from './protocol';
export type { BuildPassInfo } from '../pipeline/build';

/** A face for `registerFonts`: a `FontPayload` whose CSS weight may also be
 *  a number (`700` as well as `'700'` or `'bold'`). */
export type FontPayloadInput = Omit<FontPayload, 'weight'> & { weight: string | number };

export interface BuildOptions {
  signal?: AbortSignal;
  /** Called as the worker's placement advances (throttled by the worker). */
  onProgress?: (progress: BuildProgress) => void;
  /** Called with the finished build's pass timings, right before it resolves. */
  onStats?: (stats: BuildStats) => void;
  /** Fingerprint of `content.resources`. Consecutive builds with the same
   *  key ship the list once; the worker keeps it (see the protocol). */
  resourcesKey?: string;
  /** Fingerprint of the whole build; the worker answers a repeat from its
   *  document cache (see the protocol). */
  cacheKey?: string;
  /** @internal False: keep the document in the worker only (see `warm`). */
  wantDoc?: boolean;
}

export interface LayoutWorkerHandle {
  registerFonts(faces: FontPayloadInput[]): Promise<void>;
  /** Drop every face whose family matches one of `families` from the worker's
   *  face set so the next `registerFonts` for that family takes effect
   *  instead of being deduped against a stale face. */
  unregisterFonts(families: string[]): Promise<void>;
  build(
    content: PostextContent,
    config?: PostextConfig,
    opts?: BuildOptions,
  ): Promise<VDTDocument>;
  /** Build into the worker's document cache without sending the document
   *  back (`cacheKey` required): the next `build` with that key is a hit. */
  warm(
    content: PostextContent,
    config: PostextConfig | undefined,
    opts: BuildOptions & { cacheKey: string },
  ): Promise<void>;
  /**
   * `prepareFonts` on the page (#629), then the files of every face it
   * found that the font registry holds — the resolver's, a bundle's, the
   * page's readable `@font-face` rules — sent with `registerFonts`: the
   * worker has a font set of its own. Resolves with the page's report.
   */
  prepareFonts?(content: PostextContent, config?: PostextConfig, options?: PrepareFontsOptions): Promise<FontReport>;
  dispose(): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  onAbort?: () => void;
  onProgress?: (progress: BuildProgress) => void;
  onStats?: (stats: BuildStats) => void;
}

export interface CreateLayoutWorkerOptions {
  /**
   * Allows consumers to provide their own Worker instance. Useful for build
   * tooling that needs to control the worker URL resolution.
   */
  worker?: Worker;
  /**
   * URL of the worker entry module (`postext/worker/entry`) to start, when
   * it is not the file next to this module — a copy on your server, or a
   * CDN build such as `https://esm.sh/postext@1.4.2/worker/entry`. A URL on
   * another origin is started through a same-origin blob module that
   * imports it (a worker script must be same-origin; the CDN must allow
   * CORS). Ignored when `worker` is given.
   */
  url?: string | URL;
}

function pageLocation(): { origin?: string; href?: string } | undefined {
  return (globalThis as { location?: { origin?: string; href?: string } }).location;
}

/** Start a module worker at `url`, wrapped in a same-origin blob module when
 *  the page is on another origin. */
function startModuleWorker(url: string, pageOrigin: string | undefined): { worker: Worker; objectUrl?: string } {
  if (pageOrigin === undefined || new URL(url).origin === pageOrigin) {
    return { worker: new Worker(url, { type: 'module' }) };
  }
  const objectUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(url)};\n`], { type: 'text/javascript' }));
  return { worker: new Worker(objectUrl, { type: 'module' }), objectUrl };
}

function spawnLayoutWorker(options?: CreateLayoutWorkerOptions): { worker: Worker; objectUrl?: string } {
  if (options?.worker) return { worker: options.worker };
  const location = pageLocation();
  const pageOrigin = location?.origin && location.origin !== 'null' ? location.origin : undefined;
  if (options?.url !== undefined) return startModuleWorker(new URL(String(options.url), location?.href).href, pageOrigin);
  // Loaded from a CDN (esm.sh): the file next to this module is not served
  // there, and would be cross-origin anyway; start the CDN's worker entry.
  const cdnEntry = cdnWorkerEntryUrl(import.meta.url, pageOrigin);
  if (cdnEntry) return startModuleWorker(cdnEntry, pageOrigin);
  // Bundlers (Vite, webpack, Next.js) recognise this exact expression and
  // emit the worker as a chunk of its own: keep it inline.
  return { worker: new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' }) };
}

export function createLayoutWorker(
  options?: CreateLayoutWorkerOptions,
): LayoutWorkerHandle {
  const spawned = spawnLayoutWorker(options);
  const worker = spawned.worker;
  /** The blob wrapper's URL, revoked once the worker has answered (it has
   *  loaded the module by then) or is disposed. */
  let objectUrl = spawned.objectUrl;
  const releaseObjectUrl = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };

  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();
  /** Fingerprint of the resource list the worker holds (messages are
   *  handled in order, so once sent it is there for every later build). */
  let sentResourcesKey: string | null = null;
  /** Families already reported as missing in the worker (warned once). */
  const reportedMissingFonts = new Set<string>();

  worker.addEventListener('message', (event: MessageEvent<ResponseMessage>) => {
    releaseObjectUrl();
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    switch (msg.kind) {
      case 'progress':
        entry.onProgress?.(msg.progress);
        return;
      case 'built':
        pending.delete(msg.id);
        for (const family of msg.stats.missingFonts ?? []) {
          if (reportedMissingFonts.has(family)) continue;
          reportedMissingFonts.add(family);
          console.warn(
            `[postext/worker] "${family}" is not available inside the layout worker, so its text was measured with a fallback font. `
            + 'A worker does not share the page\'s fonts: send the faces with registerFonts() before building.',
          );
        }
        entry.onStats?.(msg.stats);
        entry.resolve(msg.doc ?? undefined);
        return;
      case 'fontsRegistered':
        pending.delete(msg.id);
        entry.resolve(undefined);
        return;
      case 'fontsUnregistered':
        pending.delete(msg.id);
        entry.resolve(undefined);
        return;
      case 'cancelled':
        pending.delete(msg.id);
        entry.reject(new DOMException('Build cancelled', 'AbortError'));
        return;
      case 'error':
        pending.delete(msg.id);
        entry.reject(Object.assign(new Error(msg.message), { stack: msg.stack }));
        return;
    }
  });

  worker.addEventListener('error', (event) => {
    releaseObjectUrl();
    for (const entry of pending.values()) {
      entry.reject(new Error(event.message || 'Worker error'));
    }
    pending.clear();
  });

  function send(msg: RequestMessage, transfer?: Transferable[]): void {
    if (disposed) throw new Error('Layout worker has been disposed');
    if (transfer && transfer.length > 0) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  }

  return {
    registerFonts(faces) {
      const id = nextId++;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, {
          resolve: () => resolve(),
          reject,
        });
        send(
          { kind: 'registerFonts', id, faces: faces.map((f) => ({ ...f, weight: String(f.weight) })) },
          faces.map((f) => f.buffer),
        );
      });
    },
    unregisterFonts(families) {
      const id = nextId++;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, {
          resolve: () => resolve(),
          reject,
        });
        send({ kind: 'unregisterFonts', id, families });
      });
    },
    async prepareFonts(content, config, options) {
      const report = await prepareFonts(content, config, options);
      const codePoints = new Set<number>();
      for (const ch of fontSampleText(content, config)) codePoints.add(ch.codePointAt(0)!);
      const files = (await Promise.all([...report.loaded, ...report.synthesized].map((f) =>
        registeredFontFiles(f.family, f.weight, f.style, { codePoints, styleSheets: true })))).flat();
      const seen = new Set<string>();
      const payloads: FontPayloadInput[] = [];
      for (const f of files) {
        const key = `${f.family}|${f.weight}|${f.style}|${f.unicodeRange ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // A copy: the transfer detaches the buffer, the registry keeps its own.
        payloads.push({ family: f.family, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, buffer: f.bytes.slice().buffer });
      }
      if (payloads.length > 0) await this.registerFonts(payloads);
      return report;
    },
    warm(content, config, opts) {
      return this.build(content, config, { ...opts, wantDoc: false }).then(() => undefined);
    },
    build(content, config, opts) {
      const id = nextId++;
      return new Promise<VDTDocument>((resolve, reject) => {
        if (opts?.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        // Abort settles the promise right away and forgets the id: the
        // worker is asked to stop, but whatever it still posts for this
        // build (a `built` it could not interrupt) is dropped on arrival
        // instead of resolving a caller that moved on.
        const onAbort = () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          try { send({ kind: 'cancel', id }); } catch { /* disposed */ }
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (opts?.signal) {
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        pending.set(id, {
          resolve: (v) => resolve(v as VDTDocument),
          reject: (err) => {
            opts?.signal?.removeEventListener('abort', onAbort);
            reject(err);
          },
          onAbort,
          onProgress: opts?.onProgress,
          onStats: opts?.onStats,
        });
        let payload = content;
        const resourcesKey = opts?.resourcesKey;
        if (resourcesKey && content.resources) {
          if (sentResourcesKey === resourcesKey) payload = { ...content, resources: undefined };
          else sentResourcesKey = resourcesKey;
        }
        send({ kind: 'build', id, content: payload, config, resourcesKey, cacheKey: opts?.cacheKey, wantDoc: opts?.wantDoc });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseObjectUrl();
      try { worker.postMessage({ kind: 'dispose' } satisfies RequestMessage); } catch { /* ignore */ }
      worker.terminate();
      for (const entry of pending.values()) {
        entry.reject(new DOMException('Worker disposed', 'AbortError'));
      }
      pending.clear();
    },
  };
}
