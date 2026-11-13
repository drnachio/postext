// The Die-cuts section's edits (#1570): what each writes to `dieCuts`, and
// that the engine reads it back.

import { describe, expect, it } from 'vitest';
import { resolveDieCutsConfig } from 'postext';
import {
  addPlacement,
  addShape,
  dimensionMm,
  nextDieId,
  removePlacement,
  removeShape,
  renameShape,
  setCorners,
  setOutline,
  slugifyDieId,
  tidyDieCuts,
  updatePlacement,
  updateShape,
  validPageList,
  validPathData,
} from './dieCutEdits.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

describe('the die-cut edits', () => {
  it('add shapes with ids no other shape has, which the engine resolves', () => {
    let cfg = addShape(undefined);
    cfg = addShape(cfg);
    expect(cfg!.shapes!.map((s) => s.id)).toEqual(['die-1', 'die-2']);
    expect(nextDieId([{ id: 'die-2' } as never])).toBe('die-3');
    expect(resolveDieCutsConfig(cfg).shapes.map((s) => [s.id, s.shape, s.leaves])).toEqual([['die-1', 'roundRect', 1], ['die-2', 'roundRect', 1]]);
  });

  it('change a shape and drop what its new kind does not use', () => {
    let cfg = addShape(undefined);
    cfg = updateShape(cfg, 0, { shape: 'path', d: 'M0 0 L1 0 L1 1 Z', viewBox: [1, 1], name: 'Window' });
    expect(cfg!.shapes![0]).toMatchObject({ shape: 'path', d: 'M0 0 L1 0 L1 1 Z', viewBox: [1, 1], name: 'Window' });
    cfg = updateShape(cfg, 0, { shape: 'circle', name: undefined });
    expect(cfg!.shapes![0]).not.toHaveProperty('d');
    expect(cfg!.shapes![0]).not.toHaveProperty('viewBox');
    expect(cfg!.shapes![0]).not.toHaveProperty('name');
    cfg = updateShape(cfg, 0, { leaves: 3, wrap: false, x: mm(40) });
    expect(resolveDieCutsConfig(cfg).shapes[0]).toMatchObject({ shape: 'circle', leaves: 3, wrap: false, x: mm(40) });
    expect(updateShape(cfg, 5, { leaves: 2 })).toBe(cfg);
  });

  it('rename a shape with the pages that name it, never to a taken or blank id', () => {
    let cfg = addPlacement(addShape(addShape(undefined)), 'die-1');
    cfg = renameShape(cfg, 'die-1', ' Moon Hole ');
    expect(cfg!.shapes!.map((s) => s.id)).toEqual(['moon-hole', 'die-2']);
    expect(cfg!.pages).toEqual([{ pages: '1', die: 'moon-hole' }]);
    expect(renameShape(cfg, 'moon-hole', 'die-2')).toBe(cfg);
    expect(renameShape(cfg, 'moon-hole', '  ')).toBe(cfg);
    expect(slugifyDieId('Die #1!')).toBe('die-1');
  });

  it('remove a shape with its placements, and the section once it is empty', () => {
    let cfg = addPlacement(addShape(undefined), 'die-1');
    cfg = updatePlacement(cfg, 0, { pages: '3,7,11-13' });
    expect(resolveDieCutsConfig(cfg).pages).toEqual([{ pages: '3,7,11-13', die: 'die-1' }]);
    expect(removePlacement(cfg, 0)).toEqual({ shapes: cfg!.shapes });
    expect(removeShape(cfg, 'die-1')).toBeUndefined();
  });

  it('set and clear the rounded corners and the outline', () => {
    let cfg = setCorners(undefined, { radius: mm(4) });
    expect(resolveDieCutsConfig(cfg).corners).toEqual({ radius: mm(4), edges: 'fore' });
    cfg = setOutline(cfg, { d: 'M0 0 H90 Q100 50 90 100 H0 Z', viewBox: [100, 100] });
    expect(resolveDieCutsConfig(cfg).outline).toEqual({ d: 'M0 0 H90 Q100 50 90 100 H0 Z', viewBox: [100, 100] });
    cfg = setCorners(cfg, undefined);
    expect(cfg).not.toHaveProperty('corners');
    expect(setOutline(cfg, undefined)).toBeUndefined();
    expect(tidyDieCuts({ shapes: [], pages: [] })).toBeUndefined();
  });

  it('check page lists and path data as the engine reads them', () => {
    for (const ok of ['5', '3-12', '3,7,11-13', ' 3 , 7 - 9 ']) expect(validPageList(ok), ok).toBe(true);
    for (const bad of ['', '0', 'a', '3-', '3,,4', '-2']) expect(validPageList(bad), bad).toBe(false);
    expect(validPathData('M0 0 L1 0 1 1 Z')).toBe(true);
    expect(validPathData('m.5,0 a.5.5 0 1 1 0 1e0z')).toBe(true);
    expect(validPathData('0 0 L1 1')).toBe(false);
    expect(validPathData('M0 0 <script>')).toBe(false);
    expect(dimensionMm({ value: 1, unit: 'in' })).toBeCloseTo(25.4);
    expect(dimensionMm({ value: 72, unit: 'pt' })).toBeCloseTo(25.4);
  });
});
