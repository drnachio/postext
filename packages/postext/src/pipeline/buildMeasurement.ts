/**
 * Measurement invocation for a single block — dispatches between plain/rich
 * text runs and the `mathDisplay` bypass path that skips text layout entirely.
 */

import type { ContentBlock } from '../parse';
import type { VDTBlock } from '../vdt';
import type { BlockStyle } from './styles';
import type { MeasuredBlock, MeasurementCache } from '../measure';
import { measureBlock, measureRichBlock, cachedMeasureBlock, cachedMeasureRichBlock } from '../measure';
import { renderMath } from '../math';

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
}

export interface MeasurementResult {
  measured: MeasuredBlock;
  mathDisplayRender?: ReturnType<typeof renderMath>;
}

export function runMeasurement(input: MeasurementInput): MeasurementResult {
  const { vdtType, rawBlock, contentBlock, style, measureMaxWidth, measureOptions, mathEnabled, useRich, cache } = input;

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
    const render = renderMath(tex, true, style.fontSizePx, { color: style.color });
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

  const measured = cache
    ? (useRich
        ? cachedMeasureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions, cache)
        : cachedMeasureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions, cache))
    : (useRich
        ? measureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions)
        : measureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions));
  return { measured };
}
