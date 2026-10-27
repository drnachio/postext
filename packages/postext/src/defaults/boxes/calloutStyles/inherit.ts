// Style inheritance: the chain of parents and the merge of each style over
// its parent (#1278: split out of calloutStyles.ts).
import type { CalloutStyleConfig } from '../../../types.js';

/** A value merged whole, never key by key: a colour (`hex`) or a length
 *  (`value` + `unit`). */
const isAtom = (v: Record<string, unknown>): boolean => 'hex' in v || ('value' in v && 'unit' in v);
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `child` over `parent`: objects merged key by key, colours, lengths,
 *  arrays and scalars replaced. */
function mergeOver(parent: Record<string, unknown>, child: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (value === undefined) continue;
    const below = out[key];
    out[key] = isPlainObject(value) && isPlainObject(below) && !isAtom(value) && !isAtom(below) ? mergeOver(below, value) : value;
  }
  return out;
}

/** Where a style's `extends` leads (#905): the chain of style indices from
 *  `index` up, nearest first, the first style of each id; `cycle` when it
 *  comes back to a style already in it, `unknown` when a parent id names
 *  no style (the chain stops there). */
export function calloutStyleChain(styles: readonly CalloutStyleConfig[], index: number): { chain: number[]; cycle?: number[]; unknown?: string } {
  const byId = new Map<string, number>();
  styles.forEach((s, i) => {
    if (s && typeof s.id === 'string' && !byId.has(s.id)) byId.set(s.id, i);
  });
  const chain: number[] = [];
  for (let at: number | undefined = index; at !== undefined; ) {
    const loop = chain.indexOf(at);
    if (loop >= 0) return { chain, cycle: [...chain.slice(loop), at] };
    chain.push(at);
    const parent: unknown = styles[at]?.extends;
    if (typeof parent !== 'string' || parent === '') break;
    const next = byId.get(parent);
    if (next === undefined) return { chain, unknown: parent };
    at = next;
  }
  return { chain };
}

/** The styles with what each inherits through `extends` (#905) written
 *  in, `extends` left out. A style whose chain loops stands alone, and so
 *  does the rest of a chain past an id no style has. */
export function inheritCalloutStyles(styles: readonly CalloutStyleConfig[]): CalloutStyleConfig[] {
  if (!styles.some((s) => s?.extends !== undefined)) return styles as CalloutStyleConfig[];
  return styles.map((s, i) => {
    if (!s || s.extends === undefined) return s;
    const { chain, cycle } = calloutStyleChain(styles, i);
    const without = (style: CalloutStyleConfig, keys: readonly string[]): Record<string, unknown> =>
      Object.fromEntries(Object.entries(style).filter(([k]) => !keys.includes(k)));
    const own = without(s, ['extends']);
    if (cycle) return own as unknown as CalloutStyleConfig;
    let merged: Record<string, unknown> = {};
    // From the root down: each parent's look, not its id or name.
    for (const at of chain.slice(1).reverse()) merged = mergeOver(merged, without(styles[at]!, ['id', 'name', 'extends']));
    return mergeOver(merged, own) as unknown as CalloutStyleConfig;
  });
}
