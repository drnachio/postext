import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

// Nº 138's first page (#532): a title block (a heading style with a design
// of a set height), the abstract in a box under it, then a section the
// room left does not hold (its heading keeps with its text), so the page
// ends after the abstract and the flow goes on on the next page.
const config: PostextConfig = {
  page: { width: mm(160), height: mm(240), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  headingStyles: [{
    id: 'paper', numbered: false, marginTop: pt(0), marginBottom: pt(0),
    advancedDesign: {
      enabled: true, minHeight: mm(150),
      slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } }] },
    },
  }],
  calloutStyles: [{ id: 'abstract', title: 'Abstract', marginTop: pt(0), marginBottom: pt(12) }],
};

const MD = [
  '# A paper {style="paper"}', '',
  ':::callout{type="abstract"}', filler(5), ':::', '',
  '## Introduction', '', filler(6),
].join('\n');

const build = (): VDTDocument => buildDocument({ markdown: MD }, config, createMeasurementCache());

describe('the closing-box lever on a one-column page (#532)', () => {
  it('keeps the box under the block above it when the page ends after it', () => {
    const doc = build();
    const heading = doc.blocks.find((b) => b.type === 'heading' && b.pageIndex === 0)!;
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    expect(frame.pageIndex).toBe(0);
    // The page flows on: the section opens the next page.
    const intro = doc.blocks.find((b) => b.type === 'heading' && b.pageIndex > 0);
    expect(intro).toBeDefined();
    // Right under the title block, not pushed down to the page foot.
    const gap = frame.bbox.y - (heading.bbox.y + heading.bbox.height);
    expect(gap).toBeLessThan(doc.baselineGrid);
    expect(frame.balancing?.levers ?? []).not.toContain('trailingCallout');
  });
});
