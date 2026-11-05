// SVG pictures on Skia (#678). `loadImage` rasterises an SVG once, into a
// bitmap of the size the SVG declares (`width="86mm"` is 325 px), and
// `drawImage` stretches that bitmap to whatever size it is asked for: a
// figure placed larger than its SVG says came out soft. An SVG `Image`
// rasterises again when its width and height are set, so the pictures
// loaded here are given, before each draw, the size they are drawn at on
// the device.
//
// Skia's SVG renderer draws no `<image>` (#771): a raster given as a data
// URI, with `href` or `xlink:href`, alone or through `<defs>` and `<use>`
// (what `pdftocairo -svg` writes for artwork cut from a PDF), came out
// transparent while the PDF and the Sandbox painted it. An SVG that holds
// one is rasterised by resvg instead, at each size it is drawn at, with the
// faces registered with Skia; every other SVG stays with Skia. The image
// handed to the engine is resvg's raster at the size the SVG declares; a
// draw at a larger size is given a canvas holding resvg's raster at that
// size (an `Image` decodes its `src` a tick later, too late for the draw).
// @napi-rs/canvas 1.0.13 draws such rasters, and plain SVGs sharp at any
// size, itself (#1211); both paths stay, the pixels proven by the tests.
// resvg is the native addon (@resvg/resvg-js, embedded as Skia's is, #788):
// the release of the WebAssembly build it replaces, the same pixels, about
// five times faster on artwork cut from PDFs (the 40 such figures of a
// 721-page book took 26 minutes of its page images). It reads faces from
// files only: the ones it is handed are written to a folder of this process.
// It matches `font-family` against the family a face file names itself, so
// each face is handed also as a copy named after the family the book
// registers it under (#890).
//
// Skia draws an SVG whose `viewBox` does not start at `0 0` (a map cut out
// of a page, `viewBox="23 151 178.8 108.1"`) at the size it declares, and
// empty once it is rasterised again at another size: the origin is applied
// the wrong way round (#890). Such an SVG is given to Skia with its content
// moved to the origin, a `viewBox` of `0 0 w h` and the same picture.

import { createCanvas, ImageData, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FALLBACK_FAMILY } from './assets';
import { renameFace } from './faceNames';

const svgImages = new WeakSet<object>();
/** Past this many pixels on a side the image stays as it is. */
const SVG_MAX_SIDE = 8192;

