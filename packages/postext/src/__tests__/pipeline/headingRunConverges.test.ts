import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import type { PostextConfig, VDTDocument } from '../../index';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE = {
  page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'double' },
  parts: { margins: { top: pt(60), left: pt(30), right: pt(24), bottom: pt(12) } },
} as const;

const texts = (doc: VDTDocument, page: number): string[] =>
  doc.pages[page]!.columns.flatMap((c) => c.blocks.map((b) => b.lines.map((l) => l.text).join(' ')));

// Issue #120: a `breakBefore` H1 straight followed by an H2 on a small
// two-column page never finished. The trailing-band cap levelled the closing
// band to a height the H1 + H2 run cannot share; keep-with-next rolled the
// H1 back out of a column it filled alone, the H1 re-opened an odd page
// (break + parity), the cap re-applied to the band it opened, and so on
// until the heap ran out.
describe('a heading run that fills its column converges (#120)', () => {
  it('lays out an H1 followed by an H2 under a trailing cap', () => {
    const config = {
      ...PAGE,
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    } as PostextConfig;
    const doc = buildDocument({ markdown: '# Zero\n\n## Before\n\nSome text.' }, config);
    expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    expect(doc.pages.length).toBeLessThanOrEqual(3);
    const all = doc.pages.flatMap((_, i) => texts(doc, i));
    expect(all).toEqual(['Zero', 'Before', 'Some text.']);
    // Everything on the opening page.
    expect(texts(doc, 0)).toEqual(all);
  });

  it('lays out a heading run taller than a full column without balancing', () => {
    // No caps at all: the H2's top margin alone keeps it from sharing a
    // full column with the H1, so the run cannot be kept together anywhere.
    const config = {
      ...PAGE,
      headings: {
        balancing: { enabled: false },
        levels: [
          { level: 1, breakBefore: { enabled: true, parity: 'odd' } },
          { level: 2, marginTop: pt(160) },
        ],
      },
    } as PostextConfig;
    const doc = buildDocument({ markdown: '# Zero\n\n## Before\n\nSome text.' }, config);
    expect(doc.pages.length).toBeLessThanOrEqual(3);
    const all = doc.pages.flatMap((_, i) => texts(doc, i));
    expect(all).toEqual(['Zero', 'Before', 'Some text.']);
  });

  it('still lays out two chapters on odd pages', () => {
    const config = {
      ...PAGE,
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
    } as PostextConfig;
    const doc = buildDocument({ markdown: '# Zero\n\nSome text.\n\n# One\n\nMore text.' }, config);
    expect(doc.pages.length).toBe(3);
  });
});
