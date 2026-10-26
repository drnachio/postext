// Types of the placement pass its modules share (#1276).
import { layoutCaptionText } from '../../resources/resourceLayout.js';
import type { ResourceRotation } from '../../../types.js';
import type { PlannedFloat } from '../../floats/floatPlacement.js';

/**
 * A strip's geometry in a measure `measure` px wide, at most `max` px
 * tall (flow, block-relative): its own width (`width`) and where it
 * stands along the measure (`align`), its extent across the flow, and its
 * caption (`caption`, laid out in the caption style at the strip's width,
 * numbered when `type` names a resource type, #590). The caption takes
 * its room first: the strip is clamped to what it leaves. Memoised.
 */
export interface StripGeometry {
  stripWidth: number;
  dx: number;
  extent: number;
  /** The caption's lines (y from 0, x from the strip's start), its band
   *  and the gap between it and the strip; absent without a caption. */
  caption?: ReturnType<typeof layoutCaptionText>;
  captionAbove: boolean;
  /** Band plus gap: the room the caption takes in the block. */
  captionRoom: number;
  /** The whole block: strip and caption. */
  height: number;
}

/** How a rotated float is set: turned `direction`, its upright frame
 *  `length` px wide (its extent along the page's height). `upright`: a
 *  resource of a vertical flow, counter-rotated to stand upright on the
 *  sheet, its frame at most `length` px wide (see
 *  `ResourceLayoutInput.upright`). */
export type FloatRotation = { direction: ResourceRotation; length: number; upright?: boolean };

/** A caption set beside the figure (`placement.captionSide`): the band
 *  in the side column, relative to the float's left edge. */
export type CaptionAside = { dx: number; width: number; alignBottom: boolean; offsetY?: number };

/** The tallest body a picture scaled to its slot may take, and its
 *  smallest scale (`placement.shrink`, #626). */
export type BodyCap = { maxBodyHeight: number; minScale: number };

/** Outcome of offering a float a slot: placed whole, placed as the first
 *  rows of a split table (the `rest` replaces it in the queue), deferred
 *  to a later slot, or dropped. */
export type PlaceResult = 'placed' | 'defer' | 'skip' | { rest: PlannedFloat };
