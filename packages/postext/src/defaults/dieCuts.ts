import type { DieCutsConfig, DieShape, Dimension, ResolvedDieCutsConfig, ResolvedDieShape } from '../types.js';

const SHAPES = ['rect', 'roundRect', 'circle', 'ellipse', 'path'] as const;
const DEFAULT_RADIUS: Dimension = { value: 3, unit: 'mm' };
const DEFAULT_WRAP_GAP: Dimension = { value: 3, unit: 'mm' };

const isDim = (v: unknown): v is Dimension =>
  !!v && typeof v === 'object' && typeof (v as Dimension).value === 'number' && typeof (v as Dimension).unit === 'string';

const viewBoxOf = (v: unknown): [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && n > 0) ? [v[0], v[1]] : [1, 1];

/** A die shape with its defaults; `undefined` when it lacks an id, a known
 *  shape or its box (or a `'path'` lacks `d`). */
export function resolveDieShape(s: DieShape): ResolvedDieShape | undefined {
  if (!s || typeof s.id !== 'string' || !s.id.trim()) return undefined;
  if (!SHAPES.includes(s.shape)) return undefined;
  if (![s.x, s.y, s.width, s.height].every(isDim)) return undefined;
  if (s.shape === 'path' && (typeof s.d !== 'string' || !s.d.trim())) return undefined;
  const out: ResolvedDieShape = {
    id: s.id.trim(),
    shape: s.shape,
    x: { ...s.x },
    y: { ...s.y },
    width: { ...s.width },
    height: { ...s.height },
    radius: isDim(s.radius) ? { ...s.radius } : { ...DEFAULT_RADIUS },
    viewBox: viewBoxOf(s.viewBox),
    leaves: Number.isFinite(s.leaves) && (s.leaves as number) >= 1 ? Math.floor(s.leaves as number) : 1,
    wrap: s.wrap === false ? false : { gap: isDim(s.wrap?.gap) ? { ...s.wrap.gap } : { ...DEFAULT_WRAP_GAP } },
  };
  if (s.name) out.name = s.name;
  if (s.shape === 'path') out.d = s.d!.trim();
  return out;
}

export function resolveDieCutsConfig(partial?: DieCutsConfig): ResolvedDieCutsConfig {
  const shapes: ResolvedDieShape[] = [];
  for (const s of Array.isArray(partial?.shapes) ? partial.shapes : []) {
    const r = resolveDieShape(s);
    if (r && !shapes.some((x) => x.id === r.id)) shapes.push(r);
  }
  const pages = (Array.isArray(partial?.pages) ? partial.pages : [])
    .filter((p) => p && typeof p.pages === 'string' && typeof p.die === 'string' && p.pages.trim() && p.die.trim())
    .map((p) => ({ pages: p.pages.trim(), die: p.die.trim() }));
  const out: ResolvedDieCutsConfig = { shapes, pages };
  if (partial?.corners && isDim(partial.corners.radius) && partial.corners.radius.value > 0) {
    out.corners = { radius: { ...partial.corners.radius }, edges: partial.corners.edges === 'all' ? 'all' : 'fore' };
  }
  if (partial?.outline && typeof partial.outline.d === 'string' && partial.outline.d.trim()) {
    out.outline = { d: partial.outline.d.trim(), viewBox: viewBoxOf(partial.outline.viewBox) };
  }
  return out;
}

/** Whether a resolved die-cuts section cuts anything. */
export function hasDieCuts(d: ResolvedDieCutsConfig): boolean {
  return d.pages.length > 0 || d.shapes.length > 0 || !!d.corners || !!d.outline;
}

/** The section as stored: absent when empty. */
export function stripDieCutsDefaults(cfg?: DieCutsConfig): DieCutsConfig | undefined {
  if (!cfg) return undefined;
  const out: DieCutsConfig = {};
  if (cfg.shapes?.length) out.shapes = structuredClone(cfg.shapes);
  if (cfg.pages?.length) out.pages = structuredClone(cfg.pages);
  if (cfg.corners) out.corners = structuredClone(cfg.corners);
  if (cfg.outline) out.outline = structuredClone(cfg.outline);
  return Object.keys(out).length > 0 ? out : undefined;
}
