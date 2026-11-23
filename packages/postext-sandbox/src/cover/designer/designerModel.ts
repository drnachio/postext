// The cover design as the designer edits it (#1669): every item placed on
// the sheet — the text boxes, the movable elements, the effects, the
// logos and the finishes with a box of their own — with its box in mm on
// the sheet, and the edits that write it back into the design's `cover`
// part. Elements keep the engine's placement by zone (`placeCoverElement`)
// so they follow their zone when the spine or the format changes.

import type { ColorValue } from 'postext';
import {
  coverElementRect,
  placeCoverElement,
  type CoverConfig,
  type CoverElement,
  type CoverFinish,
  type CoverFinishProcess,
  type CoverLogo,
  type CoverPlacement,
  type CoverTextFrame,
  type CoverZoneName,
  type ProductionSheet,
  type SheetRect,
} from 'postext/production';

export type DesignerLayer = 'textBoxes' | 'elements' | 'effects' | 'logos' | 'finishes';

/** An item of the design, by its layer and id (a text box's id is its
 *  name). */
export interface ItemRef {
  layer: DesignerLayer;
  id: string;
}

export interface DesignerItem extends ItemRef {
  /** Its box on the sheet, mm; absent for a finish that takes another
   *  item's shape, or an element whose zone this sheet lacks. */
  rect?: SheetRect;
  kind: CoverElement['kind'] | 'text' | CoverFinishProcess;
}

export const LAYERS: readonly DesignerLayer[] = ['elements', 'textBoxes', 'effects', 'logos', 'finishes'];

export const sameRef = (a: ItemRef | null | undefined, b: ItemRef | null | undefined): boolean => !!a && !!b && a.layer === b.layer && a.id === b.id;

const idOf = (layer: DesignerLayer, item: { id?: string; name?: string }) => (layer === 'textBoxes' ? item.name! : item.id!);

function listOf(cover: CoverConfig, layer: DesignerLayer): readonly (CoverElement | CoverTextFrame | CoverFinish)[] {
  return (cover[layer] as readonly (CoverElement | CoverTextFrame | CoverFinish)[] | undefined) ?? [];
}

/** Every item of the design in its layer's order, back to front. */
export function designerItems(cover: CoverConfig | undefined, sheet: ProductionSheet): DesignerItem[] {
  const c = cover ?? {};
  const out: DesignerItem[] = [];
  for (const t of c.textBoxes ?? []) out.push({ layer: 'textBoxes', id: t.name, rect: t.rect, kind: 'text' });
  for (const layer of ['elements', 'effects', 'logos'] as const) {
    for (const e of (c[layer] ?? []) as CoverElement[]) {
      const rect = coverElementRect(sheet, e);
      out.push({ layer, id: e.id, kind: e.kind, ...(rect ? { rect } : {}) });
    }
  }
  for (const f of c.finishes ?? []) {
    const rect = 'box' in f.shape ? coverElementRect(sheet, f.shape.box) : undefined;
    out.push({ layer: 'finishes', id: f.id, kind: f.process, ...(rect ? { rect } : {}) });
  }
  return out;
}

/** The item a ref names. */
export function itemOf(cover: CoverConfig | undefined, ref: ItemRef): CoverElement | CoverTextFrame | CoverFinish | undefined {
  return listOf(cover ?? {}, ref.layer).find((i) => idOf(ref.layer, i as { id?: string; name?: string }) === ref.id);
}

function withList(cover: CoverConfig, layer: DesignerLayer, list: readonly unknown[]): CoverConfig {
  const next = { ...cover } as Record<string, unknown>;
  if (list.length > 0) next[layer] = list;
  else delete next[layer];
  return next as CoverConfig;
}

function mapItem(cover: CoverConfig, ref: ItemRef, fn: (item: never) => unknown): CoverConfig {
  return withList(cover, ref.layer, listOf(cover, ref.layer).map((i) => (idOf(ref.layer, i as never) === ref.id ? fn(i as never) : i)));
}

