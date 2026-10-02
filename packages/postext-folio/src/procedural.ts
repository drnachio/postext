import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

// Surface textures made on the spot (no image files): tileable height fields
// for the paper's relief and the desk's, turned into normal maps, with the
// desk's colour and roughness alongside. Each is made once and shared.

/** A seeded random stream (mulberry32): the same texture every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise that repeats every `period` cells (a whole number), so a
 *  field built from it tiles. */
function tileNoise(period: number, seed: number) {
  const rnd = random(seed);
  const grid = new Float32Array(period * period).map(() => rnd());
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const w = (i: number) => ((i % period) + period) % period;
    const at = (i: number, j: number) => grid[w(j) * period + w(i)];
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Fractal noise over the unit square (u, v in 0 … 1), tiling: `octaves`
 *  layers from `base` cells across, each twice as fine and `gain` as loud. */
function fbm(base: number, octaves: number, seed: number, gain = 0.5) {
  const layers = Array.from({ length: octaves }, (_, i) => ({ n: tileNoise(base << i, seed + i * 101), p: base << i, a: gain ** i }));
  const total = layers.reduce((s, l) => s + l.a, 0);
  return (u: number, v: number) => {
    let s = 0;
    for (const l of layers) s += l.a * l.n(u * l.p, v * l.p);
    return s / total;
  };
}

/** A height field: `size` × `size` samples over one tile. */
type Field = { size: number; h: Float32Array };

function field(size: number, f: (u: number, v: number) => number): Field {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = f(x / size, y / size);
  return { size, h };
}

/** Adds fibres to a field: short strands at random angles, as felted
 *  paper pulp lies (wrapping round the tile's edges). */
function addFibres(fd: Field, count: number, length: [number, number], height: number, seed: number, bias = 0) {
  const rnd = random(seed);
  const { size, h } = fd;
  for (let i = 0; i < count; i++) {
    const x0 = rnd() * size;
    const y0 = rnd() * size;
    // Pulp lines up a little with the machine direction (the grain).
    const a = (rnd() - 0.5) * Math.PI * (1 - bias);
    const len = (length[0] + rnd() * (length[1] - length[0])) * size;
    const amp = height * (0.4 + 0.6 * rnd());
    const steps = Math.ceil(len);
    const bend = (rnd() - 0.5) * 0.6;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const ang = a + bend * t;
      const x = Math.round(x0 + Math.cos(ang) * s);
      const y = Math.round(y0 + Math.sin(ang) * s);
      const fade = Math.sin(Math.PI * t);
      const idx = (((y % size) + size) % size) * size + (((x % size) + size) % size);
      h[idx] += amp * fade;
    }
  }
}

/** Normals (tangent space, as three.js reads a normal map) from a height
 *  field whose tile spans `tileMm` and whose heights are in mm × `relief`. */
