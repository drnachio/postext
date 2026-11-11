// Writing one setting into a book's configuration so that it comes out as
// asked and nothing else moves by accident.
//
// A book stores only what departs from the design's defaults, and the
// engine does not fill every default in the same way: a section merges
// member by member, but a length is taken whole (`{ value: 13 }` has no
// unit), a list of named styles or of running-head elements replaces the
// design's list, and a list of levels overrides it level by level. So a
// write into something the book does not store yet first finds what must
// be stored with it — nothing, the whole length, the item's name, the
// whole list — by asking the engine: the smallest addition that resolves
// to exactly what the book resolved to before is the one the setting is
// then written into.

import { DEFAULT_CALLOUT_STYLES, DEFAULT_CHARACTER_STYLES, DEFAULT_CHIP_STYLES, DEFAULT_EXERCISE_STYLES, DEFAULT_MARK_STYLES } from 'postext';
import type { PostextConfig } from 'postext';
import { coerceSetting, isWholeValue } from './configEffective.js';
import { canonicalSteps, formatPath, getAtSteps, leafEntries, parsePath, setAtSteps, type Step } from './configPaths.js';
import { ToolError } from './modelContext.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `value` as text, the same for the same value whatever order its
 *  members were written in. */
export function stableText(value: unknown, skip?: string): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableText(item, skip)).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined && k !== skip).sort().map((k) => `${JSON.stringify(k)}:${stableText(value[k], skip)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A resolved configuration as text for telling whether two of them set
 *  the same book. Which palette entry a colour follows is left out: the
 *  engine drops the link from the colours it resolves once the book
 *  stores a palette, and the colour itself is what counts. */
const designText = (resolved: unknown): string => stableText(resolved, 'paletteId');

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The lists a book that stores none of its own starts from, as the
 *  Design panel shows them for editing: written into the book before one
 *  of their items is changed, they leave every setting that follows the
 *  body text following it. */
const DESIGNED_LISTS: Record<string, unknown> = {
  calloutStyles: DEFAULT_CALLOUT_STYLES,
  chipStyles: DEFAULT_CHIP_STYLES,
  characterStyles: DEFAULT_CHARACTER_STYLES,
  markStyles: DEFAULT_MARK_STYLES,
  exerciseStyles: DEFAULT_EXERCISE_STYLES,
};

/** The settings that differ between two resolved configurations, by
 *  path. */
function moved(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const left = leafEntries(a);
  const right = leafEntries(b);
  const out: string[] = [];
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    if (path.endsWith('.paletteId')) continue;
    if (stableText(left.get(path)) !== stableText(right.get(path))) out.push(path);
  }
  return out;
}

export interface WritePlan {
  /** The configuration with the setting written. */
  next: PostextConfig;
  /** The setting's path, list items by what tells them apart. */
  path: string;
  /** What had to be stored along with the setting, by path: a length or
   *  a colour written whole, a list written as designed. */
  seeded?: string[];
  notes: string[];
}

/**
 * `stored` with `value` at `path`; `undefined` removes the setting.
 * `effective` is what `stored` resolves to, `resolve` the engine's
 * resolution (it may throw). The path's list positions are read against
 * `effective` — the list an agent sees — and turned into what tells the
 * items apart, since a book may store only some of them.
 */
export function planWrite(
  stored: PostextConfig,
  effective: Record<string, unknown>,
  path: string,
  value: unknown,
  resolve: (config: PostextConfig) => Record<string, unknown>,
): WritePlan {
  const steps = canonicalSteps(effective, parsePath(path));
  if (steps.length === 0) throw new ToolError('Give the path of a setting; "replace" takes a whole configuration.');
  const canonical = formatPath(steps);
  const parent = steps.slice(0, -1);
  const notes: string[] = [];

  if (value === undefined) {
    // A member of a length or of a colour does not go alone: what is left
    // would not be a value.
    const storedParent = getAtSteps(stored, parent);
    if (parent.length > 0 && isRecord(storedParent) && (isWholeValue(storedParent) || isWholeValue(getAtSteps(effective, parent)))) {
      notes.push(`${canonical}: a part of a value cannot be removed alone, so ${formatPath(parent)} was removed whole and is back to the design's.`);
      return { next: setAtSteps(stored, parent, undefined), path: formatPath(parent), notes };
    }
    return { next: setAtSteps(stored, steps, undefined), path: canonical, notes };
  }

  const written = coerceSetting(canonical, value, getAtSteps(effective, steps));
  if (parent.length === 0 || getAtSteps(stored, parent) !== undefined) {
    return { next: setAtSteps(stored, steps, written), path: canonical, notes };
  }

  // The book does not store what holds the setting. From the first thing
  // on the path it lacks down to the setting's holder, each is made the
  // smallest way that leaves the book resolving to what it resolved to:
  // an empty object or list (an item of a list, with what names it), the
  // design's own list where the panel has one, or the value the engine
  // resolved there. A length or a colour is always written whole.
  const before = designText(effective);
  const same = (config: PostextConfig): number => {
    try {
      const resolved = resolve(config);
      return designText(resolved) === before ? 0 : Math.max(1, moved(effective, resolved).length);
    } catch {
      return Infinity;
    }
  };
  let base = stored;
  const seeded: string[] = [];
  for (let depth = 1; depth <= parent.length && getAtSteps(base, parent) === undefined; depth++) {
    const prefix: Step[] = steps.slice(0, depth);
    if (getAtSteps(base, prefix) !== undefined) continue;
    const at = formatPath(prefix);
    const resolvedThere = getAtSteps(effective, prefix);
    const follows = steps[depth]!;
    const options: { value: unknown; seeds: boolean }[] = [];
    // A position names an item of the list as resolved: the book's list
    // then starts from that one, not from an empty one.
    const byPosition = 'index' in follows && Array.isArray(resolvedThere) && resolvedThere.length > 0;
    if (!isWholeValue(resolvedThere) && !byPosition) options.push({ value: 'key' in follows ? {} : [], seeds: false });
    if (DESIGNED_LISTS[at] !== undefined) options.push({ value: clone(DESIGNED_LISTS[at]), seeds: true });
    // An item of such a list, as the design has it (the built-in exercise
    // style keeps its name, which the engine would read off its id).
    const item = prefix[prefix.length - 1]!;
    const designed = DESIGNED_LISTS[formatPath(prefix.slice(0, -1))];
    if ('where' in item && Array.isArray(designed)) {
      const own = (designed as Record<string, unknown>[]).find((d) => String(d[item.where]) === item.value);
      if (own) options.push({ value: clone(own), seeds: true });
    }
    if (resolvedThere !== undefined) options.push({ value: clone(resolvedThere), seeds: true });
    let best: { config: PostextConfig; seeds: boolean; off: number } | null = null;
    for (const option of options) {
      let config: PostextConfig;
      try {
        config = setAtSteps(base, prefix, option.value);
      } catch {
        // A position the list cannot take.
        continue;
      }
      const off = same(config);
      if (!best || off < best.off) best = { config, seeds: option.seeds, off };
      if (off === 0) break;
    }
    if (!best) break;
    base = best.config;
    if (best.seeds) seeded.push(at);
  }

  // A holder that takes its members whole and is not a length or a colour:
  // writing the value the setting already has must not make its other
  // members go. Where it does, the holder is written as resolved first.
  const current = getAtSteps(effective, steps);
  if (current !== undefined && getAtSteps(stored, parent) === undefined && !seeded.some((at) => formatPath(parent) === at || formatPath(parent).startsWith(at))) {
    const holder = formatPath(parent);
    const resolvedHolder = getAtSteps(effective, parent);
    try {
      const after = leafEntries(resolve(setAtSteps(base, steps, clone(current))));
      const lost = [...leafEntries(effective).keys()]
        .filter((path) => path !== canonical && (path.startsWith(`${holder}.`) || path.startsWith(`${holder}[`)) && after.get(path) === undefined);
      if (lost.length > 0 && isRecord(resolvedHolder)) {
        const whole = setAtSteps(base, parent, clone(resolvedHolder));
        if (same(whole) === 0) {
          base = whole;
          seeded.push(holder);
        }
      }
    } catch {
      // The write itself is checked by the caller.
    }
  }

  for (const at of seeded) {
    notes.push(`${at} was not among the book's own settings: it was written there as the design has it, so that the rest of it stays as it was. Setting ${at} to null puts the design's back.`);
  }
  return {
    next: setAtSteps(base, steps, written),
    path: canonical,
    ...(seeded.length > 0 ? { seeded } : {}),
    notes,
  };
}
