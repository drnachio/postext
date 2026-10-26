// Warnings a placement pass raises, kept per document until the build reads
// them with the content warnings (#1276: split out of build.ts).
import type { VDTDocument, ContentWarning, VDTBlock } from '../../vdt.js';

/** Warnings the last pass's `:::index` raised, per document (read with
 *  the content warnings once the build is done). */
export const indexWarnings = new WeakMap<VDTDocument, ContentWarning[]>();
/** The `joiningScriptLetterSpacing` warnings of the last pass, per
 *  document. */
export const joiningSpacingWarnings = new WeakMap<VDTDocument, ContentWarning[]>();
/** The `dropCap` warnings of the last pass, per document (#623). */
export const dropCapWarningsByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** The `floatShrunk` (#626) and `pictureBelowPrintSize` (#901) warnings
 *  of a build, found by its last pass. */
export const floatShrinkWarningsByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** The `textWrap` warnings of a build (#627) and its `columnsTooNarrow`
 *  ones (#634), found by its last pass. */
export const textWrapWarningsByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** The composed pages' layout warnings of a pass (`frameOverflow`, #855). */
export const composedWarningsByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** The `shortListSplit` and `openerFloat` warnings of a build (#749),
 *  found by its last pass. */
export const compositionWarningsByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** What a pass set in the side column of a page opened after the text of
 *  its chapter (#639): a side box's frame, a side float's block, with the
 *  source range an `afterText` warning points at. Read from the finished
 *  layout, so the blocks a splice keeps bring their note along. */
export const setAfterText = new WeakMap<VDTBlock, { resourceId?: string; sourceStart?: number; sourceEnd?: number }>();
/** The `unplaced` warnings of a build (#639): what its last pass left in
 *  its queues. */
export const unplacedByDoc = new WeakMap<VDTDocument, ContentWarning[]>();
/** The per-document warnings a column-balancing splice merges by page
 *  into the document it builds (#1203). */
export const SPLICED_WARNING_MAPS = [indexWarnings, joiningSpacingWarnings, dropCapWarningsByDoc, floatShrinkWarningsByDoc, textWrapWarningsByDoc, composedWarningsByDoc, compositionWarningsByDoc];

/** An `afterText` warning for each side box and side float set after the
 *  text (`setAfterText`) on a page whose text columns hold nothing: one a
 *  barrier box then shared with them holds text again. */
export function afterTextWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const page of doc.pages) {
    if (!page.floats || page.columns.some((c) => c.kind !== 'side' && c.blocks.length > 0)) continue;
    for (const block of page.floats) {
      const note = setAfterText.get(block);
      if (note) out.push({ kind: 'afterText', ...note, pageIndex: page.index });
    }
  }
  return out;
}
