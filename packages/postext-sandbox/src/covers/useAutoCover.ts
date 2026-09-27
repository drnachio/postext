'use client';

// The capture side of automatic covers (decisions in ./autoCover.ts): once
// the canvas has laid out and painted the book's first page, a book without
// a cover gets a small picture of it, rendered off the interaction path (an
// idle callback) and only with the fonts in place and every picture of the
// page decoded.

import { useEffect, type MutableRefObject } from 'react';
import { renderPageToCanvas } from 'postext';
import type { VDTDocument, VDTPage } from 'postext';
import { useSandboxCoverSaver, useSandboxStateGetter } from '../context/SandboxContext';
import { getConfigFontSpecs } from '../controls/fontLoader';
import { coverTargetKey, coverToCapture, sessionCoverAttempts as attempted } from './autoCover';

/** Width of a cover picture, in pixels (a Books row shows it at 36 px;
 *  a bundle's `thumbnail.jpg` is read elsewhere at a larger size). */
export const COVER_WIDTH = 240;
/** Paints of a page still missing pictures before the cover is taken
 *  anyway (a picture that never decodes must not block it for good). */
const MAX_MISSING_IMAGE_TRIES = 3;

/** The first chapter's document as last laid out by the canvas, with the
 *  text it was built from (to tell it still is the book on screen). */
export interface FirstChapterDoc {
  chapterId: string;
  markdown: string;
  doc: VDTDocument;
}

// Tries that met pictures not decoded yet, by `coverTargetKey`.
const missingTries = new Map<string, number>();

/** Paint `page` into a `COVER_WIDTH` JPEG (on white: a page without a paper
 *  colour is transparent). `missing` when a picture of the page has not
 *  been decoded yet, unless `allowMissing` (placeholders then). */
export async function renderCoverImage(page: VDTPage, doc: VDTDocument, allowMissing = false): Promise<{ bytes: ArrayBuffer; mime: string } | 'missing' | null> {
  if (typeof document === 'undefined' || page.width <= 0) return null;
  // Painted at twice the size and scaled down: small text anti-aliases
  // better than when drawn at the final size.
  const big = document.createElement('canvas');
  let missing = false;
  renderPageToCanvas(page, doc, big, {
    scale: (COVER_WIDTH * 2) / page.width,
    onWarning: (w) => { if (w.kind === 'missingImage') missing = true; },
  });
  if (missing && !allowMissing) return 'missing';
  const out = document.createElement('canvas');
  out.width = COVER_WIDTH;
  out.height = Math.max(1, Math.round((page.height / page.width) * COVER_WIDTH));
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(big, 0, 0, out.width, out.height);
  big.width = 1;
  big.height = 1;
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return null;
  return { bytes: await blob.arrayBuffer(), mime: blob.type || 'image/jpeg' };
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

function whenIdle(fn: () => void): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const handle = w.requestIdleCallback(fn, { timeout: 4000 });
    return () => w.cancelIdleCallback!(handle);
  }
  const t = setTimeout(fn, 500);
  return () => clearTimeout(t);
}

/** Take the cover of the book on screen after a paint of its first page
 *  (`paintVersion` changes with every new document or repaint). */
export function useAutoCover(firstChapterDocRef: MutableRefObject<FirstChapterDoc | null>, paintVersion: string): void {
  const getState = useSandboxStateGetter();
  const saveCover = useSandboxCoverSaver();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = getState();
    const target = coverToCapture(s, attempted);
    if (!target) return;
    const built = firstChapterDocRef.current;
    const first = s.chapters[0];
    if (!built || !first || built.chapterId !== first.id || built.markdown !== first.markdown) return;
    const { doc } = built;
    const page = doc.pages[0];
    if (!page) return;
    const key = coverTargetKey(target);
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void (async () => {
        if (typeof document !== 'undefined' && document.fonts) {
          await document.fonts.ready;
          if (getConfigFontSpecs(getState().config).some((spec) => !document.fonts.check(spec))) return;
        }
        // Still the same book, still without a cover, still this document.
        const now = getState();
        const still = coverToCapture(now, attempted);
        if (cancelled || !still || coverTargetKey(still) !== key || firstChapterDocRef.current?.doc !== doc) return;
        const tries = missingTries.get(key) ?? 0;
        const image = await renderCoverImage(page, doc, tries + 1 >= MAX_MISSING_IMAGE_TRIES);
        if (cancelled) return;
        if (image === 'missing') {
          missingTries.set(key, tries + 1);
          return;
        }
        attempted.add(key);
        if (image) await saveCover(target, image.bytes, image.mime);
      })().catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [paintVersion, getState, saveCover, firstChapterDocRef]);
}
