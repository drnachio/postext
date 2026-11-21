export * from './isbn.js';
export * from './barcodeSvg.js';
export * from './measures.js';
export * from './spine.js';
export * from './geometry.js';
export * from './version.js';
export * from './exchange.js';
export { DEFAULT_BINDING_MEASURES, BUILT_IN_BINDING_PROFILES, DEFAULT_SPINE_TEXT } from '../defaults/output/production.js';
// Composing a sheet: what a host places and reads; the drawing itself
// (./coverArt.ts, ./mirrorBleed.ts, the art of ./shapes.ts) stays inside.
export { BASIC_SHAPES, basicShape, roundedRectPath, pathData, flattenCoverPath, coverPathBounds, type BasicShape, type CoverEffects, type CoverPath, type CoverPathNode, type CoverPoint } from './shapes.js';
export { COVER_FINISH_INKS, coverElementRect, outlinePathData, placeCoverElement, type CoverDesign, type CoverElement, type CoverFinish, type CoverFinishKind, type CoverLogo, type CoverOutline } from './coverDesign.js';
export { MIRROR_RESOURCE_ID, type MirrorPicture } from './coverArt.js';
export { BARCODE_RESOURCE_ID, coverMarkdown, coverPage, sheetGuides, type CoverPage, type CoverPageOptions, type CoverTextFrame, type SheetGuide } from './compose.js';
export type * from '../types/output/production.js';
