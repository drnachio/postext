/**
 * Pre-pass for `:::paragraphs{style="…"}` containers. The placement loop
 * rewinds `blockIdx` on keep-with-next rollbacks and replays the blocks in
 * between (marker blocks included), so container state is resolved up front
 * per content-block index instead of being pushed/popped inside the loop.
 */

import type { ContentBlock, DirectiveAttrs } from '../parse';
import type { TextAlign } from '../types';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import { resolveBodyStyle, resolveParagraphStyle, type BlockStyle } from './styles';
import { lengthAttr } from './verse';

export interface ParagraphContainer {
  /** `containerId` of the start/end marker pair. */
  id: number;
  /** The `style` id the container names; undefined for a container that
   *  only sets attributes (`:::paragraphs{align=end}`). */
  styleId?: string;
  /** Style for every paragraph in the container. */
  style: BlockStyle;
  /** Style for the container's last paragraph: its `marginBottomPx` is
   *  the space under the container, the larger of `spaceBetween` and
   *  `marginBottom` (a negative `marginBottom` as it is). With
   *  `bodyText.paragraphContainerSpacing: 'add'` (1.4) it is baked into
   *  the grid snap that closes the container (grid wins, margin is a
   *  minimum — the same convention snapped headings follow); with
   *  `'collapse'` the flow snaps under the text and carries what the snap
   *  left of the space, so it merges with the next block's own. */
  tailStyle: BlockStyle;
  /** Applied on entry through pending spacing. */
  marginTopPx: number;
  /** Fallback for containers whose last block is not a paragraph. */
  marginBottomPx: number;
  /** The style's `snapToGrid`: whether the flow snaps back onto the
   *  baseline grid under the container's last paragraph (EF-184). */
  snapToGrid: boolean;
  /** A container that names no style and sits in none (#424): its
   *  attributes apply over the text style of wherever it is set — the
   *  body's, a part's or a styled section's, a box's — which
   *  {@link containerStyle} reads; `style` holds them over the document's
   *  body text. */
  overBody?: LayoutAttrs;
}

/** The style a paragraph of `container` is set in: the container's tail
 *  style for its last block, else its style; a container that only sets
 *  attributes takes them over `bodyStyle`, the text style where it is set. */
export function containerStyle(container: ParagraphContainer, isTail: boolean, bodyStyle: BlockStyle, dpi: number): BlockStyle {
  if (container.overBody) return withLayoutAttrs(bodyStyle, container.overBody, dpi);
  return isTail ? container.tailStyle : container.style;
}

export interface ParagraphContainerPlan {
  /** Container id → entry, for `paragraphs` containers with a known style. */
  byId: Map<number, ParagraphContainer>;
  /** Content-block index → innermost enclosing paragraph container. */
  byBlock: Array<ParagraphContainer | undefined>;
}

export function planParagraphContainers(
  contentBlocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
): ParagraphContainerPlan {
  const byId = new Map<number, ParagraphContainer>();
  const byBlock = new Array<ParagraphContainer | undefined>(contentBlocks.length);
  const dpi = resolved.page.dpi;
  // Every open container occupies one slot, undefined for non-`paragraphs`
  // containers and for unknown style ids (those render as plain body text,
  // and `collectContentWarnings` reports them in `doc.contentWarnings`).
  const open: Array<ParagraphContainer | undefined> = [];
  const cache = new Map<string, Omit<ParagraphContainer, 'id'>>();

  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.type === 'containerStart') {
      let entry: ParagraphContainer | undefined;
      const styleId = b.containerAttrs?.style;
      const layout = b.containerName === 'paragraphs' ? layoutAttrs(b.containerAttrs) : undefined;
      if (layout && styleId === undefined && b.containerId !== undefined) {
        // Attributes alone: the enclosing container's style (a letter's
        // indented block around its date), else the body text's, with the
        // attributes over it, no margins of its own.
        const outer = enclosing(open);
        const style = withLayoutAttrs(outer?.style ?? resolveBodyStyle(resolved), layout, dpi);
        entry = {
          id: b.containerId,
          ...(outer?.styleId !== undefined ? { styleId: outer.styleId } : {}),
          style,
          tailStyle: outer ? withLayoutAttrs(outer.tailStyle, layout, dpi) : style,
          marginTopPx: 0,
          marginBottomPx: 0,
          snapToGrid: outer?.snapToGrid ?? true,
          ...(outer ? {} : { overBody: layout }),
        };
        byId.set(b.containerId, entry);
        open.push(entry);
        continue;
      }
      if (b.containerName === 'paragraphs' && styleId !== undefined && b.containerId !== undefined) {
        let base = cache.get(styleId);
        if (!base) {
          const cfg = resolved.paragraphStyles.find((s) => s.id === styleId);
          if (cfg) {
            const style = resolveParagraphStyle(cfg, resolved);
            const marginBottomPx = dimensionToPx(cfg.marginBottom, dpi, style.fontSizePx);
            // A negative margin pulls the flow after the container up past
            // the entries' own spacing instead of collapsing with it.
            const tailMarginPx = marginBottomPx < 0 ? marginBottomPx : Math.max(style.marginBottomPx, marginBottomPx);
            base = {
              styleId,
              style,
              tailStyle: { ...style, marginBottomPx: tailMarginPx },
              marginTopPx: dimensionToPx(cfg.marginTop, dpi, style.fontSizePx),
              marginBottomPx,
              snapToGrid: cfg.snapToGrid,
            };
            cache.set(styleId, base);
          }
        }
        if (base) {
          entry = layout
            ? { id: b.containerId, ...base, style: withLayoutAttrs(base.style, layout, dpi), tailStyle: withLayoutAttrs(base.tailStyle, layout, dpi) }
            : { id: b.containerId, ...base };
          byId.set(b.containerId, entry);
        }
      }
      open.push(entry);
      continue;
    }
    if (b.type === 'containerEnd') {
      open.pop();
      continue;
    }
    for (let j = open.length - 1; j >= 0; j--) {
      if (open[j]) { byBlock[i] = open[j]; break; }
    }
  }
  return { byId, byBlock };
}

