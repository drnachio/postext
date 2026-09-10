import { describe, it, expect } from 'vitest';
import type { PostextConfig } from 'postext';
import { buildHtmlConfigOverride } from './configOverride';

const mm = (value: number) => ({ value, unit: 'mm' as const });

const base: PostextConfig = {
  headings: {
    levels: [
      { level: 1, breakBefore: { enabled: true, parity: 'odd' } },
      { level: 2, breakBefore: { enabled: true, parity: 'always-even' } },
    ],
  },
  parts: {
    breakBefore: { parity: 'odd' },
    breakAfter: { enabled: true, parity: 'even' },
    margins: { top: mm(76), bottom: mm(20), left: mm(43), right: mm(25), mirror: true },
  },
  header: { elements: [{ kind: 'rule', id: 'r', direction: 'horizontal', color: { hex: '#000', model: 'hex' }, thickness: mm(0.2), placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
};

const opts = {
  fontScale: 1,
  columnMode: 'multi' as const,
  pageWidthPx: 800,
  layoutType: 'double' as const,
  viewportHeightPx: 900,
  locale: 'es',
  optimalLineBreaking: false,
};

describe('buildHtmlConfigOverride', () => {
  it('keeps chapter and part page breaks but drops their parity', () => {
    const out = buildHtmlConfigOverride(base, opts);
    const levels = out.headings!.levels!;
    expect(levels.find((l) => l.level === 1)!.breakBefore).toEqual({ enabled: true, parity: 'any' });
    expect(levels.find((l) => l.level === 2)!.breakBefore).toEqual({ enabled: true, parity: 'any' });
    expect(out.parts!.breakBefore).toEqual({ parity: 'any' });
    expect(out.parts!.breakAfter).toEqual({ enabled: true, parity: 'any' });
    expect(out.parts!.margins).toEqual({ ...base.parts!.margins, mirror: false });
  });

  it('strips running heads and leaves absent part margins absent', () => {
    const out = buildHtmlConfigOverride({ ...base, parts: undefined }, opts);
    expect(out.header).toEqual({ elements: [] });
    expect(out.footer).toEqual({ elements: [] });
    expect(out.parts).not.toHaveProperty('margins');
    expect(out.parts!.breakBefore).toEqual({ parity: 'any' });
  });
});
