// The semantic .docx prints the numbers the engine prints (#1395): caption
// labels and `:ref`s numbered per chapter through the book ("Figure 2.1"),
// type names in the document's language, and heading prefixes from the
// level templates, each a fragment of generated text.

import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types.js';
import { exportDocx, exportProblems } from './fixtures/harness.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pic = (id: string): Resource => ({ id, typeId: 'figure', kind: 'bitmap', caption: `Cap ${id}`, createdAt: 0, updatedAt: 0, bitmap: { fileId: id, format: 'png', width: 100, height: 50 } });
const resources = [pic('a'), pic('b'), pic('c')];
const bytes = (): Uint8Array => PNG;
const fields = (f: { target: { kind: string } }): string | undefined => {
  const t = f.target as { resourceId?: string };
  return resources.find((r) => r.id === t.resourceId)?.caption;
};
const CH1 = '# One\n\n::resource{id="a"}\n\n::resource{id="b"}\n';
const CH2 = '# Two\n\nAs :ref{id="b"} and :ref{id="c"} show.\n\n::resource{id="c"}\n';

describe('semantic docx: engine numbering', () => {
  it('numbers captions and references per chapter through the book', async () => {
    const e = await exportDocx([CH1, CH2], { resources, resourceBytes: bytes });
    expect(exportProblems(e, [CH1, CH2], fields)).toEqual([]);
    const labels = e.map.fragments.filter((f) => f.role === 'label');
    expect(labels.map((f) => f.text)).toEqual(['Figure 1.1. ', 'Figure 1.2. ', 'Figure 2.1. ']);
    for (const f of labels) {
      expect(f.target).toEqual({ kind: 'generated' });
      expect(f.map.every((m) => m === -1)).toBe(true);
    }
    expect(e.frag('As Fig. 1.2 and Fig. 2.1 show.').atoms?.map((a) => a.kind)).toEqual(['ref', 'ref']);
    // A chapter number is text, not a SEQ field Word would recount.
    expect(e.doc).not.toContain('SEQ figure');
  });

  it('names the types in the document language', async () => {
    const e = await exportDocx(CH1, { resources, resourceBytes: bytes, config: { locale: 'es' } as never });
    expect(e.map.fragments.filter((f) => f.role === 'label').map((f) => f.text)).toEqual(['Figura 1.1. ', 'Figura 1.2. ']);
  });

  it('keeps a SEQ field for a plain count', async () => {
    const config = { resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figure', numberingTemplate: '{n}', resetOn: 'never' }] } as never;
    const e = await exportDocx([CH1, CH2], { resources, resourceBytes: bytes, config });
    expect(e.map.fragments.filter((f) => f.role === 'label').map((f) => f.text)).toEqual(['Figure 1. ', 'Figure 2. ', 'Figure 3. ']);
    expect(e.doc).toContain('SEQ figure \\* ARABIC');
  });

  it('prints heading numbers from the level templates as generated text', async () => {
    const config = { headings: { levels: [{ level: 1, numberingTemplate: '{1}.' }] } } as never;
    const e = await exportDocx([CH1, CH2], { resources, resourceBytes: bytes, config });
    expect(exportProblems(e, [CH1, CH2], fields)).toEqual([]);
    const numbers = e.map.fragments.filter((f) => f.role === 'number');
    expect(numbers.map((f) => f.text)).toEqual(['1. ', '2. ']);
    expect(numbers.every((f) => f.target.kind === 'generated')).toBe(true);
    // The number comes before the heading text, in the same paragraph.
    const order = e.map.fragments.map((f) => f.text);
    expect(order.indexOf('2. ')).toBe(order.indexOf('Two') - 1);
  });
});
