/// <reference lib="webworker" />

import { buildDocumentAsync, BuildCancelledError } from '../pipeline';
import type { BuildPassInfo } from '../pipeline/build';
import { initMathEngine, isMathReady } from '../math';
import { createMeasurementCache, clearMeasurementCache } from '../measure';
import type { MeasurementCache } from '../measure';
import type { RequestMessage, ResponseMessage, FontPayload } from './protocol';
import type { PostextContent, Resource } from '../types';
import type { VDTDocument } from '../vdt';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const registeredFaces = new Set<string>();
let measurementCache: MeasurementCache = createMeasurementCache();
let currentBuildId: number | null = null;
let cancelRequestedFor: number | null = null;
/** The last few documents built, by the fingerprint the host sent with
 *  the build (`cacheKey`): a chapter paginated in the background and then
 *  opened, or opened again, costs no pass. Dropped whenever the fonts
 *  change, as the measurements are. */
const DOC_CACHE_SLOTS = 8;
const docCache = new Map<string, VDTDocument>();

function docCacheGet(key: string): VDTDocument | undefined {
  const hit = docCache.get(key);
  if (hit) {
    docCache.delete(key);
    docCache.set(key, hit);
  }
  return hit;
}

function docCachePut(key: string, doc: VDTDocument): void {
  docCache.delete(key);
  docCache.set(key, doc);
  if (docCache.size > DOC_CACHE_SLOTS) {
    const oldest = docCache.keys().next().value;
    if (oldest !== undefined) docCache.delete(oldest);
  }
}

/** The resource list of the last build that carried one, by fingerprint. */
let heldResources: { key: string; resources: Resource[] } | null = null;

/** The build's content with its resources filled in from the held list
 *  when the message left them out (see `resourcesKey` in the protocol). */
function withHeldResources(content: PostextContent, resourcesKey: string | undefined): PostextContent {
  if (!resourcesKey) return content;
  if (content.resources) {
    heldResources = { key: resourcesKey, resources: content.resources };
    return content;
  }
  if (heldResources?.key === resourcesKey) return { ...content, resources: heldResources.resources };
  return content;
}

function faceKey(p: Pick<FontPayload, 'family' | 'weight' | 'style' | 'unicodeRange'>): string {
  return `${p.family}|${p.weight}|${p.style}|${p.unicodeRange ?? ''}`;
}

async function registerFonts(faces: FontPayload[]): Promise<void> {
  const fontSet = (ctx as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fontSet) return;
  let addedAny = false;
  await Promise.all(
    faces.map(async (face) => {
      const key = faceKey(face);
      if (registeredFaces.has(key)) return;
      try {
        const ff = new FontFace(face.family, face.buffer, {
          weight: face.weight,
          style: face.style,
          unicodeRange: face.unicodeRange,
        });
        await ff.load();
        fontSet.add(ff);
        registeredFaces.add(key);
        addedAny = true;
      } catch (err) {
        console.warn('[postext/worker] failed to register font', face.family, err);
      }
    }),
  );
  // Any build that measured text before these faces landed used fallback
  // metrics. Drop the block-level cache and pretext's glyph cache so the
  // next build re-measures with the real glyphs.
  if (addedAny) {
    measurementCache = createMeasurementCache();
    clearMeasurementCache();
    docCache.clear();
  }
}

function unregisterFonts(families: string[]): void {
  const fontSet = (ctx as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fontSet) return;
  const targets = new Set(families);
  const toRemove: FontFace[] = [];
  fontSet.forEach((ff) => {
    if (targets.has(ff.family)) toRemove.push(ff);
  });
  for (const ff of toRemove) {
    try { fontSet.delete(ff); } catch { /* ignore */ }
  }
  for (const key of Array.from(registeredFaces)) {
    const family = key.split('|', 1)[0]!;
    if (targets.has(family)) registeredFaces.delete(key);
  }
  // A dropped face may have been cached against old glyph metrics.
  measurementCache = createMeasurementCache();
  clearMeasurementCache();
  docCache.clear();
}

