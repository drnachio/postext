/**
 * A small ICC profile reader: enough of ICC.1 (v2 and v4) to run the
 * conversions print production needs — matrix/TRC RGB and gray profiles,
 * and the lookup-table pipelines of CMYK output profiles (`mft1`, `mft2`,
 * `mAB `, `mBA `). Pure TypeScript, no WASM: it runs in the layout worker,
 * the PDF worker and Node alike.
 *
 * Pipelines work on normalized values: device channels in 0..1, and the
 * PCS as the profile encodes it (Lab or XYZ, also normalized 0..1). The
 * transform layer (`transform.ts`) turns that PCS into real Lab/XYZ.
 */

export type IccColorSpace = 'RGB' | 'CMYK' | 'GRAY' | 'Lab' | 'XYZ' | 'other';
export type IccPcs = 'Lab' | 'XYZ';

/** A normalized channel tuple; 0..1 per channel. */
export type Channels = number[];
export type Pipeline = (input: Channels) => Channels;

/** Which PCS encoding a pipeline's PCS side uses. v2 16-bit Lab (`mft2`)
 *  puts L* 100 at 0xFF00; v4 (`mAB `/`mBA `) at 0xFFFF; 8-bit (`mft1`) at
 *  0xFF. */
export type PcsEncoding = 'lab-v2' | 'lab-v4' | 'lab-8' | 'xyz';

export interface LutPipeline {
  run: Pipeline;
  inputChannels: number;
  outputChannels: number;
  pcsEncoding: PcsEncoding;
}

export interface XYZ {
  X: number;
  Y: number;
  Z: number;
}

export interface IccProfile {
  bytes: Uint8Array;
  /** Major.minor, e.g. 2.2 or 4.3. */
  version: number;
  deviceClass: string;
  colorSpace: IccColorSpace;
  pcs: IccPcs;
  description: string;
  copyright: string;
  /** Media white point (`wtpt`), D50-relative. */
  mediaWhite: XYZ;
  /** Media black point (`bkpt`) when the profile has one. */
  mediaBlack?: XYZ;
  /** Device → PCS per rendering intent (0 perceptual, 1 relative, 2 saturation). */
  aToB: Partial<Record<0 | 1 | 2, LutPipeline>>;
  /** PCS → device per rendering intent. */
  bToA: Partial<Record<0 | 1 | 2, LutPipeline>>;
  /** RGB matrix/TRC model: columns rXYZ, gXYZ, bXYZ (row-major 3×3) and
   *  the three tone curves. */
  matrixTrc?: { matrix: number[]; trc: [Curve, Curve, Curve] };
  /** Gray TRC model. */
  grayTrc?: Curve;
  /** A short stable hash of the bytes, for caches. */
  hash: string;
}

export type Curve = (x: number) => number;

export class IccParseError extends Error {}

const D50: XYZ = { X: 0.9642, Y: 1, Z: 0.8249 };

function sig(view: DataView, off: number): string {
  return String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));
}

function s15f16(view: DataView, off: number): number {
  return view.getInt32(off) / 65536;
}

function colorSpaceOf(s: string): IccColorSpace {
  switch (s) {
    case 'RGB ': return 'RGB';
    case 'CMYK': return 'CMYK';
    case 'GRAY': return 'GRAY';
    case 'Lab ': return 'Lab';
    case 'XYZ ': return 'XYZ';
    default: return 'other';
  }
}

function channelsOf(space: IccColorSpace): number {
  switch (space) {
    case 'CMYK': return 4;
    case 'GRAY': return 1;
    default: return 3;
  }
}

