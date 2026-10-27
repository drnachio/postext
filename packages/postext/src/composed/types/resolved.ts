// Composed pages: the configuration resolved by `resolvePageTemplate`.
import type { ElementPlacement, Dimension, CalloutPaddingConfig, DesignSlot } from '../../types.js';
import type { FrameGridCell, FrameSize, FrameOverflowConfig, FrameRulesConfig, FrameLook } from './frames.js';
import type { ModuleWidth, PageTemplateGrid, LabelStyle } from './templates.js';

// ---------------------------------------------------------------------------
// Configuration, resolved (`resolvePageTemplate`)
// ---------------------------------------------------------------------------

/** The physical side of a page: its variant. */
export type PageSide = 'recto' | 'verso';

export interface ResolvePageTemplateOptions {
  /** The side of the page the template is laid on: picks
   *  `variants.recto` or `variants.verso`. */
  parity?: PageSide;
  /** The caller lays a sheet of two pages: no variant applies (a spread
   *  has both sides). A `spread` template is always laid this way. */
  spread?: boolean;
  /** The modules the page lays (#1062), in Markdown order: the template
   *  comes back with each one's frames, groups and decoration in its
   *  modules group, scoped by the instance name (`expandModules`). */
  modules?: readonly ComposedModuleUse[];
}

/** A module a page lays (#1062): its instance name (the fence's `name`,
 *  else `<template>[n]`) and its module template. */
export interface ComposedModuleUse {
  name: string;
  template: string;
}

/** A module laid in a template's modules group (#1062), after
 *  `expandModules`: what of the template belongs to it, by scoped name
 *  (`<name>.<frame>`). */
export interface ResolvedModule extends ComposedModuleUse {
  /** The modules group it is laid in. */
  group: string;
  /** JSON pointer of the module template. */
  configPath: string;
  /** Its frames, groups and decoration element ids, scoped, in the module
   *  template's order. */
  frames: string[];
  groups: string[];
  elements: string[];
  /** The module's flow frame: the content of its `:::module` that names
   *  no slot. */
  flow?: string;
  /** The module's frames that take the first heading of a level (or the
   *  contents) inside its `:::module`. */
  takes?: Partial<Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'toc', string>>;
  /** Its template's `width` (#1088). */
  width?: ModuleWidth;
  /** Its template's `grow` and `shrink` (#1095), when it writes them. */
  grow?: number;
  shrink?: number;
  /** The modules group inside `group` it is laid in (`within`, #1088): the
   *  innermost, when groups lie inside each other (#1095). */
  nested?: string;
  /** Its decoration elements (#1189): indices `start` to `end - 1` of the
   *  page's `decoration.elements` (with or without an `id`). Absent when
   *  the module has none. */
  decoration?: { start: number; end: number };
}

export interface ResolvedFrameFit {
  shrinkText: boolean;
  minScale: number;
  scaleImages: boolean;
  imageMinScale: number;
  preferContinue: boolean;
}

export interface ResolvedFrame {
  name: string;
  placement?: ElementPlacement;
  /** Clamped to the template grid; absent when the template has none. */
  grid?: Required<FrameGridCell>;
  width: FrameSize;
  height: FrameSize;
  minWidth?: Dimension;
  maxWidth?: Dimension;
  minHeight?: Dimension;
  maxHeight?: Dimension;
  style?: string;
  layer: number;
  rotate: number;
  verticalAlign: 'top' | 'middle' | 'bottom' | 'justify';
  columns: number;
  columnGap?: Dimension;
  padding?: CalloutPaddingConfig;
  exclude: 'none' | 'push';
  /** `'contour'`: a pushing frame pushes with its pictures' shape (#883).
   *  Absent: with its box. */
  wrap?: 'contour';
  flow: boolean;
  next?: string;
  takes?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'toc';
  pin: boolean;
  grow: number;
  shrink: number;
  priority: number;
  /** Grows with the frames laid inside it (#1117). Absent: it does not. */
  growWith?: 'children' | string[];
  fit: ResolvedFrameFit;
  overflow: FrameOverflowConfig;
  optional: boolean;
  crossGutter: boolean;
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  direction?: 'ltr' | 'rtl';
  /** Ruled lines across the frame (#914), as written (lengths checked). */
  rules?: FrameRulesConfig;
  /** What the frame changes of its style's look (#976), colours and
   *  lengths checked. */
  look?: FrameLook;
  /** `'allow'`: the frame is left out of the overlap checks (#1053).
   *  Absent: checked. */
  overlap?: 'allow';
  /** JSON pointer of the most specific entry that sets this frame
   *  (`/pageTemplates/3/frames/2`, `/pageTemplates/3/variants/recto/frames/0`). */
  configPath: string;
  /** Per field as written: the JSON pointer of the entry whose value won. */
  fieldPaths: Record<string, string>;
}

