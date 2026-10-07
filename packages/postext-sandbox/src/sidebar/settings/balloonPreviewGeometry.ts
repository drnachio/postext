// Geometry of the small balloon drawn on a balloon style's card: the body
// outline around a sample text block and its tail, as SVG path data. A
// sketch of the style (shape, tail, air, dash, double outline, spikes), not
// the lettering engine: the text width is estimated, the text block is
// always horizontal and the tail always points down to the start side.
// Pure and deterministic.

import type { ComicBalloonShape, ComicBalloonTail, Dimension } from 'postext';

export interface BalloonPreviewInput {
  shape: ComicBalloonShape;
  tail: ComicBalloonTail;
  /** Superellipse exponent of an oval (2 = ellipse). */
  roundness: number;
  burstPoints: number;
  /** Depth of a burst's spikes, a fraction of the body. */
  burstDepth: number;
  /** Hand-drawn wobble, 0–1. */
  wobble: number;
  /** Air between the text block and the outline, px. */
  padding: number;
  /** Width of the tail at the body, px. */
  tailWidth: number;
  /** Fraction of the gap to the speaker the tail reaches. */
  tailReach: number;
  /** Size of the text block, px. */
  textWidth: number;
  textHeight: number;
}

export interface BalloonPreviewGeometry {
  /** Body outline (absent for `shape: 'none'`). */
  body?: string;
  /** Tail outline (`wedge`, `curved`, `zigzag`). */
  tail?: string;
  /** Thought bubbles (`tail: 'bubbles'`). */
  bubbles: { cx: number; cy: number; r: number }[];
  /** Centre of the text block. */
  cx: number;
  cy: number;
  /** Box every mark fits in (before the stroke). */
  bounds: { x: number; y: number; width: number; height: number };
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

type Pt = { x: number; y: number };

function polygonPath(points: readonly Pt[]): string {
  return `M${points.map((p) => `${f(p.x)} ${f(p.y)}`).join('L')}Z`;
}

/** A gentle radial wobble, the same for the same angle (no randomness). */
function wobbleAt(theta: number, wobble: number): number {
  if (wobble <= 0) return 1;
  return 1 + wobble * 0.05 * (Math.sin(3 * theta + 0.7) + 0.6 * Math.sin(7 * theta + 2.1));
}

/** A point of the superellipse `|x/a|^n + |y/b|^n = 1` at parameter θ. */
function superPoint(cx: number, cy: number, a: number, b: number, n: number, theta: number): Pt {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  return { x: cx + a * Math.sign(c) * Math.abs(c) ** e, y: cy + b * Math.sign(s) * Math.abs(s) ** e };
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  return [
    `M${f(x + rr)} ${f(y)}`,
    `H${f(x + w - rr)}`,
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}`,
    `V${f(y + h - rr)}`,
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w - rr)} ${f(y + h)}`,
    `H${f(x + rr)}`,
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x)} ${f(y + h - rr)}`,
    `V${f(y + rr)}`,
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)}`,
    'Z',
  ].join('');
}

/** The body outline and the half-axes of the ellipse that stands for it
 *  when the tail is attached. */
