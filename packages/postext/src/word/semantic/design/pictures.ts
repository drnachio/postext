// Pictures the design draws (#1444): the cover art of a cover heading, a
// recipe's photograph picked by `art="…"`, a plate facing a poem, and the
// art of comic panels. The design, not the Markdown, places them, so their
// files go into the package with the figures'. A decorative ornament the
// page reads (a head-piece over the heading, a rosette under a title) is
// kept; a decorative background is left out, unless the design prints
// nothing else (an endpaper: its art rather than an empty page). So is a
// picture laid over an earlier one in the same box (an arrow pointing into
// a photograph): Word cannot stack them inline.

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

/** Whether a design's text or picture reads the Markdown: an attribute
 *  of the heading, part or page it stands on (`{attr.key}`). Anything else
 *  the config fixes, or fills from the book's metadata. */
export const fromMarkdown = (raw: string): boolean => /\{attr\.[A-Za-z_]/.test(raw);

/** A length in millimetres (a size the design gives), undefined for
 *  `auto` or a size reaching another element. */
function mm(size: unknown): number | undefined {
  if (typeof size !== 'object' || size === null || !('value' in size) || !('unit' in size)) return undefined;
  const { value, unit } = size as { value: number; unit: string };
  const per: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };
  return per[unit] !== undefined ? value * per[unit]! : undefined;
}

/** Whether a decorative picture is a background (a pattern or a frame
 *  under the whole page) rather than an ornament the page reads. */
function background(el: Extract<ResolvedDesignElement, { kind: 'image' }>): boolean {
  const size = el.placement.size ?? {};
  const w = size.width === 'fill' ? Infinity : mm(size.width) ?? 0;
  const h = size.height === 'fill' ? Infinity : mm(size.height) ?? 0;
  return el.placement.anchor.to === 'bleed' || w >= 150 || h >= 150;
}

/** The elements of a design the semantic document reads: those every
 *  opener prints (one side's when the design has odd and even ones). A
 *  design with elements of its own for the opener page draws its body
 *  pages' (a running head, a folio) elsewhere. */
export function printed(elements: readonly ResolvedDesignElement[]): ResolvedDesignElement[] {
  const hasOdd = elements.some((e) => e.parity === 'odd');
  const pagesOf = (e: ResolvedDesignElement): string | undefined => ('pages' in e ? e.pages : undefined);
  const opener = elements.some((e) => pagesOf(e) === 'opener');
  return elements.filter((e) => {
    if (e.parity === 'even' && hasOdd) return false;
    const pages = pagesOf(e);
    return !pages || pages === 'all' || pages === 'opener' || (pages === 'body' && !opener);
  });
}

/** The pictures of a design's `elements` heading `b` draws: element id
 *  and resource id. */
export function designPictures(b: ContentBlock, elements: readonly ResolvedDesignElement[], resources: ReadonlyMap<string, Resource>, namedOnly = false): { elementId: string; id: string }[] {
  const out: { elementId: string; id: string }[] = [];
  const boxes: string[] = [];
  const alone = !elements.some((e) => e.kind === 'text' || (e.kind === 'image' && !e.decorative));
  for (const el of elements) {
    if (el.kind !== 'image' || (el.decorative && !alone && background(el))) continue;
    if (namedOnly && !fromMarkdown(el.resourceId)) continue;
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

/** The resources the book's heading designs, part pages and comic panels
 *  draw (their pictures go into the package); with `namedOnly`, of the
 *  designs' pictures only those an attribute names (the plain design). */
export function designMediaIds(chapters: readonly { blocks: readonly ContentBlock[] }[], resolved: ResolvedConfig, resources: ReadonlyMap<string, Resource>, namedOnly = false): Set<string> {
  const out = new Set<string>();
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      for (const panel of comicPanels(b)) if (panel.art && resources.has(panel.art)) out.add(panel.art);
      if (b.type === 'containerStart' && b.containerName === 'part') {
        for (const p of designPictures(b, printed(resolved.parts.design.elements), resources, namedOnly)) out.add(p.id);
        continue;
      }
      if (b.type !== 'heading') continue;
      const design = headingLevelOf(resolved, b)?.advancedDesign;
      if (!design?.enabled) continue;
      for (const p of designPictures(b, printed(design.slot.elements), resources, namedOnly)) out.add(p.id);
    }
  }
  return out;
}