/** A raster `<image>` given as a data URI, which Skia leaves out. */
const RASTER_IMAGE = /<image\b[^>]*?\bhref\s*=\s*["']\s*data:image\//i;

/** Whether Skia would leave part of this SVG out: it holds a raster
 *  `<image>` given as a data URI. */
export function holdsRasterImage(svgText: string): boolean {
  return RASTER_IMAGE.test(svgText);
}

/** The images resvg rasterises: their SVG, the size the SVG declares, and
 *  the largest raster drawn so far (`drawn` pixels wide). */
const resvgImages = new WeakMap<object, { svg: string; width: number; height: number; drawn: number; raster?: Canvas }>();
const svgFonts: Uint8Array[] = [];
/** The files of {@link svgFonts}, in the same order. Written the first time
 *  an SVG with text is rasterised, into a folder of this process removed
 *  when it exits. */
let svgFontFiles: string[] | undefined;
let svgFontDir: string | undefined;

/** A face registered with Skia (under `family`, the name the book gives
 *  it), handed to resvg for the text of the SVGs it rasterises, and with
 *  it a copy named `family` when the file names another family. */
export function noteSvgFont(bytes: Uint8Array, family?: string): void {
  svgFonts.push(bytes);
  const renamed = family ? renameFace(bytes, family) : undefined;
  if (renamed) svgFonts.push(renamed);
  svgFontFiles = undefined;
}

const SVG_OPEN = /<svg\b[^>]*>/i;
const VIEW_BOX = /\bviewBox\s*=\s*(["'])([^"']*)\1/i;

/** `svgText` with its content moved to the origin when its `viewBox` does
 *  not start at `0 0`: the root's `viewBox` becomes `0 0 w h` and its
 *  children are wrapped in a `<g>` translated by the old origin. The same
 *  picture; any other SVG is returned as it is. */
export function zeroViewBoxOrigin(svgText: string): string {
  const open = SVG_OPEN.exec(svgText);
  if (!open || open[0].endsWith('/>')) return svgText;
  const box = VIEW_BOX.exec(open[0]);
  if (!box) return svgText;
  const n = box[2]!.trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return svgText;
  const [x, y, w, h] = n as [number, number, number, number];
  if (x === 0 && y === 0) return svgText;
  const close = svgText.lastIndexOf('</svg');
  const end = open.index + open[0].length;
  if (close < end) return svgText;
  const tag = open[0].replace(VIEW_BOX, `viewBox=${box[1]}0 0 ${w} ${h}${box[1]}`);
  return `${svgText.slice(0, open.index)}${tag}<g transform="translate(${-x} ${-y})">${svgText.slice(end, close)}</g>${svgText.slice(close)}`;
}

function fontFiles(): string[] {
  if (svgFontFiles) return svgFontFiles;
  if (!svgFontDir) {
    const dir = mkdtempSync(join(tmpdir(), 'postext-svg-fonts-'));
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
    svgFontDir = dir;
  }
  const dir = svgFontDir;
  svgFontFiles = svgFonts.map((bytes, i) => {
    const file = join(dir, `${i}-${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.ttf`);
    writeFileSync(file, bytes);
    return file;
  });
  return svgFontFiles;
}

/** `svgText` rendered by resvg, `width` pixels wide (the size the SVG
 *  declares when none is given). */
function resvgRender(svgText: string, width?: number) {
  return new Resvg(svgText, {
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
    font: { loadSystemFonts: false, fontFiles: /<text\b/i.test(svgText) ? fontFiles() : [], defaultFontFamily: FALLBACK_FAMILY },
  }).render();
}

/** A canvas holding resvg's raster of `svgText`, `width` pixels wide.
 *  resvg's pixels are premultiplied; `ImageData` is not. */
function resvgCanvas(svgText: string, width: number): Canvas {
  const rendered = resvgRender(svgText, width);
  const pixels = new Uint8ClampedArray(rendered.pixels);
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a === 0 || a === 255) continue;
    for (let c = i; c < i + 3; c++) pixels[c] = Math.round((pixels[c]! * 255) / a);
  }
  const canvas = createCanvas(rendered.width, rendered.height);
  canvas.getContext('2d').putImageData(new ImageData(pixels, rendered.width, rendered.height), 0, 0);
  return canvas;
}

/** Decode an SVG, remembered as one: see {@link sizeSvgImage}. */
export async function loadSvgImage(svgText: string): Promise<Image> {
  if (holdsRasterImage(svgText)) {
    const image = await loadImage(Buffer.from(resvgRender(svgText).asPng()));
    resvgImages.set(image, { svg: svgText, width: image.width, height: image.height, drawn: image.width });
    svgImages.add(image);
    return image;
  }
  const image = await loadImage(Buffer.from(zeroViewBoxOrigin(svgText)));
  svgImages.add(image);
  return image;
}

/** Give an image of {@link loadSvgImage} at least `width` × `height`
 *  pixels: Skia rasterises the SVG again at that size. It only ever grows
 *  (a later draw at a smaller size reduces the larger bitmap), keeps the
 *  proportions the SVG declares and stops at {@link SVG_MAX_SIDE}. Any
 *  other image is left alone. An image resvg rasterises keeps the size the
 *  SVG declares; the larger raster is what {@link svgSource} draws. */
export function sizeSvgImage(image: unknown, width: number, height: number): void {
  if (typeof image !== 'object' || image === null || !svgImages.has(image)) return;
  const img = image as Image;
  const resvg = resvgImages.get(img);
  if (resvg) {
    if (!(resvg.width > 0) || !(resvg.height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const k = Math.min(Math.max(width / resvg.width, height / resvg.height), SVG_MAX_SIDE / Math.max(resvg.width, resvg.height));
    const w = Math.ceil(resvg.width * k);
    if (w <= resvg.drawn) return;
    resvg.raster = resvgCanvas(resvg.svg, w);
    resvg.drawn = w;
    return;
  }
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!(nw > 0) || !(nh > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return;
  const k = Math.min(Math.max(width / nw, height / nh), SVG_MAX_SIDE / Math.max(nw, nh));
  const w = Math.ceil(nw * k);
  const h = Math.ceil(nh * k);
  if (w <= img.width && h <= img.height) return;
  img.width = Math.max(w, img.width);
  img.height = Math.max(h, img.height);
}

/** What to draw for `image`: the largest raster resvg made of it, when it
 *  is an image resvg rasterises and was drawn larger than its SVG says;
 *  the image itself otherwise. */
export function svgSource(image: unknown): unknown {
  if (typeof image !== 'object' || image === null) return image;
  return resvgImages.get(image)?.raster ?? image;
}

type Draw = (...args: unknown[]) => void;
const patched = new WeakSet<object>();

/** Make the 2D context of `canvas` size the SVG images it draws
 *  ({@link sizeSvgImage}) to the box they are drawn into, in device pixels
 *  under the context's transform. Returns the canvas. */
export function drawsSvgAtSize<T extends Canvas>(canvas: T): T {
  const getContext = canvas.getContext.bind(canvas) as (...args: unknown[]) => unknown;
  (canvas as unknown as { getContext: (...args: unknown[]) => unknown }).getContext = (...args: unknown[]) => {
    const ctx = getContext(...args) as { drawImage: Draw; getTransform(): { a: number; b: number; c: number; d: number } } | null;
    if (!ctx || patched.has(ctx)) return ctx;
    patched.add(ctx);
    const drawImage = ctx.drawImage;
    ctx.drawImage = function (...draw: unknown[]): void {
      // drawImage(image, dx, dy, dw, dh): the form the engine draws a
      // registered picture with.
      if (draw.length === 5) {
        const m = ctx.getTransform();
        sizeSvgImage(draw[0], Math.abs(draw[3] as number) * Math.hypot(m.a, m.b), Math.abs(draw[4] as number) * Math.hypot(m.c, m.d));
        draw[0] = svgSource(draw[0]);
      }
      drawImage.apply(ctx, draw);
    };
    return ctx;
  };
  return canvas;
}

/** SVG to PNG through Skia (resvg for an SVG Skia would leave a raster
 *  out of, #771), at the raster's size, not stretched from the SVG's own
 *  (#678): the pictures the PDF cannot draw as vectors, and the fallback
 *  Word keeps beside an SVG. Null when the SVG cannot be drawn. */
export async function rasterizeSvg(svgText: string, width: number, height: number): Promise<Uint8Array | null> {
  try {
    const image = await loadSvgImage(svgText);
    const canvas = drawsSvgAtSize(createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(await canvas.encode('png'));
  } catch {
    return null;
  }
}
