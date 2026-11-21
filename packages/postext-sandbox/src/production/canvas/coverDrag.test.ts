import { describe, expect, it } from 'vitest';
import { resolveBindingMeasures, softcoverSheet } from 'postext';
import { coverSnapLines, dragCoverRect } from './coverDrag.js';

const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);
const start = { x: 50, y: 50, width: 40, height: 20 };

describe('dragCoverRect', () => {
  it('goes exactly where it is dragged when nothing is held: no magnet', () => {
    const front = sheet.zones.find((z) => z.name === 'front')!;
    // Half a millimetre off the front cover's safe edge stays off it.
    const dx = front.safe.x - start.x + 0.5;
    expect(dragCoverRect(start, 'move', dx, 0).x).toBeCloseTo(front.safe.x + 0.5, 6);
  });

  it('lines up with the sheet when asked (Cmd or Ctrl)', () => {
    const front = sheet.zones.find((z) => z.name === 'front')!;
    const dx = front.safe.x - start.x + 0.5;
    const snap = { ...coverSnapLines(sheet), tol: 1 };
    expect(dragCoverRect(start, 'move', dx, 0, { snap }).x).toBeCloseTo(front.safe.x, 6);
  });

  it('keeps the proportions when asked (Shift), from the opposite corner', () => {
    const r = dragCoverRect(start, 'se', 20, 2, { keepAspect: true });
    expect(r.width / r.height).toBeCloseTo(2, 6);
    expect(r.x).toBe(50);
    expect(r.y).toBe(50);
    const nw = dragCoverRect(start, 'nw', -20, 0, { keepAspect: true });
    expect(nw.x + nw.width).toBeCloseTo(90, 6);
    expect(nw.y + nw.height).toBeCloseTo(70, 6);
  });

  it('never makes an element smaller than 2 mm', () => {
    const r = dragCoverRect(start, 'e', -100, 0);
    expect(r.width).toBe(2);
  });
});
