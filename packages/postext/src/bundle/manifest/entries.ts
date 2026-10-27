// Manifest entries to engine objects: custom fonts and resources.
import type { CustomFontFamily, CustomFontFormat, Resource } from '../../types.js';
import type { BundleFontFamilySpec, BundleResourceSpec, BundleImageSize } from '../types.js';
import { fontFormatFromFile, fileBasename, isVideoFile, BITMAP_FORMAT_BY_EXT, fileExtension, VIDEO_FORMAT_BY_EXT, isSvgFile, isPdfFile } from './fileNames.js';

// ---------------------------------------------------------------------------
// Manifest entries → engine objects

export interface BundleFontFiles {
  families: CustomFontFamily[];
  files: { fileId: string; fileName: string; format: CustomFontFormat; file: string; family: string; weight: number; style: 'normal' | 'italic' }[];
  warnings: string[];
}

const identity = (file: string): string => file;

/** The `fallback` of a manifest family when it can stand in for it: a
 *  name other than the family's own (#978). */
function usableFallback(family: Pick<BundleFontFamilySpec, 'name' | 'fallback'>): string | undefined {
  const fallback = typeof family.fallback === 'string' ? family.fallback.trim() : '';
  return fallback.length > 0 && fallback.toLowerCase() !== family.name.trim().toLowerCase() ? fallback : undefined;
}

/** Turn manifest font families into `config.customFonts` entries plus the
 *  list of files to read. `.woff` is not supported by the PDF backend and
 *  is skipped with a warning, as is any unrecognised extension. */
export function fontsToCustomFonts(
  fonts: BundleFontFamilySpec[],
  fileIdFor: (file: string) => string = identity,
): BundleFontFiles {
  const families: CustomFontFamily[] = [];
  const files: BundleFontFiles['files'] = [];
  const warnings: string[] = [];
  for (const family of fonts) {
    const variants: CustomFontFamily['variants'] = [];
    for (const v of family.variants) {
      const format = fontFormatFromFile(v.file);
      if (!format || format === 'woff') {
        warnings.push(`${family.name}: unsupported font file "${v.file}"`);
        continue;
      }
      const fileId = fileIdFor(v.file);
      const fileName = fileBasename(v.file);
      const style = v.style === 'italic' ? 'italic' : 'normal';
      variants.push({ weight: v.weight, style, fileId, format, fileName });
      files.push({ fileId, fileName, format, file: v.file, family: family.name, weight: v.weight, style });
    }
    const fallback = usableFallback(family);
    if (variants.length > 0 || fallback) {
      families.push({
        name: family.name,
        variants,
        ...(family.redistributable === false ? { redistributable: false } : {}),
        ...(fallback ? { fallback } : {}),
      });
    } else warnings.push(`${family.name}: no usable variants`);
  }
  return { families, files, warnings };
}

function positive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Build an engine `Resource` from a manifest entry. `size` supplies the
 *  intrinsic dimensions when the spec omits them, and a bitmap's file
 *  resolution when the spec gives no `fileResolution`. Bitmap/SVG kind is
 *  derived from the file extension. */
export function resourceFromSpec(
  spec: BundleResourceSpec,
  size?: BundleImageSize,
  fileIdFor: (file: string) => string = identity,
): Resource {
  const now = Date.now();
  const { file, pdfFile, poster, width, height, resolution, fileResolution, inlineFonts, score, ...rest } = spec;
  // A score spec's notation (#1172): kept when it is whole (the codec has
  // read a notation file into it by now).
  const base: Resource = {
    ...rest,
    ...(score?.format && typeof score.source === 'string' ? { score: { ...score, format: score.format, source: score.source } } : {}),
    createdAt: now,
    updatedAt: now,
  };
  if (spec.kind === 'video' || (file && isVideoFile(file))) {
    // A video (#454): its own file (self-hosted) and its poster frame.
    const video = { source: 'file' as const, ...(spec.video ?? {}) };
    delete (video as { fileId?: string }).fileId;
    delete (video as { poster?: unknown }).poster;
    const posterFormat = poster ? BITMAP_FORMAT_BY_EXT[fileExtension(poster)] : undefined;
    const w = width ?? size?.width;
    const h = height ?? size?.height;
    return {
      ...base,
      kind: 'video',
      video: {
        ...video,
        ...(file && isVideoFile(file) ? { fileId: fileIdFor(file), format: VIDEO_FORMAT_BY_EXT[fileExtension(file)] } : {}),
        ...(poster && posterFormat ? { poster: { fileId: fileIdFor(poster), format: posterFormat, width: w ?? 0, height: h ?? 0 } } : {}),
      },
    };
  }
  if (!file) return base;

  const fileId = fileIdFor(file);
  const w = width ?? size?.width;
  const h = height ?? size?.height;

  if (isSvgFile(file)) {
    const master = pdfFile && isPdfFile(pdfFile) ? { pdfFileId: fileIdFor(pdfFile) } : {};
    const fonts = inlineFonts === false ? { inlineFonts: false } : {};
    return {
      ...base,
      kind: 'svg',
      svg: w && h ? { fileId, width: w, height: h, ...master, ...fonts } : { fileId, ...master, ...fonts },
    };
  }
  const format = BITMAP_FORMAT_BY_EXT[fileExtension(file)];
  if (format) {
    return {
      ...base,
      kind: 'bitmap',
      bitmap: {
        fileId, format, width: w ?? 0, height: h ?? 0,
        ...(positive(resolution) ? { resolution } : {}),
        ...(positive(fileResolution) ? { fileResolution } : positive(size?.resolution?.x) ? { fileResolution: size!.resolution!.x } : {}),
      },
    };
  }
  return base;
}
