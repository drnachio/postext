export { DESIGN_PARTS, DESIGN_PART_KEYS, DESIGN_CARRIED_KEYS, DESIGN_PART_SLOTS, designPartSlots, designPartOf, isDesignPart, readDesignSlot, writeDesignSlot } from './parts.js';
export type { DesignPart, DesignKeyPath, DesignPartSlot } from './parts.js';
export { extractDesign, applyDesign, revertDesign, pickDesignParts, usedFontFamilies, designFileIds, readDesignParts, designPartsWithComposition } from './design.js';
export type { Design } from './design.js';
export { designMissingStyles } from './missingStyles.js';
export type { MissingStyle, MissingStyleKind } from './missingStyles.js';
export { COMPOSITION_CONVENTIONS, compositionConventionFor, compositionConventionDesign, followsCompositionConvention } from './conventions.js';
export type { CompositionConvention } from './conventions.js';
