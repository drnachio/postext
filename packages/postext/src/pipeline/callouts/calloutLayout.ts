/**
 * `:::callout{type="…"}` containers — boxed content (notes, tips, warnings,
 * objectives) styled by a `CalloutStyleConfig`.
 *
 * `layoutCallout` lays out one callout — decoration frame, optional title
 * and the child blocks — against a given width, in block-relative
 * coordinates (frame origin = `(0,0)`). It is pure in `width`, so the
 * placement code can re-run it when a callout lands in a column of a
 * different width, and the pagination phase (`spanBlocks`) can run it at
 * page width for `span: 'page'` boxes. `offsetCalloutToAbsolute` then moves
 * the whole result to its final page position.
 *
 * Children are measured with the ordinary per-block measurer against a
 * *derived* resolved config (`deriveCalloutResolvedConfig`) whose body text
 * and list sections carry the style's `body` / `lists` overrides, so the
 * existing style resolvers produce the callout typography unchanged.
 *
 * A style's `marker` adds a column *outside* the box on its left — an icon
 * with an optional vertical rule — so the frame is `[marker][rule][gap][box]`
 * and as tall as the tallest of the three; the box keeps its own icon,
 * background and padding.
 *
 * A style with `keepTogether: false` may be split by the placement code
 * between its children; every fragment is laid out here as a box of its own
 * (`continuation` drops the title and icon of the later ones).
 *
 * A `:::callout` fence inside a box is a box of its own: laid out
 * recursively with its own style at the parent's inner width, it stacks
 * as one child of the parent (its `marginTop` / `marginBottom` collapse
 * with its neighbours like a paragraph's). Its `span` and `placement` are
 * ignored — it always flows inside its parent. Its frame and children join
 * the parent's flat child list (frame first) and keep the top-level box's
 * `containerId`, so placement and balancing still see one unit;
 * `calloutPath` records the nesting. A fragment of a split box that opens
 * or ends inside a nested box (`openNested`, an unclosed nested fence)
 * redraws the nested frame too, as a continuation when it opens inside it.
 *
 * Limit: `width: 'auto'` shrink-wraps the title only and ignores the
 * children.
 */



export { planCallouts, pickCalloutStyle, deriveCalloutResolvedConfig, deriveCalloutMeasureContext } from './calloutLayout/plan.js';
export type { PlannedCallout } from './calloutLayout/plan.js';
export { boxTextOf, isDesignedBoxHeading, copyDesignedBoxHeading, fenceMarginPx, columnsSpecOf, resolveCalloutAttrs } from './calloutLayout/inputs.js';
export type { CalloutLayoutInput, BoxDesignInfo, BoxDesign, BoxHeadingDesign, OpenNestedCallout, NestedCalloutLayout, CalloutUnit, CalloutLayoutResult, CalloutGroupLayout, ColumnsSpec } from './calloutLayout/inputs.js';
export { offsetBlock, offsetDesignBlock, offsetCalloutToAbsolute, exclusionInsets } from './calloutLayout/geometry.js';
export type { BoxExclusion } from './calloutLayout/geometry.js';
export { layoutCallout } from './calloutLayout/layoutCallout.js';

export type { CalloutLineWidth, GroupPos } from '../columns/cutTypes.js';
