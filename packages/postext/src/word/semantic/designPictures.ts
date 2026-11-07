// Pictures a heading's design draws (#1444): the cover art of a cover
// heading, a recipe's photograph picked by `art="…"`, a plate facing a
// poem. The design, not the Markdown, places them, so the semantic .docx
// would lose them; each is written as a picture right after its heading.
// Decorative elements (ornaments, head-pieces repeated on every opener) are
// left out, and so is a picture laid over an earlier one in the same box
// (an arrow pointing into a photograph): Word cannot stack them inline.
// The pictures carry no text, so the importer reads nothing from them.

import type { ContentBlock } from '../../parse/types.js';
import { createHeadingLevelResolver, type HeadingLevelResolver } from '../../pipeline/sections/headingStyles.js';
import type { Dimension, Resource } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { Node } from './blocks.js';
import type { WriterContext } from './context.js';
import { pictureRun } from './figures.js';
import { STYLE } from './styles.js';
import { blockSdt, paragraph, px } from './wml.js';

const resolvers = new WeakMap<ResolvedConfig, HeadingLevelResolver>();

/** An image element's `resourceId`: a plain id, or `{attr.key}` read from
 *  the heading's attributes. Other placeholders resolve to nothing here. */
function imageId(raw: string, attrs: Record<string, string> | undefined): string | undefined {
  const m = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/.exec(raw);
  if (m) return attrs?.[m[1]!] || undefined;
  return raw.includes('{') ? undefined : raw.trim() || undefined;
}

/** The pictures heading `b`'s design draws: resource id and the width the
 *  design gives it (undefined when it fills or follows its box). */
export function designPictures(b: ContentBlock, resolved: ResolvedConfig, resources: ReadonlyMap<string, Resource>): { id: string; width?: Dimension }[] {
  if (b.type !== 'heading') return [];
  let resolver = resolvers.get(resolved);
  if (!resolver) resolvers.set(resolved, (resolver = createHeadingLevelResolver(resolved)));
  const design = resolver.forBlock(b)?.advancedDesign;
  if (!design?.enabled) return [];
  const out: { id: string; width?: Dimension }[] = [];
  const boxes: string[] = [];
  for (const el of design.slot.elements) {
    if (el.kind !== 'image' || el.decorative) continue;
    const box = JSON.stringify(el.placement);
    const overlay = boxes.includes(box);
    boxes.push(box);
    const id = imageId(el.resourceId, b.attrs);
    const res = id ? resources.get(id) : undefined;
    if (!res || overlay || out.some((o) => o.id === res.id)) continue;
    if (res.kind !== 'bitmap' && res.kind !== 'svg') continue;
    const w = el.placement.size?.width;
    out.push({ id: res.id, ...(w && typeof w === 'object' && 'value' in w ? { width: w } : {}) });
  }
  return out;
}

/** The resources every heading design of the book draws (their pictures
 *  go into the package). */
export function designPictureIds(chapters: readonly { blocks: readonly ContentBlock[] }[], resolved: ResolvedConfig, resources: ReadonlyMap<string, Resource>): Set<string> {
  const out = new Set<string>();
  for (const ch of chapters) for (const b of ch.blocks) for (const p of designPictures(b, resolved, resources)) out.add(p.id);
  return out;
}

/** The design pictures of a top-level heading, written after it. */
export function designPicturesAfter(ctx: WriterContext, nodes: readonly Node[]): string[] {
  const n = nodes[0];
  if (nodes.length !== 1 || !n || !('block' in n) || n.block.type !== 'heading') return [];
  const out: string[] = [];
  for (const p of designPictures(n.block, ctx.resolved, ctx.resources)) {
    const pic = ctx.media.get(p.id);
    if (!pic) continue;
    ctx.usedResources.add(p.id);
    const max = Math.min(ctx.columnPx, p.width ? px(ctx.units, p.width) || ctx.columnPx : ctx.columnPx);
    const alt = ctx.resources.get(p.id)?.altText ?? '';
    out.push(blockSdt(ctx.nextSdtId(), `ptx:design:${p.id}`, undefined, paragraph({ style: STYLE.figure }, pictureRun(ctx, pic, p.id, alt, max))));
  }
  return out;
}
