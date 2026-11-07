// Pictures the design draws (#1444): the cover art of a cover heading, a
// recipe's photograph picked by `art="…"`, a plate facing a poem, and the
// art of comic panels. The design, not the Markdown, places them, so their
// files go into the package with the figures'. Decorative elements
// (ornaments, head-pieces repeated on every opener) are left out, and so is
// a picture laid over an earlier one in the same box (an arrow pointing
// into a photograph): Word cannot stack them inline.

import type { ContentBlock } from '../../../parse/types.js';
import type { Resource, ResolvedDesignElement } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { comicPanels } from '../media/comics.js';
import { headingLevelOf } from './values.js';

/** An image element's `resourceId`: a plain id, or `{attr.key}` read from
 *  the heading's attributes. Other placeholders resolve to nothing here. */
export function designImageId(raw: string, attrs: Record<string, string> | undefined): string | undefined {
  const m = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/.exec(raw);
  if (m) return attrs?.[m[1]!] || undefined;
  return raw.includes('{') ? undefined : raw.trim() || undefined;
}

/** The pictures of a design's `elements` heading `b` draws: element id
 *  and resource id. */
export function designPictures(b: ContentBlock, elements: readonly ResolvedDesignElement[], resources: ReadonlyMap<string, Resource>): { elementId: string; id: string }[] {
  const out: { elementId: string; id: string }[] = [];
  const boxes: string[] = [];
  for (const el of elements) {
    if (el.kind !== 'image' || el.decorative) continue;
    const box = JSON.stringify(el.placement);
    const overlay = boxes.includes(box);
    boxes.push(box);
    const id = designImageId(el.resourceId, b.attrs);
    const res = id ? resources.get(id) : undefined;
    if (!res || overlay || out.some((o) => o.id === res.id)) continue;
    if (res.kind !== 'bitmap' && res.kind !== 'svg') continue;
    out.push({ elementId: el.id, id: res.id });
  }
  return out;
}

/** The resources the book's heading designs and comic panels draw (their
 *  pictures go into the package). */
export function designMediaIds(chapters: readonly { blocks: readonly ContentBlock[] }[], resolved: ResolvedConfig, resources: ReadonlyMap<string, Resource>): Set<string> {
  const out = new Set<string>();
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      for (const panel of comicPanels(b)) if (panel.art && resources.has(panel.art)) out.add(panel.art);
      if (b.type !== 'heading') continue;
      const design = headingLevelOf(resolved, b)?.advancedDesign;
      if (!design?.enabled) continue;
      for (const p of designPictures(b, design.slot.elements, resources)) out.add(p.id);
    }
  }
  return out;
}
