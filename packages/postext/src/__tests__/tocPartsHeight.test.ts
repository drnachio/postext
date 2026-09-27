import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveTocConfig } from '../defaults/toc';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import type { PostextConfig } from '../types';

// EF-119 (decided: documented as it is): a contents part row is `2em` of the
// body size tall by default, not two body lines. With a 9.5/13.5 pt body the
// row is 19 pt; a height in `pt` gives two lines (27 pt).

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
const config = (height?: ReturnType<typeof pt>): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(9.5), lineHeight: pt(13.5) },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  toc: { parts: { enabled: true, ...(height ? { height } : {}) } },
});

const MD = '# Contents {toc="false"}\n\n:::toc\n\n:::part{number="I" title="Foundations"}\n:::\n\n# The lantern\n\nText.';

describe('toc.parts.height (EF-119)', () => {
  it('defaults to 2em of the body size', () => {
    expect(resolveTocConfig(undefined, resolveBodyTextConfig()).parts.height).toEqual({ value: 2, unit: 'em' });
    const row = buildDocument({ markdown: MD }, config()).blocks.find((b) => b.tocPart)!;
    expect(row.bbox.height).toBeCloseTo(19, 5);
  });

  it('takes a height in pt as given', () => {
    const row = buildDocument({ markdown: MD }, config(pt(27))).blocks.find((b) => b.tocPart)!;
    expect(row.bbox.height).toBeCloseTo(27, 5);
  });
});
