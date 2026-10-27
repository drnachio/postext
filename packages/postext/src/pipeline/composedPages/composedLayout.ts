/**
 * Lay out one composed page (#855, DESIGN §5.1–5.2): place the frames of
 * its template, pour each story (`composed/wrap.ts`) into its frames with
 * the box typesetter (`frameLayout.ts`), and hand back the blocks for the
 * page's floats with the page's `VDTComposedPage`.
 *
 * Per frame, in {@link frameOrder}: its box ({@link placeBox}, an `'auto'`
 * height measured with the content the frame will hold), then its content:
 * the story from where the frame before it in the chain stopped, cut at the
 * frame's foot when a `next` frame takes the rest, else laid whole and
 * clipped at the foot. Text runs round the frames that push it (`exclude:
 * 'push'`) already placed; groups negotiate their frames' space (#856).
 *
 * A frame whose content still does not fit climbs the reflow ladder (#858,
 * DESIGN §5.4), frame by frame in template order, each step on top of the
 * ones before it, stopping at the first that makes it fit: free space (a
 * fixed height grows to its `maxHeight`), its group pushing and yielding
 * (already part of every layout), smaller pictures in the frame and its
 * group (`fit.imageMinScale`), the group's other frames down to their
 * minimum or their content, smaller text (`fit.minScale`), continuation on
 * another page (#859). Each step lays the whole page again, so a change
 * stays on the page. What still does not fit is clipped and reported
 * (`frameOverflow`) with the steps tried and proposals worked out on the
 * page.
 *
 * A frame whose `overflow.continueIn` sends content to another page
 * (`'next-page'`, `'template:<id>'`, #859) takes the ladder's last step
 * before the warning: it is cut at its foot, with its mark, its text and
 * pictures back at full size, and the rest is handed back
 * (`ComposedPageLayout.continuations`) for `build.ts` to lay on pages it
 * adds after this one, with this function (`ComposedPageInput.continuing`).
 */


export type { ComposedStory, ComposedPageInput, ComposedPageLayout } from './composedLayout/state.js';
export { layoutComposedPage } from './composedLayout/layoutComposedPage.js';
export { carriedPass } from './composedLayout/trialPasses.js';
export { keepChromeAt, frameStyleOf, withNamedLook, styleWithLook } from './composedLayout/frameStyles.js';
export { composedStories, lengthPx, planComposedPages, composedPageAt } from './composedLayout/pagePlan.js';
export type { PlannedComposedPage } from './composedLayout/pagePlan.js';
