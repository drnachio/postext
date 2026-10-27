// The options a block's text is measured with: indents (a drop cap's
// lines among them), breaking, runts, tracking and hyphenation
// (#1278: split out of measureContentBlock.ts).
import { lineIndentAt } from '../../../measure/types.js';
import { computeMeasureViewport } from '../buildHelpers.js';
import { justifyTrackingPx } from './helpers.js';
import { kashidaMeasureOptions } from '../../../measure/rtl/kashida.js';
import type { MeasureContentBlockOptions } from './types.js';
import type { ResolvedConfig } from '../../../vdt/document.js';
import type { BlockKind } from '../buildBlockKind.js';
import type { BlockStyle } from '../../styles.js';
import type { VDTBlockType } from '../../../vdt/blocks.js';
import type { ListBulletStyle } from '../../text/lists.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { TabSettings } from '../../../measure/tabs.js';
import type { PreparedDropCap } from '../../text/dropCap.js';

/** What createMeasureOptions takes from the pass. */
export interface MeasureOptionsDeps {
  opts: MeasureContentBlockOptions | undefined;
  resolved: ResolvedConfig;
  kind: BlockKind;
  style: BlockStyle;
  vdtType: VDTBlockType;
  listBullet: ListBulletStyle | undefined;
  contentBlock: ContentBlock;
  prepared: { block: ContentBlock; tabs?: TabSettings; };
  dropCap: PreparedDropCap | undefined;
  measureFirstLineIndent: number;
  measureHangingIndent: boolean;
  measureLineIndents: number[] | undefined;
  effectiveFirstLineIndent: number;
  runtActive: boolean;
  letterSpacingPx: number;
}

export function createMeasureOptions(deps: MeasureOptionsDeps) {
  const {
    opts, resolved, kind, style, vdtType, listBullet, contentBlock, prepared, dropCap,
    measureFirstLineIndent, measureHangingIndent, measureLineIndents, effectiveFirstLineIndent,
    runtActive, letterSpacingPx
  } = deps;
  // The paragraph's base direction: its own (`{dir=…}`), else the
  // document's (`setMeasureDirection`). Passed only when the block sets
  // one, so the measurements of every other block keep their cache keys.
  // The drop cap's lines (#623): its width and gap on each line it sinks,
  // the paragraph's own indents after them (its first-line indent dropped).
  const capIndents = dropCap
    ? (() => {
      const base = { firstLineIndentPx: effectiveFirstLineIndent, hangingIndent: measureHangingIndent, ...(measureLineIndents ? { lineIndentsPx: measureLineIndents } : {}) };
      const after = dropCap.sink === 0 ? 0 : lineIndentAt(base, dropCap.sink);
      return [...dropCap.indents, measureHangingIndent || measureLineIndents ? after : 0];
    })()
    : undefined;
  const measureOptions = {
    ...(contentBlock.direction !== undefined ? { direction: contentBlock.direction } : {}),
    textAlign: style.textAlign,
    hyphenate: style.hyphenate,
    // A paragraph style's own `wordBreak`: passed only when set, so the
    // measurements of every other block keep their cache keys.
    ...(style.cjkWordBreak !== undefined ? { cjkWordBreak: style.cjkWordBreak } : {}),
    firstLineIndentPx: capIndents ? 0 : effectiveFirstLineIndent,
    hangingIndent: capIndents ? false : measureHangingIndent,
    // A first-line indent paired with a hanging one (#620), or the lines a
    // drop cap shortens (#623): passed only then, so every other block
    // keeps its cache key.
    ...(capIndents ? { lineIndentsPx: capIndents } : measureLineIndents ? { lineIndentsPx: measureLineIndents } : {}),
    // A numbered bibliography entry (#290): its label in a column as wide
    // as the turnover lines' indent.
    ...(measureHangingIndent && !measureLineIndents && !capIndents && contentBlock.spans.some((s) => s.labelTab) ? { labelColumnPx: measureFirstLineIndent } : {}),
    // A heading's number that ends in 、 or ・ (#679): the composer does
    // not read it as half of a number with the title.
    ...(kind.numberLabelLength ? { labelLength: kind.numberLabelLength } : {}),
    // Tab stops (#622): passed only to a block that holds a tab.
    ...(prepared.tabs ? { tabs: prepared.tabs } : {}),
    optimal: resolved.bodyText.optimalLineBreaking,
    maxStretchRatio: resolved.bodyText.maxWordSpacing,
    minShrinkRatio: resolved.bodyText.minWordSpacing,
    runtPenalty: runtActive ? resolved.bodyText.runtPenalty : 0,
    runtMinCharacters: runtActive ? resolved.bodyText.runtMinCharacters : 0,
    // Left undefined when off, so the common-case cache keys stay unchanged.
    runtGraded: runtActive && resolved.bodyText.gradedRuntPenalty ? true : undefined,
    avoidHyphenAtLines: opts?.avoidHyphenAtLines,
    ...(opts?.keepBreaks ? { keepBreaks: opts.keepBreaks } : {}),
    ...(opts?.restColumnWidths && opts.restColumnWidths.length > 0
      ? {
        restWidths: opts.restColumnWidths.map((s) => ({
          fromLine: s.fromLine,
          maxWidthPx: computeMeasureViewport(s.columnWidth, style, listBullet).measureMaxWidth,
        })),
      }
      : {}),
    ...(opts?.lineInsets && opts.lineInsets.length > 0 ? { lineInsets: opts.lineInsets } : {}),
    looseness: opts?.looseness,
    letterSpacingPx: letterSpacingPx !== 0 ? letterSpacingPx : undefined,
    hyphenationZonePx: style.hyphenationZonePx,
    // Justification tracking (EF-65): left undefined when off, so the
    // common-case cache keys stay unchanged.
    justifyTrackingPx: justifyTrackingPx(resolved, style, vdtType, contentBlock.text, opts?.gridTrackingEm),
    // Kashida justification (#375): undefined when off (every document
    // not in an Arabic-script language), so those cache keys are unchanged.
    kashida: style.textAlign === 'justify' && vdtType !== 'heading'
      ? kashidaMeasureOptions(resolved.bodyText, style.fontString, style.fontSizePx)
      : undefined,
    // Breaks after a closed dash (EF-141) and Knuth–Plass on ragged running
    // text (EF-147): left undefined when off, the 1.4 breaks.
    breakAfterDashes: resolved.bodyText.breakAfterDashes ? true : undefined,
    // A compound's hyphen on every path (EF-186), compounds the dictionary
    // leaves whole (EF-169) and the repeated hyphen: left undefined when
    // they keep the 1.4 breaks.
    breakAfterHyphens: resolved.bodyText.breakAfterHyphens ? true : undefined,
    hyphenateCompounds: resolved.bodyText.hyphenation.compounds ? undefined : false,
    repeatHyphen: resolved.bodyText.repeatHyphen ? true : undefined,
    optimalRagged: resolved.bodyText.optimalRagged && style.textAlign !== 'justify'
      && (vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem')
      ? true
      : undefined,
  };
  return {
    measureOptions
  };
}
