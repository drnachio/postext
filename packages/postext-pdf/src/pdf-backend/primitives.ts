import {
  rgb,
  cmyk,
  grayscale,
  BlendMode,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFPage,
  type PDFFont,
  type Color,
} from 'pdf-lib';
import { hexToRgb, rgbToCmyk, rgbToGrayscale } from '../colors';
import type { PdfColorSpace } from 'postext';

export interface PageCtx {
  page: PDFPage;
  pageHeightPt: number;
  scale: number;
  colorSpace: PdfColorSpace;
}

export function makeScale(dpi: number): number {
  return 72 / dpi;
}

export function whiteColor(colorSpace: PdfColorSpace): Color {
  if (colorSpace === 'cmyk') return cmyk(0, 0, 0, 0);
  if (colorSpace === 'grayscale') return grayscale(1);
  return rgb(1, 1, 1);
}

export function colorFromHex(hex: string, colorSpace: PdfColorSpace): Color {
  const c = hexToRgb(hex);
  if (colorSpace === 'cmyk') {
    const k = rgbToCmyk(c);
    return cmyk(k.c, k.m, k.y, k.k);
  }
  if (colorSpace === 'grayscale') {
    return grayscale(rgbToGrayscale(c));
  }
  return rgb(c.r, c.g, c.b);
}

/** Back-compat alias — defaults to RGB. */
export function rgbFromHex(hex: string): Color {
  return colorFromHex(hex, 'rgb');
}

export function fillRectPx(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  color: Color,
  blendMode?: BlendMode,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    ...(blendMode ? { blendMode } : {}),
  });
}

export function drawLinePx(
  ctx: PageCtx,
  x1Px: number,
  y1Px: number,
  x2Px: number,
  y2Px: number,
  color: Color,
  thicknessPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  ctx.page.drawLine({
    start: { x: x1Px * scale, y: pageHeightPt - y1Px * scale },
    end: { x: x2Px * scale, y: pageHeightPt - y2Px * scale },
    color,
    thickness: Math.max(0.01, thicknessPx * scale),
  });
}

export function drawTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
): void {
  if (!text) return;
  const { scale, pageHeightPt } = ctx;
  ctx.page.drawText(text, {
    x: xPx * scale,
    y: pageHeightPt - baselinePx * scale,
    size: sizePx * scale,
    font,
    color,
  });
}

export function pushClipRect(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  ctx.page.pushOperators(
    pushGraphicsState(),
    rectangle(x, y, width, height),
    clip(),
    endPath(),
  );
}

export function popClip(ctx: PageCtx): void {
  ctx.page.pushOperators(popGraphicsState());
}
