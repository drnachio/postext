// `postext/bundle`: create and open `.postext` files — the zipped book
// bundles the Sandbox exports and imports — and feed them to the backends.

export { openBundle, createBundle, bundleFileMime } from './api.js';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData } from './api.js';
export { buildBundle } from './book.js';
export type { BuildBundleOptions } from './book.js';
export { createBundleLayoutCache } from './layoutCache.js';
export type { BundleLayoutCache, BundleLayoutStats } from './layoutCache.js';
export { loadBundleFonts, registerBundleImages, bundleImageUrl, bundleVideoUrl, bundleResourceBytes, bundleFontProvider, bundleSvgFontProvider, svgInlinesFonts, diagramInkHex } from './adapters.js';
export type { BundleSource, BundleFontProviderOptions, BundleFontRequest, LoadBundleFontsOptions, BundleImageOptions } from './adapters.js';

// Low-level codec, for hosts that store or serve bundles their own way.
export { readBundle, planBundle, resolveBundleFiles, bundleBaseConfig, traceBundleContours, EXPORTABLE_FONT_FORMATS } from './codec.js';
export type { ReadBundleOptions, ReadBundleResult, BundleMeta, BundleContent, BundleLocaleContent, PlannedFile, BundlePlan, BundleByteSources, ResolvedBundleFiles } from './codec.js';
export { openBundleZip, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME, MANIFEST_FILE } from './zip.js';
export type { OpenedBundleZip, ZipBundleOptions } from './zip.js';
export { CONFIG_VERSION, LEGACY_MATH_SIZE, migrateConfig, pinLegacyBoxChildCut, pinLegacyBoxResourceGap, pinLegacyColonListRoom, pinLegacyDashBreaks, pinLegacyDropCapSize, pinLegacyHeadingBreaks, pinLegacyHeadingMarks, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyHeadingSplit, pinLegacyHyphenBreaks, pinLegacyPairedIndents, pinLegacyVerseLayout, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats, pinLegacyTitleBreaks, pinLegacyCircledNumbers, pinLegacyDesignText, pinLegacyInlineGap, pinLegacyMathSize, pinLegacyParagraphContainerSpacing, pinLegacyRaggedBreaking, pinLegacyMarkRadius, pinLegacySlashBreaks } from './configVersion.js';
export { pinLegacyIndexGroupSplit, pinLegacyLooseOrder, pinLegacyTrailingStep, pinLegacyWideFloatStretch } from './configVersion.js';
export { pinLegacyGridBreakRules } from './configVersion.js';
export { pinLegacyNoteBreaks } from './configVersion.js';
export { pinLegacyLatinSpacingEdge } from './configVersion.js';
export { pinLegacyInlineCaptionSide } from './configVersion.js';
export { pinLegacyRefLabelBreaks } from './configVersion.js';
export { pinLegacyScriptContext, pinLegacyShapingLanguage } from './configVersion.js';
export { pinLegacyTaskBox } from './configVersion.js';
export { pinLegacyBoxParagraphStyles } from './configVersion.js';
export { pinLegacyBalloonPlacement } from './configVersion.js';
export { pinLegacyHtmlViewerBreaking } from './configVersion.js';
export type { MigrateConfigOptions } from './configVersion.js';
export {
  isBundleManifest,
  hasValidShowcaseMeta,
  pickMarkdownFile,
  pickLocaleOverrides,
  pickBundleView,
  pickBundleMeta,
  pickBundleStart,
  bundleStart,
  resolveBundleLocale,
  resolveBundleConfigLocale,
  pickChapterSpecs,
  chapterFileName,
  slugify,
  uniqueSlug,
  fileExtension,
  fileBasename,
  mimeForFile,
  isBitmapFile,
  isVideoFile,
  isSvgFile,
  isPdfFile,
  fontFormatFromFile,
  extensionForImageMime,
  extensionForResource,
  fontsToCustomFonts,
  resourceFromSpec,
  svgSize,
  bitmapSize,
  bitmapInfo,
} from './manifest.js';
export type { BundleFontFiles, BundleNames } from './manifest.js';
export type {
  BundleShowcaseMeta,
  BundleResourceSpec,
  BundleFontVariantSpec,
  BundleFontFamilySpec,
  BundleChapterSpec,
  BundleLocaleOverrides,
  BundleCanvasScope,
  BundleViewSpec,
  BundleStart,
  BundleManifestV1,
  BundleManifestV2,
  BundleManifest,
  BundleFileReader,
  BundleIdScheme,
  BundleImageSize,
  BitmapInfo,
  BitmapFileResolution,
  BitmapResolutionSource,
  BundleChapter,
  BundleBlob,
  BundleFontFile,
} from './types.js';
