import { describe, it, expect } from 'vitest';
import { buildDocumentPass } from '../../pipeline/build';
import type { PostextConfig } from '../../types';
import type { VDTBlock } from '../../vdt';

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

const long = 'measurement comprehensive interpretation extraordinary circumstances considerable temperature approximately investigation particularly responsibility understanding communication international development environmental administration'.split(' ');
const short = 'the of and a to in is was for on that with as by it'.split(' ');
const text = (n: number, seed: number): string =>
  `${Array.from({ length: n }, (_, i) => ((i * 3 + seed) % 4 === 0 ? long[(i * 7 + seed) % long.length] : short[(i * 5 + seed) % short.length])).join(' ')}.`;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const MAX_WS = 1.6;
const config = (width: number, tightenRunts = true): PostextConfig => ({
  page: { dpi: 96, width: pt(width), height: pt(2000), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', hyphenation: { enabled: true, locale: 'en-us' }, maxWordSpacing: MAX_WS, firstLineIndent: pt(0), tightenRunts },
  headings: { levels: [] },
});

const paragraph = (blocks: readonly VDTBlock[]): VDTBlock => blocks.find((b) => b.type === 'paragraph')!;
/** Word spacing of the lines that stay justified. */
const justified = (b: VDTBlock): number[] =>
  b.lines.filter((l) => !l.isLastLine && !l.ragged && l.justifiedSpaceRatio !== undefined).map((l) => l.justifiedSpaceRatio!);

/** The paragraph as placed, set by the runt fix, and asked to run a line
 *  long by the column balancing (looseness hint on content block 0). */
const settings = (markdown: string, width: number) => {
  const natural = paragraph(buildDocumentPass({ markdown }, config(width, false)).doc.blocks);
  const placed = paragraph(buildDocumentPass({ markdown }, config(width)).doc.blocks);
  const pass = buildDocumentPass({ markdown }, config(width), undefined, undefined, { balanceLooseness: new Map([[0, 1]]) });
  return { natural, placed, loose: paragraph(pass.doc.blocks), outcome: pass.looseOutcome.get(0) };
};

describe('the loose-paragraph lever keeps within maxWordSpacing (EF-129)', () => {
  it('refuses a line past the limit on a paragraph the runt fix set a line shorter', () => {
    const { natural, placed, loose, outcome } = settings(text(49, 187), 230);
    // Non-vacuous: the runt fix set this paragraph a line shorter.
    expect(placed.lines.length).toBe(natural.lines.length - 1);
    if (typeof outcome === 'number') {
      expect(loose.lines.length).toBe(placed.lines.length + 1);
      for (const r of justified(loose)) expect(r).toBeLessThanOrEqual(MAX_WS + 1e-6);
    } else {
      // No setting gained the line within the limit: the paragraph stays as
      // placed.
      expect(outcome).toBeNull();
      expect(loose.lines.map((l) => l.text)).toEqual(placed.lines.map((l) => l.text));
    }
  });

  it('still gains the line when a setting within the limit exists', () => {
    const { natural, placed, loose, outcome } = settings(text(40, 140), 260);
    expect(placed.lines.length).toBe(natural.lines.length - 1);
    expect(typeof outcome).toBe('number');
    expect(loose.lines.length).toBe(placed.lines.length + 1);
    for (const r of justified(loose)) expect(r).toBeLessThanOrEqual(MAX_WS + 1e-6);
  });
});
