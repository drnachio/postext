// `postext/bundle`: create and open `.postext` files — the zipped book
// bundles the Sandbox exports and imports — and feed them to the backends.

export { openBundle, createBundle, bundleFileMime } from './api';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData } from './api';
export { buildBundle } from './book';
export type { BuildBundleOptions } from './book';
export { loadBundleFonts, registerBundleImages, bundleImageUrl, bundleResourceBytes, bundleFontProvider, diagramInkHex } from './adapters';
export type { BundleSource, BundleFontProviderOptions } from './adapters';

// Low-level codec, for hosts that store or serve bundles their own way.
export { readBundle, planBundle, resolveBundleFiles, bundleBaseConfig, EXPORTABLE_FONT_FORMATS } from './codec';
export type { ReadBundleOptions, ReadBundleResult, BundleMeta, BundleContent, BundleLocaleContent, PlannedFile, BundlePlan, BundleByteSources, ResolvedBundleFiles } from './codec';
export { openBundleZip, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME, MANIFEST_FILE } from './zip';
export type { OpenedBundleZip, ZipBundleOptions } from './zip';
export { CONFIG_VERSION, LEGACY_MATH_SIZE, migrateConfig, pinLegacyBoxChildCut, pinLegacyBoxResourceGap, pinLegacyColonListRoom, pinLegacyDashBreaks, pinLegacyDropCapSize, pinLegacyHeadingBreaks, pinLegacyHeadingMarks, pinLegacyHeadingSplit, pinLegacyHyphenBreaks, pinLegacyInlineGap, pinLegacyMathSize, pinLegacyParagraphContainerSpacing, pinLegacyRaggedBreaking } from './configVersion';
export type { MigrateConfigOptions } from './configVersion';
export {
  isBundleManifest,
  hasValidShowcaseMeta,
  pickMarkdownFile,
  pickLocaleOverrides,
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
  isSvgFile,
  isPdfFile,
  fontFormatFromFile,
  extensionForImageMime,
  extensionForResource,
  fontsToCustomFonts,
  resourceFromSpec,
  svgSize,
  bitmapSize,
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
  BundleChapter,
  BundleBlob,
  BundleFontFile,
} from './types';
