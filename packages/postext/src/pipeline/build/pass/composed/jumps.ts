// Stories that jump across chapters: those leaving this chapter for a
// later one (#943) and those carried in for its page fences.
import type { StoryJump, CarriedNumber, CarriedNote, ImportedJumps } from '../../../../composed/carry.js';
import type { ComposedContinuation } from '../../../../composed/continuation.js';
import { continueInPage } from '../../../../composed/templates.js';
import { hasAnchorRefs } from '../../../references/crossRefs.js';
import type { PostextContent } from '../../../../types.js';
import type { ContentBlock } from '../../../../parse/index.js';
import type { FootnoteNumbering } from '../../../references/footnotes.js';
import type { ContentWarning } from '../../../../vdt.js';
import type { PlannedComposedPage } from '../../../composedPages/composedLayout.js';
import type { FrameLayoutPass } from '../../../callouts/frameLayout.js';

/** What createJumps takes from the pass. */
export interface JumpsDeps {
  content: PostextContent;
  bodyOffset: number;
  footnoteDefs: Map<string, ContentBlock>;
  footnoteNumbering: FootnoteNumbering;
  carried: ImportedJumps | undefined;
  headingPrefixes: (string | undefined)[];
  headingNumbers: (number | undefined)[];
  chapterNumberByBlock: string[];
  orderedLevelIndentsPx: number[];
  composedNotes: ContentWarning[];
  fenceById: Map<string, PlannedComposedPage>;
  jumps: Map<string, ComposedContinuation[]>;
  composedPass: FrameLayoutPass;
}

export function createJumps(deps: JumpsDeps) {
  const {
    content, bodyOffset, footnoteDefs, footnoteNumbering, carried, headingPrefixes, headingNumbers,
    chapterNumberByBlock, orderedLevelIndentsPx, composedNotes, fenceById, jumps, composedPass
  } = deps;
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
  return {
    pendingJumps, exportJump
  };
}
