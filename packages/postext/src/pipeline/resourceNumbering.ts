/**
 * Resource numbering pipeline (issue #49 §3).
 *
 * Assigns a rendered number string (e.g. `"1.7"`) to every resource referenced
 * in the document. Numbering follows **order of first reference** in reading
 * order — a resource is numbered the first time it is encountered, whether via
 * a `::resource{…}` block embed or an inline `:ref{…}`. Inserting a new
 * reference earlier in the document therefore auto-renumbers the rest.
 *
 * The renderer is shared with heading numbering through
 * {@link renderCounterTemplate}; only the template syntax differs. Resource
 * templates use `{n}` for the per-type counter and `{h1}`..`{h6}` for the
 * heading numbers in effect at the point of first reference.
 */

import type { ContentBlock } from '../parse';
import type { HeadingCounters, Resource, ResourceNumberEntry, ResourceType, ResourceCounterFormat } from '../types';
import {
  formatNumeral,
  renderCounterTemplate,
  type NumeralStyle,
  type RenderPiece,
} from '../numbering';

/** Heading counters (1-indexed by level) in effect at a given point in the
 *  document. `h1`..`h6` carry the running heading number for each level. */
export type HeadingContext = HeadingCounters;

export type { ResourceNumberEntry };

/** Maps each referenced `Resource.id` to its computed numbering entry. */
export type ResourceNumberingMap = Record<string, ResourceNumberEntry>;

const EMPTY_HEADING: HeadingContext = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

/** Translate a resource `counterFormat` to the shared `NumeralStyle` used by
 *  {@link formatNumeral}. The resource model uses `'roman-lower'` style names
 *  whereas the numeral formatter uses `'lower-roman'`. */
function counterFormatToStyle(format: ResourceCounterFormat): NumeralStyle {
  switch (format) {
    case 'decimal':
      return 'decimal';
    case 'roman-lower':
      return 'lower-roman';
    case 'roman-upper':
      return 'upper-roman';
    case 'alpha-lower':
      return 'lower-alpha';
    case 'alpha-upper':
      return 'upper-alpha';
  }
}

/** Walk `blocks` and produce, for each block index, the heading counters in
 *  effect at that block. A heading at index `i` is reflected in
 *  `result[i]` (i.e. the heading counts itself). Mirrors the counter logic in
 *  `computeHeadingNumbers` but exposes the raw per-level values rather than the
 *  rendered prefix. */
export function computeHeadingContext(
  blocks: ContentBlock[],
  start?: HeadingContext,
  /** Whether a heading advances its counter (see `computeHeadingNumbers`). */
  isNumbered: (block: ContentBlock) => boolean = () => true,
): HeadingContext[] {
  const counters = [0, 0, 0, 0, 0, 0, 0]; // index 1..6 used
  if (start) for (let lvl = 1; lvl <= 6; lvl++) counters[lvl] = start[`h${lvl}` as keyof HeadingContext];
  const out: HeadingContext[] = new Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'heading' && b.level && b.level >= 1 && b.level <= 6 && isNumbered(b)) {
      const lvl = b.level;
      counters[lvl] = (counters[lvl] ?? 0) + 1;
      for (let k = lvl + 1; k <= 6; k++) counters[k] = 0;
    }
    out[i] = {
      h1: counters[1] ?? 0,
      h2: counters[2] ?? 0,
      h3: counters[3] ?? 0,
      h4: counters[4] ?? 0,
      h5: counters[5] ?? 0,
      h6: counters[6] ?? 0,
    };
  }
  return out;
}

/** A `{n}` / `{h1}`..`{h6}` template token. */
type ResourceToken =
  | { kind: 'literal'; text: string }
  | { kind: 'counter' } // the `{n}` per-type counter
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6 };

/** Parse a resource numbering template into tokens. Recognizes `{n}` (the
 *  per-type counter) and `{h1}`..`{h6}` (heading numbers). Backslash escapes a
 *  literal `{`, `}`, or `\`. Unknown `{…}` groups are kept as literal text. */
