// The text panels of comic pages and strips (#885, #959).
import type { VDTPage, VDTBlock, VDTComicPage, ResolvedConfig, VDTDocument } from '../../../../vdt.js';
import { type PlannedComposedPage, frameStyleOf } from '../../../composedPages/composedLayout.js';
import { type ComicTextFramesInput, type ComicTextFramesLayout, layoutComicTextFrames, layoutStripTextFrames } from '../../../../comics/textPanels.js';
import { FRAME_STYLE_ID } from '../../../../composed/wrap.js';
import { wrapGapPx } from '../../../floats/textWrap.js';
import { resolvedLocale } from '../../../config.js';
import type { ContentBlock } from '../../../../parse/index.js';
import type { BlockStyle } from '../../../styles.js';
import type { ResolvedCalloutStyleConfig } from '../../../../types.js';
import type { FrameLayoutPass } from '../../../callouts/frameLayout.js';

/** What createComicText takes from the pass. */
export interface ComicTextDeps {
  resolved: ResolvedConfig;
  dpi: number;
  doc: VDTDocument;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  bodyStyle: BlockStyle;
  calloutStyles: ResolvedCalloutStyleConfig[];
  comicTextPlans: Map<number, PlannedComposedPage>;
  floatGapPx: number;
  framePass: FrameLayoutPass;
  mirroredOf: (page: VDTPage) => boolean;
  composedLaid: Set<number>;
}

export function createComicText(deps: ComicTextDeps) {
  const {
    resolved, dpi, doc, bodyOffset, contentBlocks, bodyStyle, calloutStyles, comicTextPlans,
    floatGapPx, framePass, mirroredOf, composedLaid
  } = deps;
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
  return {
    placeComicText, placeStripTexts
  };
}
