// Waiting for the pen to settle, and the PDF and EPUB states it recorded.
import { record } from './record.js';

/** `value` to the nearest `step`, without the float noise of the product
 *  (`Math.round(2.8 / 0.01) * 0.01` is 2.8000000000000003, #924). */
export const round = (value, step = 1) => Number((Math.round(value / step) * step).toPrecision(12));

/** Resolves when no build has been recorded for `quietMs` (harness need H10). */
export async function settle(quietMs = 500, maxMs = 10000) {
  const start = performance.now();
  for (;;) {
    const cb = record();
    const now = performance.now();
    if (!cb.pending && now - (cb.lastBuildAt ?? 0) >= quietMs) return { waitedMs: round(now - start) };
    if (now - start > maxMs) return { waitedMs: round(now - start), timedOut: true };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** `document.fonts.ready`, with a timer beside it (#743): a font request
 *  that got no answer keeps the promise pending for ever. */
export function fontsReady(maxMs = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), maxMs);
    document.fonts.ready.then(() => {
      clearTimeout(timer);
      resolve({});
    });
  });
}

/** Resolves after `count` animation frames, or `fallbackMs` after the last
 *  one that came (#743): a page the browser is not presenting (a tab behind
 *  the others of a browser that has just started) gets no frame at all, and
 *  the capture waited out the protocol timeout on it. */
export function frames(count = 2, fallbackMs = 500) {
  return new Promise((resolve) => {
    let got = 0;
    let settled = false;
    let timer;
    const finish = (fellBack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(fellBack ? { frames: got, fellBack: true } : { frames: got });
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(true), fallbackMs);
    };
    const next = () => {
      if (got >= count) return finish(false);
      arm();
      requestAnimationFrame(() => {
        if (settled) return;
        got++;
        next();
      });
    };
    next();
  });
}

export function pdfState() {
  const cb = record();
  return { bytes: cb.pdf?.length ?? 0, error: cb.pdfError ?? null, fontFailures: cb.fontFailures ?? [], ms: round(cb.pdfMs ?? 0) };
}

/** The EPUBs the pen wrote (shim postext-epub.js), each read back. */
export function epubState() {
  return (record().epubs ?? []).map((epub) => ({ ...epub, ms: round(epub.ms) }));
}

export function pdfBase64() {
  const bytes = record().pdf;
  if (!bytes) return null;
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
