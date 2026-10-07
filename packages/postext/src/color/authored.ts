import type { CmykPercent } from '../types';

function isAuthoredCmyk(v: unknown): v is { hex: string; model: 'cmyk'; cmyk: CmykPercent } {
  if (!v || typeof v !== 'object') return false;
  const o = v as { hex?: unknown; model?: unknown; cmyk?: unknown };
  return o.model === 'cmyk' && typeof o.hex === 'string' && !!o.cmyk && typeof o.cmyk === 'object';
}

/**
 * The colours of a configuration authored in CMYK (`ColorValue.cmyk`),
 * keyed by their screen hex (`#rrggbb`, lower case): a print render sets
 * these values as they are. A colour that follows a palette entry shares
 * that entry's hex, so the palette's own CMYK covers every use of it.
 */
export function authoredCmykColors(config: unknown, into: Map<string, CmykPercent> = new Map()): Map<string, CmykPercent> {
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (isAuthoredCmyk(v)) {
      const key = v.hex.slice(0, 7).toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(key) && !into.has(key)) into.set(key, { ...v.cmyk });
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  return into;
}
