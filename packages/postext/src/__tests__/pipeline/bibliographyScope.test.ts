import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { registerCitationEngine } from '../../citations/registry';
import type { CitationEngine } from '../../citations/types';
import type { PostextConfig, VDTDocument } from '../../index';

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

/** An author-date style that lists every work by its title. */
const authorDate: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => {
    const title = (id: string) => String(items.find((i) => i.id === id)?.title);
    let cited: string[] = [];
    return {
      kind: 'in-text',
      numeric: false,
      cite: (clusters) => {
        cited = [...new Set(clusters.flatMap((c) => c.items.map((it) => it.id)))];
        return clusters.map((c) => `(${c.items.map((it) => title(it.id)).join('; ')})`);
      },
      bibliography: () => ({ entries: cited.map((id) => ({ id, html: `Entry ${title(id)}` })), hangingIndent: true, labelColumn: false, entrySpacing: 0 }),
      citationNumbers: () => new Map(),
    };
  },
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (auto: boolean): PostextConfig => ({
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  citations: { bibliography: { scope: 'chapter', auto, title: 'References' } },
});
const front = '---\nreferences:\n  - {id: a, title: Alpha}\n  - {id: b, title: Beta}\n  - {id: c, title: Gamma}\n---\n';

/** The entries of each list, in order. */
const lists = (doc: VDTDocument): string[][] => {
  const out: string[][] = [];
  for (const b of doc.blocks) {
    const text = b.lines.map((l) => l.text).join(' ');
    if (text === 'References') out.push([]);
    else if (text.startsWith('Entry ')) out[out.length - 1]!.push(text.slice(6));
  }
  return out;
};

describe("bibliography.scope 'chapter' in a document of several chapters", () => {
  beforeAll(() => registerCitationEngine(authorDate));
  afterAll(() => registerCitationEngine(undefined));

  it('lists in each chapter only the works that chapter cites', () => {
    const md = `${front}# One\n\nSee [@a] and [@b].\n\n:::bibliography\n\n# Two\n\nSee [@a] and [@c].\n\n:::bibliography\n`;
    expect(lists(buildDocument({ markdown: md }, config(false)))).toEqual([['Alpha', 'Beta'], ['Alpha', 'Gamma']]);
  });

  it('sets a list at the end of each chapter when nothing places it', () => {
    const md = `${front}# One\n\nSee [@a] and [@b].\n\n# Two\n\nSee [@c].\n`;
    expect(lists(buildDocument({ markdown: md }, config(true)))).toEqual([['Alpha', 'Beta'], ['Gamma']]);
  });
});