export interface ResolvedFrameGroup {
  name: string;
  kind: 'stack' | 'row' | 'grid';
  /** For a grid that repeats: the set's frames (before `expandRepeats`),
   *  or its instances, cell after cell (after). */
  frames: string[];
  gap: Dimension;
  /** Grid only (#1061): set when `kind` is `'grid'`. */
  columns?: number;
  columnGap?: Dimension;
  rowGap?: Dimension;
  rowAlign?: 'start' | 'center' | 'end' | 'stretch';
  repeat?: { frames: string[]; max?: number };
  /** After `expandRepeats` (#1061): the items laid, each its number and its
   *  instances (the main frame's first), in cell order. For a modules group
   *  after `expandModules` (#1062): each module, its frames, `module` its
   *  instance name. */
  items?: { item: number; frames: string[]; module?: string; nested?: string }[];
  /** The group takes the page's modules (#1062). */
  modules?: true;
  /** A modules group inside the modules stack of this name (#1088). */
  within?: string;
  /** A modules group inside another (#1088): the module templates it
   *  takes; unset, every one. */
  templates?: string[];
  /** A modules group's `overflow.continueIn` (#1062). */
  overflow?: { continueIn?: string };
  placement?: ElementPlacement;
  grid?: Required<FrameGridCell>;
  align: 'start' | 'center' | 'end' | 'space-between';
  configPath: string;
  fieldPaths: Record<string, string>;
}

export interface ResolvedPageTemplate {
  id: string;
  name?: string;
  area: 'content' | 'trim' | 'bleed';
  grid?: Required<PageTemplateGrid>;
  /** In template order: the root's frames first, then each child's new ones. */
  frames: ResolvedFrame[];
  groups: ResolvedFrameGroup[];
  decoration: DesignSlot;
  /** JSON pointer of each decoration element, in `decoration.elements` order. */
  decorationPaths: string[];
  header?: DesignSlot | false;
  footer?: DesignSlot | false;
  /** JSON pointers of the `header` / `footer` the template takes (its
   *  own, or the one of the template it extends), when it sets one (#857). */
  headerPath?: string;
  footerPath?: string;
  overflowTemplate?: string;
  bodyStyle?: string;
  palette?: string;
  spread: boolean;
  gutter: Dimension;
  role: string;
  /** The variant applied, if any. */
  variant?: PageSide;
  /** The modules laid in the template's modules group (#1062), in order:
   *  set by `expandModules`. */
  modules?: ResolvedModule[];
  /** A module's width in its group (#1088): set on a module that writes
   *  one. */
  width?: ModuleWidth;
  /** A module's `grow` and `shrink` in a row (#1095): set on a module that
   *  writes them. */
  grow?: number;
  shrink?: number;
  /** The template and its ancestors, nearest first. */
  chain: string[];
  /** `/pageTemplates/<i>`. */
  configPath: string;
}

export interface ResolvedLabelStyle extends LabelStyle {
  /** Left out when the style does not say: a borrowed paragraph style's
   *  slant holds then, while `'normal'` written overrides it (#955). */
  fontStyle?: 'normal' | 'italic';
  textTransform?: 'none' | 'uppercase';
  minScale: number;
}
