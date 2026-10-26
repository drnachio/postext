/**
 * Vector emission of SVG resources into the PDF.
 *
 * Converts a conservative subset of SVG into a flat list of filled / stroked
 * paths in the SVG's root user space, which {@link drawVectorDrawing} then
 * paints with native PDF path operators — so the figure stays vector (sharp at
 * any zoom, tiny on disk) instead of going through a raster fallback. The
 * paths of a drawing are written once per document, as a form XObject that
 * every page drawing it paints.
 *
 * Supported: `svg` (root, `viewBox`, `preserveAspectRatio`), `g` / `a`,
 * `defs`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
 * `use` (of any of the above), `clipPath` (`userSpaceOnUse`), `transform`
 * lists, solid `fill` / `stroke` paints (hex, `rgb()`, named colours,
 * `currentColor`), `fill-rule`, opacities, line caps / joins / miter limit,
 * dash patterns, `display` / `visibility`, the same properties inside a
 * `style` attribute, and — when the caller supplies a {@link VectorFontResolver}
 * — `text` / `tspan` runs (`x`, `y`, single `dx` / `dy`, `font-family`,
 * `font-size`, `font-weight`, `font-style`, `text-anchor`, `direction`),
 * which are set as real, selectable text in the document's embedded fonts.
 * Text in a right-to-left or joining script (Arabic) is shaped by HarfBuzz
 * in its bidi runs (`shapedText.ts`), on the `direction` the browser lays
 * it out with (left to right unless the SVG says otherwise); with HarfBuzz
 * not loaded such text bails out to the raster embed.
 *
 * Anything else — images, gradients, patterns, masks, filters, markers,
 * symbols, nested `svg`, style sheets (other than `@font-face` rules alone,
 * which are skipped), `objectBoundingBox` clips, text on a
 * path or with per-glyph positioning, text in a font the resolver cannot
 * provide — makes {@link svgToVectorDrawing} return `null`, and the caller
 * falls back to a raster embed. Bailing out (rather than drawing an
 * approximation) keeps the printed figure faithful to what the screen
 * backends show.
 *
 * Known approximations: group `opacity` is folded into each descendant's fill
 * and stroke alpha (PDF group transparency would need a transparency group
 * XObject); a `clipPath` with several children is the union of its shapes in
 * SVG but is emitted as one nonzero path here; strokes under a non-uniform
 * transform get a uniform width (the geometric mean of the scale factors).
 */

import { LineCapStyle, LineJoinStyle, type PDFFont, type PDFImage } from 'pdf-lib';
import { IDENTITY, Unsupported } from './svgVector/geometry.js';
import { parseLength, ROOT_STYLE } from './svgVector/style.js';
import { indexIds, parseAspect, type Walker, walk } from './svgVector/walk.js';
import { parseXml, localName, type XmlEl } from './svgVector/xml.js';

export { parsePathData } from './svgVector/geometry.js';
export { drawVectorDrawing } from './svgVector/emit.js';

// ---------------------------------------------------------------- IR types

/** A solid paint: `#rrggbb` plus an alpha in [0, 1]. */
export interface VectorPaint {
  hex: string;
  alpha: number;
}

export interface VectorStroke extends VectorPaint {
  /** Line width in root user units. */
  width: number;
  cap: LineCapStyle;
  join: LineJoinStyle;
  miterLimit: number;
  /** Dash lengths in root user units; `null` for a solid line. */
  dash: number[] | null;
  dashOffset: number;
}

/** Absolute path segment in root user units. */
export type PathSeg =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export interface VectorClip {
  segs: PathSeg[];
  evenOdd: boolean;
}

export interface VectorShape {
  kind: 'path';
  segs: PathSeg[];
  fill: VectorPaint | null;
  evenOdd: boolean;
  stroke: VectorStroke | null;
  /** Clips to intersect before painting, outermost first. */
  clips: VectorClip[];
}

/** A 2-D affine matrix `[a, b, c, d, e, f]` (SVG / PDF convention). */
export type VectorMatrix = readonly [number, number, number, number, number, number];

/** A font the emitter can set text in. `widthOf` measures in the same units
 *  as `size` (the SVG `font-size`); `pdfFont` is the embedded pdf-lib font. */
