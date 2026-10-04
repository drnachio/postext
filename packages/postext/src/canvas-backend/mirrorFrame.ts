/**
 * Painting the flow of a right-to-left page on the canvas
 * (`VDTMirroredFlowFrame`).
 *
 * The flow is laid out as a left-to-right page and turned over the sheet's
 * vertical axis: the page paints it through `transform(-1, 0, 0, 1, W, 0)`,
 * so columns, rules, frames, backgrounds and every position land mirrored,
 * as the layout means them. Text and pictures must not read mirrored:
 * while the frame is on, the context's `fillText`, `strokeText` and
 * `drawImage` turn what they paint back about its own box (the run's
 * advance from where its alignment puts it, the image's destination
 * rect), so a glyph run lands where the mirrored layout puts its box and
 * reads as written. Every painter of the flow (lines, bullets, chips,
 * ruby, captions, table cells, callout icons, figures) goes through these
 * three calls, so none of them needs to know about the frame; a run the
 * painter sets right to left (`ctx.direction = 'rtl'`) is turned about the
 * box its direction and alignment give it, and shapes as it would on a
 * left-to-right page. A formula drawn as paths rather than a bitmap asks
 * {@link counterFlipBox} itself.
 *
 * The interception is an own property on the context instance, set for
 * the flow pass and removed after it: running heads, folios and crop marks
 * paint on the sheet untouched.
 */

/** Whether the flow of a mirrored page is being painted (see the module
 *  comment). */
let active = 0;

export function mirroredPaintActive(): boolean {
  return active > 0;
}

type Patched = 'fillText' | 'strokeText' | 'drawImage';
const PATCHED: readonly Patched[] = ['fillText', 'strokeText', 'drawImage'];

/** Left edge and width of the run `text` painted at `x` with the context's
 *  alignment and direction. */
function runBox(ctx: CanvasRenderingContext2D, text: string, x: number, maxWidth?: number): { left: number; width: number } {
  let width = ctx.measureText(text).width;
  if (maxWidth !== undefined && maxWidth < width) width = Math.max(0, maxWidth);
  const rtl = 'direction' in ctx && ctx.direction === 'rtl';
  const align = ctx.textAlign;
  const fromRight = align === 'right' || (align === 'start' && rtl) || (align === 'end' && !rtl);
  const left = align === 'center' ? x - width / 2 : fromRight ? x - width : x;
  return { left, width };
}

/** Turn what `paint` draws back about the horizontal extent
 *  `[left, left + width]`, inside a mirrored frame: the box stays where
 *  the layout put it and its content reads unmirrored. Outside a mirrored
 *  frame it just paints. */
export function counterFlipBox(ctx: CanvasRenderingContext2D, left: number, width: number, paint: () => void): void {
  if (!mirroredPaintActive()) {
    paint();
    return;
  }
  ctx.save();
  ctx.translate(2 * left + width, 0);
  ctx.scale(-1, 1);
  try {
    paint();
  } finally {
    ctx.restore();
  }
}

/** Width of an image source as `drawImage` with no size takes it. */
function sourceWidth(image: CanvasImageSource): number {
  const s = image as { displayWidth?: number; naturalWidth?: number; width?: number | { baseVal?: { value: number } } };
  if (typeof s.displayWidth === 'number') return s.displayWidth;
  if (typeof s.naturalWidth === 'number' && s.naturalWidth > 0) return s.naturalWidth;
  if (typeof s.width === 'number') return s.width;
  return s.width?.baseVal?.value ?? 0;
}

/**
 * Begin painting the flow of a page mirrored about `originX` (its
 * `flow.mirror.originX`): saves the context, applies the frame and turns
 * text runs and images back (see the module comment). Returns the
 * function that ends it, restoring the context.
 */
export function beginMirroredFlow(ctx: CanvasRenderingContext2D, originX: number): () => void {
  ctx.save();
  ctx.transform(-1, 0, 0, 1, originX, 0);
  const own = new Map<Patched, PropertyDescriptor | undefined>();
  for (const name of PATCHED) own.set(name, Object.getOwnPropertyDescriptor(ctx, name));
  const fillText = ctx.fillText;
  const strokeText = ctx.strokeText;
  const drawImage = ctx.drawImage as (...args: unknown[]) => void;
  const target = ctx as unknown as Record<Patched, unknown>;
  target.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number): void {
    const { left, width } = runBox(ctx, text, x, maxWidth);
    counterFlipBox(ctx, left, width, () => {
      if (maxWidth === undefined) fillText.call(ctx, text, x, y);
      else fillText.call(ctx, text, x, y, maxWidth);
    });
  };
  target.strokeText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number): void {
    const { left, width } = runBox(ctx, text, x, maxWidth);
    counterFlipBox(ctx, left, width, () => {
      if (maxWidth === undefined) strokeText.call(ctx, text, x, y);
      else strokeText.call(ctx, text, x, y, maxWidth);
    });
  };
  target.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]): void {
    const image = args[0] as CanvasImageSource;
    // drawImage(image, dx, dy[, dw, dh]) or (image, sx, sy, sw, sh, dx, dy, dw, dh).
    const dx = (args.length >= 9 ? args[5] : args[1]) as number;
    const dw = (args.length >= 9 ? args[7] : args.length >= 5 ? args[3] : sourceWidth(image)) as number;
    const left = Math.min(dx, dx + dw);
    counterFlipBox(ctx, left, Math.abs(dw), () => drawImage.apply(ctx, args));
  };
  active++;
  return () => {
    active--;
    for (const name of PATCHED) {
      const d = own.get(name);
      if (d) Object.defineProperty(ctx, name, d);
      else delete target[name];
    }
    ctx.restore();
  };
}
