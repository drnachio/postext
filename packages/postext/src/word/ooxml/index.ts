// The OOXML package layer both Word variants build on (#1389).

export type { DocxCoreProps, DocxSettings, EmbeddedFontFace, DocxPackageInput, DocxPackageBuilder } from './types.js';
export { createDocxPackage } from './package.js';
export { WORDML_NAMESPACES, W_NAMESPACES, REL, CONTENT_TYPE } from './constants.js';
export { obfuscateFont, fontKeyFor } from './fonts.js';
export { validateDocxPackage } from './validate.js';
export { xmlProblems } from './wellFormed.js';
