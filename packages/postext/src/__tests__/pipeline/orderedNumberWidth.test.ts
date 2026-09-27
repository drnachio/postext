import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveBodyTextConfig, resolveOrderedListsConfig, stripOrderedListsDefaults } from '../../defaults';
import type { OrderedListsConfig, PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7 px wide, so '9.' is 14 px and '10.' 21 px.
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
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (ordered: OrderedListsConfig = {}): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(10), lineHeight: pt(12), firstLineIndent: pt(0) },
  orderedLists: ordered,
  headings: { balancing: { enabled: false } },
});
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const items = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'listItem');
const textX = (b: VDTBlock): number => b.lines[0]!.bbox.x;

// EF-171 (exam-paper): a list interrupted by a paragraph (a table in the
// report) is two runs; the second's numbers are wider.
const INTERRUPTED = '8. Eight\n9. Nine\n\nA paragraph between.\n\n10. Ten\n11. Eleven';
const NESTED = '1. Stem\n   1. first part\n   2. second part\n\nBetween.\n\n2. Other\n   9. ninth\n   10. tenth';

describe('orderedLists.numberWidth (EF-171)', () => {
  it('defaults to \'run\' and strips the default', () => {
    const body = resolveBodyTextConfig();
    expect(resolveOrderedListsConfig(undefined, body).numberWidth).toBe('run');
    expect(resolveOrderedListsConfig({ numberWidth: 'level' }, body).numberWidth).toBe('level');
    expect(stripOrderedListsDefaults({ numberWidth: 'run' })).toBeUndefined();
    expect(stripOrderedListsDefaults({ numberWidth: 'level' })).toEqual({ numberWidth: 'level' });
  });

  it('by default each run of a list starts its text after its own widest number (1.4)', () => {
    const [eight, nine, ten, eleven] = items(build(INTERRUPTED, config()));
    expect(textX(eight!)).toBeCloseTo(textX(nine!), 5);
    expect(textX(ten!)).toBeCloseTo(textX(eleven!), 5);
    expect(textX(ten!) - textX(eight!)).toBeCloseTo(7, 5);
  });

  it('\'level\' starts every item of a depth at the same place, numbers flush right', () => {
    const doc = build(INTERRUPTED, config({ numberWidth: 'level' }));
    const list = items(doc);
    const x = textX(list[0]!);
    for (const b of list) expect(textX(b)).toBeCloseTo(x, 5);
    const run = items(build(INTERRUPTED, config()));
    expect(x).toBeCloseTo(textX(run[2]!), 5);
    // '9.' is set one digit right of '10.', so the full stops line up.
    expect(list[1]!.bulletOffsetX! - list[2]!.bulletOffsetX!).toBeCloseTo(7, 5);
  });

  it('works per depth', () => {
    const doc = build(NESTED, config({ numberWidth: 'level' }));
    const [stem, first, second, other, ninth, tenth] = items(doc);
    expect(textX(stem!)).toBeCloseTo(textX(other!), 5);
    for (const b of [second!, ninth!, tenth!]) expect(textX(b)).toBeCloseTo(textX(first!), 5);
    const run = items(build(NESTED, config()));
    expect(textX(run[1]!)).toBeLessThan(textX(run[4]!));
  });
});
