/// <reference lib="webworker" />

import { buildDocument, BuildCancelledError } from '../pipeline';
import { initMathEngine, isMathReady } from '../math';
import { createMeasurementCache, clearMeasurementCache } from '../measure';
import type { MeasurementCache } from '../measure';
import type { RequestMessage, ResponseMessage, FontPayload } from './protocol';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const registeredFaces = new Set<string>();
let measurementCache: MeasurementCache = createMeasurementCache();
let currentBuildId: number | null = null;
let cancelRequestedFor: number | null = null;

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
  }
}

function post(msg: ResponseMessage): void {
  ctx.postMessage(msg);
}

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
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
    case 'build': {
      currentBuildId = msg.id;
      // Yield once so a cancel posted right after the build can be observed
      // before we start the CPU-bound work.
      await Promise.resolve();
      try {
        // Bring MathJax up before the (sync) build path calls renderMath —
        // otherwise the VDT receives placeholder MathRenders and inline
        // formulas paint as grey boxes instead of glyphs. Skipped for docs
        // that contain no `$…$`.
        if (!isMathReady() && /\$/.test(msg.content.markdown)) {
          await initMathEngine();
          if (cancelRequestedFor === msg.id) {
            post({ kind: 'cancelled', id: msg.id });
            return;
          }
        }
        const doc = buildDocument(msg.content, msg.config, measurementCache, {
          shouldCancel: () => cancelRequestedFor === msg.id,
        });
        if (cancelRequestedFor === msg.id) {
          cancelRequestedFor = null;
          post({ kind: 'cancelled', id: msg.id });
        } else {
          post({ kind: 'built', id: msg.id, doc });
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
      return;
    }
    case 'cancel': {
      if (currentBuildId === msg.id) cancelRequestedFor = msg.id;
      return;
    }
    case 'dispose': {
      ctx.close();
      return;
    }
  }
});
