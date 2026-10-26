/**
 * Measurement invocation for a single block — dispatches between plain/rich
 * text runs and the `mathDisplay` bypass path that skips text layout entirely.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { Resource, ResourceType } from '../../types.js';
import type { ResolvedConfig, VDTBlock, ResolvedResourceBlock, VDTFigureLabel } from '../../vdt.js';
import { layOutFigureLabels } from '../../composed/labels.js';
import type { BlockStyle } from '../styles.js';
import type { MeasuredBlock, MeasurementCache } from '../../measure/index.js';
import { measureBlock, measureRichBlock, cachedMeasureBlock, cachedMeasureRichBlock } from '../../measure/index.js';
import { renderMath } from '../../math/index.js';
import { layoutResourceBlock, type TableRowMetrics, type TableSliceSpec } from '../resources/resourceLayout.js';
import type { ResourceNumberingMap } from '../resources/resourceNumbering.js';
import type { CaptionCitations } from '../references/citations.js';

export interface MeasurementInput {
  vdtType: VDTBlock['type'];
  /** Offset of the Markdown body in the chapter file: a figure's labels
   *  carry absolute offsets (#857). */
  bodyOffset?: number;
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
  /** The formatted citations of resource captions and notes (#529). */
  captionCitations?: ReadonlyMap<string, CaptionCitations>;
  /** For `resource` blocks: the resolved resource, its type, and number. */
  resource?: Resource;
  resourceType?: ResourceType;
  resourceNumber?: string;
  /** Widest the figure's image may be set (`ResourceLayoutInput.maxBodyWidth`). */
  maxBodyWidth?: number;
  /** Px a picture with a safe area is set taller (or shorter)
   *  (`ResourceLayoutInput.bodyHeightDelta`). */
  bodyHeightDelta?: number;
  /** A resource on a vertical page: set upright (`ResourceLayoutInput.upright`). */
  upright?: { maxLength: number };
  /** An inline resource whose caption goes to the side column (#729,
   *  `ResourceLayoutInput.captionAside`). */
  captionAside?: { dx: number; width: number; alignBottom: boolean };
  /** A table: lay out only these rows (`ResourceLayoutInput.slice`, an
   *  inline table split across columns, #634). */
  tableSlice?: TableSliceSpec;
}

export interface MeasurementResult {
  measured: MeasuredBlock;
  mathDisplayRender?: ReturnType<typeof renderMath>;
  /** Present for `resource` blocks: the resolved, measured resource embed. */
  resourceBlock?: ResolvedResourceBlock;
  /** A table laid out in full: its row metrics, for slice planning. */
  tableRows?: TableRowMetrics;
  /** Height of the caption band set beside the body (`captionAside`). */
  asideHeight?: number;
}

/** The labels of a `:::figure` block (#854) as the VDT carries them
 *  (`ResolvedResourceBlock.labels`), their offsets absolute in the
 *  chapter file (`bodyOffset` added), with their stable id, their anchor
 *  and the source of each character (#857); undefined when it has none. */
export function figureLabels(block: Pick<ContentBlock, 'figure'>, bodyOffset = 0): VDTFigureLabel[] | undefined {
  const labels = block.figure?.labels;
  if (!labels || labels.length === 0) return undefined;
  return labels.map((l) => {
    // The inline symbols of its text (#1058): where each placeholder is.
    const icons: { at: number; alt: string }[] = [];
    let at = 0;
    for (const s of l.spans) {
      if (s.swatch?.icon) icons.push({ at, alt: s.swatch.icon.alt });
      at += s.text.length;
    }
    return {
      text: l.text,
      ...(icons.length > 0 ? { icons } : {}),
      at: 'anchor' in l.at ? { anchor: l.at.anchor } : { x: l.at.x, y: l.at.y },
      ...(l.style !== undefined ? { style: l.style } : {}),
      ...(l.leader !== undefined ? { leader: l.leader } : {}),
      sourceStart: l.textStart + bodyOffset,
      sourceEnd: l.textEnd + bodyOffset,
      ...(l.id !== undefined ? { id: l.id } : {}),
      ...(l.anchorRef !== undefined ? { anchorRef: l.anchorRef } : {}),
      ...(l.attrSources.at ? { atSource: { start: l.attrSources.at.sourceStart + bodyOffset, end: l.attrSources.at.sourceEnd + bodyOffset } } : {}),
      ...(l.sourceMap.length === l.text.length ? { sourceMap: l.sourceMap.map((o) => o + bodyOffset) } : {}),
    };
  });
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
    const { block, totalHeight, tableRows, asideHeight } = layoutResourceBlock({
      ...(cache ? { cache } : {}),
      resource: input.resource,
      resourceType: input.resourceType,
      number: input.resourceNumber ?? '',
      resolved: input.resolved,
      columnWidth: measureMaxWidth,
      resourceNumbering: input.resourceNumbering ?? {},
      resourceTypes: input.resourceTypes ?? [],
      resources: input.resources ?? [],
      ...(input.captionCitations ? { captionCitations: input.captionCitations } : {}),
      ...(input.maxBodyWidth !== undefined ? { maxBodyWidth: input.maxBodyWidth } : {}),
      ...(input.bodyHeightDelta ? { bodyHeightDelta: input.bodyHeightDelta } : {}),
      ...(input.upright ? { upright: input.upright } : {}),
      ...(input.tableSlice ? { slice: input.tableSlice } : {}),
      ...(input.captionAside ? { captionAside: input.captionAside } : {}),
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
    // A `:::figure`'s labels (#862) ride on its block: a copy, so a
    // cached layout of the same resource keeps none of them.
    // Each label is laid out on the picture as set here (#860).
    const plain = figureLabels(contentBlock, input.bodyOffset);
    const labels = plain
      ? layOutFigureLabels(plain, contentBlock.figure?.labels, block, {
          resolved: input.resolved,
          ...(input.resourceNumbering ? { resourceNumbering: input.resourceNumbering } : {}),
          ...(input.resourceTypes ? { resourceTypes: input.resourceTypes } : {}),
          ...(input.resources ? { resources: input.resources } : {}),
          ...(cache ? { cache } : {}),
        })
      : undefined;
    const resourceBlock = labels ? { ...block, labels } : block;
    return { measured, resourceBlock, ...(tableRows ? { tableRows } : {}), ...(asideHeight !== undefined ? { asideHeight } : {}) };
  }

  // A score system (#1172): one line as tall as the system, never broken.
  // A measure narrower than the one the score was engraved at (a box, a
  // side column) scales the system down to fit.
  if (vdtType === 'score') {
    const system = rawBlock.score?.system;
    const natural = system?.widthPx ?? measureMaxWidth;
    const k = natural > measureMaxWidth && natural > 0 ? measureMaxWidth / natural : 1;
    const width = natural * k;
    const height = (system?.heightPx ?? style.lineHeightPx) * k;
    const measured: MeasuredBlock = {
      lines: [{
        text: '',
        bbox: { x: 0, y: 0, width, height },
        baseline: height,
        hyphenated: false,
        segments: [{ kind: 'score' as const, text: '\uFFFC', width, ...(system ? { scoreSystem: system } : {}) }],
        isLastLine: true,
      }],
      totalHeight: height,
    };
    return { measured };
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
  const measured = cache && !measureOptions?.keepBreaks && !measureOptions?.restWidths && !measureOptions?.lineInsets
    ? (useRich
        ? cachedMeasureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions, cache)
        : cachedMeasureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions, cache))
    : (useRich
        ? measureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions)
        : measureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions));
  return { measured };
}
