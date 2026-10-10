// Where the Sandbox's SVG pictures get their fonts (#630).
//
// The previews show SVG resources through an `<img>` (canvas) or as
// `<img src>` (HTML), and an image document cannot see the page's
// `FontFace`s. The engine inlines the faces an SVG's text names
// (`prepareSvgMarkup` / `inlineSvgFontsDetailed`); this module is the
// provider it asks: the book's custom (uploaded) families first, as
// uploaded, then Google families as Fontsource's WOFF2 slices that hold the
// characters the SVG sets — the files the PDF embeds, uncompressed there.

import type { SvgFontProvider } from 'postext';
import { createPdfFontProvider } from '../viewport/pdfFontProvider';
import { getCustomFontFamily, onCustomFontsChanged } from './fontLoader';

let provider: SvgFontProvider | null = null;

/** The Sandbox's SVG font provider (custom fonts, then Google). */
export function sandboxSvgFontProvider(): SvgFontProvider {
  provider ??= createPdfFontProvider({ raw: true });
  return provider;
}

let generation = 0;
let listening = false;

/** Bumped whenever the custom fonts change: decodes of SVG pictures made
 *  before carry the old faces and are made again. */
export function svgFontGeneration(): number {
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    onCustomFontsChanged(() => {
      generation++;
    });
  }
  return generation;
}

/** Families an exported file must not carry: custom families marked as
 *  not redistributable. */
export function withholdNonRedistributable(family: string): boolean {
  return getCustomFontFamily(family)?.redistributable === false;
}
