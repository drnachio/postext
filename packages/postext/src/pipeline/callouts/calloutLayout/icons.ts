// The icon of a box, set in the box or in its marker column: tint, aspect
// fit in its square, footprint and the block that paints it
// (#1276: split out of calloutLayout.ts).
import { flowTextWidth, lineBaselineOffset } from '../../../measure/vertical.js';
import type { ResolvedCalloutStyleConfig, ColorValue, Dimension } from '../../../types.js';
import { type BoundingBox, createBoundingBox, type VDTDesignBlock, pictureTraits } from '../../../vdt.js';
import { buildFontString } from '../../../measure/index.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import { iconShapeBlock } from '../../../design/iconShape.js';

// ---------------------------------------------------------------------------
// Icons (shared by the in-box icon and the marker)
// ---------------------------------------------------------------------------

type IconSpec = Omit<ResolvedCalloutStyleConfig['icon'], 'position' | 'cornerSide' | 'width'>;

/** Whether an icon / marker spec draws anything. */
export function iconPresent(spec: IconSpec): boolean {
  if (spec.kind === 'glyph') return spec.glyph.length > 0;
  if (spec.kind === 'resource') return spec.resourceId.length > 0;
  return spec.kind === 'shape';
}

/** The colour a picture icon is painted in (#995, #1120): `tint: true`
 *  in `own` (the icon's colour, a label tab's words'), a colour of its own,
 *  none for `false` or unset. */
export function tintHex(tint: boolean | ColorValue | undefined, own: ColorValue): string | undefined {
  if (tint === true) return own.hex;
  return tint && typeof tint === 'object' ? tint.hex : undefined;
}

/** Fit a `w × h` image inside the square `(x, y, size)`, centred, keeping
 *  its aspect ratio. Unknown dimensions fill the square. */
function fitInSquare(x: number, y: number, size: number, w?: number, h?: number): BoundingBox {
  if (!w || !h || w <= 0 || h <= 0) return createBoundingBox(x, y, size, size);
  const scale = size / Math.max(w, h);
  const fw = w * scale;
  const fh = h * scale;
  return createBoundingBox(x + (size - fw) / 2, y + (size - fh) / 2, fw, fh);
}

/** How wide the icon `buildIconBlock` draws for `spec` in a slot `size`
 *  tall and `boxWidth` wide: the fitted picture of a wide resource icon (a
 *  strip), else the square. A corner badge is centred on its corner by
 *  this width (EF-142). */
export function iconFootprintWidth(spec: IconSpec, size: number, boxWidth: number, ctx: BlockMeasureContext): number {
  if (spec.kind !== 'resource' || boxWidth <= size) return size;
  const resource = ctx.resourceById.get(spec.resourceId);
  const dims = resource?.bitmap ?? resource?.svg;
  if (!dims?.width || !dims.height) return size;
  return dims.width * Math.min(boxWidth / dims.width, size / dims.height);
}

interface BuiltIcon {
  block: VDTDesignBlock;
  /** Resource image id / bitmap format for `kind: 'resource'`. */
  fileId?: string;
  format?: string;
}

/** The design block for an icon spec drawn in the square `(x, y, size)`:
 *  an image block for a resource (aspect-fitted; `undefined` when the
 *  resource is missing), a centred text block for a glyph. */
export function buildIconBlock(
  spec: IconSpec,
  x: number,
  y: number,
  size: number,
  ctx: BlockMeasureContext,
  boxWidth = size,
  px: (d: Dimension) => number = () => 0,
): BuiltIcon | undefined {
  if (spec.kind === 'shape') {
    // A drawn ring or dot (#1120), `size` across in the slot's middle.
    const stroke = spec.strokeWidth ? Math.max(0, px(spec.strokeWidth)) : undefined;
    return { block: iconShapeBlock(spec.shape ?? 'ring', x + size / 2, y + size / 2, size, spec.color.hex, stroke) };
  }
  if (spec.kind === 'resource') {
    const resource = ctx.resourceById.get(spec.resourceId);
    const fileId = resource?.bitmap?.fileId ?? resource?.svg?.fileId;
    if (!fileId) return undefined;
    const dims = resource?.bitmap ?? resource?.svg;
    let bbox = fitInSquare(x, y, size, dims?.width, dims?.height);
    if (boxWidth > size && dims?.width && dims?.height) {
      const k = Math.min(boxWidth / dims.width, size / dims.height);
      const fw = dims.width * k;
      const fh = dims.height * k;
      bbox = createBoundingBox(x, y + (size - fh) / 2, fw, fh);
    }
    // Painted in one colour (#1120): one ring picture serves every tint.
    // A print master (a PDF page) cannot be recoloured, so the PDF draws
    // the SVG itself.
    const tint = tintHex(spec.tint, spec.color);
    const traits = pictureTraits(resource, fileId);
    if (tint) delete traits.pdfFileId;
    return {
      block: { kind: 'image', bbox, fileId, ...traits, ...(tint ? { tint } : {}) },
      fileId,
      format: resource?.bitmap?.format,
    };
  }
  const font = buildFontString(spec.fontFamily, size, spec.fontWeight.toString());
  const glyphW = flowTextWidth(spec.glyph, font);
  return {
    block: {
      kind: 'text',
      bbox: createBoundingBox(x, y, size, size),
      fontString: font,
      color: spec.color.hex,
      lines: [{
        text: spec.glyph,
        xOffset: Math.max(0, (size - glyphW) / 2),
        baselineY: y + lineBaselineOffset(size, font),
        width: glyphW,
      }],
      clip: false,
    },
  };
}
