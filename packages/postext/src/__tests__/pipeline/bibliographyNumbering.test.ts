import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { registerCitationEngine } from '../../citations/registry';
import { bookCitationContexts } from '../../citations/context';
import { parseMarkdown } from '../../parse';
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

/** A numbered style as citeproc-js runs one: each `cite` call starts the
 *  numbering afresh, in order of first citation; the bibliography lists
 *  the works asked for, in number order. */
const numbered: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => {
    const title = (id: string) => String(items.find((i) => i.id === id)?.title);
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
      bibliography: (ids) => {
        for (const id of ids ?? []) if (!order.has(id)) order.set(id, order.size + 1);
        const wanted = [...(ids ?? order.keys())].sort((a, b) => order.get(a)! - order.get(b)!);
        return { entries: wanted.map((id) => ({ id, html: `Entry ${title(id)}`, label: `[${order.get(id)}]` })), hangingIndent: false, labelColumn: true, entrySpacing: 0 };
      },
      citationNumbers: () => order,
    };
  },
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } };
const front = '---\nreferences:\n  - {id: a, title: Alpha}\n  - {id: b, title: Beta}\n  - {id: c, title: Gamma}\n  - {id: d, title: Delta}\n---\n';

const text = (doc: VDTDocument): string[] => doc.blocks.map((b) => b.lines.map((l) => l.text).join(' ').replace(/ /g, ' '));
/** The entries of each list ("[1] Alpha"), in order. */
const lists = (doc: VDTDocument): string[][] => {
  const out: string[][] = [];
  for (const t of text(doc)) {
    if (t === 'References' || t === 'Methods references') out.push([]);
    else if (/^\[\d+\]\s+Entry /.test(t)) out[out.length - 1]!.push(t.replace(/\s+Entry/, ''));
  }
  return out;
};

describe("citations.numbering: 'chapter' (#537)", () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  const md = `${front}# One\n\nSee [@a], [@b] and [@c].\n\n# Two\n\nAgain [@c], then [@d] and [@c].\n`;
  const config = (numbering?: 'book' | 'chapter'): PostextConfig => ({
    page,
    citations: { marker: 'brackets', ...(numbering ? { numbering } : {}), bibliography: { scope: 'chapter', title: 'References' } },
  });

  it('numbers each chapter from 1, a work cited again taking its chapter number', () => {
    const doc = buildDocument({ markdown: md }, config('chapter'));
    expect(text(doc).find((t) => t.startsWith('Again'))).toBe('Again [1], then [2] and [1].');
    expect(lists(doc)).toEqual([['[1] Alpha', '[2] Beta', '[3] Gamma'], ['[1] Gamma', '[2] Delta']]);
  });

  it('numbers through the book by default', () => {
    const doc = buildDocument({ markdown: md }, config());
    expect(text(doc).find((t) => t.startsWith('Again'))).toBe('Again [3], then [4] and [3].');
    expect(lists(doc)).toEqual([['[1] Alpha', '[2] Beta', '[3] Gamma'], ['[3] Gamma', '[4] Delta']]);
  });

  it('counts a chapter at each document and each level-1 heading', () => {
    const one = { blocks: parseMarkdown('Intro [@a].\n\n# One\n\nA [@b].[^n]\n\n[^n]: Note [@c].') };
    const two = { blocks: parseMarkdown('# Two\n\nB [@d].') };
    const [c1, c2] = bookCitationContexts([one, two]);
    expect(c1!.clusters.map((c) => c.items[0]!.id)).toEqual(['a', 'b', 'c', 'd']);
    // The note's citation sits in the chapter of its marker.
    expect(c1!.chapters).toEqual([0, 1, 1, 2]);
    expect(c2!.chapters).toEqual(c1!.chapters);
  });
});

describe(':::bibliography{scope=new} (#534)', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  it('lists the works cited so far that no list before printed, numbered on', () => {
    const md = `${front}Main text [@a] and [@b].\n\n:::bibliography{scope=new}\n\n## Methods\n\nWe used [@b], [@c] and [@d].\n\n:::bibliography{scope=new title="Methods references"}\n`;
    const doc = buildDocument({ markdown: md }, { page, citations: { marker: 'brackets', bibliography: { title: 'References' } } });
    expect(text(doc).find((t) => t.startsWith('We used'))).toBe('We used [2], [3] and [4].');
    expect(lists(doc)).toEqual([['[1] Alpha', '[2] Beta'], ['[3] Gamma', '[4] Delta']]);
  });
});
