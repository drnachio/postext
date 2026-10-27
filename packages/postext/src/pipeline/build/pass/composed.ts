// Composed pages in the flow: frames filled from the blocks, story jumps and
// comic text panels.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type ContentWarning, type VDTPage, type VDTComposedPage, type ResolvedConfig, type VDTDocument, type BoundingBox } from '../../../vdt.js';
import { type ComposedMemoContext, configKeyOf } from '../../../composed/pageMemo.js';
import { type PlannedComposedPage, carriedPass } from '../../composedPages/composedLayout.js';
import { type ComposedContinuation } from '../../../composed/continuation.js';
import type { ImportedJumps } from '../../../composed/carry.js';
import type { ContentBlock } from '../../../parse/index.js';
import { type PlacementCursor } from '../../blocks/placement.js';
import type { PageTemplate } from '../../../composed/types.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import type { PostextContent, ResolvedCalloutStyleConfig, Resource, ResourceType } from '../../../types.js';
import type { CaptionCitations } from '../../references/citations.js';
import type { FootnoteNumbering } from '../../references/footnotes.js';
import type { BlockStyle } from '../../styles.js';
import type { ParagraphContainerPlan } from '../../callouts/paragraphContainers.js';
import type { PartPlan } from '../../sections/parts.js';
import type { HeadingSectionPlan } from '../../sections/headingStyles.js';
import type { DropCapNote } from '../../blocks/measureContentBlock.js';
import type { FrameLayoutPass } from '../../callouts/frameLayout.js';
import type { PassState } from './state.js';
import { createJumps } from './composed/jumps.js';
import { createPlacePage } from './composed/placePage.js';
import { createComicText } from './composed/comicText.js';

/** What createComposed takes from the pass. */
export interface ComposedDeps {
  content: PostextContent;
  resolved: ResolvedConfig;
  dpi: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  pageWidthPx: number;
  pageHeightPx: number;
  designFramesOn: (page: VDTPage | undefined) => { page: BoundingBox; bleed: BoundingBox; upright?: boolean; };
  toLeaf: (page: VDTPage) => void;
  markdownBody: string;
  bodyOffset: number;
  captionCitations: Map<string, CaptionCitations> | undefined;
  footnoteDefs: Map<string, ContentBlock>;
  footnoteNumbering: FootnoteNumbering;
  templateSource: { pageTemplates: PageTemplate[] | undefined; calloutStyles: ResolvedCalloutStyleConfig[]; };
  contentBlocks: ContentBlock[];
  carried: ImportedJumps | undefined;
  headingPrefixes: (string | undefined)[];
  headingNumbers: (number | undefined)[];
  chapterNumberByBlock: string[];
  resourceById: Map<string, Resource>;
  resourceTypeById: Map<string, ResourceType>;
  resourceNumberById: Map<string, string>;
  bodyStyle: BlockStyle;
  calloutStyles: ResolvedCalloutStyleConfig[];
  calloutResolved: ResolvedConfig;
  orderedLevelIndentsPx: number[];
  paragraphContainers: ParagraphContainerPlan;
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  composedPlans: Map<number, PlannedComposedPage>;
  comicTextPlans: Map<number, PlannedComposedPage>;
  floatedIds: Set<string>;
  floatGapPx: number;
  calloutsOutOfFlow: Set<number>;
  joiningLetterSpacing: Set<number>;
  dropCapNotes: Map<number, DropCapNote>;
  cursor: PlacementCursor;
  closeFlowSegment: (boundaryIndex: number) => void;
  leaveCurrentPage: () => void;
  flushPendingNumberingAtBoundary: () => void;
  framePass: FrameLayoutPass;
  mirroredOf: (page: VDTPage) => boolean;
  breakToEvenPage: () => void;
  state: PassState;
}

