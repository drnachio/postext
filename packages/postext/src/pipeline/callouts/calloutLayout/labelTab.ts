// The label tab of a box: the fence's label on a tab at a top corner,
// with its icon and the rule along the top edge (#1278: split out of
// layoutCallout.ts).
import { dimensionToPx } from '../../../units.js';
import { buildFontString } from '../../../measure/index.js';
import { flowTextWidth } from '../../../measure/vertical.js';
import { tintHex } from './icons.js';
import { pictureTraits, createBoundingBox, type VDTDesignBlock, type VDTDesignTextBlock } from '../../../vdt.js';
import { cornerRadiiPx, type ShapeTab, boxOutline, type ShapeBorder, shapePathBlocks, tabRegionOutline, normalizeBoxStyle } from '../../../design/boxShape.js';
import { iconShapeBlock } from '../../../design/iconShape.js';
import type { ResolvedCalloutStyleConfig } from '../../../types/boxes/callouts.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock/types.js';
import type { Dimension } from '../../../types.js';
import type { CalloutState } from './layoutCalloutState.js';

/** What createLabelTab takes from the pass. */
export interface LabelTabDeps {
  style: ResolvedCalloutStyleConfig;
  ctx: BlockMeasureContext;
  dpi: number;
  em: number;
  px: (d: Dimension) => number;
  labelText: string;
  directText: (block: VDTDesignTextBlock, trackingPx?: number) => VDTDesignTextBlock;
  boxSide: <T extends string>(side: T | "start" | "end") => Exclude<T, "start" | "end"> | "left" | "right";
  labelShown: boolean;
  labelAtFoot: boolean;
  labelJoined: boolean;
  boxWidth: number;
  overlayBlocks: VDTDesignBlock[];
  boxHeight: number;
  borderOn: boolean;
  radii: [number, number, number, number];
  sides: ShapeBorder | undefined;
  boxShapeAt: number;
  boxPainted: boolean;
  boxState: CalloutState;
}

