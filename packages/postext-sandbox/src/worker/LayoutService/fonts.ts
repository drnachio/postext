// Font waits shared by every build: how long a build waits for files, the
// characters a laid-out document sets, whether fonts are still pending and
// who is told when late faces arrive (#1276: split out of LayoutService.ts).
import type { VDTDocument } from 'postext';

/** Layouts at most after the first, for faces its pages name that the
 *  configuration did not. */
export const FONT_ROUNDS = 2;

/**
 * The longest a build waits for the files of its faces (#757). A build
 * waits for its font requests while they are answered: the loader gives a
 * request up only when none of them has received a byte for a while
 * (`FONT_STALL_MS`), so a book of nine hundred files on a slow line is
 * waited for in full and a connection that stalls costs its own bound.
 * This is the last resort behind that rule, for a network that keeps
 * every request alive and never ends one. Ten minutes: the nine hundred
 * files of a Japanese book (22 MB) take about two at 1.5 Mbit/s and seven
 * at 400 kbit/s. Past it the chapter is laid out with the faces the worker
 * has, as after a request given up, and again when the rest arrive
 * (`onLateFonts`).
 */
export const FONT_WAIT_CEILING_MS = 600_000;

/** Times a family whose files the network did not give is asked for
 *  again, a while apart, without a build asking. */
export const FONT_RETRIES = 3;

/** How long the fonts count as unsettled after late faces were announced:
 *  the views lay out again in an effect, a moment after they are told. */
export const LATE_RELAYOUT_GRACE_MS = 1_000;

/** Keys of a laid-out document that hold no text it sets (its
 *  configuration, raw sources, pictures). */
const TEXTLESS_KEYS = new Set(['config', 'sourceMap', 'attrSources', 'resource', 'svg', 'mathRender', 'palette', 'structure']);

/**
 * The characters a laid-out document sets, once each: the `text` of its
 * lines and segments, of its captions, notes and cells, of its running
 * heads and design texts. More than the chapter's own source holds: the
 * titles and summaries of a contents page, the part title of a running
 * head and the entries of an index come from the other chapters.
 */
export function documentCharacters(doc: VDTDocument): string {
  const seen = new Set<string>();
  const visited = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      // Arrays of numbers (source maps, break lists) hold no text.
      if (node.length > 0 && (node[0] === null || typeof node[0] !== 'object')) return;
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    for (const key in rec) {
      const value = rec[key];
      if (typeof value === 'string') {
        if (key === 'text') for (const ch of value) if (ch > ' ') seen.add(ch);
      } else if (value && typeof value === 'object' && !TEXTLESS_KEYS.has(key)) {
        walk(value);
      }
    }
  };
  walk(doc.blocks);
  walk(doc.pages);
  return [...seen].join('');
}

// Whether the fonts of the builds asked so far are settled: no build is
// waiting for files, no family short of files is about to be asked for
// again, no view has just been told to lay out again for late faces.
let fontsUnsettled = 0;
const fontsPendingListeners = new Set<() => void>();
export const unsettle = (by: number): void => {
  const before = fontsUnsettled > 0;
  fontsUnsettled = Math.max(0, fontsUnsettled + by);
  if (before !== fontsUnsettled > 0) for (const listener of [...fontsPendingListeners]) listener();
};

/** True while a build waits for font files, a family the network left
 *  short of files is due another try, or the views were just told to lay
 *  out again for faces that arrived late. */
export function fontsPending(): boolean {
  return fontsUnsettled > 0;
}

/** Told when `fontsPending` changes. */
export function onFontsPending(listener: () => void): () => void {
  fontsPendingListeners.add(listener);
  return () => { fontsPendingListeners.delete(listener); };
}

type LateFontsListener = (families: string[]) => void;
export const lateFontsListeners = new Set<LateFontsListener>();

/**
 * Faces reached a layout worker after a build that went ahead without
 * them (a request given up that a later try answered, the ceiling): the
 * documents built meanwhile were measured without them
 * (`builtWithoutFaces`), and whoever holds one lays out again. The
 * listener gets the families.
 */
export function onLateFonts(listener: LateFontsListener): () => void {
  lateFontsListeners.add(listener);
  return () => { lateFontsListeners.delete(listener); };
}

/** True when `work` settles within `ms`; false when the wait ends first
 *  (`work` goes on). Rejects as `work` does, while waited for. */
export function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  if (!Number.isFinite(ms)) return work.then(() => true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.then(() => true),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); }),
  ]).finally(() => clearTimeout(timer));
}