export function createComposed(deps: ComposedDeps) {
  const {
    content, resolved, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx, designFramesOn, toLeaf,
    markdownBody, bodyOffset, captionCitations, footnoteDefs, footnoteNumbering, templateSource,
    contentBlocks, carried, headingPrefixes, headingNumbers, chapterNumberByBlock, resourceById,
    resourceTypeById, resourceNumberById, bodyStyle, calloutStyles, calloutResolved,
    orderedLevelIndentsPx, paragraphContainers, partPlan, sectionPlan, composedPlans, comicTextPlans,
    floatedIds, floatGapPx, calloutsOutOfFlow, joiningLetterSpacing, dropCapNotes, cursor,
    closeFlowSegment, leaveCurrentPage, flushPendingNumberingAtBoundary, framePass, mirroredOf,
    breakToEvenPage, state
  } = deps;
  /** Content indices a composed page set in its frames: the main loop
   *  passes over them. */
  const composedLaid = new Set<number>();
  /** The composed pages' layout warnings (`frameOverflow`). */
  const composedNotes: ContentWarning[] = [];
  /** What the composed pages' memo (#857) reads of this pass: the
   *  numbers, part, section and pictures the blocks of a page are set
   *  with, and the notes a page's layout leaves. */
  const composedMemo: ComposedMemoContext = {
    markdown: markdownBody,
    bodyOffset,
    configKey: () => configKeyOf(calloutResolved),
    contextKey: (from, to) => {
      const ids = new Set<string>();
      for (let i = from; i <= to; i++) {
        const b = contentBlocks[i]!;
        if (b.resourceId) ids.add(b.resourceId);
      }
      const pictures = [...ids].sort().map((id) => {
        const r = resourceById.get(id);
        return [id, r ?? null, r ? resourceTypeById.get(r.typeId) ?? null : null, resourceNumberById.get(id) ?? null, floatedIds.has(id), captionCitations?.get(id) ?? null];
      });
      const parts: unknown[] = [];
      const sections: unknown[] = [];
      const out: number[] = [];
      for (let i = from; i <= to; i++) {
        const part = partPlan.byBlock[i];
        parts.push(part ? [part.number, part.title, part.palette] : 0);
        sections.push(sectionPlan.byBlock[i]?.id ?? 0);
        if (calloutsOutOfFlow.has(i)) out.push(i - from);
      }
      return JSON.stringify([
        headingPrefixes.slice(from, to + 1),
        headingNumbers.slice(from, to + 1),
        parts,
        sections,
        out,
        paragraphContainers.byBlock.slice(from, to + 1).map((c) => (c ? c.style : 0)),
        pictures,
      ]);
    },
    sideEffectsIn: (from, to) => {
      for (let i = from; i <= to; i++) if (dropCapNotes.has(i) || joiningLetterSpacing.has(i)) return true;
      return false;
    },
  };
  /** Every frame of the composed pages laid so far, by id: a story that
   *  jumps to a later page (#917) links its pieces across pages. */
  const frameAt = new Map<string, { page: VDTPage; frame: VDTComposedPage['frames'][number] }>();
  /** The planned composed pages by their fence's `id` (#917): where a
   *  `'page:<id>'` continuation lands. */
  const fenceById = new Map<string, PlannedComposedPage>();
  for (const pl of composedPlans.values()) {
    const id = contentBlocks[pl.startIdx]?.composedPage?.attrs.id;
    if (id !== undefined && id !== '' && !fenceById.has(id)) fenceById.set(id, pl);
  }
  /** Stories waiting for the later page fence they jump to, by its id. */
  const jumps = new Map<string, ComposedContinuation[]>();
  /** The closing marker of the fence each composed page was set from. */
  const fenceEnd = new Map<VDTComposedPage, number>();
  /** The carried stories are laid through a pass that answers for them;
   *  they wait for their fence with the others. */
  const composedPass = carried ? carriedPass(framePass, carried) : framePass;

  const {
    pendingJumps, exportJump
  } = createJumps({
    content, bodyOffset, footnoteDefs, footnoteNumbering, carried, headingPrefixes, headingNumbers,
    chapterNumberByBlock, orderedLevelIndentsPx, composedNotes, fenceById, jumps, composedPass
  });

  const {
    placeComposedPage
  } = createPlacePage({
    content, resolved, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx, designFramesOn, toLeaf,
    bodyOffset, templateSource, bodyStyle, calloutStyles, floatGapPx, cursor, closeFlowSegment,
    leaveCurrentPage, flushPendingNumberingAtBoundary, mirroredOf, breakToEvenPage, state,
    composedLaid, composedNotes, composedMemo, frameAt, fenceById, jumps, fenceEnd, composedPass,
    pendingJumps, exportJump
  });

  const {
    placeComicText, placeStripTexts
  } = createComicText({
    resolved, dpi, doc, bodyOffset, contentBlocks, bodyStyle, calloutStyles, comicTextPlans,
    floatGapPx, framePass, mirroredOf, composedLaid
  });

  /** The first block of the document that sets something: a heading there
   *  opens the document's first page (`openerPages`, #749). */
  const firstFlowBlockIdx = contentBlocks.findIndex((b) => !isMarkerBlock(b) && b.type !== 'directive');
  return {
    composedLaid, composedNotes, fenceEnd, pendingJumps, placeComposedPage, placeComicText,
    placeStripTexts, firstFlowBlockIdx
  };
}
