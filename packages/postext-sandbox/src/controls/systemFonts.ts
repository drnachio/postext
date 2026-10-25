// The families the Fontsource catalogue is not asked for (#753).
//
// A `font-family` list ends in the faces of the reader's machine: the
// guide's figures are set in `Geist, -apple-system, 'Segoe UI', 'Helvetica
// Neue', Arial, sans-serif`, one web font and four names only an operating
// system answers. The engine asks the host for every named family of such a
// list, and each of those cost a lookup in the Fontsource catalogue, a
// Google Fonts style sheet and a file per weight and style, none of which
// Fontsource has. They are told apart here by name, in two groups:
//
//   - the CSS generic keywords, which name no face: nothing is asked of
//     any service for them;
//   - the faces Apple, Microsoft and Adobe ship under names of their own:
//     Fontsource is not asked, and the provider of the SVG pictures and the
//     PDF gives them up at once. Google Fonts answers some of these names
//     with faces of its own (Helvetica Neue, Georgia, Times New Roman,
//     Verdana, Tahoma, Courier New), which a book that names one in a
//     setting is previewed with: that style sheet is still asked for.
//
// A name belongs here only if Fontsource does not serve it. Roboto, Noto
// Sans, Ubuntu, Cantarell or DejaVu Sans are system fonts somewhere and web
// fonts too: they stay out, and are loaded like any other family.

/** CSS generic families, CSS-wide keywords and the aliases browsers give
 *  the interface font. */
const GENERIC_FONT_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'default',
  '-apple-system', 'blinkmacsystemfont',
]);

const SYSTEM_FONT_FAMILIES = new Set([
  // macOS and iOS.
  'helvetica', 'helvetica neue', 'san francisco', 'sf pro', 'sf pro text', 'sf pro display', 'sf mono',
  'lucida grande', 'geneva', 'menlo', 'monaco', 'times', 'courier', 'palatino', 'optima', 'futura',
  'avenir', 'avenir next', 'gill sans', 'baskerville', 'didot', 'hoefler text', 'american typewriter',
  'apple color emoji', 'apple sd gothic neo', 'geeza pro',
  'pingfang sc', 'pingfang tc', 'pingfang hk', 'hiragino sans', 'hiragino sans gb',
  'hiragino kaku gothic pro', 'hiragino kaku gothic pron', 'hiragino mincho pro', 'hiragino mincho pron',
  'songti sc', 'songti tc', 'heiti sc', 'kaiti sc', 'stsong', 'stheiti', 'stkaiti', 'stfangsong',
  // Windows and Office.
  'arial', 'arial black', 'arial narrow', 'segoe ui', 'segoe ui emoji', 'segoe ui symbol', 'tahoma',
  'verdana', 'trebuchet ms', 'georgia', 'times new roman', 'courier new', 'consolas', 'calibri',
  'cambria', 'candara', 'constantia', 'corbel', 'impact', 'comic sans ms', 'lucida console',
  'lucida sans unicode', 'palatino linotype', 'book antiqua', 'garamond', 'century gothic',
  'microsoft sans serif', 'microsoft yahei', 'microsoft jhenghei', 'simsun', 'nsimsun', 'simhei',
  'kaiti', 'fangsong', 'yu gothic', 'yu gothic ui', 'yu mincho', 'meiryo', 'meiryo ui', 'ms gothic',
  'ms pgothic', 'ms mincho', 'ms pmincho', 'malgun gothic', 'traditional arabic', 'simplified arabic',
  'arabic typesetting',
  // Adobe's names for the families the catalogues carry as Noto Sans and
  // Noto Serif SC, TC, JP and KR.
  'source han sans', 'source han sans sc', 'source han sans tc', 'source han sans jp', 'source han sans kr',
  'source han serif', 'source han serif sc', 'source han serif tc', 'source han serif jp', 'source han serif kr',
]);

function nameOf(family: string): string {
  return family.trim().replace(/^(['"])(.*)\1$/, '$2').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Whether `family` is a CSS generic keyword (`sans-serif`, `system-ui`,
 *  `-apple-system`…): a name no service has a face for. Quotes and case
 *  are ignored. */
export function isGenericFontFamily(family: string): boolean {
  return GENERIC_FONT_FAMILIES.has(nameOf(family));
}

/** Whether `family` is a CSS generic keyword or a face of an operating
 *  system: a name Fontsource is not asked for. Quotes and case are
 *  ignored. */
export function isSystemFontFamily(family: string): boolean {
  const name = nameOf(family);
  return GENERIC_FONT_FAMILIES.has(name) || SYSTEM_FONT_FAMILIES.has(name);
}

/** Whether `fontSet` has a face of `family` (quotes and case aside). */
function hasFaceOf(fontSet: Iterable<{ family: string }> | undefined, family: string): boolean {
  if (!fontSet) return false;
  const name = nameOf(family);
  for (const face of fontSet) if (nameOf(face.family) === name) return true;
  return false;
}

/**
 * Whether a family can be declared with OpenType features (#1237, the
 * engine's `setFigureStyleFamilies`): any family the Sandbox loads files
 * of. A face only an operating system answers for has no file to declare
 * again with them, so a style's figures leave it as it is, unless the book
 * carries files under that name (faces of the family in `fontSet`).
 */
export function takesFigureFeatures(family: string, fontSet?: Iterable<{ family: string }>): boolean {
  return !isSystemFontFamily(family) || hasFaceOf(fontSet, family);
}
