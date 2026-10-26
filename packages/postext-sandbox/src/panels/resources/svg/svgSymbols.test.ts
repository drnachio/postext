import { describe, expect, it } from 'vitest';
import { addZones, symbolZones, type SvgNode } from './svgSymbols.js';

const node = (id: string, parent: number, box: SvgNode['box'], extra: Partial<SvgNode> = {}): SvgNode => ({ id, classes: [], parent, hidden: false, box, ...extra });
const PICTURE = { width: 1000, height: 500 };

describe('the symbols of a drawing as avoid zones (#994)', () => {
  const nodes: SvgNode[] = [
    node('', -1, { x: 0, y: 0, width: 1000, height: 500 }),
    node('sym-city', 0, { x: 100, y: 50, width: 40, height: 20 }),
    node('sym-group', 0, { x: 500, y: 250, width: 100, height: 50 }),
    node('sym-inner', 2, { x: 510, y: 260, width: 10, height: 10 }),
    node('road', 0, { x: 0, y: 0, width: 1000, height: 10 }, { classes: ['line'] }),
    node('dot', 0, { x: 900, y: 400, width: 10, height: 10 }, { classes: ['poi', 'big'] }),
    node('sym-hidden', 0, { x: 0, y: 0, width: 50, height: 50 }, { hidden: true }),
    node('sym-point', 0, { x: 300, y: 100, width: 0, height: 0 }),
  ];

  it('takes the elements whose id starts with the prefix, as fractions of the picture', () => {
    const zones = symbolZones(nodes, PICTURE, { idPrefix: 'sym-' });
    expect(zones[0]).toEqual({ x: 0.1, y: 0.1, width: 0.04, height: 0.04 });
  });

  it('takes a group whole and not the shapes inside it, and skips definitions', () => {
    const zones = symbolZones(nodes, PICTURE, { idPrefix: 'sym-' });
    expect(zones).toHaveLength(3);
    expect(zones[1]).toEqual({ x: 0.5, y: 0.5, width: 0.1, height: 0.1 });
  });

  it('widens a point to the smallest zone, centred on it', () => {
    const zones = symbolZones(nodes, PICTURE, { idPrefix: 'sym-' });
    const p = zones[2]!;
    expect(p.width).toBeCloseTo(0.006, 4);
    expect(p.x + p.width / 2).toBeCloseTo(0.3, 3);
  });

  it('takes a class, and either of the two together', () => {
    expect(symbolZones(nodes, PICTURE, { className: 'poi' })).toEqual([{ x: 0.9, y: 0.8, width: 0.01, height: 0.02 }]);
    expect(symbolZones(nodes, PICTURE, { idPrefix: 'sym-c', className: 'poi' })).toHaveLength(2);
    expect(symbolZones(nodes, PICTURE, {})).toEqual([]);
  });

  it('adds only the zones the picture does not hold already', () => {
    const first = symbolZones(nodes, PICTURE, { idPrefix: 'sym-' });
    const once = addZones([{ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }], first);
    expect(once.added).toBe(2);
    expect(addZones(once.zones, first)).toMatchObject({ added: 0 });
  });
});
