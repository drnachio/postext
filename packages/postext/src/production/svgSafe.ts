/**
 * What a cover writes into SVG it reads from a book's configuration, which
 * may come from a bundle anyone made: every id, colour, number and picture
 * address goes through here first, so no value can close an attribute or
 * a tag (#1667).
 */

import type { ColorValue } from '../types/page.js';
import { escapeAttr } from '../util/xmlEscape.js';

/** An id as SVG and the engine's resource ids take it: letters, digits,
 *  `-` and `_`, anything else turned into `-`. */
export const safeId = (id: unknown): string => String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '-') || 'x';

/** Whether an id is written only with letters, digits, `-` and `_`. */
export const isSafeId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** A colour's `#rrggbb` or `#rrggbbaa`, `fallback` when it is not one. */
export function safeHex(color: ColorValue | undefined, fallback = '#000000'): string {
  const hex = color?.hex;
  return typeof hex === 'string' && HEX.test(hex) ? hex.toLowerCase() : fallback;
}

/** A finite number, `fallback` otherwise. */
export const finite = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** A number rounded to a thousandth, as SVG writes it. */
export const n3 = (v: number): string => String(Math.round(finite(v) * 1000) / 1000);

/** A number rounded to a ten-thousandth. */
export const n4 = (v: number): string => String(Math.round(finite(v) * 10000) / 10000);

/** A picture's address as an SVG `href`: a PNG or JPEG data URI only (the
 *  pictures a cover draws itself are given as data), escaped; undefined
 *  for anything else. */
export function safePictureHref(href: unknown): string | undefined {
  if (typeof href !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]*$/.test(href)) return undefined;
  return escapeAttr(href);
}
