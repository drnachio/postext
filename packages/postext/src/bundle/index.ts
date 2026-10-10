// `postext/bundle`: create and open `.postext` files — the zipped book
// bundles the Sandbox exports and imports — and feed them to the backends.

export { openBundle, createBundle, bundleFileMime } from './api';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData } from './api';
export { buildBundle } from './book';
export type { BuildBundleOptions } from './book';
export { loadBundleFonts, registerBundleImages, bundleImageUrl, bundleVideoUrl, bundleResourceBytes, bundleFontProvider, bundleSvgFontProvider, svgInlinesFonts, diagramInkHex } from './adapters';
export type { BundleSource, BundleFontProviderOptions, BundleFontRequest, BundleImageOptions } from './adapters';

// Low-level codec, for hosts that store or serve bundles their own way.
export { readBundle, planBundle, resolveBundleFiles, bundleBaseConfig, EXPORTABLE_FONT_FORMATS } from './codec';
export type { ReadBundleOptions, ReadBundleResult, BundleMeta, BundleContent, BundleLocaleContent, PlannedFile, BundlePlan, BundleByteSources, ResolvedBundleFiles } from './codec';
export { openBundleZip, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME, MANIFEST_FILE } from './zip';
export type { OpenedBundleZip, ZipBundleOptions } from './zip';
export { CONFIG_VERSION, LEGACY_MATH_SIZE, migrateConfig, pinLegacyBoxChildCut, pinLegacyBoxResourceGap, pinLegacyColonListRoom, pinLegacyDashBreaks, pinLegacyDropCapSize, pinLegacyHeadingBreaks, pinLegacyHeadingMarks, pinLegacyHardBreaks, pinLegacyCodeBlocks, pinLegacyHeadingSplit, pinLegacyHyphenBreaks, pinLegacyPairedIndents, pinLegacyVerseLayout, pinLegacyVerseTightening, pinLegacyDesignOverflow, pinLegacyGridBalancing, pinLegacyInlineTableSplit, pinLegacyFlowColumns, pinLegacyOpenerHeadFloats, pinLegacyTitleBreaks, pinLegacyCircledNumbers, pinLegacyDesignText, pinLegacyInlineGap, pinLegacyMathSize, pinLegacyParagraphContainerSpacing, pinLegacyRaggedBreaking } from './configVersion';
export type { MigrateConfigOptions } from './configVersion';
export {
  isBundleManifest,
  hasValidShowcaseMeta,
  pickMarkdownFile,
  pickLocaleOverrides,
  pickBundleView,
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
} from './manifest';
export type { BundleFontFiles } from './manifest';
export type {
  BundleShowcaseMeta,
  BundleResourceSpec,
  BundleFontVariantSpec,
  BundleFontFamilySpec,
  BundleChapterSpec,
  BundleLocaleOverrides,
  BundleCanvasScope,
  BundleViewSpec,
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
} from './types';
