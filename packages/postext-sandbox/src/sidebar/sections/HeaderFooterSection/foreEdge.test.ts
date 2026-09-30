import { describe, expect, it } from 'vitest';
import { foreEdgeElements, foreEdgeFontSize } from './foreEdge';

describe('fore-edge heads template (#192)', () => {
  it('sets the heads at 80 % of the body size, in its unit', () => {
    expect(foreEdgeFontSize({ value: 10, unit: 'pt' })).toEqual({ value: 8, unit: 'pt' });
    // The showcase's 10.5 pt body: 8.4 pt, not a fixed 8 (76 %).
    expect(foreEdgeFontSize({ value: 10.5, unit: 'pt' })).toEqual({ value: 8.4, unit: 'pt' });
    expect(foreEdgeFontSize({ value: 4, unit: 'mm' })).toEqual({ value: 3.2, unit: 'mm' });
  });

  it('adds the chapter title and the folio, vertical, in the outer margin, with free ids', () => {
    const [head, folio] = foreEdgeElements(new Set(['text1']), { value: 10.5, unit: 'pt' });
    expect([head.id, folio.id]).toEqual(['text2', 'text3']);
    expect([head.content, folio.content]).toEqual(['{chapterTitle}', '{pageNumber}']);
    for (const el of [head, folio]) {
      expect(el.writingMode).toBe('vertical-rl');
      expect(el.fontSize).toEqual({ value: 8.4, unit: 'pt' });
      expect(el.placement.anchor.to).toBe('outer');
    }
    expect(head.placement.offset?.y).toEqual({ value: 4, unit: 'em' });
    expect(folio.placement.offset?.y).toEqual({ value: -5, unit: 'em' });
  });
});
