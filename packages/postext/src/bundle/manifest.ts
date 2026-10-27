// Pure helpers for bundle manifests: validation, locale resolution, file
// naming, and conversion of manifest entries into engine resources and
// custom fonts. No DOM or storage access.

export { hasValidShowcaseMeta, isBundleManifest } from './manifest/validation.js';
export { pickMarkdownFile, pickLocaleOverrides, pickBundleMeta, pickBundleView, bundleStart, pickBundleStart, resolveBundleLocale, resolveBundleConfigLocale, pickChapterSpecs } from './manifest/locale.js';
export type { BundleNames } from './manifest/locale.js';
export { slugify, uniqueSlug, chapterFileName, fileExtension, fileBasename, mimeForFile, isBitmapFile, isVideoFile, bitmapFormatOf, isSvgFile, isPdfFile, fontFormatFromFile, extensionForImageMime, extensionForResource, extensionForVideo, extensionForBitmapFormat } from './manifest/fileNames.js';
export { fontsToCustomFonts, resourceFromSpec } from './manifest/entries.js';
export type { BundleFontFiles } from './manifest/entries.js';
export { svgSize, bitmapSize, bitmapInfo } from './manifest/sizes.js';
