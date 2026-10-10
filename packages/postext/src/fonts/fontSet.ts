// Faces that arrive after text was measured (#629). The engine keeps, per
// font set, which faces of each family were loaded when it last looked;
// a build looks again at its start (cheaply: only when the set grew or
// shrank, is loading, or a face finished loading), and drops the widths of
// the families whose faces changed, so nothing measured with a fallback
// face outlives the face's arrival. `watchFonts` does the same as faces
// load, once per animation frame, and tells hosts (`onFontsChanged`) to
// lay out again.
//
// A set fires `loadingdone` a task after the `load()` promises of its
// faces resolve (#649): until then a declared face that finished loading
// shows neither in the set's size nor in the event. Chrome keeps the set
// at `status: 'loading'` meanwhile, which a look reads; whoever loaded the
// faces itself (`prepareFonts`) asks for the walk (`force`).

import { evictFontFamilies } from '../measure/font';
import { defaultFontSet, forgetInstalledFamilies, type FontFaceLike, type FontFaceSetLike } from './faces';

interface Tracked {
  /** `fontSet.size` when last read (-1: the set has none). */
  size: number;
  /** Per family (lower case): its loaded faces, as one string. */
  signature: Map<string, string>;
  /** A face finished loading since the last look. */
  dirty: boolean;
  onLoadingDone: (event: { fontfaces?: readonly FontFaceLike[] }) => void;
}

const tracked = new WeakMap<FontFaceSetLike, Tracked>();

function unquote(family: string): string {
  const f = family.trim();
  return /^(["']).*\1$/.test(f) ? f.slice(1, -1) : f;
}

/** The loaded faces of every family of `fontSet`. */
function signatureOf(fontSet: FontFaceSetLike): Map<string, string> {
  const parts = new Map<string, string[]>();
  for (const face of fontSet) {
    if (face.status !== 'loaded') continue;
    const family = unquote(face.family).toLowerCase();
    let list = parts.get(family);
    if (!list) parts.set(family, (list = []));
    list.push(`${face.weight}/${face.style}/${face.unicodeRange ?? ''}`);
  }
  const out = new Map<string, string>();
  for (const [family, list] of parts) out.set(family, list.sort().join(';'));
  return out;
}

function track(fontSet: FontFaceSetLike): Tracked {
  let t = tracked.get(fontSet);
  if (t) return t;
  const entry: Tracked = {
    size: fontSet.size ?? -1,
    signature: signatureOf(fontSet),
    dirty: false,
    onLoadingDone: () => {
      entry.dirty = true;
    },
  };
  fontSet.addEventListener?.('loadingdone', entry.onLoadingDone);
  tracked.set(fontSet, entry);
  t = entry;
  return t;
}

/** Whether the engine has looked at `fontSet` before. */
export function isFontSetTracked(fontSet: FontFaceSetLike): boolean {
  return tracked.has(fontSet);
}

/**
 * Look at `fontSet` again: the families whose loaded faces changed since
 * the last look get their measurements dropped (`evictFontFamilies`) and
 * are returned. The first look only records the set. Cheap when nothing
 * happened: the set is walked only when its size changed, while it is
 * loading, or once a face finished loading. `evict: false` records the
 * set without dropping anything (the caller drops what it knows changed).
 * `force: true` walks it whatever it reports: for a caller that has just
 * awaited `fontSet.load`, whose `loadingdone` is still to come.
 */
export function syncFontSet(fontSet: FontFaceSetLike | null | undefined = defaultFontSet(), options?: { evict?: boolean; force?: boolean }): string[] {
  if (!fontSet) return [];
  if (!tracked.has(fontSet)) {
    track(fontSet);
    return [];
  }
  const t = track(fontSet);
  const size = fontSet.size ?? -1;
  if (!options?.force && !t.dirty && size === t.size && size !== -1 && fontSet.status !== 'loading') return [];
  const signature = signatureOf(fontSet);
  const changed: string[] = [];
  for (const [family, sig] of signature) if (t.signature.get(family) !== sig) changed.push(family);
  for (const family of t.signature.keys()) if (!signature.has(family)) changed.push(family);
  t.signature = signature;
  t.size = size;
  t.dirty = false;
  if (changed.length > 0) {
    forgetInstalledFamilies();
    if (options?.evict !== false) evictFontFamilies(changed);
  }
  return changed;
}

/** Told which families' faces changed (lower case). */
export type FontsChangedListener = (families: readonly string[]) => void;

const listeners = new Set<FontsChangedListener>();

/**
 * Call `listener` whenever faces of a watched font set arrive or leave
 * (see {@link watchFonts}), after the engine has dropped what it measured
 * in their families: the host lays out again. Returns the unsubscribe.
 */
export function onFontsChanged(listener: FontsChangedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface Watch {
  count: number;
  pending: Set<string>;
  scheduled: boolean;
  listener: (event: { fontfaces?: readonly FontFaceLike[] }) => void;
}

const watches = new WeakMap<FontFaceSetLike, Watch>();

function nextFrame(run: () => void): void {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => unknown; document?: { hidden?: boolean } };
  // A hidden page runs no animation frames: a timer stands in.
  if (typeof g.requestAnimationFrame === 'function' && !g.document?.hidden) g.requestAnimationFrame(run);
  else setTimeout(run, 16);
}

/**
 * Watch `fontSet` (by default `document.fonts`, or `self.fonts` in a
 * worker): when faces finish loading, the measurements of their families
 * are dropped — at most once per animation frame, however many slices a
 * burst brings — and the {@link onFontsChanged} listeners are told.
 * Calls nest; the returned function stops this watch. `prepareFonts`
 * starts one on the set it loads into.
 */
export function watchFonts(fontSet: FontFaceSetLike | null | undefined = defaultFontSet()): () => void {
  if (!fontSet || !fontSet.addEventListener) return () => {};
  const set = fontSet;
  track(set);
  let w = watches.get(set);
  if (!w) {
    const watch: Watch = {
      count: 0,
      pending: new Set(),
      scheduled: false,
      listener: (event) => {
        for (const face of event.fontfaces ?? []) watch.pending.add(unquote(face.family).toLowerCase());
        if (watch.scheduled) return;
        watch.scheduled = true;
        nextFrame(() => {
          watch.scheduled = false;
          const changed = syncFontSet(set);
          // A build between the event and this frame may have dropped
          // them already: the faces still arrived.
          const families = [...new Set([...changed, ...watch.pending])];
          watch.pending.clear();
          if (families.length === 0) return;
          for (const l of [...listeners]) l(families);
        });
      },
    };
    set.addEventListener!('loadingdone', watch.listener);
    watches.set(set, watch);
    w = watch;
  }
  w.count++;
  let stopped = false;
  const current = w;
  return () => {
    if (stopped) return;
    stopped = true;
    current.count--;
    if (current.count === 0) {
      set.removeEventListener?.('loadingdone', current.listener);
      watches.delete(set);
    }
  };
}

/** Whether `fontSet` is watched. */
export function isWatchingFonts(fontSet: FontFaceSetLike | null | undefined = defaultFontSet()): boolean {
  return !!fontSet && watches.has(fontSet);
}
