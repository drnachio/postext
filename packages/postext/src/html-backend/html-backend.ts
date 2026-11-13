export { HTML_TEXT_RESET, renderToHtmlIndexed, renderToHtml } from './render.js';
export type { RenderHtmlOptions, HtmlRenderIndexPage, HtmlRenderIndex } from './render.js';
export { anchoredResourceIds } from './segmentText.js';
export { clearVarnishPaints } from './varnish.js';
export { tintHex, tintFilterElement } from './images.js';
// A whole book as one HTML page (#1544): the CLI's `postext html` and the
// Sandbox's Library write it here.
export { renderHtmlBook, htmlBookFiles, htmlFontFaceRule, redistributableFaces, fontNoteWarning } from './book.js';
export type { RenderHtmlBookOptions, HtmlBookFace, HtmlBookFile, HtmlBookFontNote, HtmlBookWarning } from './book.js';
