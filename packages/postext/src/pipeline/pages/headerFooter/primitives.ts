// The header and footer containers in the page margin, and the laid-out
// design primitives (text, path, image, rule, box) turned into the VDT
// blocks the renderers paint (#1276: split out of headerFooter.ts).
import { fontFamilyOf, measureCentralBaseline, getMeasureRegion, getMeasureUprightDigits } from '../../../measure/vertical.js';
import type { DesignTextAlign } from '../../../types.js';
import { type VDTDesignBlock, type VDTDesignPathBlock, createBoundingBox, type VDTDesignImageBlock, type VDTDesignTextBlock, type VDTDesignRuleBlock, type VDTDesignBoxBlock, type VDTDesignBoxStyle } from '../../../vdt.js';
import { pathInkBox } from '../../../design/pathBlock.js';
import { type ResolvedPrimitive, type ResolvedPathPrimitive, type ResolvedImagePrimitive, type ResolvedTextPrimitive, textVerticalOffset, trailingTracking, type ResolvedRulePrimitive, type ResolvedBoxPrimitive } from '../../../design/layout.js';

/** Slots live in the page margin area between the body edge and the trim
 *  edge. Header slot container: from the trim top down to body top.
 *  Footer slot container: from body bottom down to the trim bottom.
 *
 *  We use a larger container (the full vertical extent of the margin area)
 *  so that anchors like `bottom-center` / `bottom-right` for headers and
 *  `top-*` for footers align with the body edge (the body-facing side of
 *  the margin area) rather than the outer page edge.
 *
 *  The outer edge is the trim box, not the sheet: with cut lines the sheet
 *  also carries the bleed and the marks band, which would push an element
 *  anchored to the outer edge onto (or past) the trim line. Elements that
 *  should reach the sheet use `anchor.to: 'bleed' | 'page'`.
 *
 *  This matches the legacy semantics: `marginFromBody` was "distance from
 *  body edge" — the migration translates that to an offset of the same
 *  magnitude from the body-facing edge. */
export function headerContainerBbox(
  contentArea: { x: number; y: number; width: number },
  trimBox: { y: number },
) {
  // Header: spans from the trim top to body top.
  return { x: contentArea.x, y: trimBox.y, width: contentArea.width, height: Math.max(0, contentArea.y - trimBox.y) };
}

export function footerContainerBbox(
  contentArea: { x: number; y: number; width: number; height: number },
  trimBox: { y: number; height: number },
) {
  const bodyBottom = contentArea.y + contentArea.height;
  return {
    x: contentArea.x,
    y: bodyBottom,
    width: contentArea.width,
    height: Math.max(0, trimBox.y + trimBox.height - bodyBottom),
  };
}

function textAlignOffsetX(
  align: DesignTextAlign,
  contentWidth: number,
  lineWidth: number,
  /** The text starts on the right of its box (`ResolvedTextPrimitive.startRight`). */
  startRight = false,
): number {
  // A justified line fills its room; the last line of a paragraph is set
  // flush with the start. `start` / `end` are the sides the text's
  // direction reads from and to.
  const side = align === 'start' || align === 'justify'
    ? (startRight ? 'right' : 'left')
    : align === 'end' ? (startRight ? 'left' : 'right') : align;
  if (side === 'left') return 0;
  if (side === 'right') return Math.max(0, contentWidth - lineWidth);
  return Math.max(0, (contentWidth - lineWidth) / 2);
}

/** A laid-out design primitive as the VDT block the renderers paint (also
 *  used by the comics lettering, which lays out balloon text as design
 *  text). */
export function primitiveToBlock(prim: ResolvedPrimitive): VDTDesignBlock {
  if (prim.kind === 'text') return textPrimitiveToBlock(prim);
  if (prim.kind === 'rule') return rulePrimitiveToBlock(prim);
  if (prim.kind === 'image') return imagePrimitiveToBlock(prim);
  if (prim.kind === 'path') return pathPrimitiveToBlock(prim);
  return boxPrimitiveToBlock(prim);
}

/** A path element's outline as the vector block (#1060): the block's box
 *  is the ink's (`pathInkBox`), for hit tests and clips. */
function pathPrimitiveToBlock(prim: ResolvedPathPrimitive): VDTDesignPathBlock {
  const block: VDTDesignPathBlock = {
    kind: 'path',
    bbox: createBoundingBox(0, 0, 0, 0),
    subpaths: prim.subpaths.map((sp) => sp.map((c) => ({ ...c }))),
    ...(prim.fill ? { fill: prim.fill } : {}),
    ...(prim.stroke ? { stroke: { ...prim.stroke, ...(prim.stroke.dash ? { dash: [...prim.stroke.dash] } : {}) } } : {}),
    // A connector's end marks (#1056).
    ...(prim.markers ? { markers: prim.markers.map((m) => ({ ...m })) } : {}),
    // Painted after the frames (#1076).
    ...(prim.over ? { over: true as const } : {}),
  };
  block.bbox = pathInkBox(block);
  return block;
}