/** What a `:::paragraphs` fence sets beside its style (#424): `align`
 *  (`start`, `end`, `left`, `right`, `center`, `justify`), `indent` (from
 *  the start side) and `endIndent` (from the end side), lengths whose bare
 *  numbers count ems of the text (`indent=2` is 2字下げ). 地付き is
 *  `{align=end}`, 地から1字上げ `{align=end endIndent=1}`. */
interface LayoutAttrs {
  textAlign?: TextAlign;
  indent?: string;
  endIndent?: string;
}

const ALIGNS: Readonly<Record<string, TextAlign>> = {
  start: 'left', left: 'left', end: 'right', right: 'right', center: 'center', centre: 'center', justify: 'justify',
};

/** The layout attributes of a fence, undefined when it sets none. */
function layoutAttrs(attrs: DirectiveAttrs | undefined): LayoutAttrs | undefined {
  if (!attrs) return undefined;
  const textAlign = attrs.align !== undefined ? ALIGNS[attrs.align.trim().toLowerCase()] : undefined;
  const out: LayoutAttrs = {
    ...(textAlign ? { textAlign } : {}),
    ...(attrs.indent !== undefined ? { indent: attrs.indent } : {}),
    ...(attrs.endIndent !== undefined ? { endIndent: attrs.endIndent } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `style` with a fence's layout attributes over it. Text the attribute
 *  sets ragged no longer hyphenates as justified text does (a ragged
 *  style's own hyphenation zone is kept). */
function withLayoutAttrs(style: BlockStyle, layout: LayoutAttrs, dpi: number): BlockStyle {
  const out: BlockStyle = { ...style };
  if (layout.textAlign) {
    out.textAlign = layout.textAlign;
    if (layout.textAlign !== 'justify' && style.hyphenationZonePx === undefined) out.hyphenate = false;
  }
  const indentPx = lengthAttr(layout.indent, dpi, style.fontSizePx);
  if (indentPx !== undefined) {
    if (indentPx > 0) out.indentPx = indentPx;
    else delete out.indentPx;
  }
  const endIndentPx = lengthAttr(layout.endIndent, dpi, style.fontSizePx);
  if (endIndentPx !== undefined) {
    if (endIndentPx > 0) out.endIndentPx = endIndentPx;
    else delete out.endIndentPx;
  }
  return out;
}

/** The innermost open paragraph container. */
function enclosing(open: ReadonlyArray<ParagraphContainer | undefined>): ParagraphContainer | undefined {
  for (let j = open.length - 1; j >= 0; j--) if (open[j]) return open[j];
  return undefined;
}

/** The paragraph style a block is set in (`VDTBlock.paragraphStyleId`): a
 *  poem's fence style when the config has it, else, for a paragraph, the
 *  style of the innermost `:::paragraphs` container around it — as
 *  `buildBlockKind` picks the block's style. */
export function paragraphStyleIdOf(
  raw: ContentBlock,
  container: ParagraphContainer | undefined,
  resolved: ResolvedConfig,
): string | undefined {
  if (raw.type !== 'paragraph') return undefined;
  const verseStyle = raw.verse?.attrs.style?.trim();
  if (verseStyle && resolved.paragraphStyles.some((s) => s.id === verseStyle)) return verseStyle;
  return container?.styleId;
}
