import { describe, it, expect } from 'vitest';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import type { VDTDesignBoxStyle, VDTDesignSlot } from '../../vdt';

type Call = { op: string; args: number[]; lineWidth: number; fill: string; stroke: string };

/** A 2D context that records the rectangle and path calls. */
function recordingCtx() {
  const calls: Call[] = [];
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const stack: typeof state[] = [];
  const rec = (op: string) => function (this: typeof state, ...args: number[]) {
    calls.push({ op, args, lineWidth: this.lineWidth, fill: this.fillStyle, stroke: this.strokeStyle });
  };
  const ctx = {
    ...state,
    save() { stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arcTo: rec('arcTo'),
    closePath: rec('closePath'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    rect: rec('rect'),
    clip: rec('clip'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const boxSlot = (box: Partial<VDTDesignBoxStyle>): VDTDesignSlot => ({
  bbox: { x: 0, y: 0, width: 400, height: 400 },
  blocks: [{
    kind: 'box',
    bbox: { x: 10, y: 20, width: 100, height: 50 },
    box: { borderWidthPx: 0, borderRadiusPx: 0, ...box },
  }],
});

describe('design box borders on canvas (EF-131)', () => {
  it('strokes a square frame inside the box: its outer edge on the box edge', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, boxSlot({ backgroundColor: '#eeeeee', borderColor: '#ff2d9b', borderWidthPx: 4 }));
    // The fill covers the whole box, under the border.
    expect(calls.find((c) => c.op === 'fillRect')?.args).toEqual([10, 20, 100, 50]);
    const stroke = calls.find((c) => c.op === 'strokeRect')!;
    expect(stroke.lineWidth).toBe(4);
    // Centred 2 px inside each edge, so the stroke spans x 10…110, y 20…70.
    expect(stroke.args).toEqual([12, 22, 96, 46]);
  });

  /** The subpaths traced for the last fill in the border colour. */
  const borderRing = (calls: Call[], color: string) => {
    const fillAt = calls.map((c) => c.op === 'fill' && c.fill === color).lastIndexOf(true);
    expect(fillAt).toBeGreaterThan(0);
    const path = calls.slice(calls.slice(0, fillAt).map((c) => c.op).lastIndexOf('beginPath'), fillAt);
    const starts = path.flatMap((c) => (c.op === 'moveTo' ? [c.args] : []));
    const arcs = path.filter((c) => c.op === 'arcTo').map((c) => c.args[4]);
    return { fill: calls[fillAt]!, starts, arcs };
  };

  it('fills a rounded frame as the ring CSS draws: outer radius on the box edge, inner radius less the width', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, boxSlot({ borderColor: '#ff2d9b', borderWidthPx: 4, borderRadiusPx: 10 }));
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
    const ring = borderRing(calls, '#ff2d9b');
    expect(ring.fill.args).toEqual(['evenodd']);
    // The box's outline from its top edge past the radius (10), then the
    // inner edge 4 px in, its radius 6.
    expect(ring.starts).toEqual([[10 + 10, 20], [14 + 6, 24]]);
    expect(ring.arcs).toEqual([10, 10, 10, 10, 6, 6, 6, 6]);
  });

  it('keeps the outer corner round when the radius is under half the border width', () => {
    // 2.5 pt of radius, 6 pt of border: a stroke centred inside the box
    // would run on a square path and paint a square corner past the fill.
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, boxSlot({ backgroundColor: '#eeeeee', borderColor: '#ff2d9b', borderWidthPx: 8, borderRadiusPx: 3.33 }));
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
    const ring = borderRing(calls, '#ff2d9b');
    expect(ring.starts).toEqual([[10 + 3.33, 20], [18, 28]]);
    // Rounded outside, square inside (3.33 − 8 < 0), as in HTML.
    expect(ring.arcs).toEqual([3.33, 3.33, 3.33, 3.33, 0, 0, 0, 0]);
  });

  it('fills the whole rounded box when the border leaves no inside', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, boxSlot({ borderColor: '#ff2d9b', borderWidthPx: 30, borderRadiusPx: 10 }));
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
    expect(borderRing(calls, '#ff2d9b').starts).toEqual([[20, 20]]);
  });

  it('fills a box whose border is wider than it is with the border colour', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, {
      bbox: { x: 0, y: 0, width: 100, height: 100 },
      blocks: [{ kind: 'box', bbox: { x: 0, y: 0, width: 3, height: 40 }, box: { borderColor: '#ff2d9b', borderWidthPx: 4, borderRadiusPx: 0 } }],
    });
    expect(calls.some((c) => c.op === 'strokeRect')).toBe(false);
    const fill = calls.find((c) => c.op === 'fillRect')!;
    expect(fill.args).toEqual([0, 0, 3, 40]);
    expect(fill.fill).toBe('#ff2d9b');
  });

  it('leaves a box without a border as it was', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, boxSlot({ backgroundColor: '#eeeeee' }));
    expect(calls.map((c) => c.op)).toEqual(['fillRect']);
  });
});
