import { describe, it, expect } from 'vitest';
import type { Resource } from 'postext';
import { configWrapsContours, resourcesToTrace } from './contourTraces.js';
import { wrapChoiceOf } from '../../../sidebar/settings/textWrap.js';

const bitmap = (id: string, extra: Partial<Resource> = {}): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 10, height: 10 }, ...extra,
});

describe('contour traces in the Sandbox (#883)', () => {
  it('traces the bitmaps a contour wrap runs round, and only those without a trace that fits', () => {
    const plain = bitmap('a');
    const wrapped = bitmap('b', { placement: { wrap: 'contour' } });
    const withContour = bitmap('c', { contour: {} });
    const polygon = bitmap('d', { contour: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } });
    const noAlpha = bitmap('e', { contour: { alpha: false } });
    const traced = bitmap('f', { contour: { traced: { fileId: 'f.png', threshold: 0.5, rows: 1, spans: [0, 1] } } });
    const stale = bitmap('g', { contour: { threshold: 0.8, traced: { fileId: 'g.png', threshold: 0.5, rows: 1, spans: [0, 1] } } });
    const all = [plain, wrapped, withContour, polygon, noAlpha, traced, stale];
    expect(resourcesToTrace(all, {}).map((r) => r.id)).toEqual(['b', 'c', 'g']);
    // A frame that pushes by contour: every bitmap of the book.
    const cfg = { pageTemplates: [{ id: 't', variants: { recto: { frames: [{ name: 'p', exclude: 'push' as const, wrap: 'contour' as const }] } } }] };
    expect(configWrapsContours(cfg)).toBe(true);
    expect(resourcesToTrace(all, cfg).map((r) => r.id)).toEqual(['a', 'b', 'c', 'g']);
    // A type that wraps by contour.
    expect(resourcesToTrace([plain], { resourceTypes: [{ id: 'figure', defaultPlacement: { wrap: 'contour' } } as never] }).map((r) => r.id)).toEqual(['a']);
  });

  it('reads a wrap value as a choice of the settings', () => {
    expect(['contour', 'start', 'end', 'none', undefined].map(wrapChoiceOf)).toEqual(['contour', 'left', 'right', 'none', 'none']);
  });
});
