import type {
  PdfGenerationConfig,
  ResolvedPdfGenerationConfig,
} from '../types';

export const DEFAULT_PDF_GENERATION_CONFIG: ResolvedPdfGenerationConfig = {
  outlines: true,
  forceColorSpace: false,
  colorSpace: 'cmyk',
};

export function resolvePdfGenerationConfig(
  partial?: PdfGenerationConfig,
): ResolvedPdfGenerationConfig {
  if (!partial) return { ...DEFAULT_PDF_GENERATION_CONFIG };
  return {
    outlines: partial.outlines ?? DEFAULT_PDF_GENERATION_CONFIG.outlines,
    forceColorSpace:
      partial.forceColorSpace ?? DEFAULT_PDF_GENERATION_CONFIG.forceColorSpace,
    colorSpace: partial.colorSpace ?? DEFAULT_PDF_GENERATION_CONFIG.colorSpace,
  };
}

export function stripPdfGenerationDefaults(
  cfg?: PdfGenerationConfig,
): PdfGenerationConfig | undefined {
  if (!cfg) return undefined;
  const result: PdfGenerationConfig = {};
  let hasOverride = false;
  if (
    cfg.outlines !== undefined &&
    cfg.outlines !== DEFAULT_PDF_GENERATION_CONFIG.outlines
  ) {
    result.outlines = cfg.outlines;
    hasOverride = true;
  }
  if (
    cfg.forceColorSpace !== undefined &&
    cfg.forceColorSpace !== DEFAULT_PDF_GENERATION_CONFIG.forceColorSpace
  ) {
    result.forceColorSpace = cfg.forceColorSpace;
    hasOverride = true;
  }
  if (
    cfg.colorSpace !== undefined &&
    cfg.colorSpace !== DEFAULT_PDF_GENERATION_CONFIG.colorSpace
  ) {
    result.colorSpace = cfg.colorSpace;
    hasOverride = true;
  }
  return hasOverride ? result : undefined;
}
