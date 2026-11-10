// What a page-faithful writer outside the engine needs beside the page
// display list (`pageDisplayList`, on the package root): the styles the
// engine resolved a block with, colours and font strings as the engine
// reads them, and the sizes of pictures. `postext-idml` is written on it.

export { resolveBodyStyle, resolveParagraphStyle, resolveHeadingStyle, resolveBlockquoteStyle } from '../pipeline/styles.js';
export type { BlockStyle } from '../pipeline/styles.js';
export { deriveCalloutResolvedConfig } from '../pipeline/callouts/calloutLayout/plan.js';
export { resolvedLocale } from '../pipeline/config.js';
export { resolveTabSettings } from '../defaults/text/tabStops.js';
export { authoredCmykColors } from '../color/authored.js';
export { parseColor, toHex } from '../checks/contrast/colours.js';
export type { Rgba } from '../checks/contrast/colours.js';
export { wordColor as cssColor } from '../word/formatted/units.js';
export { parseFontString, findPxSize, withPxSize, fontStringFamilies } from '../measure/fontString.js';
export { svgSize, bitmapInfo } from '../bundle/manifest/sizes.js';
export { formatFieldCalc, parseFieldCalc } from '../parse/formFields.js';
export type { FormFieldSpec, FormFieldCalc } from '../parse/formFields.js';
export { CHIP_PLACEHOLDER } from '../parse/inlineFormatting/inlineDirectives.js';
export type { VDTFrame } from '../vdt/pages/composed.js';
export type { VDTDocument } from '../vdt/document.js';
export type { VDTPathCommand, VDTPathStroke, VDTDesignBoxStyle } from '../vdt/design.js';
