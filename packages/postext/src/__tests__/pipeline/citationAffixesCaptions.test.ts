import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { registerCitationEngine } from '../../citations/registry';
import { bookCitationContexts } from '../../citations/context';
import { parseMarkdown } from '../../parse';
import type { CitationClusterInput, CitationEngine } from '../../citations/types';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

/** What the processor was handed, last build. */
let seen: CitationClusterInput[] = [];

/** A numbered style: works numbered in the order they are first cited,
 *  each citation "prefix [n]suffix" (affixes as handed over), and a
 *  bibliography of the works asked for, in number order. */
const numbered: CitationEngine = {
  styles: () => [],
  createProcessor: () => {
    const order = new Map<string, number>();
    return {
      kind: 'in-text',
      numeric: true,
      cite: (clusters) => {
        seen = [...clusters];
        return clusters.map((c) => c.items.map((it) => {
          if (!order.has(it.id)) order.set(it.id, order.size + 1);
          return `${it.prefix ? `${it.prefix} ` : ''}[${order.get(it.id)}]${it.suffix ?? ''}`;
        }).join('; '));
      },
      bibliography: (ids) => ({
        entries: [...(ids ?? [])].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)).map((id) => ({ id, html: `Work ${id.toUpperCase()}.`, label: `[${order.get(id)}]` })),
        hangingIndent: false,
        labelColumn: true,
        entrySpacing: 0,
      }),
      citationNumbers: () => order,
    };
  },
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } };
const front = '---\nreferences:\n  - {id: a, title: A}\n  - {id: b, title: B}\n  - {id: c, title: C}\n  - {id: d, title: D}\n---\n';

const segmentsOf = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? []));

describe('citation affixes (#528)', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  it('hand the processor their emphasis as CSL rich text, and print it as emphasis', () => {
    const doc = buildDocument({ markdown: `${front}Methods [*e.g.*, @a, *inter alia*] work.` }, { page, citations: { marker: 'style', bibliography: { auto: false } } });
    expect(seen[0]!.items).toEqual([{ id: 'a', prefix: '<i>e.g.</i>,', suffix: ', <i>inter alia</i>' }]);
    const text = doc.blocks[0]!.lines.map((l) => l.text).join(' ');
    expect(text).toContain('e.g., [1], inter alia');
    expect(text).not.toContain('*');
    // (Hyphenation may split a word into several segments.)
    const italic = segmentsOf(doc).filter((s) => s.italic).map((s) => s.text).join('|');
    expect(italic.replace(/\|/g, '')).toContain('e.g.');
    expect(italic.replace(/\|/g, '')).toContain('interalia');
  });

  it('keep the comma of a suffix with no locator', () => {
    const doc = buildDocument({ markdown: `${front}Models [@a, inter alia] scale.` }, { page, citations: { marker: 'style', bibliography: { auto: false } } });
    expect(doc.blocks[0]!.lines.map((l) => l.text).join(' ')).toContain('[1], inter alia');
  });

  it('go around the marker the engine sets itself, with their emphasis', () => {
    const doc = buildDocument({ markdown: `${front}Methods [*see* @a, p. 4, *inter alia*] work.` }, { page, citations: { marker: 'brackets', bibliography: { auto: false } } });
    const text = doc.blocks[0]!.lines.map((l) => l.text).join(' ').replace(/ /g, ' ');
    expect(text).toContain('see [1, p. 4], inter alia');
    const italic = segmentsOf(doc).filter((s) => s.italic).map((s) => s.text).join('');
    expect(italic).toContain('see');
    expect(italic).toContain('interalia');
  });
});

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Prior best from [@c], after *@d*.',
  note: 'Source: [@b].',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f.png', format: 'png', width: 1000, height: 400 },
  placement: { position: 'here' },
};
const cell = (content: string) => ({ content });
const table: Resource = {
  id: 'tab',
  typeId: 'table',
  kind: 'table',
  caption: 'Scores as reported [see @a; @d, *inter alia*] and [@zz].',
  createdAt: 0,
  updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[cell('Model'), cell('Score')], [cell('X [@c]'), cell('1')]] } },
  placement: { position: 'here' },
};

