'use client';

// The capture side of automatic covers (decisions in ./autoCover.ts): once
// the canvas has laid out and painted the book's first page, a book without
// a cover gets a small picture of it, rendered off the interaction path (an
// idle callback) and only with the fonts in place and every picture of the
// page decoded.

import { useEffect, type MutableRefObject } from 'react';
import { useSandboxCoverSaver, useSandboxStateGetter } from '../context/SandboxContext.js';
import { missingConfigFontSpecs } from '../controls/fonts/fontLoader.js';
import { coverTargetKey, coverToCapture, sessionCoverAttempts as attempted } from './autoCover.js';
import { renderCoverImage, showFirstChapterDoc, type FirstChapterDoc } from './renderCover.js';

export { COVER_WIDTH, renderCoverImage, type FirstChapterDoc } from './renderCover.js';

/** Paints of a page still missing pictures before the cover is taken
 *  anyway (a picture that never decodes must not block it for good). */
const MAX_MISSING_IMAGE_TRIES = 3;

// Tries that met pictures not decoded yet, by `coverTargetKey`.
const missingTries = new Map<string, number>();

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

  // An export paints the bundle's cover from this layout (renderCover.ts).
  useEffect(() => showFirstChapterDoc(firstChapterDocRef), [firstChapterDocRef]);

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
          if (missingConfigFontSpecs(getState().config).length > 0) return;
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
