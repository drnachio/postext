// Painting a vector drawing with PDF path operators, written once per
// document as a form XObject (#1276: split out of svgVector.ts).
import { type Color, PDFOperator, moveTo, lineTo, appendBezierCurve, closePath, type PDFFont, PDFName, PDFRef, PDFDict, PDFContext, setGraphicsState, pushGraphicsState, clipEvenOdd, clip, endPath, concatTransformationMatrix, drawObject, popGraphicsState, setFontAndSize, setFillingColor, beginText, setTextMatrix, endText, setStrokingColor, setLineWidth, setLineCap, setLineJoin, PDFOperatorNames, PDFNumber, setDashPattern, fillAndStroke, fill, stroke, PDFContentStream, rectangle } from 'pdf-lib';
import { type PageCtx, colorFromHex, textShows } from '../../primitives.js';
import { isPrintMode, modeKey } from '../../../print/colorMode.js';
import { applyPrintPass, overprintStateDict } from '../../../print/printPass.js';
import { shapedSvgText } from '../../text/shapedText.js';
import type { PathSeg, SvgInk, VectorDrawing } from '../svgVector.js';
import type { SpotInkRegistry, SpotPlate } from '../../../print/spot.js';
import { mixColor, planMix } from '../../../print/plates.js';
import { finishOverprintsByDefault, inkEntry, inkKey, plateOfSpot, type ResolvedSpotColor } from 'postext';
import { droppedOffPlates, isScreenVarnish } from '../../../print/finishes.js';
import { parseCssColor } from '../../../colors.js';
import { mul } from './geometry.js';

// ------------------------------------------------------------ emission

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function pathOps(segs: PathSeg[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
        ops.push(moveTo(round(s[1]), round(s[2])));
        break;
      case 'L':
        ops.push(lineTo(round(s[1]), round(s[2])));
        break;
      case 'C':
        ops.push(appendBezierCurve(round(s[1]), round(s[2]), round(s[3]), round(s[4]), round(s[5]), round(s[6])));
        break;
      case 'Z':
        ops.push(closePath());
        break;
    }
  }
  return ops;
}

/**
 * The resources of one form XObject: fonts, alpha states and pictures, each
 * named once. The form carries its own `/Resources`, so every page that
 * paints it finds them there.
 */
class FormResources {
  private readonly fonts = new Map<PDFFont, PDFName>();
  private readonly alphas = new Map<string, PDFName>();
  private readonly images = new Map<PDFRef, PDFName>();
  private readonly fontDict: Record<string, PDFRef> = {};
  private readonly gsDict: Record<string, PDFDict> = {};
  private readonly xobjectDict: Record<string, PDFRef> = {};
  private readonly spaceDict: Record<string, PDFRef> = {};
  private readonly spaces = new Map<string, PDFName>();

  constructor(private readonly context: PDFContext, private readonly inks?: SpotInkRegistry) {}

  font(font: PDFFont): PDFName {
    let name = this.fonts.get(font);
    if (!name) {
      const key = `F${this.fonts.size + 1}`;
      this.fontDict[key] = font.ref;
      name = PDFName.of(key);
      this.fonts.set(font, name);
    }
    return name;
  }

  /** An ExtGState of the form's own (the print pass's overprint states). */
  extGState(dict: PDFDict): PDFName {
    const key = `GSp${Object.keys(this.gsDict).length + 1}`;
    this.gsDict[key] = dict;
    this.alphas.set(key, PDFName.of(key));
    return PDFName.of(key);
  }

  alpha(ca: number, CA: number): PDFOperator | null {
    if (ca >= 1 && CA >= 1) return null;
    const id = `${round(ca)}|${round(CA)}`;
    let name = this.alphas.get(id);
    if (!name) {
      const key = `GSa${this.alphas.size + 1}`;
      this.gsDict[key] = this.context.obj({ Type: 'ExtGState', ca: round(ca), CA: round(CA) });
      name = PDFName.of(key);
      this.alphas.set(id, name);
    }
    return setGraphicsState(name);
  }

