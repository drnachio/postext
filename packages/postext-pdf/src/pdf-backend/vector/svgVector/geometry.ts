// Matrices and transforms, path data with arcs turned into cubics, and
// the outlines of ellipses, rectangles and polylines
// (#1276: split out of svgVector.ts).
import type { PathSeg } from '../svgVector.js';

// ------------------------------------------------------------ geometry

export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform length scale of a matrix (geometric mean of its singular values). */
export function lengthScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

export function transformSegs(segs: PathSeg[], m: Matrix): PathSeg[] {
  return segs.map((s): PathSeg => {
    switch (s[0]) {
      case 'M':
      case 'L': {
        const [x, y] = apply(m, s[1], s[2]);
        return [s[0], x, y];
      }
      case 'C': {
        const [x1, y1] = apply(m, s[1], s[2]);
        const [x2, y2] = apply(m, s[3], s[4]);
        const [x, y] = apply(m, s[5], s[6]);
        return ['C', x1, y1, x2, y2, x, y];
      }
      default:
        return s;
    }
  });
}

export class Unsupported extends Error {}

export function unsupported(what: string): never {
  throw new Unsupported(what);
}

export function parseTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(value)) !== null) {
    if (value.slice(consumed, match.index).trim().replace(/,/g, '') !== '') unsupported('transform syntax');
    consumed = match.index + match[0].length;
    const args = match[2]!.trim().split(/[\s,]+/).filter((s) => s !== '').map(Number);
    if (args.some((v) => !Number.isFinite(v))) unsupported('transform args');
    let t: Matrix;
    switch (match[1]) {
      case 'matrix':
        if (args.length !== 6) unsupported('matrix()');
        t = [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!];
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const r: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const cx = args[1]!;
          const cy = args[2]!;
          t = mul(mul([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
        } else {
          t = r;
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        return unsupported(`transform ${match[1]}`);
    }
    m = mul(m, t);
  }
  if (value.slice(consumed).trim() !== '') unsupported('transform syntax');
  return m;
}

// ------------------------------------------------------------ path data

const KAPPA = 0.5522847498307936;

/** Endpoint-parameterised elliptical arc → cubic Béziers (SVG 1.1 §F.6). */
function arcToCubics(
  x1: number, y1: number,
  rx: number, ry: number,
  phiDeg: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number,
): PathSeg[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(num / den);
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: PathSeg[] = [];
  let theta = theta1;
  for (let i = 0; i < segments; i++) {
    const cos1 = Math.cos(theta);
    const sin1 = Math.sin(theta);
    const cos2 = Math.cos(theta + delta);
    const sin2 = Math.sin(theta + delta);
    // Derivative points on the unit circle, mapped through the ellipse.
    const p = (c: number, s: number): [number, number] => [
      cx + rx * cosPhi * c - ry * sinPhi * s,
      cy + rx * sinPhi * c + ry * cosPhi * s,
    ];
    const [ex1, ey1] = p(cos1, sin1);
    const [ex2, ey2] = p(cos2, sin2);
    const d1x = -rx * cosPhi * sin1 - ry * sinPhi * cos1;
    const d1y = -rx * sinPhi * sin1 + ry * cosPhi * cos1;
    const d2x = -rx * cosPhi * sin2 - ry * sinPhi * cos2;
    const d2y = -rx * sinPhi * sin2 + ry * cosPhi * cos2;
    const last = i === segments - 1;
    out.push(['C', ex1 + t * d1x, ey1 + t * d1y, ex2 - t * d2x, ey2 - t * d2y, last ? x2 : ex2, last ? y2 : ey2]);
    theta += delta;
  }
  return out;
}

/** Parse SVG path data into absolute M / L / C / Z segments. Relative
 *  commands, H / V, smooth curves, quadratics and arcs are all normalised. */
export function parsePathData(d: string): PathSeg[] {
  const out: PathSeg[] = [];
  let i = 0;
  const n = d.length;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // Last cubic / quadratic control point, for S / T reflection.
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;

  const skipSep = (): void => {
    while (i < n && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number => {
    skipSep();
    const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) unsupported('path number');
    i += m![0].length;
    return Number(m![0]);
  };
  const flag = (): boolean => {
    skipSep();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') unsupported('arc flag');
    i++;
    return ch === '1';
  };

  while (i < n) {
    skipSep();
    if (i >= n) break;
    const ch = d[i]!;
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd) {
      unsupported('path start');
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (upper) {
      case 'M': {
        const x = number() + ox;
        const y = number() + oy;
        out.push(['M', x, y]);
        cx = sx = x;
        cy = sy = y;
        lastC = lastQ = null;
        break;
      }
      case 'L': {
        const x = number() + ox;
        const y = number() + oy;
        out.push(['L', x, y]);
        cx = x;
        cy = y;
        lastC = lastQ = null;
        break;
      }
      case 'H': {
        const x = number() + ox;
        out.push(['L', x, cy]);
        cx = x;
        lastC = lastQ = null;
        break;
      }
      case 'V': {
        const y = number() + oy;
        out.push(['L', cx, y]);
        cy = y;
        lastC = lastQ = null;
        break;
      }
      case 'C': {
        const x1 = number() + ox, y1 = number() + oy;
        const x2 = number() + ox, y2 = number() + oy;
        const x = number() + ox, y = number() + oy;
        out.push(['C', x1, y1, x2, y2, x, y]);
        lastC = [x2, y2];
        lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        const x2 = number() + ox, y2 = number() + oy;
        const x = number() + ox, y = number() + oy;
        const x1 = lastC ? 2 * cx - lastC[0] : cx;
        const y1 = lastC ? 2 * cy - lastC[1] : cy;
        out.push(['C', x1, y1, x2, y2, x, y]);
        lastC = [x2, y2];
        lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Q':
      case 'T': {
        let qx: number, qy: number;
        if (upper === 'Q') {
          qx = number() + ox;
          qy = number() + oy;
        } else {
          qx = lastQ ? 2 * cx - lastQ[0] : cx;
          qy = lastQ ? 2 * cy - lastQ[1] : cy;
        }
        const x = number() + ox, y = number() + oy;
        out.push(['C',
          cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy),
          x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y),
          x, y]);
        lastQ = [qx, qy];
        lastC = null;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = number(), ry = number(), rot = number();
        const large = flag(), sweep = flag();
        const x = number() + ox, y = number() + oy;
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y));
        lastC = lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        out.push(['Z']);
        cx = sx;
        cy = sy;
        lastC = lastQ = null;
        break;
      }
      default:
        unsupported(`path command ${cmd}`);
    }
    if (upper === 'Z') {
      // A closepath takes no arguments; the next token must be a command.
      skipSep();
      if (i < n && !/[a-zA-Z]/.test(d[i]!)) unsupported('path data after Z');
    }
  }
  return out;
}

// ------------------------------------------------------------ shapes

export function ellipseSegs(cx: number, cy: number, rx: number, ry: number): PathSeg[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
}

export function rectSegs(x: number, y: number, w: number, h: number, rx: number, ry: number): PathSeg[] {
  if (rx <= 0 || ry <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', x + rx, y],
    ['L', x + w - rx, y],
    ['C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry],
    ['L', x + w, y + h - ry],
    ['C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h],
    ['L', x + rx, y + h],
    ['C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
    ['L', x, y + ry],
    ['C', x, y + ry - ky, x + rx - kx, y, x + rx, y],
    ['Z'],
  ];
}

export function pointsSegs(points: string, close: boolean): PathSeg[] {
  const nums = points.trim().split(/[\s,]+/).filter((s) => s !== '').map(Number);
  if (nums.length < 2 || nums.length % 2 !== 0 || nums.some((v) => !Number.isFinite(v))) {
    unsupported('points');
  }
  const segs: PathSeg[] = [['M', nums[0]!, nums[1]!]];
  for (let i = 2; i < nums.length; i += 2) segs.push(['L', nums[i]!, nums[i + 1]!]);
  if (close) segs.push(['Z']);
  return segs;
}
