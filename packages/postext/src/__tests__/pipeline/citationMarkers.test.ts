import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { registerCitationEngine } from '../../citations/registry';
import type { CitationEngine } from '../../citations/types';
import type { PostextConfig } from '../../index';

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

/** A numbered style: works numbered in the order they are first cited. */
const numbered: CitationEngine = {
  styles: () => [],
  createProcessor: () => {
    const order = new Map<string, number>();
    return {
      kind: 'in-text',
      numeric: true,
      cite: (clusters) => clusters.map((c) => {
        for (const it of c.items) if (!order.has(it.id)) order.set(it.id, order.size + 1);
        return `[${c.items.map((it) => order.get(it.id)).join(', ')}]`;
      }),
      bibliography: () => ({ entries: [], hangingIndent: false, labelColumn: true, entrySpacing: 0 }),
      citationNumbers: () => order,
    };
  },
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  citations: { marker: 'superscript', bibliography: { auto: false } },
};
const front = '---\nreferences:\n  - {id: a, title: A}\n  - {id: b, title: B}\n  - {id: c, title: C}\n---\n';

describe('superscript citation numbers', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  it('are set close, with no space after the comma', () => {
    const doc = buildDocument({ markdown: `${front}One [@a], two [@b], then both [@a; @c].` }, config);
    const raised = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments)).filter((s) => s?.script === 'sup').map((s) => s!.text).join('|');
    expect(raised).toContain('1,3');
    expect(raised).not.toContain(', ');
  });
});
