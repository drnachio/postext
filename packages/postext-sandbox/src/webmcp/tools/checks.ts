// What the Checks panel has to say — of any chapter, or of the whole
// book. The panel lists the chapter on screen and reads the pages of the
// viewer on screen; here each chapter asked for is laid out for the tool
// itself, so the checks do not depend on what the reader is looking at.

import { describeFrameCoverProposal, describeFrameOutsideProposal, describeFrameOverflowProposal, resolvePdfGenerationConfig, resolvePrintConfig } from 'postext';
import type { FrameCoverProposal, FrameOutsideProposal, FrameOverflowProposal, PostextConfig, Resource } from 'postext';
import { composeBookMemo } from '../../book/compose.js';
import { planContent } from '../../book/jumps.js';
import { pdfFontChecksFor } from '../../controls/fonts/pdfFontWarnings.js';
import { svgFontIssues, unavailableResourceImages } from '../../controls/media/resourceImages.js';
import { onPreflightInputsChange, preflightInputs, type PreflightInputs } from '../../print/preflightInputs.js';
import { detailFor, titleFor } from '../../sidebar/WarningsPanel.js';
import { hasIndexedDB } from '../../storage/blobStore.js';
import { WARNING_CATEGORY_ORDER, isAcceptedWarning, warningCategory } from '../../warnings/categories.js';
import { computeComposedWarnings, computeWarnings } from '../../warnings/compute.js';
import { FRAME_FIX_KINDS, fixesOfPayload, isFrameFixPayload, planIsAdvice, planProposal, proposalContextOf, valueInWords, type FrameFixPayload } from '../../warnings/proposalActions.js';
import type { FrameProposal } from '../../warnings/frameOverlapText.js';
import type { Warning } from '../../warnings/types.js';
import { applyViewerEdit } from '../../editor/viewerEdits.js';
import { chapterText, stateReaches } from '../chapterEdits.js';
import { chapterOf, dispatchAndWait, layOutChapter, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { preparePainting } from '../pageImage.js';
import { screenPosition } from './view.js';

/** How long the checks wait for the print profile of a book set up for
 *  print, in milliseconds. */
const PROFILE_WAIT_MS = 6000;

/** What the preflight and the contrast on paper read beyond the pages:
 *  the separation of the output profile, loaded on first use. A book set
 *  up for print waits for it; `pending` says it did not come in time. */
async function preflightFor(config: PostextConfig, resources: readonly Resource[], signal?: AbortSignal): Promise<{ inputs: PreflightInputs; pending: boolean }> {
  const print = resolvePrintConfig(config.print);
  const pdf = resolvePdfGenerationConfig(config.pdfGeneration);
  const forPrint = print.standard !== 'none' || (pdf.forceColorSpace && pdf.colorSpace === 'cmyk') || config.page?.cutLines?.enabled === true;
  let inputs = preflightInputs(config.print, resources);
  if (!forPrint || !print.preflight.enabled || inputs.transform) return { inputs, pending: false };
  const deadline = Date.now() + PROFILE_WAIT_MS;
  while (!inputs.transform && Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise<void>((resolve) => {
      const off = onPreflightInputsChange(() => { off(); clearTimeout(timer); resolve(); });
      const timer = setTimeout(() => { off(); resolve(); }, 250);
    });
    inputs = preflightInputs(config.print, resources);
  }
  return { inputs, pending: !inputs.transform };
}

export function checkTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const getWarnings: WebMcpTool = {
    name: 'sandbox_get_warnings',
    title: 'Sandbox: what the checks found',
    description: "What the Sandbox's checks find in a chapter, or in the whole book, worded as the Checks panel words it: missing fonts and pictures, markup the engine could not read, design elements that do not fit, text too faint against its ground, typesetting faults (loose lines, widows, overflowing boxes) and print preflight. The chapter is laid out for the check itself, so the answer is the same whatever viewer and chapter are on screen, and it follows the last change. Each warning comes with its category, the chapter and the line of the source it points at (and the offsets, for sandbox_select_text), the page where it has one and, where it names one, the setting or the resource. scope \"book\" checks every chapter, which lays each of them out: on a long book that takes a while.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: { type: ['integer', 'string'], description: 'The chapter to check: its position in the book (from 1), its title or its id. The chapter the reader is at when left out.' },
        scope: { type: 'string', enum: ['chapter', 'book'], description: 'book checks every chapter (default chapter).' },
        category: { type: 'string', enum: WARNING_CATEGORY_ORDER, description: 'Only this category.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Most warnings to list (default 100).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const first = store.getSnapshot();
      const whole = args.scope === 'book';
      const targets = whole
        ? first.chapters.map((chapter, index) => ({ chapter, index }))
        : [chapterOf(first, args.chapter ?? screenPosition(host).chapterIndex + 1)];
      // The faces and pictures the checks ask about, read as a viewer
      // would read them: a picture that cannot be decoded is only known
      // once something tried.
      await preparePainting(first.config, targets.map((t) => t.chapter.markdown), first.resources).catch(() => undefined);
      const { inputs: preflight, pending } = await preflightFor(first.config, first.resources, signal);

      const all: { warning: Warning; chapter: number | null }[] = [];
      const seen = new Set<string>();
      const perChapter: { chapter: number; title: string; warnings: number }[] = [];
      let laidOut = true;
      for (const target of targets) {
        const { doc, state, plan, settled } = await layOutChapter(host, target.chapter.id, signal);
        const chapterPlan = plan.byId[target.chapter.id];
        laidOut &&= settled;
        const book = composeBookMemo(state.chapters, target.chapter.id);
        const fontChecks = pdfFontChecksFor(state);
        const found = computeWarnings({
          markdown: book.markdown,
          config: state.config,
          doc,
          resources: state.resources,
          storageUnavailable: !hasIndexedDB(),
          unavailableImages: unavailableResourceImages(),
          svgFontIssues: svgFontIssues(),
          book,
          ...(chapterPlan ? { bookContent: planContent(chapterPlan) } : {}),
          chapterTitles: new Map(state.chapters.map((c) => [c.id, c.title])),
          pdfFontChecks: fontChecks.checks,
          pdfFontChecksStale: fontChecks.stale,
          preflight,
        });
        let own = 0;
        for (const warning of found) {
          // A warning that points at no place in the text or on a page
          // is the book's: listed once however many chapters raise it.
          const placed = warning.sourceStart !== undefined || typeof (warning.payload as { page?: unknown }).page === 'number';
          const key = placed ? `${target.index}:${warning.id}` : warning.id;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push({ warning, chapter: placed ? (warning.chapterIndex ?? target.index) + 1 : null });
          if (placed) own++;
        }
        perChapter.push({ chapter: target.index + 1, title: target.chapter.title, warnings: own });
      }

      const counts: Record<string, number> = {};
      // Contrast pairs `contrast.allow` accepts (#1124) are listed, marked
      // accepted, and left out of the counts.
      const acceptedCount = all.filter(({ warning }) => isAcceptedWarning(warning)).length;
      for (const { warning } of all) {
        if (isAcceptedWarning(warning)) continue;
        const category = warningCategory(warning.payload.kind);
        counts[category] = (counts[category] ?? 0) + 1;
      }
      const limit = (args.limit as number | undefined) ?? 100;
      const wanted = all.filter(({ warning }) => args.category === undefined || warningCategory(warning.payload.kind) === args.category);
      const { labels, locale } = store.getSnapshot();
      return {
        laidOut,
        scope: whole ? 'book' : 'chapter',
        ...(whole ? { chapters: perChapter } : { chapter: targets[0]!.index + 1, title: targets[0]!.chapter.title }),
        total: all.length - acceptedCount,
        byCategory: counts,
        ...(acceptedCount > 0 ? { accepted: acceptedCount } : {}),
        ...(pending ? { note: 'The print profile had not loaded in time: the ink checks and the contrast on paper are not in this answer. Call again in a moment.' } : {}),
        warnings: wanted.slice(0, limit).map(({ warning: w, chapter }) => {
          const payload = w.payload as Record<string, unknown>;
          return {
            id: w.id,
            kind: w.payload.kind,
            category: warningCategory(w.payload.kind),
            title: titleFor(w.payload, labels),
            detail: detailFor(w.payload, labels, locale),
            ...(chapter !== null ? { chapter } : {}),
            ...(w.chapterLine ?? w.line ? { line: w.chapterLine ?? w.line } : {}),
            ...(w.chapterStart !== undefined ? { offset: w.chapterStart, toOffset: w.chapterEnd ?? w.chapterStart } : {}),
            ...(typeof payload.path === 'string' ? { setting: payload.path } : {}),
            ...(typeof payload.resourceId === 'string' ? { resource: payload.resourceId } : {}),
            ...(typeof payload.page === 'number' ? { page: payload.page } : {}),
            ...(w.payload.kind === 'contrast' && w.payload.check.accepted ? { accepted: w.payload.check.accepted } : {}),
            // A frame that does not fit: its fixes, numbered as
            // sandbox_apply_proposal takes them (#868).
            ...(w.payload.kind === 'frameOverflow' ? { frame: w.payload.frame, proposals: proposalList(w.payload) } : {}),
            // A frame under another, or past its edge (#1053, #1066): what
            // the check measured, and its fixes as sandbox_apply_proposal
            // takes them.
            ...(w.payload.kind === 'frameCovered' ? {
              frame: w.payload.frame,
              template: w.payload.template,
              coveredBy: w.payload.coveredBy,
              overlapMm2: w.payload.overlapMm2,
              ...(w.payload.text !== undefined ? { text: w.payload.text } : {}),
              ...(w.payload.picture !== undefined ? { picture: w.payload.picture } : {}),
              ...(w.payload.locale ? { locale: w.payload.locale } : {}),
              proposals: proposalList(w.payload),
            } : {}),
            ...(w.payload.kind === 'frameOutsideArea' ? {
              frame: w.payload.frame,
              template: w.payload.template,
              past: w.payload.past,
              ...(w.payload.target !== undefined ? { target: w.payload.target } : {}),
              excessMm: w.payload.excessMm,
              sides: w.payload.sides,
              ...(w.payload.locale ? { locale: w.payload.locale } : {}),
              proposals: proposalList(w.payload),
            } : {}),
            // A :::module block not laid, set as a page, nested or renamed (#1062).
            ...(w.payload.kind === 'moduleUnknown' || w.payload.kind === 'moduleNested' || w.payload.kind === 'moduleNameRejected' ? {
              template: w.payload.template,
              module: w.payload.module,
              ...(w.payload.kind === 'moduleUnknown' ? { name: w.payload.name, reason: w.payload.reason } : {}),
              ...(w.payload.kind === 'moduleNameRejected' ? { name: w.payload.name, used: w.payload.used, reason: w.payload.reason } : {}),
            } : {}),
            ...(w.payload.kind === 'moduleAsPage' ? { template: w.payload.template } : {}),
            // A repeating grid given more items than it holds (#1061).
            ...(w.payload.kind === 'repeatOverflow' ? {
              frame: w.payload.frame,
              template: w.payload.template,
              group: w.payload.group,
              item: w.payload.item,
              max: w.payload.max,
              ...(w.payload.flowFrame !== undefined ? { flowFrame: w.payload.flowFrame } : {}),
            } : {}),
            // A :::frame piece naming a look frameLooks lacks (#1089).
            ...(w.payload.kind === 'lookUnknown' ? {
              frame: w.payload.frame,
              template: w.payload.template,
              look: w.payload.look,
              ...(w.payload.suggestion !== undefined ? { suggestion: w.payload.suggestion } : {}),
            } : {}),
          };
        }),
        ...(wanted.length > limit ? { more: wanted.length - limit } : {}),
      };
    },
  };

  /** The checks of a chapter's frames that come with fixes (a frame that
   *  does not fit, one under another or past its edge), as the checks found
   *  them on a layout made for the tool. */
  const frameChecksOf = async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const { chapter, index } = chapterOf(store.getSnapshot(), args.chapter ?? screenPosition(host).chapterIndex + 1);
    const { doc, state } = await layOutChapter(host, chapter.id, signal);
    const book = composeBookMemo(state.chapters, chapter.id);
    const found = computeComposedWarnings({ markdown: book.markdown, config: state.config, doc, resources: state.resources, book })
      .filter((w): w is Warning & { payload: FrameFixPayload } => isFrameFixPayload(w.payload));
    return { chapter, index, found };
  };

  const applyProposal: WebMcpTool = {
    name: 'sandbox_apply_proposal',
    title: 'Sandbox: fix a frame by a proposed fix',
    description: "Fix a frame of a composed page with one of the fixes the layout proposes for it: the proposals of its frameOverflow, frameCovered or frameOutsideArea warning in sandbox_get_warnings, by their number there (from 1) or their kind. A frame that does not fit (frameOverflow): allowShrink lets its text shrink further (fit.minScale, and fit.shrinkText when it was off), raiseMax raises its maxHeight, lowerMin lowers the minHeight of another frame of its group, continueNextPage sets overflow.continueIn to next-page, and useTemplate sets the page with another template (the fence's template attribute in the chapter's text); shortenText changes nothing: it selects the frame's text in the Manuscript panel and answers how many characters to cut and where, for sandbox_write_text. A frame under another (frameCovered): layer paints the covering frame under it, exclude makes the covering frame push its text round it. A frame past its edge (frameOutsideArea): maxHeight holds it to the room it has, minHeight raises the frame it is anchored inside, continueNextPage lets the rest go on. move shifts the moved frame's placement.offset by the proposed millimetres (refused for a frame with no placement, or an offset in ems or percent). continueNextPage of a frame past its edge also sets the maxHeight it proposes. Both overlap checks end with allowOverlap: overlap 'allow' on the frame placed so on purpose (the covering frame of a frameCovered, the frame itself of a frameOutsideArea), which the checks then leave out. It is the one-click fix of the Checks panel and the Reflow panel, without the question they ask the reader: one step of the history that sandbox_undo takes back. A design change applies to every page set with the template. Answers what was changed and whether the check is gone, laid out again.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: { type: ['integer', 'string'], description: 'The chapter of the page: its position in the book (from 1), its title or its id. The chapter the reader is at when left out.' },
        frame: { type: 'string', description: "The frame the check is about, by its name in the template (the warning's frame)." },
        check: { type: 'string', enum: [...FRAME_FIX_KINDS], description: 'Which check of the frame to fix, when it has more than one (the warning\'s kind).' },
        coveredBy: { type: 'string', description: 'For frameCovered: the covering frame, when the frame lies under more than one.' },
        page: { type: 'integer', description: 'The page number as printed, when the check is on more than one page of the chapter.' },
        proposal: { type: ['integer', 'string'], description: 'The fix: its number in the warning\'s proposals (from 1) or its kind (allowShrink, raiseMax, lowerMin, continueNextPage, useTemplate, shortenText; layer, exclude, move; maxHeight, minHeight; allowOverlap).' },
      },
      required: ['frame', 'proposal'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const { chapter, index, found } = await frameChecksOf(args, signal);
      const frame = String(args.frame);
      const matches = (w: Warning & { payload: FrameFixPayload }): boolean => w.payload.frame === frame
        && (args.check === undefined || w.payload.kind === args.check)
        && (args.coveredBy === undefined || (w.payload.kind === 'frameCovered' && w.payload.coveredBy === args.coveredBy))
        && (args.page === undefined || w.payload.page === args.page);
      const mine = found.filter(matches);
      if (mine.length === 0) {
        const others = [...new Set(found.map((w) => `${w.payload.frame} (${w.payload.kind}, page ${w.payload.page})`))];
        throw new ToolError(others.length > 0
          ? `"${frame}" has no ${args.check !== undefined ? String(args.check) : 'such'} check${args.page !== undefined ? ` on page ${String(args.page)}` : ''} in chapter ${index + 1}. The frames with fixes: ${others.join(', ')}.`
          : `No frame of chapter ${index + 1} has a check to fix: every frame fits, and none lies under another or past its edge.`);
      }
      if (mine.length > 1) {
        const kinds = new Set(mine.map((w) => w.payload.kind));
        if (kinds.size > 1) throw new ToolError(`"${frame}" has several checks (${[...kinds].join(', ')}): say which with check.`);
        const covering = mine.map((w) => (w.payload.kind === 'frameCovered' ? w.payload.coveredBy : '')).filter(Boolean);
        if (covering.length > 1 && new Set(covering).size > 1) throw new ToolError(`"${frame}" lies under ${covering.join(', ')}: say which with coveredBy.`);
        throw new ToolError(`"${frame}" has this check on pages ${mine.map((w) => w.payload.page).join(', ')}: say which with page.`);
      }
      const warning = mine[0]!;
      const list = fixesOfPayload(warning.payload);
      const proposal = typeof args.proposal === 'number'
        ? list[args.proposal - 1]
        : list.find((p) => p.kind === args.proposal);
      if (!proposal) {
        throw new ToolError(`No such fix for "${frame}". Its fixes: ${list.map((p, i) => `${i + 1}. ${p.kind} (${proposalWords(p)})`).join('; ') || 'none'}.`);
      }
      const words = proposalWords(proposal);
      const plan = planProposal(warning, proposal, proposalContextOf(store.getSnapshot()));
      if (planIsAdvice(plan)) throw new ToolError(`This move cannot be made here (${words}): the frame has no placement offset in absolute units to shift. Change its placement with sandbox_set_config.`);
      if (plan.kind === 'stale') throw new ToolError('The book changed after the layout proposed this fix, so nothing was changed. Call sandbox_get_warnings again for the fixes as they are now.');
      if (plan.kind === 'select') {
        await dispatchAndWait(host, [
          { type: 'SET_PANEL', payload: 'markdown' },
          { type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: plan.chapterId, anchor: plan.from, head: plan.to, selectWord: false } },
        ]);
        return { changed: false, fix: { kind: proposal.kind, words }, chapter: index + 1, selected: { offset: plan.from, toOffset: plan.to }, cutCharacters: plan.chars };
      }
      if (plan.kind === 'config') {
        await dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: plan.patch, history: { merge: false } });
      } else {
        const before = chapterText(store.getSnapshot(), plan.chapterId);
        applyViewerEdit((a) => store.dispatch(a), plan.chapterId, plan.changes, plan.baseLength);
        const landed = await stateReaches(host, () => chapterText(store.getSnapshot(), plan.chapterId) !== before, 5000);
        if (!landed) throw new ToolError('The chapter changed while the fix was on its way, so nothing was changed. Call sandbox_get_warnings again.');
      }
      const after = await frameChecksOf({ chapter: chapter.id }, signal);
      const still = after.found.find((w) => w.payload.kind === warning.payload.kind && w.payload.frame === frame && w.payload.fenceIndex === warning.payload.fenceIndex
        && (w.payload.kind !== 'frameCovered' || (warning.payload.kind === 'frameCovered' && w.payload.coveredBy === warning.payload.coveredBy)));
      return {
        changed: true,
        check: warning.payload.kind,
        fix: { kind: proposal.kind, words },
        chapter: index + 1,
        ...(plan.kind === 'config'
          ? { settings: plan.leaves.map((l, i) => ({ pointer: l.pointer, setting: plan.settings[i], value: valueInWords(l.value) })) }
          : { text: { template: plan.template, from: warning.payload.template } }),
        fixed: !still,
        ...(warning.payload.kind === 'frameOverflow' ? { fits: !still } : {}),
        ...(still?.payload.kind === 'frameOverflow' ? { stillShortMm: still.payload.overflowMm } : {}),
        ...(still?.payload.kind === 'frameCovered' ? { stillCoveredMm2: still.payload.overlapMm2 } : {}),
        ...(still?.payload.kind === 'frameOutsideArea' ? { stillPastMm: still.payload.excessMm } : {}),
        ...(still ? { proposals: proposalList(still.payload) } : {}),
        undo: 'sandbox_undo takes it back.',
      };
    },
  };

  return [getWarnings, applyProposal];
}

/** A fix in the engine's words (English, as `postext check` says it). */
function proposalWords(p: FrameProposal): string {
  switch (p.kind) {
    case 'layer':
    case 'exclude':
      return describeFrameCoverProposal(p as FrameCoverProposal);
    case 'maxHeight':
    case 'minHeight':
    case 'move':
      return describeFrameOutsideProposal(p as FrameOutsideProposal);
    // The Sandbox's way out of an overlap check (#1081).
    case 'allowOverlap':
      return `set overlap: 'allow' on "${p.frame}"`;
    default:
      return describeFrameOverflowProposal(p as FrameOverflowProposal);
  }
}

/** A warning's fixes as the tools list them. */
function proposalList(payload: FrameFixPayload): { number: number; kind: string; words: string }[] {
  return fixesOfPayload(payload).map((p, i) => ({ number: i + 1, kind: p.kind, words: proposalWords(p) }));
}
