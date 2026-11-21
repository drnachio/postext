import { describe, it, expect } from 'vitest';
import { basicShape, pathData, type CoverPath } from 'postext';
import { deleteNode, insertNode, moveHandle, moveNode, refitPath, sideMiddles, toggleCurve } from './pathEditing.js';

const square = (): CoverPath => basicShape('rectangle');

describe('editing a shape’s nodes', () => {
  it('moves a node with its handles', () => {
    const ellipse = basicShape('ellipse');
    const moved = moveNode(ellipse, { sub: 0, i: 0 }, { x: 0.1, y: 0 });
    expect(moved[0]!.nodes[0]).toMatchObject({ x: 0.6, y: 0 });
    expect(moved[0]!.nodes[0]!.out!.x).toBeCloseTo(ellipse[0]!.nodes[0]!.out!.x + 0.1);
    // The original stays as it was.
    expect(ellipse[0]!.nodes[0]!.x).toBe(0.5);
  });

  it('turns the other handle with a smooth node', () => {
    const p = moveHandle(basicShape('ellipse'), { sub: 0, i: 0 }, 'out', { x: 0.5, y: 0.2 }, true);
    const n = p[0]!.nodes[0]!;
    expect(n.out).toEqual({ x: 0.5, y: 0.2 });
    expect(n.in!.x).toBeCloseTo(0.5);
    expect(n.in!.y).toBeLessThan(0);
  });

  it('curves a corner and straightens it back', () => {
    const curved = toggleCurve(square(), { sub: 0, i: 1 });
    expect(curved[0]!.nodes[1]!.in).toBeDefined();
    expect(pathData(curved)).toContain('C ');
    expect(pathData(toggleCurve(curved, { sub: 0, i: 1 }))).toBe(pathData(square()));
  });

  it('adds a node halfway along a side, and deletes it', () => {
    const more = insertNode(square(), { sub: 0, i: 0 });
    expect(more[0]!.nodes).toHaveLength(5);
    expect(more[0]!.nodes[1]).toEqual({ x: 0.5, y: 0 });
    expect(sideMiddles(square())).toHaveLength(4);
    expect(deleteNode(more, { sub: 0, i: 1 })).toEqual(square());
    // A triangle keeps its three nodes.
    const tri = deleteNode(square(), { sub: 0, i: 0 });
    expect(deleteNode(tri, { sub: 0, i: 0 })).toBe(tri);
  });

  it('splits a curve where it keeps its shape', () => {
    const more = insertNode(basicShape('ellipse'), { sub: 0, i: 0 });
    const mid = more[0]!.nodes[1]!;
    expect(Math.hypot(mid.x - 0.5, mid.y - 0.5)).toBeCloseTo(0.5, 2);
  });

  it('fits the box to the path again', () => {
    const out = moveNode(square(), { sub: 0, i: 1 }, { x: 0.5, y: 0 });
    const { rect, path } = refitPath({ x: 10, y: 10, width: 20, height: 20 }, out);
    expect(rect).toEqual({ x: 10, y: 10, width: 30, height: 20 });
    expect(path[0]!.nodes[1]).toEqual({ x: 1, y: 0 });
    expect(path[0]!.nodes[2]).toEqual({ x: 0.6667, y: 1 });
  });
});
