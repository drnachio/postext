// Single substitutions of a face's GSUB (#1406): the figure features a
// feature family asks Word for (w14:numForm / w14:numSpacing → onum, lnum,
// tnum, pnum) swap glyphs whose advances differ from the cmap's (Lora's
// '1' is 364 units, its tabular one.tf 650). The formatted writer applies
// them before summing a run's advances, so it fits the run Word draws.
// Only lookup type 1 (formats 1 and 2), reached directly or through type 7
// extensions; figure features need nothing more.

function u16(t: Uint8Array, at: number): number {
  return at + 1 < t.length ? (t[at]! << 8) | t[at + 1]! : 0;
}
function u32(t: Uint8Array, at: number): number {
  return at + 3 < t.length ? ((t[at]! << 24) >>> 0) + (t[at + 1]! << 16) + (t[at + 2]! << 8) + t[at + 3]! : 0;
}
function tagAt(t: Uint8Array, at: number): string {
  return at + 3 < t.length ? String.fromCharCode(t[at]!, t[at + 1]!, t[at + 2]!, t[at + 3]!) : '';
}

/** Glyphs of a coverage table, in coverage index order. */
function coverage(t: Uint8Array, at: number): number[] {
  const out: number[] = [];
  const format = u16(t, at);
  const count = u16(t, at + 2);
  if (format === 1) {
    for (let i = 0; i < count; i++) out.push(u16(t, at + 4 + i * 2));
  } else if (format === 2) {
    for (let i = 0; i < count; i++) {
      const r = at + 4 + i * 6;
      const start = u16(t, r);
      const end = u16(t, r + 2);
      const index = u16(t, r + 4);
      for (let g = start; g <= end; g++) out[index + g - start] = g;
    }
  }
  return out;
}

/** One single-substitution subtable into `map` (glyphs already mapped by
 *  an earlier subtable of the lookup keep their first mapping). */
function singleSubst(t: Uint8Array, at: number, map: Map<number, number>): void {
  const format = u16(t, at);
  const glyphs = coverage(t, at + u16(t, at + 2));
  glyphs.forEach((g, i) => {
    if (g === undefined || map.has(g)) return;
    if (format === 1) map.set(g, (g + u16(t, at + 4)) & 0xffff);
    else if (format === 2 && i < u16(t, at + 4)) map.set(g, u16(t, at + 6 + i * 2));
  });
}

/** The single substitutions of one lookup (empty for other types). */
function lookupMap(t: Uint8Array, at: number): Map<number, number> {
  const map = new Map<number, number>();
  const type = u16(t, at);
  const count = u16(t, at + 4);
  for (let i = 0; i < count; i++) {
    let sub = at + u16(t, at + 6 + i * 2);
    let subType = type;
    if (type === 7) {
      subType = u16(t, sub + 2);
      sub += u32(t, sub + 4);
    }
    if (subType === 1) singleSubst(t, sub, map);
  }
  return map;
}

/** Feature indices of the DFLT and latn scripts (every language system). */
function scriptFeatures(t: Uint8Array): Set<number> {
  const out = new Set<number>();
  const list = u16(t, 4);
  const count = u16(t, list);
  for (let i = 0; i < count; i++) {
    const rec = list + 2 + i * 6;
    if (!['DFLT', 'latn'].includes(tagAt(t, rec))) continue;
    const script = list + u16(t, rec + 4);
    const langSys = (off: number): void => {
      if (!off) return;
      const ls = script + off;
      const req = u16(t, ls + 2);
      if (req !== 0xffff) out.add(req);
      const n = u16(t, ls + 4);
      for (let k = 0; k < n; k++) out.add(u16(t, ls + 6 + k * 2));
    };
    langSys(u16(t, script));
    const langs = u16(t, script + 2);
    for (let k = 0; k < langs; k++) langSys(u16(t, script + 4 + k * 6 + 4));
  }
  return out;
}

/**
 * Glyph → glyph after the single substitutions of `features` in a GSUB
 * table, lookups applied in lookup-list order. Features the DFLT/latn
 * scripts reference are used; a feature only another script lists still
 * counts when neither of them has it. Empty when the face lacks them.
 */
export function gsubSingles(gsub: Uint8Array | undefined, features: readonly string[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!gsub || gsub.length < 10 || features.length === 0) return out;
  const featureList = u16(gsub, 6);
  const lookupList = u16(gsub, 8);
  const wanted = (i: number): boolean => features.includes(tagAt(gsub, featureList + 2 + i * 6));
  const count = u16(gsub, featureList);
  const all = Array.from({ length: count }, (_, i) => i).filter(wanted);
  const listed = [...scriptFeatures(gsub)].filter((i) => i < count && wanted(i));
  // Per tag: the indices the scripts list, else every record of the tag.
  const chosen = new Set<number>();
  for (const tag of features) {
    const of = (ids: number[]): number[] => ids.filter((i) => tagAt(gsub, featureList + 2 + i * 6) === tag);
    const ids = of(listed).length ? of(listed) : of(all);
    for (const i of ids) chosen.add(i);
  }
  const lookups = new Set<number>();
  for (const i of chosen) {
    const feature = featureList + u16(gsub, featureList + 2 + i * 6 + 4);
    const n = u16(gsub, feature + 2);
    for (let k = 0; k < n; k++) lookups.add(u16(gsub, feature + 4 + k * 2));
  }
  const lookupCount = u16(gsub, lookupList);
  for (const li of [...lookups].sort((a, b) => a - b)) {
    if (li >= lookupCount) continue;
    const step = lookupMap(gsub, lookupList + u16(gsub, lookupList + 2 + li * 2));
    // Compose: what earlier lookups made goes on through this one.
    for (const [from, to] of out) {
      const next = step.get(to);
      if (next !== undefined) out.set(from, next);
    }
    for (const [from, to] of step) if (!out.has(from)) out.set(from, to);
  }
  return out;
}
