'use client';

// The spine of the book's print cover as the picture Folio binds the 3D
// book with (#1669), when the book names no picture of its own for it: the
// spine as the cover sheet lays it out, head up, read with the front cover
// to the right, as Folio takes it.

import { useEffect, useState } from 'react';
import { useCover } from './useCover.js';
import { canvasJpeg, paintCoverZone } from './paintCover.js';

/** Long side of the spine picture, px. */
const SPINE_LONG_SIDE = 2048;

/** An object URL of the printed spine, or undefined while there is none
 *  (no print version, a binding without a spine, `enabled` false). */
export function usePrintedSpine(enabled: boolean): string | undefined {
  const cover = useCover(null, 'cover', enabled);
  const [url, setUrl] = useState<string | undefined>(undefined);
  const { built, doc, status } = cover;
  useEffect(() => {
    if (!enabled || status !== 'ready' || !built || !doc) {
      if (!enabled) setUrl(undefined);
      return;
    }
    let live = true;
    let made: string | undefined;
    const canvas = paintCoverZone(built, doc, 'spine', SPINE_LONG_SIDE);
    void (canvas ? canvasJpeg(canvas) : Promise.resolve(null)).then((bytes) => {
      if (!live) return;
      made = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })) : undefined;
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [enabled, status, built, doc, cover.paintKey]);
  return enabled ? url : undefined;
}
