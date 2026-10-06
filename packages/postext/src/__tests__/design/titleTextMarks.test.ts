import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig } from '../../types';
import type { VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = m ? Number(m[1]) : 16;
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

function configFor(span: 'page' | 'column', inlineMarks: boolean): PostextConfig {
  return {
    page: { width: mm(200), height: mm(200) },
    layout: { layoutType: 'double', gutterWidth: mm(4) },
    headings: {
      levels: [{
        level: 1,
        span,
        fontSize: pt(10),
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [{
              kind: 'text', id: 't', content: 'Case: {titleText}', fontSize: pt(12), overflow: 'wrap', inlineMarks,
              placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
            }],
          },
        },
      }],
    },
  };
}

const MD = '# *Pneumocystis* pneumonia in CO~2~ *and* 2^nd^ cases\n\nText.';

const band = (doc: VDTDocument): VDTDesignSlot | undefined => {
  const h = doc.blocks.find((b) => b.type === 'heading')!;
  return doc.pages[h.pageIndex]!.openerBand ?? h.designOverlay;
};
const textBlock = (doc: VDTDocument): VDTDesignTextBlock =>
  band(doc)!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
const runs = (doc: VDTDocument) => textBlock(doc).lines.flatMap((l) => l.runs ?? []);

describe('{titleText} keeps the heading’s inline marks in a design text with inlineMarks (#539)', () => {
  for (const span of ['page', 'column'] as const) {
    it(`sets the italic and script runs of the title (${span})`, () => {
      const doc = buildDocument({ markdown: MD }, configFor(span, true));
      const text = textBlock(doc).lines.map((l) => l.text).join(' ');
      expect(text).toBe('Case: Pneumocystis pneumonia in CO2 and 2nd cases');
      const r = runs(doc);
      const italic = r.filter((x) => /italic/.test(x.fontString)).map((x) => x.text.trim()).filter(Boolean);
      expect(italic).toEqual(['Pneumocystis', 'and']);
      const scripted = r.filter((x) => x.baselineShift !== undefined && x.baselineShift !== 0).map((x) => x.text);
      expect(scripted).toEqual(['2', 'nd']);
    });
  }

  it('prints the title plain in a design text without inlineMarks, as before', () => {
    const doc = buildDocument({ markdown: MD }, configFor('page', false));
    expect(textBlock(doc).lines.map((l) => l.text).join(' ')).toBe('Case: Pneumocystis pneumonia in CO2 and 2nd cases');
    expect(runs(doc)).toEqual([]);
  });
});
