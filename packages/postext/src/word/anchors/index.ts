// Source anchors and the embedded export map shared by both Word variants
// (#1389).

export * from './types.js';
export { encodeExportMap, decodeExportMap, readExportMap, readCustomProp, xmlPartText, encodeOffsetRuns, decodeOffsetRuns, PROP_EXPORT_ID, PROP_VARIANT, PROP_VERSION } from './exportMap.js';
export { readExportTrace, exportTrace, traceProps, traceId, PROP_DESIGN, PROP_DIGEST, PROP_CHAPTERS, type ExportTrace, type TraceChapter } from './trace.js';
export { bookmarkName, newFragmentId, fragmentIdOf, bookmarkStartXml, bookmarkEndXml, MAX_BOOKMARK_NAME } from './bookmarks.js';
export { hashText, hashBytes, guidFrom } from './hash.js';
export { ommlHash, canonicalOmml } from './ommlHash.js';
export { base64Encode, base64Decode } from './base64.js';
