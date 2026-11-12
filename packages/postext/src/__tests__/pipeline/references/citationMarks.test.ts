import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { registerCitationEngine } from '../../../citations/registry.js';
import { parseMarkdown } from '../../../parse/index.js';
import type { CitationEngine } from '../../../citations/types.js';
import type { VDTDocument } from '../../../index.js';

// A highlight over a citation (#1519 review): `:mark[… [@k] …]` keeps its
// brackets as the directive's, not a citation's, and the band runs under
// the number the citation prints.

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

/** A numbered style: each work its number in order of first citation. */
const numbered: CitationEngine = {
  styles: () => [],
  createProcessor: () => {
    let order = new Map<string, number>();
    return {
      kind: 'in-text',
      numeric: true,
      cite: (clusters) => {
        order = new Map();
        return clusters.map((c) => `[${c.items.map((it) => {
          if (!order.has(it.id)) order.set(it.id, order.size + 1);
          return order.get(it.id);
        }).join(', ')}]`);
      },
      bibliography: () => ({ entries: [], hangingIndent: false, labelColumn: false, entrySpacing: 0 }),
      citationNumbers: () => order,
    };
  },
};

const front = '---\nreferences:\n  - {id: a, title: Alpha}\n---\n\n';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const build = (body: string): VDTDocument => buildDocument({ markdown: front + body }, {
  page: { dpi: 72, width: pt(600), height: pt(400), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  bodyText: { firstLineIndent: pt(0), textAlign: 'left' },
  citations: { marker: 'brackets', bibliography: { auto: false } },
});
const line = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines)[0]!;
/** The characters of the line the bands cover (7 px each, from x = 0). */
const covered = (doc: VDTDocument): string => {
  const l = line(doc);
  return [...l.text].filter((_, i) => (l.highlights ?? []).some((h) => h.x <= i * 7 + 1 && h.x + h.width >= (i + 1) * 7 - 1)).join('');
};

describe(':mark[…] over a citation', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  it('keeps its brackets as the directive\'s, the citation inside', () => {
    const spans = parseMarkdown(':mark[the work [@a] here] and more.').flatMap((b) => b.spans);
    expect(spans.map((s) => s.citation?.raw).filter(Boolean)).toEqual(['[@a]']);
    expect(spans.map((s) => s.text).join('')).not.toContain(':mark');
  });

  it('paints its band under the printed number, alone or with text around it', () => {
    expect(line(build('See :mark[the work [@a] here] and more.')).text).toBe('See the work [1] here and more.');
    expect(covered(build('See :mark[the work [@a] here] and more.'))).toContain('work [1] here');
    expect(line(build('See :mark[[@a]] and more.')).text).toBe('See [1] and more.');
    expect(covered(build('See :mark[[@a]] and more.'))).toContain('[1]');
    // A narrative citation too.
    expect(covered(build('As :mark[@a says] here.')).length).toBeGreaterThan('says'.length);
  });

  it('strikes the number through with the text around it', () => {
    const l = line(build('See ~~the work [@a]~~ here.'));
    expect(l.text).toBe('See the work [1] here.');
    // "[1]" runs from the 14th character to the 16th.
    const struck = (l.marks ?? []).filter((m) => m.kind === 'line');
    expect(struck.some((m) => m.x <= 13 * 7 + 1 && m.x + (m.length ?? 0) >= 16 * 7 - 1)).toBe(true);
  });
});
