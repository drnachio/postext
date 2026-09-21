import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentAsync, BuildCancelledError, type BuildPassInfo } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import type { PostextConfig } from '../types';

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

const SENTENCE = 'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes. ';
function markdown(): string {
  const parts: string[] = ['# Documento', '', SENTENCE.repeat(6)];
  for (let i = 1; i <= 6; i++) parts.push('', `## Sección ${i}`, '', SENTENCE.repeat(5), '', SENTENCE.repeat(4));
  return parts.join('\n');
}
const config: PostextConfig = { headings: { balancing: { enabled: true } } };

describe('buildDocumentAsync', () => {
  it('produces the same document as the synchronous build', async () => {
    const sync = buildDocument({ markdown: markdown() }, config, createMeasurementCache());
    const passes: BuildPassInfo[] = [];
    let yields = 0;
    const async = await buildDocumentAsync({ markdown: markdown() }, config, createMeasurementCache(), {
      onPass: (p) => passes.push(p),
      yieldBetweenPasses: async () => { yields++; },
    });
    expect(async.pages.length).toBe(sync.pages.length);
    expect(async.iterationCount).toBe(sync.iterationCount);
    expect(passes.length).toBe(sync.iterationCount);
    // One turn of the event loop after every pass.
    expect(yields).toBe(passes.length);
  });

  it('stops at the next pass boundary once cancelled', async () => {
    const passes: BuildPassInfo[] = [];
    let cancelled = false;
    await expect(buildDocumentAsync({ markdown: markdown() }, config, createMeasurementCache(), {
      onPass: (p) => { passes.push(p); if (passes.length === 2) cancelled = true; },
      shouldCancel: () => cancelled,
      yieldBetweenPasses: async () => {},
    })).rejects.toBeInstanceOf(BuildCancelledError);
    expect(passes.length).toBe(2);
  });
});
