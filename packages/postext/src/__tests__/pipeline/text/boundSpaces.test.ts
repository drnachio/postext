import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { boundSpaceOffsets } from '../../../pipeline/text/boundSpaces.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../../defaults/index.js';
import type { PostextConfig, VDTDocument } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (width: number, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(3000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: true }, ...bodyText },
});
const linesOf = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text.replace(/\u00A0/g, ' ')))));

const MD = 'En comparación con otros tests, el test de Napoleón obtuvo un LR+ = 18,29 y un LR– = 0,21, con p < 0,05 en todos los grupos. Sin embargo, otros autores [12] no lo confirmaron, y algunos estudios [14, 16] tampoco (18).';
const WIDTHS = [98, 105, 112, 119, 126, 133, 140, 147, 154, 161, 168];

describe('bodyText.bindCitations and bindOperators', () => {
  it('find the spaces before and inside a citation, and around a lone operator', () => {
    const text = 'autores [12] y [14, 16] con LR+ = 18,29 y p < 0,05 (18).';
    // The word or sign on either side of each bound space.
    const at = boundSpaceOffsets(text, { citations: true, operators: true })
      .map((i) => `${text.slice(0, i).split(' ').at(-1)}_${text.slice(i + 1).split(' ')[0]}`);
    expect(at.sort()).toEqual(['<_0,05', '=_18,29', 'LR+_=', '[14,_16]', 'autores_[12]', 'p_<', 'y_[14,'].sort());
    expect(boundSpaceOffsets(text, { citations: false, operators: false })).toEqual([]);
    // A word in brackets is no citation; a hyphen between words no operator.
    expect(boundSpaceOffsets('el término [sic] y bien - mal', { citations: true, operators: true })).toEqual([]);
    // Nor a number in parentheses after a number (a year and an issue).
    expect(boundSpaceOffsets('Lancet 2016 (3) 10', { citations: true, operators: false })).toEqual([]);
  });

  it('never start a line with a citation or an operator, nor end one on an operator', () => {
    for (const width of WIDTHS) {
      for (const textAlign of ['justify', 'left'] as const) {
        const lines = linesOf(buildDocument({ markdown: MD }, config(width, { textAlign, bindCitations: true, bindOperators: true }), createMeasurementCache()));
        for (const line of lines) {
          expect(line).not.toMatch(/^[[(]\d/);
          expect(line).not.toMatch(/^[=<]/);
          expect(line).not.toMatch(/ [=<]$/);
        }
        expect(lines.join(' ').replace(/- /g, '')).toContain('tampoco (18).');
      }
    }
  });

  it('off (the default), leave those spaces as breaks, the lines as before', () => {
    const broken = WIDTHS.some((width) => linesOf(buildDocument({ markdown: MD }, config(width), createMeasurementCache()))
      .some((line) => /^[[(=<]/.test(line) || / [=<]$/.test(line)));
    expect(broken).toBe(true);
    for (const width of WIDTHS) {
      const unset = buildDocument({ markdown: MD }, config(width), createMeasurementCache());
      const off = buildDocument({ markdown: MD }, config(width, { bindCitations: false, bindOperators: false }), createMeasurementCache());
      expect(linesOf(off)).toEqual(linesOf(unset));
    }
  });

  it('resolve off by default and survive the strip', () => {
    const r = resolveBodyTextConfig();
    expect([r.bindCitations, r.bindOperators]).toEqual([undefined, undefined]);
    expect(stripBodyTextDefaults({ bindCitations: true, bindOperators: false })).toEqual({ bindCitations: true });
  });
});
