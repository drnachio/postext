// Composed pages: the configuration of page templates, modules and label
// styles.
import type { Dimension, DesignElement, DesignSlot, ColorValue, LeaderStyle } from '../../types.js';
import type { FrameConfig, FrameGroupConfig, FrameLookEntry } from './frames.js';

export interface PageTemplateGrid {
  columns: number;
  rows: number;
  columnGap?: Dimension;
  rowGap?: Dimension;
}

/** In a template patch (`extends`, `variants`): takes the decoration
 *  element `id` of the template it inherits out (#975), as `remove: true`
 *  does for a frame or a group. An id the patch inherits no element under
 *  changes nothing. */
export interface DecorationRemoval {
  id: string;
  remove: true;
}

/** The decoration of a template or of a patch: elements, and in a patch
 *  the removals of inherited ones. */
export interface TemplateDecoration {
  elements: (DesignElement | DecorationRemoval)[];
}

/** The fields a variant or a child template may override. */
export interface PageTemplatePatch {
  /** The rectangle frame coordinates refer to. Default `'content'` (the
   *  page's content area, mirrored per parity like the flow). */
  area?: 'content' | 'trim' | 'bleed';
  /** Merged key by key over the parent's. */
  grid?: PageTemplateGrid;
  /** Merged by `name` over the parent's (`remove: true` drops one). */
  frames?: FrameConfig[];
  /** Merged by `name` over the parent's (`remove: true` drops one). */
  groups?: FrameGroupConfig[];
  /** Elements merged by `id` over the parent's; elements with no id are
   *  added; `{ id, remove: true }` takes an inherited one out (#975). */
  decoration?: TemplateDecoration;
  /** `false` hides; unset inherits the running section's. */
  header?: DesignSlot | false;
  footer?: DesignSlot | false;
  /** Template of the pages added by continuation (`overflow.continueIn:
   *  'next-page'`). Default: this template with only the continued frames
   *  filled. */
  overflowTemplate?: string;
  /** A paragraph style for the page's text. */
  bodyStyle?: string;
  /** A palette override, as heading styles have. */
  palette?: string;
}

export interface PageTemplate extends PageTemplatePatch {
  /** Required, unique among `pageTemplates`. */
  id: string;
  /** Shown in the Sandbox only. */
  name?: string;
  /** Id of a template whose fields this one inherits. */
  extends?: string;
  /** Two facing pages laid as one sheet, starting on a verso. */
  spread?: boolean;
  /** The spine band of a spread. Default 0. */
  gutter?: Dimension;
  /** Patches applied on a recto or a verso page, after `extends`. */
  variants?: { recto?: PageTemplatePatch; verso?: PageTemplatePatch };
  /** Page role reported to design slots. Default `'composed'`.
   *  `'module'` (#1062, DESIGN §12.7): the template is a module, a box of
   *  frames, groups and decoration a page stacks in its modules group
   *  (`:::module{template="…"}`); it has no `area`, header, footer,
   *  variants, spread or overflow template, and no page fence lays it. */
  role?: string;
  /** A module (#1088): its width in a modules row or stack: a length, a
   *  percentage of the group's width, or `'fill'` (an equal share of what
   *  the row's other modules leave). Unset: `'fill'`. A grid's cells are
   *  its columns. */
  width?: ModuleWidth;
  /** A module (#1095): its share of the room a row of modules leaves past
   *  the widths of its modules (`width`). Default 0 for a module with a
   *  width, 1 for a `'fill'` one (which then grows by its share of what is
   *  left, as before). Not read in a stack or a grid. */
  grow?: number;
  /** A module with a `width` (#1095): how much of the room a row of modules
   *  is short by it gives back, in proportion to its width. Default 0
   *  (the row runs past the group's end side). */
  shrink?: number;
}

/** A module's width in its group (#1088). */
export type ModuleWidth = Dimension | { percent: number } | 'fill';

export interface LabelStyle {
  id: string;
  name?: string;
  /** A paragraph style whose type the label borrows. */
  paragraphStyle?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
  /** Default `'normal'`. Written, `'normal'` also switches off the slant
   *  of a borrowed `paragraphStyle` (#955); left out, that style's slant
   *  holds. */
  fontStyle?: 'normal' | 'italic';
  color?: ColorValue;
  /** Default `'none'`. Written, `'none'` also switches off the capitals
   *  of a borrowed `paragraphStyle` (#955). */
  textTransform?: 'none' | 'uppercase';
  letterSpacing?: number;
  halo?: { color: ColorValue; width: Dimension };
  background?: ColorValue;
  padding?: Dimension;
  /** Smallest scale when a label does not fit its width. Default 0.85. */
  minScale?: number;
  /** `'vertical-rl'` sets the label in vertical writing (#902), unless its
   *  anchor says otherwise. Default `'horizontal-tb'`. */
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  /** `'allow'` leaves the labels set in this style out of the
   *  `labelOverlap` check: a map whose names touch in the source (#977).
   *  An anchor's `overlap` wins. Default `'check'`. */
  overlap?: 'check' | 'allow';
  /** How the lines of a label line up inside its box (#1058): `'start'`
   *  and `'end'` in the label's own direction. Left out: as the anchor
   *  places the box (`ResourceAnchor.align`, centred by default), and
   *  `'start'` in a legend. */
  align?: 'start' | 'center' | 'end';
  /** A line round the label's plate (its box grown by `padding`), with or
   *  without a `background` (#1058). */
  border?: { color: ColorValue; width: Dimension };
  /** The corners of the plate (#1058). */
  radius?: Dimension;
  /** `'legend'` (#1058): a map's key. Each line of the label is a row; the
   *  first inline symbol (`:icon`) that opens a row hangs in a column as
   *  wide as the widest of them, so the words of every row line up. */
  kind?: 'legend';
  /** The look of the leaders of labels set in this style (#1057): the line
   *  from a label's box to its anchor's point. A label set away from its
   *  point (`ResourceAnchor.labelAt`) gets one; `leader` on the anchor or
   *  on the label turns it on or off. */
  leader?: LeaderStyle;
}

/** New top-level config keys. `checks.contentInConfig` (DESIGN §2.8)
 *  belongs to #849, which adds it to `PostextConfig` itself. */
export interface ComposedPagesConfigKeys {
  pageTemplates?: PageTemplate[];
  labelStyles?: LabelStyle[];
  /** Named frame looks (#1089). */
  frameLooks?: FrameLookEntry[];
}
