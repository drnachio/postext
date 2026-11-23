'use client';

// The book's print cover as the pictures Folio binds the 3D book with: the
// spine (#1669), when the book names no picture of its own for it, and the
// front and back on the boards (#1685), when the book has no covers of its
// own. The spine as the cover sheet lays it out, head up, read with the
// front cover to the right, as Folio takes it; each board its panel's trim.

import { useEffect, useRef, useState } from 'react';
import { useCover } from './useCover.js';
import { canvasJpeg, paintCoverZone } from './paintCover.js';

/** Long side of each picture, px. */
const LONG_SIDE = 2048;

export interface PrintedCover {
  spine?: string;
  front?: string;
  back?: string;
}

const NONE: PrintedCover = {};

/** Object URLs of the printed spine and boards, each undefined while there
 *  is none (no print version, a panel the sheet lacks, not wanted). */
export function usePrintedCover(want: { spine: boolean; boards: boolean }): PrintedCover {
  const enabled = want.spine || want.boards;
  const cover = useCover(null, 'cover', enabled);
  const [urls, setUrls] = useState<PrintedCover>(NONE);
  // The pictures on show are let go only once others replace them (or the
  // hook unmounts): a cover rebuilding (another project opened) must not
  // leave Folio holding revoked URLs while it is created (#1685).
  const shown = useRef<string[]>([]);
  const show = (next: PrintedCover) => {
    const old = shown.current;
    shown.current = Object.values(next).filter((u): u is string => !!u);
    setUrls(next);
    for (const url of old) URL.revokeObjectURL(url);
  };
  useEffect(() => () => {
    for (const url of shown.current) URL.revokeObjectURL(url);
    shown.current = [];
  }, []);
  const { built, doc, status } = cover;
  useEffect(() => {
    if (!enabled || status !== 'ready' || !built || !doc) {
      if (!enabled && shown.current.length) show(NONE);
      return;
    }
    let live = true;
    const zones = [...(want.spine ? (['spine'] as const) : []), ...(want.boards ? (['front', 'back'] as const) : [])];
    void Promise.all(zones.map(async (zone) => {
      const canvas = paintCoverZone(built, doc, zone, LONG_SIDE);
      const bytes = canvas ? await canvasJpeg(canvas) : null;
      return [zone, bytes] as const;
    })).then((painted) => {
      if (!live) return;
      const next: PrintedCover = {};
      for (const [zone, bytes] of painted) {
        if (!bytes) continue;
        next[zone] = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
      }
      show(next);
    });
    return () => {
      live = false;
    };
  }, [enabled, want.spine, want.boards, status, built, doc, cover.paintKey]);
  return enabled ? urls : NONE;
}
