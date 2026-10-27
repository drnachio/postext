// What a pass does once every block is placed: unplaced resources, document
// rules, labels and the warnings the result carries (#1278).
import { type ContentWarning, type VDTColumn, pageIsVertical, pageIsMirrored } from '../../../../vdt.js';
import { unplacedByDoc, joiningSpacingWarnings, dropCapWarningsByDoc, floatShrinkWarningsByDoc, textWrapWarningsByDoc, composedWarningsByDoc, compositionWarningsByDoc } from '../../warnings.js';
import { centrePageText } from '../../passHelpers.js';
import { dimensionToPx } from '../../../../units.js';
import { pageLayoutOf } from '../../../blocks/placement.js';
import { paperByBlock, stampPagePaper } from '../../../pages/paper.js';
import { buildPageLabels } from '../../../../numerals/numbering.js';
import { fillPageMarks, stampCarriedSource, carriedByDoc } from '../../pageMarks.js';
import { buildLineNumbers } from '../../../text/lineNumbers.js';
import { buildHeadersAndFooters } from '../../../pages/headerFooter.js';
import { flowColorValues } from '../../../sections/partPalette.js';
import { leadingBoldText } from '../../../pages/placeholders.js';
import { buildCodeLineNumbers } from '../../../code/codeLines.js';
import { stampCentralBaselines } from '../../../text/verticalMetrics.js';
import { orientLinesToFrames } from '../../../blocks/mirrorFrame.js';
import { stampFigureLabelRects } from '../../../../composed/labels.js';
import { joiningLetterSpacingWarnings, dropCapWarnings, floatShrinkWarnings, pictureBelowPrintSizeWarnings, emptyCaptionWarnings } from '../../../contentWarnings.js';
import type { PostextConfig, Resource, ResolvedCalloutStyleConfig } from '../../../../types.js';
import type { VDTDocument } from '../../../../vdt/document.js';
import type { LayoutContinuation } from '../../../../types/content.js';
import type { ContentBlock } from '../../../../parse/index.js';
import type { ImportedJumps } from '../../../../composed/carry.js';
import type { ParagraphContainerPlan } from '../../../callouts/paragraphContainers.js';
import type { PlannedCallout } from '../../../callouts/calloutLayout.js';
import type { CalloutLayouter } from '../../../callouts/frameLayout.js';
import type { PlannedFloat } from '../../../floats/floatPlacement.js';
import type { CitingPageSlot, CitingPageRefusal } from '../../passTypes.js';
import type { DropCapNote } from '../../../blocks/measureContentBlock.js';
import type { PageNumberSegment } from '../../../../numerals/numbering/pageLabels.js';
import type { VDTBlock } from '../../../../vdt/blocks.js';
import type { VDTComposedPage } from '../../../../vdt/pages/composed.js';
import type { StoryJump } from '../../../../composed/carryTypes.js';
import type { PassSetupState } from '../setupState.js';

/** What createPassFinish takes from the pass. */
export interface PassFinishDeps {
  config: PostextConfig | undefined;
  givenResources: Resource[] | undefined;
  dpi: number;
  doc: VDTDocument;
  continuation: LayoutContinuation | undefined;
  bodyOffset: number;
  chapterEndNotes: boolean;
  codeBoxes: { blocks: ContentBlock[]; wrapped: boolean; };
  contentBlocks: ContentBlock[];
  carried: ImportedJumps | undefined;
  resourceById: Map<string, Resource>;
  paragraphContainers: ParagraphContainerPlan;
  calloutFloats: Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; }>;
  pendingFloats: PlannedFloat[];
  pendingSideBoxes: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig; pageIndex: number; }[];
  openerFloatNotes: ContentWarning[];
  awaitingSideBoxes: { box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig; }; pageIndex: number; band: number; column: VDTColumn; refY: number; }[];
  centredPages: Set<number>;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  textWrapNotes: ContentWarning[];
  movedNotes: ContentWarning[];
  settleCitingPageFloats: () => { proposals: Map<string, CitingPageSlot>; refused: Map<string, CitingPageRefusal>; };
  joiningLetterSpacing: Set<number>;
  dropCapNotes: Map<number, DropCapNote>;
  reserveLeftoverNotes: () => void;
  dropChapterEndNotes: () => void;
  ruleChapterEndNotes: () => void;
  setColumnNotes: () => void;
  spanPlacedInBand: Set<number>;
  cappedBandColumns: Map<number, readonly VDTColumn[]>;
  pageNumberSegments: PageNumberSegment[];
  isFreeHeading: (b: VDTBlock) => boolean;
  columnsNotes: ContentWarning[];
  capClipsLines: (cols: readonly VDTColumn[]) => boolean;
  shortListWarnings: () => ContentWarning[];
  headingClaimWarnings: () => ContentWarning[];
  tocGroupWarnings: () => ContentWarning[];
  composedNotes: ContentWarning[];
  fenceEnd: Map<VDTComposedPage, number>;
  pendingJumps: StoryJump[];
  placeStripTexts: () => void;
  setup: PassSetupState;
}