const PROGRESS_INTERVAL_MS = 80;

function post(msg: ResponseMessage): void {
  ctx.postMessage(msg);
}

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

type BuildRequest = Extract<RequestMessage, { kind: 'build' }>;

// Builds run one at a time, in the order they arrived: the build itself
// yields between passes (so a cancel can land), and two builds interleaved
// on the same measurement cache and hyphenator would step on each other.
const queue: BuildRequest[] = [];
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const msg = queue.shift();
      if (!msg) break;
      await runBuild(msg);
    }
  } finally {
    pumping = false;
  }
}

async function runBuild(msg: BuildRequest): Promise<void> {
  currentBuildId = msg.id;
  const content = withHeldResources(msg.content, msg.resourcesKey);
  try {
    const cached = msg.cacheKey ? docCacheGet(msg.cacheKey) : undefined;
    if (cached) {
      post({ kind: 'built', id: msg.id, doc: cached, stats: { passes: [], totalMs: 0, cached: true } });
      return;
    }
    // Bring MathJax up before the build path calls renderMath — otherwise
    // the VDT receives placeholder MathRenders and inline formulas paint as
    // grey boxes instead of glyphs. Skipped for docs that contain no `$…$`.
    if (!isMathReady() && /\$/.test(content.markdown)) {
      await initMathEngine();
      if (cancelRequestedFor === msg.id) {
        post({ kind: 'cancelled', id: msg.id });
        return;
      }
    }
    // Progress goes out at most every PROGRESS_INTERVAL_MS, plus on every
    // new page, so a long build paints a moving bar without flooding the
    // main thread.
    let lastProgressAt = 0;
    let lastPages = -1;
    const passes: BuildPassInfo[] = [];
    const startedAt = performance.now();
    const doc = await buildDocumentAsync(content, msg.config, measurementCache, {
      shouldCancel: () => cancelRequestedFor === msg.id,
      onPass: (info) => { passes.push(info); },
      onProgress: (progress) => {
        const now = Date.now();
        if (progress.pages === lastPages && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        lastPages = progress.pages;
        post({ kind: 'progress', id: msg.id, progress });
      },
    });
    if (cancelRequestedFor === msg.id) {
      post({ kind: 'cancelled', id: msg.id });
    } else {
      if (msg.cacheKey) docCachePut(msg.cacheKey, doc);
      post({ kind: 'built', id: msg.id, doc, stats: { passes, totalMs: performance.now() - startedAt } });
    }
  } catch (err) {
    if (err instanceof BuildCancelledError) {
      post({ kind: 'cancelled', id: msg.id });
    } else {
      post({ kind: 'error', id: msg.id, ...serializeError(err) });
    }
  } finally {
    if (currentBuildId === msg.id) currentBuildId = null;
    if (cancelRequestedFor === msg.id) cancelRequestedFor = null;
  }
}

ctx.addEventListener('message', async (event: MessageEvent<RequestMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'registerFonts': {
      try {
        await registerFonts(msg.faces);
        post({ kind: 'fontsRegistered', id: msg.id });
      } catch (err) {
        post({ kind: 'error', id: msg.id, ...serializeError(err) });
      }
      return;
    }
    case 'unregisterFonts': {
      try {
        unregisterFonts(msg.families);
        post({ kind: 'fontsUnregistered', id: msg.id });
      } catch (err) {
        post({ kind: 'error', id: msg.id, ...serializeError(err) });
      }
      return;
    }
    case 'build': {
      queue.push(msg);
      void pump();
      return;
    }
    case 'cancel': {
      if (currentBuildId === msg.id) {
        cancelRequestedFor = msg.id;
        return;
      }
      // Still waiting its turn: never started, so nothing to interrupt.
      const at = queue.findIndex((q) => q.id === msg.id);
      if (at >= 0) {
        queue.splice(at, 1);
        post({ kind: 'cancelled', id: msg.id });
      }
      return;
    }
    case 'dispose': {
      ctx.close();
      return;
    }
  }
});
