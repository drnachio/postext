/**
 * Code listings in their box (#624). The build wraps each `code` block in a
 * synthetic `:::callout` whose style ({@link codeBoxStyle}) is built from
 * `codeStyle`: background, border, radius, padding, a title row or a label
 * tab, margins, page span, and the split rules of a box that may break
 * (`keepTogether: false`, `splitMinLines`, `repeatTitle`, the "continued"
 * marker). The callout machinery then places the listing, splits it between
 * lines across columns and pages and redraws its frame on each part, as it
 * does a box written by hand. A fence inside a `:::callout` is a box nested
 * in it.
 */

import type { ContentBlock, ParseOptions } from '../parse';
import type { CalloutStyleConfig, Dimension } from '../types';
import type { ResolvedConfig } from '../vdt';
import { dimensionToPx } from '../units';
import { resolvedCodeStyle } from '../defaults/codeStyle';
import { computeBaselineGrid } from './config';

/** Style id of a listing's box. Not a user style: no configuration can
 *  name it. */
export const CODE_BOX_STYLE_ID = '__postext-code';

/** Container ids of the listings' boxes: far past any id the parser hands
 *  out, the chapter-end notes' base, and below the page-span embeds'. */
const CODE_CONTAINER_BASE = 1_500_000_000;

/** How the configuration reads a text's code (#624): fences unless
 *  `codeStyle.blocks` is off (a document stored before #624), indented code
 *  when `codeStyle.indentedCode` asks for it. Undefined for the default
 *  reading, so the parse memo keeps one entry per text. */
export function codeParseOptions(resolved: ResolvedConfig): ParseOptions | undefined {
  const cs = resolved.codeStyle;
  if (!cs || (cs.blocks && !cs.indentedCode)) return undefined;
  return { fences: cs.blocks, indentedCode: cs.indentedCode };
}

const px = (value: number): Dimension => ({ value, unit: 'px' });

/** The box style of a document's listings (see the module comment): every
 *  length in px, read against the code's size (and the body's for the
 *  code's own em size). */
export function codeBoxStyle(resolved: ResolvedConfig): CalloutStyleConfig {
  const cs = resolvedCodeStyle(resolved);
  const dpi = resolved.page.dpi;
  const bodyPx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const codePx = dimensionToPx(cs.fontSize, dpi, bodyPx);
  const lineHeight = cs.lineHeight
    ? (cs.lineHeight.unit === 'em' || cs.lineHeight.unit === 'rem' ? codePx * cs.lineHeight.value : dimensionToPx(cs.lineHeight, dpi, codePx))
    : computeBaselineGrid(resolved);
  const len = (d: Dimension): Dimension => px(dimensionToPx(d, dpi, codePx));
  return {
    id: CODE_BOX_STYLE_ID,
    name: 'Code',
    title: '',
    span: cs.span,
    placement: 'here',
    backgroundEnabled: cs.backgroundEnabled,
    background: cs.background,
    border: { enabled: cs.border.enabled, color: cs.border.color, width: cs.border.width },
    borderRadius: len(cs.borderRadius),
    padding: { top: len(cs.padding.top), right: len(cs.padding.right), bottom: len(cs.padding.bottom), left: len(cs.padding.left) },
    stripe: { enabled: false },
    icon: { kind: 'none' },
    marker: { kind: 'none' },
    ...(cs.label ? { label: { fontFamily: cs.fontFamily, fontSize: px(codePx), color: cs.color, ...cs.label } } : {}),
    titleStyle: {
      fontFamily: cs.fontFamily,
      fontSize: px(codePx * 0.9),
      fontWeight: cs.boldFontWeight,
      color: cs.color,
      gap: px(codePx * 0.4),
      ...cs.titleStyle,
    },
    body: {
      fontFamily: cs.fontFamily,
      fontSize: px(codePx),
      lineHeight: px(lineHeight),
      color: cs.color,
      fontWeight: cs.fontWeight,
      boldFontWeight: cs.boldFontWeight,
      italic: false,
      smallCaps: false,
      textAlign: 'left',
      hyphenation: false,
      paragraphSpacing: false,
      firstLineIndent: px(0),
    },
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom,
    snapToGrid: cs.snapToGrid,
    keepTogether: cs.keepTogether,
    splitMinLines: cs.splitMinLines,
    repeatTitle: cs.repeatTitle,
    continuesMarkerEnabled: cs.continuesMarkerEnabled,
    ...(cs.continuesMarker ? { continuesMarker: cs.continuesMarker } : {}),
  };
}

/** The fence attributes a listing's box reads: its title (in the label
 *  tab when `codeStyle.label` is set, else the title row), an explicit
 *  `label`, and `span` / `placement`. */
function boxAttrs(block: ContentBlock, labelled: boolean): Record<string, string> {
  const code = block.code!;
  const attrs: Record<string, string> = { type: CODE_BOX_STYLE_ID };
  const title = code.title;
  if (title !== undefined) attrs[labelled ? 'label' : 'title'] = title;
  if (code.attrs.label !== undefined) attrs.label = code.attrs.label;
  if (code.attrs.span !== undefined) attrs.span = code.attrs.span;
  if (code.attrs.placement !== undefined) attrs.placement = code.attrs.placement;
  return attrs;
}

/**
 * `blocks` with every `code` block wrapped in its box (a synthetic
 * `:::callout` of the {@link CODE_BOX_STYLE_ID} style). `wrapped` tells
 * whether any was: the build then adds the box's style. The same blocks
 * come back when none is. A listing in a right-to-left document reads left
 * to right (`direction: 'ltr'` on the code block).
 */
export function wrapCodeBlocks(blocks: readonly ContentBlock[], resolved: ResolvedConfig): { blocks: ContentBlock[]; wrapped: boolean } {
  if (!blocks.some((b) => b.type === 'code')) return { blocks: blocks as ContentBlock[], wrapped: false };
  const labelled = resolvedCodeStyle(resolved).label !== undefined;
  const rtl = resolved.direction === 'rtl';
  const out: ContentBlock[] = [];
  let n = 0;
  for (const b of blocks) {
    if (b.type !== 'code' || !b.code) { out.push(b); continue; }
    const containerId = CODE_CONTAINER_BASE + n++;
    const marker = (type: 'containerStart' | 'containerEnd', at: number): ContentBlock => ({
      type,
      text: '',
      spans: [],
      containerName: 'callout',
      ...(type === 'containerStart' ? { containerAttrs: boxAttrs(b, labelled) } : {}),
      containerId,
      sourceStart: at,
      sourceEnd: at,
      sourceMap: [],
      ...(b.direction && type === 'containerStart' ? { direction: b.direction } : {}),
      ...(b.lang ? { lang: b.lang } : {}),
    });
    const code: ContentBlock = rtl && b.direction !== 'ltr' ? { ...b, direction: 'ltr' } : b;
    out.push(marker('containerStart', b.sourceStart), code, marker('containerEnd', b.sourceEnd));
  }
  return { blocks: out, wrapped: true };
}
