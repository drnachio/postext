// Page templates (composed pages, #853): defaults, `extends` and variant
// resolution, and the normalisation of frames, groups and label styles.
// Pure; nothing here lays anything out (that is P4, #855).



export { DEFAULT_FRAME_FIT, DEFAULT_FRAME, DEFAULT_FRAME_GROUP, DEFAULT_PAGE_TEMPLATE, MODULE_ROLE, isModuleTemplate, DEFAULT_LABEL_STYLE, FRAME_VERTICAL_ALIGNS, FRAME_EXCLUDES, FRAME_WRAPS, FRAME_OVERLAPS, FRAME_TAKES, FRAME_GROUP_KINDS, FRAME_GRID_ROW_ALIGNS, FRAME_GROUP_ALIGNS, TEMPLATE_AREAS, FRAME_WRITING_MODES, FRAME_DIRECTIONS, LABEL_FONT_STYLES, LABEL_TEXT_TRANSFORMS, LABEL_OVERLAPS, LABEL_ALIGNS, LABEL_KINDS, LOOK_TREE, isFrameDimension, normalizeFrameSize } from './templates/defaults.js';
export { anchorTarget, continueInFrame, continueInTemplate, continueInPage, resolveContinueIn, repeatInstance, repeatInstanceName, repeatedFrames } from './templates/references.js';
export { templateChain, templateIndex } from './templates/merging.js';
export type { TemplateIssue } from './templates/merging.js';
export { moduleWidth, moduleFactor, growWithOf, normalizeFrame, normalizeFrameLooks, lookOver } from './templates/normalize.js';
export { resolveTemplateAt, resolvePageTemplate, resolveLabelStyles, stripPageTemplatesDefaults, stripLabelStylesDefaults } from './templates/resolve.js';
export type { PageTemplateSource } from './templates/resolve.js';