export function createPassFinish(deps: PassFinishDeps) {
  const {
    config, givenResources, dpi, doc, continuation, bodyOffset, chapterEndNotes, codeBoxes,
    contentBlocks, carried, resourceById, paragraphContainers, calloutFloats, pendingFloats,
    pendingSideBoxes, openerFloatNotes, awaitingSideBoxes, centredPages, reservedOf, textWrapNotes,
    movedNotes, settleCitingPageFloats, joiningLetterSpacing, dropCapNotes, reserveLeftoverNotes,
    dropChapterEndNotes, ruleChapterEndNotes, setColumnNotes, spanPlacedInBand, cappedBandColumns,
    pageNumberSegments, isFreeHeading, columnsNotes, capClipsLines, shortListWarnings,
    headingClaimWarnings, tocGroupWarnings, composedNotes, fenceEnd, pendingJumps, placeStripTexts,
    setup
  } = deps;
  // Nothing leaves the layout unseen (#639): a box or a float still in a
  // queue here is on no page, and the build says so.
  const unplaced: ContentWarning[] = [];
  const sourceOf = (from: number, to: number): { sourceStart?: number; sourceEnd?: number } => {
    const first = contentBlocks[from];
    const last = contentBlocks[to];
    return first && last ? { sourceStart: first.sourceStart + bodyOffset, sourceEnd: last.sourceEnd + bodyOffset } : {};
  };
  for (const box of [...awaitingSideBoxes.map((w) => w.box), ...pendingSideBoxes]) {
    unplaced.push({ kind: 'unplaced', ...sourceOf(box.startIdx, box.plan.endIdx) });
  }
  for (const f of pendingFloats) {
    const box = f.callout ? calloutFloats.get(f.callout.startIdx) : undefined;
    unplaced.push(box
      ? { kind: 'unplaced', ...sourceOf(f.callout!.startIdx, box.plan.endIdx) }
      : { kind: 'unplaced', resourceId: f.resourceId, ...sourceOf(f.firstBlockIdx, f.firstBlockIdx) });
  }
  if (unplaced.length > 0) unplacedByDoc.set(doc, unplaced);
  // The notes, in the room the flow reserved for them.
  reserveLeftoverNotes();
  setColumnNotes();
  // After the chapter (`chapterEnd`), the notes that close a column drop
  // to its foot: the room left over stays between the text and them.
  if (chapterEndNotes && setup.resolved.footnotes.chapterEndAlign === 'foot') dropChapterEndNotes();
  if (chapterEndNotes) ruleChapterEndNotes();
  for (const index of centredPages) {
    const page = doc.pages[index];
    if (page) centrePageText(page, reservedOf);
  }
  // The text panels of the strips, where the strips stand now (#959).
  placeStripTexts();

  // A band that is still cut at the end of the pass (a trailing cap: the
  // closing band of a chapter or of the document) must hold what it took,
  // under the same rules as an uncut one. Two ways a cut too low breaks
  // them, and in both the cap is not delivered, so the driver grows it a
  // line (or drops it and keeps the uncut layout):
  //  - a block that cannot split across the cut — a paragraph tail the
  //    orphan and widow minimums keep whole, a keep-together box — is
  //    force-placed into an empty capped column and runs past its foot; the
  //    renderers clip the column to its box, so its last lines would never
  //    be painted (EF-55, EF-72). What counts is what is painted: a list
  //    tail's box bakes its bottom margin in and may reach past the cut
  //    with every line inside it;
  //  - a keep-with-next heading opening an empty capped column stays there
  //    (a column-opening heading is never pushed on) while its text goes to
  //    the next column of the band: the heading closes its column (EF-61).
  const capStrandsHeading = (cols: readonly VDTColumn[]): boolean => {
    if (!setup.resolved.headings.keepWithNext) return false;
    return cols.some((c, i) => {
      const last = c.blocks[c.blocks.length - 1];
      return c.bandCapped && last !== undefined && isFreeHeading(last) && !last.hidden
        && cols.slice(i + 1).some((next) => next.blocks.length > 0);
    });
  };
  for (const [capIndex, cols] of cappedBandColumns) {
    if (!spanPlacedInBand.has(capIndex)) continue;
    if (capClipsLines(cols) || capStrandsHeading(cols)) spanPlacedInBand.delete(capIndex);
  }

  // A styled section's pages draw the column rule of its own layout where
  // that differs from the document's (EF-112); the renderers take the
  // document's on every other page.
  const docRule = setup.resolved.layout.columnRule;
  const docRuleWidthPx = dimensionToPx(docRule.lineWidth, dpi);
  for (const page of doc.pages) {
    const layout = pageLayoutOf(page);
    if (!layout || layout === setup.resolved.layout || page.partInfo) continue;
    const rule = layout.columnRule;
    const lineWidthPx = dimensionToPx(rule.lineWidth, dpi);
    const same = rule.enabled === docRule.enabled
      && (!rule.enabled || (rule.color.hex === docRule.color.hex && lineWidthPx === docRuleWidthPx));
    if (!same) page.columnRule = { enabled: rule.enabled, color: rule.color.hex, lineWidthPx };
  }

  // The paper stock of the pages set from inside a `:::paper` run.
  const paperOfBlock = paperByBlock(contentBlocks, setup.resolved.colorPalette);
  if (paperOfBlock.some((p) => p !== undefined)) stampPagePaper(doc.pages, paperOfBlock);

  // Stamp page-number info onto every page (including blank parity pages).
  const labels = buildPageLabels(doc.pages.length, pageNumberSegments, setup.resolved.numerals);
  for (let i = 0; i < doc.pages.length; i++) {
    const info = labels[i];
    if (!info) continue;
    const page = doc.pages[i]!;
    page.pageNumberValue = info.value;
    page.pageLabel = info.label;
    page.pageNumberFormat = info.format;
  }
  // Continuation marks with a page number (#917): the page the rest goes
  // on on, or comes from, now that pages are numbered.
  fillPageMarks(doc.pages);
  const restarts = pageNumberSegments
    .filter((s, i) => i > 0 && s.startAt !== undefined && s.startPageIndex < doc.pages.length)
    .map((s) => s.startPageIndex);
  if (restarts.length > 0) doc.pageNumberRestarts = restarts;

  // Line numbers (#621): the lines of this pass counted where they landed,
  // before the running heads (whose palettes recolour them).
  buildLineNumbers(doc, contentBlocks, continuation);

  buildHeadersAndFooters(doc, resourceById, {
    // Where two palette entries share a base value, each kind of flow
    // colour follows its own settings under a part or section palette.
    // (The default resource types set no caption style of their own.)
    flowColorValues: (overrides) => flowColorValues(config, overrides, config?.resourceTypes),
    // `{firstMark.<style>}` / `{lastMark.<style>}`: a paragraph of a
    // `:::paragraphs` container marks the page with its leading bold run.
    paragraphMark: (idx) => {
      const styleId = paragraphContainers.byBlock[idx]?.styleId;
      const block = contentBlocks[idx];
      if (styleId === undefined || block?.type !== 'paragraph') return undefined;
      const text = leadingBoldText(block.spans);
      return text.length > 0 ? { styleId, text } : undefined;
    },
  });
  // The line numbers of code listings (#624), in the same slot, after the
  // margin numbers' palette pass: they keep `codeStyle.lineNumberColor`.
  if (codeBoxes.wrapped) buildCodeLineNumbers(doc);

  // Vertical pages: the axis each font's upright characters turn about.
  if (doc.pages.some((p) => pageIsVertical(p) || p.composed?.frames.some((f) => f.writingMode === 'vertical-rl'))) stampCentralBaselines(doc);
  // Right-to-left pages: lines advance through the mirrored flow in the
  // reverse of their visual order.
  if (doc.pages.some((p) => pageIsMirrored(p))) orientLinesToFrames(doc);
  // Figure labels (#860): where each one is painted, for the source map.
  stampFigureLabelRects(doc);

  doc.converged = true;
  doc.iterationCount = 1;
  if (joiningLetterSpacing.size > 0) joiningSpacingWarnings.set(doc, joiningLetterSpacingWarnings(doc, joiningLetterSpacing));
  if (dropCapNotes.size > 0 || doc.blocks.some((b) => b.dropCap)) dropCapWarningsByDoc.set(doc, dropCapWarnings(doc, dropCapNotes));
  // Pictures scaled to the room of their slot (#626), at the block citing them.
  const shrunk = floatShrinkWarnings(doc, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  // Pictures whose column holds them under half their print size (#901).
  const belowPrint = pictureBelowPrintSizeWarnings(doc, givenResources, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  // Resources whose caption prints the label alone (#1151).
  const lonely = emptyCaptionWarnings(doc, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  if (shrunk.length > 0 || belowPrint.length > 0 || lonely.length > 0) floatShrinkWarningsByDoc.set(doc, [...shrunk, ...belowPrint, ...lonely]);
  if (textWrapNotes.length > 0 || columnsNotes.length > 0 || movedNotes.length > 0) textWrapWarningsByDoc.set(doc, [...textWrapNotes, ...columnsNotes, ...movedNotes]);
  // Composed pages (#855): frames whose content does not fit.
  if (composedNotes.length > 0) composedWarningsByDoc.set(doc, composedNotes);
  if (pendingJumps.length > 0) doc.pendingJumps = pendingJumps;
  if (carried) {
    stampCarriedSource(doc, carried, fenceEnd);
    carriedByDoc.set(doc, { carried, bodyOffset });
  }
  // The composition rules (#749): short lists cut, floats on opener pages.
  const ruleNotes = [...shortListWarnings(), ...openerFloatNotes, ...tocGroupWarnings(), ...headingClaimWarnings()];
  if (ruleNotes.length > 0) compositionWarningsByDoc.set(doc, ruleNotes);

  const { proposals: citingPageProposals, refused: citingPageRefused } = settleCitingPageFloats();
  return {
    citingPageProposals, citingPageRefused
  };
}
