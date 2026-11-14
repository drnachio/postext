// The die line as the book's die-cuts (#1576). The die line is the paths
// on a layer named as die lines are (Die line, Die, Troquel, Stanzform…),
// or the paths stroked with the die line's swatch (CutContour, Die,
// Dieline…), on the pages or on their masters. They are no artwork of the
// book: each closed path inside the page is a hole, and a path round the
// whole page is the leaf's outline (rounded corners, or a shaped book).
//
// A hole cuts its whole leaf: the two sides of a leaf show it mirrored,
// and the same hole on the next leaves is one die that goes through them
// (`leaves`). So the holes are read leaf by leaf, as the recto has them,
// and each run of leaves a hole goes through is one placement, on the
// recto it starts on. Holes of the same shape and size make one die
// placed on several pages. A die path an export from Postext wrote names
// its die in its label (`postext:die`): the die keeps its id, its name,
// its path data and its text wrap.

import { dieShapeInBox, type DieCutsConfig, type DieShape, type PrintDieLineConfig, type VDTPathCommand } from 'postext';
import type { IdmlColor, IdmlPage, IdmlPageItem } from '../../model/document.js';
import { multiply, type Matrix, type Path, type Point } from '../../model/geometry.js';
import { DIE_LABEL, isDieLineName } from '../../model/specialInks.js';
import { masterItems } from '../../resolve/masters.js';
import { itemExtent, pageMatrix, pageSize, pageUnder, spreadMatrix, transformPaths } from '../../resolve/geometry.js';
import { labelPairs } from '../../read/resources.js';
import type { Context } from '../context.js';
import { anchorBox, classifyHole, cornerOptions, cornerRadii, CORNERS, mirrorPath, pathData, sameAnchors, type HoleShape, type Radii } from './dieShapes.js';
import { dieSwatchRefs } from './inks.js';
import { allPages } from '../pagesetup.js';
import { mm, pt } from '../values.js';

/** What a die path's label says of its die. */
interface DieLabel {
  id?: string;
  name?: string;
  shape?: string;
  d?: string;
  viewBox?: [number, number];
  wrap?: DieShape['wrap'];
}

/** One closed path of the die line on a page. */
interface DiePath {
  page: number;
  path: Path;
  item: IdmlPageItem;
  label?: DieLabel;
}

/** A path read from a label, checked: only the fields a die has. */
function dieLabel(item: IdmlPageItem): DieLabel | undefined {
  const raw = item.properties.Label ? labelPairs([item.properties.Label])?.[DIE_LABEL] : undefined;
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: DieLabel = {};
    if (typeof v.id === 'string' && v.id) out.id = v.id;
    if (typeof v.name === 'string' && v.name) out.name = v.name;
    if (typeof v.shape === 'string') out.shape = v.shape;
    if (typeof v.d === 'string') out.d = v.d;
    if (Array.isArray(v.viewBox) && v.viewBox.length === 2 && v.viewBox.every((n) => typeof n === 'number' && n > 0)) out.viewBox = v.viewBox as [number, number];
    if (v.wrap === false) out.wrap = false;
    else if (v.wrap && typeof v.wrap === 'object') {
      const gap = (v.wrap as { gap?: { value?: unknown; unit?: unknown } }).gap;
      if (gap && typeof gap.value === 'number' && typeof gap.unit === 'string') out.wrap = { gap: { value: gap.value, unit: gap.unit } as never };
    }
    return out;
  } catch {
    return undefined;
  }
}

const isRecto = (i: number): boolean => i % 2 === 0;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** What the import found of the die line. */
export interface DieRead {
  dieCuts?: DieCutsConfig;
  dieLine?: PrintDieLineConfig;
}

/** The anchors of a die's path data stretched to `box` (pt). */
function labelAnchors(label: DieLabel, box: { x: number; y: number; width: number; height: number }): Point[] {
  const cmds: VDTPathCommand[] = dieShapeInBox({ shape: 'path', d: label.d, viewBox: label.viewBox ?? [1, 1], radius: { value: 0, unit: 'pt' } }, box, { dpi: 72, trimOffset: 0, width: 0, height: 0 });
  const out: Point[] = [];
  for (const c of cmds) if (c.op !== 'Z' && !out.some((p) => Math.abs(p.x - c.x) < 1e-3 && Math.abs(p.y - c.y) < 1e-3)) out.push({ x: c.x, y: c.y });
  return out;
}

/** The box a label's path data stands in so that its anchors fall on
 *  `path`'s, if they do. */
