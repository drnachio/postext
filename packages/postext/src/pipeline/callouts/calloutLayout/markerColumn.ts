// The marker column beside a box (its icon and rule), the box moved by
// the marker and the label tab's rise, and the frame's overlay
// (#1278: split out of layoutCallout.ts).
import { offsetDesignBlock, offsetBlock } from './geometry.js';
import { type VDTDesignBlock, createBoundingBox, type VDTDesignSlot, type VDTBlock } from '../../../vdt.js';
import { buildIconBlock } from './icons.js';
import type { ResolvedCalloutStyleConfig } from '../../../types/boxes/callouts.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock/types.js';
import type { Dimension } from '../../../types.js';
import type { CalloutGroupLayout } from './inputs.js';
import type { BoundingBox } from '../../../vdt/document.js';
import type { CalloutState } from './layoutCalloutState.js';

/** What createMarkerColumn takes from the pass. */
export interface MarkerColumnDeps {
  style: ResolvedCalloutStyleConfig;
  ctx: BlockMeasureContext;
  px: (d: Dimension) => number;
  hasMarker: boolean;
  markerSize: number;
  ruleOn: boolean;
  ruleW: number;
  markerColumn: number;
  boxWidth: number;
  overlayBlocks: VDTDesignBlock[];
  childBlocks: VDTBlock[];
  groupLayouts: CalloutGroupLayout[];
  boxHeight: number;
  innerRect: BoundingBox;
  boxState: CalloutState;
}

export function createMarkerColumn(deps: MarkerColumnDeps) {
  const {
    style, ctx, px, hasMarker, markerSize, ruleOn, ruleW, markerColumn, boxWidth, overlayBlocks,
    childBlocks, groupLayouts, boxHeight, innerRect, boxState
  } = deps;
  // --- Marker column + frame -----------------------------------------------------
  // The frame is as tall as the tallest of box, marker and rule; the three
  // are centred on each other (`marker.align: 'center'`) or top-aligned.
  const ruleLen = ruleOn ? Math.max(px(style.marker.rule.length), boxHeight) : 0;
  const totalHeight = Math.max(boxHeight, markerSize, ruleLen);
  const centerMarker = style.marker.align === 'center';
  const boxDy = centerMarker ? (totalHeight - boxHeight) / 2 : 0;
  const width = markerColumn + boxWidth;
  if (markerColumn > 0 || boxDy > 0) {
    for (const b of overlayBlocks) offsetDesignBlock(b, markerColumn, boxDy);
    for (const blk of childBlocks) offsetBlock(blk, markerColumn, boxDy);
    for (const g of groupLayouts) g.top += boxDy;
    innerRect.x += markerColumn;
    innerRect.y += boxDy;
  }
  // Paint order: marker, rule, then the box decoration (the marker lies
  // outside the box, so the order only matters for readers of the overlay).
  const markerBlocks: VDTDesignBlock[] = [];
  boxState.markerFileId = undefined;
  boxState.markerFormat = undefined;
  if (hasMarker) {
    const markerY = centerMarker ? (totalHeight - markerSize) / 2 : 0;
    const built = buildIconBlock(style.marker, 0, markerY, markerSize, ctx, markerSize, px);
    if (built) {
      markerBlocks.push(built.block);
      boxState.markerFileId = built.fileId;
      boxState.markerFormat = built.format;
    }
    if (ruleOn) {
      const ruleY = centerMarker ? (totalHeight - ruleLen) / 2 : 0;
      markerBlocks.push({
        kind: 'rule',
        bbox: createBoundingBox(markerSize, ruleY, ruleW, ruleLen),
        color: style.marker.rule.color.hex,
        thicknessPx: ruleW,
        direction: 'vertical',
      });
    }
  }
  // The label tab rises above the box inside the block: the box starts
  // `labelRisePx` down, so the tab keeps its room at a column head too,
  // where the top margin is dropped.
  if (boxState.labelRisePx > 0) {
    for (const b of overlayBlocks) offsetDesignBlock(b, 0, boxState.labelRisePx);
    for (const b of markerBlocks) offsetDesignBlock(b, 0, boxState.labelRisePx);
    for (const blk of childBlocks) offsetBlock(blk, 0, boxState.labelRisePx);
    for (const g of groupLayouts) g.top += boxState.labelRisePx;
    innerRect.y += boxState.labelRisePx;
  }
  // A tab at the foot (#1059) hangs below the box inside the block too.
  const frameHeight = totalHeight + boxState.labelRisePx + boxState.labelDropPx;
  const overlay: VDTDesignSlot = {
    bbox: createBoundingBox(0, 0, width, frameHeight),
    blocks: [...markerBlocks, ...overlayBlocks],
  };
  return {
    width, frameHeight, overlay
  };
}