function imagePrimitiveToBlock(prim: ResolvedImagePrimitive): VDTDesignImageBlock {
  return {
    kind: 'image',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    fileId: prim.fileId,
    ...(prim.imageKind ? { imageKind: prim.imageKind } : {}),
    ...(prim.pdfFileId ? { pdfFileId: prim.pdfFileId } : {}),
    ...(prim.upright ? { upright: true } : {}),
    ...(prim.altText ? { altText: prim.altText } : {}),
    ...(prim.crop ? { crop: { ...prim.crop } } : {}),
  };
}

function textPrimitiveToBlock(prim: ResolvedTextPrimitive): VDTDesignTextBlock {
  // Lines taller than the box run out on the side the alignment leaves
  // free (EF-138). A drop cap's primitive carries the offset of its text
  // already, and is top-aligned.
  const vOffset = textVerticalOffset(prim.verticalAlign, prim.contentHeight, prim.lines);

  // A centred or right-aligned line is placed by its ink: the tracking
  // after its last glyph does not count (EF-153).
  // A vertical block's lines stay in its own turned frame: baselines from
  // the box's right edge (see `VDTDesignTextBlock.vertical`).
  const lines = prim.lines.map((l) => ({
    text: l.text,
    xOffset: prim.contentX + (l.xOffset ?? 0)
      + textAlignOffsetX(prim.align, prim.contentWidth - (l.xOffset ?? 0), l.width - trailingTracking(l.text, prim.letterSpacingPx), prim.startRight),
    baselineY: (prim.vertical ? 0 : prim.y) + prim.contentY + vOffset + l.baselineY,
    width: l.width,
    ...(l.runs ? { runs: l.runs.map((r) => ({ ...r })) } : {}),
    ...(l.wordSpacingPx !== undefined ? { wordSpacingPx: l.wordSpacingPx } : {}),
    ...(l.order ? { order: [...l.order] } : {}),
    ...(l.wordOverflow ? { wordOverflow: true as const } : {}),
    ...(l.wordDivided ? { wordDivided: l.wordDivided } : {}),
  }));

  return {
    kind: 'text',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    fontString: prim.fontString,
    color: prim.color,
    lines,
    box: prim.box
      ? {
          backgroundColor: prim.box.backgroundColor,
          borderColor: prim.box.borderColor,
          borderWidthPx: prim.box.borderWidthPx,
          borderRadiusPx: prim.box.borderRadiusPx,
          ...shapeFields(prim.box),
        }
      : undefined,
    clip: prim.needsClip,
    // Negative tracking (a tightened display title) is painted too (EF-82).
    ...(prim.letterSpacingPx !== undefined && prim.letterSpacingPx !== 0
      ? { letterSpacingPx: prim.letterSpacingPx }
      : {}),
    ...(prim.stroke ? { stroke: { ...prim.stroke } } : {}),
    ...(prim.dotted ? { dotted: { ...prim.dotted } } : {}),
    ...(prim.direction ? { direction: prim.direction } : {}),
    ...(prim.vertical ? { vertical: verticalTextOf(prim) } : {}),
  };
}

/** How a vertical design text is set (`VDTDesignTextBlock.vertical`): the
 *  document's region and upright digits, the central axis of each family
 *  of its runs. */
function verticalTextOf(prim: ResolvedTextPrimitive): NonNullable<VDTDesignTextBlock['vertical']> {
  const centralBaselines: Record<string, number> = {};
  const add = (font: string): void => {
    const family = fontFamilyOf(font);
    if (!(family in centralBaselines)) centralBaselines[family] = measureCentralBaseline(family);
  };
  add(prim.fontString);
  for (const line of prim.lines) for (const run of line.runs ?? []) add(run.fontString);
  return { region: getMeasureRegion(), uprightDigits: getMeasureUprightDigits(), centralBaselines };
}

function rulePrimitiveToBlock(prim: ResolvedRulePrimitive): VDTDesignRuleBlock {
  return {
    kind: 'rule',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    color: prim.color,
    thicknessPx: prim.thicknessPx,
    direction: prim.direction,
  };
}

function boxPrimitiveToBlock(prim: ResolvedBoxPrimitive): VDTDesignBoxBlock {
  return {
    kind: 'box',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    box: {
      backgroundColor: prim.box.backgroundColor,
      borderColor: prim.box.borderColor,
      borderWidthPx: prim.box.borderWidthPx,
      borderRadiusPx: prim.box.borderRadiusPx,
      ...shapeFields(prim.box),
    },
  };
}

/** A box's corners of their own and border per side (#1059), copied. */
function shapeFields(box: Pick<VDTDesignBoxStyle, 'borderRadiiPx' | 'borderSides'>): Pick<VDTDesignBoxStyle, 'borderRadiiPx' | 'borderSides'> {
  return {
    ...(box.borderRadiiPx ? { borderRadiiPx: [...box.borderRadiiPx] as [number, number, number, number] } : {}),
    ...(box.borderSides ? { borderSides: { ...box.borderSides } } : {}),
  };
}
