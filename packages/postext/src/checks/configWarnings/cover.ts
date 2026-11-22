// The covers' design (#1667): keys `cover` does not have, and values the
// cover leaves out or changes when it draws them. Pure.

import type { ColorValue, CoverConfig, PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { closestKey } from '../../util/closestKey.js';
import { isSafeId } from '../../production/svgSafe.js';
import { MIN_MIRROR_MARGIN } from '../../production/mirrorBleed.js';

const COVER_KEYS = {
  background: true, image: true, zones: true, elements: true, effects: true, logos: true, finishes: true,
  textBoxes: true, verticalAlign: true, mirrorMargin: true, barcodeMagnification: true,
} satisfies Record<keyof CoverConfig, true>;

const ZONES = new Set(['flapBack', 'back', 'jointBack', 'spine', 'jointFront', 'front', 'flapFront', 'pastedown', 'flyleaf', 'hinge']);
const PROCESSES = new Set(['varnish', 'foil', 'emboss', 'deboss']);
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * `cover` as the cover draws it:
 * - `unknownConfigKey` for a key the block does not have;
 * - `unknownConfigValue` for an id that is not letters, digits, `-` and
 *   `_`, or another's of its kind (the cover writes it into SVG: it is
 *   changed); a zone the sheets do not have; a colour that is no
 *   `#rrggbb`; a finish of no known process; a varnish's or foil's ink
 *   that is no spot ink (the default ink is used); a text box named as a
 *   zone, another box or not as an id (left out); a mirror margin under
 *   2 mm and a barcode size outside 0.8 … 2 (the nearest is used).
 */
export function collectCoverWarnings(config: PostextConfig): ConfigWarning[] {
  const cover = config.cover as unknown;
  if (cover === undefined) return [];
  const out: ConfigWarning[] = [];
  const bad = (path: string, value: unknown, used = '') => out.push({ kind: 'unknownConfigValue', path: `cover.${path}`, value: typeof value === 'string' ? value : JSON.stringify(value) ?? String(value), used });
  if (!isRecord(cover)) {
    out.push({ kind: 'unknownConfigValue', path: 'cover', value: JSON.stringify(cover) ?? String(cover), used: '' });
    return out;
  }
  for (const key of Object.keys(cover)) {
    if (Object.prototype.hasOwnProperty.call(COVER_KEYS, key)) continue;
    const suggestion = closestKey(key, Object.keys(COVER_KEYS));
    out.push({ kind: 'unknownConfigKey', path: `cover.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
  }
  const color = (path: string, c: unknown) => {
    if (c === undefined) return;
    if (!isRecord(c) || typeof c.hex !== 'string' || !HEX.test(c.hex)) bad(path, c, '#000000');
  };
  color('background', cover.background);
  if (isRecord(cover.zones)) for (const [zone, c] of Object.entries(cover.zones)) {
    if (!ZONES.has(zone)) bad(`zones.${zone}`, zone);
    else color(`zones.${zone}`, c);
  }
  const ids = new Set<string>();
  for (const list of ['elements', 'effects', 'logos'] as const) {
    const items = cover[list];
    if (items === undefined) continue;
    if (!Array.isArray(items)) {
      bad(list, items);
      continue;
    }
    items.forEach((el: unknown, i) => {
      const at = `${list}[${i}]`;
      if (!isRecord(el)) return bad(at, el);
      if (!isSafeId(el.id) || ids.has(el.id)) bad(`${at}.id`, el.id);
      if (typeof el.id === 'string') ids.add(el.id);
      if (!ZONES.has(el.zone as string)) bad(`${at}.zone`, el.zone);
      color(`${at}.color`, el.color);
    });
  }
  const finishIds = new Set<string>();
  if (Array.isArray(cover.finishes)) cover.finishes.forEach((f: unknown, i) => {
    const at = `finishes[${i}]`;
    if (!isRecord(f)) return bad(at, f);
    if (!isSafeId(f.id) || finishIds.has(f.id)) bad(`${at}.id`, f.id);
    if (typeof f.id === 'string') finishIds.add(f.id);
    if (!PROCESSES.has(f.process as string)) bad(`${at}.process`, f.process);
    const ink = f.ink as ColorValue | undefined;
    if (ink !== undefined && (f.process === 'varnish' || f.process === 'foil') && !(ink?.model === 'spot' && ink.spot?.name)) bad(`${at}.ink`, ink, f.process === 'foil' ? 'Gold foil' : 'Varnish');
    if (isRecord(f.shape) && typeof f.shape.element === 'string' && !ids.has(f.shape.element)) bad(`${at}.shape.element`, f.shape.element);
  });
  const names = new Set<string>(ZONES);
  if (Array.isArray(cover.textBoxes)) cover.textBoxes.forEach((b: unknown, i) => {
    const name = isRecord(b) ? b.name : undefined;
    if (!isSafeId(name) || names.has(name)) bad(`textBoxes[${i}].name`, name);
    else names.add(name);
  });
  if (cover.mirrorMargin !== undefined && !(typeof cover.mirrorMargin === 'number' && cover.mirrorMargin >= MIN_MIRROR_MARGIN)) bad('mirrorMargin', cover.mirrorMargin, String(MIN_MIRROR_MARGIN));
  const mag = cover.barcodeMagnification;
  if (mag !== undefined && !(typeof mag === 'number' && mag >= 0.8 && mag <= 2)) bad('barcodeMagnification', mag, typeof mag === 'number' && mag > 2 ? '2' : '0.8');
  return out;
}
