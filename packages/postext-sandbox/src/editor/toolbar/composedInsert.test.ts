import { describe, expect, it } from 'vitest';
import { composedPages, parseMarkdown, resolvePageTemplate, type PageTemplate } from 'postext';
import { chainTargets, composedPageInsertion } from './composedInsert.js';

const template = (frames: PageTemplate['frames']): PageTemplate => ({ id: 'tema', frames } as PageTemplate);

describe('composedPageInsertion', () => {
  it('writes one empty slot fence per frame, a heading for a takes frame and a line for the flow', () => {
    const resolved = resolvePageTemplate({ pageTemplates: [template([
      { name: 'titulo', takes: 'h1' },
      { name: 'texto', flow: true },
      { name: 'dinero' },
      { name: 'dinero-fotos' },
    ])] }, 'tema')!;
    const ins = composedPageInsertion(resolved);
    expect(ins.text).toBe([
      '::::page{template="tema"}',
      '# titulo',
      '',
      '',
      ':::frame{slot="dinero"}',
      '',
      ':::',
      '',
      ':::frame{slot="dinero-fotos"}',
      '',
      ':::',
      '::::',
    ].join('\n'));
    // The heading's name is selected, to type over.
    expect(ins.text.slice(ins.anchor, ins.head)).toBe('titulo');
    // It parses as a composed page with the two slots.
    const [page] = composedPages(parseMarkdown(ins.text));
    expect(page!.template).toBe('tema');
    expect(Object.keys(page!.slotSources).sort()).toEqual(['dinero', 'dinero-fotos']);
  });

  it('skips a frame that only receives a chain continuation', () => {
    const frames = [
      { name: 'a', next: 'b' },
      { name: 'b' },
      { name: 'c', overflow: { continueIn: '#d' } },
      { name: 'd' },
    ];
    expect([...chainTargets(frames as never)].sort()).toEqual(['b', 'd']);
    const resolved = resolvePageTemplate({ pageTemplates: [template(frames as never)] }, 'tema')!;
    const ins = composedPageInsertion(resolved);
    expect(ins.text).toContain(':::frame{slot="a"}');
    expect(ins.text).toContain(':::frame{slot="c"}');
    expect(ins.text).not.toContain('slot="b"');
    expect(ins.text).not.toContain('slot="d"');
    // The caret on the first frame's empty line.
    expect(ins.text.slice(0, ins.anchor)).toBe('::::page{template="tema"}\n:::frame{slot="a"}\n');
    expect(ins.anchor).toBe(ins.head);
  });

  it('writes an empty page for a template with no frames', () => {
    const ins = composedPageInsertion({ id: 'x', frames: [] });
    expect(ins.text).toBe('::::page{template="x"}\n::::');
  });
});