function normalsOf(fd: Field, strength: number): Uint8Array {
  const { size, h } = fd;
  const out = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Texture rows run down; three.js's v runs up.
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round((0.5 - (0.5 * dx) / len) * 255);
      out[i + 1] = Math.round((0.5 - (0.5 * dy) / len) * 255);
      out[i + 2] = Math.round((0.5 + 0.5 / len) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

function texture(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function normalize(fd: Field) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of fd.h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  for (let i = 0; i < fd.h.length; i++) fd.h[i] = (fd.h[i] - lo) / span;
  return fd;
}

export type PaperTexture = "smooth" | "vellum" | "wove" | "laid" | "linen" | "felt";

/** A paper relief: its normal map and the width of one tile (mm). */
export interface Relief {
  normal: DataTexture;
  tileMm: number;
}

/**
 * The relief of each paper surface the trade names, as a normal map:
 * smooth (calendered: a faint mottle), vellum (a fine even tooth), wove
 * (felted fibres, the texture of most book papers), laid (the laid lines a
 * dandy roll presses about a millimetre apart, crossed by chain lines
 * every 25 mm), linen (an embossed cross-weave) and felt (the soft
 * irregular marks of a felt).
 */
export function paperRelief(kind: PaperTexture): Relief {
  const size = 512;
  let fd: Field;
  let tileMm: number;
  let strength: number;
  switch (kind) {
    case "smooth": {
      tileMm = 12;
      const n = fbm(8, 5, 11);
      fd = field(size, (u, v) => n(u, v));
      strength = 0.6;
      break;
    }
    case "vellum": {
      tileMm = 10;
      const n = fbm(32, 4, 23, 0.6);
      fd = field(size, (u, v) => n(u, v));
      strength = 3.2;
      break;
    }
    case "wove": {
      tileMm = 16;
      const n = fbm(16, 5, 37, 0.55);
      fd = field(size, (u, v) => 0.6 * n(u, v));
      addFibres(fd, 2600, [0.02, 0.09], 0.22, 41, 0.35);
      strength = 3.4;
      break;
    }
    case "laid": {
      // 25 laid lines per tile of 25 mm (1 mm apart) and one chain line.
      tileMm = 25;
      const n = fbm(16, 5, 53, 0.55);
      fd = field(size, (u, v) => {
        const laid = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * 25 * v), 3);
        const chain = Math.exp(-Math.pow((((u + 0.5) % 1) - 0.5) / 0.006, 2));
        return 0.55 * laid + 0.5 * chain + 0.35 * n(u, v);
      });
      addFibres(fd, 1200, [0.01, 0.05], 0.12, 59, 0.3);
      strength = 3;
      break;
    }
    case "linen": {
      // Threads about 0.4 mm apart: 16 per 6 mm tile, over and under.
      tileMm = 6;
      const n = fbm(8, 4, 67, 0.5);
      const t = 16;
      fd = field(size, (u, v) => {
        const a = Math.sin(2 * Math.PI * t * u);
        const b = Math.sin(2 * Math.PI * t * v);
        const over = Math.sin(Math.PI * t * u) * Math.sin(Math.PI * t * v) > 0;
        return (over ? Math.abs(a) * 0.6 + Math.abs(b) * 0.4 : Math.abs(b) * 0.6 + Math.abs(a) * 0.4) + 0.4 * n(u, v);
      });
      strength = 2.6;
      break;
    }
    case "felt": {
      tileMm = 30;
      const warp = fbm(4, 3, 71);
      const n = fbm(8, 5, 73, 0.6);
      fd = field(size, (u, v) => {
        const w = warp(u, v);
        return n(u + 0.15 * w, v - 0.15 * w);
      });
      addFibres(fd, 900, [0.01, 0.04], 0.06, 79);
      strength = 7;
      break;
    }
  }
  normalize(fd);
  return { normal: texture(normalsOf(fd, strength), size, false), tileMm };
}

export type DeskKind = "oak" | "walnut" | "linen" | "felt" | "leather" | "marble" | "plain";

/** A desk surface: colour, relief and roughness maps, the width of one
 *  tile (mm), and the roughness the map scales. */
export interface DeskSurface {
  color: DataTexture;
  normal: DataTexture;
  roughness: DataTexture;
  tileMm: number;
  roughnessScale: number;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const mix3 = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);

/**
 * The surfaces a book can lie on: oak and walnut (planks with their grain
 * and pores under a satin finish), linen cloth, felt, pebbled leather,
 * polished marble with its veins, and a plain painted top.
 */
