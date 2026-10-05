import type { EpubLayout } from '../types/props';

/** What the default rendition depends on, read from the browser. */
export interface DeviceTraits {
  userAgent: string;
  maxTouchPoints: number;
  /** `(hover: none) and (pointer: coarse)`: touch is the only pointer. */
  touchOnly: boolean;
  /** The shorter side of the screen, in CSS px. */
  shortSide: number;
}

/** Whether the device is a tablet: an iPad — iPadOS reports a Mac user
 *  agent, which a touch screen tells apart, since no Mac has one — or a
 *  touch-only screen whose shorter side is a tablet's (600 px and more;
 *  phones stay below it). */
export function isTablet(d: DeviceTraits): boolean {
  if (/\biPad\b/.test(d.userAgent)) return true;
  if (/\bMacintosh\b/.test(d.userAgent) && d.maxTouchPoints > 1) return true;
  return d.touchOnly && d.shortSide >= 600;
}

/** The rendition the EPUB tab starts in when the viewer has not picked one:
 *  a fixed layout on a tablet, whose screen has room for the printed page,
 *  a reflowable book on phones and computers. */
export function defaultEpubLayout(d: DeviceTraits | null = readDeviceTraits()): EpubLayout {
  return d && isTablet(d) ? 'fixed' : 'reflowable';
}

/** The browser's traits, or null outside a browser. */
export function readDeviceTraits(): DeviceTraits | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const screen = window.screen;
  return {
    userAgent: navigator.userAgent ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    touchOnly: window.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true,
    shortSide: screen ? Math.min(screen.width, screen.height) : 0,
  };
}
