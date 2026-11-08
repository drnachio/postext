// Boxes placed at the foot of the page (#1444): a `:::callout` with
// `placement="bottom"` (on the fence, or from its style) floats in print to
// the foot of the page it stands on, under the story it closes. The
// semantic .docx has no page to float into, so the box is written after
// that story instead: after the blocks that follow it, up to the next
// heading as high as the last one before the box (the story's own
// headline, inside a banner box or not), a page break or the chapter's
// end. Its words stay mapped to their source, wherever they stand.

import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import type { Node } from '../blocks.js';

type ContainerNode = Extract<Node, { container: unknown }>;

/** Whether a node is a box floated to the page's foot. */
function bottomBox(n: Node, styles: readonly ResolvedCalloutStyleConfig[]): n is ContainerNode {
  if (!('container' in n) || n.container.containerName !== 'callout') return false;
  const attrs = n.container.containerAttrs ?? {};
  const placement = attrs.placement ?? styles.find((s) => s.id === attrs.type)?.placement;
  return placement === 'bottom';
}

/** The level of the last heading in `n` (in reading order), if any. */
function lastHeading(n: Node): number | undefined {
  if ('block' in n) return n.block.type === 'heading' ? (n.block.level ?? 1) : undefined;
  for (let i = n.children.length - 1; i >= 0; i--) {
    const l = lastHeading(n.children[i]!);
    if (l !== undefined) return l;
  }
  return undefined;
}

/** The first heading in `n`, if any. */
function firstHeading(n: Node): ContentBlock | undefined {
  if ('block' in n) return n.block.type === 'heading' ? n.block : undefined;
  for (const c of n.children) {
    const h = firstHeading(c);
    if (h) return h;
  }
  return undefined;
}

const breaks = (n: Node): boolean => 'block' in n && n.block.type === 'directive' && n.block.directiveName === 'pagebreak';

/** `nodes` (a chapter's top level) with each box placed at the foot of
 *  its page moved after the story it closes. */
export function bottomBoxesLast(nodes: readonly Node[], styles: readonly ResolvedCalloutStyleConfig[]): Node[] {
  const out = [...nodes];
  for (let i = 0; i < out.length; i++) {
    const box = out[i]!;
    if (!bottomBox(box, styles)) continue;
    // The story's level: its last heading before the box.
    let level: number | undefined;
    for (let k = i - 1; k >= 0 && level === undefined; k--) level = lastHeading(out[k]!);
    let end = i + 1;
    while (end < out.length) {
      const n = out[end]!;
      const h = firstHeading(n);
      if (breaks(n) || bottomBox(n, styles) || (h && (level === undefined || (h.level ?? 1) <= level))) break;
      end++;
    }
    if (end === i + 1) continue;
    out.splice(i, 1);
    out.splice(end - 1, 0, box);
    // Read again from the node that took the box's place.
    i--;
  }
  return out;
}