  image(ref: PDFRef): PDFName {
    let name = this.images.get(ref);
    if (!name) {
      const key = `Im${this.images.size + 1}`;
      this.xobjectDict[key] = ref;
      name = PDFName.of(key);
      this.images.set(ref, name);
    }
    return name;
  }

  /** Spot inks' colour space, one ink's Separation or a mix's DeviceN
   *  (the print pass's). */
  colorSpace(plates: readonly SpotPlate[]): PDFName {
    const ref = this.inks!.inkSpace(this.context, plates);
    const id = ref.toString();
    let name = this.spaces.get(id);
    if (!name) {
      const key = `CSs${this.spaces.size + 1}`;
      this.spaceDict[key] = ref;
      name = PDFName.of(key);
      this.spaces.set(id, name);
    }
    return name;
  }

  dict(): PDFDict {
    const entries: Record<string, Record<string, PDFRef | PDFDict>> = {};
    if (this.spaces.size > 0) entries.ColorSpace = this.spaceDict;
    if (this.fonts.size > 0) entries.Font = this.fontDict;
    if (this.alphas.size > 0) entries.ExtGState = this.gsDict;
    if (this.images.size > 0) entries.XObject = this.xobjectDict;
    return this.context.obj(entries);
  }
}

/** How strong a tint of `inkHex` the colour `hex` is (0 paper .. 1 the
 *  full ink), when it is one: `applySingleInkToSvg` mixes the ink over
 *  white, channel by channel. Undefined for a colour off that line (one
 *  the recolouring left alone, such as the default black). */
export function inkStrength(hex: string, inkHex: string): number | undefined {
  const c = parseCssColor(hex);
  const ink = parseCssColor(inkHex);
  if (!c || !ink) return undefined;
  const ch = [c.r, c.g, c.b].map((v) => v * 255);
  const ik = [ink.r, ink.g, ink.b].map((v) => v * 255);
  // The channel the ink darkens most measures the strength best.
  let best = 0;
  for (let i = 1; i < 3; i++) if (255 - ik[i]! > 255 - ik[best]!) best = i;
  const span = 255 - ik[best]!;
  if (span < 1) return ch.every((v) => v > 254) ? 0 : undefined;
  const s = (255 - ch[best]!) / span;
  if (s < -0.01 || s > 1.01) return undefined;
  const strength = Math.max(0, Math.min(1, s));
  for (let i = 0; i < 3; i++) {
    if (Math.abs(255 + (ik[i]! - 255) * strength - ch[i]!) > 1.5) return undefined;
  }
  return Math.round(strength * 10000) / 10000;
}

/**
 * The spot ink an SVG colour prints on in a print render, and at what tint
 * (0–1), or undefined for a process colour:
 *
 * - an ink the SVG names (`icc-named-color`, `data-spot`): the palette's
 *   spot colour of that name (its CMYK alternate), else an ink of its own
 *   whose alternate is the colour's CMYK; at the named tint;
 * - a colour whose hex is exactly one of the palette's spot colours: that
 *   ink, at that colour's tint.
 *
 * Nothing else: a colour that only looks like a tint of an ink (a grey on
 * the line from white to a dark ink) stays in process, so an SVG's greys
 * never move to a spot plate by accident. A diagram recoloured to one ink
 * (`diagramStyle.singleInk` with a spot `inkColor`) is the one exception,
 * handled by the drawing's `spotInk`.
 */