function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  // Every 7th byte plus the length is plenty to tell profiles apart.
  for (let i = 0; i < bytes.length; i += 7) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= bytes.length;
  return (Math.imul(h, 0x01000193) >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Curves

function identityCurve(x: number): number {
  return x;
}

function tableCurve(table: Float64Array): Curve {
  const n = table.length - 1;
  if (n <= 0) return () => table[0] ?? 0;
  return (x) => {
    if (!(x > 0)) return table[0]!;
    if (x >= 1) return table[n]!;
    const p = x * n;
    const i = Math.floor(p);
    const f = p - i;
    return table[i]! + (table[i + 1]! - table[i]!) * f;
  };
}

/** `curv` or `para` at `off`; returns the curve and the byte length used
 *  (padded to 4) so curve sequences can be walked. */
function readCurve(view: DataView, off: number): { curve: Curve; length: number } {
  const type = sig(view, off);
  if (type === 'curv') {
    const count = view.getUint32(off + 8);
    const length = 12 + count * 2;
    const padded = length + ((4 - (length % 4)) % 4);
    if (count === 0) return { curve: identityCurve, length: padded };
    if (count === 1) {
      const gamma = view.getUint16(off + 12) / 256;
      return { curve: (x) => (x <= 0 ? 0 : Math.pow(x, gamma)), length: padded };
    }
    const table = new Float64Array(count);
    for (let i = 0; i < count; i++) table[i] = view.getUint16(off + 12 + i * 2) / 65535;
    return { curve: tableCurve(table), length: padded };
  }
  if (type === 'para') {
    const fn = view.getUint16(off + 8);
    const counts = [1, 3, 4, 5, 7];
    const n = counts[fn];
    if (n === undefined) throw new IccParseError(`unknown parametric curve ${fn}`);
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push(s15f16(view, off + 12 + i * 4));
    const length = 12 + n * 4;
    const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = p as [number, ...number[]];
    let curve: Curve;
    switch (fn) {
      case 0: curve = (x) => (x <= 0 ? 0 : Math.pow(x, g)); break;
      case 1: curve = (x) => (x >= -b / a ? Math.pow(a * x + b, g) : 0); break;
      case 2: curve = (x) => (x >= -b / a ? Math.pow(a * x + b, g) + c : c); break;
      case 3: curve = (x) => (x >= d ? Math.pow(a * x + b, g) : c * x); break;
      default: curve = (x) => (x >= d ? Math.pow(a * x + b, g) + e : c * x + f); break;
    }
    return { curve: (x) => clamp01(curve(x)), length };
  }
  throw new IccParseError(`unsupported curve type ${type}`);
}

function readCurves(view: DataView, off: number, count: number): Curve[] {
  const out: Curve[] = [];
  let at = off;
  for (let i = 0; i < count; i++) {
    const { curve, length } = readCurve(view, at);
    out.push(curve);
    at += length;
  }
  return out;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ---------------------------------------------------------------------------
// CLUT interpolation

/** Multilinear interpolation over an n-dimensional grid (`grid[d]` points
 *  per input dimension, the first input varying slowest — ICC order).
 *  Three-input tables use tetrahedral interpolation, which is what colour
 *  engines use and keeps neutral axes neutral. */
function makeClut(data: Float64Array, grid: number[], outputs: number): Pipeline {
  const dims = grid.length;
  const strides = new Array<number>(dims);
  let s = outputs;
  for (let d = dims - 1; d >= 0; d--) {
    strides[d] = s;
    s *= grid[d]!;
  }
  if (dims === 3) return tetrahedral(data, grid, strides, outputs);
  const corners = 1 << dims;
  return (input) => {
    const base = new Array<number>(dims);
    const frac = new Array<number>(dims);
    for (let d = 0; d < dims; d++) {
      const g = grid[d]! - 1;
      const p = clamp01(input[d] ?? 0) * g;
      let i = Math.floor(p);
      if (i >= g) i = g - 1;
      if (i < 0) i = 0;
      base[d] = i;
      frac[d] = g === 0 ? 0 : p - i;
    }
    const out = new Array<number>(outputs).fill(0);
    for (let c = 0; c < corners; c++) {
      let w = 1;
      let idx = 0;
      for (let d = 0; d < dims; d++) {
        const bit = (c >> (dims - 1 - d)) & 1;
        const f = frac[d]!;
        w *= bit ? f : 1 - f;
        idx += (base[d]! + bit) * strides[d]!;
      }
      if (w === 0) continue;
      for (let o = 0; o < outputs; o++) out[o]! += w * data[idx + o]!;
    }
    return out;
  };
}

function tetrahedral(data: Float64Array, grid: number[], strides: number[], outputs: number): Pipeline {
  const [g0, g1, g2] = [grid[0]! - 1, grid[1]! - 1, grid[2]! - 1];
  const [s0, s1, s2] = [strides[0]!, strides[1]!, strides[2]!];
  const cell = (p: number, g: number): [number, number] => {
    const v = clamp01(p) * g;
    let i = Math.floor(v);
    if (i >= g) i = g - 1;
    if (i < 0) i = 0;
    return [i, g === 0 ? 0 : v - i];
  };
  return (input) => {
    const [i0, rx] = cell(input[0] ?? 0, g0);
    const [i1, ry] = cell(input[1] ?? 0, g1);
    const [i2, rz] = cell(input[2] ?? 0, g2);
    const b = i0 * s0 + i1 * s1 + i2 * s2;
    const X = g0 === 0 ? 0 : s0;
    const Y = g1 === 0 ? 0 : s1;
    const Z = g2 === 0 ? 0 : s2;
    const out = new Array<number>(outputs);
    for (let o = 0; o < outputs; o++) {
      const c0 = data[b + o]!;
      let v: number;
      if (rx >= ry) {
        if (ry >= rz) {
          const c1 = data[b + X + o]! - c0;
          const c2 = data[b + X + Y + o]! - data[b + X + o]!;
          const c3 = data[b + X + Y + Z + o]! - data[b + X + Y + o]!;
          v = c0 + c1 * rx + c2 * ry + c3 * rz;
        } else if (rz >= rx) {
          const c1 = data[b + X + Z + o]! - data[b + Z + o]!;
          const c2 = data[b + X + Y + Z + o]! - data[b + X + Z + o]!;
          const c3 = data[b + Z + o]! - c0;
          v = c0 + c1 * rx + c2 * ry + c3 * rz;
        } else {
          const c1 = data[b + X + o]! - c0;
          const c2 = data[b + X + Y + Z + o]! - data[b + X + Z + o]!;
          const c3 = data[b + X + Z + o]! - data[b + X + o]!;
          v = c0 + c1 * rx + c2 * ry + c3 * rz;
        }
      } else if (rz >= ry) {
        const c1 = data[b + X + Y + Z + o]! - data[b + Y + Z + o]!;
        const c2 = data[b + Y + Z + o]! - data[b + Z + o]!;
        const c3 = data[b + Z + o]! - c0;
        v = c0 + c1 * rx + c2 * ry + c3 * rz;
      } else if (rz >= rx) {
        const c1 = data[b + X + Y + Z + o]! - data[b + Y + Z + o]!;
        const c2 = data[b + Y + o]! - c0;
        const c3 = data[b + Y + Z + o]! - data[b + Y + o]!;
        v = c0 + c1 * rx + c2 * ry + c3 * rz;
      } else {
        const c1 = data[b + X + Y + o]! - data[b + Y + o]!;
        const c2 = data[b + Y + o]! - c0;
        const c3 = data[b + X + Y + Z + o]! - data[b + X + Y + o]!;
        v = c0 + c1 * rx + c2 * ry + c3 * rz;
      }
      out[o] = v;
    }
    return out;
  };
}

// ---------------------------------------------------------------------------
// lut8 / lut16 (v2)

function readLutV2(view: DataView, off: number, pcsIsInput: boolean, pcs: IccPcs): LutPipeline {
  const type = sig(view, off);
  const is16 = type === 'mft2';
  const inCh = view.getUint8(off + 8);
  const outCh = view.getUint8(off + 9);
  const gridPoints = view.getUint8(off + 10);
  const matrix: number[] = [];
  for (let i = 0; i < 9; i++) matrix.push(s15f16(view, off + 12 + i * 4));
  let at = off + 48;
  let inEntries = 256;
  let outEntries = 256;
  if (is16) {
    inEntries = view.getUint16(at);
    outEntries = view.getUint16(at + 2);
    at += 4;
  }
  const read = is16 ? (o: number) => view.getUint16(o) / 65535 : (o: number) => view.getUint8(o) / 255;
  const step = is16 ? 2 : 1;
  const inCurves: Curve[] = [];
  for (let c = 0; c < inCh; c++) {
    const t = new Float64Array(inEntries);
    for (let i = 0; i < inEntries; i++) t[i] = read(at + i * step);
    inCurves.push(tableCurve(t));
    at += inEntries * step;
  }
  const clutSize = Math.pow(gridPoints, inCh) * outCh;
  const clut = new Float64Array(clutSize);
  for (let i = 0; i < clutSize; i++) clut[i] = read(at + i * step);
  at += clutSize * step;
  const outCurves: Curve[] = [];
  for (let c = 0; c < outCh; c++) {
    const t = new Float64Array(outEntries);
    for (let i = 0; i < outEntries; i++) t[i] = read(at + i * step);
    outCurves.push(tableCurve(t));
    at += outEntries * step;
  }
  const grid = new Array<number>(inCh).fill(gridPoints);
  const lookup = makeClut(clut, grid, outCh);
  // The matrix only applies when the input is XYZ.
  const useMatrix = pcsIsInput && pcs === 'XYZ' && !isIdentity(matrix);
  const run: Pipeline = (input) => {
    let x = input;
    if (useMatrix) x = mulMatrix(matrix, x);
    const a = new Array<number>(inCh);
    for (let c = 0; c < inCh; c++) a[c] = inCurves[c]!(clamp01(x[c] ?? 0));
    const b = lookup(a);
    const out = new Array<number>(outCh);
    for (let c = 0; c < outCh; c++) out[c] = outCurves[c]!(clamp01(b[c]!));
    return out;
  };
  const pcsEncoding: PcsEncoding = pcs === 'XYZ' ? 'xyz' : is16 ? 'lab-v2' : 'lab-8';
  return { run, inputChannels: inCh, outputChannels: outCh, pcsEncoding };
}

function isIdentity(m: number[]): boolean {
  return m.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-6);
}

function mulMatrix(m: number[], v: Channels): Channels {
  return [
    m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!,
    m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!,
    m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!,
  ];
}

// ---------------------------------------------------------------------------
// lutAtoB / lutBtoA (v4)

function readClutV4(view: DataView, off: number, inCh: number, outCh: number): Pipeline {
  const grid: number[] = [];
  for (let i = 0; i < inCh; i++) grid.push(view.getUint8(off + i));
  const precision = view.getUint8(off + 16);
  let size = outCh;
  for (const g of grid) size *= g;
  const data = new Float64Array(size);
  const at = off + 20;
  for (let i = 0; i < size; i++) {
    data[i] = precision === 1 ? view.getUint8(at + i) / 255 : view.getUint16(at + i * 2) / 65535;
  }
  return makeClut(data, grid, outCh);
}

function readLutV4(view: DataView, off: number, aToB: boolean, pcs: IccPcs): LutPipeline {
  const inCh = view.getUint8(off + 8);
  const outCh = view.getUint8(off + 9);
  const oB = view.getUint32(off + 12);
  const oMatrix = view.getUint32(off + 16);
  const oM = view.getUint32(off + 20);
  const oClut = view.getUint32(off + 24);
  const oA = view.getUint32(off + 28);
  // A side has the device channel count; B and M the PCS side (3).
  const aCount = aToB ? inCh : outCh;
  const bCount = aToB ? outCh : inCh;
  const B = oB ? readCurves(view, off + oB, bCount) : null;
  const M = oM ? readCurves(view, off + oM, bCount) : null;
  const A = oA ? readCurves(view, off + oA, aCount) : null;
  const clut = oClut ? readClutV4(view, off + oClut, aToB ? inCh : 3, aToB ? 3 : outCh) : null;
  let matrix: number[] | null = null;
  if (oMatrix) {
    matrix = [];
    for (let i = 0; i < 12; i++) matrix.push(s15f16(view, off + oMatrix + i * 4));
  }
  const applyCurves = (curves: Curve[] | null, x: Channels): Channels =>
    curves ? x.map((v, i) => curves[i]!(clamp01(v))) : x;
  const applyMatrix = (x: Channels): Channels => {
    if (!matrix) return x;
    const m = matrix;
    return [
      clamp01(m[0]! * x[0]! + m[1]! * x[1]! + m[2]! * x[2]! + m[9]!),
      clamp01(m[3]! * x[0]! + m[4]! * x[1]! + m[5]! * x[2]! + m[10]!),
      clamp01(m[6]! * x[0]! + m[7]! * x[1]! + m[8]! * x[2]! + m[11]!),
    ];
  };
  const run: Pipeline = aToB
    ? (input) => {
        let x = applyCurves(A, input.slice(0, inCh));
        if (clut) x = clut(x);
        x = applyCurves(M, x);
        x = applyMatrix(x);
        return applyCurves(B, x);
      }
    : (input) => {
        let x = applyCurves(B, input.slice(0, inCh));
        x = applyMatrix(x);
        x = applyCurves(M, x);
        if (clut) x = clut(x);
        return applyCurves(A, x).map(clamp01);
      };
  return { run, inputChannels: inCh, outputChannels: outCh, pcsEncoding: pcs === 'XYZ' ? 'xyz' : 'lab-v4' };
}

// ---------------------------------------------------------------------------
// Text tags

function readText(view: DataView, off: number, size: number): string {
  const type = sig(view, off);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + off, size);
  if (type === 'desc') {
    const n = view.getUint32(off + 8);
    return latin1(bytes.subarray(12, 12 + Math.max(0, n - 1)));
  }
  if (type === 'text') return latin1(bytes.subarray(8)).replace(/\0+$/, '');
  if (type === 'mluc') {
    const count = view.getUint32(off + 8);
    if (count === 0) return '';
    // Prefer English; otherwise the first record.
    let rec = 0;
    for (let i = 0; i < count; i++) {
      if (sig(view, off + 16 + i * 12).startsWith('en')) {
        rec = i;
        break;
      }
    }
    const len = view.getUint32(off + 16 + rec * 12 + 4);
    const at = view.getUint32(off + 16 + rec * 12 + 8);
    let s = '';
    for (let i = 0; i < len; i += 2) s += String.fromCharCode(view.getUint16(off + at + i));
    return s.replace(/\0+$/, '');
  }
  return '';
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s.replace(/\0+$/, '');
}

