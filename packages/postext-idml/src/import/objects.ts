// The look of a frame (fill, stroke, corners, insets) as a callout style,
// and the looks the object styles of the document give.

import type { CalloutStyleConfig, ColorValue, CornerRadius } from 'postext';
import type { IdmlPageItem, Props } from '../model/document.js';
import { computeStyle, mergeProps, stylePath } from '../resolve/styles.js';
import type { Context } from './context.js';
import { idOf } from './escape.js';
import { pt } from './values.js';

export interface BoxLook {
  fill?: ColorValue;
  stroke?: ColorValue;
  strokeWeight: number;
  /** The largest corner radius, and each corner's: top left, top right,
   *  bottom right, bottom left. */
  radius: number;
  corners: [number, number, number, number];
  /** Top, left, bottom, right. */
  inset: [number, number, number, number];
  dashed: boolean;
}

const num = (p: Props, name: string): number | undefined => {
  const n = Number(p.attrs[name]);
  return p.attrs[name] !== undefined && Number.isFinite(n) ? n : undefined;
};

/** An item's own properties over its object style's. */
export function itemProps(ctx: Context, item: IdmlPageItem): Props {
  return mergeProps(computeStyle(ctx.doc, 'object', item.objectStyle), { attrs: item.attrs, properties: item.properties });
}

export function boxLook(ctx: Context, item: IdmlPageItem, where: string): BoxLook {
  const p = itemProps(ctx, item);
  const weight = num(p, 'StrokeWeight') ?? 0;
  const fill = ctx.palette.colour(p.attrs.FillColor, num(p, 'FillTint'), where);
  const stroke = weight > 0 ? ctx.palette.colour(p.attrs.StrokeColor, num(p, 'StrokeTint'), where) : undefined;
  const rounded = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((c) => (p.attrs[`${c}CornerOption`] && p.attrs[`${c}CornerOption`] !== 'None' ? (num(p, `${c}CornerRadius`) ?? 0) : 0));
  const options = new Set(['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map((c) => p.attrs[`${c}CornerOption`]).filter((o) => o && o !== 'None' && o !== 'RoundedCorner'));
  if (options.size) ctx.rep.add('cornerShapes', 'warning', 'Corner shapes other than rounded (bevel, inset, fancy) are set as rounded corners', [...options].join(', '));
  const type = p.properties.StrokeType ? '' : p.attrs.StrokeType ?? '';
  const out: BoxLook = { strokeWeight: stroke ? weight : 0, radius: Math.max(0, ...rounded), corners: rounded as [number, number, number, number], inset: item.textFrame?.inset ?? [0, 0, 0, 0], dashed: /Dash|Dot/i.test(type) };
  if (fill) out.fill = fill;
  if (stroke) out.stroke = stroke;
  if (item.effects.length) ctx.rep.add('effects', 'loss', 'Effects on an object (drop shadow, glow, feather, bevel) are not drawn: Postext has no effects', `${item.effects.join(', ')} (${where})`);
  if (item.opacity < 100) ctx.rep.add('opacity', 'loss', 'A transparent object is drawn opaque: Postext frames and boxes have no opacity', `${item.opacity}% (${where})`);
  if (item.blendMode && item.blendMode !== 'Normal') ctx.rep.add('blendMode', 'loss', 'A blending mode is not carried', `${item.blendMode} (${where})`);
  return out;
}

/** The corners as Postext writes them: one radius, or one per corner. */
export function radiusOf(l: BoxLook): CornerRadius {
  const [tl, tr, br, bl] = l.corners;
  return tl === tr && tr === br && br === bl ? pt(tl) : { topLeft: pt(tl), topRight: pt(tr), bottomRight: pt(br), bottomLeft: pt(bl) };
}

export const hasDress = (l: BoxLook): boolean => !!l.fill || !!l.stroke || l.inset.some((n) => n > 0);

const styles = new WeakMap<Context, { byKey: Map<string, string>; list: CalloutStyleConfig[] }>();

function store(ctx: Context): { byKey: Map<string, string>; list: CalloutStyleConfig[] } {
  let s = styles.get(ctx);
  if (!s) styles.set(ctx, (s = { byKey: new Map(), list: [] }));
  return s;
}

export const calloutStyles = (ctx: Context): CalloutStyleConfig[] => store(ctx).list;

/** The callout style of a frame's look: one per distinct look, named
 *  after the object style when the frame has one. `padding` false leaves
 *  the insets to the frame that names the style. */
export function calloutStyleFor(ctx: Context, item: IdmlPageItem, look: BoxLook, padding = true): string {
  const s = store(ctx);
  const object = item.objectStyle ? ctx.doc.styles.object.get(item.objectStyle) : undefined;
  const key = [look.fill?.hex ?? '', look.stroke?.hex ?? '', look.strokeWeight, look.corners.join('/'), padding ? look.inset.join(',') : '', object && !object.root ? object.self : ''].join('|');
  const hit = s.byKey.get(key);
  if (hit) return hit;
  const named = object && !object.root && !/^\[/.test(object.name);
  const id = ctx.styleIds.take(idOf(named ? object.name : 'frame', 'frame'));
  const zero = pt(0);
  const style: CalloutStyleConfig = {
    id,
    name: named ? stylePath(object) : 'Frame',
    backgroundEnabled: !!look.fill,
    border: look.stroke ? { enabled: true, color: look.stroke, width: pt(look.strokeWeight) } : { enabled: false },
    borderRadius: radiusOf(look),
    padding: padding ? { top: pt(look.inset[0]), left: pt(look.inset[1]), bottom: pt(look.inset[2]), right: pt(look.inset[3]) } : { top: zero, left: zero, bottom: zero, right: zero },
    stripe: { enabled: false },
    icon: { kind: 'none' },
    marginTop: zero,
    marginBottom: zero,
  };
  if (look.fill) style.background = look.fill;
  if (look.dashed) ctx.rep.add('dashedStroke', 'warning', 'A dashed or dotted stroke on a frame is drawn solid', style.name);
  s.byKey.set(key, id);
  s.list.push(style);
  return id;
}
