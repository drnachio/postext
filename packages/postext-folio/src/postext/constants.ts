// The document book's page player and glass painting shapes, its settle
// times and limits, and the idle callback it paints in (#1276: split out of
// postext.ts).
import type { VDTDocument } from 'postext';
import type { PageVideoSpot } from '../videos.js';

/** A video playing (or paused) on a page: its element, the spot it fills,
 *  whether it has a frame on show, whether it plays muted only because it
 *  started on its own, whether it plays alongside the others
 *  (`player.exclusive: false`) and the exclusive video it waits for. */
export interface PagePlayer {
  page: number;
  spot: PageVideoSpot;
  element: HTMLVideoElement;
  release?: () => void;
  shown: boolean;
  autoMuted: boolean;
  alongside: boolean;
  heldBy: PagePlayer | null;
}

/** The reader has asked for less motion: no video starts on its own to
 *  play alongside the others. */
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How long the book must stay as it is before a video set to play on its
 *  own starts (a host's layouts settling, a run of turns). */
export const AUTOPLAY_SETTLE_MS = 700;

/** The most pixels a page is painted in for the magnifying glass. */
export const SHARP_MAX_PIXELS = 24e6;

/** A page painted for the glass (see `paintSharp`). */
export interface Sharp {
  canvas: HTMLCanvasElement;
  bare: HTMLCanvasElement | null;
  width: number;
  doc: VDTDocument;
}

/** How long a resize settles before the pages are painted at the new size. */
export const RESIZE_SETTLE_MS = 120;

export const onIdle = (cb: () => void): number =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 500 }) : (setTimeout(cb, 50) as unknown as number);
export const cancelIdle = (id: number) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