function readXYZ(view: DataView, off: number): XYZ {
  return { X: s15f16(view, off + 8), Y: s15f16(view, off + 12), Z: s15f16(view, off + 16) };
}

// ---------------------------------------------------------------------------

/** Parse an ICC profile. Throws `IccParseError` on anything it cannot read
 *  (a truncated file, an unknown pipeline type in a tag it needs). */
export function parseIccProfile(input: Uint8Array | ArrayBuffer): IccProfile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 132) throw new IccParseError('not an ICC profile (too short)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (sig(view, 36) !== 'acsp') throw new IccParseError('not an ICC profile (no acsp signature)');
  const major = view.getUint8(8);
  const minor = view.getUint8(9) >> 4;
  const deviceClass = sig(view, 12);
  const colorSpace = colorSpaceOf(sig(view, 16));
  const pcsSig = sig(view, 20);
  const pcs: IccPcs = pcsSig === 'XYZ ' ? 'XYZ' : 'Lab';
  const tagCount = view.getUint32(128);
  const tags = new Map<string, { off: number; size: number }>();
  for (let i = 0; i < tagCount; i++) {
    const at = 132 + i * 12;
    if (at + 12 > bytes.length) throw new IccParseError('truncated tag table');
    const off = view.getUint32(at + 4);
    const size = view.getUint32(at + 8);
    if (off + size > bytes.length) throw new IccParseError(`tag ${sig(view, at)} runs past the end`);
    tags.set(sig(view, at), { off, size });
  }
  const tag = (s: string) => tags.get(s);
  const text = (s: string) => {
    const t = tag(s);
    return t ? readText(view, t.off, t.size) : '';
  };
  const xyz = (s: string) => {
    const t = tag(s);
    return t ? readXYZ(view, t.off) : undefined;
  };

  const lut = (s: string, aToB: boolean): LutPipeline | undefined => {
    const t = tag(s);
    if (!t) return undefined;
    const type = sig(view, t.off);
    if (type === 'mft1' || type === 'mft2') return readLutV2(view, t.off, !aToB, pcs);
    if (type === 'mAB ' || type === 'mBA ') return readLutV4(view, t.off, aToB, pcs);
    throw new IccParseError(`unsupported ${s} type ${type}`);
  };

  const aToB: IccProfile['aToB'] = {};
  const bToA: IccProfile['bToA'] = {};
  for (const intent of [0, 1, 2] as const) {
    const a = lut(`A2B${intent}`, true);
    const b = lut(`B2A${intent}`, false);
    if (a) aToB[intent] = a;
    if (b) bToA[intent] = b;
  }

  let matrixTrc: IccProfile['matrixTrc'];
  const rX = xyz('rXYZ');
  const gX = xyz('gXYZ');
  const bX = xyz('bXYZ');
  const rT = tag('rTRC');
  const gT = tag('gTRC');
  const bT = tag('bTRC');
  if (colorSpace === 'RGB' && rX && gX && bX && rT && gT && bT) {
    matrixTrc = {
      matrix: [rX.X, gX.X, bX.X, rX.Y, gX.Y, bX.Y, rX.Z, gX.Z, bX.Z],
      trc: [readCurve(view, rT.off).curve, readCurve(view, gT.off).curve, readCurve(view, bT.off).curve],
    };
  }
  const kT = tag('kTRC');
  const grayTrc = colorSpace === 'GRAY' && kT ? readCurve(view, kT.off).curve : undefined;

  const profile: IccProfile = {
    bytes,
    version: major + minor / 10,
    deviceClass,
    colorSpace,
    pcs,
    description: text('desc'),
    copyright: text('cprt'),
    mediaWhite: xyz('wtpt') ?? D50,
    aToB,
    bToA,
    hash: fnv1a(bytes),
  };
  const black = xyz('bkpt');
  if (black) profile.mediaBlack = black;
  if (matrixTrc) profile.matrixTrc = matrixTrc;
  if (grayTrc) profile.grayTrc = grayTrc;
  if (profile.colorSpace === 'other') throw new IccParseError(`unsupported colour space ${sig(view, 16)}`);
  if (!matrixTrc && !grayTrc && !aToB[0] && !aToB[1]) throw new IccParseError('profile has no device-to-PCS transform');
  return profile;
}

/** The number of device channels of a profile (4 for CMYK). */
export function deviceChannels(profile: IccProfile): number {
  return channelsOf(profile.colorSpace);
}
