/**
 * Blank pages and the breaks that make them (#1523, #1532). A design
 * element shown only on blank pages (`pages: 'blank'`) is drawn for the
 * blank pages its book's breaks leave: the guide paints its blank versos in
 * the part's colour because the only blank versos its breaks leave are the
 * ones facing a part divider. The breaks are settings of the headings and
 * the parts, the element is usually in the running heads; a design applied
 * by parts can bring one without the other, and the element then paints
 * every blank page the other breaks leave (a solid page before each
 * chapter).
 *
 * So the breaks go with the blank-page elements: when the book keeps such
 * an element from a part the design leaves, the book keeps its breaks; when
 * only the design brings one, the design's breaks come with it. The breaks
 * are the `breakBefore` of each heading level and of each heading style,
 * and the part pages' `breakBefore` and `breakAfter`.
 */

import type { PostextConfig } from '../types.js';
import { sameConfig } from '../defaults/configLayers.js';
import { readDesignSlot, type DesignPartSlot } from './parts.js';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether `node` holds a design element shown only on blank pages. */
export function paintsBlankPages(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(paintsBlankPages);
  if (!isObject(node)) return false;
  if (node.pages === 'blank' && typeof node.kind === 'string') return true;
  return Object.values(node).some(paintsBlankPages);
}

/** Whether any of `slots` of `config` holds such an element. */
export function slotsPaintBlankPages(config: object, slots: readonly DesignPartSlot[]): boolean {
  return slots.some((slot) => paintsBlankPages(readDesignSlot(config, slot)));
}

/** The breaks of a configuration, as it writes them (unset ones left out). */
interface PageBreaks {
  levels: Map<number, unknown>;
  styles: Map<string, unknown>;
  partBefore: unknown;
  partAfter: unknown;
}

function pageBreaksOf(config: PostextConfig): PageBreaks {
  const levels = new Map<number, unknown>();
  for (const l of (config.headings?.levels ?? []) as unknown as Json[]) {
    if (typeof l.level === 'number' && l.breakBefore !== undefined) levels.set(l.level, l.breakBefore);
  }
  const styles = new Map<string, unknown>();
  for (const s of (config.headingStyles ?? []) as unknown as Json[]) {
    if (typeof s.id === 'string') styles.set(s.id, s.breakBefore);
  }
  return { levels, styles, partBefore: config.parts?.breakBefore, partAfter: config.parts?.breakAfter };
}

/** `obj` with `key` set to `value` (unset when undefined), as a copy. */
function withField(obj: Json, key: string, value: unknown): Json {
  const out = { ...obj };
  if (value === undefined) delete out[key];
  else out[key] = structuredClone(value);
  return out;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/** `config` with the breaks of `from`: every heading level's, the heading
 *  styles both have, the part pages'. Nothing else changes. */
export function withPageBreaksOf(config: PostextConfig, from: PostextConfig): PostextConfig {
  const want = pageBreaksOf(from);
  const have = pageBreaksOf(config);
  let next: PostextConfig = config;
  let levels = [...((config.headings?.levels ?? []) as unknown as Json[])];
  let levelsChanged = false;
  for (const n of HEADING_LEVELS) {
    if (sameConfig(want.levels.get(n), have.levels.get(n))) continue;
    levelsChanged = true;
    const at = levels.findIndex((l) => l.level === n);
    if (at >= 0) levels[at] = withField(levels[at]!, 'breakBefore', want.levels.get(n));
    else levels.push({ level: n, breakBefore: structuredClone(want.levels.get(n)) });
  }
  if (levelsChanged) {
    levels = levels.filter((l) => Object.keys(l).some((k) => k !== 'level'));
    const headings = withField({ ...(config.headings ?? {}) } as Json, 'levels', levels.length > 0 ? levels : undefined);
    next = { ...next, headings: headings as PostextConfig['headings'] };
    if (Object.keys(headings).length === 0) delete next.headings;
  }
  if (config.headingStyles?.some((s) => want.styles.has(s.id) && !sameConfig(want.styles.get(s.id), have.styles.get(s.id)))) {
    next = {
      ...next,
      headingStyles: config.headingStyles.map((s) => (want.styles.has(s.id) ? withField(s as unknown as Json, 'breakBefore', want.styles.get(s.id)) as unknown as typeof s : s)),
    };
  }
  if (!sameConfig(want.partBefore, have.partBefore) || !sameConfig(want.partAfter, have.partAfter)) {
    const parts = withField(withField({ ...(config.parts ?? {}) } as Json, 'breakBefore', want.partBefore), 'breakAfter', want.partAfter);
    next = { ...next, parts: parts as PostextConfig['parts'] };
    if (Object.keys(parts).length === 0) delete next.parts;
  }
  return next;
}
