// Bake a 2-D affine matrix into an SVG path `d` string.
//
// Supports all SVG path commands. Relative commands are converted to absolute
// on the fly so the transform can be applied without tracking cursor state
// separately for each backend.
//
// Matrix form: [a, b, c, d, e, f] corresponds to
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f

export type AffineMatrix = readonly [number, number, number, number, number, number];

export const IDENTITY: AffineMatrix = [1, 0, 0, 1, 0, 0];

export function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function translate(x: number, y: number): AffineMatrix {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy: number): AffineMatrix {
  return [sx, 0, 0, sy, 0, 0];
}

function applyPoint(m: AffineMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Apply linear part only (for arc radii, for which translation is not
// meaningful). This is an approximation: a full transform of an elliptical
// arc under a non-uniform scale is not itself an arc. MathJax does not emit
// arcs in its TeX fonts, so in practice this path is exercised only when the
// caller passes in external SVG; keep the approximation simple.
function applyLinear(m: AffineMatrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

type Cmd = { op: string; args: number[] };

function tokenize(d: string): Cmd[] {
  const cmds: Cmd[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let current: Cmd | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      current = { op: m[1], args: [] };
      cmds.push(current);
    } else if (m[2]) {
      if (!current) throw new Error('SVG path starts with a number');
      current.args.push(Number(m[2]));
    }
  }
  return cmds;
}

function fmt(n: number): string {
  // Round to 3 decimals, drop trailing zeros.
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  if (r === 0) return '0';
  return r.toString();
}

// Transform the path. Output uses only absolute commands with a conservative
// whitespace policy that is round-trippable through any SVG consumer.
//
// Smooth-curve shorthands `T`/`t` and `S`/`s` are expanded to explicit `Q`/`C`
// commands. pdf-lib 1.17's SVG path parser has a bug in its `T` handler that
// miscomputes the implicit control point for *chained* T commands, producing
// ink-splatter artifacts on MathJax font glyphs (which use long T runs).
// Expanding here keeps the output portable across parsers.
export function transformPath(d: string, matrix: AffineMatrix): string {
  if (matrix === IDENTITY) return d;
  const cmds = tokenize(d);

  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  // Previous quadratic control point in ORIGINAL space, for T reflection.
  let prevQCx: number | null = null;
  let prevQCy: number | null = null;
  // Previous cubic second-control point in ORIGINAL space, for S reflection.
  let prevCC2x: number | null = null;
  let prevCC2y: number | null = null;

  const out: string[] = [];
  const emit = (op: string, ...args: number[]) => {
    out.push(op + args.map(fmt).join(' '));
  };
  const clearControlMemory = () => {
    prevQCx = prevQCy = prevCC2x = prevCC2y = null;
  };

  for (const { op, args } of cmds) {
    switch (op) {
      case 'M':
      case 'L': {
        for (let i = 0; i < args.length; i += 2) {
          const [x, y] = applyPoint(matrix, args[i]!, args[i + 1]!);
          if (i === 0 && op === 'M') {
            emit('M', x, y);
            startX = args[i]!;
            startY = args[i + 1]!;
          } else {
            emit('L', x, y);
          }
          cx = args[i]!;
          cy = args[i + 1]!;
        }
        clearControlMemory();
        break;
      }
      case 'm':
      case 'l': {
        for (let i = 0; i < args.length; i += 2) {
          const ax = cx + args[i]!;
          const ay = cy + args[i + 1]!;
          const [x, y] = applyPoint(matrix, ax, ay);
          if (i === 0 && op === 'm') {
            emit('M', x, y);
            startX = ax;
            startY = ay;
          } else {
            emit('L', x, y);
          }
          cx = ax;
          cy = ay;
        }
        clearControlMemory();
        break;
      }
      case 'H': {
        for (const a of args) {
          const [x, y] = applyPoint(matrix, a, cy);
          emit('L', x, y);
          cx = a;
        }
        clearControlMemory();
        break;
      }
      case 'h': {
        for (const a of args) {
          const ax = cx + a;
          const [x, y] = applyPoint(matrix, ax, cy);
          emit('L', x, y);
          cx = ax;
        }
        clearControlMemory();
        break;
      }
      case 'V': {
        for (const a of args) {
          const [x, y] = applyPoint(matrix, cx, a);
          emit('L', x, y);
          cy = a;
        }
        clearControlMemory();
        break;
      }
      case 'v': {
        for (const a of args) {
          const ay = cy + a;
          const [x, y] = applyPoint(matrix, cx, ay);
          emit('L', x, y);
          cy = ay;
        }
        clearControlMemory();
        break;
      }
      case 'C':
      case 'c': {
        const rel = op === 'c';
        for (let i = 0; i < args.length; i += 6) {
          const p1x = rel ? cx + args[i]! : args[i]!;
          const p1y = rel ? cy + args[i + 1]! : args[i + 1]!;
          const p2x = rel ? cx + args[i + 2]! : args[i + 2]!;
          const p2y = rel ? cy + args[i + 3]! : args[i + 3]!;
          const ex = rel ? cx + args[i + 4]! : args[i + 4]!;
          const ey = rel ? cy + args[i + 5]! : args[i + 5]!;
          const [a1x, a1y] = applyPoint(matrix, p1x, p1y);
          const [a2x, a2y] = applyPoint(matrix, p2x, p2y);
          const [aex, aey] = applyPoint(matrix, ex, ey);
          emit('C', a1x, a1y, a2x, a2y, aex, aey);
          prevCC2x = p2x;
          prevCC2y = p2y;
          prevQCx = prevQCy = null;
          cx = ex;
          cy = ey;
        }
        break;
      }
      case 'S':
      case 's': {
        // Expand S to C with an explicit first control point (reflection of
        // the previous cubic's second control across the current point).
        const rel = op === 's';
        for (let i = 0; i < args.length; i += 4) {
          const p1x: number = prevCC2x === null ? cx : 2 * cx - prevCC2x;
          const p1y: number = prevCC2y === null ? cy : 2 * cy - prevCC2y;
          const p2x = rel ? cx + args[i]! : args[i]!;
          const p2y = rel ? cy + args[i + 1]! : args[i + 1]!;
          const ex = rel ? cx + args[i + 2]! : args[i + 2]!;
          const ey = rel ? cy + args[i + 3]! : args[i + 3]!;
          const [a1x, a1y] = applyPoint(matrix, p1x, p1y);
          const [a2x, a2y] = applyPoint(matrix, p2x, p2y);
          const [aex, aey] = applyPoint(matrix, ex, ey);
          emit('C', a1x, a1y, a2x, a2y, aex, aey);
          prevCC2x = p2x;
          prevCC2y = p2y;
          prevQCx = prevQCy = null;
          cx = ex;
          cy = ey;
        }
        break;
      }
      case 'Q':
      case 'q': {
        const rel = op === 'q';
        for (let i = 0; i < args.length; i += 4) {
          const p1x = rel ? cx + args[i]! : args[i]!;
          const p1y = rel ? cy + args[i + 1]! : args[i + 1]!;
          const ex = rel ? cx + args[i + 2]! : args[i + 2]!;
          const ey = rel ? cy + args[i + 3]! : args[i + 3]!;
          const [a1x, a1y] = applyPoint(matrix, p1x, p1y);
          const [aex, aey] = applyPoint(matrix, ex, ey);
          emit('Q', a1x, a1y, aex, aey);
          prevQCx = p1x;
          prevQCy = p1y;
          prevCC2x = prevCC2y = null;
          cx = ex;
          cy = ey;
        }
        break;
      }
      case 'T':
      case 't': {
        // Expand T to Q with an explicit control point (reflection of the
        // previous quadratic's control across the current point). Avoids
        // pdf-lib 1.17's buggy T handler, which breaks chained T commands.
        const rel = op === 't';
        for (let i = 0; i < args.length; i += 2) {
          const p1x: number = prevQCx === null ? cx : 2 * cx - prevQCx;
          const p1y: number = prevQCy === null ? cy : 2 * cy - prevQCy;
          const ex = rel ? cx + args[i]! : args[i]!;
          const ey = rel ? cy + args[i + 1]! : args[i + 1]!;
          const [a1x, a1y] = applyPoint(matrix, p1x, p1y);
          const [aex, aey] = applyPoint(matrix, ex, ey);
          emit('Q', a1x, a1y, aex, aey);
          prevQCx = p1x;
          prevQCy = p1y;
          prevCC2x = prevCC2y = null;
          cx = ex;
          cy = ey;
        }
        break;
      }
      case 'A':
      case 'a': {
        const rel = op === 'a';
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i]!;
          const ry = args[i + 1]!;
          const rot = args[i + 2]!;
          const large = args[i + 3]!;
          const sweep = args[i + 4]!;
          const ex = rel ? cx + args[i + 5]! : args[i + 5]!;
          const ey = rel ? cy + args[i + 6]! : args[i + 6]!;
          const [nrx, nry] = applyLinear(matrix, rx, ry);
          const [aex, aey] = applyPoint(matrix, ex, ey);
          emit('A', Math.abs(nrx), Math.abs(nry), rot, large, sweep, aex, aey);
          cx = ex;
          cy = ey;
        }
        clearControlMemory();
        break;
      }
      case 'Z':
      case 'z': {
        emit('Z');
        cx = startX;
        cy = startY;
        clearControlMemory();
        break;
      }
      default:
        // Unknown command — drop.
        break;
    }
  }
  return out.join('');
}

