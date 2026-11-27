// Bundle codec shared by every transport: a bundle is a directory-shaped set
// of files whether it is served over HTTP, read from a `.postext` zip or
// written out. `readBundle` turns manifest + files into chapters, config,
// resources and file payloads; `planBundle` / `resolveBundleFiles` do the
// reverse. Nothing here touches storage.

export { bundleBaseConfig, readBundle } from './codec/read.js';
export type { ReadBundleOptions, ReadBundleResult } from './codec/read.js';
export { traceBundleContours, EXPORTABLE_FONT_FORMATS, planBundle } from './codec/plan.js';
export type { BundleMeta, BundleLocaleContent, BundleContent, PlannedFile, BundlePlan } from './codec/plan.js';
export { resolveBundleFiles } from './codec/files.js';
export type { BundleByteSources, ResolvedBundleFiles } from './codec/files.js';