function labelFits(label: DieLabel, path: Path): { x: number; y: number; width: number; height: number } | undefined {
  if (!label.d) return undefined;
  const [vw, vh] = label.viewBox ?? [1, 1];
  const unit = labelAnchors(label, { x: 0, y: 0, width: vw, height: vh });
  const ub = anchorBox({ open: false, points: unit.map((p) => ({ anchor: p, left: p, right: p })) });
  const gb = anchorBox(path);
  if (!ub || !gb || ub.right - ub.left <= 0 || ub.bottom - ub.top <= 0) return undefined;
  const sx = (gb.right - gb.left) / (ub.right - ub.left);
  const sy = (gb.bottom - gb.top) / (ub.bottom - ub.top);
  const box = { x: gb.left - ub.left * sx, y: gb.top - ub.top * sy, width: vw * sx, height: vh * sy };
  return sameAnchors(labelAnchors(label, box), path.points.map((p) => p.anchor)) ? box : undefined;
}

export function readDieCuts(ctx: Context): DieRead {
  const doc = ctx.doc;
  const refs = dieSwatchRefs(doc);
  for (const ref of refs) ctx.palette.skip(ref);
  const dieLayers = new Set(doc.layers.filter((l) => isDieLineName(l.name)).map((l) => l.self));
  if (!refs.size && !dieLayers.size) return {};

  const isDie = (item: IdmlPageItem, layer: string | undefined): boolean =>
    (layer !== undefined && dieLayers.has(layer)) || (refs.has(item.attrs.StrokeColor ?? '') && (!item.attrs.FillColor || item.attrs.FillColor === 'Swatch/None' || refs.has(item.attrs.FillColor)));

  const pages = allPages(ctx);
  const paths: DiePath[] = [];
  const weights: number[] = [];
  const inks = new Set<string>();
  let open = 0;
  const take = (item: IdmlPageItem, toPage: Matrix, page: number): void => {
    ctx.dieItems.add(item);
    const w = Number(item.attrs.StrokeWeight);
    if (Number.isFinite(w) && w > 0) weights.push(w);
    const stroke = item.attrs.StrokeColor ? doc.swatches.get(item.attrs.StrokeColor) : undefined;
    const base = stroke?.kind === 'tint' ? doc.swatches.get(stroke.base) : stroke;
    if (base?.kind === 'color' && refs.has(base.self)) inks.add(base.self);
    const label = dieLabel(item);
    for (const path of transformPaths(item.paths, toPage)) {
      if (path.open || path.points.length < 2) open++;
      else paths.push({ page, path, item, ...(label ? { label } : {}) });
    }
  };
  // An item and what it holds: a group of the die line is die line whole.
  const walk = (item: IdmlPageItem, m: Matrix, layer: string | undefined, page: number, inDie: boolean): void => {
    const own = item.layer ?? layer;
    const die = inDie || isDie(item, own);
    if (die) ctx.dieItems.add(item);
    if (item.children.length) {
      for (const c of item.children) walk(c, multiply(m, c.transform), own, page, die);
      return;
    }
    if (die) take(item, m, page);
  };
  const indexOf = new Map(pages.map((p, i) => [p, i] as const));
  for (const spread of doc.spreads) {
    for (const item of spread.items) {
      // Where the item stands: the page it shares most with.
      const m = spreadMatrix({ item, spread, parents: [] });
      const page = pageUnder(spread, itemExtent(item, m));
      if (!page) continue;
      walk(item, multiply(pageMatrix(page), m), undefined, indexOf.get(page) ?? -1, false);
    }
  }
  // The die line a master draws is on every page that applies it.
  for (const page of pages) for (const mi of masterItems(doc, page)) walk(mi.item, mi.toPage, undefined, indexOf.get(page) ?? -1, false);
  if (open) ctx.rep.add('dieLineOpenPath', 'warning', 'An open path of the die line cuts nothing in Postext: a hole is a closed path', undefined, open);
  if (!paths.length) return dieLineOf(ctx, refs, inks, weights, dieLayers);

  const holes: DiePath[] = [];
  const outlines: DiePath[] = [];
  for (const p of paths) {
    const page = pages[p.page];
    const box = anchorBox(p.path);
    if (!page || !box) continue;
    const { width, height } = pageSize(page);
    // A path round the whole page is the leaf's outline.
    if (box.left <= 1 && box.top <= 1 && box.right >= width - 1 && box.bottom >= height - 1) outlines.push(p);
    else holes.push(p);
  }

  const out: DieCutsConfig = {};
  const placed = placeHoles(holes, pages);
  if (placed.shapes.length) {
    out.shapes = placed.shapes;
    out.pages = placed.pages;
  }
  const outline = readOutline(ctx, outlines, pages);
  if (outline.corners) out.corners = outline.corners;
  if (outline.outline) out.outline = outline.outline;
  ctx.rep.add('dieCuts', 'info', 'The die line is read as the book\'s die-cuts (holes, rounded corners, a shaped book), not as artwork', `${placed.shapes.length} dies, ${holes.length} holes`, paths.length);
  const line = dieLineOf(ctx, refs, inks, weights, dieLayers);
  return { ...(Object.keys(out).length ? { dieCuts: out } : {}), ...line };
}

