// The head of a box: the icon its style draws and the title its design
// sets, read from its head frame and written first in the box.
import { tintHex, type ResolvedConfig, type VDTBlock } from 'postext';
import type { CalloutIcon, CalloutNode } from './model.js';
import type { BookModel } from './walk.js';
import { xmlAttr, xmlText } from './inline.js';
import { relativeHref } from './href.js';

/** The icon a box's style draws (`icon`), as its head frame `block`
 *  placed it: a picture by the frame's `iconFileId` (painted in the
 *  colour its overlay picture carries), a glyph, or a drawn shape. The
 *  picture is listed in `book`, with the colour it is painted in. */
export function calloutIcon(config: ResolvedConfig, block: VDTBlock, styleId: string | undefined, book: Pick<BookModel, 'images' | 'tints'>): CalloutIcon | undefined {
  const ic = config.calloutStyles.find((s) => s.id === styleId)?.icon;
  if (!ic) return undefined;
  if (ic.kind === 'glyph') return ic.glyph ? { kind: 'glyph', glyph: ic.glyph } : undefined;
  if (ic.kind === 'shape') return { kind: 'shape' };
  const fileId = ic.kind === 'resource' ? block.callout?.iconFileId : undefined;
  if (!fileId) return undefined;
  let tint: string | undefined;
  // A `#rrggbb` colour, as the HTML renderer takes it; any other value
  // leaves the picture in its own colours.
  for (const b of block.designOverlay?.blocks ?? []) if (b.kind === 'image' && b.fileId === fileId && tintHex(b.tint)) tint = tintHex(b.tint);
  if (tint) {
    const tints = (book.tints ??= new Map());
    if (!tints.has(fileId)) tints.set(fileId, new Set());
    tints.get(fileId)!.add(tint);
    return { kind: 'image', fileId, tint };
  }
  book.images.add(fileId);
  return { kind: 'image', fileId };
}

/** The title a box's design sets on its head frame: its texts, without
 *  the glyph of its icon, which is drawn as text but is no part of it. */
export function calloutTitle(block: VDTBlock, icon: CalloutIcon | undefined): string {
  const glyph = icon?.kind === 'glyph' ? icon.glyph : undefined;
  return (block.designOverlay?.blocks ?? [])
    .flatMap((b) => (b.kind === 'text' && !b.artifact ? [b.lines.map((l) => l.text).join(' ')] : []))
    .filter((t) => t !== glyph)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A box's icon and title, first in the box: the icon floated beside the
 *  title by the stylesheet, decoration hidden from assistive technology.
 *  `imageHref` gives a picture's href (`tint`: its copy painted in that
 *  colour) relative to the package document; a picture the book does not
 *  carry is left out. `from`: the href of the file the box is in. */
export function calloutHeadXhtml(node: CalloutNode, imageHref: (fileId: string, tint?: string) => string | undefined, from: string): string {
  const title = node.title ? `<p class="pt-callout-title">${xmlText(node.title)}</p>\n` : '';
  const icon = node.icon;
  if (!icon) return title;
  if (icon.kind === 'image') {
    const href = imageHref(icon.fileId, icon.tint);
    return (href ? `<span class="pt-callout-icon" aria-hidden="true"><img src="${xmlAttr(relativeHref(from, href))}" alt=""/></span>\n` : '') + title;
  }
  if (icon.kind === 'glyph') return `<span class="pt-callout-icon" aria-hidden="true">${xmlText(icon.glyph)}</span>\n${title}`;
  return `<span class="pt-callout-icon" aria-hidden="true"></span>\n${title}`;
}
