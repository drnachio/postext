/**
 * Special inks in the PDF (#1563, #1566): what a spot ink's finish changes
 * in a render.
 *
 * - In a print render (CMYK through a profile, PDF/X) every special ink
 *   keeps its own Separation like any spot ink. A white ink and a varnish
 *   overprint unless the ink table or the colour says `overprint: false`:
 *   a white is laid under the colours and a varnish over them, and neither
 *   may knock out what it lies on.
 * - In a job on a few plates (`print.plates`) a white ink or a varnish the
 *   job does not print is left out: projecting it onto the colour plates
 *   would print a pale tint where the press was meant to lay down no ink.
 * - In a screen render (RGB, grey, or CMYK with no profile) a varnish puts
 *   no colour on the page; its paints are set fully transparent.
 *
 * The finish of a colour is read from the raw configuration, since the
 * normalised spot colours do not tell an unset `overprint` from `false`.
 */

import {
  finishOfSpot,
  finishOverprintsByDefault,
  finishPaintsOnScreen,
  inkEntry,
  resolveInkFinish,
  type InkFinish,
  type ResolvedPrintInk,
  type ResolvedSpotColor,
} from 'postext';

/** What a spot colour says of its ink beyond the normalised values: its
 *  finish, and its `overprint` only when it sets one. */
export interface SpotFinishNote {
  name: string;
  finish?: InkFinish;
  overprint?: boolean;
}

const hexKey = (hex: string): string => hex.slice(0, 7).toLowerCase();

/** A spot colour as `authoredSpotColors` takes one: a hex, the `spot`
 *  model, an ink with a name and an alternate. */
function rawSpot(v: unknown): { hex: string; spot: { name: string; overprint?: unknown; finish?: unknown } } | undefined {
  const o = v as { hex?: unknown; model?: unknown; spot?: unknown };
  if (o.model !== 'spot' || typeof o.hex !== 'string' || !o.spot || typeof o.spot !== 'object') return undefined;
  const s = o.spot as { name?: unknown; cmyk?: unknown };
  if (typeof s.name !== 'string' || s.name.trim() === '' || !s.cmyk || typeof s.cmyk !== 'object') return undefined;
  return o as { hex: string; spot: { name: string; overprint?: unknown; finish?: unknown } };
}

/**
 * The finish notes of a configuration's spot colours, by screen hex
 * (`#rrggbb`, lower case), the first colour of a hex winning as in
 * `authoredSpotColors`, so each note belongs to the spot colour that map
 * holds.
 */
export function spotFinishNotes(config: unknown, into: Map<string, SpotFinishNote> = new Map()): Map<string, SpotFinishNote> {
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const spot = rawSpot(v);
    if (spot) {
      const key = hexKey(spot.hex);
      if (/^#[0-9a-f]{6}$/.test(key) && !into.has(key)) {
        const finish = resolveInkFinish(spot.spot.finish);
        const over = spot.spot.overprint;
        into.set(key, { name: spot.spot.name.trim(), ...(finish ? { finish } : {}), ...(typeof over === 'boolean' ? { overprint: over } : {}) });
      }
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  return into;
}

/** The finish of the ink a note names: the ink table's, else the
 *  colour's. */
export function noteFinish(note: SpotFinishNote, inks: readonly ResolvedPrintInk[]): InkFinish | undefined {
  return finishOfSpot({ name: note.name, cmyk: { c: 0, m: 0, y: 0, k: 0 }, ...(note.finish ? { finish: note.finish } : {}) }, inks);
}

/**
 * The spot colours with their finishes: each one carries its ink's finish
 * (the ink table's over the colour's), and a white ink or a varnish
 * overprints unless the ink table or the colour sets `overprint`. A
 * colour of an ordinary ink is returned as it is, so a book without
 * special inks renders as before. Run before the ink table renames and
 * merges the inks (`spotsThroughInkTable`), which keeps both fields.
 */
export function withInkFinishes(
  spots: ReadonlyMap<string, ResolvedSpotColor>,
  notes: ReadonlyMap<string, SpotFinishNote>,
  inks: readonly ResolvedPrintInk[],
): Map<string, ResolvedSpotColor> {
  const out = new Map<string, ResolvedSpotColor>();
  for (const [hex, spot] of spots) {
    const note = notes.get(hex) ?? { name: spot.name, ...(spot.finish ? { finish: spot.finish } : {}) };
    const finish = noteFinish(note, inks);
    if (!finish) {
      out.set(hex, spot);
      continue;
    }
    const overprint = inkEntry(spot.name, inks)?.overprint ?? note.overprint ?? finishOverprintsByDefault(finish);
    out.set(hex, { ...spot, finish, overprint });
  }
  return out;
}

/** Whether an ink of this finish is left out rather than projected onto
 *  the plates of a job that does not print it: a white ink and a varnish,
 *  which lay down no colour of their own. */
export function droppedOffPlates(finish: InkFinish | undefined): boolean {
  return finish?.kind === 'white' || finish?.kind === 'varnish';
}

/**
 * The screen hexes (`#rrggbb`) of a render's varnish inks, from every
 * document's colours and the ink table: a screen render (RGB, grey, or
 * CMYK with no profile) sets their paints fully transparent, since a
 * varnish puts no colour on the page. Empty in a book without one.
 */
export function screenVarnishHexes(configs: readonly unknown[], inks: readonly ResolvedPrintInk[]): Set<string> {
  const notes = new Map<string, SpotFinishNote>();
  for (const config of configs) spotFinishNotes(config, notes);
  const out = new Set<string>();
  for (const [hex, note] of notes) if (!finishPaintsOnScreen(noteFinish(note, inks))) out.add(hex);
  return out;
}

/** The varnish hexes of the page being painted in a screen render: set by
 *  {@link withScreenVarnish} around a page's (synchronous) painting, the
 *  way the shaping language is. */
let currentVarnish: ReadonlySet<string> | undefined;

/** Run `fn` with `hexes` as the varnish colours a screen render skips. */
export function withScreenVarnish<T>(hexes: ReadonlySet<string> | undefined, fn: () => T): T {
  if (!hexes || hexes.size === 0) return fn();
  const before = currentVarnish;
  currentVarnish = hexes;
  try {
    return fn();
  } finally {
    currentVarnish = before;
  }
}

/** Whether a colour string is a varnish the screen render being painted
 *  skips. */
export function isScreenVarnish(hex: string): boolean {
  return !!currentVarnish && currentVarnish.has(hexKey(hex));
}
