// The covers' design (#1667): keys `cover` does not have, and values the
// cover leaves out or changes when it draws them. Pure.

import type { ColorValue, CoverConfig, CoverTextFrame, PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { closestKey } from '../../util/closestKey.js';
import { isSafeId } from '../../production/svgSafe.js';
import { MIN_MIRROR_MARGIN } from '../../production/mirrorBleed.js';

const COVER_KEYS = {
  background: true, image: true, zones: true, elements: true, effects: true, logos: true, finishes: true,
  textBoxes: true, verticalAlign: true, mirrorMargin: true, barcodeMagnification: true, sheets: true,
} satisfies Record<keyof CoverConfig, true>;
const SHEETS = new Set(['cover', 'case', 'jacket', 'endpapers', 'endpaperFront', 'endpaperBack']);
const KINDS = new Set(['image', 'box', 'shape', 'catalogue']);

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
 *   2 mm and a barcode size outside 0.8 … 2 (the nearest is used); a text
 *   box's anchor, continuation, growth or fit the cover cannot follow;
 * - in `sheets`, a sheet no version has, and each sheet's own design as
 *   the cover's (#1673); a catalogue element's columns, gap and titles.
 */
export function collectCoverWarnings(config: PostextConfig): ConfigWarning[] {
  const cover = config.cover as unknown;
  if (cover === undefined) return [];
  const out: ConfigWarning[] = [];
  if (!isRecord(cover)) {
    out.push({ kind: 'unknownConfigValue', path: 'cover', value: JSON.stringify(cover) ?? String(cover), used: '' });
    return out;
  }
  checkDesign(cover, 'cover', out, true);
  return out;
}

/** One design: the cover's, or a sheet's own (`cover.sheets.case`). */
function checkDesign(cover: Record<string, unknown>, where: string, out: ConfigWarning[], top: boolean): void {
  const bad = (path: string, value: unknown, used = '') => out.push({ kind: 'unknownConfigValue', path: `${where}.${path}`, value: typeof value === 'string' ? value : JSON.stringify(value) ?? String(value), used });
  for (const key of Object.keys(cover)) {
    if (Object.prototype.hasOwnProperty.call(COVER_KEYS, key) && (top || key !== 'sheets')) continue;
    const suggestion = closestKey(key, Object.keys(COVER_KEYS));
    out.push({ kind: 'unknownConfigKey', path: `${where}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
  }
  if (top && cover.sheets !== undefined) {
    if (!isRecord(cover.sheets)) bad('sheets', cover.sheets);
    else for (const [name, design] of Object.entries(cover.sheets)) {
      if (!SHEETS.has(name)) bad(`sheets.${name}`, name);
      else if (!isRecord(design)) bad(`sheets.${name}`, design);
      else checkDesign(design, `${where}.sheets.${name}`, out, false);
    }
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
      if (el.kind !== undefined && !KINDS.has(el.kind as string)) bad(`${at}.kind`, el.kind);
      color(`${at}.color`, el.color);
      if (el.kind === 'catalogue') {
        const whole = (key: 'columns' | 'first' | 'last') => {
          const v = el[key];
          if (v !== undefined && !(typeof v === 'number' && Number.isInteger(v) && v >= 1)) bad(`${at}.${key}`, v);
        };
        whole('columns'); whole('first'); whole('last');
        if (el.gap !== undefined && !(typeof el.gap === 'number' && el.gap >= 0)) bad(`${at}.gap`, el.gap, '3');
      }
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
  if (Array.isArray(cover.textBoxes)) {
    const boxes = cover.textBoxes as unknown[];
    const all = new Set(boxes.map((b) => (isRecord(b) ? b.name : undefined)).filter((n): n is string => typeof n === 'string'));
    boxes.forEach((b: unknown, i) => {
      const at = `textBoxes[${i}]`;
      const name = isRecord(b) ? b.name : undefined;
      if (!isSafeId(name) || names.has(name)) bad(`${at}.name`, name);
      else names.add(name);
      if (isRecord(b)) checkTextBox(b, at, all, bad);
    });
  }
  if (cover.mirrorMargin !== undefined && !(typeof cover.mirrorMargin === 'number' && cover.mirrorMargin >= MIN_MIRROR_MARGIN)) bad('mirrorMargin', cover.mirrorMargin, String(MIN_MIRROR_MARGIN));
  const mag = cover.barcodeMagnification;
  if (mag !== undefined && !(typeof mag === 'number' && mag >= 0.8 && mag <= 2)) bad('barcodeMagnification', mag, typeof mag === 'number' && mag > 2 ? '2' : '0.8');
}

const TEXT_BOX_KEYS = {
  name: true, rect: true, rotate: true, verticalAlign: true, anchor: true, next: true, maxHeight: true, fit: true,
} satisfies Record<keyof CoverTextFrame, true>;
const GRID_EDGES = new Set(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']);
const BESIDE_EDGES = new Set(['right-of', 'left-of', 'below', 'above']);

/** A text box's anchor, continuation, growth and fit (#1679): an anchor to
 *  no zone or box, to the box itself or at a point its target has not
 *  (`below` a zone), a continuation into no other box, a height it cannot
 *  grow to, a scale outside 0 … 1. */
function checkTextBox(b: Record<string, unknown>, at: string, boxes: ReadonlySet<string>, bad: (path: string, value: unknown, used?: string) => void): void {
  for (const key of Object.keys(b)) {
    if (!Object.prototype.hasOwnProperty.call(TEXT_BOX_KEYS, key)) bad(`${at}.${key}`, key);
  }
  if (b.rotate !== undefined && b.rotate !== 90 && b.rotate !== -90) bad(`${at}.rotate`, b.rotate, '0');
  if (b.verticalAlign !== undefined && !['top', 'middle', 'bottom'].includes(b.verticalAlign as string)) bad(`${at}.verticalAlign`, b.verticalAlign, 'top');
  const a = b.anchor;
  if (a !== undefined) {
    if (!isRecord(a)) bad(`${at}.anchor`, a);
    else {
      const zone = ZONES.has(a.to as string);
      const box = typeof a.to === 'string' && boxes.has(a.to) && a.to !== b.name;
      if (!zone && !box) bad(`${at}.anchor.to`, a.to);
      else if (!GRID_EDGES.has(a.edge as string) && !(box && BESIDE_EDGES.has(a.edge as string))) bad(`${at}.anchor.edge`, a.edge);
      for (const k of ['x', 'y'] as const) if (a[k] !== undefined && !(typeof a[k] === 'number' && Number.isFinite(a[k]))) bad(`${at}.anchor.${k}`, a[k], '0');
    }
  }
  if (b.next !== undefined && !(typeof b.next === 'string' && boxes.has(b.next) && b.next !== b.name)) bad(`${at}.next`, b.next);
  if (b.maxHeight !== undefined) {
    const h = isRecord(b.rect) ? b.rect.height : undefined;
    if (!(typeof b.maxHeight === 'number' && Number.isFinite(b.maxHeight) && (typeof h !== 'number' || b.maxHeight >= h)) || b.rotate === 90 || b.rotate === -90) bad(`${at}.maxHeight`, b.maxHeight);
  }
  const fit = b.fit;
  if (fit !== undefined) {
    if (!isRecord(fit)) bad(`${at}.fit`, fit);
    else {
      if (fit.shrinkText !== undefined && typeof fit.shrinkText !== 'boolean') bad(`${at}.fit.shrinkText`, fit.shrinkText, 'true');
      if (fit.minScale !== undefined && !(typeof fit.minScale === 'number' && fit.minScale > 0 && fit.minScale <= 1)) bad(`${at}.fit.minScale`, fit.minScale, '0.9');
    }
  }
}
