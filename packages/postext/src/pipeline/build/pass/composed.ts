// Composed pages in the flow: frames filled from the blocks, story jumps and
// comic text panels.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type ContentWarning, type VDTPage, type VDTComposedPage, type VDTBlock, createVDTColumn, pageIsVertical, pageIsMirrored, type ReflowEvent, type VDTComicPage, type ResolvedConfig, type VDTDocument, type BoundingBox } from '../../../vdt.js';
import { type ComposedMemoContext, configKeyOf, layoutComposedPageMemo } from '../../../composed/pageMemo.js';
import { type PlannedComposedPage, carriedPass, frameStyleOf, layoutComposedPage } from '../../composedPages/composedLayout.js';
import { type ComposedContinuation, type ComposedContinuationInput, assignJumpReceivers, MAX_CONTINUATION_PAGES, continuationTarget, assignReceivers } from '../../../composed/continuation.js';
import type { StoryJump, CarriedNumber, CarriedNote, ImportedJumps } from '../../../composed/carry.js';
import { continueInPage, resolvePageTemplate, isModuleTemplate } from '../../../composed/templates.js';
import { hasAnchorRefs } from '../../references/crossRefs.js';
import type { ComposedPageFence, ContentBlock } from '../../../parse/index.js';
import { FRAME_STYLE_ID } from '../../../composed/wrap.js';
import { wrapGapPx } from '../../floats/textWrap.js';
import { resolvedLocale } from '../../config.js';
import { advanceToNextColumn, type PlacementCursor } from '../../blocks/placement.js';
import { layoutComposedSpread } from '../../../composed/spread.js';
import type { ComposedModuleUse, PageTemplate } from '../../../composed/types.js';
import { nextFrameOf } from '../../../composed/geometry.js';
import { moduleUsesOf } from '../../../composed/modules.js';
import { frameElementId } from '../../../composed/ids.js';
import { type ComicTextFramesInput, type ComicTextFramesLayout, layoutComicTextFrames, layoutStripTextFrames } from '../../../comics/textPanels.js';
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
  /** Stories of this chapter that jump into a page of a later one (#943). */
  const pendingJumps: StoryJump[] = [];
  /** The rest of the story `c` cut, as the chapter it goes to needs it
   *  (#943): its box and children as this chapter has them ready to lay,
   *  the cut, and the numbers the lookups by position would give. */
  const exportJump = (c: ComposedContinuation, page: string): StoryJump => {
    const startIdx = c.story.startIdx;
    const again = carried?.stories.get(startIdx);
    const all = composedPass.contentBlocks;
    const blocks = all.slice(startIdx, c.story.plan.endIdx + 1);
    const numbers: CarriedNumber[] = again ? [...(again.jump.numbers ?? [])] : [];
    if (!again) {
      for (let i = startIdx; i <= c.story.plan.endIdx; i++) {
        if (headingPrefixes[i] === undefined && headingNumbers[i] === undefined) continue;
        numbers.push({
          at: i - startIdx,
          ...(headingPrefixes[i] !== undefined ? { prefix: headingPrefixes[i]! } : {}),
          ...(headingNumbers[i] !== undefined ? { value: headingNumbers[i]! } : {}),
          ...(chapterNumberByBlock[i] ? { chapterNumber: chapterNumberByBlock[i]! } : {}),
        });
      }
    }
    const notes: CarriedNote[] = [];
    const seen = new Set<string>();
    for (const b of blocks) {
      for (const span of b.spans) {
        const id = span.footnote?.id;
        if (id === undefined || seen.has(id)) continue;
        seen.add(id);
        const number = footnoteNumbering.numbers.get(id);
        if (number === undefined) continue;
        const def = footnoteDefs.get(id);
        notes.push({ id, number, ...(def ? { def } : {}) });
      }
    }
    const rule = c.rule;
    const frame = continueInPage(rule)?.frame;
    return {
      ...(again ? { chapter: again.chapter } : {}),
      target: page,
      ...(frame !== undefined ? { targetFrame: frame } : {}),
      rule,
      frame: c.frame,
      fromFrameId: c.fromFrameId,
      head: c.head,
      template: c.template,
      collapsed: c.collapsed,
      slot: c.slot,
      pieces: c.pieces,
      headBlockId: c.headBlockId,
      ...(c.trailing ? { trailing: c.trailing } : {}),
      ...(c.fromMark !== undefined ? { fromMark: c.fromMark } : {}),
      cut: c.cut,
      blocks: blocks as StoryJump['blocks'],
      bodyOffset,
      ...(numbers.length > 0 ? { numbers } : {}),
      orderedLevelIndentsPx: again?.jump.orderedLevelIndentsPx ?? orderedLevelIndentsPx,
      ...(notes.length > 0 ? { footnotes: notes } : {}),
      ...(hasAnchorRefs(blocks, new Set((content.resources ?? []).map((r) => r.id))) ? { outline: true as const } : {}),
    };
  };
  for (const [id, list] of carried?.byTarget ?? []) {
    if (fenceById.has(id)) {
      jumps.set(id, [...(jumps.get(id) ?? []), ...list]);
      continue;
    }
    // The host named this chapter for a page it does not have.
    for (const c of list) {
      composedNotes.push({
        kind: 'continueTargetMissing',
        template: c.template,
        frame: c.frame,
        fenceIndex: -1,
        target: id,
        fromChapter: c.foreign?.chapter ?? -1,
        configPath: '',
      });
    }
  }
  /** Set the composed page `planned` on a fresh page (#855), or a spread
   *  template on the two facing pages from the next verso (#861). */
  const placeComposedPage = (planned: PlannedComposedPage, fence: ComposedPageFence): void => {
    state.pendingSpacing = 0;
    closeFlowSegment(planned.startIdx);
    leaveCurrentPage();
    cursor.columnIndex = 0;
    const frameless = calloutStyles.find((st) => st.id === FRAME_STYLE_ID)!;
    /** What every composed page or spread reads; `current` names the
     *  template laid, so a `useTemplate` proposal (#858) tries the book's
     *  other templates of the same kind (single pages for this side, or
     *  spreads). */
    const common = (page: VDTPage, current: { id: string; spread: boolean; parity?: 'recto' | 'verso' }) => ({
      pass: composedPass,
      fence,
      startIdx: planned.startIdx,
      endIdx: planned.endIdx,
      stories: planned.stories,
      styleOf: (frame: Parameters<typeof frameStyleOf>[1]) => frameStyleOf((frame.style ? resolved.calloutStyles.find((st) => st.id === frame.style) : undefined) ?? frameless, frame),
      dpi,
      emPx: bodyStyle.fontSizePx,
      bodyOffset,
      mirrored: mirroredOf(page),
      pushGapPx: wrapGapPx(resolved.layout.wrap?.gap, dpi, bodyStyle.fontSizePx, floatGapPx),
      locale: resolvedLocale(resolved),
      // The book's other templates, for a `useTemplate` proposal (#858).
      alternatives: () => [...new Set((resolved.pageTemplates ?? []).map((t) => t?.id))].flatMap((id) => {
        if (typeof id !== 'string' || id === current.id) return [];
        const alt = resolvePageTemplate(templateSource, id, current.spread ? { spread: true } : { parity: current.parity });
        // (A module, #1062, is never a page.)
        return alt && alt.spread === current.spread && !isModuleTemplate(alt) ? [alt] : [];
      }),
    });
    const placed: { page: VDTPage; composed: VDTComposedPage; blocks: VDTBlock[] }[] = [];
    let laid: Set<string>;
    /** Lay a spread template over the next verso and the recto after it
     *  (`breakToEvenPage` opens the verso, a parity blank before it when
     *  needed, as a comic spread does). */
    const laySpread = (sheet: NonNullable<ReturnType<typeof resolvePageTemplate>>, extra: { stories?: PlannedComposedPage['stories']; continuing?: ComposedContinuationInput }) => {
      breakToEvenPage();
      const verso = doc.pages[cursor.pageIndex]!;
      toLeaf(verso);
      verso.columns = [createVDTColumn(0, verso.contentArea)];
      const start = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
      } while (cursor.pageIndex === start);
      const recto = doc.pages[cursor.pageIndex]!;
      toLeaf(recto);
      recto.columns = [createVDTColumn(0, recto.contentArea)];
      cursor.columnIndex = 0;
      // The sheet is laid in the pages' flow: the left page first, or the
      // right one where the flow is mirrored (right to left) or turned (a
      // vertical page, #926: the flow's y runs from the sheet's right edge
      // to its left, and the right page comes first along it).
      const versoIsLeft = resolved.page.binding !== 'right';
      const vertical = pageIsVertical(verso);
      const flowMirrored = pageIsMirrored(verso) || vertical;
      const left = versoIsLeft ? verso : recto;
      const right = versoIsLeft ? recto : verso;
      const frames = designFramesOn(verso);
      const out = layoutComposedSpread({
        ...common(flowMirrored ? right : left, { id: sheet.id, spread: true }),
        ...extra,
        template: sheet,
        first: flowMirrored ? right : left,
        second: flowMirrored ? left : right,
        firstSide: flowMirrored ? 'right' : 'left',
        trim: frames.page,
        bleed: frames.bleed,
        ...(vertical ? { axis: 'y' as const } : {}),
      });
      return { sides: out.sides as readonly { page: VDTPage; composed: VDTComposedPage; blocks: VDTBlock[] }[], warnings: out.warnings, laid: out.laid, continuations: out.continuations };
    };
    /** The template `id` for the current page's side, and the boxes its
     *  `area` reads. */
    const singleOn = (page: VDTPage, id: string, modules: readonly ComposedModuleUse[] | undefined) => {
      toLeaf(page);
      page.columns = [createVDTColumn(0, page.contentArea)];
      // The physical side: a recto has an odd folio (in either binding).
      const parity: 'recto' | 'verso' = (page.index + pageIndexOffset) % 2 === 0 ? 'recto' : 'verso';
      // With the modules the page lays (#1062) in its modules group.
      const template = resolvePageTemplate(templateSource, id, { parity, ...(modules && modules.length > 0 ? { modules } : {}) })!;
      const frames = designFramesOn(page);
      const area = template.area === 'trim' ? frames.page : template.area === 'bleed' ? frames.bleed : page.contentArea;
      return { parity, template, areas: { area, page: frames.page, bleed: frames.bleed } };
    };
    let continuations: ComposedContinuation[] | undefined;
    // Stories that jump to this page (#917): they go on in the frames its
    // own content leaves empty; those that find none go on after it.
    const incoming = fence.attrs.id !== undefined ? jumps.get(fence.attrs.id) ?? [] : [];
    if (fence.attrs.id !== undefined) jumps.delete(fence.attrs.id);
    let jumpReceivers = new Map<string, ComposedContinuation>();
    let jumpLeft: ComposedContinuation[] = [];
    const receive = (template: NonNullable<ReturnType<typeof resolvePageTemplate>>) => {
      if (incoming.length === 0) return {};
      const names = new Set(template.frames.map((f) => f.name));
      const prev = new Map<string, string>();
      for (const f of template.frames) {
        const n = nextFrameOf(f);
        if (n && names.has(n) && !prev.has(n)) prev.set(n, f.name);
      }
      const headOf = (n: string): string => {
        const seen = new Set([n]);
        let at = n;
        for (let q = prev.get(at); q !== undefined && !seen.has(q); q = prev.get(at)) { seen.add(q); at = q; }
        return at;
      };
      const assigned = assignJumpReceivers(template, incoming, (n) => planned.stories.has(headOf(n)));
      jumpReceivers = assigned.receivers;
      jumpLeft = assigned.left;
      return {
        stories: new Map([...planned.stories, ...[...jumpReceivers].map(([n, c]) => [n, c.story] as const)]),
        continuing: { receivers: jumpReceivers, generation: 0, collapse: false, last: false, jump: true as const },
      };
    };
    /** The page's modules (#1062), as the fence writes them. */
    const fenceModules = moduleUsesOf(fence.modules);
    const sheet = resolvePageTemplate(templateSource, fence.template, { spread: true, ...(fenceModules ? { modules: fenceModules } : {}) });
    if (sheet?.spread) {
      const out = laySpread(sheet, receive(sheet));
      placed.push(...out.sides);
      composedNotes.push(...out.warnings);
      laid = out.laid;
      continuations = out.continuations;
    } else {
      const page = doc.pages[cursor.pageIndex]!;
      const { parity, template, areas } = singleOn(page, fence.template, fenceModules);
      const extra = receive(template);
      // Kept by what it reads (#857): a page met again is not set again.
      // A spread is laid out afresh each time (its two sides are one sheet),
      // and so is a page a story jumps to.
      const args = { ...common(page, { id: template.id, spread: false, parity }), page, template, areas };
      const out = extra.continuing ? layoutComposedPage({ ...args, ...extra }) : layoutComposedPageMemo(args, composedMemo);
      placed.push({ page, composed: out.composed, blocks: out.blocks });
      composedNotes.push(...out.warnings);
      laid = out.laid;
      continuations = out.continuations;
    }
    // A jumping story that found no free frame here goes on after it.
    if (jumpLeft.length > 0) continuations = [...(continuations ?? []), ...jumpLeft.map((c) => ({ ...c, rule: 'next-page', template: placed[0]!.composed.template, collapsed: false }))];
    const commit = (list: readonly { page: VDTPage; composed: VDTComposedPage; blocks: VDTBlock[] }[]): void => {
      for (const { page, composed, blocks } of list) {
        page.composed = composed;
        fenceEnd.set(composed, planned.endIdx);
        const floats = (page.floats ??= []);
        for (const b of blocks) {
          floats.push(b);
          doc.blocks.push(b);
        }
      }
    };
    commit(placed);
    // Content that goes on on pages added after this one (#859): one page
    // (or spread) per template it goes on to, generation after generation,
    // each laid afresh after the pages before it. The added pages are
    // ordinary pages (numbered, with running heads, sides kept).
    const indexFrames = (list: readonly { page: VDTPage; composed: VDTComposedPage }[]): void => {
      for (const s of list) for (const f of s.composed.frames) if (!f.facingBlocks) frameAt.set(f.id, { page: s.page, frame: f });
    };
    indexFrames(placed);
    /** The sending frame of `c` points to the frame `to` that took it, and
     *  its page's log says where it went. */
    const logContinued = (src: { page: VDTPage }, c: ComposedContinuation, event: Omit<ReflowEvent, 'frame' | 'kind'>): void => {
      const log = src.page.composed!.log;
      let at = log.length;
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i]!.frame === c.frame) { at = i + 1; break; }
      }
      log.splice(at, 0, { frame: c.frame, kind: 'continued', ...event });
    };
    const link = (c: ComposedContinuation, to: string): void => {
      // The sending frame is on a page of another chapter: the host links
      // the two (`resolveJumpMarks`).
      if (c.foreign) return;
      const src = frameAt.get(c.fromFrameId);
      const dst = frameAt.get(to);
      if (!src || !dst) return;
      // An item of a grid that went on whole (#1061) left nothing on its
      // page to point on from: the page's log says where it went.
      if (!c.whole) src.frame.continuesTo = to;
      logContinued(src, c, { toPage: dst.page.index, toFrame: to });
    };
    for (const [name, c] of jumpReceivers) link(c, frameElementId(fence.fenceIndex, name));
    /** Stories that jump to a later page fence (#917) wait for it; one
     *  whose fence is not after this page goes on on the next page, and
     *  says so. */
    const route = (list: readonly ComposedContinuation[]): ComposedContinuation[] => {
      const out: ComposedContinuation[] = [];
      for (const c of list) {
        const target = continueInPage(c.rule);
        if (!target) { out.push(c); continue; }
        const to = fenceById.get(target.page);
        if (to && to.startIdx > planned.endIdx) {
          const waiting = jumps.get(target.page) ?? [];
          waiting.push(c);
          jumps.set(target.page, waiting);
          continue;
        }
        const from = frameAt.get(c.fromFrameId);
        // A page of a later chapter (#943): the host hands the rest over.
        const later = !to && content.laterPageIds && Object.prototype.hasOwnProperty.call(content.laterPageIds, target.page) ? content.laterPageIds[target.page] : undefined;
        if (later !== undefined) {
          pendingJumps.push(exportJump(c, target.page));
          if (from) {
            from.frame.continuesToChapter = later;
            logContinued(from, c, { toChapter: later });
          }
          continue;
        }
        composedNotes.push({
          kind: 'continueTargetMissing',
          template: c.template,
          frame: c.frame,
          fenceIndex: fence.fenceIndex,
          target: target.page,
          configPath: resolvePageTemplate(templateSource, c.template, c.module ? { modules: [c.module] } : {})?.frames.find((f) => f.name === c.frame)?.configPath ?? '',
          ...(to ? { before: true } : {}),
          ...(from?.frame.sourceStart !== undefined ? { sourceStart: from.frame.sourceStart, sourceEnd: from.frame.sourceEnd } : {}),
          ...(from ? { pageIndex: from.page.index } : {}),
        });
        out.push({ ...c, rule: 'next-page' });
      }
      return out;
    };
    const overflowTemplateOf = (id: string): string | undefined => resolvePageTemplate(templateSource, id)?.overflowTemplate;
    const firstPage = placed[0]?.page.index ?? cursor.pageIndex;
    let pending = route(continuations ?? []);
    for (let generation = 1; pending.length > 0; generation++) {
      const last = generation >= MAX_CONTINUATION_PAGES;
      let queue = pending;
      pending = [];
      while (queue.length > 0) {
        const target = continuationTarget(queue[0]!, overflowTemplateOf);
        const same = (c: ComposedContinuation): boolean => {
          const t = continuationTarget(c, overflowTemplateOf);
          return t.template === target.template && t.collapse === target.collapse;
        };
        const batch = queue.filter(same);
        queue = queue.filter((c) => !same(c));
        // The modules whose frames go on here, whole (#1062).
        const batchModules = moduleUsesOf(batch.flatMap((c) => (c.module ? [c.module] : [])));
        const spreadSheetT = resolvePageTemplate(templateSource, target.template, { spread: true, ...(batchModules ? { modules: batchModules } : {}) });
        // A template with no frames takes nothing.
        if (!spreadSheetT || spreadSheetT.frames.length === 0) continue;
        // A fresh page after the last one laid.
        const start = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
        } while (cursor.pageIndex === start);
        cursor.columnIndex = 0;
        const storiesOf = (receivers: ReadonlyMap<string, ComposedContinuation>) => new Map([...receivers].map(([name, c]) => [name, c.story]));
        let sides: readonly { page: VDTPage; composed: VDTComposedPage; blocks: VDTBlock[] }[];
        let notes: ContentWarning[];
        let more: ComposedContinuation[] | undefined;
        let receivers: Map<string, ComposedContinuation>;
        let laidTemplate: NonNullable<ReturnType<typeof resolvePageTemplate>>;
        if (spreadSheetT.spread) {
          const assigned = assignReceivers(spreadSheetT, batch);
          receivers = assigned.receivers;
          queue = [...assigned.left, ...queue];
          laidTemplate = spreadSheetT;
          const out = laySpread(spreadSheetT, { stories: storiesOf(receivers), continuing: { receivers, generation, collapse: target.collapse, last } });
          sides = out.sides;
          notes = out.warnings;
          more = out.continuations;
        } else {
          const page = doc.pages[cursor.pageIndex]!;
          const { parity, template, areas } = singleOn(page, target.template, batchModules);
          const assigned = assignReceivers(template, batch);
          receivers = assigned.receivers;
          queue = [...assigned.left, ...queue];
          laidTemplate = template;
          const out = layoutComposedPage({
            ...common(page, { id: template.id, spread: false, parity }),
            page,
            template,
            areas,
            stories: storiesOf(receivers),
            continuing: { receivers, generation, collapse: target.collapse, last },
          });
          sides = [{ page, composed: out.composed, blocks: out.blocks }];
          notes = out.warnings;
          more = out.continuations;
        }
        for (const s of sides) s.composed.continuationOf = firstPage;
        // On the last page allowed, a frame whose content would still go on
        // says so (it is cut at its foot).
        if (last) {
          const chained = new Set<string>();
          const nextOf = (n: string): string | undefined => {
            const f = laidTemplate.frames.find((x) => x.name === n);
            return f ? nextFrameOf(f) : undefined;
          };
          for (const name of receivers.keys()) {
            for (let n: string | undefined = name; n !== undefined && !chained.has(n); n = nextOf(n)) chained.add(n);
          }
          notes = notes.map((w) => (w.kind === 'frameOverflow' && chained.has(w.frame)
            ? { kind: 'frameContinuationLimit' as const, template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, pages: generation, overflowMm: w.overflowMm, configPath: w.configPath, ...(w.sourceStart !== undefined ? { sourceStart: w.sourceStart, sourceEnd: w.sourceEnd } : {}), ...(w.pageIndex !== undefined ? { pageIndex: w.pageIndex } : {}) }
            : w));
        }
        commit(sides);
        indexFrames(sides);
        composedNotes.push(...notes);
        // Each frame that sent content on points to the frame that took it,
        // and its page's log says where it went.
        for (const c of receivers.values()) link(c, frameElementId(fence.fenceIndex, c.slot, generation));
        if (more) pending.push(...route(more));
      }
    }
    for (const [head, story] of planned.stories) {
      if (!laid.has(head)) continue;
      for (let i = story.startIdx; i <= story.plan.endIdx; i++) composedLaid.add(i);
    }
    state.pendingComposedBreak = 'page';
    flushPendingNumberingAtBoundary();
  };

  /**
   * The text panels of a comic page (#885): each story set in its panel's
   * frame (`layoutComicTextFrames`), its blocks floats of the page; the
   * stories laid are done for the main loop.
   */
  const comicTextBase = (page: VDTPage, plan: PlannedComposedPage): Omit<ComicTextFramesInput, 'comic'> => {
    const frameless = calloutStyles.find((st) => st.id === FRAME_STYLE_ID)!;
    return {
      pass: framePass,
      resolved,
      page,
      plan,
      styleOf: (frame) => frameStyleOf((frame.style ? resolved.calloutStyles.find((st) => st.id === frame.style) : undefined) ?? frameless, frame),
      dpi,
      emPx: bodyStyle.fontSizePx,
      bodyOffset,
      mirrored: mirroredOf(page),
      pushGapPx: wrapGapPx(resolved.layout.wrap?.gap, dpi, bodyStyle.fontSizePx, floatGapPx),
      locale: resolvedLocale(resolved),
    };
  };
  /** The blocks a comic's text frames set, floats of the page. */
  const addComicTextBlocks = (page: VDTPage, blocks: readonly VDTBlock[]): void => {
    const floats = (page.floats ??= []);
    for (const b of blocks) {
      floats.push(b);
      doc.blocks.push(b);
    }
  };
  /** The stories of a plan are done for the main loop. */
  const markComicStoriesLaid = (plan: PlannedComposedPage, laid?: ReadonlySet<string>): void => {
    for (const [key, story] of plan.stories) {
      if (laid && !laid.has(key)) continue;
      for (let i = story.startIdx; i <= story.plan.endIdx; i++) composedLaid.add(i);
    }
  };
  // The text panels of a strip are laid where the strip ends up
  // (`placeStripTexts`): the blocks that follow it are done from the start.
  for (const [idx, plan] of comicTextPlans) if (contentBlocks[idx]?.directiveName === 'strip') markComicStoriesLaid(plan);
  const placeComicText = (page: VDTPage, comic: VDTComicPage, plan: PlannedComposedPage, extra?: Pick<ComicTextFramesInput, 'only' | 'avoid'>): ComicTextFramesLayout => {
    const out = layoutComicTextFrames({ ...extra, ...comicTextBase(page, plan), comic });
    addComicTextBlocks(page, out.blocks);
    markComicStoriesLaid(plan, out.laid);
    return out;
  };
  /**
   * The text panels of the strips on the pages (#959), laid where the strips
   * stand once the pass has placed everything (a strip moves with its
   * column, its band and the pages' final adjustments): each strip's comic
   * moved onto the sheet, its stories set in the page's flow frame, the
   * result written back on the strip.
   */
  const placeStripTexts = (): void => {
    if (comicTextPlans.size === 0) return;
    for (const page of doc.pages) {
      const strips = new Set<VDTBlock>();
      for (const col of page.columns) for (const b of col.blocks) if (b.comic && !b.hidden) strips.add(b);
      for (const b of page.floats ?? []) if (b.comic && !b.hidden) strips.add(b);
      for (const block of strips) {
        const plan = block.contentIndex !== undefined && block.contentIndex >= 0 ? comicTextPlans.get(block.contentIndex) : undefined;
        if (!plan) continue;
        const out = layoutStripTextFrames({ ...comicTextBase(page, plan), block });
        addComicTextBlocks(page, out.blocks);
      }
    }
  };

  /** The first block of the document that sets something: a heading there
   *  opens the document's first page (`openerPages`, #749). */
  const firstFlowBlockIdx = contentBlocks.findIndex((b) => !isMarkerBlock(b) && b.type !== 'directive');
  return {
    composedLaid, composedNotes, fenceEnd, pendingJumps, placeComposedPage, placeComicText,
    placeStripTexts, firstFlowBlockIdx
  };
}
