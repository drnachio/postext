// Fonts for the Word exports (#1393).

export { planWordFonts, wordFontFor, wordSlotFor, faceKey, fitWordFamily, MAX_WORD_FAMILY } from './plan.js';
export { mergeSlices } from './merge.js';
export { readSfnt, writeSfnt, toSfntBytes, tableChecksum, isWoff2 } from './sfnt.js';
export type { Sfnt } from './sfnt.js';
export type { SourceFace, WordFontRef, FontWarning, WordFontPlan, PlanWordFontsOptions } from './types.js';
