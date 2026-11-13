// The die-cut settings (#1565): placements that name no die, shapes the
// resolver drops, page specs it cannot read, and keys a die shape does not
// have. Pure.

import type { DieCutsConfig, DieShape, PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { resolveDieShape } from '../../defaults/dieCuts.js';
import { parseSvgPath } from '../../design/svgPath.js';
import { parsePageList } from '../../dieCut/place.js';
import { closestKey } from '../../util/closestKey.js';

const SECTION_KEYS = { shapes: true, pages: true, corners: true, outline: true } satisfies Record<keyof DieCutsConfig, true>;
const SHAPE_KEYS = {
  id: true, name: true, shape: true, x: true, y: true, width: true, height: true, radius: true, d: true, viewBox: true,
  leaves: true, wrap: true,
} satisfies Record<keyof DieShape, true>;

/**
 * `dieCuts` read for what the engine drops:
 * - `unknownConfigValue` for a placement whose `die` names no shape
 *   (`dieCuts.pages[i].die`, the closest id as the suggestion: the die is
 *   not cut), a `pages` spec with no page number in it, a shape the
 *   resolver drops (no id, an unknown `shape`, a missing box or `d`), path
 *   data that cannot be read (`d`, `outline.d`: the shape cuts its box);
 * - `unknownConfigKey` for a key the section or a shape does not have.
 */
export function collectDieCutWarnings(config: PostextConfig): ConfigWarning[] {
  const dc = config.dieCuts;
  if (!dc || typeof dc !== 'object') return [];
  const out: ConfigWarning[] = [];
  const keys = (node: unknown, known: Record<string, true>, path: string) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined || Object.prototype.hasOwnProperty.call(known, key)) continue;
      const suggestion = closestKey(key, Object.keys(known));
      out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
  };
  keys(dc, SECTION_KEYS, 'dieCuts');
  const ids: string[] = [];
  (Array.isArray(dc.shapes) ? dc.shapes : []).forEach((s, i) => {
    const path = `dieCuts.shapes[${i}]`;
    keys(s, SHAPE_KEYS, path);
    const r = resolveDieShape(s);
    if (!r) {
      out.push({ kind: 'unknownConfigValue', path, value: String((s as Partial<DieShape> | undefined)?.id ?? ''), used: '' });
      return;
    }
    ids.push(r.id);
    if (r.d !== undefined && !parseSvgPath(r.d).ok) out.push({ kind: 'unknownConfigValue', path: `${path}.d`, value: r.d.slice(0, 40), used: 'box' });
  });
  (Array.isArray(dc.pages) ? dc.pages : []).forEach((p, i) => {
    if (!p || typeof p !== 'object') return;
    if (typeof p.die === 'string' && !ids.includes(p.die.trim())) {
      const suggestion = closestKey(p.die.trim(), ids);
      out.push({ kind: 'unknownConfigValue', path: `dieCuts.pages[${i}].die`, value: p.die, used: '', ...(suggestion ? { suggestion } : {}) });
    }
    if (typeof p.pages !== 'string' || parsePageList(p.pages).length === 0) {
      out.push({ kind: 'unknownConfigValue', path: `dieCuts.pages[${i}].pages`, value: String(p.pages ?? ''), used: '' });
    }
  });
  const d = dc.outline?.d;
  if (typeof d === 'string' && d.trim() && !parseSvgPath(d.trim()).ok) {
    out.push({ kind: 'unknownConfigValue', path: 'dieCuts.outline.d', value: d.slice(0, 40), used: '' });
  }
  return out;
}