export function svgSpotOf(
  hex: string,
  ink: SvgInk | undefined,
  spots: ReadonlyMap<string, ResolvedSpotColor>,
  colorSpace: PageCtx['colorSpace'],
): { spot: ResolvedSpotColor; tint: number } | undefined {
  if (ink) {
    // Through the ink table: the SVG may name the ink by an alias, and an
    // ink sent to process prints the SVG's own colour.
    const entry = isPrintMode(colorSpace) ? inkEntry(ink.name, colorSpace.config.inks) : undefined;
    if (entry?.output === 'process') return undefined;
    const plateName = entry?.pdfName ?? ink.name;
    const key = inkKey(plateName);
    let spot = [...spots.values()].find((s) => inkKey(s.name) === key);
    if (spot && spot.tint !== 100) spot = { ...spot, tint: 100 };
    if (!spot) {
      const c = parseCssColor(hex);
      const k = c && isPrintMode(colorSpace) ? colorSpace.transform.fromRgb(c.r, c.g, c.b) : undefined;
      const pct = (v: number) => Math.round(v * 1000) / 10;
      const cmyk = entry?.cmyk ?? (k ? { c: pct(k.c), m: pct(k.m), y: pct(k.y), k: pct(k.k) } : { c: 0, m: 0, y: 0, k: 100 });
      // The ink table's finish (#1563): a white ink or a varnish an SVG
      // names overprints unless the table says otherwise.
      spot = { name: plateName, cmyk, tint: 100, overprint: entry?.overprint ?? finishOverprintsByDefault(entry?.finish), ...(entry?.finish ? { finish: entry.finish } : {}) };
    }
    return { spot, tint: (ink.tint ?? 100) / 100 };
  }
  const exact = spots.get(hex.slice(0, 7).toLowerCase());
  return exact ? { spot: exact, tint: exact.tint / 100 } : undefined;
}