function bodyOutline(input: BalloonPreviewInput, cx: number, cy: number): { d?: string; a: number; b: number; points: Pt[] } {
  const hw = input.textWidth / 2 + input.padding;
  const hh = input.textHeight / 2 + input.padding;
  switch (input.shape) {
    case 'none':
      return { a: hw, b: hh, points: [] };
    case 'rectangle':
    case 'rounded': {
      const r = input.shape === 'rounded' ? Math.min(hw, hh) * 0.6 : 0;
      const points = [{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy + hh }];
      return { d: roundedRectPath(cx - hw, cy - hh, hw * 2, hh * 2, r), a: hw, b: hh, points };
    }
    case 'cloud': {
      const a = hw * Math.SQRT2 * 1.05;
      const b = hh * Math.SQRT2 * 1.05;
      const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      const count = Math.max(7, Math.round(perimeter / Math.max(8, b * 0.75)));
      const pts: Pt[] = [];
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        pts.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
      }
      let d = `M${f(pts[0]!.x)} ${f(pts[0]!.y)}`;
      for (let i = 0; i < count; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % count]!;
        const chord = Math.hypot(q.x - p.x, q.y - p.y);
        d += `A${f(chord * 0.6)} ${f(chord * 0.6)} 0 0 1 ${f(q.x)} ${f(q.y)}`;
      }
      return { d: `${d}Z`, a, b, points: pts.map((p) => ({ x: cx + (p.x - cx) * 1.15, y: cy + (p.y - cy) * 1.25 })) };
    }
    case 'burst': {
      const a = hw * Math.SQRT2;
      const b = hh * Math.SQRT2;
      const n = Math.max(5, Math.round(input.burstPoints));
      const depth = Math.max(0.05, input.burstDepth);
      const pts: Pt[] = [];
      for (let i = 0; i < n * 2; i++) {
        const t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        // Spikes of slightly different lengths, in a fixed pattern.
        const k = i % 2 === 0 ? 1 + depth * (1 + 0.25 * (((i * 7) % 5) - 2) / 2) : 1;
        pts.push({ x: cx + a * k * Math.cos(t), y: cy + b * k * Math.sin(t) });
      }
      return { d: polygonPath(pts), a, b, points: pts };
    }
    case 'wavy':
    case 'electric': {
      const a = hw * Math.SQRT2;
      const b = hh * Math.SQRT2;
      const pts: Pt[] = [];
      if (input.shape === 'wavy') {
        const samples = 120;
        for (let i = 0; i < samples; i++) {
          const t = (i / samples) * Math.PI * 2;
          const k = 1 + 0.045 * Math.sin(14 * t);
          pts.push({ x: cx + a * k * Math.cos(t), y: cy + b * k * Math.sin(t) });
        }
      } else {
        const teeth = 36;
        for (let i = 0; i < teeth; i++) {
          const t = (i / teeth) * Math.PI * 2;
          const k = i % 2 === 0 ? 1.07 : 0.95;
          pts.push({ x: cx + a * k * Math.cos(t), y: cy + b * k * Math.sin(t) });
        }
      }
      return { d: polygonPath(pts), a, b, points: pts };
    }
    case 'oval':
    default: {
      const n = Math.max(1.2, input.roundness || 2);
      const k = 2 ** (1 / n);
      const a = hw * k;
      const b = hh * k;
      const pts: Pt[] = [];
      const samples = 96;
      for (let i = 0; i < samples; i++) {
        const t = (i / samples) * Math.PI * 2;
        const p = superPoint(cx, cy, a, b, n, t);
        const w = wobbleAt(t, input.wobble);
        pts.push({ x: cx + (p.x - cx) * w, y: cy + (p.y - cy) * w });
      }
      return { d: polygonPath(pts), a, b, points: pts };
    }
  }
}

/** Body outline, tail and bubbles of a preview balloon, the text block
 *  centred on (`cx`, `cy`). */
