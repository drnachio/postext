// Composed pages (#846): the config types live next to their resolver.
export type {
  FrameSize, FrameGridCell, FrameFitConfig, FrameOverflowConfig, FrameRulesConfig, FrameLook, FrameLookEntry, FrameConfig, FrameGroupConfig, FrameRepeatConfig, ComposedModuleUse, ResolvedModule,
  PageTemplateGrid, DecorationRemoval, TemplateDecoration, PageTemplatePatch, PageTemplate, LabelStyle, ComposedPagesConfigKeys,
  PageSide, ResolvePageTemplateOptions, ResolvedFrameFit, ResolvedFrame, ResolvedFrameGroup,
  ResolvedPageTemplate, ResolvedLabelStyle,
} from './composed/types.js';

// The engine's types, one module per topic (#1276).
export type * from './types/resources/resourceTypes.js';
export type * from './types/resources/video.js';
export type * from './types/resources/resources.js';
export type * from './types/content.js';
export type * from './types/page.js';
export type * from './types/layout.js';
export type * from './types/text/locale.js';
export type * from './types/text/bodyText.js';
export type * from './types/text/verse.js';
export type * from './types/text/code.js';
export type * from './types/resources/tableStyles.js';
export type * from './types/resources/scoreStyles.js';
export type * from './types/resources/diagramStyles.js';
export type * from './types/text/paragraphStyles.js';
export type * from './types/boxes/calloutParts.js';
export type * from './types/boxes/callouts.js';
export type * from './types/boxes/exercises.js';
export type * from './types/text/inlineStyles.js';
export type * from './types/structure/headings.js';
export type * from './types/columnBalancing.js';
export type * from './types/text/lists.js';
export type * from './types/output/debug.js';
export type * from './types/output/viewers.js';
export type * from './types/output/folio.js';
export type * from './types/text/math.js';
export type * from './types/structure/footnotes.js';
export type * from './types/structure/citations.js';
export type * from './types/structure/links.js';
export type * from './types/text/cjk.js';
export type * from './types/output/print.js';
export type * from './types/text/fonts.js';
export type * from './types/designPlacement.js';
export type * from './types/designElements.js';
export type * from './types/structure/headerFooter.js';
export type * from './types/structure/parts.js';
export type * from './types/structure/headingStyles.js';
export type * from './types/structure/toc.js';
export type * from './types/structure/bookIndex.js';
export type * from './types/comics.js';
export type * from './types/config.js';
