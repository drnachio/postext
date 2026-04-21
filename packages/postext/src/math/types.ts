// Flat path with fill colour and a baked affine transform applied to its
// coordinates. Coordinates are in "viewBox units" — renderers apply a single
// outer scale to convert to target units (px / pt).
export interface MathPath {
  d: string;
  fill: string;
}

export interface MathViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface MathRender {
  tex: string;
  displayMode: boolean;
  /** Self-contained SVG markup (glyph defs inlined into a local <defs>). */
  svg: string;
  /** Flat paths with all ancestor transforms baked into `d`. Fill is hex
   *  (`'currentColor'` is resolved by the caller to the surrounding colour). */
  paths: MathPath[];
  /** Original viewBox — path coordinates are expressed in this space. */
  viewBox: MathViewBox;
  /** Final pixel width at the requested font size. */
  widthPx: number;
  /** Final pixel height (ascent + depth). */
  heightPx: number;
  /** Pixels from the top of the math box to the baseline. */
  ascentPx: number;
  /** Pixels from the baseline to the bottom of the math box. */
  depthPx: number;
  /** Scale applied beyond the natural size (for inline overflow clamp). */
  scale: number;
  /** If present, MathJax rejected this TeX. `paths` is a styled error box. */
  error?: string;
}
