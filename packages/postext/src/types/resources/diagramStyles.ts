import type { ColorValue } from '../page.js';

/** Styling for embedded SVG diagrams (`kind: 'svg'` resources). When
 *  {@link singleInk} is on, every colour in the SVG is remapped to a tint of
 *  {@link inkColor} by luminance — light fills become light tints, dark
 *  strokes and text approach the full ink — so figures reproduce faithfully
 *  when a document is printed with a single spot colour. */
export interface DiagramStyleConfig {
  /** Recolour diagrams to tints of a single ink. Default `false`. */
  singleInk?: boolean;
  /** The ink. Defaults to the document's main palette colour. */
  inkColor?: ColorValue;
  /** Embed the faces an SVG's text names (`font-family`) in the picture as
   *  `@font-face` data URIs before it is shown as an image (canvas, HTML,
   *  EPUB, the PDF's raster fallback), so its labels are set in the
   *  document's fonts: an image cannot see the page's web fonts. Never
   *  written into the stored file. A resource opts out with
   *  `svg.inlineFonts: false`. Default `true`. */
  inlineFonts?: boolean;
}

export interface ResolvedDiagramStyleConfig {
  singleInk: boolean;
  inkColor: ColorValue;
  inlineFonts: boolean;
}
