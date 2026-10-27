/**
 * Canvas rendering of resource blocks (issue #49 §7).
 *
 * Draws an embedded `Resource` (bitmap / svg / table) plus its caption. Image
 * payloads (bitmaps, SVGs) live out-of-band in IndexedDB, which is owned by the
 * sandbox — the core renderer is synchronous and cannot fetch them itself. The
 * host therefore pre-populates a small in-memory registry keyed by `fileId`
 * (see {@link registerResourceImage}). When an image is not yet decoded the
 * renderer draws a neutral placeholder so layout stays stable.
 *
 * Caption + inline `:ref` segments reuse the same per-line rich-text painter as
 * body text. Refs are drawn in the configured link colour; canvas has no click
 * surface, so clickability is PDF-only for v1.
 */

export { registerResourceImage, unregisterResourceImage, clearResourceImages, getResourceImage, setMissingImageSink, setTintUnflagged, resourceRasterCacheBytes, drawResourceImage } from './renderResourceBlock/images.js';
export type { ResourceImageSource, RegisterResourceImageOptions, MissingImageSink, ImageInk } from './renderResourceBlock/images.js';
export { paintVideoOverlays, roundedOutlinePath } from './renderResourceBlock/overlays.js';
export { paintFigureLabels, renderResourceBlock } from './renderResourceBlock/block.js';
