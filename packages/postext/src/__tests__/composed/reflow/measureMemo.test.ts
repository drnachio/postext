import { describe, it, expect, vi } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { clearComposedPageMemo } from '../../../composed/pageMemo.js';
import * as measured from '../../../pipeline/blocks/measureContentBlock.js';
import { page8Fixture } from '../fixtures/page8.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning } from '../../../index.js';

vi.mock('../../../pipeline/blocks/measureContentBlock.js', async (original) => {
  const real = await original<typeof import('../../../pipeline/blocks/measureContentBlock.js')>();
  return { ...real, measureContentBlock: vi.fn(real.measureContentBlock) };
});

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

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** The page-8 stand-in with its first box too short for its text: the
 *  reflow ladder tries every step on it. */
function ladderPage(): { markdown: string; config: ReturnType<typeof page8Fixture>['config']; resources: ReturnType<typeof page8Fixture>['resources'] } {
  const { markdown, config, resources } = page8Fixture('es');
  const base = config.pageTemplates![0]! as PageTemplate;
  const tpl: PageTemplate = { ...base, frames: base.frames!.map((f) => (f.name === 'dinero' ? { ...f, height: mm(36), minHeight: undefined } : f)) };
  const more = Array.from({ length: 4 }, (_, i) => `Más dinero ${i} `.repeat(30).trim()).join('\n\n');
  return { markdown: markdown.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${more}\n\n`), config: { ...config, pageTemplates: [tpl] }, resources };
}

describe('the measurements of a composed page layout (#953)', () => {
  it('a ladder that lays the page eleven times measures each block at a width once', () => {
    const f = ladderPage();
    const spy = vi.mocked(measured.measureContentBlock);
    clearComposedPageMemo();
    spy.mockClear();
    const doc = buildDocument({ markdown: f.markdown, resources: f.resources }, f.config, createMeasurementCache());
    const warning = (doc.contentWarnings ?? []).find((w): w is Extract<ContentWarning, { kind: 'frameOverflow' }> => w.kind === 'frameOverflow');
    expect(warning?.stepsTried.length).toBeGreaterThan(1);
    // 417 calls before the memo; the repeats of a step are answered from it.
    expect(spy.mock.calls.length).toBeLessThan(200);
  });
});
