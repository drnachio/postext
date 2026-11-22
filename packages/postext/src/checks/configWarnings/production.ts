// The print production (#1666): what of `production` the cover reader
// leaves out, and keys the block does not have. Pure.

import type { PostextConfig, ProductionConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { readProductionConfig } from '../../production/config.js';
import { parseIsbn } from '../../production/isbn.js';
import { closestKey } from '../../util/closestKey.js';

const SECTION_KEYS = { versions: true, bindings: true, papers: true, collection: true } satisfies Record<keyof ProductionConfig, true>;

/** Where an issue sits, as a config path (`production.versions[0].isbn`). */
const pathOf = (where: string): string => (where === 'production' ? where : `production.${where}`);

/**
 * `production` read as the cover reads it (`readProductionConfig`):
 * - `unknownConfigValue` for each part it leaves out (a version without an
 *   id or a binding, a binding style it does not know, a measure or a
 *   number that does not read, a field of the wrong kind) and for an ISBN
 *   that does not read (`used` is empty: no barcode is drawn);
 * - `unknownConfigKey` for a key the block does not have.
 */
export function collectProductionWarnings(config: PostextConfig): ConfigWarning[] {
  const production = config.production as unknown;
  if (production === undefined) return [];
  const out: ConfigWarning[] = [];
  if (production && typeof production === 'object' && !Array.isArray(production)) {
    for (const key of Object.keys(production)) {
      if (Object.prototype.hasOwnProperty.call(SECTION_KEYS, key)) continue;
      const suggestion = closestKey(key, Object.keys(SECTION_KEYS));
      out.push({ kind: 'unknownConfigKey', path: `production.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
  }
  const read = readProductionConfig(production);
  for (const issue of read.issues) out.push({ kind: 'unknownConfigValue', path: pathOf(issue.where), value: issue.reason, used: '' });
  (read.production?.versions ?? []).forEach((v, i) => {
    for (const key of ['isbn', 'workIsbn'] as const) {
      const isbn = v[key];
      if (isbn !== undefined && !parseIsbn(isbn).ok) out.push({ kind: 'unknownConfigValue', path: `production.versions[${i}].${key}`, value: isbn, used: '' });
    }
  });
  return out;
}
