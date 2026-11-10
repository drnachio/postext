// Citations in the flow Word file (#1458): the processor's text for each
// citation, the list of works where `:::bibliography` stands, and the
// source left as it was on re-import.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCitationEngine } from '../../../citations/registry.js';
import type { CitationEngine } from '../../../citations/types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';

/** A numbered style: works numbered in the order they are first cited. */
const numbered: CitationEngine = {
  styles: () => [],
  createProcessor: ({ items }) => {
    const order: string[] = [];
    return {
      kind: 'in-text',
      numeric: true,
      cite: (clusters) => clusters.map((c) => {
        const known = c.items.filter((it) => items.some((x) => x.id === it.id));
        for (const it of known) if (!order.includes(it.id)) order.push(it.id);
        return `[${known.map((it) => order.indexOf(it.id) + 1).join(',')}]`;
      }),
      bibliography: () => ({ entries: order.map((id, i) => ({ id, label: `[${i + 1}]`, html: `<i>${String(items.find((x) => x.id === id)?.title)}</i> (work)` })), hangingIndent: false, labelColumn: true, entrySpacing: 0 }),
      citationNumbers: () => new Map(order.map((id, i) => [id, i + 1])),
    };
  },
};

const FRONT = '---\nreferences:\n  - {id: a, title: Alpha}\n  - {id: b, title: Beta}\n---\n';
const MD = `${FRONT}\n# Letter\n\nSeen before [@a; @b] and again [@b]. Unknown [@zz].\n\n:::bibliography{title="Works"}\n`;

describe('semantic docx: citations', () => {
  beforeAll(() => registerCitationEngine(numbered));
  afterAll(() => registerCitationEngine(undefined));

  for (const design of ['book', 'plain'] as const) {
    it(`prints each citation as the processor formats it and lists the works (${design})`, async () => {
      const e = await exportDocx(MD, { design });
      expect(exportProblems(e, [MD])).toEqual([]);
      expect(looseMarkup(e.doc)).toEqual([]);
      const body = e.map.fragments.find((f) => f.role === 'body')!;
      expect(body.text).toBe('Seen before [1,2] and again [2]. Unknown [@zz].');
      // Each citation is an atom over its source.
      expect(body.atoms?.filter((a) => a.kind === 'citation').map((a) => MD.slice(a.start, a.end))).toEqual(['[@a; @b]', '[@b]', '[@zz]']);
      expect(e.doc).not.toContain('@a');
      expect(e.doc).toContain('<w:tag w:val="ptx:bibliography"/>');
      const list = e.map.fragments.filter((f) => f.role?.startsWith('bibliography'));
      expect(list.map((f) => f.text)).toEqual(['Works', '[1]\tAlpha (work)', '[2]\tBeta (work)']);
      expect(list.every((f) => f.target.kind === 'generated')).toBe(true);
      // An unchanged file changes nothing in the Markdown.
      const back = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }] });
      expect(back.edits).toEqual([]);
      expect(back.chapters[0]!.markdown).toBe(MD);
    });
  }

  it('sets the list after the text when nothing places it', async () => {
    const md = `${FRONT}\n# Letter\n\nSeen [@a].\n`;
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.map.fragments.filter((f) => f.role === 'bibliography').map((f) => f.text)).toEqual(['[1]\tAlpha (work)']);
  });

  it('keeps citations as written without a citation engine', async () => {
    registerCitationEngine(undefined);
    const e = await exportDocx(MD);
    registerCitationEngine(numbered);
    expect(e.map.fragments.find((f) => f.role === 'body')!.text).toContain('[@a; @b]');
  });
});