function parseResourceTemplate(tpl: string): ResourceToken[] {
  const tokens: ResourceToken[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf.length > 0) {
      tokens.push({ kind: 'literal', text: buf });
      buf = '';
    }
  };
  while (i < tpl.length) {
    const ch = tpl[i]!;
    if (ch === '\\' && i + 1 < tpl.length) {
      const next = tpl[i + 1]!;
      if (next === '{' || next === '}' || next === '\\') {
        buf += next;
        i += 2;
        continue;
      }
    }
    if (ch === '{') {
      const end = tpl.indexOf('}', i + 1);
      if (end !== -1) {
        const body = tpl.slice(i + 1, end).trim();
        if (body === 'n') {
          flush();
          tokens.push({ kind: 'counter' });
          i = end + 1;
          continue;
        }
        const hMatch = /^h([1-6])$/.exec(body);
        if (hMatch) {
          flush();
          tokens.push({ kind: 'heading', level: Number(hMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6 });
          i = end + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return tokens;
}

/** Render a resource template against a per-type counter value and the heading
 *  context in effect. Empty heading counters collapse their adjacent separators
 *  via {@link renderCounterTemplate} (so `{h1}.{n}` with no h1 renders as the
 *  bare counter). */
function renderResourceNumber(
  tokens: ResourceToken[],
  counterValue: number,
  style: NumeralStyle,
  heading: HeadingContext,
): string {
  const pieces: RenderPiece[] = tokens.map((t) => {
    if (t.kind === 'literal') return { kind: 'literal', text: t.text };
    if (t.kind === 'counter') {
      return { kind: 'counter', text: formatNumeral(counterValue, style) };
    }
    const value = heading[`h${t.level}` as keyof HeadingContext];
    return { kind: 'counter', text: value > 0 ? formatNumeral(value, 'decimal') : '' };
  });
  return renderCounterTemplate(pieces);
}

/** Heading levels that {@link ResourceType.resetOn} may reference. */
type ResetLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Returns true when the heading context crossed a `resetOn` boundary relative
 *  to the previous reference — i.e. the heading number at `resetOn`'s level (or
 *  any ancestor level) changed. */
function shouldResetCounter(
  prev: HeadingContext | null,
  cur: HeadingContext,
  resetLevel: ResetLevel,
): boolean {
  if (!prev) return false;
  // A reset at level L fires whenever the L-level heading number changed, which
  // also covers ancestor changes (ancestors reset descendants' counters to 0,
  // changing them too).
  for (let lvl = 1 as ResetLevel; lvl <= resetLevel; lvl = (lvl + 1) as ResetLevel) {
    const key = `h${lvl}` as keyof HeadingContext;
    if (prev[key] !== cur[key]) return true;
  }
  return false;
}

/**
 * Compute the numbering map for every resource referenced in `blocks`.
 *
 * @param blocks          parsed content blocks in reading order
 * @param resourceTypes   user-defined resource types (drives template + reset)
 * @param resources       known resources (maps `resourceId → typeId`)
 * @param headingContext  per-block heading counters (see
 *                        {@link computeHeadingContext}); must align with
 *                        `blocks` by index
 */
/** Per-type counter state at the end of a document: the `{n}` counter and
 *  the heading counters of the last numbered resource (what `resetOn`
 *  compares against). */
export type ResourceCounterState = Record<string, { counter: number; heading: HeadingContext }>;

/** What precedes the document: resources already numbered (they keep the
 *  number of their first mention) and the per-type counters to continue. */
export interface ResourceNumberingStart {
  counters?: ResourceCounterState;
  numbered?: ResourceNumberingMap;
}

export interface ResourceNumberingResult {
  /** Every referenced resource — including the inherited ones. */
  map: ResourceNumberingMap;
  /** Counter state at the end of the document, to continue from. */
  counters: ResourceCounterState;
}

export function computeResourceNumbering(
  blocks: ContentBlock[],
  resourceTypes: ResourceType[],
  resources: Resource[],
  headingContext: HeadingContext[],
  start?: ResourceNumberingStart,
): ResourceNumberingMap {
  return computeResourceNumberingState(blocks, resourceTypes, resources, headingContext, start).map;
}

/** {@link computeResourceNumbering} plus the counter state at the end of the
 *  document. */
export function computeResourceNumberingState(
  blocks: ContentBlock[],
  resourceTypes: ResourceType[],
  resources: Resource[],
  headingContext: HeadingContext[],
  start?: ResourceNumberingStart,
): ResourceNumberingResult {
  const typeById = new Map<string, ResourceType>();
  for (const t of resourceTypes) typeById.set(t.id, t);
  const resourceById = new Map<string, Resource>();
  for (const r of resources) resourceById.set(r.id, r);

  // First reference (in reading order) of every resourceId, paired with the
  // heading context in effect at that point. Resources numbered by the
  // preceding content keep their number and never re-enter the sequence.
  interface Occurrence {
    resourceId: string;
    heading: HeadingContext;
  }
  const firstOccurrences: Occurrence[] = [];
  const seen = new Set<string>(start?.numbered ? Object.keys(start.numbered) : []);

  const record = (resourceId: string, blockIdx: number) => {
    if (seen.has(resourceId)) return;
    seen.add(resourceId);
    firstOccurrences.push({
      resourceId,
      heading: headingContext[blockIdx] ?? EMPTY_HEADING,
    });
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'resourceBlock' && b.resourceId) {
      record(b.resourceId, i);
    }
    for (const span of b.spans) {
      if (span.ref?.resourceId) record(span.ref.resourceId, i);
    }
  }

  // Partition by typeId (resolved via the resource), preserving first-reference
  // order. Resources with an unknown id or unknown type are skipped.
  const byType = new Map<string, Occurrence[]>();
  for (const occ of firstOccurrences) {
    const resource = resourceById.get(occ.resourceId);
    if (!resource) continue;
    const type = typeById.get(resource.typeId);
    if (!type) continue;
    const list = byType.get(type.id);
    if (list) list.push(occ);
    else byType.set(type.id, [occ]);
  }

  const map: ResourceNumberingMap = { ...(start?.numbered ?? {}) };
  const counters: ResourceCounterState = { ...(start?.counters ?? {}) };
  for (const [typeId, occurrences] of byType) {
    const type = typeById.get(typeId)!;
    const tokens = parseResourceTemplate(type.numberingTemplate);
    const style = counterFormatToStyle(type.counterFormat);
    const resetLevel: ResetLevel | null =
      type.resetOn === 'never' ? null : (Number(type.resetOn.slice(1)) as ResetLevel);

    const inherited = start?.counters?.[typeId];
    let counter = inherited?.counter ?? 0;
    let prevHeading: HeadingContext | null = inherited?.heading ?? null;
    for (const occ of occurrences) {
      if (resetLevel !== null && shouldResetCounter(prevHeading, occ.heading, resetLevel)) {
        counter = 0;
      }
      counter += 1;
      prevHeading = occ.heading;
      map[occ.resourceId] = {
        number: renderResourceNumber(tokens, counter, style, occ.heading),
        typeId,
        heading: occ.heading,
      };
    }
    if (prevHeading) counters[typeId] = { counter, heading: prevHeading };
  }

  return { map, counters };
}