const round = (v: number) => Math.round(v * 100) / 100;
const roundRect = (r: SheetRect): SheetRect => ({ x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) });

/** A placement for a box on the sheet, by the zone it falls in. */
function placementOf(sheet: ProductionSheet, rect: SheetRect): CoverPlacement {
  const placed = placeCoverElement(sheet, { id: 'x', kind: 'box', zone: 'front', x: 0, y: 0, width: 0, height: 0 }, rect);
  const { id: _id, kind: _kind, ...placement } = placed;
  return placement;
}

/** The design with an item moved or resized to `rect` (mm on the sheet). */
export function placeItem(cover: CoverConfig | undefined, sheet: ProductionSheet, ref: ItemRef, rect: SheetRect): CoverConfig {
  const c = cover ?? {};
  if (ref.layer === 'textBoxes') return mapItem(c, ref, (t: CoverTextFrame) => ({ ...t, rect: roundRect(rect) }));
  if (ref.layer === 'finishes') {
    return mapItem(c, ref, (f: CoverFinish) => ('box' in f.shape ? { ...f, shape: { ...f.shape, box: placementOf(sheet, rect) } } : f));
  }
  return mapItem(c, ref, (e: CoverElement) => placeCoverElement(sheet, e, rect));
}

/** The design with an item's own fields changed (`undefined` removes one). */
export function patchItem(cover: CoverConfig | undefined, ref: ItemRef, patch: Record<string, unknown>): CoverConfig {
  return mapItem(cover ?? {}, ref, (item: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...item, ...patch };
    for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
    return next;
  });
}

/** The design without an item; a finish that took its shape goes too. */
export function removeItem(cover: CoverConfig | undefined, ref: ItemRef): CoverConfig {
  const c = cover ?? {};
  let next = withList(c, ref.layer, listOf(c, ref.layer).filter((i) => idOf(ref.layer, i as never) !== ref.id));
  if (ref.layer !== 'textBoxes' && ref.layer !== 'finishes') {
    next = withList(next, 'finishes', (next.finishes ?? []).filter((f) => !('element' in f.shape && f.shape.element === ref.id)));
  }
  return next;
}

/** The design with an item one step to the front (`1`) or the back (`-1`)
 *  of its layer. */
