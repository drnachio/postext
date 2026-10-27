// Text measurement on a canvas context: widths, caches, ink and faces.

export { canvasText, measureSpacedWidth, measureUncachedWidth, setMeasureLanguage, getMeasureLanguage, withMeasureLanguage, measureLanguageKey, clearTextWidthCache, measurementGeneration, evictionsSince, evictTextWidths, onTextWidthCacheClear } from './canvas/state.js';
export { measureTextWidth, measureRunWidth, measureMarkedWidth, scriptSensitive } from './canvas/widths.js';
export { measureInkBox, measureFontBox, measuresOwnFace, measureInkProfile, measureInkExtent, measureGlyphWidth, normalSpaceWidthFor, cleanSoftHyphens } from './canvas/ink.js';
export type { InkProfile } from './canvas/ink.js';
