// Pages a build with tapes takes as the build before made them (#1639):
// how the steps after the placing tell them, and what is done to them
// instead of making them again. This file imports nothing of the engine.
//
// Two kinds of page stand as made. A page before the edit is the object
// the build before finished, frozen: a step that writes to it throws,
// and the build is done again from nothing. A page after the place where
// the new layout rejoined the old one is that object too, with its places
// in the source moved by the edit, in place: it cannot be frozen (the next
// letter moves them again), so it carries a mark instead.

const MADE = Symbol('made by the build before');

/** Where a block or a line stands in the source: an edit moves these, for
 *  everything after it, by its length. */
export const SOURCE_KEYS: ReadonlySet<string> = new Set(['sourceStart', 'sourceEnd', 'sourceMap', 'attrSources', 'titleSourceStart']);

/** Whether `value` (a page, a block, a line) stands as the build before
 *  made it: every step after the placing leaves it alone. */
export function standsAsMade(value: object): boolean {
  return Object.isFrozen(value) || (value as { [MADE]?: true })[MADE] === true;
}

/** Mark `value` and every object it holds (the words of its lines apart)
 *  as made. Once per object: a page keeps its mark build after build. */
export function markMade(value: unknown): void {
  if (typeof value !== 'object' || value === null || standsAsMade(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) markMade(item);
    return;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return;
  Object.defineProperty(value, MADE, { value: true });
  for (const key in value) if (key !== 'segments') markMade((value as Record<string, unknown>)[key]);
}

/** A copy of `value`, frozen or not, that can be written to: the words
 *  of its lines are shared. For a made page that has to be moved in the
 *  source and was frozen by an earlier build. */
export function unfrozenCopy<T>(value: T, done = new Map<object, object>()): T {
  if (typeof value !== 'object' || value === null) return value;
  const known = done.get(value);
  if (known !== undefined) return known as T;
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    done.set(value, list);
    for (const item of value) list.push(unfrozenCopy(item, done));
    return list as T;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  done.set(value, out);
  for (const key in value) {
    const member = (value as Record<string, unknown>)[key];
    out[key] = key === 'segments' && Array.isArray(member) ? [...(member as unknown[])] : unfrozenCopy(member, done);
  }
  return out as T;
}

/** A place in the source after an edit at `at` that made the text
 *  `delta` longer. */
const moved = (place: number, at: number, delta: number): number => (place >= at ? place + delta : place);

/** Move every number under `places` (a member that holds places in the
 *  source: a number, a list of them, or per attribute its start and end). */
function movePlacesUnder(places: Record<string | number, unknown>, at: number, delta: number, seen: Set<object>): void {
  if (seen.has(places)) return;
  seen.add(places);
  for (const k in places) {
    const n = places[k];
    if (typeof n === 'number') places[k] = moved(n, at, delta);
    else if (typeof n === 'object' && n !== null) movePlacesUnder(n as Record<string, unknown>, at, delta, seen);
  }
}

/** Move, in place, every place in the source `value` names (see
 *  {@link SOURCE_KEYS}) that is at or after `at` by `delta`. `seen`: one
 *  set for everything moved by one edit, since two blocks of a paragraph
 *  cut by a page share their source map. */
export function moveSourcePlaces(value: unknown, at: number, delta: number, seen: Set<object>): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) moveSourcePlaces(item, at, delta, seen);
    return;
  }
  const object = value as Record<string, unknown>;
  for (const key in object) {
    const member = object[key];
    if (!SOURCE_KEYS.has(key)) {
      if (key !== 'segments') moveSourcePlaces(member, at, delta, seen);
    } else if (typeof member === 'number') object[key] = moved(member, at, delta);
    else if (typeof member === 'object' && member !== null) movePlacesUnder(member as Record<string, unknown>, at, delta, seen);
  }
}

/** The last place in the source anything of `value` names, -1 when it
 *  names none. */
export function lastPlaceOf(value: unknown, seen = new Set<object>(), places = false): number {
  if (typeof value === 'number') return places ? value : -1;
  if (typeof value !== 'object' || value === null || seen.has(value)) return -1;
  seen.add(value);
  let last = -1;
  if (Array.isArray(value)) {
    for (const item of value) last = Math.max(last, lastPlaceOf(item, seen, places));
    return last;
  }
  for (const key in value) {
    if (key === 'segments' && !places) continue;
    last = Math.max(last, lastPlaceOf((value as Record<string, unknown>)[key], seen, places || SOURCE_KEYS.has(key)));
  }
  return last;
}

/** The pages that have been through the marks set after the passes
 *  (vowel ink, colours, underlines, highlights). */
const marked = new WeakSet<object>();

/** The marks are about to be set on `pages`: a page that stands as made
 *  and never had them (it was made by a pass that was not the build's
 *  last) cannot take them now. Throws the error a write to a frozen page
 *  throws, and the build is done again from nothing. */
export function beforeMarks(pages: readonly object[]): void {
  for (const page of pages) {
    if (standsAsMade(page) && !marked.has(page)) throw new TypeError('A page kept from the build before never had its marks set');
  }
}

/** `to` stands for `from` (a copy that can be written to): it has had
 *  its marks if `from` had. */
export function carryMarks(from: object, to: object): void {
  if (marked.has(from)) marked.add(to);
}

/** The marks are set on `pages`. */
export function afterMarks(pages: readonly object[]): void {
  for (const page of pages) marked.add(page);
}
