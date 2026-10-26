/**
 * The box of a task-list item in the PDF (`VDTBlock.bulletBox`, #765): a
 * square outline and, when the item is done, a tick, drawn with path
 * operators. No text is shown for it and no font embedded; in a tagged
 * file its `Lbl` carries the character it stands for as `/ActualText`
 * (see `StructureFlow.listItem`), so a reader hears the item's state.
 */

import {
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
} from 'pdf-lib';
import { taskBoxTick } from 'postext';
import type { VDTBlock } from 'postext';
import { type PageCtx, alphaOf, alphaStateOp, colorFromHex, opt } from './primitives.js';

/** Draw the box of `block` from its `bulletOffsetX`, centred on its
 *  `bulletY`, the stroke inside the square. In the flow of a vertical or a
 *  right-to-left page the tick's points are turned or mirrored back
 *  (`taskBoxTick`), so it reads as on any page. */
export function drawTaskBoxPx(ctx: PageCtx, block: VDTBlock): void {
  const box = block.bulletBox;
  const firstLine = block.lines[0];
  if (!box || block.bulletOffsetX === undefined || !firstLine) return;
  const { scale, pageHeightPt } = ctx;
  const { side, stroke: strokePx } = box;
  const color = colorFromHex(block.bulletColor ?? block.color, ctx.colorSpace);
  const cx = block.bulletOffsetX + side / 2;
  const cy = block.bulletY ?? firstLine.baseline;
  const inner = side - strokePx;
  const x = (px: number): number => px * scale;
  const y = (px: number): number => pageHeightPt - px * scale;
  const ops = [
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
    setStrokingColor(color),
    setLineWidth(Math.max(0.01, strokePx * scale)),
    setLineJoin(LineJoinStyle.Miter),
    rectangle(x(cx - inner / 2), y(cy + inner / 2), inner * scale, inner * scale),
    stroke(),
  ];
  if (box.checked) {
    const tick = taskBoxTick(side, ctx.vertical ? 'vertical' : ctx.mirror ? 'mirrored' : undefined);
    ops.push(setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round));
    tick.forEach(([dx, dy], i) => ops.push((i === 0 ? moveTo : lineTo)(x(cx + dx), y(cy + dy))));
    ops.push(stroke());
  }
  ops.push(popGraphicsState());
  ctx.page.pushOperators(...ops);
}