export interface VectorFont {
  widthOf(text: string, size: number): number;
  pdfFont: PDFFont | null;
}

/** Maps an SVG `font-family` list plus weight / style to an embedded font,
 *  or `null` when none of the families can be provided. */
export type VectorFontResolver = (families: string[], weight: number, italic: boolean) => VectorFont | null;

/** One positioned run of text, in the user space of its `matrix`. */
export interface VectorTextRun {
  text: string;
  font: VectorFont;
  size: number;
  /** Pen position (baseline start) in local units. */
  x: number;
  y: number;
  /** Local → root transform. */
  matrix: VectorMatrix;
  fill: VectorPaint;
  /** The paragraph direction of a run shaped by HarfBuzz (its `direction`
   *  property); absent for text fontkit sets. */
  base?: 'ltr' | 'rtl';
}

export interface VectorText {
  kind: 'text';
  runs: VectorTextRun[];
  clips: VectorClip[];
}

/** A raster picture embedded in the SVG (`<image href="data:…">`),
 *  stretched into its `(x, y, width, height)` box in the user space of
 *  `matrix`. `pdfImage` is filled in by the embedder before drawing. */
export interface VectorImage {
  kind: 'image';
  data: Uint8Array;
  format: 'png' | 'jpeg';
  x: number;
  y: number;
  width: number;
  height: number;
  matrix: VectorMatrix;
  clips: VectorClip[];
  pdfImage?: PDFImage;
}

export type VectorItem = VectorShape | VectorText | VectorImage;

export interface VectorDrawing {
  /** `[minX, minY, width, height]` of the root user space. */
  viewBox: [number, number, number, number];
  /** Parsed `preserveAspectRatio`; `null` for `none`. */
  aspect: { xAlign: 0 | 0.5 | 1; yAlign: 0 | 0.5 | 1; slice: boolean } | null;
  shapes: VectorItem[];
}

export interface SvgToVectorOptions {
  /** Font resolver for `text` elements. Without one, any text bails out. */
  fonts?: VectorFontResolver;
  /** Probe mode: unsupported subtrees are skipped instead of aborting the
   *  whole conversion, so a caller can discover every font the text runs
   *  ask for (through `fonts`) even in an SVG that will end up rasterised.
   *  The returned drawing is not meant to be painted. */
  probe?: boolean;
}

/**
 * Convert SVG markup to a {@link VectorDrawing}, or `null` when the document
 * uses anything outside the supported subset (see the module comment). Never
 * throws.
 */
export function svgToVectorDrawing(svgText: string, options: SvgToVectorOptions = {}): VectorDrawing | null {
  try {
    const doc = parseXml(svgText);
    if (!doc) return null;
    const root = doc.children.find((c) => localName(c.name).local === 'svg' && !localName(c.name).foreign);
    if (!root || doc.children.some((c) => localName(c.name).local !== 'svg')) return null;
    const byId = new Map<string, XmlEl>();
    indexIds(root, byId);

    let viewBox: [number, number, number, number];
    const vb = root.attrs['viewBox'];
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p)) || parts[2]! <= 0 || parts[3]! <= 0) return null;
      viewBox = [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    } else {
      const w = root.attrs['width'];
      const h = root.attrs['height'];
      if (w?.trim().endsWith('%') || h?.trim().endsWith('%')) return null;
      const width = parseLength(w, 300);
      const height = parseLength(h, 150);
      if (width <= 0 || height <= 0) return null;
      viewBox = [0, 0, width, height];
    }
    const aspect = parseAspect(root.attrs['preserveAspectRatio']);

    const walker: Walker = { byId, shapes: [], depth: 0, fonts: options.fonts, probe: options.probe === true };
    // The root's own transform / clip / style apply like a group's.
    walk(walker, root, IDENTITY, ROOT_STYLE, []);
    return { viewBox, aspect, shapes: walker.shapes };
  } catch (err) {
    if (typeof process !== 'undefined' && process.env?.POSTEXT_SVG_DEBUG) console.warn('svgToVectorDrawing:', (err as Error).message);
    if (err instanceof Unsupported) return null;
    return null;
  }
}