export function createLabelTab(deps: LabelTabDeps) {
  const {
    style, ctx, dpi, em, px, labelText, directText, boxSide, labelShown, labelAtFoot, labelJoined,
    boxWidth, overlayBlocks, boxHeight, borderOn, radii, sides, boxShapeAt, boxPainted, boxState
  } = deps;
  // --- Label tab ---------------------------------------------------------------
  // The fence's `label` on a tab hugging a top corner, rising `offset`
  // above the box; an icon beside it and a rule along the top edge.
  boxState.labelRisePx = 0;
  boxState.labelDropPx = 0;
  if (style.label && labelShown) {
    const lb = style.label;
    const lbFontPx = dimensionToPx(lb.fontSize, dpi, em);
    const lbFont = buildFontString(lb.fontFamily, lbFontPx, lb.fontWeight.toString());
    const padX = dimensionToPx(lb.paddingX, dpi, lbFontPx);
    const tabH = dimensionToPx(lb.height, dpi, lbFontPx);
    // A joined tab (#1059) stands on the edge: it is out of the box by its
    // whole height, whatever `offset` says.
    const rise = labelJoined ? tabH : px(lb.offset);
    const inset = px(lb.inset);
    const textW = flowTextWidth(labelText, lbFont);
    // A picture inside the tab (#981) sits at its start, before the words:
    // the tab is as wide as the picture, the gap, the words and the padding.
    // A drawn ring or dot (#1120) stands where a glyph would, as large as
    // one at `scale` of the words' size.
    const shapeIcon = lb.icon.kind === 'shape';
    const glyphIcon = shapeIcon || (lb.icon.kind === 'glyph' && lb.icon.glyph.length > 0);
    const iconResource = !glyphIcon && lb.icon.resourceId ? ctx.resourceById.get(lb.icon.resourceId) : undefined;
    const iconFileId = iconResource?.bitmap?.fileId ?? iconResource?.svg?.fileId;
    // A glyph (#1054): a character of a font at `scale` of the words' size,
    // as wide as its advance, centred on the tab's middle as the words are.
    const glyphPx = glyphIcon ? lbFontPx * lb.icon.scale : 0;
    const glyphFont = glyphIcon && !shapeIcon ? buildFontString(lb.icon.fontFamily, glyphPx, lb.icon.fontWeight.toString()) : '';
    const glyphW = shapeIcon ? glyphPx : glyphIcon ? flowTextWidth(lb.icon.glyph, glyphFont) : 0;
    const inside = lb.icon.placement === 'inside' && (!!iconFileId || glyphIcon);
    let iconFit = { w: glyphW, h: 0 };
    if (iconFileId) {
      const dims = iconResource?.bitmap ?? iconResource?.svg;
      const boxW = px(lb.icon.width);
      iconFit = { w: boxW, h: tabH };
      if (dims?.width && dims?.height) {
        const k = Math.min(boxW / dims.width, tabH / dims.height);
        iconFit = { w: dims.width * k, h: dims.height * k };
      }
    }
    // The picture painted in the colour of the words (#995), or in a colour
    // of its own (#1120): a print master (a PDF page) cannot be recoloured,
    // so the PDF draws the SVG itself.
    const tint = tintHex(lb.icon.tint, lb.color);
    const tintOf = tint ? { tint } : {};
    const traitsOf = (resource: Parameters<typeof pictureTraits>[0], fileId: string) => {
      const traits = pictureTraits(resource, fileId);
      if (tint) delete traits.pdfFileId;
      return traits;
    };
    const iconRoom = inside ? iconFit.w + px(lb.icon.gap) : 0;
    const tabW = textW + iconRoom + 2 * padX;
    const corner = labelAtFoot ? lb.position.slice('bottom-'.length) : lb.position.startsWith('top-') ? lb.position.slice('top-'.length) : lb.position;
    const tabSide = corner === 'start' ? boxSide('start')
      : corner === 'end' ? boxSide('end')
        : corner === 'right' ? 'right' : 'left';
    const onRight = tabSide === 'right';
    const tabX = onRight ? boxWidth - inset - tabW : inset;
    // A tab at the foot (#1059) is the one at the head turned over: its
    // foot `offset` below the box's.
    const tabY = labelAtFoot ? boxHeight + rise - tabH : -rise;
    if (labelAtFoot) boxState.labelDropPx = Math.max(0, rise);
    else boxState.labelRisePx = Math.max(0, rise);
    if (labelJoined) {
      // One outline for the box and its tab: the box's fill and border,
      // the tab's outer corners rounded as the box's corner it hugs and
      // its sides meeting the box in fillets of that radius (or
      // `fillet`). The stripe keeps to the box, square where a tab flush
      // with the side goes on.
      const cornerIndex = labelAtFoot ? (onRight ? 2 : 3) : (onRight ? 1 : 0);
      const tabRadius = radii[cornerIndex]!;
      // A radius of the tab's own (#1102) rounds its outer corners, the
      // left one and the right one; the fillets keep the box's corner.
      const own = lb.borderRadius !== undefined ? cornerRadiiPx(lb.borderRadius, px) : undefined;
      const outer: number | [number, number] = own
        ? (labelAtFoot ? [own[3], own[2]] : [own[0], own[1]])
        : tabRadius;
      const shapeTab: ShapeTab = {
        edge: labelAtFoot ? 'bottom' : 'top',
        x0: tabX,
        x1: tabX + tabW,
        height: tabH,
        radius: outer,
        fillet: lb.fillet ? Math.max(0, px(lb.fillet)) : tabRadius,
      };
      const boxRect = createBoundingBox(0, 0, boxWidth, boxHeight);
      const outline = boxOutline(boxRect, radii, shapeTab);
      const whole = borderOn && px(style.border.width) > 0 ? { color: style.border.color.hex, widthPx: px(style.border.width) } : null;
      const border: ShapeBorder = sides ?? { top: whole, right: whole, bottom: whole, left: whole };
      const shapes = shapePathBlocks(outline, style.backgroundEnabled ? style.background.hex : undefined, border);
      // A tab in its own fill (#1102): the tab's part of the outline in the
      // label's background, over the box's fill and under the border.
      if (lb.ownBackground) {
        const [tabFill] = shapePathBlocks(tabRegionOutline(boxRect, radii, shapeTab), lb.background.hex, undefined);
        if (tabFill) {
          const at = shapes.findIndex((b) => b.boxPart !== 'fill');
          shapes.splice(at < 0 ? shapes.length : at, 0, tabFill);
        }
      }
      overlayBlocks.splice(boxShapeAt, boxPainted ? 1 : 0, ...shapes);
      if (boxState.stripeBlock) {
        const at = (cx: number, cy: number) => outline.vertices.find((v) => v.x === cx && v.y === cy)?.r ?? 0;
        const clipRadii: [number, number, number, number] = [at(0, 0), at(boxWidth, 0), at(boxWidth, boxHeight), at(0, boxHeight)];
        if (clipRadii.some((r) => r > 0)) boxState.stripeBlock.clip = { x: 0, y: 0, width: boxWidth, height: boxHeight, radii: clipRadii };
        else delete boxState.stripeBlock.clip;
      }
    } else {
      // A tab apart from the box is square unless it sets corners of its
      // own (#1102): a box style with radii, which every backend draws
      // through `boxOutline` (one radius on every corner stays a plain
      // rounded box).
      const tabRadii = lb.borderRadius !== undefined ? cornerRadiiPx(lb.borderRadius, px) : undefined;
      overlayBlocks.push({
        kind: 'box',
        bbox: createBoundingBox(tabX, tabY, tabW, tabH),
        box: tabRadii && tabRadii.some((r) => r > 0)
          ? normalizeBoxStyle({ backgroundColor: lb.background.hex, borderWidthPx: 0, borderRadiusPx: 0, borderRadiiPx: tabRadii })
          : { backgroundColor: lb.background.hex, borderWidthPx: 0, borderRadiusPx: 0 },
      });
    }
    // The words follow the picture: to its right in a left-to-right box,
    // to its left in a right-to-left one (the box's start side).
    const iconAtRight = inside && boxSide('start') === 'right';
    overlayBlocks.push(directText({
      kind: 'text',
      bbox: createBoundingBox(tabX, tabY, tabW, tabH),
      fontString: lbFont,
      color: lb.color.hex,
      lines: [{ text: labelText, xOffset: padX + (inside && !iconAtRight ? iconRoom : 0), baselineY: tabY + tabH / 2 + lbFontPx * 0.36, width: textW }],
      clip: false,
    }));
    let edgeX = onRight ? tabX : tabX + tabW;
    // The glyph block at `x`: pagination furniture to a reader (a tagged
    // PDF's artifact, hidden in HTML), so the tab reads only its words.
    const glyphBlock = (x: number): VDTDesignBlock => (shapeIcon
      ? iconShapeBlock(lb.icon.shape ?? 'ring', x + glyphW / 2, tabY + tabH / 2, glyphW, (lb.icon.color ?? lb.color).hex,
        lb.icon.strokeWidth ? Math.max(0, dimensionToPx(lb.icon.strokeWidth, dpi, lbFontPx)) : undefined)
      : glyphTextBlock(x));
    const glyphTextBlock = (x: number): VDTDesignTextBlock => ({
      kind: 'text',
      bbox: createBoundingBox(x, tabY, glyphW, tabH),
      fontString: glyphFont,
      color: (lb.icon.color ?? lb.color).hex,
      lines: [{ text: lb.icon.glyph, xOffset: 0, baselineY: tabY + tabH / 2 + glyphPx * 0.36, width: glyphW }],
      clip: false,
      artifact: true,
    });
    if (glyphIcon) {
      const gap = px(lb.icon.gap);
      const gx = inside
        ? (iconAtRight ? tabX + tabW - padX - glyphW : tabX + padX)
        : (onRight ? tabX - gap - glyphW : tabX + tabW + gap);
      overlayBlocks.push(glyphBlock(gx));
      if (!inside) edgeX = onRight ? gx : gx + glyphW;
    } else if (inside) {
      const ix = iconAtRight ? tabX + tabW - padX - iconFit.w : tabX + padX;
      overlayBlocks.push({ kind: 'image', bbox: createBoundingBox(ix, tabY + (tabH - iconFit.h) / 2, iconFit.w, iconFit.h), fileId: iconFileId!, ...traitsOf(iconResource, iconFileId!), ...tintOf });
    } else if (iconFileId) {
      const iconW = px(lb.icon.width);
      const gap = px(lb.icon.gap);
      const iconX = onRight ? tabX - gap - iconW : tabX + tabW + gap;
      overlayBlocks.push({ kind: 'image', bbox: createBoundingBox(onRight ? iconX + iconW - iconFit.w : iconX, tabY + (tabH - iconFit.h) / 2, iconFit.w, iconFit.h), fileId: iconFileId, ...traitsOf(iconResource, iconFileId), ...tintOf });
      edgeX = onRight ? iconX + iconW - iconFit.w : iconX + iconFit.w;
    }
    if (lb.rule.enabled) {
      const ruleW = px(lb.rule.width);
      const x0 = onRight ? 0 : edgeX;
      const len = onRight ? edgeX : boxWidth - edgeX;
      if (len > 0) {
        overlayBlocks.push({
          kind: 'rule',
          bbox: createBoundingBox(x0, (labelAtFoot ? boxHeight : 0) - ruleW / 2, len, ruleW),
          color: lb.rule.color.hex,
          thicknessPx: ruleW,
          direction: 'horizontal',
        });
      }
    }
  }
  return {
  };
}
