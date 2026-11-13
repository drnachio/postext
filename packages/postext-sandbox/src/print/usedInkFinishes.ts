import { resolveInkFinish, type InkFinish, type PostextConfig } from 'postext';
import { inkKey } from './inkTableEdits.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The finish the book's colours give each ink they name, by `inkKey`:
 *  the first colour naming an ink with a finish sets it, as the first one
 *  sets its CMYK (#1570). Inks no colour gives a finish are left out. The
 *  configuration is walked as stored (the palette and every colour in it),
 *  so the answer does not hang on how the engine normalises a spot colour. */
export function usedInkFinishes(config: PostextConfig): Map<string, InkFinish> {
  const out = new Map<string, InkFinish>();
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (!isRecord(node) || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const spot = node.spot;
    if (node.model === 'spot' && isRecord(spot) && typeof spot.name === 'string' && spot.name.trim()) {
      const finish = resolveInkFinish(spot.finish);
      const key = inkKey(spot.name);
      if (finish && !out.has(key)) out.set(key, finish);
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(config);
  return out;
}

/** The finish of the ink `name` in the book's colours, if any. */
export function usedInkFinish(config: PostextConfig, name: string): InkFinish | undefined {
  return usedInkFinishes(config).get(inkKey(name));
}

/** Whether a book prints a special ink: a colour or an ink of the ink
 *  table with a finish. */
export function usesSpecialInks(config: PostextConfig): boolean {
  if ((config.print?.inks ?? []).some((i) => resolveInkFinish(i.finish))) return true;
  return usedInkFinishes(config).size > 0;
}