// Parse an SVG `transform="..."` attribute value.
const TRANSFORM_FN_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

export function parseSvgTransform(attr: string): AffineMatrix {
  let m: AffineMatrix = IDENTITY;
  let match: RegExpExecArray | null;
  while ((match = TRANSFORM_FN_RE.exec(attr)) !== null) {
    const fn = match[1]!;
    const nums = match[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    let step: AffineMatrix = IDENTITY;
    switch (fn) {
      case 'matrix':
        if (nums.length === 6) {
          step = [nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!, nums[5]!];
        }
        break;
      case 'translate':
        step = translate(nums[0] ?? 0, nums[1] ?? 0);
        break;
      case 'scale':
        step = scale(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1);
        break;
      case 'rotate': {
        const rad = (nums[0] ?? 0) * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        if (nums.length >= 3) {
          const tx = nums[1]!;
          const ty = nums[2]!;
          step = multiply(translate(tx, ty), multiply([cos, sin, -sin, cos, 0, 0], translate(-tx, -ty)));
        } else {
          step = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case 'skewX': {
        const t = Math.tan((nums[0] ?? 0) * (Math.PI / 180));
        step = [1, 0, t, 1, 0, 0];
        break;
      }
      case 'skewY': {
        const t = Math.tan((nums[0] ?? 0) * (Math.PI / 180));
        step = [1, t, 0, 1, 0, 0];
        break;
      }
    }
    m = multiply(m, step);
  }
  return m;
}
