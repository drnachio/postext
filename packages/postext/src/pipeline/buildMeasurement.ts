/**
 * Measurement invocation for a single block — dispatches between plain/rich
 * text runs and the `mathDisplay` bypass path that skips text layout entirely.
 */

import type { ContentBlock } from '../parse';
import type { Resource, ResourceType } from '../types';
import type { ResolvedConfig, VDTBlock, ResolvedResourceBlock } from '../vdt';
import type { BlockStyle } from './styles';
import type { MeasuredBlock, MeasurementCache } from '../measure';
import { measureBlock, measureRichBlock, cachedMeasureBlock, cachedMeasureRichBlock } from '../measure';
import { renderMath } from '../math';
import { layoutResourceBlock } from './resourceLayout';
import type { ResourceNumberingMap } from './resourceNumbering';

export interface MeasurementInput {
  vdtType: VDTBlock['type'];
  rawBlock: ContentBlock;
  contentBlock: ContentBlock;
  style: BlockStyle;
  measureMaxWidth: number;
  measureOptions: Parameters<typeof measureBlock>[4];
  mathEnabled: boolean;
  useRich: boolean;
  cache?: MeasurementCache;
  /** Resolved config — needed to lay out resource blocks. */
  resolved?: ResolvedConfig;
  /** All known resources — drives inline `:ref` resolution in captions. */
  resources?: Resource[];
  /** All resource types. */
  resourceTypes?: ResourceType[];
  /** Computed resource numbering map. */
  resourceNumbering?: ResourceNumberingMap;
  /** For `resource` blocks: the resolved resource, its type, and number. */
  resource?: Resource;
  resourceType?: ResourceType;
  resourceNumber?: string;
  /** Widest the figure's image may be set (`ResourceLayoutInput.maxBodyWidth`). */
  maxBodyWidth?: number;
  /** A resource on a vertical page: set upright (`ResourceLayoutInput.upright`). */
  upright?: { maxLength: number };
}

export interface MeasurementResult {
  measured: MeasuredBlock;
  mathDisplayRender?: ReturnType<typeof renderMath>;
  /** Present for `resource` blocks: the resolved, measured resource embed. */
  resourceBlock?: ResolvedResourceBlock;
}

export function runMeasurement(input: MeasurementInput): MeasurementResult {
  const { vdtType, rawBlock, contentBlock, style, measureMaxWidth, measureOptions, mathEnabled, useRich, cache } = input;

  // Resource block: lay out the image/table + caption as one atomic group.
  // Produces a single VDTLine whose bbox carries the group's total height so
  // the placement loop can treat it like any other measured block.
  if (vdtType === 'resource') {
    if (!input.resource || !input.resolved) {
      // Unknown resource id — emit nothing (the warnings phase surfaces this).
      return { measured: { lines: [], totalHeight: 0 } };
    }
    const { block, totalHeight } = layoutResourceBlock({
      resource: input.resource,
      resourceType: input.resourceType,
      number: input.resourceNumber ?? '',
      resolved: input.resolved,
      columnWidth: measureMaxWidth,
      resourceNumbering: input.resourceNumbering ?? {},
      resourceTypes: input.resourceTypes ?? [],
      resources: input.resources ?? [],
      ...(input.maxBodyWidth !== undefined ? { maxBodyWidth: input.maxBodyWidth } : {}),
      ...(input.upright ? { upright: input.upright } : {}),
    });
    const measured: MeasuredBlock = {
      lines: [{
        text: '',
        // An upright block's width in the flow is its frame's height.
        bbox: { x: 0, y: 0, width: block.rotation ? block.rotation.height : block.bodyRect.width, height: totalHeight },
        baseline: 0,
        hyphenated: false,
        segments: [],
        isLastLine: true,
      }],
      totalHeight,
    };
    return { measured, resourceBlock: block };
  }

  // Math display block: bypass text layout entirely. Produce a single
  // VDTLine whose bbox is the math render's pixel box, centred later.
  if (vdtType === 'mathDisplay') {
    const tex = rawBlock.tex ?? '';
    if (!mathEnabled) {
      // Fallback: render the literal TeX as a paragraph-like run.
      const measured = useRich
        ? measureRichBlock(
            [{ text: `$$${tex}$$`, bold: false, italic: false }],
            style.fontString, style.fontString, style.fontString, style.fontString,
            measureMaxWidth, style.lineHeightPx, measureOptions,
          )
        : measureBlock(`$$${tex}$$`, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions);
      return { measured };
    }
    // `renderMath` internally returns a cheap placeholder when MathJax
    // isn't initialised yet — no need to gate the call here. When the
    // real engine lands later, `CanvasPreview` bumps `resizeKey` and the
    // pipeline rebuilds with the genuine render.
    // The measure is the width a numbered equation (`\tag`) spans, its
    // number flush right; other formulas keep their own width.
    const render = renderMath(tex, true, style.fontSizePx, { color: style.color, containerWidthPx: measureMaxWidth });
    const width = Math.min(render.widthPx, measureMaxWidth);
    const height = render.heightPx;
    const measured: MeasuredBlock = {
      lines: [{
        text: '',
        bbox: { x: 0, y: 0, width, height },
        baseline: render.ascentPx,
        hyphenated: false,
        segments: [{ kind: 'math' as const, text: '\uFFFC', width, mathRender: render }],
        isLastLine: true,
      }],
      totalHeight: height,
    };
    return { measured, mathDisplayRender: render };
  }

  // Kept breaks and later measures are not part of the cache key: such a
  // measurement goes around the cache.
  const measured = cache && !measureOptions?.keepBreaks && !measureOptions?.restWidths
    ? (useRich
        ? cachedMeasureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions, cache)
        : cachedMeasureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions, cache))
    : (useRich
        ? measureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions)
        : measureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions));
  return { measured };
}
