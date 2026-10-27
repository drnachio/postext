// The callout style a frame is drawn with: its own padding and measure, a
// named look, and the chrome kept at its drawn size under smaller text
// (#1276: split out of composedLayout.ts).
import { isCornerRadii } from '../../../design/boxShape.js';
import type { ResolvedCalloutStyleConfig, Dimension, CornerRadius } from '../../../types.js';
import { lookOver } from '../../../composed/templates.js';
import type { ResolvedFrame, FrameLookEntry, FrameLook } from '../../../composed/types.js';

/** A frame style whose box keeps its drawn size when the frame's text is
 *  set at `scale` (#858): the frame is laid out `1 / scale` as large and
 *  painted at `scale`, so its padding, border, corner radius, stripe and
 *  tab are laid out `1 / scale` as large to come out as drawn. Only the
 *  text and what it holds shrink: padding that keeps room for the photos
 *  set over a box stays that room. */
export function keepChromeAt(style: ResolvedCalloutStyleConfig, scale: number): ResolvedCalloutStyleConfig {
  if (scale === 1) return style;
  const d = (v: Dimension): Dimension => ({ ...v, value: v.value / scale });
  const radiusAt = (r: CornerRadius): CornerRadius => (isCornerRadii(r)
    ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ? d(v) : v]))
    : d(r));
  const p = style.padding;
  return {
    ...style,
    padding: { top: d(p.top), right: d(p.right), bottom: d(p.bottom), left: d(p.left) },
    border: {
      ...style.border,
      width: d(style.border.width),
      ...(style.border.sides
        ? { sides: Object.fromEntries(Object.entries(style.border.sides).map(([k, v]) => [k, { ...v, width: d(v.width) }])) as NonNullable<ResolvedCalloutStyleConfig['border']['sides']> }
        : {}),
    },
    borderRadius: radiusAt(style.borderRadius),
    stripe: { ...style.stripe, width: d(style.stripe.width) },
    ...(style.label
      ? { label: { ...style.label, height: d(style.label.height), paddingX: d(style.label.paddingX), offset: d(style.label.offset), inset: d(style.label.inset), rule: { ...style.label.rule, width: d(style.label.rule.width) }, ...(style.label.fillet ? { fillet: d(style.label.fillet) } : {}), ...(style.label.borderRadius !== undefined ? { borderRadius: radiusAt(style.label.borderRadius) } : {}) } }
      : {}),
  };
}

/** The callout style a frame is drawn with: `base` (its `style`, or the
 *  frameless frame style) with what a frame sets of its own: its padding
 *  (side by side) and a measure that is the frame's. A style's placement,
 *  span, width and margins do not apply to a frame. */
export function frameStyleOf(base: ResolvedCalloutStyleConfig, frame: ResolvedFrame): ResolvedCalloutStyleConfig {
  const padding = frame.padding ? { ...base.padding, ...frame.padding } : base.padding;
  return {
    ...(frame.look ? styleWithLook(base, frame.look) : base),
    padding,
    width: 'fill',
    placement: 'here',
    span: 'column',
    marginTop: { value: 0, unit: 'px' },
    marginBottom: { value: 0, unit: 'px' },
  };
}

const lookedStyles = new WeakMap<object, WeakMap<object, ResolvedCalloutStyleConfig>>();
/** Frames with a named look laid over theirs (#1089), per look and frame:
 *  the same look object each time, so `styleWithLook` keeps its styles. */
const namedLookFrames = new WeakMap<FrameLookEntry, WeakMap<ResolvedFrame, ResolvedFrame>>();

/** `frame` with the named look `named` (#1089) laid over its own `look`
 *  (`lookOver`): the order is the style, the template frame's look, then
 *  the named look. `frame` itself when there is none. */
export function withNamedLook(frame: ResolvedFrame, named: FrameLookEntry | undefined): ResolvedFrame {
  if (!named) return frame;
  let byFrame = namedLookFrames.get(named);
  if (!byFrame) namedLookFrames.set(named, (byFrame = new WeakMap()));
  const known = byFrame.get(frame);
  if (known) return known;
  const out: ResolvedFrame = { ...frame, look: lookOver(frame.look, named) };
  byFrame.set(frame, out);
  return out;
}

/** `base` with what a frame's `look` sets (#976) written over it: colours
 *  of the fill, border, stripe, icon, marker, title, text and label tab,
 *  and the tracking of the body. A fill colour turns the fill on. A part
 *  the style does not have (a label tab it lacks) is left out. Kept per
 *  style and look, so the pieces a measurement is keyed by (`body`,
 *  `lists`) keep their identity from one call to the next. */
export function styleWithLook(base: ResolvedCalloutStyleConfig, look: FrameLook): ResolvedCalloutStyleConfig {
  let byLook = lookedStyles.get(base);
  if (!byLook) lookedStyles.set(base, (byLook = new WeakMap()));
  const known = byLook.get(look);
  if (known) return known;
  const out: ResolvedCalloutStyleConfig = { ...base };
  if (look.background) {
    out.background = look.background;
    out.backgroundEnabled = true;
  }
  if (look.border?.color) {
    // Every side takes the look's border colour too (#1059).
    const color = look.border.color;
    const sides = base.border.sides;
    out.border = {
      ...base.border,
      color,
      ...(sides ? { sides: { top: { ...sides.top, color }, right: { ...sides.right, color }, bottom: { ...sides.bottom, color }, left: { ...sides.left, color } } } : {}),
    };
  }
  if (look.stripe?.color) out.stripe = { ...base.stripe, color: look.stripe.color };
  if (look.icon?.color) out.icon = { ...base.icon, color: look.icon.color };
  if (look.marker?.color || look.marker?.rule?.color) {
    out.marker = {
      ...base.marker,
      ...(look.marker.color ? { color: look.marker.color } : {}),
      ...(look.marker.rule?.color ? { rule: { ...base.marker.rule, color: look.marker.rule.color } } : {}),
    };
  }
  if (look.titleStyle?.color) out.titleStyle = { ...base.titleStyle, color: look.titleStyle.color };
  if (look.body) {
    const b = look.body;
    out.body = {
      ...base.body,
      ...(b.color ? { color: b.color } : {}),
      ...(b.boldColor ? { boldColor: b.boldColor } : {}),
      ...(b.italicColor ? { italicColor: b.italicColor } : {}),
      ...(b.letterSpacing ? (b.letterSpacing.value !== 0 ? { letterSpacing: b.letterSpacing } : { letterSpacing: undefined }) : {}),
    };
  }
  if (look.label && base.label) {
    out.label = {
      ...base.label,
      ...(look.label.color ? { color: look.label.color } : {}),
      ...(look.label.background ? { background: look.label.background } : {}),
      ...(look.label.rule?.color ? { rule: { ...base.label.rule, color: look.label.rule.color } } : {}),
    };
  }
  byLook.set(look, out);
  return out;
}
