// Rules, boxes and design paths as native Word shapes (#1392): a line
// shape per rule, a rect or roundRect per box, custom geometry per path,
// all vector in Word, LibreOffice and Pages.

import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';
import type { VDTPathCommand, VDTPathStroke } from '../../vdt/design.js';
import { anchorRun, shapeGraphic, xfrm } from './drawing.js';
import { emu, solidFill, wordColor } from './units.js';
import type { WriterContext } from './types.js';

type RuleItem = Extract<DisplayItem, { kind: 'rule' }>;
type RectItem = Extract<DisplayItem, { kind: 'rect' }>;
type PathItem = Extract<DisplayItem, { kind: 'path' }>;

/** The one paragraph of an empty text box, too small to grow it. */

const CAP = { butt: 'flat', round: 'rnd', square: 'sq' } as const;

/** `a:ln` of a stroke (dash lengths relative to the width, as DrawingML's
 *  custom dashes are). */
export function lineXml(ctx: WriterContext, color: string | undefined, widthPx: number | undefined, extra?: { dash?: number[]; cap?: VDTPathStroke['cap']; join?: VDTPathStroke['join'] }): string {
  const c = wordColor(color);
  if (!c || c.alpha <= 0 || !widthPx || widthPx <= 0) return '<a:ln><a:noFill/></a:ln>';
  const cap = extra?.cap ? ` cap="${CAP[extra.cap]}"` : '';
  let inner = solidFill(color);
  const dash = extra?.dash?.filter((d) => d >= 0);
  if (dash && dash.length >= 2) {
    const ds: string[] = [];
    for (let i = 0; i + 1 < dash.length; i += 2) {
      ds.push(`<a:ds d="${Math.max(1, Math.round((dash[i]! / widthPx) * 100000))}" sp="${Math.max(1, Math.round((dash[i + 1]! / widthPx) * 100000))}"/>`);
    }
    inner += `<a:custDash>${ds.join('')}</a:custDash>`;
  }
  if (extra?.join === 'round') inner += '<a:round/>';
  else if (extra?.join === 'bevel') inner += '<a:bevel/>';
  else if (extra?.join === 'miter') inner += '<a:miter lim="800000"/>';
  return `<a:ln w="${emu(widthPx, ctx.dpi)}"${cap}>${inner}</a:ln>`;
}

export function ruleRun(ctx: WriterContext, item: RuleItem): string {
  const x = Math.min(item.x1, item.x2);
  const y = Math.min(item.y1, item.y2);
  const rect: DisplayRect = { x, y, width: Math.abs(item.x2 - item.x1), height: Math.abs(item.y2 - item.y1) };
  // A line runs from the box's top-left to its bottom-right; one rising
  // to the right is flipped.
  const flipV = (item.x2 - item.x1) * (item.y2 - item.y1) < 0;
  return anchorRun(ctx, { rect, name: 'ptx rule' }, (_id, cx, cy) =>
    shapeGraphic(`${xfrm(cx, cy, undefined, false, flipV)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>${lineXml(ctx, item.color, item.widthPx, item.dash ? { dash: item.dash } : undefined)}`),
  );
}

/** A rect item: a filled and stroked rect or rounded rect; a box style
 *  whose sides differ gets its fill and one rule per side. */
export function rectRuns(ctx: WriterContext, item: RectItem, opts: { behind?: boolean } = {}): string[] {
  const behind = opts.behind;
  const box = item.box;
  const fill = item.fill ?? box?.backgroundColor;
  const sides = box?.borderSides;
  const uniform = !sides;
  const stroke = uniform ? (item.stroke ?? box?.borderColor) : undefined;
  const strokeW = uniform ? (item.strokeWidthPx ?? box?.borderWidthPx) : undefined;
  const radius = item.radius ?? box?.borderRadiusPx ?? 0;
  const r = item.rect;
  const short = Math.min(r.width, r.height);
  const geom = radius > 0 && short > 0
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((radius / short) * 100000))}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const out = [
    anchorRun(ctx, { rect: r, name: 'ptx box', ...(behind !== undefined ? { behind } : {}), ...(item.rotate ? { rotate: item.rotate } : {}) }, (_id, cx, cy) =>
      shapeGraphic(`${xfrm(cx, cy, item.rotate)}${geom}${solidFill(fill)}${lineXml(ctx, stroke, strokeW)}`),
    ),
  ];
  if (sides && !item.rotate) {
    const edge = (side: 'top' | 'right' | 'bottom' | 'left', x1: number, y1: number, x2: number, y2: number): void => {
      const s = sides[side];
      if (s && s.widthPx > 0) out.push(ruleRun(ctx, { kind: 'rule', x1, y1, x2, y2, color: s.color, widthPx: s.widthPx }));
    };
    edge('top', r.x, r.y, r.x + r.width, r.y);
    edge('right', r.x + r.width, r.y, r.x + r.width, r.y + r.height);
    edge('bottom', r.x, r.y + r.height, r.x + r.width, r.y + r.height);
    edge('left', r.x, r.y, r.x, r.y + r.height);
  }
  return out;
}

/** A path as custom geometry in EMU relative to its box. */
export function pathRun(ctx: WriterContext, item: PathItem): string {
  const b = item.bbox;
  const W = Math.max(1, emu(b.width, ctx.dpi));
  const H = Math.max(1, emu(b.height, ctx.dpi));
  const pt = (x: number, y: number): string => `<a:pt x="${emu(x - b.x, ctx.dpi)}" y="${emu(y - b.y, ctx.dpi)}"/>`;
  const cmds: string[] = [];
  for (const sp of item.subpaths) {
    for (const c of sp as VDTPathCommand[]) {
      if (c.op === 'M') cmds.push(`<a:moveTo>${pt(c.x, c.y)}</a:moveTo>`);
      else if (c.op === 'L') cmds.push(`<a:lnTo>${pt(c.x, c.y)}</a:lnTo>`);
      else if (c.op === 'C') cmds.push(`<a:cubicBezTo>${pt(c.x1, c.y1)}${pt(c.x2, c.y2)}${pt(c.x, c.y)}</a:cubicBezTo>`);
      else if (c.op === 'Q') cmds.push(`<a:quadBezTo>${pt(c.x1, c.y1)}${pt(c.x, c.y)}</a:quadBezTo>`);
      else cmds.push('<a:close/>');
    }
  }
  const filled = wordColor(item.fill) !== undefined;
  const geom =
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>' +
    `<a:pathLst><a:path w="${W}" h="${H}"${filled ? '' : ' fill="none"'}${item.stroke ? '' : ' stroke="0"'}>${cmds.join('')}</a:path></a:pathLst></a:custGeom>`;
  const s = item.stroke;
  const ln = s ? lineXml(ctx, s.color, s.widthPx, { ...(s.dash ? { dash: s.dash } : {}), ...(s.cap ? { cap: s.cap } : {}), ...(s.join ? { join: s.join } : {}) }) : '<a:ln><a:noFill/></a:ln>';
  return anchorRun(ctx, { rect: b, name: 'ptx path' }, (_id, cx, cy) => shapeGraphic(`${xfrm(cx, cy)}${geom}${solidFill(item.fill)}${ln}`));
}
