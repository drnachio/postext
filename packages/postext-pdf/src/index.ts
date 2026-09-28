export { renderToPdf } from './pdf-backend';
export type {
  RenderToPdfOptions,
  RenderProgress,
  PdfFontProvider,
  PdfFontRequest,
  PdfWarning,
  PdfFontWarning,
  PdfFontFallbackWarning,
  PdfMissingGlyphWarning,
  PdfVariableFontWarning,
  PdfCffEmbeddedWholeWarning,
  ResourceBytesProvider,
} from './pdf-backend';
export { decompressWoff2 } from './woff2';
export { svgToVectorDrawing, type VectorDrawing } from './pdf-backend/svgVector';
export { sniffBytes, rasterizeSvgWithDom, type SvgRasterizer } from './pdf-backend/renderResourceBlock';