/** `#rrggbb` with an alpha byte appended (`#rrggbbaa`). */
function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex.slice(0, 7)}${byte}`;
}

/** The operators that paint `drawing`'s items in its root user space. */
function drawingOps(drawing: VectorDrawing, res: FormResources, colorSpace: PageCtx['colorSpace']): PDFOperator[] {
  const ops: PDFOperator[] = [];
  // PDF/X-1a has no transparency: a translucent paint is set as it would
  // print over the paper, and no alpha state is written.
  const flatten = isPrintMode(colorSpace) && colorSpace.flattenTransparency;
  const spotInk = isPrintMode(colorSpace) ? drawing.spotInk : undefined;
  const inks = isPrintMode(colorSpace) ? colorSpace.spots : undefined;
  const registry = isPrintMode(colorSpace) ? colorSpace.inkRegistry : undefined;
  // A job on a few plates sets an ink of another plate on its own.
  // A white ink or a varnish the job does not print is left out (#1566).
  const inkColor = (spot: ResolvedSpotColor, tint: number): Color =>
    isPrintMode(colorSpace) && colorSpace.plates
      ? droppedOffPlates(spot.finish) && !plateOfSpot(spot, colorSpace.plates.plates)
        ? { ...registry!.dropStandIn(spot.name) }
        : { ...mixColor(planMix(colorSpace.plates, { kind: 'spot', spot, tint }, colorSpace), registry!, spot.overprint) }
      : { ...registry!.standIn(spot, tint) };
  const paint = (hex: string, alpha: number, ink?: SvgInk): Color => {
    const over = flatten && alpha < 1 ? alpha : 1;
    const strength = spotInk ? inkStrength(hex, spotInk.hex) : undefined;
    if (spotInk && strength !== undefined) {
      // A tint of the single ink: on its plate, lighter over the paper
      // when flattened.
      return inkColor(spotInk.spot, strength * (spotInk.spot.tint / 100) * over);
    }
    if (inks) {
      const spot = svgSpotOf(hex, ink, inks, colorSpace);
      if (spot) return inkColor(spot.spot, spot.tint * over);
    }
    return colorFromHex(flatten && alpha < 1 ? withAlpha(hex, alpha) : hex, colorSpace);
  };
  const alphaState = (ca: number, CA: number) => (flatten ? null : res.alpha(ca, CA));
  const hidden = (hex: string): boolean => !isPrintMode(colorSpace) && isScreenVarnish(hex);
  for (const shape of drawing.shapes) {
    ops.push(pushGraphicsState());
    for (const c of shape.clips) {
      ops.push(...pathOps(c.segs), c.evenOdd ? clipEvenOdd() : clip(), endPath());
    }
    if (shape.kind === 'image') {
      if (shape.pdfImage) {
        // The unit square maps onto the picture's box; the image's rows run
        // bottom-up in PDF, so the box is flipped inside the y-down root
        // space to keep the picture upright.
        const [a, b, c, d, e, f] = mul(shape.matrix, [shape.width, 0, 0, -shape.height, shape.x, shape.y + shape.height]);
        ops.push(concatTransformationMatrix(round(a), round(b), round(c), round(d), round(e), round(f)), drawObject(res.image(shape.pdfImage.ref)));
      }
      ops.push(popGraphicsState());
      continue;
    }
    if (shape.kind === 'text') {
      for (const run of shape.runs) {
        const font = run.font.pdfFont;
        if (!font || hidden(run.fill.hex)) continue;
        const gs = alphaState(run.fill.alpha, 1);
        ops.push(pushGraphicsState());
        if (gs) ops.push(gs);
        // Text matrix: local → root, then undo the root y-flip so glyphs
        // stand upright, with the pen at the run's baseline start.
        const [a, b, c, d, e, f] = mul(run.matrix, [1, 0, 0, -1, run.x, run.y]);
        // A face of several files switches font per stretch of characters;
        // right-to-left and joining scripts are shaped by HarfBuzz.
        const shows = (run.base !== undefined ? shapedSvgText(font, run.text, run.size, run.base)?.shows : undefined) ?? textShows(font, run.text, false, true);
        const body: PDFOperator[] = [];
        let current = shows[0]!.font;
        for (const show of shows) {
          if (show.font !== current) {
            body.push(setFontAndSize(res.font(show.font), round(run.size)));
            current = show.font;
          }
          body.push(show.op);
        }
        ops.push(
          setFillingColor(paint(run.fill.hex, run.fill.alpha, run.fill.ink)),
          beginText(),
          setFontAndSize(res.font(shows[0]!.font), round(run.size)),
          setTextMatrix(round(a), round(b), round(c), round(d), round(e), round(f)),
          ...body,
          endText(),
          popGraphicsState(),
        );
      }
      ops.push(popGraphicsState());
      continue;
    }
    // A screen render paints no varnish (#1563).
    const fillP = shape.fill && !hidden(shape.fill.hex) ? shape.fill : undefined;
    const strokeP = shape.stroke && !hidden(shape.stroke.hex) ? shape.stroke : undefined;
    if (!fillP && !strokeP) {
      ops.push(popGraphicsState());
      continue;
    }
    const gs = alphaState(fillP?.alpha ?? 1, strokeP?.alpha ?? 1);
    if (gs) ops.push(gs);
    if (fillP) ops.push(setFillingColor(paint(fillP.hex, fillP.alpha, fillP.ink)));
    if (strokeP) {
      const st = strokeP;
      ops.push(
        setStrokingColor(paint(st.hex, st.alpha, st.ink)),
        setLineWidth(round(st.width)),
        setLineCap(st.cap),
        setLineJoin(st.join),
        PDFOperator.of(PDFOperatorNames.SetLineMiterLimit, [PDFNumber.of(round(st.miterLimit))]),
      );
      if (st.dash) ops.push(setDashPattern(st.dash.map(round), round(st.dashOffset)));
    }
    ops.push(...pathOps(shape.segs));
    if (fillP && strokeP) {
      ops.push(shape.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke) : fillAndStroke());
    } else if (fillP) {
      ops.push(shape.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
    } else {
      ops.push(stroke());
    }
    ops.push(popGraphicsState());
  }
  return ops;
}

/** A drawing written once as a form XObject, and the box (in its user
 *  space) that holds every viewport it has been drawn in so far. */
interface VectorForm {
  ref: PDFRef;
  stream: PDFContentStream;
  bbox: [number, number, number, number];
}

/** The forms of each document, by drawing and colour space. */
const formsByContext = new WeakMap<PDFContext, WeakMap<VectorDrawing, Map<string, VectorForm>>>();

/** The form XObject that paints `drawing` in `ctx`'s document, written the
 *  first time the drawing is drawn there (EF-183): an SVG drawn on many
 *  pages (a frame in every page's design, a picture repeated) is stored
 *  once, and each page paints it with `Do`. */
function vectorForm(ctx: PageCtx, drawing: VectorDrawing): VectorForm {
  const context = ctx.page.doc.context;
  let byDrawing = formsByContext.get(context);
  if (!byDrawing) formsByContext.set(context, (byDrawing = new WeakMap()));
  let bySpace = byDrawing.get(drawing);
  if (!bySpace) byDrawing.set(drawing, (bySpace = new Map()));
  const spaceKey = modeKey(ctx.colorSpace);
  let form = bySpace.get(spaceKey);
  if (!form) {
    const res = new FormResources(context, isPrintMode(ctx.colorSpace) ? ctx.colorSpace.inkRegistry : undefined);
    let ops = drawingOps(drawing, res, ctx.colorSpace);
    if (isPrintMode(ctx.colorSpace)) {
      const states = new Map<string, PDFName>();
      ops = applyPrintPass(ops, ctx.colorSpace, (flags) => {
        const key = `${flags.fill}|${flags.stroke}`;
        let name = states.get(key);
        if (!name) states.set(key, (name = res.extGState(context.obj(overprintStateDict(flags)))));
        return name;
      }, { richBlack: false, spaceFor: (plates) => res.colorSpace(plates) });
    }
    const [vx, vy, vw, vh] = drawing.viewBox;
    const bbox: [number, number, number, number] = [vx, vy, vx + vw, vy + vh];
    const stream = context.formXObject(ops, { BBox: bbox.map(round), Resources: res.dict() });
    form = { ref: context.register(stream), stream, bbox };
    bySpace.set(spaceKey, form);
  }
  return form;
}

/** Resource name of a form on a page, one per (page, form). */
const formNames = new WeakMap<PageCtx['page'], Map<PDFRef, PDFName>>();

function formName(ctx: PageCtx, ref: PDFRef): PDFName {
  let names = formNames.get(ctx.page);
  if (!names) formNames.set(ctx.page, (names = new Map()));
  let name = names.get(ref);
  if (!name) {
    name = ctx.page.node.newXObject('Vec', ref);
    names.set(ref, name);
  }
  return name;
}

/**
 * Paint a {@link VectorDrawing} into the page, fitted to the given box in the
 * document's pixel space (top-down, like every other `PageCtx` primitive).
 * The drawing itself is a form XObject written once per document (see
 * {@link vectorForm}); the page clips to the viewport, maps the drawing's
 * user space onto it and paints the form.
 */
export function drawVectorDrawing(
  ctx: PageCtx,
  drawing: VectorDrawing,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x0 = xPx * scale;
  const yTop = pageHeightPt - yPx * scale;
  const w = wPx * scale;
  const h = hPx * scale;
  if (w <= 0 || h <= 0) return;
  const [vx, vy, vw, vh] = drawing.viewBox;

  let sx = w / vw;
  let sy = h / vh;
  let ox = 0;
  let oy = 0;
  if (drawing.aspect) {
    const s = drawing.aspect.slice ? Math.max(sx, sy) : Math.min(sx, sy);
    ox = (w - vw * s) * drawing.aspect.xAlign;
    oy = (h - vh * s) * drawing.aspect.yAlign;
    sx = sy = s;
  }
  const form = vectorForm(ctx, drawing);
  // The form's box holds every viewport it is drawn in, mapped back into
  // its user space: inside the viewport SVG shows what a 'meet' drawing
  // paints past its view box, and a form is clipped to its box.
  const u0 = vx - ox / sx;
  const u1 = vx + (w - ox) / sx;
  const v0 = vy - oy / sy;
  const v1 = vy + (h - oy) / sy;
  const box: [number, number, number, number] = [
    Math.min(form.bbox[0], u0), Math.min(form.bbox[1], v0),
    Math.max(form.bbox[2], u1), Math.max(form.bbox[3], v1),
  ];
  if (box.some((v, i) => v !== form.bbox[i])) {
    form.bbox = box;
    form.stream.dict.set(PDFName.of('BBox'), ctx.page.doc.context.obj(box.map(round)));
  }
  ctx.page.pushOperators(
    pushGraphicsState(),
    // Clip to the viewport (overflow: hidden on the root svg).
    rectangle(round(x0), round(yTop - h), round(w), round(h)), clip(), endPath(),
    // SVG user space → PDF points: scale, flip y, place the viewBox origin.
    concatTransformationMatrix(
      round(sx), 0, 0, round(-sy),
      round(x0 + ox - vx * sx),
      round(yTop - oy + vy * sy),
    ),
    drawObject(formName(ctx, form.ref)),
    popGraphicsState(),
  );
}
