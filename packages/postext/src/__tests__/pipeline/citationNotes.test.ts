import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { renderToHtml } from '../../html-backend';
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

/** A note style that writes "Title, locator." for every citation. */
const notes: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => ({
    kind: 'note',
    numeric: false,
    cite: (clusters) => clusters.map((c) => c.items.map((it) => `${String(items.find((i) => i.id === it.id)?.title)}${it.locator ? `, ${it.locator}` : ''}`).join('; ') + '.'),
    bibliography: () => ({ entries: [], hangingIndent: true, labelColumn: false, entrySpacing: 0 }),
    citationNumbers: () => new Map(),
  }),
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  citations: { bibliography: { auto: false } },
};
const front = '---\nreferences:\n  - {id: howse, title: Greenwich Time, author: [{family: Howse, given: Derek}]}\n---\n';
const text = (markdown: string): string => renderToHtml(buildDocument({ markdown: front + markdown }, config)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('note styles (cookbook findings)', () => {
  beforeAll(() => registerCitationEngine(notes));
  afterAll(() => registerCitationEngine(undefined));

  it('keeps the author of a narrative citation in the sentence', () => {
    expect(text('As @howse [p. 4] says, the clocks agreed.')).toContain('As Howse');
  });

  it('prints one full stop where a citation ends the sentence of a note', () => {
    const out = text('The clocks agreed.[^n]\n\n[^n]: See [@howse, chap. 3].').replace(/\s/g, '');
    expect(out).toContain('GreenwichTime,3.');
    expect(out).not.toContain('3..');
  });
});