/** A hole as the recto of its leaf has it. */
interface LeafHole {
  shape: HoleShape;
  /** The hole's path on the recto, and the label of its die. */
  path: Path;
  label?: DieLabel;
  leaves: Set<number>;
}

const holeKey = (s: HoleShape, label: DieLabel | undefined): string =>
  [label?.id ?? '', s.kind, round1(s.box.left), round1(s.box.top), round1(s.box.right - s.box.left), round1(s.box.bottom - s.box.top), round1(s.radius ?? 0), s.d ?? ''].join('|');

/** The holes as dies and their placements. */
function placeHoles(holes: readonly DiePath[], pages: readonly IdmlPage[]): { shapes: DieShape[]; pages: { pages: string; die: string }[] } {
  const byKey = new Map<string, LeafHole>();
  for (const h of holes) {
    const page = pages[h.page]!;
    const width = pageSize(page).width;
    const path = isRecto(h.page) ? h.path : mirrorPath(h.path, width);
    const hint = { kind: h.item.kind, ...(cornerOptions(h.item.attrs) ? { corners: cornerOptions(h.item.attrs)! } : {}) };
    const shape = classifyHole(path, hint);
    if (!shape) continue;
    const key = holeKey(shape, h.label);
    let leaf = byKey.get(key);
    if (!leaf) byKey.set(key, (leaf = { shape, path, ...(h.label ? { label: h.label } : {}), leaves: new Set() }));
    leaf.leaves.add(Math.floor(h.page / 2));
  }
  // Each run of leaves a hole goes through is a placement; placements of
  // one die (shape, size, leaves) share its id.
  const dies = new Map<string, { shape: DieShape; pages: number[] }>();
  const used = new Set<string>();
  let n = 0;
  for (const hole of byKey.values()) {
    const leaves = [...hole.leaves].sort((a, b) => a - b);
    for (let i = 0; i < leaves.length; ) {
      let j = i;
      while (j + 1 < leaves.length && leaves[j + 1] === leaves[j]! + 1) j++;
      const count = j - i + 1;
      const leaf = leaves[i]!;
      const placed = dieOf(hole, count, pages, leaf);
      const sig = JSON.stringify({ ...placed.shape, id: hole.label?.id ?? '' });
      let die = dies.get(sig);
      if (!die) {
        let id = hole.label?.id ?? `die-${++n}`;
        for (let k = 2; used.has(id); k++) id = `${hole.label?.id ?? 'die'}-${k}`;
        used.add(id);
        dies.set(sig, (die = { shape: { ...placed.shape, id }, pages: [] }));
      }
      die.pages.push(placed.page);
      i = j + 1;
    }
  }
  return {
    shapes: [...dies.values()].map((d) => d.shape),
    pages: [...dies.values()].map((d) => ({ pages: d.pages.sort((a, b) => a - b).join(','), die: d.shape.id })),
  };
}

/** A hole's die and the page (1-based) it is placed on: the recto of its
 *  first leaf, or the verso when the die's own path data (its label)
 *  fits the verso's side of the hole and not the recto's. */
function dieOf(hole: LeafHole, leaves: number, pages: readonly IdmlPage[], leaf: number): { shape: Omit<DieShape, 'id'>; page: number } {
  const recto = 2 * leaf;
  const s = hole.shape;
  const common = { ...(hole.label?.name ? { name: hole.label.name } : {}), ...(leaves > 1 ? { leaves } : {}), ...(hole.label?.wrap !== undefined ? { wrap: hole.label.wrap } : {}) };
  const box = (x: number, y: number, w: number, h: number) => ({ x: mm(x), y: mm(y), width: mm(w), height: mm(h) });
  if (s.kind === 'path' && hole.label?.d) {
    const onRecto = labelFits(hole.label, hole.path);
    const verso = pages[recto + 1];
    const mirrored = verso ? mirrorPath(hole.path, pageSize(verso).width) : undefined;
    const onVerso = !onRecto && mirrored ? labelFits(hole.label, mirrored) : undefined;
    const fit = onRecto ?? onVerso;
    if (fit) return { shape: { shape: 'path', ...box(fit.x, fit.y, fit.width, fit.height), d: hole.label.d, ...(hole.label.viewBox ? { viewBox: hole.label.viewBox } : {}), ...common }, page: (onRecto ? recto : recto + 1) + 1 };
  }
  const b = s.box;
  const shape: Omit<DieShape, 'id'> = { shape: s.kind, ...box(b.left, b.top, b.right - b.left, b.bottom - b.top), ...common };
  if (s.kind === 'roundRect') shape.radius = mm(s.radius ?? 0);
  if (s.kind === 'path') {
    shape.d = s.d!;
    shape.viewBox = s.viewBox!;
  }
  return { shape, page: recto + 1 };
}

