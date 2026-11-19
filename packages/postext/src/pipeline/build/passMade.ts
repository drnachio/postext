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

/** What rides with a page: things kept beside it that name places in
 *  the source (the warnings a check gave its lines), moved when it is. */
const riders = new WeakMap<object, object[]>();

/** `value` rides with `page`. */
export function ridesWith(page: object, value: object): void {
  const list = riders.get(page);
  if (list) list.push(value);
  else riders.set(page, [value]);
}

/** Move every number under `places` (a member that holds places in the
 *  source: a number, a list of them, or per attribute its start and end). */
function movePlacesUnder(places: Record<string | number, unknown>, at: number, delta: number, seen: Set<object>): void {
  if (seen.has(places)) return;
  seen.add(places);
  // A source map is a list of hundreds of numbers, a whole chapter's tens
  // of thousands: walked by index (#1644), not by key, which names each
  // index as a string.
  if (Array.isArray(places)) {
    for (let i = 0; i < places.length; i++) {
      const n: unknown = places[i];
      if (typeof n === 'number') {
        if (n >= at) places[i] = n + delta;
      } else if (typeof n === 'object' && n !== null) movePlacesUnder(n as Record<string, unknown>, at, delta, seen);
    }
    return;
  }
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
  const riding = riders.get(value);
  if (riding) moveSourcePlaces(riding, at, delta, seen);
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

// Moves that wait (#1639). A build has several passes and only the last
// one's document goes out; the pages each of the others took from the
// build before need their places in the source only if a later build
// reads them. So a pass leaves the moves of its taken pages undone, and
// they are made when its document is the one that goes out
// ({@link settleMoves}), when another edit changes which pages are taken,
// or when eight have gathered.

/** The moves not yet made on the pages a pass took, in order. */
export interface WaitingMoves {
  /** The pages (and the blocks no page holds) they are owed to. */
  objects: object[];
  list: { at: number; delta: number }[];
}

/** Make the moves that wait, and forget them. Each is noted against the
 *  pages and blocks it was made on ({@link movesMadeOn}). */
export function makeMoves(moves: WaitingMoves): void {
  if (moves.list.length === 0) return;
  for (const move of moves.list) {
    const seen = new Set<object>();
    for (const object of moves.objects) moveSourcePlaces(object, move.at, move.delta, seen);
  }
  const made = [...moves.list];
  for (const object of moves.objects) {
    const noted = journal.get(object);
    if (noted) noted.push(...made);
    else journal.set(object, [...made]);
  }
  moves.list.length = 0;
}

/** The moves made on each page and block since it was last asked: what a
 *  host that holds a copy of the page has to do to its copy (#1642). */
const journal = new WeakMap<object, { at: number; delta: number }[]>();

/** The moves made on `object` (a page, a block) since this was last
 *  asked of it, in order; then none. */
export function movesMadeOn(object: object): { at: number; delta: number }[] | undefined {
  const made = journal.get(object);
  if (made) journal.delete(object);
  return made;
}

/** The moves that wait on a page, by the page: the document that goes
 *  out may be another object than the pass's (index marks, chapter runs),
 *  its pages are the pass's. */
const waiting = new WeakMap<object, WaitingMoves>();

/** The pages and blocks of `moves` hold places that wait to be moved. */
export function movesWait(moves: WaitingMoves): void {
  for (const object of moves.objects) waiting.set(object, moves);
}

/** `pages` are the pages of the document that goes out: their moves are
 *  made. */
export function settleMoves(pages: readonly object[]): void {
  for (const page of pages) {
    const moves = waiting.get(page);
    if (moves && moves.list.length > 0) makeMoves(moves);
  }
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
