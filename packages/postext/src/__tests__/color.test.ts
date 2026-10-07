// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile, readdirSync as readDir } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OUTPUT_PROFILES,
  buildRgbLut,
  cmykToLab,
  deltaE,
  labToCmyk,
  labToSrgb,
  outputTransform,
  parseIccProfile,
  sampleRgbLut,
  srgbToLab,
  totalAreaCoverage,
  IccParseError,
} from '../color';

const readFileSync = readFile as (path: URL) => Uint8Array;
const readdirSync = readDir as (path: URL) => string[];
const ICC_DIR = new URL('../../icc/', import.meta.url);
const load = (id: string) => parseIccProfile(readFileSync(new URL(`${id}.icc`, ICC_DIR)));

describe('ICC output profiles', () => {
  it('ships one file per catalogue entry and nothing else', () => {
    const files = readdirSync(ICC_DIR).filter((f) => f.endsWith('.icc')).sort();
    expect(files).toEqual(OUTPUT_PROFILES.map((p) => `${p.id}.icc`).sort());
  });

  it.each(OUTPUT_PROFILES.map((p) => p.id))('%s parses as a CMYK output profile', (id) => {
    const p = load(id);
    expect(p.colorSpace).toBe('CMYK');
    expect(p.deviceClass).toBe('prtr');
    expect(p.aToB[1]).toBeDefined();
    expect(p.bToA[1]).toBeDefined();
    expect(p.copyright).toMatch(/free of known copyright restrictions/);
  });

  it('rejects files that are not ICC profiles', () => {
    expect(() => parseIccProfile(new Uint8Array(200))).toThrow(IccParseError);
    expect(() => parseIccProfile(new Uint8Array(10))).toThrow(IccParseError);
  });
});

describe('FOGRA39 conversions', () => {
  const p = load('fogra39');
  const t = outputTransform(p);

  it('reads paper white and the solids close to the characterization data', () => {
    // FOGRA39L: paper 95/0/-2, C 55/-37/-50, M 48/74/-3, Y 89/-5/93, K 16/0/0.
    const near = (cmyk: [number, number, number, number], lab: [number, number, number], tol: number) => {
      const got = cmykToLab(p, { c: cmyk[0], m: cmyk[1], y: cmyk[2], k: cmyk[3] }, 'absolute');
      expect(deltaE(got, { L: lab[0], a: lab[1], b: lab[2] })).toBeLessThan(tol);
    };
    near([0, 0, 0, 0], [95, 0, -2], 1);
    near([1, 0, 0, 0], [55, -37, -50], 3);
    near([0, 1, 0, 0], [48, 74, -3], 3);
    near([0, 0, 1, 0], [89, -5, 93], 3);
    near([0, 0, 0, 1], [16, 0, 0], 3);
  });

  it('maps black and greys to K only', () => {
    expect(t.fromRgb(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 1 });
    expect(t.fromRgb(1, 1, 1)).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    const grey = t.fromRgb(0.5, 0.5, 0.5);
    expect(grey.c + grey.m + grey.y).toBe(0);
    expect(grey.k).toBeGreaterThan(0.4);
    expect(grey.k).toBeLessThan(0.7);
    // Darker greys take more K.
    expect(t.fromRgb(0.2, 0.2, 0.2).k).toBeGreaterThan(grey.k);
  });

  it('separates saturated colours the way prepress expects', () => {
    const red = t.fromRgb(1, 0, 0);
    expect(red.c).toBeLessThan(0.05);
    expect(red.m).toBeGreaterThan(0.9);
    expect(red.y).toBeGreaterThan(0.9);
    const blue = t.fromRgb(0, 0, 1);
    expect(blue.c).toBeGreaterThan(0.9);
    expect(blue.y).toBeLessThan(0.05);
  });

  it('keeps every separation under the profile ink limit', () => {
    let max = 0;
    for (let r = 0; r <= 1; r += 0.1) for (let g = 0; g <= 1; g += 0.1) for (let b = 0; b <= 1; b += 0.1) {
      max = Math.max(max, totalAreaCoverage(t.fromRgb(r, g, b)));
    }
    expect(max).toBeLessThanOrEqual(301);
  });

  it('round-trips in-gamut colours within a small error', () => {
    for (const [r, g, b] of [[0.8, 0.4, 0.3], [0.3, 0.6, 0.5], [0.6, 0.6, 0.8]] as const) {
      const lab = srgbToLab(r, g, b);
      const back = cmykToLab(p, labToCmyk(p, lab));
      expect(deltaE(lab, back)).toBeLessThan(3);
    }
  });

  it('proofs paper white darker than screen white when simulating paper', () => {
    const [r, g, b] = t.proof({ c: 0, m: 0, y: 0, k: 0 }, true);
    expect(Math.max(r, g, b)).toBeLessThan(1);
    expect(r + g + b).toBeGreaterThan(2.6);
    const rel = t.proof({ c: 0, m: 0, y: 0, k: 0 });
    expect(rel.every((v) => v > 0.99)).toBe(true);
  });
});

describe('pixel LUT', () => {
  it('matches direct evaluation at and between grid points', () => {
    const lut = buildRgbLut(17, 3, (r, g, b) => labToSrgb(srgbToLab(r, g, b)));
    const out = new Float32Array(3);
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [200, 30, 90], [17, 128, 240]]) {
      sampleRgbLut(lut, r!, g!, b!, out);
      expect(out[0]).toBeCloseTo(r! / 255, 1);
      expect(out[1]).toBeCloseTo(g! / 255, 1);
      expect(out[2]).toBeCloseTo(b! / 255, 1);
    }
  });
});
