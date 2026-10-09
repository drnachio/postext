// The canvas the engine measures and paints with. postext runs in the
// browser, where `OffscreenCanvas` measures text with the page's fonts; here
// Skia (@napi-rs/canvas) does the same with the fonts registered in
// `fonts.ts`. Imported first by `main.ts`: the engine's text measurer
// creates its context the first time it measures, and must find these.

import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

const g = globalThis as Record<string, unknown>;
g.OffscreenCanvas = class OffscreenCanvas {
  constructor(width: number, height: number) {
    return createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  }
};
g.Path2D ??= Path2D;
g.DOMMatrix ??= DOMMatrix;
g.ImageData ??= ImageData;
