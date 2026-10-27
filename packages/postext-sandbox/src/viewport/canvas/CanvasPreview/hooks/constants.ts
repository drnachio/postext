// The canvas preview's empty selection and the budget of painted page
// bitmaps (#1276: split out of CanvasPreview/index.tsx).
import type { EditorSelection } from '../../../../context/SandboxContext.js';

export const NO_SELECTION: EditorSelection = { from: -1, to: -1, head: -1 };
/** Painted page bitmaps kept at once (~16 pages of 21×28 cm at 300 dpi);
 *  beyond it the pages farthest from the reader are released and repainted
 *  on their next entry. */
export const PAINTED_PAGES_BUDGET_BYTES = 512 * 1024 * 1024;
/** Never trim below this many pages, whatever their size. */
export const MIN_PAINTED_PAGES = 6;
