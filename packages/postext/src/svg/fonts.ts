// The document's fonts inside SVG pictures (#630).
//
// An SVG is shown through an image (`<img>`, a canvas `drawImage`, an EPUB
// picture), and an image document cannot see the page's web fonts, so
// `<text font-family="IBM Plex Sans">` falls back to a system face. Before
// an SVG is decoded or handed out as a URL, the faces its text runs ask for
// are embedded in it: one `@font-face` per font file, its bytes as a data
// URI, in a `<style>` right after the root start tag.
//
//   svgFontRequests(svg)                    the (families, weight, style)
//                                           each run asks for, with its
//                                           characters
//   inlineSvgFonts(svg, provider, opts)     embed the faces a provider
//                                           answers (async)
//   inlineSvgFontsSync(svg, provider, opts) the same from bytes in memory
//
// The provider has the contract of postext-pdf's `PdfFontProvider`, so one
// provider serves both: it is told the characters each face sets and may
// answer with only the unicode-range slices that hold them (Fontsource and
// Google Fonts serve a family as several such files). A family the SVG
// declares itself with `@font-face` is left alone. Inlining happens at
// decode or export time only, never into the stored resource bytes, and a
// family `withhold` names (not redistributable) stays out of anything that
// leaves the app.
//
// Single ink recolours the markup first (applySingleInkToSvg), then the
// faces are inlined: recolour → inline.

export { DEFAULT_SVG_FONT_MAX_BYTES } from './fonts/types.js';
export type { SvgFontStyle, SvgFontFormat, SvgFontRequest, SvgFontProviderRequest, SvgFontProvider, SvgFontSyncProvider, SvgFontStatus, SvgFontFaceReport, SvgFontWarning, InlineSvgFontsOptions, SvgFontInlining } from './fonts/types.js';
export { parseFontFamilyList, isFontFaceOnlyStyleSheet, svgFontRequests, svgDeclaredFontFamilies } from './fonts/scan.js';
export { sniffFontFormat, fontFaceRule, injectSvgStyle, inlineSvgFontsDetailed, inlineSvgFontsDetailedSync, inlineSvgFonts, inlineSvgFontsSync, chainSvgFontProviders } from './fonts/inline.js';
