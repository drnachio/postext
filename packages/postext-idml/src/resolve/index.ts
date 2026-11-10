// Reading a document the way an importer needs it: computed styles,
// colours, places on the page, master items, reading order, a summary.

export { computeStyle, mergeProps, paragraphProps, runAttr, runProperty, runProps, styleByPath, styleChain, stylePath } from './styles.js';
export { characterFormat, leadingOf, paragraphFormat, tabStops } from './format.js';
export type { CharacterFormat, ListFormat, ParagraphFormat, ParagraphRule, TabStop } from './format.js';
export { cmykToRgb, hexOf, hsbToRgb, isNoColour, labToRgb, resolveColour } from './colour.js';
export type { ResolvedColour } from './colour.js';
export { graphicCrop, itemExtent, itemGeometry, itemIndex, locatedGeometry, pageBoxInSpread, pageMatrix, pageSize, pageUnder, spreadMatrix, textColumns, textContentBox, transformBox, transformPaths } from './geometry.js';
export type { GraphicCrop, ItemGeometry, Located } from './geometry.js';
export { masterItems, masterPageFor } from './masters.js';
export type { MasterItem } from './masters.js';
export { findOrdered, readingOrder } from './order.js';
export type { AnchoredStory, FramePlace, OrderedStory, StoryFlags } from './order.js';
export { inspectIdml } from './inspect.js';
export type { IdmlAttention, IdmlSummary, StoryCount } from './inspect.js';
