import { describe, it, expect } from 'vitest';
import { decodePngAlpha } from '../../contour/png.js';
import { encodeRgbaPng } from '../../production/png.js';
import {
  basicShape,
  coverPathBounds,
  flattenCoverPath,
  pathData,
  roundedRectPath,
  shapeArt,
} from '../../production/shapes.js';
import { coverElementRect, coverPage, placeCoverElement, resolveBindingMeasures, softcoverSheet } from '../../production/index.js';

const ink = (hex: string) => ({ hex, model: 'hex' as const });
const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);

describe('cover shapes', () => {
  it('draws the basic shapes in their box', () => {
    expect(pathData(basicShape('rectangle'))).toBe('M 0 0 L 1 0 L 1 1 L 0 1 Z');
    expect(pathData(basicShape('line'))).toBe('M 0 0.5 L 1 0.5');
    // An ellipse: four nodes, four curves.
    expect(pathData(basicShape('ellipse')).match(/C /g)).toHaveLength(4);
    expect(basicShape('star', 5)[0]!.nodes).toHaveLength(10);
    expect(basicShape('polygon', 8)[0]!.nodes).toHaveLength(8);
    expect(coverPathBounds(basicShape('ellipse'))).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('rounds a box’s corners by a radius in mm, round in a box of any proportions', () => {
    const p = roundedRectPath(100, 50, 10);
    const nodes = p[0]!.nodes;
    expect(nodes[0]).toMatchObject({ x: 0.1, y: 0 });
    expect(nodes[2]).toMatchObject({ x: 1, y: 0.2 });
    // No radius: a plain rectangle; too big a radius: half the short side.
    expect(roundedRectPath(100, 50, 0)).toEqual(basicShape('rectangle'));
    expect(roundedRectPath(100, 50, 80)[0]!.nodes[2]).toMatchObject({ x: 1, y: 0.5 });
  });

  it('flattens curves into steps', () => {
    const [poly] = flattenCoverPath(basicShape('ellipse'), 8);
    expect(poly).toHaveLength(32);
    for (const p of poly!) expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeCloseTo(0.5, 2);
  });

  it('writes a PNG the contour reader reads back', () => {
    const data = new Uint8Array(3 * 2 * 4).fill(255);
    data[3] = 0;
    const raster = decodePngAlpha(encodeRgbaPng(3, 2, data));
    expect(raster).toMatchObject({ width: 3, height: 2 });
    expect(Array.from(raster!.alpha)).toEqual([0, 255, 255, 255, 255, 255]);
  });

  it('makes a gradient a picture cut to the shape, and a shadow a picture under it', () => {
    const art = shapeArt({ x: 10, y: 10, width: 40, height: 20 }, basicShape('ellipse'), ink('#ff0000'), {
      gradient: { to: ink('#0000ff'), angle: 90 },
      shadow: { color: ink('#000000'), opacity: 0.5, x: 2, y: 2, blur: 4 },
      stroke: { color: ink('#00ff00'), width: 1 },
    });
    expect(art.defs).toContain('<clipPath');
    expect(art.content.match(/<image /g)).toHaveLength(2);
    expect(art.content).toContain('stroke="#00ff00"');
    // The shadow falls past the box: the art covers more than it.
    expect(art.bounds.x + art.bounds.width).toBeGreaterThan(50);
  });
});

describe('cover elements with effects', () => {
  it('draws a rounded, bordered box as a path, and a box with a shadow as a picture of its own', () => {
    const cover = coverPage(sheet, {
      design: {
        elements: [
          { id: 'card', kind: 'box', color: ink('#ffcc00'), radius: 4, stroke: { color: ink('#000000'), width: 0.5 }, zone: 'front', x: 10, y: 10, width: 60, height: 30 },
          { id: 'lifted', kind: 'box', color: ink('#ffffff'), shadow: { color: ink('#000000'), opacity: 0.4, x: 1, y: 1, blur: 3 }, zone: 'front', x: 10, y: 60, width: 60, height: 30 },
          { id: 'star', kind: 'shape', color: ink('#ff0000'), path: basicShape('star'), zone: 'front', x: 80, y: 10, width: 40, height: 40 },
        ],
      },
    });
    const els = cover.template.decoration!.elements as { id: string; kind: string; d?: string; stroke?: unknown; resourceId?: string }[];
    const card = els.find((e) => e.id === 'cover-el-card')!;
    expect(card.kind).toBe('path');
    expect(card.d).toContain('C ');
    expect(card.stroke).toEqual(ink('#000000'));
    const lifted = els.find((e) => e.id === 'cover-el-lifted')!;
    expect(lifted.resourceId).toBe('cover-art-lifted');
    expect(cover.files['cover-art-lifted.svg']).toBeDefined();
    expect(els.find((e) => e.id === 'cover-el-star')!.d).toBe(pathData(basicShape('star')));
  });
});

describe('cover elements when the format changes', () => {
  const sheetOf = (width: number, height: number) => softcoverSheet({ width, height }, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, { width, height }), false);
  const small = sheetOf(150, 230);
  const large = sheetOf(170, 240);
  const front = (s: typeof small) => s.zones.find((z) => z.name === 'front')!.rect;

  it('scales a box with its zone, and keeps a picture’s proportions about its centre', () => {
    const f = front(small);
    const box = placeCoverElement(small, { id: 'b', kind: 'box', zone: 'front', x: 0, y: 0, width: 1, height: 1 }, { x: f.x + 15, y: f.y + 23, width: 75, height: 115 });
    expect(box.basis).toEqual({ width: f.width, height: f.height });
    const g = front(large);
    const r = coverElementRect(large, box)!;
    expect(r.x - g.x).toBeCloseTo(15 * (g.width / f.width), 1);
    expect(r.width).toBeCloseTo(75 * (g.width / f.width), 1);
    expect(r.height).toBeCloseTo(115 * (g.height / f.height), 1);

    const pic = { ...box, kind: 'image' as const, resourceId: 'p' };
    const p = coverElementRect(large, pic)!;
    const k = Math.min(g.width / f.width, g.height / f.height);
    expect(p.width / p.height).toBeCloseTo(75 / 115, 3);
    expect(p.width).toBeCloseTo(75 * k, 1);
    expect(p.x + p.width / 2 - g.x).toBeCloseTo((15 + 37.5) * (g.width / f.width), 1);
  });

  it('leaves an element placed before the change as it was, and one on its own zone alone', () => {
    const el = { id: 'e', kind: 'box' as const, zone: 'front' as const, x: 10, y: 10, width: 20, height: 20 };
    expect(coverElementRect(large, el)!.width).toBe(20);
    const f = front(small);
    expect(coverElementRect(small, { ...el, basis: { width: f.width, height: f.height } })!.width).toBe(20);
  });
});