export function balloonPreviewGeometry(input: BalloonPreviewInput): BalloonPreviewGeometry {
  const cx = 0;
  const cy = 0;
  const body = bodyOutline(input, cx, cy);
  const all: Pt[] = [...body.points];
  if (body.points.length === 0) {
    all.push({ x: cx - input.textWidth / 2, y: cy - input.textHeight / 2 }, { x: cx + input.textWidth / 2, y: cy + input.textHeight / 2 });
  }
  const out: BalloonPreviewGeometry = { cx, cy, bubbles: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  if (body.d) out.body = body.d;

  if (input.tail !== 'none' && input.shape !== 'none') {
    // The speaker sits below the balloon, towards its start side; the tail
    // covers `tailReach` of the way there.
    const gap = Math.max(18, body.b * 1.4);
    const speaker = { x: cx - body.a * 0.55, y: cy + body.b + gap };
    const theta = Math.atan2((speaker.y - cy) / body.b, (speaker.x - cx) / body.a);
    const edge = { x: cx + body.a * Math.cos(theta), y: cy + body.b * Math.sin(theta) };
    const reach = Math.min(0.95, Math.max(0.15, input.tailReach || 0.55));
    const tip = { x: edge.x + (speaker.x - edge.x) * reach, y: edge.y + (speaker.y - edge.y) * reach };
    const radius = (body.a + body.b) / 2;
    const half = Math.min(0.6, Math.max(0.04, input.tailWidth / 2 / radius));
    // The base starts a little inside the body so the outline merges.
    const inset = 0.92;
    const base = (t: number): Pt => ({ x: cx + body.a * inset * Math.cos(t), y: cy + body.b * inset * Math.sin(t) });
    const b1 = base(theta - half);
    const b2 = base(theta + half);
    const len = Math.hypot(tip.x - edge.x, tip.y - edge.y);
    const ux = (tip.x - edge.x) / (len || 1);
    const uy = (tip.y - edge.y) / (len || 1);
    // Bend to the start side (a curved tail sweeps like a pen stroke).
    const px = uy;
    const py = -ux;
    switch (input.tail) {
      case 'wedge':
        out.tail = polygonPath([b1, tip, b2]);
        all.push(tip);
        break;
      case 'curved': {
        const bend = len * 0.22;
        const c1 = { x: (b1.x + tip.x) / 2 + px * bend, y: (b1.y + tip.y) / 2 + py * bend };
        const c2 = { x: (b2.x + tip.x) / 2 + px * bend, y: (b2.y + tip.y) / 2 + py * bend };
        out.tail = `M${f(b1.x)} ${f(b1.y)}Q${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)}Q${f(c2.x)} ${f(c2.y)} ${f(b2.x)} ${f(b2.y)}Z`;
        all.push(tip, c1, c2);
        break;
      }
      case 'zigzag': {
        // A lightning bolt: a centre line that zigzags, narrowing to the tip.
        const steps = 4;
        const width = Math.min(input.tailWidth, len * 0.5);
        const left: Pt[] = [];
        const right: Pt[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const side = i === 0 || i === steps ? 0 : i % 2 === 0 ? -1 : 1;
          const c = { x: edge.x + ux * len * t + px * side * width * 0.6, y: edge.y + uy * len * t + py * side * width * 0.6 };
          const w = (width / 2) * (1 - t);
          left.push({ x: c.x + px * w, y: c.y + py * w });
          right.push({ x: c.x - px * w, y: c.y - py * w });
        }
        const pts = [b1, ...left.slice(1), ...right.slice(1, -1).reverse(), b2];
        out.tail = polygonPath(pts);
        all.push(...pts);
        break;
      }
      case 'bubbles': {
        const r0 = Math.max(3.5, input.tailWidth * 0.6);
        const radii = [r0, r0 * 0.68, r0 * 0.45];
        const span = Math.hypot(speaker.x - edge.x, speaker.y - edge.y) * reach;
        let at = radii[0]! * 1.4;
        for (const r of radii) {
          const c = { x: edge.x + ux * at, y: edge.y + uy * at };
          out.bubbles.push({ cx: c.x, cy: c.y, r });
          all.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
          at += r * 2 + Math.max(2, (span - at) * 0.18);
        }
        break;
      }
      default:
        break;
    }
  }

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  out.bounds = { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
  return out;
}

/** A dimension in px at `pxPerPt`, `em` against `emPx`. */
export function dimensionToPx(d: Dimension | undefined, pxPerPt: number, emPx: number): number {
  if (!d) return 0;
  switch (d.unit) {
    case 'em':
    case 'rem':
      return d.value * emPx;
    case 'mm':
      return (d.value / 25.4) * 72 * pxPerPt;
    case 'cm':
      return (d.value / 2.54) * 72 * pxPerPt;
    case 'in':
      return d.value * 72 * pxPerPt;
    case 'px':
      return d.value * 0.75 * pxPerPt;
    case 'pt':
    default:
      return d.value * pxPerPt;
  }
}

/** Rough width of a line of text: CJK and other wide characters one em,
 *  the rest a little over half an em. */
export function estimateTextWidth(text: string, fontPx: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x2e80 && code <= 0xffef) em += 1;
    else if (ch === ' ') em += 0.3;
    else em += /[A-Z]/.test(ch) ? 0.64 : 0.54;
  }
  return em * fontPx * (bold ? 1.06 : 1);
}
