/**
 * Contrast check (#748): the text of a laid-out document against the
 * ground it is set on, found on the VDT so it runs as soon as a page is
 * laid out. A tagged PDF says what the text is; this says whether it can
 * be read.
 *
 * Two renditions, since the same pages go to a screen and to a press:
 *
 * - `screen`: the WCAG 2 contrast ratio of the sRGB colours, as the
 *   canvas, the HTML and an RGB PDF show them.
 * - `print`: the same ratio worked out from the luminance each colour has
 *   on paper — its separation on the job's output profile (the values of
 *   a colour authored in CMYK as they are), read back through the profile
 *   and taken relative to the bare paper, which is the white of a printed
 *   page as the display's white is the white of a screen. Ink is never a
 *   perfect black, least of all on uncoated stock: black on newsprint is
 *   about 5:1 where a screen gives 21:1, and the number says so. Needs
 *   the profile's transform (`options.transform`); without it only the
 *   reversed text is checked.
 *
 * The threshold follows the text's size and weight (large text: 18 pt, or
 * 14 pt bold) and the level asked (`contrast.level`, AA or AAA).
 *
 * In print, text knocked out of an inked ground is reported on its own
 * (`reversedText`) when it is small, italic or light: its strokes fill in
 * on press whatever the ratio says.
 *
 * What it reads: the lines of every block (inline bold, italic, reference
 * and chip colours included), list markers, drop caps, captions, notes and
 * table cells, the words drawn on a picture (a figure's labels, #902, read
 * on their plate, else inside their halo; bare on the picture they are
 * skipped), and the text of design slots (running heads, openers,
 * heading designs, box titles, a composed page's decoration). The ground
 * is the topmost fill under the text: a design box, a callout, a caption
 * bar, a table cell, a chip, the box of a composed page's frame or the
 * template decoration under it (in the page's paint order,
 * `composedPaintOrder`), else the page's paper colour; a translucent colour is blended with what is
 * under it. Text over a picture is skipped (its ground is not a colour),
 * as are comic lettering, ruby and formulas.
 *
 * The pairs `contrast.allow` names (#1124: by colours, by the style the
 * text is set in, or both) are still reported, as accepted with the
 * entry's reason, so a host lists them apart and does not count them.
 */

export type { ContrastMedium, ContrastRole, ReversedTextReason, ContrastPair, ContrastAccepted, ContrastIssue, ContrastKind, ContrastOptions } from './contrast/types.js';
export { blendColors, relativeLuminance, contrastRatio, isLargeText, contrastThreshold, printSeparation, printLuminance, printContrastRatio, contrastMedia } from './contrast/colours.js';
export type { PrintContrastContext } from './contrast/colours.js';
export { contrastPairs } from './contrast/pairs.js';
export { contrastDocument, allowEntryFor } from './contrast/document.js';
