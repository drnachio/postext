/**
 * Composed pages (#846): the types of the design in `DESIGN.md` (#847).
 *
 * The configuration part (page templates, frames, groups, label styles) is
 * public since P2 (#853): `types.ts` re-exports it and `PostextConfig`
 * carries `pageTemplates` and `labelStyles`. The document nodes are the
 * parser's (P3, #854) and the VDT nodes the layout's (P4, #855).
 */


export type { FrameSize, FrameGridCell, FrameFitConfig, FrameOverflowConfig, FrameRulesConfig, FrameConfig, FrameLook, FrameLookEntry, FrameRepeatConfig, FrameGroupConfig } from './types/frames.js';
export type { PageTemplateGrid, DecorationRemoval, TemplateDecoration, PageTemplatePatch, PageTemplate, ModuleWidth, LabelStyle, ComposedPagesConfigKeys } from './types/templates.js';
export type { PageSide, ResolvePageTemplateOptions, ComposedModuleUse, ResolvedModule, ResolvedFrameFit, ResolvedFrame, ResolvedFrameGroup, ResolvedPageTemplate, ResolvedLabelStyle } from './types/resolved.js';

// ---------------------------------------------------------------------------
// Document (parser output)
// ---------------------------------------------------------------------------

export interface SourceRange {
  sourceStart: number;
  sourceEnd: number;
}

/** A `::::page{template}` fence. */
export interface ComposedPageNode extends SourceRange {
  type: 'composedPage';
  template: string;
  spread: boolean;
  attrs: Record<string, string>;
  attrSources: Record<string, SourceRange>;
  /** Ordinal of the fence in its chapter: the same in every locale. */
  fenceIndex: number;
  /** Indices of content blocks per slot, in Markdown order. */
  slots: Record<string, number[]>;
  /** Blocks that name no slot. */
  unassigned: number[];
}

export interface FigureLabelNode extends SourceRange {
  text: string;
  at: { anchor: string } | { x: number; y: number };
  style?: string;
  /** The `leader` attribute (#1057): on (`leader`), off (`leader="none"`). */
  leader?: boolean;
  sourceMap?: number[];
}

// ---------------------------------------------------------------------------
// Layout (VDT)
// ---------------------------------------------------------------------------

// `ReflowEventKind`, `ReflowEvent`, `VDTFrame` and `VDTComposedPage` live
// in `vdt.ts` with the rest of the VDT (#855).
export type { ReflowEventKind, ReflowEvent, VDTFrame, VDTComposedPage } from '../vdt.js';

// `FrameOverflowProposal` and `FrameFitStep` live in `vdt.ts` with the
// `frameOverflow` warning that carries them (#858).
export type { FrameOverflowProposal, FrameFitStep } from '../vdt.js';
