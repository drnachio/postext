import type { DieCutPlacement, DieCutsConfig, DieShape, Dimension } from 'postext';

/*
 * The edits of the Die-cuts section (`dieCuts`, #1570): its shapes, the
 * pages they are put on, the rounded corners and the outline. A book
 * stores only what it sets: an empty list is left out, and `dieCuts`
 * itself when nothing is left in it.
 */

const mm = (value: number): Dimension => ({ value, unit: 'mm' });

/** `dieCuts` as stored: without empty lists, `undefined` when empty. */
export function tidyDieCuts(cfg: DieCutsConfig | undefined): DieCutsConfig | undefined {
  if (!cfg) return undefined;
  const out: DieCutsConfig = {};
  if (cfg.shapes?.length) out.shapes = cfg.shapes;
  if (cfg.pages?.length) out.pages = cfg.pages;
  if (cfg.corners) out.corners = cfg.corners;
  if (cfg.outline) out.outline = cfg.outline;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** An id a placement and `:::diecut{die=…}` can name: lower case letters,
 *  digits, `-` and `_`. */
export function slugifyDieId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The first `die-N` no shape has. */
export function nextDieId(shapes: readonly DieShape[] | undefined): string {
  const taken = new Set((shapes ?? []).map((s) => s.id));
  let n = (shapes?.length ?? 0) + 1;
  while (taken.has(`die-${n}`)) n++;
  return `die-${n}`;
}

/** A new shape: a 30 mm rounded square 20 mm in from the top-left corner
 *  of the trim, a hole the reader moves and sizes from there. */
export function newDieShape(shapes: readonly DieShape[] | undefined): DieShape {
  return { id: nextDieId(shapes), shape: 'roundRect', x: mm(20), y: mm(20), width: mm(30), height: mm(30) };
}

export function addShape(cfg: DieCutsConfig | undefined): DieCutsConfig | undefined {
  return tidyDieCuts({ ...cfg, shapes: [...(cfg?.shapes ?? []), newDieShape(cfg?.shapes)] });
}

/** Shape `index` changed by `partial`; a member given `undefined` is
 *  removed. The id is changed with {@link renameShape}. */
export function updateShape(cfg: DieCutsConfig | undefined, index: number, partial: Partial<Omit<DieShape, 'id'>>): DieCutsConfig | undefined {
  const shapes = cfg?.shapes ?? [];
  if (index < 0 || index >= shapes.length) return cfg;
  const next = shapes.map((s, i) => {
    if (i !== index) return s;
    const merged = { ...s, ...partial } as DieShape & Record<string, unknown>;
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    // A path's data and view box mean nothing to another shape.
    if (merged.shape !== 'path') {
      delete merged.d;
      delete merged.viewBox;
    }
    if (merged.shape !== 'roundRect') delete merged.radius;
    return merged as DieShape;
  });
  return tidyDieCuts({ ...cfg, shapes: next });
}

/** Shape `oldId` renamed `newId`, and the placements that name it with it.
 *  A blank or taken id leaves everything as it was. */
export function renameShape(cfg: DieCutsConfig | undefined, oldId: string, newId: string): DieCutsConfig | undefined {
  const shapes = cfg?.shapes ?? [];
  const id = slugifyDieId(newId);
  if (!id || id === oldId || shapes.some((s) => s.id === id)) return cfg;
  return tidyDieCuts({
    ...cfg,
    shapes: shapes.map((s) => (s.id === oldId ? { ...s, id } : s)),
    pages: (cfg?.pages ?? []).map((p) => (p.die === oldId ? { ...p, die: id } : p)),
  });
}

/** Without shape `id`, and without the placements that put it on pages
 *  (they would cut nothing). */
export function removeShape(cfg: DieCutsConfig | undefined, id: string): DieCutsConfig | undefined {
  return tidyDieCuts({
    ...cfg,
    shapes: (cfg?.shapes ?? []).filter((s) => s.id !== id),
    pages: (cfg?.pages ?? []).filter((p) => p.die !== id),
  });
}

/** A new placement of shape `die`, on page 1 until the reader says which. */
export function addPlacement(cfg: DieCutsConfig | undefined, die: string): DieCutsConfig | undefined {
  return tidyDieCuts({ ...cfg, pages: [...(cfg?.pages ?? []), { pages: '1', die }] });
}

export function updatePlacement(cfg: DieCutsConfig | undefined, index: number, partial: Partial<DieCutPlacement>): DieCutsConfig | undefined {
  const pages = cfg?.pages ?? [];
  if (index < 0 || index >= pages.length) return cfg;
  return tidyDieCuts({ ...cfg, pages: pages.map((p, i) => (i === index ? { ...p, ...partial } : p)) });
}

export function removePlacement(cfg: DieCutsConfig | undefined, index: number): DieCutsConfig | undefined {
  return tidyDieCuts({ ...cfg, pages: (cfg?.pages ?? []).filter((_, i) => i !== index) });
}

/** The rounded corners set, or removed with `undefined`. */
export function setCorners(cfg: DieCutsConfig | undefined, corners: DieCutsConfig['corners']): DieCutsConfig | undefined {
  const next: DieCutsConfig = { ...cfg };
  if (corners) next.corners = corners;
  else delete next.corners;
  return tidyDieCuts(next);
}

/** The outline set, or removed with `undefined`. */
export function setOutline(cfg: DieCutsConfig | undefined, outline: DieCutsConfig['outline']): DieCutsConfig | undefined {
  const next: DieCutsConfig = { ...cfg };
  if (outline) next.outline = outline;
  else delete next.outline;
  return tidyDieCuts(next);
}

/** What a new outline starts as: a recto's trim with its fore-edge
 *  bellied out, in a 100 × 100 view box, for the reader to replace. */
export const OUTLINE_START = { d: 'M0 0 H90 Q100 50 90 100 H0 Z', viewBox: [100, 100] as [number, number] };

/** Whether a page list reads as the engine reads it: `5`, `3-12`,
 *  `3,7,11-13` (page numbers by position, from 1). */
export function validPageList(text: string): boolean {
  return /^\s*[1-9]\d*(\s*-\s*[1-9]\d*)?(\s*,\s*[1-9]\d*(\s*-\s*[1-9]\d*)?)*\s*$/.test(text);
}

/** Whether SVG path data uses only the commands a die shape takes (`M L H
 *  V C S Q T A Z`, either case) and numbers. */
export function validPathData(d: string): boolean {
  const t = d.trim();
  return t.length > 0 && /^[MLHVCSQTAZmlhvcsqtaz]/.test(t) && /^[MLHVCSQTAZmlhvcsqtaz0-9eE.,+\-\s]+$/.test(t);
}

const MM_PER: Record<Dimension['unit'], number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96, em: 12 * 25.4 / 72, rem: 12 * 25.4 / 72 };

/** A length in millimetres, for the previews' proportions (an em counts
 *  as 12 pt: a die shape is not set in a font). */
export function dimensionMm(d: Dimension): number {
  return d.value * (MM_PER[d.unit] ?? 1);
}