export function reorderItem(cover: CoverConfig | undefined, ref: ItemRef, step: 1 | -1): CoverConfig {
  const c = cover ?? {};
  const list = [...listOf(c, ref.layer)];
  const i = list.findIndex((x) => idOf(ref.layer, x as never) === ref.id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return c;
  [list[i], list[j]] = [list[j]!, list[i]!];
  return withList(c, ref.layer, list);
}

/** Every id and name the design uses: ids are shared by its layers (a
 *  finish names an element by id). */
export function usedIds(cover: CoverConfig | undefined): Set<string> {
  const c = cover ?? {};
  return new Set([
    ...(c.textBoxes ?? []).map((t) => t.name),
    ...[...(c.elements ?? []), ...(c.effects ?? []), ...(c.logos ?? []), ...(c.finishes ?? [])].map((e) => e.id),
  ]);
}

/** `base-1`, `base-2`… the first one free. */
export function freeId(used: ReadonlySet<string>, base: string): string {
  let n = 1;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** A box in the middle of a zone, `share` of its width wide and `aspect`
 *  (height / width) tall, within the zone. */
export function boxInZone(sheet: ProductionSheet, zone: CoverZoneName, share = 0.5, aspect = 0.5): SheetRect {
  const z = sheet.zones.find((s) => s.name === zone) ?? sheet.zones.find((s) => s.name === 'front') ?? sheet.zones[0]!;
  const width = Math.min(z.rect.width * share, z.rect.height * share / Math.max(aspect, 0.01));
  const height = width * aspect;
  return roundRect({ x: z.rect.x + (z.rect.width - width) / 2, y: z.rect.y + (z.rect.height - height) / 2, width, height });
}

export interface Added {
  cover: CoverConfig;
  ref: ItemRef;
}

/** A text box added in the middle of a zone. */
export function addTextBox(cover: CoverConfig | undefined, sheet: ProductionSheet, zone: CoverZoneName = 'front'): Added {
  const c = cover ?? {};
  const name = freeId(usedIds(c), 'text');
  const frame: CoverTextFrame = { name, rect: boxInZone(sheet, zone, 0.6, 0.25) };
  return { cover: withList(c, 'textBoxes', [...(c.textBoxes ?? []), frame]), ref: { layer: 'textBoxes', id: name } };
}

/** An element added in the middle of a zone: a picture of the book's (in
 *  its proportions), or a box of colour. Effects and logos go to their
 *  own layers. */
export function addElement(
  cover: CoverConfig | undefined,
  sheet: ProductionSheet,
  layer: 'elements' | 'effects' | 'logos',
  what: { resourceId: string; aspect: number } | { color: ColorValue },
  zone: CoverZoneName = 'front',
): Added {
  const c = cover ?? {};
  const base = layer === 'logos' ? 'logo' : layer === 'effects' ? 'effect' : 'resourceId' in what ? 'picture' : 'box';
  const id = freeId(usedIds(c), base);
  const rect = boxInZone(sheet, zone, layer === 'logos' ? 0.2 : 0.5, 'resourceId' in what ? what.aspect : 0.5);
  const seed: CoverElement = 'resourceId' in what
    ? { id, kind: 'image', resourceId: what.resourceId, zone, x: 0, y: 0, width: 0, height: 0 }
    : { id, kind: 'box', color: what.color, zone, x: 0, y: 0, width: 0, height: 0, ...(layer === 'effects' ? { opacity: 0.6 } : {}) };
  const placed = placeCoverElement(sheet, seed, rect);
  const item = layer === 'logos' ? ({ ...placed, kind: 'image', clearance: 3 } as CoverLogo) : placed;
  return { cover: withList(c, layer, [...listOf(c, layer), item]), ref: { layer, id } };
}

/** A collection's catalogue added (#1673): the pictures of its titles in
 *  a grid, a box across the middle of the zone (the front, else the
 *  sheet's first panel: an endpaper's), the book's own outlined. */
export function addCatalogue(cover: CoverConfig | undefined, sheet: ProductionSheet, titles: number): Added {
  const c = cover ?? {};
  const id = freeId(usedIds(c), 'catalogue');
  const zone: CoverZoneName = sheet.zones.some((z) => z.name === 'front') ? 'front' : sheet.zones.find((z) => z.name === 'flyleaf')?.name ?? sheet.zones[0]!.name;
  // A row of titles about as tall as a cover in proportion.
  const across = Math.max(1, Math.min(titles, 4));
  const rect = boxInZone(sheet, zone, 0.8, 1.45 / across);
  const seed: CoverElement = { id, kind: 'catalogue', zone, x: 0, y: 0, width: 0, height: 0, gap: 3, fit: 'cover', stroke: { color: { hex: '#1f3a5f', model: 'hex' }, width: 0.6 } };
  return { cover: withList(c, 'elements', [...(c.elements ?? []), placeCoverElement(sheet, seed, rect)]), ref: { layer: 'elements', id } };
}

/** A finish added: on an item's shape when one is given, else on a box
 *  of its own in the middle of the front. */
export function addFinish(cover: CoverConfig | undefined, sheet: ProductionSheet, process: CoverFinishProcess, on?: ItemRef): Added {
  const c = cover ?? {};
  const id = freeId(usedIds(c), process);
  const shape: CoverFinish['shape'] = on && on.layer !== 'textBoxes' && on.layer !== 'finishes'
    ? { element: on.id }
    : { box: placementOf(sheet, boxInZone(sheet, 'front', 0.4, 0.4)) };
  return { cover: withList(c, 'finishes', [...(c.finishes ?? []), { id, process, shape }]), ref: { layer: 'finishes', id } };
}

/** A box moved by (dx, dy) mm. */
export const nudge = (r: SheetRect, dx: number, dy: number): SheetRect => roundRect({ ...r, x: r.x + dx, y: r.y + dy });
