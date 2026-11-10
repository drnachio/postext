import type {
  PdfFormsConfig,
  PdfGenerationConfig,
  ResolvedPdfGenerationConfig,
} from '../../types.js';

export const DEFAULT_PDF_GENERATION_CONFIG: ResolvedPdfGenerationConfig = {
  outlines: true,
  forceColorSpace: false,
  colorSpace: 'cmyk',
  accessible: true,
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
    accessible: partial.accessible ?? DEFAULT_PDF_GENERATION_CONFIG.accessible,
    ...(partial.forms && Object.keys(partial.forms).length > 0 ? { forms: { ...partial.forms } } : {}),
  };
}

/** The form-field settings that differ from what the PDF writes unasked
 *  (`€` before the number, the chip's face); the separator style has no
 *  fixed default (it follows the document language), so it is kept. */
export function stripPdfFormsDefaults(forms?: PdfFormsConfig): PdfFormsConfig | undefined {
  if (!forms) return undefined;
  const out: PdfFormsConfig = {};
  if (forms.currency !== undefined && forms.currency !== '€') out.currency = forms.currency;
  if (forms.currencyBefore !== undefined && forms.currencyBefore !== true) out.currencyBefore = forms.currencyBefore;
  if (forms.separatorStyle !== undefined) out.separatorStyle = forms.separatorStyle;
  if (forms.font !== undefined && forms.font !== 'chip') out.font = forms.font;
  return Object.keys(out).length > 0 ? out : undefined;
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
  if (
    cfg.accessible !== undefined &&
    cfg.accessible !== DEFAULT_PDF_GENERATION_CONFIG.accessible
  ) {
    result.accessible = cfg.accessible;
    hasOverride = true;
  }
  const forms = stripPdfFormsDefaults(cfg.forms);
  if (forms) {
    result.forms = forms;
    hasOverride = true;
  }
  return hasOverride ? result : undefined;
}
