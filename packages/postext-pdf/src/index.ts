export { renderToPdf, declaredFontFile } from './pdf-backend/index.js';
export type {
  RenderToPdfOptions,
  RenderProgress,
  PdfFontProvider,
  PdfFontAnswer,
  PdfFontFile,
  PdfFontFileDeclaration,
  PdfFontRequest,
  PdfWarning,
  PdfFontWarning,
  PdfFontFallbackWarning,
  PdfMissingGlyphWarning,
  PdfVariableFontWarning,
  PdfCffEmbeddedWholeWarning,
  PdfComplexShapingWarning,
  PdfPrintWarning,
  ResourceBytesProvider,
} from './pdf-backend/index.js';
export { inspectPrintMaster, type PrintMasterReport } from './print/inspectMaster.js';
export { decompressWoff2 } from './woff2.js';
export type { HarfBuzzWasmSource } from './harfbuzz.js';
export { svgToVectorDrawing, type VectorDrawing } from './pdf-backend/vector/svgVector.js';
export { sniffBytes, rasterizeSvgWithDom, type SvgRasterizer } from './pdf-backend/blocks/renderResourceBlock.js';