/** Every resource block of a document, floated or inline. */
const resourceBlocks = (doc: VDTDocument) => [
  ...doc.blocks.filter((b) => b.resourceBlock),
  ...doc.pages.flatMap((p) => p.floats ?? []).filter((b) => b.resourceBlock),
].map((b) => b.resourceBlock!);
const linesText = (lines: { text: string }[]) => lines.map((l) => l.text).join(' ').replace(/ /g, ' ');

describe('citations in captions and notes (#529)', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  const md = `${front}First the text cites [@a].\n\n::resource{id="fig"}\n\nThen :ref{id="tab"} and [@b].\n\n::resource{id="tab"}\n\nLast [@c].`;
  const config: PostextConfig = { page, citations: { marker: 'brackets', link: true } };

  it('are numbered in reading order, after the block that places the resource', () => {
    const doc = buildDocument({ markdown: md, resources: [figure, table] }, config);
    const [fig, tab] = resourceBlocks(doc);
    // a = 1 (text), then the figure caption: c = 2, d = 3, then its note:
    // b = 4; the table caption cites a and d again.
    expect(linesText(fig!.captionLines)).toContain('Prior best from [2], after [3].');
    expect(linesText(fig!.noteLines ?? [])).toContain('Source: [4].');
    expect(linesText(tab!.captionLines)).toContain('Scores as reported see [1, 3], inter alia and [@zz].');
    // A table cell is no caption: its citation stays text.
    expect(JSON.stringify(tab!.table)).toContain('[@c]');
    const body = doc.blocks.filter((b) => !b.resourceBlock).map((b) => b.lines.map((l) => l.text).join(' ')).join('\n').replace(/\u00a0/g, ' ');
    expect(body).toMatch(/Then Tab\S* 1 and \[4\]\./);
    expect(body).toContain('Last [2].');
  });

  it('list the works they cite in the bibliography, with no nocite', () => {
    const only = `---\nreferences:\n  - {id: a, title: A}\n  - {id: c, title: C}\n---\nText [@a].\n\n::resource{id="fig2"}\n`;
    const fig2: Resource = { ...figure, id: 'fig2', caption: 'After [@c].', note: undefined };
    const doc = buildDocument({ markdown: only, resources: [fig2] }, config);
    const entries = doc.blocks.flatMap((b) => b.lines.map((l) => l.text)).filter((t) => t.startsWith('Work') || t.includes('Work '));
    expect(entries.join('\n')).toContain('Work C.');
    // Linked to its entry, like a citation in the text.
    const caption = resourceBlocks(doc)[0]!.captionLines.flatMap((l) => l.segments ?? []);
    expect(caption.some((s) => s.text === '[2]' && s.href === '#ref-c')).toBe(true);
  });

  it('sit in the book context after the citations of the block that first refers to the resource', () => {
    const one = { blocks: parseMarkdown('A [@a].\n\nSee :ref{id="fig"} [@b].') };
    const two = { blocks: parseMarkdown('Again :ref{id="fig"} [@d].') };
    const [c1, c2] = bookCitationContexts([one, two], [figure]);
    expect(c1!.clusters.map((c) => c.items.map((it) => it.id).join('+'))).toEqual(['a', 'b', 'c', 'd', 'b', 'd']);
    expect(c1!.local).toEqual([0, 1]);
    expect(c1!.captions).toEqual({ fig: { caption: [2, 3], note: [4] } });
    // Placed in the first chapter only.
    expect(c2!.captions).toBeUndefined();
    expect(c2!.local).toEqual([5]);
  });
});

describe('a name list cut short (`and others`, #533)', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  it('names "et al." in a narrative citation the engine writes itself', () => {
    const md = '---\nreferences:\n  - {id: a, title: A, author: ["Tan, Wei", others]}\n---\nAs @a shows.';
    const doc = buildDocument({ markdown: md }, { page, citations: { marker: 'brackets', bibliography: { auto: false } } });
    expect(doc.blocks[0]!.lines.map((l) => l.text).join(' ').replace(/\u00a0/g, ' ')).toContain('As Tan et al. [1] shows.');
  });
});
