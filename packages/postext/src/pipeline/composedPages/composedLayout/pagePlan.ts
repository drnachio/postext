// The stories of a composed page read back from its boxes, and the plan of
// composed pages by fence with their page marks (#1276: split out of composedLayout.ts).
import type { ContentBlock } from '../../../parse/types.js';
import type { VDTBlock } from '../../../vdt.js';
import { dimensionToPx } from '../../../units.js';
import { FRAME_ATTR } from '../../../composed/wrap.js';
import { type PageTemplateSource, resolvePageTemplate, isModuleTemplate } from '../../../composed/templates.js';
import type { PlannedCallout } from '../../callouts/calloutLayout.js';
import type { ComposedStory } from './state.js';

/** The story heads of a composed page's stories, by the head frame's
 *  name, read from the boxes `wrapComposedPages` made (`FRAME_ATTR`). */
export function composedStories(
  startIdx: number,
  endIdx: number,
  plans: ReadonlyMap<number, PlannedCallout>,
): Map<string, ComposedStory> {
  const out = new Map<string, ComposedStory>();
  for (let i = startIdx + 1; i < endIdx; i++) {
    const plan = plans.get(i);
    if (!plan) continue;
    const head = plan.attrs[FRAME_ATTR];
    if (head !== undefined && !out.has(head)) out.set(head, { startIdx: i, plan });
    i = plan.endIdx;
  }
  return out;
}

/** `d` in px, 0 when unset. */
export function lengthPx(d: Parameters<typeof dimensionToPx>[0] | undefined, dpi: number, emPx: number): number {
  return d ? dimensionToPx(d, dpi, emPx) : 0;
}

/** A composed page of the pass whose template is known: its markers and
 *  its stories. */
export interface PlannedComposedPage {
  startIdx: number;
  endIdx: number;
  stories: Map<string, ComposedStory>;
  /** The story box holding block `idx`, if any. */
  storyAt(idx: number): ComposedStory | undefined;
}

/** The composed pages of `blocks` whose template `source` has, by their
 *  opening marker's index. */
export function planComposedPages(
  blocks: readonly ContentBlock[],
  plans: ReadonlyMap<number, PlannedCallout>,
  source: PageTemplateSource,
): Map<number, PlannedComposedPage> {
  const out = new Map<number, PlannedComposedPage>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'containerStart' || b.containerName !== 'composedPage' || !b.composedPage) continue;
    let end = i + 1;
    while (end < blocks.length && !(blocks[end]!.type === 'containerEnd' && blocks[end]!.containerId === b.containerId)) end++;
    end = Math.min(end, blocks.length - 1);
    // (A module, #1062, is never laid as a page.)
    const t = resolvePageTemplate(source, b.composedPage.template);
    if (t && !isModuleTemplate(t)) {
      const stories = composedStories(i, end, plans);
      const list = [...stories.values()];
      out.set(i, {
        startIdx: i,
        endIdx: end,
        stories,
        storyAt: (idx) => list.find((s) => idx > s.startIdx && idx < s.plan.endIdx),
      });
    }
    i = end;
  }
  return out;
}

/** The planned composed page whose markers enclose block `idx`. */
export function composedPageAt(pages: ReadonlyMap<number, PlannedComposedPage>, idx: number): PlannedComposedPage | undefined {
  for (const p of pages.values()) if (idx > p.startIdx && idx < p.endIdx) return p;
  return undefined;
}

/** `words` with `{page}` as `page` (#917). */
export const withPage = (words: string, page: string): string => words.split('{page}').join(page);

/** Mark the design text of `box` that sets `shown` as a continuation mark
 *  whose `{page}` the build fills in once pages are numbered (#917). */
export function tagPageMark(box: VDTBlock, shown: string, text: string, page: 'to' | 'from'): void {
  const want = shown.trim();
  for (const b of box.designOverlay?.blocks ?? []) {
    if (b.kind !== 'text' || !b.artifact || b.pageMark) continue;
    if (b.lines.map((l) => l.text).join(' ').trim() !== want && b.lines.map((l) => l.text).join('').trim() !== want) continue;
    b.pageMark = { text: text.trim(), page };
    return;
  }
}