export function deskSurface(kind: DeskKind): DeskSurface {
  const size = 512;
  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  let fd: Field;
  let tileMm = 300;
  let strength = 2;
  let roughnessScale = 1;
  const put = (i: number, c: number[], r: number) => {
    color[i * 4] = Math.round(Math.min(255, Math.max(0, c[0])));
    color[i * 4 + 1] = Math.round(Math.min(255, Math.max(0, c[1])));
    color[i * 4 + 2] = Math.round(Math.min(255, Math.max(0, c[2])));
    color[i * 4 + 3] = 255;
    const g = Math.round(Math.min(1, Math.max(0, r)) * 255);
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = g;
    rough[i * 4 + 3] = 255;
  };
  switch (kind) {
    case "oak":
    case "walnut": {
      // Two planks per tile, the grain running along x.
      tileMm = 360;
      const dark = rgb(kind === "oak" ? "#8a5f3a" : "#3b2416");
      const light = rgb(kind === "oak" ? "#c99a68" : "#6e4a32");
      const warp = fbm(2, 4, kind === "oak" ? 3 : 5, 0.55);
      const fine = fbm(4, 6, 7, 0.6);
      const pores = tileNoise(256, 9);
      fd = field(size, () => 0);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const plank = v < 0.5 ? 0 : 1;
          const w = warp(u, v + plank * 0.37);
          const rings = 0.5 + 0.5 * Math.sin(2 * Math.PI * (14 * (v + 0.08 * plank) + 3.2 * w));
          const grain = Math.pow(rings, 2.5);
          const f = fine(u * 1, v * 1);
          const pore = pores(u * 256 * 4 % 256, v * 256) > 0.82 ? 1 : 0;
          const seam = Math.min(Math.abs(v - 0.5), Math.abs(v), Math.abs(1 - v)) < 0.0025 ? 1 : 0;
          const t = 0.25 + 0.55 * grain + 0.25 * (f - 0.5);
          const c = mix3(dark, light, Math.min(1, Math.max(0, t))).map((ch) => ch * (1 - 0.35 * seam - 0.15 * pore));
          put(y * size + x, c, 0.38 + 0.25 * pore + 0.1 * (1 - grain));
          fd.h[y * size + x] = 0.35 * grain + 0.2 * f - 0.6 * pore - 1.5 * seam;
        }
      }
      strength = 3;
      break;
    }
    case "linen": {
      tileMm = 12;
      const base = rgb("#d9d0bf");
      const n = fbm(8, 4, 13);
      const slub = fbm(4, 3, 17);
      const t = 24;
      fd = field(size, () => 0);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const a = Math.abs(Math.sin(2 * Math.PI * t * (u + 0.01 * slub(u, v))));
          const b = Math.abs(Math.sin(2 * Math.PI * t * (v + 0.01 * slub(v, u))));
          const over = Math.sin(Math.PI * t * u) * Math.sin(Math.PI * t * v) > 0;
          const h = over ? 0.7 * a + 0.3 * b : 0.7 * b + 0.3 * a;
          const k = 0.85 + 0.15 * h + 0.08 * (n(u, v) - 0.5);
          put(y * size + x, base.map((c) => c * k), 0.92);
          fd.h[y * size + x] = h + 0.3 * n(u, v);
        }
      }
      strength = 3.5;
      break;
    }
    case "felt": {
      tileMm = 40;
      const base = rgb("#3e5a49");
      const n = fbm(8, 6, 19, 0.6);
      fd = field(size, (u, v) => n(u, v));
      addFibres(fd, 6000, [0.004, 0.02], 0.15, 23);
      for (let i = 0; i < size * size; i++) put(i, base.map((c) => c * (0.85 + 0.3 * (fd.h[i] - 0.5))), 1);
      strength = 4;
      break;
    }
    case "leather": {
      tileMm = 60;
      const base = rgb("#6a3a28");
      // Pebbles: the distance to the nearest of a jittered grid of points.
      const cells = 28;
      const rnd = random(29);
      const pts = Array.from({ length: cells * cells }, () => [rnd(), rnd()]);
      const n = fbm(8, 4, 31);
      fd = field(size, (u, v) => {
        const cx = Math.floor(u * cells);
        const cy = Math.floor(v * cells);
        let d1 = 9;
        let d2 = 9;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const gx = (cx + i + cells) % cells;
            const gy = (cy + j + cells) % cells;
            const p = pts[gy * cells + gx];
            const dx = (cx + i + p[0]) / cells - u;
            const dy = (cy + j + p[1]) / cells - v;
            const d = Math.hypot(dx, dy) * cells;
            if (d < d1) [d1, d2] = [d, d1];
            else if (d < d2) d2 = d;
          }
        return Math.min(1, (d2 - d1) * 1.6) + 0.25 * n(u, v);
      });
      for (let i = 0; i < size * size; i++) put(i, base.map((c) => c * (0.75 + 0.35 * fd.h[i])), 0.45 + 0.25 * (1 - fd.h[i]));
      strength = 3;
      break;
    }
    case "marble": {
      tileMm = 500;
      const base = rgb("#ece9e3");
      const vein = rgb("#8d8a86");
      const turb = fbm(3, 6, 37, 0.55);
      const fine = fbm(16, 3, 41);
      fd = field(size, () => 0);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = y / size;
          const t = Math.abs(Math.sin(2 * Math.PI * (2 * u + v + 4 * turb(u, v))));
          const veins = Math.pow(1 - t, 10);
          const c = mix3(base, vein, 0.8 * veins).map((ch) => ch * (0.97 + 0.06 * (fine(u, v) - 0.5)));
          put(y * size + x, c, 0.12 + 0.05 * veins);
          fd.h[y * size + x] = -0.05 * veins;
        }
      }
      strength = 1;
      roughnessScale = 1;
      break;
    }
    case "plain": {
      tileMm = 200;
      const base = rgb("#cbc6be");
      const n = fbm(8, 5, 43);
      fd = field(size, (u, v) => n(u, v));
      for (let i = 0; i < size * size; i++) put(i, base.map((c) => c * (0.98 + 0.04 * fd.h[i])), 0.8);
      strength = 0.6;
      break;
    }
  }
  return {
    color: texture(color, size, true),
    normal: texture(normalsOf(normalize(fd), strength), size, false),
    roughness: texture(rough, size, false),
    tileMm,
    roughnessScale,
  };
}

/** Cache: each relief or surface is made once per page load. */
const reliefs = new Map<string, Relief>();
const desks = new Map<string, DeskSurface>();
export function cachedRelief(kind: PaperTexture): Relief {
  let r = reliefs.get(kind);
  if (!r) reliefs.set(kind, (r = paperRelief(kind)));
  return r;
}
export function cachedDesk(kind: DeskKind): DeskSurface {
  let d = desks.get(kind);
  if (!d) desks.set(kind, (d = deskSurface(kind)));
  return d;
}
