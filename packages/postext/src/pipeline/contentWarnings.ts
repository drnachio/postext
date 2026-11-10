/**
 * Content warnings — references and markup the source names wrongly, which
 * the layout sets in a fallback without failing: an unknown `:ref` prints
 * `?`, an unknown `:::name` line prints as text, an unknown style id falls
 * back to a default, a ragged table grid shifts its cells. They are read
 * from the source and the configuration alone (no layout), so an editor can
 * list them while the document is still being laid out; the build lists
 * them in `VDTDocument.contentWarnings`, located on the page each construct
 * landed on.
 */



export { fullwidthMarkupIn, collectContentWarnings } from './contentWarnings/sourceWarnings.js';
export { locateContentWarnings, cjkLooseLineWarnings, raggedLineWarnings, wordOverflowWarnings, designTruncationWarnings, joiningLetterSpacingWarnings, floatShrinkWarnings, pictureBelowPrintSizeWarnings, emptyCaptionWarnings, dropCapWarnings } from './contentWarnings/layoutWarnings.js';
export { formatWarning } from './contentWarnings/formatWarning.js';