/** The leaf's outline: rounded corners when the path is the page with
 *  some corners rounded (all four, or the fore-edge ones), else the
 *  book's shape as path data stretched to the page. */
function readOutline(ctx: Context, outlines: readonly DiePath[], pages: readonly IdmlPage[]): Pick<DieCutsConfig, 'corners' | 'outline'> {
  if (!outlines.length) return {};
  const rightBound = !!ctx.doc.preferences.rightToLeft;
  const read = (o: DiePath): Pick<DieCutsConfig, 'corners' | 'outline'> | undefined => {
    const page = pages[o.page]!;
    const { width, height } = pageSize(page);
    const trim = { left: 0, top: 0, right: width, bottom: height };
    const radii: Radii | undefined = (o.item.kind === 'Rectangle' ? cornerOptions(o.item.attrs) : undefined) ?? cornerRadii(o.path, trim, 1);
    if (radii) {
      const rounded = CORNERS.filter((c) => radii[c] > 0);
      if (!rounded.length) return undefined;
      const r = rounded.reduce((a, c) => a + radii[c], 0) / rounded.length;
      const even = rounded.every((c) => Math.abs(radii[c] - r) < 0.5);
      const foreRight = isRecto(o.page) !== rightBound;
      const fore: string[] = foreRight ? ['TopRight', 'BottomRight'] : ['TopLeft', 'BottomLeft'];
      if (even && rounded.length === 4) return { corners: { radius: mm(r), edges: 'all' } };
      if (even && rounded.length === 2 && fore.every((c) => rounded.includes(c as never))) return { corners: { radius: mm(r) } };
    }
    if (o.label?.id === '#outline' && o.label.d) return { outline: { d: o.label.d, viewBox: o.label.viewBox ?? [1, 1] } };
    const path = isRecto(o.page) ? o.path : mirrorPath(o.path, width);
    return { outline: { d: pathData(path, { x: 0, y: 0 }), viewBox: [Math.round(width * 1000) / 1000, Math.round(height * 1000) / 1000] } };
  };
  const first = outlines.find((o) => isRecto(o.page)) ?? outlines[0]!;
  const result = read(first) ?? {};
  const differ = outlines.some((o) => JSON.stringify(read(o) ?? {}) !== JSON.stringify(result));
  if (differ) ctx.rep.add('dieOutlineVaries', 'warning', 'The die line cuts the leaves to different outlines: Postext cuts every leaf to one (the first recto\'s)', undefined);
  return result;
}

/** `print.dieLine`: the swatch's name and alternate, the stroke's weight,
 *  and whether the die line prints (its layer). */
function dieLineOf(ctx: Context, refs: Set<string>, inks: Set<string>, weights: number[], layers: Set<string>): Pick<DieRead, 'dieLine'> {
  const out: PrintDieLineConfig = {};
  const ref = [...inks][0] ?? [...refs].find((r) => ctx.doc.swatches.get(r)?.kind === 'color');
  const swatch = ref ? (ctx.doc.swatches.get(ref) as IdmlColor | undefined) : undefined;
  if (swatch && swatch.name !== 'Die') out.ink = swatch.name;
  const v = swatch?.space === 'CMYK' ? swatch.value : swatch?.alternate?.space === 'CMYK' ? swatch.alternate.value : undefined;
  if (v && v.length >= 4 && !(v[0] === 0 && v[1] === 100 && v[2] === 0 && v[3] === 0)) out.cmyk = { c: v[0]!, m: v[1]!, y: v[2]!, k: v[3]! };
  // The weight most die paths are stroked with.
  const tally = new Map<number, number>();
  for (const w of weights) tally.set(Math.round(w * 1000) / 1000, (tally.get(Math.round(w * 1000) / 1000) ?? 0) + 1);
  const weight = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (weight !== undefined && Math.abs(weight - 0.25) > 1e-3) out.width = pt(weight);
  if (ctx.doc.layers.some((l) => layers.has(l.self) && !l.printable)) out.output = 'none';
  return Object.keys(out).length ? { dieLine: out } : {};
}
